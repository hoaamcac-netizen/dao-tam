import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  MessageSquare, 
  ArrowLeft, 
  Minimize2, 
  Maximize2, 
  ShieldCheck, 
  PenTool, 
  BookOpen, 
  Sparkles, 
  AlertCircle,
  Clock,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { Conversation, ChatMessage, UserProfile, ChatTargetUser } from '../types';
import { 
  subscribeToUserConversations, 
  subscribeToConversationMessages, 
  sendChatMessage, 
  markConversationAsRead, 
  getOrCreateConversation, 
  canChatTogether,
  normalizeChatRole
} from '../services/chatService';
import { checkIsAdmin } from '../firebase/config';

interface FloatingChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  initialTargetUser?: ChatTargetUser | null;
  onClearInitialTarget?: () => void;
  onOpenLogin?: () => void;
  onOpenAdminSupport?: () => void;
}

export const FloatingChatWidget: React.FC<FloatingChatWidgetProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialTargetUser,
  onClearInitialTarget,
  onOpenLogin,
  onOpenAdminSupport,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const markedMsgIdsRef = useRef<Set<string>>(new Set());
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeConvRef = useRef<Conversation | null>(null);

  useEffect(() => {
    activeConvRef.current = activeConversation;
  }, [activeConversation]);

  const isLoggedIn = currentUser?.isLoggedIn && currentUser?.id !== 'guest';
  const isAdmin = checkIsAdmin(currentUser?.email);

  // 1. Lắng nghe danh sách cuộc trò chuyện của user
  useEffect(() => {
    if (!isLoggedIn || !isOpen) return;

    const unsubscribe = subscribeToUserConversations(currentUser.id, (list) => {
      const safeList = Array.isArray(list) ? list : [];
      setConversations(safeList);

      // Nếu đang mở một cuộc trò chuyện, đồng bộ dữ liệu mới nhất
      if (activeConversation) {
        const found = safeList.find((c) => c.id === activeConversation.id);
        if (found) {
          setActiveConversation(found);
        }
      }
    });

    return () => unsubscribe();
  }, [isLoggedIn, isOpen, currentUser?.id, activeConversation?.id]);

  // 2. Xử lý khi có initialTargetUser được truyền vào từ Profile / Author Showcase
  useEffect(() => {
    if (!isOpen || !initialTargetUser || !isLoggedIn) return;

    const initDirectChat = async () => {
      setErrorMessage(null);
      try {
        const check = canChatTogether(currentUser, initialTargetUser);
        if (!check.allowed) {
          setErrorMessage(check.reason || 'Không thể thực hiện cuộc trò chuyện này do phân quyền vai trò.');
          return;
        }

        const conv = await getOrCreateConversation(currentUser, initialTargetUser);
        setActiveConversation(conv);
        setIsMinimized(false);

        // Đánh dấu đã đọc ngay khi mở nếu thực sự có tin chưa đọc (trừ Quản trị viên tàng hình)
        if (conv.lastSenderId && conv.lastSenderId !== currentUser.id && conv.isRead === false) {
          await markConversationAsRead(conv.id, currentUser.id, currentUser.email, {
            knownConversation: conv,
          });
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Không thể mở cuộc hội thoại lúc này.');
      }
    };

    initDirectChat();
  }, [isOpen, initialTargetUser?.id, isLoggedIn, currentUser?.id]);

  // 3. Lắng nghe tin nhắn trong activeConversation & Gom nhóm đánh dấu đã đọc bằng writeBatch + Debounce
  useEffect(() => {
    if (!isOpen || !activeConversation?.id) {
      setMessages([]);
      return;
    }

    const convId = activeConversation.id;

    const scheduleBatchMarkAsRead = (loadedMsgs: ChatMessage[]) => {
      if (!isLoggedIn || !currentUser?.id) return;
      const latestConv = activeConvRef.current;
      if (!latestConv || latestConv.id !== convId) return;

      const participants = Array.isArray(latestConv.participants) ? latestConv.participants : [];
      if (isAdmin && !participants.includes(currentUser.id)) return;

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

      if (!needsParentMark && unreadIds.length === 0) {
        return;
      }

      if (markReadTimerRef.current) {
        clearTimeout(markReadTimerRef.current);
      }

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
  }, [isOpen, activeConversation?.id, isLoggedIn, isAdmin, currentUser?.id, currentUser?.email]);

  // 4. Cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    if (messagesEndRef.current && !isMinimized) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized]);

  // 5. Gửi tin nhắn
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending || !activeConversation || !isLoggedIn) return;

    const otherParticipantId = (activeConversation?.participants || []).find((id) => id !== currentUser?.id) || '';
    const otherDetails = activeConversation.participantDetails?.[otherParticipantId] || {
      id: otherParticipantId,
      displayName: 'Người nhận',
      role: 'reader',
    };

    // Kiểm tra lại quyền tương tác trước khi phát tán tin nhắn
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
      await sendChatMessage({
        conversationId: activeConversation.id,
        sender: currentUser,
        recipient: otherDetails,
        text: textToSend,
      });

      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể gửi tin nhắn. Vui lòng thử lại sau.');
    } finally {
      setIsSending(false);
    }
  };

  // Xác định thông tin người đối thoại
  const getPartnerInfo = (conv: Conversation) => {
    const partnerId = (conv?.participants || []).find((id) => id !== currentUser?.id) || '';
    const details = conv.participantDetails?.[partnerId];
    return {
      id: partnerId,
      name: details?.displayName || conv.lastSenderName || 'Người dùng',
      avatar: details?.avatarUrl || '',
      role: details?.role || 'reader',
    };
  };

  // Thẻ huy hiệu vai trò
  const renderRoleBadge = (role: string) => {
    const r = role.toLowerCase();
    if (r === 'author') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          <PenTool className="w-2.5 h-2.5" />
          <span>Tác Giả</span>
        </span>
      );
    }
    if (r === 'editor') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
          <Sparkles className="w-2.5 h-2.5" />
          <span>Editor</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300">
        <BookOpen className="w-2.5 h-2.5" />
        <span>Độc Giả</span>
      </span>
    );
  };

  if (!isOpen) return null;

  // Thu nhỏ cửa sổ chat thành một icon bong bóng góc phải
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="relative flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-pink-600 via-rose-500 to-pink-500 text-white font-bold text-xs shadow-xl shadow-pink-500/30 hover:scale-105 active:scale-95 transition cursor-pointer"
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
            title="Đóng"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed z-50 transition-all duration-200 
        /* Mobile: Bottom-sheet trượt từ dưới lên, chiếm 85vh hoặc full */
        inset-x-0 bottom-0 h-[85vh] max-h-[600px] rounded-t-3xl
        /* Desktop md: Góc dưới cùng bên phải chuẩn Facebook Messenger */
        md:inset-x-auto md:left-auto md:bottom-4 md:right-4 md:w-80 lg:w-96 md:h-[520px] md:rounded-2xl
        bg-white dark:bg-slate-900 border border-pink-200/80 dark:border-pink-900/40 shadow-2xl flex flex-col overflow-hidden`
      }
    >
      {/* =========================================================================
          HEADER KHUNG CHAT (Tone màu hồng ngọt ngào & sang trọng)
         ========================================================================= */}
      <div className="px-4 py-3 bg-gradient-to-r from-pink-600 via-pink-500 to-rose-500 text-white flex items-center justify-between shadow-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          {activeConversation ? (
            <button
              type="button"
              onClick={() => {
                setActiveConversation(null);
                setErrorMessage(null);
                if (onClearInitialTarget) onClearInitialTarget();
              }}
              className="p-1 rounded-full hover:bg-white/20 transition cursor-pointer shrink-0"
              title="Quay lại danh sách tin nhắn"
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
              (() => {
                const partner = getPartnerInfo(activeConversation);
                return (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs sm:text-sm truncate max-w-[150px] sm:max-w-[180px]">
                      {partner.name}
                    </span>
                    {renderRoleBadge(partner.role)}
                  </div>
                );
              })()
            ) : (
              <div>
                <h3 className="font-bold text-xs sm:text-sm">Tin nhắn Đạo Tâm</h3>
                <p className="text-[10px] text-pink-100 font-medium truncate">
                  Kết nối Độc Giả &amp; Tác Giả / Editor
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Cụm nút Thao tác: Thu nhỏ & Đóng */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition cursor-pointer"
            title="Thu nhỏ"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition cursor-pointer"
            title="Đóng (X)"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* =========================================================================
          NỘI DUNG CHÍNH (BODY)
         ========================================================================= */}
      {!isLoggedIn ? (
        /* CHƯA ĐĂNG NHẬP: BẮT BUỘC ĐĂNG NHẬP ĐỂ SỬ DỤNG CHAT */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-pink-50/30 dark:bg-slate-900">
          <div className="w-14 h-14 rounded-2xl bg-pink-100 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 flex items-center justify-center shadow-xs">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">
              Đăng nhập để nhắn tin
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
              Vui lòng đăng nhập để trao đổi trực tiếp với Tác giả / Editor của truyện.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onOpenLogin) onOpenLogin();
            }}
            className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-md shadow-pink-600/25 transition cursor-pointer"
          >
            Đăng Nhập Ngay
          </button>
        </div>
      ) : activeConversation ? (
        /* GIAO DIỆN PHÒNG CHAT TRỰC TIẾP */
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-950/30">
          
          {/* Thông báo vi phạm hoặc chính sách vai trò nếu có */}
          {errorMessage && (
            <div className="m-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed">{errorMessage}</div>
              <button 
                type="button" 
                onClick={() => setErrorMessage(null)} 
                className="text-rose-500 hover:text-rose-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Dải thông báo quy chuẩn bảo vệ */}
          <div className="px-3 py-1.5 bg-pink-50/80 dark:bg-pink-950/30 border-b border-pink-100 dark:border-pink-900/30 text-[10px] text-pink-700 dark:text-pink-300 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-pink-600" />
              <span>Kênh trao đổi riêng tư • Giữ gìn văn minh đọc truyện</span>
            </span>
          </div>

          {/* Danh sách tin nhắn cuộn */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs">
            {(messages?.length || 0) === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 space-y-2">
                <Sparkles className="w-8 h-8 text-pink-300 dark:text-pink-600" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Chưa có tin nhắn nào trong cuộc trò chuyện này.
                </p>
                <p className="text-[11px] text-slate-400">
                  Hãy gửi lời chào đầu tiên tới Tác giả / Độc giả nhé!
                </p>
              </div>
            ) : (
              (messages || []).map((msg) => {
                const isMe = msg.senderId === currentUser.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-2xs break-words ${
                        isMe
                          ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white rounded-br-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-pink-100/70 dark:border-slate-700 rounded-bl-xs'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-400 mt-0.5 px-1">
                      {new Date(msg.createdAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Ô nhập tin nhắn */}
          <form
            onSubmit={handleSendMessage}
            className="p-2.5 bg-white dark:bg-slate-900 border-t border-pink-100 dark:border-slate-800 flex items-center gap-2"
          >
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
              className={`p-2 rounded-full transition cursor-pointer flex items-center justify-center shrink-0 ${
                inputText.trim() && !isSending
                  ? 'bg-pink-600 hover:bg-pink-700 text-white shadow-sm'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
              title="Gửi tin nhắn"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>
      ) : (
        /* DANH SÁCH CUỘC HỘI THOẠI */
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30 dark:bg-slate-950/20">
          
          <div className="px-4 py-2.5 border-b border-pink-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Hộp thư ({conversations?.length || 0})</span>
            {isAdmin && (
              <span className="text-[10px] text-pink-600 font-bold bg-pink-100 dark:bg-pink-950 px-2 py-0.5 rounded-full">
                Admin
              </span>
            )}
          </div>

          {onOpenAdminSupport && (
            <div className="p-2.5 border-b border-pink-100 dark:border-slate-800 bg-pink-50/70 dark:bg-pink-950/25">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminSupport();
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold shadow-sm shadow-pink-600/20 flex items-center justify-between gap-2 transition cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Chat Hỗ Trợ Với Admin (24/7)</span>
                </span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-md font-semibold">
                  Mở chat
                </span>
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-pink-50 dark:divide-slate-800/60">
            {(conversations?.length || 0) === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-3 text-slate-400">
                <MessageSquare className="w-10 h-10 text-pink-200 dark:text-pink-900/60" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Chưa có cuộc trò chuyện nào
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs">
                    Vào trang hồ sơ Tác Giả / Editor và bấm nút &ldquo;Nhắn tin&rdquo; hoặc bấm nút &ldquo;Chat Hỗ Trợ Với Admin&rdquo; ở trên!
                  </p>
                </div>
              </div>
            ) : (
              (conversations || []).map((conv) => {
                const partner = getPartnerInfo(conv);
                const isUnread = conv.lastSenderId !== currentUser.id && conv.isRead === false;

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setActiveConversation(conv);
                      setErrorMessage(null);
                    }}
                    className={`p-3 flex items-center gap-3 transition-colors cursor-pointer ${
                      isUnread
                        ? 'bg-pink-50/70 dark:bg-pink-950/30 hover:bg-pink-100/70'
                        : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Avatar đối phương */}
                    <div className="relative shrink-0">
                      {partner.avatar ? (
                        <img
                          src={partner.avatar}
                          alt={partner.name}
                          className="w-10 h-10 rounded-full object-cover border border-pink-200 dark:border-slate-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 text-white font-bold text-sm flex items-center justify-center">
                          {partner.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {isUnread && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900" />
                      )}
                    </div>

                    {/* Tên & Tin nhắn cuối */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs truncate ${isUnread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
                          {partner.name}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString('vi-VN') : ''}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-[11px] truncate ${isUnread ? 'font-bold text-pink-700 dark:text-pink-300' : 'text-slate-500 dark:text-slate-400'}`}>
                          {conv.lastMessage || 'Bắt đầu cuộc trò chuyện...'}
                        </p>
                        {renderRoleBadge(partner.role)}
                      </div>
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
};
