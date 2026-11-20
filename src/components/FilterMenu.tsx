import React from 'react';
import {
  GENRE_CONFIG,
  type CategoryFilterId,
  type GenreConfigItem,
} from '../data/genreConfig';

export interface FilterMenuProps {
  /** ID phân mục đang được chọn */
  activeCategory: string;
  /** Callback khi người dùng bấm chọn nút lọc */
  onSelectCategory: (categoryId: CategoryFilterId) => void;
  /** Giới hạn danh sách ID hiển thị từ GENRE_CONFIG */
  visibleIds?: CategoryFilterId[];
  /** Hiển thị nhãn 'Phân mục:' phía trước */
  showLabel?: boolean;
  /** Nhãn phía trước (mặc định: 'Phân mục:') */
  labelText?: string;
  /** Dùng tên ngắn (ví dụ 'S.Tác') nếu có */
  useShortName?: boolean;
  /** Class bổ sung cho container ngoài */
  className?: string;
}

export const FilterMenu: React.FC<FilterMenuProps> = ({
  activeCategory,
  onSelectCategory,
  visibleIds,
  showLabel = true,
  labelText = 'Phân mục:',
  useShortName = false,
  className = '',
}) => {
  const items: GenreConfigItem[] = Array.isArray(visibleIds)
    ? (visibleIds || [])
        .map((id) => (GENRE_CONFIG || []).find((item) => item.id === id))
        .filter((item): item is GenreConfigItem => Boolean(item))
    : (GENRE_CONFIG || []);

  const baseButtonClass =
    'genre-filter-btn w-full sm:w-auto min-w-0 sm:shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold border transition-all duration-200 cursor-pointer active:scale-95';

  return (
    <div
      className={`w-full flex flex-wrap items-center gap-2 ${className}`}
      role="navigation"
      aria-label="Thanh lọc phân mục thể loại"
    >
      {showLabel && (
        <span className="hidden sm:inline-block text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0 whitespace-nowrap">
          {labelText}
        </span>
      )}

      {/* Mobile (< sm): dàn đều 3 cột cân đối toàn chiều ngang; PC (>= sm): flex-wrap ngang */}
      <div className="w-full sm:w-auto grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
        {(items || []).map((item) => {
          const IconComponent = item.icon;
          const isActive = activeCategory === item.id;
          const displayName = useShortName && item.shortName ? item.shortName : item.name;
          const stateClass = isActive
            ? `${item.activeClass} font-bold`
            : `bg-white dark:bg-slate-900 ${item.colorClass}`;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectCategory(item.id)}
              aria-pressed={isActive}
              title={
                item.id === 'short-story'
                  ? 'Danh sách truyện ngắn / đoản văn'
                  : item.name
              }
              className={`${baseButtonClass} ${stateClass}`}
            >
              <IconComponent
                className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${
                  item.iconFilled ? 'fill-current' : ''
                }`}
              />
              <span className="truncate">{displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FilterMenu;
