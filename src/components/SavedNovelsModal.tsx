import React, { useMemo } from 'react';
import { Novel, UserProfile } from '../types';
import { X, Bookmark, BookOpen, Trash2, CheckCircle2, LogIn } from 'lucide-react';
import {
  aggregateUserPurchasedNovelsFromCache,
  readLocalSavedNovelsFromStorage,
} from '../firebase/services';
import { normalizeStoryId } from '../utils/rulesAndVoices';
import { safeGetItem, safeJsonParse } from '../utils/safeStorage';

interface SavedNovelsModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  onClose: () => void;
  user: UserProfile;
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onRemoveBookmark: (novelId: string) => void;
  onOpenLogin?: () => void;
}

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80';

export const SavedNovelsModal: React.FC<SavedNovelsModalProps> = ({
  isOpen,
  isPageView = false,
  onClose,
  user,
  novels,
  onSelectNovel,
  onRemoveBookmark,
  onOpenLogin,
}) => {
  const isLoggedIn = Boolean(user?.isLoggedIn && user?.id && user.id !== 'guest');

  const savedEntries = useMemo(() => {
    const lookup = new Map<string, Novel>();
    const lowerLookup = new Map<string, Novel>();
    const registerNovel = (n: Novel) => {
      if (!n) return;
      if (n.id) {
        const rawId = String(n.id).trim();
        const normId = normalizeStoryId(rawId);
        lookup.set(rawId, n);
        lowerLookup.set(rawId.toLowerCase(), n);
        if (normId) {
          lookup.set(normId, n);
          lowerLookup.set(normId.toLowerCase(), n);
        }
      }
      if (n.slug) {
        const rawSlug = String(n.slug).trim();
        const normSlug = normalizeStoryId(rawSlug);
        lookup.set(rawSlug, n);
        lowerLookup.set(rawSlug.toLowerCase(), n);
        if (normSlug) {
          lookup.set(normSlug, n);
          lowerLookup.set(normSlug.toLowerCase(), n);
        }
      }
    };

    const cachedRaw = safeGetItem('dao_tam_novels');
    const cachedList = cachedRaw ? safeJsonParse<Novel[]>(cachedRaw, []) : [];
    if (Array.isArray(cachedList)) cachedList.forEach(registerNovel);
    if (Array.isArray(novels)) novels.forEach(registerNovel);

    const findCachedNovel = (idOrSlug: string): Novel | undefined => {
      const clean = String(idOrSlug || '').trim();
      const norm = normalizeStoryId(clean);
      if (!clean && !norm) return undefined;
      return (
        lookup.get(clean) ||
        lookup.get(norm) ||
        lowerLookup.get(clean.toLowerCase()) ||
        lowerLookup.get(norm.toLowerCase())
      );
    };

    // 1. Lấy các bộ truyện đã mua từ tài khoản đã tải sẵn (0 Reads)
    const purchasedList = isLoggedIn ? aggregateUserPurchasedNovelsFromCache(user, novels) : [];
    const purchasedById = new Map(purchasedList.map((p) => [normalizeStoryId(p.storyId), p]));

    // 2. Kết hợp danh sách lưu cục bộ (localStorage) + bookmarks tài khoản
    const localSaved = readLocalSavedNovelsFromStorage();
    const accountBookmarks = isLoggedIn && Array.isArray(user?.bookmarks) ? user.bookmarks : [];

    const itemsMap = new Map<
      string,
      {
        id: string;
        title: string;
        author: string;
        coverImage: string;
        totalChapters: number;
        isPurchased: boolean;
        isSaved: boolean;
        novel?: Novel;
      }
    >();

    for (const p of purchasedList) {
      const normKey = normalizeStoryId(p.storyId);
      if (!p.storyTitle || /^Bộ truyện #/i.test(p.storyTitle)) continue;
      itemsMap.set(normKey, {
        id: normKey,
        title: p.storyTitle,
        author: p.storyAuthor,
        coverImage: p.storyCoverImage || DEFAULT_COVER,
        totalChapters: p.totalChapters,
        isPurchased: true,
        isSaved: false,
        novel: p.novel || findCachedNovel(normKey),
      });
    }

    const addSavedId = (rawId: string, fallbackMeta?: { title?: string; author?: string; cover?: string }) => {
      const matched = findCachedNovel(rawId);
      const canonicalId = normalizeStoryId(matched?.id || rawId);
      if (!canonicalId) return;

      const existing = itemsMap.get(canonicalId);
      if (existing) {
        existing.isSaved = true;
        return;
      }

      const resolvedTitle = matched?.title || fallbackMeta?.title || '';
      if (!resolvedTitle || /^Bộ truyện #/i.test(resolvedTitle.trim())) {
        return;
      }

      const purchased = purchasedById.get(canonicalId);
      itemsMap.set(canonicalId, {
        id: canonicalId,
        title: resolvedTitle,
        author: matched?.author || fallbackMeta?.author || 'Đang cập nhật',
        coverImage: matched?.coverImage || fallbackMeta?.cover || DEFAULT_COVER,
        totalChapters: matched?.chapters?.length || matched?.totalChapters || 0,
        isPurchased: Boolean(purchased),
        isSaved: true,
        novel: matched,
      });
    };

    for (const bId of accountBookmarks) {
      addSavedId(String(bId || '').trim());
    }
    for (const entry of localSaved) {
      addSavedId(entry.storyId, {
        title: entry.storyTitle,
        author: entry.storyAuthor,
        cover: entry.storyCoverImage,
      });
    }

    return Array.from(itemsMap.values()).sort((a, b) => {
      if (a.isPurchased !== b.isPurchased) return a.isPurchased ? -1 : 1;
      return 0;
    });
  }, [
    isLoggedIn,
    user?.id,
    user?.bookmarks,
    user?.purchases,
    user?.unlockedFullBooks,
    user?.unlockedChapters,
    user?.purchasedChapters,
    (user as any)?.purchasedStories,
    novels,
  ]);

  if (!isOpen) return null;

  const handleOpenEntry = (entry: (typeof savedEntries)[number]) => {
    onClose();
    if (entry.novel) {
      onSelectNovel(entry.novel);
      return;
    }
    onSelectNovel({
      id: normalizeStoryId(entry.id) || entry.id,
      title: entry.title,
      author: entry.author,
      coverImage: entry.coverImage,
      slug: normalizeStoryId(entry.id) || entry.id,
      totalChapters: entry.totalChapters,
      chapters: [],
      status: 'Đang ra',
      views: 0,
      dailyViews: 0,
      flowerCount: 0,
      rating: 5,
      mainCategory: 'dam-my',
      categories: [],
      description: 'Tác phẩm trong tủ truyện cá nhân của bạn.',
      updatedAt: Date.now(),
      lastUpdated: 'Vừa xong',
      hasAudio: true,
      fullBookPriceXu: 85,
    });
  };

  const innerContent = (
    <div
      className={`w-full overflow-x-hidden ${
        isPageView
          ? 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800'
          : 'max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800'
      } flex flex-col overflow-hidden`}
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
            <Bookmark className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white uppercase tracking-wider truncate">
              TỦ TRUYỆN ĐÃ LƯU
            </h3>
            <p className="text-[11px] text-slate-500">
              {savedEntries.length} bộ truyện trong tủ sách cá nhân
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        {!isLoggedIn && savedEntries.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200 leading-relaxed">
              Vui lòng đăng nhập tài khoản để đồng bộ lại toàn bộ truyện và chương VIP bạn đã mua.
            </p>
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

        {savedEntries.length === 0 ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center px-3">
            <Bookmark className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
            {!isLoggedIn ? (
              <>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  Tủ truyện đang trống
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md mb-5 leading-relaxed">
                  Vui lòng đăng nhập tài khoản để đồng bộ lại toàn bộ truyện và chương VIP bạn đã mua.
                </p>
                {onOpenLogin && (
                  <button
                    type="button"
                    onClick={onOpenLogin}
                    className="px-6 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-2"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Đăng nhập ngay</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Tủ sách đang trống
                </h4>
                <p className="text-xs text-slate-500 max-w-sm">
                  Bạn chưa lưu hoặc mua bộ truyện nào. Hãy bấm &quot;Thêm vào tủ sách&quot; ở trang chi tiết truyện để lưu lại những tác phẩm yêu thích.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {savedEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 flex flex-col justify-between hover:shadow-md transition group"
              >
                <div className="flex gap-3">
                  <img
                    src={entry.coverImage}
                    alt={entry.title}
                    className="w-16 h-24 object-cover rounded-lg shadow-xs flex-shrink-0 border border-slate-200 dark:border-slate-700"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = DEFAULT_COVER;
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1.5">
                      <h4
                        onClick={() => handleOpenEntry(entry)}
                        className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-2 hover:text-blue-500 cursor-pointer"
                      >
                        {entry.title}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 truncate">{entry.author}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {entry.totalChapters} chương
                      </span>
                      {entry.isPurchased && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Đã mua</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                  {entry.isSaved ? (
                    <button
                      onClick={() => onRemoveBookmark(entry.id)}
                      className="min-h-[40px] px-2 text-slate-400 hover:text-rose-500 text-xs flex items-center gap-1 transition cursor-pointer"
                      title="Xóa khỏi tủ truyện"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa khỏi tủ</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Sở hữu VIP
                    </span>
                  )}
                  <button
                    onClick={() => handleOpenEntry(entry)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Đọc ngay</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isPageView) {
    return (
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200 overflow-x-hidden">
        <div className="mb-4">
          <button
            onClick={onClose}
            className="min-h-[42px] inline-flex items-center gap-1.5 text-xs font-bold text-pink-600 hover:text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-900 px-4 py-2 rounded-xl cursor-pointer transition shadow-xs"
          >
            <span>&larr; Quay lại trang trước</span>
          </button>
        </div>
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200">
      {innerContent}
    </div>
  );
};
