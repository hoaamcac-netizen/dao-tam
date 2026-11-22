import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, checkIsAdmin } from '../firebase/config';
import {
  syncUserProfile,
  extractXuBalances,
  extractPurchasedChaptersMap,
  extractPurchasedChaptersList,
  mergePurchasedChaptersMaps,
  recoverLegacyUserDataByEmail,
  fetchUserNotificationsFromCollection,
  mergeNotificationsLists,
  parseNumericValue,
} from '../firebase/services';
import { UserProfile } from '../types';
import { DaoTamLogo } from '../components/DaoTamLogo';
import { safeRemoveItem } from '../utils/safeStorage';
import { clearLocalBanFlags } from '../services/antiCrawlerRateLimiter';

export const GUEST_USER: UserProfile = {
  id: 'guest',
  email: '',
  displayName: 'Khách Độc Truyện',
  avatarUrl:
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  isLoggedIn: false,
  role: 'reader',
  xuBalance: 0,
  authorEarnedXu: 0,
  flowerBalance: 0,
  lastDailyRewardDate: '',
  lastDailyRewardTimestamp: 0,
  bankInfo: {
    bankName: '',
    accountNumber: '',
    accountHolder: '',
  },
  notifications: [],
  readingHistory: [],
  bookmarks: [],
  purchasedChapters: [],
  unlockedChapters: {},
  unlockedFullBooks: [],
  purchases: [],
};

interface AuthContextType {
  user: UserProfile | null;
  userData: UserProfile | null;
  loading: boolean;
  isMounted: boolean;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  setUserData: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  refreshUserData: () => Promise<UserProfile | null>;
  refreshProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isMounted: false,
  setUser: () => {},
  setUserData: () => {},
  refreshUserData: async () => null,
  refreshProfile: async () => null,
});

function buildUserProfileFromFirestoreDoc(
  fbUser: FirebaseUser,
  data: Record<string, any>
): UserProfile {
  const email = String(data.email || fbUser.email || '');
  const isAdmin = checkIsAdmin(email);
  const determinedRole = isAdmin
    ? 'admin'
    : data.role === 'admin'
    ? 'reader'
    : data.role || 'reader';
  const isBanned = Boolean(
    data.isBanned === true ||
      data.isLocked === true ||
      data.status === 'banned' ||
      data.status === 'Bị khóa'
  );

  // Bắt bao quát mọi tên trường số dư Xu, Nhuận bút, Hoa và purchasedChapters / unlockedChapters / boughtChapters
  const balances = extractXuBalances(data);
  const mergedUnlockedChapters = extractPurchasedChaptersMap(data);

  return {
    id: fbUser.uid,
    email,
    displayName: String(
      data.displayName || fbUser.displayName || email.split('@')[0] || 'Độc Giả'
    ),
    avatarUrl: String(
      (data.avatarUrl && String(data.avatarUrl).trim()) ||
        data.photoURL ||
        fbUser.photoURL ||
        ''
    ),
    bio: data.bio || '',
    followers: Array.isArray(data.followers) ? data.followers : [],
    followingCreators: Array.isArray(data.followingCreators) ? data.followingCreators : [],
    isLoggedIn: true,
    role: determinedRole,
    isBanned,
    isLocked: isBanned,
    xuBalance: balances.xuBalance,
    authorEarnedXu: balances.authorEarnedXu,
    flowerBalance: balances.flowerBalance,
    lastDailyRewardDate: data.lastDailyRewardDate || '',
    lastDailyRewardTimestamp: parseNumericValue(data.lastDailyRewardTimestamp),
    bankInfo: data.bankInfo || undefined,
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    readingHistory: Array.isArray(data.readingHistory) ? data.readingHistory : [],
    bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
    purchasedChapters: extractPurchasedChaptersList(data),
    unlockedChapters: mergedUnlockedChapters,
    unlockedFullBooks: Array.isArray(data.unlockedFullBooks) ? data.unlockedFullBooks : [],
    purchases: Array.isArray(data.purchases) ? data.purchases : [],
  };
}

