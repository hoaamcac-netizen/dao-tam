import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AudioChunk,
  MAX_BLOB_CACHE_ENTRIES,
  chunkChapterContent,
  seamlessAudioCache,
} from '../utils/audioChunker';
import { normalizeEdgeVoiceId } from '../utils/rulesAndVoices';
import { backgroundAudioManager } from '../utils/backgroundAudio';

export interface UseSeamlessTTSOptions {
  content: string;
  initialVoiceId?: string;
  initialPlaybackRate?: number;
  autoPlay?: boolean;
  onChunkChange?: (index: number, chunk: AudioChunk) => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

export interface UseSeamlessTTSReturn {
  chunks: AudioChunk[];
  currentChunkIndex: number;
  currentChunk: AudioChunk | null;
  isPlaying: boolean;
  isLoading: boolean;
  retryAttempt: number;
  playbackRate: number;
  voiceId: string;
  progress: number;
  bufferedIndices: number[];
  error: string | null;
  registerProgressBarRef: (el: HTMLDivElement | null) => void;
  play: (startIndex?: number) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  togglePlay: () => void;
  stop: () => void;
  seekToChunk: (index: number) => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrev: () => Promise<void>;
  setVoiceId: (voice: string) => void;
  setPlaybackRate: (rate: number) => void;
}

const PREFETCH_LOOKAHEAD = 4; // Tải trước song song 4 đoạn kế tiếp (N+1, N+2, N+3, N+4)
const HARD_MAX_BLOB_CACHE = MAX_BLOB_CACHE_ENTRIES; // 8
const STALL_WATCHDOG_MS = 12000;

export function useSeamlessTTS({
  content,
  initialVoiceId = 'vi-VN-HoaiMyNeural',
  initialPlaybackRate = 1.0,
  autoPlay = false,
  onChunkChange,
  onComplete,
  onError,
}: UseSeamlessTTSOptions): UseSeamlessTTSReturn {
  const [voiceId, setVoiceIdState] = useState<string>(() => normalizeEdgeVoiceId(initialVoiceId));
  const [playbackRate, setPlaybackRateState] = useState<number>(initialPlaybackRate);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [bufferedIndices, setBufferedIndices] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  // DUY NHẤT 1 thẻ <audio> cố định
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const hasInitializedAudioRef = useRef<boolean>(false);

  const progressBarElRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Map lưu Blob URL giới hạn cứng tối đa 5 đoạn
  const blobMapRef = useRef<Map<number, string>>(new Map());
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchGenerationRef = useRef<number>(0);
  const sessionNonceRef = useRef<number>(0);
  const activeChunkTokenRef = useRef<string>('');
  const lastInitializedContentKeyRef = useRef<string>('');

  // Watchdog chống treo / stalled 5 giây
  const stallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMediaTimeRef = useRef<number>(0);
  const lastMediaAdvanceAtRef = useRef<number>(0);

  const isPlaybackActiveRef = useRef<boolean>(false);
  const currentIndexRef = useRef<number>(-1);
  const consecutiveChunkErrorsRef = useRef<number>(0);
  const voiceIdRef = useRef<string>(voiceId);
  const playbackRateRef = useRef<number>(playbackRate);
  const autoPlayRef = useRef<boolean>(autoPlay);
  const onChunkChangeRef = useRef(onChunkChange);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const playChunkRef = useRef<(index: number) => Promise<void>>(async () => {});

  const safeRevokeUrl = useCallback((url?: string | null) => {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  }, []);

  const revokeChunkIndex = useCallback(
    (idx: number, voice: string, chunkText?: string) => {
      const url = blobMapRef.current.get(idx);
      blobMapRef.current.delete(idx);
      if (url) {
        safeRevokeUrl(url);
      }
      if (chunkText) {
        seamlessAudioCache.revokeEntry(voice, chunkText);
      }
    },
    [safeRevokeUrl]
  );

  const setBlobWithHardLimit = useCallback(
    (idx: number, url: string, protectedIdx?: number) => {
      const map = blobMapRef.current;
      if (map.has(idx)) {
        const prev = map.get(idx);
        if (prev && prev !== url) {
          safeRevokeUrl(prev);
        }
        map.delete(idx);
      }

      while (map.size >= HARD_MAX_BLOB_CACHE) {
        let evictIdx: number | undefined;
        for (const candidate of map.keys()) {
          if (candidate !== protectedIdx && candidate !== currentIndexRef.current && candidate !== idx) {
            evictIdx = candidate;
            break;
          }
        }
        if (evictIdx === undefined) {
          for (const candidate of map.keys()) {
            if (candidate !== idx) {
              evictIdx = candidate;
              break;
            }
          }
        }
        if (evictIdx === undefined) break;

        const evictedUrl = map.get(evictIdx);
        map.delete(evictIdx);
        safeRevokeUrl(evictedUrl);
      }

      map.set(idx, url);
    },
    [safeRevokeUrl]
  );

  const revokeAllBlobs = useCallback(() => {
    for (const url of blobMapRef.current.values()) {
      safeRevokeUrl(url);
    }
    blobMapRef.current.clear();
    seamlessAudioCache.clear();
  }, [safeRevokeUrl]);

  const clearStallWatchdogs = useCallback(() => {
    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = null;
    }
    if (stallCheckIntervalRef.current) {
      clearInterval(stallCheckIntervalRef.current);
      stallCheckIntervalRef.current = null;
    }
  }, []);

