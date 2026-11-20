import React, { useState } from 'react';
import { Novel, UserProfile } from '../types';
import { 
  Search, 
  Plus, 
  BookOpen,
  Home,
  ArrowLeft,
  AlertTriangle
} from 'lucide-react';

interface MyNovelsModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  onClose: () => void;
  user: UserProfile;
  novels: Novel[];
  onOpenSubmitNovel: () => void;
  onEditNovel: (novel: Novel) => void;
  onViewNovel: (novel: Novel) => void;
  onViewChapterList: (novel: Novel) => void;
  onBatchUploadChapters: (novel: Novel) => void;
  onAddNewChapter: (novel: Novel) => void;
  onManageComments: (novel: Novel) => void;
  onToggleHideNovel: (novelId: string) => void;
  onDeleteNovel: (novelId: string) => void;
  onUpdateNovelFlags?: (novelId: string, flags: {
    isSensitive?: boolean;
    isOriginal?: boolean;
    isCompleted?: boolean;
  }) => void;
}

export const MyNovelsModal: React.FC<MyNovelsModalProps> = ({
  isOpen,
  isPageView = true,
  onClose,
  user,
  novels,
  onOpenSubmitNovel,
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
  const [localFlags, setLocalFlags] = useState<{
    [novelId: string]: {
      isSensitive?: boolean;
      isOriginal?: boolean;
      isCompleted?: boolean;
    };
  }>({});

  if (!isOpen) return null;

  // Lọc tác phẩm của tài khoản đang đăng nhập (tất cả truyện người đó đăng/sáng tác/nộp bản thảo được duyệt)
  const userNovels = (novels || []).filter((n) => {
    // 1. Kiểm tra ID người nộp hoặc authorId
    const isSubmittedByUserId = Boolean(user?.id) && user.id !== 'guest' && (
      n.submittedBy?.userId === user.id ||
      (n as any).authorId === user.id
    );

    // 2. Kiểm tra Email người nộp (không phân biệt hoa thường)
    const cleanUserEmail = user?.email?.trim().toLowerCase();
    const isSubmittedByUserEmail = Boolean(cleanUserEmail) && (
      n.submittedBy?.userEmail?.trim().toLowerCase() === cleanUserEmail ||
      (n as any).authorEmail?.trim().toLowerCase() === cleanUserEmail
    );

    // 3. Kiểm tra Tên tác giả / Bút danh / Tên hiển thị
    const cleanDisplayName = user?.displayName?.trim().toLowerCase();
    const isAuthorName = Boolean(cleanDisplayName) && cleanDisplayName !== 'khách độc truyện' && (
      n.author?.trim().toLowerCase() === cleanDisplayName ||
      n.submittedBy?.userName?.trim().toLowerCase() === cleanDisplayName
    );

    // 4. Kiểm tra Tên Editor
    const isEditorName = Boolean(cleanDisplayName) && cleanDisplayName !== 'khách độc truyện' && (
      n.editor?.trim().toLowerCase() === cleanDisplayName
    );

    // 5. Kiểm tra tiền tố Email (trước @)
    const emailPrefix = cleanUserEmail ? cleanUserEmail.split('@')[0] : '';
    const isEmailPrefix = Boolean(emailPrefix) && (
      n.author?.trim().toLowerCase() === emailPrefix ||
      n.editor?.trim().toLowerCase() === emailPrefix ||
      n.submittedBy?.userName?.trim().toLowerCase() === emailPrefix
    );

    return isSubmittedByUserId || isSubmittedByUserEmail || isAuthorName || isEditorName || isEmailPrefix;
  });

  const filteredNovels = (userNovels || []).filter((n) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (n.title || '').toLowerCase().includes(term) ||
      (n.author || '').toLowerCase().includes(term) ||
      (n.editor && n.editor.toLowerCase().includes(term))
    );
  });

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '28/08/2025';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '28/08/2025';
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
    <div className="w-full min-h-[80vh] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 animate-in fade-in duration-200">
      
      {/* 1. Header Toolbar matching image_1aa48ffc.png */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          {/* Breadcrumbs: Tủ truyện 🏠 > Truyện của bạn */}
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-200 hover:text-rose-600 transition cursor-pointer"
            >
              <span>Tủ truyện</span>
              <Home className="w-3.5 h-3.5 text-slate-500" />
            </button>
            <span className="text-slate-400">&gt;</span>
            <span className="text-slate-600 dark:text-slate-400">Truyện của bạn</span>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold">
              {userNovels?.length || 0} bộ
            </span>
          </div>

          {/* Action Row: Search input + RED Button + Thêm truyện mới */}
          <div className="flex items-center gap-3">
            <div className="relative w-48 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm truyện..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            {/* Nút màu ĐỎ theo yêu cầu rõ ràng: "nút màu đỏ thay vì màu xanh nhé" */}
            <button
              onClick={onOpenSubmitNovel}
              className="px-4 py-2 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] active:bg-[#b91c1c] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm truyện mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Body Content (Table matching image_1aa48ffc.png or Empty State) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
        
        {/* Nút quay lại trang trước nhẹ nhàng */}
        <div className="mb-4">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại trang trước</span>
          </button>
        </div>

        {(userNovels?.length || 0) === 0 ? (
          /* TRẠNG THÁI TRỐNG: "tôi chưa thêm truyện thì nó trống. tôi thêm bao nhiêu truyện thì hiện bấy nhiêu truyện" */
          <div className="py-24 text-center text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-6">
            <BookOpen className="w-16 h-16 text-slate-300 dark:text-slate-700 mb-3" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">
              Bạn chưa đăng truyện nào
            </h3>
            <p className="text-xs text-slate-500 max-w-md mb-6">
              Các tác phẩm bạn tạo sẽ xuất hiện tại đây cùng công cụ quản lý chương, bình luận, và phân bổ quyền tác giả.
            </p>
            <button
              onClick={onOpenSubmitNovel}
              className="px-5 py-2.5 rounded-xl bg-[#ef4444] hover:bg-[#dc2626] text-white font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all duration-150"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm truyện mới</span>
            </button>
          </div>
        ) : (filteredNovels?.length || 0) === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
            <p className="text-xs">Không tìm thấy truyện phù hợp với từ khóa "{searchTerm}".</p>
          </div>
        ) : (
          /* BẢNG DỮ LIỆU CHUẨN XÁC THEO ẢNH image_1aa48ffc.png */
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[12px] font-bold text-slate-700 dark:text-slate-300 bg-[#f8fafc] dark:bg-slate-800/80">
                  <th className="py-3 px-4 w-64">Truyện</th>
                  <th className="py-3 px-4 text-center w-28">Hình ảnh</th>
                  <th className="py-3 px-4 text-center w-24">Lượt xem</th>
                  <th className="py-3 px-4 min-w-[320px]">Trạng thái</th>
                  <th className="py-3 px-4 text-center w-28">Ngày cập nhật</th>
                  <th className="py-3 px-4 text-center w-36">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(filteredNovels || []).map((novel) => {
                  const flags = localFlags[novel.id] || {};
                  const isSensitive = flags.isSensitive !== undefined ? flags.isSensitive : novel.isSensitive || false;
                  const isOriginal = flags.isOriginal !== undefined ? flags.isOriginal : novel.isOriginal || false;
                  const isCompleted = flags.isCompleted !== undefined ? flags.isCompleted : (novel.status === 'Hoàn thành' || novel.status === 'Full');

                  return (
                    <tr key={novel.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      
                      {/* 1. Tên truyện & Link xem truyện */}
                      <td className="py-4 px-4 align-top">
                        <p className="font-bold text-slate-900 dark:text-white line-clamp-2 text-xs sm:text-sm mb-1 leading-snug">
                          {novel.title}
                        </p>
                        <button
                          onClick={() => onViewNovel(novel)}
                          className="text-[#0ea5e9] hover:underline font-bold text-xs inline-block cursor-pointer"
                        >
                          Xem truyện
                        </button>
                      </td>

                      {/* 2. Hình ảnh */}
                      <td className="py-4 px-4 align-top text-center">
                        <img
                          src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                          alt={novel.title}
                          className="w-14 h-20 object-cover rounded-md shadow-xs mx-auto border border-slate-200 dark:border-slate-700"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80';
                          }}
                        />
                      </td>

                      {/* 3. Lượt xem */}
                      <td className="py-4 px-4 align-top text-center font-medium text-slate-700 dark:text-slate-300">
                        {(novel.views || 0).toLocaleString('vi-VN')}
                      </td>

                      {/* 4. Trạng thái (3 Switch Toggles theo screenshot) */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2.5">
                          {/* Toggle 1: Từ ngữ nhạy cảm */}
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <span 
                              onClick={() => handleToggle(novel, 'isSensitive')}
                              className={`relative inline-flex items-center h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200 ease-in-out cursor-pointer ${
                                isSensitive ? 'bg-[#0088ff]' : 'bg-slate-300 dark:bg-slate-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                  isSensitive ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </span>
                            <span className="text-[11.5px] text-slate-600 dark:text-slate-300 leading-tight">
                              Truyện có sử dụng một số từ ngữ nhạy cảm (bạo lực, kích thích,...)
                            </span>
                          </label>

                          {/* Toggle 2: Truyện sáng tác */}
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <span 
                              onClick={() => handleToggle(novel, 'isOriginal')}
                              className={`relative inline-flex items-center h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200 ease-in-out cursor-pointer ${
                                isOriginal ? 'bg-[#0088ff]' : 'bg-slate-300 dark:bg-slate-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                  isOriginal ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </span>
                            <span className="text-[11.5px] text-slate-600 dark:text-slate-300 leading-tight">
                              Truyện sáng tác
                            </span>
                          </label>

                          {/* Toggle 3: Hoàn thành */}
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <span 
                              onClick={() => handleToggle(novel, 'isCompleted')}
                              className={`relative inline-flex items-center h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200 ease-in-out cursor-pointer ${
                                isCompleted ? 'bg-[#0088ff]' : 'bg-slate-300 dark:bg-slate-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                  isCompleted ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </span>
                            <span className="text-[11.5px] text-slate-600 dark:text-slate-300 leading-tight">
                              Hoàn thành
                            </span>
                          </label>
                        </div>
                      </td>

                      {/* 5. Ngày cập nhật */}
                      <td className="py-4 px-4 align-top text-center text-slate-600 dark:text-slate-400 text-xs">
                        {formatDate(novel.updatedAt)}
                      </td>

                      {/* 6. Hành động (6 nút xếp dọc chuẩn màu ảnh screenshot) */}
                      <td className="py-4 px-4 align-top">
                        <div className="flex flex-col gap-1.5 w-32 mx-auto">
                          
                          {/* Chỉnh sửa -> Blue */}
                          <button
                            onClick={() => onEditNovel(novel)}
                            className="w-full py-1.5 px-3 rounded-full bg-[#0088ff] hover:bg-blue-600 text-white text-[11px] font-bold transition text-center cursor-pointer shadow-2xs"
                          >
                            Chỉnh sửa
                          </button>

                          {/* Danh sách chương -> Yellow / Orange */}
                          <button
                            onClick={() => onViewChapterList(novel)}
                            className="w-full py-1.5 px-3 rounded-full bg-[#f59e0b] hover:bg-amber-600 text-white text-[11px] font-bold transition text-center cursor-pointer shadow-2xs"
                          >
                            Danh sách chương
                          </button>

                          {/* Đăng nhiều chương -> Cyan */}
                          <button
                            onClick={() => onBatchUploadChapters(novel)}
                            className="w-full py-1.5 px-3 rounded-full bg-[#00bcd4] hover:bg-cyan-600 text-white text-[11px] font-bold transition text-center cursor-pointer shadow-2xs"
                          >
                            Đăng nhiều chương
                          </button>

                          {/* Đăng chương mới -> Slate / Dark gray */}
                          <button
                            onClick={() => onAddNewChapter(novel)}
                            className="w-full py-1.5 px-3 rounded-full bg-[#455a64] hover:bg-slate-700 text-white text-[11px] font-bold transition text-center cursor-pointer shadow-2xs"
                          >
                            Đăng chương mới
                          </button>

                          {/* Quản lý bình luận -> Green */}
                          <button
                            onClick={() => onManageComments(novel)}
                            className="w-full py-1.5 px-3 rounded-full bg-[#10b981] hover:bg-emerald-600 text-white text-[11px] font-bold transition text-center cursor-pointer shadow-2xs"
                          >
                            Quản lý bình luận
                          </button>

                          {/* Xoá truyện -> Red */}
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteNovel(novel)}
                            className="w-full py-1.5 px-3 rounded-full bg-[#ef4444] hover:bg-rose-600 text-white text-[11px] font-bold transition text-center cursor-pointer shadow-2xs"
                          >
                            Xoá truyện
                          </button>

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {confirmDeleteNovel && (
        <div className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-rose-100 space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              Xác Nhận Xóa Truyện
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa vĩnh viễn bộ truyện <strong>"{confirmDeleteNovel.title}"</strong> không? Hành động này không thể hoàn tác.
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
                  onDeleteNovel(confirmDeleteNovel.id);
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
