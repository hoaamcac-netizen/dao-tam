"use client";

import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  getDocs
} from "firebase/firestore";
import { db } from "@/src/firebase/config"; // hoặc cấu hình firebase client của dự án dao-tam
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Eye, 
  Trash2, 
  EyeOff, 
  Sparkles, 
  Building2, 
  FileText, 
  Clock, 
  BookOpen, 
  X 
} from "lucide-react";

/**
 * 2 Email Quản trị viên chính thức duy nhất được cấp quyền
 */
const AUTHORIZED_ADMIN_EMAILS = [
  "hoaamcac@gmail.com",
  "meoyeutien22@gmail.com",
];

export interface AdminNovelItem {
  id: string;
  title: string;
  author: string;
  editor?: string;
  mainCategory: string;
  categories: string[];
  description: string;
  coverImage: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  submittedAt: number;
  submittedBy?: {
    userId: string;
    userName: string;
    userEmail: string;
  };
  bankInfo?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  isCreatorApplication?: boolean;
}

export interface AdminPendingNovelsProps {
  currentUserEmail?: string | null;
  onApproveSuccess?: (novelId: string) => void;
}

/**
 * ==============================================================================
 * COMPONENT: HIỂN THỊ DANH SÁCH TRUYỆN CHỜ DUYỆT (NEXT.JS CLIENT COMPONENT)
 * 
 * ĐÁP ỨNG ĐẦY ĐỦ CÁC TIÊU CHUẨN KỸ THUẬT:
 * 1. Đồng bộ Real-time (onSnapshot): Thay thế getDocs(), chỉ lấy truyện có status == 'pending'
 * 2. Cập nhật tức thì: Khi admin A bấm Từ chối / Xóa / Ẩn, admin B tự động thấy truyện biến mất
 * 3. Tối ưu Quota Spark: BẮT BUỘC có hàm cleanup unsubscribe() trong useEffect, chỉ đọc metadata
 * 4. Phân quyền: Chỉ 2 email (hoaamcac@gmail.com, meoyeutien22@gmail.com) mới được mount onSnapshot
 * 5. Báo lỗi bằng Banner nền VÀNG (tuyệt đối không dùng màu đỏ). Nút thao tác giữ tone HỒNG chủ đạo
 * ==============================================================================
 */
