import React, { useState } from 'react';
import { Novel, UserProfile, NovelReport } from '../types';
import { 
  X, 
  AlertTriangle, 
  ShieldAlert, 
  Send, 
  CheckCircle2, 
  FileWarning, 
  Flag,
  HelpCircle,
  Sparkles,
  Info
} from 'lucide-react';

interface ReportNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  novel: Novel;
  user: UserProfile;
  onSubmitReport: (report: NovelReport) => void;
}

const REPORT_REASONS = [
  {
    id: 'Truyện bản quyền',
    title: 'Truyện bản quyền',
    desc: 'Vi phạm quyền sở hữu trí tuệ, tác phẩm dịch hoặc phát hành khi chưa được sự cho phép của tác giả/nhà xuất bản.',
    badgeColor: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'Truyện 18+',
    title: 'Truyện 18+',
    desc: 'Chứa nội dung khiêu dâm thô tục, bạo lực tình dục quá đà hoặc vi phạm thuần phong mỹ tục.',
    badgeColor: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
  },
  {
    id: 'Truyện reup',
    title: 'Truyện reup',
    desc: 'Tự ý sao chép, copy bản dịch/edit của nhóm dịch khác đăng tải để trục lợi doanh thu mà không có sự đồng ý.',
    badgeColor: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  },
  {
    id: 'Truyện bôi nhọ Việt Nam',
    title: 'Truyện bôi nhọ Việt Nam',
    desc: 'Nội dung xuyên tạc lịch sử, vi phạm chủ quyền lãnh thổ quốc gia hoặc bôi nhọ hình ảnh đất nước, con người Việt Nam.',
    badgeColor: 'text-red-500 bg-red-500/10 border-red-500/30',
  },
  {
    id: 'Lý do khác',
    title: 'Lý do khác (Tự điền vào)',
    desc: 'Spam, xé vụn chương dưới 1.000 từ để vòi xu, cố tình xóa chương đăng lại để leo top hoặc lý do khác.',
    badgeColor: 'text-sky-500 bg-sky-500/10 border-sky-500/30',
  },
] as const;

