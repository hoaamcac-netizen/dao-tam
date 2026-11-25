import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root data folder on the server
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const NOVELS_FILE = path.join(DATA_DIR, 'novels.json');
const CHAPTERS_DIR = path.join(DATA_DIR, 'chapters');

// In-memory cache for novels
let inMemoryNovels: any[] = [];
let isInitialized = false;

/**
 * Trợ giúp tạo thông tin chương siêu nhẹ (bỏ qua chuỗi content dài hàng chục nghìn chữ)
 */
export function stripChapterTOC(chapter: any): any {
  return {
    id: chapter.id || `c-${chapter.number}`,
    number: Number(chapter.number),
    title: chapter.title ? (String(chapter.title).startsWith('Chương') ? chapter.title : `Chương ${chapter.number}: ${chapter.title}`) : `Chương ${chapter.number}`,
    slug: chapter.slug || `chuong-${chapter.number}`,
    publishedDate: chapter.publishedDate || new Date().toISOString().split('T')[0],
    isVip: Boolean(chapter.isVip),
    priceXu: chapter.priceXu ? Number(chapter.priceXu) : 0,
    wordCount: chapter.wordCount || 0,
    isHidden: Boolean(chapter.isHidden),
    content: '', // Không chứa nội dung chữ trên root doc
    audioUrl: chapter.audioUrl || undefined,
    audioUrlMale: chapter.audioUrlMale || undefined,
    audioUrlFemale: chapter.audioUrlFemale || undefined,
  };
}

/**
 * Khởi tạo thư mục và nạp dữ liệu ban đầu
 */
export function initDataStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(CHAPTERS_DIR)) {
      fs.mkdirSync(CHAPTERS_DIR, { recursive: true });
    }

    if (fs.existsSync(NOVELS_FILE)) {
      try {
        const raw = fs.readFileSync(NOVELS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryNovels = parsed;
          isInitialized = true;
          console.log(`[DataStore] Đã nạp thành công ${inMemoryNovels.length} bộ truyện từ disk (${NOVELS_FILE})`);
          return;
        }
      } catch (readErr) {
        console.warn('[DataStore] Đọc novels.json lỗi, khởi tạo danh sách rỗng:', readErr);
      }
    }

    inMemoryNovels = [];
    if (!fs.existsSync(NOVELS_FILE)) {
      fs.writeFileSync(NOVELS_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
    isInitialized = true;
  } catch (err) {
    console.error('[DataStore] Lỗi khởi tạo dataStore:', err);
    inMemoryNovels = [];
    isInitialized = true;
  }
}

/**
 * Lưu dữ liệu vào file disk an toàn
 */
