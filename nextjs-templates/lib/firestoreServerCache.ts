import { cache } from 'react';
import { unstable_cache } from 'next/cache';

/**
 * ==============================================================================
 * FIRESTORE SERVER CACHE (NEXT.JS ISR - REVALIDATE 3600 GIÂY / 1 TIẾNG)
 * ==============================================================================
 * - Sử dụng Firestore REST API kết hợp `fetch(..., { next: { revalidate: 3600 } })`
 *   và `unstable_cache` + `React.cache` để:
 *   1. Giảm tải 99% lượt Read (đọc) trùng lặp vào Firestore khi độc giả truy cập lại.
 *   2. Dùng chung kết quả giữa `generateMetadata()` và Server Component `Page`
 *      (0 lượt đọc dư thừa trong cùng 1 request).
 *   3. Không bị phụ thuộc vào Firebase Client SDK (tránh lỗi SSR/Edge runtime).
 * ==============================================================================
 */

export const ISR_REVALIDATE_SECONDS = 3600;

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'https://dao-tam-doc-truyen.vercel.app'
).replace(/\/+$/, '');

export const DEFAULT_COVER_IMAGE = `${SITE_URL}/logo.png`;

const FIREBASE_PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'plated-deck-s01dl';
const FIREBASE_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCvw3zl689nKztUfWWfHNAmMhimkqk-K-Y';
const FIRESTORE_DATABASE_ID =
  process.env.NEXT_PUBLIC_FIRESTORE_DB_ID ||
  'ai-studio-otmctruynaudio49-1c1e7da8-7d35-4a82-b911-2cc573ae50db';

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;

export interface CachedChapter {
  id: string;
  number: number;
  title: string;
  slug?: string;
  content?: string;
  isVip?: boolean;
  priceXu?: number;
  publishedDate?: string;
  wordCount?: number;
}

export interface CachedNovel {
  id: string;
  title: string;
  author: string;
  editor?: string;
  slug?: string;
  coverImage?: string;
  description?: string;
  mainCategory?: string;
  categories: string[];
  genres?: string[];
  status?: string;
  views?: number;
  flowerCount?: number;
  totalChapters?: number;
  latestChapterTitle?: string;
  chapters?: CachedChapter[];
  updatedAt?: number;
}

export interface ChapterFetchResult {
  novel: CachedNovel | null;
  chapter: CachedChapter | null;
  chaptersList: CachedChapter[];
  /** True nếu nội dung chương chưa nhúng trong doc chính hoặc subcollection yêu cầu Auth client */
  needsClientAuthContent: boolean;
}

// ============================================================================
// BỘ PARSER FIRESTORE REST VALUE -> JAVASCRIPT OBJECT THUẦN
// ============================================================================
function parseFirestoreValue(value: any): any {
  if (!value || typeof value !== 'object') return null;

  if ('stringValue' in value) return String(value.stringValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) {
    const ms = Date.parse(value.timestampValue);
    return Number.isNaN(ms) ? value.timestampValue : ms;
  }
  if ('arrayValue' in value) {
    const vals = value.arrayValue?.values;
    return Array.isArray(vals) ? (vals || []).map(parseFirestoreValue) : [];
  }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = parseFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function parseFirestoreDocument(doc: any): Record<string, any> | null {
  if (!doc || !doc.name) return null;
  const id = String(doc.name).split('/').pop() || '';
  const fields = doc.fields || {};
  const result: Record<string, any> = { id };
  for (const [key, val] of Object.entries(fields)) {
    result[key] = parseFirestoreValue(val);
  }
  return result;
}

async function fetchFirestoreDocRest(
  collectionPath: string,
  docId: string
): Promise<Record<string, any> | null> {
  if (!docId) return null;
  const encodedPath = collectionPath
    .split('/')
    ?.map((seg) => encodeURIComponent(seg))
    .join('/');
  const url = `${FIRESTORE_BASE_URL}/${encodedPath}/${encodeURIComponent(docId)}?key=${encodeURIComponent(FIREBASE_API_KEY)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      next: { revalidate: ISR_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseFirestoreDocument(data);
  } catch {
    return null;
  }
}

async function runFirestoreQueryRest(
  collectionId: string,
  structuredQuery: Record<string, any>,
  parentDocPath?: string
): Promise<Record<string, any>[]> {
  const basePath = parentDocPath
    ? `${FIRESTORE_BASE_URL}/${parentDocPath}:runQuery`
    : `${FIRESTORE_BASE_URL}:runQuery`;
  const url = `${basePath}?key=${encodeURIComponent(FIREBASE_API_KEY)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          ...structuredQuery,
        },
      }),
      next: { revalidate: ISR_REVALIDATE_SECONDS },
    });

    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];

    const docs: Record<string, any>[] = [];
    for (const row of rows) {
      if (row?.document) {
        const parsed = parseFirestoreDocument(row.document);
        if (parsed) docs.push(parsed);
      }
    }
    return docs;
  } catch {
    return [];
  }
}

