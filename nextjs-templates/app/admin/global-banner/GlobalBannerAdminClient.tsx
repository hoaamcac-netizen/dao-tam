"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  Megaphone,
} from "lucide-react";
import Link from "next/link";
import AdminLayout, { type AdminTabKey } from "../AdminLayout";
import { auth, db } from "../../../lib/firebase";
import { checkIsAdmin } from "../../../lib/config";

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function GlobalBannerAdminClient() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [isActive, setIsActive] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "warning";
    text: string;
  } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setCurrentUser(fbUser);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const isAuthorizedAdmin = Boolean(
    currentUser?.email && checkIsAdmin(currentUser.email)
  );

  // Chỉ gọi getDoc 1 lần khi Admin hợp lệ mở trang quản trị (KHÔNG dùng onSnapshot)
  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    let mounted = true;
    setIsLoadingDoc(true);
    setFeedback(null);

    getDoc(doc(db, "settings", "global_banner"))
      .then((snap) => {
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data();
          setIsActive(Boolean(data?.isActive));
          setMessage(typeof data?.message === "string" ? data.message : "");
          setUpdatedAt(
            typeof data?.updatedAt?.toMillis === "function"
              ? data.updatedAt.toMillis()
              : typeof data?.updatedAt === "number"
              ? data.updatedAt
              : null
          );
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setFeedback({
          type: "warning",
          text: `Không thể tải cấu hình Thông Báo Toàn Trang: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      })
      .finally(() => {
        if (mounted) setIsLoadingDoc(false);
      });

    return () => {
      mounted = false;
    };
  }, [isAuthorizedAdmin]);

  const handleSelectTab = (tab: AdminTabKey) => {
    if (tab === "requests") router.push("/admin/requests");
    else if (tab === "users") router.push("/admin/users");
    else if (tab === "messages") router.push("/admin/messages");
    else if (tab === "support_chat") router.push("/admin/support-chat");
    else if (tab === "comments") router.push("/admin/comments");
    else if (tab === "global_banner") router.push("/admin/global-banner");
    else router.push("/admin");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedAdmin || isSaving) return;

    setIsSaving(true);
    setFeedback(null);

    const trimmedMessage = message.trim().slice(0, 2000);
    const path = "settings/global_banner";

    try {
      await setDoc(
        doc(db, "settings", "global_banner"),
        {
          isActive: Boolean(isActive),
          message: trimmedMessage,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setMessage(trimmedMessage);
      setUpdatedAt(Date.now());
      setFeedback({
        type: "success",
        text: isActive
          ? "Đã lưu và BẬT Thông Báo Toàn Trang (ghi 1 lần duy nhất vào settings/global_banner)."
          : "Đã lưu và TẮT Thông Báo Toàn Trang (banner sẽ ẩn hoàn toàn trên Trang Chủ).",
      });
    } catch (error: any) {
      let msg = error?.message || "Không thể lưu Thông Báo Toàn Trang.";
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch (wrapped: any) {
        try {
          const parsed = JSON.parse(wrapped.message);
          if (parsed?.error) msg = parsed.error;
        } catch {}
      }
      setFeedback({
        type: "warning",
        text: `Cảnh báo lỗi Firestore: ${msg}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout
      activeTab="global_banner"
      onSelectTab={handleSelectTab}
      adminName={currentUser?.displayName || currentUser?.email || "BQT Đạo Tâm"}
    >
      <div className="max-w-3xl mx-auto space-y-5">
        {isAuthLoading ? (
          <div className="p-10 rounded-2xl bg-white border border-pink-100 flex flex-col items-center justify-center gap-3 shadow-xs">
            <Loader2 className="w-6 h-6 text-pink-600 animate-spin" />
            <span className="text-xs font-semibold text-slate-600">
              Đang xác thực quyền Quản Trị Viên...
            </span>
          </div>
        ) : !isAuthorizedAdmin ? (
          <div className="p-6 sm:p-8 rounded-2xl bg-yellow-50 border border-amber-300 text-amber-950 space-y-3 shadow-xs">
            <div className="flex items-center gap-2.5 font-black text-base">
              <Lock className="w-5 h-5 text-amber-700 shrink-0" />
              <span>Quyền Truy Cập Bị Từ Chối</span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed">
              Mục <strong>12. Thông Báo Toàn Trang</strong> chỉ cho phép truy cập và thao tác khi đăng nhập bằng{" "}
              <strong>hoaamcac@gmail.com</strong> hoặc{" "}
              <strong>meoyeutien22@gmail.com</strong>.
            </p>
            <div>
              <Link
                href="/"
                className="inline-flex items-center px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition"
              >
                Về Trang Chủ
              </Link>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl border border-pink-100 shadow-xs p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-100 border border-yellow-300 flex items-center justify-center text-amber-900 shrink-0">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-slate-900">
                    12. Thông Báo Toàn Trang
                  </h2>
                  <p className="text-xs text-slate-500">
                    Document duy nhất:{" "}
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                      settings/global_banner
                    </code>
                  </p>
                </div>
              </div>

              {/* Nút Toggle Bật / Tắt */}
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive((prev) => !prev)}
                className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition cursor-pointer self-start sm:self-auto ${
                  isActive
                    ? "bg-yellow-100 border-yellow-400 text-amber-950 shadow-2xs"
                    : "bg-slate-100 border-slate-200 text-slate-600"
                }`}
              >
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    isActive ? "bg-amber-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      isActive ? "translate-x-4.5" : "translate-x-1"
                    }`}
                  />
                </span>
                <span>{isActive ? "BẬT hiển thị" : "TẮT (Ẩn hoàn toàn)"}</span>
              </button>
            </div>

            {feedback && (
              <div
                className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                  feedback.type === "success"
                    ? "bg-pink-50 border-pink-200 text-pink-800"
                    : "bg-yellow-50 border-amber-300 text-amber-950"
                }`}
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-pink-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            {isLoadingDoc ? (
              <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-pink-600" />
                <span>Đang tải cấu hình Thông Báo Toàn Trang...</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="nextjs-global-banner-textarea"
                      className="text-xs font-bold text-slate-700"
                    >
                      Nội dung thông báo toàn trang (hiển thị ngay trên Thanh Tìm Kiếm):
                    </label>
                    <span className="text-[11px] font-medium text-slate-400">
                      {message?.length || 0}/2000 ký tự
                    </span>
                  </div>
                  <textarea
                    id="nextjs-global-banner-textarea"
                    rows={4}
                    maxLength={2000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Nhập nội dung thông báo gửi tới toàn bộ độc giả..."
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-pink-500 focus:outline-none transition leading-relaxed"
                  />
                </div>

                {/* Live Preview nền vàng */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Xem trước trên Trang Chủ:
                  </span>
                  {isActive && message.trim() ? (
                    <div className="w-full rounded-2xl bg-gradient-to-r from-yellow-100 via-amber-100 to-yellow-100 border border-yellow-400/90 px-3.5 py-2.5 sm:px-5 sm:py-3.5 shadow-2xs">
                      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-yellow-400 text-amber-950 flex items-center justify-center shrink-0">
                          <Megaphone className="w-4 h-4" />
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-amber-950 leading-relaxed whitespace-pre-line break-words">
                          {message.trim()}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500">
                      Banner đang tắt hoặc nội dung trống — Trang Chủ sẽ trả về{" "}
                      <code>null</code> (ẩn hoàn toàn).
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-500">
                    {updatedAt
                      ? `Cập nhật gần nhất: ${new Date(updatedAt).toLocaleString("vi-VN")}`
                      : "Chưa có lịch sử cập nhật"}
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 transition"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Lưu Thông Báo Toàn Trang</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
