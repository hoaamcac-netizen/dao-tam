import React from 'react';
import { Novel, UserProfile } from '../types';
import { 
  X, 
  BookOpen, 
  CheckCircle2, 
  Eye, 
  Coins, 
  BarChart2, 
  ExternalLink 
} from 'lucide-react';

interface AuthorStatsModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  onClose: () => void;
  user: UserProfile;
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
}

export const AuthorStatsModal: React.FC<AuthorStatsModalProps> = ({
  isOpen,
  isPageView = false,
  onClose,
  user,
  novels,
  onSelectNovel,
}) => {
  if (!isOpen) return null;

  // STRICT RULE: Only consider real novels created by this author
  const userNovels = (novels || []).filter((n) => {
    const cleanEmail = user?.email?.toLowerCase().trim();
    const cleanName = user?.displayName?.toLowerCase().trim();
    const isSubmittedByUser = (Boolean(user?.id) && user.id !== 'guest' && (n.submittedBy?.userId === user.id || (n as any)?.authorId === user.id)) ||
      (Boolean(cleanEmail) && (n.submittedBy?.userEmail?.toLowerCase().trim() === cleanEmail || (n as any)?.authorEmail?.toLowerCase().trim() === cleanEmail));
    const isAuthorName = Boolean(cleanName) && (
      n.author?.toLowerCase().trim() === cleanName ||
      n.submittedBy?.userName?.toLowerCase().trim() === cleanName
    );
    const isEditorName = Boolean(cleanName) && n.editor?.toLowerCase().trim() === cleanName;
    return isSubmittedByUser || isAuthorName || isEditorName;
  });

  const totalBooks = userNovels?.length || 0;
  const completedBooks = (userNovels || []).filter((n) => n.status === 'Hoàn thành')?.length || 0;
  const totalViews = (userNovels || []).reduce((sum, n) => sum + (n.dailyViews ? n.dailyViews * 30 : n.views || 0), 0);
  const totalDonatedCoins = user?.authorEarnedXu || 0;

  const top10Viewed = [...(userNovels || [])]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '2026-10-31 00:00:00';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '2026-10-31 00:00:00';
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
  };

  const innerContent = (
    <div className={`w-full ${isPageView ? 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800' : 'max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800'} flex flex-col overflow-hidden`}>
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 flex items-center justify-center text-teal-600 dark:text-teal-400">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                Thống Kê Sáng Tác & Lượt Đọc
              </h3>
              <p className="text-[11px] text-slate-500">
                Dữ liệu thực tế của tác giả {user.displayName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
          
          {/* 4 The Exact Stat Cards Matching Figure 9 (image_0ea896c9.png) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Tổng số truyện (cyan accent border) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/80 border-l-4 border-l-cyan-400 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
                  Tổng số truyện
                </p>
                <h4 className="text-2xl font-bold text-cyan-500">
                  {totalBooks}
                </h4>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm">
                <BookOpen className="w-6 h-6" />
              </div>
            </div>

            {/* Card 2: Tổng số truyện đã hoàn thành (orange accent border) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/80 border-l-4 border-l-amber-400 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
                  Tổng số truyện đã hoàn thành
                </p>
                <h4 className="text-2xl font-bold text-amber-500">
                  {completedBooks}
                </h4>
              </div>
              <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            {/* Card 3: Tổng lượt xem trong tháng (pink accent border) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/80 border-l-4 border-l-rose-500 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
                  Tổng lượt xem trong tháng
                </p>
                <h4 className="text-2xl font-bold text-rose-500">
                  {totalViews.toLocaleString('vi-VN')}
                </h4>
              </div>
              <div className="w-12 h-12 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-sm">
                <Eye className="w-6 h-6" />
              </div>
            </div>

            {/* Card 4: Tổng coin được donate (green accent border) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/80 border-l-4 border-l-emerald-500 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
                  Tổng coin được donate
                </p>
                <h4 className="text-2xl font-bold text-emerald-500">
                  {totalDonatedCoins.toLocaleString('vi-VN')}
                </h4>
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm">
                <Coins className="w-6 h-6" />
              </div>
            </div>

          </div>

          {/* Top 10 truyện được xem nhiều nhất - Table matching Figure 9 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60">
              <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                Top 10 truyện được xem nhiều nhất
              </h4>
            </div>

            {totalBooks === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <BookOpen className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Chưa có số liệu thống kê thực tế
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Khi bạn đăng truyện và có lượt đọc thực tế, bảng xếp hạng sẽ hiển thị tại đây.
                </p>
              </div>
            ) : (top10Viewed?.length || 0) === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Chưa có dữ liệu lượt xem cho các tác phẩm của bạn.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80">
                      <th className="py-3 px-4">Truyện</th>
                      <th className="py-3 px-4 text-center">Hình ảnh</th>
                      <th className="py-3 px-4 text-center">Lượt xem</th>
                      <th className="py-3 px-4 text-center">Số chương</th>
                      <th className="py-3 px-4 text-center">Ngày cập nhật</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(top10Viewed || []).map((novel) => (
                      <tr 
                        key={novel.id} 
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition cursor-pointer"
                        onClick={() => {
                          onClose();
                          onSelectNovel(novel);
                        }}
                      >
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white max-w-[240px]">
                          <span className="line-clamp-1 hover:text-blue-500 transition-colors">
                            {novel.title}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <img
                            src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=150&q=80'}
                            alt={novel.title}
                            className="w-10 h-14 object-cover rounded shadow-xs mx-auto border border-slate-200 dark:border-slate-700"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=150&q=80';
                            }}
                          />
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-800 dark:text-slate-200">
                          {(novel.views || 0).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-300">
                          {novel?.chapters?.length || novel?.totalChapters || 1}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 text-xs font-mono">
                          {formatDate(novel.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>
  );

  if (isPageView) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200">
        <div className="mb-4">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-pink-600 hover:text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-900 px-3.5 py-1.5 rounded-xl cursor-pointer transition shadow-xs"
          >
            <span>&larr; Quay lại trang trước</span>
          </button>
        </div>
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200">
      {innerContent}
    </div>
  );
};