function normalizeNovel(raw: Record<string, any>): CachedNovel {
  const chaptersRaw = Array.isArray(raw?.chapters) ? raw.chapters : [];
  const chapters: CachedChapter[] = (chaptersRaw || []).map((ch: any, idx: number) => ({
    id: String(ch?.id || `chuong-${ch?.number ?? idx + 1}`),
    number: Number(ch?.number ?? idx + 1),
    title: String(ch?.title || `Chương ${ch?.number ?? idx + 1}`),
    slug: ch?.slug ? String(ch.slug) : `chuong-${ch?.number ?? idx + 1}`,
    content: typeof ch?.content === 'string' ? ch.content : undefined,
    isVip: Boolean(ch?.isVip),
    priceXu: typeof ch?.priceXu === 'number' ? ch.priceXu : undefined,
    publishedDate: ch?.publishedDate ? String(ch.publishedDate) : undefined,
    wordCount: typeof ch?.wordCount === 'number' ? ch.wordCount : undefined,
  }));

  chapters.sort((a, b) => (a.number || 0) - (b.number || 0));

  const normalizedCategories = Array.isArray(raw?.categories)
    ? (raw.categories || []).map(String)
    : Array.isArray(raw?.genres)
    ? (raw.genres || []).map(String)
    : [];
  const normalizedGenres = Array.isArray(raw?.genres)
    ? (raw.genres || []).map(String)
    : normalizedCategories;

  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || 'Đạo Tâm Truyện'),
    author: String(raw?.author || 'Đang cập nhật'),
    editor: raw?.editor ? String(raw.editor) : undefined,
    slug: raw?.slug ? String(raw.slug) : undefined,
    coverImage: raw?.coverImage ? String(raw.coverImage) : undefined,
    description: raw?.description ? String(raw.description) : undefined,
    mainCategory: raw?.mainCategory ? String(raw.mainCategory) : undefined,
    categories: normalizedCategories,
    genres: normalizedGenres,
    status: raw?.status ? String(raw.status) : 'Đang ra',
    views: typeof raw?.views === 'number' ? raw.views : 0,
    flowerCount: typeof raw?.flowerCount === 'number' ? raw.flowerCount : 0,
    totalChapters:
      typeof raw?.totalChapters === 'number' && raw.totalChapters > 0
        ? raw.totalChapters
        : (chapters?.length || 0),
    latestChapterTitle: raw?.latestChapterTitle ? String(raw.latestChapterTitle) : undefined,
    chapters,
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : undefined,
  };
}

