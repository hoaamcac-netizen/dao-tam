'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, storage } from '../lib/firebase';
import { checkIsAdmin } from '../lib/config';
import {
  MessageSquare,
  X,
  Send,
  ShieldCheck,
  Loader2,
  LogIn,
  Camera,
  AlertCircle,
} from 'lucide-react';

export interface LiveChatMessage {
  id: string;
  text: string;
  imageUrl?: string;
  createdAt: number;
  senderType: 'user' | 'admin';
  senderName: string;
  uid?: string;
}

interface ClientLiveChatProps {
  currentUser?: {
    id: string;
    displayName: string;
    email?: string;
    avatarUrl?: string;
    isLoggedIn?: boolean;
  } | null;
  onOpenLogin?: () => void;
  loginHref?: string;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const ADMIN_ONLINE_NOTICE =
  'Thời gian ad online: 8-11h30h sáng, 13h30 - 16h30 chiều, còn lại là thời gian nghỉ, lâu lâu sẽ vào check tin nhắn và trả lời, off hẳn vào lúc 22h đêm. Các bạn cứ để lại lời nhắn, ad online sẽ đọc và xử lý.';

export default function ClientLiveChat({
  currentUser,
  onOpenLogin,
  loginHref = '/login',
}: ClientLiveChatProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [unreadAdminCount, setUnreadAdminCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const sendingRef = useRef(false);
  const resettingUnreadRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Chống Hydration Mismatch & theo dõi Firebase Auth (luôn cleanup unsubscribe)
  useEffect(() => {
    setIsMounted(true);
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setAuthUser(usr);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const userEmail = authUser?.email || currentUser?.email || '';
  const isAdminUser = checkIsAdmin(userEmail);

  const loggedInUid =
    authUser?.uid ||
    (currentUser?.id && currentUser.id !== 'guest' && currentUser?.isLoggedIn
      ? currentUser.id
      : null);
  const isLoggedIn = Boolean(loggedInUid);

  const userDisplayName =
    authUser?.displayName ||
    currentUser?.displayName ||
    userEmail.split('@')[0] ||
    'Độc giả Đạo Tâm';
  const userAvatar = authUser?.photoURL || currentUser?.avatarUrl || '';

  // 2A. ĐỒNG BỘ ĐA THIẾT BỊ & TỐI ƯU READ:
  // CHỈ lắng nghe document metadata nhẹ support_chats/{uid} (KHÔNG lắng nghe users/{uid}) để lấy unreadAdminCount
  useEffect(() => {
    if (!isMounted || !loggedInUid || isAdminUser) {
      setUnreadAdminCount(0);
      resettingUnreadRef.current = false;
      return;
    }

    const metaDocRef = doc(db, 'support_chats', loggedInUid);
    const unsubscribe = onSnapshot(
      metaDocRef,
      (snap) => {
        if (!snap.exists()) {
          setUnreadAdminCount(0);
          resettingUnreadRef.current = false;
          return;
        }
        const data = snap.data();
        const nextUnread = Number(data?.unreadAdminCount || 0);
        setUnreadAdminCount(nextUnread > 0 ? nextUnread : 0);
        if (nextUnread <= 0) {
          resettingUnreadRef.current = false;
        }
      },
      (error) => {
        console.warn('[ClientLiveChat] Lỗi lắng nghe metadata unreadAdminCount:', error);
      }
    );

    return () => unsubscribe();
  }, [isMounted, loggedInUid, isAdminUser]);

  // 2B. CHẶN ĐỨNG LƯỢT GHI DƯ THỪA (Guard Condition):
  // CHỈ gọi updateDoc đưa unreadAdminCount về 0 KHI VÀ CHỈ KHI unreadAdminCount > 0
  const clearUnreadAdminCountIfNeeded = useCallback(
    async (currentUnread: number) => {
      if (
        !loggedInUid ||
        isAdminUser ||
        currentUnread <= 0 ||
        resettingUnreadRef.current
      ) {
        return;
      }

      resettingUnreadRef.current = true;
      try {
        await updateDoc(doc(db, 'support_chats', loggedInUid), {
          unreadAdminCount: 0,
        });
      } catch (error) {
        resettingUnreadRef.current = false;
        console.warn('[ClientLiveChat] Lỗi reset unreadAdminCount:', error);
      }
    },
    [loggedInUid, isAdminUser]
  );

  // Tự động đưa unreadAdminCount về 0 nếu khung chat đang mở và có tin nhắn mới từ Admin (Debounce 350ms)
  useEffect(() => {
    if (!isMounted || !isOpen || !loggedInUid || isAdminUser || unreadAdminCount <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      clearUnreadAdminCountIfNeeded(unreadAdminCount);
    }, 350);
    return () => clearTimeout(timer);
  }, [
    isMounted,
    isOpen,
    loggedInUid,
    isAdminUser,
    unreadAdminCount,
    clearUnreadAdminCountIfNeeded,
  ]);

  // 3. TỐI ƯU LƯỢT ĐỌC TIN NHẮN:
  // CHỈ bật onSnapshot load tin nhắn KHI VÀ CHỈ KHI khung chat thực sự được mở (isOpen === true).
  // Khi đóng khung chat -> lập tức hủy listener tin nhắn để tiết kiệm 100% lượt Read chạy ngầm.
  useEffect(() => {
    if (!isMounted || !isOpen || !loggedInUid || isAdminUser) {
      setIsLoadingMessages(false);
      return;
    }

    setIsLoadingMessages(true);
    const messagesQuery = query(
      collection(db, 'support_chats', loggedInUid, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const fetched: LiveChatMessage[] = (snapshot?.docs || [])
          .map((docSnap) => {
            const data = docSnap.data() || {};
            const isAdminSender = data.senderType === 'admin' || Boolean(data.isAdmin);
            return {
              id: docSnap.id,
              text: String(data.text || ''),
              imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
              createdAt: Number(data.createdAt || Date.now()),
              senderType: isAdminSender ? ('admin' as const) : ('user' as const),
              senderName: isAdminSender
                ? 'Admin'
                : String(data.senderName || data.displayName || 'Bạn'),
              uid: data.uid ? String(data.uid) : undefined,
            };
          })
          .reverse();

        setMessages(Array.isArray(fetched) ? fetched : []);
        setIsLoadingMessages(false);
      },
      (error) => {
        console.warn('[ClientLiveChat] Lỗi lắng nghe lịch sử tin nhắn:', error);
        setIsLoadingMessages(false);
      }
    );

    return () => unsubscribe();
  }, [isMounted, isOpen, loggedInUid, isAdminUser]);

  // Xóa state tin nhắn cục bộ khi đăng xuất
  useEffect(() => {
    if (!loggedInUid) {
      setMessages([]);
      setUnreadAdminCount(0);
      setPendingImageUrl(null);
      setUploadError(null);
      resettingUnreadRef.current = false;
    }
  }, [loggedInUid]);

  // Tự động cuộn xuống tin nhắn mới nhất khi mở hoặc có tin nhắn mới
  useEffect(() => {
    if (isOpen && isLoggedIn) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoggedIn]);

  const handleOpenChat = () => {
    setIsOpen(true);
    // Guard Condition: Chỉ gọi updateDoc lên Firestore nếu unreadAdminCount > 0
    if (unreadAdminCount > 0) {
      clearUnreadAdminCountIfNeeded(unreadAdminCount);
    }
    if (isLoggedIn) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
    }
  };

  const handleNavigateLogin = () => {
    setIsOpen(false);
    if (onOpenLogin) {
      onOpenLogin();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.assign(loginHref);
    }
  };

  // Kiểm duyệt định dạng (.jpg/.jpeg/.png/.webp) & dung lượng (<= 2MB) trước khi upload lên Storage
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !loggedInUid || isUploadingImage || isSending) return;

    setUploadError(null);

    const hasValidMime = ALLOWED_MIME_TYPES.has(file.type.toLowerCase());
    const hasValidExt = ALLOWED_EXTENSIONS.test(file.name || '');

    if (!hasValidMime || !hasValidExt) {
      setUploadError('Định dạng không hợp lệ! Chỉ chấp nhận ảnh .jpg, .jpeg, .png hoặc .webp.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError('Ảnh vượt quá dung lượng tối đa 2MB. Vui lòng chọn ảnh nhẹ hơn.');
      return;
    }

    setIsUploadingImage(true);
    try {
      const safeName = (file.name || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(
        storage,
        `support_chat_images/${loggedInUid}/${Date.now()}_${safeName}`
      );
      await uploadBytes(storageRef, file, {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000',
      });
      const downloadUrl = await getDownloadURL(storageRef);
      setPendingImageUrl(downloadUrl);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } catch (err) {
      console.error('[ClientLiveChat] Lỗi tải ảnh lên Storage:', err);
      setUploadError('Không thể tải ảnh lên. Vui lòng thử lại sau.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // 3. Gửi tin nhắn + ảnh dùng writeBatch (không tốn lượt Read onSnapshot)
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    const imageUrl = pendingImageUrl;

    if (
      (!text && !imageUrl) ||
      !loggedInUid ||
      isUploadingImage ||
      isSending ||
      sendingRef.current
    ) {
      return;
    }

    sendingRef.current = true;
    setIsSending(true);
    setUploadError(null);
    const now = Date.now();

    try {
      const batch = writeBatch(db);
      const chatDocRef = doc(db, 'support_chats', loggedInUid);
      const newMsgRef = doc(collection(db, 'support_chats', loggedInUid, 'messages'));

      batch.set(newMsgRef, {
        uid: loggedInUid,
        text,
        ...(imageUrl ? { imageUrl } : {}),
        createdAt: now,
        senderType: 'user',
        senderName: userDisplayName,
      });

      batch.set(
        chatDocRef,
        {
          lastMessage: text || '[Hình ảnh]',
          lastMessageTime: now,
          userName: userDisplayName,
          userEmail,
          unreadCount: increment(1),
          ...(userAvatar ? { userAvatar } : {}),
        },
        { merge: true }
      );

      await batch.commit();

      setInputText('');
      setPendingImageUrl(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } catch (error) {
      console.error('[ClientLiveChat] Lỗi gửi tin nhắn:', error);
      setUploadError('Gửi tin nhắn thất bại. Vui lòng thử lại.');
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const isBusy = isUploadingImage || isSending;

  // 4. CHỐNG HYDRATION & PHÂN QUYỀN ADMIN
  if (!isMounted || !isAuthReady || isAdminUser) {
    return null;
  }

  return (
    <>
      {/* Nút mở chat lơ lửng góc phải dưới (Tone hồng chủ đạo + Bóng số Realtime đa thiết bị) */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleOpenChat}
          aria-label="Mở khung chat hỗ trợ Admin"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[45] bg-pink-600 hover:bg-pink-700 text-white px-4 py-3 rounded-full shadow-xl shadow-pink-600/35 flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer border border-pink-400/40"
        >
          <span className="relative flex items-center justify-center">
            <MessageSquare className="w-5 h-5 fill-current" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-pink-600 animate-pulse" />
          </span>
          <span className="text-xs font-bold whitespace-nowrap">
            Hỗ trợ trực tuyến
          </span>
          {unreadAdminCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center leading-none ring-2 ring-white dark:ring-slate-950 shadow-md">
              {unreadAdminCount > 99 ? '99+' : unreadAdminCount}
            </span>
          )}
        </button>
      )}

      {/* Hộp chat Responsive: Mobile full màn hình, PC góc phải dưới */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Hỗ trợ trực tuyến Đạo Tâm"
          className="fixed inset-0 z-50 w-full h-[100dvh] md:inset-auto md:bottom-6 md:right-6 md:w-80 lg:w-96 md:h-[520px] flex flex-col bg-white dark:bg-slate-900 md:rounded-2xl shadow-2xl border border-pink-100 dark:border-pink-950/80 overflow-hidden"
        >
          {/* Header màu hồng + Nút X đóng */}
          <div className="bg-pink-600 text-white px-4 py-3.5 flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">
                  Hỗ Trợ Trực Tuyến
                </h3>
                <p className="text-[11px] text-pink-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                  <span>Admin sẵn sàng hỗ trợ</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Đóng khung chat"
                className="w-10 h-10 md:w-9 md:h-9 -mr-1 rounded-xl bg-white/20 hover:bg-white/30 active:scale-90 text-white flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {!isLoggedIn ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-pink-50/40 dark:bg-slate-900/95 space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-pink-100 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 flex items-center justify-center shadow-sm">
                <LogIn className="w-8 h-8" />
              </div>
              <div className="space-y-2 max-w-xs">
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  Vui lòng đăng nhập
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Bạn cần đăng nhập tài khoản để nhắn tin 1-1 và gửi ảnh hỗ trợ trực tiếp cho Admin.
                </p>
              </div>

              {onOpenLogin ? (
                <button
                  type="button"
                  onClick={handleNavigateLogin}
                  className="w-full max-w-xs py-3.5 px-5 rounded-xl bg-pink-600 hover:bg-pink-700 active:scale-[0.99] text-white text-sm font-bold shadow-lg shadow-pink-600/25 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <LogIn className="w-5 h-5" />
                  <span>Đăng nhập ngay</span>
                </button>
              ) : (
                <Link
                  href={loginHref}
                  onClick={() => setIsOpen(false)}
                  className="w-full max-w-xs py-3.5 px-5 rounded-xl bg-pink-600 hover:bg-pink-700 active:scale-[0.99] text-white text-sm font-bold shadow-lg shadow-pink-600/25 flex items-center justify-center gap-2 transition"
                >
                  <LogIn className="w-5 h-5" />
                  <span>Đăng nhập ngay</span>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3 bg-pink-50/30 dark:bg-slate-900/95 text-xs">
                <div className="flex items-start gap-2 max-w-[90%]">
                  <div className="w-7 h-7 rounded-full bg-pink-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                    AD
                  </div>
                  <div className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-2xl rounded-tl-xs px-3.5 py-2.5 shadow-xs border border-pink-100 dark:border-slate-700 leading-relaxed">
                    <span className="block font-bold text-[10px] text-pink-600 dark:text-pink-400 mb-0.5">
                      Admin
                    </span>
                    Xin chào <strong>{userDisplayName}</strong>! Bạn cần hỗ trợ vấn đề gì? Hãy gửi tin nhắn hoặc ảnh chụp bên dưới nhé.
                  </div>
                </div>

                {isLoadingMessages && (messages?.length || 0) === 0 && (
                  <div className="flex items-center justify-center py-4 text-slate-400 gap-2 text-[11px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-500" />
                    <span>Đang tải lịch sử trò chuyện...</span>
                  </div>
                )}

                {(messages || []).map((msg) => {
                  const isAdminMsg = msg.senderType === 'admin';
                  const isMe = !isAdminMsg;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl leading-relaxed text-xs break-words shadow-xs space-y-1.5 ${
                          isMe
                            ? 'bg-pink-600 text-white rounded-br-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-pink-100 dark:border-slate-700'
                        }`}
                      >
                        {isAdminMsg && (
                          <span className="flex items-center gap-1 font-bold text-[10px] text-pink-600 dark:text-pink-400">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Admin</span>
                          </span>
                        )}
                        {msg.imageUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewImageUrl(msg.imageUrl!)}
                            className="block rounded-xl overflow-hidden border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-400 cursor-zoom-in"
                            title="Nhấn để phóng to ảnh"
                          >
                            <img
                              src={msg.imageUrl}
                              alt="Ảnh đính kèm hỗ trợ"
                              className="max-w-[210px] max-h-[210px] w-auto h-auto object-cover"
                            />
                          </button>
                        )}
                        {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">
                        {new Date(msg.createdAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {uploadError && (
                <div
                  role="alert"
                  className="mx-3 mt-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-medium flex items-center justify-between gap-2 shrink-0"
                >
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploadError(null)}
                    aria-label="Đóng thông báo lỗi"
                    className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {pendingImageUrl && (
                <div className="px-3 pt-2 bg-white dark:bg-slate-900 border-t border-pink-100/70 dark:border-slate-800 flex items-center gap-2 shrink-0">
                  <div className="relative inline-block">
                    <img
                      src={pendingImageUrl}
                      alt="Ảnh sắp gửi"
                      className="w-14 h-14 rounded-xl object-cover border border-pink-200 dark:border-pink-800"
                    />
                    <button
                      type="button"
                      onClick={() => setPendingImageUrl(null)}
                      aria-label="Xóa ảnh đính kèm"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-sm hover:bg-rose-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Ảnh đã sẵn sàng gửi kèm tin nhắn
                  </span>
                </div>
              )}

              {/* Thông báo giờ làm việc của Admin (chữ nhỏ, in nghiêng, màu nhạt ngay trên ô nhập tin nhắn) */}
              <div className="px-3.5 py-2 bg-pink-50/40 dark:bg-slate-900/90 border-t border-pink-100/80 dark:border-slate-800 shrink-0">
                <p className="text-[11px] italic leading-relaxed text-slate-400 dark:text-slate-500">
                  {ADMIN_ONLINE_NOTICE}
                </p>
              </div>

              {/* Thanh nhập liệu + nút đính kèm ảnh */}
              <form
                onSubmit={handleSendMessage}
                className="sticky bottom-0 p-3 bg-white dark:bg-slate-900 border-t border-pink-100 dark:border-slate-800 shrink-0 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  aria-label="Gửi hình ảnh (.jpg, .png, .webp, tối đa 2MB)"
                  title="Đính kèm ảnh (tối đa 2MB)"
                  className="p-2.5 rounded-xl bg-pink-50 dark:bg-slate-800 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-slate-700 border border-pink-200/80 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
                >
                  {isUploadingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={isSending}
                  placeholder="Nhập tin nhắn gửi Admin..."
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm md:text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 border border-transparent dark:border-slate-700 disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={isBusy || (!inputText.trim() && !pendingImageUrl)}
                  aria-label="Gửi tin nhắn"
                  className="px-3.5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 shadow-md shadow-pink-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang tải...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Gửi</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Modal phóng to ảnh nội bộ */}
      {previewImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setPreviewImageUrl(null)}
            aria-label="Đóng xem ảnh"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewImageUrl}
            alt="Xem ảnh phóng to"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
