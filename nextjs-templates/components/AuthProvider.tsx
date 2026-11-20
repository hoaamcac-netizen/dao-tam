'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { checkIsAdmin } from '../lib/config';

// [QUOTA GUARD] Chỉ cập nhật lastLogin/lastSeen tối đa 1 lần mỗi 5 phút cho mỗi user
const LAST_PRESENCE_COOLDOWN_MS = 5 * 60 * 1000;
const lastPresenceWriteByUid = new Map<string, number>();

export interface AuthNotificationItem {
  id: string;
  title: string;
  message: string;
  type?: string;
  createdAt: number;
  isRead: boolean;
}

export interface AuthUserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  xuBalance: number;
  authorEarnedXu: number;
  flowerBalance: number;
  purchasedChapters: Record<string, string[]>;
  unlockedFullBooks: string[];
  purchases: any[];
  notifications: AuthNotificationItem[];
  isBanned?: boolean;
  isLoggedIn: boolean;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  user: AuthUserProfile | null;
  userData: AuthUserProfile | null;
  loading: boolean;
  isMounted: boolean;
  setUserData: React.Dispatch<React.SetStateAction<AuthUserProfile | null>>;
  refreshUserData: () => Promise<AuthUserProfile | null>;
  refreshProfile: () => Promise<AuthUserProfile | null>;
  updateBalanceInState: (nextXuBalance: number, nextAuthorEarnedXu?: number) => void;
  addPurchasedChaptersInState: (
    novelId: string,
    chapterIds: string[],
    isFullBook?: boolean
  ) => void;
  hasPurchasedChapter: (novelId: string, chapterId: string, chapterNumber?: number) => boolean;
  markNotificationsAsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  user: null,
  userData: null,
  loading: true,
  isMounted: false,
  setUserData: () => {},
  refreshUserData: async () => null,
  refreshProfile: async () => null,
  updateBalanceInState: () => {},
  addPurchasedChaptersInState: () => {},
  hasPurchasedChapter: () => false,
  markNotificationsAsRead: async () => {},
});

function parseNumericField(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/,/g, '');
    if (!cleaned) return 0;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function extractBalances(data: Record<string, any> | undefined): {
  xuBalance: number;
  authorEarnedXu: number;
  flowerBalance: number;
} {
  if (!data) {
    return { xuBalance: 0, authorEarnedXu: 0, flowerBalance: 0 };
  }

  const realXu =
    data.xuBalance !== undefined && data.xuBalance !== null
      ? parseNumericField(data.xuBalance)
      : parseNumericField(data.xu) ||
        parseNumericField(data.coin) ||
        parseNumericField(data.coins) ||
        parseNumericField(data.balance) ||
        0;

  const realEarned =
    data.authorEarnedXu !== undefined && data.authorEarnedXu !== null
      ? parseNumericField(data.authorEarnedXu)
      : parseNumericField(data.earnedXu) ||
        parseNumericField(data.authorXu) ||
        parseNumericField(data.royaltyXu) ||
        0;

  const flowerBalance =
    parseNumericField(data.flowerBalance) ||
    parseNumericField(data.flowers) ||
    parseNumericField(data.flower) ||
    0;

  return {
    xuBalance: Math.max(0, realXu),
    authorEarnedXu: Math.max(0, realEarned),
    flowerBalance: Math.max(0, flowerBalance),
  };
}

