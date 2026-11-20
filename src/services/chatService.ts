import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  updateDoc, 
  writeBatch,
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot, 
  Unsubscribe 
} from 'firebase/firestore';
import { db, checkIsAdmin, ADMIN_EMAILS } from '../firebase/config';
import { Conversation, ChatMessage, ChatParticipantInfo, ChatTargetUser } from '../types';

/**
 * Chuẩn hóa vai trò người dùng trong hệ thống Chat
 * - 'reader': Độc giả
 * - 'author': Tác giả sáng tác
 * - 'editor': Biên tập viên / dịch giả
 */
export function normalizeChatRole(role?: string, roleType?: string): 'reader' | 'author' | 'editor' {
  if (!role) return 'reader';
  const r = role.toLowerCase().trim();
  const rt = (roleType || '').toLowerCase().trim();

  if (rt === 'editor') return 'editor';
  if (rt === 'author') return 'author';

  if (r === 'author') return 'author';
  if (r === 'editor') return 'editor';
  return 'reader';
}

export interface ChatEligibilityResult {
  allowed: boolean;
  reason?: string;
  isSelf?: boolean;
}

/**
 * LUẬT TƯƠNG TÁC BẮT BUỘC (Role-based Restriction):
 * - Chỉ cho phép Độc giả (Reader) chat với Tác giả/Editor và ngược lại.
 * - TUYỆT ĐỐI CHẶN:
 *   1. Tác giả chat với Tác giả
 *   2. Editor chat với Editor
 *   3. Tác giả chat với Editor (và Editor chat với Tác giả)
 * - Ẩn nút nhắn tin và chặn xử lý nếu vi phạm.
 * - Ngoại lệ: 2 Quản trị viên tàng hình có thể giám sát hoặc phản hồi hỗ trợ.
 */
export function canChatTogether(
  userA: { id: string; role?: string; roleType?: string; email?: string },
  userB: { id: string; role?: string; roleType?: string; email?: string }
): ChatEligibilityResult {
  if (!userA?.id || !userB?.id) {
    return { allowed: false, reason: 'Chưa đủ thông tin người dùng.' };
  }

  if (userA.id === userB.id) {
    return { allowed: false, reason: 'Không thể tự trò chuyện với chính mình.', isSelf: true };
  }

  // Quản trị viên tàng hình hoặc hỗ trợ viên admin
  if (checkIsAdmin(userA.email) || checkIsAdmin(userB.email)) {
    return { allowed: true };
  }

  const roleA = normalizeChatRole(userA.role, userA.roleType);
  const roleB = normalizeChatRole(userB.role, userB.roleType);

  // 1. Tác giả chat với Tác giả -> CHẶN
  if (roleA === 'author' && roleB === 'author') {
    return { 
      allowed: false, 
      reason: 'Hệ thống Đạo Tâm chặn kết nối trực tiếp giữa Tác giả với Tác giả để bảo vệ bản quyền tác phẩm.' 
    };
  }

  // 2. Editor chat với Editor -> CHẶN
  if (roleA === 'editor' && roleB === 'editor') {
    return { 
      allowed: false, 
      reason: 'Hệ thống Đạo Tâm chặn kết nối trực tiếp giữa Editor với Editor.' 
    };
  }

  // 3. Tác giả chat với Editor / Editor chat với Tác giả -> CHẶN
  if ((roleA === 'author' && roleB === 'editor') || (roleA === 'editor' && roleB === 'author')) {
    return { 
      allowed: false, 
      reason: 'Quy chuẩn Đạo Tâm không cho phép Tác giả và Editor nhắn tin trực tiếp với nhau.' 
    };
  }

  // 4. Độc giả chat với Độc giả -> CHẶN ("Chỉ cho phép Độc giả chat với Tác giả/Editor và ngược lại")
  if (roleA === 'reader' && roleB === 'reader') {
    return { 
      allowed: false, 
      reason: 'Kênh chat trực tiếp chỉ dành cho kết nối giữa Độc giả và Tác giả / Editor.' 
    };
  }

  // Hợp lệ: Reader <-> Author hoặc Reader <-> Editor
  return { allowed: true };
}

