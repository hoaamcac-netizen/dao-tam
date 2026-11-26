/**
 * ==============================================================================
 * TIỆN ÍCH BẢO VỆ VÀ TỐI ƯU HÓA BỘ NHỚ LOCALSTORAGE / SESSIONSTORAGE - ĐẠO TÂM
 *
 * Mục tiêu:
 * 1. Lưu đệm danh sách truyện (TTL 10 phút) với đầy đủ metadata nhẹ (bao gồm
 *    cờ hasMaleAudio / hasFemaleAudio), loại bỏ nội dung chữ dài.
 * 2. Lưu đệm nội dung chương đã mở vào localStorage (giữ tối đa 25 chương gần nhất)
 *    để F5 / đọc lại không tốn lượt đọc máy chủ (0 Reads).
 * 3. Bọc try...catch toàn bộ localStorage / sessionStorage và JSON.parse để
 *    tuyệt đối không bao giờ crash giao diện nếu trình duyệt chặn storage hoặc đầy bộ nhớ.
 * ==============================================================================
 */

export const NOVELS_CACHE_KEY = 'dao_tam_novels';
export const NOVELS_CACHE_TS_KEY = 'dao_tam_novels_cached_at';
export const GENRES_CACHE_TS_KEY = 'dao_tam_genres_cached_at';
export const NOVELS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 phút
export const MAX_CACHED_CHAPTER_KEYS = 25;
export const CHAPTER_CACHE_PREFIX = 'chapter_full_v4_';
export const CHAPTER_CACHE_TS_PREFIX = 'chapter_full_ts_v4_';

export function makeChapterCacheKey(novelId: string, chapKey: string | number): string {
  return `${CHAPTER_CACHE_PREFIX}${novelId}_${chapKey}`;
}

export function makeChapterCacheTsKey(novelId: string, chapKey: string | number): string {
  return `${CHAPTER_CACHE_TS_PREFIX}${novelId}_${chapKey}`;
}

export interface LightweightNovelStorage {
  id: string;
  title: string;
  author: string;
  coverImage: string;
  status?: string;
  totalChapters?: number;
  latestChapterTitle?: string;
  latestChapterNumber?: number;
  lastUpdated?: string;
  mainCategory?: string;
  categories?: string[];
  genres?: string[];
  views?: number;
  dailyViews?: number;
  rating?: number;
  flowerCount?: number;
  coinCount?: number;
  createdAt?: number;
  updatedAt?: number;
  lastChapterUpdatedAt?: number;
  slug?: string;
  isHidden?: boolean;
  publishStatus?: string;
  fullBookPriceXu?: number;
  fullBookDiscountPriceXu?: number;
  isOriginal?: boolean;
  isExclusive?: boolean;
  isShortStory?: boolean;
  isHot?: boolean;
  isSensitive?: boolean;
  hasAudio?: boolean;
  hasMaleAudio?: boolean;
  hasFemaleAudio?: boolean;
  mp3NamMinhCount?: number;
  mp3HangNgaCount?: number;
  latestPublishAt?: number;
  editor?: string;
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeSessionGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSessionSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeSessionRemoveItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}

/**
 * Giữ lại tối đa N chương cache v4 gần nhất (LRU theo timestamp chapter_full_ts_v4_*),
 * đồng thời dọn key cache cũ (v1/v2/v3) nếu còn sót.
 */
export function trimChapterCacheEntries(maxKeep: number = MAX_CACHED_CHAPTER_KEYS): void {
  if (typeof window === 'undefined') return;
  try {
    const entries: { dataKey: string; tsKey: string; ts: number }[] = [];
    const legacyKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(CHAPTER_CACHE_PREFIX)) {
        const suffix = key.slice(CHAPTER_CACHE_PREFIX.length);
        const tsKey = `${CHAPTER_CACHE_TS_PREFIX}${suffix}`;
        let ts = 0;
        try {
          const rawTs = window.localStorage.getItem(tsKey);
          ts = rawTs ? Number(rawTs) || 0 : 0;
        } catch {}
        entries.push({ dataKey: key, tsKey, ts });
      } else if (key.startsWith('chapter_full_') && !key.startsWith(CHAPTER_CACHE_TS_PREFIX)) {
        legacyKeys.push(key);
      }
    }

    legacyKeys.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    });

    if (entries.length <= maxKeep) return;

    entries.sort((a, b) => b.ts - a.ts);
    const toRemove = entries.slice(maxKeep);
    for (const item of toRemove) {
      try {
        window.localStorage.removeItem(item.dataKey);
        window.localStorage.removeItem(item.tsKey);
      } catch {}
    }
  } catch {}
}

