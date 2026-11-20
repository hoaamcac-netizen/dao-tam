'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * Kích thước hàng đợi đệm (Sliding Window Buffer Size = 5)
 * Đảm bảo trình duyệt luôn giữ sẵn 5 câu kế tiếp để phát mượt ở tốc độ 2.0x - 3.0x
 */
export const BUFFER_SIZE = 5;

export interface UseSpeechSynthesisQueueOptions {
  text: string;
  voiceGender?: 'female' | 'male';
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
  voiceGender: 'female' | 'male';
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
  setVoiceGender: (gender: 'female' | 'male') => void;
  setPlaybackRate: (rate: number) => void;
}

/**
 * Băm nhỏ văn bản theo ., ,, ?, !, \n (mỗi chunk tối đa <= 180 ký tự)
 */
export function splitTextIntoSpeechChunks(
  text: string,
  maxLength: number = 180
): string[] {
  if (!text || !text.trim()) return [];

  const safeMax = Math.max(80, Math.min(200, maxLength));
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const rawSegments = normalized.split(/(?<=[.,?!\n])/);

  const chunks: string[] = [];
  let buffer = '';

  const flushBuffer = () => {
    const trimmed = buffer.trim();
    if (trimmed && /[\p{L}\p{N}]/u.test(trimmed)) {
      chunks.push(trimmed);
    }
    buffer = '';
  };

  for (const rawSeg of rawSegments) {
    const hasNewline = rawSeg.includes('\n');
    const seg = rawSeg.replace(/\s+/g, ' ').trim();

    if (!seg || !/[\p{L}\p{N}]/u.test(seg)) {
      if (hasNewline) flushBuffer();
      continue;
    }

    if (seg.length > safeMax) {
      flushBuffer();
      const words = seg.split(' ');
      let wordBuf = '';
      for (const word of words) {
        if (!word) continue;
        if (word.length > safeMax) {
          if (wordBuf) {
            chunks.push(wordBuf.trim());
            wordBuf = '';
          }
          for (let i = 0; i < word.length; i += safeMax) {
            chunks.push(word.slice(i, i + safeMax));
          }
          continue;
        }
        const candidate = wordBuf ? `${wordBuf} ${word}` : word;
        if (candidate.length <= safeMax) {
          wordBuf = candidate;
        } else {
          chunks.push(wordBuf.trim());
          wordBuf = word;
        }
      }
      if (wordBuf.trim()) {
        chunks.push(wordBuf.trim());
      }
      continue;
    }

    const next = buffer ? `${buffer} ${seg}` : seg;
    if (next.length <= safeMax) {
      buffer = next;
      if (hasNewline) flushBuffer();
    } else {
      flushBuffer();
      buffer = seg;
      if (hasNewline) flushBuffer();
    }
  }

  flushBuffer();
  return chunks;
}

function getVietnameseBrowserVoice(gender: 'female' | 'male'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const viVoices = (voices || []).filter(
    (v) => v.lang.toLowerCase().startsWith('vi') || v.lang.includes('VN')
  );
  if ((viVoices?.length || 0) === 0) return null;

  const matched = viVoices.find((v) => {
    const name = v.name.toLowerCase();
    if (gender === 'male') {
      return name.includes('namminh') || name.includes('nam minh') || name.includes('male');
    }
    return name.includes('hoaimy') || name.includes('hoài my') || name.includes('female');
  });

  return matched || viVoices[0];
}

/**
 * Hook xử lý Web Speech API với thuật toán Sliding Window / Continuous Buffering (BUFFER_SIZE = 5)
 */