function persistNovels(): void {
  try {
    fs.writeFileSync(NOVELS_FILE, JSON.stringify(inMemoryNovels, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DataStore] Lỗi ghi novels.json:', err);
  }
}

/**
 * Lấy toàn bộ danh sách truyện thời gian thực
 */
export function getAllNovels(): any[] {
  if (!isInitialized) initDataStore();
  return inMemoryNovels;
}

/**
 * Lấy một truyện theo ID hoặc Slug
 */
export function getNovelById(idOrSlug: string): any | null {
  if (!isInitialized) initDataStore();
  return inMemoryNovels.find((n) => n.id === idOrSlug || n.slug === idOrSlug) || null;
}

/**
 * Lưu hoặc cập nhật thông tin truyện
 */
export function saveNovelRecord(novel: any): any {
  if (!isInitialized) initDataStore();

  const idx = inMemoryNovels.findIndex((n) => n.id === novel.id || (novel.slug && n.slug === novel.slug));
  const strippedChapters = Array.isArray(novel.chapters)
    ? novel.chapters.map(stripChapterTOC)
    : (idx >= 0 ? inMemoryNovels[idx].chapters : []);

  const total = Number(novel.totalChapters) || strippedChapters.length || (idx >= 0 ? inMemoryNovels[idx].totalChapters : 1);
  const latestCh = strippedChapters.length > 0 ? strippedChapters[strippedChapters.length - 1] : null;

  const normalizedNovel = {
    ...(idx >= 0 ? inMemoryNovels[idx] : {}),
    ...novel,
    chapters: strippedChapters,
    totalChapters: total,
    latestChapterTitle: latestCh?.title || novel.latestChapterTitle || `Chương ${total}`,
    latestChapterNumber: latestCh?.number || novel.latestChapterNumber || total,
    updatedAt: Date.now(),
  };

  if (idx >= 0) {
    inMemoryNovels[idx] = normalizedNovel;
  } else {
    inMemoryNovels.unshift(normalizedNovel);
  }

  persistNovels();
  return normalizedNovel;
}

/**
 * Xóa vĩnh viễn truyện khỏi hệ thống
 */
export function deleteNovelRecord(novelId: string): boolean {
  if (!isInitialized) initDataStore();

  const initialCount = inMemoryNovels.length;
  inMemoryNovels = inMemoryNovels.filter((n) => n.id !== novelId && n.slug !== novelId);
  const changed = inMemoryNovels.length !== initialCount;

  if (changed) {
    persistNovels();
    // Xóa thư mục chương
    try {
      const novelChapDir = path.join(CHAPTERS_DIR, novelId);
      if (fs.existsSync(novelChapDir)) {
        fs.rmSync(novelChapDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn(`[DataStore] Lỗi dọn dẹp thư mục chương của ${novelId}:`, e);
    }
  }

  return changed;
}

/**
 * Ẩn hoặc hiện truyện
 */
export function toggleHideNovelRecord(novelId: string, isHidden: boolean): any | null {
  if (!isInitialized) initDataStore();

  const novel = inMemoryNovels.find((n) => n.id === novelId || n.slug === novelId);
  if (!novel) return null;

  novel.isHidden = isHidden;
  novel.publishStatus = isHidden ? 'hidden' : 'published';
  novel.updatedAt = Date.now();

  persistNovels();
  return novel;
}

/**
 * Lưu hàng loạt chương truyện mới vào disk và cập nhật TOC
 */
export function saveBatchChaptersRecord(
  novelId: string,
  updatedNovel: any,
  newChapters: any[],
  isCompleted?: boolean
): { success: boolean; totalChapters: number; latestChapterTitle: string; latestChapterNumber: number; savedCount: number; novel: any } {
  if (!isInitialized) initDataStore();

  const novelChapDir = path.join(CHAPTERS_DIR, novelId);
  if (!fs.existsSync(novelChapDir)) {
    fs.mkdirSync(novelChapDir, { recursive: true });
  }

  // 1. Lưu từng chương vào file JSON riêng biệt
  newChapters.forEach((ch) => {
    const chNum = Number(ch.number);
    const contentText = String(ch.content || '').trim();
    const chapData = {
      id: ch.id || `${novelId}-c${chNum}`,
      number: chNum,
      title: ch.title || `Chương ${chNum}`,
      slug: ch.slug || `chuong-${chNum}`,
      content: contentText,
      wordCount: ch.wordCount || (contentText ? contentText.split(/\s+/).filter(Boolean).length : 0),
      publishedDate: ch.publishedDate || new Date().toISOString().split('T')[0],
      isVip: Boolean(ch.isVip),
      priceXu: Number(ch.priceXu || 0),
      updatedAt: Date.now(),
    };

    const chapFilePath = path.join(novelChapDir, `${chNum}.json`);
    fs.writeFileSync(chapFilePath, JSON.stringify(chapData, null, 2), 'utf-8');
  });

  // 2. Cập nhật TOC trên danh mục truyện
  let novel = inMemoryNovels.find((n) => n.id === novelId || (updatedNovel?.slug && n.slug === updatedNovel.slug));
  if (!novel) {
    novel = {
      ...(updatedNovel || {}),
      id: novelId,
      chapters: [],
    };
    inMemoryNovels.unshift(novel);
  }

  const chapterMap = new Map<number, any>();
  if (Array.isArray(novel.chapters)) {
    novel.chapters.forEach((c: any) => chapterMap.set(Number(c.number), stripChapterTOC(c)));
  }
  newChapters.forEach((c: any) => chapterMap.set(Number(c.number), stripChapterTOC(c)));

  const mergedTOC = Array.from(chapterMap.values()).sort((a, b) => Number(a.number) - Number(b.number));
  const topChapter = mergedTOC[mergedTOC.length - 1];
  const effectiveTotal = Math.max(
    Number(novel.totalChapters || 0),
    Number(updatedNovel?.totalChapters || 0),
    mergedTOC.length,
    topChapter ? Number(topChapter.number) : 0
  );

  novel.chapters = mergedTOC;
  novel.totalChapters = effectiveTotal;
  novel.latestChapterTitle = topChapter?.title || `Chương ${effectiveTotal}`;
  novel.latestChapterNumber = topChapter?.number || effectiveTotal;
  novel.lastUpdated = 'Vừa xong';
  novel.updatedAt = Date.now();
  if (isCompleted !== undefined) {
    novel.status = isCompleted ? 'Hoàn thành' : 'Đang ra';
  } else if (updatedNovel?.status) {
    novel.status = updatedNovel.status;
  }

  persistNovels();

  return {
    success: true,
    totalChapters: effectiveTotal,
    latestChapterTitle: novel.latestChapterTitle,
    latestChapterNumber: novel.latestChapterNumber,
    savedCount: newChapters.length,
    novel,
  };
}

/**
 * Xóa danh sách chương đã chọn khỏi disk và TOC
 */
export function deleteBatchChaptersRecord(
  novelId: string,
  chapterNumbers: number[]
): { success: boolean; remainingCount: number; totalChapters: number; latestChapterTitle: string; latestChapterNumber: number; novel: any } {
  if (!isInitialized) initDataStore();

  const numSet = new Set(chapterNumbers.map(Number));
  const novelChapDir = path.join(CHAPTERS_DIR, novelId);

  // Xóa các file JSON chương
  if (fs.existsSync(novelChapDir)) {
    chapterNumbers.forEach((num) => {
      const p = path.join(novelChapDir, `${num}.json`);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch (e) {}
      }
    });
  }

  const novel = inMemoryNovels.find((n) => n.id === novelId || n.slug === novelId);
  if (!novel) {
    return { success: false, remainingCount: 0, totalChapters: 0, latestChapterTitle: '', latestChapterNumber: 0, novel: null };
  }

  let remainingChapters: any[] = [];
  if (Array.isArray(novel.chapters)) {
    remainingChapters = novel.chapters.filter((c: any) => !numSet.has(Number(c.number)));
  }

  const topChapter = remainingChapters[remainingChapters.length - 1];
  const total = remainingChapters.length;
  const latestNum = topChapter?.number || total;
  const latestTitle = topChapter?.title || (total > 0 ? `Chương ${total}` : 'Chưa có chương');

  novel.chapters = remainingChapters;
  novel.totalChapters = total;
  novel.latestChapterNumber = latestNum;
  novel.latestChapterTitle = latestTitle;
  novel.updatedAt = Date.now();
  novel.lastUpdated = 'Vừa xong';

  persistNovels();

  return {
    success: true,
    remainingCount: total,
    totalChapters: total,
    latestChapterTitle: latestTitle,
    latestChapterNumber: latestNum,
    novel,
  };
}

/**
 * Lấy nội dung đầy đủ của 1 chương từ disk
 */
export function getChapterRecord(novelId: string, chapterNumber: number | string): any | null {
  const num = Number(chapterNumber);
  const chapFilePath = path.join(CHAPTERS_DIR, novelId, `${num}.json`);

  if (fs.existsSync(chapFilePath)) {
    try {
      const raw = fs.readFileSync(chapFilePath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[DataStore] Lỗi đọc ${chapFilePath}:`, e);
    }
  }

  return null;
}