/**
 * Tự động dọn dẹp các key cache nội dung chữ quá nặng (như chapter_full_v4_* & chapter_full_*)
 * để giải phóng dung lượng cho localStorage khi bộ nhớ đầy.
 */
export function cleanHeavyStorageCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key &&
        (key.startsWith(CHAPTER_CACHE_PREFIX) ||
          key.startsWith(CHAPTER_CACHE_TS_PREFIX) ||
          key.startsWith('chapter_full_') ||
          key.startsWith('dao_tam_real_comments_'))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

/**
 * Bọc an toàn tuyệt đối cho localStorage.setItem.
 * Nếu bị lỗi QuotaExceededError hoặc bất kỳ lỗi nào khác, chỉ thu gọn cache cũ và thử lại 1 lần.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
    const isQuota =
      error?.name === 'QuotaExceededError' ||
      error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error?.code === 22 ||
      error?.code === 1014 ||
      (error?.message && String(error.message).toLowerCase().includes('quota'));

    if (isQuota) {
      // Đầu tiên thu gọn xuống còn 8 chương mới nhất; nếu vẫn đầy mới dọn toàn bộ cache text
      trimChapterCacheEntries(8);
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        cleanHeavyStorageCache();
        try {
          window.localStorage.setItem(key, value);
          return true;
        } catch {
          return false;
        }
      }
    }
    return false;
  }
}

/**
 * Đọc an toàn từ localStorage
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Xóa an toàn khỏi localStorage
 */
export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

/**
 * Chuẩn hóa và loại bỏ toàn bộ các thuộc tính nội dung chữ (chapters, content, rawText...)
 * Giữ lại metadata nhẹ và 2 cờ hasMaleAudio / hasFemaleAudio để ẩn/hiện giọng đọc tức thì.
 */
