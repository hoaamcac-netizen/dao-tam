'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  writeBatch,
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { 
  X, 
  Send, 
  MessageSquare, 
  ArrowLeft, 
  Minimize2, 
  ShieldCheck, 
  PenTool, 
  BookOpen, 
  Sparkles, 
  AlertCircle,
  Lock
} from 'lucide-react';

const ADMIN_EMAILS = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return ADMIN_EMAILS.some((adm) => adm.toLowerCase().trim() === clean);
}

function normalizeChatRole(role?: string): 'reader' | 'author' | 'editor' {
  if (!role) return 'reader';
  const r = role.toLowerCase().trim();
  if (r === 'author') return 'author';
  if (r === 'editor') return 'editor';
  return 'reader';
}

function canChatTogether(
  userA: { id: string; role?: string; email?: string },
  userB: { id: string; role?: string; email?: string }
): { allowed: boolean; reason?: string } {
  if (!userA?.id || !userB?.id) return { allowed: false, reason: 'Chưa đủ thông tin người dùng.' };
  if (userA.id === userB.id) return { allowed: false, reason: 'Không thể tự chat với chính mình.' };

  if (checkIsAdmin(userA.email) || checkIsAdmin(userB.email)) {
    return { allowed: true };
  }

  const roleA = normalizeChatRole(userA.role);
  const roleB = normalizeChatRole(userB.role);

  if (roleA === 'author' && roleB === 'author') {
    return { allowed: false, reason: 'Chính sách Đạo Tâm chặn kết nối giữa Tác giả với Tác giả.' };
  }
  if (roleA === 'editor' && roleB === 'editor') {
    return { allowed: false, reason: 'Chính sách Đạo Tâm chặn kết nối giữa Editor với Editor.' };
  }
  if ((roleA === 'author' && roleB === 'editor') || (roleA === 'editor' && roleB === 'author')) {
    return { allowed: false, reason: 'Chính sách Đạo Tâm chặn Tác giả và Editor nhắn tin với nhau.' };
  }
  if (roleA === 'reader' && roleB === 'reader') {
    return { allowed: false, reason: 'Kênh chat chỉ dành cho kết nối giữa Độc giả và Tác giả / Editor.' };
  }

  return { allowed: true };
}

interface FloatingChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    role?: string;
    email?: string;
    isLoggedIn?: boolean;
  };
  initialTargetUser?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    role?: string;
    email?: string;
  } | null;
  onOpenLogin?: () => void;
}

