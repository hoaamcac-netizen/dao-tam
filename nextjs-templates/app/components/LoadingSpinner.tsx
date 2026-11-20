'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  subMessage?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({
  message = 'Đang tải dữ liệu từ Đạo Tâm...',
  subMessage = 'Vui lòng chờ trong giây lát',
  fullScreen = true,
}: LoadingSpinnerProps) {
  const content = (
    <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
      {/* Animated glowing spinner */}
      <div className="relative flex items-center justify-center">
        <div className="w-14 h-14 rounded-full border-4 border-pink-200 dark:border-pink-900/40 border-t-pink-600 dark:border-t-pink-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-pink-600 dark:text-pink-400 animate-pulse" />
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {message}
        </h3>
        {subMessage && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-[70vh] w-full flex items-center justify-center bg-transparent">
        {content}
      </div>
    );
  }

  return content;
}
