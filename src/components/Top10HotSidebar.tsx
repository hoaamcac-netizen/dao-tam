import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { BookOpen, Crown, Eye, Flame } from 'lucide-react';
import { db } from '../firebase/config';
import { Novel } from '../types';
import { getNovelChapterStats } from '../utils/rulesAndVoices';

interface Top10HotSidebarProps {
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onSelectCreator?: (creatorName: string) => void;
}

function formatDailyViews(count?: number): string {
  const num = Number(count ?? 0);
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toLocaleString('vi-VN');
}

export const Top10HotSidebar: React.FC<Top10HotSidebarProps> = ({
  novels,
  onSelectNovel,
}) => {
  const [dailyTopFromDb, setDailyTopFromDb] = useState<Novel[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function fetchTop10DailyHot() {
      try {
        const novelsRef = collection(db, 'novels');
        const q = query(
          novelsRef,
          orderBy('dailyViews', 'desc'),
          limit(10)
        );
        const snap = await getDocs(q);
        if (!isMounted) return;

        const items: Novel[] = (snap?.docs || [])
          .map((docSnap) => {
            const data = (docSnap.data() || {}) as Record<string, any>;
            const safeNovels = Array.isArray(novels) ? novels : [];
            const existingMatch = safeNovels.find((n) => n.id === docSnap.id);
            return {
              ...(existingMatch || {}),
              id: docSnap.id,
              title: String(data.title || existingMatch?.title || 'Tác phẩm'),
              slug: String(data.slug || existingMatch?.slug || docSnap.id),
              author: String(data.author || existingMatch?.author || ''),
              coverImage: String(
                data.coverImage ||
                  existingMatch?.coverImage ||
                  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'
              ),
              mainCategory: (data.mainCategory || existingMatch?.mainCategory || 'dam-my') as Novel['mainCategory'],
              status: (data.status || existingMatch?.status || 'Đang ra') as Novel['status'],
              categories: Array.isArray(data.categories)
                ? data.categories
                : (Array.isArray(existingMatch?.categories) ? existingMatch.categories : []),
              genres: Array.isArray(data.genres)
                ? data.genres
                : (Array.isArray(data.categories) ? data.categories : (Array.isArray(existingMatch?.genres) ? existingMatch.genres : [])),
              description: String(data.description || existingMatch?.description || ''),
              totalChapters: Number(data.totalChapters ?? existingMatch?.totalChapters ?? 0),
              chapters: Array.isArray(existingMatch?.chapters) ? existingMatch.chapters : [],
              views: Number(data.views ?? existingMatch?.views ?? 0),
              dailyViews: Number(data.dailyViews ?? existingMatch?.dailyViews ?? 0),
              flowerCount: Number(data.flowerCount ?? existingMatch?.flowerCount ?? 0),
              coinCount: Number(data.coinCount ?? existingMatch?.coinCount ?? 0),
              rating: Number(data.rating ?? existingMatch?.rating ?? 5),
              latestChapterTitle:
                data.latestChapterTitle ||
                data.latestChapterName ||
                data.latestChapter ||
                existingMatch?.latestChapterTitle,
              latestChapterNumber:
                typeof data.latestChapterNumber === 'number'
                  ? data.latestChapterNumber
                  : existingMatch?.latestChapterNumber,
              updatedAt:
                typeof data.updatedAt === 'number'
                  ? data.updatedAt
                  : existingMatch?.updatedAt ?? Date.now(),
              lastUpdated: String(data.lastUpdated || existingMatch?.lastUpdated || ''),
              hasAudio: Boolean(data.hasAudio ?? existingMatch?.hasAudio ?? true),
              fullBookPriceXu: Number(
                data.fullBookPriceXu ?? existingMatch?.fullBookPriceXu ?? 0
              ),
              isHidden: Boolean(data.isHidden ?? existingMatch?.isHidden),
              publishStatus: data.publishStatus || existingMatch?.publishStatus,
            };
          })
          .filter((n) => !n.isHidden && n.publishStatus !== 'hidden');

        if ((items?.length || 0) > 0) {
          setDailyTopFromDb(items);
        }
      } catch (err) {
        console.warn('[Top10HotSidebar] Lỗi truy vấn dailyViews Firestore:', err);
      }
    }

    fetchTop10DailyHot();
    return () => {
      isMounted = false;
    };
  }, [novels?.length]);

  // Hợp nhất dữ liệu Firestore (orderBy dailyViews desc limit 10) với state local để luôn phản ánh view realtime
  const top10 = useMemo(() => {
    const mergedMap = new Map<string, Novel>();

    for (const n of (dailyTopFromDb || [])) {
      mergedMap.set(n.id, n);
    }
    for (const n of (novels || [])) {
      if (n.isHidden || n.publishStatus === 'hidden') continue;
      const existing = mergedMap.get(n.id);
      if (existing) {
        mergedMap.set(n.id, {
          ...existing,
          ...n,
          dailyViews: Math.max(Number(existing.dailyViews ?? 0), Number(n.dailyViews ?? 0)),
        });
      } else {
        mergedMap.set(n.id, n);
      }
    }

    return Array.from(mergedMap.values())
      .filter((n) => !n.isHidden && n.publishStatus !== 'hidden')
      .sort((a, b) => {
        const dailyDiff = Number(b.dailyViews ?? 0) - Number(a.dailyViews ?? 0);
        if (dailyDiff !== 0) return dailyDiff;
        return Number(b.views ?? 0) - Number(a.views ?? 0);
      })
      .slice(0, 10);
  }, [dailyTopFromDb, novels]);

  return (
    <aside className="w-full lg:w-80 flex-shrink-0 bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-lg dark:shadow-black/40 h-fit sticky top-24 transition-colors">
      {/* Title */}
      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
            <Flame className="w-4 h-4 fill-white" />
          </div>
          <h3 className="text-sm font-black text-[#91C9FF] title-ice-blue tracking-wide uppercase">
            Top 10 Hot Trong Ngày
          </h3>
        </div>
        <span className="badge-most-read text-[10px] text-black dark:text-black bg-pink-100 dark:bg-pink-100 px-2 py-0.5 rounded-full font-bold">
          Đọc nhiều nhất
        </span>
      </div>

      {/* List */}
      {(top10?.length || 0) === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          Chưa có truyện nào trong bảng xếp hạng hôm nay.
        </div>
      ) : (
        <div className="space-y-2">
          {(top10 || []).map((novel, index) => {
            const rank = index + 1;
            const isTop1 = rank === 1;
            const isTop2 = rank === 2;
            const isTop3 = rank === 3;
            const { latestChapterTitle } = getNovelChapterStats(novel);
            const resolvedChapterName =
              (novel as any).latestChapterName ||
              (novel as any).latestChapter ||
              latestChapterTitle ||
              (novel.totalChapters ? `Chương ${novel.totalChapters}` : 'Chương 1');
            const dailyViewsCount = Number(novel.dailyViews ?? 0);

            return (
              <div
                key={novel.id}
                onClick={() => onSelectNovel(novel)}
                className="group p-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all flex items-center gap-3 cursor-pointer"
              >
                {/* Rank Badge */}
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                    isTop1
                      ? 'bg-gradient-to-br from-amber-400 to-yellow-400 text-slate-950 shadow-xs'
                      : isTop2
                      ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900'
                      : isTop3
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isTop1 ? <Crown className="w-3.5 h-3.5 fill-slate-950" /> : rank}
                </div>

                {/* Cover thumbnail */}
                <img
                  src={
                    novel.coverImage ||
                    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'
                  }
                  alt={novel.title}
                  className="w-10 h-13 rounded-md object-cover flex-shrink-0 shadow-xs group-hover:scale-105 transition-transform"
                  loading="lazy"
                />

                {/* Title, Latest Chapter & Daily Views */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-pink-400 transition-colors line-clamp-1">
                    {novel.title}
                  </h4>
                  <div className="flex items-center justify-between gap-2 mt-1 text-[10px]">
                    <span
                      className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium truncate min-w-0"
                      title={resolvedChapterName}
                    >
                      <BookOpen className="w-2.5 h-2.5 text-pink-500 shrink-0" />
                      <span className="truncate">{resolvedChapterName}</span>
                    </span>
                    <span
                      className="flex items-center gap-0.5 text-rose-600 dark:text-pink-400 font-bold shrink-0 whitespace-nowrap"
                      title={`${dailyViewsCount.toLocaleString('vi-VN')} lượt xem hôm nay`}
                    >
                      <Eye className="w-2.5 h-2.5 shrink-0" />
                      <span>{formatDailyViews(dailyViewsCount)}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
};
