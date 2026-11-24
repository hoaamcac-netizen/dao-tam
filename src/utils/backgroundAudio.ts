/**
 * backgroundAudio.ts
 * Hỗ trợ phát Audio đọc truyện kể cả khi người dùng TẮT MÀN HÌNH ĐIỆN THOẠI hoặc chuyển tab.
 * - Tuyệt đối KHÔNG khởi tạo thêm bất kỳ thẻ new Audio() phụ nào để tuân thủ kiến trúc
 *   tái sử dụng DUY NHẤT 1 thẻ <audio> cố định (bảo toàn playbackRate 2x & iOS/Android MediaSession).
 * - Tích hợp đầy đủ MediaSession API (Metadata, Play/Pause/Next/Prev, PositionState) và WakeLock.
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

class BackgroundAudioManager {
  private audioCtx: AudioContext | null = null;
  private keepAliveSource: AudioBufferSourceNode | null = null;
  private keepAliveGain: GainNode | null = null;
  private wakeLock: any = null;
  private lastMetadataKey = '';
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

  private registerMediaSessionHandlers() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    const safeSetHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    // CHỈ đăng ký đúng 4 hành động trên MediaSession: play, pause, previoustrack (Chương trước), nexttrack (Chương sau)
    safeSetHandler('play', () => {
      this.callbacks.onPlay?.();
    });
    safeSetHandler('pause', () => {
      this.callbacks.onPause?.();
    });
    safeSetHandler('previoustrack', () => {
      this.callbacks.onPrev?.();
    });
    safeSetHandler('nexttrack', () => {
      this.callbacks.onNext?.();
    });

    // BẮT BUỘC đặt seekbackward và seekforward = null để Android/iOS LUÔN hiện nút Chuyển Chương thay vì tua 15s
    safeSetHandler('seekbackward', null);
    safeSetHandler('seekforward', null);
    safeSetHandler('seekto', null);
    safeSetHandler('stop', null);
    this.handlersRegistered = true;
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
    };

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        this.updateMetadata(options.title, options.artist, options.coverImage, options.album);
        navigator.mediaSession.playbackState = 'playing';
        this.registerMediaSessionHandlers();
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

  private inferImageMimeType(url: string): string {
    const clean = (url || '').split('?')[0].split('#')[0].toLowerCase();
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.gif')) return 'image/gif';
    if (clean.endsWith('.avif')) return 'image/avif';
    if (clean.endsWith('.svg')) return 'image/svg+xml';
    return 'image/jpeg';
  }

  private resolveAbsoluteHttpsUrl(pathOrUrl?: string): string {
    const raw = (pathOrUrl || '').trim();
    if (!raw) return '';
    if (/^https:\/\//i.test(raw)) return raw;
    if (/^http:\/\//i.test(raw)) {
      if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
        return raw.replace(/^http:\/\//i, 'https://');
      }
      return raw;
    }
    if (raw.startsWith('//')) {
      return `https:${raw}`;
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      try {
        return new URL(raw, window.location.origin).href;
      } catch {
        const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
        return `${window.location.origin}${normalizedPath}`;
      }
    }
    return '';
  }

  /**
   * Cập nhật thông tin truyện / chương trên thanh nổi & màn hình khóa điện thoại:
   * - title: Tên chương hiện tại
   * - artist: Tên truyện (kèm tên giọng đọc)
   * - artwork: BẮT BUỘC dùng URL tuyệt đối của ảnh bìa truyện hiện tại với đủ sizes 96/128/256/512 & đúng MIME type;
   *   chỉ dùng logo web nếu truyện thực sự không có ảnh bìa.
   */
  public updateMetadata(
    title: string,
    artist: string,
    coverImage?: string,
    album = 'Đạo Tâm'
  ) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const validCover = this.resolveAbsoluteHttpsUrl(coverImage);
    const fallbackLogo = this.resolveAbsoluteHttpsUrl('/logo.png') || this.resolveAbsoluteHttpsUrl('/manifest-icon-512.png');
    const artworkSrc = validCover || fallbackLogo;
    const artworkType = validCover ? this.inferImageMimeType(validCover) : 'image/png';

    const key = `${title}:::${artist}:::${artworkSrc}:::${album}`;
    if (this.lastMetadataKey === key) return;
    this.lastMetadataKey = key;

    const artwork: MediaImage[] = artworkSrc
      ? [
          { src: artworkSrc, sizes: '96x96', type: artworkType },
          { src: artworkSrc, sizes: '128x128', type: artworkType },
          { src: artworkSrc, sizes: '256x256', type: artworkType },
          { src: artworkSrc, sizes: '512x512', type: artworkType },
        ]
      : [];

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Đang phát Audio',
        artist: artist || 'Đạo Tâm',
        album: album || 'Đạo Tâm',
        artwork,
      });
    } catch (err) {
      console.warn('[MediaSession] Không thể cập nhật metadata:', err);
    }
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