/**
 * Sinh ID hội thoại tất định dựa trên 2 User ID
 * Giúp 2 người dù bấm từ trang nào cũng vào cùng một phòng chat duy nhất
 */
export function getDeterministicConversationId(uid1: string, uid2: string): string {
  const sorted = [uid1, uid2].sort();
  return `conv_${sorted[0]}_${sorted[1]}`;
}

/**
 * Lấy hoặc tạo mới cuộc hội thoại 1-1
 */
export async function getOrCreateConversation(
  currentUser: { id: string; displayName: string; avatarUrl?: string; role?: string; roleType?: string; email?: string },
  targetUser: { id: string; displayName: string; avatarUrl?: string; role?: string; roleType?: string; email?: string }
): Promise<Conversation> {
  const eligibility = canChatTogether(currentUser, targetUser);
  if (!eligibility.allowed) {
    throw new Error(eligibility.reason || 'Không đủ quyền thực hiện cuộc trò chuyện này.');
  }

  const convId = getDeterministicConversationId(currentUser.id, targetUser.id);
  const convRef = doc(db, 'conversations', convId);
  const snap = await getDoc(convRef);

  if (snap.exists()) {
    const data = snap.data() || {};
    return {
      id: convId,
      participants: Array.isArray(data.participants) ? data.participants : [currentUser.id, targetUser.id],
      participantDetails: data.participantDetails || {},
      lastMessage: data.lastMessage || '',
      lastSenderId: data.lastSenderId || '',
      lastSenderName: data.lastSenderName || '',
      isRead: data.isRead ?? true,
      updatedAt: data.updatedAt || Date.now(),
      createdAt: data.createdAt || Date.now(),
    };
  }

  // Tạo mới cuộc hội thoại
  const now = Date.now();
  const participantDetails: Record<string, ChatParticipantInfo> = {
    [currentUser.id]: {
      id: currentUser.id,
      displayName: currentUser.displayName || 'Người dùng',
      avatarUrl: currentUser.avatarUrl || '',
      email: currentUser.email || '',
      role: normalizeChatRole(currentUser.role, currentUser.roleType),
    },
    [targetUser.id]: {
      id: targetUser.id,
      displayName: targetUser.displayName || 'Tác giả/Editor',
      avatarUrl: targetUser.avatarUrl || '',
      email: targetUser.email || '',
      role: normalizeChatRole(targetUser.role, targetUser.roleType),
    },
  };

  const newConv: Conversation = {
    id: convId,
    participants: [currentUser.id, targetUser.id],
    participantDetails,
    lastMessage: '',
    lastSenderId: '',
    lastSenderName: '',
    isRead: true,
    updatedAt: now,
    createdAt: now,
  };

  await setDoc(convRef, newConv);
  return newConv;
}

// Cache chống gọi lặp đánh dấu đã đọc liên tiếp cho cùng conversation/message trong phiên
const recentMarkedConvMap = new Map<string, number>();

/**
 * Gửi tin nhắn mới vào cuộc hội thoại (Tối ưu: gộp add message + update conversation trong 1 writeBatch)
 */
export async function sendChatMessage(params: {
  conversationId: string;
  sender: { id: string; displayName: string; avatarUrl?: string; role?: string; roleType?: string; email?: string };
  recipient: { id: string; displayName?: string; avatarUrl?: string; role?: string; roleType?: string; email?: string };
  text: string;
}): Promise<void> {
  const textClean = params.text.trim();
  if (!textClean) return;

  const now = Date.now();
  const senderRole = normalizeChatRole(params.sender.role, params.sender.roleType);

  const batch = writeBatch(db);
  const newMsgRef = doc(collection(db, 'conversations', params.conversationId, 'messages'));
  const convRef = doc(db, 'conversations', params.conversationId);

  // 1. Thêm tin nhắn vào subcollection messages
  batch.set(newMsgRef, {
    conversationId: params.conversationId,
    senderId: params.sender.id,
    senderName: params.sender.displayName || 'Người dùng',
    senderAvatar: params.sender.avatarUrl || '',
    senderRole,
    text: textClean,
    createdAt: now,
    isRead: false,
  });

  // 2. Cập nhật cuộc hội thoại cha trong CÙNG 1 writeBatch
  batch.update(convRef, {
    lastMessage: textClean.slice(0, 200),
    lastSenderId: params.sender.id,
    lastSenderName: params.sender.displayName || 'Người dùng',
    isRead: false,
    updatedAt: now,
  });

  await batch.commit();
}