export function stripNovelForStorage(novel: any): LightweightNovelStorage {
  const chaps = Array.isArray(novel?.chapters) ? novel.chapters : [];
  const latestCh = (chaps?.length || 0) > 0 ? chaps[(chaps?.length || 0) - 1] : null;
  const total =
    typeof novel?.totalChapters === 'number' && novel.totalChapters > 0
      ? novel.totalChapters
      : (chaps?.length || 0) > 0
      ? chaps?.length || 0
      : novel?.latestChapterNumber || 1;
  const latestTitle =
    latestCh?.title || novel?.latestChapterTitle || (total ? `Chương ${total}` : undefined);
  const latestNum = latestCh?.number || novel?.latestChapterNumber || total;

  const hasMaleFromChapters = chaps.some(
    (c: any) =>
      (typeof c?.audioUrlMale === 'string' && c.audioUrlMale.trim().length > 0) ||
      (typeof c?.audioUrl === 'string' && c.audioUrl.trim().length > 0) ||
      (typeof c?.mp3Url === 'string' && c.mp3Url.trim().length > 0) ||
      (typeof c?.maleAudioUrl === 'string' && c.maleAudioUrl.trim().length > 0) ||
      (typeof c?.audio === 'string' && c.audio.trim().length > 0)
  );
  const hasFemaleFromChapters = chaps.some(
    (c: any) =>
      (typeof c?.audioUrlFemale === 'string' && c.audioUrlFemale.trim().length > 0) ||
      (typeof c?.femaleAudioUrl === 'string' && c.femaleAudioUrl.trim().length > 0) ||
      (typeof c?.mp3Female === 'string' && c.mp3Female.trim().length > 0)
  );

  const hasMaleAudio =
    typeof novel?.hasMaleAudio === 'boolean'
      ? novel.hasMaleAudio || hasMaleFromChapters
      : hasMaleFromChapters;
  const hasFemaleAudio =
    typeof novel?.hasFemaleAudio === 'boolean'
      ? novel.hasFemaleAudio || hasFemaleFromChapters
      : hasFemaleFromChapters;

  const maleCountFromChapters = chaps.filter(
    (c: any) =>
      (typeof c?.audioUrlMale === 'string' && c.audioUrlMale.trim().length > 0) ||
      (typeof c?.audioUrl === 'string' && c.audioUrl.trim().length > 0) ||
      (typeof c?.mp3Url === 'string' && c.mp3Url.trim().length > 0) ||
      (typeof c?.maleAudioUrl === 'string' && c.maleAudioUrl.trim().length > 0) ||
      (typeof c?.audio === 'string' && c.audio.trim().length > 0)
  ).length;
  const femaleCountFromChapters = chaps.filter(
    (c: any) =>
      (typeof c?.audioUrlFemale === 'string' && c.audioUrlFemale.trim().length > 0) ||
      (typeof c?.femaleAudioUrl === 'string' && c.femaleAudioUrl.trim().length > 0) ||
      (typeof c?.mp3Female === 'string' && c.mp3Female.trim().length > 0)
  ).length;

  const mp3NamMinhCount =
    typeof novel?.mp3NamMinhCount === 'number' && Number.isFinite(novel.mp3NamMinhCount)
      ? novel.mp3NamMinhCount
      : chaps.length > 0
      ? maleCountFromChapters
      : undefined;
  const mp3HangNgaCount =
    typeof novel?.mp3HangNgaCount === 'number' && Number.isFinite(novel.mp3HangNgaCount)
      ? novel.mp3HangNgaCount
      : chaps.length > 0
      ? femaleCountFromChapters
      : undefined;

  let latestPublishAt =
    typeof novel?.latestPublishAt === 'number' && Number.isFinite(novel.latestPublishAt)
      ? novel.latestPublishAt
      : undefined;
  if (chaps.length > 0) {
    let maxPub = latestPublishAt || 0;
    for (const c of chaps) {
      const pub = Number(c?.publishAt ?? c?.scheduledPublishAt ?? 0);
      if (Number.isFinite(pub) && pub > maxPub) maxPub = pub;
    }
    if (maxPub > 0) latestPublishAt = maxPub;
  }

  return {
    id: String(novel?.id || ''),
    title: String(novel?.title || ''),
    author: String(novel?.author || 'Khuyết danh'),
    editor: novel?.editor,
    coverImage: String(novel?.coverImage || ''),
    status: novel?.status || 'Đang ra',
    totalChapters: total > 0 ? total : undefined,
    latestChapterTitle: latestTitle,
    latestChapterNumber: latestNum,
    lastUpdated: novel?.lastUpdated || 'Vừa xong',
    mainCategory: novel?.mainCategory,
    categories: Array.isArray(novel?.categories) ? novel.categories : undefined,
    genres: Array.isArray(novel?.genres) ? novel.genres : undefined,
    views: typeof novel?.views === 'number' ? novel.views : 0,
    dailyViews: typeof novel?.dailyViews === 'number' ? novel.dailyViews : 0,
    rating: typeof novel?.rating === 'number' ? novel.rating : 5,
    flowerCount: typeof novel?.flowerCount === 'number' ? novel.flowerCount : 0,
    coinCount: typeof novel?.coinCount === 'number' ? novel.coinCount : 0,
    createdAt: typeof novel?.createdAt === 'number' ? novel.createdAt : undefined,
    updatedAt: typeof novel?.updatedAt === 'number' ? novel.updatedAt : undefined,
    lastChapterUpdatedAt:
      typeof novel?.lastChapterUpdatedAt === 'number'
        ? novel.lastChapterUpdatedAt
        : typeof novel?.updatedAt === 'number'
        ? novel.updatedAt
        : undefined,
    slug: novel?.slug,
    isHidden: Boolean(novel?.isHidden),
    publishStatus: novel?.publishStatus,
    fullBookPriceXu: novel?.fullBookPriceXu,
    fullBookDiscountPriceXu: novel?.fullBookDiscountPriceXu,
    isOriginal: novel?.isOriginal,
    isExclusive: novel?.isExclusive,
    isShortStory: novel?.isShortStory,
    isHot: novel?.isHot,
    isSensitive: novel?.isSensitive,
    hasAudio: Boolean(novel?.hasAudio || hasMaleAudio || hasFemaleAudio),
    hasMaleAudio,
    hasFemaleAudio,
    ...(typeof mp3NamMinhCount === 'number' ? { mp3NamMinhCount } : {}),
    ...(typeof mp3HangNgaCount === 'number' ? { mp3HangNgaCount } : {}),
    ...(typeof latestPublishAt === 'number' ? { latestPublishAt } : {}),
  };
}

