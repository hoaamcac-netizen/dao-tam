import React from 'react';
import {
  BookOpen,
  Crown,
  Eye,
  EyeOff,
  Headphones,
  Trophy,
} from 'lucide-react';
import { Novel, ReadingProgress } from '../types';
import { getNovelChapterStats } from '../utils/rulesAndVoices';
import {
  extractStoryMainGenre,
  getGenreConfigByLabel,
  normalizeGenreLabel,
  type MainGenreLabel,
} from '../data/genreConfig';

export type { MainGenreLabel };
export { extractStoryMainGenre, normalizeGenreLabel };

export interface StoryCardNovel extends Novel {
  genres?: string[];
  isFull?: boolean;
  isCompleted?: boolean;
}

/**
 * Hàm dùng chung renderGenreBadge(genre) cho toàn bộ thẻ truyện:
 * Đọc trực tiếp Icon và màu sắc từ cấu hình chung GENRE_CONFIG (không hardcode).
 */
export function renderGenreBadge(
  genre?: string | null,
  extraSuffix?: string
): React.ReactElement {
  const resolved = normalizeGenreLabel(genre);
  const config = getGenreConfigByLabel(resolved);
  const IconComponent = config.icon;
  const displayLabel = extraSuffix ? `${resolved} ${extraSuffix}` : resolved;

  return (
    <span
      className={`genre-badge flex items-center gap-1 text-[10px] md:text-xs font-semibold ${config.badgeColorClass} min-w-0 leading-none`}
      title={displayLabel}
    >
      <IconComponent
        className={`w-3 h-3 md:w-3.5 md:h-3.5 shrink-0 ${
          config.iconFilled ? 'fill-current' : ''
        }`}
      />
      <span className="truncate min-w-0">{displayLabel}</span>
    </span>
  );
}

export interface StoryCardProps {
  novel: StoryCardNovel;
  rank?: number;
  variant?: 'featured' | 'catalog';
  progress?: ReadingProgress;
  onSelect?: (novel: Novel) => void;
}