async function applyLegacyRecoveryIfZeroBalance(
  fbUser: FirebaseUser,
  profile: UserProfile
): Promise<UserProfile> {
  if (profile.xuBalance > 0 || (profile.authorEarnedXu || 0) > 0 || !fbUser.email) {
    return profile;
  }
  const legacyRecovered = await recoverLegacyUserDataByEmail(fbUser.email, fbUser.uid);
  if (!legacyRecovered) return profile;

  const lb = extractXuBalances(legacyRecovered);
  const mergedChapters = mergePurchasedChaptersMaps(
    profile.unlockedChapters,
    extractPurchasedChaptersMap(legacyRecovered)
  );
  const mergedFullBooks = Array.isArray(legacyRecovered.unlockedFullBooks)
    ? Array.from(new Set([...(profile?.unlockedFullBooks || []), ...legacyRecovered.unlockedFullBooks]))
    : (profile?.unlockedFullBooks || []);

  const mergedPurchasedList = Array.from(
    new Set([
      ...(Array.isArray(profile.purchasedChapters) ? profile.purchasedChapters : []),
      ...extractPurchasedChaptersList(legacyRecovered),
    ])
  );

  return {
    ...profile,
    xuBalance: lb.xuBalance > 0 ? lb.xuBalance : profile.xuBalance,
    authorEarnedXu: lb.authorEarnedXu > 0 ? lb.authorEarnedXu : profile.authorEarnedXu,
    flowerBalance: Math.max(profile.flowerBalance || 0, lb.flowerBalance),
    purchasedChapters: mergedPurchasedList,
    unlockedChapters: mergedChapters || {},
    unlockedFullBooks: mergedFullBooks || [],
    readingHistory: Array.isArray(profile?.readingHistory) ? profile.readingHistory : [],
    bookmarks: Array.isArray(profile?.bookmarks) ? profile.bookmarks : [],
    notifications: Array.isArray(profile?.notifications) ? profile.notifications : [],
    purchases:
      (profile?.purchases && profile.purchases?.length > 0)
        ? profile.purchases
        : Array.isArray(legacyRecovered.purchases)
        ? legacyRecovered.purchases
        : [],
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Single Source of Truth trong Global Context State (TUYỆT ĐỐI không lưu Xu & truyện đã mua vào localStorage)
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // Hàm refreshUserData: Đồng bộ lại dữ liệu thật từ Firestore (luôn kiểm tra theo email trước qua syncUserProfile)
  const refreshUserData = useCallback(async (): Promise<UserProfile | null> => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    try {
      let profile = await syncUserProfile(currentUser);
      profile = await applyLegacyRecoveryIfZeroBalance(currentUser, profile);
      const isAdmin = checkIsAdmin(profile.email);
      profile.role = isAdmin ? 'admin' : profile.role === 'admin' ? 'reader' : profile.role;
      setUser(profile);
      return profile;
    } catch (err) {
      console.error('Lỗi refreshUserData từ Firestore:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    let isActive = true;

    // Xóa triệt để các key localStorage cũ chứa số dư Xu / truyện đã mua nếu còn tồn đọng
    safeRemoveItem('daotam_direct_user');
    safeRemoveItem('daotam_user_profile');

    let unsubscribeUserDoc: (() => void) | null = null;

    const cleanupUserListener = () => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }
    };

    // Đăng nhập thành công -> Bắt buộc kiểm tra email trên Firestore qua syncUserProfile() trước khi quyết định tạo doc mới
    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!isActive) return;

      // Ngắt listener doc user cũ trước khi chuyển tài khoản hoặc đăng xuất
      cleanupUserListener();

      const effectiveFbUser = fbUser || auth.currentUser;

      if (!effectiveFbUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        let profile = await syncUserProfile(effectiveFbUser);
        if (!isActive) return;

        profile = await applyLegacyRecoveryIfZeroBalance(effectiveFbUser, profile);
        if (!isActive) return;

        const isAdmin = checkIsAdmin(profile.email);
        profile.role = isAdmin ? 'admin' : profile.role === 'admin' ? 'reader' : profile.role;

        if (!profile.isBanned) {
          clearLocalBanFlags();
          effectiveFbUser.getIdToken(true).catch(() => {});
        }

        // BẮT BUỘC đẩy dữ liệu vào Global State để Header và toàn bộ UI re-render ngay lập tức
        setUser(profile);

        // Giữ DUY NHẤT 1 onSnapshot trên đúng 1 document user hiện tại để cập nhật số dư Xu / thông báo thời gian thực
        const targetUserDocId = profile.id || effectiveFbUser.uid;
        unsubscribeUserDoc = onSnapshot(
          doc(db, 'users', targetUserDocId),
          (snap) => {
            if (!isActive || !snap.exists()) return;
            const liveData = (snap.data() || {}) as Record<string, any>;
            const balances = extractXuBalances(liveData);
            const liveBanned = Boolean(
              liveData.isBanned === true ||
              liveData.isLocked === true ||
              liveData.status === 'banned' ||
              liveData.status === 'Bị khóa'
            );
            const liveEmail = String(liveData.email || effectiveFbUser?.email || profile.email || '');
            const liveIsAdmin = checkIsAdmin(liveEmail);
            const liveRole = liveIsAdmin
              ? 'admin'
              : liveData.role === 'admin'
              ? 'reader'
              : liveData.role || profile.role || 'reader';

            setUser((prev) => {
              const base = prev || profile;
              const docNotifs = Array.isArray(liveData.notifications) ? liveData.notifications : [];
              const mergedNotifs = mergeNotificationsLists(base.notifications || [], docNotifs);
              const liveUnlocked = extractPurchasedChaptersMap(liveData);
              const livePurchasedList = extractPurchasedChaptersList(liveData);

              return {
                ...base,
                id: snap.id,
                email: liveEmail || base.email,
                displayName: String(liveData.displayName || base.displayName || 'Độc Giả'),
                avatarUrl: String(
                  (liveData.avatarUrl && String(liveData.avatarUrl).trim()) ||
                  liveData.photoURL ||
                  base.avatarUrl ||
                  ''
                ),
                bio: liveData.bio !== undefined ? liveData.bio : base.bio,
                role: liveRole,
                isBanned: liveBanned,
                isLocked: liveBanned,
                xuBalance: balances.xuBalance,
                authorEarnedXu: balances.authorEarnedXu,
                flowerBalance: Math.max(base.flowerBalance || 0, balances.flowerBalance),
                lastDailyRewardDate: liveData.lastDailyRewardDate ?? base.lastDailyRewardDate,
                lastDailyRewardTimestamp: liveData.lastDailyRewardTimestamp
                  ? parseNumericValue(liveData.lastDailyRewardTimestamp)
                  : base.lastDailyRewardTimestamp,
                bankInfo: liveData.bankInfo || base.bankInfo,
                notifications: mergedNotifs,
                readingHistory: Array.isArray(liveData.readingHistory) ? liveData.readingHistory : base.readingHistory,
                bookmarks: Array.isArray(liveData.bookmarks) ? liveData.bookmarks : base.bookmarks,
                purchasedChapters: livePurchasedList.length > 0 ? livePurchasedList : base.purchasedChapters,
                unlockedChapters: mergePurchasedChaptersMaps(base.unlockedChapters, liveUnlocked),
                unlockedFullBooks: Array.isArray(liveData.unlockedFullBooks)
                  ? liveData.unlockedFullBooks
                  : base.unlockedFullBooks,
                purchases: Array.isArray(liveData.purchases) ? liveData.purchases : base.purchases,
                followers: Array.isArray(liveData.followers) ? liveData.followers : base.followers,
                followingCreators: Array.isArray(liveData.followingCreators)
                  ? liveData.followingCreators
                  : base.followingCreators,
              };
            });
          },
          (err) => {
            console.warn('[AuthContext] Lỗi listener số dư Xu user:', err);
          }
        );
      } catch (err) {
        console.error('Lỗi lấy profile từ Firestore trong onAuthStateChanged:', err);
        if (isActive) setUser(null);
      } finally {
        if (isActive) setLoading(false);
      }
    });

    return () => {
      isActive = false;
      cleanupUserListener();
      unsubscribeAuth();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <DaoTamLogo size="lg" />
          <div className="flex items-center gap-2.5 text-rose-500 font-semibold text-sm">
            <svg className="animate-spin h-5 w-5 text-rose-500" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            <span>Đang tải...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userData: user,
        loading,
        isMounted,
        setUser,
        setUserData: setUser,
        refreshUserData,
        refreshProfile: refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
