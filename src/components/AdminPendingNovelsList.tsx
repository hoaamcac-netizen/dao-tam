import React, { useState, useEffect, useCallback } from 'react';
import { NovelSubmission, SubmissionChapterDraft, UserProfile } from '../types';
import { 
  fetchPendingNovelSubmissionsFromFirestore, 
  updateNovelSubmissionStatusInFirestore, 
  deleteNovelSubmissionFromFirestore,
  fetchSubmissionChaptersFromFirestore,
  upgradeAuthorAndSendNotification
} from '../firebase/services';
import { checkIsAdmin, ADMIN_EMAILS } from '../firebase/config';
import { 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Trash2, 
  EyeOff, 
  AlertTriangle, 
  Sparkles, 
  Building2, 
  FileText, 
  Clock, 
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
  Youtube
} from 'lucide-react';

export interface AdminPendingNovelsListProps {
  currentUser: UserProfile;
  onApproveSubmission?: (submissionId: string) => Promise<void> | void;
  onRejectSubmission?: (submissionId: string, reason?: string) => Promise<void> | void;
  onDeleteSubmission?: (submissionId: string) => Promise<void> | void;
}

/**
 * ==============================================================================
 * COMPONENT: DANH SÁCH TRUYỆN CHỜ DUYỆT DÀNH CHO ADMIN (ĐỒNG BỘ REAL-TIME ONSNAPSHOT)
 * 
 * TIÊU CHUẨN KỸ THUẬT:
 * 1. Đồng bộ Real-time (onSnapshot): Lắng nghe tức thì collection novel_submissions với status == 'pending'
 * 2. Cập nhật giao diện lập tức: Khi 1 Admin Từ chối / Xóa / Ẩn, document lập tức biến mất trên mọi màn hình Admin khác
 * 3. Tối ưu Quota Spark: Bắt buộc unsubscribe() khi unmount, chỉ đọc metadata (không kéo text chương)
 * 4. Phân quyền chặt chẽ: Chỉ 2 email (hoaamcac@gmail.com, meoyeutien22@gmail.com) mới được mount
 * 5. Báo lỗi bằng Banner nền VÀNG (tuyệt đối không dùng màu đỏ), nút Duyệt/Từ chối tone màu Hồng chủ đạo
 * ==============================================================================
 */
