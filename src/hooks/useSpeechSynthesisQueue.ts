import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  DEFAULT_CHUNK_MAX_LENGTH,
  DEFAULT_CHUNK_MIN_LENGTH,
  DEFAULT_FIRST_CHUNK_MAX_LENGTH,
  DEFAULT_FIRST_CHUNK_MIN_LENGTH,
  DEFAULT_HEAD_CHUNK_COUNT,
  chunkChapterContent,
  splitTextIntoSpeechChunks,
} from '../utils/audioChunker';
import { getMatchingBrowserVoice } from '../utils/rulesAndVoices';

/**
 * Kích thước cửa sổ đệm (Sliding Window Buffer Size) cho Web Speech API.
 * Luôn giữ sẵn 5 câu (utterance) trong hàng đợi speechSynthesis để không bị khựng khi nghe tốc độ 2.0x - 3.0x.
 */
export const BUFFER_SIZE = 5;
const MAX_UTTERANCE_RETRIES = 3;
const UTTERANCE_RETRY_DELAY_MS = 250;

export interface UseSpeechSynthesisQueueOptions {
  text: string;
  voiceId?: string;
  playbackRate?: number;
  maxChunkLength?: number;
  onChunkChange?: (index: number, chunkText: string) => void;
  onComplete?: () => void;
  onChunkError?: (index: number, errorCode: string) => void;
}

