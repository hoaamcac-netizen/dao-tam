import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type DocumentReference,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from './config';
import { fetchTtsAudioBlobWithWatchdog } from '../utils/audioChunker';

export type ChapterAudioCacheMap = Record<string, Record<string, string>>;

interface LoadedChapterState {
  docRef: DocumentReference | null;
  storageChapterKey: string;
  audioCache: ChapterAudioCacheMap;
  content?: string;
  loadedAt: number;
}

export interface ResolveChunkAudioParams {
  novelId: string;
  chapterId: string;
  chapterNumber?: number;
  chunkIndex: number;
  text: string;
  voiceId: string;
  signal?: AbortSignal;
  onRetryAttempt?: (attempt: number) => void;
}

export interface ResolveChunkAudioResult {
  url: string;
  source: 'ram-blob' | 'firestore-cache' | 'tts-uploaded';
  storageDownloadUrl?: string;
  persistPromise?: Promise<string | undefined>;
}

const MAX_RAM_BLOBS = 400;
const WRITE_COALESCE_MS = 250;
const TTS_FETCH_TIMEOUT_MS = 12000;
const TTS_MAX_RETRIES = 3;
const TTS_RETRY_DELAY_MS = 1500;

const ramBlobCache = new Map<string, string>();
const chunkUrlRamCache = new Map<string, string | null>();
const checkedChapterDocSet = new Set<string>();
const preloadedRemoteUrls = new Set<string>();
const chapterStateCache = new Map<string, LoadedChapterState>();
const chapterLoadPromises = new Map<string, Promise<LoadedChapterState>>();
const inFlightChunkTasks = new Map<string, Promise<ResolveChunkAudioResult>>();
const pendingFirestoreWrites = new Map<
  string,
  {
    novelId: string;
    chapterKey: string;
    fallbackDocId: string;
    docRef: DocumentReference | null;
    updates: Record<string, string>;
    timer: ReturnType<typeof setTimeout> | null;
  }
>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeKeySegment(val: string): string {
  return String(val || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function makeChapterStateKey(novelId: string, chapterId: string, chapterNumber?: number): string {
  return `${novelId}:::${chapterId || `c-${chapterNumber ?? 0}`}`;
}

function makeChunkKey(
  novelId: string,
  chapterId: string,
  voiceId: string,
  chunkIndex: number,
  chapterNumber?: number
): string {
  return `${makeChapterStateKey(novelId, chapterId, chapterNumber)}:::${sanitizeKeySegment(voiceId)}:::${chunkIndex}`;
}

function setRamBlobWithLimit(key: string, objectUrl: string): void {
  if (ramBlobCache.has(key)) {
    const prev = ramBlobCache.get(key);
    if (prev && prev !== objectUrl && prev.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prev);
      } catch {}
    }
    ramBlobCache.delete(key);
  } else if (ramBlobCache.size >= MAX_RAM_BLOBS) {
    const oldestKey = ramBlobCache.keys().next().value;
    if (oldestKey) {
      const oldestUrl = ramBlobCache.get(oldestKey);
      ramBlobCache.delete(oldestKey);
      if (oldestUrl && oldestUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(oldestUrl);
        } catch {}
      }
    }
  }
  ramBlobCache.set(key, objectUrl);
}

function getRamBlob(key: string): string | undefined {
  const url = ramBlobCache.get(key);
  if (url) {
    ramBlobCache.delete(key);
    ramBlobCache.set(key, url);
  }
  return url;
}

export function revokeAllRamAudioBlobs(): void {
  for (const url of ramBlobCache.values()) {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  }
  ramBlobCache.clear();
}

function normalizeAudioCacheField(raw: unknown): ChapterAudioCacheMap {
  const normalized: ChapterAudioCacheMap = {};
  if (!raw || typeof raw !== 'object') return normalized;

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const voiceMap: Record<string, string> = {};
      for (const [idx, url] of Object.entries(v as Record<string, unknown>)) {
        if (typeof url === 'string' && url.startsWith('http')) {
          voiceMap[String(idx)] = url;
        }
      }
      normalized[sanitizeKeySegment(k)] = voiceMap;
    } else if (typeof v === 'string' && v.startsWith('http')) {
      if (!normalized.default) normalized.default = {};
      normalized.default[String(k)] = v;
    }
  }
  return normalized;
}

