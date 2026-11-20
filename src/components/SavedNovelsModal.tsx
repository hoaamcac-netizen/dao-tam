import React from 'react';
import { Novel, UserProfile } from '../types';
import { X, Bookmark, BookOpen, Trash2, ExternalLink } from 'lucide-react';

interface SavedNovelsModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  onClose: () => void;
  user: UserProfile;
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onRemoveBookmark: (novelId: string) => void;
}

export const SavedNovelsModal: React.FC<SavedNovelsModalProps> = ({
  isOpen,
  isPageView = false,
  onClose,
  user,
  novels,
  onSelectNovel,
  onRemoveBookmark,
}) => {
  if (!isOpen) return null;

  const bookmarkIds = Array.isArray(user?.bookmarks) ? user.bookmarks : [];
  const savedNovels = (novels || []).filter((n) => bookmarkIds.includes(n.id));

  const innerContent = (
    <div className={`w-full ${isPageView ? 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800' : 'max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800'} flex flex-col overflow-hidden`}>
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Bookmark className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white uppercase tracking-wider">
                TRUYỆN ĐÃ LƯU
              </h3>
              <p className="text-[11px] text-slate-500">
                {savedNovels?.length || 0} bộ truyện trong tủ sách cá nhân
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

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {(savedNovels?.length || 0) === 0 ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center">
              <Bookmark className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-2" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                Tủ sách đang trống
              </h4>
              <p className="text-xs text-slate-500 max-w-sm">
                Bạn chưa lưu bộ truyện nào. Hãy bấm "Thêm vào tủ sách" ở trang chi tiết truyện để lưu lại những tác phẩm bạn yêu thích.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {(savedNovels || []).map((novel) => (
                <div
                  key={novel.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 flex flex-col justify-between hover:shadow-md transition group"
                >
                  <div className="flex gap-3">
                    <img
                      src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                      alt={novel.title}
                      className="w-16 h-24 object-cover rounded-lg shadow-xs flex-shrink-0 border border-slate-200 dark:border-slate-700"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 
                        onClick={() => {
                          onClose();
                          onSelectNovel(novel);
                        }}
                        className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-2 hover:text-blue-500 cursor-pointer"
                      >
                        {novel.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 truncate">
                        {novel.author}
                      </p>
                      <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {novel?.chapters?.length || novel?.totalChapters || 0} chương
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                    <button
                      onClick={() => onRemoveBookmark(novel.id)}
                      className="text-slate-400 hover:text-rose-500 text-xs flex items-center gap-1 transition cursor-pointer"
                      title="Bỏ lưu truyện này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Bỏ lưu</span>
                    </button>
                    <button
                      onClick={() => {
                        onClose();
                        onSelectNovel(novel);
                      }}
                      className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>Đọc ngay</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