export const StoryCard: React.FC<StoryCardProps> = ({
  novel,
  rank,
  variant = 'catalog',
  progress,
  onSelect,
}) => {
  if (!novel) return null;

  const formatCount = (num?: number) => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString('en-US');
  };

  const { latestChapterTitle, isCompleted } = getNovelChapterStats(novel);
  const normalizedStatus = String(novel?.status || '').trim().toLowerCase();
  const isFull = Boolean(
    isCompleted ||
      novel?.isCompleted ||
      novel?.isFull ||
      normalizedStatus === 'completed' ||
      normalizedStatus === 'full' ||
      normalizedStatus === 'hoàn thành'
  );

  const discountPercent =
    isFull &&
    novel.fullBookPriceXu &&
    novel.fullBookDiscountPriceXu &&
    novel.fullBookDiscountPriceXu > 0 &&
    novel.fullBookDiscountPriceXu < novel.fullBookPriceXu
      ? Math.round(
          ((novel.fullBookPriceXu - novel.fullBookDiscountPriceXu) / novel.fullBookPriceXu) * 100
        )
      : 0;

  const mainGenre = extractStoryMainGenre(novel);
  const shortSuffix = variant === 'catalog' && novel.isShortStory ? '• Ngắn' : undefined;

  const isTop1 = rank === 1;
  const isTop2 = rank === 2;
  const isTop3 = rank === 3;

  return (
    <div
      onClick={() => onSelect?.(novel)}
      className="group relative bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-[0_2px_12px_-2px_rgba(236,72,153,0.06)] dark:shadow-lg dark:shadow-black/40 hover:shadow-xl hover:shadow-pink-600/15 dark:hover:shadow-black/60 transition-all duration-300 flex flex-col cursor-pointer lg:hover:-translate-y-1 border border-pink-100/80 dark:border-pink-950/60"
    >
      {/* Ảnh bìa */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
        <img
          src={
            novel.coverImage ||
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'
          }
          alt={novel.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          decoding="async"
        />

        {/* Audio Badge: Góc trên bên trái */}
        <div className="absolute top-2 left-2 z-10 pointer-events-none">
          <span className="flex items-center gap-0.5 sm:gap-1 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full shadow-md shadow-black/20 text-slate-900 text-[8px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 border border-white/60">
            <Headphones className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-900 shrink-0" />
            Audio
          </span>
        </div>

        {/* Huy hiệu thứ hạng (nếu là Bảng Vàng Đề Cử) hoặc tiến trình đọc / trạng thái ẩn */}
        {(typeof rank === 'number' || progress || novel.isHidden || novel.isOriginal) && (
          <div className="absolute top-8 left-2 z-10 flex flex-col items-start gap-1 max-w-[60%] pointer-events-none">
            {typeof rank === 'number' &&
              (isTop1 ? (
                <span className="px-1 sm:px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 font-black text-[8px] sm:text-[11px] shadow-md flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-slate-950" />
                  #1
                </span>
              ) : isTop2 ? (
                <span className="px-1 sm:px-1.5 py-0.5 rounded-md bg-gradient-to-r from-slate-200 to-slate-400 text-slate-950 font-black text-[8px] sm:text-[11px] shadow-md flex items-center gap-0.5">
                  <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-900" />
                  #2
                </span>
              ) : isTop3 ? (
                <span className="px-1 sm:px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-600 to-rose-600 text-white font-black text-[8px] sm:text-[11px] shadow-md flex items-center gap-0.5">
                  <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-200" />
                  #3
                </span>
              ) : (
                <span className="px-1 sm:px-1.5 py-0.5 rounded-md bg-black/60 text-pink-200 font-bold text-[8px] sm:text-[10px] backdrop-blur-xs flex items-center">
                  #{rank}
                </span>
              ))}

            {progress && (
              <span
                className="badge-reading-progress inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold shadow-xs whitespace-nowrap max-w-full overflow-hidden bg-sky-500/90 text-white backdrop-blur-xs"
                title={`Đang đọc Chương ${progress.chapterNumber} (${progress.scrollPercentage}%)`}
              >
                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white shrink-0 animate-pulse" />
                <span className="truncate">C{progress.chapterNumber}</span>
              </span>
            )}

            {novel.isHidden && (
              <span className="bg-black/75 backdrop-blur-xs text-purple-300 text-[7.5px] sm:text-[9px] font-medium px-1 sm:px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5">
                <EyeOff className="w-2 h-2 sm:w-2.5 sm:h-2.5 shrink-0" /> Ẩn
              </span>
            )}
          </div>
        )}

        {/* 1. Nhãn Trạng Thái Truyện (Góc trên bên phải - luôn hiển thị trên cả PC và Mobile) */}
        <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1 pointer-events-none">
          {isFull ? (
            <span className="flex items-center justify-center px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider shadow-md badge-completed">
              FULL
            </span>
          ) : (
            <span className="flex items-center justify-center px-1.5 py-0.5 rounded bg-orange-500 text-white text-[9px] md:text-[10px] font-bold shadow-md badge-ongoing">
              Đang ra
            </span>
          )}
          {discountPercent > 0 && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gradient-to-r from-rose-600 via-pink-600 to-amber-500 text-white text-[8px] md:text-[9px] font-black shadow-md">
              <span>🔥</span> -{discountPercent}%
            </span>
          )}
        </div>

        {/* Dải chương mới nhất dưới đáy ảnh bìa */}
        <div className="absolute inset-x-0 bottom-0 pt-3 pb-1 px-1.5 bg-gradient-to-t from-black/90 via-black/65 to-transparent flex items-center justify-between gap-1">
          <span
            className="flex items-center gap-1 font-medium text-pink-200 text-[8.5px] sm:text-[10.5px] truncate min-w-0"
            title={`Chương mới nhất: ${latestChapterTitle}`}
          >
            <BookOpen className="w-2.5 h-2.5 text-pink-400 shrink-0" />
            <span className="truncate">{latestChapterTitle}</span>
          </span>
          {variant === 'catalog' && novel.views !== undefined && (
            <span className="flex items-center gap-0.5 text-[8px] sm:text-[10px] font-medium text-slate-200 shrink-0">
              <Eye className="w-2.5 h-2.5 text-slate-300" />
              {formatCount(novel.views)}
            </span>
          )}
        </div>
      </div>

      {/* 3. Bố cục thân thẻ & Footer 1 dòng chuẩn PC & Mobile */}
      <div className="p-1.5 sm:p-2.5 flex-1 flex flex-col justify-between bg-white dark:bg-slate-800 transition-colors">
        <div>
          <h3
            className="novel-card-title font-bold text-[10.5px] sm:text-xs text-slate-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors line-clamp-2 leading-tight"
            title={novel.title}
          >
            {novel.title}
          </h3>
        </div>

        <div className="mt-1.5 pt-1.5 border-t border-pink-100/70 dark:border-slate-700/60 flex justify-between items-center w-full gap-1">
          {renderGenreBadge(mainGenre, shortSuffix)}
          <span className="flex items-center gap-0.5 text-[10px] md:text-xs font-semibold text-pink-500 shrink-0 whitespace-nowrap">
            🌸 {novel.flowerCount || 0}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StoryCard;
