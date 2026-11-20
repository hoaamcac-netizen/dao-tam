import React from 'react';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function NovelDetailLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <LoadingSpinner
        message="Đang tìm nạp bộ truyện..."
        subMessage="Đang tải mục lục chương và thông tin tác phẩm"
      />
    </div>
  );
}
