import React from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ShortStoriesLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <LoadingSpinner 
        message="Đang tải danh sách truyện ngắn &amp; đoản văn..." 
        subMessage="Đồng bộ dữ liệu thời gian thực từ Firestore" 
      />
    </div>
  );
}
