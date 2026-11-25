import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Crown,
  Sparkles,
  Search,
  ArrowLeft,
  Coins,
  Bookmark,
  Library,
  CheckCircle2,
  LogIn,
} from 'lucide-react';
import { Novel, UserProfile } from '../types';
import {
  aggregateUserPurchasedNovelsFromCache,
  readLocalSavedNovelsFromStorage,
  PurchasedStorySummary,
} from '../firebase/services';
import { formatXu } from '../utils/rulesAndVoices';
import { safeGetItem, safeJsonParse } from '../utils/safeStorage';

interface UserPurchasedNovelsPageProps {
  user: UserProfile;
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onBackToHome: () => void;
  onOpenTopUp?: () => void;
  onOpenLogin?: () => void;
}

interface LibraryCardItem extends PurchasedStorySummary {
  isPurchased: boolean;
  isSavedLocal: boolean;
}

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80';

/**
 * ==============================================================================
 * TRANG TỦ TRUYỆN CỦA BẠN (ROUTE: /tu-truyen-cua-ban)
 * ==============================================================================
 * - Kết hợp danh sách truyện lưu cục bộ VỚI toàn bộ truyện đã mua chương VIP / trọn bộ
 *   lấy trực tiếp từ dữ liệu tài khoản đã tải sẵn (0 lượt đọc thêm).
 * - Khớp ID với danh sách truyện đã lưu trong bộ nhớ đệm để hiển thị đầy đủ ảnh bìa,
 *   tên truyện và nhãn "Đã mua".
 * - Khi chưa đăng nhập, hiển thị thông báo rõ ràng kèm nút "Đăng nhập ngay".
 * ==============================================================================
 */