/**
 * Lưu danh sách truyện tối ưu vào localStorage kèm dấu thời gian cache (10 phút).
 * CHỈ lưu khi mảng có dữ liệu thật (> 0); nếu rỗng sẽ tự động xóa key cache cũ.
 */
export function saveNovelsToStorage(novels: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (!Array.isArray(novels) || novels.length === 0) {
      safeRemoveItem(NOVELS_CACHE_KEY);
      safeRemoveItem(NOVELS_CACHE_TS_KEY);
      return;
    }
    const minimalNovels: LightweightNovelStorage[] = novels
      .filter((n) => n && typeof n === 'object' && String(n.id || '').trim() && String(n.title || '').trim())
      .map(stripNovelForStorage);
    if (minimalNovels.length === 0) {
      safeRemoveItem(NOVELS_CACHE_KEY);
      safeRemoveItem(NOVELS_CACHE_TS_KEY);
      return;
    }
    const saved = safeSetItem(NOVELS_CACHE_KEY, JSON.stringify(minimalNovels));
    if (saved) {
      safeSetItem(NOVELS_CACHE_TS_KEY, String(Date.now()));
    } else if (minimalNovels.length > 150) {
      const savedTrimmed = safeSetItem(
        NOVELS_CACHE_KEY,
        JSON.stringify(minimalNovels.slice(0, 150))
      );
      if (savedTrimmed) {
        safeSetItem(NOVELS_CACHE_TS_KEY, String(Date.now()));
      }
    }
  } catch {}
}

export function clearNovelsStorageCache(): void {
  safeRemoveItem(NOVELS_CACHE_KEY);
  safeRemoveItem(NOVELS_CACHE_TS_KEY);
}

/**
 * Lấy danh sách truyện từ bộ nhớ đệm nếu còn hạn 10 phút và dữ liệu hợp lệ (tốn 0 lượt đọc máy chủ).
 * Tự động xóa key cache cũ nếu phát hiện dữ liệu lỗi / rỗng.
 */
export function getCachedNovelsIfFresh(ttlMs: number = NOVELS_CACHE_TTL_MS): any[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawNovels = safeGetItem(NOVELS_CACHE_KEY);
    if (!rawNovels) {
      safeRemoveItem(NOVELS_CACHE_TS_KEY);
      return null;
    }
    const parsed = safeJsonParse<any[]>(rawNovels, []);
    const valid = Array.isArray(parsed)
      ? parsed.filter((n) => n && typeof n === 'object' && String(n.id || '').trim() && String(n.title || '').trim())
      : [];
    if (valid.length === 0) {
      clearNovelsStorageCache();
      return null;
    }
    const tsRaw = safeGetItem(NOVELS_CACHE_TS_KEY);
    if (!tsRaw) return null;
    const cachedAt = Number(tsRaw);
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > ttlMs) {
      return null;
    }
    return valid;
  } catch {
    clearNovelsStorageCache();
    return null;
  }
}

export function invalidateNovelsCache(): void {
  safeRemoveItem(NOVELS_CACHE_TS_KEY);
}