export default function AdminPendingNovels({
  currentUserEmail,
  onApproveSuccess,
}: AdminPendingNovelsProps) {
  const [novels, setNovels] = useState<AdminNovelItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Trạng thái thao tác
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Preview 5 chương thẩm định (Chỉ tải text on-demand để tiết kiệm reads)
  const [previewNovel, setPreviewNovel] = useState<AdminNovelItem | null>(null);
  const [previewChapters, setPreviewChapters] = useState<any[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const cleanEmail = currentUserEmail?.toLowerCase().trim() || "";
  const isAuthorized = AUTHORIZED_ADMIN_EMAILS.includes(cleanEmail);

  useEffect(() => {
    // 1. KIỂM TRA BẢO MẬT: Chỉ 2 email admin được phép mount onSnapshot
    if (!isAuthorized) {
      setIsLoading(false);
      setWarningMessage(
        `Cảnh báo phân quyền: Tài khoản "${cleanEmail || "Khách"}" không được phép mount dữ liệu kiểm duyệt. Chỉ tài khoản Quản trị viên (${AUTHORIZED_ADMIN_EMAILS.join(", ")}) mới có quyền truy cập.`
      );
      return;
    }

    setWarningMessage(null);
    setIsLoading(true);

    try {
      // 2. QUERY CHỈ LẤY TRUYỆN STATUS == 'PENDING' & METADATA CƠ BẢN
      const colRef = collection(db, "novel_submissions");
      const q = query(
        colRef,
        where("status", "==", "pending"),
        orderBy("submittedAt", "desc")
      );

      // Bắt đầu lắng nghe thời gian thực onSnapshot
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: AdminNovelItem[] = (snapshot?.docs || []).map((d) => {
            const raw = (d.data() || {}) as Partial<AdminNovelItem>;
            return {
              ...(raw as AdminNovelItem),
              id: d.id,
              categories: Array.isArray(raw.categories) ? raw.categories : [],
            };
          });
          setNovels(list);
          setIsLoading(false);
          setWarningMessage(null);
        },
        (error) => {
          console.warn("[AdminPendingNovels] Lỗi Firestore onSnapshot:", error);
          // Thông báo lỗi bằng BANNER NỀN MÀU VÀNG (tuyệt đối không dùng màu đỏ)
          setWarningMessage(
            `Cảnh báo đường truyền Firebase: ${error.message || "Không thể đồng bộ thời gian thực. Vui lòng kiểm tra lại kết nối mạng."}`
          );
          setIsLoading(false);
        }
      );

      // 3. TỐI ƯU QUOTA ĐỌC (READS) CHO GÓI SPARK:
      // BẮT BUỘC hàm dọn dẹp (cleanup function) ngắt onSnapshot ngay khi component unmount
      return () => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      };
    } catch (err: any) {
      console.error("Lỗi khởi tạo onSnapshot:", err);
      setWarningMessage(
        `Cảnh báo hệ thống: ${err?.message || "Không thể khởi tạo bộ lắng nghe Firestore."}`
      );
      setIsLoading(false);
    }
  }, [cleanEmail, isAuthorized]);

  // THAO TÁC 1: DUYỆT TRUYỆN (Tone màu hồng chủ đạo)
  const handleApprove = async (novel: AdminNovelItem) => {
    if (processingId) return;
    setProcessingId(novel.id);
    setWarningMessage(null);

    // Cập nhật giao diện lập tức (Optimistic UI)
    setNovels((prev) => prev.filter((n) => n.id !== novel.id));

    try {
      // Cập nhật status trên Firestore thành 'approved'
      const docRef = doc(db, "novel_submissions", novel.id);
      await updateDoc(docRef, {
        status: "approved",
        approvedAt: Date.now(),
        approvedBy: cleanEmail,
      });

      if (onApproveSuccess) {
        onApproveSuccess(novel.id);
      }
    } catch (err: any) {
      console.error("Lỗi duyệt truyện:", err);
      setWarningMessage(
        `Cảnh báo duyệt thất bại: ${err?.message || "Không thể ghi nhận trạng thái lên máy chủ."}`
      );
      // Hoàn tác nếu có lỗi
      setNovels((prev) => [novel, ...prev]);
    } finally {
      setProcessingId(null);
    }
  };

  // THAO TÁC 2: TỪ CHỐI TRUYỆN
  const handleReject = async (novelId: string) => {
    if (processingId) return;
    const finalReason = rejectReason.trim() || "Chưa đạt tiêu chuẩn kiểm duyệt nội dung của Đạo Tâm";
    setProcessingId(novelId);
    setWarningMessage(null);

    const target = novels.find((n) => n.id === novelId);
    // Gỡ khỏi state lập tức để giao diện Admin phản hồi ngay
    setNovels((prev) => prev.filter((n) => n.id !== novelId));
    setRejectingId(null);
    setRejectReason("");

    try {
      const docRef = doc(db, "novel_submissions", novelId);
      await updateDoc(docRef, {
        status: "rejected",
        rejectionReason: finalReason,
        rejectedAt: Date.now(),
        rejectedBy: cleanEmail,
      });
    } catch (err: any) {
      console.error("Lỗi từ chối truyện:", err);
      setWarningMessage(
        `Cảnh báo từ chối thất bại: ${err?.message || "Không thể cập nhật Firestore."}`
      );
      if (target) setNovels((prev) => [target, ...prev]);
    } finally {
      setProcessingId(null);
    }
  };

  // THAO TÁC 3: ẨN TRUYỆN
  const handleHide = async (novelId: string) => {
    if (processingId) return;
    setProcessingId(novelId);
    setWarningMessage(null);

    const target = novels.find((n) => n.id === novelId);
    setNovels((prev) => prev.filter((n) => n.id !== novelId));

    try {
      const docRef = doc(db, "novel_submissions", novelId);
      await updateDoc(docRef, {
        status: "hidden",
        hiddenAt: Date.now(),
      });
    } catch (err: any) {
      console.error("Lỗi ẩn truyện:", err);
      setWarningMessage(
        `Cảnh báo ẩn truyện thất bại: ${err?.message || "Không thể cập nhật."}`
      );
      if (target) setNovels((prev) => [target, ...prev]);
    } finally {
      setProcessingId(null);
    }
  };

  // THAO TÁC 4: XÓA VĨNH VIỄN DOCUMENT
  const handleDelete = async (novelId: string, title: string) => {
    if (processingId) return;
    if (!window.confirm(`Xác nhận xóa vĩnh viễn bản thảo truyện "${title}" khỏi hệ thống?`)) {
      return;
    }

    setProcessingId(novelId);
    setWarningMessage(null);

    const target = novels.find((n) => n.id === novelId);
    setNovels((prev) => prev.filter((n) => n.id !== novelId));

    try {
      const docRef = doc(db, "novel_submissions", novelId);
      await deleteDoc(docRef);
    } catch (err: any) {
      console.error("Lỗi xóa truyện:", err);
      setWarningMessage(
        `Cảnh báo xóa thất bại: ${err?.message || "Không thể xóa document trên Firestore."}`
      );
      if (target) setNovels((prev) => [target, ...prev]);
    } finally {
      setProcessingId(null);
    }
  };

  // ĐỌC THẨM ĐỊNH 5 CHƯƠNG: Chỉ đọc nội dung khi mở xem thử (Tiết kiệm Spark reads)
  const handleOpenPreview = async (novel: AdminNovelItem) => {
    setPreviewNovel(novel);
    setPreviewIndex(0);
    setIsLoadingPreview(true);

    try {
      const snap = await getDocs(collection(db, "novel_submissions", novel.id, "chapters"));
      if (!snap.empty) {
        const chaps = (snap?.docs || []).map((d) => d.data() || {});
        chaps.sort((a, b) => Number(a?.number || 0) - Number(b?.number || 0));
        setPreviewChapters(chaps);
      } else {
        setPreviewChapters([]);
      }
    } catch (e) {
      console.warn("Lỗi tải chương:", e);
      setPreviewChapters([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* 1. THÔNG BÁO LỖI HOẶC PHÂN QUYỀN: BẮT BUỘC DÙNG BANNER NỀN MÀU VÀNG (KHÔNG DÙNG MÀU ĐỎ) */}
      {warningMessage && (
        <div 
          role="alert"
          className="p-4 rounded-2xl bg-amber-100 border-2 border-amber-500 text-amber-950 font-bold shadow-xs flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wide text-amber-900">
              Thông Báo Cảnh Báo Hệ Thống:
            </h4>
            <p className="text-xs text-amber-900 font-medium mt-0.5 leading-relaxed">
              {warningMessage}
            </p>
          </div>
        </div>
      )}

      {/* Header thanh kiểm duyệt */}
      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-pink-50/80 border border-pink-200 text-xs text-slate-700 shadow-2xs flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-slate-900">Kênh Realtime onSnapshot:</span>
          <span className="text-pink-700 font-semibold">
            Đồng bộ thời gian thực giữa các tài khoản Admin • Tự động ngắt kết nối khi rời trang
          </span>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-black bg-pink-600 text-white shadow-xs">
          {novels?.length || 0} truyện chờ duyệt
        </span>
      </div>

      {/* Trạng thái tải */}
      {isLoading && (
        <div className="py-14 text-center text-xs text-pink-600 flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-pink-100">
          <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold">Đang đồng bộ danh sách truyện chờ duyệt...</span>
        </div>
      )}

      {/* Danh sách rỗng */}
      {!isLoading && (novels?.length || 0) === 0 && !warningMessage && (
        <div className="text-center py-14 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <p className="font-bold text-slate-800 text-sm sm:text-base">
            Không có truyện nào đang chờ duyệt
          </p>
          <p className="text-slate-500 text-xs max-w-md">
            Mọi thao tác Từ chối / Xóa / Duyệt từ các Admin khác đã được đồng bộ tức thì.
          </p>
        </div>
      )}

      {/* Danh sách truyện chờ duyệt */}
      {!isLoading && (novels?.length || 0) > 0 && (
        <div className="space-y-4">
          {(novels || []).map((novel) => {
            const isProcessing = processingId === novel.id;
            return (
              <div
                key={novel.id}
                className={`p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-pink-300 transition-all flex flex-col md:flex-row gap-4 items-start ${
                  isProcessing ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <img
                  src={novel.coverImage || "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80"}
                  alt={novel.title}
                  className="w-20 h-28 object-cover rounded-xl border border-slate-200 flex-shrink-0 bg-slate-50 shadow-2xs"
                />

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      {novel.title}
                    </h4>
                    {novel.isCreatorApplication && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-pink-600" />
                        Đơn Tác Giả Mới
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {novel.mainCategory}
                    </span>
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Chờ duyệt
                    </span>
                  </div>

                  <div className="text-xs text-slate-600">
                    Bút danh: <strong className="text-pink-600 font-bold">{novel.author}</strong>
                    {novel.editor && <> • Editor: <strong className="text-pink-600 font-bold">{novel.editor}</strong></>}
                    {" "}• Tài khoản: <span className="text-slate-800 font-medium">{novel.submittedBy?.userName} ({novel.submittedBy?.userEmail})</span>
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

                {/* NÚT THAO TÁC: GIỮ TONE HỒNG CHỦ ĐẠO CHO 'DUYỆT' / 'TỪ CHỐI' */}
                <div className="flex flex-col gap-2 w-full md:w-56 flex-shrink-0">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleApprove(novel)}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-700 hover:to-rose-600 shadow-sm shadow-pink-500/25 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Duyệt &amp; Xuất Bản Ngay</span>
                  </button>

                  {rejectingId === novel.id ? (
                    <div className="p-3 bg-pink-50/70 border border-pink-200 rounded-xl space-y-2">
                      <label className="block text-[11px] font-bold text-pink-900">
                        Lý do từ chối:
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Nhập lý do gửi về tài khoản..."
                        rows={2}
                        className="w-full p-2 text-xs border border-pink-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReject(novel.id)}
                          className="flex-1 py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition"
                        >
                          Xác nhận
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason("");
                          }}
                          className="px-2.5 py-1.5 bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg cursor-pointer"
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
                      className="w-full py-2 px-3 rounded-xl border border-pink-300 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5 text-pink-600" />
                      <span>Từ Chối Bản Thảo</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleHide(novel.id)}
                      className="py-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <EyeOff className="w-3 h-3 text-slate-500" />
                      <span>Ẩn</span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleDelete(novel.id, novel.title)}
                      className="py-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-slate-600 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Modal Preview 5 Chương */}
      {previewNovel && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-pink-600 uppercase tracking-wider">
                  Thẩm định bản thảo
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-pink-600" />
                  {previewNovel.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewNovel(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              {isLoadingPreview ? (
                <div className="py-16 text-center text-xs text-pink-600 flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
                  <span>Đang tải 5 chương bản thảo...</span>
                </div>
              ) : (previewChapters?.length || 0) === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Không tìm thấy nội dung chương đính kèm.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
                    {(previewChapters || []).map((ch, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPreviewIndex(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                          previewIndex === idx
                            ? "bg-pink-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-pink-50"
                        }`}
                      >
                        Chương {ch.number || idx + 1}
                      </button>
                    ))}
                  </div>

                  {previewChapters[previewIndex] && (
                    <div className="space-y-3">
                      <h4 className="text-sm sm:text-base font-bold text-slate-900">
                        {previewChapters[previewIndex].title || `Chương ${previewChapters[previewIndex].number}`}
                      </h4>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 leading-relaxed font-serif whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                        {previewChapters[previewIndex].content || "Nội dung đang cập nhật..."}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPreviewNovel(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  const toApprove = previewNovel;
                  setPreviewNovel(null);
                  if (toApprove) handleApprove(toApprove);
                }}
                className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Duyệt Tác Phẩm Này</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
