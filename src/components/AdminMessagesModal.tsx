import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Search, 
  MessageSquare, 
  Clock, 
  User, 
  ArrowLeft,
  AlertTriangle,
  Lock,
  Sparkles,
  PenTool,
  BookOpen
} from 'lucide-react';
import { Conversation, ChatMessage, UserProfile } from '../types';
import { 
  subscribeToAllConversationsForAdmin, 
  subscribeToConversationMessages,
  markConversationAsRead
} from '../services/chatService';
import { checkIsAdmin, ADMIN_EMAILS } from '../firebase/config';

interface AdminMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
}

export const AdminMessagesModal: React.FC<AdminMessagesModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'unread_only'>('all');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const markedMsgIdsRef = useRef<Set<string>>(new Set());
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedConvRef = useRef<Conversation | null>(null);

  useEffect(() => {
    selectedConvRef.current = selectedConv;
  }, [selectedConv]);

  // Kiểm tra quyền nghiêm ngặt: Đúng 2 email quản trị viên duy nhất
  const isAuthorizedAdmin = checkIsAdmin(currentUser?.email);

  // 1. Lắng nghe TẤT CẢ cuộc hội thoại thời gian thực
  useEffect(() => {
    if (!isOpen || !isAuthorizedAdmin) return;

    const unsubscribe = subscribeToAllConversationsForAdmin(currentUser.email, (list) => {
      const safeList = Array.isArray(list) ? list : [];
      setConversations(safeList);
      if (selectedConv) {
        const updated = safeList.find((c) => c.id === selectedConv.id);
        if (updated) setSelectedConv(updated);
      }
    });

    return () => unsubscribe();
  }, [isOpen, isAuthorizedAdmin, currentUser?.email, selectedConv?.id]);

  // 2. Lắng nghe tin nhắn của cuộc trò chuyện được chọn
  // 🛑 PHÂN LOẠI 2 TRƯỜNG HỢP:
  // - Nếu Admin là người trong cuộc (currentUser.id nằm trong participants) -> markAsRead
  // - Nếu Admin giám sát ẩn danh -> markConversationAsRead tự động bỏ qua (giữ nguyên tàng hình)
  useEffect(() => {
    if (!isOpen || !selectedConv?.id || !isAuthorizedAdmin) {
      setMessages([]);
      return;
    }

    const convId = selectedConv.id;

    const scheduleBatchMarkAsRead = (loadedMsgs: ChatMessage[]) => {
      const latestConv = selectedConvRef.current;
      if (!latestConv || latestConv.id !== convId) return;

      const participants = Array.isArray(latestConv.participants) ? latestConv.participants : [];
      // Chế độ giám sát ẩn danh: Admin không nằm trong participants -> TUYỆT ĐỐI KHÔNG ghi DB
      if (!participants.includes(currentUser.id)) return;

      const unreadIds = (loadedMsgs || [])
        .filter(
          (m) =>
            m.id &&
            m.senderId !== currentUser.id &&
            m.isRead === false &&
            !markedMsgIdsRef.current.has(m.id)
        )
        .map((m) => m.id);

      const needsParentMark =
        Boolean(latestConv.lastSenderId) &&
        latestConv.lastSenderId !== currentUser.id &&
        latestConv.isRead === false;

      if (!needsParentMark && unreadIds.length === 0) return;

      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      markReadTimerRef.current = setTimeout(() => {
        unreadIds.forEach((id) => markedMsgIdsRef.current.add(id));
        markConversationAsRead(convId, currentUser.id, currentUser.email, {
          knownConversation: latestConv,
          unreadMessageIds: unreadIds,
        });
      }, 300);
    };

    const unsubscribe = subscribeToConversationMessages(convId, (msgs) => {
      const safeMsgs = Array.isArray(msgs) ? msgs : [];
      setMessages(safeMsgs);
      scheduleBatchMarkAsRead(safeMsgs);
    });

    return () => {
      if (markReadTimerRef.current) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
      unsubscribe();
    };
  }, [isOpen, selectedConv?.id, isAuthorizedAdmin, currentUser?.id, currentUser?.email]);

  // Cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (!isOpen) return null;

  // Nếu không phải 1 trong 2 Admin được ủy quyền
  if (!isAuthorizedAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-rose-300 dark:border-rose-900 p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 mx-auto flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="font-black text-lg text-slate-900 dark:text-white">
              Quyền Truy Cập Bị Từ Chối
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Khu vực Giám Sát Tin Nhắn Tàng Hình chỉ dành riêng cho 2 Quản Trị Viên hệ thống Đạo Tâm (hoaamcac@gmail.com &amp; meoyeutien22@gmail.com).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-300 transition cursor-pointer"
          >
            Đóng Lại
          </button>
        </div>
      </div>
    );
  }

  // Lọc danh sách hội thoại
  const filteredConversations = (conversations || []).filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const details = Object.values(c?.participantDetails || {}) || [];
    const matchNames = (details || []).some((d) => d?.displayName?.toLowerCase().includes(q) || d?.email?.toLowerCase().includes(q));
    const matchLastMsg = c?.lastMessage?.toLowerCase().includes(q);
    const matchesSearch = !q || matchNames || matchLastMsg;

    if (filterRole === 'unread_only') {
      return matchesSearch && c?.isRead === false;
    }
    return matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl h-[92vh] max-h-[850px] flex flex-col overflow-hidden">
        
        {/* =========================================================================
            HEADER QUẢN TRỊ TÀNG HÌNH
           ========================================================================= */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-md">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black">
                  Giám Sát Tin Nhắn Tàng Hình (Stealth Mode)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  👁️ Hoàn Toàn Vô Hình
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Đăng nhập quản trị: <span className="text-pink-400 font-semibold">{currentUser.email}</span> • Không cập nhật trạng thái đã đọc của người dùng
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dải Banner Bắt Buộc: Cam kết Giám sát tàng hình */}
        <div className="px-4 py-2 bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              <strong>Chế độ đọc tàng hình nghiêm ngặt:</strong> Thao tác xem tin nhắn của Quản Trị Viên không làm mất chấm đỏ hay thay đổi trường <code>isRead</code> của hai bên.
            </span>
          </span>
          <span className="font-bold text-[11px] shrink-0 hidden sm:inline">
            Tổng {conversations?.length || 0} cuộc hội thoại
          </span>
        </div>

        {/* =========================================================================
            BODY CHÍNH: 2 CỘT (Cột trái: Danh sách hội thoại; Cột phải: Khung xem tin nhắn)
           ========================================================================= */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          
          {/* CỘT TRÁI: DANH SÁCH CUỘC HỘI THOẠI TOÀN BỘ HỆ THỐNG */}
          <div className={`w-full md:w-80 lg:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col ${selectedConv ? 'hidden md:flex' : 'flex'}`}>
            
            {/* Thanh tìm kiếm & lọc */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50 dark:bg-slate-900/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên, email, nội dung..."
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-1.5 pl-9 pr-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterRole('all')}
                  className={`flex-1 py-1 px-2 rounded-lg font-semibold text-[11px] transition ${
                    filterRole === 'all'
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  Tất cả ({conversations?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterRole('unread_only')}
                  className={`flex-1 py-1 px-2 rounded-lg font-semibold text-[11px] transition ${
                    filterRole === 'unread_only'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  🔴 Chưa đọc
                </button>
              </div>
            </div>

            {/* Danh sách cuộn */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {(filteredConversations?.length || 0) === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p>Không tìm thấy cuộc hội thoại nào.</p>
                </div>
              ) : (
                (filteredConversations || []).map((conv) => {
                  const isSelected = selectedConv?.id === conv.id;
                  const details = Object.values(conv?.participantDetails || {}) || [];
                  const p1 = details?.[0] || { displayName: 'Người dùng 1', role: 'reader' };
                  const p2 = details?.[1] || { displayName: 'Người dùng 2', role: 'author' };

                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedConv(conv)}
                      className={`p-3.5 transition-colors cursor-pointer space-y-1.5 ${
                        isSelected
                          ? 'bg-pink-50 dark:bg-pink-950/40 border-l-4 border-pink-600'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Hai người tham gia & vai trò */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                          <span>{p1.displayName}</span>
                          <span className="text-slate-400 font-normal mx-1">&harr;</span>
                          <span>{p2.displayName}</span>
                        </div>
                        {conv.isRead === false && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black">
                            Chưa đọc
                          </span>
                        )}
                      </div>

                      {/* Tin nhắn cuối cùng */}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        <strong className="text-slate-700 dark:text-slate-300">{conv.lastSenderName}:</strong>{' '}
                        {conv.lastMessage || 'Chưa có tin nhắn'}
                      </p>

                      {/* Thời gian cập nhật */}
                      <div className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Cập nhật: {new Date(conv.updatedAt).toLocaleTimeString('vi-VN')} {new Date(conv.updatedAt).toLocaleDateString('vi-VN')}</span>
                        <span className="text-pink-600 dark:text-pink-400 font-semibold">{p1.role} &amp; {p2.role}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* CỘT PHẢI: XEM CHI TIẾT NỘI DUNG CUỘC TRÒ CHUYỆN */}
          <div className={`flex-1 flex flex-col bg-slate-50/40 dark:bg-slate-950/20 ${!selectedConv ? 'hidden md:flex' : 'flex'}`}>
            {selectedConv ? (
              <>
                {/* Header hội thoại */}
                <div className="p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedConv(null)}
                      className="md:hidden p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>

                    <div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                        {(Object.values(selectedConv?.participantDetails || {}) || []).map((p, idx) => (
                          <span key={p?.id || idx} className="inline-flex items-center gap-1">
                            <span>{p?.displayName}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-pink-600 font-semibold">
                              ({p?.role || 'reader'})
                            </span>
                            {idx === 0 && <span className="text-slate-400">&harr;</span>}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        ID: {selectedConv.id} • Trạng thái đọc của user: {selectedConv.isRead ? 'Đã xem' : 'Chưa đọc'}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800">
                    👁️ Đang đọc tàng hình
                  </span>
                </div>

                {/* Danh sách tin nhắn */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                  {(messages?.length || 0) === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                      Chưa có nội dung văn bản nào được gửi.
                    </div>
                  ) : (
                    (messages || []).map((m) => {
                      const firstParticipantId = selectedConv?.participants?.[0];
                      const isLeft = m.senderId === firstParticipantId;

                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}
                        >
                          <div className="text-[10px] font-semibold text-slate-400 mb-0.5 px-1 flex items-center gap-1.5">
                            <span>{m.senderName}</span>
                            <span className="px-1 py-0.2 rounded-xs bg-slate-200 dark:bg-slate-800 text-[9px] uppercase">
                              {m.senderRole}
                            </span>
                          </div>
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2 text-xs leading-relaxed shadow-2xs break-words ${
                              isLeft
                                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                                : 'bg-pink-600 text-white'
                            }`}
                          >
                            {m.text}
                          </div>
                          <span className="text-[9px] text-slate-400 mt-0.5 px-1">
                            {new Date(m.createdAt).toLocaleTimeString('vi-VN')} {new Date(m.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chân trang thông báo */}
                <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-500">
                  🔒 Cửa sổ chỉ xem dành riêng cho Quản Trị Viên. Không có ô soạn thảo tin nhắn để tránh can thiệp ngoài ý muốn.
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-pink-50 dark:bg-pink-950/40 text-pink-500 flex items-center justify-center shadow-xs">
                  <Eye className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-slate-700 dark:text-slate-200">
                    Chọn một cuộc hội thoại từ danh sách bên trái
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Xem toàn bộ lịch sử trao đổi giữa Độc Giả và Tác Giả / Editor ở chế độ hoàn toàn vô hình.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
