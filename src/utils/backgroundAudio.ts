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
  private wakeLock: any = null;
  private lastMetadataKey = '';
  private handlersRegistered = false;
  private callbacks: {
    onPlay?: () => void;
    onPause?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    onSeekTo?: (seekTime: number) => void;
    onSeekForward?: () => void;
    onSeekBackward?: () => void;
  } = {};

  private ensureAudioContextAlive() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    } catch {}
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

  /**
   * Bắt đầu / cập nhật phiên phát âm thanh nền và Lockscreen Controls
   */
  public async startBackgroundPlayback(options: BackgroundMediaOptions) {
    this.ensureAudioContextAlive();

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
   * Tạm dừng hoặc kết thúc phiên audio nền
   */
  public pauseBackgroundPlayback() {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'paused';
      } catch {}
    }

    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  /**
   * Cập nhật thông tin truyện / chương trên màn hình khóa mà không làm gián đoạn session
   */
  public updateMetadata(
    title: string,
    artist: string,
    coverImage?: string,
    album = 'Đạo Tâm • Audio'
  ) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const validCover =
      coverImage && (/^https?:\/\//i.test(coverImage) || coverImage.startsWith('/'))
        ? coverImage
        : '';
    const key = `${title}:::${artist}:::${validCover}:::${album}`;
    if (this.lastMetadataKey === key) return;
    this.lastMetadataKey = key;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: validCover
          ? [
              { src: validCover, sizes: '96x96', type: 'image/jpeg' },
              { src: validCover, sizes: '256x256', type: 'image/jpeg' },
              { src: validCover, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      });
    } catch {}
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