function extractMergedPurchasedChapters(
  data: Record<string, any> | undefined
): Record<string, string[]> {
  const normalizedPurchased: Record<string, string[]> = {};
  if (!data) return normalizedPurchased;

  const addEntry = (novelId: string, chapterId: string) => {
    const nKey = String(novelId || '').trim();
    const cVal = String(chapterId || '').trim();
    if (!nKey || !cVal) return;
    const prevList = normalizedPurchased[nKey] || [];
    if (!prevList.includes(cVal)) {
      normalizedPurchased[nKey] = [...prevList, cVal];
    }
  };

  for (const src of [data.purchasedChapters, data.unlockedChapters, data.boughtChapters]) {
    if (!src) continue;
    if (Array.isArray(src)) {
      for (const item of src) {
        if (typeof item === 'string' || typeof item === 'number') {
          const raw = String(item).trim();
          if (!raw) continue;
          const sepMatch = raw.match(/^([^:/|]+)[:/|](.+)$/);
          if (sepMatch) {
            addEntry(sepMatch[1], sepMatch[2]);
          } else {
            addEntry('__legacy__', raw);
          }
        } else if (item && typeof item === 'object') {
          const nId = item.novelId || item.storyId || item.bookId;
          const cId =
            item.chapterId ||
            item.id ||
            (item.chapterNumber !== undefined ? `c${item.chapterNumber}` : '');
          if (nId && cId) {
            addEntry(String(nId), String(cId));
          }
        }
      }
    } else if (typeof src === 'object') {
      for (const [novelKey, list] of Object.entries(src)) {
        if (Array.isArray(list)) {
          const prevList = normalizedPurchased[novelKey] || [];
          normalizedPurchased[novelKey] = Array.from(
            new Set([...prevList, ...(list || []).map((item) => String(item)).filter(Boolean)])
          );
        } else if (typeof list === 'string' && list.trim()) {
          addEntry(novelKey, list.trim());
        }
      }
    }
  }
  return normalizedPurchased;
}

function mergeChapterMaps(
  a: Record<string, string[]>,
  b: Record<string, string[]>
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...a };
  for (const [k, list] of Object.entries(b)) {
    const existing = merged[k] || [];
    merged[k] = Array.from(new Set([...existing, ...list]));
  }
  return merged;
}