export function clearChapterAudioCache(
  novelId: string,
  chapters?: Array<{ id?: string; number?: number | string }>
): void {
  if (!novelId || typeof window === 'undefined') return;

  try {
    if (Array.isArray(chapters) && chapters.length > 0) {
      const legacyPrefixes = [
        'chapter_full_',
        'chapter_full_ts_',
        'chapter_full_v2_',
        'chapter_full_ts_v2_',
        'chapter_full_v3_',
        'chapter_full_ts_v3_',
      ];
      for (const ch of chapters) {
        if (!ch) continue;
        if (ch.number !== undefined && ch.number !== null && String(ch.number).trim() !== '') {
          const numKey = String(ch.number).trim();
          safeRemoveItem(makeChapterCacheKey(novelId, numKey));
          safeRemoveItem(makeChapterCacheTsKey(novelId, numKey));
          safeSessionRemoveItem(makeChapterCacheKey(novelId, numKey));
          safeSessionRemoveItem(makeChapterCacheTsKey(novelId, numKey));
          for (const prefix of legacyPrefixes) {
            safeRemoveItem(`${prefix}${novelId}_${numKey}`);
            safeSessionRemoveItem(`${prefix}${novelId}_${numKey}`);
          }
        }
        if (ch.id && String(ch.id).trim() !== '') {
          const idKey = String(ch.id).trim();
          safeRemoveItem(makeChapterCacheKey(novelId, idKey));
          safeRemoveItem(makeChapterCacheTsKey(novelId, idKey));
          safeSessionRemoveItem(makeChapterCacheKey(novelId, idKey));
          safeSessionRemoveItem(makeChapterCacheTsKey(novelId, idKey));
          for (const prefix of legacyPrefixes) {
            safeRemoveItem(`${prefix}${novelId}_${idKey}`);
            safeSessionRemoveItem(`${prefix}${novelId}_${idKey}`);
          }
        }
      }
    } else {
      const localKeys: string[] = [];
      for (let i = 0; i < (window.localStorage?.length || 0); i++) {
        const k = window.localStorage.key(i);
        if (
          k &&
          (k.startsWith(`${CHAPTER_CACHE_PREFIX}${novelId}_`) ||
            k.startsWith(`${CHAPTER_CACHE_TS_PREFIX}${novelId}_`) ||
            ((k.startsWith('chapter_full_') || k.startsWith('chapter_full_ts_')) &&
              k.includes(`_${novelId}_`)))
        ) {
          localKeys.push(k);
        }
      }
      localKeys.forEach((k) => safeRemoveItem(k));
    }

    const sessionKeys: string[] = [];
    for (let i = 0; i < (window.sessionStorage?.length || 0); i++) {
      const k = window.sessionStorage.key(i);
      if (
        k &&
        (k.startsWith(`${CHAPTER_CACHE_PREFIX}${novelId}_`) ||
          k.startsWith(`${CHAPTER_CACHE_TS_PREFIX}${novelId}_`) ||
          ((k.startsWith('chapter_full_') || k.startsWith('chapter_full_ts_')) &&
            k.includes(`_${novelId}_`)) ||
          k.startsWith(`daotam_chapter_${novelId}_`))
      ) {
        sessionKeys.push(k);
      }
    }
    sessionKeys.forEach((k) => safeSessionRemoveItem(k));
  } catch {}

  invalidateNovelsCache();

  try {
    window.dispatchEvent(
      new CustomEvent('daotam:chapter-audio-cache-invalidated', {
        detail: { novelId, chapters },
      })
    );
  } catch {}
}

export interface ChapterAudioCachePatch {
  id?: string;
  number?: number | string;
  audioUrl?: string | null;
  audioUrlMale?: string | null;
  audioUrlFemale?: string | null;
  mp3Url?: string | null;
  maleAudioUrl?: string | null;
  audio?: string | null;
  femaleAudioUrl?: string | null;
  mp3Female?: string | null;
  updateMale?: boolean;
  updateFemale?: boolean;
}

