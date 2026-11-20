import React, { useState, useMemo } from 'react';
import { Novel } from '../types';
import { 
  Search, 
  Plus, 
  ExternalLink, 
  Eye, 
  Edit3, 
  ListOrdered, 
  Layers, 
  FilePlus, 
  MessageSquare, 
  EyeOff, 
  Trash2,
  AlertTriangle,
  CheckCircle2,
  BookOpen
} from 'lucide-react';

export interface NovelManagementTableProps {
  novels: Novel[];
  onOpenSubmitModal?: () => void;
  onEditNovel?: (novel: Novel) => void;
  onViewNovel?: (novel: Novel) => void;
  onViewChapterList?: (novel: Novel) => void;
  onBatchUploadChapters?: (novel: Novel) => void;
  onAddNewChapter?: (novel: Novel) => void;
  onManageComments?: (novel: Novel) => void;
  onToggleHideNovel?: (novelId: string) => void;
  onDeleteNovel?: (novelId: string) => void;
  onUpdateNovelFlags?: (novelId: string, flags: {
    isSensitive?: boolean;
    isOriginal?: boolean;
    isCompleted?: boolean;
  }) => void;
}

export const NovelManagementTable: React.FC<NovelManagementTableProps> = ({
  novels,
  onOpenSubmitModal,
  onEditNovel,
  onViewNovel,
  onViewChapterList,
  onBatchUploadChapters,
  onAddNewChapter,
  onManageComments,
  onToggleHideNovel,
  onDeleteNovel,
  onUpdateNovelFlags,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteNovel, setConfirmDeleteNovel] = useState<Novel | null>(null);
  
  // Local state for fast reactive toggle feedback before syncing
  const [localFlags, setLocalFlags] = useState<{
    [novelId: string]: {
      isSensitive?: boolean;
      isOriginal?: boolean;
      isCompleted?: boolean;
    };
  }>({});

  // Filter novels by title or author
  const filteredNovels = useMemo(() => {
    const safeNovels = Array.isArray(novels) ? novels : [];
    if (!searchTerm.trim()) return safeNovels;
    const term = searchTerm.toLowerCase().trim();
    return safeNovels.filter(
      (n) =>
        (n.title || '').toLowerCase().includes(term) ||
        (n.author || '').toLowerCase().includes(term) ||
        (n.editor && n.editor.toLowerCase().includes(term))
    );
  }, [novels, searchTerm]);

  // Format date dd/mm/yyyy
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '31/10/2026';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '31/10/2026';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleToggle = (
    novel: Novel,
    field: 'isSensitive' | 'isOriginal' | 'isCompleted'
  ) => {
    const current = localFlags[novel.id]?.[field] !== undefined
      ? localFlags[novel.id][field]
      : field === 'isCompleted'
      ? (novel.status === 'Hoàn thành' || novel.status === 'Full')
      : (novel as any)[field] || false;

    const nextVal = !current;

    setLocalFlags((prev) => ({
      ...prev,
      [novel.id]: {
        ...prev[novel.id],
        [field]: nextVal,
      },
    }));

    if (onUpdateNovelFlags) {
      onUpdateNovelFlags(novel.id, { [field]: nextVal });
    }
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
      
      {/* Top Bar: Search & "+ Thêm truyện mới" Button */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
        
        {/* Search Bar */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm truyện..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition shadow-2xs"
          />
        </div>

        {/* Pastel Blue "+ Thêm truyện mới" Button (Tuyệt đối không dùng hồng/đỏ) */}
        {onOpenSubmitModal && (
          <button
            type="button"
            onClick={onOpenSubmitModal}
            className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-medium text-xs sm:text-sm rounded-lg flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm truyện mới</span>
          </button>
        )}
      </div>

      {/* Novel Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 text-xs font-bold uppercase tracking-wider">
              <th className="py-3 px-4 w-48 sm:w-64">Truyện</th>
              <th className="py-3 px-4 w-28 text-center">Hình ảnh</th>
              <th className="py-3 px-4 w-24 text-center">Lượt xem</th>
              <th className="py-3 px-4 min-w-[260px]">Trạng thái</th>
              <th className="py-3 px-4 w-28 text-center">Ngày cập nhật</th>
              <th className="py-3 px-4 w-40 text-center">Hành động</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
            {(filteredNovels?.length || 0) === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <BookOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-medium">Không tìm thấy tác phẩm nào</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Thử tìm kiếm từ khóa khác hoặc nhấn "Thêm truyện mới" để bắt đầu.
                  </p>
                </td>
              </tr>
            ) : (
              (filteredNovels || []).map((novel) => {
                const flags = localFlags[novel.id] || {};
                const isSensitiveActive = flags.isSensitive !== undefined ? flags.isSensitive : !!novel.isSensitive;
                const isOriginalActive = flags.isOriginal !== undefined ? flags.isOriginal : !!novel.isOriginal;
                const isCompletedActive = flags.isCompleted !== undefined ? flags.isCompleted : (novel.status === 'Hoàn thành' || novel.status === 'Full');
                const isHidden = !!novel.isHidden;

                return (
                  <tr key={novel.id} className="hover:bg-slate-50/70 transition-colors">
                    
                    {/* Cột 1: Truyện (Tên truyện in đậm + link Xem truyện nhỏ bên dưới) */}
                    <td className="py-4 px-4 align-top">
                      <div className="space-y-1">
                        <h4 className="font-bold text-sm text-slate-900 line-clamp-2 leading-snug">
                          {novel.title}
                        </h4>
                        <div className="text-[11px] text-slate-500">
                          Tác giả: <span className="font-medium text-slate-700">{novel.author}</span>
                        </div>
                        {onViewNovel && (
                          <button
                            type="button"
                            onClick={() => onViewNovel(novel)}
                            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline cursor-pointer font-medium pt-0.5"
                          >
                            <span>Xem truyện</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Cột 2: Hình ảnh (ảnh bìa dọc tỉ lệ 2:3) */}
                    <td className="py-4 px-4 align-top text-center">
                      <div className="inline-block w-16 h-24 rounded-md overflow-hidden border border-slate-200 shadow-xs bg-slate-100 flex-shrink-0">
                        <img
                          src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                          alt={novel.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80';
                          }}
                        />
                      </div>
                    </td>

                    {/* Cột 3: Lượt xem */}
                    <td className="py-4 px-4 align-top text-center font-medium text-slate-700 text-sm">
                      {(novel.views || 0).toLocaleString('vi-VN')}
                    </td>

                    {/* Cột 4: Trạng thái (Tag Hoạt động, Checkbox/Switch Từ ngữ nhạy cảm, Checkbox Truyện sáng tác, Checkbox Hoàn thành) */}
                    <td className="py-4 px-4 align-top space-y-2">
                      {/* Tag Hoạt động hoặc Tạm ẩn */}
                      <div>
                        {isHidden ? (
                          <span className="inline-block bg-slate-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded">
                            Tạm ẩn
                          </span>
                        ) : (
                          <span className="inline-block bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded">
                            Hoạt động
                          </span>
                        )}
                      </div>

                      {/* 3 Switches / Checkboxes */}
                      <div className="space-y-1.5 pt-1 text-xs text-slate-600">
                        
                        {/* 1. Từ ngữ nhạy cảm */}
                        <label className="flex items-start gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isSensitiveActive}
                            onChange={() => handleToggle(novel, 'isSensitive')}
                            className="mt-0.5 w-3.5 h-3.5 rounded text-blue-500 focus:ring-blue-400 border-slate-300 cursor-pointer"
                          />
                          <span className="text-[11px] leading-tight">
                            Truyện có sử dụng một số từ ngữ nhạy cảm (bạo lực, kích thích,...)
                          </span>
                        </label>

                        {/* 2. Truyện sáng tác */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isOriginalActive}
                            onChange={() => handleToggle(novel, 'isOriginal')}
                            className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-blue-400 border-slate-300 cursor-pointer"
                          />
                          <span className="text-[11px] font-medium text-slate-700">
                            Truyện sáng tác
                          </span>
                        </label>

                        {/* 3. Hoàn thành */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isCompletedActive}
                            onChange={() => handleToggle(novel, 'isCompleted')}
                            className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-blue-400 border-slate-300 cursor-pointer"
                          />
                          <span className="text-[11px] font-medium text-slate-700">
                            Hoàn thành
                          </span>
                        </label>

                      </div>
                    </td>

                    {/* Cột 5: Ngày cập nhật */}
                    <td className="py-4 px-4 align-top text-center text-xs text-slate-600 font-medium">
                      {formatDate(novel.updatedAt)}
                    </td>

                    {/* Cột 6: Hành động (6-7 nút xếp dọc sát nhau theo đúng mẫu ảnh) */}
                    <td className="py-4 px-4 align-top">
                      <div className="flex flex-col items-center gap-1.5 w-36 mx-auto">
                        
                        {/* 1. Chỉnh sửa (xanh nhạt) */}
                        <button
                          type="button"
                          onClick={() => onEditNovel?.(novel)}
                          className="w-full py-1 px-3 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold text-xs text-center shadow-2xs transition cursor-pointer"
                        >
                          Chỉnh sửa
                        </button>

                        {/* 2. Danh sách chương (vàng) */}
                        <button
                          type="button"
                          onClick={() => onViewChapterList?.(novel)}
                          className="w-full py-1 px-3 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs text-center shadow-2xs transition cursor-pointer"
                        >
                          Danh sách chương
                        </button>

                        {/* 3. Đăng nhiều chương (xanh lam) */}
                        <button
                          type="button"
                          onClick={() => onBatchUploadChapters?.(novel)}
                          className="w-full py-1 px-3 rounded-full bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs text-center shadow-2xs transition cursor-pointer"
                        >
                          Đăng nhiều chương
                        </button>

                        {/* 4. Đăng chương mới (xanh slate / xám đậm) */}
                        <button
                          type="button"
                          onClick={() => onAddNewChapter?.(novel)}
                          className="w-full py-1 px-3 rounded-full bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs text-center shadow-2xs transition cursor-pointer"
                        >
                          Đăng chương mới
                        </button>

                        {/* 5. Quản lý bình luận (xanh lá) */}
                        <button
                          type="button"
                          onClick={() => onManageComments?.(novel)}
                          className="w-full py-1 px-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs text-center shadow-2xs transition cursor-pointer"
                        >
                          Quản lý bình luận
                        </button>

                        {/* 6. Ẩn truyện / Bỏ ẩn (xám) */}
                        <button
                          type="button"
                          onClick={() => onToggleHideNovel?.(novel.id)}
                          className="w-full py-1 px-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs text-center shadow-2xs transition cursor-pointer"
                        >
                          {isHidden ? 'Hiện truyện' : 'Ẩn truyện'}
                        </button>

                        {/* 7. Xóa truyện (đỏ) */}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteNovel(novel)}
                          className="w-full py-1 px-3 rounded-full bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs text-center shadow-2xs transition cursor-pointer"
                        >
                          Xoá truyện
                        </button>

                      </div>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <span>Hiển thị {filteredNovels?.length || 0} / {novels?.length || 0} tác phẩm</span>
        <span>Hệ thống quản lý tác phẩm Đạo Tâm</span>
      </div>

      {confirmDeleteNovel && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-rose-100 space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              Xác Nhận Xóa Truyện
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa vĩnh viễn tác phẩm <strong>"{confirmDeleteNovel.title}"</strong> không? Hành động này không thể hoàn tác.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteNovel(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteNovel?.(confirmDeleteNovel.id);
                  setConfirmDeleteNovel(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition"
              >
                Xóa Vĩnh Viễn
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