function mergeNotifications(
  docNotifs: any[] = [],
  collectionNotifs: AuthNotificationItem[] = []
): AuthNotificationItem[] {
  const byId = new Map<string, AuthNotificationItem>();
  for (const item of [...collectionNotifs, ...(Array.isArray(docNotifs) ? docNotifs : [])]) {
    if (!item || !item.id) continue;
    const normalized: AuthNotificationItem = {
      id: String(item.id),
      title: String(item.title || 'Thông báo hệ thống'),
      message: String(item.message || ''),
      type: item.type ? String(item.type) : 'system',
      createdAt: Number(item.createdAt || Date.now()),
      isRead: Boolean(item.isRead),
    };
    const prev = byId.get(normalized.id);
    if (!prev) {
      byId.set(normalized.id, normalized);
    } else {
      byId.set(normalized.id, {
        ...prev,
        ...normalized,
        isRead: Boolean(prev.isRead || normalized.isRead),
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

async function fetchNotificationsForUser(uid: string): Promise<AuthNotificationItem[]> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      limit(25)
    );
    const snap = await getDocs(q);
    return (snap?.docs || []).map((d) => {
      const data = (d.data() || {}) as Record<string, any>;
      return {
        id: String(data.id || d.id),
        title: String(data.title || 'Thông báo hệ thống'),
        message: String(data.message || ''),
        type: data.type ? String(data.type) : 'system',
        createdAt: Number(data.createdAt || Date.now()),
        isRead: Boolean(data.isRead),
      };
    });
  } catch {
    return [];
  }
}

function buildProfileFromDoc(
  fbUser: FirebaseUser,
  data: Record<string, any> | undefined,
  collectionNotifs: AuthNotificationItem[] = [],
  resolvedDocId?: string
): AuthUserProfile {
  const email = String(data?.email || fbUser.email || '');
  const isAdmin = checkIsAdmin(email);
  const rawRole = String(data?.role || 'reader');
  const resolvedRole = isAdmin ? 'admin' : rawRole === 'admin' ? 'reader' : rawRole;

  const normalizedPurchased = extractMergedPurchasedChapters(data);
  const balances = extractBalances(data);
  const notifications = mergeNotifications(
    Array.isArray(data?.notifications) ? data.notifications : [],
    collectionNotifs
  );

  return {
    id: resolvedDocId || fbUser.uid,
    email,
    displayName: String(
      data?.displayName || fbUser.displayName || email.split('@')[0] || 'Độc giả'
    ),
    avatarUrl: String(data?.avatarUrl || data?.photoURL || fbUser.photoURL || ''),
    role: resolvedRole,
    xuBalance: balances.xuBalance,
    authorEarnedXu: balances.authorEarnedXu,
    flowerBalance: balances.flowerBalance,
    purchasedChapters: normalizedPurchased,
    unlockedFullBooks: Array.isArray(data?.unlockedFullBooks)
      ? (data?.unlockedFullBooks || []).map((id: any) => String(id))
      : [],
    purchases: Array.isArray(data?.purchases) ? data.purchases : [],
    notifications: Array.isArray(notifications) ? notifications : [],
    isBanned: Boolean(data?.isBanned || data?.isLocked),
    isLoggedIn: true,
  };
}

function getLatestTxTimestamp(data: Record<string, any> | undefined): number {
  if (!data) return 0;
  let maxTs = parseNumericField(data.lastTransactionAt);
  if (Array.isArray(data.purchases)) {
    for (const p of data.purchases) {
      const ts = parseNumericField(p?.purchasedAt) || parseNumericField(p?.createdAt);
      if (ts > maxTs) maxTs = ts;
    }
  }
  return maxTs;
}

function pickCanonicalDocForEmail(
  docs: QueryDocumentSnapshot<DocumentData>[],
  firebaseUid: string
): QueryDocumentSnapshot<DocumentData> {
  const unmerged = docs.filter((d) => !d.data()?.mergedInto);
  const pool = unmerged.length > 0 ? unmerged : docs;

  return [...pool].sort((a, b) => {
    const da = a.data() || {};
    const dbData = b.data() || {};

    const aLocked = Boolean(da.isLocked === true || da.isBanned === true || da.status === 'banned' || da.status === 'Bị khóa');
    const bLocked = Boolean(dbData.isLocked === true || dbData.isBanned === true || dbData.status === 'banned' || dbData.status === 'Bị khóa');
    if (aLocked !== bLocked) return aLocked ? 1 : -1;

    const aTx = getLatestTxTimestamp(da);
    const bTx = getLatestTxTimestamp(dbData);
    if (aTx !== bTx) return bTx - aTx;

    const aIsFirebaseUid = !a.id.startsWith('usr-') && !a.id.startsWith('g-');
    const bIsFirebaseUid = !b.id.startsWith('usr-') && !b.id.startsWith('g-');
    if (aIsFirebaseUid !== bIsFirebaseUid) return aIsFirebaseUid ? -1 : 1;

    const aUidMatch = a.id === firebaseUid || da.uid === firebaseUid;
    const bUidMatch = b.id === firebaseUid || dbData.uid === firebaseUid;
    if (aUidMatch !== bUidMatch) return aUidMatch ? -1 : 1;

    const aLast = parseNumericField(da.lastLogin) || parseNumericField(da.updatedAt);
    const bLast = parseNumericField(dbData.lastLogin) || parseNumericField(dbData.updatedAt);
    if (aLast !== bLast) return bLast - aLast;

    return extractBalances(dbData).xuBalance - extractBalances(da).xuBalance;
  })[0];
}

/**
 * KHÓA CỬA TƯƠNG LAI (syncUserProfile):
 * 1. BẮT BUỘC kiểm tra theo email trước: query(collection(db, 'users'), where('email', '==', cleanEmail))
 * 2. NẾU email đã tồn tại: TUYỆT ĐỐI CẤM dùng setDoc tạo ID mới.
 *    Trả về dữ liệu document cũ, đồng thời cập nhật updateDoc({ uid, authProvider }) để map với phiên đăng nhập mới.
 * 3. NẾU email chưa tồn tại: Mới được phép tạo document mới bằng setDoc.
 */
export async function syncUserProfile(
  fbUser: FirebaseUser
): Promise<{ docId: string; data: Record<string, any> | undefined; notifications: AuthNotificationItem[] }> {
  const cleanEmail = (fbUser.email || '').trim().toLowerCase();
  const authProvider = fbUser.providerData?.[0]?.providerId || 'google.com';

  // BƯỚC 1: Bắt buộc query theo email trước
  let matchedDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  if (cleanEmail) {
    const emailSnap = await getDocs(
      query(collection(db, 'users'), where('email', '==', cleanEmail))
    );
    matchedDocs = emailSnap.docs;

    if (matchedDocs.length === 0 && fbUser.email && fbUser.email.trim() !== cleanEmail) {
      const rawSnap = await getDocs(
        query(collection(db, 'users'), where('email', '==', fbUser.email.trim()))
      );
      matchedDocs = rawSnap.docs;
    }
  }

  // Fallback theo uid nếu không tìm thấy bằng email (user cũ thiếu trường email)
  let existingDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  if (matchedDocs.length > 0) {
    existingDoc = pickCanonicalDocForEmail(matchedDocs, fbUser.uid);
  } else {
    const uidSnap = await getDoc(doc(db, 'users', fbUser.uid));
    if (uidSnap.exists()) {
      existingDoc = uidSnap as QueryDocumentSnapshot<DocumentData>;
    }
  }

  if (existingDoc) {
    // NẾU EMAIL ĐÃ TỒN TẠI: TUYỆT ĐỐI CẤM tạo document mới bằng setDoc!
    const existingData = (existingDoc.data() || {}) as Record<string, any>;

    // Chỉ cập nhật uid/authProvider khi thực sự thay đổi và chỉ ghi lastLogin nếu quá 5 phút
    const now = Date.now();
    const lastRecorded = Math.max(
      Number(existingData.lastLogin || existingData.lastSeen || 0),
      lastPresenceWriteByUid.get(existingDoc.id) || 0
    );
    const needsPresenceUpdate = now - lastRecorded > LAST_PRESENCE_COOLDOWN_MS;
    const mappingUpdates: Record<string, any> = {};

    if (existingData.uid !== fbUser.uid) {
      mappingUpdates.uid = fbUser.uid;
    }
    if (existingData.authProvider !== authProvider) {
      mappingUpdates.authProvider = authProvider;
    }
    if (!existingData.email && cleanEmail) {
      mappingUpdates.email = cleanEmail;
    }
    if (needsPresenceUpdate) {
      mappingUpdates.lastLogin = now;
    }

    if (Object.keys(mappingUpdates).length > 0) {
      lastPresenceWriteByUid.set(existingDoc.id, now);
      await updateDoc(existingDoc.ref, mappingUpdates).catch((err) => {
        console.warn('[AuthProvider] Cảnh báo khi map uid/authProvider lên doc cũ:', err);
      });
    }

    const [docIdNotifs, uidNotifs] = await Promise.all([
      fetchNotificationsForUser(existingDoc.id),
      existingDoc.id !== fbUser.uid ? fetchNotificationsForUser(fbUser.uid) : Promise.resolve([]),
    ]);

    return {
      docId: existingDoc.id,
      data: existingData,
      notifications: [...docIdNotifs, ...uidNotifs],
    };
  }

  // NẾU EMAIL CHƯA TỒN TẠI: Mới được phép tạo document mới
  const isAdmin = checkIsAdmin(cleanEmail);
  const newUserPayload: Record<string, any> = {
    uid: fbUser.uid,
    authProvider,
    email: cleanEmail || fbUser.email || '',
    displayName: fbUser.displayName || (cleanEmail ? cleanEmail.split('@')[0] : 'Độc giả'),
    avatarUrl: fbUser.photoURL || '',
    photoURL: fbUser.photoURL || '',
    role: isAdmin ? 'admin' : 'reader',
    coins: 0,
    xuBalance: 0,
    authorEarnedXu: 0,
    flowerBalance: 0,
    purchasedChapters: [],
    unlockedChapters: {},
    unlockedFullBooks: [],
    purchases: [],
    notifications: [],
    isBanned: false,
    isLocked: false,
    status: 'Hoạt động',
    createdAt: Date.now(),
    lastLogin: Date.now(),
  };

  try {
    await setDoc(doc(db, 'users', fbUser.uid), newUserPayload, { merge: true });
  } catch (err) {
    console.warn('[AuthProvider] Không thể khởi tạo doc user mới trên Firestore:', err);
  }

  const collectionNotifs = await fetchNotificationsForUser(fbUser.uid);
  return { docId: fbUser.uid, data: newUserPayload, notifications: collectionNotifs };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Đồng bộ thủ công sau giao dịch bằng syncUserProfile (luôn kiểm tra email trước)
  const refreshUserData = useCallback(async (): Promise<AuthUserProfile | null> => {
    const current = auth.currentUser;
    if (!current) return null;
    try {
      const { docId, data, notifications } = await syncUserProfile(current);
      const profile = buildProfileFromDoc(current, data, notifications, docId);
      setUser(profile);
      return profile;
    } catch (err) {
      console.warn('[AuthProvider] Không thể làm mới dữ liệu user:', err);
      return null;
    }
  }, []);

  const updateBalanceInState = useCallback(
    (nextXuBalance: number, nextAuthorEarnedXu?: number) => {
      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          xuBalance: nextXuBalance,
          authorEarnedXu:
            nextAuthorEarnedXu !== undefined ? nextAuthorEarnedXu : prev.authorEarnedXu,
        };
      });
    },
    []
  );

  const addPurchasedChaptersInState = useCallback(
    (novelId: string, chapterIds: string[], isFullBook = false) => {
      setUser((prev) => {
        if (!prev) return prev;
        const safePurchasedMap = prev.purchasedChapters || {};
        const currentList = Array.isArray(safePurchasedMap[novelId]) ? safePurchasedMap[novelId] : [];
        const mergedChapters = Array.from(new Set([...currentList, ...(chapterIds || [])]));
        const prevFullBooks = Array.isArray(prev.unlockedFullBooks) ? prev.unlockedFullBooks : [];
        const mergedFullBooks = isFullBook
          ? Array.from(new Set([...prevFullBooks, novelId]))
          : prevFullBooks;
        return {
          ...prev,
          purchasedChapters: {
            ...safePurchasedMap,
            [novelId]: mergedChapters,
          },
          unlockedFullBooks: mergedFullBooks,
        };
      });
    },
    []
  );

  const hasPurchasedChapter = useCallback(
    (novelId: string, chapterId: string, chapterNumber?: number): boolean => {
      if (!user) return false;
      if ((user?.unlockedFullBooks || []).includes(novelId)) return true;
      const legacyList = Array.isArray(user?.purchasedChapters?.['__legacy__'])
        ? user.purchasedChapters['__legacy__']
        : [];
      if (legacyList.includes(novelId) || legacyList.includes(chapterId)) {
        return true;
      }
      const list = Array.isArray(user?.purchasedChapters?.[novelId])
        ? user.purchasedChapters[novelId]
        : [];
      if (list.includes('all') || list.includes('*') || list.includes(chapterId)) {
        return true;
      }
      if (chapterNumber !== undefined) {
        const candidates = [
          String(chapterNumber),
          `c${chapterNumber}`,
          `c-${chapterNumber}`,
          `chuong-${chapterNumber}`,
          `${novelId}-c${chapterNumber}`,
        ];
        return candidates.some((c) => list.includes(c) || legacyList.includes(c));
      }
      return false;
    },
    [user]
  );

  const markNotificationsAsRead = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    setUser((prev) =>
      prev
        ? {
            ...prev,
            notifications: (prev?.notifications || []).map((n) => ({ ...n, isRead: true })),
          }
        : prev
    );
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', current.uid),
        where('isRead', '==', false),
        limit(25)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
        await batch.commit();
      }
    } catch {}
  }, []);

  useEffect(() => {
    setIsMounted(true);
    let isActive = true;

    // Gỡ bỏ hoàn toàn dữ liệu Xu / truyện đã mua lưu thừa trong localStorage (nếu tồn tại từ bản cũ)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('daotam_direct_user');
        window.localStorage.removeItem('daotam_user_profile');
      } catch {}
    }

    // Đăng nhập thành công -> Kiểm tra theo email trước qua syncUserProfile():
    // Nếu email đã tồn tại: dùng document cũ & cập nhật uid/authProvider (CẤM tạo doc mới)
    // Nếu email chưa tồn tại: mới tạo document mới
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!isActive) return;
      setFirebaseUser(fbUser);

      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const { docId, data, notifications } = await syncUserProfile(fbUser);
        if (!isActive) return;
        const profile = buildProfileFromDoc(fbUser, data, notifications, docId);
        setUser(profile);
      } catch (err) {
        console.warn('[AuthProvider] Lỗi đọc dữ liệu user từ Firestore:', err);
        if (isActive) {
          setUser(buildProfileFromDoc(fbUser, undefined, []));
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        userData: user,
        loading,
        isMounted,
        setUserData: setUser,
        refreshUserData,
        refreshProfile: refreshUserData,
        updateBalanceInState,
        addPurchasedChaptersInState,
        hasPurchasedChapter,
        markNotificationsAsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
