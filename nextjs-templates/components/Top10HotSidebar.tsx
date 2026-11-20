"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { BookOpen, Crown, Eye, Flame } from "lucide-react";
import { db } from "../lib/firebase";

export interface Top10NovelItem {
  id: string;
  slug?: string;
  title: string;
  author?: string;
  coverImage?: string;
  views?: number;
  dailyViews?: number;
  totalChapters?: number;
  latestChapterTitle?: string;
  latestChapterName?: string;
  latestChapter?: string;
  isHidden?: boolean;
  publishStatus?: string;
}

interface Top10HotSidebarProps {
  initialNovels?: Top10NovelItem[];
  onSelectNovel?: (novel: Top10NovelItem) => void;
}

function formatViewsCount(count?: number): string {
  const num = Number(count ?? 0);
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toLocaleString("vi-VN");
}

function resolveLatestChapterName(novel: Top10NovelItem): string {
  const raw =
    novel.latestChapterTitle ||
    novel.latestChapterName ||
    novel.latestChapter;
  if (raw && raw.trim()) {
    return raw.trim();
  }
  if (novel.totalChapters && novel.totalChapters > 0) {
    return `Chương ${novel.totalChapters}`;
  }
  return "Chương 1";
}

export default function Top10HotSidebar({
  initialNovels = [],
  onSelectNovel,
}: Top10HotSidebarProps) {
  const [queriedNovels, setQueriedNovels] = useState<Top10NovelItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function fetchTop10DailyHot() {
      try {
        const novelsRef = collection(db, "novels");
        const top10Query = query(
          novelsRef,
          orderBy("dailyViews", "desc"),
          limit(10)
        );
        const snap = await getDocs(top10Query);
        if (!isMounted) return;

        const items: Top10NovelItem[] = (snap?.docs || [])
          .map((docSnap) => {
            const data = docSnap.data() || {};
            return {
              id: docSnap.id,
              slug: data.slug ? String(data.slug) : undefined,
              title: String(data.title || "Tác phẩm chưa đặt tên"),
              author: data.author ? String(data.author) : undefined,
              coverImage: data.coverImage ? String(data.coverImage) : undefined,
              views: Number(data.views ?? 0),
              dailyViews: Number(data.dailyViews ?? 0),
              totalChapters: Number(data.totalChapters ?? 0),
              latestChapterTitle: data.latestChapterTitle
                ? String(data.latestChapterTitle)
                : undefined,
              latestChapterName: data.latestChapterName
                ? String(data.latestChapterName)
                : undefined,
              latestChapter: data.latestChapter
                ? String(data.latestChapter)
                : undefined,
              isHidden: Boolean(data.isHidden),
              publishStatus: data.publishStatus
                ? String(data.publishStatus)
                : undefined,
            };
          })
          .filter((n) => !n.isHidden && n.publishStatus !== "hidden");

        setQueriedNovels(items);
      } catch (err) {
        console.warn("[Top10HotSidebar] Lỗi truy vấn dailyViews Firestore:", err);
      }
    }

    fetchTop10DailyHot();
    return () => {
      isMounted = false;
    };
  }, []);

  const top10 = useMemo(() => {
    const safeQueried = Array.isArray(queriedNovels) ? queriedNovels : [];
    const safeInitial = Array.isArray(initialNovels) ? initialNovels : [];
    const source = (safeQueried?.length || 0) > 0 ? safeQueried : safeInitial;
    return [...(source || [])]
      .filter((n) => !n.isHidden && n.publishStatus !== "hidden")
      .sort((a, b) => {
        const dailyDiff = Number(b.dailyViews ?? 0) - Number(a.dailyViews ?? 0);
        if (dailyDiff !== 0) return dailyDiff;
        return Number(b.views ?? 0) - Number(a.views ?? 0);
      })
      .slice(0, 10);
  }, [queriedNovels, initialNovels]);

  return (
    <aside className="w-full lg:w-80 shrink-0 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-pink-100/80 dark:border-pink-950/70 shadow-sm h-fit lg:sticky lg:top-24 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-pink-100 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-pink-600 flex items-center justify-center text-white shadow-md shadow-pink-600/20 shrink-0">
            <Flame className="w-4 h-4 fill-white" />
          </div>
          <h3 className="text-sm font-black text-pink-700 dark:text-pink-300 tracking-wide uppercase truncate">
            Top 10 Hot Trong Ngày
          </h3>
        </div>
        <span className="text-[10px] text-pink-700 dark:text-pink-200 bg-pink-100 dark:bg-pink-950 px-2 py-0.5 rounded-full font-bold shrink-0">
          Đọc nhiều nhất
        </span>
      </div>

      {/* Danh sách Top 10 theo lượt xem trong ngày */}
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
            const latestChapterLabel = resolveLatestChapterName(novel);
            const dailyViewsCount = Number(novel.dailyViews ?? 0);
            const href = `/truyen/${encodeURIComponent(novel.slug || novel.id)}`;

            const innerContent = (
              <>
                {/* Thứ hạng */}
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    isTop1
                      ? "bg-gradient-to-br from-amber-400 to-yellow-400 text-slate-950 shadow-xs"
                      : isTop2
                      ? "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900"
                      : isTop3
                      ? "bg-gradient-to-br from-sky-400 to-blue-500 text-white"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {isTop1 ? (
                    <Crown className="w-3.5 h-3.5 fill-slate-950" />
                  ) : (
                    rank
                  )}
                </div>

                {/* Ảnh bìa thu nhỏ */}
                <img
                  src={
                    novel.coverImage ||
                    "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80"
                  }
                  alt={novel.title}
                  className="w-10 h-13 rounded-md object-cover shrink-0 shadow-xs group-hover:scale-105 transition-transform"
                  loading="lazy"
                />

                {/* Tên truyện + Chương mới nhất + Lượt xem trong ngày */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors line-clamp-1">
                    {novel.title}
                  </h4>
                  <div className="flex items-center justify-between gap-2 mt-1 text-[10px]">
                    <span
                      className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium truncate min-w-0"
                      title={latestChapterLabel}
                    >
                      <BookOpen className="w-2.5 h-2.5 text-pink-500 shrink-0" />
                      <span className="truncate">{latestChapterLabel}</span>
                    </span>
                    <span
                      className="flex items-center gap-0.5 text-rose-600 dark:text-pink-400 font-bold shrink-0 whitespace-nowrap"
                      title={`${dailyViewsCount.toLocaleString("vi-VN")} lượt xem hôm nay`}
                    >
                      <Eye className="w-2.5 h-2.5 shrink-0" />
                      <span>{formatViewsCount(dailyViewsCount)}</span>
                    </span>
                  </div>
                </div>
              </>
            );

            if (onSelectNovel) {
              return (
                <button
                  key={novel.id}
                  type="button"
                  onClick={() => onSelectNovel(novel)}
                  className="w-full text-left group p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-pink-50/70 dark:hover:bg-slate-800 transition-all flex items-center gap-3 cursor-pointer"
                >
                  {innerContent}
                </button>
              );
            }

            return (
              <Link
                key={novel.id}
                href={href}
                className="group p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-pink-50/70 dark:hover:bg-slate-800 transition-all flex items-center gap-3"
              >
                {innerContent}
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}