export const UserPurchasedNovelsPage: React.FC<UserPurchasedNovelsPageProps> = ({
  user,
  novels,
  onSelectNovel,
  onBackToHome,
  onOpenTopUp,
  onOpenLogin,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'full_book' | 'single_chapters' | 'saved'>('all');

  const isLoggedIn = Boolean(user?.isLoggedIn && user?.id && user.id !== 'guest');

  // Tổng hợp trực tiếp từ dữ liệu tài khoản đã nạp + danh sách lưu cục bộ (0 lượt đọc thêm)
  const libraryItems = useMemo<LibraryCardItem[]>(() => {
    // 1. Kho tra cứu truyện từ props + bộ nhớ đệm cục bộ
    const lookup = new Map<string, Novel>();
    const lowerLookup = new Map<string, Novel>();
    const registerNovel = (n: Novel) => {
      if (!n) return;
      if (n.id) {
        lookup.set(n.id, n);
        lowerLookup.set(String(n.id).trim().toLowerCase(), n);
      }
      if (n.slug) {
        lookup.set(n.slug, n);
        lowerLookup.set(String(n.slug).trim().toLowerCase(), n);
      }
    };

    const cachedRaw = safeGetItem('dao_tam_novels');
    const cachedList = cachedRaw ? safeJsonParse<Novel[]>(cachedRaw, []) : [];
    if (Array.isArray(cachedList)) cachedList.forEach(registerNovel);
    if (Array.isArray(novels)) novels.forEach(registerNovel);

    const findCachedNovel = (idOrSlug: string): Novel | undefined => {
      const clean = String(idOrSlug || '').trim();
      if (!clean) return undefined;
      return lookup.get(clean) || lowerLookup.get(clean.toLowerCase());
    };

    // 2. Lấy toàn bộ truyện đã mua từ dữ liệu tài khoản (purchasedChapters / unlockedChapters / unlockedFullBooks / purchases / purchasedStories)
    const purchasedSummaries = isLoggedIn
      ? aggregateUserPurchasedNovelsFromCache(user, novels)
      : [];

    const mergedMap = new Map<string, LibraryCardItem>();
    for (const item of purchasedSummaries) {
      mergedMap.set(item.storyId, {
        ...item,
        isPurchased: true,
        isSavedLocal: false,
      });
    }

    // 3. Kết hợp danh sách truyện lưu cục bộ (localStorage) + bookmarks trên tài khoản
    const localSavedEntries = readLocalSavedNovelsFromStorage();
    const accountBookmarkIds = isLoggedIn && Array.isArray(user?.bookmarks) ? user.bookmarks : [];

    for (const bId of accountBookmarkIds) {
      const cleanId = String(bId || '').trim();
      if (!cleanId) continue;
      if (!localSavedEntries.some((e) => e.storyId === cleanId)) {
        localSavedEntries.push({ storyId: cleanId });
      }
    }

    for (const localEntry of localSavedEntries) {
      const matchedNovel = findCachedNovel(localEntry.storyId);
      const canonicalId = matchedNovel?.id || localEntry.storyId;
      if (!canonicalId) continue;

      const existing = mergedMap.get(canonicalId);
      if (existing) {
        existing.isSavedLocal = true;
        continue;
      }

      const totalChapters =
        matchedNovel?.totalChapters ||
        (Array.isArray(matchedNovel?.chapters) ? matchedNovel.chapters.length : 0) ||
        0;

      mergedMap.set(canonicalId, {
        storyId: canonicalId,
        storyTitle: matchedNovel?.title || localEntry.storyTitle || `Bộ truyện #${canonicalId}`,
        storyAuthor: matchedNovel?.author || localEntry.storyAuthor || 'Đang cập nhật',
        storyEditor: matchedNovel?.editor,
        storyCoverImage: matchedNovel?.coverImage || localEntry.storyCoverImage || DEFAULT_COVER,
        storySlug: matchedNovel?.slug || localEntry.storySlug,
        storyMainCategory: matchedNovel?.mainCategory,
        totalChapters,
        freeChaptersCount: totalChapters >= 200 ? 50 : 30,
        totalVipChapters: 0,
        isFullStoryBought: false,
        purchasedChapterIds: [],
        purchasedChapterNumbers: [],
        purchasedVipChaptersCount: 0,
        totalSpentXu: 0,
        lastPurchasedAt: localEntry.savedAt || 0,
        purchaseBadgeType: 'single_chapters',
        novel: matchedNovel,
        isPurchased: false,
        isSavedLocal: true,
      });
    }

    return Array.from(mergedMap.values()).sort((a, b) => {
      if (a.isPurchased !== b.isPurchased) return a.isPurchased ? -1 : 1;
      return (b.lastPurchasedAt || 0) - (a.lastPurchasedAt || 0);
    });
  }, [
    isLoggedIn,
    user?.id,
    user?.purchases,
    user?.unlockedFullBooks,
    user?.unlockedChapters,
    user?.purchasedChapters,
    (user as any)?.purchasedStories,
    user?.bookmarks,
    novels,
  ]);

  // Bộ lọc tìm kiếm & phân loại
  const filteredStories = useMemo(() => {
    return (libraryItems || []).filter((item) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          item.storyTitle.toLowerCase().includes(term) ||
          item.storyAuthor.toLowerCase().includes(term) ||
          (item.storyEditor && item.storyEditor.toLowerCase().includes(term));
        if (!match) return false;
      }

      if (filterType === 'full_book') {
        return item.isPurchased && item.purchaseBadgeType === 'full_book';
      }
      if (filterType === 'single_chapters') {
        return item.isPurchased && item.purchaseBadgeType === 'single_chapters';
      }
      if (filterType === 'saved') {
        return !item.isPurchased && item.isSavedLocal;
      }
      return true;
    });
  }, [libraryItems, searchTerm, filterType]);

  // Thống kê tổng hợp
  const stats = useMemo(() => {
    const safeList = libraryItems || [];
    const purchasedList = safeList.filter((s) => s.isPurchased);
    const totalPurchased = purchasedList.length;
    const fullBookCount = purchasedList.filter((s) => s.purchaseBadgeType === 'full_book').length;
    const singleChaptersCount = purchasedList.filter((s) => s.purchaseBadgeType === 'single_chapters').length;
    const savedOnlyCount = safeList.filter((s) => !s.isPurchased && s.isSavedLocal).length;
    return { totalPurchased, fullBookCount, singleChaptersCount, savedOnlyCount };
  }, [libraryItems]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-pink-50/70 via-slate-50 to-pink-50/40 dark:from-[#180a14] dark:via-slate-950 dark:to-[#180a14] text-slate-900 dark:text-slate-100 transition-colors pb-16">
      {/* 1. Header Trang Tủ truyện của bạn */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-950/90 border-b border-pink-100 dark:border-pink-950/60 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToHome}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-900/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 transition cursor-pointer shrink-0"
              title="Quay lại Trang Chủ"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black text-black dark:text-black title-tu-truyen flex items-center gap-2 truncate">
                <Library className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600 shrink-0" />
                <span className="text-black dark:text-black font-black truncate">Tủ truyện của bạn</span>
              </h1>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium line-clamp-1">
                Tất cả tác phẩm bạn đã sở hữu trọn bộ, mở khóa chương VIP hoặc lưu đọc lại
              </p>
            </div>
          </div>

          {/* Số dư ví Xu & Nút Nạp Xu / Đăng nhập */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {isLoggedIn ? (
              <>
                <div className="badge-vi-cua-ban flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-pink-100/90 dark:bg-pink-100 border border-pink-200 dark:border-pink-300 text-xs font-bold text-black dark:text-black">
                  <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-black dark:text-black font-bold">
                    Ví của bạn: {formatXu(user?.xuBalance || 0)} Xu
                  </span>
                </div>
                {onOpenTopUp && (
                  <button
                    type="button"
                    onClick={onOpenTopUp}
                    className="px-3.5 py-2 min-h-[40px] rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white text-xs font-bold shadow-xs hover:shadow-md transition cursor-pointer"
                  >
                    + Nạp Xu
                  </button>
                )}
              </>
            ) : (
              onOpenLogin && (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="px-4 py-2 min-h-[44px] rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span>Đăng nhập ngay</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-6 space-y-5 sm:space-y-6">
        {/* Banner nhắc đăng nhập khi chưa đăng nhập nhưng đã có truyện lưu cục bộ */}
        {!isLoggedIn && (libraryItems?.length || 0) > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                <LogIn className="w-5 h-5" />
              </div>
              <p className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200 leading-relaxed">
                Vui lòng đăng nhập tài khoản để đồng bộ lại toàn bộ truyện và chương VIP bạn đã mua.
              </p>
            </div>
            {onOpenLogin && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white text-xs font-bold shadow-sm transition cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập ngay</span>
              </button>
            )}
          </div>
        )}

        {/* 2. Hàng Thống kê tổng quan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-pink-200/70 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-pink-600" />
              <span>Tổng Truyện Đã Mua</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
              {stats.totalPurchased} <span className="text-xs font-bold text-slate-400">bộ</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-pink-200/70 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <span>Mua Trọn Bộ</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
              {stats.fullBookCount} <span className="text-xs font-bold text-slate-400">bộ</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-pink-200/70 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-sky-500" />
              <span>Mua Chương Lẻ</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-sky-600 dark:text-sky-400">
              {stats.singleChaptersCount} <span className="text-xs font-bold text-slate-400">bộ</span>
            </div>
          </div>
        </div>

        {/* 3. Thanh công cụ tìm kiếm và lọc phân loại */}
        <div className="bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm tác phẩm trong tủ truyện..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full min-h-[42px] pl-9 pr-4 py-2 rounded-xl border border-pink-200/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-0.5 scrollbar-none">
            {[
              { id: 'all', label: 'Tất cả', count: libraryItems?.length || 0 },
              { id: 'full_book', label: 'Mua Trọn Bộ', count: stats.fullBookCount },
              { id: 'single_chapters', label: 'Mua Chương Lẻ', count: stats.singleChaptersCount },
              ...(stats.savedOnlyCount > 0
                ? [{ id: 'saved', label: 'Đã lưu', count: stats.savedOnlyCount }]
                : []),
            ].map((tab) => {
              const isActive = filterType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id as any)}
                  className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-pink-600 text-white font-extrabold shadow-sm shadow-pink-600/30 ring-2 ring-pink-400/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Nội dung danh sách truyện dạng Grid Layout hoặc Gợi ý đăng nhập */}
        {(filteredStories?.length || 0) === 0 ? (
          <div className="text-center py-14 sm:py-20 bg-white dark:bg-slate-900 rounded-3xl border border-pink-200/60 dark:border-slate-800 p-6 sm:p-8 shadow-xs max-w-xl mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-pink-50 dark:bg-pink-950/50 flex items-center justify-center mx-auto mb-4 border border-pink-200 dark:border-pink-800 text-pink-600">
              {!isLoggedIn ? <LogIn className="w-8 h-8" /> : <Library className="w-8 h-8" />}
            </div>

            {!isLoggedIn && (libraryItems?.length || 0) === 0 ? (
              <>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mb-2">
                  Đồng bộ Tủ Truyện của bạn
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                  Vui lòng đăng nhập tài khoản để đồng bộ lại toàn bộ truyện và chương VIP bạn đã mua.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  {onOpenLogin && (
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="w-full sm:w-auto px-6 py-2.5 min-h-[44px] bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl text-xs font-bold shadow-md shadow-pink-500/20 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Đăng nhập ngay</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onBackToHome}
                    className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Khám Phá Truyện Hay Ngay
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-200 mb-1">
                  {(libraryItems?.length || 0) === 0
                    ? 'Tủ truyện của bạn hiện đang trống'
                    : 'Không tìm thấy bộ truyện nào phù hợp'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                  {(libraryItems?.length || 0) === 0
                    ? 'Khi bạn mở khóa chương VIP, mua trọn bộ hoặc lưu truyện yêu thích, tất cả tác phẩm sẽ được hiển thị đầy đủ tại đây.'
                    : 'Hãy thử xóa từ khóa tìm kiếm hoặc chuyển sang bộ lọc "Tất cả".'}
                </p>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="px-5 py-2.5 min-h-[44px] bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl text-xs font-bold shadow-md shadow-pink-500/20 transition cursor-pointer"
                >
                  Khám Phá Truyện Hay Ngay
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4.5">
            {(filteredStories || []).map((item) => {
              const matchedNovel =
                item.novel ||
                (novels || []).find((n) => n.id === item.storyId || (n.slug && n.slug === item.storySlug));

              const handleClick = () => {
                if (matchedNovel) {
                  onSelectNovel(matchedNovel);
                } else {
                  const fallbackNovel: Novel = {
                    id: item.storyId,
                    title: item.storyTitle,
                    author: item.storyAuthor,
                    editor: item.storyEditor,
                    coverImage: item.storyCoverImage,
                    slug: item.storySlug || `story-${item.storyId}`,
                    totalChapters: item.totalChapters,
                    chapters: [],
                    status: 'Đang ra',
                    views: 0,
                    dailyViews: 0,
                    flowerCount: 0,
                    rating: 5,
                    mainCategory: (item.storyMainCategory as any) || 'dam-my',
                    categories: [],
                    description: 'Tác phẩm trong tủ truyện cá nhân của bạn.',
                    updatedAt: Date.now(),
                    lastUpdated: 'Vừa xong',
                    hasAudio: true,
                    fullBookPriceXu: 85,
                  };
                  onSelectNovel(fallbackNovel);
                }
              };

              return (
                <div
                  key={item.storyId}
                  onClick={handleClick}
                  className="group flex flex-col justify-between bg-white dark:bg-slate-900 rounded-2xl border border-pink-200/80 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-xl hover:border-pink-400 dark:hover:border-pink-600 transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
                >
                  <div>
                    {/* Ảnh Bìa Truyện */}
                    <div className="relative aspect-[3/4] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img
                        src={item.storyCoverImage}
                        alt={item.storyTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = DEFAULT_COVER;
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

                      {/* Huy hiệu số chương trên ảnh bìa */}
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white backdrop-blur-md border border-white/20">
                          {item.totalChapters} chương
                        </span>
                      </div>

                      {/* Nhãn Đã mua / Đã lưu nổi bật góc phải ảnh bìa */}
                      <div className="absolute top-2 right-2">
                        {item.isPurchased ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/95 text-white shadow-sm backdrop-blur-md border border-emerald-300/40">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Đã mua</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-600/90 text-white shadow-sm backdrop-blur-md border border-purple-300/40">
                            <Bookmark className="w-3 h-3" />
                            <span>Đã lưu</span>
                          </span>
                        )}
                      </div>

                      {/* Huy hiệu tiến độ VIP đã mua */}
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="text-[10px] text-white/90 font-medium truncate drop-shadow-md">
                          {item.isPurchased ? (
                            item.purchaseBadgeType === 'full_book' ? (
                              <span className="text-amber-300 font-bold flex items-center gap-1">
                                <Crown className="w-3 h-3 text-amber-300 shrink-0" />
                                <span>Sở hữu trọn đời</span>
                              </span>
                            ) : item.totalVipChapters > 0 ? (
                              <span>
                                Đã mua: {item.purchasedVipChaptersCount}/{item.totalVipChapters}c VIP
                              </span>
                            ) : (
                              <span>Đã mở khóa VIP</span>
                            )
                          ) : (
                            <span className="text-purple-200 font-semibold">Truyện đã lưu</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Thông tin truyện */}
                    <div className="p-3 space-y-1.5">
                      <h3
                        className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors"
                        title={item.storyTitle}
                      >
                        {item.storyTitle}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                        {item.storyAuthor}
                      </p>
                      {item.storyEditor && (
                        <p className="text-[10px] text-pink-600/80 dark:text-pink-400/80 font-medium line-clamp-1">
                          Ed: {item.storyEditor}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Nhãn trạng thái dưới cùng thẻ */}
                  <div className="p-3 pt-0">
                    {!item.isPurchased ? (
                      <div className="w-full text-center py-2 px-2 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs flex items-center justify-center gap-1.5">
                        <Bookmark className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span className="truncate">Đã lưu trong tủ</span>
                      </div>
                    ) : item.purchaseBadgeType === 'full_book' ? (
                      <div className="w-full text-center py-2 px-2 rounded-xl text-xs font-black bg-rose-100 text-amber-700 dark:bg-rose-950/80 dark:text-amber-300 border border-rose-300 dark:border-rose-800 shadow-2xs flex items-center justify-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        <span className="truncate">Đã mua • Trọn Bộ</span>
                      </div>
                    ) : (
                      <div className="w-full text-center py-2 px-2 rounded-xl text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs flex items-center justify-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span className="truncate">Đã mua • Chương Lẻ</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
