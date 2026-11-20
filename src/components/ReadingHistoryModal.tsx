import React from 'react';
import { Novel, UserProfile } from '../types';
import { X, History, Trash2, BookOpen, Clock } from 'lucide-react';

interface ReadingHistoryModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  onClose: () => void;
  user: UserProfile;
  novels: Novel[];
  onResumeReading: (novelId: string, chapterId: string) => void;
  onClearHistory: () => void;
}

export const ReadingHistoryModal: React.FC<ReadingHistoryModalProps> = ({
  isOpen,
  isPageView = false,
  onClose,
  user,
  novels,
  onResumeReading,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  const history = Array.isArray(user?.readingHistory) ? user.readingHistory : [];

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Gần đây';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
  };

  const innerContent = (
    <div className={`w-full ${isPageView ? 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800' : 'max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800'} flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white uppercase tracking-wider">
              TRUYỆN ĐÃ ĐỌC
            </h3>
            <p className="text-[11px] text-slate-500">
              {history?.length || 0} truyện trong lịch sử đọc gần đây
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(history?.length || 0) > 0 && (
            <button
              onClick={onClearHistory}
              className="px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Xóa toàn bộ lịch sử đọc"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xóa lịch sử</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* List Body */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {(history?.length || 0) === 0 ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center">
            <History className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-2" />
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
              Lịch sử đọc truyện trống
            </h4>
            <p className="text-xs text-slate-500 max-w-sm">
              Khi bạn mở và đọc truyện, tiến trình từng chương và vị trí cuộn sẽ tự động được lưu và đồng bộ tại đây.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(history || []).map((item) => {
              const targetNovel = (novels || []).find((n) => n.id === item.novelId);
              const cover = item.novelCover || targetNovel?.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80';

              return (
                <div
                  key={`${item.novelId}-${item.chapterId}`}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:shadow-sm transition flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={cover}
                      alt={item.novelTitle}
                      className="w-12 h-16 object-cover rounded-lg shadow-xs flex-shrink-0 border border-slate-200 dark:border-slate-700"
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        {item.novelTitle}
                      </h4>
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                        {item.chapterTitle || `Chương ${item.chapterNumber}`}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(item.lastReadAt)}
                        </span>
                        <span>•</span>
                        <span>Tiến trình: {Math.round(item.scrollPercentage || 0)}%</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      onResumeReading(item.novelId, item.chapterId);
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition flex-shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Đọc tiếp</span>
                  </button>
                </div>
              );
            })}
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
