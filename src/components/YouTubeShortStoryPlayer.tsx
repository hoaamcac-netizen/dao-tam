import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Headphones,
  Lock,
  Unlock,
  Sun,
  Moon,
  Sparkles,
  Info,
  Youtube,
  CheckCircle2,
} from 'lucide-react';
import { buildYouTubeEmbedUrl } from '../utils/youtube';
import { formatXu } from '../utils/rulesAndVoices';

interface YouTubeShortStoryPlayerProps {
  novelTitle: string;
  videoId: string;
  isYoutubeVipLocked?: boolean;
  canWatchLockedVideo: boolean;
  unlockPriceXu?: number;
  onRequestUnlock?: () => void;
}

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export const YouTubeShortStoryPlayer: React.FC<YouTubeShortStoryPlayerProps> = ({
  novelTitle,
  videoId,
  isYoutubeVipLocked = false,
  canWatchLockedVideo,
  unlockPriceXu = 0,
  onRequestUnlock,
}) => {
  const cleanVideoId = (videoId || '').trim();
  const [keepScreenAwake, setKeepScreenAwake] = useState(false);
  const [wakeLockNote, setWakeLockNote] = useState<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const wantWakeLockRef = useRef(false);

  const releaseWakeLock = useCallback(async () => {
    wantWakeLockRef.current = false;
    const current = wakeLockRef.current;
    wakeLockRef.current = null;
    if (current && !current.released) {
      try {
        await current.release();
      } catch {}
    }
    setKeepScreenAwake(false);
  }, []);

  const acquireWakeLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setKeepScreenAwake(false);
      wantWakeLockRef.current = false;
      setWakeLockNote(
        'Trình duyệt này chưa hỗ trợ Giữ sáng màn hình tự động (bạn có thể tăng thời gian chờ khóa màn hình trong Cài đặt).'
      );
      return;
    }

    try {
      const sentinel = (await (navigator as any).wakeLock.request(
        'screen'
      )) as WakeLockSentinelLike;
      wakeLockRef.current = sentinel;
      wantWakeLockRef.current = true;
      setKeepScreenAwake(true);
      setWakeLockNote(null);

      sentinel.addEventListener?.('release', () => {
        if (!wantWakeLockRef.current) {
          setKeepScreenAwake(false);
        }
      });
    } catch {
      setKeepScreenAwake(false);
      wantWakeLockRef.current = false;
      setWakeLockNote(
        'Không thể bật Giữ sáng màn hình lúc này. Hãy chạm lại nút khi đang mở trang.'
      );
    }
  }, []);

  const handleToggleWakeLock = async () => {
    if (keepScreenAwake || wantWakeLockRef.current) {
      setWakeLockNote(null);
      await releaseWakeLock();
    } else {
      await acquireWakeLock();
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        wantWakeLockRef.current &&
        (!wakeLockRef.current || wakeLockRef.current.released)
      ) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [acquireWakeLock, releaseWakeLock]);

  if (!cleanVideoId) return null;

  const isPlayable = !isYoutubeVipLocked || canWatchLockedVideo;

  return (
    <section
      aria-label="Audio và Video YouTube Truyện Ngắn"
      className="bg-white dark:bg-slate-900 border border-pink-100/90 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm transition-colors overflow-hidden"
    >
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200/80 dark:border-rose-800/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Youtube className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
              Audio / Video Truyện Ngắn
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {novelTitle}
            </p>
          </div>
        </div>

        {/* Status badge / CTA */}
        {!isYoutubeVipLocked ? (
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-sm self-start sm:self-auto shrink-0">
            <span className="px-1.5 py-0.5 rounded-md bg-white text-emerald-700 font-black text-[10px] tracking-wide">
              FREE
            </span>
            <Headphones className="w-3.5 h-3.5 shrink-0" />
            <span>NGHE AUDIO TRỌN BỘ MIỄN PHÍ</span>
          </div>
        ) : canWatchLockedVideo ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-bold text-xs self-start sm:self-auto shrink-0">
            <Unlock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>VIP Audio đã mở khóa</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold text-xs self-start sm:self-auto shrink-0">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>Audio VIP đang khóa</span>
          </div>
        )}
      </div>

      {/* Responsive 16:9 YouTube Player or VIP Lock Screen */}
      {isPlayable ? (
        <div className="space-y-3">
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-md">
            <iframe
              src={buildYouTubeEmbedUrl(cleanVideoId)}
              title={`Audio Truyện Ngắn - ${novelTitle}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>

          {/* Wake lock button + Background browser tip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleToggleWakeLock}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer border shrink-0 ${
                keepScreenAwake
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                  : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {keepScreenAwake ? (
                <>
                  <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Đang giữ sáng màn hình khi nghe</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-500 dark:text-slate-300 shrink-0" />
                  <span>Giữ sáng màn hình khi nghe</span>
                </>
              )}
            </button>

            <div className="flex items-start gap-1.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3 py-2">
              <Info className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <span>
                Mẹo nghe tắt màn hình: Dùng trình duyệt{' '}
                <strong className="text-slate-900 dark:text-white">Cốc Cốc</strong> hoặc{' '}
                <strong className="text-slate-900 dark:text-white">Brave</strong> để phát Audio nền khi khóa máy.
              </span>
            </div>
          </div>

          {wakeLockNote && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
              {wakeLockNote}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950 border border-rose-500/30 p-6 sm:p-8 text-center text-white flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-300">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-sm sm:text-base font-extrabold text-white">
              Audio YouTube đang khóa VIP
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Tác giả / Quản trị viên đã bật khóa VIP cho phần Audio YouTube của truyện ngắn này. Hãy mở khóa truyện để nghe trọn bộ ngay.
            </p>
          </div>
          {onRequestUnlock && (
            <button
              type="button"
              onClick={onRequestUnlock}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer transition"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                {unlockPriceXu > 0
                  ? `Mở khóa trọn bộ — ${formatXu(unlockPriceXu)} XU`
                  : 'Mở khóa VIP để nghe Audio'}
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
};
