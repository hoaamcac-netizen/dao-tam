import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  writeBatch,
  updateDoc,
  deleteDoc,
  increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, storage, checkIsAdmin } from '../firebase/config';
import {
  MessageSquare,
  ShieldCheck,
  ArrowLeft,
  Send,
  Search,
  Trash2,
  AlertCircle,
  X,
  Loader2,
  Camera,
} from 'lucide-react';
import { UserProfile } from '../types';

export interface SupportChatMessage {
  id: string;
  text: string;
  imageUrl?: string;
  createdAt: number;
  senderType: 'user' | 'admin';
  senderName: string;
}

export interface SupportChatSession {
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
}

interface AdminChatDashboardProps {
  currentUser?: UserProfile | null;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export const AdminChatDashboard: React.FC<AdminChatDashboardProps> = ({
  currentUser: propUser,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [sessions, setSessions] = useState<SupportChatSession[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sendingRef = useRef(false);
  const clearingUnreadChatRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setAuthUser(usr);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const currentEmail = authUser?.email || propUser?.email || '';
  const isAuthorizedAdmin = checkIsAdmin(currentEmail);

  useEffect(() => {
    if (!isMounted || !isAuthorizedAdmin) return;

    const sessionsQuery = query(collection(db, 'support_chats'), limit(30));

    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snap) => {
        const list: SupportChatSession[] = (snap?.docs || []).map((d) => {
          const data = d.data() || {};
          const time = Number(data.lastMessageTime || data.updatedAt || 0);
          const unread =
            typeof data.unreadCount === 'number'
              ? data.unreadCount
              : data.unreadByAdmin
              ? 1
              : 0;
          return {
            userId: d.id,
            userName: String(data.userName || data.displayName || 'Độc giả Đạo Tâm'),
            userEmail: String(data.userEmail || data.email || ''),
            userAvatar: data.userAvatar ? String(data.userAvatar) : undefined,
            lastMessage: String(data.lastMessage || ''),
            lastMessageTime: time,
            unreadCount: unread,
          };
        });

        list.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        setSessions(Array.isArray(list) ? list : []);
      },
      (err) => {
        console.warn('[AdminChatDashboard] Lỗi lắng nghe support_chats:', err);
      }
    );

    return () => unsubscribe();
  }, [isMounted, isAuthorizedAdmin]);

  const activeSession =
    (sessions || []).find((s) => s.userId === selectedChatId) || null;

  useEffect(() => {
    if (!isMounted || !isAuthorizedAdmin || !selectedChatId) {
      setMessages([]);
      return;
    }

    setPendingImageUrl(null);
    setUploadError(null);

    const msgQuery = query(
      collection(db, 'support_chats', selectedChatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(
      msgQuery,
      (snap) => {
        const loaded: SupportChatMessage[] = (snap?.docs || [])
          .map((d) => {
            const data = d.data() || {};
            const isAdminSender =
              data.senderType === 'admin' || Boolean(data.isAdmin);
            return {
              id: d.id,
              text: String(data.text || ''),
              imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
              createdAt: Number(data.createdAt || Date.now()),
              senderType: isAdminSender ? ('admin' as const) : ('user' as const),
              senderName: isAdminSender
                ? 'Admin'
                : String(data.senderName || data.displayName || 'Độc giả'),
            };
          })
          .reverse();

        setMessages(Array.isArray(loaded) ? loaded : []);
      },
      (err) => {
        console.warn('[AdminChatDashboard] Lỗi lắng nghe messages:', err);
      }
    );

    return () => unsubscribe();
  }, [isMounted, isAuthorizedAdmin, selectedChatId]);

  useEffect(() => {
    if (!selectedChatId || !activeSession || activeSession.unreadCount <= 0) {
      if (!activeSession || activeSession.unreadCount <= 0) {
        clearingUnreadChatRef.current = null;
      }
      return;
    }

    if (clearingUnreadChatRef.current === selectedChatId) {
      return;
    }

    const timer = setTimeout(() => {
      clearingUnreadChatRef.current = selectedChatId;
      updateDoc(doc(db, 'support_chats', selectedChatId), {
        unreadCount: 0,
      }).catch(() => {
        clearingUnreadChatRef.current = null;
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [selectedChatId, activeSession?.unreadCount]);

  useEffect(() => {
    if (selectedChatId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages?.length, selectedChatId]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (
      !file ||
      !selectedChatId ||
      !isAuthorizedAdmin ||
      isUploadingImage ||
      isSending
    ) {
      return;
    }

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
        `support_chat_images/${selectedChatId}/${Date.now()}_${safeName}`
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
      console.error('[AdminChatDashboard] Lỗi upload ảnh lên Storage:', err);
      setUploadError('Không thể tải ảnh lên. Vui lòng thử lại sau.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Bảo mật danh tính Admin: TUYỆT ĐỐI KHÔNG lưu email hay tên thật
  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = replyText.trim();
    const imageUrl = pendingImageUrl;

    if (
      (!text && !imageUrl) ||
      !selectedChatId ||
      !isAuthorizedAdmin ||
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
      const chatDocRef = doc(db, 'support_chats', selectedChatId);
      const newMsgRef = doc(
        collection(db, 'support_chats', selectedChatId, 'messages')
      );

      batch.set(newMsgRef, {
        text,
        ...(imageUrl ? { imageUrl } : {}),
        createdAt: now,
        senderType: 'admin',
        senderName: 'Admin',
      });

      batch.set(
        chatDocRef,
        {
          lastMessage: text || '[Hình ảnh]',
          lastMessageTime: now,
          unreadCount: 0,
          unreadAdminCount: increment(1),
        },
        { merge: true }
      );

      await batch.commit();

      setReplyText('');
      setPendingImageUrl(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } catch (err) {
      console.error('[AdminChatDashboard] Lỗi gửi phản hồi:', err);
      setUploadError('Gửi phản hồi thất bại. Vui lòng thử lại.');
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const handleConfirmDelete = async (userId: string) => {
    try {
      await deleteDoc(doc(db, 'support_chats', userId));
      setConfirmDeleteId(null);
      if (selectedChatId === userId) {
        setSelectedChatId(null);
      }
    } catch (err) {
      console.error('[AdminChatDashboard] Lỗi xóa phiên chat:', err);
    }
  };

  const filteredSessions = (sessions || []).filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s?.userName || '').toLowerCase().includes(q) ||
      (s?.userEmail || '').toLowerCase().includes(q) ||
      (s?.lastMessage || '').toLowerCase().includes(q)
    );
  });

  const isBusy = isUploadingImage || isSending;

  if (!isMounted) {
    return null;
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 space-y-3">
        <Loader2 className="w-8 h-8 text-pink-600 animate-spin" />
        <p className="text-xs font-semibold text-slate-500">
          Đang kiểm tra phân quyền Quản trị viên...
        </p>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="max-w-md mx-auto p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Quyền Truy Cập Bị Giới Hạn
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Khu vực Live Chat hỗ trợ chỉ dành riêng cho tài khoản Quản trị viên được cấp phép.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="w-full h-[650px] max-h-[80vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-pink-100 dark:border-pink-950/70 shadow-sm overflow-hidden">
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* CỘT TRÁI: Danh sách khách */}
          <div
            className={`w-full md:w-80 lg:w-96 flex flex-col min-h-0 border-r border-pink-100 dark:border-pink-950/60 bg-slate-50/50 dark:bg-slate-900 ${
              selectedChatId ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="p-3.5 border-b border-pink-100 dark:border-pink-950/60 bg-white dark:bg-slate-900 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-pink-600" />
                  <span>Hỗ Trợ Độc Giả ({sessions?.length || 0})</span>
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300 text-[10px] font-bold">
                  1-1 Live
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên, email hoặc tin nhắn..."
                  className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Xóa tìm kiếm"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {(filteredSessions?.length || 0) === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-xs">Chưa có độc giả nào gửi yêu cầu hỗ trợ.</p>
                </div>
              ) : (
                (filteredSessions || []).map((session) => {
                  const isSelected = selectedChatId === session.userId;

                  return (
                    <button
                      key={session.userId}
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        setSelectedChatId(session.userId);
                      }}
                      className={`w-full text-left p-3.5 flex items-start gap-3 transition cursor-pointer ${
                        isSelected
                          ? 'bg-pink-50/90 dark:bg-pink-950/40 border-l-4 border-pink-600'
                          : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {session.userAvatar ? (
                        <img
                          src={session.userAvatar}
                          alt={session.userName}
                          className="w-9 h-9 rounded-full object-cover border border-pink-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-pink-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {session.userName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {session.userName}
                          </h4>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {session.lastMessageTime > 0
                              ? new Date(session.lastMessageTime).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                        </div>

                        {session.userEmail && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {session.userEmail}
                          </p>
                        )}

                        <p
                          className={`text-xs truncate mt-1 ${
                            session.unreadCount > 0
                              ? 'font-bold text-pink-700 dark:text-pink-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {session.lastMessage || 'Bắt đầu cuộc trò chuyện'}
                        </p>
                      </div>

                      {session.unreadCount > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-pink-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-1">
                          {session.unreadCount > 99 ? '99+' : session.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* CỘT PHẢI: Khung chat với khách */}
          <div
            className={`flex-1 flex flex-col min-h-0 bg-pink-50/20 dark:bg-slate-900 ${
              !selectedChatId
                ? 'hidden md:flex'
                : 'fixed inset-0 z-50 h-[100dvh] md:static md:inset-auto md:h-auto flex bg-white dark:bg-slate-900'
            }`}
          >
            {activeSession ? (
              <>
                <div className="px-3.5 py-3 bg-white dark:bg-slate-900 border-b border-pink-100 dark:border-pink-950/60 flex items-center justify-between gap-2 shrink-0 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedChatId(null)}
                      aria-label="Quay lại danh sách"
                      className="md:hidden inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-pink-50 dark:bg-slate-800 text-pink-600 dark:text-pink-300 hover:bg-pink-100 text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Quay lại</span>
                    </button>

                    {activeSession.userAvatar ? (
                      <img
                        src={activeSession.userAvatar}
                        alt={activeSession.userName}
                        className="w-8 h-8 rounded-full object-cover border border-pink-200 dark:border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-pink-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {activeSession.userName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                        {activeSession.userName}
                      </h3>
                      <p className="text-[10px] text-slate-400 truncate">
                        {activeSession.userEmail || `UID: ${activeSession.userId}`}
                      </p>
                    </div>
                  </div>

                  {confirmDeleteId === activeSession.userId ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleConfirmDelete(activeSession.userId)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition cursor-pointer"
                      >
                        Xóa ngay
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(activeSession.userId)}
                      title="Xóa cuộc hội thoại"
                      aria-label="Xóa cuộc hội thoại"
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-pink-50/25 dark:bg-slate-950/40 text-xs">
                  {(messages || []).map((msg) => {
                    const isFromAdmin = msg.senderType === 'admin';

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isFromAdmin ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] px-3.5 py-2.5 rounded-2xl text-xs break-words shadow-xs space-y-1.5 ${
                            isFromAdmin
                              ? 'bg-pink-600 text-white rounded-br-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-pink-100 dark:border-slate-700'
                          }`}
                        >
                          <span
                            className={`block text-[10px] font-bold ${
                              isFromAdmin
                                ? 'text-pink-100'
                                : 'text-pink-600 dark:text-pink-400'
                            }`}
                          >
                            {isFromAdmin ? 'Admin' : activeSession.userName}
                          </span>
                          {msg.imageUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(msg.imageUrl!)}
                              className="block rounded-xl overflow-hidden border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-400 cursor-zoom-in"
                              title="Nhấn để phóng to ảnh"
                            >
                              <img
                                src={msg.imageUrl}
                                alt="Ảnh đính kèm"
                                className="max-w-[230px] max-h-[230px] w-auto h-auto object-cover"
                              />
                            </button>
                          )}
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
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
                      Ảnh đã sẵn sàng gửi tới độc giả
                    </span>
                  </div>
                )}

                <form
                  onSubmit={handleSendReply}
                  className="sticky bottom-0 p-3 bg-white dark:bg-slate-900 border-t border-pink-100 dark:border-pink-950/60 shrink-0 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
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
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={isSending}
                    placeholder={`Trả lời ${activeSession.userName} với tư cách Admin...`}
                    className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm md:text-xs focus:outline-none focus:ring-2 focus:ring-pink-500 border border-transparent dark:border-slate-700 disabled:opacity-60"
                  />

                  <button
                    type="submit"
                    disabled={isBusy || (!replyText.trim() && !pendingImageUrl)}
                    className="px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-pink-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
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
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                <div className="w-16 h-16 rounded-full bg-pink-50 dark:bg-slate-800 flex items-center justify-center text-pink-600">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Chọn một độc giả để bắt đầu hỗ trợ
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Mọi tin nhắn trả lời từ Admin đều ẩn danh tính thật và chỉ hiển thị tên người gửi là Admin.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

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
};

export default AdminChatDashboard;
