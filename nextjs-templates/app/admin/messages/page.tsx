'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit,
  onSnapshot, 
  doc,
  writeBatch
} from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { 
  Eye, 
  ShieldCheck, 
  Search, 
  MessageSquare, 
  Clock, 
  Lock, 
  ArrowLeft,
  X
} from 'lucide-react';

/**
 * ==============================================================================
 * NEXT.JS APP ROUTER: TRANG GIÁM SÁT TIN NHẮN TÀNG HÌNH (/admin/messages)
 * ==============================================================================
 * Dành riêng cho 2 Quản trị viên chính thức:
 * 1. hoaamcac@gmail.com
 * 2. meoyeutien22@gmail.com
 *
 * 🛑 CHẾ ĐỘ GIÁM SÁT TÀNG HÌNH (STEALTH ADMIN):
 * - Khi 2 admin này đọc tin nhắn ở trang quản trị, BẮT BUỘC KHÔNG được gọi lệnh update
 *   các trường isRead, lastRead hay seenAt.
 * - Đảm bảo việc admin đọc trộm hoàn toàn vô hình, không làm mất chấm đỏ chưa đọc của người dùng.
 * ==============================================================================
 */

const ADMIN_EMAILS: string[] = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

interface ConversationItem {
  id: string;
  participants: string[];
  participantDetails?: Record<string, {
    id: string;
    displayName: string;
    avatarUrl?: string;
    email?: string;
    role: string;
  }>;
  lastMessage: string;
  lastSenderId: string;
  lastSenderName: string;
  isRead: boolean;
  updatedAt: number;
}

interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt: number;
  isRead?: boolean;
}