async function fetchNovelUncached(rawIdentifier: string): Promise<CachedNovel | null> {
  let decoded = '';
  try {
    decoded = decodeURIComponent(rawIdentifier).trim();
  } catch {
    decoded = rawIdentifier.trim();
  }
  if (!decoded) return null;

  // Bước 1: Tìm trong collection 'novels' theo slug == decoded
  const slugMatches = await runFirestoreQueryRest('novels', {
    where: {
      fieldFilter: {
        field: { fieldPath: 'slug' },
        op: 'EQUAL',
        value: { stringValue: decoded },
      },
    },
    limit: 1,
  });

  if ((slugMatches?.length || 0) > 0) {
    return normalizeNovel(slugMatches[0]);
  }

  // Thử chữ thường nếu slug có ký tự hoa
  const lower = decoded.toLowerCase();
  if (lower !== decoded) {
    const lowerMatches = await runFirestoreQueryRest('novels', {
      where: {
        fieldFilter: {
          field: { fieldPath: 'slug' },
          op: 'EQUAL',
          value: { stringValue: lower },
        },
      },
      limit: 1,
    });
    if ((lowerMatches?.length || 0) > 0) {
      return normalizeNovel(lowerMatches[0]);
    }
  }

  // Bước 2: Fallback tìm trực tiếp theo Document ID trong 'novels'
  const byId = await fetchFirestoreDocRest('novels', decoded);
  if (byId) {
    return normalizeNovel(byId);
  }

  // Bước 3: Fallback collection 'stories' (legacy)
  const storySlugMatches = await runFirestoreQueryRest('stories', {
    where: {
      fieldFilter: {
        field: { fieldPath: 'slug' },
        op: 'EQUAL',
        value: { stringValue: decoded },
      },
    },
    limit: 1,
  });
  if ((storySlugMatches?.length || 0) > 0) {
    return normalizeNovel(storySlugMatches[0]);
  }

  const storyById = await fetchFirestoreDocRest('stories', decoded);
  if (storyById) {
    return normalizeNovel(storyById);
  }

  return null;
}

const getNovelDataCached = unstable_cache(
  async (identifier: string) => fetchNovelUncached(identifier),
  ['daotam-novel-detail-v1'],
  { revalidate: ISR_REVALIDATE_SECONDS }
);

/**
 * Lấy thông tin truyện theo slug hoặc ID — được cache 1 tiếng (ISR) + deduplicate trong cùng request
 */
export const getNovelByIdentifierCached = cache(
  async (novelId: string): Promise<CachedNovel | null> => {
    return getNovelDataCached(novelId);
  }
);