/**
 * Đánh dấu cuộc hội thoại & danh sách tin nhắn chưa đọc đã đọc (TỐI ƯU QUOTA: writeBatch + Guard chống lặp)
 * 🛑 PHÂN LOẠI RÕ 2 TRƯỜNG HỢP CHO ADMIN:
 * - Trường hợp 1 (Admin là người trong cuộc): UID có trong participants -> update isRead: true.
 * - Trường hợp 2 (Admin đang giám sát ẩn danh): UID KHÔNG CÓ trong participants -> TUYỆT ĐỐI KHÔNG Write.
 */
export async function markConversationAsRead(
  conversationId: string,
  currentUserId: string,
  currentUserEmail?: string | null,
  options?: {
    knownConversation?: Pick<Conversation, 'participants' | 'lastSenderId' | 'isRead'> | null;
    unreadMessageIds?: string[];
  }
): Promise<void> {
  if (!conversationId || !currentUserId) return;

  try {
    let participants: string[] = [];
    let lastSenderId = '';
    let convIsRead = true;

    if (options?.knownConversation) {
      participants = Array.isArray(options.knownConversation.participants)
        ? options.knownConversation.participants
        : [];
      lastSenderId = String(options.knownConversation.lastSenderId || '');
      convIsRead = options.knownConversation.isRead !== false;
    } else {
      const convRef = doc(db, 'conversations', conversationId);
      const snap = await getDoc(convRef);
      if (!snap.exists()) return;
      const data = snap.data();
      participants = Array.isArray(data.participants) ? data.participants : [];
      lastSenderId = String(data.lastSenderId || '');
      convIsRead = data.isRead !== false;
    }

    const isAdmin = checkIsAdmin(currentUserEmail);

    // TRƯỜNG HỢP 2 (Admin đang giám sát ẩn danh): TUYỆT ĐỐI KHÔNG update isRead
    if (isAdmin && !participants.includes(currentUserId)) {
      return;
    }

    const needMarkParent =
      Boolean(lastSenderId) && lastSenderId !== currentUserId && convIsRead === false;
    const unreadIds = Array.from(new Set((options?.unreadMessageIds || []).filter(Boolean)));

    if (!needMarkParent && unreadIds.length === 0) {
      return;
    }

    // Chống ghi lặp cho cùng trạng thái trong vòng 1500ms
    const dedupeKey = `${conversationId}:${currentUserId}:${needMarkParent ? '1' : '0'}:${unreadIds.join(',')}`;
    const prevTs = recentMarkedConvMap.get(dedupeKey) || 0;
    if (Date.now() - prevTs < 1500) {
      return;
    }
    recentMarkedConvMap.set(dedupeKey, Date.now());

    // Dùng 1 writeBatch duy nhất cho cả document cha + nhiều tin nhắn chưa đọc
    const batch = writeBatch(db);
    let ops = 0;

    if (needMarkParent) {
      batch.update(doc(db, 'conversations', conversationId), { isRead: true });
      ops += 1;
    }

    for (const msgId of unreadIds.slice(0, 450)) {
      batch.update(doc(db, 'conversations', conversationId, 'messages', msgId), { isRead: true });
      ops += 1;
    }

    if (ops > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn('[Chat] Lỗi khi đánh dấu đã đọc:', err);
  }
}


/**
 * Đọc 1 lần (getDocs) số lượng cuộc hội thoại có tin nhắn chưa đọc để tiết kiệm Quota Spark
 */
export async function fetchUnreadMessageCount(userId: string): Promise<number> {
  if (!userId || userId === 'guest') {
    return 0;
  }

  try {
    const convCol = collection(db, 'conversations');
    const q = query(convCol, where('participants', 'array-contains', userId), limit(20));
    const snapshot = await getDocs(q);
    let unread = 0;
    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.lastSenderId && d.lastSenderId !== userId && d.isRead === false) {
        unread += 1;
      }
    });
    return unread;
  } catch (error) {
    console.warn('[Chat] Lỗi khi kiểm tra unread message count:', error);
    return 0;
  }
}

