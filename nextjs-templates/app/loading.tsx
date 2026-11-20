import React from 'react';
import LoadingSpinner from './components/LoadingSpinner';

export default function RootLoading() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-pink-50/60 via-white to-pink-50/40 dark:from-[#180a14] dark:via-slate-950 dark:to-[#180a14]">
      <LoadingSpinner 
        message="Đang khởi tạo Đạo Tâm Đọc Truyện..." 
        subMessage="Đồng bộ dữ liệu thời gian thực" 
      />
    </main>
  );
}
