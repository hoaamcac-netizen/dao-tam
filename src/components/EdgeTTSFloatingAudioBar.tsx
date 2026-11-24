import React, { useState, useRef, useEffect } from 'react';
import { useAudio } from '../contexts/AudioContext';
import { VoiceSelectorDropdown } from './VoiceSelectorDropdown';
import {
  DEVICE_FALLBACK_VOICE_ID,
  getVoiceDisplayMeta,
  isDeviceFallbackVoice,
} from '../utils/rulesAndVoices';
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
  Smartphone,
  SkipBack,
  SkipForward,
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

interface EdgeTTSFloatingAudioBarProps {
  onOpenReader?: (novel: any, chapter: any) => void;
}

export const EdgeTTSFloatingAudioBar: React.FC<EdgeTTSFloatingAudioBarProps> = ({
  onOpenReader,
}) => {
  const {
    activeNovel,
    activeChapter,
    isAudioMode,
    isDirectMp3,
    mp3CurrentTime,
    mp3Duration,
    isPlaying,
    isLoading,
    retryAttempt,
    bufferedCount,
    audioError,
    currentChunkIndex,
    totalChunks,
    currentChunkText,
    voiceId,
    playbackRate,
    progress,
    autoNext,
    isBarVisible,
    isMinimized,
    registerProgressBarRef,
    togglePlay,
    skipNext,
    skipPrev,
    seekToTime,
    playNextChapter,
    playPrevChapter,
    setVoiceId,
    setPlaybackRate,
    setAutoNext,
    setIsMinimized,
    clearAudioError,
    closeBar,
  } = useAudio();

  const [isMounted, setIsMounted] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [coverImgError, setCoverImgError] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  const novelCoverUrl =
    (typeof activeNovel?.coverImage === 'string' && activeNovel.coverImage.trim()) ||
    (typeof (activeNovel as any)?.cover === 'string' && (activeNovel as any).cover.trim()) ||
    (typeof (activeNovel as any)?.thumbnail === 'string' && (activeNovel as any).thumbnail.trim()) ||
    '';

  useEffect(() => {
    setCoverImgError(false);
  }, [novelCoverUrl, activeNovel?.id]);

  useEffect(() => {
    setIsMounted(true);
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isMounted || !isBarVisible || !activeChapter || !activeNovel) {
    return null;
  }

  const activeVoiceMeta = getVoiceDisplayMeta(voiceId);
  const isFallbackVoice = isDeviceFallbackVoice(voiceId);
  const speeds = [0.8, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
  const hasValidCover = Boolean(novelCoverUrl) && !coverImgError;

  const handleReturnToReader = () => {
    if (onOpenReader && activeNovel && activeChapter) {
      onOpenReader(activeNovel, activeChapter);
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-4 sm:left-auto sm:bottom-5 sm:right-6 z-[90] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-full bg-slate-900/95 dark:bg-slate-950/95 text-white border-2 border-pink-500 shadow-2xl backdrop-blur-md">
          <div
            onClick={handleReturnToReader}
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90"
            title="Nhấn để quay lại chương đang nghe"
          >
            <div
              className={`w-8 h-8 rounded-full overflow-hidden bg-pink-500/20 text-pink-400 flex items-center justify-center border border-pink-400/60 shrink-0 ${
                isPlaying ? 'ring-2 ring-pink-400/50' : ''
              }`}
            >
              {hasValidCover ? (
                <img
                  src={novelCoverUrl}
                  alt={activeNovel.title}
                  onError={() => setCoverImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Headphones className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse' : ''}`} />
              )}
            </div>
            <div className="text-left max-w-[150px] sm:max-w-[200px]">
              <div className="text-xs font-bold truncate text-pink-300">
                Chương {activeChapter.number} • {activeNovel.title}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {isDirectMp3
                  ? `MP3 • ${formatAudioTime(mp3CurrentTime)}/${formatAudioTime(mp3Duration)}`
                  : `${activeVoiceMeta.shortLabel} • Câu ${currentChunkIndex + 1}/${totalChunks}`}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={togglePlay}
            className="p-1.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:scale-105 transition-transform cursor-pointer shadow-sm ml-1"
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
            title="Mở rộng bảng điều khiển"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={closeBar}
            className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            title="Đóng trình phát"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-[max(0.625rem,env(safe-area-inset-bottom))] left-2 right-2 sm:bottom-5 sm:left-auto sm:right-6 sm:w-[400px] z-[90] animate-in slide-in-from-bottom-4 duration-300">
      <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl sm:rounded-3xl border border-pink-200/90 dark:border-pink-900/60 shadow-[0_10px_30px_-8px_rgba(236,72,153,0.3)] text-slate-800 dark:text-slate-100 transition-all">
        <div className="h-1 bg-pink-100 dark:bg-slate-800 w-full rounded-t-2xl sm:rounded-t-3xl overflow-hidden">
          <div
            ref={registerProgressBarRef}
            className="h-full w-0 bg-gradient-to-r from-pink-500 to-rose-500"
          />
        </div>

        <div className="py-2 px-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2.5">
          {audioError && (
            <div
              role="alert"
              className="flex flex-col gap-1.5 px-2.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-medium"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-start gap-1.5 min-w-0 leading-snug">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="break-words">{audioError}</span>
                </span>
                <button
                  type="button"
                  onClick={clearAudioError}
                  aria-label="Đóng thông báo lỗi"
                  className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {!isFallbackVoice && !isDirectMp3 && (
                <button
                  type="button"
                  onClick={() => setVoiceId(DEVICE_FALLBACK_VOICE_ID)}
                  className="self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span>Chuyển sang Giọng máy dự phòng</span>
                </button>
              )}
            </div>
          )}

          {retryAttempt > 0 && isLoading && !isDirectMp3 && (
            <div className="text-[11px] font-semibold text-pink-600 dark:text-pink-400 text-center">
              Đang thử máy chủ giọng đọc dự phòng (lần {retryAttempt})...
            </div>
          )}

          <div
            onClick={handleReturnToReader}
            className="flex items-center gap-2.5 cursor-pointer group rounded-xl p-1 -m-1 hover:bg-pink-50/70 dark:hover:bg-slate-800/60 transition-colors"
            title="Nhấn để quay lại trang đọc chương này"
          >
            <div
              className={`w-10 h-12 sm:w-11 sm:h-14 rounded-lg overflow-hidden bg-slate-900 border-2 border-pink-500 flex items-center justify-center text-pink-400 flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform ${
                isPlaying ? 'ring-2 ring-pink-400/40' : ''
              }`}
            >
              {hasValidCover ? (
                <img
                  src={novelCoverUrl}
                  alt={activeNovel.title}
                  onError={() => setCoverImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Headphones className={`w-4 h-4 sm:w-5 sm:h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors"
                  title={`${activeChapter.title}`}
                >
                  {activeChapter.title || `Chương ${activeChapter.number}`}
                </span>

                <span className="text-[10px] sm:text-[11px] font-bold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/70 px-1.5 sm:px-2 py-0.5 rounded-full border border-pink-200 dark:border-pink-800 whitespace-nowrap flex-shrink-0 tabular-nums">
                  {isDirectMp3
                    ? `${formatAudioTime(mp3CurrentTime)} / ${formatAudioTime(mp3Duration)}`
                    : `Câu ${totalChunks > 0 ? currentChunkIndex + 1 : 0}/${totalChunks} (${progress}%)`}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5">
                <div className="truncate flex-1 min-w-0">
                  {!isDirectMp3 && currentChunkText ? (
                    <span className="text-pink-600 dark:text-pink-300 italic">
                      &quot;{currentChunkText}&quot;
                    </span>
                  ) : (
                    <span>{activeNovel.title}</span>
                  )}
                </div>
                {isDirectMp3 ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap flex-shrink-0">
                    Audio MP3
                  </span>
                ) : (
                  isAudioMode &&
                  bufferedCount > 0 && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap flex-shrink-0">
                      Đệm +{bufferedCount}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>

          {isDirectMp3 && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums w-10">
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
                className="flex-1 h-1.5 accent-pink-500 cursor-pointer disabled:opacity-40"
              />
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums w-10 text-right">
                {formatAudioTime(mp3Duration)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 sm:gap-5">
            {isDirectMp3 && (
              <button
                type="button"
                onClick={() => playPrevChapter()}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 transition-colors cursor-pointer"
                title="Chương trước"
              >
                <SkipBack className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={skipPrev}
              disabled={!isDirectMp3 && currentChunkIndex <= 0}
              className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 disabled:opacity-40 transition-colors cursor-pointer"
              title={isDirectMp3 ? 'Lùi 15 giây' : 'Lùi về câu trước'}
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-500 hover:to-rose-400 text-white flex items-center justify-center shadow-md shadow-pink-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer border border-white/30"
              title={isPlaying ? 'Tạm dừng nghe' : 'Tiếp tục phát'}
            >
              {isLoading ? (
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              ) : (
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={skipNext}
              disabled={!isDirectMp3 && totalChunks > 0 && currentChunkIndex >= totalChunks - 1 && !autoNext}
              className="p-1.5 sm:p-2 text-slate-600 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 disabled:opacity-40 transition-colors cursor-pointer"
              title={isDirectMp3 ? 'Tua tới 15 giây' : 'Tiến sang câu tiếp theo'}
            >
              <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {isDirectMp3 && (
              <button
                type="button"
                onClick={() => playNextChapter()}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-pink-600 dark:hover:text-pink-400 transition-colors cursor-pointer"
                title="Chương tiếp theo"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}
          </div>

          {isDirectMp3 ? (
            <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 text-[11px] text-emerald-700 dark:text-emerald-300 font-medium text-center">
              Phát trực tiếp từ file MP3 chương • Hỗ trợ tốc độ & nền khóa màn hình
            </div>
          ) : (
            <VoiceSelectorDropdown
              selectedVoiceId={voiceId}
              onSelectVoice={setVoiceId}
              direction="up"
              variant="floatingBar"
            />
          )}

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-pink-100/70 dark:border-slate-800 text-[11px] sm:text-xs">
            <div className="relative" ref={speedMenuRef}>
              <button
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                title="Thay đổi tốc độ phát"
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
                      className={`px-2 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
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
                className={`p-1 sm:p-1.5 rounded-lg flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                  autoNext
                    ? 'bg-pink-100 dark:bg-pink-950/80 text-pink-600 dark:text-pink-300'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title={autoNext ? 'Tự chuyển chương: ĐANG BẬT' : 'Tự chuyển chương: ĐÃ TẮT'}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">Tự chuyển</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1 sm:p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Thu nhỏ thanh trình phát"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={closeBar}
                className="p-1 sm:p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                title="Đóng trình phát Audio"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