export default function AdminStealthMessagesPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const markedMsgIdsRef = useRef<Set<string>>(new Set());
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedConvRef = useRef<ConversationItem | null>(null);

  useEffect(() => {
    selectedConvRef.current = selectedConv;
  }, [selectedConv]);

  // Khởi tạo Firebase Client
  const firebaseConfig = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'knotted-inverter-qbcxw',
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyC9Y0PKl42P8eCsmyJ4-HIoRpAHZIvhO9w',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'knotted-inverter-qbcxw.firebaseapp.com',
  };

  const app = !(getApps()?.length || 0) ? initializeApp(firebaseConfig) : getApp();
  const db = getFirestore(app);
  const auth = getAuth(app);

  // Theo dõi phiên đăng nhập
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, [auth]);

  const isAuthorizedAdmin = Boolean(
    currentUser &&
    currentUser.email &&
    ADMIN_EMAILS.some((adm) => adm.toLowerCase().trim() === currentUser.email?.toLowerCase().trim())
  );

  // 1. Lắng nghe tối đa 100 cuộc trò chuyện mới nhất thời gian thực (bảo vệ Quota Đọc)
  useEffect(() => {
    if (!isAuthorizedAdmin) return;

    const convQuery = query(
      collection(db, 'conversations'),
      orderBy('updatedAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(convQuery, (snap) => {
      const items: ConversationItem[] = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        items.push({
          id: d.id,
          participants: Array.isArray(data.participants) ? data.participants : [],
          participantDetails: data.participantDetails || {},
          lastMessage: data.lastMessage || '',
          lastSenderId: data.lastSenderId || '',
          lastSenderName: data.lastSenderName || '',
          isRead: data.isRead ?? true,
          updatedAt: data.updatedAt || 0,
        });
      });
      items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setConversations(items);

      if (selectedConvRef.current) {
        const updated = items.find((c) => c.id === selectedConvRef.current?.id);
        if (updated) setSelectedConv(updated);
      }
    });

    return () => unsub();
  }, [isAuthorizedAdmin, db]);

  // 2. Lắng nghe tin nhắn của cuộc trò chuyện được chọn
  // 🛑 PHÂN LOẠI RÕ 2 TRƯỜNG HỢP:
  // - Trường hợp 1 (Admin là người trong cuộc): UID có trong participants -> Gom nhóm writeBatch + Debounce 300ms
  // - Trường hợp 2 (Admin đang giám sát ẩn danh): UID KHÔNG CÓ trong participants -> TUYỆT ĐỐI KHÔNG Write.
  useEffect(() => {
    if (!isAuthorizedAdmin || !selectedConv?.id) {
      setMessages([]);
      return;
    }

    const convId = selectedConv.id;
    const currentUid = currentUser?.uid;

    const scheduleBatchMarkAsRead = (loadedMsgs: MessageItem[]) => {
      if (!currentUid) return;
      const latestConv = selectedConvRef.current;
      if (!latestConv || latestConv.id !== convId) return;

      const participants = Array.isArray(latestConv.participants) ? latestConv.participants : [];
      // Chỉ đánh dấu đã đọc khi Admin thực sự là người tham gia trực tiếp
      if (!participants.includes(currentUid)) return;

      const unreadIds = (loadedMsgs || [])
        .filter(
          (m) =>
            m.id &&
            m.senderId !== currentUid &&
            m.isRead === false &&
            !markedMsgIdsRef.current.has(m.id)
        )
        .map((m) => m.id);

      const needsParentMark =
        Boolean(latestConv.lastSenderId) &&
        latestConv.lastSenderId !== currentUid &&
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
          batch.commit().catch((err) => console.warn('Lỗi batch cập nhật isRead:', err));
        }
      }, 300);
    };

    const msgsCol = collection(db, 'conversations', convId, 'messages');
    const q = query(msgsCol, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(q, (snap) => {
      const list: MessageItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          conversationId: convId,
          senderId: data.senderId,
          senderName: data.senderName || 'Người gửi',
          senderRole: data.senderRole || 'reader',
          text: data.text || '',
          createdAt: data.createdAt || Date.now(),
          isRead: data.isRead,
        });
      });
      setMessages(list);
      scheduleBatchMarkAsRead(list);
    });

    return () => {
      if (markReadTimerRef.current) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
      unsub();
    };
  }, [isAuthorizedAdmin, selectedConv?.id, currentUser?.uid, db]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-pink-400 font-semibold">Đang xác thực quyền Quản Trị Viên...</span>
        </div>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="bg-slate-900 border border-rose-900/60 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-950/60 text-rose-500 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white">Quyền Truy Cập Bị Từ Chối</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Trang giám sát tin nhắn tàng hình chỉ dành riêng cho 2 Quản trị viên: <br />
              <strong className="text-pink-400">hoaamcac@gmail.com</strong> &amp; <strong className="text-pink-400">meoyeutien22@gmail.com</strong>.
            </p>
          </div>
          <a
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold transition"
          >
            Về Trang Chủ
          </a>
        </div>
      </div>
    );
  }

  const filtered = conversations.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const details = Object.values(c.participantDetails || {});
    const matchNames = details.some((d) => d.displayName?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q));
    const matchLastMsg = c.lastMessage?.toLowerCase().includes(q);
    const matchesSearch = !q || matchNames || matchLastMsg;

    if (filterMode === 'unread') {
      return matchesSearch && c.isRead === false;
    }
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-500 text-white font-black flex items-center justify-center shadow-md shadow-pink-500/20"
          >
            Đ
          </a>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white">Đạo Tâm Admin • Giám Sát Tin Nhắn Tàng Hình</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                👁️ Stealth Mode Active
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Admin đang truy cập: <span className="text-pink-400 font-semibold">{currentUser?.email}</span> • Không cập nhật trạng thái đã đọc của người dùng
            </p>
          </div>
        </div>
        <a
          href="/"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Về trang chủ</span>
        </a>
      </header>

      {/* Cam kết vô hình */}
      <div className="px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>Cam kết Giám Sát Tàng Hình:</strong> Thao tác đọc tin nhắn của Admin hoàn toàn vô hình, KHÔNG dispatch lệnh cập nhật <code>isRead</code> hay <code>seenAt</code> để bảo toàn trạng thái thông báo của độc giả và tác giả.
        </span>
      </div>

      {/* Giao diện 2 cột */}
      <div className="flex-1 flex overflow-hidden">
        {/* Cột trái: Danh sách cuộc hội thoại */}
        <div className="w-80 md:w-96 border-r border-slate-800 flex flex-col bg-slate-900/60">
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên, email, nội dung..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`flex-1 py-1 px-2 rounded-lg font-semibold text-[11px] transition ${
                  filterMode === 'all' ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Tất cả ({conversations?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unread')}
                className={`flex-1 py-1 px-2 rounded-lg font-semibold text-[11px] transition ${
                  filterMode === 'unread' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🔴 Chưa đọc
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
            {(filtered?.length || 0) === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Không tìm thấy cuộc hội thoại nào.
              </div>
            ) : (
              (filtered || []).map((c) => {
                const isSelected = selectedConv?.id === c.id;
                const details = Object.values(c.participantDetails || {});
                const p1 = details[0] || { displayName: 'User 1', role: 'reader' };
                const p2 = details[1] || { displayName: 'User 2', role: 'author' };

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedConv(c)}
                    className={`p-3.5 transition cursor-pointer space-y-1 ${
                      isSelected ? 'bg-pink-950/40 border-l-4 border-pink-500' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-bold text-white truncate max-w-[200px]">
                        <span>{p1.displayName}</span>
                        <span className="text-slate-500 mx-1">&harr;</span>
                        <span>{p2.displayName}</span>
                      </div>
                      {c.isRead === false && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black">
                          Chưa đọc
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      <strong className="text-slate-300">{c.lastSenderName}:</strong> {c.lastMessage || 'Chưa có tin nhắn'}
                    </p>
                    <div className="text-[10px] text-slate-500 flex items-center justify-between">
                      <span>{new Date(c.updatedAt).toLocaleTimeString('vi-VN')} {new Date(c.updatedAt).toLocaleDateString('vi-VN')}</span>
                      <span className="text-pink-400 font-semibold">{p1.role} &amp; {p2.role}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Cột phải: Xem tin nhắn */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {selectedConv ? (
            <>
              <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    {(Object.values(selectedConv.participantDetails || {}) || []).map((p, idx) => (
                      <span key={p.id || idx} className="inline-flex items-center gap-1">
                        <span>{p.displayName}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-pink-400 font-semibold">
                          ({p.role || 'reader'})
                        </span>
                        {idx === 0 && <span className="text-slate-500">&harr;</span>}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    ID: {selectedConv.id} • Trạng thái đọc của bên nhận: {selectedConv.isRead ? 'Đã đọc' : 'Chưa đọc'}
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-semibold">
                  👁️ Đang đọc tàng hình
                </span>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                {(messages?.length || 0) === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    Chưa có tin nhắn nào trong hội thoại này.
                  </div>
                ) : (
                  (messages || []).map((m) => {
                    const firstId = selectedConv.participants?.[0];
                    const isLeft = m.senderId === firstId;

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}
                      >
                        <div className="text-[10px] font-semibold text-slate-400 mb-0.5 px-1 flex items-center gap-1.5">
                          <span>{m.senderName}</span>
                          <span className="px-1 py-0.2 rounded-xs bg-slate-800 text-[9px] uppercase">
                            {m.senderRole}
                          </span>
                        </div>
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 text-xs leading-relaxed break-words ${
                            isLeft ? 'bg-slate-800 text-white' : 'bg-pink-600 text-white'
                          }`}
                        >
                          {m.text}
                        </div>
                        <span className="text-[9px] text-slate-500 mt-0.5 px-1">
                          {new Date(m.createdAt).toLocaleTimeString('vi-VN')} {new Date(m.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 bg-slate-900 border-t border-slate-800 text-center text-[11px] text-slate-400">
                🔒 Chế độ giám sát chỉ đọc (Read-only) bảo vệ an toàn cho cả hai bên và giữ sự vô hình tuyệt đối của Quản Trị Viên.
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-pink-950/30 text-pink-400 flex items-center justify-center shadow-xs">
                <Eye className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-slate-200">
                  Chọn một cuộc hội thoại từ danh sách bên trái
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Theo dõi trao đổi giữa Độc Giả và Tác Giả / Editor ở chế độ hoàn toàn vô hình.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
