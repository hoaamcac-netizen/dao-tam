import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Sun, 
  Moon, 
  Coins, 
  ShieldCheck, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Plus, 
  BookPlus, 
  BookOpen, 
  Edit3,
  ChevronDown,
  Layers,
  Tag,
  Bell,
  MessageSquare,
  Check,
  X,
  Menu,
  LogOut
} from 'lucide-react';
import { UserProfile, MainCategory, UserRole, GenreItem, AppNotification, Novel } from '../types';
import { DaoTamLogo } from './DaoTamLogo';
import { UserDropdown } from './UserDropdown';
import { INITIAL_HOT_GENRES } from '../data/genres';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, auth, checkIsAdmin } from '../firebase/config';
import { PWAHeaderInstallButton } from './PWAInstallPrompt';
import { FilterMenu } from './FilterMenu';
import type { CategoryFilterId } from '../data/genreConfig';

interface HeaderProps {
  currentTab: 'home' | 'completed' | 'latest';
  setCurrentTab: (tab: 'home' | 'completed' | 'latest') => void;
  selectedMainCategory: 'all' | MainCategory;
  setSelectedMainCategory: (cat: 'all' | MainCategory) => void;
  isShortStoryActive?: boolean;
  onSelectShortStory?: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  allNovels?: Novel[];
  onSelectNovel?: (novel: Novel) => void;
  onPerformSearch?: (query: string) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  onOpenAccount: () => void;
  onOpenXmlModal: () => void;
  onOpenTopUp: () => void;
  onOpenAdmin: () => void;
  onOpenArchitecture: () => void;
  onOpenSubmitNovel: () => void;
  onOpenVipPolicy?: () => void;
  onToggleRole: () => void;
  onSelectRole?: (role: UserRole) => void;
  user: UserProfile;
  pendingCount: number;
  onHomeClick: () => void;
  onOpenDailyReward?: () => void;
  hasClaimedToday?: boolean;
  onOpenAuthorShowcase?: () => void;
  onOpenRegisterCreator?: () => void;
  onOpenEditProfile?: () => void;
  onOpenProfile?: () => void;
  onOpenPurchasedNovels?: () => void;
  onOpenInterestedNovels?: () => void;
  onOpenFollowingCreators?: () => void;
  onOpenMyNovels?: () => void;
  onOpenReadingHistory?: () => void;
  onOpenBookmarks?: () => void;
  onOpenStats?: () => void;
  onOpenInfo?: () => void;
  onOpenChangePassword?: () => void;
  onLogout?: () => void;
  onLogin?: () => void;
  onOpenLogin?: () => void;
  onOpenRegister?: () => void;
  onOpenWithdraw?: () => void;
  hasPendingApplication?: boolean;
  genres?: GenreItem[];
  selectedGenre?: string | null;
  onSelectGenre?: (genre: string | null) => void;
  onMarkNotificationsRead?: () => void;
  isStoryPublisher?: boolean;
  onOpenChat?: () => void;
  unreadChatCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  selectedMainCategory,
  setSelectedMainCategory,
  isShortStoryActive = false,
  onSelectShortStory,
  searchQuery,
  setSearchQuery,
  allNovels = [],
  onSelectNovel,
  onPerformSearch,
  theme,
  setTheme,
  onOpenAccount,
  onOpenTopUp,
  onOpenWithdraw,
  onOpenAdmin,
  user,
  pendingCount,
  onHomeClick,
  onOpenDailyReward,
  hasClaimedToday = false,
  onOpenAuthorShowcase,
  onOpenRegisterCreator,
  onOpenSubmitNovel,
  onOpenEditProfile,
  onOpenProfile,
  onOpenPurchasedNovels,
  onOpenInterestedNovels,
  onOpenFollowingCreators,
  onOpenMyNovels,
  onOpenReadingHistory,
  onOpenBookmarks,
  onOpenStats,
  onOpenInfo,
  onOpenChangePassword,
  onLogout,
  onLogin,
  onOpenLogin,
  onOpenRegister,
  hasPendingApplication,
  genres = INITIAL_HOT_GENRES,
  selectedGenre = null,
  onSelectGenre,
  onMarkNotificationsRead,
  isStoryPublisher = false,
  onOpenChat,
  unreadChatCount = 0,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  const genreDropdownRef = useRef<HTMLDivElement>(null);
  const mobileGenreRef = useRef<HTMLDivElement>(null);
  const mobileGenreDropdownMenuRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  // BẮT BUỘC: Chỉ cấp quyền Admin cho ĐÚNG 2 email: hoaamcac@gmail.com và meoyeutien22@gmail.com
  const isStrictAdmin = checkIsAdmin(user?.email);
  const isAdmin = isStrictAdmin;
  const isAuthor = user?.role === 'author';

