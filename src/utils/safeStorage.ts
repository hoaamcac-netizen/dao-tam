/**
 * ==============================================================================
 * TIỆN ÍCH BẢO VỆ VÀ TỐI ƯU HÓA BỘ NHỚ LOCALSTORAGE - ĐẠO TÂM
 * 
 * Mục tiêu:
 * 1. Tối ưu dữ liệu: Chỉ lưu ID, tên truyện, tác giả và đường dẫn ảnh bìa khi lưu mảng truyện.
 *    Loại bỏ hoàn toàn thuộc tính chứa nội dung chữ (chapters, content, rawText...).
 * 2. Bọc lỗi an toàn: Bọc toàn bộ các lệnh localStorage.setItem trong khối try...catch.
 *    Nếu bắt được lỗi đầy bộ nhớ (QuotaExceededError), chỉ in cảnh báo ra console và bỏ qua lệnh lưu,
 *    tuyệt đối không để crash hay sập trắng màn hình ứng dụng.
 * 3. Tự động dọn dẹp các cache text quá khổ nếu phát hiện bộ nhớ đầy.
 * ==============================================================================
 */

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
}

/**
 * Tự động dọn dẹp các key cache nội dung chữ quá nặng (như chapter_full_*)
 * để giải phóng dung lượng cho localStorage.
 */
export function cleanHeavyStorageCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('chapter_full_') || key.startsWith('dao_tam_real_comments_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
    if ((keysToRemove?.length || 0) > 0) {
      console.warn(`[SafeStorage] Đã dọn dẹp ${keysToRemove?.length || 0} mục cache nội dung văn bản nặng để giải phóng bộ nhớ.`);
    }
  } catch (err) {
    console.warn('[SafeStorage] Không thể quét dọn localStorage:', err);
  }
}

/**
 * Bọc an toàn tuyệt đối cho localStorage.setItem.
 * Nếu bị lỗi QuotaExceededError hoặc bất kỳ lỗi nào khác, chỉ log cảnh báo và không bao giờ crash giao diện.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
    const isQuota =
      error?.name === 'QuotaExceededError' ||
      error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error?.code === 22 ||
      error?.code === 1014 ||
      (error?.message && error.message.toLowerCase().includes('quota'));

    if (isQuota) {
      console.warn(
        `[SafeStorage] Bộ nhớ localStorage đã đầy (QuotaExceededError). Bỏ qua lệnh lưu khóa "${key}" để bảo vệ giao diện.`,
        error
      );
      // Dọn dẹp các cache text thừa thãi để lần lưu kế tiếp có thể hoạt động
      cleanHeavyStorageCache();
    } else {
      console.warn(`[SafeStorage] Lỗi khi ghi vào localStorage cho khóa "${key}":`, error);
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
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`[SafeStorage] Lỗi khi đọc từ localStorage cho khóa "${key}":`, error);
    return null;
  }
}

/**
 * Xóa an toàn khỏi localStorage
 */
export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[SafeStorage] Lỗi khi xóa khóa "${key}" khỏi localStorage:`, error);
  }
}

/**
 * Chuẩn hóa và loại bỏ toàn bộ các thuộc tính nội dung chữ (chapters, content, rawText...)
 * CHỈ GIỮ LẠI: ID, tên truyện, tác giả và đường dẫn ảnh bìa đúng như yêu cầu bắt buộc.
 */
export function stripNovelForStorage(novel: any): LightweightNovelStorage {
  const chaps = Array.isArray(novel?.chapters) ? novel.chapters : [];
  const latestCh = (chaps?.length || 0) > 0 ? chaps[(chaps?.length || 0) - 1] : null;
  const total = typeof novel?.totalChapters === 'number' && novel.totalChapters > 0
    ? novel.totalChapters
    : ((chaps?.length || 0) > 0 ? (chaps?.length || 0) : (novel?.latestChapterNumber || 1));
  const latestTitle = latestCh?.title || novel?.latestChapterTitle || (total ? `Chương ${total}` : undefined);
  const latestNum = latestCh?.number || novel?.latestChapterNumber || total;

  return {
    id: String(novel?.id || ''),
    title: String(novel?.title || ''),
    author: String(novel?.author || 'Khuyết danh'),
    coverImage: String(novel?.coverImage || ''),
    status: novel?.status || 'Đang ra',
    totalChapters: total > 0 ? total : undefined,
    latestChapterTitle: latestTitle,
    latestChapterNumber: latestNum,
    lastUpdated: novel?.lastUpdated || 'Vừa xong',
    mainCategory: novel?.mainCategory,
    categories: Array.isArray(novel?.categories) ? novel.categories : undefined,
    views: typeof novel?.views === 'number' ? novel.views : 0,
    dailyViews: typeof novel?.dailyViews === 'number' ? novel.dailyViews : 0,
    rating: typeof novel?.rating === 'number' ? novel.rating : 5,
    flowerCount: typeof novel?.flowerCount === 'number' ? novel.flowerCount : 0,
    coinCount: typeof novel?.coinCount === 'number' ? novel.coinCount : 0,
    createdAt: typeof novel?.createdAt === 'number' ? novel.createdAt : undefined,
    updatedAt: typeof novel?.updatedAt === 'number' ? novel.updatedAt : undefined,
    lastChapterUpdatedAt: typeof novel?.lastChapterUpdatedAt === 'number' ? novel.lastChapterUpdatedAt : (typeof novel?.updatedAt === 'number' ? novel.updatedAt : undefined),
    slug: novel?.slug,
    isHidden: Boolean(novel?.isHidden),
    publishStatus: novel?.publishStatus,
    fullBookPriceXu: novel?.fullBookPriceXu,
    fullBookDiscountPriceXu: novel?.fullBookDiscountPriceXu,
    isOriginal: novel?.isOriginal,
    isExclusive: novel?.isExclusive,
  };
}

/**
 * Lưu danh sách truyện tối ưu vào localStorage an toàn tuyệt đối
 */
export function saveNovelsToStorage(novels: any[]): void {
  if (!Array.isArray(novels) || typeof window === 'undefined') return;
  try {
    const minimalNovels: LightweightNovelStorage[] = (novels || []).map(stripNovelForStorage);
    const saved = safeSetItem('dao_tam_novels', JSON.stringify(minimalNovels));
    if (!saved && minimalNovels.length > 150) {
      safeSetItem('dao_tam_novels', JSON.stringify(minimalNovels.slice(0, 150)));
    }
  } catch (error) {
    console.warn('[SafeStorage] Không thể chuẩn bị mảng truyện để lưu vào localStorage:', error);
  }
}

// Chạy dọn dẹp nhẹ khi khởi tạo file trong môi trường trình duyệt
if (typeof window !== 'undefined') {
  try {
    // Nếu có dữ liệu cũ quá tải, tự dọn dẹp
    cleanHeavyStorageCache();
  } catch (e) {}
}
