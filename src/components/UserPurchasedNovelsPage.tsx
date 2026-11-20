import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Crown, 
  Sparkles, 
  Search, 
  ArrowLeft, 
  Coins, 
  Layers, 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  Loader2,
  Bookmark,
  Library
} from 'lucide-react';
import { Novel, UserProfile } from '../types';
import { 
  fetchUserPurchasedNovelsAggregated, 
  PurchasedStorySummary 
} from '../firebase/services';
import { formatXu } from '../utils/rulesAndVoices';

interface UserPurchasedNovelsPageProps {
  user: UserProfile;
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onBackToHome: () => void;
  onOpenTopUp?: () => void;
}

/**
 * ==============================================================================
 * TRANG TỦ TRUYỆN CỦA BẠN (ROUTE: /tu-truyen-cua-ban)
 * ==============================================================================
 * - BẮT BUỘC là Trang (Page) riêng biệt, TUYỆT ĐỐI KHÔNG dùng giao diện Popup/Modal.
 * - Retroactive Aggregation: Gom nhóm tất cả giao dịch mua chương / mua trọn bộ từ Firestore.
 * - FIX LOGIC CHƯƠNG VIP & PHÂN LOẠI NHÃN:
 *   + Trường hợp 1: User đã mua gói trọn bộ (isFullStoryBought == true).
 *   + Trường hợp 2: User mua gom từng chương lẻ, và tổng số chương lẻ đã mua BẰNG VỚI
 *     tổng số chương VIP (chương tính phí) của bộ truyện đó (purchasedChapters.length === story.totalVipChapters
 *     hoặc tổng số chương - số chương free). Tuyệt đối không đếm chương free vào điều kiện này.
 *     => Cả 2 trường hợp này đều hiển thị nhãn: 'Mua Trọn Bộ' (Text vàng, nền đỏ/hồng pastel).
 *   + Trường hợp 3: User mua chương lẻ nhưng chưa mua hết toàn bộ số chương VIP
 *     => Hiển thị nhãn: 'Mua Chương Lẻ' (dùng màu xám nhạt hoặc xanh pastel).
 * ==============================================================================
 */
