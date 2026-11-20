import React, { useState } from 'react';
import { GenreItem } from '../types';
import { 
  Landmark, 
  Zap, 
  Feather, 
  Cpu, 
  Building2, 
  Crown, 
  Flame, 
  Box, 
  Swords, 
  Ghost, 
  Biohazard, 
  Heart, 
  Smile, 
  ShieldAlert, 
  Award, 
  Target, 
  PawPrint, 
  AlertTriangle, 
  Calendar, 
  Dog, 
  RotateCcw, 
  Mountain, 
  Hourglass,
  Tag,
  Plus,
  X,
  Sparkles
} from 'lucide-react';

interface HotGenresSectionProps {
  genres: GenreItem[];
  selectedGenre: string | null;
  onSelectGenre: (genreName: string | null) => void;
  onAddNewGenre?: (name: string) => void;
  canAddGenre?: boolean;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Landmark: <Landmark className="w-3.5 h-3.5" />,
  Zap: <Zap className="w-3.5 h-3.5" />,
  Feather: <Feather className="w-3.5 h-3.5" />,
  Cpu: <Cpu className="w-3.5 h-3.5" />,
  Building2: <Building2 className="w-3.5 h-3.5" />,
  Crown: <Crown className="w-3.5 h-3.5" />,
  Flame: <Flame className="w-3.5 h-3.5" />,
  Box: <Box className="w-3.5 h-3.5" />,
  Swords: <Swords className="w-3.5 h-3.5" />,
  Ghost: <Ghost className="w-3.5 h-3.5" />,
  Biohazard: <Biohazard className="w-3.5 h-3.5" />,
  Heart: <Heart className="w-3.5 h-3.5" />,
  Smile: <Smile className="w-3.5 h-3.5" />,
  ShieldAlert: <ShieldAlert className="w-3.5 h-3.5" />,
  Award: <Award className="w-3.5 h-3.5" />,
  Target: <Target className="w-3.5 h-3.5" />,
  PawPrint: <PawPrint className="w-3.5 h-3.5" />,
  AlertTriangle: <AlertTriangle className="w-3.5 h-3.5" />,
  Calendar: <Calendar className="w-3.5 h-3.5" />,
  Dog: <Dog className="w-3.5 h-3.5" />,
  RotateCcw: <RotateCcw className="w-3.5 h-3.5" />,
  Mountain: <Mountain className="w-3.5 h-3.5" />,
  Hourglass: <Hourglass className="w-3.5 h-3.5" />,
  Tag: <Tag className="w-3.5 h-3.5" />,
};

export const HotGenresSection: React.FC<HotGenresSectionProps> = ({
  genres,
  selectedGenre,
  onSelectGenre,
  onAddNewGenre,
  canAddGenre = true,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');

  const handleCreateGenre = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGenreName.trim() || !onAddNewGenre) return;
    onAddNewGenre(newGenreName.trim());
    setNewGenreName('');
    setIsAdding(false);
  };

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600/10 dark:bg-blue-600/20 text-blue-600 dark:text-cyan-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#91C9FF] title-ice-blue uppercase tracking-wider">
              Khám Phá Theo Thể Loại ({genres?.length || 0})
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Chọn thể loại để lọc nhanh danh sách truyện yêu thích
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedGenre && (
            <button
              onClick={() => onSelectGenre(null)}
              className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Bỏ lọc</span>
            </button>
          )}

          {canAddGenre && onAddNewGenre && !isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-blue-600 dark:text-cyan-400 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
              title="Thêm thể loại truyện mới"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Thêm thể loại</span>
            </button>
          )}
        </div>
      </div>

      {/* Form thêm thể loại mới */}
      {isAdding && (
        <form onSubmit={handleCreateGenre} className="mb-4 p-3 rounded-xl bg-white dark:bg-slate-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-md flex items-center gap-2 max-w-md animate-in fade-in duration-150">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-cyan-400 flex-shrink-0" />
          <input
            type="text"
            required
            autoFocus
            value={newGenreName}
            onChange={(e) => setNewGenreName(e.target.value)}
            placeholder="Nhập tên thể loại (vd: Tiên Hiệp, Đô Thị...)"
            className="flex-1 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs cursor-pointer shadow-sm"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setNewGenreName('');
            }}
            className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-xs cursor-pointer"
          >
            Hủy
          </button>
        </form>
      )}

      {/* Modern Rounded Pill Badges (Borderless, soft shadow, oceanic blue) */}
      <div className="flex flex-wrap gap-2 sm:gap-2.5">
        {(genres || []).map((g) => {
          const isSelected = selectedGenre === g.name;
          const icon = (g.iconName && ICON_MAP[g.iconName]) || <Tag className="w-3.5 h-3.5" />;

          return (
            <button
              key={g.id}
              onClick={() => onSelectGenre(isSelected ? null : g.name)}
              className={`group flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 scale-102 font-semibold'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-cyan-400 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.04)] dark:shadow-md dark:shadow-black/30'
              }`}
              title={g.description}
            >
              {/* Circular Icon Container */}
              <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ${
                isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-blue-600 dark:text-cyan-400'
              }`}>
                {icon}
              </div>

              <span>{g.name}</span>
              {g.isCustom && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" title="Thể loại mới thêm" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
