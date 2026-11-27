import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Chapter, Novel, ReadingProgress, UserProfile } from '../types';
import {
  AudioChunk,
  DEFAULT_CHUNK_MAX_LENGTH,
  DEFAULT_CHUNK_MIN_LENGTH,
  DEFAULT_FIRST_CHUNK_MAX_LENGTH,
  DEFAULT_FIRST_CHUNK_MIN_LENGTH,
  chunkChapterContent,
  cleanTextForTTS,
  splitTextForDeviceSpeech,
} from '../utils/audioChunker';
import { backgroundAudioManager } from '../utils/backgroundAudio';
import {
  normalizeEdgeVoiceId,
  isDeviceFallbackVoice,
  getMatchingBrowserVoice,
  subscribeBrowserVoicesChanged,
  getNovelVoiceAvailability,
  resolveEffectiveVoiceForNovel,
  getChapterAudioUrl,
  isUserOwnerOrAdmin,
  isChapterVisibleToReader,
  formatScheduleFull,
  getChapterPublishAt,
} from '../utils/rulesAndVoices';
import { safeGetItem, safeSetItem, safeJsonParse } from '../utils/safeStorage';
import { fetchFullChapterContent } from '../firebase/services';
import { useAuth } from './AuthContext';

const CHUNK_MIN_LEN = DEFAULT_CHUNK_MIN_LENGTH;
const CHUNK_MAX_LEN = DEFAULT_CHUNK_MAX_LENGTH;
const LISTENING_PROGRESS_STORAGE_KEY = 'daotam_listening_progress';
const LISTENING_CHUNK_MAP_STORAGE_KEY = 'daotam_listening_chunk_map';
const AUDIO_PLAYBACK_RATE_STORAGE_KEY = 'daotam_audio_playback_rate';
const MP3_RESUME_POSITIONS_STORAGE_KEY = 'daotam_mp3_positions';
const MP3_POSITION_SAVE_THROTTLE_MS = 5000;
const MP3_POSITION_MAX_ENTRIES = 150;
const NETWORK_RECOVERY_MAX_RETRIES = 1;
const NETWORK_RECOVERY_RETRY_DELAY_MS = 1500;

export type SleepTimerMode = 'off' | '15' | '30' | '60' | 'end_of_chapter';

interface StoredMp3PositionEntry {
  time: number;
  updatedAt: number;
}

function readMp3PositionsMap(): Record<string, StoredMp3PositionEntry> {
  try {
    const raw = safeGetItem(MP3_RESUME_POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, StoredMp3PositionEntry>;
    }
  } catch {}
  return {};
}

function makeMp3ResumeKey(chapterId: string, mp3Url?: string | null): string {
  const cleanUrl = (mp3Url || '').trim();
  return cleanUrl ? `${chapterId}:::${cleanUrl}` : chapterId;
}

function readMp3SavedPosition(chapterId?: string | null, mp3Url?: string | null): number {
  if (!chapterId) return 0;
  const map = readMp3PositionsMap();
  const specificKey = makeMp3ResumeKey(chapterId, mp3Url);
  const entry = map[specificKey] || map[chapterId];
  const sec = typeof entry === 'number' ? entry : Number(entry?.time || 0);
  return Number.isFinite(sec) && sec > 0 ? sec : 0;
}

