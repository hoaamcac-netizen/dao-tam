import React from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <LoadingSpinner 
        message="Đang truy cập Hệ Thống Quản Trị Đạo Tâm..." 
        subMessage="Xác thực quyền Quản trị viên (Super Admin)" 
      />
    </div>
  );
}
