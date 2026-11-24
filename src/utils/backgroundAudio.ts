/**
 * backgroundAudio.ts
 * Hỗ trợ phát Audio đọc truyện kể cả khi người dùng TẮT MÀN HÌNH ĐIỆN THOẠI hoặc chuyển tab.
 * - Tuyệt đối KHÔNG khởi tạo thêm bất kỳ thẻ new Audio() phụ nào để tuân thủ kiến trúc
 *   tái sử dụng DUY NHẤT 1 thẻ <audio> cố định (bảo toàn playbackRate 2x & iOS/Android MediaSession).
 * - Tích hợp đầy đủ MediaSession API (Ảnh bìa truyện chuẩn, Play/Pause/Next/Prev, PositionState) và WakeLock.
 */

interface BackgroundMediaOptions {
  title: string;
  artist: string;
  album?: string;
  coverImage?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSeekTo?: (seekTime: number) => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
}

interface ResolvedArtworkEntry {
  src: string;
  sizes?: string;
  type?: string;
}

function inferImageMimeType(src: string): string | undefined {
  if (!src) return undefined;
  const dataMatch = /^data:(image\/[a-z0-9.+-]+);/i.exec(src);
  if (dataMatch) return dataMatch[1].toLowerCase();
  const cleanPath = src.split('?')[0].split('#')[0].toLowerCase();
  if (cleanPath.endsWith('.png')) return 'image/png';
  if (cleanPath.endsWith('.webp')) return 'image/webp';
  if (cleanPath.endsWith('.gif')) return 'image/gif';
  if (cleanPath.endsWith('.avif')) return 'image/avif';
  if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg') || cleanPath.endsWith('.jfif')) {
    return 'image/jpeg';
  }
  return undefined;
}