export function useSpeechSynthesisQueue({
  text,
  voiceGender: initialVoiceGender = 'female',
  playbackRate: initialPlaybackRate = 1.0,
  maxChunkLength = 180,
  onChunkChange,
  onComplete,
  onChunkError,
}: UseSpeechSynthesisQueueOptions): UseSpeechSynthesisQueueReturn {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const chunks = useMemo(
    () => splitTextIntoSpeechChunks(text, maxChunkLength),
    [text, maxChunkLength]
  );

  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const [bufferedCount, setBufferedCount] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [voiceGender, setVoiceGenderState] = useState<'female' | 'male'>(initialVoiceGender);
  const [playbackRate, setPlaybackRateState] = useState<number>(initialPlaybackRate);

  const chunksRef = useRef<string[]>(chunks);
  const currentChunkIndexRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const isStoppedRef = useRef<boolean>(true);
  const queueSessionIdRef = useRef<number>(0);

  const utterancePoolRef = useRef<Map<number, SpeechSynthesisUtterance>>(new Map());
  const queuedIndicesRef = useRef<Set<number>>(new Set());

  const voiceGenderRef = useRef<'female' | 'male'>(initialVoiceGender);
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
    voiceGenderRef.current = initialVoiceGender;
    setVoiceGenderState(initialVoiceGender);
  }, [initialVoiceGender]);

  useEffect(() => {
    playbackRateRef.current = initialPlaybackRate;
    setPlaybackRateState(initialPlaybackRate);
  }, [initialPlaybackRate]);

  const enqueueChunk = useCallback((index: number, sessionId: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (sessionId !== queueSessionIdRef.current || isStoppedRef.current) return;

    const list = chunksRef.current || [];
    if (index < 0 || index >= (list?.length || 0)) return;
    if (queuedIndicesRef.current.has(index)) return;

    const chunkText = list[index];
    const utterance = new SpeechSynthesisUtterance(chunkText);

    // Áp dụng đồng loạt Rate & Voice trước khi push vào hàng đợi speechSynthesis
    utterance.lang = 'vi-VN';
    utterance.rate = Math.max(0.5, Math.min(3.0, playbackRateRef.current));
    utterance.pitch = 1.0;

    const voice = getVietnameseBrowserVoice(voiceGenderRef.current);
    if (voice) {
      utterance.voice = voice;
    }

    queuedIndicesRef.current.add(index);
    utterancePoolRef.current.set(index, utterance);
    setBufferedCount(utterancePoolRef.current.size);

    utterance.onstart = () => {
      if (sessionId !== queueSessionIdRef.current || isStoppedRef.current) return;
      currentChunkIndexRef.current = index;
      setCurrentChunkIndex(index);
      onChunkChangeRef.current?.(index, chunkText);
    };

    // Nạp đạn nối tiếp: khi chunk i kết thúc -> nạp chunk i + BUFFER_SIZE
    utterance.onend = () => {
      if (sessionId !== queueSessionIdRef.current || isStoppedRef.current) return;

      utterancePoolRef.current.delete(index);
      setBufferedCount(utterancePoolRef.current.size);

      const nextBufferIndex = index + BUFFER_SIZE;
      if (nextBufferIndex < (list?.length || 0)) {
        enqueueChunk(nextBufferIndex, sessionId);
      }

      if (index === (list?.length || 0) - 1 || utterancePoolRef.current.size === 0) {
        isStoppedRef.current = true;
        isPlayingRef.current = false;
        isPausedRef.current = false;
        queuedIndicesRef.current.clear();
        setBufferedCount(0);
        currentChunkIndexRef.current = 0;
        setCurrentChunkIndex(0);
        setIsPlaying(false);
        setIsPaused(false);
        onCompleteRef.current?.();
      }
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (sessionId !== queueSessionIdRef.current || isStoppedRef.current) return;
      if (event.error === 'interrupted' || event.error === 'canceled') return;

      onChunkErrorRef.current?.(index, event.error || 'unknown');

      utterancePoolRef.current.delete(index);
      setBufferedCount(utterancePoolRef.current.size);

      const nextBufferIndex = index + BUFFER_SIZE;
      if (nextBufferIndex < (list?.length || 0)) {
        enqueueChunk(nextBufferIndex, sessionId);
      }

      if (index === (list?.length || 0) - 1 || utterancePoolRef.current.size === 0) {
        isStoppedRef.current = true;
        isPlayingRef.current = false;
        isPausedRef.current = false;
        queuedIndicesRef.current.clear();
        setBufferedCount(0);
        currentChunkIndexRef.current = 0;
        setCurrentChunkIndex(0);
        setIsPlaying(false);
        setIsPaused(false);
        onCompleteRef.current?.();
      }
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const play = useCallback(
    (startIndex?: number) => {
      if (!isSupported || (chunksRef.current?.length || 0) === 0) return;

      const list = chunksRef.current || [];
      const targetIndex =
        startIndex !== undefined
          ? Math.max(0, Math.min(startIndex, (list?.length || 0) - 1))
          : Math.max(0, Math.min(currentChunkIndexRef.current, (list?.length || 0) - 1));

      const nextSessionId = queueSessionIdRef.current + 1;
      queueSessionIdRef.current = nextSessionId;
      isStoppedRef.current = false;
      isPausedRef.current = false;
      isPlayingRef.current = true;

      utterancePoolRef.current.clear();
      queuedIndicesRef.current.clear();
      setBufferedCount(0);

      if (window.speechSynthesis.speaking || window.speechSynthesis.pending || window.speechSynthesis.paused) {
        window.speechSynthesis.cancel();
      }

      currentChunkIndexRef.current = targetIndex;
      setCurrentChunkIndex(targetIndex);
      setIsPaused(false);
      setIsPlaying(true);

      // Nạp sẵn các chunk từ targetIndex đến targetIndex + BUFFER_SIZE - 1
      const initialBufferEnd = Math.min(targetIndex + BUFFER_SIZE, list?.length || 0);
      for (let idx = targetIndex; idx < initialBufferEnd; idx++) {
        enqueueChunk(idx, nextSessionId);
      }
    },
    [isSupported, enqueueChunk]
  );

  const pause = useCallback(() => {
    if (!isSupported || !isPlayingRef.current) return;
    window.speechSynthesis.pause();
    isPausedRef.current = true;
    isPlayingRef.current = false;
    setIsPaused(true);
    setIsPlaying(false);
  }, [isSupported]);

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

  const stop = useCallback(() => {
    queueSessionIdRef.current += 1;
    isStoppedRef.current = true;
    isPausedRef.current = false;
    isPlayingRef.current = false;
    utterancePoolRef.current.clear();
    queuedIndicesRef.current.clear();
    setBufferedCount(0);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    currentChunkIndexRef.current = 0;
    setCurrentChunkIndex(0);
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

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

  const setVoiceGender = useCallback(
    (gender: 'female' | 'male') => {
      voiceGenderRef.current = gender;
      setVoiceGenderState(gender);

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
          isPausedRef.current = false;
          setIsPaused(false);
          currentChunkIndexRef.current = resumeIndex;
          setCurrentChunkIndex(resumeIndex);
        }
      }
    },
    [isSupported, play]
  );

  useEffect(() => {
    stop();
  }, [text, stop]);

  useEffect(() => {
    return () => {
      queueSessionIdRef.current += 1;
      isStoppedRef.current = true;
      utterancePoolRef.current.clear();
      queuedIndicesRef.current.clear();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const safeChunks = Array.isArray(chunks) ? chunks : [];
  const currentChunkText =
    currentChunkIndex >= 0 && currentChunkIndex < (safeChunks?.length || 0)
      ? safeChunks[currentChunkIndex]
      : '';

  const progress =
    (safeChunks?.length || 0) > 0 && (isPlaying || isPaused || currentChunkIndex > 0)
      ? Math.round(((currentChunkIndex + 1) / (safeChunks?.length || 1)) * 100)
      : 0;

  return {
    chunks: safeChunks,
    currentChunkIndex,
    currentChunkText,
    totalChunks: safeChunks?.length || 0,
    bufferedCount,
    isPlaying,
    isPaused,
    playbackRate,
    voiceGender,
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
    setVoiceGender,
    setPlaybackRate,
  };
}
