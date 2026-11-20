'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Headphones,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  X,
  Minimize2,
  Maximize2,
  Repeat,
  ChevronDown,
  AlertCircle,
  Power,
} from 'lucide-react';
import { useGlobalAudio } from '../contexts/AudioContext';

/**
 * THANH NỔI AUDIO TOÀN CỤC (Headless Ping-Pong A/B, Deep Buffer, Mobile-First, Tone Hồng)
 */
export default function GlobalAudioPlayer() {
  const {
    activeNovel,
    activeChapter,
    paragraphs,
    currentIndex,
    isAudioMode,
    isPlaying,
    isLoading,
    retryAttempt,
    bufferedCount,
    audioError,
    voiceId,
    playbackRate,
    autoNext,
    isBarVisible,
    isMinimized,
    progress,
    currentText,
    registerProgressBarRef,
    togglePlay,
    skipNext,
    skipPrev,
    setVoiceId,
    setPlaybackRate,
    setAutoNext,
    setIsMinimized,
    clearAudioError,
    closeBar,
  } = useGlobalAudio();

  const [isMounted, setIsMounted] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const handleOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  if (!isMounted || !isBarVisible || !activeNovel || !activeChapter) {
    return null;
  }

  const isNamMinh = voiceId.includes('NamMinh');
  const speeds = [0.8, 1.0, 1.25, 1.5, 2.0, 2.5];
  const novelSlug = (activeNovel.slug && activeNovel.slug.trim()) || activeNovel.id;
  const chapterSlug =
    activeChapter.slug ||
    (activeChapter.number ? `chuong-${activeChapter.number}` : activeChapter.id);
  const chapterHref = `/truyen/${encodeURIComponent(novelSlug)}/chuong/${encodeURIComponent(chapterSlug)}`;

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-900/95 text-white border-2 border-pink-500 shadow-2xl backdrop-blur-md">
          <div
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 cursor-pointer hover:opacity-90"
            title="Mở rộng thanh phát Audio"
          >
            <div
              className={`w-7 h-7 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center ${
                isPlaying ? 'animate-pulse' : ''
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
            </div>
            <div className="text-left max-w-[160px]">
              <div className="text-xs font-bold truncate text-pink-300">
                Chương {activeChapter.number}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {isNamMinh ? 'Nam Minh' : 'Hoài My'} • Đoạn {Math.max(1, currentIndex + 1)}/
                {paragraphs?.length || 0}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={togglePlay}
            className="p-1.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:scale-105 transition-transform cursor-pointer shadow-sm"
            title={isPlaying ? 'Tạm dừng' : 'Tiếp tục phát'}
          >
            {isLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Mở rộng"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={closeBar}
            className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            title="Tắt chế độ Audio & dọn RAM"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-2 left-2 right-2 sm:bottom-4 sm:left-auto sm:right-6 sm:w-[400px] z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl sm:rounded-3xl border border-pink-200/90 dark:border-pink-900/60 shadow-[0_10px_30px_-8px_rgba(236,72,153,0.3)] overflow-hidden text-slate-800 dark:text-slate-100">
        {/* Progress Bar (Cập nhật trực tiếp qua DOM useRef + requestAnimationFrame, ZERO re-render) */}
        <div className="h-1 bg-pink-100 dark:bg-slate-800 w-full overflow-hidden">
          <div
            ref={registerProgressBarRef}
            className="h-full w-0 bg-gradient-to-r from-pink-500 to-rose-500"
          />
        </div>

        <div className="py-2.5 px-3.5 sm:p-4 flex flex-col gap-2">
          {/* Retry / Error Banner */}
          {audioError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-medium"
            >
              <span className="flex items-center gap-1.5 truncate">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{audioError}</span>
              </span>
              <button
                type="button"
                onClick={clearAudioError}
                aria-label="Đóng thông báo lỗi"
                className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {retryAttempt > 0 && isLoading && (
            <div className="text-[11px] font-semibold text-pink-600 dark:text-pink-400 text-center">
              Đang kết nối lại giọng đọc (lần {retryAttempt}/3)...
            </div>
          )}

          {/* Header info */}
          <div className="flex items-center gap-2.5">
            <Link
              href={chapterHref}
              className={`w-9 h-9 rounded-full bg-slate-900 border-2 border-pink-500 flex items-center justify-center text-pink-400 shrink-0 shadow-sm ${
                isPlaying ? 'ring-2 ring-pink-400/40' : ''
              }`}
              title="Quay lại chương đang đọc"
            >
              <Headphones className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={chapterHref}
                  className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate hover:text-pink-600 dark:hover:text-pink-400"
                >
                  {activeChapter.title || `Chương ${activeChapter.number}`}
                </Link>
                <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/70 px-2 py-0.5 rounded-full border border-pink-200 dark:border-pink-800 whitespace-nowrap shrink-0">
                  {(paragraphs?.length || 0) > 0 ? `${Math.max(1, currentIndex + 1)}/${paragraphs?.length || 0}` : '0/0'} ({progress}%)
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="truncate flex-1 min-w-0">
                  {currentText ? (
                    <span className="text-pink-600 dark:text-pink-300 italic">&quot;{currentText}&quot;</span>
                  ) : (
                    <span>{activeNovel.title}</span>
                  )}
                </div>
                {isAudioMode && bufferedCount > 0 && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap shrink-0">
                    Đệm +{bufferedCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={skipPrev}
              disabled={currentIndex <= 0}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-pink-600 disabled:opacity-40 cursor-pointer"
              title="Đoạn trước"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-600 to-rose-500 text-white flex items-center justify-center shadow-md shadow-pink-500/30 hover:scale-105 transition-transform cursor-pointer"
              title={isPlaying ? 'Tạm dừng' : 'Tiếp tục phát'}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={skipNext}
              disabled={(paragraphs?.length || 0) > 0 && currentIndex >= (paragraphs?.length || 0) - 1 && !autoNext}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-pink-600 disabled:opacity-40 cursor-pointer"
              title="Đoạn tiếp theo"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {/* Voice selector */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVoiceId('vi-VN-HoaiMyNeural')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                !isNamMinh
                  ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white shadow-xs'
                  : 'bg-pink-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-pink-100 dark:border-slate-700'
              }`}
            >
              <span>🌸</span>
              <span>Hoài My</span>
            </button>
            <button
              type="button"
              onClick={() => setVoiceId('vi-VN-NamMinhNeural')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                isNamMinh
                  ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white shadow-xs'
                  : 'bg-pink-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-pink-100 dark:border-slate-700'
              }`}
            >
              <span>⚔️</span>
              <span>Nam Minh</span>
            </button>
          </div>

          {/* Footer controls */}
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-pink-100/70 dark:border-slate-800 text-xs">
            <div className="relative" ref={speedMenuRef}>
              <button
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <span>{playbackRate}x</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full left-0 mb-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-pink-100 dark:border-slate-700 p-1.5 flex gap-1 z-50">
                  {(speeds || []).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setPlaybackRate(s);
                        setShowSpeedMenu(false);
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        playbackRate === s
                          ? 'bg-pink-600 text-white'
                          : 'hover:bg-pink-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAutoNext(!autoNext)}
                className={`p-1.5 rounded-lg flex items-center gap-1 font-semibold cursor-pointer ${
                  autoNext
                    ? 'bg-pink-100 dark:bg-pink-950/80 text-pink-600 dark:text-pink-300'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title={autoNext ? 'Tự chuyển chương: ĐANG BẬT' : 'Tự chuyển chương: ĐÃ TẮT'}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">Tự chuyển</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Thu gọn thanh phát Audio"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={closeBar}
                className="px-2 py-1 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 font-semibold flex items-center gap-1 cursor-pointer"
                title="Tắt chế độ Audio, dọn RAM & quay về đọc bình thường"
              >
                <Power className="w-3.5 h-3.5" />
                <span className="text-[11px]">Tắt</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