export function warmRemoteUrlInBrowser(url: string): void {
  if (typeof window === 'undefined' || !url || url.startsWith('blob:')) return;
  if (preloadedRemoteUrls.has(url)) return;

  if (preloadedRemoteUrls.size >= 150) {
    const first = preloadedRemoteUrls.values().next().value;
    if (first) preloadedRemoteUrls.delete(first);
  }
  preloadedRemoteUrls.add(url);

  try {
    const preloader = new Audio();
    preloader.preload = 'auto';
    preloader.src = url;
    preloader.load();
  } catch {}
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Fetch audio thành Blob với try-catch + Retry tối đa 3 lần (cách nhau 1.5s)
 */
async function fetchAudioBlobWithRetry(
  url: string,
  maxRetries = TTS_MAX_RETRIES,
  onRetryAttempt?: (attempt: number) => void,
  externalSignal?: AbortSignal
): Promise<Blob> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (attempt > 0) {
      onRetryAttempt?.(attempt);
      await sleepWithAbort(TTS_RETRY_DELAY_MS, externalSignal);
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`TTS API failed with status ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength < 100) {
        throw new Error('Dữ liệu âm thanh trả về không hợp lệ');
      }
      return new Blob([arrayBuffer], { type: 'audio/mpeg' });
    } catch (err) {
      lastError = err;
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Không thể tải âm thanh sau 3 lần thử lại');
}

/**
 * KHÓA CHẶT READ FIRESTORE:
 * - Gọi getDoc ĐÚNG 1 LẦN duy nhất cho mỗi chương (lấy toàn bộ map audioCache & content)
 * - Lưu ngay vào RAM (chapterStateCache + checkedChapterDocSet + chunkUrlRamCache)
 * - Mọi chunk trong chương dùng lại RAM cache, TUYỆT ĐỐI không gọi getDoc lần 2.
 */
export async function ensureChapterAudioCacheLoaded(
  novelId: string,
  chapterId: string,
  chapterNumber?: number
): Promise<LoadedChapterState> {
  const stateKey = makeChapterStateKey(novelId, chapterId, chapterNumber);
  const existing = chapterStateCache.get(stateKey);
  if (existing || checkedChapterDocSet.has(stateKey)) {
    return (
      existing || {
        docRef: null,
        storageChapterKey: sanitizeKeySegment(chapterId || String(chapterNumber ?? '0')),
        audioCache: {},
        loadedAt: Date.now(),
      }
    );
  }

  const pendingLoad = chapterLoadPromises.get(stateKey);
  if (pendingLoad) {
    return pendingLoad;
  }

  const loadTask = (async (): Promise<LoadedChapterState> => {
    const primaryDocId =
      chapterId || (chapterNumber !== undefined && chapterNumber !== null ? String(chapterNumber) : '0');
    const refCandidate = doc(db, 'novels', novelId, 'chapters', primaryDocId);

    let resolvedRef: DocumentReference | null = null;
    let resolvedData: Record<string, any> | null = null;
    let storageChapterKey = primaryDocId;

    try {
      // Chỉ gọi getDoc ĐÚNG 1 LẦN duy nhất
      const snap = await getDoc(refCandidate);
      if (snap.exists()) {
        resolvedRef = refCandidate;
        resolvedData = snap.data() || {};
        storageChapterKey = snap.id;
      }
    } catch {
      // Giữ an toàn nếu mất mạng hoặc bị giới hạn quyền đọc
    } finally {
      checkedChapterDocSet.add(stateKey);
    }

    const normalizedCache = normalizeAudioCacheField(resolvedData?.audioCache);
    for (const [voiceSeg, idxMap] of Object.entries(normalizedCache)) {
      for (const [idxStr, url] of Object.entries(idxMap)) {
        const cKey = `${stateKey}:::${voiceSeg}:::${idxStr}`;
        chunkUrlRamCache.set(cKey, url);
      }
    }

    const state: LoadedChapterState = {
      docRef: resolvedRef,
      storageChapterKey: sanitizeKeySegment(storageChapterKey),
      audioCache: normalizedCache,
      content: typeof resolvedData?.content === 'string' ? resolvedData.content : undefined,
      loadedAt: Date.now(),
    };

    if (chapterStateCache.size > 40) {
      const oldestKey = chapterStateCache.keys().next().value;
      if (oldestKey) chapterStateCache.delete(oldestKey);
    }
    chapterStateCache.set(stateKey, state);
    return state;
  })().finally(() => {
    chapterLoadPromises.delete(stateKey);
  });

  chapterLoadPromises.set(stateKey, loadTask);
  return loadTask;
}

export function getCachedChunkAudioSync(
  novelId: string,
  chapterId: string,
  voiceId: string,
  chunkIndex: number,
  chapterNumber?: number
): string | undefined {
  const chunkKey = makeChunkKey(novelId, chapterId, voiceId, chunkIndex, chapterNumber);
  const ramUrl = getRamBlob(chunkKey);
  if (ramUrl) return ramUrl;

  const memoizedRemoteUrl = chunkUrlRamCache.get(chunkKey);
  if (memoizedRemoteUrl) return memoizedRemoteUrl;

  const stateKey = makeChapterStateKey(novelId, chapterId, chapterNumber);
  const state = chapterStateCache.get(stateKey);
  if (!state) return undefined;

  const safeVoice = sanitizeKeySegment(voiceId);
  return state.audioCache[safeVoice]?.[String(chunkIndex)] || state.audioCache.default?.[String(chunkIndex)];
}

async function flushPendingWritesForChapter(stateKey: string): Promise<void> {
  const entry = pendingFirestoreWrites.get(stateKey);
  if (!entry) return;

  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  const updatesToWrite = { ...entry.updates };
  pendingFirestoreWrites.delete(stateKey);

  if (Object.keys(updatesToWrite).length === 0) return;

  const targetRef =
    entry.docRef || doc(db, 'novels', entry.novelId, 'chapters', entry.fallbackDocId);

  try {
    if (entry.docRef) {
      await updateDoc(targetRef, updatesToWrite);
    } else {
      try {
        await updateDoc(targetRef, updatesToWrite);
      } catch (err: any) {
        if (err?.code === 'not-found') {
          const nested: ChapterAudioCacheMap = {};
          for (const [dotPath, url] of Object.entries(updatesToWrite)) {
            const [, voiceSeg, idxSeg] = dotPath.split('.');
            if (voiceSeg && idxSeg) {
              if (!nested[voiceSeg]) nested[voiceSeg] = {};
              nested[voiceSeg][idxSeg] = url;
            }
          }
          await setDoc(targetRef, { audioCache: nested }, { merge: true });
        } else {
          throw err;
        }
      }
    }
  } catch (err: any) {
    console.warn(
      `[FirebaseAudioCache] Không thể ghi audioCache vào Firestore (${targetRef.path}, user=${auth.currentUser?.uid || 'guest'}):`,
      err?.message || err
    );
  }
}

export async function flushAllPendingAudioCacheWrites(): Promise<void> {
  const keys = Array.from(pendingFirestoreWrites.keys());
  await Promise.all((keys || []).map((k) => flushPendingWritesForChapter(k)));
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushAllPendingAudioCacheWrites().catch(() => {});
  });
}

function queueChapterAudioCacheUpdate(
  novelId: string,
  chapterId: string,
  chapterNumber: number | undefined,
  docRef: DocumentReference | null,
  fallbackDocId: string,
  voiceKey: string,
  chunkIndex: number,
  downloadUrl: string
): void {
  const stateKey = makeChapterStateKey(novelId, chapterId, chapterNumber);
  const dotField = `audioCache.${voiceKey}.${chunkIndex}`;

  let entry = pendingFirestoreWrites.get(stateKey);
  if (!entry) {
    entry = {
      novelId,
      chapterKey: stateKey,
      fallbackDocId,
      docRef,
      updates: {},
      timer: null,
    };
    pendingFirestoreWrites.set(stateKey, entry);
  }

  if (docRef && !entry.docRef) {
    entry.docRef = docRef;
  }
  entry.updates[dotField] = downloadUrl;

  if (entry.timer) {
    clearTimeout(entry.timer);
  }

  if (Object.keys(entry.updates).length >= 4) {
    flushPendingWritesForChapter(stateKey).catch(() => {});
  } else {
    entry.timer = setTimeout(() => {
      flushPendingWritesForChapter(stateKey).catch(() => {});
    }, WRITE_COALESCE_MS);
  }
}

export async function resolveAndCacheChunkAudio(
  params: ResolveChunkAudioParams
): Promise<ResolveChunkAudioResult> {
  const { novelId, chapterId, chapterNumber, chunkIndex, text, voiceId, signal, onRetryAttempt } =
    params;
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error('Empty audio chunk text');
  }

  const safeVoice = sanitizeKeySegment(voiceId);
  const chunkKey = makeChunkKey(novelId, chapterId, voiceId, chunkIndex, chapterNumber);

  const ramUrl = getRamBlob(chunkKey);
  if (ramUrl) {
    return { url: ramUrl, source: 'ram-blob' };
  }

  const existingTask = inFlightChunkTasks.get(chunkKey);
  if (existingTask) {
    return existingTask;
  }

  const task = (async (): Promise<ResolveChunkAudioResult> => {
    const chapterState = await ensureChapterAudioCacheLoaded(novelId, chapterId, chapterNumber);
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const firestoreUrl =
      chapterState.audioCache[safeVoice]?.[String(chunkIndex)] ||
      chapterState.audioCache.default?.[String(chunkIndex)];

    if (firestoreUrl) {
      try {
        const cachedBlob = await fetchAudioBlobWithRetry(firestoreUrl, 1, undefined, signal);
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const objectUrl = URL.createObjectURL(cachedBlob);
        setRamBlobWithLimit(chunkKey, objectUrl);
        return {
          url: objectUrl,
          source: 'ram-blob',
          storageDownloadUrl: firestoreUrl,
        };
      } catch (err) {
        if (signal?.aborted) throw err;
        warmRemoteUrlInBrowser(firestoreUrl);
        return {
          url: firestoreUrl,
          source: 'firestore-cache',
          storageDownloadUrl: firestoreUrl,
        };
      }
    }

    const fetchedBlob = await fetchTtsAudioBlobWithWatchdog({
      text: cleanText,
      voiceId,
      signal,
      onRetryAttempt,
    });
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (!fetchedBlob) {
      throw new Error('Đoạn văn bản không có nội dung phát âm thanh');
    }
    const localBlobUrl = URL.createObjectURL(fetchedBlob);
    const audioBlob = fetchedBlob;
    setRamBlobWithLimit(chunkKey, localBlobUrl);

    const safeNovelId = sanitizeKeySegment(novelId);
    const safeChapterId =
      chapterState.storageChapterKey || sanitizeKeySegment(chapterId || String(chapterNumber ?? '0'));
    const storagePath = `audio_cache/${safeNovelId}/${safeChapterId}/${safeVoice}/${chunkIndex}.mp3`;

    if (!chapterState.audioCache[safeVoice]) {
      chapterState.audioCache[safeVoice] = {};
    }

    const persistPromise = (async (): Promise<string | undefined> => {
      try {
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, audioBlob, {
          contentType: 'audio/mpeg',
          cacheControl: 'public, max-age=31536000',
        });
        const downloadUrl = await getDownloadURL(storageRef);

        chapterState.audioCache[safeVoice][String(chunkIndex)] = downloadUrl;
        queueChapterAudioCacheUpdate(
          novelId,
          chapterId,
          chapterNumber,
          chapterState.docRef,
          safeChapterId,
          safeVoice,
          chunkIndex,
          downloadUrl
        );
        return downloadUrl;
      } catch (storageErr: any) {
        console.warn(
          `[FirebaseAudioCache] Upload Storage / updateDoc thất bại cho ${storagePath}:`,
          storageErr?.message || storageErr
        );
        return undefined;
      }
    })();

    persistPromise.catch(() => {});

    return {
      url: localBlobUrl,
      source: 'tts-uploaded',
      persistPromise,
    };
  })().finally(() => {
    inFlightChunkTasks.delete(chunkKey);
  });

  inFlightChunkTasks.set(chunkKey, task);
  return task;
}

export async function warmChapterAudioChunks(params: {
  novelId: string;
  chapterId: string;
  chapterNumber?: number;
  chunks: Array<{ text: string }>;
  voiceId: string;
  startIndex?: number;
  count?: number;
  signal?: AbortSignal;
}): Promise<void> {
  const {
    novelId,
    chapterId,
    chapterNumber,
    chunks,
    voiceId,
    startIndex = 0,
    count = 4,
    signal,
  } = params;
  if (!novelId || !Array.isArray(chunks) || (chunks?.length || 0) === 0 || signal?.aborted) return;

  await ensureChapterAudioCacheLoaded(novelId, chapterId, chapterNumber);
  if (signal?.aborted) return;

  const end = Math.min(chunks?.length || 0, startIndex + count);
  const jobs: Promise<unknown>[] = [];
  for (let i = Math.max(0, startIndex); i < end; i++) {
    const chunkText = chunks[i]?.text?.trim();
    if (!chunkText) continue;
    jobs.push(
      resolveAndCacheChunkAudio({
        novelId,
        chapterId,
        chapterNumber,
        chunkIndex: i,
        text: chunkText,
        voiceId,
        signal,
      })
        .then((res) => res.persistPromise)
        .catch(() => {})
    );
  }
  await Promise.all(jobs);
}
