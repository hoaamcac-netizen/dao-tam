'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw, Home, ShieldAlert } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Lỗi giao diện toàn cục (Global Error Boundary):', error);
  }, [error]);

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-b from-pink-50/80 via-white to-pink-50/50 dark:from-[#180a14] dark:via-slate-950 dark:to-[#180a14] text-slate-900 dark:text-slate-100">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-pink-200/80 dark:border-pink-900/50 text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-pink-50 dark:bg-pink-950/60 border border-pink-200 text-pink-600 flex items-center justify-center mx-auto shadow-sm">
          <AlertTriangle className="w-8 h-8 text-pink-600" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
            Đã có lỗi tải giao diện
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Hệ thống đã tự động ngăn chặn sự cố màn hình trắng. Bạn có thể nhấn &quot;Thử lại&quot; để tải lại dữ liệu hoặc quay về Trang Chủ.
          </p>
          {error?.message && (
            <div className="mt-2 p-2.5 rounded-xl bg-pink-50/60 dark:bg-pink-950/30 text-[11px] font-mono text-pink-700 dark:text-pink-300 text-left truncate border border-pink-100 dark:border-pink-900/40">
              Chi tiết: {error.message}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-md shadow-pink-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
            <span>Thử lại</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Về Trang Chủ</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
