'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  limit,
  getDoc,
  getDocs,
  getCountFromServer,
  orderBy,
  where,
  doc,
  updateDoc,
  writeBatch,
  increment,
  arrayUnion,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Users,
  Search,
  Loader2,
  ShieldCheck,
  UserX,
  Lock,
  CheckCircle2,
  ArrowLeft,
  X,
  Coins,
  Gift,
  KeyRound,
  GitMerge,
} from 'lucide-react';
import Link from 'next/link';
import { db, auth } from '../../../lib/firebase';

const ADMIN_EMAILS: string[] = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

interface UserItem {
  id: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  role?: string;
  isAuthor?: boolean;
  isLocked?: boolean;
  isBanned?: boolean;
  status?: string;
  xuBalance?: number;
}

const getRolePriorityRank = (u: UserItem): number => {
  const emailLower = (u.email || '').toLowerCase().trim();
  const isAdmin =
    u.role === 'admin' || ADMIN_EMAILS.some((adm) => adm.toLowerCase().trim() === emailLower);
  if (isAdmin) return 0; // Admin ưu tiên sau tài khoản bị khóa
  if (u.role === 'author' || u.role === 'editor' || Boolean(u.isAuthor)) return 1; // Tác giả / Editor
  return 2; // Độc giả thường
};

const sortUsersAdminPriority = (items: UserItem[]): UserItem[] => {
  return [...(items || [])].sort((a, b) => {
    const aLocked = Boolean(a.isLocked || a.isBanned);
    const bLocked = Boolean(b.isLocked || b.isBanned);
    if (aLocked !== bLocked) return aLocked ? -1 : 1;

    const rankDiff = getRolePriorityRank(a) - getRolePriorityRank(b);
    if (rankDiff !== 0) return rankDiff;

    return (a.displayName || '').localeCompare(b.displayName || '', 'vi');
  });
};

const parseUserXu = (d: Record<string, any>): number => {
  const toNum = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v.trim().replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };
  return d.xuBalance !== undefined && d.xuBalance !== null
    ? Math.max(0, toNum(d.xuBalance))
    : 0;
};

const mapUserDoc = (d: QueryDocumentSnapshot<DocumentData>): UserItem => {
  const data = d.data();
  const locked = Boolean(
    data.isLocked === true ||
      data.isBanned === true ||
      data.status === 'Bị khóa' ||
      data.status === 'banned'
  );
  return {
    id: d.id,
    displayName: data.displayName || 'Chưa đặt tên',
    email: data.email || '',
    avatarUrl: data.avatarUrl,
    role: data.role || 'reader',
    isAuthor: Boolean(data.isAuthor),
    isLocked: locked,
    isBanned: locked,
    status: data.status,
    xuBalance: parseUserXu(data),
  };
};

