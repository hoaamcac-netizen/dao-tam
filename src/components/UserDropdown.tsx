import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  User, 
  Eye, 
  Bell, 
  BookOpen, 
  Plus, 
  Bookmark, 
  BarChart2, 
  Settings, 
  LogOut,
  Coins,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Lock,
  Library
} from 'lucide-react';
import { UserProfile } from '../types';
import { checkIsAdmin } from '../firebase/config';

interface UserDropdownProps {
  user: UserProfile;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenTopUp: () => void;
  onOpenProfile: () => void;
  onOpenPurchasedNovels?: () => void;
  onOpenInterestedNovels?: () => void;
  onOpenFollowingCreators: () => void;
  onOpenMyNovels: () => void;
  onOpenSubmitNovel: () => void;
  onOpenRegisterCreator?: () => void;
  onOpenReadingHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenStats: () => void;
  onOpenInfo: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
  onLogin: () => void;
  onOpenWithdraw?: () => void;
  hasPendingApplication?: boolean;
  isStoryPublisher?: boolean;
  onOpenAdmin?: () => void;
  pendingCount?: number;
}

export const UserDropdown: React.FC<UserDropdownProps> = ({
  user,
  isOpen,
  onToggle,
  onClose,
  onOpenTopUp,
  onOpenWithdraw,
  onOpenProfile,
  onOpenPurchasedNovels,
  onOpenInterestedNovels,
  onOpenFollowingCreators,
  onOpenMyNovels,
  onOpenSubmitNovel,
  onOpenRegisterCreator,
  onOpenReadingHistory,
  onOpenBookmarks,
  onOpenStats,
  onOpenInfo,
  onOpenChangePassword,
  onLogout,
  onLogin,
  hasPendingApplication = false,
  isStoryPublisher = false,
  onOpenAdmin,
  pendingCount = 0,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // BẮT BUỘC: Chỉ cấp quyền Admin cho ĐÚNG 2 email: hoaamcac@gmail.com và meoyeutien22@gmail.com
  const isAdmin = checkIsAdmin(user.email);
  const isAuthor = user.role === 'author';
  const isEditor = (user.role as string) === 'editor';
  // Đối tượng Admin, Tác giả, Editor: Nếu role của user thuộc nhóm này, BẮT BUỘC render đầy đủ 13 mục
  // Đối tượng Độc giả (Reader): Nếu role là Độc giả (hoặc không phải Admin/Tác giả/Editor), BẮT BUỘC ẨN 5 mục:
  // 'Truyện của bạn', 'Đăng truyện', 'Rút xu', 'Thống kê', và 'Thông tin'.
  const isPrivilegedUser = Boolean(
    isAdmin ||
    isAuthor ||
    isEditor ||
    Boolean((user as any).isAuthor)
  );
  const isApproved = isPrivilegedUser;

  // If not logged in, clicking avatar prompts login
  if (!user.isLoggedIn || user.id === 'guest') {
    return (
      <button
        type="button"
        onClick={onLogin}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
        title="Đăng nhập tài khoản"
      >
        <User className="w-3.5 h-3.5" />
        <span>Đăng Nhập</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Button Trigger */}
      <button
        onClick={onToggle}
        className="relative flex items-center gap-2 p-1.5 md:p-1 min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 rounded-full bg-slate-100 dark:bg-slate-800 hover:ring-2 hover:ring-pink-500 transition-all cursor-pointer shadow-xs focus:outline-none flex-shrink-0 overflow-visible"
        title="Menu người dùng"
        aria-expanded={isOpen}
      >
        <div className="relative flex-shrink-0">
          {user?.avatarUrl && user.avatarUrl.trim() !== '' ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName || 'Avatar'}
              className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-pink-600 text-white flex items-center justify-center font-bold text-xs ring-1 ring-slate-300 dark:ring-slate-700 uppercase">
              {(user?.displayName || 'U').charAt(0)}
            </div>
          )}
          {isAdmin ? (
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] text-black font-extrabold shadow-xs" title="Quản Trị Viên">
              ★
            </span>
          ) : isAuthor ? (
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-pink-600 rounded-full flex items-center justify-center text-[8px] text-white font-extrabold shadow-xs" title="Tác Giả / Editor">
              ✍
            </span>
          ) : null}
        </div>
        <span className="hidden md:inline font-semibold text-xs text-slate-800 dark:text-slate-200 max-w-[90px] truncate pr-1">
          {user.displayName}
        </span>
      </button>

      {/* Dropdown Menu Modal */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-72 max-w-[calc(100vw-1rem)] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          
          {/* Subtle triangle arrow pointing to avatar */}
          <div className="absolute -top-1.5 right-4 w-3 h-3 bg-pink-50 dark:bg-slate-900 rotate-45 border-l border-t border-pink-100 dark:border-slate-800" />

          {/* DÒNG ĐẦU TIÊN CỦA MENU: SỐ DƯ XU VÀ NÚT ADMIN NẰM NGAY CẠNH NHAU DỄ THẤY NHẤT */}
          <div className="px-3.5 py-3 bg-gradient-to-r from-pink-50 via-rose-50/70 to-pink-50 dark:from-pink-950/70 dark:via-rose-950/50 dark:to-pink-950/70 border-b border-pink-100 dark:border-pink-900/60 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-pink-600/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 flex items-center justify-center flex-shrink-0">
                <Coins className="w-4 h-4 text-pink-600 dark:text-pink-400 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-black dark:text-black">
                  Số dư ví Xu
                </div>
                <div 
                  className="text-sm font-black text-pink-600 dark:text-pink-600 tabular-nums truncate coin-number-pink"
                  title={user.authorEarnedXu ? `Ví: ${(user.xuBalance || 0).toLocaleString('vi-VN')} Xu | Nhuận bút: ${(user.authorEarnedXu || 0).toLocaleString('vi-VN')} Xu` : undefined}
                >
                  {((user.xuBalance || 0) + (user.authorEarnedXu || 0)).toLocaleString('vi-VN')} Xu
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 pr-1.5">
              {isAdmin && onOpenAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAdmin();
                  }}
                  className="relative p-2 px-3 min-h-[40px] rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer flex items-center gap-1.5 overflow-visible"
                  title="Mở Bảng Điều Khiển Quản Trị Viên (Admin)"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Admin</span>
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm ring-2 ring-white dark:ring-slate-900">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* User Status Bar */}
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-bold text-xs text-slate-900 dark:text-slate-200 truncate">
                {user.displayName}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isAdmin ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ADMIN
                  </span>
                ) : (user.role as string) === 'editor' ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    EDITOR
                  </span>
                ) : isAuthor ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300">
                    TÁC GIẢ
                  </span>
                ) : (
                  <span 
                    data-role="reader"
                    className="text-[10px] font-extrabold px-1.5 py-0.5 rounded badge-reader-yellow bg-amber-500/15 dark:bg-amber-950/40 text-amber-500 dark:text-amber-400 border border-amber-400/40"
                  >
                    ĐỘC GIẢ
                  </span>
                )}
                <span className="text-[10px] text-slate-500 dark:text-slate-200 truncate">
                  {user.email ? user.email.split('@')[0] : ''}
                </span>
              </div>
            </div>
            {isApproved && (
              <span className="text-xs text-amber-500 font-semibold flex items-center gap-0.5" title="Đã duyệt quyền sáng tác">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          {/* Menu Items List - 13 mục gốc với phân quyền chuẩn xác theo yêu cầu */}
          <div className="py-1">
            {/* 1. Nạp xu */}
            <button
              key="topup"
              onClick={() => { onClose(); onOpenTopUp(); }}
              className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-rose-600 dark:text-slate-200 hover:bg-rose-50/60 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                  <Coins className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                </span>
                <span className="font-extrabold text-rose-600 dark:text-slate-200 group-hover:dark:text-slate-900">
                  Nạp xu
                </span>
              </div>
            </button>

            {/* 2. Rút xu (ẨN đối với Độc giả, CHỈ hiển thị cho Admin, Tác giả, Editor) */}
            {isPrivilegedUser && (
              <button
                key="withdraw"
                onClick={() => { onClose(); onOpenWithdraw?.(); }}
                className="w-[calc(100%-16px)] mx-2 my-1 px-3 py-2 rounded-xl text-left flex items-center justify-between text-xs sm:text-[13px] bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:from-pink-600 hover:to-rose-600 dark:hover:bg-yellow-400 dark:hover:from-yellow-400 dark:hover:to-yellow-400 text-white dark:hover:text-slate-900 font-black shadow-md shadow-pink-500/25 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] group"
                title="Rút xu cho người đăng truyện (Tối thiểu 1000 xu)"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-md bg-white/20 group-hover:dark:bg-slate-900/10 flex items-center justify-center flex-shrink-0">
                    <Coins className="w-3.5 h-3.5 text-white group-hover:dark:text-slate-900" />
                  </div>
                  <span className="font-extrabold text-white group-hover:dark:text-slate-900 tracking-wide">Rút xu</span>
                </div>

                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/25 group-hover:dark:bg-slate-900/10 text-white group-hover:dark:text-slate-900 font-bold border border-white/30 whitespace-nowrap">
                  Tối thiểu 1000 Xu
                </span>
              </button>
            )}

            {/* 3. Trang cá nhân */}
            <button
              key="profile"
              onClick={() => { onClose(); onOpenProfile(); }}
              className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                  <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </span>
                <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                  Trang cá nhân
                </span>
              </div>
            </button>

            {/* 4. Tủ truyện của bạn - Route page hoàn toàn độc lập /tu-truyen-cua-ban */}
            <Link
              key="purchased-novels"
              to="/tu-truyen-cua-ban"
              onClick={() => { 
                onClose(); 
                if (onOpenPurchasedNovels) {
                  onOpenPurchasedNovels();
                } else if (onOpenInterestedNovels) {
                  onOpenInterestedNovels();
                }
              }}
              className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                  <Library className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                </span>
                <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                  Tủ truyện của bạn
                </span>
              </div>
            </Link>

            {/* 5. Đang theo dõi */}
            <button
              key="following"
              onClick={() => { onClose(); onOpenFollowingCreators(); }}
              className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                  <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </span>
                <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                  Đang theo dõi
                </span>
              </div>
              {((user.followingNovels?.length || 0) + (user.followingCreators?.length || 0)) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 group-hover:dark:bg-yellow-300 group-hover:dark:text-slate-900 text-[10px] font-semibold">
                  {(user.followingNovels?.length || 0) + (user.followingCreators?.length || 0)}
                </span>
              )}
            </button>

            {/* 6. Truyện của bạn (ẨN đối với Độc giả, CHỈ hiển thị cho Admin, Tác giả, Editor) */}
            {isPrivilegedUser && (
              <button
                key="my-novels"
                onClick={() => { onClose(); onOpenMyNovels(); }}
                className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                    <BookOpen className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </span>
                  <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                    Truyện của bạn
                  </span>
                </div>
              </button>
            )}

            {/* 7. Đăng truyện (ẨN đối với Độc giả, CHỈ hiển thị cho Admin, Tác giả, Editor) */}
            {isPrivilegedUser && (
              <button
                key="submit"
                onClick={() => { onClose(); onOpenSubmitNovel(); }}
                className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                    <Plus className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </span>
                  <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                    Đăng truyện
                  </span>
                </div>
              </button>
            )}

            {/* 8. Truyện đã đọc */}
            <button
              key="history"
              onClick={() => { onClose(); onOpenReadingHistory(); }}
              className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                  <Eye className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </span>
                <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                  Truyện đã đọc
                </span>
              </div>
              {(user.readingHistory?.length || 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 group-hover:dark:bg-yellow-300 group-hover:dark:text-slate-900 text-[10px] font-semibold">
                  {user.readingHistory?.length || 0}
                </span>
              )}
            </button>

            {/* 9. Truyện đã lưu */}
            <button
              key="bookmarks"
              onClick={() => { onClose(); onOpenBookmarks(); }}
              className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                  <Bookmark className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </span>
                <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                  Truyện đã lưu
                </span>
              </div>
              {(user.bookmarks?.length || 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 group-hover:dark:bg-yellow-300 group-hover:dark:text-slate-900 text-[10px] font-semibold">
                  {user.bookmarks?.length || 0}
                </span>
              )}
            </button>

            {/* 10. Thống kê (ẨN đối với Độc giả, CHỈ hiển thị cho Admin, Tác giả, Editor) */}
            {isPrivilegedUser && (
              <button
                key="stats"
                onClick={() => { onClose(); onOpenStats(); }}
                className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                    <BarChart2 className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </span>
                  <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                    Thống kê
                  </span>
                </div>
              </button>
            )}

            {/* 11. Thông tin (ẨN đối với Độc giả, CHỈ hiển thị cho Admin, Tác giả, Editor) */}
            {isPrivilegedUser && (
              <button
                key="info"
                onClick={() => { onClose(); onOpenInfo(); }}
                className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                    <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </span>
                  <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                    Thông tin
                  </span>
                </div>
              </button>
            )}

            {/* 12. Đổi mật khẩu */}
            <button
              key="change-password"
              onClick={() => { onClose(); onOpenChangePassword(); }}
              className="w-full px-4 py-2 text-left flex items-center justify-between text-[13px] transition-all cursor-pointer group text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400 group-hover:text-blue-600 group-hover:dark:text-slate-900 transition-colors">
                  <Settings className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </span>
                <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">
                  Đổi mật khẩu
                </span>
              </div>
            </button>

            {/* Divider */}
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

            {/* 13. Đăng xuất */}
            <button
              key="logout"
              onClick={() => { onClose(); onLogout(); }}
              className="w-full px-4 py-2 text-left flex items-center gap-3 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900 hover:text-rose-600 transition-colors cursor-pointer group"
            >
              <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-rose-600 group-hover:dark:text-slate-900 transition-colors" />
              <span className="font-medium dark:text-slate-200 group-hover:dark:text-slate-900">Đăng xuất</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