  const [alertCounts, setAlertCounts] = useState({
    topUp: 0,
    submissions: 0,
    withdrawals: 0,
    reports: 0,
    chats: 0,
  });

  // Chỉ khi người dùng LÀ ADMIN (checkIsAdmin === true) mới đọc 1 lần bằng getDocs (không dùng onSnapshot toàn cục)
  useEffect(() => {
    if (!isStrictAdmin || !auth.currentUser) {
      setAlertCounts({
        topUp: 0,
        submissions: 0,
        withdrawals: 0,
        reports: 0,
        chats: 0,
      });
      return;
    }

    let isActive = true;
    const loadAdminAlertCounts = async () => {
      try {
        const [topUpSnap, subSnap, withdrawSnap, reportSnap, chatSnap] = await Promise.all([
          getDocs(query(collection(db, 'topup_requests'), where('status', '==', 'pending'), limit(20))),
          getDocs(query(collection(db, 'novel_submissions'), where('status', '==', 'pending'), limit(20))),
          getDocs(query(collection(db, 'withdrawal_requests'), where('status', '==', 'pending'), limit(20))),
          getDocs(query(collection(db, 'novel_reports'), where('status', '==', 'pending'), limit(20))),
          getDocs(query(collection(db, 'support_chats'), where('unreadCount', '>', 0), limit(20))),
        ]);
        if (!isActive) return;
        setAlertCounts({
          topUp: topUpSnap.size,
          submissions: subSnap.size,
          withdrawals: withdrawSnap.size,
          reports: reportSnap.size,
          chats: chatSnap.size,
        });
      } catch (err) {
        console.warn('[Header] Lỗi tải số lượng thông báo Admin:', err);
      }
    };

    loadAdminAlertCounts();

    return () => {
      isActive = false;
    };
  }, [isStrictAdmin, user?.id, user?.email, pendingCount]);

  const totalAlerts = isStrictAdmin
    ? alertCounts.topUp +
      alertCounts.submissions +
      alertCounts.withdrawals +
      alertCounts.reports +
      alertCounts.chats
    : pendingCount;
  const alertBadgeLabel = totalAlerts > 99 ? '99+' : String(totalAlerts);

