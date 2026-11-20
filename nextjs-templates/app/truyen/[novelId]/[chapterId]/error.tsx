'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { BookX, RotateCw, Home } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ChapterError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Lỗi tải chương đọc (Chapter Reader Error):', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-pink-200/80 dark:border-pink-900/50 text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-pink-50 dark:bg-pink-950/60 border border-pink-200 text-pink-600 flex items-center justify-center mx-auto shadow-sm">
          <BookX className="w-8 h-8 text-pink-600" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
            Không thể tải nội dung chương
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Hệ thống đã phát hiện sự cố khi nạp văn bản chương hoặc cấu hình âm thanh. Vui lòng bấm thử lại để tiếp tục đọc.
          </p>
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
    </div>
  );
}
