import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Novel, UserProfile } from '../types';
import { Trophy, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import StoryCard, { StoryCardNovel } from './StoryCard';

export type MainCategoryLabel = 'Đam Mỹ' | 'Truyện Nam' | 'Truyện Nữ';

const MAIN_CATEGORY_LABELS: MainCategoryLabel[] = ['Đam Mỹ', 'Truyện Nam', 'Truyện Nữ'];

export interface StoryCardData extends Novel {
  genres?: string[];
  isFull?: boolean;
  isCompleted?: boolean;
}

/**
 * Trích xuất ĐÚNG 1 trong 3 thể loại chính: 'Đam Mỹ' | 'Truyện Nam' | 'Truyện Nữ'.
 * Tuyệt đối không trả về 'Đang cập nhật', tên tác giả hay các tag phụ.
 */
export function extractMainCategory(story: StoryCardData): MainCategoryLabel {
  const combinedTags = [
    ...(Array.isArray(story.genres) ? story.genres : []),
    ...(Array.isArray(story.categories) ? story.categories : []),
  ];

  const exactMatch = combinedTags.find((g) => MAIN_CATEGORY_LABELS.includes(g as MainCategoryLabel));
  if (exactMatch) {
    return exactMatch as MainCategoryLabel;
  }

  for (const tag of combinedTags) {
    const normalized = String(tag || '').trim().toLowerCase();
    if (normalized === 'truyện nam' || normalized === 'truyen nam' || normalized === 'truyen-nam') {
      return 'Truyện Nam';
    }
    if (normalized === 'truyện nữ' || normalized === 'truyen nu' || normalized === 'truyen-nu') {
      return 'Truyện Nữ';
    }
    if (normalized === 'đam mỹ' || normalized === 'dam my' || normalized === 'dam-my') {
      return 'Đam Mỹ';
    }
  }

  const mc = String(story.mainCategory || '').trim().toLowerCase();
  if (mc === 'truyen-nam' || mc === 'truyện nam' || mc === 'truyen nam') return 'Truyện Nam';
  if (mc === 'truyen-nu' || mc === 'truyện nữ' || mc === 'truyen nu') return 'Truyện Nữ';

  return 'Đam Mỹ';
}

interface TopNominatedStoryCardProps {
  story: StoryCardData;
  globalRank: number;
  onSelect: (novel: Novel) => void;
}

export const TopNominatedStoryCard: React.FC<TopNominatedStoryCardProps> = ({
  story,
  globalRank,
  onSelect,
}) => {
  return (
    <StoryCard
      novel={story as StoryCardNovel}
      rank={globalRank}
      variant="featured"
      onSelect={onSelect}
    />
  );
};

interface TopNominatedSectionProps {
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onOpenNominate?: (novel: Novel) => void;
  onOpenDailyReward: () => void;
  user: UserProfile;
  onSelectCreator?: (creatorName: string) => void;
}

export const TopNominatedSection: React.FC<TopNominatedSectionProps> = ({
  novels,
  onSelectNovel,
}) => {
  // Sắp xếp theo số lượt đề cử/hoa giảm dần và lấy top 12
  const top12Novels = useMemo(() => {
    return [...(novels || [])]
      .filter((n) => !n.isHidden && n.publishStatus !== 'hidden')
      .sort((a, b) => (b.flowerCount || 0) - (a.flowerCount || 0))
      .slice(0, 12);
  }, [novels]);

  const [mobileSlide, setMobileSlide] = useState<number>(0);
  const [desktopSlide, setDesktopSlide] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const touchStartX = useRef<number | null>(null);

  // Mobile: Chunks of 3 novels per slide
  const mobileSlides = useMemo(() => {
    if ((top12Novels?.length || 0) === 0) return [];
    const chunks: Novel[][] = [];
    for (let i = 0; i < (top12Novels?.length || 0); i += 3) {
      chunks.push(top12Novels.slice(i, i + 3));
    }
    return chunks;
  }, [top12Novels]);

  // Desktop: Chunks of 6 novels per slide
  const desktopSlides = useMemo(() => {
    if ((top12Novels?.length || 0) === 0) return [];
    const chunks: Novel[][] = [];
    for (let i = 0; i < (top12Novels?.length || 0); i += 6) {
      chunks.push(top12Novels.slice(i, i + 6));
    }
    return chunks;
  }, [top12Novels]);

  const totalMobileSlides = mobileSlides?.length || 1;
  const totalDesktopSlides = desktopSlides?.length || 1;

  // Auto-slide 4.5s
  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setMobileSlide((prev) => (prev + 1) % totalMobileSlides);
      setDesktopSlide((prev) => (prev + 1) % totalDesktopSlides);
    }, 4500);

    return () => clearInterval(timer);
  }, [totalMobileSlides, totalDesktopSlides, isPaused]);

  const goToPrevSlide = useCallback(() => {
    setMobileSlide((prev) => (prev - 1 + totalMobileSlides) % totalMobileSlides);
    setDesktopSlide((prev) => (prev - 1 + totalDesktopSlides) % totalDesktopSlides);
  }, [totalMobileSlides, totalDesktopSlides]);

  const goToNextSlide = useCallback(() => {
    setMobileSlide((prev) => (prev + 1) % totalMobileSlides);
    setDesktopSlide((prev) => (prev + 1) % totalDesktopSlides);
  }, [totalMobileSlides, totalDesktopSlides]);

  // Vuốt chạm trên Mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches?.[0]?.clientX;
    if (typeof touchEndX !== 'number') {
      touchStartX.current = null;
      return;
    }
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        goToNextSlide();
      } else {
        goToPrevSlide();
      }
    }
    touchStartX.current = null;
  };

  if ((top12Novels?.length || 0) === 0) return null;

  return (
    <section
      className="mb-8 sm:mb-12 relative w-full overflow-hidden bg-gradient-to-b from-pink-50/60 via-white to-pink-50/30 dark:from-slate-900/90 dark:via-slate-900/60 dark:to-slate-950 p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-pink-100 dark:border-pink-950/60 shadow-sm"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Decorative background glow */}
      <div className="absolute -top-10 left-1/4 w-72 sm:w-96 max-w-full h-48 bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-pink-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Section Header */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 sm:mb-4 border-b border-pink-100 dark:border-slate-800">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-pink-600 via-rose-500 to-pink-400 p-0.5 shadow-md shrink-0">
            <div className="w-full h-full rounded-[10px] bg-white dark:bg-slate-900 flex items-center justify-center text-sm sm:text-base">
              🏆
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm sm:text-2xl font-black bg-gradient-to-r from-pink-600 via-rose-600 to-pink-500 bg-clip-text text-transparent tracking-tight truncate">
                Bảng Vàng Đề Cử • Top 12 Tác Phẩm Hay
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-pink-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 text-[11px] font-semibold">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Vinh danh tuần
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Mobile: 3 truyện/slide • Desktop: 6 truyện/slide • Tự động trượt 4.5s
            </p>
          </div>
        </div>

        {/* Nút điều hướng Carousel & Chỉ số slide */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <span className="block lg:hidden text-[10px] sm:text-xs font-bold text-pink-600 dark:text-pink-400 mr-0.5 sm:mr-1">
            {mobileSlide + 1}/{totalMobileSlides}
          </span>
          <span className="hidden lg:block text-xs font-bold text-pink-600 dark:text-pink-400 mr-1">
            {desktopSlide + 1}/{totalDesktopSlides}
          </span>

          <button
            type="button"
            onClick={goToPrevSlide}
            aria-label="Slide trước"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white dark:bg-slate-800 border border-pink-200 dark:border-pink-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-pink-50 hover:text-pink-600 dark:hover:bg-pink-950/50 transition-colors shadow-xs cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToNextSlide}
            aria-label="Slide tiếp theo"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white dark:bg-slate-800 border border-pink-200 dark:border-pink-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-pink-50 hover:text-pink-600 dark:hover:bg-pink-950/50 transition-colors shadow-xs cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. SLIDER MOBILE (< lg: 3 truyện / slide) */}
      <div
        className="block lg:hidden overflow-hidden relative touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${mobileSlide * 100}%)` }}
        >
          {(mobileSlides || []).map((slideNovels, slideIndex) => (
            <div key={slideIndex} className="w-full shrink-0 grid grid-cols-3 gap-2">
              {(slideNovels || []).map((novel, indexInSlide) => (
                <TopNominatedStoryCard
                  key={novel.id}
                  story={novel}
                  globalRank={slideIndex * 3 + indexInSlide + 1}
                  onSelect={onSelectNovel}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 2. SLIDER DESKTOP (>= lg: 6 truyện / slide) */}
      <div className="hidden lg:block overflow-hidden relative">
        <div
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${desktopSlide * 100}%)` }}
        >
          {(desktopSlides || []).map((slideNovels, slideIndex) => (
            <div key={slideIndex} className="w-full shrink-0 grid grid-cols-6 gap-3.5">
              {(slideNovels || []).map((novel, indexInSlide) => (
                <TopNominatedStoryCard
                  key={novel.id}
                  story={novel}
                  globalRank={slideIndex * 6 + indexInSlide + 1}
                  onSelect={onSelectNovel}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Dots Indicator (Mobile) */}
      {totalMobileSlides > 1 && (
        <div className="flex lg:hidden items-center justify-center gap-1.5 mt-3 pt-1">
          {(mobileSlides || []).map((_, dotIdx) => (
            <button
              key={dotIdx}
              type="button"
              onClick={() => setMobileSlide(dotIdx)}
              aria-label={`Chuyển tới mobile slide ${dotIdx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                mobileSlide === dotIdx
                  ? 'w-6 bg-gradient-to-r from-pink-600 to-rose-500 shadow-xs'
                  : 'w-2 bg-pink-200 dark:bg-pink-950 hover:bg-pink-300'
              }`}
            />
          ))}
        </div>
      )}

      {/* Dots Indicator (Desktop) */}
      {totalDesktopSlides > 1 && (
        <div className="hidden lg:flex items-center justify-center gap-1.5 mt-3 pt-1">
          {(desktopSlides || []).map((_, dotIdx) => (
            <button
              key={dotIdx}
              type="button"
              onClick={() => setDesktopSlide(dotIdx)}
              aria-label={`Chuyển tới desktop slide ${dotIdx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                desktopSlide === dotIdx
                  ? 'w-6 bg-gradient-to-r from-pink-600 to-rose-500 shadow-xs'
                  : 'w-2 bg-pink-200 dark:bg-pink-950 hover:bg-pink-300'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