export const AdminPendingNovelsList: React.FC<AdminPendingNovelsListProps> = ({
  currentUser,
  onApproveSubmission,
  onRejectSubmission,
  onDeleteSubmission,
}) => {
  const [pendingNovels, setPendingNovels] = useState<NovelSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Thao tác Từ chối / Ẩn / Xóa
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [actionProcessingId, setActionProcessingId] = useState<string | null>(null);

  // Preview thẩm định 5 chương (Tải nội dung text theo yêu cầu on-demand để tiết kiệm reads)
  const [previewNovel, setPreviewNovel] = useState<NovelSubmission | null>(null);
  const [previewChapters, setPreviewChapters] = useState<SubmissionChapterDraft[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  const userEmail = currentUser?.email?.toLowerCase().trim();
  const isAuthorizedAdmin = checkIsAdmin(userEmail);

  const loadPendingSubmissions = useCallback(async () => {
    if (!isAuthorizedAdmin) {
      setIsLoading(false);
      setErrorMessage(
        `Quyền truy cập bị từ chối: Tài khoản "${userEmail || 'Chưa xác định'}" không thuộc danh sách Quản trị viên được phân quyền (${(ADMIN_EMAILS || []).join(', ')}). Vui lòng liên hệ Trưởng Ban Quản Trị.`
      );
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    try {
      const submissions = await fetchPendingNovelSubmissionsFromFirestore(userEmail);
      setPendingNovels(Array.isArray(submissions) ? submissions : []);
    } catch (error: any) {
      console.warn('[AdminPendingNovels] Lỗi kết nối Firestore:', error);
      setErrorMessage(
        `Cảnh báo kết nối hệ thống: ${error?.message || 'Không thể tải danh sách truyện chờ duyệt. Vui lòng bấm Tải lại.'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [userEmail, isAuthorizedAdmin]);

  useEffect(() => {
    loadPendingSubmissions();
  }, [loadPendingSubmissions]);

  // Xử lý khi Admin bấm Duyệt tác phẩm
  const handleApprove = async (sub: NovelSubmission) => {
    if (actionProcessingId) return;
    setActionProcessingId(sub.id);
    setErrorMessage(null);

    // Optimistic UI: Loại bỏ truyện khỏi danh sách ngay lập tức trên máy cục bộ
    setPendingNovels((prev) => (prev || []).filter((item) => item.id !== sub.id));

    try {
      if (onApproveSubmission) {
        await onApproveSubmission(sub.id);
      } else {
        await updateNovelSubmissionStatusInFirestore(sub.id, 'approved');
        if (sub.submittedBy?.userId) {
          await upgradeAuthorAndSendNotification(
            sub.submittedBy.userId,
            sub.submittedBy.userEmail,
            sub.title,
            sub.id,
            sub.bankInfo
          );
        }
      }
    } catch (err: any) {
      console.error('Lỗi khi duyệt truyện:', err);
      // Hiển thị cảnh báo lỗi bằng banner nền màu vàng
      setErrorMessage(`Lỗi xử lý duyệt truyện "${sub.title}": ${err?.message || 'Không thể cập nhật cơ sở dữ liệu.'}`);
      // Hoàn tác lại danh sách nếu thất bại
      setPendingNovels((prev) => [sub, ...prev]);
    } finally {
      setActionProcessingId(null);
    }
  };

  // Xử lý khi Admin bấm Từ chối tác phẩm
  const handleReject = async (subId: string) => {
    if (actionProcessingId) return;
    const finalReason = rejectReason.trim() || 'Chưa đạt tiêu chuẩn kiểm duyệt nội dung của Đạo Tâm';
    setActionProcessingId(subId);
    setErrorMessage(null);

    // Gỡ khỏi state lập tức để giao diện phản hồi tức thì
    const targetSub = (pendingNovels || []).find((n) => n.id === subId);
    setPendingNovels((prev) => (prev || []).filter((item) => item.id !== subId));
    setRejectingId(null);
    setRejectReason('');

    try {
      if (onRejectSubmission) {
        await onRejectSubmission(subId, finalReason);
      } else {
        await updateNovelSubmissionStatusInFirestore(subId, 'rejected', finalReason);
      }
    } catch (err: any) {
      console.error('Lỗi khi từ chối truyện:', err);
      setErrorMessage(`Lỗi từ chối tác phẩm: ${err?.message || 'Không thể cập nhật trạng thái lên hệ thống.'}`);
      if (targetSub) setPendingNovels((prev) => [targetSub, ...prev]);
    } finally {
      setActionProcessingId(null);
    }
  };

  // Xử lý khi Admin bấm Ẩn truyện
  const handleHide = async (subId: string) => {
    if (actionProcessingId) return;
    setActionProcessingId(subId);
    setErrorMessage(null);

    const targetSub = (pendingNovels || []).find((n) => n.id === subId);
    setPendingNovels((prev) => (prev || []).filter((item) => item.id !== subId));

    try {
      await updateNovelSubmissionStatusInFirestore(subId, 'hidden', 'BQT đã ẩn khỏi hàng đợi');
    } catch (err: any) {
      console.error('Lỗi khi ẩn truyện:', err);
      setErrorMessage(`Lỗi ẩn tác phẩm: ${err?.message || 'Không thể cập nhật trạng thái.'}`);
      if (targetSub) setPendingNovels((prev) => [targetSub, ...prev]);
    } finally {
      setActionProcessingId(null);
    }
  };

  // Xử lý khi Admin bấm Xóa vĩnh viễn document
  const handleDelete = async (subId: string, title: string) => {
    if (actionProcessingId) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn bản thảo truyện "${title}"? Thao tác này sẽ xóa dữ liệu khỏi hệ thống.`)) {
      return;
    }

    setActionProcessingId(subId);
    setErrorMessage(null);

    const targetSub = (pendingNovels || []).find((n) => n.id === subId);
    setPendingNovels((prev) => (prev || []).filter((item) => item.id !== subId));

    try {
      if (onDeleteSubmission) {
        await onDeleteSubmission(subId);
      } else {
        await deleteNovelSubmissionFromFirestore(subId);
      }
    } catch (err: any) {
      console.error('Lỗi khi xóa truyện:', err);
      setErrorMessage(`Lỗi xóa tác phẩm: ${err?.message || 'Không thể xóa dữ liệu trên hệ thống.'}`);
      if (targetSub) setPendingNovels((prev) => [targetSub, ...prev]);
    } finally {
      setActionProcessingId(null);
    }
  };

  // Mở modal đọc thẩm định 5 chương (chỉ tải text chương khi Admin bấm vào)
  const handleOpenPreview = async (sub: NovelSubmission) => {
    setPreviewNovel(sub);
    setPreviewIndex(0);
    setIsLoadingChapters(true);

    try {
      const chaps = await fetchSubmissionChaptersFromFirestore(sub.id);
      if (Array.isArray(chaps) && (chaps?.length || 0) > 0) {
        setPreviewChapters(chaps);
      } else if (Array.isArray(sub?.chapters) && (sub.chapters?.length || 0) > 0) {
        setPreviewChapters(sub.chapters);
      } else {
        setPreviewChapters([]);
      }
    } catch (err) {
      console.warn('Lỗi tải text chương preview:', err);
      setPreviewChapters(Array.isArray(sub?.chapters) ? sub.chapters : []);
    } finally {
      setIsLoadingChapters(false);
    }
  };

  return (
    <div className="space-y-4">
      
      {/* 1. THÔNG BÁO LỖI ĐƯỜNG TRUYỀN HOẶC PHÂN QUYỀN: BẮT BUỘC NỀN MÀU VÀNG (TUYỆT ĐỐI KHÔNG DÙNG MÀU ĐỎ) */}
      {errorMessage && (
        <div 
          role="alert"
          className="p-4 rounded-2xl bg-amber-100 border-2 border-amber-500 text-amber-950 font-bold shadow-sm flex items-start gap-3 animate-in fade-in duration-200"
        >
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wide text-amber-900">
              Thông báo trạng thái hệ thống:
            </h4>
            <p className="text-xs text-amber-900 font-medium mt-0.5 leading-relaxed">
              {errorMessage}
            </p>
          </div>
        </div>
      )}

      {/* Header thanh trạng thái kiểm duyệt */}
      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-pink-50/70 border border-pink-200 text-xs text-slate-700 shadow-2xs flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-bold text-slate-800">
            Danh sách Chờ Duyệt:
          </span>
          <span className="text-pink-700 font-semibold">
            Đọc theo yêu cầu • Tối ưu tốc độ tải
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadPendingSubmissions}
            disabled={isLoading}
            className="px-3 py-1 rounded-full bg-white hover:bg-pink-100 text-pink-700 border border-pink-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            title="Tải lại danh sách truyện chờ duyệt"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Tải lại</span>
          </button>
          <span className="px-3 py-1 rounded-full text-xs font-black bg-pink-600 text-white shadow-xs">
            {pendingNovels?.length || 0} truyện chờ duyệt
          </span>
        </div>
      </div>

      {/* Trạng thái tải dữ liệu lần đầu */}
      {isLoading && (
        <div className="py-12 text-center text-xs text-pink-600 flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-pink-100 shadow-2xs">
          <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold">Đang tải danh sách truyện chờ duyệt từ hệ thống...</span>
        </div>
      )}

      {/* Danh sách rỗng: Đã xử lý hết */}
      {!isLoading && (pendingNovels?.length || 0) === 0 && !errorMessage && (
        <div className="text-center py-14 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <p className="font-bold text-slate-800 text-sm sm:text-base">
            Không có truyện nào đang chờ duyệt
          </p>
          <p className="text-slate-500 text-xs max-w-md leading-relaxed">
            Tất cả các bản thảo gửi đến đã được thẩm định xong. Bất kỳ tác giả nào gửi truyện mới, dữ liệu sẽ tự động xuất hiện tại đây ngay lập tức.
          </p>
        </div>
      )}

      {/* Danh sách các tác phẩm chờ duyệt */}
      {!isLoading && (pendingNovels?.length || 0) > 0 && (
        <div className="space-y-4">
          {(pendingNovels || []).map((novel) => {
            const isProcessing = actionProcessingId === novel.id;
            return (
              <div
                key={novel.id}
                className={`p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-pink-300 transition-all flex flex-col md:flex-row gap-4 items-start ${
                  isProcessing ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                {/* Ảnh bìa */}
                <img
                  src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                  alt={novel.title}
                  className="w-20 h-28 object-cover rounded-xl border border-slate-200 flex-shrink-0 shadow-xs bg-slate-50"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80';
                  }}
                />

                {/* Thông tin Metadata cơ bản */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      {novel.title}
                    </h4>

                    {novel.isCreatorApplication && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200 flex items-center gap-1 shadow-2xs">
                        <Sparkles className="w-3 h-3 text-pink-600" />
                        Đơn Tác Giả Mới
                      </span>
                    )}

                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {novel.mainCategory}
                    </span>

                    {novel.isShortStory && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                        Truyện Ngắn
                      </span>
                    )}

                    {novel.isShortStory && novel.youtubeVideoId && (
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                          novel.isYoutubeVipLocked
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <Youtube className="w-3 h-3" />
                        {novel.isYoutubeVipLocked ? 'YouTube VIP' : 'YouTube FREE'}
                      </span>
                    )}

                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Chờ duyệt
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 leading-relaxed">
                    Tác giả / Bút danh: <strong className="text-pink-600 font-bold">{novel.author}</strong>
                    {novel.editor && <> • Editor: <strong className="text-pink-600 font-bold">{novel.editor}</strong></>}
                    {' '}• Người nộp: <span className="text-slate-800 font-medium">{novel.submittedBy?.userName} ({novel.submittedBy?.userEmail})</span>
                  </div>

                  {novel.bankInfo && novel.bankInfo.accountNumber && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 flex items-center gap-2 flex-wrap">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>
                        STK Nhuận Bút: <strong className="text-emerald-700 font-mono font-bold">{novel.bankInfo.accountNumber}</strong> ({novel.bankInfo.bankName}) • Chủ thẻ: <strong className="text-slate-900 uppercase font-bold">{novel.bankInfo.accountHolder}</strong>
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {novel.description}
                  </p>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <FileText className="w-3 h-3 text-amber-600" />
                      Bản thảo: {novel?.chapters?.length || 5} chương
                    </span>

                    {/* Nút Xem thẩm định 5 chương (Tải on-demand để tiết kiệm reads) */}
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(novel)}
                      className="px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-pink-600" />
                      Đọc Thẩm Định 5 Chương
                    </button>
                  </div>
                </div>

                {/* HÀNG NÚT THAO TÁC: GIỮ TONE MÀU HỒNG CHỦ ĐẠO CHO 'DUYỆT' / 'TỪ CHỐI' */}
                <div className="flex flex-col gap-2 w-full md:w-56 flex-shrink-0">
                  {/* Nút DUYỆT (Màu hồng chủ đạo sang trọng) */}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleApprove(novel)}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-700 hover:to-rose-600 shadow-sm shadow-pink-500/25 transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Duyệt &amp; Xuất Bản Ngay</span>
                  </button>

                  {/* Khối Từ Chối (Màu hồng nhẹ / viền hồng) */}
                  {rejectingId === novel.id ? (
                    <div className="p-3 bg-pink-50/70 border border-pink-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                      <label className="block text-[11px] font-bold text-pink-900">
                        Lý do từ chối bản thảo:
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Nhập lý do gửi về tài khoản tác giả..."
                        rows={2}
                        className="w-full p-2 text-xs border border-pink-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReject(novel.id)}
                          className="flex-1 py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition shadow-xs"
                        >
                          Xác nhận Từ Chối
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason('');
                          }}
                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold rounded-lg cursor-pointer transition"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setRejectingId(novel.id)}
                      className="w-full py-2 px-3 rounded-xl border border-pink-300 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5 text-pink-600" />
                      <span>Từ Chối Bản Thảo</span>
                    </button>
                  )}

                  {/* Nút Ẩn và Xóa */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleHide(novel.id)}
                      title="Ẩn truyện khỏi danh sách chờ"
                      className="py-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition disabled:opacity-50"
                    >
                      <EyeOff className="w-3 h-3 text-slate-500" />
                      <span>Ẩn</span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleDelete(novel.id, novel.title)}
                      title="Xóa vĩnh viễn khỏi hệ thống"
                      className="py-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-slate-600 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3 text-slate-400 group-hover:text-rose-500" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* MODAL ĐỌC THẨM ĐỊNH 5 CHƯƠNG BẢN THẢO */}
      {previewNovel && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
            {/* Header Preview */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-pink-600 uppercase tracking-wider">
                  Hội đồng thẩm định Đạo Tâm
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-pink-600" />
                  {previewNovel.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewNovel(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nội dung Preview */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              {isLoadingChapters ? (
                <div className="py-16 text-center text-xs text-pink-600 flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
                  <span>Đang tải nội dung 5 chương bản thảo thẩm định...</span>
                </div>
              ) : (previewChapters?.length || 0) === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Không tìm thấy nội dung chương đính kèm cho bản thảo này.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Thanh chọn số chương */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
                    {(previewChapters || []).map((ch, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPreviewIndex(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          previewIndex === idx
                            ? 'bg-pink-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-pink-50'
                        }`}
                      >
                        Chương {ch.number || idx + 1}
                      </button>
                    ))}
                  </div>

                  {/* Nội dung chương đang chọn */}
                  {previewChapters?.[previewIndex] && (
                    <div className="space-y-3">
                      <h4 className="text-sm sm:text-base font-bold text-slate-900">
                        {previewChapters[previewIndex]?.title || `Chương ${previewChapters[previewIndex]?.number}`}
                      </h4>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 leading-relaxed font-serif whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                        {previewChapters[previewIndex]?.content || 'Nội dung đang cập nhật...'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Preview với nút Duyệt & Từ chối nhanh */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPreviewNovel(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                Đóng
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const novelToApprove = previewNovel;
                    setPreviewNovel(null);
                    if (novelToApprove) handleApprove(novelToApprove);
                  }}
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Duyệt Tác Phẩm Này</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
