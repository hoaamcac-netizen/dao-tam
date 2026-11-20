import React from 'react';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <LoadingSpinner 
        message="Đang tải thông tin hồ sơ..." 
        subMessage="Xác thực danh tính và danh sách tác phẩm" 
      />
    </div>
  );
}