function saveMp3Position(
  chapterId: string | null | undefined,
  seconds: number,
  mp3Url?: string | null
): void {
  if (!chapterId || !Number.isFinite(seconds) || seconds <= 1) return;
  try {
    const map = readMp3PositionsMap();
    const key = makeMp3ResumeKey(chapterId, mp3Url);
    map[key] = { time: Math.floor(seconds), updatedAt: Date.now() };
    const entries = Object.entries(map);
    if (entries.length > MP3_POSITION_MAX_ENTRIES) {
      entries.sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));
      const trimmed: Record<string, StoredMp3PositionEntry> = {};
      for (const [k, v] of entries.slice(0, MP3_POSITION_MAX_ENTRIES)) {
        trimmed[k] = v;
      }
      safeSetItem(MP3_RESUME_POSITIONS_STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }
    safeSetItem(MP3_RESUME_POSITIONS_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function clearMp3SavedPosition(chapterId?: string | null, mp3Url?: string | null): void {
  if (!chapterId) return;
  try {
    const map = readMp3PositionsMap();
    let changed = false;
    const specificKey = makeMp3ResumeKey(chapterId, mp3Url);
    if (Object.prototype.hasOwnProperty.call(map, specificKey)) {
      delete map[specificKey];
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(map, chapterId)) {
      delete map[chapterId];
      changed = true;
    }
    if (changed) {
      safeSetItem(MP3_RESUME_POSITIONS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {}
}

function isAbortLikeError(err: any): boolean {
  if (!err) return false;
  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  return name === 'AbortError' || /AbortError|interrupted/i.test(msg);
}

function isValidAudioUrl(raw?: string | null): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  return '';
}

export function resolveChapterVoiceAudioUrl(
  chapter?: Chapter | null,
  voiceId?: string
): string {
  if (!chapter) return '';
  const normalized = normalizeEdgeVoiceId(voiceId);
  if (isDeviceFallbackVoice(normalized)) {
    return '';
  }
  const voiceKey: 'male' | 'female' =
    normalized === 'vi-VN-HoaiMyNeural' ? 'female' : 'male';
  return isValidAudioUrl(getChapterAudioUrl(chapter, voiceKey));
}

function preloadNextMp3LinkHint(mp3Url: string): void {
  const cleanUrl = (mp3Url || '').trim();
  if (typeof document === 'undefined' || !cleanUrl) return;
  try {
    const existingId = 'daotam-next-mp3-preload';
    let link = document.getElementById(existingId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = existingId;
      link.rel = 'preload';
      link.as = 'audio';
      link.removeAttribute('crossorigin');
      document.head.appendChild(link);
    }
    link.removeAttribute('crossorigin');
    if (link.href !== cleanUrl) {
      link.href = cleanUrl;
    }
  } catch {}
}

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
  isDirectMp3: boolean;
  mp3CurrentTime: number;
  mp3Duration: number;
  isPlaying: boolean;
  isLoading: boolean;
  audioError: string | null;
  fallbackNotice: string | null;
  currentChunkIndex: number;
  totalChunks: number;
  chunks: AudioChunk[];
  currentChunk: AudioChunk | null;
  currentChunkText: string;
  voiceId: string;
  availableVoiceIds: string[];
  playbackRate: number;
  progress: number;
  autoNext: boolean;
  sleepTimerMode: SleepTimerMode;
  sleepTimerRemainingSec: number | null;
  networkStatusMessage: string | null;
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
  retryCurrentChunk: () => Promise<void>;
  stop: () => void;
  skipNext: () => Promise<void>;
  skipPrev: () => Promise<void>;
  seekToChunk: (index: number) => Promise<void>;
  seekToTime: (seconds: number) => void;
  setVoiceId: (voice: string) => void;
  setPlaybackRate: (rate: number) => void;
  setAutoNext: (auto: boolean) => void;
  setSleepTimer: (mode: SleepTimerMode) => void;
  setIsBarVisible: (visible: boolean) => void;
  setIsMinimized: (minimized: boolean) => void;
  clearAudioError: () => void;
  clearFallbackNotice: () => void;
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
  const [isDirectMp3, setIsDirectMp3] = useState<boolean>(false);
  const [mp3CurrentTime, setMp3CurrentTime] = useState<number>(0);
  const [mp3Duration, setMp3Duration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [voiceId, setVoiceIdState] = useState<string>('vi-VN-NamMinhNeural');
  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [autoNext, setAutoNextState] = useState<boolean>(true);
  const [sleepTimerMode, setSleepTimerModeState] = useState<SleepTimerMode>('off');
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState<number | null>(null);
  const [networkStatusMessage, setNetworkStatusMessage] = useState<string | null>(null);
  const [isBarVisible, setIsBarVisibleState] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const setIsBarVisible = useCallback((visible: boolean) => {
    setIsBarVisibleState(visible);
    safeSetItem('daotam_audio_bar_visible', visible ? 'true' : 'false');
    if (!visible) {
      safeSetItem('daotam_audio_active', 'false');
    }
  }, []);

  const hasRestoredSettingsRef = useRef<boolean>(false);
  const hasInitializedAudioRef = useRef<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeChunkTokenRef = useRef<string>('');
  const prefetchAbortRef = useRef<AbortController | null>(null);

  const queueChunksRef = useRef<QueuedAudioChunk[]>([]);
  const activeQueueIndexRef = useRef<number>(-1);

  const progressBarElRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const isAudioModeRef = useRef<boolean>(false);
  const isDirectMp3Ref = useRef<boolean>(false);
  const lastMp3TimeUiUpdateRef = useRef<number>(0);
  const isPlaybackActiveRef = useRef<boolean>(false);
  const currentChunkIndexRef = useRef<number>(-1);
  const chunksRef = useRef<QueuedAudioChunk[]>([]);
  const voiceIdRef = useRef<string>('vi-VN-NamMinhNeural');
  const preferredVoiceIdRef = useRef<string>('vi-VN-NamMinhNeural');
  const isUserExplicitDeviceVoiceRef = useRef<boolean>(false);
  const playbackRateRef = useRef<number>(1.0);
  const autoNextRef = useRef<boolean>(true);
  const activeNovelRef = useRef<Novel | null>(null);
  const activeChapterRef = useRef<Chapter | null>(null);
  const chaptersListRef = useRef<Chapter[]>([]);
  const isBarVisibleRef = useRef<boolean>(false);
  const audioErrorRef = useRef<string | null>(null);
  const playbackSessionIdRef = useRef<number>(0);
  const isAdvancingChapterRef = useRef<boolean>(false);

  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const selectedBrowserVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speechKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechVoiceWaitUnsubRef = useRef<(() => void) | null>(null);

  const preparedChaptersRef = useRef<Map<string, QueuedAudioChunk[]>>(new Map());
  const preloadPromisesRef = useRef<Map<string, Promise<QueuedAudioChunk[]>>>(new Map());
  const directMp3PreloadedForRef = useRef<Set<string>>(new Set());
  const inFlightChapterLoadKeyRef = useRef<string | null>(null);

  const activeAudioChapterIdRef = useRef<string | null>(null);
  const activeAudioSrcRef = useRef<string | null>(null);

  const lastMp3PosSavedAtRef = useRef<number>(0);
  const lastKnownMp3TimeRef = useRef<number>(0);
  const networkLostTimeRef = useRef<number>(0);
  const networkRetryCountRef = useRef<number>(0);
  const networkRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mp3StallDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingForOnlineRef = useRef<boolean>(false);
  const mp3RetryHandlerRef = useRef<(() => void) | null>(null);

  const sleepTimerModeRef = useRef<SleepTimerMode>('off');
  const sleepTimerEndAtRef = useRef<number | null>(null);
  const sleepTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playChunkRef = useRef<(queueIndex: number) => Promise<void>>(async () => {});
  const playNextChapterRef = useRef<() => Promise<void>>(async () => {});
  const playPrevChapterRef = useRef<() => Promise<void>>(async () => {});
  const skipNextRef = useRef<() => Promise<void>>(async () => {});
  const skipPrevRef = useRef<() => Promise<void>>(async () => {});
  const seekToTimeRef = useRef<(seconds: number) => void>(() => {});
  const pauseRef = useRef<() => void>(() => {});
  const resumeRef = useRef<() => Promise<void>>(async () => {});
  const preloadNextChapterRef = useRef<() => void>(() => {});
  const playChapterRef = useRef<
    (
      novel: Novel,
      chapter: Chapter,
      autoStart?: boolean,
      chapterList?: Chapter[],
      userExplicitAction?: boolean,
      options?: { isAutoAdvance?: boolean; startChunkIndex?: number }
    ) => Promise<void>
  >(async () => {});

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

      try {
        const rawLocal = safeGetItem('daotam_reading_history');
        const parsedLocal = safeJsonParse<any[]>(rawLocal, []);
        const existingLocal: any[] = Array.isArray(parsedLocal) ? parsedLocal : [];
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
    },
    [saveListeningProgressLocal, setUser]
  );

  const applyPlaybackRateLock = useCallback((audio: HTMLAudioElement | null, rate: number) => {
    if (!audio) return;
    const clamped = Math.max(0.5, Math.min(3.0, rate || 1.0));
    try {
      const anyAudio = audio as any;
      if ('preservesPitch' in audio) audio.preservesPitch = true;
      if ('mozPreservesPitch' in anyAudio) anyAudio.mozPreservesPitch = true;
      if ('webkitPreservesPitch' in anyAudio) anyAudio.webkitPreservesPitch = true;
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
    const activeAudio = audioRef.current;
    if (isDirectMp3Ref.current) {
      if (activeAudio && Number.isFinite(activeAudio.duration) && activeAudio.duration > 0) {
        const mp3Pct = Math.min(
          100,
          Math.max(0, (activeAudio.currentTime / activeAudio.duration) * 100)
        );
        el.style.width = `${mp3Pct.toFixed(2)}%`;
      } else {
        el.style.width = '0%';
      }
      return;
    }
    const queueIdx = activeQueueIndexRef.current;
    const activeChunk = (queueChunksRef.current || [])[queueIdx];
    const total = activeChunk?.chapterTotalChunks || chunksRef.current?.length || 0;
    const idx = activeChunk ? activeChunk.chapterChunkIndex : currentChunkIndexRef.current;
    if (total <= 0 || idx < 0) {
      el.style.width = '0%';
      return;
    }
    const pct = Math.min(100, Math.max(0, ((idx + 1) / total) * 100));
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
    if (prefetchAbortRef.current) {
      try {
        prefetchAbortRef.current.abort();
      } catch {}
    }
    prefetchAbortRef.current = new AbortController();
    return prefetchAbortRef.current.signal;
  }, []);

  const clearNetworkRecoveryTimer = useCallback(() => {
    if (networkRetryTimerRef.current) {
      clearTimeout(networkRetryTimerRef.current);
      networkRetryTimerRef.current = null;
    }
    if (mp3StallDebounceTimerRef.current) {
      clearTimeout(mp3StallDebounceTimerRef.current);
      mp3StallDebounceTimerRef.current = null;
    }
    waitingForOnlineRef.current = false;
  }, []);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimerIntervalRef.current) {
      clearInterval(sleepTimerIntervalRef.current);
      sleepTimerIntervalRef.current = null;
    }
    sleepTimerEndAtRef.current = null;
    sleepTimerModeRef.current = 'off';
    setSleepTimerModeState('off');
    setSleepTimerRemainingSec(null);
  }, []);

  const setSleepTimer = useCallback(
    (mode: SleepTimerMode) => {
      if (sleepTimerIntervalRef.current) {
        clearInterval(sleepTimerIntervalRef.current);
        sleepTimerIntervalRef.current = null;
      }

      if (mode === 'off') {
        sleepTimerEndAtRef.current = null;
        sleepTimerModeRef.current = 'off';
        setSleepTimerModeState('off');
        setSleepTimerRemainingSec(null);
        return;
      }

      if (mode === 'end_of_chapter') {
        sleepTimerEndAtRef.current = null;
        sleepTimerModeRef.current = 'end_of_chapter';
        setSleepTimerModeState('end_of_chapter');
        setSleepTimerRemainingSec(null);
        return;
      }

      const minutes = Number(mode);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        clearSleepTimer();
        return;
      }

      const endAt = Date.now() + minutes * 60 * 1000;
      sleepTimerEndAtRef.current = endAt;
      sleepTimerModeRef.current = mode;
      setSleepTimerModeState(mode);
      setSleepTimerRemainingSec(minutes * 60);

      sleepTimerIntervalRef.current = setInterval(() => {
        const targetEnd = sleepTimerEndAtRef.current;
        if (!targetEnd) {
          clearSleepTimer();
          return;
        }
        const remaining = Math.max(0, Math.ceil((targetEnd - Date.now()) / 1000));
        if (remaining <= 0) {
          clearSleepTimer();
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
              window.speechSynthesis.cancel();
            } catch {}
          }
          pauseRef.current();
        } else {
          setSleepTimerRemainingSec(remaining);
        }
      }, 1000);
    },
    [clearSleepTimer]
  );

  const broadcastAudioChapterChange = useCallback((novel: Novel, chapter: Chapter) => {
    if (typeof window === 'undefined') return;
    document.title = `${formatChapterTitleForTTS(chapter)} - ${novel.title} | Đạo Tâm`;
    window.dispatchEvent(
      new CustomEvent('daotam:audio-chapter-changed', {
        detail: { novel, chapter },
      })
    );
  }, []);

  useEffect(() => {
    if (hasRestoredSettingsRef.current) return;
    hasRestoredSettingsRef.current = true;
    setIsMounted(true);

    try {
      const savedDirectRateRaw = safeGetItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY);
      const savedDirectRate = savedDirectRateRaw ? Number(savedDirectRateRaw) : NaN;
      let resolvedSpeed =
        Number.isFinite(savedDirectRate) && savedDirectRate >= 0.5 && savedDirectRate <= 3.0
          ? savedDirectRate
          : NaN;

      const stored = safeGetItem('daotam_reader_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        const rawVoice = normalizeEdgeVoiceId(
          parsed.selectedVoiceId || 'vi-VN-NamMinhNeural'
        );
        const explicitDevice =
          isDeviceFallbackVoice(rawVoice) && parsed.selectedVoiceExplicitDevice === true;
        const resolvedVoice = explicitDevice
          ? 'device-fallback'
          : isDeviceFallbackVoice(rawVoice)
          ? 'vi-VN-NamMinhNeural'
          : rawVoice;
        if (!Number.isFinite(resolvedSpeed)) {
          const parsedSpeed = Number(parsed.voiceSpeed);
          resolvedSpeed =
            Number.isFinite(parsedSpeed) && parsedSpeed >= 0.5 && parsedSpeed <= 3.0
              ? parsedSpeed
              : 1.0;
        }
        const resolvedAutoNext =
          parsed.autoNextChapter !== undefined ? Boolean(parsed.autoNextChapter) : true;
        isUserExplicitDeviceVoiceRef.current = explicitDevice;
        setVoiceIdState(resolvedVoice);
        voiceIdRef.current = resolvedVoice;
        preferredVoiceIdRef.current = resolvedVoice;
        setAutoNextState(resolvedAutoNext);
        autoNextRef.current = resolvedAutoNext;
      }

      const finalSpeed = Number.isFinite(resolvedSpeed) ? resolvedSpeed : 1.0;
      setPlaybackRateState(finalSpeed);
      playbackRateRef.current = finalSpeed;

      if (safeGetItem('daotam_audio_bar_visible') === 'true') {
        setIsBarVisibleState(true);
      }
    } catch {}

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.getVoices();
      } catch {}
      return subscribeBrowserVoicesChanged(() => {
        const best = getMatchingBrowserVoice();
        if (best) selectedBrowserVoiceRef.current = best;
      });
    }
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

  useEffect(() => {
    const singleAudio = audioRef.current;
    if (!singleAudio || hasInitializedAudioRef.current) return;
    hasInitializedAudioRef.current = true;

    singleAudio.removeAttribute('crossorigin');
    singleAudio.preload = 'auto';
    singleAudio.setAttribute('playsinline', 'true');
    (singleAudio as any).playsInline = true;
    applyPlaybackRateLock(singleAudio, playbackRateRef.current);

    selectedBrowserVoiceRef.current = getMatchingBrowserVoice();
    const unsubscribeVoicesChanged = subscribeBrowserVoicesChanged(() => {
      selectedBrowserVoiceRef.current = getMatchingBrowserVoice();
    });

    const handleBeforeUnload = () => {
      playbackSessionIdRef.current += 1;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
    };

    const handlePageHide = () => {
      if (isDirectMp3Ref.current && activeChapterRef.current) {
        const curTime =
          Number.isFinite(singleAudio.currentTime) && singleAudio.currentTime > 1
            ? singleAudio.currentTime
            : lastKnownMp3TimeRef.current;
        if (curTime > 1) {
          saveMp3Position(activeChapterRef.current.id, curTime, activeAudioSrcRef.current);
        }
      }
      saveListeningProgressLocal(
        activeNovelRef.current,
        activeChapterRef.current,
        currentChunkIndexRef.current
      );
    };

    const handleOffline = () => {
      if (!isPlaybackActiveRef.current || !isDirectMp3Ref.current) return;
      const curT =
        Number.isFinite(singleAudio.currentTime) && singleAudio.currentTime > 0
          ? singleAudio.currentTime
          : lastKnownMp3TimeRef.current;
      networkLostTimeRef.current = curT;
      if (activeChapterRef.current && curT > 1) {
        saveMp3Position(activeChapterRef.current.id, curT, activeAudioSrcRef.current);
      }
      if (networkRetryTimerRef.current) {
        clearTimeout(networkRetryTimerRef.current);
        networkRetryTimerRef.current = null;
      }
      waitingForOnlineRef.current = true;
      setIsLoading(true);
      setNetworkStatusMessage('Mất kết nối, đang chờ mạng...');
    };

    const handleOnline = () => {
      if (!waitingForOnlineRef.current || !isPlaybackActiveRef.current || !isDirectMp3Ref.current) {
        return;
      }
      waitingForOnlineRef.current = false;
      networkRetryCountRef.current = 0;
      setNetworkStatusMessage('Đã có mạng lại, đang tiếp tục phát...');
      if (mp3RetryHandlerRef.current) {
        mp3RetryHandlerRef.current();
      }
    };

    const handleVisibilityChange = () => {
      if (!isPlaybackActiveRef.current) return;
      applyPlaybackRateLock(singleAudio, playbackRateRef.current);
      if (isDirectMp3Ref.current) {
        if (
          singleAudio.paused &&
          !singleAudio.ended &&
          singleAudio.readyState >= 2 &&
          Boolean(singleAudio.src)
        ) {
          singleAudio.play().catch(() => {});
        }
        backgroundAudioManager.setPlaybackState('playing');
      }
    };

    const handleRateChange = () => {
      if (!isPlaybackActiveRef.current || !isDirectMp3Ref.current) return;
      const target = Math.max(0.5, Math.min(3.0, playbackRateRef.current || 1.0));
      if (Math.abs(singleAudio.playbackRate - target) > 0.01) {
        applyPlaybackRateLock(singleAudio, target);
      }
    };

    singleAudio.addEventListener('ratechange', handleRateChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      singleAudio.removeEventListener('ratechange', handleRateChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearNetworkRecoveryTimer();
      clearSleepTimer();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (prefetchAbortRef.current) {
        try {
          prefetchAbortRef.current.abort();
        } catch {}
      }
      if (isDirectMp3Ref.current && activeChapterRef.current) {
        const curTime =
          Number.isFinite(singleAudio.currentTime) && singleAudio.currentTime > 1
            ? singleAudio.currentTime
            : lastKnownMp3TimeRef.current;
        if (curTime > 1) {
          saveMp3Position(activeChapterRef.current.id, curTime, activeAudioSrcRef.current);
        }
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
      singleAudio.load();

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
      if (speechVoiceWaitUnsubRef.current) {
        try {
          speechVoiceWaitUnsubRef.current();
        } catch {}
        speechVoiceWaitUnsubRef.current = null;
      }
      if (typeof unsubscribeVoicesChanged === 'function') {
        unsubscribeVoicesChanged();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
      backgroundAudioManager.pauseBackgroundPlayback();
      preparedChaptersRef.current.clear();
      preloadPromisesRef.current.clear();
      hasInitializedAudioRef.current = false;
    };
  }, [applyPlaybackRateLock, clearNetworkRecoveryTimer, clearSleepTimer, saveListeningProgressLocal]);

  const makeChapterCacheKey = (novelId: string, chapterId: string) => `${novelId}:::${chapterId}`;

  useEffect(() => {
    const handleCacheInvalidated = (e: Event) => {
      const detail = (e as CustomEvent<{ novelId?: string }>).detail;
      const targetNovelId = detail?.novelId;
      if (!targetNovelId) return;

      for (const k of Array.from(preparedChaptersRef.current.keys())) {
        if (k.startsWith(`${targetNovelId}:::`)) {
          preparedChaptersRef.current.delete(k);
        }
      }
      for (const k of Array.from(preloadPromisesRef.current.keys())) {
        if (k.startsWith(`${targetNovelId}:::`)) {
          preloadPromisesRef.current.delete(k);
        }
      }
      directMp3PreloadedForRef.current.clear();
    };

    const handleChaptersAudioSynced = (e: Event) => {
      const detail = (e as CustomEvent<{ novelId?: string; updatedChapters?: Chapter[] }>).detail;
      if (!detail?.novelId || !Array.isArray(detail.updatedChapters)) return;
      const { novelId: syncedNovelId, updatedChapters } = detail;

      const byId = new Map<string, Chapter>();
      const byNum = new Map<number, Chapter>();
      for (const ch of updatedChapters) {
        if (ch.id) byId.set(ch.id, ch);
        if (Number(ch.number) > 0) byNum.set(Number(ch.number), ch);
      }

      if (activeNovelRef.current?.id === syncedNovelId) {
        const patchList = (list: Chapter[]) =>
          list.map((c) => {
            const match = (c.id ? byId.get(c.id) : undefined) || byNum.get(Number(c.number));
            if (!match) return c;
            return {
              ...c,
              audioUrl: match.audioUrl,
              audioUrlMale: match.audioUrlMale,
              audioUrlFemale: match.audioUrlFemale,
              mp3Url: match.mp3Url,
              maleAudioUrl: match.maleAudioUrl,
              audio: match.audio,
              femaleAudioUrl: match.femaleAudioUrl,
              mp3Female: match.mp3Female,
            };
          });

        const nextList = patchList(chaptersListRef.current || []);
        chaptersListRef.current = nextList;
        setChaptersList(nextList);

        const curChap = activeChapterRef.current;
        if (curChap) {
          const curMatch =
            (curChap.id ? byId.get(curChap.id) : undefined) || byNum.get(Number(curChap.number));
          if (curMatch) {
            const nextChap: Chapter = {
              ...curChap,
              audioUrl: curMatch.audioUrl,
              audioUrlMale: curMatch.audioUrlMale,
              audioUrlFemale: curMatch.audioUrlFemale,
              mp3Url: curMatch.mp3Url,
              maleAudioUrl: curMatch.maleAudioUrl,
              audio: curMatch.audio,
              femaleAudioUrl: curMatch.femaleAudioUrl,
              mp3Female: curMatch.mp3Female,
            };
            activeChapterRef.current = nextChap;
            setActiveChapter(nextChap);
            activeAudioSrcRef.current = null;
            const syncedUrl = resolveChapterVoiceAudioUrl(nextChap, voiceIdRef.current);
            if (syncedUrl) {
              isDirectMp3Ref.current = true;
              setIsDirectMp3(true);
              queueChunksRef.current = [];
              setChunks([]);
              chunksRef.current = [];
            } else if (isDirectMp3Ref.current) {
              isDirectMp3Ref.current = false;
              setIsDirectMp3(false);
            }
          }
        }

        const hasMaleInNext = nextList.some((c) => Boolean(getChapterAudioUrl(c, 'male')));
        const hasFemaleInNext = nextList.some((c) => Boolean(getChapterAudioUrl(c, 'female')));
        const nextNovel: Novel = {
          ...activeNovelRef.current,
          chapters: nextList,
          hasMaleAudio: nextList.length > 0 ? hasMaleInNext : activeNovelRef.current.hasMaleAudio,
          hasFemaleAudio:
            nextList.length > 0 ? hasFemaleInNext : activeNovelRef.current.hasFemaleAudio,
          hasAudio:
            nextList.length > 0
              ? hasMaleInNext || hasFemaleInNext
              : activeNovelRef.current.hasAudio,
          updatedAt: Date.now(),
        };
        activeNovelRef.current = nextNovel;
        setActiveNovel(nextNovel);
      }
    };

    window.addEventListener(
      'daotam:chapter-audio-cache-invalidated',
      handleCacheInvalidated as EventListener
    );
    window.addEventListener(
      'daotam:chapters-audio-synced',
      handleChaptersAudioSynced as EventListener
    );
    return () => {
      window.removeEventListener(
        'daotam:chapter-audio-cache-invalidated',
        handleCacheInvalidated as EventListener
      );
      window.removeEventListener(
        'daotam:chapters-audio-synced',
        handleChaptersAudioSynced as EventListener
      );
    };
  }, []);

  const isChapterPlayableNow = useCallback((novel: Novel | null, chapter: Chapter | null): boolean => {
    if (!chapter) return false;
    const isOwnerOrAdmin = isUserOwnerOrAdmin(userRef.current, novel);
    return isChapterVisibleToReader(chapter, isOwnerOrAdmin, Date.now());
  }, []);

  const filterPlayableChapters = useCallback((novel: Novel | null, list?: Chapter[] | null): Chapter[] => {
    if (!Array.isArray(list) || list.length === 0) return [];
    const isOwnerOrAdmin = isUserOwnerOrAdmin(userRef.current, novel);
    const nowMs = Date.now();
    return list.filter((c) => isChapterVisibleToReader(c, isOwnerOrAdmin, nowMs));
  }, []);

  const findNextChapterFor = useCallback(
    (chapter: Chapter): Chapter | null => {
      const curNovel = activeNovelRef.current;
      const list = filterPlayableChapters(curNovel, chaptersListRef.current);
      if ((list?.length || 0) === 0) return null;
      const curIdx = list.findIndex(
        (c) => c.id === chapter.id || Number(c.number) === Number(chapter.number)
      );
      if (curIdx >= 0 && curIdx < (list?.length || 0) - 1) {
        return list[curIdx + 1];
      }
      return null;
    },
    [filterPlayableChapters]
  );

  const preloadChapterForAudio = useCallback(
    (novel: Novel, chapter: Chapter): Promise<QueuedAudioChunk[]> => {
      if (!isAudioModeRef.current) return Promise.resolve([]);
      if (!isChapterPlayableNow(novel, chapter)) return Promise.resolve([]);
      const mp3ForCurrentVoice = resolveChapterVoiceAudioUrl(chapter, voiceIdRef.current);
      if (mp3ForCurrentVoice) {
        preloadNextMp3LinkHint(mp3ForCurrentVoice);
        return Promise.resolve([]);
      }
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
            if (fetched) {
              if (fetched.audioUrl && !chapter.audioUrl) chapter.audioUrl = fetched.audioUrl;
              if (fetched.audioUrlMale && !chapter.audioUrlMale) chapter.audioUrlMale = fetched.audioUrlMale;
              if (fetched.audioUrlFemale && !chapter.audioUrlFemale) chapter.audioUrlFemale = fetched.audioUrlFemale;
              if (fetched.mp3Url && !chapter.mp3Url) chapter.mp3Url = fetched.mp3Url;
              if (fetched.maleAudioUrl && !chapter.maleAudioUrl) chapter.maleAudioUrl = fetched.maleAudioUrl;
              if (fetched.audio && !chapter.audio) chapter.audio = fetched.audio;
              if (fetched.femaleAudioUrl && !chapter.femaleAudioUrl) chapter.femaleAudioUrl = fetched.femaleAudioUrl;
              if (fetched.mp3Female && !chapter.mp3Female) chapter.mp3Female = fetched.mp3Female;
              if (fetched.content) {
                textContent = fetched.content;
              }
            }
          }
          if (!isAudioModeRef.current || signal?.aborted) return [];

          if (textContent && !chapter.content) {
            chapter.content = textContent;
          }

          const mp3AfterFetch = resolveChapterVoiceAudioUrl(chapter, voiceIdRef.current);
          if (mp3AfterFetch) {
            preloadNextMp3LinkHint(mp3AfterFetch);
            return [];
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

  const preloadNextChapter = useCallback(() => {
    if (!autoNextRef.current || !isAudioModeRef.current) return;
    const curNovel = activeNovelRef.current;
    const curChap = activeChapterRef.current;
    if (!curNovel || !curChap) return;
    const nextChap = findNextChapterFor(curChap);
    if (!nextChap) return;
    preloadChapterForAudio(curNovel, nextChap).catch(() => {});
  }, [findNextChapterFor, preloadChapterForAudio]);

  useEffect(() => {
    preloadNextChapterRef.current = preloadNextChapter;
  }, [preloadNextChapter]);

  const stopDeviceSpeechSynthesis = useCallback(() => {
    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }
    if (speechResumeTimerRef.current) {
      clearTimeout(speechResumeTimerRef.current);
      speechResumeTimerRef.current = null;
    }
    if (speechVoiceWaitUnsubRef.current) {
      try {
        speechVoiceWaitUnsubRef.current();
      } catch {}
      speechVoiceWaitUnsubRef.current = null;
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

  const stopSingleAudioElement = useCallback((clearSource: boolean) => {
    activeChunkTokenRef.current = '';
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = false;
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
      audio.load();
    }
  }, []);

  const stopAllAudioOutputs = useCallback(
    (clearSource: boolean) => {
      stopSingleAudioElement(clearSource);
      stopDeviceSpeechSynthesis();
    },
    [stopDeviceSpeechSynthesis, stopSingleAudioElement]
  );

  const formatVoiceArtistLabel = useCallback((voice: string) => {
    const normalized = normalizeEdgeVoiceId(voice);
    if (isDeviceFallbackVoice(normalized)) return 'Giọng Máy';
    return normalized === 'vi-VN-HoaiMyNeural' ? 'Hằng Nga (Nữ)' : 'Nam Minh (Nam)';
  }, []);

  const stop = useCallback(() => {
    playbackSessionIdRef.current += 1;
    activeChunkTokenRef.current = '';
    activeAudioChapterIdRef.current = null;
    activeAudioSrcRef.current = null;
    clearNetworkRecoveryTimer();
    clearSleepTimer();
    mp3RetryHandlerRef.current = null;
    networkRetryCountRef.current = 0;
    setNetworkStatusMessage(null);
    setFallbackNotice(null);
    isAudioModeRef.current = false;
    setIsAudioMode(false);
    isDirectMp3Ref.current = false;
    setIsDirectMp3(false);
    setMp3CurrentTime(0);
    setMp3Duration(0);
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
    setCurrentChunkIndex(-1);
    currentChunkIndexRef.current = -1;
    activeQueueIndexRef.current = -1;
    queueChunksRef.current = [];
    updateProgressBarDomNow(0);
    stopAllAudioOutputs(true);
    backgroundAudioManager.pauseBackgroundPlayback();

    preparedChaptersRef.current.clear();
    preloadPromisesRef.current.clear();
    directMp3PreloadedForRef.current.clear();
  }, [
    clearNetworkRecoveryTimer,
    clearSleepTimer,
    stopAllAudioOutputs,
    syncListeningProgressToDatabase,
    updateProgressBarDomNow,
  ]);

  const clearAudioError = useCallback(() => {
    setAudioError(null);
  }, []);

  const clearFallbackNotice = useCallback(() => {
    setFallbackNotice(null);
  }, []);

  const playChunk = useCallback(
    async (queueIndex: number) => {
      if (queueIndex < 0) return;

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

        if (sleepTimerModeRef.current === 'end_of_chapter') {
          playbackSessionIdRef.current += 1;
          clearSleepTimer();
          stopDeviceSpeechSynthesis();
          setIsPlaying(false);
          setIsLoading(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
          return;
        }

        if (autoNextRef.current && isAudioModeRef.current) {
          isAdvancingChapterRef.current = true;
          await playNextChapterRef.current();
        } else {
          playbackSessionIdRef.current += 1;
          stopDeviceSpeechSynthesis();
          setIsPlaying(false);
          setIsLoading(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
        }
        return;
      }

      if (isDirectMp3Ref.current) {
        return;
      }

      if (!isAudioModeRef.current) {
        isAudioModeRef.current = true;
        setIsAudioMode(true);
      }

      const sessionNonce = playbackSessionIdRef.current;
      const chunkToken = `${sessionNonce}:::${queueIndex}:::${Date.now()}`;
      activeChunkTokenRef.current = chunkToken;

      const chunk = curQueue[queueIndex];
      const voiceAtSpeechStart = voiceIdRef.current;

      activeQueueIndexRef.current = queueIndex;
      currentChunkIndexRef.current = chunk.chapterChunkIndex;
      setCurrentChunkIndex(chunk.chapterChunkIndex);
      setAudioError(null);

      const curNovel = activeNovelRef.current;
      const curChap = activeChapterRef.current;

      if (autoNextRef.current && (curQueue?.length || 0) - 1 - queueIndex <= 3) {
        preloadNextChapterRef.current();
      }

      stopSingleAudioElement(true);
      const wasSynthesisBusy =
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        (window.speechSynthesis.speaking ||
          window.speechSynthesis.pending ||
          window.speechSynthesis.paused);
      stopDeviceSpeechSynthesis();
      activeChunkTokenRef.current = chunkToken;
      setIsLoading(false);

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setIsPlaying(false);
        isPlaybackActiveRef.current = false;
        backgroundAudioManager.pauseBackgroundPlayback();
        setAudioError('Trình duyệt trên thiết bị này không hỗ trợ Giọng Máy.');
        return;
      }

      const speechSegments = splitTextForDeviceSpeech(chunk.text, 200);
      if (speechSegments.length === 0) {
        await playChunkRef.current(queueIndex + 1);
        return;
      }

      const isCurrentSpeechValid = () =>
        !isDirectMp3Ref.current &&
        sessionNonce === playbackSessionIdRef.current &&
        activeChunkTokenRef.current === chunkToken &&
        isPlaybackActiveRef.current &&
        isAudioModeRef.current &&
        activeQueueIndexRef.current === queueIndex &&
        voiceIdRef.current === voiceAtSpeechStart;

      if (curNovel && curChap) {
        saveListeningProgressLocal(curNovel, curChap, chunk.chapterChunkIndex);
        backgroundAudioManager.startBackgroundPlayback({
          title: formatChapterTitleForTTS(curChap),
          artist: `${curNovel.title} • Giọng Máy`,
          album: 'Đạo Tâm',
          coverImage: curNovel.coverImage,
          onPlay: () => {
            resumeRef.current();
          },
          onPause: () => {
            pauseRef.current();
          },
          onNext: () => {
            playNextChapterRef.current();
          },
          onPrev: () => {
            playPrevChapterRef.current();
          },
        });
      }
      updateProgressBarDomNow();

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

      const finishChunkAndAdvance = () => {
        clearSpeechTimers();
        if (!isCurrentSpeechValid()) return;
        playChunkRef.current(queueIndex + 1);
      };

      const speakSegmentAt = (segIdx: number) => {
        if (!isCurrentSpeechValid()) return;
        if (segIdx >= speechSegments.length) {
          finishChunkAndAdvance();
          return;
        }

        const segText = speechSegments[segIdx];
        const utterance = new SpeechSynthesisUtterance(segText);
        utterance.lang = 'vi-VN';
        utterance.rate = Math.max(0.5, Math.min(3.0, playbackRateRef.current || 1.0));
        utterance.pitch = 1.0;

        const matchedVoice = getMatchingBrowserVoice() || selectedBrowserVoiceRef.current;
        if (matchedVoice) {
          selectedBrowserVoiceRef.current = matchedVoice;
          utterance.voice = matchedVoice;
        }

        activeUtteranceRef.current = utterance;

        utterance.onstart = () => {
          if (!isCurrentSpeechValid()) return;
          setIsPlaying(true);
          setIsLoading(false);
        };

        utterance.onend = () => {
          if (activeUtteranceRef.current === utterance) {
            activeUtteranceRef.current = null;
          }
          if (!isCurrentSpeechValid()) return;
          speakSegmentAt(segIdx + 1);
        };

        utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
          if (activeUtteranceRef.current === utterance) {
            activeUtteranceRef.current = null;
          }
          if (event?.error === 'canceled' || event?.error === 'interrupted') {
            return;
          }
          if (!isCurrentSpeechValid()) return;
          speakSegmentAt(segIdx + 1);
        };

        if (!isCurrentSpeechValid()) return;
        setIsPlaying(true);
        window.speechSynthesis.speak(utterance);
      };

      const startSpeakingSegments = () => {
        if (!isCurrentSpeechValid()) return;
        const beginPlayback = () => {
          if (!isCurrentSpeechValid()) return;
          speakSegmentAt(0);

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

        const loadedVoices = window.speechSynthesis.getVoices() || [];
        if (loadedVoices.length === 0) {
          let settled = false;
          const finishWait = () => {
            if (settled) return;
            settled = true;
            if (speechVoiceWaitUnsubRef.current) {
              try {
                speechVoiceWaitUnsubRef.current();
              } catch {}
              speechVoiceWaitUnsubRef.current = null;
            }
            if (speechResumeTimerRef.current) {
              clearTimeout(speechResumeTimerRef.current);
              speechResumeTimerRef.current = null;
            }
            selectedBrowserVoiceRef.current = getMatchingBrowserVoice();
            beginPlayback();
          };
          const unsub = subscribeBrowserVoicesChanged(() => {
            if ((window.speechSynthesis.getVoices() || []).length > 0) {
              finishWait();
            }
          });
          speechVoiceWaitUnsubRef.current = unsub;
          speechResumeTimerRef.current = setTimeout(finishWait, 350);
          return;
        }

        beginPlayback();
      };

      if (wasSynthesisBusy) {
        speechResumeTimerRef.current = setTimeout(startSpeakingSegments, 40);
      } else {
        startSpeakingSegments();
      }
    },
    [
      clearSleepTimer,
      saveListeningProgressLocal,
      stopDeviceSpeechSynthesis,
      stopSingleAudioElement,
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

  const seekToTime = useCallback(
    (seconds: number) => {
      if (!isDirectMp3Ref.current) return;
      const audio = audioRef.current;
      if (!audio) return;
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const clamped = dur > 0 ? Math.max(0, Math.min(dur, seconds)) : Math.max(0, seconds);
      try {
        audio.currentTime = clamped;
        setMp3CurrentTime(clamped);
        updateProgressBarDomNow();
        backgroundAudioManager.updatePositionState(dur, clamped, playbackRateRef.current);
      } catch {}
    },
    [updateProgressBarDomNow]
  );

  useEffect(() => {
    seekToTimeRef.current = seekToTime;
  }, [seekToTime]);

  const playDirectMp3Url = useCallback(
    async (
      novel: Novel,
      chapter: Chapter,
      mp3Url: string,
      sessionNonce: number,
      options?: { isAutoAdvance?: boolean; forceReload?: boolean; resumeAtSeconds?: number }
    ) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (!isChapterPlayableNow(novel, chapter)) {
        const pubAt = getChapterPublishAt(chapter);
        setAudioError(
          pubAt
            ? `Chương ${chapter.number} chưa đến giờ phát hành (${formatScheduleFull(pubAt)}).`
            : `Chương ${chapter.number} hiện chưa mở phát hành.`
        );
        stopSingleAudioElement(true);
        setIsPlaying(false);
        setIsLoading(false);
        return;
      }

      const cleanMp3Url = (mp3Url || '').trim();
      clearNetworkRecoveryTimer();
      stopDeviceSpeechSynthesis();

      const fallbackToDeviceTtsForChapter = async () => {
        if (sessionNonce !== playbackSessionIdRef.current || !isAudioModeRef.current) return;
        clearNetworkRecoveryTimer();
        setNetworkStatusMessage(null);
        setAudioError(null);

        stopSingleAudioElement(true);
        activeAudioChapterIdRef.current = null;
        activeAudioSrcRef.current = null;
        isDirectMp3Ref.current = false;
        setIsDirectMp3(false);
        setMp3CurrentTime(0);
        setMp3Duration(0);

        setFallbackNotice(
          `Chương ${chapter.number} không phát được MP3 — tự động chuyển sang Giọng Máy`
        );

        const fallbackKey = makeChapterCacheKey(novel.id, chapter.id);
        let parsedChunks = preparedChaptersRef.current.get(fallbackKey);

        if (!parsedChunks || parsedChunks.length === 0) {
          let textContent = chapter.content || '';
          if (!textContent.trim()) {
            setIsLoading(true);
            try {
              const fetched = await fetchFullChapterContent(
                novel.id,
                chapter.id,
                chapter.number,
                novel.updatedAt
              );
              if (sessionNonce !== playbackSessionIdRef.current || !isAudioModeRef.current) {
                return;
              }
              if (fetched?.content) {
                textContent = fetched.content;
                chapter.content = fetched.content;
              }
            } catch {}
          }
          if (textContent.trim()) {
            parsedChunks = buildChapterQueuedChunks(novel.id, chapter, textContent);
            if (parsedChunks.length > 0) {
              preparedChaptersRef.current.set(fallbackKey, parsedChunks);
            }
          }
        }

        if (sessionNonce !== playbackSessionIdRef.current || !isAudioModeRef.current) {
          return;
        }

        const finalChunks = parsedChunks || [];
        if (finalChunks.length === 0) {
          setIsLoading(false);
          setIsPlaying(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
          setIsMinimized(false);
          setAudioError(
            'Không thể phát tệp MP3 và chương này chưa có nội dung văn bản để đọc bằng Giọng Máy.'
          );
          return;
        }

        queueChunksRef.current = [...finalChunks];
        setChunks(finalChunks);
        chunksRef.current = finalChunks;
        setCurrentChunkIndex(0);
        currentChunkIndexRef.current = 0;
        activeQueueIndexRef.current = 0;
        isPlaybackActiveRef.current = true;
        isAdvancingChapterRef.current = false;
        setIsPlaying(true);
        setIsLoading(false);

        backgroundAudioManager.updateMetadata(
          formatChapterTitleForTTS(chapter),
          `${novel.title} • Giọng Máy`,
          novel.coverImage,
          'Đạo Tâm'
        );

        await playChunkRef.current(0);
      };

      if (!cleanMp3Url) {
        await fallbackToDeviceTtsForChapter();
        return;
      }

      const isSameLoadedSource =
        !options?.forceReload &&
        activeAudioChapterIdRef.current === chapter.id &&
        activeAudioSrcRef.current === cleanMp3Url &&
        Boolean(audio.src) &&
        audio.readyState >= 1 &&
        !audio.error &&
        !audio.ended;

      audio.onended = null;
      audio.onerror = null;
      audio.onstalled = null;
      audio.onwaiting = null;
      audio.onplaying = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;

      if (!isSameLoadedSource && !options?.isAutoAdvance) {
        try {
          audio.pause();
        } catch {}
      }

      isDirectMp3Ref.current = true;
      setIsDirectMp3(true);
      isAudioModeRef.current = true;
      setIsAudioMode(true);
      isPlaybackActiveRef.current = true;
      isAdvancingChapterRef.current = false;
      setAudioError(null);
      setFallbackNotice(null);
      if (!options?.forceReload) {
        networkRetryCountRef.current = 0;
        setNetworkStatusMessage(null);
      }
      setIsLoading(true);

      const token = `${sessionNonce}:::mp3:::${chapter.id}:::${cleanMp3Url}:::${Date.now()}`;
      activeChunkTokenRef.current = token;
      const preloadMarkerKey = `${sessionNonce}:::${chapter.id}:::${cleanMp3Url}`;

      const isMp3SessionValid = () =>
        isDirectMp3Ref.current &&
        sessionNonce === playbackSessionIdRef.current &&
        activeChunkTokenRef.current === token &&
        isAudioModeRef.current;

      const pendingResumeTime =
        typeof options?.resumeAtSeconds === 'number' && options.resumeAtSeconds > 0
          ? options.resumeAtSeconds
          : readMp3SavedPosition(chapter.id, cleanMp3Url);
      let hasAppliedResume = isSameLoadedSource;

      if (!isSameLoadedSource) {
        setMp3CurrentTime(pendingResumeTime > 1 ? pendingResumeTime : 0);
        setMp3Duration(0);
        lastKnownMp3TimeRef.current = pendingResumeTime > 1 ? pendingResumeTime : 0;
      }
      lastMp3TimeUiUpdateRef.current = 0;
      lastMp3PosSavedAtRef.current = Date.now();

      mp3RetryHandlerRef.current = () => {
        if (!isDirectMp3Ref.current || !isAudioModeRef.current) return;
        const resumeAt =
          networkLostTimeRef.current > 0
            ? networkLostTimeRef.current
            : lastKnownMp3TimeRef.current;
        playDirectMp3Url(novel, chapter, cleanMp3Url, ++playbackSessionIdRef.current, {
          isAutoAdvance: true,
          forceReload: true,
          resumeAtSeconds: resumeAt,
        });
      };

      const scheduleNetworkRecovery = (reason: 'stalled' | 'error') => {
        if (!isMp3SessionValid()) return;
        const curT =
          Number.isFinite(audio.currentTime) && audio.currentTime > 0
            ? audio.currentTime
            : lastKnownMp3TimeRef.current;
        networkLostTimeRef.current = curT;
        if (curT > 1) {
          saveMp3Position(chapter.id, curT, cleanMp3Url);
        }

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          waitingForOnlineRef.current = true;
          setIsLoading(true);
          setNetworkStatusMessage('Mất kết nối, đang chờ mạng...');
          return;
        }

        if (networkRetryCountRef.current < NETWORK_RECOVERY_MAX_RETRIES) {
          if (networkRetryTimerRef.current) return;
          networkRetryCountRef.current += 1;
          setIsLoading(true);
          setNetworkStatusMessage(
            reason === 'stalled'
              ? 'Mạng chậm, đang tải lại file MP3...'
              : 'Đang thử tải lại file MP3...'
          );
          networkRetryTimerRef.current = setTimeout(() => {
            networkRetryTimerRef.current = null;
            if (!isMp3SessionValid()) return;
            mp3RetryHandlerRef.current?.();
          }, NETWORK_RECOVERY_RETRY_DELAY_MS);
          return;
        }

        fallbackToDeviceTtsForChapter().catch(() => {});
      };

      const preloadNextAfterMp3 = async () => {
        if (!autoNextRef.current || !isMp3SessionValid()) return;
        if (directMp3PreloadedForRef.current.has(preloadMarkerKey)) return;
        directMp3PreloadedForRef.current.add(preloadMarkerKey);
        const nextChap = findNextChapterFor(chapter);
        if (!nextChap) return;
        try {
          await preloadChapterForAudio(novel, nextChap);
        } catch {}
      };

      audio.onloadedmetadata = () => {
        if (!isMp3SessionValid()) return;
        applyPlaybackRateLock(audio, playbackRateRef.current);
        const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (!hasAppliedResume && pendingResumeTime > 1 && dur > 0 && dur - pendingResumeTime > 5) {
          hasAppliedResume = true;
          try {
            audio.currentTime = pendingResumeTime;
            lastKnownMp3TimeRef.current = pendingResumeTime;
            setMp3CurrentTime(pendingResumeTime);
          } catch {}
        }
        setMp3Duration(dur);
        updateProgressBarDomNow();
        backgroundAudioManager.updatePositionState(
          dur,
          audio.currentTime,
          playbackRateRef.current
        );
      };

      audio.onplaying = () => {
        if (!isMp3SessionValid()) return;
        if (mp3StallDebounceTimerRef.current) {
          clearTimeout(mp3StallDebounceTimerRef.current);
          mp3StallDebounceTimerRef.current = null;
        }
        if (networkRetryTimerRef.current) {
          clearTimeout(networkRetryTimerRef.current);
          networkRetryTimerRef.current = null;
        }
        networkRetryCountRef.current = 0;
        waitingForOnlineRef.current = false;
        setNetworkStatusMessage(null);
        setIsLoading(false);
        setIsPlaying(true);
        applyPlaybackRateLock(audio, playbackRateRef.current);
        backgroundAudioManager.setPlaybackState('playing');
        const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (dur > 0) setMp3Duration(dur);
        backgroundAudioManager.updatePositionState(
          dur,
          audio.currentTime,
          playbackRateRef.current
        );
        if (autoNextRef.current) {
          preloadNextAfterMp3().catch(() => {});
        }
      };

      audio.ontimeupdate = () => {
        if (!isMp3SessionValid()) return;
        const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
        if (cur > 0) {
          lastKnownMp3TimeRef.current = cur;
        }
        const now = Date.now();
        if (cur > 1 && now - lastMp3PosSavedAtRef.current >= MP3_POSITION_SAVE_THROTTLE_MS) {
          lastMp3PosSavedAtRef.current = now;
          saveMp3Position(chapter.id, cur, cleanMp3Url);
        }
        if (now - lastMp3TimeUiUpdateRef.current >= 250) {
          lastMp3TimeUiUpdateRef.current = now;
          setMp3CurrentTime(cur);
          if (dur > 0) {
            setMp3Duration(dur);
            if (autoNextRef.current && (cur / dur >= 0.72 || dur - cur <= 20)) {
              preloadNextAfterMp3().catch(() => {});
            }
          }
          backgroundAudioManager.updatePositionState(dur, cur, playbackRateRef.current);
        }
      };

      audio.onwaiting = () => {
        if (!isMp3SessionValid()) return;
        setIsLoading(true);
      };

      audio.onstalled = () => {
        if (!isMp3SessionValid()) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          scheduleNetworkRecovery('stalled');
          return;
        }
        if (mp3StallDebounceTimerRef.current) {
          clearTimeout(mp3StallDebounceTimerRef.current);
        }
        const stalledAtTime = audio.currentTime;
        mp3StallDebounceTimerRef.current = setTimeout(() => {
          mp3StallDebounceTimerRef.current = null;
          if (!isMp3SessionValid()) return;
          if (audio.paused || audio.ended) return;
          if (Math.abs(audio.currentTime - stalledAtTime) < 0.1 && audio.readyState < 3) {
            scheduleNetworkRecovery('stalled');
          }
        }, 4000);
      };

      audio.onended = () => {
        if (!isMp3SessionValid()) return;
        clearNetworkRecoveryTimer();
        clearMp3SavedPosition(chapter.id, cleanMp3Url);
        lastKnownMp3TimeRef.current = 0;
        updateProgressBarDomNow(100);

        if (sleepTimerModeRef.current === 'end_of_chapter') {
          playbackSessionIdRef.current += 1;
          clearSleepTimer();
          stopDeviceSpeechSynthesis();
          setIsPlaying(false);
          setIsLoading(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
          return;
        }

        if (autoNextRef.current) {
          isAdvancingChapterRef.current = true;
          playNextChapterRef.current();
        } else {
          playbackSessionIdRef.current += 1;
          stopDeviceSpeechSynthesis();
          setIsPlaying(false);
          setIsLoading(false);
          isPlaybackActiveRef.current = false;
          backgroundAudioManager.pauseBackgroundPlayback();
        }
      };

      audio.onerror = () => {
        if (!isMp3SessionValid()) return;
        scheduleNetworkRecovery('error');
      };

      audio.loop = false;
      audio.removeAttribute('crossorigin');
      if (!isSameLoadedSource) {
        activeAudioChapterIdRef.current = chapter.id;
        activeAudioSrcRef.current = cleanMp3Url;
        audio.src = cleanMp3Url;
        audio.load();
      }
      applyPlaybackRateLock(audio, playbackRateRef.current);

      backgroundAudioManager.startBackgroundPlayback({
        title: formatChapterTitleForTTS(chapter),
        artist: `${novel.title} • ${formatVoiceArtistLabel(voiceIdRef.current)}`,
        album: 'Đạo Tâm',
        coverImage: novel.coverImage,
        onPlay: () => {
          resumeRef.current();
        },
        onPause: () => {
          pauseRef.current();
        },
        onNext: () => {
          playNextChapterRef.current();
        },
        onPrev: () => {
          playPrevChapterRef.current();
        },
      });

      const attemptPlay = async (allowAbortRetry: boolean): Promise<void> => {
        try {
          applyPlaybackRateLock(audio, playbackRateRef.current);
          await audio.play();
          if (!isMp3SessionValid()) return;
          applyPlaybackRateLock(audio, playbackRateRef.current);
          backgroundAudioManager.setPlaybackState('playing');
          setIsLoading(false);
          setIsPlaying(true);
        } catch (err: any) {
          if (!isMp3SessionValid()) return;
          if (isAbortLikeError(err)) {
            if (allowAbortRetry) {
              await new Promise((r) => setTimeout(r, 80));
              if (!isMp3SessionValid()) return;
              await attemptPlay(false);
              return;
            }
            setIsLoading(false);
            return;
          }
          if (err?.name === 'NotAllowedError') {
            setIsLoading(false);
            setIsPlaying(false);
            isPlaybackActiveRef.current = false;
            backgroundAudioManager.pauseBackgroundPlayback();
            return;
          }
          scheduleNetworkRecovery('error');
        }
      };

      await attemptPlay(true);
    },
    [
      applyPlaybackRateLock,
      clearNetworkRecoveryTimer,
      clearSleepTimer,
      findNextChapterFor,
      formatVoiceArtistLabel,
      preloadChapterForAudio,
      stopDeviceSpeechSynthesis,
      stopSingleAudioElement,
      updateProgressBarDomNow,
    ]
  );

  const play = useCallback(
    async (startIndex?: number) => {
      setAudioError(null);
      isAudioModeRef.current = true;
      setIsAudioMode(true);
      setIsBarVisible(true);

      if (isDirectMp3Ref.current && activeNovelRef.current && activeChapterRef.current) {
        const directUrl = resolveChapterVoiceAudioUrl(
          activeChapterRef.current,
          voiceIdRef.current
        );
        if (directUrl) {
          const audio = audioRef.current;
          if (
            audio &&
            activeAudioChapterIdRef.current === activeChapterRef.current.id &&
            activeAudioSrcRef.current === directUrl &&
            Boolean(audio.src) &&
            audio.readyState >= 1 &&
            !audio.ended &&
            !audio.error
          ) {
            isPlaybackActiveRef.current = true;
            try {
              audio.loop = false;
              audio.removeAttribute('crossorigin');
              applyPlaybackRateLock(audio, playbackRateRef.current);
              await audio.play();
              applyPlaybackRateLock(audio, playbackRateRef.current);
              setIsPlaying(true);
              setIsLoading(false);
              backgroundAudioManager.startBackgroundPlayback({
                title: formatChapterTitleForTTS(activeChapterRef.current),
                artist: `${activeNovelRef.current.title} • ${formatVoiceArtistLabel(voiceIdRef.current)}`,
                album: 'Đạo Tâm',
                coverImage: activeNovelRef.current.coverImage,
                onPlay: () => resumeRef.current(),
                onPause: () => pauseRef.current(),
                onNext: () => playNextChapterRef.current(),
                onPrev: () => playPrevChapterRef.current(),
              });
              return;
            } catch (err: any) {
              if (isAbortLikeError(err)) {
                setIsLoading(false);
                return;
              }
              if (err?.name === 'NotAllowedError') {
                setIsLoading(false);
                setIsPlaying(false);
                isPlaybackActiveRef.current = false;
                backgroundAudioManager.pauseBackgroundPlayback();
                return;
              }
            }
          }
          await playDirectMp3Url(
            activeNovelRef.current,
            activeChapterRef.current,
            directUrl,
            ++playbackSessionIdRef.current
          );
          return;
        }
      }

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
    [
      applyPlaybackRateLock,
      formatVoiceArtistLabel,
      playDirectMp3Url,
      resolveQueueIndexForChapterChunk,
      setIsBarVisible,
    ]
  );

  const pause = useCallback(() => {
    playbackSessionIdRef.current += 1;
    isPlaybackActiveRef.current = false;
    clearNetworkRecoveryTimer();
    setNetworkStatusMessage(null);
    if (isDirectMp3Ref.current && activeChapterRef.current && audioRef.current) {
      const curTime =
        Number.isFinite(audioRef.current.currentTime) && audioRef.current.currentTime > 1
          ? audioRef.current.currentTime
          : lastKnownMp3TimeRef.current;
      if (curTime > 1) {
        saveMp3Position(activeChapterRef.current.id, curTime, activeAudioSrcRef.current);
      }
    }
    setIsPlaying(false);
    setIsLoading(false);
    audioRef.current?.pause();
    stopDeviceSpeechSynthesis();
    backgroundAudioManager.pauseBackgroundPlayback();
    syncListeningProgressToDatabase(
      activeNovelRef.current,
      activeChapterRef.current,
      currentChunkIndexRef.current
    );
  }, [clearNetworkRecoveryTimer, stopDeviceSpeechSynthesis, syncListeningProgressToDatabase]);

  const resume = useCallback(async () => {
    setAudioError(null);
    isAudioModeRef.current = true;
    setIsAudioMode(true);
    setIsBarVisible(true);

    if (isDirectMp3Ref.current && activeNovelRef.current && activeChapterRef.current) {
      const audio = audioRef.current;
      const directUrl = resolveChapterVoiceAudioUrl(activeChapterRef.current, voiceIdRef.current);
      if (
        audio &&
        activeAudioChapterIdRef.current === activeChapterRef.current.id &&
        activeAudioSrcRef.current === directUrl &&
        Boolean(audio.src) &&
        audio.readyState >= 1 &&
        !audio.ended &&
        !audio.error
      ) {
        isPlaybackActiveRef.current = true;
        try {
          audio.loop = false;
          audio.removeAttribute('crossorigin');
          applyPlaybackRateLock(audio, playbackRateRef.current);
          await audio.play();
          applyPlaybackRateLock(audio, playbackRateRef.current);
          setIsPlaying(true);
          setIsLoading(false);
          backgroundAudioManager.startBackgroundPlayback({
            title: formatChapterTitleForTTS(activeChapterRef.current),
            artist: `${activeNovelRef.current.title} • ${formatVoiceArtistLabel(voiceIdRef.current)}`,
            album: 'Đạo Tâm',
            coverImage: activeNovelRef.current.coverImage,
            onPlay: () => resumeRef.current(),
            onPause: () => pauseRef.current(),
            onNext: () => playNextChapterRef.current(),
            onPrev: () => playPrevChapterRef.current(),
          });
          return;
        } catch (err: any) {
          if (isAbortLikeError(err)) {
            setIsLoading(false);
            return;
          }
          if (err?.name === 'NotAllowedError') {
            setIsLoading(false);
            setIsPlaying(false);
            isPlaybackActiveRef.current = false;
            backgroundAudioManager.pauseBackgroundPlayback();
            return;
          }
        }
      }
      if (directUrl) {
        await playDirectMp3Url(
          activeNovelRef.current,
          activeChapterRef.current,
          directUrl,
          ++playbackSessionIdRef.current
        );
        return;
      }
    }

    if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
      prefetchAbortRef.current = new AbortController();
    }
    if (activeQueueIndexRef.current < 0) {
      await play(0);
      return;
    }

    isPlaybackActiveRef.current = true;
    setIsPlaying(true);
    await playChunkRef.current(activeQueueIndexRef.current);
  }, [
    applyPlaybackRateLock,
    formatVoiceArtistLabel,
    play,
    playDirectMp3Url,
    setIsBarVisible,
  ]);

  const retryCurrentChunk = useCallback(async () => {
    setAudioError(null);
    setNetworkStatusMessage(null);
    networkRetryCountRef.current = 0;
    isAudioModeRef.current = true;
    setIsAudioMode(true);
    setIsBarVisible(true);

    if (isDirectMp3Ref.current && activeNovelRef.current && activeChapterRef.current) {
      const directUrl = resolveChapterVoiceAudioUrl(activeChapterRef.current, voiceIdRef.current);
      if (directUrl) {
        await playDirectMp3Url(
          activeNovelRef.current,
          activeChapterRef.current,
          directUrl,
          ++playbackSessionIdRef.current,
          {
            forceReload: true,
            resumeAtSeconds:
              networkLostTimeRef.current > 0
                ? networkLostTimeRef.current
                : lastKnownMp3TimeRef.current,
          }
        );
        return;
      }
    }

    if (!prefetchAbortRef.current || prefetchAbortRef.current.signal.aborted) {
      prefetchAbortRef.current = new AbortController();
    }

    const targetQueueIdx =
      activeQueueIndexRef.current >= 0
        ? activeQueueIndexRef.current
        : Math.max(0, currentChunkIndexRef.current);

    isPlaybackActiveRef.current = true;
    isAdvancingChapterRef.current = false;
    setIsPlaying(true);
    await playChunkRef.current(targetQueueIdx);
  }, [playDirectMp3Url, setIsBarVisible]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const seekToChunk = useCallback(
    async (index: number) => {
      if (isDirectMp3Ref.current) return;
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
    if (isDirectMp3Ref.current) {
      const a = audioRef.current;
      if (a) {
        seekToTime((a.currentTime || 0) + 15);
      }
      return;
    }
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
  }, [seekToTime]);

  const handleSkipPrev = useCallback(async () => {
    if (isDirectMp3Ref.current) {
      const a = audioRef.current;
      if (a) {
        seekToTime((a.currentTime || 0) - 15);
      }
      return;
    }
    const prevQueueIdx = Math.max(0, activeQueueIndexRef.current - 1);
    setAudioError(null);
    isAudioModeRef.current = true;
    setIsAudioMode(true);
    isPlaybackActiveRef.current = true;
    isAdvancingChapterRef.current = false;
    await playChunkRef.current(prevQueueIdx);
  }, [seekToTime]);

  useEffect(() => {
    skipNextRef.current = handleSkipNext;
    skipPrevRef.current = handleSkipPrev;
    pauseRef.current = pause;
    resumeRef.current = resume;
  }, [handleSkipNext, handleSkipPrev, pause, resume]);

  const setVoiceId = useCallback(
    (newVoice: string) => {
      const normalized = normalizeEdgeVoiceId(newVoice);
      const isExplicitDevice = isDeviceFallbackVoice(normalized);
      isUserExplicitDeviceVoiceRef.current = isExplicitDevice;
      preferredVoiceIdRef.current = normalized;
      setVoiceIdState(normalized);
      voiceIdRef.current = normalized;
      setAudioError(null);
      setFallbackNotice(null);
      setNetworkStatusMessage(null);

      try {
        const stored = safeGetItem('daotam_reader_settings');
        const parsed = stored ? JSON.parse(stored) : {};
        safeSetItem(
          'daotam_reader_settings',
          JSON.stringify({
            ...parsed,
            selectedVoiceId: normalized,
            selectedVoiceExplicitDevice: isExplicitDevice,
          })
        );
      } catch {}

      const curNovel = activeNovelRef.current;
      const curChap = activeChapterRef.current;
      if (!curNovel || !curChap) {
        return;
      }

      const wasActive =
        isPlaybackActiveRef.current || isBarVisibleRef.current || Boolean(audioErrorRef.current);
      const shouldAutoPlay = isPlaybackActiveRef.current || Boolean(audioErrorRef.current);

      playbackSessionIdRef.current += 1;
      stopAllAudioOutputs(true);
      activeAudioChapterIdRef.current = null;
      activeAudioSrcRef.current = null;

      if (wasActive) {
        playChapterRef.current(
          curNovel,
          curChap,
          shouldAutoPlay,
          chaptersListRef.current,
          shouldAutoPlay
        );
      }
    },
    [stopAllAudioOutputs]
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const clampedRate = Math.max(0.5, Math.min(3.0, Number(rate) || 1.0));
      setPlaybackRateState(clampedRate);
      playbackRateRef.current = clampedRate;
      applyPlaybackRateLock(audioRef.current, clampedRate);
      if (isDirectMp3Ref.current && audioRef.current) {
        backgroundAudioManager.updatePositionState(
          audioRef.current.duration,
          audioRef.current.currentTime,
          clampedRate
        );
      }
      safeSetItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY, String(clampedRate));
      try {
        const stored = safeGetItem('daotam_reader_settings');
        const parsed = stored ? JSON.parse(stored) : {};
        safeSetItem('daotam_reader_settings', JSON.stringify({ ...parsed, voiceSpeed: clampedRate }));
      } catch {}

      if (!isDirectMp3Ref.current && isPlaybackActiveRef.current && activeQueueIndexRef.current >= 0) {
        playbackSessionIdRef.current += 1;
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

      // Chặn tuyệt đối phát MP3 / đọc trước đối với chương chưa đến giờ phát hành (hoặc đang ẩn) với độc giả
      if (!isChapterPlayableNow(novel, chapter)) {
        inFlightChapterLoadKeyRef.current = '';
        stopAllAudioOutputs(false);
        const pubAt = getChapterPublishAt(chapter);
        setAudioError(
          pubAt
            ? `Chương ${chapter.number} chưa đến giờ phát hành (${formatScheduleFull(pubAt)}).`
            : `Chương ${chapter.number} hiện chưa mở phát hành.`
        );
        setIsPlaying(false);
        setIsLoading(false);
        return;
      }

      if (
        !userExplicitAction &&
        !options?.isAutoAdvance &&
        inFlightChapterLoadKeyRef.current === chapterRequestKey
      ) {
        return;
      }
      inFlightChapterLoadKeyRef.current = chapterRequestKey;

      const currentNonce = ++playbackSessionIdRef.current;
      isAdvancingChapterRef.current = false;
      directMp3PreloadedForRef.current.clear();
      const isAutoAdvance = Boolean(options?.isAutoAdvance);

      const isSavedDisabled = safeGetItem('daotam_audio_bar_visible') === 'false';
      const willActivateAudio = autoStart && (!isSavedDisabled || userExplicitAction);

      clearNetworkRecoveryTimer();
      setNetworkStatusMessage(null);
      resetPrefetchAbortController();
      if (!isAutoAdvance) {
        stopAllAudioOutputs(false);
      } else {
        stopDeviceSpeechSynthesis();
      }
      queueChunksRef.current = [];
      setChunks([]);
      chunksRef.current = [];
      setCurrentChunkIndex(-1);
      currentChunkIndexRef.current = -1;
      activeQueueIndexRef.current = -1;

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

      if (isSwitchingToAnotherChapter && prevNovel && prevChapter) {
        if (
          isDirectMp3Ref.current &&
          audioRef.current &&
          audioRef.current.currentTime > 1 &&
          !audioRef.current.ended
        ) {
          saveMp3Position(prevChapter.id, audioRef.current.currentTime, activeAudioSrcRef.current);
        }
        if (currentChunkIndexRef.current >= 0) {
          syncListeningProgressToDatabase(prevNovel, prevChapter, currentChunkIndexRef.current);
        }
      }

      if (Array.isArray(chapterList) && (chapterList?.length || 0) > 0) {
        const sorted = filterPlayableChapters(novel, chapterList).sort(
          (a, b) => Number(a.number) - Number(b.number)
        );
        setChaptersList(sorted);
        chaptersListRef.current = sorted;
      } else if (Array.isArray(novel.chapters) && (novel.chapters?.length || 0) > 0) {
        const sorted = filterPlayableChapters(novel, novel.chapters).sort(
          (a, b) => Number(a.number) - Number(b.number)
        );
        setChaptersList(sorted);
        chaptersListRef.current = sorted;
      }

      const matchedListChapter = chaptersListRef.current.find(
        (c) => c.id === chapter.id || Number(c.number) === Number(chapter.number)
      );
      const effectiveChapter: Chapter = {
        ...chapter,
        audioUrl: (chapter.audioUrl || matchedListChapter?.audioUrl || '').trim() || undefined,
        audioUrlMale:
          (chapter.audioUrlMale || matchedListChapter?.audioUrlMale || '').trim() || undefined,
        audioUrlFemale:
          (chapter.audioUrlFemale || matchedListChapter?.audioUrlFemale || '').trim() || undefined,
        mp3Url: (chapter.mp3Url || matchedListChapter?.mp3Url || '').trim() || undefined,
        maleAudioUrl:
          (chapter.maleAudioUrl || matchedListChapter?.maleAudioUrl || '').trim() || undefined,
        audio: (chapter.audio || matchedListChapter?.audio || '').trim() || undefined,
        femaleAudioUrl:
          (chapter.femaleAudioUrl || matchedListChapter?.femaleAudioUrl || '').trim() || undefined,
        mp3Female: (chapter.mp3Female || matchedListChapter?.mp3Female || '').trim() || undefined,
      };

      setAudioError(null);
      setFallbackNotice(null);
      setActiveNovel(novel);
      setActiveChapter(effectiveChapter);
      activeNovelRef.current = novel;
      activeChapterRef.current = effectiveChapter;

      if (!isSavedDisabled || userExplicitAction) {
        setIsBarVisible(true);
        if (userExplicitAction) {
          setIsMinimized(false);
        }
      }

      const initialAvailability = getNovelVoiceAvailability(
        novel,
        chaptersListRef.current,
        effectiveChapter
      );
      let resolvedVoice = resolveEffectiveVoiceForNovel(
        preferredVoiceIdRef.current,
        initialAvailability,
        effectiveChapter,
        { isUserExplicitDevice: isUserExplicitDeviceVoiceRef.current, chapterLinksLoaded: false }
      );
      if (voiceIdRef.current !== resolvedVoice) {
        voiceIdRef.current = resolvedVoice;
        setVoiceIdState(resolvedVoice);
      }
      let directAudioUrl = resolveChapterVoiceAudioUrl(effectiveChapter, resolvedVoice);
      if (!directAudioUrl && !isUserExplicitDeviceVoiceRef.current) {
        const maleUrl = resolveChapterVoiceAudioUrl(effectiveChapter, 'vi-VN-NamMinhNeural');
        const femaleUrl = resolveChapterVoiceAudioUrl(effectiveChapter, 'vi-VN-HoaiMyNeural');
        if (maleUrl) {
          resolvedVoice = 'vi-VN-NamMinhNeural';
          directAudioUrl = maleUrl;
        } else if (femaleUrl) {
          resolvedVoice = 'vi-VN-HoaiMyNeural';
          directAudioUrl = femaleUrl;
        }
        if (voiceIdRef.current !== resolvedVoice) {
          voiceIdRef.current = resolvedVoice;
          setVoiceIdState(resolvedVoice);
        }
      }
      const preferredMissingOnChapter =
        !isUserExplicitDeviceVoiceRef.current &&
        !resolveChapterVoiceAudioUrl(effectiveChapter, preferredVoiceIdRef.current);
      let effectiveNovel: Novel = novel;

      try {
        if (!directAudioUrl || preferredMissingOnChapter) {
          try {
            const fetched = await fetchFullChapterContent(
              novel.id,
              effectiveChapter.id,
              effectiveChapter.number,
              novel.updatedAt
            );
            if (currentNonce !== playbackSessionIdRef.current) return;
            if (fetched) {
              if (fetched.content && !effectiveChapter.content) {
                effectiveChapter.content = fetched.content;
              }
              let updatedLinks = false;
              const audioKeys: Array<keyof Pick<
                Chapter,
                | 'audioUrl'
                | 'audioUrlMale'
                | 'audioUrlFemale'
                | 'mp3Url'
                | 'maleAudioUrl'
                | 'audio'
                | 'femaleAudioUrl'
                | 'mp3Female'
              >> = [
                'audioUrl',
                'audioUrlMale',
                'audioUrlFemale',
                'mp3Url',
                'maleAudioUrl',
                'audio',
                'femaleAudioUrl',
                'mp3Female',
              ];
              for (const k of audioKeys) {
                const incoming = typeof fetched[k] === 'string' ? fetched[k]!.trim() : '';
                if (incoming && !effectiveChapter[k]) {
                  effectiveChapter[k] = incoming;
                  updatedLinks = true;
                }
              }
              const refreshedAvailability = getNovelVoiceAvailability(
                novel,
                chaptersListRef.current,
                effectiveChapter
              );
              resolvedVoice = resolveEffectiveVoiceForNovel(
                preferredVoiceIdRef.current,
                refreshedAvailability,
                effectiveChapter,
                { isUserExplicitDevice: isUserExplicitDeviceVoiceRef.current, chapterLinksLoaded: true }
              );
              if (voiceIdRef.current !== resolvedVoice) {
                voiceIdRef.current = resolvedVoice;
                setVoiceIdState(resolvedVoice);
              }
              directAudioUrl = resolveChapterVoiceAudioUrl(effectiveChapter, resolvedVoice);

              if (updatedLinks) {
                if (
                  (refreshedAvailability.hasMaleMp3 && !novel.hasMaleAudio) ||
                  (refreshedAvailability.hasFemaleMp3 && !novel.hasFemaleAudio)
                ) {
                  effectiveNovel = {
                    ...novel,
                    hasMaleAudio: Boolean(novel.hasMaleAudio || refreshedAvailability.hasMaleMp3),
                    hasFemaleAudio: Boolean(
                      novel.hasFemaleAudio || refreshedAvailability.hasFemaleMp3
                    ),
                    hasAudio: Boolean(
                      novel.hasAudio ||
                        refreshedAvailability.hasMaleMp3 ||
                        refreshedAvailability.hasFemaleMp3
                    ),
                  };
                  activeNovelRef.current = effectiveNovel;
                  setActiveNovel(effectiveNovel);
                }

                setActiveChapter({ ...effectiveChapter });
                activeChapterRef.current = effectiveChapter;
              }
            }
          } catch {}
        }

        if (directAudioUrl) {
          setFallbackNotice(null);
          if (willActivateAudio) {
            safeSetItem('daotam_audio_active', 'true');
            await playDirectMp3Url(effectiveNovel, effectiveChapter, directAudioUrl, currentNonce, {
              isAutoAdvance,
            });
          } else {
            isDirectMp3Ref.current = true;
            setIsDirectMp3(true);
            isPlaybackActiveRef.current = false;
            setIsPlaying(false);
            setIsLoading(false);
            stopAllAudioOutputs(false);
            backgroundAudioManager.pauseBackgroundPlayback();
          }
          return;
        }

        stopSingleAudioElement(true);
        activeAudioChapterIdRef.current = null;
        activeAudioSrcRef.current = null;
        isDirectMp3Ref.current = false;
        setIsDirectMp3(false);
        setMp3CurrentTime(0);
        setMp3Duration(0);

        // Chương này chưa có cả MP3 Nam Minh lẫn Hằng Nga -> chuyển sang Giọng Máy
        if (!isDeviceFallbackVoice(resolvedVoice)) {
          resolvedVoice = 'device-fallback';
          voiceIdRef.current = 'device-fallback';
          setVoiceIdState('device-fallback');
        }
        setFallbackNotice(null);

        let parsedChunks = preparedChaptersRef.current.get(chapterRequestKey);

        if (!parsedChunks || (parsedChunks?.length || 0) === 0) {
          let textContent = effectiveChapter.content || '';
          if (!textContent || textContent.trim().length === 0) {
            const pendingPreload = preloadPromisesRef.current.get(chapterRequestKey);
            if (pendingPreload) {
              parsedChunks = await pendingPreload;
            } else {
              setIsLoading(true);
              try {
                const fetched = await fetchFullChapterContent(
                  novel.id,
                  effectiveChapter.id,
                  effectiveChapter.number,
                  novel.updatedAt
                );
                if (currentNonce !== playbackSessionIdRef.current) return;
                if (fetched) {
                  if (fetched.content) {
                    textContent = fetched.content;
                    effectiveChapter.content = fetched.content;
                  }
                  let updatedLinks = false;
                  const audioKeys: Array<keyof Pick<
                    Chapter,
                    | 'audioUrl'
                    | 'audioUrlMale'
                    | 'audioUrlFemale'
                    | 'mp3Url'
                    | 'maleAudioUrl'
                    | 'audio'
                    | 'femaleAudioUrl'
                    | 'mp3Female'
                  >> = [
                    'audioUrl',
                    'audioUrlMale',
                    'audioUrlFemale',
                    'mp3Url',
                    'maleAudioUrl',
                    'audio',
                    'femaleAudioUrl',
                    'mp3Female',
                  ];
                  for (const k of audioKeys) {
                    const incoming = typeof fetched[k] === 'string' ? fetched[k]!.trim() : '';
                    if (incoming && !effectiveChapter[k]) {
                      effectiveChapter[k] = incoming;
                      updatedLinks = true;
                    }
                  }
                  if (updatedLinks) {
                    const refreshedAvailability = getNovelVoiceAvailability(
                      effectiveNovel,
                      chaptersListRef.current,
                      effectiveChapter
                    );
                    const refreshedVoice = resolveEffectiveVoiceForNovel(
                      preferredVoiceIdRef.current,
                      refreshedAvailability,
                      effectiveChapter,
                      { isUserExplicitDevice: isUserExplicitDeviceVoiceRef.current, chapterLinksLoaded: true }
                    );
                    if (voiceIdRef.current !== refreshedVoice) {
                      voiceIdRef.current = refreshedVoice;
                      setVoiceIdState(refreshedVoice);
                    }
                    const resolvedAfterFetch = resolveChapterVoiceAudioUrl(
                      effectiveChapter,
                      refreshedVoice
                    );
                    if (resolvedAfterFetch) {
                      setFallbackNotice(null);
                      setActiveChapter({ ...effectiveChapter });
                      activeChapterRef.current = effectiveChapter;
                      if (willActivateAudio) {
                        safeSetItem('daotam_audio_active', 'true');
                        await playDirectMp3Url(
                          effectiveNovel,
                          effectiveChapter,
                          resolvedAfterFetch,
                          currentNonce,
                          { isAutoAdvance }
                        );
                      } else {
                        isDirectMp3Ref.current = true;
                        setIsDirectMp3(true);
                      }
                      return;
                    }
                  }
                }
              } catch (e) {
                console.warn('Lỗi nạp văn bản chương cho Audio:', e);
              }
            }
          }

          if ((!parsedChunks || (parsedChunks?.length || 0) === 0) && textContent.trim().length > 0) {
            parsedChunks = buildChapterQueuedChunks(novel.id, effectiveChapter, textContent);
            if ((parsedChunks?.length || 0) > 0) {
              preparedChaptersRef.current.set(chapterRequestKey, parsedChunks);
            }
          }
        }

        if (currentNonce !== playbackSessionIdRef.current) return;

        const finalChunks = parsedChunks || [];
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
          syncListeningProgressToDatabase(novel, effectiveChapter, resumeChunkIdx);
        }

        if (willActivateAudio && (finalChunks?.length || 0) > 0) {
          isPlaybackActiveRef.current = true;
          setIsPlaying(true);
          safeSetItem('daotam_audio_active', 'true');
          backgroundAudioManager.updateMetadata(
            formatChapterTitleForTTS(effectiveChapter),
            `${novel.title} • Giọng Máy`,
            novel.coverImage,
            'Đạo Tâm'
          );
          await playChunkRef.current(resumeChunkIdx);
        } else {
          isPlaybackActiveRef.current = false;
          setIsPlaying(false);
          setIsLoading(false);
          stopAllAudioOutputs(false);
          backgroundAudioManager.pauseBackgroundPlayback();
          if (willActivateAudio && (finalChunks?.length || 0) === 0) {
            setAudioError('Chương này chưa có nội dung văn bản hoặc liên kết MP3 để phát.');
          }
        }
      } finally {
        if (inFlightChapterLoadKeyRef.current === chapterRequestKey) {
          inFlightChapterLoadKeyRef.current = null;
        }
      }
    },
    [
      clearNetworkRecoveryTimer,
      playDirectMp3Url,
      resetPrefetchAbortController,
      setIsBarVisible,
      stopAllAudioOutputs,
      stopDeviceSpeechSynthesis,
      syncListeningProgressToDatabase,
    ]
  );

  useEffect(() => {
    playChapterRef.current = playChapter;
  }, [playChapter]);

  const handlePlayNextChapter = useCallback(async () => {
    if (!isAudioModeRef.current) {
      isAdvancingChapterRef.current = false;
      pause();
      return;
    }

    const curChapter = activeChapterRef.current;
    const curNovel = activeNovelRef.current;
    const list = filterPlayableChapters(curNovel, chaptersListRef.current);
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
      if (!isChapterPlayableNow(curNovel, nextChap)) {
        isAdvancingChapterRef.current = false;
        stop();
        return;
      }
      broadcastAudioChapterChange(curNovel, nextChap);
      await playChapter(curNovel, nextChap, true, list, false, { isAutoAdvance: true });
    } else {
      isAdvancingChapterRef.current = false;
      stop();
    }
  }, [broadcastAudioChapterChange, filterPlayableChapters, isChapterPlayableNow, pause, playChapter, stop]);

  const handlePlayPrevChapter = useCallback(async () => {
    const curChapter = activeChapterRef.current;
    const curNovel = activeNovelRef.current;
    const list = filterPlayableChapters(curNovel, chaptersListRef.current);
    if (!curChapter || !curNovel || (list?.length || 0) === 0) return;

    const curIdx = list.findIndex(
      (c) => c.id === curChapter.id || Number(c.number) === Number(curChapter.number)
    );
    if (curIdx > 0) {
      const prevChap = list[curIdx - 1];
      if (!isChapterPlayableNow(curNovel, prevChap)) return;
      broadcastAudioChapterChange(curNovel, prevChap);
      await playChapter(curNovel, prevChap, true, list, true);
    }
  }, [broadcastAudioChapterChange, filterPlayableChapters, isChapterPlayableNow, playChapter]);

  useEffect(() => {
    playNextChapterRef.current = handlePlayNextChapter;
    playPrevChapterRef.current = handlePlayPrevChapter;
  }, [handlePlayNextChapter, handlePlayPrevChapter]);

  const closeBar = useCallback(() => {
    stop();
    setAudioError(null);
    setFallbackNotice(null);
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

  const progress = isDirectMp3
    ? mp3Duration > 0
      ? Math.min(100, Math.max(0, Math.round((mp3CurrentTime / mp3Duration) * 100)))
      : 0
    : (chunks?.length || 0) > 0 && currentChunkIndex >= 0
    ? Math.round(((currentChunkIndex + 1) / (chunks?.length || 1)) * 100)
    : 0;

  const currentChunk =
    currentChunkIndex >= 0 && currentChunkIndex < (chunks?.length || 0)
      ? chunks[currentChunkIndex]
      : null;

  const currentChunkText = currentChunk?.text || '';

  const availableVoiceIds = useMemo(() => {
    return getNovelVoiceAvailability(activeNovel, chaptersList, activeChapter).availableVoiceIds;
  }, [activeNovel, chaptersList, activeChapter]);

  return (
    <AudioContext.Provider
      value={{
        activeNovel: isMounted ? activeNovel : null,
        activeChapter: isMounted ? activeChapter : null,
        isAudioMode,
        isDirectMp3,
        mp3CurrentTime,
        mp3Duration,
        isPlaying,
        isLoading,
        audioError,
        fallbackNotice,
        currentChunkIndex,
        totalChunks: chunks?.length || 0,
        chunks,
        currentChunk,
        currentChunkText,
        voiceId,
        availableVoiceIds,
        playbackRate,
        progress,
        autoNext,
        sleepTimerMode,
        sleepTimerRemainingSec,
        networkStatusMessage,
        isBarVisible: isMounted ? isBarVisible : false,
        isMinimized,
        registerProgressBarRef,
        playChapter,
        setAudioMode,
        togglePlay,
        play,
        pause,
        resume,
        retryCurrentChunk,
        stop,
        skipNext: handleSkipNext,
        skipPrev: handleSkipPrev,
        seekToChunk,
        seekToTime,
        setVoiceId,
        setPlaybackRate,
        setAutoNext,
        setSleepTimer,
        setIsBarVisible,
        setIsMinimized,
        clearAudioError,
        clearFallbackNotice,
        closeBar,
        playNextChapter: handlePlayNextChapter,
        playPrevChapter: handlePlayPrevChapter,
      }}
    >
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
        aria-hidden="true"
        className="fixed -left-[9999px] top-0 w-px h-px opacity-0 pointer-events-none"
      />
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = (): AudioContextType => {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAudio must be used within AudioProvider');
  return context;
};