export default function AdminUsersClient() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [lockedUsersCount, setLockedUsersCount] = useState<number>(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const wasSearchingRef = useRef(false);
  const [userFilterCategory, setUserFilterCategory] = useState<'all' | 'admin' | 'author' | 'reader' | 'banned'>('all');
  const [processingBanUid, setProcessingBanUid] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [donateTarget, setDonateTarget] = useState<UserItem | null>(null);
  const [donateAmount, setDonateAmount] = useState<string>('100');
  const [isDonating, setIsDonating] = useState(false);
  const [donateError, setDonateError] = useState<string | null>(null);
  const [grantTarget, setGrantTarget] = useState<UserItem | null>(null);
  const [grantNovelId, setGrantNovelId] = useState<string>('');
  const [grantChapterId, setGrantChapterId] = useState<string>('');
  const [isGranting, setIsGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [isMergingUsers, setIsMergingUsers] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const isAuthorizedAdmin = Boolean(
    currentUser &&
      currentUser.email &&
      ADMIN_EMAILS.some((adm) => adm.toLowerCase().trim() === currentUser.email?.toLowerCase().trim())
  );

  // Helper kiểm tra và in nổi bật lỗi thiếu Composite Index ra Console để click trực tiếp URL tạo Index
  const logFirestoreIndexError = (error: any, contextLabel: string): boolean => {
    const errorCode = String(error?.code || '').toLowerCase();
    const rawMessage = String(error?.message || error || '');
    const isMissingIndexError =
      errorCode === 'failed-precondition' ||
      errorCode.includes('failed-precondition') ||
      rawMessage.toLowerCase().includes('index') ||
      rawMessage.includes('The query requires an index');

    if (isMissingIndexError) {
      console.error(
        `====================================================================\n` +
          `🚨 [FIRESTORE COMPOSITE INDEX REQUIRED - ${contextLabel}]\n` +
          `Vui lòng CLICK TRỰC TIẾP vào đường link URL của Firebase bên dưới để tạo Index:\n\n` +
          `${rawMessage}\n` +
          `====================================================================`
      );
      console.error('[Raw Firebase Index Error Object]:', error);
      return true;
    }

    return false;
  };

  // Truy vấn đếm tổng số tài khoản bị khóa bằng getCountFromServer
  const fetchLockedCount = async () => {
    try {
      const usersCol = collection(db, 'users');
      const [lockedSnap, bannedSnap] = await Promise.all([
        getCountFromServer(query(usersCol, where('isLocked', '==', true))),
        getCountFromServer(query(usersCol, where('isBanned', '==', true))),
      ]);
      const count = Math.max(lockedSnap.data().count || 0, bannedSnap.data().count || 0);
      setLockedUsersCount(count);
    } catch (error: any) {
      if (!logFirestoreIndexError(error, 'fetchLockedCount')) {
        console.warn('Không thể đếm tài khoản bị khóa via getCountFromServer:', error);
      }
    }
  };

  // Query ưu tiên orderBy('isLocked', 'desc') và orderBy('role', 'asc') với phân trang gốc limit(25) & startAfter
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setFeedbackMsg(null);
    setIsSearchingServer(false);
    try {
      const usersCol = collection(db, 'users');

      await fetchLockedCount();

      let snap;
      try {
        // Truy vấn sắp xếp theo 2 trường cùng lúc (cần Composite Index trên Firestore)
        const orderedQuery = query(
          usersCol,
          orderBy('isLocked', 'desc'),
          orderBy('role', 'asc'),
          limit(25)
        );
        snap = await getDocs(orderedQuery);
      } catch (error: any) {
        const isIndexError = logFirestoreIndexError(error, 'loadUsers');
        if (isIndexError) {
          setFeedbackMsg({
            type: 'error',
            text: 'Truy vấn sắp xếp theo 2 trường (isLocked + role) đang thiếu Composite Index! Hãy mở Console (F12) để click trực tiếp vào link tạo Index của Firebase.',
          });
          // Fallback tạm thời để Admin vẫn xem được danh sách trong lúc chờ Index hoàn tất
          snap = await getDocs(query(usersCol, limit(25)));
        } else {
          throw error;
        }
      }

      const snapDocs = snap?.docs || [];
      const itemsMap = new Map<string, UserItem>();
      snapDocs.forEach((d) => {
        if (d.data()?.mergedInto) return;
        itemsMap.set(d.id, mapUserDoc(d));
      });

      // Bổ sung tương thích với user cũ chưa có trường isLocked trong Firestore
      if ((snapDocs?.length || 0) < 25) {
        const legacySnap = await getDocs(query(usersCol, limit(25)));
        const batch = writeBatch(db);
        let backfillCount = 0;

        (legacySnap?.docs || []).forEach((d) => {
          const data = d.data() || {};
          if (data.mergedInto) return;
          if (typeof data.isLocked !== 'boolean') {
            batch.update(d.ref, {
              isLocked: Boolean(data.isBanned === true || data.status === 'Bị khóa' || data.status === 'banned'),
            });
            backfillCount++;
          }
          if (!itemsMap.has(d.id)) {
            itemsMap.set(d.id, mapUserDoc(d));
          }
        });

        if (backfillCount > 0) {
          batch.commit().catch(() => {});
        }
      }

      const sortedItems = sortUsersAdminPriority(Array.from(itemsMap.values()));
      const lastDoc = (snapDocs?.length || 0) > 0 ? snapDocs[(snapDocs?.length || 0) - 1] : null;
      setLastVisibleDoc(lastDoc);
      setHasMore((snapDocs?.length || 0) === 25);
      setUsersList(Array.isArray(sortedItems) ? sortedItems : []);
    } catch (error: any) {
      if (!logFirestoreIndexError(error, 'loadUsers')) {
        console.error('Lỗi khi nạp danh sách user:', error);
      }
      setFeedbackMsg({
        type: 'error',
        text: `Không thể tải danh sách tài khoản: ${error?.message || 'Lỗi Firestore'}`,
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadMoreUsers = async () => {
    if (!lastVisibleDoc || isLoadingMore || !hasMore || isSearchingServer) return;
    setIsLoadingMore(true);
    try {
      const usersCol = collection(db, 'users');
      let snap;
      try {
        const q = query(
          usersCol,
          orderBy('isLocked', 'desc'),
          orderBy('role', 'asc'),
          startAfter(lastVisibleDoc),
          limit(25)
        );
        snap = await getDocs(q);
      } catch (error: any) {
        const isIndexError = logFirestoreIndexError(error, 'loadMoreUsers');
        if (isIndexError) {
          setFeedbackMsg({
            type: 'error',
            text: 'Truy vấn tải thêm người dùng đang thiếu Composite Index (isLocked + role). Hãy mở Console (F12) để click link tạo Index của Firebase.',
          });
          snap = await getDocs(query(usersCol, startAfter(lastVisibleDoc), limit(25)));
        } else {
          throw error;
        }
      }

      const snapDocs = snap?.docs || [];
      const newItems = (snapDocs || []).filter((d) => !d.data()?.mergedInto).map(mapUserDoc);

      const nextLastDoc = (snapDocs?.length || 0) > 0 ? snapDocs[(snapDocs?.length || 0) - 1] : null;
      setLastVisibleDoc(nextLastDoc);
      setHasMore((snapDocs?.length || 0) === 25);

      setUsersList((prev) => {
        const mergedMap = new Map<string, UserItem>();
        [...(prev || []), ...(newItems || [])].forEach((u) => mergedMap.set(u.id, u));
        return sortUsersAdminPriority(Array.from(mergedMap.values()));
      });
    } catch (error: any) {
      if (!logFirestoreIndexError(error, 'loadMoreUsers')) {
        console.error('Lỗi khi tải thêm danh sách user:', error);
      }
      setFeedbackMsg({
        type: 'error',
        text: `Không thể tải thêm tài khoản: ${error?.message || 'Lỗi Firestore'}`,
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  // SERVER-SIDE SEARCH CÓ GIỚI HẠN (Prefix Query trên trường email + limit 20 bảo vệ Quota Spark)
  const searchUsersByEmailPrefix = async (rawTerm: string) => {
    const searchTerm = rawTerm.trim().toLowerCase();
    if (!searchTerm) return;

    setIsLoadingUsers(true);
    setIsSearchingServer(true);
    setFeedbackMsg(null);
    try {
      const q = query(
        collection(db, 'users'),
        where('email', '>=', searchTerm),
        where('email', '<=', searchTerm + '\uf8ff'),
        limit(20)
      );
      const snap = await getDocs(q);
      const results = (snap?.docs || [])
        .filter((d) => !d.data()?.mergedInto)
        .map(mapUserDoc);

      setUsersList(sortUsersAdminPriority(results));
      setLastVisibleDoc(null);
      setHasMore(false);
    } catch (error: any) {
      if (!logFirestoreIndexError(error, 'searchUsersByEmailPrefix')) {
        console.error('[AdminUsersClient] Lỗi tìm kiếm server-side theo email:', error);
      }
      setFeedbackMsg({
        type: 'error',
        text: `Lỗi khi tìm kiếm người dùng trên máy chủ: ${error?.message || 'Lỗi Firestore'}`,
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isAuthorizedAdmin) {
      loadUsers();
    }
  }, [isAuthorizedAdmin]);

  // Theo dõi ô tìm kiếm: debounce Server-Side Prefix Query và tự động reset về phân trang gốc khi xóa trắng
  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    const trimmed = userSearchTerm.trim();

    if (!trimmed) {
      if (wasSearchingRef.current) {
        wasSearchingRef.current = false;
        setIsSearchingServer(false);
        setLastVisibleDoc(null);
        setHasMore(false);
        loadUsers();
      }
      return;
    }

    wasSearchingRef.current = true;
    const timer = setTimeout(() => {
      searchUsersByEmailPrefix(trimmed);
    }, 350);

    return () => clearTimeout(timer);
  }, [userSearchTerm, isAuthorizedAdmin]);

  const handleToggleBan = async (target: UserItem) => {
    if (!target.id) return;
    setProcessingBanUid(target.id);
    const nextLockStatus = !Boolean(target.isLocked || target.isBanned);
    try {
      const userRef = doc(db, 'users', target.id);
      await updateDoc(userRef, {
        isLocked: nextLockStatus,
        isBanned: nextLockStatus,
        status: nextLockStatus ? 'Bị khóa' : 'Hoạt động',
        bannedAt: nextLockStatus ? Date.now() : null,
      });

      setUsersList((prev) =>
        sortUsersAdminPriority(
          (prev || []).map((u) =>
            u.id === target.id
              ? {
                  ...u,
                  isLocked: nextLockStatus,
                  isBanned: nextLockStatus,
                  status: nextLockStatus ? 'Bị khóa' : 'Hoạt động',
                }
              : u
          )
        )
      );
      setLockedUsersCount((c) => Math.max(0, c + (nextLockStatus ? 1 : -1)));

      setFeedbackMsg({
        type: 'success',
        text: nextLockStatus
          ? `Đã khóa tài khoản "${target.displayName || target.email}".`
          : `Đã mở khóa tài khoản "${target.displayName || target.email}".`,
      });
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: `Lỗi cập nhật trạng thái khóa: ${err?.message || 'Thao tác thất bại'}`,
      });
    } finally {
      setProcessingBanUid(null);
    }
  };

  const handleOpenDonateModal = (target: UserItem) => {
    if (!isAuthorizedAdmin) return;
    setDonateTarget(target);
    setDonateAmount('100');
    setDonateError(null);
  };

  // PHÂN HỆ 3: Tặng Xu bằng WriteBatch (increment + tạo notification), cập nhật duy nhất 1 dòng state
  const handleConfirmDonate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!donateTarget?.id || !isAuthorizedAdmin) {
      setDonateError('Chỉ Quản trị viên hợp lệ mới được thực hiện thao tác Tặng Xu.');
      return;
    }

    const parsedAmount = Math.floor(Number(donateAmount.replace(/[^\d]/g, '')));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setDonateError('Vui lòng nhập số lượng Xu nguyên dương lớn hơn 0.');
      return;
    }

    setIsDonating(true);
    setDonateError(null);
    setFeedbackMsg(null);

    try {
      const now = Date.now();
      const formattedAmount = parsedAmount.toLocaleString('vi-VN');
      const message = `Bạn đã nhận được ${formattedAmount} Xu từ Quản trị viên`;
      const notifDocRef = doc(collection(db, 'notifications'));
      const notifPayload = {
        id: notifDocRef.id,
        userId: donateTarget.id,
        title: 'Quà tặng từ Quản trị viên',
        message,
        type: 'system',
        isRead: false,
        createdAt: now,
        amount: parsedAmount,
        adminEmail: currentUser?.email || '',
      };

      const batch = writeBatch(db);
      const userRef = doc(db, 'users', donateTarget.id);

      // 1. Cộng xu trực tiếp bằng increment() trên Firestore + lưu vào mảng notifications của user
      batch.update(userRef, {
        xuBalance: increment(parsedAmount),
        notifications: arrayUnion({
          id: notifDocRef.id,
          title: 'Quà tặng từ Quản trị viên',
          message,
          type: 'system',
          isRead: false,
          createdAt: now,
        }),
      });

      // 2. Tạo 1 document mới trong collection('notifications')
      batch.set(notifDocRef, notifPayload);

      await batch.commit();

      // Tối ưu Read: Chỉ cập nhật đúng 1 dòng user trong state, TUYỆT ĐỐI KHÔNG gọi lại loadUsers()
      setUsersList((prev) =>
        (prev || []).map((u) =>
          u.id === donateTarget.id
            ? { ...u, xuBalance: (u.xuBalance || 0) + parsedAmount }
            : u
        )
      );

      setFeedbackMsg({
        type: 'success',
        text: `Đã tặng thành công +${formattedAmount} Xu cho "${donateTarget.displayName || donateTarget.email}" và gửi thông báo.`,
      });
      setDonateTarget(null);
    } catch (err: any) {
      console.error('[AdminUsersClient] Lỗi khi tặng xu:', err);
      setDonateError(err?.message || 'Thao tác Tặng Xu thất bại. Vui lòng thử lại.');
    } finally {
      setIsDonating(false);
    }
  };

  const handleOpenGrantModal = (target: UserItem) => {
    if (!isAuthorizedAdmin) return;
    setGrantTarget(target);
    setGrantNovelId('');
    setGrantChapterId('');
    setGrantError(null);
  };

  // PHÂN HỆ 4: Cấp Quyền Truyện (Đền bù) bằng arrayUnion() trên purchasedChapters — TUYỆT ĐỐI KHÔNG chạm xuBalance
  const handleConfirmGrantStory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!grantTarget?.id || !isAuthorizedAdmin) {
      setGrantError('Chỉ Quản trị viên hợp lệ mới được thực hiện thao tác Cấp Quyền Truyện.');
      return;
    }

    const cleanNovelId = grantNovelId.trim();
    const rawChapters = grantChapterId
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const idsToGrant: string[] = [];
    if (cleanNovelId && rawChapters.length === 0) {
      idsToGrant.push(cleanNovelId);
    } else if (cleanNovelId && rawChapters.length > 0) {
      for (const chId of rawChapters) {
        idsToGrant.push(chId.includes(':') ? chId : `${cleanNovelId}:${chId}`);
      }
    } else if (!cleanNovelId && rawChapters.length > 0) {
      for (const chId of rawChapters) {
        idsToGrant.push(chId);
      }
    }

    if (idsToGrant.length === 0) {
      setGrantError('Vui lòng nhập ID Truyện và/hoặc ID Chương cần cấp quyền.');
      return;
    }

    setIsGranting(true);
    setGrantError(null);
    setFeedbackMsg(null);

    try {
      const userRef = doc(db, 'users', grantTarget.id);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        throw new Error('Không tìm thấy tài khoản người dùng trên Firestore.');
      }

      const uData = userSnap.data() as Record<string, any>;
      const now = Date.now();
      const notifDocRef = doc(collection(db, 'notifications'));
      const labelText = cleanNovelId
        ? rawChapters.length > 0
          ? `truyện "${cleanNovelId}" (chương: ${rawChapters.join(', ')})`
          : `toàn bộ truyện "${cleanNovelId}"`
        : `mục "${rawChapters.join(', ')}"`;

      const notifItem = {
        id: notifDocRef.id,
        title: 'Quản trị viên đã cấp quyền đọc truyện',
        message: `Bạn vừa được Quản trị viên cấp quyền truy cập ${labelText}. Chúc bạn đọc truyện vui vẻ!`,
        type: 'system',
        isRead: false,
        createdAt: now,
      };

      // Nếu user cũ lưu purchasedChapters dạng Object Map thay vì Array, chuẩn hóa về Array để dùng arrayUnion an toàn
      if (uData.purchasedChapters && !Array.isArray(uData.purchasedChapters)) {
        const legacyList: string[] = [];
        for (const [k, v] of Object.entries(uData.purchasedChapters)) {
          if (Array.isArray(v)) {
            v.forEach((c) => {
              if (c) legacyList.push(k === '__legacy__' ? String(c) : `${k}:${c}`);
            });
          }
        }
        await updateDoc(userRef, {
          purchasedChapters: Array.from(new Set([...legacyList, ...idsToGrant])),
          notifications: arrayUnion(notifItem),
        });
      } else {
        await updateDoc(userRef, {
          purchasedChapters: arrayUnion(...idsToGrant),
          notifications: arrayUnion(notifItem),
        });
      }

      setFeedbackMsg({
        type: 'success',
        text: `Đã cấp quyền truyện (${idsToGrant.join(', ')}) cho "${grantTarget.displayName || grantTarget.email}" mà không đụng chạm tới số dư Xu.`,
      });
      setGrantTarget(null);
    } catch (err: any) {
      console.error('[AdminUsersClient] Lỗi khi cấp quyền truyện:', err);
      setGrantError(err?.message || 'Thao tác Cấp Quyền Truyện thất bại. Vui lòng thử lại.');
    } finally {
      setIsGranting(false);
    }
  };

  /**
   * SANITIZE DATA TRƯỚC KHI GHI FIRESTORE:
   * - Lặp qua tất cả key của Object (đệ quy), xóa bỏ (delete) toàn bộ các key bắt đầu và kết thúc bằng "__"
   *   (ví dụ: __legacy__) để tránh lỗi Firestore: "Document fields cannot begin and end with __".
   * - Đồng thời loại bỏ giá trị undefined / NaN để WriteBatch luôn hợp lệ 100%.
   */
  const sanitizeFirestoreObject = <T,>(input: T): T => {
    if (input === null || input === undefined) return input;
    if (typeof input === 'number') {
      return (Number.isNaN(input) ? 0 : input) as unknown as T;
    }
    if (typeof input !== 'object') return input;
    if (input instanceof Date) return input;

    if (Array.isArray(input)) {
      return input
        .filter((item) => item !== undefined)
        .map((item) => sanitizeFirestoreObject(item)) as unknown as T;
    }

    const proto = Object.getPrototypeOf(input);
    if (proto !== null && proto !== Object.prototype) {
      return input;
    }

    const sanitized: Record<string, any> = { ...(input as Record<string, any>) };
    for (const key of Object.keys(sanitized)) {
      if ((key.startsWith('__') && key.endsWith('__')) || sanitized[key] === undefined) {
        delete sanitized[key];
        continue;
      }
      sanitized[key] = sanitizeFirestoreObject(sanitized[key]);
    }
    return sanitized as T;
  };

  /**
   * DỌN DẸP HẬU QUẢ CŨ (SCRIPT GỘP TÀI KHOẢN TRÙNG EMAIL TRONG ADMIN):
   * - Lấy toàn bộ user, gom nhóm theo trường email. Nếu email nào có > 1 document thì gộp.
   * - Chọn Document Chính (ưu tiên giao dịch mới nhất hoặc UID của Firebase) & Document Phụ (thường là usr-...).
   * - Gộp Xu: xuBalance(Chính) = xuBalance(Chính) + xuBalance(Phụ).
   * - Gộp Truyện: Nối mảng purchasedChapters và unlockedFullBooks bằng Set để loại trùng lặp.
   * - Sanitize Data: Xóa toàn bộ key __*__ (ví dụ unlockedChapters.__legacy__) trước khi batch.update() & batch.commit().
   * - Tiêu diệt Document Phụ: Gán isLocked: true và status: 'banned' (kèm mergedInto) vào Document Phụ.
   * - Bọc trong writeBatch an toàn và commit.
   */
  const mergeDuplicateUsers = async () => {
    if (!isAuthorizedAdmin || isMergingUsers) return;
    setIsMergingUsers(true);
    setFeedbackMsg(null);

    const toNum = (v: unknown): number => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const parsed = Number(v.trim().replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const getLatestTxTime = (data: Record<string, any>): number => {
      let maxTs = toNum(data.lastTransactionAt);
      if (Array.isArray(data.purchases)) {
        for (const p of data.purchases) {
          const ts = toNum(p?.purchasedAt) || toNum(p?.createdAt);
          if (ts > maxTs) maxTs = ts;
        }
      }
      return maxTs;
    };

    const extractChapterEntries = (data: Record<string, any>): string[] => {
      const items = new Set<string>();
      for (const src of [data.purchasedChapters, data.unlockedChapters, data.boughtChapters]) {
        if (!src) continue;
        if (Array.isArray(src)) {
          for (const item of src) {
            if (typeof item === 'string' || typeof item === 'number') {
              const s = String(item).trim();
              if (s) items.add(s);
            } else if (item && typeof item === 'object') {
              const nId = item.novelId || item.storyId || item.bookId;
              const cId = item.chapterId || item.id || (item.chapterNumber !== undefined ? `c${item.chapterNumber}` : '');
              if (nId && cId) items.add(`${nId}:${cId}`);
              else if (nId) items.add(String(nId));
            }
          }
        } else if (typeof src === 'object') {
          for (const [novelId, chList] of Object.entries(src)) {
            if (Array.isArray(chList)) {
              for (const ch of chList) {
                if (ch) items.add(novelId === '__legacy__' ? String(ch) : `${novelId}:${String(ch)}`);
              }
            }
          }
        }
      }
      return Array.from(items);
    };

    const extractChapterMap = (data: Record<string, any>): Record<string, string[]> => {
      const map: Record<string, string[]> = {};
      const add = (nId: string, cId: string) => {
        // Không ghi key dạng __*__ (ví dụ __legacy__) vào map để tránh lỗi Firestore reserved field
        if (!nId || !cId || (nId.startsWith('__') && nId.endsWith('__'))) return;
        const prev = map[nId] || [];
        if (!prev.includes(cId)) map[nId] = [...prev, cId];
      };
      for (const src of [data.purchasedChapters, data.unlockedChapters, data.boughtChapters]) {
        if (!src) continue;
        if (Array.isArray(src)) {
          for (const item of src) {
            if (typeof item === 'string' || typeof item === 'number') {
              const raw = String(item).trim();
              const m = raw.match(/^([^:/|]+)[:/|](.+)$/);
              if (m) add(m[1], m[2]);
            } else if (item && typeof item === 'object') {
              const nId = item.novelId || item.storyId || item.bookId;
              const cId = item.chapterId || item.id || (item.chapterNumber !== undefined ? `c${item.chapterNumber}` : '');
              if (nId && cId) add(String(nId), String(cId));
            }
          }
        } else if (typeof src === 'object') {
          for (const [nId, list] of Object.entries(src)) {
            if (nId.startsWith('__') && nId.endsWith('__')) continue;
            if (Array.isArray(list)) {
              list.forEach((c) => {
                if (c) add(nId, String(c));
              });
            }
          }
        }
      }
      return map;
    };

    try {
      const allSnap = await getDocs(collection(db, 'users'));
      const groups = new Map<string, QueryDocumentSnapshot<DocumentData>[]>();

      allSnap.docs.forEach((d) => {
        const data = d.data() || {};
        if (data.mergedInto) return; // Đã gộp ở lần chạy trước -> bỏ qua
        const email = String(data.email || '').trim().toLowerCase();
        if (!email) return;
        const arr = groups.get(email) || [];
        arr.push(d);
        groups.set(email, arr);
      });

      const now = Date.now();
      let batch = writeBatch(db);
      let batchOps = 0;

      const flushBatchIfNeeded = async (neededOps: number) => {
        if (batchOps + neededOps >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          batchOps = 0;
        }
      };

      let mergedEmailCount = 0;
      let killedSecondaryCount = 0;
      let totalXuAddedFromSecondaries = 0;

      for (const [email, docs] of groups.entries()) {
        if (docs.length <= 1) continue;

        // Chọn Document Chính: ưu tiên doc có giao dịch mới nhất hoặc UID của Firebase (không phải usr-)
        const sortedDocs = [...docs].sort((a, b) => {
          const da = a.data() || {};
          const dbData = b.data() || {};

          const aLocked = Boolean(da.isLocked === true || da.isBanned === true || da.status === 'banned');
          const bLocked = Boolean(dbData.isLocked === true || dbData.isBanned === true || dbData.status === 'banned');
          if (aLocked !== bLocked) return aLocked ? 1 : -1;

          const aTx = getLatestTxTime(da);
          const bTx = getLatestTxTime(dbData);
          if (aTx !== bTx) return bTx - aTx;

          const aIsFirebaseUid = !a.id.startsWith('usr-') && !a.id.startsWith('g-');
          const bIsFirebaseUid = !b.id.startsWith('usr-') && !b.id.startsWith('g-');
          if (aIsFirebaseUid !== bIsFirebaseUid) return aIsFirebaseUid ? -1 : 1;

          return (toNum(dbData.lastLogin) || 0) - (toNum(da.lastLogin) || 0);
        });

        const primaryDoc = sortedDocs[0];
        const secondaryDocs = sortedDocs.slice(1);
        const primaryData = primaryDoc.data() || {};

        let mergedXu = parseUserXu(primaryData);
        let mergedEarned = Math.max(0, toNum(primaryData.authorEarnedXu));
        const mergedChaptersSet = new Set<string>(extractChapterEntries(primaryData));
        const mergedUnlockedMap = extractChapterMap(primaryData);
        const mergedFullBooksSet = new Set<string>(
          Array.isArray(primaryData.unlockedFullBooks)
            ? primaryData.unlockedFullBooks.map((id: any) => String(id)).filter(Boolean)
            : []
        );

        let resolvedUid =
          (!primaryDoc.id.startsWith('usr-') && !primaryDoc.id.startsWith('g-') ? primaryDoc.id : '') ||
          String(primaryData.uid || '');

        for (const secDoc of secondaryDocs) {
          const secData = secDoc.data() || {};
          const secXu = parseUserXu(secData);
          const secEarned = Math.max(0, toNum(secData.authorEarnedXu));

          // Gộp Xu: xuBalance(Chính) = xuBalance(Chính) + xuBalance(Phụ)
          mergedXu = parseFloat((mergedXu + secXu).toFixed(2));
          mergedEarned = parseFloat((mergedEarned + secEarned).toFixed(2));
          totalXuAddedFromSecondaries = parseFloat((totalXuAddedFromSecondaries + secXu).toFixed(2));

          // Gộp Truyện bằng Set loại bỏ trùng lặp (giữ nguyên toàn bộ entry kể cả dạng legacy trong purchasedChapters)
          extractChapterEntries(secData).forEach((entry) => mergedChaptersSet.add(entry));
          const secMap = extractChapterMap(secData);
          for (const [nId, list] of Object.entries(secMap)) {
            const cur = mergedUnlockedMap[nId] || [];
            mergedUnlockedMap[nId] = Array.from(new Set([...cur, ...list]));
          }
          if (Array.isArray(secData.unlockedFullBooks)) {
            secData.unlockedFullBooks.forEach((bookId: any) => {
              if (bookId) mergedFullBooksSet.add(String(bookId));
            });
          }

          if (!resolvedUid) {
            if (!secDoc.id.startsWith('usr-') && !secDoc.id.startsWith('g-')) {
              resolvedUid = secDoc.id;
            } else if (secData.uid && !String(secData.uid).startsWith('usr-')) {
              resolvedUid = String(secData.uid);
            }
          }
        }

        // BƯỚC SANITIZE DATA BẮT BUỘC: Xóa bỏ toàn bộ key dạng __*__ (ví dụ: __legacy__) trước khi batch.update()
        const cleanUnlockedMap = sanitizeFirestoreObject(mergedUnlockedMap);
        const primaryUpdatePayload = sanitizeFirestoreObject({
          email,
          xuBalance: mergedXu,
          coins: mergedXu,
          authorEarnedXu: mergedEarned,
          purchasedChapters: Array.from(mergedChaptersSet),
          unlockedChapters: cleanUnlockedMap,
          unlockedFullBooks: Array.from(mergedFullBooksSet),
          ...(resolvedUid ? { uid: resolvedUid } : {}),
          isLocked: false,
          isBanned: false,
          status: 'Hoạt động',
          updatedAt: now,
        });

        await flushBatchIfNeeded(1 + secondaryDocs.length);

        // Cập nhật Document Chính với dữ liệu đã làm sạch 100%
        batch.update(primaryDoc.ref, primaryUpdatePayload);
        batchOps += 1;

        // Tiêu diệt Document Phụ: Gán isLocked: true và status: 'banned'
        for (const secDoc of secondaryDocs) {
          const secondaryUpdatePayload = sanitizeFirestoreObject({
            isLocked: true,
            isBanned: true,
            status: 'banned',
            xuBalance: 0,
            coins: 0,
            authorEarnedXu: 0,
            mergedInto: primaryDoc.id,
            mergedAt: now,
          });
          batch.update(secDoc.ref, secondaryUpdatePayload);
          batchOps += 1;
        }

        mergedEmailCount += 1;
        killedSecondaryCount += secondaryDocs.length;
      }

      if (batchOps > 0) {
        await batch.commit();
      }

      setFeedbackMsg({
        type: 'success',
        text:
          mergedEmailCount === 0
            ? 'Hệ thống sạch! Không phát hiện tài khoản nào bị trùng email.'
            : `Đã gộp thành công ${mergedEmailCount} email trùng (${killedSecondaryCount} document phụ đã bị khóa & gộp +${totalXuAddedFromSecondaries.toLocaleString('vi-VN')} Xu vào tài khoản chính).`,
      });

      if (userSearchTerm.trim()) {
        await searchUsersByEmailPrefix(userSearchTerm);
      } else {
        await loadUsers();
      }
    } catch (err: any) {
      console.error('[AdminUsersClient] Lỗi mergeDuplicateUsers:', err);
      setFeedbackMsg({
        type: 'error',
        text: `Lỗi khi gộp tài khoản trùng: ${err?.message || 'Thao tác thất bại'}`,
      });
    } finally {
      setIsMergingUsers(false);
    }
  };

  const filteredUsers = (usersList || []).filter((u) => {
    const isAdmin = Boolean(u.email && ADMIN_EMAILS.some((adm) => adm.toLowerCase().trim() === u.email?.toLowerCase().trim()));
    const isAuthor = u.role === 'author' || u.role === 'editor' || Boolean(u.isAuthor);
    const isReader = !isAdmin && !isAuthor;
    const isLocked = Boolean(u.isLocked || u.isBanned);

    if (userFilterCategory === 'admin') return isAdmin;
    if (userFilterCategory === 'author') return isAuthor;
    if (userFilterCategory === 'reader') return isReader;
    if (userFilterCategory === 'banned') return isLocked;
    return true;
  });

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 text-pink-600 animate-spin" />
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <ShieldCheck className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">Truy Cập Bị Giới Hạn</h2>
        <p className="text-sm text-slate-500 max-w-md mt-2">
          Khu vực quản lý tài khoản chỉ dành riêng cho Quản trị viên hệ thống (hoaamcac@gmail.com, meoyeutien22@gmail.com).
        </p>
        <Link
          href="/"
          className="mt-6 px-4 py-2 rounded-xl bg-pink-600 text-white font-bold text-xs hover:bg-pink-700 transition"
        >
          Quay lại Trang Chủ
        </Link>
      </div>
    );
  }

  const displayedLockedCount = Math.max(
    lockedUsersCount,
    (usersList || []).filter((u) => Boolean(u.isLocked || u.isBanned))?.length || 0
  );

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-pink-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-900/60 text-slate-600 hover:text-pink-600 shadow-xs transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
                Quản Lý Người Dùng &amp; Tài Khoản
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ưu tiên hiển thị tài khoản bị khóa ở Trang 1, sau đó sắp xếp theo Admin / Tác giả / Độc giả
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Nút thống kê nổi bật từ getCountFromServer */}
            <button
              type="button"
              onClick={() => setUserFilterCategory((prev) => (prev === 'banned' ? 'all' : 'banned'))}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer border shadow-xs ${
                userFilterCategory === 'banned'
                  ? 'bg-rose-600 text-white border-rose-700'
                  : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Tài khoản bị khóa: {displayedLockedCount}</span>
            </button>

            <button
              type="button"
              onClick={mergeDuplicateUsers}
              disabled={isMergingUsers || isLoadingUsers}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="Quét toàn bộ user, gộp Xu & truyện của tài khoản trùng email và khóa document phụ"
            >
              {isMergingUsers ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang gộp...</span>
                </>
              ) : (
                <>
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>Đồng Bộ &amp; Gộp Tài Khoản</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (userSearchTerm.trim()) {
                  searchUsersByEmailPrefix(userSearchTerm);
                } else {
                  loadUsers();
                }
              }}
              disabled={isLoadingUsers}
              className="px-3.5 py-2 rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              {isLoadingUsers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Làm mới dữ liệu</span>}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm toàn hệ thống theo tiền tố Email (ví dụ: abc@gmail.com) - tối đa 20 kết quả..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-pink-200/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
            {userSearchTerm && (
              <button
                type="button"
                onClick={() => setUserSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition cursor-pointer"
                title="Xóa tìm kiếm và quay lại phân trang gốc"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1 scrollbar-none">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'banned', label: 'Bị khóa' },
              { id: 'admin', label: 'Admin' },
              { id: 'author', label: 'Tác giả' },
              { id: 'reader', label: 'Độc giả' },
            ]?.map((tab) => {
              const isActive = userFilterCategory === tab.id;
              const safeUsers = usersList || [];
              const count =
                tab.id === 'all'
                  ? safeUsers?.length || 0
                  : tab.id === 'admin'
                  ? (safeUsers.filter((u) => u.email && ADMIN_EMAILS.includes(u.email.toLowerCase().trim()))?.length || 0)
                  : tab.id === 'author'
                  ? (safeUsers.filter((u) => u.role === 'author' || u.role === 'editor' || Boolean(u.isAuthor))?.length || 0)
                  : tab.id === 'reader'
                  ? (safeUsers.filter(
                      (u) =>
                        (!u.email || !ADMIN_EMAILS.includes(u.email.toLowerCase().trim())) &&
                        u.role !== 'author' &&
                        u.role !== 'editor' &&
                        !u.isAuthor
                    )?.length || 0)
                  : displayedLockedCount;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setUserFilterCategory(tab.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-pink-600 text-white font-extrabold shadow-sm shadow-pink-600/30'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {feedbackMsg && (
          <div
            className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between gap-3 ${
              feedbackMsg.type === 'error'
                ? 'bg-yellow-400 text-yellow-950 border-2 border-yellow-500 font-bold'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="p-1 hover:bg-black/10 rounded-lg text-xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {isLoadingUsers && (usersList?.length || 0) === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-pink-600" />
              <p className="text-xs font-medium">Đang tải danh sách tài khoản từ Firestore...</p>
            </div>
          ) : (filteredUsers?.length || 0) === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy người dùng nào phù hợp</p>
              <p className="text-xs">Thử chuyển sang bộ lọc &quot;Tất cả&quot; hoặc xóa bớt từ khóa tìm kiếm.</p>
            </div>
          ) : (
            <>
              <div className="w-full overflow-x-auto whitespace-nowrap">
                <table className="w-full min-w-[780px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-pink-100 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">Thành Viên</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4 text-center">Chức Danh</th>
                      <th className="py-3 px-4 text-center">Trạng Thái</th>
                      <th className="py-3 px-4 text-right">Số Xu</th>
                      <th className="py-3 px-4 text-right">Thao Tác Quản Trị</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {(filteredUsers || []).map((target) => {
                      const isSelf = target.id === currentUser?.uid;
                      const isBanned = Boolean(target.isLocked || target.isBanned);
                      const isProcessing = processingBanUid === target.id;
                      const isAdminRole = Boolean(target.email && ADMIN_EMAILS.includes(target.email.toLowerCase().trim()));

                      const roleText = isAdminRole
                        ? 'Admin'
                        : target.role === 'author'
                        ? 'Tác giả'
                        : target.role === 'editor'
                        ? 'Tác giả - Editor'
                        : 'Độc giả';
                      const roleBadgeClass =
                        roleText === 'Admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200'
                          : target.role === 'author'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200'
                          : target.role === 'editor'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200';

                      return (
                        <tr
                          key={target.id}
                          className={`hover:bg-pink-50/20 dark:hover:bg-slate-800/40 transition-colors ${
                            isBanned ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={target.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${target.id}`}
                                alt={target.displayName || 'Avatar'}
                                className="w-10 h-10 rounded-full object-cover border border-pink-200 dark:border-pink-900/60 bg-slate-100 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                  <span>{target.displayName}</span>
                                  {isSelf && (
                                    <span className="text-[10px] bg-pink-100 text-pink-700 px-1.5 py-0.2 rounded font-extrabold">
                                      Bạn
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  UID: {target.id.slice(0, 12)}...
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {target.email || 'Không có email'}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${roleBadgeClass}`}>
                              {roleText}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center">
                            {isBanned ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300">
                                <Lock className="w-3 h-3 text-rose-600" />
                                <span>Bị khóa</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Hoạt động</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <span className="inline-flex items-center justify-end gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/70 font-black tabular-nums">
                              <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>{(target.xuBalance ?? 0).toLocaleString('vi-VN')} Xu</span>
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleOpenDonateModal(target)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs shadow-emerald-500/20 transition cursor-pointer"
                                title="Tặng Xu cho thành viên này"
                              >
                                <Gift className="w-3.5 h-3.5 shrink-0" />
                                <span>Tặng Xu</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenGrantModal(target)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs shadow-indigo-500/20 transition cursor-pointer"
                                title="Cấp quyền đọc truyện / chương đền bù (không thay đổi Xu)"
                              >
                                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                                <span>Cấp Quyền Truyện</span>
                              </button>

                              {isSelf ? (
                                <span className="text-[11px] text-slate-400 italic px-1">Tài khoản bạn</span>
                              ) : isBanned ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleBan(target)}
                                  disabled={isProcessing}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 border border-slate-300 font-bold text-xs transition disabled:opacity-50 cursor-pointer"
                                >
                                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                                  <span>Mở khóa</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleBan(target)}
                                  disabled={isProcessing}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white dark:bg-rose-950/40 dark:hover:bg-rose-700 dark:text-rose-300 font-bold text-xs border border-rose-200 transition disabled:opacity-50 cursor-pointer"
                                >
                                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                                  <span>Khóa vĩnh viễn</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-pink-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isSearchingServer ? (
                    <>
                      Kết quả tìm kiếm máy chủ theo tiền tố email: <span className="font-bold text-pink-600">{filteredUsers?.length || 0}</span> (giới hạn tối đa 20)
                    </>
                  ) : (
                    <>
                      Hiển thị <span className="font-bold text-slate-800 dark:text-slate-200">{filteredUsers?.length || 0}</span> / tổng{' '}
                      <span className="font-bold text-slate-800 dark:text-slate-200">{usersList?.length || 0}</span> tài khoản đã tải
                    </>
                  )}
                </span>

                {isSearchingServer ? (
                  <button
                    type="button"
                    onClick={() => setUserSearchTerm('')}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Xóa tìm kiếm &amp; về phân trang gốc (limit 25)</span>
                  </button>
                ) : hasMore ? (
                  <button
                    type="button"
                    onClick={loadMoreUsers}
                    disabled={isLoadingMore}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang tải thêm 25 tài khoản...</span>
                      </>
                    ) : (
                      <span>Tải thêm (+25 tài khoản)</span>
                    )}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 italic">Đã nạp toàn bộ danh sách tài khoản</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Tặng Xu (Donate Coins) dành cho Quản trị viên */}
      {donateTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            if (!isDonating) setDonateTarget(null);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-900/70 shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 shrink-0" />
                <h3 className="font-black text-sm">Tặng Xu Cho Thành Viên</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isDonating) setDonateTarget(null);
                }}
                disabled={isDonating}
                className="p-1 rounded-lg hover:bg-white/20 text-white transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDonate} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                    {donateTarget.displayName || 'Chưa đặt tên'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {donateTarget.email || donateTarget.id}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Hiện có</span>
                  <span className="text-xs font-black text-amber-600 dark:text-amber-400 tabular-nums">
                    {(donateTarget.xuBalance || 0).toLocaleString('vi-VN')} Xu
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Số lượng Xu muốn tặng
                </label>
                <div className="relative">
                  <Coins className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={donateAmount}
                    onChange={(e) => setDonateAmount(e.target.value)}
                    placeholder="Nhập số Xu (VD: 500)"
                    disabled={isDonating}
                    className="w-full pl-9 pr-12 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400">
                    Xu
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[100, 500, 1000, 5000]?.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={isDonating}
                      onClick={() => setDonateAmount(String(preset))}
                      className={`py-1.5 rounded-lg text-[11px] font-extrabold border transition cursor-pointer ${
                        donateAmount === String(preset)
                          ? 'bg-emerald-500 text-white border-emerald-600'
                          : 'bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      +{preset.toLocaleString('vi-VN')}
                    </button>
                  ))}
                </div>
              </div>

              {donateError && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold">
                  {donateError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDonating}
                  onClick={() => setDonateTarget(null)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isDonating}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-md shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {isDonating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang tặng...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác nhận tặng</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cấp Quyền Truyện (Đền bù) dành cho Quản trị viên — KHÔNG chạm xuBalance */}
      {grantTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            if (!isGranting) setGrantTarget(null);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/70 shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 shrink-0" />
                <h3 className="font-black text-sm">Cấp Quyền Truyện / Chương (Đền Bù)</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isGranting) setGrantTarget(null);
                }}
                disabled={isGranting}
                className="p-1 rounded-lg hover:bg-white/20 text-white transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmGrantStory} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                    {grantTarget.displayName || 'Chưa đặt tên'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {grantTarget.email || grantTarget.id}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                  Giữ nguyên Xu
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ID Truyện
                </label>
                <input
                  type="text"
                  value={grantNovelId}
                  onChange={(e) => setGrantNovelId(e.target.value)}
                  placeholder="Nhập ID Truyện (VD: novel-123)"
                  disabled={isGranting}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ID Chương (tùy chọn — bỏ trống để cấp trọn bộ truyện)
                </label>
                <input
                  type="text"
                  value={grantChapterId}
                  onChange={(e) => setGrantChapterId(e.target.value)}
                  placeholder="VD: c5 hoặc ch-1, ch-2 (ngăn cách bằng dấu phẩy)"
                  disabled={isGranting}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Dùng <code className="font-mono font-bold">arrayUnion()</code> đẩy ID vào <code className="font-mono font-bold">purchasedChapters</code> và không thay đổi <code className="font-mono font-bold">xuBalance</code>.
                </p>
              </div>

              {grantError && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold">
                  {grantError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isGranting}
                  onClick={() => setGrantTarget(null)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isGranting}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {isGranting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang cấp quyền...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác nhận cấp quyền</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
