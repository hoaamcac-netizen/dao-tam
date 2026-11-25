import React, { useState, useRef, useEffect } from 'react';
import { useAudio, SleepTimerMode } from '../contexts/AudioContext';
import { VoiceSelectorDropdown } from './VoiceSelectorDropdown';
import { getVoiceDisplayMeta } from '../utils/rulesAndVoices';
import {
  Headphones,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  RefreshCw,
  X,
  Minimize2,
  Maximize2,
  Repeat,
  ChevronDown,
  AlertCircle,
  SkipBack,
  SkipForward,
  Clock,
  Check,
  WifiOff,
  Smartphone,
} from 'lucide-react';

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSleepCountdown(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const total = Math.ceil(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const SLEEP_TIMER_OPTIONS: { mode: SleepTimerMode; label: string }[] = [
  { mode: 'off', label: 'Tắt hẹn giờ' },
  { mode: '15', label: '15 phút' },
  { mode: '30', label: '30 phút' },
  { mode: '60', label: '60 phút' },
  { mode: 'end_of_chapter', label: 'Hết chương này' },
];

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

interface EdgeTTSFloatingAudioBarProps {
  onOpenReader?: (novel: any, chapter: any) => void;
}

export const EdgeTTSFloatingAudioBar: React.FC<EdgeTTSFloatingAudioBarProps> = ({
  onOpenReader,
}) => {
  const {
    activeNovel,
    activeChapter,
    isDirectMp3,
    mp3CurrentTime,
    mp3Duration,
    isPlaying,
    isLoading,
    networkStatusMessage,
    audioError,
    fallbackNotice,
    currentChunkIndex,
    totalChunks,
    currentChunkText,
    voiceId,
    availableVoiceIds,
    playbackRate,
    progress,
    autoNext,
    sleepTimerMode,
    sleepTimerRemainingSec,
    isBarVisible,
    isMinimized,
    registerProgressBarRef,
    togglePlay,
    retryCurrentChunk,
    skipNext,
    skipPrev,
    seekToTime,
    playNextChapter,
    playPrevChapter,
    setVoiceId,
    setPlaybackRate,
    setAutoNext,
    setSleepTimer,
    setIsMinimized,
    clearAudioError,
    clearFallbackNotice,
    closeBar,
  } = useAudio();

  const [isMounted, setIsMounted] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const sleepMenuRef = useRef<HTMLDivElement>(null);
  const mobileSleepSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (speedMenuRef.current && !speedMenuRef.current.contains(target)) {
        setShowSpeedMenu(false);
      }
      const insideDesktopSleep = sleepMenuRef.current?.contains(target);
      const insideMobileSheet = mobileSleepSheetRef.current?.contains(target);
      if (!insideDesktopSleep && !insideMobileSheet) {
        setShowSleepMenu(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSpeedMenu(false);
        setShowSleepMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  if (!isMounted || !isBarVisible || !activeChapter || !activeNovel) {
    return null;
  }

  const activeVoiceMeta = getVoiceDisplayMeta(voiceId);
  const isSleepActive = sleepTimerMode !== 'off';
  const sleepBadgeText =
    sleepTimerMode === 'end_of_chapter'
      ? 'Hết ch.'
      : isSleepActive
      ? formatSleepCountdown(sleepTimerRemainingSec)
      : '';

  const handleSelectSleepMode = (mode: SleepTimerMode) => {
    setSleepTimer(mode);
    setShowSleepMenu(false);
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 sm:left-auto sm:bottom-5 sm:right-6 z-[90] flex justify-end pointer-events-none animate-in fade-in zoom-in-95 duration-200">
        <div className="pointer-events-auto flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-slate-900/95 dark:bg-slate-950/95 text-white border-2 border-pink-500 shadow-2xl backdrop-blur-md max-w-full">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 cursor-pointer hover:opacity-90 min-w-0 min-h-[44px] pr-1 text-left"
            title="Nhấn để mở rộng trình phát Audio"
          >
            <div
              className={`w-8 h-8 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0 ${
                isPlaying ? 'animate-pulse' : ''
              }`}
            >
              <Headphones className="w-4 h-4" />
            </div>
            <div className="min-w-0 max-w-[140px] sm:max-w-[200px]">
              <div className="text-xs font-bold truncate text-pink-300 flex items-center gap-1.5">
                <span className="truncate">Chương {activeChapter.number}</span>
                {isSleepActive && (
                  <span className="text-[10px] font-bold text-amber-300 tabular-nums shrink-0">
                    • {sleepBadgeText}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 truncate tabular-nums">
                {networkStatusMessage
                  ? networkStatusMessage
                  : isDirectMp3
                  ? `${activeVoiceMeta.shortLabel} • ${formatAudioTime(mp3CurrentTime)}/${formatAudioTime(mp3Duration)}`
                  : `${fallbackNotice ? 'Giọng Máy' : activeVoiceMeta.shortLabel} • Câu ${currentChunkIndex + 1}/${totalChunks}`}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Tạm dừng' : 'Tiếp tục phát'}
            className="w-11 h-11 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:scale-105 active:scale-95 transition-transform cursor-pointer shadow-sm flex items-center justify-center shrink-0"
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
            onClick={() => setIsMinimized(false)}
            aria-label="Mở rộng trình phát"
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Mở rộng"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={closeBar}
            aria-label="Đóng trình phát"
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Đóng trình phát"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 sm:bottom-5 sm:left-auto sm:right-6 sm:w-[420px] z-[90] animate-in slide-in-from-bottom-4 duration-300">
        <div className="relative bg-white/97 dark:bg-slate-900/97 backdrop-blur-md rounded-t-2xl sm:rounded-3xl border-t sm:border border-pink-200/90 dark:border-pink-900/60 shadow-[0_-8px_28px_-10px_rgba(236,72,153,0.3)] sm:shadow-[0_10px_30px_-8px_rgba(236,72,153,0.3)] text-slate-800 dark:text-slate-100 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0 transition-all">
          <div className="h-1 bg-pink-100 dark:bg-slate-800 w-full rounded-t-2xl sm:rounded-t-3xl overflow-hidden">
            <div
              ref={registerProgressBarRef}
              className="h-full w-0 bg-gradient-to-r from-pink-500 to-rose-500"
            />
          </div>

          <div className="pt-2 pb-1.5 px-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2.5">
            {audioError && (
              <div
                role="alert"
                className="flex flex-col gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-start gap-1.5 min-w-0 leading-snug">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="break-words">{audioError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={clearAudioError}
                    aria-label="Đóng thông báo lỗi"
                    className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0 w-9 h-9 -mr-1.5 -mt-1.5 flex items-center justify-center rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => retryCurrentChunk()}
                    className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 active:scale-[0.98] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Thử lại</span>
                  </button>
                </div>
              </div>
            )}

            {networkStatusMessage && !audioError && (
              <div
                role="status"
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
              >
                <WifiOff className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                <span className="truncate">{networkStatusMessage}</span>
              </div>
            )}

            {fallbackNotice && !audioError && !networkStatusMessage && (
              <div
                role="status"
                className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 text-[11px] font-medium text-amber-800 dark:text-amber-200"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Smartphone className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="truncate">{fallbackNotice}</span>
                </span>
                <button
                  type="button"
                  onClick={clearFallbackNotice}
                  aria-label="Đóng thông báo giọng đọc"
                  className="text-amber-600 hover:text-amber-800 dark:text-amber-300 cursor-pointer shrink-0 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Hàng 1: Thông tin chương + nút Thu nhỏ & Đóng */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => onOpenReader && onOpenReader(activeNovel, activeChapter)}
                className={`w-10 h-10 rounded-full bg-slate-900 border-2 border-pink-500 flex items-center justify-center text-pink-400 shrink-0 shadow-sm cursor-pointer hover:scale-105 transition-transform ${
                  isPlaying ? 'ring-2 ring-pink-400/40' : ''
                }`}
                title="Nhấn để vào giao diện đọc chương"
              >
                <Headphones className={`w-4 h-4 sm:w-5 sm:h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    onClick={() => onOpenReader && onOpenReader(activeNovel, activeChapter)}
                    className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate cursor-pointer hover:text-pink-600 dark:hover:text-pink-400 flex-1 min-w-0"
                    title={activeChapter.title}
                  >
                    {activeChapter.title || `Chương ${activeChapter.number}`}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5 min-w-0">
                  <div className="truncate flex-1 min-w-0">
                    {!isDirectMp3 && currentChunkText ? (
                      <span className="text-pink-600 dark:text-pink-300 italic">
                        &quot;{currentChunkText}&quot;
                      </span>
                    ) : (
                      <span>{activeNovel.title}</span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 whitespace-nowrap shrink-0 tabular-nums">
                    {isDirectMp3
                      ? `${activeVoiceMeta.shortLabel} • MP3`
                      : `${totalChunks > 0 ? currentChunkIndex + 1 : 0}/${totalChunks} (${progress}%)`}
                  </span>
                </div>
              </div>

              <div className="flex items-center shrink-0 -mr-1">
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  aria-label="Thu nhỏ thanh trình phát"
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Thu nhỏ thanh trình phát"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={closeBar}
                  aria-label="Đóng trình phát Audio"
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer shrink-0"
                  title="Đóng trình phát Audio"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isDirectMp3 && (
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums w-10 shrink-0">
                  {formatAudioTime(mp3CurrentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={mp3Duration > 0 ? mp3Duration : 0}
                  step={0.5}
                  value={Math.min(mp3CurrentTime, mp3Duration || 0)}
                  onChange={(e) => seekToTime(Number(e.target.value))}
                  disabled={mp3Duration <= 0}
                  aria-label="Tua tiến trình phát MP3"
                  className="flex-1 min-w-0 h-2 accent-pink-500 cursor-pointer disabled:opacity-40"
                />
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums w-10 text-right shrink-0">
                  {formatAudioTime(mp3Duration)}
                </span>
              </div>
            )}

            {/* Hàng 2: Cụm nút điều khiển >= 44x44px */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-3">
              <button
                type="button"
                onClick={() => playPrevChapter()}
                aria-label="Chương trước"
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50/70 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                title="Chương trước"
              >
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                type="button"
                onClick={skipPrev}
                disabled={!isDirectMp3 && currentChunkIndex <= 0}
                aria-label={isDirectMp3 ? 'Lùi 15 giây' : 'Lùi về câu trước'}
                className="min-w-[44px] h-11 px-1.5 rounded-full flex flex-col items-center justify-center text-slate-600 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50/70 dark:hover:bg-slate-800 disabled:opacity-35 transition-colors cursor-pointer shrink-0"
                title={isDirectMp3 ? 'Lùi 15 giây' : 'Lùi về câu trước'}
              >
                <RotateCcw className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                {isDirectMp3 && (
                  <span className="text-[9px] font-bold leading-none mt-0.5 tabular-nums">-15s</span>
                )}
              </button>

              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Tạm dừng nghe' : 'Tiếp tục phát'}
                className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-500 hover:to-rose-400 text-white flex items-center justify-center shadow-md shadow-pink-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer border border-white/30 shrink-0"
                title={isPlaying ? 'Tạm dừng nghe' : 'Tiếp tục phát'}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={skipNext}
                disabled={!isDirectMp3 && totalChunks > 0 && currentChunkIndex >= totalChunks - 1 && !autoNext}
                aria-label={isDirectMp3 ? 'Tua tới 15 giây' : 'Tiến sang câu tiếp theo'}
                className="min-w-[44px] h-11 px-1.5 rounded-full flex flex-col items-center justify-center text-slate-600 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50/70 dark:hover:bg-slate-800 disabled:opacity-35 transition-colors cursor-pointer shrink-0"
                title={isDirectMp3 ? 'Tua tới 15 giây' : 'Tiến sang câu tiếp theo'}
              >
                <RotateCw className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                {isDirectMp3 && (
                  <span className="text-[9px] font-bold leading-none mt-0.5 tabular-nums">+15s</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => playNextChapter()}
                aria-label="Chương tiếp theo"
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50/70 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                title="Chương tiếp theo"
              >
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Hàng 3: Luôn hiển thị chọn giọng đọc + Tốc độ + Hẹn giờ tắt + Tự chuyển chương */}
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-pink-100/70 dark:border-slate-800 min-w-0">
              <div className="flex-1 min-w-0">
                <VoiceSelectorDropdown
                  selectedVoiceId={voiceId}
                  onSelectVoice={setVoiceId}
                  availableVoiceIds={availableVoiceIds}
                  direction="up"
                  variant="floatingBar"
                />
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="relative shrink-0" ref={speedMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSpeedMenu((prev) => !prev);
                      setShowSleepMenu(false);
                    }}
                    aria-label="Thay đổi tốc độ phát"
                    className="min-w-[44px] min-h-[44px] px-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs text-slate-700 dark:text-slate-200 flex items-center justify-center gap-0.5 transition-colors cursor-pointer tabular-nums shrink-0"
                    title="Thay đổi tốc độ phát"
                  >
                    <span>{playbackRate}x</span>
                    <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </button>

                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-pink-100 dark:border-slate-700 p-1.5 grid grid-cols-4 gap-1 z-[105] w-[216px] sm:w-[232px] max-w-[calc(100vw-16px)]">
                      {PLAYBACK_SPEEDS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setPlaybackRate(s);
                            setShowSpeedMenu(false);
                          }}
                          className={`min-w-[44px] min-h-[40px] px-2 py-1 rounded-xl text-xs font-bold cursor-pointer transition-colors tabular-nums ${
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

                <div className="relative shrink-0" ref={sleepMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSleepMenu((prev) => !prev);
                      setShowSpeedMenu(false);
                    }}
                    aria-label="Hẹn giờ tắt Audio"
                    aria-expanded={showSleepMenu}
                    className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0 ${
                      isSleepActive
                        ? 'px-2 bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/70'
                        : 'px-0 text-slate-500 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title={isSleepActive ? `Hẹn giờ tắt: ${sleepBadgeText}` : 'Hẹn giờ tắt Audio'}
                  >
                    <Clock className="w-4 h-4 shrink-0" />
                    {isSleepActive && (
                      <span className="text-[11px] font-bold leading-none tabular-nums whitespace-nowrap">
                        {sleepBadgeText}
                      </span>
                    )}
                  </button>

                  {showSleepMenu && (
                    <div
                      role="menu"
                      aria-label="Tùy chọn hẹn giờ tắt"
                      className="hidden sm:block absolute bottom-full right-0 mb-2 w-52 max-w-[calc(100vw-16px)] bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-pink-100 dark:border-slate-700 p-1.5 z-[105] animate-in fade-in slide-in-from-bottom-2 duration-150"
                    >
                      <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Hẹn giờ tắt
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {SLEEP_TIMER_OPTIONS.map((opt) => {
                          const isSelected = sleepTimerMode === opt.mode;
                          return (
                            <button
                              key={opt.mode}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isSelected}
                              onClick={() => handleSelectSleepMode(opt.mode)}
                              className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-300 font-bold'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {isSelected && <Check className="w-4 h-4 shrink-0 text-pink-500" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setAutoNext(!autoNext)}
                  aria-label={autoNext ? 'Tắt tự chuyển chương' : 'Bật tự chuyển chương'}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-semibold transition-colors cursor-pointer shrink-0 ${
                    autoNext
                      ? 'bg-pink-100 dark:bg-pink-950/80 text-pink-600 dark:text-pink-300'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={autoNext ? 'Tự chuyển chương: ĐANG BẬT' : 'Tự chuyển chương: ĐÃ TẮT'}
                >
                  <Repeat className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSleepMenu && (
        <div className="sm:hidden">
          <div
            onClick={() => setShowSleepMenu(false)}
            className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-150"
            aria-hidden="true"
          />
          <div
            ref={mobileSleepSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Hẹn giờ tắt Audio"
            className="fixed inset-x-0 bottom-0 z-[111] bg-white dark:bg-slate-900 rounded-t-3xl border-t border-pink-100 dark:border-slate-700 shadow-2xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200"
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-pink-500 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Hẹn giờ tắt Audio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSleepMenu(false)}
                aria-label="Đóng bảng hẹn giờ"
                className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {SLEEP_TIMER_OPTIONS.map((opt) => {
                const isSelected = sleepTimerMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => handleSelectSleepMode(opt.mode)}
                    className={`w-full min-h-[46px] px-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-300 border border-pink-200 dark:border-pink-800/70 font-bold'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-4 h-4 shrink-0 text-pink-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
