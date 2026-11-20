import React, { useState } from 'react';
import { Novel, UserProfile } from '../types';
import { X, Bell, UserCheck, BookOpen, ExternalLink, Search, User } from 'lucide-react';

interface FollowingNovelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onSelectCreator?: (creatorName: string) => void;
  onUnfollowCreator?: (creatorName: string) => void;
}

export const FollowingNovelsModal: React.FC<FollowingNovelsModalProps> = ({
  isOpen,
  onClose,
  user,
  novels,
  onSelectNovel,
  onSelectCreator,
  onUnfollowCreator,
}) => {
  const [activeTab, setActiveTab] = useState<'novels' | 'creators'>('novels');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Real data: novels followed by user + creators followed by user
  const followedNovelIds = Array.isArray(user?.followingNovels) ? user.followingNovels : [];
  const followedNovels = (novels || []).filter((n) => followedNovelIds.includes(n.id));

  const followedCreators = Array.isArray(user?.followingCreators) ? user.followingCreators : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        
        {/* Header - Matching Figure 4 (image_c6743fc7.png) */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-cyan-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white uppercase tracking-wider">
                ĐANG THEO DÕI
              </h3>
              <p className="text-[11px] text-slate-500">
                {followedNovels?.length || 0} truyện • {followedCreators?.length || 0} tác giả/editor
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

        {/* Tab switchers */}
        <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('novels')}
            className={`pb-2.5 px-2 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'novels'
                ? 'border-blue-600 text-blue-600 dark:border-cyan-400 dark:text-cyan-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Truyện đang theo dõi ({followedNovels?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('creators')}
            className={`pb-2.5 px-2 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'creators'
                ? 'border-blue-600 text-blue-600 dark:border-cyan-400 dark:text-cyan-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Tác giả đang theo dõi ({followedCreators?.length || 0})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {activeTab === 'novels' ? (
            (followedNovels?.length || 0) === 0 ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center">
                <Bell className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-2" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Bạn chưa theo dõi truyện nào
                </h4>
                <p className="text-xs text-slate-500 max-w-sm">
                  Bấm "Theo dõi" ở trang chi tiết truyện để nhận thông báo ngay khi có chương mới.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(followedNovels || []).map((novel) => (
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
                        src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                        alt={novel.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                        Đang theo dõi
                      </span>
                    </div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-500">
                      {novel.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {novel.author}
                    </p>
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{novel?.chapters?.length || novel?.totalChapters || 0} chương</span>
                      <span className="text-blue-500 font-semibold">Đọc tiếp &gt;</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            (followedCreators?.length || 0) === 0 ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center">
                <UserCheck className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-2" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Bạn chưa theo dõi tác giả nào
                </h4>
                <p className="text-xs text-slate-500 max-w-sm">
                  Theo dõi các tác giả và editor yêu thích để xem tác phẩm mới nhất của họ.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {(followedCreators || []).map((creatorName) => (
                  <div
                    key={creatorName}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 flex items-center justify-between gap-3"
                  >
                    <div 
                      className="flex items-center gap-3 cursor-pointer min-w-0"
                      onClick={() => {
                        onClose();
                        if (onSelectCreator) onSelectCreator(creatorName);
                      }}
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 font-bold text-sm">
                        {creatorName?.[0]?.toUpperCase() || 'T'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate hover:text-blue-500">
                          {creatorName}
                        </h4>
                        <span className="text-[10px] text-slate-400">Tác giả / Editor</span>
                      </div>
                    </div>

                    {onUnfollowCreator && (
                      <button
                        onClick={() => onUnfollowCreator(creatorName)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                      >
                        Bỏ theo dõi
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

      </div>
    </div>
  );
};