export const ReportNovelModal: React.FC<ReportNovelModalProps> = ({
  isOpen,
  onClose,
  novel,
  user,
  onSubmitReport,
}) => {
  const [selectedReason, setSelectedReason] = useState<NovelReport['reason']>('Truyện bản quyền');
  const [customDetails, setCustomDetails] = useState('');
  const [reporterName, setReporterName] = useState(user.displayName || '');
  const [reporterEmail, setReporterEmail] = useState(user.email || '');
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (selectedReason === 'Lý do khác' && !customDetails.trim()) {
      setErrorMsg('Vui lòng nêu rõ lý do bạn báo cáo tác phẩm này.');
      return;
    }

    const report: NovelReport = {
      id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      novelId: novel.id,
      novelTitle: novel.title,
      novelCover: novel.coverImage,
      author: novel.author,
      reason: selectedReason,
      details: customDetails.trim(),
      reporterId: user.isLoggedIn ? user.id : 'guest',
      reporterName: reporterName.trim() || 'Bạn đọc ẩn danh',
      reporterEmail: reporterEmail.trim() || undefined,
      createdAt: Date.now(),
      status: 'pending',
    };

    onSubmitReport(report);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 2200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-[#231c26] dark:text-slate-200 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#faf6f0] dark:bg-[#0c101c] border border-[#ebdcd5] dark:border-rose-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative transition-colors max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 py-4 bg-white dark:bg-[#111728] border-b border-[#ebdcd5] dark:border-rose-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-base sm:text-lg font-bold text-[#231c26] dark:text-white flex items-center gap-2">
                Báo Cáo Vi Phạm Tác Phẩm
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gửi thông tin xác nhận vi phạm tới Quản Trị Viên Đạo Tâm
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          
          {/* Target Novel Mini Card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-[#161c2e] border border-[#ebdcd5] dark:border-slate-800">
            <img
              src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
              alt={novel.title}
              className="w-12 h-16 object-cover rounded-lg border border-[#ebdcd5] dark:border-slate-700 shadow-sm flex-shrink-0"
            />
            <div className="min-w-0">
              <div className="font-bold text-sm text-[#231c26] dark:text-white truncate">
                {novel.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Tác giả: <strong className="text-pink-600 dark:text-sky-300">{novel.author}</strong>
                {novel.editor ? ` • Edit: ${novel.editor}` : ''}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {novel.totalChapters} chương • {novel.status}
              </div>
            </div>
          </div>

          {/* Strict Platform Warning Banner */}
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/40 text-xs text-rose-800 dark:text-rose-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>Quy định xử phạt vi phạm nghiêm ngặt:</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-700/90 dark:text-rose-200/90">
              Các tác giả, editor không được phép đăng truyện bản quyền, truyện 18+, truyện reup, không tự ý cố tình xóa chương đăng lại để hiện truyện lên trang. Ai vi phạm và có xác nhận từ web sẽ <strong>bị cấm vĩnh viễn, doanh thu tháng đó cũng sẽ mất</strong>.
            </p>
          </div>

          {isSuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                Đã Gửi Báo Cáo Thành Công!
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                Ban Quản Trị Đạo Tâm đã ghi nhận thông tin báo cáo cho tác phẩm <strong>"{novel.title}"</strong>. Chúng tôi sẽ tiến hành thẩm định và xử lý theo đúng quy chế website.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-900/40 border border-rose-300 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Reasons list */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Chọn lý do báo cáo vi phạm *:
                </label>
                <div className="space-y-2">
                  {(REPORT_REASONS || []).map((r) => {
                    const isSelected = selectedReason === r.id;
                    return (
                      <label
                        key={r.id}
                        className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-400 dark:border-rose-500/70 shadow-sm'
                            : 'bg-white dark:bg-[#14192a] border-[#ebdcd5] dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <input
                            type="radio"
                            name="reportReason"
                            value={r.id}
                            checked={isSelected}
                            onChange={() => setSelectedReason(r.id)}
                            className="mt-0.5 accent-rose-600"
                          />
                          <div className="flex-1">
                            <div className="font-bold text-xs text-[#231c26] dark:text-white flex items-center justify-between">
                              <span>{r.title}</span>
                              {isSelected && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-600 text-white">
                                  Đang chọn
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                              {r.desc}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Additional Details */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Chi tiết phản ánh / Bằng chứng vi phạm {selectedReason === 'Lý do khác' ? '*' : '(không bắt buộc)'}:</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {customDetails?.length || 0}/500 ký tự
                  </span>
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={customDetails}
                  onChange={(e) => setCustomDetails(e.target.value)}
                  placeholder={
                    selectedReason === 'Lý do khác'
                      ? 'Vui lòng mô tả cụ thể hành vi vi phạm...'
                      : 'Cung cấp thêm đường link gốc, chương vi phạm hoặc thông tin đối chiếu nếu có...'
                  }
                  required={selectedReason === 'Lý do khác'}
                  className="w-full p-2.5 rounded-xl bg-white dark:bg-[#14192a] border border-[#ebdcd5] dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              {/* Reporter Info (Optional / prefilled) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Tên người gửi:
                  </label>
                  <input
                    type="text"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="Tên hoặc biệt danh của bạn"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#14192a] border border-[#ebdcd5] dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Email liên hệ (nếu cần phản hồi):
                  </label>
                  <input
                    type="email"
                    value={reporterEmail}
                    onChange={(e) => setReporterEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#14192a] border border-[#ebdcd5] dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-[#ebdcd5] dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Gửi Báo Cáo Cho Admin</span>
                </button>
              </div>

            </form>
          )}

        </div>

      </div>
    </div>
  );
};
