import React from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

export default function PurchasedStoriesLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <LoadingSpinner 
        message="Đang mở Tủ truyện của bạn..." 
        subMessage="Tổng hợp quyền sở hữu trọn bộ và chương VIP" 
      />
    </div>
  );
}
