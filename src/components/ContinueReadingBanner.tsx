import React, { useState, useEffect } from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';

export interface LocalReadingHistoryItem {
  novelId: string;
  novelSlug?: string;
  novelTitle: string;
  chapterId?: string;
  chapterSlug?: string;
  chapterNumber?: number;
  chapterTitle?: string;
  url?: string;
  lastReadAt?: number;
  updatedAt?: number;
}

export const READING_HISTORY_STORAGE_KEY = 'daotam_reading_history';

function readLatestHistoryFromLocalStorage(): LocalReadingHistoryItem | null {
  if (typeof window === 'undefined') return null;
  try {
    const candidateKeys = [
      READING_HISTORY_STORAGE_KEY,
      'reading_history',
      'readingHistory',
      'dmc_reading_history',
    ];

    for (const key of candidateKeys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && (parsed?.length ?? 0) > 0 && parsed[0]?.novelTitle) {
        return parsed[0] as LocalReadingHistoryItem;
      }
    }

    return null;
  } catch {
    return null;
  }
  return null;
}

interface ContinueReadingBannerProps {
  onNavigateChapter?: (url: string, item: LocalReadingHistoryItem) => void;
}

export const ContinueReadingBanner: React.FC<ContinueReadingBannerProps> = ({
  onNavigateChapter,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [latestItem, setLatestItem] = useState<LocalReadingHistoryItem | null>(null);

  useEffect(() => {
    setIsMounted(true);
    setLatestItem(readLatestHistoryFromLocalStorage());

    const handleStorageChange = () => {
      setLatestItem(readLatestHistoryFromLocalStorage());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  if (!isMounted || !latestItem) {
    return null;
  }

  const novelIdentifier = encodeURIComponent(
    (latestItem.novelSlug && latestItem.novelSlug.trim()) || latestItem.novelId
  );
  const chapterIdentifier = encodeURIComponent(
    (latestItem.chapterSlug && latestItem.chapterSlug.trim()) ||
      (latestItem.chapterId && latestItem.chapterId.trim()) ||
      `chuong-${latestItem.chapterNumber || 1}`
  );

  const targetHref =
    latestItem.url && latestItem.url.startsWith('/')
      ? latestItem.url
      : `/truyen/${novelIdentifier}/chuong/${chapterIdentifier}`;

  const rawChapterTitle = latestItem.chapterTitle?.trim() || '';
  const chapterDisplayName = rawChapterTitle
    ? rawChapterTitle.replace(/^chương\s+/i, '')
    : `${latestItem.chapterNumber || 1}`;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigateChapter) {
      e.preventDefault();
      onNavigateChapter(targetHref, latestItem);
    }
  };

  return (
    <div className="w-full sm:px-6 lg:px-8 pt-2.5 sm:pt-3">
      <div className="w-full max-w-7xl mx-auto">
        <a
          href={targetHref}
          onClick={handleClick}
          className="w-full flex items-center justify-between gap-2.5 sm:gap-4 px-3 py-2.5 sm:px-4 sm:py-3 bg-blue-50 dark:bg-blue-900/30 border-y sm:border border-blue-200 dark:border-blue-800/70 sm:rounded-2xl text-blue-800 dark:text-blue-200 hover:bg-blue-100/80 dark:hover:bg-blue-900/45 transition-colors shadow-xs group cursor-pointer"
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600/15 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </span>
            <p className="min-w-0 flex-1 truncate text-xs sm:text-sm font-medium text-blue-800 dark:text-blue-200">
              Bạn đang đọc Truyện{' '}
              <span className="font-bold">{latestItem.novelTitle}</span> chương{' '}
              <span className="font-bold">{chapterDisplayName}</span>
            </p>
          </div>

          <span className="shrink-0 inline-flex items-center justify-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 min-h-[34px] rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold shadow-xs transition-colors">
            <span>Đọc tiếp</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </a>
      </div>
    </div>
  );
};

export default ContinueReadingBanner;