export interface NovelAudioMetaCachePatch {
  mp3NamMinhCount?: number;
  mp3HangNgaCount?: number;
  hasMaleAudio?: boolean;
  hasFemaleAudio?: boolean;
  hasAudio?: boolean;
}

/**
 * Cập nhật/làm mới trực tiếp link MP3 vào cache localStorage & sessionStorage của bộ truyện
 * (không xóa timestamp cache danh sách truyện, tránh buộc đọc lại toàn bộ Firestore).
 */
export function syncChapterAudioInStorageCache(
  novelId: string,
  patches: ChapterAudioCachePatch[],
  novelMetaPatch?: NovelAudioMetaCachePatch
): void {
  if (!novelId || typeof window === 'undefined') return;

  const nowTs = Date.now();
  const tsStr = String(nowTs);
  const legacyPrefixes = [
    'chapter_full_',
    'chapter_full_ts_',
    'chapter_full_v2_',
    'chapter_full_ts_v2_',
    'chapter_full_v3_',
    'chapter_full_ts_v3_',
  ];

  const applyPatchToRecord = (
    record: Record<string, any>,
    patch: ChapterAudioCachePatch
  ): Record<string, any> => {
    const next: Record<string, any> = { ...record, cachedAt: nowTs };
    const shouldUpdateMale =
      patch.updateMale === true ||
      patch.audioUrlMale !== undefined ||
      patch.audioUrl !== undefined;
    const shouldUpdateFemale =
      patch.updateFemale === true || patch.audioUrlFemale !== undefined;

    if (shouldUpdateMale) {
      const cleanMale =
        typeof patch.audioUrlMale === 'string' && patch.audioUrlMale.trim()
          ? patch.audioUrlMale.trim()
          : typeof patch.audioUrl === 'string' && patch.audioUrl.trim()
          ? patch.audioUrl.trim()
          : '';
      if (cleanMale) {
        next.audioUrlMale = cleanMale;
        next.audioUrl = cleanMale;
      } else {
        delete next.audioUrlMale;
        delete next.audioUrl;
      }
      delete next.mp3Url;
      delete next.maleAudioUrl;
      delete next.audio;
    }

    if (shouldUpdateFemale) {
      const cleanFemale =
        typeof patch.audioUrlFemale === 'string' && patch.audioUrlFemale.trim()
          ? patch.audioUrlFemale.trim()
          : '';
      if (cleanFemale) {
        next.audioUrlFemale = cleanFemale;
      } else {
        delete next.audioUrlFemale;
      }
      delete next.femaleAudioUrl;
      delete next.mp3Female;
    }

    return next;
  };

  const patchSingleStorageKey = (
    storageType: 'local' | 'session',
    dataKey: string,
    tsKey: string,
    patch: ChapterAudioCachePatch
  ) => {
    const raw = storageType === 'local' ? safeGetItem(dataKey) : safeSessionGetItem(dataKey);
    if (!raw) return;
    if (raw.trim().startsWith('{')) {
      const parsed = safeJsonParse<Record<string, any> | null>(raw, null);
      if (parsed && typeof parsed === 'object') {
        const updated = applyPatchToRecord(parsed, patch);
        const serialized = JSON.stringify(updated);
        if (storageType === 'local') {
          safeSetItem(dataKey, serialized);
          safeSetItem(tsKey, tsStr);
        } else {
          safeSessionSetItem(dataKey, serialized);
          safeSessionSetItem(tsKey, tsStr);
        }
        return;
      }
    }
    // Xóa cache định dạng cũ không tương thích để tránh giữ link cũ
    if (storageType === 'local') {
      safeRemoveItem(dataKey);
      safeRemoveItem(tsKey);
    } else {
      safeSessionRemoveItem(dataKey);
      safeSessionRemoveItem(tsKey);
    }
  };

  try {
    if (Array.isArray(patches) && patches.length > 0) {
      for (const patch of patches) {
        if (!patch) continue;
        const keys: string[] = [];
        if (
          patch.number !== undefined &&
          patch.number !== null &&
          String(patch.number).trim() !== ''
        ) {
          keys.push(String(patch.number).trim());
        }
        if (patch.id && String(patch.id).trim() !== '') {
          const idKey = String(patch.id).trim();
          if (!keys.includes(idKey)) keys.push(idKey);
        }

        for (const chapKey of keys) {
          const dataKey = makeChapterCacheKey(novelId, chapKey);
          const tsKey = makeChapterCacheTsKey(novelId, chapKey);
          patchSingleStorageKey('local', dataKey, tsKey, patch);
          patchSingleStorageKey('session', dataKey, tsKey, patch);

          // Dọn sạch các key cache đời cũ (v1/v2/v3) & sessionStorage cũ của chương này
          for (const prefix of legacyPrefixes) {
            safeRemoveItem(`${prefix}${novelId}_${chapKey}`);
            safeSessionRemoveItem(`${prefix}${novelId}_${chapKey}`);
          }
          safeSessionRemoveItem(`daotam_chapter_${novelId}_${chapKey}`);
        }
      }
    }

    // Cập nhật trực tiếp metadata MP3 của bộ truyện trong dao_tam_novels (localStorage) mà KHÔNG hủy TTL
    if (novelMetaPatch) {
      const rawNovels = safeGetItem(NOVELS_CACHE_KEY);
      if (rawNovels) {
        const parsedNovels = safeJsonParse<any[]>(rawNovels, []);
        if (Array.isArray(parsedNovels) && parsedNovels.length > 0) {
          let changed = false;
          const nextNovels = parsedNovels.map((n) => {
            if (!n || n.id !== novelId) return n;
            changed = true;
            return {
              ...n,
              ...(typeof novelMetaPatch.mp3NamMinhCount === 'number'
                ? { mp3NamMinhCount: Math.max(0, novelMetaPatch.mp3NamMinhCount) }
                : {}),
              ...(typeof novelMetaPatch.mp3HangNgaCount === 'number'
                ? { mp3HangNgaCount: Math.max(0, novelMetaPatch.mp3HangNgaCount) }
                : {}),
              ...(typeof novelMetaPatch.hasMaleAudio === 'boolean'
                ? { hasMaleAudio: novelMetaPatch.hasMaleAudio }
                : {}),
              ...(typeof novelMetaPatch.hasFemaleAudio === 'boolean'
                ? { hasFemaleAudio: novelMetaPatch.hasFemaleAudio }
                : {}),
              ...(typeof novelMetaPatch.hasAudio === 'boolean'
                ? { hasAudio: novelMetaPatch.hasAudio }
                : {}),
              updatedAt: nowTs,
            };
          });
          if (changed) {
            safeSetItem(NOVELS_CACHE_KEY, JSON.stringify(nextNovels));
            safeSetItem(NOVELS_CACHE_TS_KEY, tsStr);
          }
        }
      }

      // Đồng bộ nếu sessionStorage cũng có bản sao danh sách truyện
      const rawSessionNovels = safeSessionGetItem(NOVELS_CACHE_KEY);
      if (rawSessionNovels) {
        const parsedSession = safeJsonParse<any[]>(rawSessionNovels, []);
        if (Array.isArray(parsedSession) && parsedSession.length > 0) {
          const nextSession = parsedSession.map((n) =>
            n && n.id === novelId
              ? {
                  ...n,
                  ...novelMetaPatch,
                  updatedAt: nowTs,
                }
              : n
          );
          safeSessionSetItem(NOVELS_CACHE_KEY, JSON.stringify(nextSession));
        }
      }
    }
  } catch {}
}

export function isGenresCacheFresh(ttlMs: number = NOVELS_CACHE_TTL_MS): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const tsRaw = safeGetItem(GENRES_CACHE_TS_KEY);
    if (!tsRaw) return false;
    const ts = Number(tsRaw);
    return Number.isFinite(ts) && Date.now() - ts <= ttlMs;
  } catch {
    return false;
  }
}

export function markGenresCacheFresh(): void {
  safeSetItem(GENRES_CACHE_TS_KEY, String(Date.now()));
}