async function fetchChapterUncached(
  rawNovelId: string,
  rawChapterId: string
): Promise<ChapterFetchResult> {
  const novel = await getNovelByIdentifierCached(rawNovelId);
  if (!novel) {
    return {
      novel: null,
      chapter: null,
      chaptersList: [],
      needsClientAuthContent: false,
    };
  }

  let decodedChapterId = '';
  try {
    decodedChapterId = decodeURIComponent(rawChapterId).trim();
  } catch {
    decodedChapterId = rawChapterId.trim();
  }

  let chaptersList = Array.isArray(novel.chapters) ? [...novel.chapters] : [];

  // Nếu doc chính chưa có danh sách chương, thử query subcollection chapters (nếu rules cho phép)
  if ((chaptersList?.length || 0) === 0) {
    const subDocs = await runFirestoreQueryRest(
      'chapters',
      {
        orderBy: [{ field: { fieldPath: 'number' }, direction: 'ASCENDING' }],
        limit: 150,
      },
      `novels/${encodeURIComponent(novel.id)}`
    );

    if ((subDocs?.length || 0) > 0) {
      chaptersList = (subDocs || []).map((d, idx) => ({
        id: String(d.id),
        number: Number(d.number ?? idx + 1),
        title: String(d.title || `Chương ${d.number ?? idx + 1}`),
        slug: d.slug ? String(d.slug) : `chuong-${d.number ?? idx + 1}`,
        content: typeof d.content === 'string' ? d.content : undefined,
        isVip: Boolean(d.isVip),
        priceXu: typeof d.priceXu === 'number' ? d.priceXu : undefined,
        publishedDate: d.publishedDate ? String(d.publishedDate) : undefined,
      }));
    }
  }

  chaptersList.sort((a, b) => (a.number || 0) - (b.number || 0));

  const parsedNum = parseInt(decodedChapterId.replace(/[^0-9]/g, ''), 10) || 1;
  let targetChapter = (chaptersList || []).find(
    (c) =>
      c.id === decodedChapterId ||
      c.slug === decodedChapterId ||
      (typeof c.number === 'number' && c.number === parsedNum)
  );

  let needsClientAuthContent = false;

  // Nếu là chương miễn phí và chưa có nội dung nhúng sẵn -> thử fetch từ subcollection (với ISR cache)
  if (targetChapter && !targetChapter.isVip && (!targetChapter.content || (targetChapter.content?.length || 0) < 20)) {
    const subDoc = await fetchFirestoreDocRest(
      `novels/${novel.id}/chapters`,
      targetChapter.id
    );
    if (subDoc && typeof subDoc.content === 'string' && (subDoc.content.trim()?.length || 0) > 0) {
      targetChapter = {
        ...targetChapter,
        title: subDoc.title ? String(subDoc.title) : targetChapter.title,
        content: subDoc.content,
      };
    } else {
      needsClientAuthContent = true;
    }
  } else if (!targetChapter) {
    // Nếu subcollection bị khóa với anonymous REST, tạo metadata khung và để Client Auth tải nốt nếu cần
    needsClientAuthContent = true;
    targetChapter = {
      id: decodedChapterId || `chuong-${parsedNum}`,
      number: parsedNum,
      title: `Chương ${parsedNum}`,
      slug: `chuong-${parsedNum}`,
      content: '',
      isVip: false,
    };
  }

  // Bảo mật VIP: Không nhúng toàn văn chương VIP vào HTML tĩnh công khai
  if (targetChapter.isVip && targetChapter.content) {
    const teaser = targetChapter.content.slice(0, 260);
    targetChapter = {
      ...targetChapter,
      content: teaser,
    };
    needsClientAuthContent = true;
  }

  return {
    novel: {
      ...novel,
      // Loại bỏ nội dung nặng của các chương khác khỏi RSC payload
      chapters: (chaptersList || []).map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        slug: c.slug,
        isVip: c.isVip,
        priceXu: c.priceXu,
        publishedDate: c.publishedDate,
      })),
    },
    chapter: targetChapter,
    chaptersList: (chaptersList || []).map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      slug: c.slug,
      isVip: c.isVip,
      priceXu: c.priceXu,
      publishedDate: c.publishedDate,
    })),
    needsClientAuthContent,
  };
}

const getChapterDataCached = unstable_cache(
  async (novelId: string, chapterId: string) => fetchChapterUncached(novelId, chapterId),
  ['daotam-chapter-detail-v1'],
  { revalidate: ISR_REVALIDATE_SECONDS }
);

/**
 * Lấy dữ liệu truyện & chương theo slug/ID — Cache Server ISR 3600s + Request Memoization
 */
export const getChapterByIdentifiersCached = cache(
  async (novelId: string, chapterId: string): Promise<ChapterFetchResult> => {
    return getChapterDataCached(novelId, chapterId);
  }
);

// ============================================================================
// SEO & OPEN GRAPH HELPERS
// ============================================================================

export function buildSeoDescription(
  rawText?: string | null,
  fallback: string = 'Đọc truyện chữ online và nghe Audio AI Neural mượt mà miễn phí tại Đạo Tâm.'
): string {
  if (!rawText || typeof rawText !== 'string') return fallback;
  const plain = rawText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return fallback;
  if ((plain?.length || 0) <= 158) return plain;
  const cut = plain.slice(0, 155);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim()}...`;
}

export function resolveAbsoluteImageUrl(coverImage?: string | null): string {
  if (!coverImage || typeof coverImage !== 'string') return DEFAULT_COVER_IMAGE;
  const trimmed = coverImage.trim();
  if (!trimmed) return DEFAULT_COVER_IMAGE;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${SITE_URL}${cleanPath}`;
}
