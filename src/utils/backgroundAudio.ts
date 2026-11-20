/**
 * backgroundAudio.ts
 * Hỗ trợ phát Audio đọc truyện kể cả khi người dùng TẮT MÀN HÌNH ĐIỆN THOẠI hoặc chuyển tab.
 * - Sử dụng HTML5 silent keep-alive audio element để kích hoạt Background Audio session trên iOS Safari và Android Chrome.
 * - Tích hợp MediaSession API hiển thị trình phát trên Màn hình khóa (Lockscreen Controls) và thanh thông báo điện thoại.
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
}

class BackgroundAudioManager {
  private silentAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private wakeLock: any = null;
  private isInitialized = false;

  private initSilentAudio() {
    if (this.isInitialized && this.silentAudio) return;

    try {
      // 1 giây âm thanh WAV rỗng chuẩn PCM base64
      const silentWavBase64 = 
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      
      this.silentAudio = new Audio(silentWavBase64);
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.05; // Giữ audio session với hệ thống
      this.isInitialized = true;
    } catch (e) {
      console.warn('Could not initialize background keep-alive audio:', e);
    }

    try {
      // Web Audio API Keep-Alive: Kích hoạt AudioContext để hệ điều hành điện thoại
      // duy trì kênh âm thanh phần cứng chạy ngầm khi màn hình tắt
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
    } catch (e) {
      // Silent catch
    }
  }

  /**
   * Bắt đầu phiên phát âm thanh nền và đăng ký Lockscreen Controls
   */
  public async startBackgroundPlayback(options: BackgroundMediaOptions) {
    this.initSilentAudio();

    // 1. Kích hoạt AudioContext & Silent Audio để duy trì AudioContext/SpeechSynthesis khi tắt màn hình
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {}
    }

    if (this.silentAudio && this.silentAudio.paused) {
      try {
        await this.silentAudio.play();
      } catch (err) {
        // Trình duyệt yêu cầu cử chỉ người dùng trước đó
        console.warn('Silent audio play request caught:', err);
      }
    }

    // 2. Thiết lập MediaSession để hiển thị trên màn hình khóa điện thoại
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: options.title,
          artist: options.artist,
          album: options.album || 'Đạo Tâm • Audio',
          artwork: options.coverImage
            ? [
                { src: options.coverImage, sizes: '96x96', type: 'image/jpeg' },
                { src: options.coverImage, sizes: '256x256', type: 'image/jpeg' },
                { src: options.coverImage, sizes: '512x512', type: 'image/jpeg' },
              ]
            : [],
        });

        navigator.mediaSession.playbackState = 'playing';

        if (options.onPlay) {
          navigator.mediaSession.setActionHandler('play', () => {
            options.onPlay?.();
          });
        }

        if (options.onPause) {
          navigator.mediaSession.setActionHandler('pause', () => {
            options.onPause?.();
          });
        }

        if (options.onNext) {
          navigator.mediaSession.setActionHandler('nexttrack', () => {
            options.onNext?.();
          });
        }

        if (options.onPrev) {
          navigator.mediaSession.setActionHandler('previoustrack', () => {
            options.onPrev?.();
          });
        }

        // Tua nhanh / tua lại trên màn hình khóa
        navigator.mediaSession.setActionHandler('seekforward', () => {
          options.onNext?.();
        });

        navigator.mediaSession.setActionHandler('seekbackward', () => {
          options.onPrev?.();
        });
      } catch (e) {
        console.warn('MediaSession error:', e);
      }
    }

    // 3. Yêu cầu WakeLock nếu chưa có
    if (!this.wakeLock && 'wakeLock' in navigator && (navigator as any).wakeLock?.request) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch (e) {
        // WakeLock có thể bị từ chối khi pin yếu hoặc không hỗ trợ
      }
    }
  }

  /**
   * Tạm dừng hoặc kết thúc phiên audio nền
   */
  public pauseBackgroundPlayback() {
    if (this.silentAudio) {
      this.silentAudio.pause();
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }

    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  /**
   * Cập nhật thông tin bài hát / chương mới trên màn hình khóa mà không làm gián đoạn session
   */
  public updateMetadata(title: string, artist: string, coverImage?: string) {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album: 'Đạo Tâm • Audio',
          artwork: coverImage
            ? [
                { src: coverImage, sizes: '96x96', type: 'image/jpeg' },
                { src: coverImage, sizes: '256x256', type: 'image/jpeg' },
                { src: coverImage, sizes: '512x512', type: 'image/jpeg' },
              ]
            : [],
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch {}
    }
  }
}

export const backgroundAudioManager = new BackgroundAudioManager();
