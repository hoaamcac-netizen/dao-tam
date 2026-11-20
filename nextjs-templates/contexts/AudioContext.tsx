'use client';

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  ensureChapterAudioCacheLoaded,
  getCachedChunkAudioSync,
  preloadRemoteUrlInBrowser,
  resolveAndCacheChunkAudio,
  revokeAllRamAudioBlobs,
  warmChapterAudioChunks,
} from '../lib/firebaseAudioCache';

export interface GlobalAudioNovel {
  id: string;
  title: string;
  slug?: string;
  author?: string;
  coverImage?: string;
}

export interface GlobalAudioChapter {
  id: string;
  number: number;
  title: string;
  slug?: string;
  content?: string;
}

interface SpeechChunk {
  id: number;
  text: string;
  paraIndex: number; // -1 cho tiêu đề chương, >= 0 cho đoạn văn tương ứng trong UI
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterSlug?: string;
  chapterChunkIndex: number; // Chỉ số chunk cục bộ trong chương (0, 1, 2...) để cache Firebase chuẩn xác
  chapterTotalChunks: number; // Tổng số chunk của riêng chương này
  chapterParagraphs: string[]; // Danh sách đoạn văn của riêng chương này
}

export interface GlobalAudioContextValue {
  activeNovel: GlobalAudioNovel | null;
  activeChapter: GlobalAudioChapter | null;
  chaptersList: GlobalAudioChapter[];
  paragraphs: string[];
  currentIndex: number;
  isAudioMode: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  retryAttempt: number;
  bufferedCount: number;
  audioError: string | null;
  voiceId: 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural';
  playbackRate: number;
  autoNext: boolean;
  isBarVisible: boolean;
  isMinimized: boolean;
  progress: number;
  currentText: string;
  registerProgressBarRef: (el: HTMLDivElement | null) => void;
  playChapter: (
    novel: GlobalAudioNovel,
    chapter: GlobalAudioChapter,
    chapters?: GlobalAudioChapter[],
    options?: { startIndex?: number; autoStart?: boolean; userExplicit?: boolean }
  ) => Promise<void>;
  setAudioMode: (enabled: boolean) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrev: () => Promise<void>;
  seekToParagraph: (index: number) => Promise<void>;
  setVoiceId: (voice: 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural') => void;
  setPlaybackRate: (rate: number) => void;
  setAutoNext: (auto: boolean) => void;
  setIsMinimized: (minimized: boolean) => void;
  clearAudioError: () => void;
  closeBar: () => void;
  stopForManualChapterChange: () => void;
}

const AudioContext = createContext<GlobalAudioContextValue | null>(null);

const LISTENING_HISTORY_DEBOUNCE_MS = 30000; // Khóa Write: Debounce 30 giây/lần hoặc khi pause/unmount
const PREFETCH_LOOKAHEAD_COUNT = 4; // Deep Buffer: duy trì hàng đợi tuần tự 4 chunks (3-5) dạng Blob trong RAM
const CHUNK_MIN_LEN = 200;
const CHUNK_MAX_LEN = 250;

/**
 * Làm sạch văn bản trước khi đưa vào Edge TTS (Nam Minh / Hoài My)
 */
export function cleanTextForTTS(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' và ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;|&gt;/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[*_~`#|\\<>^{}[\]•◆◇■□●○★☆※♥♡✿🌸⚔️💎]+/g, ' ')
    .replace(/[.]{4,}/g, '...')
    .replace(/[!]{2,}/g, '!')
    .replace(/[?]{2,}/g, '?')
    .replace(/[-–—]{2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitParagraphs(content?: string): string[] {
  if (!content) return [];
  return content
    .split(/\r?\n+/)
    .map((p) => p.replace(/<[^>]*>/g, ' ').trim())
    .filter((p) => p.length > 0);
}

function formatChapterTitleForTTS(chapter: { number: number; title?: string }): string {
  const raw = (chapter.title || '').trim();
  if (!raw) return `Chương ${chapter.number}`;
  if (/^chương\s+\d+/i.test(raw)) return raw;
  return `Chương ${chapter.number}: ${raw}`;
}

/**
 * TIÊU CHUẨN 1: BẮT BUỘC chèn Tên Chương vào chunk đầu tiên
 * Ghép `const fullTextToRead = chapterTitle + '.\n\n' + chapterContent;` trước khi cắt chunk
 * để giọng đọc AI đọc tên chương và ngắt nghỉ tự nhiên trước khi vào nội dung.
 */
function buildChapterSpeechChunks(
  novelId: string,
  chapter: GlobalAudioChapter,
  chapterContent: string,
  idealMin = CHUNK_MIN_LEN,
  idealMax = CHUNK_MAX_LEN
): { paragraphs: string[]; chunks: SpeechChunk[] } {
  const paragraphs = splitParagraphs(chapterContent);
  if ((paragraphs?.length || 0) === 0) {
    return { paragraphs: [], chunks: [] };
  }

  const rawTitle = cleanTextForTTS(formatChapterTitleForTTS(chapter)).replace(/[.?!…]+$/, '');
  const chapterTitle = rawTitle || `Chương ${chapter.number}`;
  const fullTextToRead = chapterTitle + '.\n\n' + chapterContent;

  const result: SpeechChunk[] = [];
  let rollingText = '';
  let rollingParaIdx = -1;

  const pushChunk = (textVal: string, pIdx: number) => {
    const trimmed = textVal.trim();
    if (!trimmed || !/[\p{L}\p{N}]/u.test(trimmed)) return;
    const localIdx = result?.length || 0;
    result.push({
      id: localIdx,
      text: trimmed,
      paraIndex: pIdx,
      novelId,
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title || chapterTitle,
      chapterSlug: chapter.slug,
      chapterChunkIndex: localIdx,
      chapterTotalChunks: 0,
      chapterParagraphs: paragraphs,
    });
  };

  const flushRolling = () => {
    if (rollingText.trim()) {
      pushChunk(rollingText, rollingParaIdx);
    }
    rollingText = '';
  };

  // Tách dòng từ fullTextToRead: block 0 luôn là `chapterTitle + '.'` (paraIndex = -1), các block sau map 1-1 với paragraphs
  const rawBlocks = fullTextToRead
    .split(/\r?\n+/)
    .map((line) => line.replace(/<[^>]*>/g, ' ').trim())
    .filter((line) => (line?.length || 0) > 0);

  for (let blockIdx = 0; blockIdx < (rawBlocks?.length || 0); blockIdx++) {
    const cleanedBlock = cleanTextForTTS(rawBlocks[blockIdx]);
    if (!cleanedBlock || !/[\p{L}\p{N}]/u.test(cleanedBlock)) continue;

    const mappedParaIdx = blockIdx === 0 ? -1 : Math.min((paragraphs?.length || 1) - 1, blockIdx - 1);

    const sentences = cleanedBlock
      .split(/(?<=[.?!…;])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const sentence of sentences) {
      if (sentence.length > idealMax) {
        flushRolling();
        const clauses = sentence
          .split(/(?<=[,:—–-])\s+/)
          .map((c) => c.trim())
          .filter(Boolean);

        let clauseBuf = '';
        for (const clause of clauses) {
          if (clause.length > idealMax) {
            if (clauseBuf) {
              pushChunk(clauseBuf, mappedParaIdx);
              clauseBuf = '';
            }
            const words = clause.split(/\s+/);
            let wordBuf = '';
            for (const w of words) {
              if (wordBuf && wordBuf.length + 1 + w.length > idealMax) {
                pushChunk(wordBuf, mappedParaIdx);
                wordBuf = w;
              } else {
                wordBuf = wordBuf ? `${wordBuf} ${w}` : w;
              }
            }
            if (wordBuf) clauseBuf = wordBuf;
          } else if (clauseBuf && clauseBuf.length + 1 + clause.length > idealMax) {
            pushChunk(clauseBuf, mappedParaIdx);
            clauseBuf = clause;
          } else {
            clauseBuf = clauseBuf ? `${clauseBuf} ${clause}` : clause;
          }
        }
        if (clauseBuf) {
          pushChunk(clauseBuf, mappedParaIdx);
        }
        continue;
      }

      if (!rollingText) {
        rollingParaIdx = mappedParaIdx;
        rollingText = sentence;
        if (rollingText.length >= idealMin) {
          flushRolling();
        }
      } else if (rollingText.length + 1 + sentence.length <= idealMax) {
        if (rollingParaIdx === -1 && mappedParaIdx >= 0) {
          rollingParaIdx = mappedParaIdx;
        }
        rollingText = `${rollingText} ${sentence}`;
        if (rollingText.length >= idealMin) {
          flushRolling();
        }
      } else {
        flushRolling();
        rollingParaIdx = mappedParaIdx;
        rollingText = sentence;
        if (rollingText.length >= idealMin) {
          flushRolling();
        }
      }
    }
  }

  flushRolling();

  const total = result?.length || 0;
  for (let i = 0; i < total; i++) {
    result[i].chapterTotalChunks = total;
  }

  return { paragraphs, chunks: result };
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [activeNovel, setActiveNovel] = useState<GlobalAudioNovel | null>(null);
  const [activeChapter, setActiveChapter] = useState<GlobalAudioChapter | null>(null);
  const [chaptersList, setChaptersList] = useState<GlobalAudioChapter[]>([]);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isAudioMode, setIsAudioMode] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [bufferedCount, setBufferedCount] = useState<number>(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [voiceId, setVoiceIdState] = useState<'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural'>(
    'vi-VN-HoaiMyNeural'
  );
  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [autoNext, setAutoNextState] = useState<boolean>(true);
  const [isBarVisible, setIsBarVisible] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Cờ chống chạy lặp useEffect
  const hasRestoredSettingsRef = useRef<boolean>(false);
  const hasInitializedAudioRef = useRef<boolean>(false);

  // Cặp thẻ <audio> ẩn A/B — TUYỆT ĐỐI chỉ nạp src chunk tiếp theo khi chunk hiện tại bắn onended
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeSlotRef = useRef<'A' | 'B'>('A');
  const activeChunkTokenRef = useRef<string>('');
  const silentKeepAliveRef = useRef<HTMLAudioElement | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);

  // Hàng đợi Blob theo thứ tự nghiêm ngặt (Strict Sequential Queue)
  const blobQueueRef = useRef<Array<string | null>>([]);
  const prefetchGenerationRef = useRef<number>(0);
  const bufferedCountRef = useRef<number>(0);

  // Cập nhật Progress Bar trực tiếp qua DOM useRef + requestAnimationFrame (ZERO setState trong timeupdate/rAF)
  const progressBarElRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const isAudioModeRef = useRef<boolean>(false);
  const isPlaybackActiveRef = useRef<boolean>(false);
  const isBarVisibleRef = useRef<boolean>(false);
  const paragraphsRef = useRef<string[]>([]);
  const chunksRef = useRef<SpeechChunk[]>([]);
  const currentChunkIdxRef = useRef<number>(-1);
  const currentIndexRef = useRef<number>(-1);
  const voiceIdRef = useRef<'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural'>('vi-VN-HoaiMyNeural');
  const playbackRateRef = useRef<number>(1.0);
  const autoNextRef = useRef<boolean>(true);
  const activeNovelRef = useRef<GlobalAudioNovel | null>(null);
  const activeChapterRef = useRef<GlobalAudioChapter | null>(null);
  const chaptersListRef = useRef<GlobalAudioChapter[]>([]);
  const sessionNonceRef = useRef<number>(0);
  const isAdvancingChapterRef = useRef<boolean>(false);
  const inFlightChapterKeyRef = useRef<string | null>(null);
  const fetchedChapterContentKeysRef = useRef<Set<string>>(new Set());

  // Debounce Timer đồng bộ tiến độ nghe lên Firestore (30 giây/lần hoặc khi pause/unmount)
  const historySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlushedHistoryKeyRef = useRef<string>('');
  const pendingHistoryPayloadRef = useRef<{
    novelId: string;
    novelTitle: string;
    novelSlug?: string;
    chapterId: string;
    chapterNumber: number;
    chapterTitle: string;
    chunkIndex: number;
    currentTime: number;
    updatedAt: number;
  } | null>(null);

  const preparedChaptersRef = useRef<
    Map<string, { paragraphs: string[]; chunks: SpeechChunk[] }>
  >(new Map());
  const preloadPromisesRef = useRef<
    Map<string, Promise<{ paragraphs: string[]; chunks: SpeechChunk[] } | null>>
  >(new Map());
  const appendedBoundaryKeysRef = useRef<Set<string>>(new Set());
  const appendBoundaryPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map());

  const playChunkRef = useRef<(index: number) => Promise<void>>(async () => {});
  const playNextChapterRef = useRef<() => Promise<void>>(async () => {});
  const preloadNextChapterRef = useRef<() => void>(() => {});
  const skipNextRef = useRef<() => Promise<void>>(async () => {});
  const skipPrevRef = useRef<() => Promise<void>>(async () => {});

  const getActiveAudio = useCallback((): HTMLAudioElement | null => {
    return activeSlotRef.current === 'A' ? audioARef.current : audioBRef.current;
  }, []);

  const getAudioBySlot = useCallback((slot: 'A' | 'B'): HTMLAudioElement | null => {
    return slot === 'A' ? audioARef.current : audioBRef.current;
  }, []);

  const updateProgressBarDomNow = useCallback((explicitPct?: number) => {
    const el = progressBarElRef.current;
    if (!el) return;
    if (typeof explicitPct === 'number') {
      el.style.width = `${Math.min(100, Math.max(0, explicitPct)).toFixed(2)}%`;
      return;
    }
    const queueIdx = currentChunkIdxRef.current;
    const activeChunk = (chunksRef.current || [])[queueIdx];
    const totalInChapter = activeChunk?.chapterTotalChunks || chunksRef.current?.length || 0;
    const localIdx = activeChunk ? activeChunk.chapterChunkIndex : queueIdx;
    if (totalInChapter <= 0 || localIdx < 0) {
      el.style.width = '0%';
      return;
    }
    const activeAudio = getActiveAudio();
    const audioRatio =
      activeAudio && Number.isFinite(activeAudio.duration) && activeAudio.duration > 0
        ? Math.min(1, Math.max(0, activeAudio.currentTime / activeAudio.duration))
        : 0;
    const pct = Math.min(100, Math.max(0, ((localIdx + audioRatio) / totalInChapter) * 100));
    el.style.width = `${pct.toFixed(2)}%`;
  }, [getActiveAudio]);

  const registerProgressBarRef = useCallback(
    (el: HTMLDivElement | null) => {
      progressBarElRef.current = el;
      updateProgressBarDomNow();
    },
    [updateProgressBarDomNow]
  );

  // Vòng lặp requestAnimationFrame cập nhật thanh Progress Bar 60fps không gây re-render
  useEffect(() => {
    if (!isPlaying) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      updateProgressBarDomNow();
      return;
    }

    let active = true;
    const loop = () => {
      if (!active) return;
      updateProgressBarDomNow();
      rafIdRef.current = requestAnimationFrame(loop);
    };
    rafIdRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying, updateProgressBarDomNow]);

  const resetPrefetchAbortController = useCallback(() => {
    prefetchGenerationRef.current += 1;
    if (prefetchAbortRef.current) {
      try {
        prefetchAbortRef.current.abort();
      } catch {}
    }
    prefetchAbortRef.current = new AbortController();
    return prefetchAbortRef.current.signal;
  }, []);

  /**
   * Khóa Write Firestore:
   * Chỉ gọi updateDoc theo debounce 30s hoặc ĐÚNG 1 LẦN khi pause / close / unmount.
   */
  const flushListeningHistoryToFirestore = useCallback(async () => {
    if (historySyncTimerRef.current) {
      clearTimeout(historySyncTimerRef.current);
      historySyncTimerRef.current = null;
    }
    const basePayload = pendingHistoryPayloadRef.current;
    if (!basePayload) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      pendingHistoryPayloadRef.current = null;
      return;
    }

    const activeAudio = getActiveAudio();
    const liveCurrentTime =
      activeAudio && Number.isFinite(activeAudio.currentTime)
        ? Math.floor(activeAudio.currentTime)
        : basePayload.currentTime;

    const dedupeKey = `${basePayload.novelId}::${basePayload.chapterId}::${basePayload.chunkIndex}::${liveCurrentTime}`;
    if (dedupeKey === lastFlushedHistoryKeyRef.current) {
      pendingHistoryPayloadRef.current = null;
      return;
    }

    const payloadToWrite = {
      ...basePayload,
      currentTime: liveCurrentTime,
      updatedAt: Date.now(),
    };
    pendingHistoryPayloadRef.current = null;

    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        lastListeningProgress: payloadToWrite,
      });
      lastFlushedHistoryKeyRef.current = dedupeKey;
    } catch {
      // Bỏ qua nếu tài khoản khách hoặc chưa có doc
    }
  }, [getActiveAudio]);

  const scheduleListeningHistorySync = useCallback(
    (novel: GlobalAudioNovel, chapter: GlobalAudioChapter, chunkIdx: number) => {
      if (!auth.currentUser) return;
      const activeAudio = getActiveAudio();
      pendingHistoryPayloadRef.current = {
        novelId: novel.id,
        novelTitle: novel.title,
        novelSlug: novel.slug || novel.id,
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        chunkIndex: chunkIdx,
        currentTime:
          activeAudio && Number.isFinite(activeAudio.currentTime)
            ? Math.floor(activeAudio.currentTime)
            : 0,
        updatedAt: Date.now(),
      };

      if (historySyncTimerRef.current) return;
      historySyncTimerRef.current = setTimeout(() => {
        flushListeningHistoryToFirestore().catch(() => {});
      }, LISTENING_HISTORY_DEBOUNCE_MS);
    },
    [flushListeningHistoryToFirestore, getActiveAudio]
  );

  // Khôi phục cài đặt 1 lần duy nhất khi mount (dùng cờ useRef chặn loop)
  useEffect(() => {
    if (hasRestoredSettingsRef.current) return;
    hasRestoredSettingsRef.current = true;
    setIsMounted(true);

    try {
      const saved = window.localStorage.getItem('daotam_reader_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.selectedVoiceId?.includes('NamMinh')) {
          setVoiceIdState('vi-VN-NamMinhNeural');
          voiceIdRef.current = 'vi-VN-NamMinhNeural';
        }
        if (typeof parsed.voiceSpeed === 'number') {
          setPlaybackRateState(parsed.voiceSpeed);
          playbackRateRef.current = parsed.voiceSpeed;
        }
        if (typeof parsed.autoNextChapter === 'boolean') {
          setAutoNextState(parsed.autoNextChapter);
          autoNextRef.current = parsed.autoNextChapter;
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    paragraphsRef.current = paragraphs;
  }, [paragraphs]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
    updateProgressBarDomNow();
  }, [currentIndex, updateProgressBarDomNow]);
  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);
  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (audioARef.current) audioARef.current.playbackRate = playbackRate;
    if (audioBRef.current) audioBRef.current.playbackRate = playbackRate;
  }, [playbackRate]);
  useEffect(() => {
    autoNextRef.current = autoNext;
  }, [autoNext]);
  useEffect(() => {
    activeNovelRef.current = activeNovel;
  }, [activeNovel]);
  useEffect(() => {
    activeChapterRef.current = activeChapter;
  }, [activeChapter]);
  useEffect(() => {
    chaptersListRef.current = chaptersList;
  }, [chaptersList]);
  useEffect(() => {
    isBarVisibleRef.current = isBarVisible;
  }, [isBarVisible]);
  useEffect(() => {
    isAudioModeRef.current = isAudioMode;
  }, [isAudioMode]);

  // Khởi tạo thẻ <audio> 1 lần duy nhất (dùng cờ useRef chặn lặp)
  useEffect(() => {
    if (hasInitializedAudioRef.current) return;
    hasInitializedAudioRef.current = true;

    const audioA = new Audio();
    audioA.preload = 'auto';
    audioARef.current = audioA;

    const audioB = new Audio();
    audioB.preload = 'auto';
    audioBRef.current = audioB;

    try {
      const silent = new Audio(
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
      );
      silent.loop = true;
      silent.volume = 0.05;
      silentKeepAliveRef.current = silent;
    } catch {}

    const handlePageHide = () => {
      flushListeningHistoryToFirestore().catch(() => {});
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (prefetchAbortRef.current) {
        try {
          prefetchAbortRef.current.abort();
        } catch {}
      }
      flushListeningHistoryToFirestore().catch(() => {});
      if (historySyncTimerRef.current) {
        clearTimeout(historySyncTimerRef.current);
        historySyncTimerRef.current = null;
      }
      for (const el of [audioA, audioB]) {
        el.onended = null;
        el.onerror = null;
        el.pause();
        el.src = '';
      }
      audioARef.current = null;
      audioBRef.current = null;
      blobQueueRef.current = [];
      if (silentKeepAliveRef.current) {
        silentKeepAliveRef.current.pause();
        silentKeepAliveRef.current = null;
      }
      preparedChaptersRef.current.clear();
      preloadPromisesRef.current.clear();
      revokeAllRamAudioBlobs();
      hasInitializedAudioRef.current = false;
    };
  }, [flushListeningHistoryToFirestore]);

  const syncMobileBackgroundSession = useCallback(
    (novel: GlobalAudioNovel, chapter: GlobalAudioChapter) => {
      if (silentKeepAliveRef.current && silentKeepAliveRef.current.paused) {
        silentKeepAliveRef.current.play().catch(() => {});
      }

      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: `${novel.title} - Chương ${chapter.number}: ${chapter.title}`,
            artist: `Tác giả: ${novel.author || 'Đạo Tâm'} • ${
              voiceIdRef.current.includes('NamMinh') ? 'Nam Minh' : 'Hoài My'
            }`,
            album: 'Đạo Tâm • Audio',
            artwork: novel.coverImage
              ? [
                  { src: novel.coverImage, sizes: '96x96', type: 'image/jpeg' },
                  { src: novel.coverImage, sizes: '256x256', type: 'image/jpeg' },
                  { src: novel.coverImage, sizes: '512x512', type: 'image/jpeg' },
                ]
              : [],
          });
          navigator.mediaSession.playbackState = 'playing';

          navigator.mediaSession.setActionHandler('play', () => {
            isPlaybackActiveRef.current = true;
            setIsPlaying(true);
            getActiveAudio()?.play().catch(() => {});
          });
          navigator.mediaSession.setActionHandler('pause', () => {
            isPlaybackActiveRef.current = false;
            setIsPlaying(false);
            getActiveAudio()?.pause();
            flushListeningHistoryToFirestore().catch(() => {});
          });
          navigator.mediaSession.setActionHandler('nexttrack', () => {
            skipNextRef.current();
          });
          navigator.mediaSession.setActionHandler('previoustrack', () => {
            skipPrevRef.current();
          });
        } catch {}
      }
    },
    [flushListeningHistoryToFirestore, getActiveAudio]
  );

  const pauseMobileBackgroundSession = useCallback(() => {
    if (silentKeepAliveRef.current) {
      silentKeepAliveRef.current.pause();
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'paused';
      } catch {}
    }
  }, []);

  const makeChapterCacheKey = (novelId: string, chapterId: string) => `${novelId}:::${chapterId}`;

  const findNextChapterFor = useCallback((chapter: GlobalAudioChapter): GlobalAudioChapter | null => {
    const list = Array.isArray(chaptersListRef.current) ? chaptersListRef.current : [];
    const curIdx = list.findIndex(
      (c) => c.id === chapter.id || Number(c.number) === Number(chapter.number)
    );
    if (curIdx >= 0) {
      return curIdx < (list?.length || 0) - 1 ? list[curIdx + 1] : null;
    }
    const nextNum = (chapter.number || 1) + 1;
    return {
      id: `chuong-${nextNum}`,
      number: nextNum,
      title: `Chương ${nextNum}`,
      slug: `chuong-${nextNum}`,
    };
  }, []);

  const preloadChapterForAudio = useCallback(
    (novel: GlobalAudioNovel, chapter: GlobalAudioChapter, targetVoice?: string) => {
      if (!isAudioModeRef.current) {
        return Promise.resolve(null);
      }

      const key = makeChapterCacheKey(novel.id, chapter.id);
      const voice = targetVoice || voiceIdRef.current;
      const signal = prefetchAbortRef.current?.signal;

      const warmChunks = (parsedChunks: SpeechChunk[]) => {
        if (!isAudioModeRef.current || signal?.aborted) return;
        warmChapterAudioChunks({
          novelId: novel.id,
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          chunks: parsedChunks,
          voiceId: voice,
          startIndex: 0,
          count: PREFETCH_LOOKAHEAD_COUNT,
          signal,
        }).catch(() => {});
      };

      const cached = preparedChaptersRef.current.get(key);
      if (cached && (cached.chunks?.length || 0) > 0) {
        warmChunks(cached.chunks);
        return Promise.resolve(cached);
      }

      const inFlight = preloadPromisesRef.current.get(key);
      if (inFlight) {
        return inFlight.then((res) => {
          if (res && (res.chunks?.length || 0) > 0) warmChunks(res.chunks);
          return res;
        });
      }

      const task = (async () => {
        try {
          const chapterState = await ensureChapterAudioCacheLoaded(
            novel.id,
            chapter.id,
            chapter.number
          );
          if (!isAudioModeRef.current || signal?.aborted) return null;

          let content = chapter.content || chapterState.content || '';
          if (
            (!content || content.trim().length < 5) &&
            !fetchedChapterContentKeysRef.current.has(key)
          ) {
            fetchedChapterContentKeysRef.current.add(key);
            const candidateIds = Array.from(
              new Set([
                chapter.id,
                `chuong-${chapter.number}`,
                String(chapter.number),
              ].filter(Boolean))
            );
            for (const docId of candidateIds) {
              try {
                const chSnap = await getDoc(doc(db, 'novels', novel.id, 'chapters', docId));
                if (chSnap.exists()) {
                  const data = chSnap.data() || {};
                  if (data?.content) {
                    content = data.content;
                    if (data?.title && !chapter.title) {
                      chapter.title = data.title;
                    }
                    break;
                  }
                }
              } catch (err) {
                console.warn('[GlobalAudio] Lỗi fetch Firestore chapter:', docId, err);
              }
            }
          }
          if (!isAudioModeRef.current || signal?.aborted) return null;

          if (content && !chapter.content) {
            chapter.content = content;
          }

          const payload = buildChapterSpeechChunks(
            novel.id,
            chapter,
            content,
            CHUNK_MIN_LEN,
            CHUNK_MAX_LEN
          );
          if ((payload.chunks?.length || 0) === 0) return null;

          if (preparedChaptersRef.current.size > 16) {
            const oldestKey = preparedChaptersRef.current.keys().next().value;
            if (oldestKey) preparedChaptersRef.current.delete(oldestKey);
          }
          preparedChaptersRef.current.set(key, payload);
          warmChunks(payload.chunks);
          return payload;
        } catch {
          return null;
        } finally {
          preloadPromisesRef.current.delete(key);
        }
      })();

      preloadPromisesRef.current.set(key, task);
      return task;
    },
    []
  );

  /**
   * TIÊU CHUẨN 2: Tải trước Xuyên Chương (Cross-Chapter Pre-fetching) & Bơm nối tiếp vào Queue:
   * Khi mảng hàng đợi chỉ còn 1-2 chunks cuối của chương hiện tại, âm thầm fetch Chương B từ Firestore,
   * cắt chunk (đã ghép tên chương) và nối tiếp trực tiếp vào chunksRef.current & blobQueueRef.current.
   */
  const appendNextChapterToQueueIfNeeded = useCallback(
    async (sessionNonce: number, signal?: AbortSignal): Promise<boolean> => {
      if (!autoNextRef.current || !isAudioModeRef.current) return false;
      if (sessionNonce !== sessionNonceRef.current || signal?.aborted) return false;

      const curNovel = activeNovelRef.current;
      const currentChunks = Array.isArray(chunksRef.current) ? chunksRef.current : [];
      const tailChunk = currentChunks[(currentChunks?.length || 0) - 1];
      const tailChapter: GlobalAudioChapter | null = tailChunk
        ? {
            id: tailChunk.chapterId,
            number: tailChunk.chapterNumber,
            title: tailChunk.chapterTitle,
            slug: tailChunk.chapterSlug,
          }
        : activeChapterRef.current;

      if (!curNovel || !tailChapter) return false;

      const nextChap = findNextChapterFor(tailChapter);
      if (!nextChap) return false;

      const appendKey = `${sessionNonce}:::${curNovel.id}:::${tailChapter.id}--->${nextChap.id}`;
      if (appendedBoundaryKeysRef.current.has(appendKey)) {
        return true;
      }

      const existingPromise = appendBoundaryPromisesRef.current.get(appendKey);
      if (existingPromise) {
        return existingPromise;
      }

      const task = (async (): Promise<boolean> => {
        try {
          const prepared = await preloadChapterForAudio(curNovel, nextChap, voiceIdRef.current);
          if (
            !prepared ||
            (prepared.chunks?.length || 0) === 0 ||
            sessionNonce !== sessionNonceRef.current ||
            !isAudioModeRef.current ||
            signal?.aborted
          ) {
            return false;
          }

          if (appendedBoundaryKeysRef.current.has(appendKey)) {
            return true;
          }

          const safeExistingChunks = Array.isArray(chunksRef.current) ? chunksRef.current : [];
          const alreadyInQueue = safeExistingChunks.some(
            (c) => c.chapterId === nextChap.id && Number(c.chapterNumber) === Number(nextChap.number)
          );
          if (alreadyInQueue) {
            appendedBoundaryKeysRef.current.add(appendKey);
            return true;
          }

          const baseId =
            (safeExistingChunks?.length || 0) > 0
              ? safeExistingChunks[(safeExistingChunks?.length || 0) - 1].id + 1
              : 0;
          const appendedChunks = (prepared.chunks || []).map((c, idx) => ({
            ...c,
            id: baseId + idx,
          }));

          chunksRef.current = [...safeExistingChunks, ...appendedChunks];
          blobQueueRef.current = [
            ...(blobQueueRef.current || []),
            ...new Array(appendedChunks?.length || 0).fill(null),
          ];
          appendedBoundaryKeysRef.current.add(appendKey);
          return true;
        } catch {
          return false;
        } finally {
          appendBoundaryPromisesRef.current.delete(appendKey);
        }
      })();

      appendBoundaryPromisesRef.current.set(appendKey, task);
      return task;
    },
    [findNextChapterFor, preloadChapterForAudio]
  );

  const preloadNextChapter = useCallback(() => {
    if (!autoNextRef.current || !isAudioModeRef.current) return;
    appendNextChapterToQueueIfNeeded(
      sessionNonceRef.current,
      prefetchAbortRef.current?.signal
    ).catch(() => {});
  }, [appendNextChapterToQueueIfNeeded]);

  useEffect(() => {
    preloadNextChapterRef.current = preloadNextChapter;
  }, [preloadNextChapter]);

  const stopBothAudioElements = useCallback((clearSources: boolean) => {
    activeChunkTokenRef.current = '';
    for (const el of [audioARef.current, audioBRef.current]) {
      if (!el) continue;
      el.onended = null;
      el.onerror = null;
      el.pause();
      el.currentTime = 0;
      if (clearSources) {
        el.src = '';
      }
    }
  }, []);

  const stopPlaybackOnly = useCallback(() => {
    sessionNonceRef.current += 1;
    prefetchGenerationRef.current += 1;
    isPlaybackActiveRef.current = false;
    isAdvancingChapterRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
    setRetryAttempt(0);
    bufferedCountRef.current = 0;
    setBufferedCount(0);
    stopBothAudioElements(false);
    pauseMobileBackgroundSession();
    flushListeningHistoryToFirestore().catch(() => {});
  }, [flushListeningHistoryToFirestore, pauseMobileBackgroundSession, stopBothAudioElements]);

  /**
   * Thoát Audio Mode: dọn dẹp sạch RAM (revoke Blob URLs), hủy mọi request tải ngầm,
   * tắt cả 2 thẻ <audio> A/B và đưa người dùng về chế độ đọc bình thường.
   */
  const cleanupAudioModeAndRam = useCallback(() => {
    sessionNonceRef.current += 1;
    prefetchGenerationRef.current += 1;
    isAudioModeRef.current = false;
    setIsAudioMode(false);
    isPlaybackActiveRef.current = false;
    isAdvancingChapterRef.current = false;

    if (prefetchAbortRef.current) {
      try {
        prefetchAbortRef.current.abort();
      } catch {}
      prefetchAbortRef.current = null;
    }

    setIsPlaying(false);
    setIsLoading(false);
    setRetryAttempt(0);
    bufferedCountRef.current = 0;
    setBufferedCount(0);
    setAudioError(null);
    blobQueueRef.current = [];
    updateProgressBarDomNow(0);

    stopBothAudioElements(true);
    pauseMobileBackgroundSession();
    flushListeningHistoryToFirestore().catch(() => {});

    preparedChaptersRef.current.clear();
    preloadPromisesRef.current.clear();
    appendedBoundaryKeysRef.current.clear();
    appendBoundaryPromisesRef.current.clear();
    revokeAllRamAudioBlobs();
  }, [
    flushListeningHistoryToFirestore,
    pauseMobileBackgroundSession,
    stopBothAudioElements,
    updateProgressBarDomNow,
  ]);

  const closeBar = useCallback(() => {
    cleanupAudioModeAndRam();
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    currentChunkIdxRef.current = -1;
    chunksRef.current = [];
    setParagraphs([]);
    paragraphsRef.current = [];
    setIsBarVisible(false);
    isBarVisibleRef.current = false;
    setIsMinimized(false);
  }, [cleanupAudioModeAndRam]);

  const setAudioMode = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        isAudioModeRef.current = true;
        setIsAudioMode(true);
        if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
          prefetchAbortRef.current = new AbortController();
        }
        setIsBarVisible(true);
        isBarVisibleRef.current = true;
      } else {
        closeBar();
      }
    },
    [closeBar]
  );

  const pause = useCallback(() => {
    isPlaybackActiveRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
    setRetryAttempt(0);
    audioARef.current?.pause();
    audioBRef.current?.pause();
    pauseMobileBackgroundSession();
    // Khóa Write: Ghi tiến độ 1 lần duy nhất khi user pause
    flushListeningHistoryToFirestore().catch(() => {});
  }, [flushListeningHistoryToFirestore, pauseMobileBackgroundSession]);

  const clearAudioError = useCallback(() => {
    setAudioError(null);
  }, []);

  /**
   * HÀNG ĐỢI TUẦN TỰ XUYÊN CHƯƠNG (CROSS-CHAPTER STRICT SEQUENTIAL BLOB QUEUE):
   * - Kiểm tra nếu hàng đợi chỉ còn 1-2 chunks cuối của Chương A -> ngầm fetch Chương B từ Firestore
   *   và bơm nối tiếp vào chunksRef.current + blobQueueRef.current.
   * - Fetch tuần tự từng chunk i+1 -> i+4 (kể cả qua ranh giới chương B) vào blobQueueRef.current[idx].
   * - TUYỆT ĐỐI KHÔNG nạp vào .src của thẻ <audio> trước khi chunk hiện tại bắn sự kiện onended.
   */
  const runSequentialPrefetchQueue = useCallback(
    async (fromChunkIdx: number, voice: string, sessionNonce: number) => {
      if (!isAudioModeRef.current) return;
      const curNovel = activeNovelRef.current;
      const curChapter = activeChapterRef.current;
      if (!curNovel || !curChapter) return;

      const signal = prefetchAbortRef.current?.signal;
      if (signal?.aborted) return;

      const genId = ++prefetchGenerationRef.current;
      let readyInWindow = 0;

      // Điều kiện Gối đầu chương: nếu chỉ còn <= 2 chunks cuối trong hàng đợi -> ngầm fetch & nối Chương B ngay lập tức
      const remainingInQueue = (chunksRef.current?.length || 0) - 1 - fromChunkIdx;
      let crossChapterAppendPromise: Promise<boolean> | null = null;
      if (autoNextRef.current && remainingInQueue <= 2) {
        crossChapterAppendPromise = appendNextChapterToQueueIfNeeded(sessionNonce, signal);
      }

      for (let offset = 1; offset <= PREFETCH_LOOKAHEAD_COUNT; offset++) {
        const targetIdx = fromChunkIdx + offset;

        if (targetIdx >= (chunksRef.current?.length || 0) && autoNextRef.current) {
          if (!crossChapterAppendPromise) {
            crossChapterAppendPromise = appendNextChapterToQueueIfNeeded(sessionNonce, signal);
          }
          await crossChapterAppendPromise;
        }

        const target = (chunksRef.current || [])[targetIdx];
        if (!target) break;

        if (
          genId !== prefetchGenerationRef.current ||
          sessionNonce !== sessionNonceRef.current ||
          !isAudioModeRef.current ||
          signal?.aborted
        ) {
          return;
        }

        if (blobQueueRef.current[targetIdx]) {
          readyInWindow += 1;
          continue;
        }

        try {
          const res = await resolveAndCacheChunkAudio({
            novelId: target.novelId,
            chapterId: target.chapterId,
            chapterNumber: target.chapterNumber,
            chunkIndex: target.chapterChunkIndex,
            text: target.text,
            voiceId: voice,
            signal,
          });

          if (
            genId !== prefetchGenerationRef.current ||
            sessionNonce !== sessionNonceRef.current ||
            !isAudioModeRef.current ||
            signal?.aborted
          ) {
            return;
          }

          if (res.url) {
            blobQueueRef.current[targetIdx] = res.url;
            readyInWindow += 1;
          }
        } catch {
          // Ngừng prefetch khi gặp lỗi để bảo toàn thứ tự Queue; chunk lỗi sẽ được retry 3 lần khi tới lượt phát.
          break;
        }
      }

      if (
        genId === prefetchGenerationRef.current &&
        sessionNonce === sessionNonceRef.current &&
        isAudioModeRef.current &&
        bufferedCountRef.current !== readyInWindow
      ) {
        bufferedCountRef.current = readyInWindow;
        setBufferedCount(readyInWindow);
      }
    },
    [appendNextChapterToQueueIfNeeded]
  );

  const syncSilentChapterTransition = useCallback(
    (novel: GlobalAudioNovel, chunk: SpeechChunk) => {
      const curChap = activeChapterRef.current;
      const isNewChapter =
        !curChap ||
        curChap.id !== chunk.chapterId ||
        Number(curChap.number) !== Number(chunk.chapterNumber);

      if (!isNewChapter) return curChap;

      const matchedFromList = chaptersListRef.current.find(
        (c) => c.id === chunk.chapterId || Number(c.number) === Number(chunk.chapterNumber)
      );
      const nextChapter: GlobalAudioChapter = {
        id: chunk.chapterId,
        number: chunk.chapterNumber,
        title: matchedFromList?.title || chunk.chapterTitle,
        slug: matchedFromList?.slug || chunk.chapterSlug,
        content: matchedFromList?.content,
      };

      activeChapterRef.current = nextChapter;
      setActiveChapter(nextChapter);
      paragraphsRef.current = chunk.chapterParagraphs;
      setParagraphs(chunk.chapterParagraphs);

      // Âm thầm cập nhật URL sang Chương B bằng window.history.pushState mà không làm unmount GlobalAudioPlayer
      if (typeof window !== 'undefined') {
        const novelSlug = (novel.slug && novel.slug.trim()) || novel.id;
        const chapterSlug =
          (nextChapter.slug && nextChapter.slug.trim()) ||
          (nextChapter.number ? `chuong-${nextChapter.number}` : nextChapter.id);
        const nextUrl = `/truyen/${encodeURIComponent(novelSlug)}/chuong/${encodeURIComponent(
          chapterSlug
        )}`;
        if (window.location.pathname !== nextUrl) {
          window.history.pushState(
            {
              novelId: novel.id,
              chapterId: nextChapter.id,
              chapterNumber: nextChapter.number,
            },
            '',
            nextUrl
          );
        }
        document.title = `${formatChapterTitleForTTS(nextChapter)} - ${novel.title} | Đạo Tâm`;
        window.dispatchEvent(
          new CustomEvent('daotam:audio-chapter-changed', {
            detail: { novel, chapter: nextChapter },
          })
        );
      }

      return nextChapter;
    },
    []
  );

  const playChunk = useCallback(
    async (chunkIdx: number) => {
      if (chunkIdx < 0) return;

      if (chunkIdx >= (chunksRef.current?.length || 0) && autoNextRef.current && isAudioModeRef.current) {
        const signal = prefetchAbortRef.current?.signal;
        await appendNextChapterToQueueIfNeeded(sessionNonceRef.current, signal);
      }

      const curChunks = Array.isArray(chunksRef.current) ? chunksRef.current : [];
      if ((curChunks?.length || 0) === 0) {
        setIsPlaying(false);
        setIsLoading(false);
        isPlaybackActiveRef.current = false;
        return;
      }

      if (chunkIdx >= (curChunks?.length || 0)) {
        if (isAdvancingChapterRef.current) return;
        setCurrentIndex(-1);
        currentIndexRef.current = -1;
        currentChunkIdxRef.current = -1;
        blobQueueRef.current = [];
        updateProgressBarDomNow(100);

        if (autoNextRef.current && isAudioModeRef.current) {
          isAdvancingChapterRef.current = true;
          await playNextChapterRef.current();
        } else {
          setIsPlaying(false);
          setIsLoading(false);
          isPlaybackActiveRef.current = false;
          pauseMobileBackgroundSession();
        }
        return;
      }

      const chunk = curChunks[chunkIdx];
      const curNovel = activeNovelRef.current;
      if (!curNovel) return;

      if (!isAudioModeRef.current) {
        isAudioModeRef.current = true;
        setIsAudioMode(true);
      }

      if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
        prefetchAbortRef.current = new AbortController();
      }
      const abortSignal = prefetchAbortRef.current.signal;

      const nonce = sessionNonceRef.current;
      const chunkToken = `${nonce}:::${chunkIdx}:::${Date.now()}`;
      activeChunkTokenRef.current = chunkToken;

      const voice = voiceIdRef.current;
      currentChunkIdxRef.current = chunkIdx;
      const highlightIdx = chunk.paraIndex >= 0 ? chunk.paraIndex : 0;
      currentIndexRef.current = highlightIdx;
      setCurrentIndex(highlightIdx);
      setAudioError(null);
      setRetryAttempt(0);

      // Kích hoạt ngầm Cross-Chapter Pre-fetch ngay khi chạm 1-2 chunks cuối của hàng đợi hiện tại
      if (autoNextRef.current && (curChunks?.length || 0) - 1 - chunkIdx <= 2) {
        appendNextChapterToQueueIfNeeded(nonce, abortSignal).catch(() => {});
      }

      try {
        // 1. Lấy Blob từ Hàng đợi tuần tự hoặc RAM cache (theo đúng chapterId & chapterChunkIndex của chunk)
        let audioUrl =
          blobQueueRef.current[chunkIdx] ||
          getCachedChunkAudioSync(
            chunk.novelId,
            chunk.chapterId,
            voice,
            chunk.chapterChunkIndex,
            chunk.chapterNumber
          ) ||
          undefined;

        if (audioUrl && !audioUrl.startsWith('blob:')) {
          preloadRemoteUrlInBrowser(audioUrl);
        }

        // 2. Nếu chưa có trong RAM Queue: fetch kèm Retry 3 lần tại ĐÚNG chunkIdx (TUYỆT ĐỐI KHÔNG nhảy cóc)
        if (!audioUrl) {
          setIsLoading(true);
          const resolved = await resolveAndCacheChunkAudio({
            novelId: chunk.novelId,
            chapterId: chunk.chapterId,
            chapterNumber: chunk.chapterNumber,
            chunkIndex: chunk.chapterChunkIndex,
            text: chunk.text,
            voiceId: voice,
            signal: abortSignal,
            onRetryAttempt: (attempt) => {
              if (nonce === sessionNonceRef.current && activeChunkTokenRef.current === chunkToken) {
                setRetryAttempt(attempt);
              }
            },
          });
          audioUrl = resolved.url;
          if (audioUrl) {
            blobQueueRef.current[chunkIdx] = audioUrl;
          }
        }

        if (
          nonce !== sessionNonceRef.current ||
          activeChunkTokenRef.current !== chunkToken ||
          !isPlaybackActiveRef.current ||
          !isAudioModeRef.current ||
          currentChunkIdxRef.current !== chunkIdx
        ) {
          setIsLoading(false);
          setRetryAttempt(0);
          return;
        }

        // 3. CHỈ nạp vào thẻ <audio> Ping-Pong tại thời điểm phát (sau khi chunk trước đã bắn onended)
        const targetSlot: 'A' | 'B' = activeSlotRef.current === 'A' ? 'B' : 'A';
        const targetAudio = getAudioBySlot(targetSlot) || getActiveAudio();
        if (!targetAudio || !audioUrl) return;

        const prevSlot: 'A' | 'B' = targetSlot === 'A' ? 'B' : 'A';
        const prevAudio = getAudioBySlot(prevSlot);
        if (prevAudio) {
          prevAudio.onended = null;
          prevAudio.onerror = null;
          prevAudio.pause();
        }

        targetAudio.onended = null;
        targetAudio.onerror = null;
        targetAudio.src = audioUrl;
        targetAudio.playbackRate = playbackRateRef.current;

        activeSlotRef.current = targetSlot;
        setIsLoading(false);
        setRetryAttempt(0);

        // Nạp tuần tự 4 chunks kế tiếp vào RAM Queue (tự động nối tiếp sang Chương B nếu sắp hết Chương A)
        runSequentialPrefetchQueue(chunkIdx, voice, nonce).catch(() => {});

        // CHỈ kích hoạt nạp & phát chunk tiếp theo khi chunk hiện tại bắn sự kiện onended
        targetAudio.onended = () => {
          targetAudio.onended = null;
          if (
            nonce !== sessionNonceRef.current ||
            activeChunkTokenRef.current !== chunkToken ||
            !isPlaybackActiveRef.current ||
            !isAudioModeRef.current ||
            currentChunkIdxRef.current !== chunkIdx
          ) {
            return;
          }

          const upcomingChunk = chunksRef.current[chunkIdx + 1];
          const curActiveChap = activeChapterRef.current;
          if (
            upcomingChunk &&
            curActiveChap &&
            (upcomingChunk.chapterId !== curActiveChap.id ||
              Number(upcomingChunk.chapterNumber) !== Number(curActiveChap.number)) &&
            !autoNextRef.current
          ) {
            setIsPlaying(false);
            setIsLoading(false);
            isPlaybackActiveRef.current = false;
            updateProgressBarDomNow(100);
            pauseMobileBackgroundSession();
            return;
          }

          playChunkRef.current(chunkIdx + 1);
        };

        // Nếu phát lỗi: dừng lại ở chunk hiện tại, TUYỆT ĐỐI không bỏ qua nhảy sang chunk sau
        targetAudio.onerror = () => {
          if (
            nonce !== sessionNonceRef.current ||
            activeChunkTokenRef.current !== chunkToken ||
            !isPlaybackActiveRef.current ||
            !isAudioModeRef.current
          ) {
            return;
          }
          setIsLoading(false);
          setIsPlaying(false);
          isPlaybackActiveRef.current = false;
          setAudioError(
            `Không thể phát đoạn ${chunk.chapterChunkIndex + 1}. Nhấn Phát để thử lại.`
          );
        };

        await targetAudio.play();
        if (
          nonce === sessionNonceRef.current &&
          activeChunkTokenRef.current === chunkToken &&
          isAudioModeRef.current
        ) {
          isPlaybackActiveRef.current = true;
          setIsPlaying(true);
          setIsLoading(false);

          // Khi chunk đầu tiên của Chương B bắt đầu được phát:
          // Âm thầm cập nhật URL trình duyệt (window.history.pushState) + UI Player + MediaSession
          const effectiveChapter = syncSilentChapterTransition(curNovel, chunk);
          if (effectiveChapter) {
            syncMobileBackgroundSession(curNovel, effectiveChapter);
            scheduleListeningHistorySync(curNovel, effectiveChapter, chunk.chapterChunkIndex);
          }
          updateProgressBarDomNow();
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || !isAudioModeRef.current) {
          return;
        }
        console.warn(`[GlobalAudio] Lỗi tải chunk #${chunkIdx} sau khi thử lại 3 lần:`, err);
        if (nonce === sessionNonceRef.current && activeChunkTokenRef.current === chunkToken) {
          setIsLoading(false);
          setRetryAttempt(0);
          setIsPlaying(false);
          isPlaybackActiveRef.current = false;
          setAudioError(
            `Kết nối giọng đọc bị gián đoạn tại đoạn ${chunk.chapterChunkIndex + 1} sau 3 lần thử. Nhấn Phát để tiếp tục.`
          );
        }
      }
    },
    [
      appendNextChapterToQueueIfNeeded,
      getActiveAudio,
      getAudioBySlot,
      pauseMobileBackgroundSession,
      runSequentialPrefetchQueue,
      scheduleListeningHistorySync,
      syncMobileBackgroundSession,
      syncSilentChapterTransition,
      updateProgressBarDomNow,
    ]
  );

  useEffect(() => {
    playChunkRef.current = playChunk;
  }, [playChunk]);

  const playChapterInternal = useCallback(
    async (
      novel: GlobalAudioNovel,
      chapter: GlobalAudioChapter,
      chapters?: GlobalAudioChapter[],
      options?: {
        startIndex?: number;
        autoStart?: boolean;
        userExplicit?: boolean;
        isAutoAdvance?: boolean;
      }
    ) => {
      const key = makeChapterCacheKey(novel.id, chapter.id);
      if (
        !options?.userExplicit &&
        !options?.isAutoAdvance &&
        inFlightChapterKeyRef.current === key
      ) {
        return;
      }
      inFlightChapterKeyRef.current = key;

      const nonce = ++sessionNonceRef.current;
      isAdvancingChapterRef.current = false;
      appendedBoundaryKeysRef.current.clear();
      appendBoundaryPromisesRef.current.clear();
      const isAutoAdvance = Boolean(options?.isAutoAdvance);
      const shouldAutoStart = options?.autoStart ?? true;

      if (shouldAutoStart || options?.userExplicit) {
        isAudioModeRef.current = true;
        setIsAudioMode(true);
        resetPrefetchAbortController();
      }

      if (!isAutoAdvance) {
        stopBothAudioElements(false);
      }

      setAudioError(null);
      setRetryAttempt(0);
      setActiveNovel(novel);
      setActiveChapter(chapter);
      activeNovelRef.current = novel;
      activeChapterRef.current = chapter;

      if (Array.isArray(chapters) && (chapters?.length || 0) > 0) {
        const sorted = [...chapters].sort((a, b) => (a.number || 0) - (b.number || 0));
        setChaptersList(sorted);
        chaptersListRef.current = sorted;
      }

      if (options?.userExplicit || shouldAutoStart || isBarVisibleRef.current) {
        setIsBarVisible(true);
        isBarVisibleRef.current = true;
      }

      try {
        const chapterAudioState = await ensureChapterAudioCacheLoaded(
          novel.id,
          chapter.id,
          chapter.number
        );
        if (nonce !== sessionNonceRef.current) return;

        let prepared = preparedChaptersRef.current.get(key);
        if (!prepared) {
          const pending = preloadPromisesRef.current.get(key);
          if (pending) {
            prepared = (await pending) || undefined;
          }
        }

        if (!prepared) {
          let content = chapter.content || chapterAudioState.content || '';
          if (
            (!content || content.trim().length < 5) &&
            !fetchedChapterContentKeysRef.current.has(key)
          ) {
            fetchedChapterContentKeysRef.current.add(key);
            setIsLoading(true);
            const candidateIds = Array.from(
              new Set([
                chapter.id,
                `chuong-${chapter.number}`,
                String(chapter.number),
              ].filter(Boolean))
            );
            for (const docId of candidateIds) {
              try {
                const chSnap = await getDoc(doc(db, 'novels', novel.id, 'chapters', docId));
                if (nonce !== sessionNonceRef.current) return;
                if (chSnap.exists()) {
                  const data = chSnap.data() || {};
                  if (data?.content) {
                    content = data.content;
                    chapter.content = data.content;
                    if (data?.title && !chapter.title) {
                      chapter.title = data.title;
                    }
                    break;
                  }
                }
              } catch (err) {
                console.warn('[GlobalAudio] Lỗi tải nội dung chương:', docId, err);
              }
            }
          } else if (content && !chapter.content) {
            chapter.content = content;
          }
          if (nonce !== sessionNonceRef.current) return;

          prepared = buildChapterSpeechChunks(
            novel.id,
            chapter,
            content,
            CHUNK_MIN_LEN,
            CHUNK_MAX_LEN
          );
          if ((prepared.chunks?.length || 0) > 0) {
            preparedChaptersRef.current.set(key, prepared);
          }
        }

        if (nonce !== sessionNonceRef.current) return;

        const safeChunks = Array.isArray(prepared?.chunks) ? prepared.chunks : [];
        const safeParagraphs = Array.isArray(prepared?.paragraphs) ? prepared.paragraphs : [];
        blobQueueRef.current = new Array(safeChunks?.length || 0).fill(null);
        setParagraphs(safeParagraphs);
        paragraphsRef.current = safeParagraphs;
        chunksRef.current = safeChunks;

        const startParaIdx = options?.startIndex ?? 0;
        let startChunkIdx = 0;
        if (startParaIdx > 0) {
          const found = safeChunks.findIndex((c) => c.paraIndex >= startParaIdx);
          if (found >= 0) startChunkIdx = found;
        }

        setCurrentIndex(startParaIdx);
        currentIndexRef.current = startParaIdx;
        currentChunkIdxRef.current = startChunkIdx;

        if (shouldAutoStart && (safeChunks?.length || 0) > 0) {
          isPlaybackActiveRef.current = true;
          setIsPlaying(true);
          syncMobileBackgroundSession(novel, chapter);
          await playChunkRef.current(startChunkIdx);
        } else {
          pause();
        }
      } finally {
        if (inFlightChapterKeyRef.current === key) {
          inFlightChapterKeyRef.current = null;
        }
      }
    },
    [pause, resetPrefetchAbortController, stopBothAudioElements, syncMobileBackgroundSession]
  );

  const playChapter = useCallback(
    (
      novel: GlobalAudioNovel,
      chapter: GlobalAudioChapter,
      chapters?: GlobalAudioChapter[],
      options?: { startIndex?: number; autoStart?: boolean; userExplicit?: boolean }
    ) => playChapterInternal(novel, chapter, chapters, options),
    [playChapterInternal]
  );

  const playNextChapter = useCallback(async () => {
    if (!isAudioModeRef.current) {
      isAdvancingChapterRef.current = false;
      pause();
      return;
    }

    const curNovel = activeNovelRef.current;
    const curChapter = activeChapterRef.current;
    const list = Array.isArray(chaptersListRef.current) ? chaptersListRef.current : [];

    if (!curNovel || !curChapter) {
      isAdvancingChapterRef.current = false;
      pause();
      return;
    }

    const curIdx = list.findIndex(
      (c) => c.id === curChapter.id || Number(c.number) === Number(curChapter.number)
    );

    let nextChap: GlobalAudioChapter | null = null;
    if (curIdx >= 0 && curIdx < (list?.length || 0) - 1) {
      nextChap = list[curIdx + 1];
    } else if (curIdx === -1) {
      const nextNum = (curChapter.number || 1) + 1;
      nextChap = {
        id: `chuong-${nextNum}`,
        number: nextNum,
        title: `Chương ${nextNum}`,
        slug: `chuong-${nextNum}`,
      };
    }

    if (!nextChap) {
      isAdvancingChapterRef.current = false;
      pause();
      return;
    }

    await playChapterInternal(curNovel, nextChap, list, {
      startIndex: 0,
      autoStart: true,
      isAutoAdvance: true,
    });
  }, [pause, playChapterInternal]);

  useEffect(() => {
    playNextChapterRef.current = playNextChapter;
  }, [playNextChapter]);

  const resume = useCallback(async () => {
    if ((chunksRef.current?.length || 0) === 0) return;
    setAudioError(null);
    isAudioModeRef.current = true;
    setIsAudioMode(true);
    if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
      prefetchAbortRef.current = new AbortController();
    }
    isPlaybackActiveRef.current = true;

    const targetChunkIdx = currentChunkIdxRef.current >= 0 ? currentChunkIdxRef.current : 0;
    const activeAudio = getActiveAudio();
    if (activeAudio && activeAudio.src && !activeAudio.ended && !activeAudio.error) {
      try {
        await activeAudio.play();
        setIsPlaying(true);
        if (activeNovelRef.current && activeChapterRef.current) {
          syncMobileBackgroundSession(activeNovelRef.current, activeChapterRef.current);
        }
        return;
      } catch {}
    }
    await playChunkRef.current(targetChunkIdx);
  }, [getActiveAudio, syncMobileBackgroundSession]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const seekToParagraph = useCallback(async (paraIndex: number) => {
    if (paraIndex < 0 || paraIndex >= (paragraphsRef.current?.length || 0)) return;
    const activeChapId = activeChapterRef.current?.id;
    const targetChunkIdx = (chunksRef.current || []).findIndex(
      (c) => (!activeChapId || c.chapterId === activeChapId) && c.paraIndex >= paraIndex
    );
    isAudioModeRef.current = true;
    setIsAudioMode(true);
    if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
      prefetchAbortRef.current = new AbortController();
    }
    isPlaybackActiveRef.current = true;
    isAdvancingChapterRef.current = false;
    await playChunkRef.current(targetChunkIdx >= 0 ? targetChunkIdx : 0);
  }, []);

  const skipNext = useCallback(async () => {
    const nextChunkIdx = currentChunkIdxRef.current + 1;
    if (nextChunkIdx < (chunksRef.current?.length || 0)) {
      isAudioModeRef.current = true;
      setIsAudioMode(true);
      isPlaybackActiveRef.current = true;
      isAdvancingChapterRef.current = false;
      await playChunkRef.current(nextChunkIdx);
    } else if (autoNextRef.current) {
      await playNextChapterRef.current();
    }
  }, []);

  const skipPrev = useCallback(async () => {
    const prevChunkIdx = Math.max(0, currentChunkIdxRef.current - 1);
    isAudioModeRef.current = true;
    setIsAudioMode(true);
    isPlaybackActiveRef.current = true;
    isAdvancingChapterRef.current = false;
    await playChunkRef.current(prevChunkIdx);
  }, []);

  useEffect(() => {
    skipNextRef.current = skipNext;
    skipPrevRef.current = skipPrev;
  }, [skipNext, skipPrev]);

  const setVoiceId = useCallback((voice: 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural') => {
    setVoiceIdState(voice);
    voiceIdRef.current = voice;
    blobQueueRef.current = new Array(chunksRef.current?.length || 0).fill(null);
    prefetchGenerationRef.current += 1;

    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('daotam_reader_settings');
        const parsed = saved ? JSON.parse(saved) : {};
        window.localStorage.setItem(
          'daotam_reader_settings',
          JSON.stringify({ ...parsed, selectedVoiceId: voice })
        );
      } catch {}
    }

    preloadNextChapterRef.current();

    if (isPlaybackActiveRef.current && currentChunkIdxRef.current >= 0) {
      playChunkRef.current(currentChunkIdxRef.current);
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    playbackRateRef.current = rate;
    if (audioARef.current) audioARef.current.playbackRate = rate;
    if (audioBRef.current) audioBRef.current.playbackRate = rate;
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('daotam_reader_settings');
        const parsed = saved ? JSON.parse(saved) : {};
        window.localStorage.setItem(
          'daotam_reader_settings',
          JSON.stringify({ ...parsed, voiceSpeed: rate })
        );
      } catch {}
    }
  }, []);

  const setAutoNext = useCallback((auto: boolean) => {
    setAutoNextState(auto);
    autoNextRef.current = auto;
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('daotam_reader_settings');
        const parsed = saved ? JSON.parse(saved) : {};
        window.localStorage.setItem(
          'daotam_reader_settings',
          JSON.stringify({ ...parsed, autoNextChapter: auto })
        );
      } catch {}
    }
    if (auto && isAudioModeRef.current) {
      preloadNextChapterRef.current();
    }
  }, []);

  const safeParagraphsList = Array.isArray(paragraphs) ? paragraphs : [];
  const progress =
    (safeParagraphsList?.length || 0) > 0 && currentIndex >= 0
      ? Math.round(((currentIndex + 1) / (safeParagraphsList?.length || 1)) * 100)
      : 0;

  const currentText =
    currentIndex >= 0 && currentIndex < (safeParagraphsList?.length || 0)
      ? safeParagraphsList[currentIndex]
      : '';

  return (
    <AudioContext.Provider
      value={{
        activeNovel: isMounted ? activeNovel : null,
        activeChapter: isMounted ? activeChapter : null,
        chaptersList,
        paragraphs,
        currentIndex,
        isAudioMode: isMounted && isAudioMode,
        isPlaying,
        isLoading,
        retryAttempt,
        bufferedCount,
        audioError,
        voiceId,
        playbackRate,
        autoNext,
        isBarVisible: isMounted && isBarVisible,
        isMinimized,
        progress,
        currentText,
        registerProgressBarRef,
        playChapter,
        setAudioMode,
        togglePlay,
        pause,
        resume,
        skipNext,
        skipPrev,
        seekToParagraph,
        setVoiceId,
        setPlaybackRate,
        setAutoNext,
        setIsMinimized,
        clearAudioError,
        closeBar,
        stopForManualChapterChange: stopPlaybackOnly,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useGlobalAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error('useGlobalAudio phải được dùng bên trong AudioProvider');
  }
  return ctx;
}

export const useAudio = useGlobalAudio;
