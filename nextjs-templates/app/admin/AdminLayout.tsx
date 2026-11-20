"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Menu,
  X,
  ArrowLeft,
  ShieldCheck,
  Coins,
  BookOpen,
  Building2,
  Flag,
  Layers,
  BookPlus,
  MessageSquare,
  FileCode2,
  Users,
  Eye,
  Megaphone,
} from "lucide-react";

export type AdminTabKey =
  | "requests"
  | "submissions"
  | "payouts"
  | "reports"
  | "novels"
  | "batch"
  | "comments"
  | "tools"
  | "users"
  | "messages"
  | "support_chat"
  | "global_banner";

export interface AdminNavBadgeCounts {
  pendingTopUpCount?: number;
  pendingSubmissionsCount?: number;
  pendingWithdrawalCount?: number;
  pendingReportsCount?: number;
  totalNovelsCount?: number;
  commentsCount?: number;
  bannedUsersCount?: number;
}

export interface AdminLayoutProps {
  activeTab: AdminTabKey;
  onSelectTab: (tab: AdminTabKey) => void;
  adminName?: string;
  badges?: AdminNavBadgeCounts;
  onExit?: () => void;
  homeHref?: string;
  children: React.ReactNode;
}

export default function AdminLayout({
  activeTab,
  onSelectTab,
  adminName = "Admin",
  badges = {},
  onExit,
  homeHref = "/",
  children,
}: AdminLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const {
    pendingTopUpCount = 0,
    pendingSubmissionsCount = 0,
    pendingWithdrawalCount = 0,
    pendingReportsCount = 0,
    totalNovelsCount = 0,
    commentsCount = 0,
    bannedUsersCount = 0,
  } = badges;

  const totalPendingWork =
    pendingTopUpCount +
    pendingSubmissionsCount +
    pendingWithdrawalCount +
    pendingReportsCount;

  const handleMenuClick = (tab: AdminTabKey) => {
    onSelectTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-900 overflow-hidden">
      {/* 1. HEADER CỐ ĐỊNH TRÊN CÙNG (fixed top-0, z-40, h-16) */}
      <header className="fixed top-0 inset-x-0 z-40 h-16 bg-white/95 backdrop-blur-md border-b border-pink-100 shadow-xs">
        {/* Mobile Header (< md): Chỉ giữ 3 thành phần ngang Flexbox */}
        <div className="flex md:hidden items-center justify-between h-full px-3 gap-2">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Mở danh mục quản lý"
            className="w-10 h-10 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-600 flex items-center justify-center border border-pink-200 transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="text-base font-black bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent truncate text-center">
            Admin Đạo Tâm
          </h1>

          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Thoát</span>
            </button>
          ) : (
            <Link
              href={homeHref}
              className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Thoát</span>
            </Link>
          )}
        </div>

        {/* Desktop Header (>= md) */}
        <div className="hidden md:flex items-center justify-between h-full px-5">
          <div className="flex items-center gap-3">
            {onExit ? (
              <button
                type="button"
                onClick={onExit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-pink-50 text-slate-700 hover:text-pink-600 text-xs font-bold transition cursor-pointer border border-slate-200 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4 text-pink-600" />
                <span>Về trang chủ</span>
              </button>
            ) : (
              <Link
                href={homeHref}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-pink-50 text-slate-700 hover:text-pink-600 text-xs font-bold transition border border-slate-200 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4 text-pink-600" />
                <span>Về trang chủ</span>
              </Link>
            )}

            <div className="h-5 w-px bg-slate-200" />

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center text-pink-600 shadow-xs shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-slate-900">
                  Hệ Thống Quản Trị Admin —{" "}
                  <span className="text-pink-600">Đạo Tâm</span>
                </h1>
                <p className="text-[11px] text-pink-600 font-semibold">
                  Kiểm duyệt tác phẩm, đối soát lương &amp; vận hành nền tảng
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {totalPendingWork > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-700 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-pink-600" />
                <span>{totalPendingWork} việc cần xử lý</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-800">{adminName}</span>
              <span className="text-[9px] bg-pink-600 text-white px-2 py-0.5 rounded font-black tracking-wide">
                SUPER ADMIN
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. THÂN TRANG: Drawer trên Mobile + Sidebar cố định bên trái trên Desktop */}
      <div className="flex-1 flex h-full overflow-hidden relative">
        {/* Backdrop đen mờ trên Mobile khi mở Drawer */}
        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden transition-opacity"
          />
        )}

        {/* SIDEBAR <aside>: Overlay Drawer trên Mobile, Cố định w-64 trên Desktop */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-pink-100 flex flex-col flex-shrink-0 overflow-y-auto shadow-2xl md:shadow-none transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 md:z-auto md:pt-16 md:flex ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="p-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-pink-100 flex items-center justify-between bg-pink-50/40 md:bg-white">
            <span className="text-pink-700">Danh mục quản lý</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-pink-600 font-bold bg-pink-100 px-2 py-0.5 rounded-full">
                12 mục
              </span>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-pink-600 hover:bg-pink-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <nav className="p-2.5 space-y-1.5 flex-1 overflow-y-auto">
            {/* 1. Duyệt Nạp Xu */}
            <button
              type="button"
              onClick={() => handleMenuClick("requests")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "requests"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Coins
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "requests" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "requests" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    1. Duyệt Nạp Xu
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    Khớp lệnh MBBank
                  </div>
                </div>
              </div>
              {pendingTopUpCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-pink-600 text-white text-[10px] font-black shrink-0">
                  {pendingTopUpCount}
                </span>
              )}
            </button>

            {/* 2. Kiểm Duyệt Tác Giả */}
            <button
              type="button"
              onClick={() => handleMenuClick("submissions")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "submissions"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <BookOpen
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "submissions" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "submissions" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    2. Kiểm Duyệt Tác Giả
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    Bản thảo 5 chương &amp; STK
                  </div>
                </div>
              </div>
              {pendingSubmissionsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-pink-600 text-white text-[10px] font-black shrink-0">
                  {pendingSubmissionsCount}
                </span>
              )}
            </button>

            {/* 3. Đối Soát & Rút Lương */}
            <button
              type="button"
              onClick={() => handleMenuClick("payouts")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "payouts"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Building2
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "payouts" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "payouts" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    3. Đối Soát &amp; Rút Lương
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    Duyệt nhuận bút tác giả
                  </div>
                </div>
              </div>
              {pendingWithdrawalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shrink-0">
                  {pendingWithdrawalCount}
                </span>
              )}
            </button>

            {/* 4. Báo Cáo Vi Phạm */}
            <button
              type="button"
              onClick={() => handleMenuClick("reports")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "reports"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Flag
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "reports" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "reports" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    4. Báo Cáo Vi Phạm
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    Bản quyền, 18+, reup
                  </div>
                </div>
              </div>
              {pendingReportsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black shrink-0">
                  {pendingReportsCount}
                </span>
              )}
            </button>

            {/* 5. Quản Lý Truyện */}
            <button
              type="button"
              onClick={() => handleMenuClick("novels")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "novels"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "novels" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "novels" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    5. Quản Lý Truyện
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    Ẩn/hiện, sửa, xóa truyện
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-bold shrink-0">
                {totalNovelsCount} bộ
              </span>
            </button>

            {/* 6. Đăng Hàng Loạt */}
            <button
              type="button"
              onClick={() => handleMenuClick("batch")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "batch"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <BookPlus
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "batch" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "batch" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    6. Đăng Hàng Loạt
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    Batch Upload chương
                  </div>
                </div>
              </div>
            </button>

            {/* 7. Quản Lý Bình Luận */}
            <button
              type="button"
              onClick={() => handleMenuClick("comments")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "comments"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageSquare
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "comments" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "comments" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    7. Quản Lý Bình Luận
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    Bình luận thật &amp; gỡ vi phạm
                  </div>
                </div>
              </div>
              {commentsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-bold shrink-0">
                  {commentsCount}
                </span>
              )}
            </button>

            {/* 8. Cấu Hình & Kiến Trúc */}
            <button
              type="button"
              onClick={() => handleMenuClick("tools")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "tools"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileCode2
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "tools" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "tools" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    8. Cấu Hình &amp; Kiến Trúc
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    % Nhuận bút &amp; DRM
                  </div>
                </div>
              </div>
            </button>

            {/* 9. Quản Lý Người Dùng */}
            <button
              type="button"
              onClick={() => handleMenuClick("users")}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "users"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800"
                  : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Users
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "users" ? "text-pink-600 dark:text-pink-400" : "text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "users" ? "text-pink-700 dark:text-pink-300" : "text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900"
                    }`}
                  >
                    9. Quản Lý Người Dùng
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">
                    Khóa vi phạm &amp; phân quyền
                  </div>
                </div>
              </div>
              {bannedUsersCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-bold shrink-0">
                  {bannedUsersCount} bị khóa
                </span>
              )}
            </button>

            {/* 10. Giám Sát Tin Nhắn */}
            <Link
              href="/admin/messages"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "messages"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs"
                  : "text-slate-600 hover:text-pink-600 hover:bg-pink-50/40"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Eye className={`w-4 h-4 shrink-0 ${activeTab === "messages" ? "text-pink-600" : "text-slate-400"}`} />
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate text-slate-800">
                    10. Giám Sát Tin Nhắn
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">
                    Stealth Admin Monitoring
                  </div>
                </div>
              </div>
            </Link>

            {/* 11. Live Chat Hỗ Trợ */}
            <Link
              href="/admin/support-chat"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "support_chat"
                  ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs"
                  : "text-slate-600 hover:text-pink-600 hover:bg-pink-50/40"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageSquare className={`w-4 h-4 shrink-0 ${activeTab === "support_chat" ? "text-pink-600" : "text-slate-400"}`} />
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate text-slate-800">
                    11. Live Chat Hỗ Trợ
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">
                    support_chats Realtime
                  </div>
                </div>
              </div>
            </Link>

            {/* 12. Thông Báo Toàn Trang */}
            <Link
              href="/admin/global-banner"
              onClick={() => {
                handleMenuClick("global_banner");
              }}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === "global_banner"
                  ? "bg-yellow-50 text-amber-950 ring-1 ring-amber-300 shadow-xs"
                  : "text-slate-600 hover:text-amber-900 hover:bg-yellow-50/70"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Megaphone
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === "global_banner" ? "text-amber-700" : "text-slate-400 group-hover:text-amber-600"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      activeTab === "global_banner" ? "text-amber-950" : "text-slate-800"
                    }`}
                  >
                    12. Thông Báo Toàn Trang
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">
                    Banner vàng trên Trang Chủ
                  </div>
                </div>
              </div>
            </Link>
          </nav>
        </aside>

        {/* 3. NỘI DUNG CHÍNH (Main Content): Có pt-16 tránh Header và cuộn độc lập overflow-y-auto */}
        <main className="flex-1 h-full bg-slate-50 pt-16 overflow-y-auto text-slate-800">
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
