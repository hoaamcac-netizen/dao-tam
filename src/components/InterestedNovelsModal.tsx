import React, { useState } from 'react';
import { Novel, UserProfile } from '../types';
import { X, Heart, Eye, BookOpen, ExternalLink, Search } from 'lucide-react';

interface InterestedNovelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onToggleInterest?: (novelId: string) => void;
}

export const InterestedNovelsModal: React.FC<InterestedNovelsModalProps> = ({
  isOpen,
  onClose,
  user,
  novels,
  onSelectNovel,
  onToggleInterest,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Real data: Lấy các truyện user đã đánh dấu quan tâm hoặc đề cử
  const interestedIds = Array.isArray(user?.interestedNovels) ? user.interestedNovels : [];
  const interestedNovels = (novels || []).filter((n) => interestedIds.includes(n.id));

  const filteredNovels = (interestedNovels || []).filter((n) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (n.title || '').toLowerCase().includes(term) ||
      (n.author || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-500">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white uppercase tracking-wider">
                TRUYỆN ĐƯỢC QUAN TÂM
              </h3>
              <p className="text-[11px] text-slate-500">
                {interestedNovels?.length || 0} bộ truyện trong danh sách quan tâm
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

        {/* Search */}
        {(interestedNovels?.length || 0) > 0 && (
          <div className="p-3 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm trong truyện quan tâm..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* List Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {(interestedNovels?.length || 0) === 0 ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center">
              <Heart className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-2" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                Chưa có truyện nào trong danh sách quan tâm
              </h4>
              <p className="text-xs text-slate-500 max-w-sm">
                Khi bạn bấm nút quan tâm hoặc yêu thích tác phẩm nào, tác phẩm đó sẽ tự động xuất hiện tại đây.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {(filteredNovels || []).map((novel) => (
                <div
                  key={novel.id}
                  onClick={() => {
                    onClose();
                    onSelectNovel(novel);
                  }}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 hover:shadow-md transition cursor-pointer flex flex-col group"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 mb-2.5">
                    <img
                      src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'}
                      alt={novel.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                    />
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                      Quan tâm
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-500">
                    {novel.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    Tác giả: {novel.author}
                  </p>
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{novel?.chapters?.length || novel?.totalChapters || 0} chương</span>
                    <span className="text-blue-500 font-semibold flex items-center gap-0.5">
                      Đọc ngay &gt;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
