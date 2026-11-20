import React from 'react';
import LoadingSpinner from '../../../../components/LoadingSpinner';

export default function ChapterLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <LoadingSpinner 
        message="Đang nạp nội dung chương đọc..." 
        subMessage="Chuẩn bị giao diện chống sao chép và giọng đọc Audio" 
      />
    </div>
  );
}