  // Instant live search matches
  const liveSearchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const safeNovels = Array.isArray(allNovels) ? allNovels : [];
    return safeNovels
      .filter((n) => !n.isHidden && n.publishStatus !== 'hidden')
      .filter((novel) => {
        return (
          (novel.title || '').toLowerCase().includes(q) ||
          (novel.author || '').toLowerCase().includes(q) ||
          (novel.editor && novel.editor.toLowerCase().includes(q)) ||
          (novel.categories || []).some((c) => String(c || '').toLowerCase().includes(q))
        );
      })
      .slice(0, 6);
  }, [searchQuery, allNovels]);

  // Execute full search
  const handleTriggerSearch = (queryToSearch?: string) => {
    const q = (queryToSearch !== undefined ? queryToSearch : searchQuery).trim();
    setIsSearchFocused(false);
    setIsMobileSearchOpen(false);
    if (onPerformSearch) {
      onPerformSearch(q);
    }
  };

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const inDesktopGenre = genreDropdownRef.current && genreDropdownRef.current.contains(event.target as Node);
      const inMobileGenreBtn = mobileGenreRef.current && mobileGenreRef.current.contains(event.target as Node);
      const inMobileGenreMenu = mobileGenreDropdownMenuRef.current && mobileGenreDropdownMenuRef.current.contains(event.target as Node);
      if (!inDesktopGenre && !inMobileGenreBtn && !inMobileGenreMenu) {
        setIsGenreDropdownOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setIsNotifDropdownOpen(false);
      }
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node) &&
        mobileSearchRef.current &&
        !mobileSearchRef.current.contains(event.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const activeGenreList = Array.isArray(genres) && (genres?.length || 0) > 0 ? genres : (INITIAL_HOT_GENRES || []);
  const notifications: AppNotification[] = Array.isArray(user?.notifications) ? user.notifications : [];
  const unreadNotifCount = (notifications || []).filter((n) => !n?.isRead)?.length || 0;

  const activeCategoryId: CategoryFilterId = isShortStoryActive
    ? 'short-story'
    : selectedMainCategory;

  const handleSelectFilterCategory = (categoryId: CategoryFilterId) => {
    if (categoryId === 'short-story') {
      if (onSelectShortStory) onSelectShortStory();
      return;
    }
    setSelectedMainCategory(categoryId);
  };

  return (
    <header className="relative sticky top-0 z-40 w-full backdrop-blur-md bg-white/95 dark:bg-slate-900/95 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-md dark:shadow-black/50 transition-colors">
      {/* Top Banner Bar: Role & Category Tabs (Cuộn ngang trên Mobile, Flex wrap trên PC) */}
      <div className="bg-slate-100/80 dark:bg-slate-950/60 px-3 sm:px-6 py-1.5 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-2">
          {/* Main Categories Selection: Shared FilterMenu powered by GENRE_CONFIG */}
          <div className="w-full sm:w-auto flex-1 min-w-0">
            <FilterMenu
              activeCategory={activeCategoryId}
              onSelectCategory={handleSelectFilterCategory}
              visibleIds={['all', 'truyen-nam', 'dam-my', 'truyen-nu', 'truyen-sang-tac', 'short-story']}
              useShortName={true}
            />
          </div>

          {/* Right Top Area: Admin Badge */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {isAdmin && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-pink-600/10 text-pink-600 dark:text-pink-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>👑 Quản Trị Viên</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 min-h-14 sm:min-h-16 py-1.5 flex items-center justify-between gap-2 flex-wrap">
        {/* Brand Logo: ĐẠO TÂM */}
        <div 
          onClick={onHomeClick}
          className="cursor-pointer flex-shrink-0"
          title="Về Trang Chủ Đạo Tâm"
        >
          <DaoTamLogo size="md" />
        </div>

        {/* Navigation items (Trang chủ, Truyện mới, Hoàn thành, Thể loại) */}
        <nav className="hidden md:flex flex-wrap items-center gap-1">
          <button
            onClick={onHomeClick}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'home' && selectedMainCategory === 'all'
                ? 'text-white bg-pink-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Trang chủ
          </button>
          <button
            onClick={() => setCurrentTab('latest')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'latest'
                ? 'text-white bg-blue-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Truyện mới
          </button>
          <button
            onClick={() => setCurrentTab('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'completed'
                ? 'text-white bg-blue-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Hoàn thành
          </button>

          {/* Thể loại Dropdown Menu - Sau mục hoàn thành (Chuẩn theo hình 1) */}
          <div className="relative" ref={genreDropdownRef}>
            <button
              type="button"
              onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                selectedGenre
                  ? 'text-white bg-blue-600 shadow-sm'
                  : isGenreDropdownOpen
                  ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-cyan-400'
                  : 'text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{selectedGenre ? `Thể loại: ${selectedGenre}` : 'Thể loại'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isGenreDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Danh mục thể loại sổ xuống */}
            {isGenreDropdownOpen && (
              <div className="fixed inset-x-3 top-16 md:absolute md:inset-x-auto md:left-0 md:top-full mt-2 w-auto md:w-[640px] max-h-[75vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 scrollbar-thin">
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-blue-500" />
                    <span>Chọn Thể Loại ({activeGenreList?.length || 0})</span>
                  </span>
                  {selectedGenre && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectGenre) onSelectGenre(null);
                        setIsGenreDropdownOpen(false);
                      }}
                      className="text-[11px] text-rose-500 hover:underline font-semibold cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectGenre) onSelectGenre(null);
                      setIsGenreDropdownOpen(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-left text-xs transition cursor-pointer flex items-center gap-1.5 ${
                      !selectedGenre
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>✨ Tất cả thể loại</span>
                  </button>

                  {(activeGenreList || []).map((g: GenreItem) => {
                    const isSelected = selectedGenre === g.name;
                    return (
                      <button
                        key={g.id || g.name}
                        type="button"
                        onClick={() => {
                          if (onSelectGenre) onSelectGenre(isSelected ? null : g.name);
                          setIsGenreDropdownOpen(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-left text-xs transition cursor-pointer truncate ${
                          isSelected
                            ? 'bg-blue-600 text-white font-bold shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                        title={g.description || g.name}
                      >
                        <span className="truncate">{g.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Action Controls - Mobile ưu tiên Logo, Thông báo, Darkmode, Admin (nếu có quyền), Avatar & Hamburger Menu */}
        <div className="flex items-center gap-2 flex-shrink-0">
          
          {/* Nút Điểm Danh Hằng Ngày trên PC (md:+) — Nếu là 1 trong 2 Admin: return null (ẩn hoàn toàn) */}
          {(() => {
            if (isAdmin) return null;
            return (
              <button
                type="button"
                onClick={onOpenDailyReward}
                className={`hidden md:flex px-3 py-1.5 rounded-xl text-xs font-bold items-center gap-1.5 transition-all cursor-pointer shadow-xs flex-shrink-0 ${
                  hasClaimedToday
                    ? 'bg-rose-50/70 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/40 hover:bg-rose-100/70'
                    : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-rose-500/20 hover:scale-105 active:scale-95'
                }`}
                title={hasClaimedToday ? 'Hôm nay bạn đã điểm danh (bấm để xem túi hoa / thời gian)' : 'Điểm danh hằng ngày nhận 5 hoa'}
              >
                <span className="text-sm">🌸</span>
                <span className="text-xs">Điểm Danh</span>
              </button>
            );
          })()}

          {/* Biểu Tượng Tin Nhắn Trực Tiếp Realtime (Desktop md:+; trên Mobile đưa vào Hamburger Menu để tránh vỡ khung) */}
          <button
            type="button"
            onClick={onOpenChat}
            className="hidden md:flex relative p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 transition-all cursor-pointer shadow-2xs flex-shrink-0"
            title="Tin nhắn trực tiếp"
          >
            <MessageSquare className="w-4 h-4" />
            {unreadChatCount !== undefined && unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse shadow-sm">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </button>

          {/* Biểu Tượng Thông Báo (Hiển thị trên mọi kích thước màn hình kể cả Mobile) */}
          <div className="relative flex-shrink-0" ref={notifDropdownRef}>
            <button
              onClick={() => setIsNotifDropdownOpen(!isNotifDropdownOpen)}
              className="relative w-9 h-9 sm:w-auto sm:h-auto p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 transition-all cursor-pointer shadow-2xs flex items-center justify-center"
              title="Thông báo hệ thống"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse">
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              )}
            </button>

            {/* Notification Popover */}
            {isNotifDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
                    <Bell className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
                    <span>Thông Báo</span>
                    {unreadNotifCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                        {unreadNotifCount}
                      </span>
                    )}
                  </div>
                  {unreadNotifCount > 0 && onMarkNotificationsRead && (
                    <button
                      type="button"
                      onClick={onMarkNotificationsRead}
                      className="text-[11px] text-pink-600 dark:text-pink-400 hover:underline font-semibold cursor-pointer"
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {(notifications?.length || 0) === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      Chưa có thông báo nào.
                    </div>
                  ) : (
                    (notifications || []).map((n) => (
                      <div
                        key={n.id}
                        className={`p-3.5 text-xs transition-colors flex items-start gap-3 ${
                          !n.isRead ? 'bg-pink-50/50 dark:bg-pink-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex-shrink-0 mt-0.5">
                          {n.type === 'topup' ? (
                            <Coins className="w-4 h-4 text-emerald-500" />
                          ) : n.type === 'withdrawal_approved' || n.type === 'payout' ? (
                            <Coins className="w-4 h-4 text-pink-500" />
                          ) : (
                            <BookOpen className="w-4 h-4 text-pink-500" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between gap-2">
                            <span className="line-clamp-1">{n.title}</span>
                            <span className="text-[10px] font-normal text-slate-400 flex-shrink-0">
                              {new Date(n.createdAt).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                            {(() => {
                              const msg = n.message || '';
                              const match = msg.match(/(.*?đã được nâng cấp quyền Tác [Gg]iả\s*\/\s*Editor)/i);
                              if (match && match[1]) {
                                return match[1] + '.';
                              }
                              return msg;
                            })()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Nút Cài đặt App (PWA) - Ẩn trên mobile (hidden md:flex) */}
          <div className="hidden md:flex items-center flex-shrink-0">
            <PWAHeaderInstallButton />
          </div>

          {/* Nút chuyển đổi Chế độ Ban Ngày / Ban Đêm (Hiển thị cả Mobile và Web) */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`flex w-9 h-9 sm:w-auto sm:h-auto p-2 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl text-xs font-bold items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs flex-shrink-0 ${
              theme === 'dark'
                ? 'bg-slate-800 text-pink-300 border border-pink-500/40 hover:bg-slate-700 hover:text-white'
                : 'bg-amber-50 text-amber-700 border border-amber-200/60 hover:bg-amber-100 hover:text-amber-800'
            }`}
            title={theme === 'dark' ? 'Đang ở chế độ Ban Đêm (Bấm để chuyển sang Ban Ngày)' : 'Đang ở chế độ Ban Ngày (Bấm để chuyển sang Ban Đêm)'}
          >
            {theme === 'dark' ? (
              <>
                <Moon className="w-4 h-4 text-pink-400" />
                <span className="hidden sm:inline text-[11px] font-bold">Ban Đêm</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline text-[11px] font-bold">Ban Ngày</span>
              </>
            )}
          </button>

          {/* Chưa đăng nhập: LUÔN HIỂN THỊ nút "Đăng nhập" trên cả Mobile và PC */}
          {(!user?.isLoggedIn || user?.id === 'guest') ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onOpenLogin || onLogin}
                className="flex items-center px-3 sm:px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer flex-shrink-0"
              >
                Đăng nhập
              </button>
            </div>
          ) : (
            /* Đã đăng nhập: Hiện nút Admin (nếu thuộc 2 email Admin) + Avatar Dropdown LUÔN HIỂN THỊ ở góc phải Mobile */
            <div className="flex items-center gap-2 flex-shrink-0">
              {isAdmin && (
                <>
                  {/* PC (md:, lg:) nút Admin */}
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="hidden md:flex relative px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-600 hover:text-white text-pink-700 dark:bg-pink-950/40 dark:text-pink-300 border border-pink-200 dark:border-pink-800 text-xs font-bold items-center gap-1.5 transition-all cursor-pointer shadow-2xs flex-shrink-0"
                    title="Quản trị hệ thống"
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Admin</span>
                    {totalAlerts > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white font-bold text-[10px] flex items-center justify-center leading-none">
                        {alertBadgeLabel}
                      </span>
                    )}
                  </button>

                  {/* Mobile (< md) nút Admin */}
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    aria-label="Mở trang Quản trị Admin"
                    className="md:hidden relative w-9 h-9 p-1.5 rounded-xl bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-300 border border-pink-200 dark:border-pink-800 flex items-center justify-center transition active:scale-95 cursor-pointer flex-shrink-0 overflow-visible"
                    title="Quản trị hệ thống"
                  >
                    <ShieldCheck className="w-5 h-5" />
                    {totalAlerts > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white font-bold text-[10px] flex items-center justify-center leading-none shadow-sm ring-2 ring-white dark:ring-slate-900">
                        {alertBadgeLabel}
                      </span>
                    )}
                  </button>
                </>
              )}

              {/* User Dropdown Menu: LUÔN HIỂN THỊ (flex) ở góc phải màn hình Mobile & PC, bấm vào xổ Menu có nút Đăng xuất */}
              <div className="flex items-center flex-shrink-0">
                <UserDropdown
                  user={user}
                  isOpen={isDropdownOpen}
                  onToggle={() => setIsDropdownOpen(!isDropdownOpen)}
                  onClose={() => setIsDropdownOpen(false)}
                  onOpenTopUp={onOpenTopUp}
                  onOpenWithdraw={onOpenWithdraw}
                  onOpenAdmin={onOpenAdmin}
                  pendingCount={totalAlerts}
                  onOpenProfile={onOpenProfile || onOpenAccount}
                  onOpenPurchasedNovels={onOpenPurchasedNovels}
                  onOpenInterestedNovels={onOpenInterestedNovels || onOpenAccount}
                  onOpenFollowingCreators={onOpenFollowingCreators || onOpenAccount}
                  onOpenMyNovels={onOpenMyNovels || onOpenAuthorShowcase || onOpenAccount}
                  onOpenSubmitNovel={onOpenSubmitNovel}
                  onOpenRegisterCreator={onOpenRegisterCreator}
                  onOpenReadingHistory={onOpenReadingHistory || onOpenAccount}
                  onOpenBookmarks={onOpenBookmarks || onOpenAccount}
                  onOpenStats={onOpenStats || onOpenAccount}
                  onOpenInfo={onOpenInfo || onOpenAccount}
                  onOpenChangePassword={onOpenChangePassword || onOpenEditProfile || onOpenAccount}
                  onLogout={onLogout || onOpenAccount}
                  onLogin={onLogin || onOpenAccount}
                  hasPendingApplication={hasPendingApplication}
                  isStoryPublisher={isStoryPublisher}
                />
              </div>
            </div>
          )}

          {/* Nút Hamburger Menu trên Mobile (< md) để gom điều hướng phụ tránh vỡ khung */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={isMobileMenuOpen}
            className="md:hidden relative w-9 h-9 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition active:scale-95 cursor-pointer flex-shrink-0"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {!isMobileMenuOpen && unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

        </div>
      </div>

      {/* Mobile Hamburger Drawer (< md) - Tự động rớt dòng flex-wrap trên Mobile */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3.5 space-y-2.5 shadow-xl">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onHomeClick();
                setIsMobileMenuOpen(false);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'home' && selectedMainCategory === 'all'
                  ? 'bg-pink-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Trang chủ</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentTab('latest');
                setIsMobileMenuOpen(false);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'latest'
                  ? 'bg-pink-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Truyện mới</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentTab('completed');
                setIsMobileMenuOpen(false);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                currentTab === 'completed'
                  ? 'bg-pink-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Hoàn thành</span>
            </button>
            <div ref={mobileGenreRef}>
              <button
                type="button"
                onClick={() => {
                  setIsGenreDropdownOpen((prev) => !prev);
                  setIsMobileMenuOpen(false);
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-pink-600" />
                <span>{selectedGenre || 'Thể loại'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                if (onOpenChat) onOpenChat();
              }}
              className="flex-1 min-w-[120px] relative px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-pink-600" />
              <span>Tin nhắn</span>
              {unreadChatCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black leading-none">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </button>
          </div>

          {/* Nút Điểm Danh cho Mobile (CHỈ hiện với Độc giả/Tác giả; return null với 2 Admin) */}
          {(() => {
            if (isAdmin) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  if (onOpenDailyReward) onOpenDailyReward();
                }}
                className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  hasClaimedToday
                    ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40'
                    : 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm'
                }`}
              >
                <span>🌸</span>
                <span>{hasClaimedToday ? 'Đã Điểm Danh Hôm Nay' : 'Điểm Danh Nhận Hoa'}</span>
              </button>
            );
          })()}

          {user?.isLoggedIn && user?.id !== 'guest' && onLogout && (
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onLogout();
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất ({user.displayName})</span>
            </button>
          )}
        </div>
      )}

      {/* Khối Dropdown 'Thể loại' dành riêng cho Mobile (Yêu cầu bắt buộc 4) */}
      {isGenreDropdownOpen && (
        <div 
          ref={mobileGenreDropdownMenuRef}
          className="md:hidden absolute left-0 w-full z-50 top-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 shadow-2xl p-4 max-h-[75vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150 scrollbar-thin"
        >
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
              <span>Chọn Thể Loại ({activeGenreList?.length || 0})</span>
            </span>
            {selectedGenre && (
              <button
                type="button"
                onClick={() => {
                  if (onSelectGenre) onSelectGenre(null);
                  setIsGenreDropdownOpen(false);
                }}
                className="text-[11px] text-rose-500 hover:underline font-semibold cursor-pointer"
              >
                Bỏ chọn
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                if (onSelectGenre) onSelectGenre(null);
                setIsGenreDropdownOpen(false);
              }}
              className={`px-3 py-2 rounded-xl text-left text-xs transition cursor-pointer flex items-center gap-1.5 ${
                !selectedGenre
                  ? 'bg-pink-600 text-white font-bold shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <span>✨ Tất cả thể loại</span>
            </button>

            {(activeGenreList || []).map((g: GenreItem) => {
              const isSelected = selectedGenre === g.name;
              return (
                <button
                  key={g.id || g.name}
                  type="button"
                  onClick={() => {
                    if (onSelectGenre) onSelectGenre(isSelected ? null : g.name);
                    setIsGenreDropdownOpen(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-left text-xs transition cursor-pointer truncate ${
                    isSelected
                      ? 'bg-pink-600 text-white font-bold shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title={g.description || g.name}
                >
                  <span className="truncate">{g.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Search Row (Expandable on screens < md) */}
      {isMobileSearchOpen && (
        <div ref={mobileSearchRef} className="md:hidden px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-t border-b border-slate-200 dark:border-slate-800 shadow-md animate-in slide-in-from-top-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleTriggerSearch();
            }}
            className="relative w-full"
          >
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên truyện, tác giả, thể loại..."
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl py-2 pl-3.5 pr-16 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500 shadow-xs"
            />
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  handleTriggerSearch('');
                }}
                className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer"
                title="Xóa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-pink-600 hover:bg-pink-700 text-white flex items-center justify-center transition shadow-xs cursor-pointer"
              title="Tìm kiếm"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Mobile Instant Live Search Dropdown */}
          {searchQuery.trim().length > 0 && (
            <div className="mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 max-h-72 overflow-y-auto">
              {(liveSearchResults?.length || 0) > 0 ? (
                <>
                  {(liveSearchResults || []).map((novel) => (
                    <div
                      key={novel.id}
                      onClick={() => {
                        if (onSelectNovel) onSelectNovel(novel);
                        setIsMobileSearchOpen(false);
                      }}
                      className="p-2.5 hover:bg-pink-50 dark:hover:bg-slate-700 flex items-center gap-3 cursor-pointer"
                    >
                      <img
                        src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                        alt={novel.title}
                        className="w-9 h-12 object-cover rounded-md flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {novel.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {novel.author}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleTriggerSearch()}
                    className="w-full py-2 bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 text-xs font-bold text-center flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Xem tất cả kết quả cho &ldquo;{searchQuery}&rdquo; &rarr;</span>
                  </button>
                </>
              ) : (
                <div className="p-4 text-center text-xs text-slate-500">
                  Không tìm thấy truyện nào. Bấm Enter để tìm kiếm.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
};