function resolveCoverSrc(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    const proto = typeof window !== 'undefined' && window.location?.protocol ? window.location.protocol : 'https:';
    return `${proto}${trimmed}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      return new URL(trimmed, window.location.origin).href;
    } catch {
      return trimmed.startsWith('/') ? `${window.location.origin}${trimmed}` : '';
    }
  }
  return trimmed.startsWith('/') ? trimmed : '';
}

class BackgroundAudioManager {
  private audioCtx: AudioContext | null = null;
  private keepAliveSource: AudioBufferSourceNode | null = null;
  private keepAliveGain: GainNode | null = null;
  private wakeLock: any = null;
  private lastMetadataKey = '';
  private lastMetadataPayload: {
    title: string;
    artist: string;
    coverImage?: string;
    album: string;
  } | null = null;
  private coverArtworkCache = new Map<string, ResolvedArtworkEntry[]>();
  private coverProbeNonce = 0;
  private handlersRegistered = false;
  private visibilityListenerAttached = false;
  private isSessionActive = false;
  private callbacks: {
    onPlay?: () => void;
    onPause?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    onSeekTo?: (seekTime: number) => void;
    onSeekForward?: () => void;
    onSeekBackward?: () => void;
  } = {};

  private ensureAudioContextAlive(startKeepAliveLoop: boolean) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (!this.audioCtx) return;

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      if (startKeepAliveLoop && !this.keepAliveSource) {
        const sampleRate = this.audioCtx.sampleRate || 22050;
        const buffer = this.audioCtx.createBuffer(1, sampleRate, sampleRate);
        const channel = buffer.getChannelData(0);
        // Giá trị cực nhỏ (không nghe thấy) để trình duyệt di động giữ audio session hoạt động liên tục qua các khoảng chuyển đoạn/chương khi khóa màn hình
        channel[0] = 0.00001;

        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const gain = this.audioCtx.createGain();
        gain.gain.value = 0.0001;

        source.connect(gain);
        gain.connect(this.audioCtx.destination);
        source.start(0);

        this.keepAliveSource = source;
        this.keepAliveGain = gain;
      }
    } catch {}
  }

  private stopKeepAliveLoop() {
    if (this.keepAliveSource) {
      try {
        this.keepAliveSource.stop();
        this.keepAliveSource.disconnect();
      } catch {}
      this.keepAliveSource = null;
    }
    if (this.keepAliveGain) {
      try {
        this.keepAliveGain.disconnect();
      } catch {}
      this.keepAliveGain = null;
    }
  }

  private attachVisibilityListenerOnce() {
    if (this.visibilityListenerAttached || typeof document === 'undefined') return;
    this.visibilityListenerAttached = true;

    document.addEventListener('visibilitychange', () => {
      if (!this.isSessionActive) return;
      this.ensureAudioContextAlive(true);
      this.setPlaybackState('playing');
      this.refreshCurrentMetadata();
      if (!document.hidden && !this.wakeLock && typeof navigator !== 'undefined' && (navigator as any).wakeLock?.request) {
        (navigator as any).wakeLock
          .request('screen')
          .then((lock: any) => {
            this.wakeLock = lock;
          })
          .catch(() => {});
      }
    });
  }

  private registerMediaSessionHandlersOnce() {
    if (this.handlersRegistered || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    const safeSetHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    safeSetHandler('play', () => {
      this.callbacks.onPlay?.();
    });
    safeSetHandler('pause', () => {
      this.callbacks.onPause?.();
    });
    safeSetHandler('stop', () => {
      this.callbacks.onPause?.();
    });
    safeSetHandler('nexttrack', () => {
      this.callbacks.onNext?.();
    });
    safeSetHandler('previoustrack', () => {
      this.callbacks.onPrev?.();
    });
    safeSetHandler('seekforward', () => {
      if (this.callbacks.onSeekForward) {
        this.callbacks.onSeekForward();
      } else {
        this.callbacks.onNext?.();
      }
    });
    safeSetHandler('seekbackward', () => {
      if (this.callbacks.onSeekBackward) {
        this.callbacks.onSeekBackward();
      } else {
        this.callbacks.onPrev?.();
      }
    });
    safeSetHandler('seekto', (details) => {
      if (details && typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
        this.callbacks.onSeekTo?.(details.seekTime);
      }
    });
    this.handlersRegistered = true;
  }

  private getFallbackSiteIcons(): MediaImage[] {
    const icon192 = resolveCoverSrc('/manifest-icon-192.png');
    const icon512 = resolveCoverSrc('/manifest-icon-512.png');
    const fallback: MediaImage[] = [];
    if (icon192) fallback.push({ src: icon192, sizes: '192x192', type: 'image/png' });
    if (icon512) fallback.push({ src: icon512, sizes: '512x512', type: 'image/png' });
    return fallback;
  }

  private applyMediaSessionMetadata(
    title: string,
    artist: string,
    album: string,
    artwork: MediaImage[]
  ) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
      return;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork,
      });
    } catch {}
  }

  /**
   * Tiền tải ảnh bìa truyện để xác định đúng kích thước thật (hoặc chuyển sang data URL 512x512
   * nếu ảnh cho phép CORS) giúp màn hình khóa Android/iOS hiển thị ảnh bìa truyện chuẩn xác,
   * tuyệt đối không bị trình duyệt tự chọn logo web thay thế.
   */
  private probeAndUpgradeCoverArtwork(
    coverUrl: string,
    title: string,
    artist: string,
    album: string,
    nonce: number
  ) {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return;
    if (this.coverArtworkCache.has(coverUrl)) return;

    const handleLoaded = (img: HTMLImageElement, canDrawCanvas: boolean) => {
      if (nonce !== this.coverProbeNonce) return;
      const w = img.naturalWidth || 512;
      const h = img.naturalHeight || 512;
      const inferredType = inferImageMimeType(coverUrl);

      let upgraded: ResolvedArtworkEntry[] = [
        {
          src: coverUrl,
          sizes: `${w}x${h}`,
          ...(inferredType ? { type: inferredType } : {}),
        },
      ];

      if (canDrawCanvas && typeof document !== 'undefined') {
        try {
          const canvasSize = 512;
          const canvas = document.createElement('canvas');
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvasSize, canvasSize);
            // Vẽ ảnh bìa dạng cover căn giữa tỉ lệ chuẩn 512x512 cho thanh media khóa màn hình
            const scale = Math.max(canvasSize / w, canvasSize / h);
            const drawW = w * scale;
            const drawH = h * scale;
            const offsetX = (canvasSize - drawW) / 2;
            const offsetY = (canvasSize - drawH) / 2;
            ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            if (dataUrl && dataUrl.startsWith('data:image/jpeg')) {
              upgraded = [
                { src: dataUrl, sizes: '512x512', type: 'image/jpeg' },
                {
                  src: coverUrl,
                  sizes: `${w}x${h}`,
                  ...(inferredType ? { type: inferredType } : {}),
                },
              ];
            }
          }
        } catch {
          // Ảnh không có CORS header -> giữ nguyên URL ảnh bìa với đúng kích thước thật
        }
      }

      this.coverArtworkCache.set(coverUrl, upgraded);
      this.applyMediaSessionMetadata(title, artist, album, upgraded);
    };

    const corsImg = new Image();
    corsImg.crossOrigin = 'anonymous';
    corsImg.onload = () => handleLoaded(corsImg, true);
    corsImg.onerror = () => {
      if (nonce !== this.coverProbeNonce) return;
      // Thử tải lại không kèm crossOrigin để lấy naturalWidth/naturalHeight của ảnh bìa bên ngoài
      const plainImg = new Image();
      plainImg.onload = () => handleLoaded(plainImg, false);
      plainImg.onerror = () => {
        if (nonce !== this.coverProbeNonce) return;
        // Chỉ dùng logo web khi ảnh bìa truyện thực sự lỗi không thể tải được
        this.applyMediaSessionMetadata(title, artist, album, this.getFallbackSiteIcons());
      };
      plainImg.src = coverUrl;
    };
    corsImg.src = coverUrl;
  }

  /**
   * Bắt đầu / cập nhật phiên phát âm thanh nền và Lockscreen Controls
   */
  public async startBackgroundPlayback(options: BackgroundMediaOptions) {
    this.isSessionActive = true;
    this.attachVisibilityListenerOnce();
    this.ensureAudioContextAlive(true);

    this.callbacks = {
      onPlay: options.onPlay,
      onPause: options.onPause,
      onNext: options.onNext,
      onPrev: options.onPrev,
      onSeekTo: options.onSeekTo,
      onSeekForward: options.onSeekForward,
      onSeekBackward: options.onSeekBackward,
    };

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        this.updateMetadata(options.title, options.artist, options.coverImage, options.album);
        navigator.mediaSession.playbackState = 'playing';
        this.registerMediaSessionHandlersOnce();
      } catch (e) {
        console.warn('MediaSession error:', e);
      }
    }

    if (!this.wakeLock && typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock?.request) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch {}
    }
  }

  /**
   * Đồng bộ trạng thái playbackState ('playing' | 'paused' | 'none') cho MediaSession trên iOS/Android
   */
  public setPlaybackState(state: MediaSessionPlaybackState) {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = state;
      } catch {}
    }
  }

  /**
   * Tạm dừng hoặc kết thúc phiên audio nền (chỉ gọi khi người dùng bấm Tạm dừng/Đóng hoặc hết truyện)
   */
  public pauseBackgroundPlayback() {
    this.isSessionActive = false;
    this.stopKeepAliveLoop();
    this.setPlaybackState('paused');

    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  /**
   * Khẳng định lại metadata hiện tại (hữu ích sau khi thẻ <audio> chuyển nguồn từ primer sang blob/MP3 thật)
   */
  public refreshCurrentMetadata() {
    if (!this.lastMetadataPayload) return;
    const { title, artist, coverImage, album } = this.lastMetadataPayload;
    this.updateMetadata(title, artist, coverImage, album, true);
  }

  /**
   * Cập nhật thông tin truyện / chương và ảnh bìa truyện trên màn hình khóa mà không làm gián đoạn session
   */
  public updateMetadata(
    title: string,
    artist: string,
    coverImage?: string,
    album = 'Đạo Tâm • Audio',
    force = false
  ) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const validCover = resolveCoverSrc(coverImage);
    const key = `${title}:::${artist}:::${validCover}:::${album}`;
    this.lastMetadataPayload = { title, artist, coverImage: validCover || coverImage, album };

    if (!force && this.lastMetadataKey === key) return;
    this.lastMetadataKey = key;

    if (validCover) {
      const cachedArtwork = this.coverArtworkCache.get(validCover);
      if (cachedArtwork && cachedArtwork.length > 0) {
        this.applyMediaSessionMetadata(title, artist, album, cachedArtwork);
        return;
      }

      // CHỈ đưa ảnh bìa truyện vào artwork (tuyệt đối KHÔNG kèm logo web khi đã có ảnh bìa)
      const inferredType = inferImageMimeType(validCover);
      const immediateArtwork: MediaImage[] = [
        {
          src: validCover,
          sizes: '512x512',
          ...(inferredType ? { type: inferredType } : {}),
        },
        {
          src: validCover,
          sizes: '256x256',
          ...(inferredType ? { type: inferredType } : {}),
        },
      ];
      this.applyMediaSessionMetadata(title, artist, album, immediateArtwork);

      const nonce = ++this.coverProbeNonce;
      this.probeAndUpgradeCoverArtwork(validCover, title, artist, album, nonce);
      return;
    }

    // Chỉ dùng logo web làm phương án dự phòng khi truyện không có ảnh bìa
    this.applyMediaSessionMetadata(title, artist, album, this.getFallbackSiteIcons());
  }

  public updatePositionState(duration: number, position: number, playbackRate: number) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession as any;
    if (typeof ms.setPositionState !== 'function') return;
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
    try {
      ms.setPositionState({
        duration,
        playbackRate: Math.max(0.5, Math.min(3.5, playbackRate || 1.0)),
        position: Math.max(0, Math.min(duration, position)),
      });
    } catch {}
  }
}

export const backgroundAudioManager = new BackgroundAudioManager();