export default function FloatingChatWidget({
  isOpen,
  onClose,
  currentUser,
  initialTargetUser,
  onOpenLogin,
}: FloatingChatWidgetProps) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const markedMsgIdsRef = useRef<Set<string>>(new Set());
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeConvRef = useRef<any | null>(null);

  useEffect(() => {
    activeConvRef.current = activeConversation;
  }, [activeConversation]);

  const firebaseConfig = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'knotted-inverter-qbcxw',
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyC9Y0PKl42P8eCsmyJ4-HIoRpAHZIvhO9w',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'knotted-inverter-qbcxw.firebaseapp.com',
  };

  const app = !(getApps()?.length) ? initializeApp(firebaseConfig) : getApp();
  const db = getFirestore(app);

  const isLoggedIn = Boolean(currentUser?.isLoggedIn && currentUser?.id && currentUser?.id !== 'guest');

  // Lắng nghe danh sách cuộc trò chuyện
  useEffect(() => {
    if (!isLoggedIn || !isOpen) return;

    const convCol = collection(db, 'conversations');
    const q = query(convCol, where('participants', 'array-contains', currentUser.id));

    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = [];
      (snap?.docs || []).forEach((d) => {
        const raw = d.data() || {};
        items.push({
          id: d.id,
          ...raw,
          participants: Array.isArray(raw.participants) ? raw.participants : [],
          messages: Array.isArray(raw.messages) ? raw.messages : [],
        });
      });
      items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setConversations(items);

      if (activeConversation) {
        const found = (items || []).find((c) => c.id === activeConversation.id);
        if (found) setActiveConversation(found);
      }
    });

    return () => unsub();
  }, [isLoggedIn, isOpen, currentUser?.id, db, activeConversation?.id]);

  // Khởi tạo chat trực tiếp với initialTargetUser
  useEffect(() => {
    if (!isOpen || !initialTargetUser || !isLoggedIn) return;

    const startChat = async () => {
      setErrorMessage(null);
      const check = canChatTogether(currentUser, initialTargetUser);
      if (!check.allowed) {
        setErrorMessage(check.reason || 'Bị chặn quyền nhắn tin.');
        return;
      }

      const convId = `conv_${[currentUser.id, initialTargetUser.id].sort().join('_')}`;
      const convRef = doc(db, 'conversations', convId);
      const snap = await getDoc(convRef);

      let convData: any;
      if (snap.exists()) {
        const raw = snap.data() || {};
        convData = {
          id: convId,
          ...raw,
          participants: Array.isArray(raw.participants) ? raw.participants : [],
          messages: Array.isArray(raw.messages) ? raw.messages : [],
        };
      } else {
        const now = Date.now();
        convData = {
          id: convId,
          participants: [currentUser.id, initialTargetUser.id],
          participantDetails: {
            [currentUser.id]: {
              id: currentUser.id,
              displayName: currentUser.displayName,
              avatarUrl: currentUser.avatarUrl || '',
              role: normalizeChatRole(currentUser.role),
            },
            [initialTargetUser.id]: {
              id: initialTargetUser.id,
              displayName: initialTargetUser.displayName,
              avatarUrl: initialTargetUser.avatarUrl || '',
              role: normalizeChatRole(initialTargetUser.role),
            },
          },
          lastMessage: '',
          lastSenderId: '',
          lastSenderName: '',
          isRead: true,
          updatedAt: now,
          createdAt: now,
        };
        await setDoc(convRef, convData);
      }

      setActiveConversation(convData);
      setIsMinimized(false);

      // Phân loại 2 trường hợp mở tin nhắn:
      // Kiểm tra currentUser.id (UID của user/admin) CÓ NẰM TRONG mảng participants hay không
      const isParticipant = Array.isArray(convData.participants) && convData.participants.includes(currentUser.id);
      const isAdmin = checkIsAdmin(currentUser.email);

      // Trường hợp 1 (Admin là người trong cuộc HOẶC user bình thường):
      // Nếu UID có trong participants, BẮT BUỘC update isRead: true để xóa chấm đỏ thông báo
      // Trường hợp 2 (Admin giám sát ẩn danh): UID KHÔNG có trong participants -> Tuyệt đối không update
      const canMarkRead = !isAdmin || isParticipant;
      if (canMarkRead && convData.lastSenderId && convData.lastSenderId !== currentUser.id && convData.isRead === false) {
        await updateDoc(convRef, { isRead: true });
      }
    };

    startChat();
  }, [isOpen, initialTargetUser?.id, isLoggedIn, currentUser?.id, db]);

  // Lắng nghe tin nhắn & Gom nhóm đánh dấu đã đọc (writeBatch + Debounce 300ms + Guard chống lặp)
  useEffect(() => {
    if (!isOpen || !activeConversation?.id) {
      setMessages([]);
      return;
    }

    const convId = activeConversation.id;

    const scheduleBatchMarkAsRead = (loadedMsgs: any[]) => {
      if (!isLoggedIn || !currentUser?.id) return;
      const latestConv = activeConvRef.current;
      if (!latestConv || latestConv.id !== convId) return;

      const participants = Array.isArray(latestConv.participants) ? latestConv.participants : [];
      const isParticipant = participants.includes(currentUser.id);
      const isAdmin = checkIsAdmin(currentUser.email);
      // Admin giám sát ẩn danh (không nằm trong participants) -> TUYỆT ĐỐI KHÔNG ghi DB
      if (isAdmin && !isParticipant) return;

      const unreadIds = (loadedMsgs || [])
        .filter(
          (m) =>
            m?.id &&
            m.senderId !== currentUser.id &&
            m.isRead === false &&
            !markedMsgIdsRef.current.has(m.id)
        )
        .map((m) => m.id as string);

      const needsParentMark =
        Boolean(latestConv.lastSenderId) &&
        latestConv.lastSenderId !== currentUser.id &&
        latestConv.isRead === false;

      if (!needsParentMark && unreadIds.length === 0) return;

      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      markReadTimerRef.current = setTimeout(() => {
        const batch = writeBatch(db);
        let ops = 0;

        if (needsParentMark) {
          batch.update(doc(db, 'conversations', convId), { isRead: true });
          ops += 1;
        }

        unreadIds.slice(0, 450).forEach((msgId) => {
          markedMsgIdsRef.current.add(msgId);
          batch.update(doc(db, 'conversations', convId, 'messages', msgId), { isRead: true });
          ops += 1;
        });

        if (ops > 0) {
          batch.commit().catch((err) => console.warn('[FloatingChatWidget] Lỗi batch markAsRead:', err));
        }
      }, 300);
    };

    const msgsCol = collection(db, 'conversations', convId, 'messages');
    const q = query(msgsCol, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(q, (snap) => {
      const msgs: any[] = [];
      (snap?.docs || []).forEach((d) => msgs.push({ id: d.id, ...(d.data() || {}) }));
      setMessages(msgs || []);
      scheduleBatchMarkAsRead(msgs);
    });

    return () => {
      if (markReadTimerRef.current) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
      unsub();
    };
  }, [isOpen, activeConversation?.id, isLoggedIn, currentUser?.id, currentUser?.email, db]);

  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending || !activeConversation || !isLoggedIn) return;

    const otherId = (activeConversation?.participants || []).find((id: string) => id !== currentUser?.id) || '';
    const otherDetails = activeConversation.participantDetails?.[otherId] || { id: otherId, role: 'reader' };

    const check = canChatTogether(currentUser, otherDetails);
    if (!check.allowed) {
      setErrorMessage(check.reason || 'Bị chặn gửi tin nhắn.');
      return;
    }

    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);
    setErrorMessage(null);

    try {
      const now = Date.now();
      const batch = writeBatch(db);
      const newMsgRef = doc(collection(db, 'conversations', activeConversation.id, 'messages'));
      const convRef = doc(db, 'conversations', activeConversation.id);

      batch.set(newMsgRef, {
        conversationId: activeConversation.id,
        senderId: currentUser.id,
        senderName: currentUser.displayName,
        senderAvatar: currentUser.avatarUrl || '',
        senderRole: normalizeChatRole(currentUser.role),
        text: textToSend,
        createdAt: now,
        isRead: false,
      });

      batch.update(convRef, {
        lastMessage: textToSend.slice(0, 200),
        lastSenderId: currentUser.id,
        lastSenderName: currentUser.displayName,
        isRead: false,
        updatedAt: now,
      });

      await batch.commit();

      if (inputRef.current) inputRef.current.focus();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi gửi tin nhắn.');
    } finally {
      setIsSending(false);
    }
  };

  const getPartnerInfo = (conv: any) => {
    const partnerId = (conv?.participants || []).find((id: string) => id !== currentUser?.id) || '';
    const details = conv.participantDetails?.[partnerId];
    return {
      id: partnerId,
      name: details?.displayName || conv.lastSenderName || 'Người nhận',
      avatar: details?.avatarUrl || '',
      role: details?.role || 'reader',
    };
  };

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-pink-600 via-rose-500 to-pink-500 text-white font-bold text-xs shadow-xl shadow-pink-500/30 hover:scale-105 transition cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Tin nhắn ({conversations?.length || 0})</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="ml-1 p-0.5 rounded-full hover:bg-white/20"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 transition-all duration-200 
        inset-x-0 bottom-0 h-[85vh] max-h-[600px] rounded-t-3xl
        md:inset-x-auto md:left-auto md:bottom-4 md:right-4 md:w-80 lg:w-96 md:h-[520px] md:rounded-2xl
        bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-900/40 shadow-2xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-pink-600 via-pink-500 to-rose-500 text-white flex items-center justify-between shadow-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          {activeConversation ? (
            <button
              type="button"
              onClick={() => {
                setActiveConversation(null);
                setErrorMessage(null);
              }}
              className="p-1 rounded-full hover:bg-white/20 transition cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <MessageSquare className="w-3.5 h-3.5" />
            </div>
          )}
          <div className="min-w-0">
            {activeConversation ? (
              <span className="font-bold text-xs sm:text-sm truncate block max-w-[170px]">
                {getPartnerInfo(activeConversation).name}
              </span>
            ) : (
              <div>
                <h3 className="font-bold text-xs sm:text-sm">Tin nhắn Đạo Tâm</h3>
                <p className="text-[10px] text-pink-100 font-medium">Độc Giả &amp; Tác Giả / Editor</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/90"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/90"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!isLoggedIn ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-pink-50/30 dark:bg-slate-900">
          <Lock className="w-10 h-10 text-pink-500" />
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">Đăng nhập để trò chuyện</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Vui lòng đăng nhập để trao đổi trực tiếp với Tác giả / Editor.</p>
          </div>
          <button
            type="button"
            onClick={onOpenLogin}
            className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-md transition"
          >
            Đăng Nhập Ngay
          </button>
        </div>
      ) : activeConversation ? (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-950/30">
          {errorMessage && (
            <div className="m-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
              <span>{errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage(null)}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs">
            {(messages?.length || 0) === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
                <Sparkles className="w-8 h-8 text-pink-400 mb-2" />
                <p>Chưa có tin nhắn nào. Hãy gửi lời chào đầu tiên!</p>
              </div>
            ) : (
              (messages || []).map((m) => {
                const isMe = m.senderId === currentUser.id;
                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words ${
                        isMe
                          ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-br-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-pink-100 dark:border-slate-700 rounded-bl-xs'
                      }`}
                    >
                      {m.text}
                    </div>
                    <span className="text-[9px] text-slate-400 mt-0.5 px-1">
                      {new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-2.5 bg-white dark:bg-slate-900 border-t border-pink-100 dark:border-slate-800 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Nhập tin nhắn..."
              disabled={isSending}
              className="flex-1 bg-slate-100 dark:bg-slate-800 border-0 rounded-full py-2 px-3.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="p-2 rounded-full bg-pink-600 hover:bg-pink-700 text-white transition disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30 dark:bg-slate-950/20">
          <div className="px-4 py-2 border-b border-pink-100 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Hộp thư ({conversations?.length || 0})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-pink-50 dark:divide-slate-800/60">
            {(conversations?.length || 0) === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                <MessageSquare className="w-10 h-10 text-pink-300" />
                <p className="text-xs font-semibold">Chưa có cuộc trò chuyện nào</p>
                <p className="text-[11px]">Bấm nút &ldquo;Nhắn tin&rdquo; ở trang Tác Giả / Editor để kết nối!</p>
              </div>
            ) : (
              (conversations || []).map((c) => {
                const partner = getPartnerInfo(c);
                const isUnread = c.lastSenderId !== currentUser.id && c.isRead === false;

                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setActiveConversation(c);
                      setErrorMessage(null);
                    }}
                    className={`p-3 flex items-center gap-3 transition cursor-pointer ${
                      isUnread ? 'bg-pink-50/70 dark:bg-pink-950/30' : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 text-white font-bold text-sm flex items-center justify-center">
                        {partner.name.charAt(0).toUpperCase()}
                      </div>
                      {isUnread && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs truncate ${isUnread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-300'}`}>
                          {partner.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('vi-VN') : ''}
                        </span>
                      </div>
                      <p className={`text-[11px] truncate ${isUnread ? 'font-bold text-pink-700 dark:text-pink-300' : 'text-slate-500 dark:text-slate-400'}`}>
                        {c.lastMessage || 'Bắt đầu trò chuyện...'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