  const applyPlaybackRateLock = useCallback((audio: HTMLAudioElement | null, rate: number) => {
    if (!audio) return;
    const clamped = Math.max(0.5, Math.min(3.5, rate || 1.0));
    try {
      audio.defaultPlaybackRate = clamped;
      audio.playbackRate = clamped;
    } catch {}
  }, []);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    onChunkChangeRef.current = onChunkChange;
  }, [onChunkChange]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (initialVoiceId) {
      const normalized = normalizeEdgeVoiceId(initialVoiceId);
      setVoiceIdState(normalized);
      voiceIdRef.current = normalized;
    }
  }, [initialVoiceId]);

  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    applyPlaybackRateLock(audioElementRef.current, playbackRate);
  }, [playbackRate, applyPlaybackRateLock]);

  // Progressive chunking: 2 đoạn đầu 80-120 ký tự, các đoạn sau 280-350 ký tự
  const chunks = useMemo(() => {
    return chunkChapterContent(content);
  }, [content]);

  const chunksRef = useRef<AudioChunk[]>(chunks);
  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  const updateProgressBarDomNow = useCallback((explicitPct?: number) => {
    const el = progressBarElRef.current;
    if (!el) return;
    if (typeof explicitPct === 'number') {
      el.style.width = `${Math.min(100, Math.max(0, explicitPct)).toFixed(2)}%`;
      return;
    }
    const total = chunksRef.current?.length || 0;
    const idx = currentIndexRef.current;
    if (total <= 0 || idx < 0) {
      el.style.width = '0%';
      return;
    }
    const audio = audioElementRef.current;
    const audioRatio =
      audio && Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.min(1, Math.max(0, audio.currentTime / audio.duration))
        : 0;
    const pct = Math.min(100, Math.max(0, ((idx + audioRatio) / total) * 100));
    el.style.width = `${pct.toFixed(2)}%`;
  }, []);

  const registerProgressBarRef = useCallback(
    (el: HTMLDivElement | null) => {
      progressBarElRef.current = el;
      updateProgressBarDomNow();
    },
    [updateProgressBarDomNow]
  );

  useEffect(() => {
    currentIndexRef.current = currentChunkIndex;
    updateProgressBarDomNow();
  }, [currentChunkIndex, updateProgressBarDomNow]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      updateProgressBarDomNow();
      return;
    }

    let running = true;
    const tick = () => {
      if (!running) return;
      updateProgressBarDomNow();
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying, updateProgressBarDomNow]);

  // Khởi tạo DUY NHẤT 1 thẻ <audio> & dọn sạch Blob URL khi unmount
  useEffect(() => {
    if (hasInitializedAudioRef.current) return;
    hasInitializedAudioRef.current = true;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    applyPlaybackRateLock(audio, playbackRateRef.current);
    audioElementRef.current = audio;

    return () => {
      clearStallWatchdogs();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (prefetchAbortRef.current) {
        try {
          prefetchAbortRef.current.abort();
        } catch {}
      }
      audio.onended = null;
      audio.onerror = null;
      audio.onstalled = null;
      audio.onwaiting = null;
      audio.onplaying = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.src = '';
      audioElementRef.current = null;
      revokeAllBlobs();
      hasInitializedAudioRef.current = false;
    };
  }, [applyPlaybackRateLock, clearStallWatchdogs, revokeAllBlobs]);

  const stop = useCallback(() => {
    sessionNonceRef.current += 1;
    prefetchGenerationRef.current += 1;
    activeChunkTokenRef.current = '';
    isPlaybackActiveRef.current = false;
    consecutiveChunkErrorsRef.current = 0;
    clearStallWatchdogs();
    if (prefetchAbortRef.current) {
      try {
        prefetchAbortRef.current.abort();
      } catch {}
      prefetchAbortRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
    setRetryAttempt(0);
    setCurrentChunkIndex(-1);
    currentIndexRef.current = -1;
    setBufferedIndices([]);
    updateProgressBarDomNow(0);
    if (audioElementRef.current) {
      audioElementRef.current.onended = null;
      audioElementRef.current.onerror = null;
      audioElementRef.current.onstalled = null;
      audioElementRef.current.onwaiting = null;
      audioElementRef.current.onplaying = null;
      audioElementRef.current.ontimeupdate = null;
      audioElementRef.current.onloadedmetadata = null;
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current.removeAttribute('src');
      audioElementRef.current.src = '';
    }
    revokeAllBlobs();
  }, [clearStallWatchdogs, revokeAllBlobs, updateProgressBarDomNow]);

  const unlockAudioElementFromGesture = useCallback((allowPrimeIdleAudio = true) => {
    backgroundAudioManager.unlockFromUserGesture();
    const audio = audioElementRef.current;
    if (!audio || !allowPrimeIdleAudio) return;
    const currentSrc = audio.getAttribute('src') || '';
    const isRealBlobLoaded = currentSrc.startsWith('blob:') && !audio.ended && !audio.error;
    if (!isRealBlobLoaded && audio.paused) {
      try {
        audio.onended = null;
        audio.onerror = null;
        audio.loop = true;
        audio.muted = false;
        audio.src = backgroundAudioManager.getSilentWavUrl();
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      } catch {}
    }
  }, []);

  /**
   * Duy trì bộ đệm tải trước song song 4 đoạn kế tiếp (N+1 .. N+4) và giải phóng ngay các đoạn đã nghe qua
   */
  const runSequentialPrefetchQueue = useCallback(
    async (fromIndex: number, activeVoice: string, sessionNonce: number) => {
      const curChunks = chunksRef.current;
      const genId = ++prefetchGenerationRef.current;
      const signal = prefetchAbortRef.current?.signal;

      // Dọn các đoạn nằm ngoài cửa sổ [fromIndex .. fromIndex + 4]
      for (const idx of Array.from(blobMapRef.current.keys())) {
        if (idx < fromIndex || idx > fromIndex + PREFETCH_LOOKAHEAD) {
          revokeChunkIndex(idx, activeVoice, curChunks[idx]?.text);
        }
      }

      const targets: number[] = [];
      for (let offset = 1; offset <= PREFETCH_LOOKAHEAD; offset++) {
        const targetIdx = fromIndex + offset;
        if (targetIdx >= 0 && targetIdx < (curChunks?.length || 0)) {
          targets.push(targetIdx);
        }
      }

      await Promise.allSettled(
        targets.map(async (targetIdx) => {
          if (
            genId !== prefetchGenerationRef.current ||
            sessionNonce !== sessionNonceRef.current ||
            !isPlaybackActiveRef.current ||
            signal?.aborted
          ) {
            return;
          }
          if (blobMapRef.current.has(targetIdx)) return;
          try {
            const url = await seamlessAudioCache.fetchAndCache(
              activeVoice,
              curChunks[targetIdx].text,
              undefined,
              signal,
              curChunks[fromIndex]?.text
            );
            if (
              genId !== prefetchGenerationRef.current ||
              sessionNonce !== sessionNonceRef.current ||
              !isPlaybackActiveRef.current ||
              signal?.aborted
            ) {
              safeRevokeUrl(url);
              return;
            }
            setBlobWithHardLimit(targetIdx, url, fromIndex);
          } catch {}
          if (genId === prefetchGenerationRef.current && sessionNonce === sessionNonceRef.current) {
            setBufferedIndices(
              Array.from(blobMapRef.current.keys()).sort((a, b) => a - b)
            );
          }
        })
      );
    },
    [revokeChunkIndex, safeRevokeUrl, setBlobWithHardLimit]
  );

  const playChunk = useCallback(
    async (index: number) => {
      const curChunks = Array.isArray(chunksRef.current) ? chunksRef.current : [];
      if ((curChunks?.length || 0) === 0) {
        setIsPlaying(false);
        setIsLoading(false);
        isPlaybackActiveRef.current = false;
        return;
      }

      if (index < 0) return;

      if (index >= (curChunks?.length || 0)) {
        clearStallWatchdogs();
        setCurrentChunkIndex(-1);
        currentIndexRef.current = -1;
        revokeAllBlobs();
        updateProgressBarDomNow(100);
        if (onCompleteRef.current) {
          onCompleteRef.current();
        } else {
          setIsPlaying(false);
          setIsLoading(false);
          isPlaybackActiveRef.current = false;
        }
        return;
      }

      const audio = audioElementRef.current;
      if (!audio) return;

      if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
        prefetchAbortRef.current = new AbortController();
      }
      const abortSignal = prefetchAbortRef.current.signal;

      clearStallWatchdogs();
      const sessionNonce = sessionNonceRef.current;
      const chunkToken = `${sessionNonce}:::${index}:::${Date.now()}`;
      activeChunkTokenRef.current = chunkToken;

      const chunk = curChunks[index];
      const currentVoice = voiceIdRef.current;
      currentIndexRef.current = index;
      setCurrentChunkIndex(index);
      setError(null);
      setRetryAttempt(0);
      onChunkChangeRef.current?.(index, chunk);

      try {
        let hasTriggeredPrefetch = false;
        const triggerPrefetch = () => {
          if (hasTriggeredPrefetch) return;
          if (
            sessionNonce !== sessionNonceRef.current ||
            activeChunkTokenRef.current !== chunkToken ||
            !isPlaybackActiveRef.current ||
            abortSignal.aborted
          ) {
            return;
          }
          hasTriggeredPrefetch = true;
          runSequentialPrefetchQueue(index, currentVoice, sessionNonce).catch(() => {});
        };

        let audioUrl =
          blobMapRef.current.get(index) ||
          seamlessAudioCache.get(currentVoice, chunk.text) ||
          undefined;

        if (!audioUrl) {
          setIsLoading(true);
          const currentPromise = seamlessAudioCache.fetchAndCache(
            currentVoice,
            chunk.text,
            (attempt) => {
              if (
                sessionNonce === sessionNonceRef.current &&
                activeChunkTokenRef.current === chunkToken
              ) {
                setRetryAttempt(attempt);
              }
            },
            abortSignal,
            chunk.text
          );
          triggerPrefetch();
          audioUrl = await currentPromise;
          setBlobWithHardLimit(index, audioUrl, index);
        }

        if (
          sessionNonce !== sessionNonceRef.current ||
          activeChunkTokenRef.current !== chunkToken ||
          !isPlaybackActiveRef.current ||
          currentIndexRef.current !== index
        ) {
          setIsLoading(false);
          setRetryAttempt(0);
          return;
        }

        setIsLoading(false);
        setRetryAttempt(0);

        audio.onended = null;
        audio.onerror = null;
        audio.onstalled = null;
        audio.onwaiting = null;
        audio.onplaying = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;

        // Giữ nguyên 1 phần tử <audio> cố định và chỉ thay src (không pause giữa chừng để giữ lockscreen focus)
        audio.loop = false;
        audio.muted = false;
        audio.src = audioUrl;
        applyPlaybackRateLock(audio, playbackRateRef.current);

        let stallRecoveryStage = 0;
        let isRecovering = false;
        let isChunkTransitioned = false;
        lastMediaTimeRef.current = 0;
        lastMediaAdvanceAtRef.current = Date.now();

        const isCurrentChunkValid = () =>
          sessionNonce === sessionNonceRef.current &&
          activeChunkTokenRef.current === chunkToken &&
          isPlaybackActiveRef.current &&
          currentIndexRef.current === index;

        const clearLocalStallTimer = () => {
          if (stallTimeoutRef.current) {
            clearTimeout(stallTimeoutRef.current);
            stallTimeoutRef.current = null;
          }
        };

        const recoverFromStallOrError = async (reason: 'stalled' | 'error') => {
          if (!isCurrentChunkValid() || isRecovering) return;
          isRecovering = true;
          clearLocalStallTimer();

          try {
            if (reason === 'stalled' && stallRecoveryStage === 0) {
              stallRecoveryStage = 1;
              const savedTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
              const savedDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
              audio.load();
              applyPlaybackRateLock(audio, playbackRateRef.current);
              await audio.play();
              applyPlaybackRateLock(audio, playbackRateRef.current);
              if (savedTime > 0 && (savedDuration <= 0 || savedTime < savedDuration)) {
                try {
                  audio.currentTime = savedTime;
                } catch {}
              }
              lastMediaAdvanceAtRef.current = Date.now();
              return;
            }

            if (stallRecoveryStage < 2) {
              stallRecoveryStage = 2;
              setIsLoading(true);
              revokeChunkIndex(index, currentVoice, chunk.text);
              const freshUrl = await seamlessAudioCache.fetchAndCache(
                currentVoice,
                chunk.text,
                (attempt) => {
                  if (isCurrentChunkValid()) setRetryAttempt(attempt);
                },
                abortSignal,
                chunk.text
              );
              if (!isCurrentChunkValid()) {
                safeRevokeUrl(freshUrl);
                return;
              }
              setBlobWithHardLimit(index, freshUrl, index);
              audio.src = freshUrl;
              applyPlaybackRateLock(audio, playbackRateRef.current);
              audio.load();
              await audio.play();
              applyPlaybackRateLock(audio, playbackRateRef.current);
              setIsLoading(false);
              setRetryAttempt(0);
              consecutiveChunkErrorsRef.current = 0;
              lastMediaAdvanceAtRef.current = Date.now();
              return;
            }

            revokeChunkIndex(index, currentVoice, chunk.text);
            setIsLoading(false);
            setRetryAttempt(0);
            consecutiveChunkErrorsRef.current += 1;
            setIsPlaying(false);
            isPlaybackActiveRef.current = false;
            const errMsg = `Không thể phát đoạn ${index + 1}. Nhấn Phát để thử lại.`;
            setError(errMsg);
            onErrorRef.current?.(new Error(errMsg));
          } catch (recoverErr: any) {
            if (recoverErr?.name === 'AbortError' || !isCurrentChunkValid()) return;
            revokeChunkIndex(index, currentVoice, chunk.text);
            setIsLoading(false);
            setRetryAttempt(0);
            consecutiveChunkErrorsRef.current += 1;
            setIsPlaying(false);
            isPlaybackActiveRef.current = false;
            const errMsg = `Không thể phát đoạn ${index + 1}. Nhấn Phát để thử lại.`;
            setError(errMsg);
            onErrorRef.current?.(new Error(errMsg));
          } finally {
            isRecovering = false;
          }
        };

        const armStallTimer = () => {
          if (!isCurrentChunkValid() || stallTimeoutRef.current || isRecovering) return;
          stallTimeoutRef.current = setTimeout(() => {
            stallTimeoutRef.current = null;
            recoverFromStallOrError('stalled');
          }, STALL_WATCHDOG_MS);
        };

        audio.onloadedmetadata = () => {
          applyPlaybackRateLock(audio, playbackRateRef.current);
        };

        audio.onplaying = () => {
          clearLocalStallTimer();
          consecutiveChunkErrorsRef.current = 0;
          lastMediaAdvanceAtRef.current = Date.now();
          applyPlaybackRateLock(audio, playbackRateRef.current);
        };

        audio.ontimeupdate = () => {
          if (audio.currentTime > lastMediaTimeRef.current + 0.05) {
            lastMediaTimeRef.current = audio.currentTime;
            lastMediaAdvanceAtRef.current = Date.now();
            clearLocalStallTimer();
          }
        };

        audio.onstalled = armStallTimer;
        audio.onwaiting = armStallTimer;

        stallCheckIntervalRef.current = setInterval(() => {
          if (!isCurrentChunkValid() || isRecovering) return;
          if (typeof document !== 'undefined' && document.hidden && audio.readyState >= 2) {
            return;
          }
          if (!audio.paused && !audio.ended) {
            if (audio.currentTime > lastMediaTimeRef.current + 0.05) {
              lastMediaTimeRef.current = audio.currentTime;
              lastMediaAdvanceAtRef.current = Date.now();
              clearLocalStallTimer();
              return;
            }
            if (Date.now() - lastMediaAdvanceAtRef.current >= STALL_WATCHDOG_MS) {
              recoverFromStallOrError('stalled');
            }
          }
        }, 2500);

        // MEMORY LEAK PROTECTION: Giải phóng ngay Blob URL của đoạn vừa đọc xong
        audio.onended = () => {
          if (isChunkTransitioned) return;
          isChunkTransitioned = true;
          clearStallWatchdogs();
          audio.onended = null;
          audio.onerror = null;
          audio.onstalled = null;
          audio.onwaiting = null;
          audio.onplaying = null;
          audio.ontimeupdate = null;
          audio.onloadedmetadata = null;

          revokeChunkIndex(index, currentVoice, chunk.text);
          consecutiveChunkErrorsRef.current = 0;

          if (!isCurrentChunkValid()) {
            return;
          }
          playChunkRef.current(index + 1);
        };

        audio.onerror = () => {
          if (!isCurrentChunkValid()) return;
          recoverFromStallOrError('error');
        };

        await audio.play();
        applyPlaybackRateLock(audio, playbackRateRef.current);
        consecutiveChunkErrorsRef.current = 0;
        lastMediaAdvanceAtRef.current = Date.now();

        if (
          sessionNonce === sessionNonceRef.current &&
          activeChunkTokenRef.current === chunkToken &&
          isPlaybackActiveRef.current
        ) {
          setIsPlaying(true);
          // Prefetch song song 4 đoạn kế tiếp (N+1..N+4) ngay khi đoạn hiện tại bắt đầu phát
          triggerPrefetch();
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn(`[SeamlessTTS] Không thể tải chunk #${index} sau 3 lần thử:`, err);
        clearStallWatchdogs();
        if (
          sessionNonce === sessionNonceRef.current &&
          activeChunkTokenRef.current === chunkToken
        ) {
          setIsLoading(false);
          setRetryAttempt(0);
          setIsPlaying(false);
          isPlaybackActiveRef.current = false;
          const message =
            err?.message ||
            `Kết nối giọng đọc bị gián đoạn tại đoạn ${index + 1} sau 3 lần thử. Nhấn Phát để tiếp tục.`;
          setError(message);
          onErrorRef.current?.(err instanceof Error ? err : new Error(message));
        }
      }
    },
    [
      applyPlaybackRateLock,
      clearStallWatchdogs,
      revokeAllBlobs,
      revokeChunkIndex,
      runSequentialPrefetchQueue,
      setBlobWithHardLimit,
      updateProgressBarDomNow,
    ]
  );

  useEffect(() => {
    playChunkRef.current = playChunk;
  }, [playChunk]);

  useEffect(() => {
    const trimmed = (content || '').trim();
    const contentKey = `${trimmed?.length || 0}::${trimmed.slice(0, 64)}::${chunks?.length || 0}::${autoPlay}`;
    if (lastInitializedContentKeyRef.current === contentKey) {
      return;
    }
    lastInitializedContentKeyRef.current = contentKey;

    if (!trimmed) {
      if (!autoPlayRef.current) {
        stop();
      }
      setBufferedIndices([]);
      return;
    }

    revokeAllBlobs();
    setBufferedIndices([]);

    if (autoPlayRef.current && (chunks?.length || 0) > 0) {
      sessionNonceRef.current += 1;
      isPlaybackActiveRef.current = true;
      setIsPlaying(true);
      const timer = setTimeout(() => {
        playChunkRef.current(0);
      }, 50);
      return () => clearTimeout(timer);
    }

    if (!autoPlayRef.current) {
      stop();
    }
  }, [content, chunks?.length, autoPlay, revokeAllBlobs, stop]);

  const play = useCallback(async (startIndex?: number) => {
    unlockAudioElementFromGesture(startIndex !== undefined || currentIndexRef.current < 0);
    isPlaybackActiveRef.current = true;
    setError(null);
    if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
      prefetchAbortRef.current = new AbortController();
    }
    const targetIndex =
      startIndex !== undefined
        ? startIndex
        : currentIndexRef.current >= 0
        ? currentIndexRef.current
        : 0;
    await playChunkRef.current(targetIndex);
  }, [unlockAudioElementFromGesture]);

  const pause = useCallback(() => {
    isPlaybackActiveRef.current = false;
    clearStallWatchdogs();
    setIsPlaying(false);
    setIsLoading(false);
    setRetryAttempt(0);
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
  }, [clearStallWatchdogs]);

  const resume = useCallback(async () => {
    unlockAudioElementFromGesture(currentIndexRef.current < 0);
    setError(null);
    if (currentIndexRef.current < 0) {
      await play(0);
      return;
    }
    const audio = audioElementRef.current;
    if (audio && audio.src && !audio.ended && !audio.error) {
      isPlaybackActiveRef.current = true;
      try {
        applyPlaybackRateLock(audio, playbackRateRef.current);
        await audio.play();
        applyPlaybackRateLock(audio, playbackRateRef.current);
        lastMediaAdvanceAtRef.current = Date.now();
        setIsPlaying(true);
      } catch {
        await playChunkRef.current(currentIndexRef.current);
      }
    } else {
      await play(currentIndexRef.current);
    }
  }, [applyPlaybackRateLock, play, unlockAudioElementFromGesture]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const seekToChunk = useCallback(async (index: number) => {
    if (index < 0 || index >= (chunksRef.current?.length || 0)) return;
    unlockAudioElementFromGesture(true);
    isPlaybackActiveRef.current = true;
    setError(null);
    await playChunkRef.current(index);
  }, [unlockAudioElementFromGesture]);

  const skipNext = useCallback(async () => {
    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx < (chunksRef.current?.length || 0)) {
      await seekToChunk(nextIdx);
    }
  }, [seekToChunk]);

  const skipPrev = useCallback(async () => {
    const prevIdx = Math.max(0, currentIndexRef.current - 1);
    await seekToChunk(prevIdx);
  }, [seekToChunk]);

  const setVoiceId = useCallback(
    (newVoice: string) => {
      const normalized = normalizeEdgeVoiceId(newVoice);
      setVoiceIdState(normalized);
      voiceIdRef.current = normalized;
      prefetchGenerationRef.current += 1;
      if (prefetchAbortRef.current) {
        try {
          prefetchAbortRef.current.abort();
        } catch {}
        prefetchAbortRef.current = new AbortController();
      }
      revokeAllBlobs();
      setBufferedIndices([]);
      if (isPlaybackActiveRef.current && currentIndexRef.current >= 0) {
        playChunkRef.current(currentIndexRef.current);
      }
    },
    [revokeAllBlobs]
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      setPlaybackRateState(rate);
      playbackRateRef.current = rate;
      applyPlaybackRateLock(audioElementRef.current, rate);
    },
    [applyPlaybackRateLock]
  );

  const progress = useMemo(() => {
    if ((chunks?.length || 0) === 0 || currentChunkIndex < 0) return 0;
    return Math.round(((currentChunkIndex + 1) / (chunks?.length || 1)) * 100);
  }, [chunks?.length, currentChunkIndex]);

  const currentChunk =
    currentChunkIndex >= 0 && currentChunkIndex < (chunks?.length || 0) ? chunks[currentChunkIndex] : null;

  return {
    chunks,
    currentChunkIndex,
    currentChunk,
    isPlaying,
    isLoading,
    retryAttempt,
    playbackRate,
    voiceId,
    progress,
    bufferedIndices,
    error,
    registerProgressBarRef,
    play,
    pause,
    resume,
    togglePlay,
    stop,
    seekToChunk,
    skipNext,
    skipPrev,
    setVoiceId,
    setPlaybackRate,
  };
}
