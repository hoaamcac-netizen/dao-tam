'use client';

import React from 'react';
import AdminLayout from '../AdminLayout';
import CommentManager from '../CommentManager';
import { useRouter } from 'next/navigation';

export default function AdminCommentsPage() {
  const router = useRouter();

  const handleSelectTab = (tab: string) => {
    if (tab === 'requests') router.push('/admin/requests');
    else if (tab === 'users') router.push('/admin/users');
    else if (tab === 'messages') router.push('/admin/messages');
    else if (tab === 'support_chat') router.push('/admin/support-chat');
    else if (tab === 'comments') router.push('/admin/comments');
    else if (tab === 'global_banner') router.push('/admin/global-banner');
    else router.push('/admin');
  };

  return (
    <AdminLayout activeTab="comments" onSelectTab={handleSelectTab as any} adminName="BQT Đạo Tâm">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <CommentManager />
      </div>
    </AdminLayout>
  );
}