export const UserPurchasedNovelsPage: React.FC<UserPurchasedNovelsPageProps> = ({
  user,
  novels,
  onSelectNovel,
  onBackToHome,
  onOpenTopUp,
}) => {
  const [purchasedStories, setPurchasedStories] = useState<PurchasedStorySummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'full_book' | 'single_chapters'>('all');

  // Nạp và tổng hợp dữ liệu giao dịch từ Firestore (Retroactive Aggregation)
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!user?.id || user.id === 'guest') {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const summaries = await fetchUserPurchasedNovelsAggregated(user.id, novels);
        if (isMounted) {
          setPurchasedStories(Array.isArray(summaries) ? summaries : []);
        }
      } catch (err) {
        console.warn('Lỗi khi nạp tủ truyện đã mua:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.purchases, user?.unlockedFullBooks, user?.unlockedChapters, novels]);

  // Bộ lọc tìm kiếm & phân loại
  const filteredStories = useMemo(() => {
    return (purchasedStories || []).filter((item) => {
      // 1. Text Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          item.storyTitle.toLowerCase().includes(term) ||
          item.storyAuthor.toLowerCase().includes(term) ||
          (item.storyEditor && item.storyEditor.toLowerCase().includes(term));
        if (!match) return false;
      }

      // 2. Filter Type
      if (filterType === 'full_book') {
        return item.purchaseBadgeType === 'full_book';
      }
      if (filterType === 'single_chapters') {
        return item.purchaseBadgeType === 'single_chapters';
      }
      return true;
    });
  }, [purchasedStories, searchTerm, filterType]);

  // Thống kê tổng hợp
  const stats = useMemo(() => {
    const safePurchased = purchasedStories || [];
    const totalStories = safePurchased?.length || 0;
    const fullBookCount = safePurchased.filter((s) => s.purchaseBadgeType === 'full_book')?.length || 0;
    const singleChaptersCount = safePurchased.filter((s) => s.purchaseBadgeType === 'single_chapters')?.length || 0;
    const totalXuSpent = safePurchased.reduce((acc, s) => acc + s.totalSpentXu, 0);
    return { totalStories, fullBookCount, singleChaptersCount, totalXuSpent };
  }, [purchasedStories]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50/70 via-slate-50 to-pink-50/40 dark:from-[#180a14] dark:via-slate-950 dark:to-[#180a14] text-slate-900 dark:text-slate-100 transition-colors pb-16">
      
      {/* 1. Header Trang Tủ truyện của bạn */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-950/90 border-b border-pink-100 dark:border-pink-950/60 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToHome}
              className="p-2 rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-900/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 transition cursor-pointer"
              title="Quay lại Trang Chủ"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-black dark:text-black title-tu-truyen flex items-center gap-2">
                <Library className="w-6 h-6 text-pink-600 shrink-0" />
                <span className="text-black dark:text-black font-black">Tủ truyện của bạn</span>
              </h1>
              <p className="text-xs text-slate-900 dark:text-slate-800 font-medium">
                Tất cả tác phẩm bạn đã sở hữu trọn bộ hoặc mở khóa chương VIP
              </p>
            </div>
          </div>

          {/* Số dư ví Xu & Nút Nạp Xu */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="badge-vi-cua-ban flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-100/90 dark:bg-pink-100 border border-pink-200 dark:border-pink-300 text-xs font-bold text-black dark:text-black">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-black dark:text-black font-bold">Ví của bạn: {formatXu(user?.xuBalance || 0)} Xu</span>
            </div>
            {onOpenTopUp && (
              <button
                type="button"
                onClick={onOpenTopUp}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white text-xs font-bold shadow-xs hover:shadow-md transition cursor-pointer"
              >
                + Nạp Xu
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        
        {/* 2. Hàng Thống kê tổng quan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-pink-200/70 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-pink-600" />
              <span>Tổng Truyện Đã Mua</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
              {stats.totalStories} <span className="text-xs font-bold text-slate-400">bộ</span>
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
        <div className="bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Ô tìm kiếm */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm tác phẩm đã mua..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-pink-200/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Nút lọc phân loại */}
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-0.5 scrollbar-none">
            {[
              { id: 'all', label: 'Tất cả', count: purchasedStories?.length || 0 },
              { id: 'full_book', label: 'Mua Trọn Bộ', count: stats.fullBookCount },
              { id: 'single_chapters', label: 'Mua Chương Lẻ', count: stats.singleChaptersCount },
            ].map((tab) => {
              const isActive = filterType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-pink-600 text-white font-extrabold shadow-sm shadow-pink-600/30 ring-2 ring-pink-400/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Nội dung danh sách truyện dạng Grid Layout */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-pink-600" />
            <p className="text-xs font-semibold text-pink-600 dark:text-pink-400">
              Đang tổng hợp dữ liệu giao dịch từ Firestore...
            </p>
          </div>
        ) : (filteredStories?.length || 0) === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-pink-200/60 dark:border-slate-800 p-8 shadow-xs max-w-xl mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-pink-50 dark:bg-pink-950/50 flex items-center justify-center mx-auto mb-4 border border-pink-200 dark:border-pink-800 text-pink-600">
              <Library className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200 mb-1">
              {(purchasedStories?.length || 0) === 0
                ? 'Tủ truyện của bạn hiện đang trống'
                : 'Không tìm thấy bộ truyện nào phù hợp'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              {(purchasedStories?.length || 0) === 0
                ? 'Khi bạn mở khóa chương VIP hoặc mua trọn bộ tác phẩm, tất cả quyền đọc trọn đời sẽ được lưu trữ an toàn và hiển thị đầy đủ tại đây.'
                : 'Hãy thử xóa từ khóa tìm kiếm hoặc chuyển sang bộ lọc "Tất cả".'}
            </p>
            <button
              type="button"
              onClick={onBackToHome}
              className="px-5 py-2.5 bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white rounded-xl text-xs font-bold shadow-md shadow-pink-500/20 transition cursor-pointer"
            >
              Khám Phá Truyện Hay Ngay
            </button>
          </div>
        ) : (
          /* Giao diện Grid Layout chuẩn chỉnh */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4.5">
            {(filteredStories || []).map((item) => {
              const matchedNovel =
                item.novel ||
                (novels || []).find((n) => n.id === item.storyId || (n.slug && n.slug === item.storySlug));

              const handleClick = () => {
                if (matchedNovel) {
                  onSelectNovel(matchedNovel);
                } else {
                  // Fallback: Tạo novel tạm từ summary
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
                          (e.currentTarget as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

                      {/* Huy hiệu số chương trên ảnh bìa */}
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white backdrop-blur-md border border-white/20">
                          {item.totalChapters} chương
                        </span>
                      </div>

                      {/* Huy hiệu số chương VIP đã mua */}
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="text-[10px] text-white/90 font-medium truncate drop-shadow-md">
                          {item.purchaseBadgeType === 'full_book' ? (
                            <span className="text-amber-300 font-bold flex items-center gap-1">
                              <Crown className="w-3 h-3 text-amber-300" />
                              <span>Sở hữu trọn đời</span>
                            </span>
                          ) : (
                            <span>Đã mua: {item.purchasedVipChaptersCount}/{item.totalVipChapters}c VIP</span>
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

                  {/* 3. THẺ NHÃN (BADGE/TAG) Ở DƯỚI CÙNG THEO YÊU CẦU BẮT BUỘC:
                      - Trường hợp 1: User đã mua gói trọn bộ (isFullStoryBought == true).
                      - Trường hợp 2: User mua gom từng chương lẻ, và tổng số chương lẻ đã mua BẰNG VỚI
                        tổng số chương VIP của bộ truyện đó (purchasedChapters.length === story.totalVipChapters
                        hoặc tổng số chương - số chương free). Tuyệt đối không đếm chương free vào điều kiện này.
                        => Cả 2 trường hợp này đều hiển thị nhãn: 'Mua Trọn Bộ' (Text vàng, nền đỏ/hồng pastel).
                      - Trường hợp 3: User mua chương lẻ nhưng chưa mua hết toàn bộ số chương VIP
                        => Hiển thị nhãn: 'Mua Chương Lẻ' (dùng màu xám nhạt hoặc xanh pastel).
                  */}
                  <div className="p-3 pt-0">
                    {item.purchaseBadgeType === 'full_book' ? (
                      /* Trường hợp 1 & 2: Mua Trọn Bộ (Text vàng, nền đỏ/hồng pastel) */
                      <div className="w-full text-center py-1.5 px-2 rounded-xl text-xs font-black bg-rose-100 text-amber-700 dark:bg-rose-950/80 dark:text-amber-300 border border-rose-300 dark:border-rose-800 shadow-2xs flex items-center justify-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        <span className="truncate">Mua Trọn Bộ</span>
                      </div>
                    ) : (
                      /* Trường hợp 3: Mua Chương Lẻ (màu xám nhạt hoặc xanh pastel) */
                      <div className="w-full text-center py-1.5 px-2 rounded-xl text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs flex items-center justify-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span className="truncate">Mua Chương Lẻ</span>
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