export interface UseSpeechSynthesisQueueReturn {
  chunks: string[];
  currentChunkIndex: number;
  currentChunkText: string;
  totalChunks: number;
  bufferedCount: number;
  isPlaying: boolean;
  isPaused: boolean;
  playbackRate: number;
  voiceId: string;
  progress: number;
  isSupported: boolean;
  play: (startIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  stop: () => void;
  seekToChunk: (index: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  setVoiceId: (voice: string) => void;
  setPlaybackRate: (rate: number) => void;
}

/**
 * Hook điều phối Web Speech API (window.speechSynthesis) với thuật toán Sliding Window / Continuous Buffering:
 * 1. Mở rộng Buffer Size (BUFFER_SIZE = 5): Nạp sẵn 5 chunk liên tiếp khi bắt đầu Play.
 * 2. Nạp đạn nối tiếp (Continuous Feed): Khi chunk thứ i kết thúc (onend), lập tức nạp chunk thứ i + BUFFER_SIZE.
 * 3. Đồng bộ Rate & Voice đồng loạt: Mọi utterance đều nhận đúng rate & voice; khi đổi rate lúc đang nghe,
 *    tự động gọi speechSynthesis.cancel(), cập nhật rate và khởi động lại Buffer từ đúng currentChunkIndex hiện tại.
 */
export function useSpeechSynthesisQueue({
  text,
  voiceId: initialVoiceId = 'vi-VN-HoaiMyNeural',
  playbackRate: initialPlaybackRate = 1.0,
  maxChunkLength = 180,
  onChunkChange,
  onComplete,
  onChunkError,
}: UseSpeechSynthesisQueueOptions): UseSpeechSynthesisQueueReturn {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const chunks = useMemo(() => {
    if (maxChunkLength && maxChunkLength !== 180 && maxChunkLength < 250) {
      return splitTextIntoSpeechChunks(text, maxChunkLength);
    }
    const maxLen = maxChunkLength && maxChunkLength !== 180
      ? Math.max(250, maxChunkLength)
      : DEFAULT_CHUNK_MAX_LENGTH;
    return chunkChapterContent(
      text,
      DEFAULT_CHUNK_MIN_LENGTH,
      maxLen,
      DEFAULT_FIRST_CHUNK_MIN_LENGTH,
      DEFAULT_FIRST_CHUNK_MAX_LENGTH,
      DEFAULT_HEAD_CHUNK_COUNT
    ).map((c) => c.text);
  }, [text, maxChunkLength]);

  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const [bufferedCount, setBufferedCount] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [voiceId, setVoiceIdState] = useState<string>(initialVoiceId);
  const [playbackRate, setPlaybackRateState] = useState<number>(initialPlaybackRate);

  const chunksRef = useRef<string[]>(chunks);
  const currentChunkIndexRef = useRef<number>(0);
  const expectedNextIndexRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const isStoppedRef = useRef<boolean>(true);
  const queueSessionIdRef = useRef<number>(0);

  // Giữ toàn bộ utterance đang nằm trong hàng đợi để tránh Chrome GC làm mất onstart/onend
  const utterancePoolRef = useRef<Map<number, SpeechSynthesisUtterance>>(new Map());
  const queuedIndicesRef = useRef<Set<number>>(new Set());
  const settledIndicesRef = useRef<Set<number>>(new Set());
  const retryCountsRef = useRef<Map<number, number>>(new Map());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const voiceIdRef = useRef<string>(initialVoiceId);
  const playbackRateRef = useRef<number>(initialPlaybackRate);

  const onChunkChangeRef = useRef(onChunkChange);
  const onCompleteRef = useRef(onComplete);
  const onChunkErrorRef = useRef(onChunkError);

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  useEffect(() => {
    onChunkChangeRef.current = onChunkChange;
    onCompleteRef.current = onComplete;
    onChunkErrorRef.current = onChunkError;
  }, [onChunkChange, onComplete, onChunkError]);

  useEffect(() => {
    voiceIdRef.current = initialVoiceId;
    setVoiceIdState(initialVoiceId);
  }, [initialVoiceId]);

  useEffect(() => {
    playbackRateRef.current = initialPlaybackRate;
    setPlaybackRateState(initialPlaybackRate);
  }, [initialPlaybackRate]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /**
   * Đẩy (enqueue) một chunk cụ thể vào hàng đợi window.speechSynthesis theo đúng thứ tự chỉ mục (0 -> 1 -> 2...)
   */
  const enqueueChunk = useCallback((index: number, sessionId: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (sessionId !== queueSessionIdRef.current || isStoppedRef.current) return;

    const list = Array.isArray(chunksRef.current) ? chunksRef.current : [];
    if (index < 0 || index >= (list?.length || 0)) return;
    if (queuedIndicesRef.current.has(index) || settledIndicesRef.current.has(index)) return;

    const chunkText = list[index];
    const utterance = new SpeechSynthesisUtterance(chunkText);

    // Áp dụng đồng loạt cấu hình Rate (hỗ trợ tới 3.0x) và Voice cho từng utterance trước khi push
    utterance.lang = 'vi-VN';
    utterance.rate = Math.max(0.5, Math.min(3.0, playbackRateRef.current));
    utterance.pitch = 1.0;

    const matchedVoice = getMatchingBrowserVoice(voiceIdRef.current);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    queuedIndicesRef.current.add(index);
    utterancePoolRef.current.set(index, utterance);
    setBufferedCount(utterancePoolRef.current.size);

    // Cập nhật chính xác vị trí câu đang đọc khi utterance bắt đầu phát tiếng, khóa không nhảy ngược/nhảy cóc
    utterance.onstart = () => {
      if (sessionId !== queueSessionIdRef.current || isStoppedRef.current) return;
      if (index < expectedNextIndexRef.current) return;
      expectedNextIndexRef.current = index;
      currentChunkIndexRef.current = index;
      setCurrentChunkIndex(index);
      onChunkChangeRef.current?.(index, chunkText);
    };

    // NẠP ĐẠN NỐI TIẾP (Continuous Feed):
    // Khi utterance thứ i kết thúc -> lập tức nạp chunk thứ i + BUFFER_SIZE vào hàng đợi theo đúng thứ tự
    utterance.onend = () => {
      if (sessionId !== queueSessionIdRef.current || isStoppedRef.current) return;
      if (settledIndicesRef.current.has(index)) return;
      settledIndicesRef.current.add(index);
      retryCountsRef.current.delete(index);

      utterancePoolRef.current.delete(index);
      setBufferedCount(utterancePoolRef.current.size);
      expectedNextIndexRef.current = Math.max(expectedNextIndexRef.current, index + 1);

      const nextBufferIndex = index + BUFFER_SIZE;
      if (nextBufferIndex < (list?.length || 0)) {
        enqueueChunk(nextBufferIndex, sessionId);
      }

      // Chỉ hoàn thành khi đúng đoạn cuối cùng của chương phát xong
      if (index === (list?.length || 0) - 1) {
        isStoppedRef.current = true;
        isPlayingRef.current = false;
        isPausedRef.current = false;
        queuedIndicesRef.current.clear();
        settledIndicesRef.current.clear();
        retryCountsRef.current.clear();
        setBufferedCount(0);
        currentChunkIndexRef.current = 0;
        expectedNextIndexRef.current = 0;
        setCurrentChunkIndex(0);
        setIsPlaying(false);
        setIsPaused(false);
        onCompleteRef.current?.();
      }
    };

    // Xử lý lỗi: tự động thử lại nhanh tối đa 3 lần ngay tại đúng chunk bị lỗi, không bỏ qua đoạn oan
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (sessionId !== queueSessionIdRef.current || isStoppedRef.current) return;
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      if (settledIndicesRef.current.has(index)) return;

      const attempts = (retryCountsRef.current.get(index) || 0) + 1;
      if (attempts <= MAX_UTTERANCE_RETRIES) {
        retryCountsRef.current.set(index, attempts);
        console.warn(`[SpeechQueue] Chunk #${index} gặp lỗi (${event.error}), thử lại lần ${attempts}/${MAX_UTTERANCE_RETRIES}.`);
        const retrySessionId = queueSessionIdRef.current + 1;
        queueSessionIdRef.current = retrySessionId;
        utterancePoolRef.current.clear();
        queuedIndicesRef.current.clear();
        setBufferedCount(0);
        window.speechSynthesis.cancel();

        clearRetryTimer();
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (retrySessionId !== queueSessionIdRef.current || isStoppedRef.current) return;
          const retryEnd = Math.min(index + BUFFER_SIZE, list.length);
          for (let idx = index; idx < retryEnd; idx++) {
            enqueueChunk(idx, retrySessionId);
          }
        }, UTTERANCE_RETRY_DELAY_MS);
        return;
      }

      console.warn(`[SpeechQueue] Chunk #${index} thất bại sau ${MAX_UTTERANCE_RETRIES} lần thử lại (${event.error}).`);
      onChunkErrorRef.current?.(index, event.error || 'unknown');

      // Dừng an toàn tại đúng đoạn hiện tại để không bị nhảy cóc mất chữ
      queueSessionIdRef.current += 1;
      isStoppedRef.current = true;
      isPlayingRef.current = false;
      isPausedRef.current = false;
      utterancePoolRef.current.clear();
      queuedIndicesRef.current.clear();
      setBufferedCount(0);
      window.speechSynthesis.cancel();
      currentChunkIndexRef.current = index;
      expectedNextIndexRef.current = index;
      setCurrentChunkIndex(index);
      setIsPlaying(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [clearRetryTimer]);

  /**
   * Khởi động vòng lặp Sliding Window Buffer từ startIndex đến startIndex + BUFFER_SIZE - 1
   */
  const play = useCallback(
    (startIndex?: number) => {
      if (!isSupported || (chunksRef.current?.length || 0) === 0) return;

      clearRetryTimer();
      const list = Array.isArray(chunksRef.current) ? chunksRef.current : [];
      const listLen = list?.length || 0;
      const targetIndex =
        startIndex !== undefined
          ? Math.max(0, Math.min(startIndex, listLen - 1))
          : Math.max(0, Math.min(currentChunkIndexRef.current, listLen - 1));

      // Tăng sessionId trước khi cancel để vô hiệu hóa toàn bộ onend/onerror của hàng đợi cũ
      const nextSessionId = queueSessionIdRef.current + 1;
      queueSessionIdRef.current = nextSessionId;
      isStoppedRef.current = false;
      isPausedRef.current = false;
      isPlayingRef.current = true;

      utterancePoolRef.current.clear();
      queuedIndicesRef.current.clear();
      settledIndicesRef.current.clear();
      retryCountsRef.current.clear();
      setBufferedCount(0);

      if (window.speechSynthesis.speaking || window.speechSynthesis.pending || window.speechSynthesis.paused) {
        window.speechSynthesis.cancel();
      }

      expectedNextIndexRef.current = targetIndex;
      currentChunkIndexRef.current = targetIndex;
      setCurrentChunkIndex(targetIndex);
      setIsPaused(false);
      setIsPlaying(true);

      // MỞ RỘNG BUFFER: Nạp sẵn liên tiếp từ targetIndex đến targetIndex + BUFFER_SIZE - 1
      const initialBufferEnd = Math.min(targetIndex + BUFFER_SIZE, listLen);
      for (let idx = targetIndex; idx < initialBufferEnd; idx++) {
        enqueueChunk(idx, nextSessionId);
      }
    },
    [clearRetryTimer, isSupported, enqueueChunk]
  );

  /**
   * Tạm dừng hàng đợi đang phát
   */
  const pause = useCallback(() => {
    if (!isSupported || !isPlayingRef.current) return;

    window.speechSynthesis.pause();
    isPausedRef.current = true;
    isPlayingRef.current = false;
    setIsPaused(true);
    setIsPlaying(false);
  }, [isSupported]);

  /**
   * Tiếp tục hàng đợi đang tạm dừng
   */
  const resume = useCallback(() => {
    if (!isSupported) return;

    if (isPausedRef.current && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      isPausedRef.current = false;
      isPlayingRef.current = true;
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    // Fallback nếu trình duyệt tự hủy buffer paused khi để lâu dưới nền
    play(currentChunkIndexRef.current);
  }, [isSupported, play]);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else if (isPausedRef.current) {
      resume();
    } else {
      play(currentChunkIndexRef.current);
    }
  }, [pause, resume, play]);

  /**
   * Dừng hẳn: Xóa sạch Buffer Queue, gọi speechSynthesis.cancel() và reset currentChunkIndex về 0
   */
  const stop = useCallback(() => {
    clearRetryTimer();
    queueSessionIdRef.current += 1;
    isStoppedRef.current = true;
    isPausedRef.current = false;
    isPlayingRef.current = false;
    utterancePoolRef.current.clear();
    queuedIndicesRef.current.clear();
    settledIndicesRef.current.clear();
    retryCountsRef.current.clear();
    setBufferedCount(0);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    expectedNextIndexRef.current = 0;
    currentChunkIndexRef.current = 0;
    setCurrentChunkIndex(0);
    setIsPlaying(false);
    setIsPaused(false);
  }, [clearRetryTimer]);

  const seekToChunk = useCallback(
    (index: number) => {
      if (index < 0 || index >= (chunksRef.current?.length || 0)) return;
      currentChunkIndexRef.current = index;
      setCurrentChunkIndex(index);

      if (isPlayingRef.current || isPausedRef.current) {
        play(index);
      }
    },
    [play]
  );

  const skipNext = useCallback(() => {
    const nextIdx = currentChunkIndexRef.current + 1;
    if (nextIdx < (chunksRef.current?.length || 0)) {
      seekToChunk(nextIdx);
    }
  }, [seekToChunk]);

  const skipPrev = useCallback(() => {
    const prevIdx = Math.max(0, currentChunkIndexRef.current - 1);
    seekToChunk(prevIdx);
  }, [seekToChunk]);

  /**
   * Đổi giọng đọc đồng loạt cho cả hàng đợi:
   * Nếu đang phát, hủy hàng đợi cũ và nạp lại Sliding Window với giọng mới tại vị trí hiện tại
   */
  const setVoiceId = useCallback(
    (newVoice: string) => {
      voiceIdRef.current = newVoice;
      setVoiceIdState(newVoice);

      if (isPlayingRef.current || isPausedRef.current) {
        const resumeIndex = currentChunkIndexRef.current;
        queueSessionIdRef.current += 1;
        if (isSupported) {
          window.speechSynthesis.cancel();
        }
        if (isPlayingRef.current) {
          play(resumeIndex);
        }
      }
    },
    [isSupported, play]
  );

  /**
   * Đổi tốc độ đọc (Rate) đồng loạt cho cả hàng đợi:
   * Nếu user thay đổi Rate khi ĐANG NGHE:
   * 1. Gọi speechSynthesis.cancel() để hủy các utterance đang mang Rate cũ trong Buffer
   * 2. Cập nhật state Rate mới
   * 3. Lấy đúng vị trí currentChunkIndex hiện tại và khởi động lại vòng lặp Buffer từ vị trí đó
   */
  const setPlaybackRate = useCallback(
    (rate: number) => {
      const clampedRate = Math.max(0.5, Math.min(3.0, rate));
      playbackRateRef.current = clampedRate;
      setPlaybackRateState(clampedRate);

      if (isPlayingRef.current || isPausedRef.current) {
        const resumeIndex = Math.max(
          0,
          Math.min(currentChunkIndexRef.current, Math.max(0, (chunksRef.current?.length || 0) - 1))
        );

        queueSessionIdRef.current += 1;
        utterancePoolRef.current.clear();
        queuedIndicesRef.current.clear();
        setBufferedCount(0);

        if (isSupported) {
          window.speechSynthesis.cancel();
        }

        if (isPlayingRef.current) {
          play(resumeIndex);
        } else {
          // Nếu đang Pause khi đổi Rate: đặt lại trạng thái sẵn sàng phát tại resumeIndex với Rate mới
          isPausedRef.current = false;
          setIsPaused(false);
          currentChunkIndexRef.current = resumeIndex;
          setCurrentChunkIndex(resumeIndex);
        }
      }
    },
    [isSupported, play]
  );

  // Reset sạch khi chuyển sang nội dung chương khác hoặc unmount
  useEffect(() => {
    stop();
  }, [text, stop]);

  useEffect(() => {
    return () => {
      clearRetryTimer();
      queueSessionIdRef.current += 1;
      isStoppedRef.current = true;
      utterancePoolRef.current.clear();
      queuedIndicesRef.current.clear();
      settledIndicesRef.current.clear();
      retryCountsRef.current.clear();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearRetryTimer]);

  const currentChunkText =
    currentChunkIndex >= 0 && currentChunkIndex < (chunks?.length || 0)
      ? chunks[currentChunkIndex]
      : '';

  const progress =
    (chunks?.length || 0) > 0 && (isPlaying || isPaused || currentChunkIndex > 0)
      ? Math.round(((currentChunkIndex + 1) / (chunks?.length || 1)) * 100)
      : 0;

  return {
    chunks,
    currentChunkIndex,
    currentChunkText,
    totalChunks: chunks?.length || 0,
    bufferedCount,
    isPlaying,
    isPaused,
    playbackRate,
    voiceId,
    progress,
    isSupported,
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
