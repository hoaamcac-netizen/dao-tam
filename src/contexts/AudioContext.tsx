import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Chapter, Novel, ReadingProgress, UserProfile } from '../types';
import {
  AudioChunk,
  DEFAULT_CHUNK_MAX_LENGTH,
  DEFAULT_CHUNK_MIN_LENGTH,
  DEFAULT_FIRST_CHUNK_MAX_LENGTH,
  DEFAULT_FIRST_CHUNK_MIN_LENGTH,
  MAX_BLOB_CACHE_ENTRIES,
  SKIPPED_TTS_CHUNK_URL,
  TTS_FETCH_TIMEOUT_MS,
  TTS_MAX_RETRIES,
  chunkChapterContent,
  cleanTextForTTS,
  fetchTtsAudioBlobWithWatchdog,
  seamlessAudioCache,
} from '../utils/audioChunker';
import { backgroundAudioManager } from '../utils/backgroundAudio';
import {
  normalizeEdgeVoiceId,
  isDeviceFallbackVoice,
  getMatchingBrowserVoice,
} from '../utils/rulesAndVoices';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';
import { fetchFullChapterContent, updateUserState } from '../firebase/services';
import { useAuth } from './AuthContext';

const CHUNK_MIN_LEN = DEFAULT_CHUNK_MIN_LENGTH; // 400 ký tự
const CHUNK_MAX_LEN = DEFAULT_CHUNK_MAX_LENGTH; // 500 ký tự
const PREFETCH_LOOKAHEAD_COUNT = 4; // Tải trước song song 4 đoạn tiếp theo dưới dạng Blob URL
const HARD_MAX_BLOB_CACHE = MAX_BLOB_CACHE_ENTRIES; // Giới hạn cứng 8 đoạn trong bộ nhớ đệm
const STALL_WATCHDOG_MS = 12000; // Watchdog kiểm tra đứng hình thực sự (không false-positive khi tắt màn hình)
const LISTENING_PROGRESS_STORAGE_KEY = 'daotam_listening_progress';
const LISTENING_CHUNK_MAP_STORAGE_KEY = 'daotam_listening_chunk_map';

interface QueuedAudioChunk extends AudioChunk {
  novelId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterSlug?: string;
  chapterChunkIndex: number;
  chapterTotalChunks: number;
}

function formatChapterTitleForTTS(chapter: { number: number; title?: string }): string {
  const raw = (chapter.title || '').trim();
  if (!raw) return `Chương ${chapter.number}`;
  if (/^chương\s+\d+/i.test(raw)) return raw;
  return `Chương ${chapter.number}: ${raw}`;
}

function makeQueuedChunkBlobKey(chunk: QueuedAudioChunk, voice: string): string {
  return `${chunk.novelId}:::${chunk.chapterId}:::${chunk.chapterNumber}:::${chunk.chapterChunkIndex}:::${voice}`;
}

/**
 * Ghép tên chương vào đầu văn bản:
 * - Đoạn đầu tiên (chunk 0) cắt ngắn 150 - 250 ký tự để máy chủ tạo giọng và phát tiếng ngay lập tức.
 * - Các đoạn tiếp theo gộp 250 - 350 ký tự theo dấu câu/xuống dòng, đọc mượt ở tốc độ 2x và không bị Edge TTS ngắt giữa chừng.
 */
function buildChapterQueuedChunks(
  novelId: string,
  chapter: Chapter,
  chapterContent: string
): QueuedAudioChunk[] {
  if (!chapterContent || !chapterContent.trim()) return [];
  const rawTitle = cleanTextForTTS(formatChapterTitleForTTS(chapter)).replace(/[.?!…]+$/, '');
  const chapterTitle = rawTitle || `Chương ${chapter.number}`;
  const fullTextToRead = chapterTitle + '.\n\n' + chapterContent;
  const parsed = chunkChapterContent(
    fullTextToRead,
    CHUNK_MIN_LEN,
    CHUNK_MAX_LEN,
    DEFAULT_FIRST_CHUNK_MIN_LENGTH,
    DEFAULT_FIRST_CHUNK_MAX_LENGTH
  );
  const total = parsed?.length || 0;
  return (parsed || []).map((c, idx) => ({
    ...c,
    id: idx,
    novelId,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title || chapterTitle,
    chapterSlug: chapter.slug,
    chapterChunkIndex: idx,
    chapterTotalChunks: total,
  }));
}

