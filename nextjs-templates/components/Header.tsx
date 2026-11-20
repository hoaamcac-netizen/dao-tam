'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import {
  ShieldCheck,
  Menu,
  X,
  Sun,
  Moon,
  Sparkles,
  BookOpen,
  LogIn,
  LogOut,
  User as UserIcon,
  Coins,
  Bell,
  Library,
  ChevronDown,
  Check,
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';
import FilterMenu from './FilterMenu';

// BẮT BUỘC: Chỉ cấp quyền Admin cho ĐÚNG 2 email chính thức
const ADMIN_EMAILS: string[] = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

export function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase().trim() === clean);
}

interface AdminAlertCounts {
  topUp: number;
  submissions: number;
  withdrawals: number;
  reports: number;
  chats: number;
}

interface HeaderProps {
  onOpenAdmin?: () => void;
  onOpenDailyReward?: () => void;
  hasClaimedToday?: boolean;
  onOpenLogin?: () => void;
  onLogout?: () => void;
  adminHref?: string;
  loginHref?: string;
  unreadNotifCount?: number;
}

const INITIAL_ALERTS: AdminAlertCounts = {
  topUp: 0,
  submissions: 0,
  withdrawals: 0,
  reports: 0,
  chats: 0,
};

export default function Header({
  onOpenAdmin,
  onOpenDailyReward,
  hasClaimedToday = false,
  onOpenLogin,
  onLogout,
  adminHref = '/admin/requests',
  loginHref = '/login',
  unreadNotifCount = 0,
}: HeaderProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isNotifMenuOpen, setIsNotifMenuOpen] = useState(false);
  const [alertCounts, setAlertCounts] = useState<AdminAlertCounts>(INITIAL_ALERTS);

  const accountMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  const { user, firebaseUser, markNotificationsAsRead } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    setIsMounted(true);
    const syncActiveCategory = () => {
      if (typeof window === 'undefined') return;
      const pathname = window.location.pathname;
      if (pathname.startsWith('/truyen-ngan')) {
        setActiveCategory('short-story');
        return;
      }
      const sp = new URLSearchParams(window.location.search);
      setActiveCategory(sp.get('category') || 'all');
    };
    syncActiveCategory();
    window.addEventListener('popstate', syncActiveCategory);
    return () => window.removeEventListener('popstate', syncActiveCategory);
  }, []);

  // Đóng menu tài khoản & thông báo khi bấm ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setIsNotifMenuOpen(false);
      }
    };
    if (isAccountMenuOpen || isNotifMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAccountMenuOpen, isNotifMenuOpen]);

  const userEmail = firebaseUser?.email || user?.email || '';
  const isAdmin = Boolean(isMounted && (firebaseUser || user?.isLoggedIn) && checkIsAdmin(userEmail));
  const isLoggedIn = Boolean(isMounted && (user?.isLoggedIn || firebaseUser));

  // Xử lý đăng xuất để đổi tài khoản trên cả Mobile và PC
  const handleLogout = async () => {
    setIsAccountMenuOpen(false);
    setIsMobileMenuOpen(false);
    if (onLogout) {
      onLogout();
      return;
    }
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('[Header] Lỗi đăng xuất:', err);
    }
  };

  // Nút Điểm Danh: Nếu là 1 trong 2 Admin -> return null (ẩn hoàn toàn).
  // Độc giả hoặc Tác giả vẫn hiển thị bình thường.
  const renderDailyRewardButton = (isMobileDrawer = false) => {
    if (isAdmin) return null;

    if (onOpenDailyReward) {
      return (
        <button
          type="button"
          onClick={() => {
            if (isMobileDrawer) setIsMobileMenuOpen(false);
            onOpenDailyReward();
          }}
          className={
            isMobileDrawer
              ? `w-full px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  hasClaimedToday
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    : 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm'
                }`
              : `hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  hasClaimedToday
                    ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50'
                    : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-xs'
                }`
          }
          title={hasClaimedToday ? 'Hôm nay bạn đã điểm danh' : 'Điểm danh hằng ngày nhận hoa'}
        >
          <span className="text-sm leading-none">🌸</span>
          <span>Điểm Danh</span>
        </button>
      );
    }

    return (
      <Link
        href="/?dailyReward=1"
        onClick={() => {
          if (isMobileDrawer) setIsMobileMenuOpen(false);
        }}
        className={
          isMobileDrawer
            ? 'w-full px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm transition'
            : 'hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-xs transition shrink-0'
        }
        title="Điểm danh hằng ngày"
      >
        <span className="text-sm leading-none">🌸</span>
        <span>Điểm Danh</span>
      </Link>
    );
  };

  // 1. CHỈ khi người dùng LÀ ADMIN (checkIsAdmin === true) mới lắng nghe 5 luồng khẩn cấp:
  //    - Mục 1 (Nạp Xu): topup_requests where status == 'pending'
  //    - Mục 2 (Duyệt Tác Giả): novel_submissions where status == 'pending'
  //    - Mục 3 (Rút Lương): withdrawal_requests where status == 'pending'
  //    - Mục 4 (Báo Cáo): novel_reports where status == 'pending'
  //    - Mục 11 (Live Chat): support_chats where unreadCount > 0
  useEffect(() => {
    if (!isAdmin || !auth.currentUser) {
      setAlertCounts(INITIAL_ALERTS);
      return;
    }

    const qTopUp = query(
      collection(db, 'topup_requests'),
      where('status', '==', 'pending')
    );
    const unsubTopUp = onSnapshot(
      qTopUp,
      (snap) => setAlertCounts((prev) => ({ ...prev, topUp: snap.size })),
      (err) => console.warn('[Header] Lỗi lắng nghe topup_requests pending:', err)
    );

    const qSubmissions = query(
      collection(db, 'novel_submissions'),
      where('status', '==', 'pending')
    );
    const unsubSubmissions = onSnapshot(
      qSubmissions,
      (snap) => setAlertCounts((prev) => ({ ...prev, submissions: snap.size })),
      (err) => console.warn('[Header] Lỗi lắng nghe novel_submissions pending:', err)
    );

    const qWithdrawals = query(
      collection(db, 'withdrawal_requests'),
      where('status', '==', 'pending')
    );
    const unsubWithdrawals = onSnapshot(
      qWithdrawals,
      (snap) => setAlertCounts((prev) => ({ ...prev, withdrawals: snap.size })),
      (err) => console.warn('[Header] Lỗi lắng nghe withdrawal_requests pending:', err)
    );

    const qReports = query(
      collection(db, 'novel_reports'),
      where('status', '==', 'pending')
    );
    const unsubReports = onSnapshot(
      qReports,
      (snap) => setAlertCounts((prev) => ({ ...prev, reports: snap.size })),
      (err) => console.warn('[Header] Lỗi lắng nghe novel_reports pending:', err)
    );

    const qSupportChats = query(
      collection(db, 'support_chats'),
      where('unreadCount', '>', 0)
    );
    const unsubSupportChats = onSnapshot(
      qSupportChats,
      (snap) => setAlertCounts((prev) => ({ ...prev, chats: snap.size })),
      (err) => console.warn('[Header] Lỗi lắng nghe support_chats unread:', err)
    );

    return () => {
      unsubTopUp();
      unsubSubmissions();
      unsubWithdrawals();
      unsubReports();
      unsubSupportChats();
    };
  }, [isAdmin]);

  const totalAlerts =
    alertCounts.topUp +
    alertCounts.submissions +
    alertCounts.withdrawals +
    alertCounts.reports +
    alertCounts.chats;

  const badgeLabel = totalAlerts > 99 ? '99+' : String(totalAlerts);

  const displayName =
    user?.displayName ||
    firebaseUser?.displayName ||
    userEmail.split('@')[0] ||
    'Thành viên';
  const avatarUrl = user?.avatarUrl || firebaseUser?.photoURL || '';
  const totalXu = ((user?.xuBalance || 0) + (user?.authorEarnedXu || 0)).toLocaleString('vi-VN');
  const notificationsList = Array.isArray(user?.notifications) ? user.notifications : [];
  const effectiveUnreadNotifCount =
    unreadNotifCount > 0 ? unreadNotifCount : (notificationsList || []).filter((n) => !n?.isRead)?.length || 0;

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/90 dark:bg-slate-950/90 border-b border-pink-100 dark:border-pink-950/65 shadow-xs transition-colors">
      {/* Thanh Navbar chính: flex flex-wrap items-center justify-between tự xuống dòng mượt trên Mobile */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 min-h-16 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Logo & Brand */}
        <Link href="/" className="flex items-center gap-2 min-w-0 shrink-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-pink-600 via-pink-500 to-rose-400 flex items-center justify-center text-white font-black text-base sm:text-lg shadow-md shadow-pink-500/20 shrink-0">
            Đ
          </div>
          <div className="min-w-0">
            <span className="block text-base sm:text-xl font-black bg-gradient-to-r from-pink-600 via-pink-500 to-rose-400 bg-clip-text text-transparent truncate">
              Đạo Tâm
            </span>
            <span className="hidden sm:block text-[11px] text-pink-600/80 dark:text-pink-400 font-medium">
              Đọc Truyện Chữ &amp; Audio AI
            </span>
          </div>
        </Link>

        {/* PC Navigation (md:, lg:) */}
        <nav className="hidden md:flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-pink-50 dark:hover:bg-slate-900 hover:text-pink-600 transition flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4 text-pink-500" />
            <span>Trang chủ</span>
          </Link>

          <Link
            href="/truyen-ngan"
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-pink-50 dark:hover:bg-slate-900 hover:text-pink-600 transition flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4 text-pink-500" />
            <span>Truyện Ngắn</span>
          </Link>

          <Link
            href="/tu-truyen-cua-ban"
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-pink-50 dark:hover:bg-slate-900 hover:text-pink-600 transition"
          >
            Tủ truyện
          </Link>
        </nav>

        {/* Cụm icon bên phải: Thông báo, Darkmode, Admin (nếu có quyền), Avatar (LUÔN HIỂN THỊ), Hamburger Menu */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Điểm Danh trên PC (Ẩn hoàn toàn nếu là 1 trong 2 Admin) */}
          {renderDailyRewardButton(false)}

          {/* Thông báo */}
          {isLoggedIn && (
            <div className="relative shrink-0" ref={notifMenuRef}>
              <button
                type="button"
                onClick={() => setIsNotifMenuOpen((prev) => !prev)}
                aria-label="Thông báo"
                aria-expanded={isNotifMenuOpen}
                className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:text-pink-600 flex items-center justify-center transition cursor-pointer shrink-0"
                title="Thông báo"
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                {effectiveUnreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {effectiveUnreadNotifCount > 9 ? '9+' : effectiveUnreadNotifCount}
                  </span>
                )}
              </button>

              {isNotifMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-pink-100 dark:border-slate-800 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-pink-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-pink-50/50 dark:bg-slate-800/60">
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      Thông báo ({effectiveUnreadNotifCount} mới)
                    </span>
                    {effectiveUnreadNotifCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markNotificationsAsRead()}
                        className="text-[11px] font-bold text-pink-600 hover:text-pink-700 dark:text-pink-400 flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>Đánh dấu đã đọc</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {(notificationsList?.length || 0) === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-400">
                        Chưa có thông báo nào.
                      </div>
                    ) : (
                      (notificationsList || []).slice(0, 15).map((notif) => (
                        <div
                          key={notif.id}
                          className={`px-4 py-3 text-xs space-y-1 ${
                            notif.isRead ? 'opacity-70' : 'bg-pink-50/40 dark:bg-pink-950/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {notif.title || 'Thông báo hệ thống'}
                            </span>
                            {!notif.isRead && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {notif.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {user?.id && (
                    <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 text-center">
                      <Link
                        href={`/profile/${user.id}`}
                        onClick={() => setIsNotifMenuOpen(false)}
                        className="text-[11px] font-bold text-pink-600 hover:underline dark:text-pink-400"
                      >
                        Xem trang cá nhân
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Chuyển đổi Dark/Light mode */}
          {isMounted && (
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Đổi giao diện Sáng / Tối"
              className="w-9 h-9 sm:w-10 sm:h-10 p-2 rounded-xl bg-pink-50 dark:bg-slate-900 text-pink-600 dark:text-pink-300 border border-pink-100 dark:border-slate-800 hover:bg-pink-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer shrink-0"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>
          )}

          {/* NÚT ADMIN TRÊN PC (md:, lg:) */}
          {isAdmin && (
            onOpenAdmin ? (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hidden md:inline-flex relative items-center gap-1.5 px-3.5 py-2 rounded-xl bg-pink-50 hover:bg-pink-600 text-pink-700 hover:text-white dark:bg-pink-950/60 dark:text-pink-300 dark:hover:bg-pink-600 dark:hover:text-white border border-pink-200 dark:border-pink-800 text-xs font-bold transition cursor-pointer shrink-0"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Admin</span>
                {totalAlerts > 0 && (
                  <span className="ml-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center leading-none shadow-xs">
                    {badgeLabel}
                  </span>
                )}
              </button>
            ) : (
              <Link
                href={adminHref}
                className="hidden md:inline-flex relative items-center gap-1.5 px-3.5 py-2 rounded-xl bg-pink-50 hover:bg-pink-600 text-pink-700 hover:text-white dark:bg-pink-950/60 dark:text-pink-300 dark:hover:bg-pink-600 dark:hover:text-white border border-pink-200 dark:border-pink-800 text-xs font-bold transition shrink-0"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Admin</span>
                {totalAlerts > 0 && (
                  <span className="ml-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center leading-none shadow-xs">
                    {badgeLabel}
                  </span>
                )}
              </Link>
            )
          )}

          {/* NÚT ADMIN TRÊN MOBILE (< md) */}
          {isAdmin && (
            onOpenAdmin ? (
              <button
                type="button"
                onClick={onOpenAdmin}
                aria-label="Mở trang Quản trị Admin"
                className="md:hidden relative w-9 h-9 p-1.5 rounded-xl bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-300 border border-pink-200 dark:border-pink-800 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0 overflow-visible"
              >
                <ShieldCheck className="w-5 h-5" />
                {totalAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm ring-2 ring-white dark:ring-slate-950">
                    {badgeLabel}
                  </span>
                )}
              </button>
            ) : (
              <Link
                href={adminHref}
                aria-label="Mở trang Quản trị Admin"
                className="md:hidden relative w-9 h-9 p-1.5 rounded-xl bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-300 border border-pink-200 dark:border-pink-800 flex items-center justify-center transition active:scale-95 shrink-0 overflow-visible"
              >
                <ShieldCheck className="w-5 h-5" />
                {totalAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm ring-2 ring-white dark:ring-slate-950">
                    {badgeLabel}
                  </span>
                )}
              </Link>
            )
          )}

          {/* TRẠNG THÁI ĐĂNG NHẬP / AVATAR: LUÔN HIỂN THỊ TRÊN CẢ MOBILE VÀ PC (KHÔNG dùng hidden md:flex) */}
          {isMounted && !isLoggedIn && (
            onOpenLogin ? (
              <button
                type="button"
                onClick={onOpenLogin}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold shadow-sm transition cursor-pointer shrink-0"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>Đăng nhập</span>
              </button>
            ) : (
              <Link
                href={loginHref}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold shadow-sm transition shrink-0"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>Đăng nhập</span>
              </Link>
            )
          )}

          {isMounted && isLoggedIn && (
            <div className="relative flex items-center gap-2 shrink-0" ref={accountMenuRef}>
              {/* Số dư Xu hiển thị gọn trên PC */}
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-pink-50 dark:bg-pink-950/50 border border-pink-200 dark:border-pink-800/70">
                <Coins className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400 shrink-0" />
                <span className="text-xs font-black text-pink-600 dark:text-pink-300 tabular-nums">
                  {totalXu} Xu
                </span>
              </div>

              {/* Nút Avatar: LUÔN HIỂN THỊ ở góc phải màn hình Mobile & PC, bấm để xổ Menu Tài khoản & Đăng xuất */}
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                aria-label="Mở menu tài khoản"
                aria-expanded={isAccountMenuOpen}
                className="flex items-center gap-1.5 p-1 pr-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:ring-2 hover:ring-pink-500 transition cursor-pointer shrink-0"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-pink-600 text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                    {displayName.charAt(0)}
                  </div>
                )}
                <span className="hidden md:inline text-xs font-bold text-slate-800 dark:text-slate-100 max-w-[110px] truncate">
                  {displayName}
                </span>
                <ChevronDown
                  className={`hidden sm:block w-3.5 h-3.5 text-slate-500 transition-transform ${
                    isAccountMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Menu Tài khoản xổ xuống (chứa nút Đăng xuất cho cả Mobile và PC) */}
              {isAccountMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-1rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-pink-100 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-3 bg-gradient-to-r from-pink-50 to-rose-50/70 dark:from-pink-950/60 dark:to-slate-900 border-b border-pink-100 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {displayName}
                      </p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300 shrink-0">
                        {isAdmin ? 'ADMIN' : user?.role === 'author' ? 'TÁC GIẢ' : 'ĐỘC GIẢ'}
                      </span>
                    </div>
                    {userEmail && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {userEmail}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-black text-pink-600 dark:text-pink-400 tabular-nums">
                      <Coins className="w-3.5 h-3.5 shrink-0" />
                      <span>Số dư: {totalXu} Xu</span>
                    </div>
                  </div>

                  <div className="py-1.5">
                    {user?.id && (
                      <Link
                        href={`/profile/${user.id}`}
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="w-full px-4 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-pink-50 dark:hover:bg-slate-800 flex items-center gap-2.5 transition"
                      >
                        <UserIcon className="w-4 h-4 text-pink-500 shrink-0" />
                        <span>Trang cá nhân</span>
                      </Link>
                    )}

                    <Link
                      href="/tu-truyen-cua-ban"
                      onClick={() => setIsAccountMenuOpen(false)}
                      className="w-full px-4 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-pink-50 dark:hover:bg-slate-800 flex items-center gap-2.5 transition"
                    >
                      <Library className="w-4 h-4 text-pink-500 shrink-0" />
                      <span>Tủ truyện của bạn</span>
                    </Link>

                    {isAdmin && (
                      onOpenAdmin ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsAccountMenuOpen(false);
                            onOpenAdmin();
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-bold text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5">
                            <ShieldCheck className="w-4 h-4 text-pink-600 shrink-0" />
                            <span>Quản trị Admin</span>
                          </span>
                          {totalAlerts > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                              {badgeLabel}
                            </span>
                          )}
                        </button>
                      ) : (
                        <Link
                          href={adminHref}
                          onClick={() => setIsAccountMenuOpen(false)}
                          className="w-full px-4 py-2.5 text-left text-xs font-bold text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 transition"
                        >
                          <span className="flex items-center gap-2.5">
                            <ShieldCheck className="w-4 h-4 text-pink-600 shrink-0" />
                            <span>Quản trị Admin</span>
                          </span>
                          {totalAlerts > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                              {badgeLabel}
                            </span>
                          )}
                        </Link>
                      )
                    )}

                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                    {/* Nút Đăng xuất để người dùng đổi tài khoản dễ dàng trên Mobile & PC */}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nút Hamburger Menu Mobile (< md) */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={isMobileMenuOpen}
            className="md:hidden relative w-9 h-9 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0 overflow-visible"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
            {isAdmin && totalAlerts > 0 && !isMobileMenuOpen && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-950" />
            )}
          </button>
        </div>
      </div>

      {/* Thanh phân mục nhanh đồng bộ theo GENRE_CONFIG */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pb-2.5 pt-1.5 border-t border-pink-100/70 dark:border-pink-950/50">
        <FilterMenu
          asLinks={true}
          activeCategory={activeCategory}
          visibleIds={['all', 'truyen-nam', 'dam-my', 'truyen-nu', 'truyen-sang-tac', 'short-story']}
          useShortName={true}
        />
      </div>

      {/* Hamburger Menu xổ xuống trên Mobile (< md) */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-pink-100 dark:border-pink-950/60 bg-white dark:bg-slate-950 px-4 py-4 space-y-2.5 shadow-xl overflow-x-hidden">
          {isAdmin && (
            <div className="pt-1">
              {onOpenAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenAdmin();
                  }}
                  className="relative w-full p-2.5 min-h-[44px] rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer overflow-visible"
                >
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                  <span>Admin</span>
                  {totalAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-md ring-2 ring-white dark:ring-slate-950">
                      {badgeLabel}
                    </span>
                  )}
                </button>
              ) : (
                <Link
                  href={adminHref}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="relative w-full p-2.5 min-h-[44px] rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition overflow-visible"
                >
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                  <span>Admin</span>
                  {totalAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-md ring-2 ring-white dark:ring-slate-950">
                      {badgeLabel}
                    </span>
                  )}
                </Link>
              )}
            </div>
          )}

          {/* Nút Điểm Danh trong Hamburger Menu (return null nếu là 1 trong 2 Admin) */}
          {renderDailyRewardButton(true)}

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-pink-50 dark:hover:bg-slate-900 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-pink-500" />
              <span>Trang chủ</span>
            </Link>
            <Link
              href="/truyen-ngan"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-pink-50 dark:hover:bg-slate-900 flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4 text-pink-500" />
              <span>Truyện Ngắn</span>
            </Link>
            <Link
              href="/tu-truyen-cua-ban"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-pink-50 dark:hover:bg-slate-900 flex items-center gap-2"
            >
              <Library className="w-4 h-4 text-pink-500" />
              <span>Tủ truyện của bạn</span>
            </Link>
          </div>

          {isMounted && isLoggedIn && (
            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="px-3 py-2.5 rounded-xl bg-pink-50 dark:bg-pink-950/40 border border-pink-200/80 dark:border-pink-900/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <UserIcon className="w-4 h-4 text-pink-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {displayName}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-black text-pink-600 dark:text-pink-300 shrink-0 tabular-nums">
                  <Coins className="w-3.5 h-3.5" />
                  <span>{totalXu} Xu</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2.5 min-h-[44px] rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}

          {isMounted && !isLoggedIn && (
            onOpenLogin ? (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenLogin();
                }}
                className="w-full py-2.5 min-h-[44px] rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập</span>
              </button>
            ) : (
              <Link
                href={loginHref}
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full py-2.5 min-h-[44px] rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập</span>
              </Link>
            )
          )}
        </div>
      )}
    </header>
  );
}
