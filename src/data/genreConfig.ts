import type { ComponentType } from 'react';
import {
  BookOpen,
  Flower,
  Heart,
  PenTool,
  Sparkles,
  Swords,
} from 'lucide-react';

export type CategoryFilterId =
  | 'all'
  | 'truyen-nam'
  | 'dam-my'
  | 'truyen-nu'
  | 'truyen-sang-tac'
  | 'short-story';

export type MainGenreLabel =
  | 'Đam Mỹ'
  | 'Truyện Nam'
  | 'Truyện Nữ'
  | 'Truyện Sáng Tác';

export interface GenreConfigItem {
  id: CategoryFilterId;
  name: string;
  shortName?: string;
  icon: ComponentType<{ className?: string }>;
  iconFilled?: boolean;
  /** Trạng thái bình thường cho nút lọc (chữ + viền) */
  colorClass: string;
  /** Trạng thái đang chọn (Active) cho nút lọc (nền + chữ trắng) */
  activeClass: string;
  /** Màu chữ cho badge trên StoryCard */
  badgeColorClass: string;
  /** Đường dẫn mặc định */
  href: string;
}

/**
 * CẤU HÌNH CHUNG CHO THỂ LOẠI & BỘ LỌC (SINGLE SOURCE OF TRUTH)
 * Dùng chung cho cả StoryCard lẫn FilterMenu / Header trên toàn bộ dự án.
 * TUYỆT ĐỐI KHÔNG hardcode màu và icon rải rác ở các component khác.
 */
export const GENRE_CONFIG: GenreConfigItem[] = [
  {
    id: 'all',
    name: 'Tất cả',
    icon: Sparkles,
    colorClass:
      'text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-pink-400 hover:text-pink-500',
    activeClass: 'bg-pink-600 text-white border-pink-600 shadow-sm shadow-pink-600/25',
    badgeColorClass: 'text-slate-600 dark:text-slate-300',
    href: '/',
  },
  {
    id: 'truyen-nam',
    name: 'Truyện Nam',
    icon: Swords,
    colorClass:
      'text-yellow-500 border-yellow-500 hover:bg-yellow-500/10',
    activeClass: 'bg-yellow-500 text-white border-yellow-500 shadow-sm shadow-yellow-500/25',
    badgeColorClass: 'text-yellow-500',
    href: '/?category=truyen-nam',
  },
  {
    id: 'dam-my',
    name: 'Đam Mỹ',
    icon: Heart,
    iconFilled: true,
    colorClass:
      'text-purple-500 border-purple-500 hover:bg-purple-500/10',
    activeClass: 'bg-purple-500 text-white border-purple-500 shadow-sm shadow-purple-500/25',
    badgeColorClass: 'text-purple-500',
    href: '/?category=dam-my',
  },
  {
    id: 'truyen-nu',
    name: 'Truyện Nữ',
    icon: Flower,
    colorClass:
      'text-pink-500 border-pink-500 hover:bg-pink-500/10',
    activeClass: 'bg-pink-500 text-white border-pink-500 shadow-sm shadow-pink-500/25',
    badgeColorClass: 'text-pink-500',
    href: '/?category=truyen-nu',
  },
  {
    id: 'truyen-sang-tac',
    name: 'Truyện Sáng Tác',
    shortName: 'S.Tác',
    icon: PenTool,
    colorClass:
      'text-blue-300 border-blue-300 hover:bg-blue-300/10',
    activeClass: 'bg-blue-300 text-white border-blue-300 shadow-sm shadow-blue-300/25',
    badgeColorClass: 'text-blue-300',
    href: '/?category=truyen-sang-tac',
  },
  {
    id: 'short-story',
    name: 'Truyện Ngắn',
    icon: BookOpen,
    colorClass:
      'text-emerald-500 border-emerald-500 hover:bg-emerald-500/10',
    activeClass: 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-500/25',
    badgeColorClass: 'text-emerald-500',
    href: '/truyen-ngan',
  },
];

export const GENRE_CONFIG_BY_ID: Record<CategoryFilterId, GenreConfigItem> =
  GENRE_CONFIG.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {} as Record<CategoryFilterId, GenreConfigItem>);

export const GENRE_CONFIG_BY_LABEL: Record<MainGenreLabel, GenreConfigItem> = {
  'Truyện Nam': GENRE_CONFIG_BY_ID['truyen-nam'],
  'Đam Mỹ': GENRE_CONFIG_BY_ID['dam-my'],
  'Truyện Nữ': GENRE_CONFIG_BY_ID['truyen-nu'],
  'Truyện Sáng Tác': GENRE_CONFIG_BY_ID['truyen-sang-tac'],
};

export function normalizeGenreLabel(genre?: string | null): MainGenreLabel {
  const normalized = String(genre || '').trim().toLowerCase();
  if (
    normalized === 'truyện nam' ||
    normalized === 'truyen nam' ||
    normalized === 'truyen-nam'
  ) {
    return 'Truyện Nam';
  }
  if (
    normalized === 'truyện nữ' ||
    normalized === 'truyen nu' ||
    normalized === 'truyen-nu'
  ) {
    return 'Truyện Nữ';
  }
  if (
    normalized === 'truyện sáng tác' ||
    normalized === 'truyen sang tac' ||
    normalized === 'truyen-sang-tac'
  ) {
    return 'Truyện Sáng Tác';
  }
  return 'Đam Mỹ';
}

export function getGenreConfigById(id?: string | null): GenreConfigItem {
  if (id && id in GENRE_CONFIG_BY_ID) {
    return GENRE_CONFIG_BY_ID[id as CategoryFilterId];
  }
  return GENRE_CONFIG_BY_ID.all;
}

export function getGenreConfigByLabel(genre?: string | null): GenreConfigItem {
  const label = normalizeGenreLabel(genre);
  return GENRE_CONFIG_BY_LABEL[label];
}

export function extractStoryMainGenre(story: {
  genres?: string[];
  categories?: string[];
  mainCategory?: string;
}): MainGenreLabel {
  const combinedTags = [
    ...(Array.isArray(story.genres) ? story.genres : []),
    ...(Array.isArray(story.categories) ? story.categories : []),
  ];

  for (const tag of combinedTags) {
    const clean = String(tag || '').trim().toLowerCase();
    if (clean === 'truyện nam' || clean === 'truyen nam' || clean === 'truyen-nam') {
      return 'Truyện Nam';
    }
    if (clean === 'truyện nữ' || clean === 'truyen nu' || clean === 'truyen-nu') {
      return 'Truyện Nữ';
    }
    if (clean === 'đam mỹ' || clean === 'dam my' || clean === 'dam-my') {
      return 'Đam Mỹ';
    }
    if (
      clean === 'truyện sáng tác' ||
      clean === 'truyen sang tac' ||
      clean === 'truyen-sang-tac'
    ) {
      return 'Truyện Sáng Tác';
    }
  }

  return normalizeGenreLabel(story.mainCategory);
}