export interface AudioContextType {
  activeNovel: Novel | null;
  activeChapter: Chapter | null;
  isAudioMode: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  retryAttempt: number;
  bufferedCount: number;
  audioError: string | null;
  currentChunkIndex: number;
  totalChunks: number;
  chunks: AudioChunk[];
  currentChunk: AudioChunk | null;
  currentChunkText: string;
  voiceId: string;
  playbackRate: number;
  progress: number;
  autoNext: boolean;
  isBarVisible: boolean;
  isMinimized: boolean;
  registerProgressBarRef: (el: HTMLDivElement | null) => void;
  playChapter: (
    novel: Novel,
    chapter: Chapter,
    autoStart?: boolean,
    chapterList?: Chapter[],
    userExplicitAction?: boolean,
    options?: { isAutoAdvance?: boolean; startChunkIndex?: number }
  ) => Promise<void>;
  setAudioMode: (enabled: boolean) => void;
  togglePlay: () => void;
  play: (startIndex?: number) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  skipNext: () => Promise<void>;
  skipPrev: () => Promise<void>;
  seekToChunk: (index: number) => Promise<void>;
  setVoiceId: (voice: string) => void;
  setPlaybackRate: (rate: number) => void;
  setAutoNext: (auto: boolean) => void;
  setIsBarVisible: (visible: boolean) => void;
  setIsMinimized: (minimized: boolean) => void;
  clearAudioError: () => void;
  closeBar: () => void;
  playNextChapter: () => Promise<void>;
  playPrevChapter: () => Promise<void>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, setUser } = useAuth();
  const userRef = useRef<UserProfile | null>(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const lastSyncedDbSignatureRef = useRef<string>('');

  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [activeNovel, setActiveNovel] = useState<Novel | null>(null);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [chaptersList, setChaptersList] = useState<Chapter[]>([]);
  const [chunks, setChunks] = useState<QueuedAudioChunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(-1);
  const [isAudioMode, setIsAudioMode] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [bufferedCount, setBufferedCount] = useState<number>(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [voiceId, setVoiceIdState] = useState<string>('vi-VN-HoaiMyNeural');
  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [autoNext, setAutoNextState] = useState<boolean>(true);
  const [isBarVisible, setIsBarVisibleState] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const setIsBarVisible = useCallback((visible: boolean) => {
    setIsBarVisibleState(visible);
    safeSetItem('daotam_audio_bar_visible', visible ? 'true' : 'false');
    if (!visible) {
      safeSetItem('daotam_audio_active', 'false');
    }
  }, []);

  // Cờ chống chạy lặp useEffect
  const hasRestoredSettingsRef = useRef<boolean>(false);
  const hasInitializedAudioRef = useRef<boolean>(false);

  // DUY NHẤT 1 thẻ <audio> cố định cho toàn bộ chương & giữ khóa tốc độ 2x khi chạy nền
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeChunkTokenRef = useRef<string>('');
  const activeBlobKeyRef = useRef<string | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);

  // Watchdog chống treo / đơ mạng nền khi phát audio (5s)
  const stallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMediaTimeRef = useRef<number>(0);
  const lastMediaAdvanceAtRef = useRef<number>(0);

  // Bộ nhớ đệm RAM giới hạn cứng tối đa 5 Blob URL tại mọi thời điểm
  const blobCacheMapRef = useRef<Map<string, string>>(new Map());
  const inFlightFetchMapRef = useRef<Map<string, Promise<string>>>(new Map());

  // Hàng đợi nối tiếp xuyên chương (Cross-Chapter Queue)
  const queueChunksRef = useRef<QueuedAudioChunk[]>([]);
  const activeQueueIndexRef = useRef<number>(-1);
  const prefetchGenerationRef = useRef<number>(0);
  const bufferedCountRef = useRef<number>(0);

  // Ref cập nhật Progress Bar mượt 60fps qua requestAnimationFrame (ZERO setState trong timeupdate/rAF)
  const progressBarElRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const isAudioModeRef = useRef<boolean>(false);
  const isPlaybackActiveRef = useRef<boolean>(false);
  const currentChunkIndexRef = useRef<number>(-1);
  const chunksRef = useRef<QueuedAudioChunk[]>([]);
  const voiceIdRef = useRef<string>('vi-VN-HoaiMyNeural');
  const playbackRateRef = useRef<number>(1.0);
  const autoNextRef = useRef<boolean>(true);
  const activeNovelRef = useRef<Novel | null>(null);
  const activeChapterRef = useRef<Chapter | null>(null);
  const chaptersListRef = useRef<Chapter[]>([]);
  const isBarVisibleRef = useRef<boolean>(false);
  const audioErrorRef = useRef<string | null>(null);
  const playSessionNonceRef = useRef<number>(0);
  const isAdvancingChapterRef = useRef<boolean>(false);
  const consecutiveChunkErrorsRef = useRef<number>(0);

  // Refs cho giọng dự phòng trên thiết bị (window.speechSynthesis)
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preparedChaptersRef = useRef<Map<string, QueuedAudioChunk[]>>(new Map());
  const preloadPromisesRef = useRef<Map<string, Promise<QueuedAudioChunk[]>>>(new Map());
  const appendedBoundaryKeysRef = useRef<Set<string>>(new Set());
  const appendBoundaryPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const inFlightChapterLoadKeyRef = useRef<string | null>(null);

  const playChunkRef = useRef<(queueIndex: number) => Promise<void>>(async () => {});
  const playNextChapterRef = useRef<() => Promise<void>>(async () => {});
  const skipNextRef = useRef<() => Promise<void>>(async () => {});
  const skipPrevRef = useRef<() => Promise<void>>(async () => {});
  const pauseRef = useRef<() => void>(() => {});
  const resumeRef = useRef<() => Promise<void>>(async () => {});
  const preloadNextChapterRef = useRef<() => void>(() => {});

  const safeRevokeBlobUrl = useCallback((url?: string | null) => {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  }, []);

  /**
   * MEMORY LEAK PROTECTION:
   * - Xóa ngay 1 đoạn khỏi Map & gọi URL.revokeObjectURL(url)
   */
  const revokeChunkBlobFromCache = useCallback(
    (key: string) => {
      const url = blobCacheMapRef.current.get(key);
      blobCacheMapRef.current.delete(key);
      if (url) {
        safeRevokeBlobUrl(url);
      }
      if (activeBlobKeyRef.current === key) {
        if (activeBlobUrlRef.current && activeBlobUrlRef.current !== url) {
          safeRevokeBlobUrl(activeBlobUrlRef.current);
        }
        activeBlobKeyRef.current = null;
        activeBlobUrlRef.current = null;
      }
    },
    [safeRevokeBlobUrl]
  );

  /**
   * MEMORY LEAK PROTECTION:
   * - Giới hạn cứng bộ nhớ đệm tối đa 5 đoạn tại bất kỳ thời điểm nào
   * - Không bao giờ revoke nhầm đoạn đang phát (protectedKey)
   */
  const setChunkBlobWithHardLimit = useCallback(
    (key: string, blobUrl: string, protectedKey?: string) => {
      const map = blobCacheMapRef.current;
      if (map.has(key)) {
        const existing = map.get(key);
        if (existing && existing !== blobUrl) {
          safeRevokeBlobUrl(existing);
        }
        map.delete(key);
      }

      while (map.size >= HARD_MAX_BLOB_CACHE) {
        let evictKey: string | undefined;
        for (const candidate of map.keys()) {
          if (candidate !== protectedKey && candidate !== activeBlobKeyRef.current && candidate !== key) {
            evictKey = candidate;
            break;
          }
        }
        if (!evictKey) {
          for (const candidate of map.keys()) {
            if (candidate !== key) {
              evictKey = candidate;
              break;
            }
          }
        }
        if (!evictKey) break;

        const evictedUrl = map.get(evictKey);
        map.delete(evictKey);
        safeRevokeBlobUrl(evictedUrl);
      }

      map.set(key, blobUrl);
    },
    [safeRevokeBlobUrl]
  );

  /**
   * MEMORY LEAK PROTECTION:
   * - Giải phóng toàn bộ Blob URLs đang tồn tại trong RAM khi chuyển chương / dừng hẳn / unmount
   */
  const revokeAllBlobUrls = useCallback(() => {
    for (const url of blobCacheMapRef.current.values()) {
      safeRevokeBlobUrl(url);
    }
    blobCacheMapRef.current.clear();
    inFlightFetchMapRef.current.clear();
    if (activeBlobUrlRef.current) {
      safeRevokeBlobUrl(activeBlobUrlRef.current);
    }
    activeBlobKeyRef.current = null;
    activeBlobUrlRef.current = null;
    seamlessAudioCache.clear();
  }, [safeRevokeBlobUrl]);

  const pruneBlobsOutsideWindow = useCallback(
    (fromQueueIdx: number, voice: string) => {
      const keepKeys = new Set<string>();
      if (activeBlobKeyRef.current) keepKeys.add(activeBlobKeyRef.current);
      const queue = queueChunksRef.current || [];
      for (let offset = 0; offset <= PREFETCH_LOOKAHEAD_COUNT; offset++) {
        const chunk = queue[fromQueueIdx + offset];
        if (chunk) {
          keepKeys.add(makeQueuedChunkBlobKey(chunk, voice));
        }
      }

      for (const [k, url] of Array.from(blobCacheMapRef.current.entries())) {
        if (!keepKeys.has(k)) {
          blobCacheMapRef.current.delete(k);
          safeRevokeBlobUrl(url);
        }
      }
    },
    [safeRevokeBlobUrl]
  );

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

  /**
   * QUOTA RULE:
   * - Trong suốt quá trình phát từng đoạn, CHỈ ghi tiến độ vào localStorage (0 lượt ghi DB).
   * - Chỉ đồng bộ (ghi) lên Database khi người dùng bấm Tạm dừng hoặc chuyển sang chương mới.
   */
  const saveListeningProgressLocal = useCallback(
    (novel: Novel | null, chapter: Chapter | null, chunkIdx: number) => {
      if (!novel || !chapter || chunkIdx < 0) return;
      const audio = audioRef.current;
      const liveCurrentTime =
        audio && Number.isFinite(audio.currentTime) ? Math.floor(audio.currentTime) : 0;
      const payload = {
        novelId: novel.id,
        novelTitle: novel.title,
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        chunkIndex: chunkIdx,
        currentTime: liveCurrentTime,
        updatedAt: Date.now(),
      };
      try {
        safeSetItem(LISTENING_PROGRESS_STORAGE_KEY, JSON.stringify(payload));
        const rawMap = safeGetItem(LISTENING_CHUNK_MAP_STORAGE_KEY);
        const parsedMap: Record<string, { chunkIndex: number; updatedAt: number }> = rawMap
          ? JSON.parse(rawMap)
          : {};
        const entryKey = `${novel.id}:::${chapter.id}`;
        delete parsedMap[entryKey];
        parsedMap[entryKey] = { chunkIndex: chunkIdx, updatedAt: Date.now() };
        const keys = Object.keys(parsedMap);
        while (keys.length > 30) {
          const oldest = keys.shift();
          if (oldest) delete parsedMap[oldest];
        }
        safeSetItem(LISTENING_CHUNK_MAP_STORAGE_KEY, JSON.stringify(parsedMap));
      } catch {}
    },
    []
  );

  const syncListeningProgressToDatabase = useCallback(
    (novel: Novel | null, chapter: Chapter | null, chunkIdx: number) => {
      if (!novel || !chapter) return;
      const safeChunkIdx = Math.max(0, chunkIdx);
      saveListeningProgressLocal(novel, chapter, safeChunkIdx);

      const currentUser = userRef.current;
      if (!currentUser || !currentUser.isLoggedIn || !currentUser.id || currentUser.id === 'guest') {
        return;
      }

      const syncSig = `${currentUser.id}:::${novel.id}:::${chapter.id}:::${safeChunkIdx}`;
      if (lastSyncedDbSignatureRef.current === syncSig) {
        return;
      }
      lastSyncedDbSignatureRef.current = syncSig;

      const total =
        (chunksRef.current || []).length ||
        (queueChunksRef.current || []).filter(
          (c) => c.chapterId === chapter.id && Number(c.chapterNumber) === Number(chapter.number)
        ).length ||
        1;
      const scrollPercentage = Math.min(
        100,
        Math.max(0, Math.round(((safeChunkIdx + 1) / Math.max(1, total)) * 100))
      );

      const progressEntry: ReadingProgress = {
        novelId: novel.id,
        novelTitle: novel.title,
        novelCover: novel.coverImage || '',
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        chapterId: chapter.id,
        scrollPercentage,
        lastSentenceIndex: safeChunkIdx,
        lastReadAt: Date.now(),
      };

      const filteredHistory = (currentUser.readingHistory || []).filter(
        (item) => item.novelId !== novel.id
      );
      const nextHistory = [progressEntry, ...filteredHistory].slice(0, 50);

      try {
        const rawLocal = safeGetItem('daotam_reading_history');
        const existingLocal: any[] = rawLocal ? JSON.parse(rawLocal) : [];
        const novelSlug = (novel.slug && novel.slug.trim()) || novel.id;
        const chapterSlug = chapter.slug || `chuong-${chapter.number}`;
        const localEntry = {
          ...progressEntry,
          novelSlug,
          chapterSlug,
          url: `/truyen/${encodeURIComponent(novelSlug)}/chuong/${encodeURIComponent(chapterSlug)}`,
        };
        const nextLocal = [
          localEntry,
          ...existingLocal.filter((item) => item?.novelId !== novel.id),
        ].slice(0, 20);
        safeSetItem('daotam_reading_history', JSON.stringify(nextLocal));
      } catch {}

      setUser((prev) => {
        if (!prev) return prev;
        const prevFiltered = (prev.readingHistory || []).filter(
          (item) => item.novelId !== novel.id
        );
        return {
          ...prev,
          readingHistory: [progressEntry, ...prevFiltered].slice(0, 50),
        };
      });

      updateUserState(currentUser.id, { readingHistory: nextHistory }, true).catch(() => {});
    },
    [saveListeningProgressLocal, setUser]
  );

  const applyPlaybackRateLock = useCallback((audio: HTMLAudioElement | null, rate: number) => {
    if (!audio) return;
    const clamped = Math.max(0.5, Math.min(3.5, rate || 1.0));
    try {
      audio.defaultPlaybackRate = clamped;
      audio.playbackRate = clamped;
    } catch {}
  }, []);

  const updateProgressBarDomNow = useCallback((explicitPct?: number) => {
    const el = progressBarElRef.current;
    if (!el) return;
    if (typeof explicitPct === 'number') {
      el.style.width = `${Math.min(100, Math.max(0, explicitPct)).toFixed(2)}%`;
      return;
    }
    const queueIdx = activeQueueIndexRef.current;
    const activeChunk = (queueChunksRef.current || [])[queueIdx];
    const total = activeChunk?.chapterTotalChunks || (chunksRef.current?.length || 0);
    const idx = activeChunk ? activeChunk.chapterChunkIndex : currentChunkIndexRef.current;
    if (total <= 0 || idx < 0) {
      el.style.width = '0%';
      return;
    }
    const activeAudio = audioRef.current;
    const audioRatio =
      activeAudio && Number.isFinite(activeAudio.duration) && activeAudio.duration > 0
        ? Math.min(1, Math.max(0, activeAudio.currentTime / activeAudio.duration))
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

  // Vòng lặp requestAnimationFrame cập nhật thanh Progress Bar mượt (KHÔNG gọi setState)
  useEffect(() => {
    if (!isPlaying) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      updateProgressBarDomNow();
      return;
    }

    let isRunning = true;
    const tick = () => {
      if (!isRunning) return;
      updateProgressBarDomNow();
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      isRunning = false;
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

  // Khôi phục cài đặt 1 lần duy nhất khi mount (từ localStorage)
  useEffect(() => {
    if (hasRestoredSettingsRef.current) return;
    hasRestoredSettingsRef.current = true;
    setIsMounted(true);

    try {
      const stored = safeGetItem('daotam_reader_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        const resolvedVoice = normalizeEdgeVoiceId(parsed.selectedVoiceId || 'vi-VN-HoaiMyNeural');
        const resolvedSpeed = Number(parsed.voiceSpeed) || 1.0;
        const resolvedAutoNext =
          parsed.autoNextChapter !== undefined ? Boolean(parsed.autoNextChapter) : true;
        setVoiceIdState(resolvedVoice);
        voiceIdRef.current = resolvedVoice;
        setPlaybackRateState(resolvedSpeed);
        playbackRateRef.current = resolvedSpeed;
        setAutoNextState(resolvedAutoNext);
        autoNextRef.current = resolvedAutoNext;
      }
      if (safeGetItem('daotam_audio_bar_visible') === 'true') {
        setIsBarVisibleState(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    applyPlaybackRateLock(audioRef.current, playbackRate);
  }, [playbackRate, applyPlaybackRateLock]);

  useEffect(() => {
    autoNextRef.current = autoNext;
  }, [autoNext]);

  useEffect(() => {
    currentChunkIndexRef.current = currentChunkIndex;
    updateProgressBarDomNow();
  }, [currentChunkIndex, updateProgressBarDomNow]);

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

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
    isAudioModeRef.current = isAudioMode;
  }, [isAudioMode]);

  useEffect(() => {
    isBarVisibleRef.current = isBarVisible;
  }, [isBarVisible]);

  useEffect(() => {
    audioErrorRef.current = audioError;
  }, [audioError]);

  // Khởi tạo DUY NHẤT 1 thẻ <audio> cố định khi mount & tự động dọn Blob URL khi unmount
  useEffect(() => {
    if (hasInitializedAudioRef.current) return;
    hasInitializedAudioRef.current = true;

    const singleAudio = new Audio();
    singleAudio.preload = 'auto';
    singleAudio.setAttribute('playsinline', 'true');
    (singleAudio as any).playsInline = true;
    singleAudio.defaultPlaybackRate = playbackRateRef.current;
    singleAudio.playbackRate = playbackRateRef.current;
    audioRef.current = singleAudio;

    const handlePageHide = () => {
      saveListeningProgressLocal(
        activeNovelRef.current,
        activeChapterRef.current,
        currentChunkIndexRef.current
      );
    };
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden && isPlaybackActiveRef.current) {
        applyPlaybackRateLock(singleAudio, playbackRateRef.current);
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      saveListeningProgressLocal(
        activeNovelRef.current,
        activeChapterRef.current,
        currentChunkIndexRef.current
      );

      singleAudio.onended = null;
      singleAudio.onerror = null;
      singleAudio.onstalled = null;
      singleAudio.onwaiting = null;
      singleAudio.onplaying = null;
      singleAudio.ontimeupdate = null;
      singleAudio.onloadedmetadata = null;
      singleAudio.pause();
      singleAudio.removeAttribute('src');
      singleAudio.src = '';
      audioRef.current = null;

      queueChunksRef.current = [];
      if (speechKeepAliveRef.current) {
        clearInterval(speechKeepAliveRef.current);
        speechKeepAliveRef.current = null;
      }
      if (speechResumeTimerRef.current) {
        clearTimeout(speechResumeTimerRef.current);
        speechResumeTimerRef.current = null;
      }
      if (activeUtteranceRef.current) {
        activeUtteranceRef.current.onstart = null;
        activeUtteranceRef.current.onend = null;
        activeUtteranceRef.current.onerror = null;
        activeUtteranceRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
      backgroundAudioManager.pauseBackgroundPlayback();
      preparedChaptersRef.current.clear();
      preloadPromisesRef.current.clear();
      appendedBoundaryKeysRef.current.clear();
      appendBoundaryPromisesRef.current.clear();
      revokeAllBlobUrls();
      hasInitializedAudioRef.current = false;
    };
  }, [applyPlaybackRateLock, clearStallWatchdogs, revokeAllBlobUrls, saveListeningProgressLocal]);

  const makeChapterCacheKey = (novelId: string, chapterId: string) => `${novelId}:::${chapterId}`;

  const findNextChapterFor = useCallback((chapter: Chapter): Chapter | null => {
    const list = Array.isArray(chaptersListRef.current) ? chaptersListRef.current : [];
    if ((list?.length || 0) === 0) return null;
    const curIdx = list.findIndex(
      (c) => c.id === chapter.id || Number(c.number) === Number(chapter.number)
    );
    if (curIdx >= 0 && curIdx < (list?.length || 0) - 1) {
      return list[curIdx + 1];
    }
    return null;
  }, []);

  /**
   * Fetch và lưu Blob URL vào Map (giới hạn cứng tối đa 5 đoạn).
   * Bọc mọi fetch bằng AbortController 8s + Retry tối đa 3 lần.
   */
  const fetchChunkBlobUrl = useCallback(
    async (
      chunk: QueuedAudioChunk,
      voice: string,
      signal?: AbortSignal,
      onRetryAttempt?: (attempt: number) => void,
      forceRefresh = false
    ): Promise<string> => {
      const key = makeQueuedChunkBlobKey(chunk, voice);
      if (forceRefresh) {
        revokeChunkBlobFromCache(key);
      }

      const cached = blobCacheMapRef.current.get(key);
      if (cached) {
        return cached;
      }

      const existingInFlight = inFlightFetchMapRef.current.get(key);
      if (existingInFlight) {
        return existingInFlight;
      }

      const task = (async () => {
        try {
          const blob = await fetchTtsAudioBlobWithWatchdog({
            text: chunk.text,
            voiceId: voice,
            signal,
            onRetryAttempt,
            timeoutMs: TTS_FETCH_TIMEOUT_MS,
            maxRetries: TTS_MAX_RETRIES,
          });

          if (!blob) {
            return SKIPPED_TTS_CHUNK_URL;
          }

          const blobUrl = URL.createObjectURL(blob);
          if (signal?.aborted) {
            safeRevokeBlobUrl(blobUrl);
            throw new DOMException('Aborted', 'AbortError');
          }
          setChunkBlobWithHardLimit(key, blobUrl, activeBlobKeyRef.current || undefined);
          return blobUrl;
        } finally {
          inFlightFetchMapRef.current.delete(key);
        }
      })();

      inFlightFetchMapRef.current.set(key, task);
      return task;
    },
    [revokeChunkBlobFromCache, safeRevokeBlobUrl, setChunkBlobWithHardLimit]
  );

  const preloadChapterForAudio = useCallback(
    (novel: Novel, chapter: Chapter): Promise<QueuedAudioChunk[]> => {
      if (!isAudioModeRef.current) return Promise.resolve([]);
      const key = makeChapterCacheKey(novel.id, chapter.id);
      const signal = prefetchAbortRef.current?.signal;

      const cachedChunks = preparedChaptersRef.current.get(key);
      if ((cachedChunks?.length || 0) > 0 && cachedChunks) {
        return Promise.resolve(cachedChunks);
      }

      const existingPromise = preloadPromisesRef.current.get(key);
      if (existingPromise) {
        return existingPromise;
      }

      const task = (async () => {
        try {
          let textContent = chapter.content || '';
          if (!textContent || textContent.trim().length === 0) {
            const fetched = await fetchFullChapterContent(
              novel.id,
              chapter.id,
              chapter.number,
              novel.updatedAt
            );
            if (fetched?.content) {
              textContent = fetched.content;
            }
          }
          if (!isAudioModeRef.current || signal?.aborted) return [];

          if (textContent && !chapter.content) {
            chapter.content = textContent;
          }

          if (!textContent || !textContent.trim()) return [];

          const parsed = buildChapterQueuedChunks(novel.id, chapter, textContent);
          if ((parsed?.length || 0) > 0) {
            if (preparedChaptersRef.current.size >= 4) {
              const oldest = preparedChaptersRef.current.keys().next().value;
              if (oldest) preparedChaptersRef.current.delete(oldest);
            }
            preparedChaptersRef.current.set(key, parsed);
          }
          return parsed;
        } catch {
          return [];
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
   * Nối ngầm chương tiếp theo vào cuối Queue khi chỉ còn <= 2 đoạn cuối của chương hiện tại
   */
  const appendNextChapterToQueueIfNeeded = useCallback(
    async (sessionNonce: number, signal?: AbortSignal): Promise<boolean> => {
      if (!autoNextRef.current || !isAudioModeRef.current) return false;
      if (sessionNonce !== playSessionNonceRef.current || signal?.aborted) return false;

      const curNovel = activeNovelRef.current;
      const safeQueue = Array.isArray(queueChunksRef.current) ? queueChunksRef.current : [];
      const tailChunk = (safeQueue?.length || 0) > 0 ? safeQueue[(safeQueue?.length || 0) - 1] : undefined;
      const tailChapter: Chapter | null = tailChunk
        ? (chaptersListRef.current || []).find(
            (c) =>
              c.id === tailChunk.chapterId ||
              Number(c.number) === Number(tailChunk.chapterNumber)
          ) || {
            id: tailChunk.chapterId,
            number: tailChunk.chapterNumber,
            title: tailChunk.chapterTitle,
            slug: tailChunk.chapterSlug || `chuong-${tailChunk.chapterNumber}`,
            content: '',
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
          const parsedNext = await preloadChapterForAudio(curNovel, nextChap);
          if (
            !parsedNext ||
            (parsedNext?.length || 0) === 0 ||
            sessionNonce !== playSessionNonceRef.current ||
            !isAudioModeRef.current ||
            signal?.aborted
          ) {
            return false;
          }

          if (appendedBoundaryKeysRef.current.has(appendKey)) {
            return true;
          }

          const alreadyInQueue = (queueChunksRef.current || []).some(
            (c) =>
              c.chapterId === nextChap.id && Number(c.chapterNumber) === Number(nextChap.number)
          );
          if (alreadyInQueue) {
            appendedBoundaryKeysRef.current.add(appendKey);
            return true;
          }

          queueChunksRef.current = [...(queueChunksRef.current || []), ...(parsedNext || [])];
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
      playSessionNonceRef.current,
      prefetchAbortRef.current?.signal
    ).catch(() => {});
  }, [appendNextChapterToQueueIfNeeded]);

  useEffect(() => {
    preloadNextChapterRef.current = preloadNextChapter;
  }, [preloadNextChapter]);

  /**
   * PARALLEL PREFETCH (i + 1 .. i + 4):
   * - Luôn tải trước song song 3–4 đoạn tiếp theo dưới dạng Blob URL trong bộ nhớ đệm
   *   để nghe tốc độ 2x liền mạch, không bao giờ khựng.
   * - Khi đến 2 đoạn cuối chương hiện tại, tự động tải ngầm nội dung và đoạn audio đầu tiên
   *   của chương kế tiếp để chuyển chương không đứt đoạn.
   */
  const runSequentialPrefetchQueue = useCallback(
    async (fromQueueIdx: number, activeVoice: string, sessionNonce: number) => {
      if (!isAudioModeRef.current || isDeviceFallbackVoice(activeVoice)) return;
      const signal = prefetchAbortRef.current?.signal;
      if (signal?.aborted) return;

      const genId = ++prefetchGenerationRef.current;

      // Dọn dẹp các đoạn cũ nằm ngoài cửa sổ [i .. i + 4]
      pruneBlobsOutsideWindow(fromQueueIdx, activeVoice);

      const checkStale = () =>
        genId !== prefetchGenerationRef.current ||
        sessionNonce !== playSessionNonceRef.current ||
        !isAudioModeRef.current ||
        Boolean(signal?.aborted);

      const prefetchTargetsInWindow = () => {
        const targets: QueuedAudioChunk[] = [];
        const queue = queueChunksRef.current || [];
        for (let offset = 1; offset <= PREFETCH_LOOKAHEAD_COUNT; offset++) {
          const item = queue[fromQueueIdx + offset];
          if (item) targets.push(item);
        }
        return targets;
      };

      const fetchMissingTargetsParallel = async () => {
        if (checkStale()) return;
        const targets = prefetchTargetsInWindow().filter(
          (item) => !blobCacheMapRef.current.has(makeQueuedChunkBlobKey(item, activeVoice))
        );
        if (targets.length === 0) return;
        await Promise.allSettled(
          targets.map((target) => fetchChunkBlobUrl(target, activeVoice, signal))
        );
      };

      // Tải trước song song các đoạn đã có sẵn trong hàng đợi + nối chương kế tiếp nếu còn <= 2 đoạn cuối
      const remainingInQueue = (queueChunksRef.current?.length || 0) - 1 - fromQueueIdx;
      const appendPromise =
        autoNextRef.current && remainingInQueue <= 2
          ? appendNextChapterToQueueIfNeeded(sessionNonce, signal)
          : Promise.resolve(false);

      await Promise.all([fetchMissingTargetsParallel(), appendPromise]);

      // Sau khi nối chương kế tiếp vào queue, tải ngay các đoạn đầu của chương kế tiếp nếu nằm trong cửa sổ lookahead
      if (!checkStale()) {
        await fetchMissingTargetsParallel();
      }

      if (!checkStale()) {
        const targets = prefetchTargetsInWindow();
        const ready = targets.filter((item) =>
          blobCacheMapRef.current.has(makeQueuedChunkBlobKey(item, activeVoice))
        ).length;
        if (bufferedCountRef.current !== ready) {
          bufferedCountRef.current = ready;
          setBufferedCount(ready);
        }
      }
    },
    [appendNextChapterToQueueIfNeeded, fetchChunkBlobUrl, pruneBlobsOutsideWindow]
  );

  const stopDeviceSpeechSynthesis = useCallback(() => {
    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }
    if (speechResumeTimerRef.current) {
      clearTimeout(speechResumeTimerRef.current);
      speechResumeTimerRef.current = null;
    }
    if (activeUtteranceRef.current) {
      activeUtteranceRef.current.onstart = null;
      activeUtteranceRef.current.onend = null;
      activeUtteranceRef.current.onerror = null;
      activeUtteranceRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }, []);

  const stopSingleAudioElement = useCallback(
    (clearSource: boolean) => {
      clearStallWatchdogs();
      activeChunkTokenRef.current = '';
      const audio = audioRef.current;
      if (!audio) return;
      audio.onended = null;
      audio.onerror = null;
      audio.onstalled = null;
      audio.onwaiting = null;
      audio.onplaying = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
      audio.pause();
      audio.currentTime = 0;
      if (clearSource) {
        audio.removeAttribute('src');
        audio.src = '';
      }
    },
    [clearStallWatchdogs]
  );

  const stopAllAudioOutputs = useCallback(
    (clearSource: boolean) => {
      stopSingleAudioElement(clearSource);
      stopDeviceSpeechSynthesis();
    },
    [stopDeviceSpeechSynthesis, stopSingleAudioElement]
  );

  const formatVoiceArtistLabel = useCallback((voice: string) => {
    if (isDeviceFallbackVoice(voice)) return 'Dự phòng (Giọng máy)';
    return voice.includes('NamMinh') ? 'Nam Minh (Nam)' : 'Hoài My (Nữ)';
  }, []);

  const stop = useCallback(() => {
    playSessionNonceRef.current += 1;
    prefetchGenerationRef.current += 1;
    activeChunkTokenRef.current = '';
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

    syncListeningProgressToDatabase(
      activeNovelRef.current,
      activeChapterRef.current,
      currentChunkIndexRef.current
    );

    setIsPlaying(false);
    setIsLoading(false);
    setRetryAttempt(0);
    bufferedCountRef.current = 0;
    setBufferedCount(0);
    setCurrentChunkIndex(-1);
    currentChunkIndexRef.current = -1;
    activeQueueIndexRef.current = -1;
    queueChunksRef.current = [];
    updateProgressBarDomNow(0);
    stopAllAudioOutputs(true);
    backgroundAudioManager.pauseBackgroundPlayback();

    preparedChaptersRef.current.clear();
    preloadPromisesRef.current.clear();
    appendedBoundaryKeysRef.current.clear();
    appendBoundaryPromisesRef.current.clear();
    revokeAllBlobUrls();
  }, [revokeAllBlobUrls, stopAllAudioOutputs, syncListeningProgressToDatabase, updateProgressBarDomNow]);

  const clearAudioError = useCallback(() => {
    setAudioError(null);
  }, []);

  const syncSilentChapterTransition = useCallback(
    (novel: Novel, chunk: QueuedAudioChunk): Chapter | null => {
      const curChap = activeChapterRef.current;
      const isNewChapter =
        !curChap ||
        curChap.id !== chunk.chapterId ||
        Number(curChap.number) !== Number(chunk.chapterNumber);

      if (!isNewChapter) return curChap;

      const matchedFromList = chaptersListRef.current.find(
        (c) => c.id === chunk.chapterId || Number(c.number) === Number(chunk.chapterNumber)
      );
      const nextChapter: Chapter = {
        ...(matchedFromList || {}),
        id: matchedFromList?.id || chunk.chapterId,
        number: matchedFromList?.number ?? chunk.chapterNumber,
        title: matchedFromList?.title || chunk.chapterTitle,
        slug: matchedFromList?.slug || chunk.chapterSlug || `chuong-${chunk.chapterNumber}`,
        content: matchedFromList?.content || '',
      };

      const chapterKey = makeChapterCacheKey(novel.id, nextChapter.id);
      const sliceFromQueue = queueChunksRef.current.filter(
        (c) =>
          c.chapterId === nextChapter.id &&
          Number(c.chapterNumber) === Number(nextChapter.number)
      );
      const nextChapterChunks =
        (sliceFromQueue?.length || 0) > 0
          ? sliceFromQueue
          : preparedChaptersRef.current.get(chapterKey) || [];

      activeChapterRef.current = nextChapter;
      setActiveChapter(nextChapter);
      if ((nextChapterChunks?.length || 0) > 0) {
        chunksRef.current = nextChapterChunks;
        setChunks(nextChapterChunks);
      }

      // Đồng bộ Database 1 lần duy nhất khi tự động chuyển sang chương mới
      syncListeningProgressToDatabase(novel, nextChapter, chunk.chapterChunkIndex);

      // Âm thầm cập nhật URL sang Chương B bằng window.history.pushState mà không làm unmount Player
      if (typeof window !== 'undefined') {
        const slugOrId = (novel.slug && novel.slug.trim()) || novel.id;
        const nextUrl = `/truyen/${encodeURIComponent(slugOrId)}/chuong-${nextChapter.number}`;
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
    [syncListeningProgressToDatabase]
  );

  const playChunk = useCallback(
    async (queueIndex: number) => {
      if (queueIndex < 0) return;

      if (
        queueIndex >= (queueChunksRef.current?.length || 0) &&
        autoNextRef.current &&
        isAudioModeRef.current
      ) {
        await appendNextChapterToQueueIfNeeded(
          playSessionNonceRef.current,
          prefetchAbortRef.current?.signal
        );
      }

      const curQueue = queueChunksRef.current || [];
      if ((curQueue?.length || 0) === 0) {
        setIsPlaying(false);
        setIsLoading(false);
        isPlaybackActiveRef.current = false;
        return;
      }

      if (queueIndex >= (curQueue?.length || 0)) {
        if (isAdvancingChapterRef.current) return;
        setCurrentChunkIndex(-1);
        currentChunkIndexRef.current = -1;
        activeQueueIndexRef.current = -1;
        updateProgressBarDomNow(100);

        if (autoNextRef.current && isAudioModeRef.current) {
          isAdvancingChapterRef.current = true;
          await playNextChapterRef.current();
        } else {
          setIsPlaying(false);
          setIsLoading(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
          revokeAllBlobUrls();
        }
        return;
      }

      if (!isAudioModeRef.current) {
        isAudioModeRef.current = true;
        setIsAudioMode(true);
      }

      if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
        prefetchAbortRef.current = new AbortController();
      }
      const abortSignal = prefetchAbortRef.current.signal;

      const audio = audioRef.current;
      if (!audio) return;

      const sessionNonce = playSessionNonceRef.current;
      const chunkToken = `${sessionNonce}:::${queueIndex}:::${Date.now()}`;
      activeChunkTokenRef.current = chunkToken;
      clearStallWatchdogs();

      const chunk = curQueue[queueIndex];
      const currentVoice = voiceIdRef.current;
      const chunkBlobKey = makeQueuedChunkBlobKey(chunk, currentVoice);

      activeQueueIndexRef.current = queueIndex;
      currentChunkIndexRef.current = chunk.chapterChunkIndex;
      setCurrentChunkIndex(chunk.chapterChunkIndex);
      setAudioError(null);
      setRetryAttempt(0);

      const curNovel = activeNovelRef.current;

      // Chuẩn bị sẵn text chương kế tiếp khi gần cuối chương (chỉ đọc text, không tốn băng thông Netlify)
      if (autoNextRef.current && (curQueue?.length || 0) - 1 - queueIndex <= 2) {
        appendNextChapterToQueueIfNeeded(sessionNonce, abortSignal).catch(() => {});
      }

      // CHẾ ĐỘ GIỌNG DỰ PHÒNG TRÊN THIẾT BỊ (window.speechSynthesis - vi-VN, không tốn băng thông Netlify)
      if (isDeviceFallbackVoice(currentVoice)) {
        stopSingleAudioElement(true);
        const wasSynthesisBusy =
          typeof window !== 'undefined' &&
          'speechSynthesis' in window &&
          (window.speechSynthesis.speaking || window.speechSynthesis.pending || window.speechSynthesis.paused);
        stopDeviceSpeechSynthesis();
        activeChunkTokenRef.current = chunkToken;
        setIsLoading(false);
        setRetryAttempt(0);
        bufferedCountRef.current = 0;
        setBufferedCount(0);

        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          setIsPlaying(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
          setAudioError('Trình duyệt trên thiết bị này không hỗ trợ giọng đọc dự phòng.');
          return;
        }

        const spokenText = cleanTextForTTS(chunk.text);
        if (!spokenText || !/[\p{L}\p{N}]/u.test(spokenText)) {
          if (curNovel) {
            syncSilentChapterTransition(curNovel, chunk);
          }
          await playChunkRef.current(queueIndex + 1);
          return;
        }

        const isCurrentSpeechValid = () =>
          sessionNonce === playSessionNonceRef.current &&
          activeChunkTokenRef.current === chunkToken &&
          isPlaybackActiveRef.current &&
          isAudioModeRef.current &&
          activeQueueIndexRef.current === queueIndex &&
          isDeviceFallbackVoice(voiceIdRef.current);

        if (curNovel) {
          const effectiveChapter = syncSilentChapterTransition(curNovel, chunk);
          if (effectiveChapter) {
            saveListeningProgressLocal(curNovel, effectiveChapter, chunk.chapterChunkIndex);
            backgroundAudioManager.startBackgroundPlayback({
              title: `${curNovel.title} - ${effectiveChapter.title}`,
              artist: `Tác giả: ${curNovel.author} • Giọng: ${formatVoiceArtistLabel(currentVoice)}`,
              coverImage: curNovel.coverImage,
              onPlay: () => {
                resumeRef.current();
              },
              onPause: () => {
                pauseRef.current();
              },
              onNext: () => {
                skipNextRef.current();
              },
              onPrev: () => {
                skipPrevRef.current();
              },
            });
          }
        }
        updateProgressBarDomNow();

        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = 'vi-VN';
        utterance.rate = Math.max(0.5, Math.min(3.0, playbackRateRef.current || 1.0));
        utterance.pitch = 1.0;

        const matchedVoice = getMatchingBrowserVoice(currentVoice);
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }

        activeUtteranceRef.current = utterance;

        const clearSpeechTimers = () => {
          if (speechKeepAliveRef.current) {
            clearInterval(speechKeepAliveRef.current);
            speechKeepAliveRef.current = null;
          }
          if (speechResumeTimerRef.current) {
            clearTimeout(speechResumeTimerRef.current);
            speechResumeTimerRef.current = null;
          }
        };

        utterance.onstart = () => {
          if (!isCurrentSpeechValid()) return;
          setIsPlaying(true);
          setIsLoading(false);
        };

        utterance.onend = () => {
          clearSpeechTimers();
          if (activeUtteranceRef.current === utterance) {
            activeUtteranceRef.current = null;
          }
          if (!isCurrentSpeechValid()) return;

          const upcomingChunk = queueChunksRef.current[queueIndex + 1];
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
            backgroundAudioManager.pauseBackgroundPlayback();
            return;
          }

          playChunkRef.current(queueIndex + 1);
        };

        utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
          clearSpeechTimers();
          if (activeUtteranceRef.current === utterance) {
            activeUtteranceRef.current = null;
          }
          if (event?.error === 'canceled' || event?.error === 'interrupted') {
            return;
          }
          if (!isCurrentSpeechValid()) return;
          setIsPlaying(false);
          setIsLoading(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
          setAudioError(
            `Giọng dự phòng gặp lỗi tại đoạn ${chunk.chapterChunkIndex + 1}. Nhấn Phát để thử lại đúng đoạn này.`
          );
        };

        const startSpeakingUtterance = () => {
          if (!isCurrentSpeechValid()) return;
          setIsPlaying(true);
          window.speechSynthesis.speak(utterance);

          // Tránh lỗi Chrome desktop tự ngắt speechSynthesis sau ~15 giây
          const isMobileUa =
            typeof navigator !== 'undefined' &&
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
          if (!isMobileUa) {
            speechKeepAliveRef.current = setInterval(() => {
              if (!isCurrentSpeechValid() || !window.speechSynthesis.speaking) {
                if (speechKeepAliveRef.current) {
                  clearInterval(speechKeepAliveRef.current);
                  speechKeepAliveRef.current = null;
                }
                return;
              }
              try {
                window.speechSynthesis.pause();
                window.speechSynthesis.resume();
              } catch {}
            }, 10000);
          }
        };

        if (wasSynthesisBusy) {
          speechResumeTimerRef.current = setTimeout(startSpeakingUtterance, 40);
        } else {
          startSpeakingUtterance();
        }
        return;
      }

      stopDeviceSpeechSynthesis();

      try {
        // 1. Kiểm tra trong Map Cache; nếu chưa có thì tải với timeout 20s + tối đa 3 lần retry (mỗi lần nghỉ 2s)
        let audioUrl = blobCacheMapRef.current.get(chunkBlobKey);
        if (!audioUrl) {
          setIsLoading(true);
          audioUrl = await fetchChunkBlobUrl(chunk, currentVoice, abortSignal, (attempt) => {
            if (
              sessionNonce === playSessionNonceRef.current &&
              activeChunkTokenRef.current === chunkToken
            ) {
              setRetryAttempt(attempt);
            }
          });
        }

        if (
          sessionNonce !== playSessionNonceRef.current ||
          activeChunkTokenRef.current !== chunkToken ||
          !isPlaybackActiveRef.current ||
          !isAudioModeRef.current ||
          activeQueueIndexRef.current !== queueIndex
        ) {
          setIsLoading(false);
          setRetryAttempt(0);
          return;
        }

        // Nếu server trả mã 204 (đoạn chỉ có ký tự đặc biệt/trống sau lọc) -> tự trượt qua mượt mà
        if (audioUrl === SKIPPED_TTS_CHUNK_URL) {
          setIsLoading(false);
          setRetryAttempt(0);
          if (curNovel) {
            syncSilentChapterTransition(curNovel, chunk);
          }
          await playChunkRef.current(queueIndex + 1);
          return;
        }

        // 2. Giải phóng Blob URL của đoạn trước nếu nhảy cóc / tua đoạn, và giữ DUY NHẤT 1 thẻ <audio> cố định
        const prevActiveKey = activeBlobKeyRef.current;
        activeBlobKeyRef.current = chunkBlobKey;
        activeBlobUrlRef.current = audioUrl;
        if (prevActiveKey && prevActiveKey !== chunkBlobKey) {
          const nextChunk = curQueue[queueIndex + 1];
          const nextKey = nextChunk ? makeQueuedChunkBlobKey(nextChunk, currentVoice) : null;
          if (prevActiveKey !== nextKey) {
            revokeChunkBlobFromCache(prevActiveKey);
          }
        }

        audio.onended = null;
        audio.onerror = null;
        audio.onstalled = null;
        audio.onwaiting = null;
        audio.onplaying = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;

        // Không gọi audio.pause() trước khi đổi src để tránh làm rớt Background Media Session khi tắt màn hình
        audio.src = audioUrl;
        applyPlaybackRateLock(audio, playbackRateRef.current);

        setIsLoading(false);
        setRetryAttempt(0);

        let stallRecoveryStage = 0; // 0: chưa recover, 1: đã thử .load()+.play(), 2: đã re-fetch
        let isRecovering = false;
        let hasTriggeredPrefetch = false;
        lastMediaTimeRef.current = 0;
        lastMediaAdvanceAtRef.current = Date.now();

        const triggerNextChunkPrefetch = () => {
          if (hasTriggeredPrefetch) return;
          hasTriggeredPrefetch = true;
          runSequentialPrefetchQueue(queueIndex, currentVoice, sessionNonce).catch(() => {});
        };

        const isCurrentChunkStillValid = () =>
          sessionNonce === playSessionNonceRef.current &&
          activeChunkTokenRef.current === chunkToken &&
          isPlaybackActiveRef.current &&
          isAudioModeRef.current &&
          activeQueueIndexRef.current === queueIndex;

        const clearLocalStallTimer = () => {
          if (stallTimeoutRef.current) {
            clearTimeout(stallTimeoutRef.current);
            stallTimeoutRef.current = null;
          }
        };

        const recoverFromStallOrError = async (reason: 'stalled' | 'error') => {
          if (!isCurrentChunkStillValid() || isRecovering) return;
          isRecovering = true;
          clearLocalStallTimer();

          try {
            if (reason === 'stalled' && stallRecoveryStage === 0) {
              stallRecoveryStage = 1;
              if (audio.readyState >= 2) {
                applyPlaybackRateLock(audio, playbackRateRef.current);
                await audio.play();
                applyPlaybackRateLock(audio, playbackRateRef.current);
                lastMediaAdvanceAtRef.current = Date.now();
                return;
              }
              const resumeTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
              const savedDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
              audio.load();
              applyPlaybackRateLock(audio, playbackRateRef.current);
              await audio.play();
              applyPlaybackRateLock(audio, playbackRateRef.current);
              if (resumeTime > 0 && (savedDuration <= 0 || resumeTime < savedDuration)) {
                try {
                  audio.currentTime = resumeTime;
                } catch {}
              }
              lastMediaAdvanceAtRef.current = Date.now();
              return;
            }

            if (stallRecoveryStage < 2) {
              stallRecoveryStage = 2;
              setIsLoading(true);
              const freshUrl = await fetchChunkBlobUrl(chunk, currentVoice, abortSignal, (attempt) => {
                if (isCurrentChunkStillValid()) {
                  setRetryAttempt(attempt);
                }
              }, true);

              if (!isCurrentChunkStillValid()) return;

              activeBlobKeyRef.current = chunkBlobKey;
              activeBlobUrlRef.current = freshUrl;
              audio.src = freshUrl;
              applyPlaybackRateLock(audio, playbackRateRef.current);
              audio.load();
              await audio.play();
              applyPlaybackRateLock(audio, playbackRateRef.current);
              setIsLoading(false);
              setRetryAttempt(0);
              lastMediaAdvanceAtRef.current = Date.now();
              return;
            }

            // Tuyệt đối KHÔNG tự ý bỏ đoạn nhảy sang đoạn khác — dừng đúng tại đoạn hiện tại để người dùng bấm Phát thử lại
            revokeChunkBlobFromCache(chunkBlobKey);
            setIsLoading(false);
            setRetryAttempt(0);
            setIsPlaying(false);
            isPlaybackActiveRef.current = false;
            backgroundAudioManager.pauseBackgroundPlayback();
            setIsMinimized(false);
            setAudioError(
              `Tất cả máy chủ giọng đọc đều gián đoạn tại đoạn ${chunk.chapterChunkIndex + 1}. Bạn có thể thử lại hoặc chuyển sang giọng dự phòng.`
            );
          } catch (recoverErr: any) {
            if (recoverErr?.name === 'AbortError' || !isCurrentChunkStillValid()) return;
            revokeChunkBlobFromCache(chunkBlobKey);
            setIsLoading(false);
            setRetryAttempt(0);
            setIsPlaying(false);
            isPlaybackActiveRef.current = false;
            backgroundAudioManager.pauseBackgroundPlayback();
            setIsMinimized(false);
            setAudioError(
              `Không thể kết nối máy chủ giọng đọc tại đoạn ${chunk.chapterChunkIndex + 1}. Bạn có thể thử lại hoặc chuyển sang giọng dự phòng.`
            );
          } finally {
            isRecovering = false;
          }
        };

        const armStallWatchdog = () => {
          if (!isCurrentChunkStillValid() || stallTimeoutRef.current || isRecovering) return;
          stallTimeoutRef.current = setTimeout(() => {
            stallTimeoutRef.current = null;
            if (audio.currentTime > lastMediaTimeRef.current + 0.05) {
              lastMediaTimeRef.current = audio.currentTime;
              lastMediaAdvanceAtRef.current = Date.now();
              return;
            }
            recoverFromStallOrError('stalled');
          }, STALL_WATCHDOG_MS);
        };

        audio.onloadedmetadata = () => {
          applyPlaybackRateLock(audio, playbackRateRef.current);
          backgroundAudioManager.updatePositionState(
            audio.duration,
            audio.currentTime,
            playbackRateRef.current
          );
        };

        audio.onplaying = () => {
          clearLocalStallTimer();
          consecutiveChunkErrorsRef.current = 0;
          lastMediaAdvanceAtRef.current = Date.now();
          applyPlaybackRateLock(audio, playbackRateRef.current);
          backgroundAudioManager.updatePositionState(
            audio.duration,
            audio.currentTime,
            playbackRateRef.current
          );
          triggerNextChunkPrefetch();
        };

        audio.ontimeupdate = () => {
          if (audio.currentTime > lastMediaTimeRef.current + 0.05) {
            lastMediaTimeRef.current = audio.currentTime;
            lastMediaAdvanceAtRef.current = Date.now();
            clearLocalStallTimer();
          }
        };

        audio.onstalled = () => {
          if (typeof document !== 'undefined' && document.hidden && audio.readyState >= 2) return;
          armStallWatchdog();
        };

        audio.onwaiting = () => {
          if (typeof document !== 'undefined' && document.hidden && audio.readyState >= 2) return;
          armStallWatchdog();
        };

        // Heartbeat kiểm tra audio đứng hình thực sự (kiểm tra trực tiếp audio.currentTime để tránh false-positive khi tắt màn hình)
        stallCheckIntervalRef.current = setInterval(() => {
          if (!isCurrentChunkStillValid() || isRecovering) return;
          if (!audio.paused && !audio.ended) {
            if (audio.currentTime > lastMediaTimeRef.current + 0.05) {
              lastMediaTimeRef.current = audio.currentTime;
              lastMediaAdvanceAtRef.current = Date.now();
              return;
            }
            if (typeof document !== 'undefined' && document.hidden && audio.readyState >= 2) {
              return;
            }
            const stalledMs = Date.now() - lastMediaAdvanceAtRef.current;
            if (stalledMs >= STALL_WATCHDOG_MS) {
              recoverFromStallOrError('stalled');
            }
          }
        }, 3000);

        // MEMORY LEAK PROTECTION:
        // Ngay khi đoạn hiện tại phát xong (onEnded), BẮT BUỘC revokeObjectURL & xóa khỏi Map ngay lập tức
        audio.onended = () => {
          clearStallWatchdogs();
          audio.onended = null;
          audio.onerror = null;
          audio.onstalled = null;
          audio.onwaiting = null;
          audio.onplaying = null;
          audio.ontimeupdate = null;
          audio.onloadedmetadata = null;

          // Giải phóng RAM của đoạn vừa đọc xong ngay lập tức
          revokeChunkBlobFromCache(chunkBlobKey);

          if (!isCurrentChunkStillValid()) {
            return;
          }

          const upcomingChunk = queueChunksRef.current[queueIndex + 1];
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
            backgroundAudioManager.pauseBackgroundPlayback();
            return;
          }

          playChunkRef.current(queueIndex + 1);
        };

        audio.onerror = () => {
          if (!isCurrentChunkStillValid()) return;
          recoverFromStallOrError('error');
        };

        await audio.play();
        // Khóa lại playbackRate ngay sau play() để trình duyệt không tụt về 1x
        applyPlaybackRateLock(audio, playbackRateRef.current);
        lastMediaAdvanceAtRef.current = Date.now();
        consecutiveChunkErrorsRef.current = 0;
        // Chỉ prefetch đúng 1 đoạn kế tiếp ngay khi đoạn hiện tại bắt đầu phát
        triggerNextChunkPrefetch();

        if (
          sessionNonce === playSessionNonceRef.current &&
          activeChunkTokenRef.current === chunkToken &&
          isAudioModeRef.current
        ) {
          setIsPlaying(true);

          if (curNovel) {
            const effectiveChapter = syncSilentChapterTransition(curNovel, chunk);
            if (effectiveChapter) {
              saveListeningProgressLocal(curNovel, effectiveChapter, chunk.chapterChunkIndex);
              backgroundAudioManager.startBackgroundPlayback({
                title: `${curNovel.title} - ${effectiveChapter.title}`,
                artist: `Tác giả: ${curNovel.author} • Giọng: ${formatVoiceArtistLabel(currentVoice)}`,
                coverImage: curNovel.coverImage,
                onPlay: () => {
                  resumeRef.current();
                },
                onPause: () => {
                  pauseRef.current();
                },
                onNext: () => {
                  skipNextRef.current();
                },
                onPrev: () => {
                  skipPrevRef.current();
                },
              });
            }
          }
          updateProgressBarDomNow();
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || !isAudioModeRef.current) {
          setIsLoading(false);
          setRetryAttempt(0);
          return;
        }
        console.warn('[AudioContext] Lỗi phát chunk #' + queueIndex + ' sau 3 lần thử lại:', err);
        clearStallWatchdogs();
        if (
          sessionNonce === playSessionNonceRef.current &&
          activeChunkTokenRef.current === chunkToken
        ) {
          setIsLoading(false);
          setRetryAttempt(0);
          setIsPlaying(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
          setIsMinimized(false);
          setAudioError(
            `Không thể kết nối các máy chủ giọng đọc tại đoạn ${chunk.chapterChunkIndex + 1}. Nhấn Phát để thử lại hoặc chuyển sang giọng dự phòng.`
          );
        }
      }
    },
    [
      appendNextChapterToQueueIfNeeded,
      applyPlaybackRateLock,
      clearStallWatchdogs,
      fetchChunkBlobUrl,
      formatVoiceArtistLabel,
      revokeAllBlobUrls,
      revokeChunkBlobFromCache,
      runSequentialPrefetchQueue,
      saveListeningProgressLocal,
      stopDeviceSpeechSynthesis,
      stopSingleAudioElement,
      syncSilentChapterTransition,
      updateProgressBarDomNow,
    ]
  );

  useEffect(() => {
    playChunkRef.current = playChunk;
  }, [playChunk]);

  const resolveQueueIndexForChapterChunk = useCallback((localIndex: number): number => {
    const activeChap = activeChapterRef.current;
    const found = queueChunksRef.current.findIndex(
      (c) =>
        (!activeChap ||
          (c.chapterId === activeChap.id &&
            Number(c.chapterNumber) === Number(activeChap.number))) &&
        c.chapterChunkIndex === localIndex
    );
    if (found >= 0) return found;
    return Math.max(0, Math.min(localIndex, Math.max(0, (queueChunksRef.current?.length || 0) - 1)));
  }, []);

  const play = useCallback(
    async (startIndex?: number) => {
      setAudioError(null);
      isAudioModeRef.current = true;
      setIsAudioMode(true);
      if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
        prefetchAbortRef.current = new AbortController();
      }
      isPlaybackActiveRef.current = true;
      isAdvancingChapterRef.current = false;
      setIsPlaying(true);
      const targetQueueIdx =
        startIndex !== undefined
          ? resolveQueueIndexForChapterChunk(startIndex)
          : activeQueueIndexRef.current >= 0
          ? activeQueueIndexRef.current
          : 0;
      await playChunkRef.current(targetQueueIdx);
    },
    [resolveQueueIndexForChapterChunk]
  );

  const pause = useCallback(() => {
    playSessionNonceRef.current += 1;
    isPlaybackActiveRef.current = false;
    clearStallWatchdogs();
    setIsPlaying(false);
    setIsLoading(false);
    setRetryAttempt(0);
    audioRef.current?.pause();
    stopDeviceSpeechSynthesis();
    backgroundAudioManager.pauseBackgroundPlayback();
    syncListeningProgressToDatabase(
      activeNovelRef.current,
      activeChapterRef.current,
      currentChunkIndexRef.current
    );
  }, [clearStallWatchdogs, stopDeviceSpeechSynthesis, syncListeningProgressToDatabase]);

  const resume = useCallback(async () => {
    setAudioError(null);
    isAudioModeRef.current = true;
    setIsAudioMode(true);
    if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
      prefetchAbortRef.current = new AbortController();
    }
    if (activeQueueIndexRef.current < 0) {
      await play(0);
      return;
    }
    if (isDeviceFallbackVoice(voiceIdRef.current)) {
      isPlaybackActiveRef.current = true;
      setIsPlaying(true);
      await playChunkRef.current(activeQueueIndexRef.current);
      return;
    }
    const audio = audioRef.current;
    if (audio && audio.src && !audio.ended && !audio.error) {
      isPlaybackActiveRef.current = true;
      try {
        applyPlaybackRateLock(audio, playbackRateRef.current);
        await audio.play();
        applyPlaybackRateLock(audio, playbackRateRef.current);
        lastMediaAdvanceAtRef.current = Date.now();
        setIsPlaying(true);
        runSequentialPrefetchQueue(
          activeQueueIndexRef.current,
          voiceIdRef.current,
          playSessionNonceRef.current
        ).catch(() => {});
      } catch {
        await playChunkRef.current(activeQueueIndexRef.current);
      }
    } else {
      await playChunkRef.current(activeQueueIndexRef.current);
    }
  }, [applyPlaybackRateLock, play, runSequentialPrefetchQueue]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const seekToChunk = useCallback(
    async (index: number) => {
      if (index < 0 || index >= (chunksRef.current?.length || 0)) return;
      setAudioError(null);
      isAudioModeRef.current = true;
      setIsAudioMode(true);
      if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
        prefetchAbortRef.current = new AbortController();
      }
      isPlaybackActiveRef.current = true;
      isAdvancingChapterRef.current = false;
      const targetQueueIdx = resolveQueueIndexForChapterChunk(index);
      await playChunkRef.current(targetQueueIdx);
    },
    [resolveQueueIndexForChapterChunk]
  );

  const handleSkipNext = useCallback(async () => {
    const nextQueueIdx = activeQueueIndexRef.current + 1;
    if (nextQueueIdx < (queueChunksRef.current?.length || 0)) {
      setAudioError(null);
      isAudioModeRef.current = true;
      setIsAudioMode(true);
      isPlaybackActiveRef.current = true;
      isAdvancingChapterRef.current = false;
      await playChunkRef.current(nextQueueIdx);
    } else if (autoNextRef.current) {
      await playNextChapterRef.current();
    }
  }, []);

  const handleSkipPrev = useCallback(async () => {
    const prevQueueIdx = Math.max(0, activeQueueIndexRef.current - 1);
    setAudioError(null);
    isAudioModeRef.current = true;
    setIsAudioMode(true);
    isPlaybackActiveRef.current = true;
    isAdvancingChapterRef.current = false;
    await playChunkRef.current(prevQueueIdx);
  }, []);

  useEffect(() => {
    skipNextRef.current = handleSkipNext;
    skipPrevRef.current = handleSkipPrev;
    pauseRef.current = pause;
    resumeRef.current = resume;
  }, [handleSkipNext, handleSkipPrev, pause, resume]);

  const setVoiceId = useCallback(
    (newVoice: string) => {
      const normalized = normalizeEdgeVoiceId(newVoice);
      playSessionNonceRef.current += 1;
      setVoiceIdState(normalized);
      voiceIdRef.current = normalized;
      setAudioError(null);
      setRetryAttempt(0);
      resetPrefetchAbortController();
      bufferedCountRef.current = 0;
      setBufferedCount(0);
      stopAllAudioOutputs(true);
      revokeAllBlobUrls();

      try {
        const stored = safeGetItem('daotam_reader_settings');
        const parsed = stored ? JSON.parse(stored) : {};
        safeSetItem('daotam_reader_settings', JSON.stringify({ ...parsed, selectedVoiceId: normalized }));
      } catch {}

      preloadNextChapterRef.current();

      // Chọn là nghe ngay: tắt giọng cũ hoàn toàn và phát tiếp ngay bằng giọng vừa chọn
      const hasLoadedChapterQueue =
        Boolean(activeChapterRef.current) && (queueChunksRef.current?.length || 0) > 0;
      const shouldResumeImmediately =
        hasLoadedChapterQueue &&
        (isPlaybackActiveRef.current || isBarVisibleRef.current || Boolean(audioErrorRef.current));

      if (shouldResumeImmediately) {
        const resumeQueueIdx =
          activeQueueIndexRef.current >= 0
            ? activeQueueIndexRef.current
            : Math.max(0, currentChunkIndexRef.current);
        isAudioModeRef.current = true;
        setIsAudioMode(true);
        isPlaybackActiveRef.current = true;
        isAdvancingChapterRef.current = false;
        setIsPlaying(true);
        playChunkRef.current(resumeQueueIdx);
      }
    },
    [resetPrefetchAbortController, revokeAllBlobUrls, stopAllAudioOutputs]
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      setPlaybackRateState(rate);
      playbackRateRef.current = rate;
      applyPlaybackRateLock(audioRef.current, rate);
      try {
        const stored = safeGetItem('daotam_reader_settings');
        const parsed = stored ? JSON.parse(stored) : {};
        safeSetItem('daotam_reader_settings', JSON.stringify({ ...parsed, voiceSpeed: rate }));
      } catch {}

      if (
        isDeviceFallbackVoice(voiceIdRef.current) &&
        isPlaybackActiveRef.current &&
        activeQueueIndexRef.current >= 0
      ) {
        playSessionNonceRef.current += 1;
        stopDeviceSpeechSynthesis();
        playChunkRef.current(activeQueueIndexRef.current);
      }
    },
    [applyPlaybackRateLock, stopDeviceSpeechSynthesis]
  );

  const setAutoNext = useCallback((auto: boolean) => {
    setAutoNextState(auto);
    autoNextRef.current = auto;
    try {
      const stored = safeGetItem('daotam_reader_settings');
      const parsed = stored ? JSON.parse(stored) : {};
      safeSetItem('daotam_reader_settings', JSON.stringify({ ...parsed, autoNextChapter: auto }));
    } catch {}
    if (auto && isAudioModeRef.current) {
      preloadNextChapterRef.current();
    }
  }, []);

  const playChapter = useCallback(
    async (
      novel: Novel,
      chapter: Chapter,
      autoStart = true,
      chapterList?: Chapter[],
      userExplicitAction = false,
      options?: { isAutoAdvance?: boolean; startChunkIndex?: number }
    ) => {
      const chapterRequestKey = makeChapterCacheKey(novel.id, chapter.id);
      if (
        !userExplicitAction &&
        !options?.isAutoAdvance &&
        inFlightChapterLoadKeyRef.current === chapterRequestKey
      ) {
        return;
      }
      inFlightChapterLoadKeyRef.current = chapterRequestKey;

      const currentNonce = ++playSessionNonceRef.current;
      isAdvancingChapterRef.current = false;
      appendedBoundaryKeysRef.current.clear();
      appendBoundaryPromisesRef.current.clear();
      const isAutoAdvance = Boolean(options?.isAutoAdvance);

      const isSavedDisabled = safeGetItem('daotam_audio_bar_visible') === 'false';
      const willActivateAudio = autoStart && (!isSavedDisabled || userExplicitAction);

      if (!isAutoAdvance) {
        // Hủy ngay lập tức mọi request /api/tts và giọng đọc đang phát của chương/truyện cũ
        resetPrefetchAbortController();
        stopAllAudioOutputs(true);
        revokeAllBlobUrls();
        queueChunksRef.current = [];
        setChunks([]);
        chunksRef.current = [];
        setCurrentChunkIndex(-1);
        currentChunkIndexRef.current = -1;
        activeQueueIndexRef.current = -1;
        bufferedCountRef.current = 0;
        setBufferedCount(0);
        consecutiveChunkErrorsRef.current = 0;
      }

      if (willActivateAudio || userExplicitAction) {
        isAudioModeRef.current = true;
        setIsAudioMode(true);
        if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
          prefetchAbortRef.current = new AbortController();
        }
      }

      const prevNovel = activeNovelRef.current;
      const prevChapter = activeChapterRef.current;
      const isSwitchingToAnotherChapter =
        Boolean(prevNovel && prevChapter) &&
        (prevNovel?.id !== novel.id ||
          prevChapter?.id !== chapter.id ||
          Number(prevChapter?.number) !== Number(chapter.number));

      if (isSwitchingToAnotherChapter && prevNovel && prevChapter && currentChunkIndexRef.current >= 0) {
        syncListeningProgressToDatabase(prevNovel, prevChapter, currentChunkIndexRef.current);
      }

      setAudioError(null);
      setRetryAttempt(0);
      setActiveNovel(novel);
      setActiveChapter(chapter);
      activeNovelRef.current = novel;
      activeChapterRef.current = chapter;

      if (Array.isArray(chapterList) && (chapterList?.length || 0) > 0) {
        const sorted = [...chapterList].sort((a, b) => Number(a.number) - Number(b.number));
        setChaptersList(sorted);
        chaptersListRef.current = sorted;
      } else if (Array.isArray(novel.chapters) && (novel.chapters?.length || 0) > 0) {
        const sorted = [...novel.chapters].sort((a, b) => Number(a.number) - Number(b.number));
        setChaptersList(sorted);
        chaptersListRef.current = sorted;
      }

      if (!isSavedDisabled || userExplicitAction) {
        setIsBarVisible(true);
      }

      try {
        let parsedChunks = preparedChaptersRef.current.get(chapterRequestKey);

        if (!parsedChunks || (parsedChunks?.length || 0) === 0) {
          let textContent = chapter.content || '';
          if (!textContent || textContent.trim().length === 0) {
            const pendingPreload = preloadPromisesRef.current.get(chapterRequestKey);
            if (pendingPreload) {
              parsedChunks = await pendingPreload;
            } else {
              setIsLoading(true);
              try {
                const fetched = await fetchFullChapterContent(
                  novel.id,
                  chapter.id,
                  chapter.number,
                  novel.updatedAt
                );
                if (currentNonce !== playSessionNonceRef.current) return;
                if (fetched?.content) {
                  textContent = fetched.content;
                  chapter.content = fetched.content;
                }
              } catch (e) {
                console.warn('Lỗi nạp văn bản chương cho Audio:', e);
              }
            }
          }

          if ((!parsedChunks || (parsedChunks?.length || 0) === 0) && textContent.trim().length > 0) {
            parsedChunks = buildChapterQueuedChunks(novel.id, chapter, textContent);
            if ((parsedChunks?.length || 0) > 0) {
              preparedChaptersRef.current.set(chapterRequestKey, parsedChunks);
            }
          }
        }

        if (currentNonce !== playSessionNonceRef.current) return;

        const finalChunks = parsedChunks || [];
        // Luôn đọc tuần tự từ đoạn 0, chỉ nhảy tới đoạn khác khi có người dùng chọn thủ công (startChunkIndex)
        const manualStart = options?.startChunkIndex;
        const resumeChunkIdx =
          !isAutoAdvance &&
          typeof manualStart === 'number' &&
          Number.isInteger(manualStart) &&
          manualStart >= 0 &&
          manualStart < finalChunks.length
            ? manualStart
            : 0;

        queueChunksRef.current = [...finalChunks];
        setChunks(finalChunks);
        chunksRef.current = finalChunks;
        setCurrentChunkIndex(resumeChunkIdx);
        currentChunkIndexRef.current = resumeChunkIdx;
        activeQueueIndexRef.current = resumeChunkIdx;

        if (isSwitchingToAnotherChapter) {
          syncListeningProgressToDatabase(novel, chapter, resumeChunkIdx);
        }

        if (willActivateAudio && (finalChunks?.length || 0) > 0) {
          isPlaybackActiveRef.current = true;
          setIsPlaying(true);
          safeSetItem('daotam_audio_active', 'true');
          backgroundAudioManager.updateMetadata(
            `${novel.title} - ${chapter.title}`,
            `Tác giả: ${novel.author} • Giọng: ${formatVoiceArtistLabel(voiceIdRef.current)}`,
            novel.coverImage
          );
          await playChunkRef.current(resumeChunkIdx);
        } else {
          isPlaybackActiveRef.current = false;
          clearStallWatchdogs();
          setIsPlaying(false);
          setIsLoading(false);
          setRetryAttempt(0);
          stopAllAudioOutputs(false);
          backgroundAudioManager.pauseBackgroundPlayback();
        }
      } finally {
        if (inFlightChapterLoadKeyRef.current === chapterRequestKey) {
          inFlightChapterLoadKeyRef.current = null;
        }
      }
    },
    [
      clearStallWatchdogs,
      formatVoiceArtistLabel,
      resetPrefetchAbortController,
      revokeAllBlobUrls,
      setIsBarVisible,
      stopAllAudioOutputs,
      syncListeningProgressToDatabase,
    ]
  );

  const handlePlayNextChapter = useCallback(async () => {
    if (!isAudioModeRef.current) {
      isAdvancingChapterRef.current = false;
      pause();
      return;
    }

    const curChapter = activeChapterRef.current;
    const curNovel = activeNovelRef.current;
    const list = chaptersListRef.current || [];
    if (!curChapter || !curNovel || (list?.length || 0) === 0) {
      isAdvancingChapterRef.current = false;
      stop();
      return;
    }

    const curIdx = list.findIndex(
      (c) => c.id === curChapter.id || Number(c.number) === Number(curChapter.number)
    );
    if (curIdx >= 0 && curIdx < (list?.length || 0) - 1) {
      const nextChap = list[curIdx + 1];
      await playChapter(curNovel, nextChap, true, list, false, { isAutoAdvance: true });
    } else {
      isAdvancingChapterRef.current = false;
      stop();
    }
  }, [pause, playChapter, stop]);

  const handlePlayPrevChapter = useCallback(async () => {
    const curChapter = activeChapterRef.current;
    const curNovel = activeNovelRef.current;
    const list = chaptersListRef.current || [];
    if (!curChapter || !curNovel || (list?.length || 0) === 0) return;

    const curIdx = list.findIndex(
      (c) => c.id === curChapter.id || Number(c.number) === Number(curChapter.number)
    );
    if (curIdx > 0) {
      const prevChap = list[curIdx - 1];
      await playChapter(curNovel, prevChap, true, list, true);
    }
  }, [playChapter]);

  useEffect(() => {
    playNextChapterRef.current = handlePlayNextChapter;
  }, [handlePlayNextChapter]);

  const closeBar = useCallback(() => {
    stop();
    setAudioError(null);
    setIsBarVisible(false);
    setIsMinimized(false);
    safeSetItem('daotam_audio_bar_visible', 'false');
    safeSetItem('daotam_audio_active', 'false');
  }, [stop, setIsBarVisible]);

  const setAudioMode = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        isAudioModeRef.current = true;
        setIsAudioMode(true);
        if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
          prefetchAbortRef.current = new AbortController();
        }
        setIsBarVisible(true);
      } else {
        closeBar();
      }
    },
    [closeBar, setIsBarVisible]
  );

  const progress =
    (chunks?.length || 0) > 0 && currentChunkIndex >= 0
      ? Math.round(((currentChunkIndex + 1) / (chunks?.length || 1)) * 100)
      : 0;

  const currentChunk =
    currentChunkIndex >= 0 && currentChunkIndex < (chunks?.length || 0)
      ? chunks[currentChunkIndex]
      : null;

  const currentChunkText = currentChunk?.text || '';

  return (
    <AudioContext.Provider
      value={{
        activeNovel: isMounted ? activeNovel : null,
        activeChapter: isMounted ? activeChapter : null,
        isAudioMode,
        isPlaying,
        isLoading,
        retryAttempt,
        bufferedCount,
        audioError,
        currentChunkIndex,
        totalChunks: chunks?.length || 0,
        chunks,
        currentChunk,
        currentChunkText,
        voiceId,
        playbackRate,
        progress,
        autoNext,
        isBarVisible: isMounted ? isBarVisible : false,
        isMinimized,
        registerProgressBarRef,
        playChapter,
        setAudioMode,
        togglePlay,
        play,
        pause,
        resume,
        stop,
        skipNext: handleSkipNext,
        skipPrev: handleSkipPrev,
        seekToChunk,
        setVoiceId,
        setPlaybackRate,
        setAutoNext,
        setIsBarVisible,
        setIsMinimized,
        clearAudioError,
        closeBar,
        playNextChapter: handlePlayNextChapter,
        playPrevChapter: handlePlayPrevChapter,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = (): AudioContextType => {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAudio must be used within AudioProvider');
  return context;
};