/**
 * Lắng nghe realtime danh sách cuộc hội thoại của một người dùng (giới hạn limit 20)
 */
export function subscribeToUserConversations(
  userId: string,
  callback: (conversations: Conversation[]) => void
): Unsubscribe {
  if (!userId || userId === 'guest') {
    callback([]);
    return () => {};
  }

  const convCol = collection(db, 'conversations');
  const q = query(convCol, where('participants', 'array-contains', userId), limit(20));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Conversation[] = [];
      (snapshot?.docs || []).forEach((docSnap) => {
        const d = docSnap.data() || {};
        items.push({
          id: docSnap.id,
          participants: Array.isArray(d.participants) ? d.participants : [],
          participantDetails: d.participantDetails || {},
          lastMessage: d.lastMessage || '',
          lastSenderId: d.lastSenderId || '',
          lastSenderName: d.lastSenderName || '',
          isRead: d.isRead ?? true,
          updatedAt: d.updatedAt || 0,
          createdAt: d.createdAt || 0,
        });
      });
      // Sắp xếp cuộc trò chuyện có tin nhắn mới nhất lên đầu
      items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      callback(items);
    },
    (error) => {
      console.warn('[Chat] Lỗi khi nạp danh sách cuộc hội thoại:', error);
      callback([]);
    }
  );
}

/**
 * Lắng nghe realtime tin nhắn mới nhất của một cuộc hội thoại cụ thể (giới hạn limit 30)
 */
export function subscribeToConversationMessages(
  conversationId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  if (!conversationId) {
    callback([]);
    return () => {};
  }

  const messagesCol = collection(db, 'conversations', conversationId, 'messages');
  const q = query(messagesCol, orderBy('createdAt', 'desc'), limit(30));

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: ChatMessage[] = [];
      (snapshot?.docs || []).forEach((docSnap) => {
        const d = docSnap.data() || {};
        msgs.push({
          id: docSnap.id,
          conversationId,
          senderId: d.senderId || '',
          senderName: d.senderName || 'Người gửi',
          senderAvatar: d.senderAvatar || '',
          senderRole: d.senderRole || 'reader',
          text: d.text || '',
          createdAt: d.createdAt || Date.now(),
          isRead: d.isRead,
        });
      });
      callback(msgs.reverse());
    },
    (error) => {
      console.warn('[Chat] Lỗi khi nạp tin nhắn hội thoại:', error);
      callback([]);
    }
  );
}

/**
 * Dành riêng cho 2 Quản trị viên tàng hình: hoaamcac@gmail.com & meoyeutien22@gmail.com
 * Lắng nghe các cuộc trò chuyện mới nhất trên hệ thống để giám sát nội dung (giới hạn limit 30)
 */
export function subscribeToAllConversationsForAdmin(
  adminEmail: string | null | undefined,
  callback: (conversations: Conversation[]) => void
): Unsubscribe {
  if (!checkIsAdmin(adminEmail)) {
    console.warn('[Stealth Admin] Từ chối: Email không nằm trong danh sách Quản trị viên chính thức.');
    callback([]);
    return () => {};
  }

  const convCol = query(
    collection(db, 'conversations'),
    orderBy('updatedAt', 'desc'),
    limit(30)
  );

  return onSnapshot(
    convCol,
    (snapshot) => {
      const items: Conversation[] = [];
      (snapshot?.docs || []).forEach((docSnap) => {
        const d = docSnap.data() || {};
        items.push({
          id: docSnap.id,
          participants: Array.isArray(d.participants) ? d.participants : [],
          participantDetails: d.participantDetails || {},
          lastMessage: d.lastMessage || '',
          lastSenderId: d.lastSenderId || '',
          lastSenderName: d.lastSenderName || '',
          isRead: d.isRead ?? true,
          updatedAt: d.updatedAt || 0,
          createdAt: d.createdAt || 0,
        });
      });
      items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      callback(items);
    },
    (error) => {
      console.warn('[Stealth Admin] Lỗi khi nạp hội thoại giám sát:', error);
      callback([]);
    }
  );
}
