import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc,
  updateDoc, 
  deleteDoc,
  query, 
  where,
  orderBy, 
  limit,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  increment,
  writeBatch,
  runTransaction,
  startAfter,
  getCountFromServer,
  serverTimestamp,
  deleteField,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  User as FirebaseUser 
} from 'firebase/auth';
import { db, auth, googleProvider, checkIsAdmin, GOOGLE_OAUTH_CLIENT_ID } from './config';
import firebaseAppletConfig from '../../firebase-applet-config.json';
import { 
  Novel, 
  Chapter, 
  UserProfile, 
  UserRole,
  TopUpRequest, 
  NovelSubmission, 
  WithdrawalRequest, 
  CreatorApplication, 
  NovelReport,
  UserNotification,
  Comment,
  DonationRecord,
  SubmissionChapterDraft
} from '../types';
import {
  filterOutDummyChapters,
  formatXu,
  getChapterAudioUrl,
  getChapterPublishAt,
  computeChapterAudioCounts,
  getNovelLatestPublishAt,
  isChapterScheduledPending,
  normalizeStoryId,
} from '../utils/rulesAndVoices';
import {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  safeSessionGetItem,
  safeSessionSetItem,
  safeJsonParse,
  trimChapterCacheEntries,
  saveNovelsToStorage,
  invalidateNovelsCache,
  clearChapterAudioCache,
  syncChapterAudioInStorageCache,
  CHAPTER_CACHE_PREFIX,
  CHAPTER_CACHE_TS_PREFIX,
  makeChapterCacheKey,
  makeChapterCacheTsKey,
} from '../utils/safeStorage';
import { isGeneratedFallbackContent } from '../utils/chapterContentGenerator';
import { invalidateGlobalBannerCache, type GlobalBannerConfig } from '../components/GlobalBanner';

function extractChapterAudioFields(c: any): {
  audioUrl?: string;
  audioUrlMale?: string;
  audioUrlFemale?: string;
  mp3Url?: string;
  maleAudioUrl?: string;
  audio?: string;
  femaleAudioUrl?: string;
  mp3Female?: string;
} {
  if (!c || typeof c !== 'object') return {};
  const cleanStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
  return {
    audioUrl: cleanStr(c.audioUrl),
    audioUrlMale: cleanStr(c.audioUrlMale),
    audioUrlFemale: cleanStr(c.audioUrlFemale),
    mp3Url: cleanStr(c.mp3Url),
    maleAudioUrl: cleanStr(c.maleAudioUrl),
    audio: cleanStr(c.audio),
    femaleAudioUrl: cleanStr(c.femaleAudioUrl),
    mp3Female: cleanStr(c.mp3Female),
  };
}

function computeNovelAudioFlags(
  chapters: Array<Record<string, any>>,
  existingData?: Partial<Novel> | null
): {
  hasMaleAudio: boolean;
  hasFemaleAudio: boolean;
  hasAudio: boolean;
  mp3NamMinhCount: number;
  mp3HangNgaCount: number;
} {
  let hasMaleAudio = Boolean(existingData?.hasMaleAudio);
  let hasFemaleAudio = Boolean(existingData?.hasFemaleAudio);
  let mp3NamMinhCount =
    typeof existingData?.mp3NamMinhCount === 'number' && Number.isFinite(existingData.mp3NamMinhCount)
      ? Math.max(0, existingData.mp3NamMinhCount)
      : 0;
  let mp3HangNgaCount =
    typeof existingData?.mp3HangNgaCount === 'number' && Number.isFinite(existingData.mp3HangNgaCount)
      ? Math.max(0, existingData.mp3HangNgaCount)
      : 0;

  if (Array.isArray(chapters) && chapters.length > 0) {
    const counts = computeChapterAudioCounts(chapters as Array<Partial<Chapter>>);
    mp3NamMinhCount = counts.mp3NamMinhCount;
    mp3HangNgaCount = counts.mp3HangNgaCount;
    hasMaleAudio = counts.hasMaleAudio;
    hasFemaleAudio = counts.hasFemaleAudio;
  }

  return {
    hasMaleAudio,
    hasFemaleAudio,
    hasAudio: Boolean(existingData?.hasAudio || hasMaleAudio || hasFemaleAudio),
    mp3NamMinhCount,
    mp3HangNgaCount,
  };
}

function resolvePublicLatestChapterInfo(
  chapters: Chapter[],
  fallbackTitle?: string,
  fallbackNumber?: number,
  effectiveTotal: number = 0
): { latestChapterTitle: string; latestChapterNumber: number } {
  const sorted = [...(chapters || [])].sort((a, b) => Number(a.number) - Number(b.number));
  const published = sorted.filter((c) => !c.isHidden && !isChapterScheduledPending(c));
  const targetPool = published.length > 0 ? published : sorted;
  const top = targetPool.length > 0 ? targetPool[targetPool.length - 1] : null;
  if (top) {
    const num = Number(top.number) || effectiveTotal || 0;
    const title = top.title
      ? top.title
      : num > 0
      ? `Chương ${num}`
      : 'Chưa có chương';
    return { latestChapterTitle: title, latestChapterNumber: num };
  }
  const num = Number(fallbackNumber) || effectiveTotal || 0;
  const title = fallbackTitle || (num > 0 ? `Chương ${num}` : 'Chưa có chương');
  return { latestChapterTitle: title, latestChapterNumber: num };
}

// [QUOTA GUARD] Chỉ cập nhật lastLogin/lastSeen tối đa 1 lần mỗi 5 phút cho mỗi user
const LAST_PRESENCE_COOLDOWN_MS = 5 * 60 * 1000;
const lastPresenceWriteByUid = new Map<string, number>();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Bọc Promise với thời gian chờ tối đa an toàn để không bao giờ bị treo vĩnh viễn trên UI
 */
export async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number = 12000, 
  actionName: string = 'Thao tác máy chủ'
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${actionName} quá thời gian phản hồi (${Math.round(timeoutMs / 1000)}s). Vui lòng thử lại!`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loại bỏ triệt để các trường có giá trị `undefined` để tránh lỗi Function setDoc() called with invalid data
 */
export function cleanUndefinedFields<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return (obj || [])
      .filter((item) => item !== undefined)
      .map((item) => (item && typeof item === 'object' ? cleanUndefinedFields(item) : (typeof item === 'number' && Number.isNaN(item) ? 0 : item))) as any;
  }
  const cleaned: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      if (typeof val === 'number' && Number.isNaN(val)) {
        cleaned[key] = 0;
      } else if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
        cleaned[key] = cleanUndefinedFields(val);
      } else {
        cleaned[key] = val;
      }
    }
  }
  return cleaned;
}

/**
 * Làm sạch dữ liệu trước khi ghi vào Firestore (batch.update / updateDoc / setDoc):
 * - Lặp đệ quy qua các key của Object, xóa bỏ (delete) toàn bộ các key bắt đầu và kết thúc
 *   bằng 2 dấu gạch dưới (ví dụ: __legacy__) để tránh lỗi Firestore:
 *   "Document fields cannot begin and end with __".
 * - Loại bỏ giá trị undefined và chuẩn hóa NaN -> 0.
 */
export function sanitizeFirestoreData<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') {
    return (Number.isNaN(value) ? 0 : value) as unknown as T;
  }
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestoreData(item)) as unknown as T;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) {
    return value;
  }

  const sanitized: Record<string, any> = { ...(value as Record<string, any>) };
  for (const key of Object.keys(sanitized)) {
    if ((key.startsWith('__') && key.endsWith('__')) || sanitized[key] === undefined) {
      delete sanitized[key];
      continue;
    }
    sanitized[key] = sanitizeFirestoreData(sanitized[key]);
  }
  return sanitized as T;
}

export function detectInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Messenger|Zalo|Line|TikTok|BytedanceWebview|musical_ly/i.test(ua);
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isClassicIOS = /iPhone|iPad|iPod/i.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return isClassicIOS || isIPadOS;
}

/**
 * Đăng nhập bằng tài khoản Google (Firebase Auth) qua signInWithPopup
 */
export async function loginWithGoogle(): Promise<FirebaseUser> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (
      error?.code !== 'auth/unauthorized-domain' &&
      error?.code !== 'auth/popup-closed-by-user' &&
      error?.code !== 'auth/popup-blocked' &&
      error?.code !== 'auth/cancelled-popup-request'
    ) {
      console.warn('Google Sign-in status:', error?.message || error);
    }
    throw error;
  }
}

/**
 * Đăng nhập qua cửa sổ chính thức của Google Identity Services (OAuth Token Client)
 * Luồng này mở cửa sổ Google chính thức của accounts.google.com, người dùng chọn tài khoản và cấp phép.
 */
export function loginWithGoogleOAuthPrompt(): Promise<{ email: string; name: string; picture: string; uid: string }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Môi trường trình duyệt không hỗ trợ.'));
      return;
    }

    const gsi = (window as any).google?.accounts?.oauth2;
    if (!gsi) {
      reject(new Error('Google Identity Services SDK đang tải. Vui lòng thử lại sau 1-2 giây!'));
      return;
    }

    const client = gsi.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: 'email profile openid',
      prompt: 'select_account',
      callback: async (tokenResponse: any) => {
        if (tokenResponse.error) {
          if (tokenResponse.error === 'popup_closed_by_user' || tokenResponse.error === 'access_denied') {
            reject(new Error('auth/popup-closed-by-user'));
          } else {
            reject(new Error(tokenResponse.error_description || tokenResponse.error));
          }
          return;
        }

        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          });
          const info = await res.json();
          if (info && info.email) {
            resolve({
              email: info.email,
              name: info.name || info.email.split('@')[0],
              picture: info.picture || '',
              uid: `g-${info.sub || info.email.replace(/[^a-zA-Z0-9]/g, '_')}`
            });
          } else {
            reject(new Error('Không tìm thấy thông tin tài khoản Google.'));
          }
        } catch (fetchErr) {
          reject(fetchErr);
        }
      },
      error_callback: (err: any) => {
        reject(new Error(err?.message || 'Không thể mở cửa sổ đăng nhập Google.'));
      }
    });

    client.requestAccessToken();
  });
}

/**
 * Ép kiểu số an toàn cho số dư Xu / Hoa (hỗ trợ cả number và chuỗi số "1,000")
 */
export function parseNumericValue(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/,/g, '');
    if (!cleaned) return 0;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Trích xuất bao quát mọi tên trường số dư Xu, Nhuận bút và Hoa có thể tồn tại trên Firestore
 */
export function extractXuBalances(data: Record<string, any> | null | undefined): {
  xuBalance: number;
  authorEarnedXu: number;
  flowerBalance: number;
} {
  if (!data) {
    return { xuBalance: 0, authorEarnedXu: 0, flowerBalance: 0 };
  }

  const realXu =
    data.xuBalance !== undefined && data.xuBalance !== null
      ? parseNumericValue(data.xuBalance)
      : (
          parseNumericValue(data.xu) ||
          parseNumericValue(data.coin) ||
          parseNumericValue(data.coins) ||
          parseNumericValue(data.balance) ||
          0
        );

  const realEarned =
    data.authorEarnedXu !== undefined && data.authorEarnedXu !== null
      ? parseNumericValue(data.authorEarnedXu)
      : (
          parseNumericValue(data.earnedXu) ||
          parseNumericValue(data.authorXu) ||
          parseNumericValue(data.royaltyXu) ||
          0
        );

  const flowerBalance =
    data.flowerBalance !== undefined && data.flowerBalance !== null
      ? parseNumericValue(data.flowerBalance)
      : (
          parseNumericValue(data.flowers) ||
          parseNumericValue(data.flower) ||
          0
        );

  return {
    xuBalance: Math.max(0, realXu),
    authorEarnedXu: Math.max(0, realEarned),
    flowerBalance: Math.max(0, flowerBalance),
  };
}

/**
 * Chuẩn hóa trường mảng purchasedChapters thành string[] an toàn
 */
export function extractPurchasedChaptersList(
  data: Record<string, any> | null | undefined
): string[] {
  if (!data) return [];
  const raw = data.purchasedChapters;
  const result = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' || typeof item === 'number') {
        const s = String(item).trim();
        if (s) result.add(s);
      } else if (item && typeof item === 'object') {
        const nId = item.novelId || item.storyId || item.bookId;
        const cId = item.chapterId || item.id || (item.chapterNumber !== undefined ? `c${item.chapterNumber}` : '');
        if (nId && cId) result.add(`${nId}:${cId}`);
        else if (nId) result.add(String(nId));
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [novelId, chaps] of Object.entries(raw)) {
      if (Array.isArray(chaps)) {
        for (const c of chaps) {
          if (c) result.add(`${novelId}:${String(c)}`);
        }
      }
    }
  }
  return Array.from(result);
}

/**
 * Hợp nhất dữ liệu chương đã mở khóa từ cả purchasedChapters, unlockedChapters và boughtChapters
 * Hỗ trợ cả định dạng Object Map ({ [novelId]: string[] }) lẫn Array (string[] hoặc object[])
 */
export function extractPurchasedChaptersMap(
  data: Record<string, any> | null | undefined
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  if (!data) return merged;

  const addEntry = (novelId: string, chapterId: string) => {
    const nKey = String(novelId || '').trim();
    const cVal = String(chapterId || '').trim();
    if (!nKey || !cVal) return;
    const existing = merged[nKey] || [];
    if (!existing.includes(cVal)) {
      merged[nKey] = [...existing, cVal];
    }
  };

  const sources = [data.purchasedChapters, data.unlockedChapters, data.boughtChapters];
  for (const src of sources) {
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
      for (const [novelId, chapters] of Object.entries(src)) {
        if (Array.isArray(chapters)) {
          const existing = merged[novelId] || [];
          merged[novelId] = Array.from(
            new Set([...existing, ...(chapters || []).map((c) => String(c)).filter(Boolean)])
          );
        } else if (typeof chapters === 'string' && chapters.trim()) {
          addEntry(novelId, chapters.trim());
        }
      }
    }
  }
  return merged;
}

/**
 * Hợp nhất nhiều bản đồ chương đã mua thành một bản đồ duy nhất không trùng lặp
 */
export function mergePurchasedChaptersMaps(
  ...maps: Array<Record<string, string[]> | null | undefined>
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const [novelId, chapters] of Object.entries(map)) {
      if (!Array.isArray(chapters) || (chapters?.length || 0) === 0) continue;
      const existing = merged[novelId] || [];
      merged[novelId] = Array.from(new Set([...existing, ...(chapters || []).map((c) => String(c))]));
    }
  }
  return merged;
}

/**
 * Lớp bảo vệ Tài sản Khách hàng: Tìm kiếm & khôi phục số dư Xu / chương đã mua từ các doc cũ cùng email
 * (Chỉ kích hoạt khi doc theo UID chưa tồn tại hoặc đang có số dư = 0 do lỗi đồng bộ cũ)
 */
export async function recoverLegacyUserDataByEmail(
  email: string | null | undefined,
  excludeDocId?: string
): Promise<Record<string, any> | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  try {
    const legacySnap = await getDocs(
      query(collection(db, 'users'), where('email', '==', cleanEmail), limit(5))
    );
    if (legacySnap.empty) return null;

    let bestDoc: Record<string, any> | null = null;
    let maxXu = 0;
    let maxEarned = 0;
    let maxFlowers = 0;
    let mergedChapters: Record<string, string[]> = {};
    const mergedFullBooks = new Set<string>();
    const mergedPurchasedStories: Array<string | Record<string, any>> = [];
    const seenPurchasedStoryKeys = new Set<string>();
    const mergedPurchases: any[] = [];
    const seenPurchaseKeys = new Set<string>();

    for (const d of legacySnap.docs) {
      if (excludeDocId && d.id === excludeDocId) continue;
      const raw = d.data() as Record<string, any>;
      if (!bestDoc) bestDoc = raw;

      const b = extractXuBalances(raw);
      if (b.xuBalance > maxXu) maxXu = b.xuBalance;
      if (b.authorEarnedXu > maxEarned) maxEarned = b.authorEarnedXu;
      if (b.flowerBalance > maxFlowers) maxFlowers = b.flowerBalance;

      mergedChapters = mergePurchasedChaptersMaps(mergedChapters, extractPurchasedChaptersMap(raw));

      if (Array.isArray(raw.unlockedFullBooks)) {
        raw.unlockedFullBooks.forEach((id: any) => {
          if (id) mergedFullBooks.add(String(id));
        });
      }
      if (Array.isArray(raw.purchasedStories)) {
        raw.purchasedStories.forEach((entry: any) => {
          const key = typeof entry === 'string'
            ? entry.trim()
            : String(entry?.storyId || entry?.novelId || entry?.bookId || entry?.id || '').trim();
          if (key && !seenPurchasedStoryKeys.has(key)) {
            seenPurchasedStoryKeys.add(key);
            mergedPurchasedStories.push(entry);
          }
        });
      }
      if (Array.isArray(raw.purchases)) {
        raw.purchases.forEach((p: any, idx: number) => {
          const pKey = p?.id || `${p?.novelId || p?.storyId || ''}_${p?.chapterId || idx}_${p?.purchasedAt || ''}`;
          if (!seenPurchaseKeys.has(pKey)) {
            seenPurchaseKeys.add(pKey);
            mergedPurchases.push(p);
          }
        });
      }
    }

    if (!bestDoc) return null;
    return {
      ...bestDoc,
      xuBalance: maxXu,
      authorEarnedXu: maxEarned,
      flowerBalance: maxFlowers,
      unlockedChapters: mergedChapters,
      unlockedFullBooks: Array.from(mergedFullBooks),
      purchasedStories: mergedPurchasedStories,
      purchases: mergedPurchases,
    };
  } catch (err) {
    console.warn('Lỗi recoverLegacyUserDataByEmail:', err);
    return null;
  }
}

/**
 * Đăng ký tài khoản mới bằng Email và Mật khẩu
 */
export async function registerWithEmail(
  email: string, 
  password: string, 
  displayName: string,
  referralCode?: string
): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = displayName.trim() || 'Độc Giả Mới';
  const isAdmin = checkIsAdmin(cleanEmail);

  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: cleanName });
    }
    const profile = await syncUserProfile(cred.user);
    if (cleanName && profile.displayName !== cleanName) {
      profile.displayName = cleanName;
      await updateUserState(profile.id, { displayName: cleanName });
    }
    return profile;
  } catch (authError: any) {
    console.warn('Firebase Auth registration fallback to Firestore record:', authError?.message || authError);
    // Lớp bảo vệ Tài sản: Kiểm tra xem email đã có hồ sơ trên Firestore chưa trước khi tạo mới
    try {
      const existingByEmail = await getDocs(
        query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1))
      );
      if (!existingByEmail.empty) {
        const existingDoc = existingByEmail.docs[0];
        const existingData = existingDoc.data();
        const balances = extractXuBalances(existingData);
        return {
          id: existingDoc.id,
          email: existingData.email || cleanEmail,
          displayName: existingData.displayName || cleanName,
          avatarUrl: existingData.avatarUrl || existingData.photoURL || '',
          bio: existingData.bio || '',
          followers: Array.isArray(existingData.followers) ? existingData.followers : [],
          followingCreators: Array.isArray(existingData.followingCreators) ? existingData.followingCreators : [],
          isLoggedIn: true,
          role: isAdmin ? 'admin' : (existingData.role === 'admin' ? 'reader' : (existingData.role || 'reader')),
          xuBalance: balances.xuBalance,
          authorEarnedXu: balances.authorEarnedXu,
          flowerBalance: balances.flowerBalance,
          lastDailyRewardDate: existingData.lastDailyRewardDate || '',
          lastDailyRewardTimestamp: parseNumericValue(existingData.lastDailyRewardTimestamp),
          readingHistory: Array.isArray(existingData.readingHistory) ? existingData.readingHistory : [],
          bookmarks: Array.isArray(existingData.bookmarks) ? existingData.bookmarks : [],
          purchasedChapters: extractPurchasedChaptersList(existingData),
          purchasedStories: Array.isArray(existingData.purchasedStories) ? existingData.purchasedStories : [],
          unlockedChapters: extractPurchasedChaptersMap(existingData),
          unlockedFullBooks: Array.isArray(existingData.unlockedFullBooks) ? existingData.unlockedFullBooks : [],
          purchases: Array.isArray(existingData.purchases) ? existingData.purchases : [],
        };
      }
    } catch {}

    // Graceful fallback for environments where email/password auth provider is disabled or restricted
    const customUid = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newProfile: UserProfile = {
      id: customUid,
      email: cleanEmail,
      displayName: cleanName,
      avatarUrl: '', // Default empty avatar placeholder as requested
      bio: '',
      followers: [],
      followingCreators: [],
      isLoggedIn: true,
      role: isAdmin ? 'admin' : 'reader',
      xuBalance: 0,
      authorEarnedXu: 0,
      flowerBalance: 0,
      lastDailyRewardDate: '',
      lastDailyRewardTimestamp: 0,
      readingHistory: [],
      bookmarks: [],
      unlockedChapters: {},
      unlockedFullBooks: [],
      purchases: [],
    };

    try {
      const targetRef = doc(db, 'users', customUid);
      const checkSnap = await getDoc(targetRef);
      if (checkSnap.exists()) {
        const existingData = checkSnap.data();
        const balances = extractXuBalances(existingData);
        return {
          ...newProfile,
          xuBalance: balances.xuBalance,
          authorEarnedXu: balances.authorEarnedXu,
          flowerBalance: balances.flowerBalance,
          unlockedChapters: extractPurchasedChaptersMap(existingData),
          unlockedFullBooks: Array.isArray(existingData.unlockedFullBooks) ? existingData.unlockedFullBooks : [],
          purchases: Array.isArray(existingData.purchases) ? existingData.purchases : [],
        };
      }
      await setDoc(
        targetRef,
        {
          ...newProfile,
          createdAt: Date.now(),
          lastLogin: Date.now(),
          referralCode: referralCode || '',
        },
        { merge: true }
      );
    } catch (dbErr) {
      console.warn('Could not save user profile to Firestore:', dbErr);
    }
    return newProfile;
  }
}

/**
 * Đăng nhập bằng Email và Mật khẩu
 */
export async function loginWithEmail(email: string, password: string): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const isAdmin = checkIsAdmin(cleanEmail);

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    return await syncUserProfile(cred.user);
  } catch (authError: any) {
    console.warn('Firebase Auth signIn fallback checking Firestore:', authError?.message || authError);
    // Check Firestore users collection for matching email
    try {
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() || {};
        const balances = extractXuBalances(data);
        return {
          id: snap.docs[0].id,
          email: data.email || cleanEmail,
          displayName: data.displayName || 'Độc Giả',
          avatarUrl: data.avatarUrl || '',
          bio: data.bio || '',
          followers: Array.isArray(data.followers) ? data.followers : [],
          followingCreators: Array.isArray(data.followingCreators) ? data.followingCreators : [],
          notifications: Array.isArray(data.notifications) ? data.notifications : [],
          isLoggedIn: true,
          role: isAdmin ? 'admin' : (data.role === 'admin' ? 'reader' : (data.role || 'reader')),
          xuBalance: balances.xuBalance,
          authorEarnedXu: balances.authorEarnedXu,
          flowerBalance: balances.flowerBalance,
          lastDailyRewardDate: data.lastDailyRewardDate || '',
          lastDailyRewardTimestamp: parseNumericValue(data.lastDailyRewardTimestamp),
          readingHistory: Array.isArray(data.readingHistory) ? data.readingHistory : [],
          bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
          purchasedChapters: extractPurchasedChaptersList(data),
          purchasedStories: Array.isArray(data.purchasedStories) ? data.purchasedStories : [],
          unlockedChapters: extractPurchasedChaptersMap(data),
          unlockedFullBooks: Array.isArray(data.unlockedFullBooks) ? data.unlockedFullBooks : [],
          purchases: Array.isArray(data.purchases) ? data.purchases : [],
        };
      }
    } catch (dbErr) {
      console.warn('Firestore fallback lookup failed:', dbErr);
    }

    // If account doesn't exist, throw friendly error
    if (authError?.code === 'auth/wrong-password' || authError?.code === 'auth/invalid-credential') {
      throw new Error('Mật khẩu không chính xác. Vui lòng kiểm tra lại!');
    }
    if (authError?.code === 'auth/user-not-found') {
      throw new Error('Tài khoản email này chưa được đăng ký. Vui lòng chọn "Đăng ký ngay"!');
    }
    throw new Error(authError?.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.');
  }
}

/**
 * Đăng nhập trực tiếp bằng email kết nối Firestore (Hỗ trợ khi tên miền chưa kịp thêm vào Authorized Domains)
 */
export async function loginDirectlyWithEmail(email: string, displayName?: string): Promise<UserProfile> {
  const cleanEmail = email.trim().toLowerCase();
  const isAdmin = checkIsAdmin(cleanEmail);
  const uid = `usr-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

  try {
    // 1. BẮT BUỘC kiểm tra theo email trước để tuyệt đối không tạo document trùng lặp
    const emailSnap = await getDocs(
      query(collection(db, 'users'), where('email', '==', cleanEmail))
    );
    const activeByEmail = emailSnap.docs.filter((d) => !d.data()?.mergedInto);
    const nonBannedByEmail = activeByEmail.filter((d) => {
      const dt = d.data() || {};
      return !(dt.isLocked === true || dt.isBanned === true || dt.status === 'banned' || dt.status === 'Bị khóa');
    });
    const matchedDoc =
      nonBannedByEmail[0] || activeByEmail[0] || emailSnap.docs[0] || null;

    const userRef = matchedDoc ? matchedDoc.ref : doc(db, 'users', uid);
    const snap = matchedDoc || (await getDoc(userRef));

    if (snap.exists()) {
      const data = snap.data() || {};
      let userRole: UserRole = isAdmin ? 'admin' : (data.role === 'admin' ? 'reader' : ((data.role as UserRole) || 'reader'));
      if (userRole === 'reader') {
        const isApprovedAuthor = await checkIfUserIsApprovedAuthor(snap.id, cleanEmail);
        if (isApprovedAuthor) {
          userRole = 'author';
        }
      }

      // NẾU ĐÃ TỒN TẠI: TUYỆT ĐỐI KHÔNG ghi đè tài sản cũ; chỉ cập nhật lastLogin nếu quá 5 phút hoặc thiếu authProvider
      const now = Date.now();
      const lastRecorded = Math.max(
        Number(data.lastLogin || data.lastSeen || 0),
        lastPresenceWriteByUid.get(snap.id) || 0
      );
      if (!data.authProvider || now - lastRecorded > LAST_PRESENCE_COOLDOWN_MS) {
        lastPresenceWriteByUid.set(snap.id, now);
        updateDoc(userRef, {
          authProvider: data.authProvider || 'email',
          lastLogin: now,
        }).catch(() => {});
      }

      const balances = extractXuBalances(data);
      let realXu = balances.xuBalance;
      let realEarned = balances.authorEarnedXu;
      let realFlowers = balances.flowerBalance;
      let mergedChapters = extractPurchasedChaptersMap(data);
      let mergedFullBooks: string[] = Array.isArray(data.unlockedFullBooks) ? data.unlockedFullBooks : [];
      let mergedPurchases: any[] = Array.isArray(data.purchases) ? data.purchases : [];

      if (realXu === 0 && realEarned === 0) {
        const legacyRecovered = await recoverLegacyUserDataByEmail(cleanEmail, snap.id);
        if (legacyRecovered) {
          const lb = extractXuBalances(legacyRecovered);
          if (lb.xuBalance > 0) realXu = lb.xuBalance;
          if (lb.authorEarnedXu > 0) realEarned = lb.authorEarnedXu;
          if (lb.flowerBalance > realFlowers) realFlowers = lb.flowerBalance;
          mergedChapters = mergePurchasedChaptersMaps(mergedChapters, extractPurchasedChaptersMap(legacyRecovered));
          if (Array.isArray(legacyRecovered.unlockedFullBooks)) {
            mergedFullBooks = Array.from(new Set([...mergedFullBooks, ...legacyRecovered.unlockedFullBooks]));
          }
          if ((mergedPurchases?.length || 0) === 0 && Array.isArray(legacyRecovered.purchases)) {
            mergedPurchases = legacyRecovered.purchases;
          }
        }
      }

      const isBanned = Boolean(
        data.isBanned === true || data.isLocked === true || data.status === 'banned' || data.status === 'Bị khóa'
      );

      const profile: UserProfile = {
        id: snap.id,
        email: data.email || cleanEmail,
        displayName: data.displayName || displayName || cleanEmail.split('@')[0],
        avatarUrl: data.avatarUrl || data.photoURL || '',
        bio: data.bio || '',
        followers: Array.isArray(data.followers) ? data.followers : [],
        followingCreators: Array.isArray(data.followingCreators) ? data.followingCreators : [],
        isLoggedIn: true,
        role: userRole,
        isBanned,
        isLocked: isBanned,
        xuBalance: realXu,
        authorEarnedXu: realEarned,
        flowerBalance: realFlowers,
        lastDailyRewardDate: data.lastDailyRewardDate || '',
        lastDailyRewardTimestamp: parseNumericValue(data.lastDailyRewardTimestamp),
        bankInfo: data.bankInfo || undefined,
        notifications: Array.isArray(data.notifications) ? data.notifications : [],
        readingHistory: Array.isArray(data.readingHistory) ? data.readingHistory : [],
        bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
        purchasedChapters: extractPurchasedChaptersList(data),
        purchasedStories: Array.isArray(data.purchasedStories) ? data.purchasedStories : [],
        unlockedChapters: mergedChapters,
        unlockedFullBooks: mergedFullBooks,
        purchases: mergedPurchases,
      };
      return profile;
    } else {
      let initialRole: UserRole = isAdmin ? 'admin' : 'reader';
      if (initialRole === 'reader') {
        const isApprovedAuthor = await checkIfUserIsApprovedAuthor(uid, cleanEmail);
        if (isApprovedAuthor) {
          initialRole = 'author';
        }
      }

      const newProfile: UserProfile = {
        id: uid,
        email: cleanEmail,
        displayName: displayName || cleanEmail.split('@')[0],
        avatarUrl: '',
        bio: '',
        followers: [],
        followingCreators: [],
        isLoggedIn: true,
        role: initialRole,
        xuBalance: 0,
        authorEarnedXu: 0,
        flowerBalance: 0,
        lastDailyRewardDate: '',
        lastDailyRewardTimestamp: 0,
        notifications: [],
        readingHistory: [],
        bookmarks: [],
        purchasedChapters: [],
        unlockedChapters: {},
        unlockedFullBooks: [],
        purchases: [],
      };
      await setDoc(
        userRef,
        cleanUndefinedFields({
          ...newProfile,
          uid,
          authProvider: 'email',
          coins: 0,
          isBanned: false,
          isLocked: false,
          createdAt: Date.now(),
          lastLogin: Date.now(),
        }),
        { merge: true }
      );
      return newProfile;
    }
  } catch (err) {
    console.warn('Direct login Firestore sync error:', err);
    const fallbackProfile: UserProfile = {
      id: uid,
      email: cleanEmail,
      displayName: displayName || cleanEmail.split('@')[0],
      avatarUrl: '',
      bio: '',
      followers: [],
      followingCreators: [],
      isLoggedIn: true,
      role: isAdmin ? 'admin' : 'reader',
      xuBalance: 0,
      authorEarnedXu: 0,
      flowerBalance: 0,
      lastDailyRewardDate: '',
      lastDailyRewardTimestamp: 0,
      readingHistory: [],
      bookmarks: [],
      unlockedChapters: {},
      unlockedFullBooks: [],
      purchases: [],
    };
    return fallbackProfile;
  }
}

/**
 * Kiểm tra xem người dùng có bản thảo hoặc đơn đăng ký nào đã được duyệt hay không
 */
export async function checkIfUserIsApprovedAuthor(
  userId?: string | null,
  userEmail?: string | null
): Promise<boolean> {
  try {
    const subCol = collection(db, 'novel_submissions');
    if (userId && userId !== 'guest') {
      const q1 = query(subCol, where('submittedBy.userId', '==', userId), where('status', '==', 'approved'));
      const snap1 = await getDocs(q1);
      if (!snap1.empty) return true;
    }
    if (userEmail) {
      const cleanEmail = userEmail.toLowerCase().trim();
      const q2 = query(subCol, where('submittedBy.userEmail', '==', cleanEmail), where('status', '==', 'approved'));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) return true;
    }
    if (userId && userId !== 'guest') {
      const appCol = collection(db, 'creator_applications');
      const qApp = query(appCol, where('userId', '==', userId), where('status', '==', 'approved'));
      const snapApp = await getDocs(qApp);
      if (!snapApp.empty) return true;
    }
    return false;
  } catch (err) {
    console.warn('Lỗi kiểm tra quyền tác giả đã duyệt:', err);
    return false;
  }
}

/**
 * Đăng xuất tài khoản Firebase
 */
export async function logoutUser(): Promise<void> {
  safeRemoveItem('daotam_direct_user');
  safeRemoveItem('daotam_user_profile');
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign-out failed:', error);
  }
}

/**
 * Lấy thời điểm giao dịch mới nhất của 1 user document (dùng để chọn Document Chính)
 */
function getLatestTransactionTimestamp(data: Record<string, any> | undefined): number {
  if (!data) return 0;
  let maxTs = parseNumericValue(data.lastTransactionAt) || 0;
  if (Array.isArray(data.purchases)) {
    for (const p of data.purchases) {
      const ts = parseNumericValue(p?.purchasedAt) || parseNumericValue(p?.createdAt) || 0;
      if (ts > maxTs) maxTs = ts;
    }
  }
  return maxTs;
}

/**
 * Chọn 1 Document Chính duy nhất từ danh sách các document trùng email:
 * - Bỏ qua các document phụ đã được gộp (mergedInto) nếu còn document chưa gộp.
 * - Ưu tiên document không bị khóa, có giao dịch mới nhất hoặc UID chuẩn của Firebase Auth.
 */
function selectCanonicalUserDoc(
  docs: QueryDocumentSnapshot<DocumentData>[],
  firebaseUid?: string
): QueryDocumentSnapshot<DocumentData> {
  const unmerged = docs.filter((d) => !d.data()?.mergedInto);
  const pool = unmerged.length > 0 ? unmerged : docs;

  return [...pool].sort((a, b) => {
    const da = a.data() || {};
    const dbData = b.data() || {};

    const aLocked = Boolean(da.isLocked === true || da.isBanned === true || da.status === 'banned' || da.status === 'Bị khóa');
    const bLocked = Boolean(dbData.isLocked === true || dbData.isBanned === true || dbData.status === 'banned' || dbData.status === 'Bị khóa');
    if (aLocked !== bLocked) return aLocked ? 1 : -1;

    const aTx = getLatestTransactionTimestamp(da);
    const bTx = getLatestTransactionTimestamp(dbData);
    if (aTx !== bTx) return bTx - aTx;

    const aIsFirebaseUid = !a.id.startsWith('usr-') && !a.id.startsWith('g-');
    const bIsFirebaseUid = !b.id.startsWith('usr-') && !b.id.startsWith('g-');
    if (aIsFirebaseUid !== bIsFirebaseUid) return aIsFirebaseUid ? -1 : 1;

    if (firebaseUid) {
      const aMatchesUid = a.id === firebaseUid || da.uid === firebaseUid;
      const bMatchesUid = b.id === firebaseUid || dbData.uid === firebaseUid;
      if (aMatchesUid !== bMatchesUid) return aMatchesUid ? -1 : 1;
    }

    const aLast = parseNumericValue(da.lastLogin) || parseNumericValue(da.updatedAt) || 0;
    const bLast = parseNumericValue(dbData.lastLogin) || parseNumericValue(dbData.updatedAt) || 0;
    if (aLast !== bLast) return bLast - aLast;

    return extractXuBalances(dbData).xuBalance - extractXuBalances(da).xuBalance;
  })[0];
}

/**
 * Đồng bộ hoặc khởi tạo User Profile trong Firestore collection "users"
 * KHÓA CỬA TƯƠNG LAI:
 * - BẮT BUỘC query theo email trước: query(collection(db, 'users'), where('email', '==', cleanEmail))
 * - NẾU email đã tồn tại: TUYỆT ĐỐI CẤM dùng setDoc tạo ID mới. Trả về document cũ và updateDoc(uid, authProvider).
 * - NẾU email chưa tồn tại: Mới được phép tạo document mới.
 */
export async function syncUserProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
  const cleanEmail = (firebaseUser.email || '').trim().toLowerCase();
  const authProvider = firebaseUser.providerData?.[0]?.providerId || 'google.com';
  const isAdmin = checkIsAdmin(cleanEmail || firebaseUser.email);
  let path = `users/${firebaseUser.uid}`;
  let currentOp: OperationType = OperationType.GET;

  try {
    // BƯỚC 1: BẮT BUỘC kiểm tra theo email trước bằng query(collection(db, 'users'), where('email', '==', ...))
    let matchedEmailDocs: QueryDocumentSnapshot<DocumentData>[] = [];
    if (cleanEmail) {
      const emailSnap = await getDocs(
        query(collection(db, 'users'), where('email', '==', cleanEmail))
      );
      matchedEmailDocs = emailSnap.docs;

      if (
        matchedEmailDocs.length === 0 &&
        firebaseUser.email &&
        firebaseUser.email.trim() !== cleanEmail
      ) {
        const rawEmailSnap = await getDocs(
          query(collection(db, 'users'), where('email', '==', firebaseUser.email.trim()))
        );
        matchedEmailDocs = rawEmailSnap.docs;
      }
    }

    // Nếu không tìm thấy qua email, kiểm tra thêm doc theo UID phòng trường hợp user cũ thiếu field email
    let existingDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    if (matchedEmailDocs.length > 0) {
      existingDoc = selectCanonicalUserDoc(matchedEmailDocs, firebaseUser.uid);
    } else {
      const uidSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (uidSnap.exists()) {
        existingDoc = uidSnap as QueryDocumentSnapshot<DocumentData>;
      }
    }

    if (existingDoc) {
      // NẾU EMAIL ĐÃ TỒN TẠI: TUYỆT ĐỐI CẤM dùng setDoc tạo ID mới!
      path = `users/${existingDoc.id}`;
      const data = existingDoc.data() || {};

      // Chỉ cập nhật uid/authProvider khi thực sự thay đổi, và chỉ cập nhật lastLogin nếu quá 5 phút
      const now = Date.now();
      const lastRecorded = Math.max(
        Number(data.lastLogin || data.lastSeen || 0),
        lastPresenceWriteByUid.get(existingDoc.id) || 0
      );
      const needsPresenceUpdate = now - lastRecorded > LAST_PRESENCE_COOLDOWN_MS;
      const mappingUpdates: Record<string, any> = {};

      if (data.uid !== firebaseUser.uid) {
        mappingUpdates.uid = firebaseUser.uid;
      }
      if (data.authProvider !== authProvider) {
        mappingUpdates.authProvider = authProvider;
      }
      if (!data.email && cleanEmail) {
        mappingUpdates.email = cleanEmail;
      }
      if (needsPresenceUpdate) {
        mappingUpdates.lastLogin = now;
      }

      if (Object.keys(mappingUpdates).length > 0) {
        currentOp = OperationType.UPDATE;
        lastPresenceWriteByUid.set(existingDoc.id, now);
        await updateDoc(existingDoc.ref, mappingUpdates).catch((err) => {
          console.warn('[syncUserProfile] Cảnh báo khi map uid/authProvider lên doc cũ:', err?.message || err);
        });
      }

      // TUYỆT ĐỐI CHỈ cấp quyền admin nếu email nằm trong danh sách ADMIN_EMAILS
      let determinedRole: UserRole = isAdmin ? 'admin' : (data.role === 'admin' ? 'reader' : (data.role || 'reader'));
      if (!isAdmin && determinedRole !== 'author') {
        const isApproved = await checkIfUserIsApprovedAuthor(existingDoc.id, cleanEmail || firebaseUser.email);
        if (isApproved) {
          determinedRole = 'author';
        }
      }

      const balances = extractXuBalances(data);
      let userXu = balances.xuBalance;
      let authorXu = balances.authorEarnedXu;
      let userFlowers = balances.flowerBalance;
      let mergedUnlockedChapters = extractPurchasedChaptersMap(data);
      let mergedFullBooks: string[] = Array.isArray(data.unlockedFullBooks) ? data.unlockedFullBooks : [];
      let mergedPurchases: any[] = Array.isArray(data.purchases) ? data.purchases : [];

      if (userXu === 0 && authorXu === 0 && cleanEmail) {
        const legacyRecovered = await recoverLegacyUserDataByEmail(cleanEmail, existingDoc.id);
        if (legacyRecovered) {
          const lb = extractXuBalances(legacyRecovered);
          if (lb.xuBalance > 0) userXu = lb.xuBalance;
          if (lb.authorEarnedXu > 0) authorXu = lb.authorEarnedXu;
          if (lb.flowerBalance > userFlowers) userFlowers = lb.flowerBalance;
          mergedUnlockedChapters = mergePurchasedChaptersMaps(
            mergedUnlockedChapters,
            extractPurchasedChaptersMap(legacyRecovered)
          );
          if (Array.isArray(legacyRecovered.unlockedFullBooks)) {
            mergedFullBooks = Array.from(new Set([...mergedFullBooks, ...legacyRecovered.unlockedFullBooks]));
          }
          if ((mergedPurchases?.length || 0) === 0 && Array.isArray(legacyRecovered.purchases)) {
            mergedPurchases = legacyRecovered.purchases;
          }
        }
      }

      const isBanned = Boolean(data.isBanned === true || data.isLocked === true || data.status === 'banned' || data.status === 'Bị khóa');
      const resolvedDisplayName = data.displayName || firebaseUser.displayName || 'Độc Giả';
      const resolvedAvatarUrl = (data.avatarUrl && data.avatarUrl.trim() !== '')
        ? data.avatarUrl
        : (data.photoURL || firebaseUser.photoURL || '');

      const [docIdNotifs, uidNotifs] = await Promise.all([
        fetchUserNotificationsFromCollection(existingDoc.id),
        existingDoc.id !== firebaseUser.uid
          ? fetchUserNotificationsFromCollection(firebaseUser.uid)
          : Promise.resolve([]),
      ]);
      const mergedNotifications = mergeNotificationsLists(
        Array.isArray(data.notifications) ? data.notifications : [],
        [...docIdNotifs, ...uidNotifs]
      );

      const existingProfile: UserProfile = {
        id: existingDoc.id,
        email: data.email || cleanEmail || firebaseUser.email || '',
        displayName: resolvedDisplayName,
        avatarUrl: resolvedAvatarUrl,
        bio: data.bio || '',
        followers: Array.isArray(data.followers) ? data.followers : [],
        followingCreators: Array.isArray(data.followingCreators) ? data.followingCreators : [],
        isLoggedIn: true,
        role: determinedRole,
        isBanned,
        isLocked: isBanned,
        xuBalance: userXu,
        authorEarnedXu: authorXu,
        flowerBalance: userFlowers,
        lastDailyRewardDate: data.lastDailyRewardDate || '',
        lastDailyRewardTimestamp: parseNumericValue(data.lastDailyRewardTimestamp),
        bankInfo: data.bankInfo || undefined,
        notifications: mergedNotifications,
        readingHistory: Array.isArray(data.readingHistory) ? data.readingHistory : [],
        bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
        purchasedChapters: extractPurchasedChaptersList(data),
        purchasedStories: Array.isArray(data.purchasedStories) ? data.purchasedStories : [],
        unlockedChapters: mergedUnlockedChapters,
        unlockedFullBooks: mergedFullBooks,
        purchases: mergedPurchases,
      };

      return existingProfile;
    } else {
      // NẾU EMAIL CHƯA TỒN TẠI: Mới được phép tạo document mới
      const userRef = doc(db, 'users', firebaseUser.uid);
      path = `users/${firebaseUser.uid}`;

      let newRole: UserRole = isAdmin ? 'admin' : 'reader';
      if (!isAdmin) {
        const isApproved = await checkIfUserIsApprovedAuthor(firebaseUser.uid, cleanEmail || firebaseUser.email);
        if (isApproved) newRole = 'author';
      }

      const newDisplayName =
        firebaseUser.displayName ||
        (cleanEmail ? cleanEmail.split('@')[0] : 'Độc Giả');
      const newAvatarUrl =
        firebaseUser.photoURL ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${firebaseUser.uid}`;

      const newProfile: UserProfile = {
        id: firebaseUser.uid,
        email: cleanEmail || firebaseUser.email || '',
        displayName: newDisplayName,
        avatarUrl: newAvatarUrl,
        bio: '',
        followers: [],
        followingCreators: [],
        isLoggedIn: true,
        role: newRole,
        isBanned: false,
        isLocked: false,
        xuBalance: 0,
        authorEarnedXu: 0,
        flowerBalance: 0,
        lastDailyRewardDate: '',
        lastDailyRewardTimestamp: 0,
        bankInfo: undefined,
        notifications: [],
        readingHistory: [],
        bookmarks: [],
        purchasedChapters: [],
        unlockedChapters: {},
        unlockedFullBooks: [],
        purchases: [],
      };

      currentOp = OperationType.WRITE;
      await setDoc(
        userRef,
        cleanUndefinedFields({
          uid: firebaseUser.uid,
          authProvider,
          email: newProfile.email,
          displayName: newProfile.displayName,
          photoURL: newProfile.avatarUrl,
          avatarUrl: newProfile.avatarUrl,
          role: newProfile.role,
          isBanned: false,
          isLocked: false,
          status: 'Hoạt động',
          createdAt: new Date().toISOString(),
          lastLogin: Date.now(),
          bio: newProfile.bio,
          followers: newProfile.followers,
          followingCreators: newProfile.followingCreators,
          coins: 0,
          xuBalance: 0,
          authorEarnedXu: 0,
          flowerBalance: 0,
          lastDailyRewardDate: '',
          lastDailyRewardTimestamp: 0,
          notifications: [],
          readingHistory: [],
          bookmarks: [],
          purchasedChapters: [],
          unlockedChapters: {},
          unlockedFullBooks: [],
          purchases: [],
        }),
        { merge: true }
      );

      return newProfile;
    }
  } catch (error) {
    handleFirestoreError(error, currentOp, path);
  }
}

/**
 * Hợp nhất danh sách thông báo (từ user doc và collection notifications), loại trùng và sắp xếp mới nhất lên đầu
 */
export function mergeNotificationsLists(
  docNotifs: UserNotification[] = [],
  collectionNotifs: UserNotification[] = []
): UserNotification[] {
  const byId = new Map<string, UserNotification>();
  for (const item of [...collectionNotifs, ...docNotifs]) {
    if (!item || !item.id) continue;
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, item);
    } else {
      byId.set(item.id, {
        ...prev,
        ...item,
        isRead: Boolean(prev.isRead || item.isRead),
      });
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
  );
}

/**
 * Đọc tối đa 25 thông báo mới nhất của user từ collection 'notifications' (chỉ 1 query theo userId, không dùng onSnapshot)
 */
export async function fetchUserNotificationsFromCollection(
  userId: string
): Promise<UserNotification[]> {
  if (!userId || userId === 'guest') return [];
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      limit(25)
    );
    const snap = await getDocs(q);
    return (snap?.docs || [])
      .map((d) => {
        const data = d.data() as Record<string, any>;
        return {
          id: data.id || d.id,
          title: String(data.title || 'Thông báo hệ thống'),
          message: String(data.message || ''),
          type: (data.type || 'system') as UserNotification['type'],
          createdAt: Number(data.createdAt || Date.now()),
          isRead: Boolean(data.isRead),
          novelId: data.novelId ? String(data.novelId) : undefined,
        } as UserNotification;
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  } catch (err) {
    console.warn('Không thể tải notifications collection:', err);
    return [];
  }
}

/**
 * Đánh dấu đã đọc các document trong collection 'notifications' của user khi user bấm "Đánh dấu đã đọc"
 */
export async function markNotificationsCollectionAsRead(userId: string): Promise<void> {
  if (!userId || userId === 'guest') return;
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', false),
      limit(25)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.update(d.ref, { isRead: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Không thể đánh dấu đã đọc collection notifications:', err);
  }
}

/**
 * Cập nhật bút danh (displayName), ảnh đại diện (avatarUrl/photoURL) của User trên Firestore
 */
export async function updateUserProfileInFirestore(
  userId: string,
  data: { displayName?: string; avatarUrl?: string; bio?: string; [key: string]: any }
): Promise<void> {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    const updatePayload: Record<string, any> = {};
    if (data.displayName !== undefined) updatePayload.displayName = data.displayName;
    if (data.avatarUrl !== undefined) {
      updatePayload.avatarUrl = data.avatarUrl;
      updatePayload.photoURL = data.avatarUrl;
    }
    if (data.bio !== undefined) updatePayload.bio = data.bio;

    await updateDoc(userRef, cleanUndefinedFields(updatePayload));

    if (auth.currentUser && auth.currentUser.uid === userId) {
      updateProfile(auth.currentUser, {
        displayName: data.displayName || auth.currentUser.displayName || undefined,
        photoURL: (data.avatarUrl && data.avatarUrl.startsWith('http')) ? data.avatarUrl : (auth.currentUser.photoURL || undefined),
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function getUserRolePriority(u: UserProfile): number {
  if (checkIsAdmin(u.email) || u.role === 'admin') return 1;
  if (u.role === 'author' || (u.role as string) === 'editor' || Boolean((u as any).isAuthor)) return 2;
  return 3;
}

export function sortUsersAdminPriority(list: UserProfile[]): UserProfile[] {
  return [...list].sort((a, b) => {
    const aLocked = Boolean(a.isLocked || a.isBanned || (a as any).status === 'Bị khóa' || (a as any).status === 'banned') ? 1 : 0;
    const bLocked = Boolean(b.isLocked || b.isBanned || (b as any).status === 'Bị khóa' || (b as any).status === 'banned') ? 1 : 0;
    if (bLocked !== aLocked) return bLocked - aLocked;

    const aRolePri = getUserRolePriority(a);
    const bRolePri = getUserRolePriority(b);
    if (aRolePri !== bRolePri) return aRolePri - bRolePri;

    return (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', 'vi');
  });
}

function mapDocToAdminUser(d: QueryDocumentSnapshot<DocumentData>): UserProfile {
  const data = d.data() || {};
  const realXuBalance =
    data.xuBalance !== undefined && data.xuBalance !== null
      ? Math.max(0, parseNumericValue(data.xuBalance))
      : 0;
  const realAuthorEarned =
    data.authorEarnedXu !== undefined && data.authorEarnedXu !== null
      ? Math.max(0, parseNumericValue(data.authorEarnedXu))
      : 0;
  const locked = Boolean(data.isLocked === true || data.isBanned === true || data.status === 'banned' || data.status === 'Bị khóa');
  return {
    id: d.id,
    email: data.email || '',
    displayName: data.displayName || (data.email ? data.email.split('@')[0] : 'Độc giả'),
    avatarUrl: data.avatarUrl || data.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${d.id}`,
    role: (data.role as UserRole) || 'reader',
    isBanned: locked,
    isLocked: locked,
    xuBalance: realXuBalance,
    authorEarnedXu: realAuthorEarned,
    createdAt: data.createdAt || '',
    isLoggedIn: false,
    followers: Array.isArray(data.followers) ? data.followers : [],
    followingCreators: Array.isArray(data.followingCreators) ? data.followingCreators : [],
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    readingHistory: Array.isArray(data.readingHistory) ? data.readingHistory : [],
    bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
    purchasedChapters: extractPurchasedChaptersList(data),
    unlockedChapters: extractPurchasedChaptersMap(data),
    unlockedFullBooks: Array.isArray(data.unlockedFullBooks) ? data.unlockedFullBooks : [],
    purchases: Array.isArray(data.purchases) ? data.purchases : [],
  } as UserProfile;
}

/**
 * Đếm tổng số tài khoản bị khóa trên toàn bộ Firestore bằng getCountFromServer
 */
export async function fetchLockedUsersCountFromFirestore(): Promise<number> {
  try {
    const usersCol = collection(db, 'users');
    const [lockedSnap, bannedSnap] = await Promise.all([
      getCountFromServer(query(usersCol, where('isLocked', '==', true))),
      getCountFromServer(query(usersCol, where('isBanned', '==', true))),
    ]);
    return Math.max(lockedSnap.data().count || 0, bannedSnap.data().count || 0);
  } catch (err) {
    console.warn('Lỗi fetchLockedUsersCountFromFirestore:', err);
    return 0;
  }
}

/**
 * Tải danh sách User phân trang tối ưu Quota Spark:
 * - Bắt buộc dùng orderBy('isLocked', 'desc') để đưa TẤT CẢ tài khoản bị khóa lên trang 1.
 * - Kết hợp sắp xếp ưu tiên tiếp theo theo Role (Admin > Tác giả/Editor > Độc giả).
 */
export async function fetchUsersPaginatedFromFirestore(
  pageSize = 25,
  lastVisibleDoc?: QueryDocumentSnapshot<DocumentData> | null
): Promise<{
  users: UserProfile[];
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  const path = 'users';
  try {
    const usersCol = collection(db, path);
    let snap;
    try {
      const q = lastVisibleDoc
        ? query(usersCol, orderBy('isLocked', 'desc'), orderBy('role', 'asc'), startAfter(lastVisibleDoc), limit(pageSize))
        : query(usersCol, orderBy('isLocked', 'desc'), orderBy('role', 'asc'), limit(pageSize));
      snap = await getDocs(q);
    } catch (error: any) {
      const errorCode = String(error?.code || '').toLowerCase();
      const rawMessage = String(error?.message || error || '');
      if (
        errorCode === 'failed-precondition' ||
        errorCode.includes('failed-precondition') ||
        rawMessage.toLowerCase().includes('index') ||
        rawMessage.includes('The query requires an index')
      ) {
        console.error(
          `====================================================================\n` +
            `🚨 [FIRESTORE COMPOSITE INDEX REQUIRED - fetchUsersPaginatedFromFirestore]\n` +
            `Click trực tiếp vào link bên dưới để tạo Index trên Firebase Console:\n\n` +
            `${rawMessage}\n` +
            `====================================================================`
        );
        console.error('[Raw Firebase Index Error]:', error);
      } else {
        console.error('Lỗi truy vấn danh sách người dùng Firestore:', error);
      }

      // Fallback an toàn nếu query orderBy gặp lỗi thiếu Composite Index tạm thời
      const fallbackQ = lastVisibleDoc
        ? query(usersCol, startAfter(lastVisibleDoc), limit(pageSize))
        : query(usersCol, limit(pageSize));
      snap = await getDocs(fallbackQ);
    }

    const userMap = new Map<string, UserProfile>();
    (snap?.docs || []).forEach((d) => {
      const data = d.data() || {};
      if (data.mergedInto) return;
      userMap.set(d.id, mapDocToAdminUser(d));
    });

    // Nếu ở trang 1 và có tài khoản cũ chưa có trường isLocked (Firestore orderBy bỏ qua doc thiếu field),
    // bổ sung từ batch mặc định và đồng bộ ngầm trường isLocked
    if (!lastVisibleDoc && (snap?.docs?.length || 0) < pageSize) {
      const legacySnap = await getDocs(query(usersCol, limit(pageSize)));
      (legacySnap?.docs || []).forEach((d) => {
        const data = d.data() || {};
        if (data.mergedInto) return;
        if (!userMap.has(d.id)) {
          userMap.set(d.id, mapDocToAdminUser(d));
        }
        if (typeof data.isLocked !== 'boolean') {
          updateDoc(doc(db, path, d.id), { isLocked: Boolean(data.isBanned === true) }).catch(() => {});
        }
      });
    }

    const users = sortUsersAdminPriority(Array.from(userMap.values()));
    const snapDocs = snap?.docs || [];
    const lastVisible = (snapDocs?.length || 0) > 0 ? snapDocs[(snapDocs?.length || 0) - 1] : null;

    return {
      users,
      lastVisible,
      hasMore: (snapDocs?.length || 0) === pageSize,
    };
  } catch (error) {
    console.error('Lỗi fetchUsersPaginatedFromFirestore:', error);
    handleFirestoreError(error, OperationType.GET, path);
    return { users: [], lastVisible: null, hasMore: false };
  }
}

/**
 * Tìm kiếm người dùng trực tiếp trên máy chủ Firestore theo tiền tố Email (Prefix Query):
 * - Bắt buộc bọc giới hạn limit(20) để bảo vệ Quota Đọc của Firebase Spark.
 */
export async function searchUsersByEmailPrefixFromFirestore(
  searchTerm: string
): Promise<UserProfile[]> {
  const path = 'users';
  const cleanTerm = (searchTerm || '').trim().toLowerCase();
  if (!cleanTerm) return [];

  try {
    const q = query(
      collection(db, path),
      where('email', '>=', cleanTerm),
      where('email', '<=', cleanTerm + '\uf8ff'),
      limit(20)
    );
    const snap = await getDocs(q);
    const items = (snap?.docs || [])
      .filter((d) => !d.data()?.mergedInto)
      .map(mapDocToAdminUser);
    return sortUsersAdminPriority(items);
  } catch (error) {
    console.error('Lỗi searchUsersByEmailPrefixFromFirestore:', error);
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

/**
 * Khóa (Ban) hoặc Mở khóa tài khoản người dùng trên Firestore:
 * Đồng bộ cả hai trường isBanned và isLocked để query orderBy('isLocked', 'desc') chính xác 100%.
 */
export async function toggleBanUserInFirestore(userId: string, isBanned: boolean): Promise<void> {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      isBanned,
      isLocked: isBanned,
      status: isBanned ? 'Bị khóa' : 'Hoạt động',
      bannedAt: isBanned ? Date.now() : null,
    });
  } catch (error) {
    console.error('Lỗi toggleBanUserInFirestore:', error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Admin Tặng Xu (Donate Coins) bằng Firestore writeBatch:
 * 1. Cộng xu trực tiếp bằng increment(amount) (tuyệt đối không cộng tay ở client).
 * 2. Tạo 1 document vào collection 'notifications' và đồng bộ vào mảng notifications của user.
 */
export async function donateCoinsToUserByAdmin(
  targetUserId: string,
  amount: number,
  adminEmail: string
): Promise<{ amount: number; notifItem: UserNotification }> {
  const path = `users/${targetUserId}`;
  if (!checkIsAdmin(adminEmail)) {
    throw new Error('Chỉ Quản trị viên chính thức mới có quyền thực hiện thao tác Tặng Xu.');
  }
  const cleanAmount = Math.floor(Number(amount));
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new Error('Số lượng Xu tặng phải là số nguyên dương lớn hơn 0.');
  }
  if (!targetUserId) {
    throw new Error('Thiếu ID người nhận Xu.');
  }

  try {
    const batch = writeBatch(db);
    const userRef = doc(db, 'users', targetUserId);
    const notifDocRef = doc(collection(db, 'notifications'));
    const now = Date.now();
    const formattedAmount = cleanAmount.toLocaleString('vi-VN');

    const notifItem: UserNotification = {
      id: notifDocRef.id,
      title: `Quà tặng ${formattedAmount} Xu từ Quản trị viên`,
      message: `Bạn đã nhận được ${formattedAmount} Xu từ Quản trị viên`,
      type: 'topup',
      createdAt: now,
      isRead: false,
    };

    // 1. Cộng xu bằng Firestore increment() + đồng bộ chuông thông báo trên user doc
    batch.update(userRef, {
      xuBalance: increment(cleanAmount),
      notifications: arrayUnion(notifItem),
    });

    // 2. Tạo 1 document mới vào collection 'notifications'
    batch.set(notifDocRef, {
      ...notifItem,
      userId: targetUserId,
      amount: cleanAmount,
      adminEmail: adminEmail.toLowerCase().trim(),
    });

    await batch.commit();
    return { amount: cleanAmount, notifItem };
  } catch (error) {
    console.error('Lỗi donateCoinsToUserByAdmin:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * ADMIN CẤP QUYỀN TRUYỆN / CHƯƠNG (ĐỀN BÙ):
 * - Sử dụng arrayUnion() đẩy ID Truyện/Chương vào mảng purchasedChapters của User trên Firestore.
 * - TUYỆT ĐỐI KHÔNG đụng chạm đến trường xuBalance.
 */
export async function grantStoryAccessToUserByAdmin(params: {
  targetUserId: string;
  novelIdInput: string;
  chapterIdInput?: string;
  adminEmail: string;
}): Promise<{ grantedIds: string[]; notifItem: UserNotification }> {
  const { targetUserId, novelIdInput, chapterIdInput, adminEmail } = params;
  const path = `users/${targetUserId}`;

  if (!checkIsAdmin(adminEmail)) {
    throw new Error('Chỉ Quản trị viên hợp lệ mới có quyền Cấp Quyền Truyện.');
  }
  if (!targetUserId) {
    throw new Error('Thiếu ID người dùng cần cấp quyền.');
  }

  const cleanNovelId = (novelIdInput || '').trim();
  const rawChapters = (chapterIdInput || '')
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
    throw new Error('Vui lòng nhập ID Truyện hoặc ID Chương cần cấp quyền.');
  }

  try {
    const userRef = doc(db, 'users', targetUserId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      throw new Error('Không tìm thấy tài khoản người dùng trên hệ thống.');
    }

    const userData = snap.data() as Record<string, any>;
    const notifDocRef = doc(collection(db, 'notifications'));
    const now = Date.now();
    const labelText = cleanNovelId
      ? rawChapters.length > 0
        ? `truyện "${cleanNovelId}" (chương: ${rawChapters.join(', ')})`
        : `toàn bộ truyện "${cleanNovelId}"`
      : `mục "${rawChapters.join(', ')}"`;

    const notifItem: UserNotification = {
      id: notifDocRef.id,
      title: 'Quản trị viên đã cấp quyền đọc truyện',
      message: `Bạn vừa được Quản trị viên cấp quyền truy cập ${labelText}. Chúc bạn đọc truyện vui vẻ!`,
      type: 'system',
      createdAt: now,
      isRead: false,
      novelId: cleanNovelId || undefined,
    };

    // Nếu user doc cũ từng lưu purchasedChapters dạng Object Map thay vì Array, chuẩn hóa sang Array trước để arrayUnion hoạt động an toàn 100%
    if (userData.purchasedChapters && !Array.isArray(userData.purchasedChapters)) {
      const legacyFlattened = extractPurchasedChaptersList(userData);
      await updateDoc(userRef, {
        purchasedChapters: Array.from(new Set([...legacyFlattened, ...idsToGrant])),
        notifications: arrayUnion(notifItem),
      });
    } else {
      await updateDoc(userRef, {
        purchasedChapters: arrayUnion(...idsToGrant),
        notifications: arrayUnion(notifItem),
      });
    }

    await setDoc(notifDocRef, {
      ...notifItem,
      userId: targetUserId,
      grantedIds: idsToGrant,
      adminEmail: adminEmail.toLowerCase().trim(),
    }).catch(() => {});

    return { grantedIds: idsToGrant, notifItem };
  } catch (error) {
    console.error('Lỗi grantStoryAccessToUserByAdmin:', error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface MergeDuplicateUsersResult {
  mergedEmailsCount: number;
  mergedSecondaryDocsCount: number;
  totalXuMerged: number;
  details: Array<{
    email: string;
    primaryDocId: string;
    secondaryDocIds: string[];
    finalXuBalance: number;
  }>;
}

/**
 * DỌN DẸP HẬU QUẢ CŨ (SCRIPT GỘP TÀI KHOẢN TRÙNG EMAIL TRONG ADMIN):
 * 1. Quét toàn bộ collection 'users', gom nhóm theo trường email (lowercase).
 * 2. Bỏ qua các document phụ đã bị gộp trước đó (có mergedInto) để đảm bảo idempotent, không cộng đúp Xu.
 * 3. Nếu email nào có > 1 document:
 *    - Chọn Document Chính (ưu tiên giao dịch mới nhất hoặc UID của Firebase).
 *    - Chọn Document Phụ (document cũ, thường là usr-...).
 *    - Gộp Xu: xuBalance(Chính) = xuBalance(Chính) + xuBalance(Phụ).
 *    - Gộp Truyện: Nối mảng purchasedChapters và unlockedFullBooks của 2 bên (dùng Set loại bỏ trùng lặp).
 *    - Tiêu diệt Document Phụ: Gán isLocked: true, isBanned: true, status: 'banned' (và mergedInto) vào Document Phụ.
 *    - Thực thi bằng writeBatch() an toàn.
 */
export async function mergeDuplicateUsers(adminEmail: string): Promise<MergeDuplicateUsersResult> {
  if (!checkIsAdmin(adminEmail)) {
    throw new Error('Chỉ Quản trị viên chính thức mới có quyền chạy Đồng Bộ & Gộp Tài Khoản.');
  }

  const path = 'users';
  try {
    const allUsersSnap = await getDocs(collection(db, path));
    const groupedByEmail = new Map<string, QueryDocumentSnapshot<DocumentData>[]>();

    allUsersSnap.docs.forEach((d) => {
      const data = d.data() || {};
      if (data.mergedInto) return; // Đã gộp ở lần trước -> bỏ qua để tránh cộng trùng
      const cleanEmail = String(data.email || '').trim().toLowerCase();
      if (!cleanEmail) return;
      const list = groupedByEmail.get(cleanEmail) || [];
      list.push(d);
      groupedByEmail.set(cleanEmail, list);
    });

    const now = Date.now();
    let batch = writeBatch(db);
    let batchOps = 0;
    const commitBatchIfNeeded = async (incomingOps: number) => {
      if (batchOps + incomingOps >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        batchOps = 0;
      }
    };

    let mergedEmailsCount = 0;
    let mergedSecondaryDocsCount = 0;
    let totalXuMerged = 0;
    const details: MergeDuplicateUsersResult['details'] = [];

    for (const [email, docs] of groupedByEmail.entries()) {
      if (docs.length <= 1) continue;

      // Chọn Document Chính (ưu tiên giao dịch mới nhất hoặc UID của Firebase Auth)
      const primaryDoc = selectCanonicalUserDoc(docs);
      const secondaryDocs = docs.filter((d) => d.id !== primaryDoc.id);
      if (secondaryDocs.length === 0) continue;

      const primaryData = primaryDoc.data() || {};
      const primaryBalances = extractXuBalances(primaryData);

      let mergedXuBalance = primaryBalances.xuBalance;
      let mergedAuthorEarnedXu = primaryBalances.authorEarnedXu;
      let mergedFlowerBalance = primaryBalances.flowerBalance;

      const purchasedChaptersSet = new Set<string>(extractPurchasedChaptersList(primaryData));
      let mergedUnlockedMap = extractPurchasedChaptersMap(primaryData);
      const fullBooksSet = new Set<string>(
        Array.isArray(primaryData.unlockedFullBooks)
          ? primaryData.unlockedFullBooks.map((id: any) => String(id)).filter(Boolean)
          : []
      );
      const purchasesMerged: any[] = Array.isArray(primaryData.purchases) ? [...primaryData.purchases] : [];
      const seenPurchaseKeys = new Set<string>(
        purchasesMerged.map((p: any, idx: number) =>
          String(p?.id || `${p?.novelId || p?.storyId || ''}_${p?.chapterId || idx}_${p?.purchasedAt || ''}`)
        )
      );

      let resolvedUid =
        (!primaryDoc.id.startsWith('usr-') && !primaryDoc.id.startsWith('g-') ? primaryDoc.id : '') ||
        String(primaryData.uid || '');
      let resolvedRole = String(primaryData.role || 'reader');
      let resolvedIsAuthor = Boolean(primaryData.isAuthor);
      let secondaryAddedXu = 0;

      for (const secDoc of secondaryDocs) {
        const secData = secDoc.data() || {};
        const secBalances = extractXuBalances(secData);

        // Gộp Xu: xuBalance(Chính) = xuBalance(Chính) + xuBalance(Phụ)
        mergedXuBalance = parseFloat((mergedXuBalance + secBalances.xuBalance).toFixed(2));
        mergedAuthorEarnedXu = parseFloat((mergedAuthorEarnedXu + secBalances.authorEarnedXu).toFixed(2));
        mergedFlowerBalance = Math.max(mergedFlowerBalance, secBalances.flowerBalance);
        secondaryAddedXu = parseFloat((secondaryAddedXu + secBalances.xuBalance).toFixed(2));

        // Gộp Truyện: Nối mảng purchasedChapters và unlockedFullBooks bằng Set loại trùng
        for (const chKey of extractPurchasedChaptersList(secData)) {
          if (chKey) purchasedChaptersSet.add(chKey);
        }
        mergedUnlockedMap = mergePurchasedChaptersMaps(
          mergedUnlockedMap,
          extractPurchasedChaptersMap(secData)
        );
        if (Array.isArray(secData.unlockedFullBooks)) {
          secData.unlockedFullBooks.forEach((bookId: any) => {
            if (bookId) fullBooksSet.add(String(bookId));
          });
        }
        if (Array.isArray(secData.purchases)) {
          secData.purchases.forEach((p: any, idx: number) => {
            const pKey = String(
              p?.id || `${p?.novelId || p?.storyId || ''}_${p?.chapterId || idx}_${p?.purchasedAt || ''}`
            );
            if (!seenPurchaseKeys.has(pKey)) {
              seenPurchaseKeys.add(pKey);
              purchasesMerged.push(p);
            }
          });
        }

        if (!resolvedUid) {
          if (!secDoc.id.startsWith('usr-') && !secDoc.id.startsWith('g-')) {
            resolvedUid = secDoc.id;
          } else if (secData.uid && !String(secData.uid).startsWith('usr-')) {
            resolvedUid = String(secData.uid);
          }
        }
        if (secData.role === 'author' || secData.role === 'editor') {
          resolvedRole = String(secData.role);
        }
        if (secData.isAuthor) {
          resolvedIsAuthor = true;
        }
      }

      // Đảm bảo đồng bộ các key từ unlockedChapters map vào mảng purchasedChapters (Set chống trùng)
      for (const [nId, chList] of Object.entries(mergedUnlockedMap)) {
        for (const cId of chList || []) {
          if (!cId) continue;
          purchasedChaptersSet.add(nId === '__legacy__' ? String(cId) : `${nId}:${cId}`);
        }
      }

      // BƯỚC SANITIZE DATA BẮT BUỘC:
      // Xóa bỏ toàn bộ key bắt đầu và kết thúc bằng "__" (ví dụ: unlockedChapters.__legacy__)
      // và mọi dữ liệu không hợp lệ từ user cũ trước khi truyền vào batch.update() & batch.commit().
      const sanitizedUnlockedMap = sanitizeFirestoreData(mergedUnlockedMap);
      const sanitizedPurchases = sanitizeFirestoreData(purchasesMerged);

      await commitBatchIfNeeded(1 + secondaryDocs.length);

      const primaryUpdatePayload: Record<string, any> = sanitizeFirestoreData({
        email,
        xuBalance: mergedXuBalance,
        coins: mergedXuBalance,
        authorEarnedXu: mergedAuthorEarnedXu,
        flowerBalance: mergedFlowerBalance,
        purchasedChapters: Array.from(purchasedChaptersSet),
        unlockedChapters: sanitizedUnlockedMap,
        unlockedFullBooks: Array.from(fullBooksSet),
        purchases: sanitizedPurchases,
        role: checkIsAdmin(email) ? 'admin' : resolvedRole,
        isAuthor: resolvedIsAuthor,
        isLocked: false,
        isBanned: false,
        status: 'Hoạt động',
        updatedAt: now,
        ...(resolvedUid ? { uid: resolvedUid } : {}),
      });

      batch.update(primaryDoc.ref, primaryUpdatePayload);
      batchOps += 1;

      // Tiêu diệt Document Phụ: Gán isLocked: true và status: 'banned'
      for (const secDoc of secondaryDocs) {
        const secondaryUpdatePayload = sanitizeFirestoreData({
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

      mergedEmailsCount += 1;
      mergedSecondaryDocsCount += secondaryDocs.length;
      totalXuMerged = parseFloat((totalXuMerged + secondaryAddedXu).toFixed(2));
      details.push({
        email,
        primaryDocId: primaryDoc.id,
        secondaryDocIds: secondaryDocs.map((s) => s.id),
        finalXuBalance: mergedXuBalance,
      });
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    return {
      mergedEmailsCount,
      mergedSecondaryDocsCount,
      totalXuMerged,
      details,
    };
  } catch (error) {
    console.error('Lỗi mergeDuplicateUsers:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * MUA CHƯƠNG / MUA TRỌN BỘ AN TOÀN BẰNG FIRESTORE TRANSACTION:
 * - TUYỆT ĐỐI CẤM trừ tiền ở client.
 * - Đọc số dư thực tế (xuBalance, authorEarnedXu) trực tiếp từ Server bên trong runTransaction.
 * - Kiểm tra đủ tiền mới trừ và cập nhật đồng thời purchasedChapters, unlockedChapters, unlockedFullBooks.
 */
export async function purchaseVipItemWithTransaction(params: {
  userId: string;
  novelId: string;
  novelTitle: string;
  type: 'chapter' | 'full_book';
  price: number;
  chapterId?: string;
  chapterNumber?: number;
  chapterSlug?: string;
  chapterIdentifiers?: string[];
}): Promise<{
  alreadyUnlocked: boolean;
  newXuBalance: number;
  newAuthorEarnedXu: number;
  purchasedChapters: string[];
  unlockedChapters: Record<string, string[]>;
  unlockedFullBooks: string[];
  purchaseRecord: any;
  notification: UserNotification;
}> {
  const {
    userId,
    novelId,
    novelTitle,
    type,
    price,
    chapterId,
    chapterNumber,
    chapterSlug,
    chapterIdentifiers = [],
  } = params;

  const cleanPrice = Math.max(0, parseFloat(Number(price || 0).toFixed(2)));
  if (!userId || userId === 'guest') {
    throw new Error('Vui lòng đăng nhập để thực hiện giao dịch mở khóa.');
  }
  if (!novelId) {
    throw new Error('Thiếu mã truyện để thực hiện giao dịch.');
  }

  const userRef = doc(db, 'users', userId);
  const path = `users/${userId}`;

  try {
    return await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('Không tìm thấy tài khoản trên hệ thống.');
      }

      const data = userSnap.data() as Record<string, any>;
      const serverBalances = extractXuBalances(data);
      const serverXu = serverBalances.xuBalance;
      const serverEarned = serverBalances.authorEarnedXu;
      const totalServerAvailable = parseFloat((serverXu + serverEarned).toFixed(2));

      const existingUnlockedMap = extractPurchasedChaptersMap(data);
      const existingFullBooks: string[] = Array.isArray(data.unlockedFullBooks)
        ? data.unlockedFullBooks.map((id: any) => String(id))
        : [];
      const existingPurchasedList = extractPurchasedChaptersList(data);
      const existingPurchases: any[] = Array.isArray(data.purchases) ? data.purchases : [];
      const existingNotifications: any[] = Array.isArray(data.notifications) ? data.notifications : [];

      const purchaseEntryKey =
        type === 'full_book'
          ? `${novelId}:all`
          : `${novelId}:${chapterId || (chapterNumber !== undefined ? `c${chapterNumber}` : 'chap')}`;

      // Idempotency check trên Server: Nếu đã mở khóa trước đó -> không trừ tiền lặp
      const isAlreadyFull =
        existingFullBooks.includes(novelId) ||
        existingPurchasedList.includes(novelId) ||
        existingPurchasedList.includes(`${novelId}:all`);
      const currentNovelMapList = existingUnlockedMap[novelId] || [];
      const isAlreadyChap =
        type === 'chapter' &&
        (isAlreadyFull ||
          existingPurchasedList.includes(purchaseEntryKey) ||
          (chapterId ? currentNovelMapList.includes(chapterId) : false));

      if ((type === 'full_book' && isAlreadyFull) || isAlreadyChap) {
        return {
          alreadyUnlocked: true,
          newXuBalance: serverXu,
          newAuthorEarnedXu: serverEarned,
          purchasedChapters: existingPurchasedList,
          unlockedChapters: existingUnlockedMap,
          unlockedFullBooks: existingFullBooks,
          purchaseRecord: null,
          notification: {
            id: `already-${Date.now()}`,
            title: 'Đã mở khóa trước đó',
            message: 'Nội dung này đã có trong tài khoản của bạn.',
            type: 'system' as const,
            createdAt: Date.now(),
            isRead: false,
          },
        };
      }

      // Kiểm tra số dư thật trên Server
      if (totalServerAvailable < cleanPrice) {
        throw new Error(
          `Số dư ví không đủ (Cần ${formatXu(cleanPrice)} Xu, hiện có ${formatXu(totalServerAvailable)} Xu).`
        );
      }

      // Trừ tiền trên Server bên trong Transaction
      let priceRemaining = cleanPrice;
      let nextXuBalance = serverXu;
      let nextAuthorEarnedXu = serverEarned;

      if (nextXuBalance >= priceRemaining) {
        nextXuBalance = parseFloat((nextXuBalance - priceRemaining).toFixed(2));
        priceRemaining = 0;
      } else {
        priceRemaining = parseFloat((priceRemaining - nextXuBalance).toFixed(2));
        nextXuBalance = 0;
        nextAuthorEarnedXu = Math.max(0, parseFloat((nextAuthorEarnedXu - priceRemaining).toFixed(2)));
      }

      const nextTotalRemaining = parseFloat((nextXuBalance + nextAuthorEarnedXu).toFixed(2));
      const nextPurchasedList = Array.from(
        new Set([
          ...existingPurchasedList,
          purchaseEntryKey,
          ...(type === 'full_book' ? [novelId] : []),
        ])
      );

      const nextFullBooks =
        type === 'full_book'
          ? Array.from(new Set([...existingFullBooks, novelId]))
          : existingFullBooks;

      const nextUnlockedMap = { ...existingUnlockedMap };
      const identifiersToAdd =
        type === 'full_book'
          ? ['all', '*', ...chapterIdentifiers]
          : [
              ...(chapterId ? [chapterId] : []),
              ...(chapterSlug ? [chapterSlug] : []),
              ...(chapterNumber !== undefined
                ? [
                    String(chapterNumber),
                    `c${chapterNumber}`,
                    `c-${chapterNumber}`,
                    `chuong-${chapterNumber}`,
                    `${novelId}-c${chapterNumber}`,
                  ]
                : []),
              ...chapterIdentifiers,
            ];
      nextUnlockedMap[novelId] = Array.from(new Set([...currentNovelMapList, ...identifiersToAdd]));

      const purchaseRecord = cleanUndefinedFields({
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        novelId,
        novelTitle,
        type,
        chapterId: type === 'chapter' ? chapterId : undefined,
        chapterNumber: type === 'chapter' ? chapterNumber : undefined,
        pricePaid: cleanPrice,
        purchasedAt: Date.now(),
      });

      const notification: UserNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title:
          type === 'full_book'
            ? `💎 Mua trọn bộ truyện "${novelTitle}" thành công`
            : `💎 Mở khóa chương ${chapterNumber ?? ''} truyện "${novelTitle}" thành công`,
        message:
          type === 'full_book'
            ? `Bạn đã mở khóa TRỌN BỘ toàn bộ các chương của tác phẩm "${novelTitle}". Đã trừ -${formatXu(cleanPrice)} Xu. Số dư ví khả dụng hiện tại: ${formatXu(nextTotalRemaining)} Xu.`
            : `Bạn đã mở khóa thành công chương ${chapterNumber ?? ''}. Đã trừ -${formatXu(cleanPrice)} Xu. Số dư ví khả dụng hiện tại: ${formatXu(nextTotalRemaining)} Xu.`,
        type: 'system',
        createdAt: Date.now(),
        isRead: false,
      };

      transaction.update(userRef, sanitizeFirestoreData({
        xuBalance: nextXuBalance,
        authorEarnedXu: nextAuthorEarnedXu,
        purchasedChapters: nextPurchasedList,
        unlockedChapters: nextUnlockedMap,
        unlockedFullBooks: nextFullBooks,
        purchases: [purchaseRecord, ...existingPurchases],
        notifications: [notification, ...existingNotifications],
      }));

      return {
        alreadyUnlocked: false,
        newXuBalance: nextXuBalance,
        newAuthorEarnedXu: nextAuthorEarnedXu,
        purchasedChapters: nextPurchasedList,
        unlockedChapters: nextUnlockedMap,
        unlockedFullBooks: nextFullBooks,
        purchaseRecord,
        notification,
      };
    });
  } catch (error: any) {
    console.error('Lỗi purchaseVipItemWithTransaction:', error);
    throw error;
  }
}

/**
 * TẠO YÊU CẦU RÚT XU AN TOÀN BẰNG FIRESTORE TRANSACTION:
 * - Đọc số dư thực tế từ Server, kiểm tra đủ tiền mới trừ trong runTransaction.
 */
export async function createWithdrawalWithTransaction(params: {
  userId: string;
  amountXu: number;
  bankInfo: { bankName: string; accountNumber: string; accountHolder: string };
}): Promise<{ newXuBalance: number; newAuthorEarnedXu: number }> {
  const { userId, amountXu, bankInfo } = params;
  const userRef = doc(db, 'users', userId);
  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(userRef);
    if (!snap.exists()) {
      throw new Error('Không tìm thấy tài khoản trên hệ thống.');
    }
    const data = snap.data() as Record<string, any>;
    const balances = extractXuBalances(data);
    const total = balances.authorEarnedXu + balances.xuBalance;
    if (total < amountXu) {
      throw new Error('Số dư Xu không đủ để thực hiện lệnh rút này.');
    }

    let newAuthorEarned = balances.authorEarnedXu;
    let newWalletXu = balances.xuBalance;
    if (newAuthorEarned >= amountXu) {
      newAuthorEarned = parseFloat((newAuthorEarned - amountXu).toFixed(2));
    } else {
      const remainingNeed = amountXu - newAuthorEarned;
      newAuthorEarned = 0;
      newWalletXu = Math.max(0, parseFloat((newWalletXu - remainingNeed).toFixed(2)));
    }

    transaction.update(userRef, {
      authorEarnedXu: newAuthorEarned,
      xuBalance: newWalletXu,
      bankInfo,
    });

    return { newXuBalance: newWalletXu, newAuthorEarnedXu: newAuthorEarned };
  });
}

/**
 * HOÀN XU KHI TỪ CHỐI ĐƠN RÚT TIỀN BẰNG INCREMENT() TRONG TRANSACTION
 */
export async function refundRejectedWithdrawalWithTransaction(params: {
  userId: string;
  amountXu: number;
  notifItem: UserNotification;
}): Promise<void> {
  const { userId, amountXu, notifItem } = params;
  if (!userId || amountXu <= 0) return;
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    authorEarnedXu: increment(amountXu),
    notifications: arrayUnion(notifItem),
  });
}

/**
 * Theo dõi hoặc bỏ theo dõi Tác giả / Editor / Admin trong Firestore:
 * - Khi follow = true:
 *   + Thêm creatorId vào followingCreators của currentUser
 *   + Thêm currentUserId vào followers của creator
 * - Khi follow = false:
 *   + Xóa creatorId khỏi followingCreators của currentUser
 *   + Xóa currentUserId khỏi followers của creator
 */
export async function followCreatorInFirestore(
  currentUserId: string,
  creatorId: string,
  shouldFollow: boolean
): Promise<{ success: boolean; isFollowing: boolean }> {
  try {
    const userRef = doc(db, 'users', currentUserId);
    const creatorRef = doc(db, 'users', creatorId);

    if (shouldFollow) {
      await updateDoc(userRef, {
        followingCreators: arrayUnion(creatorId),
      });
      const creatorSnap = await getDoc(creatorRef);
      if (creatorSnap.exists()) {
        await updateDoc(creatorRef, {
          followers: arrayUnion(currentUserId),
        });
      }
    } else {
      await updateDoc(userRef, {
        followingCreators: arrayRemove(creatorId),
      });
      const creatorSnap = await getDoc(creatorRef);
      if (creatorSnap.exists()) {
        await updateDoc(creatorRef, {
          followers: arrayRemove(currentUserId),
        });
      }
    }
    return { success: true, isFollowing: shouldFollow };
  } catch (error) {
    console.warn('Lỗi cập nhật Firestore khi theo dõi creator (sử dụng offline fallback):', error);
    return { success: true, isFollowing: shouldFollow };
  }
}

/**
 * Lấy thông tin User / Creator theo ID từ Firestore
 */
export async function fetchUserProfileById(userId: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      const data = snap.data() || {};
      const balances = extractXuBalances(data);
      return {
        id: snap.id,
        email: data.email || '',
        displayName: data.displayName || 'Tác giả',
        avatarUrl: data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        bio: data.bio || '',
        followers: Array.isArray(data.followers) ? data.followers : [],
        followingCreators: Array.isArray(data.followingCreators) ? data.followingCreators : [],
        isLoggedIn: true,
        role: data.role || 'author',
        xuBalance: balances.xuBalance,
        authorEarnedXu: balances.authorEarnedXu,
        flowerBalance: balances.flowerBalance,
        bankInfo: data.bankInfo || undefined,
        notifications: Array.isArray(data.notifications) ? data.notifications : [],
        readingHistory: Array.isArray(data.readingHistory) ? data.readingHistory : [],
        bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
        unlockedChapters: extractPurchasedChaptersMap(data),
        unlockedFullBooks: Array.isArray(data.unlockedFullBooks) ? data.unlockedFullBooks : [],
        purchases: Array.isArray(data.purchases) ? data.purchases : [],
      };
    }
    return null;
  } catch (error) {
    console.warn('Could not fetch user profile by ID:', error);
    return null;
  }
}

/**
 * Tìm Creator theo bút danh (displayName)
 */
export async function fetchCreatorByDisplayName(name: string): Promise<UserProfile | null> {
  try {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('displayName', '==', name));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      const data = docSnap.data() || {};
      const balances = extractXuBalances(data);
      return {
        id: docSnap.id,
        email: data.email || '',
        displayName: data.displayName || name,
        avatarUrl: data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        bio: data.bio || '',
        followers: Array.isArray(data.followers) ? data.followers : [],
        followingCreators: Array.isArray(data.followingCreators) ? data.followingCreators : [],
        isLoggedIn: true,
        role: data.role || 'author',
        xuBalance: balances.xuBalance,
        authorEarnedXu: balances.authorEarnedXu,
        flowerBalance: balances.flowerBalance,
        bankInfo: data.bankInfo || undefined,
        notifications: Array.isArray(data.notifications) ? data.notifications : [],
        readingHistory: Array.isArray(data.readingHistory) ? data.readingHistory : [],
        bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
        unlockedChapters: extractPurchasedChaptersMap(data),
        unlockedFullBooks: Array.isArray(data.unlockedFullBooks) ? data.unlockedFullBooks : [],
        purchases: Array.isArray(data.purchases) ? data.purchases : [],
      };
    }
    return null;
  } catch (error) {
    console.warn('Could not fetch creator by displayName:', error);
    return null;
  }
}

// Debounce queue for user profile state updates to drastically cut Firestore write quota usage
const pendingUserUpdates = new Map<string, Partial<UserProfile>>();
const userUpdateTimers = new Map<string, any>();

/**
 * Đẩy toàn bộ dữ liệu đang chờ trong hàng đợi debounce của User lên Cloud Firestore
 */
export async function flushUserStateToFirestore(userId: string): Promise<void> {
  const timer = userUpdateTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    userUpdateTimers.delete(userId);
  }
  const pending = pendingUserUpdates.get(userId);
  if (!pending || (Object.keys(pending || {})?.length || 0) === 0) return;
  pendingUserUpdates.delete(userId);

  try {
    const userRef = doc(db, 'users', userId);
    const cleanData = cleanUndefinedFields(pending);
    await setDoc(userRef, cleanData, { merge: true });
  } catch (err: any) {
    if (err?.message?.includes('quota') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
      console.warn('Spark Quota limit reached on user sync. Local state is safely preserved.');
    } else {
      console.warn(`Lỗi ghi Firestore updateUserState cho ${userId}:`, err?.message || err);
    }
  }
}

/**
 * Cập nhật số dư Xu, tiến trình đọc hoặc thông tin người dùng với Optimistic UI & Debounce
 * - Hiển thị và lưu NGAY LẬP TỨC vào LocalStorage/State (0ms phản hồi)
 * - Gom các thao tác liên tục (cuộn trang, đọc chương...) thành 1 lần ghi Firestore sau 2.5s (Debounce)
 */
export async function updateUserState(
  userId: string, 
  data: Partial<UserProfile>,
  immediate = false
): Promise<void> {
  const cleanData = cleanUndefinedFields(data);

  // Cập nhật Firebase Auth profile nếu đang đăng nhập
  if (auth.currentUser && cleanData.displayName) {
    updateProfile(auth.currentUser, {
      displayName: cleanData.displayName,
      photoURL: (cleanData.avatarUrl && typeof cleanData.avatarUrl === 'string' && cleanData.avatarUrl.startsWith('http')) 
        ? cleanData.avatarUrl 
        : undefined,
    }).catch(() => {});
  }

  // 2. DEBOUNCE QUEUE: Gộp các thay đổi liên tục thành 1 payload duy nhất
  const existingPending = pendingUserUpdates.get(userId) || {};
  pendingUserUpdates.set(userId, { ...existingPending, ...cleanData });

  if (immediate) {
    await flushUserStateToFirestore(userId);
    return;
  }

  const existingTimer = userUpdateTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    userUpdateTimers.delete(userId);
    flushUserStateToFirestore(userId);
  }, 2500); // Debounce 2.5 giây: gom toàn bộ thao tác trong 2.5s thành 1 lần ghi duy nhất!

  userUpdateTimers.set(userId, timer);
}

/**
 * Lấy số chương cao nhất hiện có trên Firestore siêu tốc (ưu tiên đọc root document trong 50ms)
 */
export async function getLatestChapterNumberFromFirestore(novelId: string): Promise<number> {
  if (!novelId) return 0;
  try {
    const novelDoc = await getDoc(doc(db, 'novels', novelId));
    if (novelDoc.exists()) {
      const data = novelDoc.data();
      // 1. Kiểm tra danh sách chapters trên root document
      if (Array.isArray(data.chapters) && (data.chapters?.length || 0) > 0) {
        const cleaned = filterOutDummyChapters(data.chapters);
        if ((cleaned?.length || 0) > 0) {
          return Math.max(...(cleaned || []).map((c: any) => Number(c.number) || 0));
        }
      }
    }
  } catch (e) {}

  // 2. Kiểm tra subcollection 'chapters'
  try {
    const q = query(
      collection(db, 'novels', novelId, 'chapters'),
      orderBy('number', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const topNum = Number(snap.docs[0].data()?.number ?? snap.docs[0].id);
      if (topNum > 0) return topNum;
    }
  } catch (e) {}
  return 0;
}

/**
 * Tải trực tiếp danh sách chương của một bộ truyện từ Firestore siêu nhẹ và siêu tốc.
 * Ưu tiên lấy mảng mục lục lightweight trên root document (0ms phản hồi).
 * Không tải nội dung chữ khổng lồ của 500+ chương vào RAM để trình duyệt không bao giờ bị đơ!
 */
export async function fetchChaptersForNovel(novelId: string): Promise<Chapter[]> {
  if (!novelId) return [];
  const candidateNovelIds = Array.from(
    new Set([novelId.trim(), normalizeStoryId(novelId)].filter(Boolean))
  );

  for (const targetNovelId of candidateNovelIds) {
    // 1. Kiểm tra mảng mục lục chapters trên root document 'novels/{targetNovelId}'
    try {
      const novelDoc = await getDoc(doc(db, 'novels', targetNovelId));
      if (novelDoc.exists()) {
        const data = novelDoc.data();
        if (Array.isArray(data.chapters) && (data.chapters?.length || 0) > 0) {
          const cleaned = filterOutDummyChapters(data.chapters);
          return (cleaned || [])
            .map((c: any) => {
              const pubAt = getChapterPublishAt(c);
              return {
                ...c,
                ...extractChapterAudioFields(c),
                publishAt: pubAt,
                scheduledPublishAt: pubAt,
                number: Number(c.number) || 0,
                content: '', // Không giữ chuỗi văn bản khổng lồ trong mục lục
              };
            })
            .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
        }
      }
    } catch (e) {
      console.warn(`Lỗi đọc root doc novels/${targetNovelId}:`, e);
    }

    // 2. Nếu root doc chưa có mảng chapters, đọc từ subcollection 'novels/{targetNovelId}/chapters'
    try {
      const novelChapsCol = collection(db, 'novels', targetNovelId, 'chapters');
      const snap1 = await getDocs(novelChapsCol);
      if (!snap1.empty) {
        const list: Chapter[] = [];
        (snap1?.docs || []).forEach((d) => {
          const data = d.data() as Chapter;
          const num = Number(data.number) || 0;
          if (num > 0) {
            const pubAt = getChapterPublishAt(data);
            list.push({
              ...data,
              ...extractChapterAudioFields(data),
              publishAt: pubAt,
              scheduledPublishAt: pubAt,
              id: d.id,
              number: num,
              content: '',
            });
          }
        });
        list.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
        return filterOutDummyChapters(list);
      }
    } catch (e) {
      console.warn(`Lỗi fetch chapters từ novels/${targetNovelId}/chapters:`, e);
    }

    try {
      const subDoc = await getDoc(doc(db, 'novel_submissions', targetNovelId));
      if (subDoc.exists()) {
        const subData = subDoc.data();
        if (Array.isArray(subData.chapters) && (subData.chapters?.length || 0) > 0) {
          return (subData.chapters || []).map((c: any, idx: number) => {
            const pubAt = getChapterPublishAt(c);
            return {
              ...extractChapterAudioFields(c),
              id: c.id || `chap-${targetNovelId}-${c.number || idx + 1}`,
              number: c.number || idx + 1,
              title: c.title || `Chương ${c.number || idx + 1}`,
              slug: c.slug || `chuong-${c.number || idx + 1}`,
              content: c.content || '',
              wordCount: c.wordCount || (c.content ? (c.content.split(/\s+/)?.length || 0) : 0),
              publishedDate: c.publishedDate || new Date().toISOString().split('T')[0],
              isVip: !!c.isVip,
              priceXu: c.priceXu || 0,
              publishAt: pubAt,
              scheduledPublishAt: pubAt,
            };
          });
        }
      }
    } catch (e) {}
  }

  // Fallback cache localStorage khi thiết bị hoàn toàn ngoại tuyến (offline)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = safeGetItem('dao_tam_novels');
    const list = safeJsonParse<Novel[]>(cached, []);
    const target = (Array.isArray(list) ? list : []).find(
      (n: Novel) => candidateNovelIds.includes(n.id) || (n.slug && candidateNovelIds.includes(n.slug))
    );
    if (target && Array.isArray(target.chapters) && (target.chapters?.length || 0) > 0) {
      return filterOutDummyChapters(target.chapters);
    }
  }

  return [];
}

/**
 * Khôi phục nội dung trọn vẹn của chương truyện.
 * Tôn trọng 100% văn bản thật do người dùng tải lên, không chèn nội dung ảo.
 */
export function repairTruncatedChapter(
  novelTitleOrId: string,
  chapterNumber: number | string | undefined,
  content?: string
): { content: string; wordCount: number } {
  const raw = (content || '').trim();
  return {
    content: raw,
    wordCount: raw.split(/\s+/).filter(Boolean)?.length || 0,
  };
}

/**
 * Tải nội dung đầy đủ của một chương truyện từ Firestore subcollection.
 * Đảm bảo lấy trọn vẹn văn bản gốc do người dùng hoặc tác giả tải lên.
 * Tuyệt đối không sinh nội dung ảo hoặc truyện mặc định.
 */
export async function fetchFullChapterContent(
  novelId: string,
  chapterId?: string,
  chapterNumber?: number,
  expectedUpdatedAt?: number
): Promise<{
  content: string;
  wordCount?: number;
  audioUrl?: string;
  audioUrlMale?: string;
  audioUrlFemale?: string;
  mp3Url?: string;
  maleAudioUrl?: string;
  audio?: string;
  femaleAudioUrl?: string;
  mp3Female?: string;
} | null> {
  if (!novelId) return null;

  interface CachedChapterPayload {
    content: string;
    wordCount?: number;
    audioUrl?: string;
    audioUrlMale?: string;
    audioUrlFemale?: string;
    mp3Url?: string;
    maleAudioUrl?: string;
    audio?: string;
    femaleAudioUrl?: string;
    mp3Female?: string;
    cachedAt?: number;
  }

  const saveChapterCache = (payload: CachedChapterPayload) => {
    const nowTs = Date.now();
    const record: CachedChapterPayload = {
      content: payload.content,
      wordCount:
        payload.wordCount || payload.content.split(/\s+/).filter(Boolean)?.length || 0,
      ...extractChapterAudioFields(payload),
      cachedAt: nowTs,
    };
    const serialized = JSON.stringify(record);
    const tsStr = String(nowTs);
    if (chapterNumber !== undefined) {
      safeSetItem(makeChapterCacheKey(novelId, chapterNumber), serialized);
      safeSetItem(makeChapterCacheTsKey(novelId, chapterNumber), tsStr);
    }
    if (chapterId) {
      safeSetItem(makeChapterCacheKey(novelId, chapterId), serialized);
      safeSetItem(makeChapterCacheTsKey(novelId, chapterId), tsStr);
    }
    trimChapterCacheEntries();
  };

  const readChapterCacheKey = (key: string, tsKey: string) => {
    const raw = safeGetItem(key);
    if (!raw || !raw.trim()) return null;

    const rawTs = safeGetItem(tsKey);
    const storedTs = rawTs ? Number(rawTs) || 0 : 0;

    if (raw.trim().startsWith('{')) {
      const parsed = safeJsonParse<CachedChapterPayload | null>(raw, null);
      if (
        parsed &&
        typeof parsed.content === 'string' &&
        parsed.content.trim().length > 0 &&
        !isGeneratedFallbackContent(parsed.content)
      ) {
        const entryTs = Number(parsed.cachedAt || storedTs || 0);
        if (expectedUpdatedAt && entryTs > 0 && expectedUpdatedAt > entryTs + 2000) {
          return null;
        }
        return {
          content: parsed.content,
          wordCount:
            parsed.wordCount || parsed.content.split(/\s+/).filter(Boolean)?.length || 0,
          ...extractChapterAudioFields(parsed),
        };
      }
      return null;
    }

    return null;
  };

  // 1. Kiểm tra cache localStorage _v4 (tốn 0 Reads khi tải lại / đọc lại)
  if (chapterNumber !== undefined) {
    const cachedByNum = readChapterCacheKey(
      makeChapterCacheKey(novelId, chapterNumber),
      makeChapterCacheTsKey(novelId, chapterNumber)
    );
    if (cachedByNum) return cachedByNum;
  }
  if (chapterId) {
    const cachedById = readChapterCacheKey(
      makeChapterCacheKey(novelId, chapterId),
      makeChapterCacheTsKey(novelId, chapterId)
    );
    if (cachedById) return cachedById;
  }

  // 2. Thử trực tiếp doc theo chapterNumber hoặc chapterId trong subcollection
  const candidateIds: string[] = [];
  if (chapterNumber !== undefined) {
    candidateIds.push(String(chapterNumber));
    candidateIds.push(`c-${chapterNumber}`);
    candidateIds.push(`c-${novelId}-${chapterNumber}`);
    candidateIds.push(`${novelId}-c${chapterNumber}`);
  }
  if (chapterId && !candidateIds.includes(chapterId)) {
    candidateIds.push(chapterId);
  }

  let audioOnlyFallback: ReturnType<typeof extractChapterAudioFields> | null = null;

  for (const cId of candidateIds) {
    try {
      const snap = await getDoc(doc(db, 'novels', novelId, 'chapters', cId));
      if (snap.exists()) {
        const data = snap.data();
        const audioFields = extractChapterAudioFields(data);
        if (data.content && (data.content.trim()?.length || 0) > 0) {
          const result = {
            content: data.content,
            wordCount: data.wordCount || data.content.split(/\s+/).filter(Boolean)?.length || 0,
            ...audioFields,
          };
          saveChapterCache(result);
          return result;
        } else if (!audioOnlyFallback && (getChapterAudioUrl(data as Chapter, 'male') || getChapterAudioUrl(data as Chapter, 'female'))) {
          audioOnlyFallback = audioFields;
        }
      }
    } catch {}

    try {
      const snap = await getDoc(doc(db, 'stories', novelId, 'chapters', cId));
      if (snap.exists()) {
        const data = snap.data();
        const audioFields = extractChapterAudioFields(data);
        if (data.content && (data.content.trim()?.length || 0) > 0) {
          const result = {
            content: data.content,
            wordCount: data.wordCount || data.content.split(/\s+/).filter(Boolean)?.length || 0,
            ...audioFields,
          };
          saveChapterCache(result);
          return result;
        } else if (!audioOnlyFallback && (getChapterAudioUrl(data as Chapter, 'male') || getChapterAudioUrl(data as Chapter, 'female'))) {
          audioOnlyFallback = audioFields;
        }
      }
    } catch {}
  }

  // 3. Query subcollection 'novels/{novelId}/chapters' theo number (hỗ trợ cả number & string)
  try {
    if (chapterNumber !== undefined) {
      const chaptersCol = collection(db, 'novels', novelId, 'chapters');
      const snapNum = await getDocs(query(chaptersCol, where('number', '==', Number(chapterNumber))));
      if (!snapNum.empty) {
        const data = snapNum.docs[0].data();
        const audioFields = extractChapterAudioFields(data);
        if (data.content && (data.content.trim()?.length || 0) > 0) {
          const result = {
            content: data.content,
            wordCount: data.wordCount || data.content.split(/\s+/).filter(Boolean)?.length || 0,
            ...audioFields,
          };
          saveChapterCache(result);
          return result;
        } else if (!audioOnlyFallback && (getChapterAudioUrl(data as Chapter, 'male') || getChapterAudioUrl(data as Chapter, 'female'))) {
          audioOnlyFallback = audioFields;
        }
      }
      const snapStr = await getDocs(query(chaptersCol, where('number', '==', String(chapterNumber))));
      if (!snapStr.empty) {
        const data = snapStr.docs[0].data();
        const audioFields = extractChapterAudioFields(data);
        if (data.content && (data.content.trim()?.length || 0) > 0) {
          const result = {
            content: data.content,
            wordCount: data.wordCount || data.content.split(/\s+/).filter(Boolean)?.length || 0,
            ...audioFields,
          };
          saveChapterCache(result);
          return result;
        } else if (!audioOnlyFallback && (getChapterAudioUrl(data as Chapter, 'male') || getChapterAudioUrl(data as Chapter, 'female'))) {
          audioOnlyFallback = audioFields;
        }
      }
    }
  } catch {}

  // 4. Fallback đọc từ root document 'novels/{novelId}' hoặc 'novel_submissions/{novelId}'
  try {
    const novelSnap = await getDoc(doc(db, 'novels', novelId));
    if (novelSnap.exists()) {
      const nData = novelSnap.data();
      if (Array.isArray(nData.chapters)) {
        const matched = nData.chapters.find(
          (c: any) =>
            (chapterId && c?.id === chapterId) ||
            (chapterNumber !== undefined && Number(c?.number) === Number(chapterNumber))
        );
        if (matched?.content && (String(matched.content).trim()?.length || 0) > 0) {
          const text = String(matched.content);
          const result = {
            content: text,
            wordCount: matched.wordCount || text.split(/\s+/).filter(Boolean)?.length || 0,
            ...extractChapterAudioFields(matched),
          };
          saveChapterCache(result);
          return result;
        } else if (matched && !audioOnlyFallback && (getChapterAudioUrl(matched as Chapter, 'male') || getChapterAudioUrl(matched as Chapter, 'female'))) {
          audioOnlyFallback = extractChapterAudioFields(matched);
        }
      }
    }
  } catch {}

  try {
    const subSnap = await getDoc(doc(db, 'novel_submissions', novelId));
    if (subSnap.exists()) {
      const sData = subSnap.data();
      if (Array.isArray(sData.chapters)) {
        const matched = sData.chapters.find(
          (c: any) =>
            (chapterId && c?.id === chapterId) ||
            (chapterNumber !== undefined && Number(c?.number) === Number(chapterNumber))
        );
        if (matched?.content && (String(matched.content).trim()?.length || 0) > 0) {
          const text = String(matched.content);
          const result = {
            content: text,
            wordCount: matched.wordCount || text.split(/\s+/).filter(Boolean)?.length || 0,
            ...extractChapterAudioFields(matched),
          };
          saveChapterCache(result);
          return result;
        }
      }
    }
  } catch {}

  if (audioOnlyFallback) {
    return { content: '', wordCount: 0, ...audioOnlyFallback };
  }

  return { content: '', wordCount: 0 };
}

/**
 * Tải danh sách truyện từ Firestore (Metadata-Only)
 * Tuyệt đối không tải subcollection hay nội dung text của các chương để giảm 99% dung lượng và số lần đọc Firestore
 */
export async function fetchNovelsFromFirestore(_limitCount?: number): Promise<Novel[]> {
  const path = 'novels';
  try {
    const novelsCol = collection(db, path);
    const snapshot = await getDocs(novelsCol);

    if (snapshot.empty) {
      return [];
    }

    const novels: Novel[] = [];
    for (const docSnap of snapshot?.docs || []) {
      const novelData = (docSnap.data() || {}) as Novel;

      const rawChapters: Chapter[] = Array.isArray(novelData.chapters) ? novelData.chapters : [];
      const lightweightChapters: Chapter[] = (filterOutDummyChapters(rawChapters) || []).map((c: any) => {
        const pubAt = getChapterPublishAt(c);
        return {
          id: c.id || `c-${docSnap.id}-${c.number}`,
          number: Number(c.number) || 0,
          title: c.title || `Chương ${c.number}`,
          slug: c.slug || `chuong-${c.number}`,
          publishedDate: c.publishedDate || '',
          isVip: Boolean(c.isVip),
          priceXu: Number(c.priceXu || 0),
          wordCount: Number(c.wordCount || 0),
          isHidden: Boolean(c.isHidden),
          publishAt: pubAt,
          scheduledPublishAt: pubAt,
          ...extractChapterAudioFields(c),
          content: '', // KHÔNG BAO GIỜ tải text nội dung trong danh sách truyện
        };
      });

      const maxNum = lightweightChapters.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
      const resolvedTotal = (novelData.totalChapters !== undefined && Number(novelData.totalChapters) > 0)
        ? Number(novelData.totalChapters)
        : Math.max(lightweightChapters?.length || 0, maxNum, (novelData as any).latestChapterNumber || 0, 1);

      const latestChap = (lightweightChapters?.length || 0) > 0 ? lightweightChapters[(lightweightChapters?.length || 0) - 1] : null;
      const latestChapterTitle = novelData.latestChapterTitle || (latestChap?.title ? (latestChap.title.startsWith('Chương') ? latestChap.title : `Chương ${latestChap.number}: ${latestChap.title}`) : `Chương ${resolvedTotal}`);
      const latestChapterNumber = Number((novelData as any).latestChapterNumber) || latestChap?.number || resolvedTotal;
      const resolvedCreatedAt = resolveTimestampMs((novelData as any).createdAt) || 0;
      const resolvedUpdatedAt = resolveTimestampMs(novelData.updatedAt) || resolvedCreatedAt || 0;
      const resolvedLastChapterUpdatedAt = resolveTimestampMs((novelData as any).lastChapterUpdatedAt) || resolvedUpdatedAt || 0;
      const resolvedCategories = Array.isArray(novelData.categories)
        ? novelData.categories
        : Array.isArray((novelData as any).genres)
        ? (novelData as any).genres
        : [];

      const audioFlags = computeNovelAudioFlags(lightweightChapters, novelData);
      const latestPublishAt = getNovelLatestPublishAt(novelData, lightweightChapters) || undefined;

      novels.push({
        ...novelData,
        id: docSnap.id,
        categories: resolvedCategories,
        genres: Array.isArray((novelData as any).genres) ? (novelData as any).genres : resolvedCategories,
        isShortStory: Boolean(novelData.isShortStory),
        youtubeVideoId:
          typeof novelData.youtubeVideoId === 'string' && novelData.youtubeVideoId.trim()
            ? novelData.youtubeVideoId.trim()
            : '',
        isYoutubeVipLocked: Boolean(novelData.isYoutubeVipLocked),
        status: novelData.status || 'Đang ra',
        flowerCount: Number(novelData.flowerCount || 0),
        coinCount: Number(novelData.coinCount || 0),
        createdAt: resolvedCreatedAt,
        lastChapterUpdatedAt: resolvedLastChapterUpdatedAt,
        updatedAt: resolvedUpdatedAt,
        chapters: lightweightChapters,
        totalChapters: resolvedTotal,
        latestChapterTitle,
        latestChapterNumber,
        hasAudio: audioFlags.hasAudio,
        hasMaleAudio: audioFlags.hasMaleAudio,
        hasFemaleAudio: audioFlags.hasFemaleAudio,
        mp3NamMinhCount: audioFlags.mp3NamMinhCount,
        mp3HangNgaCount: audioFlags.mp3HangNgaCount,
        latestPublishAt,
      } as Novel);
    }

    novels.sort((a, b) => {
      const timeB = b.updatedAt || b.createdAt || b.lastChapterUpdatedAt || 0;
      const timeA = a.updatedAt || a.createdAt || a.lastChapterUpdatedAt || 0;
      return timeB - timeA;
    });
    return novels;
  } catch (error) {
    console.warn('Không thể tải danh sách truyện từ máy chủ:', error);
    throw new Error('Không thể tải danh sách truyện lúc này, vui lòng thử lại');
  }
}

/**
 * Tải trực tiếp một bộ truyện theo slug hoặc id từ Firestore
 * BẮT BUỘC: Giải mã decodeURIComponent(slugOrId) trước khi thực hiện truy vấn
 * Cơ chế Fallback:
 * 1. Query Firestore theo trường 'slug' == decodedSlug (và so sánh chuẩn hóa)
 * 2. Fallback query theo document ID: doc(db, 'novels', decodedSlug)
 * 3. Fallback query collection 'stories' (nếu có cấu trúc stories cũ)
 */
export async function fetchNovelBySlugOrId(slugOrId: string): Promise<Novel | null> {
  if (!slugOrId || typeof slugOrId !== 'string') return null;

  let decodedSlug = '';
  try {
    decodedSlug = decodeURIComponent(slugOrId).trim();
  } catch {
    decodedSlug = slugOrId.trim();
  }
  if (!decodedSlug) return null;

  const strippedSlug = normalizeStoryId(decodedSlug);
  const candidateTargets = Array.from(
    new Set(
      [
        decodedSlug,
        strippedSlug,
        decodedSlug.toLowerCase(),
        strippedSlug.toLowerCase(),
      ].filter(Boolean)
    )
  );

  const novelsCol = collection(db, 'novels');

  const mapDocToNovel = (docSnap: any): Novel => {
    const novelData = (docSnap.data() || {}) as Novel;
    const rawChapters: Chapter[] = Array.isArray(novelData.chapters) ? novelData.chapters : [];
    const lightweightChapters: Chapter[] = (filterOutDummyChapters(rawChapters) || []).map((c: any) => {
      const pubAt = getChapterPublishAt(c);
      return {
        id: c.id || `c-${docSnap.id}-${c.number}`,
        number: Number(c.number) || 0,
        title: c.title || `Chương ${c.number}`,
        slug: c.slug || `chuong-${c.number}`,
        publishedDate: c.publishedDate || '',
        isVip: Boolean(c.isVip),
        priceXu: Number(c.priceXu || 0),
        wordCount: Number(c.wordCount || 0),
        isHidden: Boolean(c.isHidden),
        publishAt: pubAt,
        scheduledPublishAt: pubAt,
        ...extractChapterAudioFields(c),
        content: '',
      };
    });

    const maxNum = lightweightChapters.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
    const resolvedTotal = (novelData.totalChapters !== undefined && Number(novelData.totalChapters) > 0)
      ? Number(novelData.totalChapters)
      : Math.max(lightweightChapters?.length || 0, maxNum, (novelData as any).latestChapterNumber || 0, 1);

    const latestChap = (lightweightChapters?.length || 0) > 0 ? lightweightChapters[(lightweightChapters?.length || 0) - 1] : null;
    const latestChapterTitle = novelData.latestChapterTitle || (latestChap?.title ? (latestChap.title.startsWith('Chương') ? latestChap.title : `Chương ${latestChap.number}: ${latestChap.title}`) : `Chương ${resolvedTotal}`);
    const latestChapterNumber = Number((novelData as any).latestChapterNumber) || latestChap?.number || resolvedTotal;
    const resolvedCreatedAt = resolveTimestampMs((novelData as any).createdAt) || 0;
    const resolvedUpdatedAt = resolveTimestampMs(novelData.updatedAt) || resolvedCreatedAt || 0;
    const resolvedLastChapterUpdatedAt = resolveTimestampMs((novelData as any).lastChapterUpdatedAt) || resolvedUpdatedAt || 0;
    const resolvedCategories = Array.isArray(novelData.categories)
      ? novelData.categories
      : Array.isArray((novelData as any).genres)
      ? (novelData as any).genres
      : [];

    const audioFlags = computeNovelAudioFlags(lightweightChapters, novelData);
    const latestPublishAt = getNovelLatestPublishAt(novelData, lightweightChapters) || undefined;

    return {
      ...novelData,
      id: docSnap.id,
      slug: novelData.slug || docSnap.id,
      categories: resolvedCategories,
      genres: Array.isArray((novelData as any).genres) ? (novelData as any).genres : resolvedCategories,
      isShortStory: Boolean(novelData.isShortStory),
      youtubeVideoId:
        typeof novelData.youtubeVideoId === 'string' && novelData.youtubeVideoId.trim()
          ? novelData.youtubeVideoId.trim()
          : '',
      isYoutubeVipLocked: Boolean(novelData.isYoutubeVipLocked),
      status: novelData.status || 'Đang ra',
      flowerCount: Number(novelData.flowerCount || 0),
      coinCount: Number(novelData.coinCount || 0),
      createdAt: resolvedCreatedAt,
      lastChapterUpdatedAt: resolvedLastChapterUpdatedAt,
      updatedAt: resolvedUpdatedAt,
      chapters: lightweightChapters,
      totalChapters: resolvedTotal,
      latestChapterTitle,
      latestChapterNumber,
      hasAudio: audioFlags.hasAudio,
      hasMaleAudio: audioFlags.hasMaleAudio,
      hasFemaleAudio: audioFlags.hasFemaleAudio,
      mp3NamMinhCount: audioFlags.mp3NamMinhCount,
      mp3HangNgaCount: audioFlags.mp3HangNgaCount,
      latestPublishAt,
    } as Novel;
  };

  try {
    for (const candidate of candidateTargets) {
      const qSlug = query(novelsCol, where('slug', '==', candidate), limit(1));
      const snapSlug = await getDocs(qSlug);
      if (!snapSlug.empty) {
        return mapDocToNovel(snapSlug.docs[0]);
      }
    }

    for (const candidate of candidateTargets) {
      const docRef = doc(db, 'novels', candidate);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return mapDocToNovel(docSnap);
      }
    }

    try {
      const storiesCol = collection(db, 'stories');
      for (const candidate of candidateTargets) {
        const qStory = query(storiesCol, where('slug', '==', candidate), limit(1));
        const snapStory = await getDocs(qStory);
        if (!snapStory.empty) {
          return mapDocToNovel(snapStory.docs[0]);
        }
        const storyDoc = await getDoc(doc(db, 'stories', candidate));
        if (storyDoc.exists()) {
          return mapDocToNovel(storyDoc);
        }
      }
    } catch {}

    return null;
  } catch (err) {
    console.warn(`Lỗi khi fetch truyện theo slug/id "${decodedSlug}":`, err);
    return null;
  }
}


/**
 * Tải danh sách truyện ngắn trực tiếp từ Firestore với điều kiện where('isShortStory', '==', true)
 */
export async function fetchShortStoriesFromFirestore(_limitCount?: number): Promise<Novel[]> {
  const path = 'novels';
  try {
    const novelsCol = collection(db, path);
    const q = query(novelsCol, where('isShortStory', '==', true));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return [];
    }

    const novels: Novel[] = [];
    for (const docSnap of snapshot?.docs || []) {
      const novelData = (docSnap.data() || {}) as Novel;
      const rawChapters: Chapter[] = Array.isArray(novelData.chapters) ? novelData.chapters : [];
      const lightweightChapters: Chapter[] = (filterOutDummyChapters(rawChapters) || []).map((c: any) => {
        const pubAt = getChapterPublishAt(c);
        return {
          id: c.id || `c-${docSnap.id}-${c.number}`,
          number: Number(c.number) || 0,
          title: c.title || `Chương ${c.number}`,
          slug: c.slug || `chuong-${c.number}`,
          publishedDate: c.publishedDate || '',
          isVip: Boolean(c.isVip),
          priceXu: Number(c.priceXu || 0),
          wordCount: Number(c.wordCount || 0),
          isHidden: Boolean(c.isHidden),
          publishAt: pubAt,
          scheduledPublishAt: pubAt,
          ...extractChapterAudioFields(c),
          content: '',
        };
      });

      const maxNum = lightweightChapters.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
      const resolvedTotal = (novelData.totalChapters !== undefined && Number(novelData.totalChapters) > 0)
        ? Number(novelData.totalChapters)
        : Math.max(lightweightChapters?.length || 0, maxNum, (novelData as any).latestChapterNumber || 0, 1);

      const latestChap = (lightweightChapters?.length || 0) > 0 ? lightweightChapters[(lightweightChapters?.length || 0) - 1] : null;
      const latestChapterTitle = novelData.latestChapterTitle || (latestChap?.title || `Chương ${resolvedTotal}`);
      const latestChapterNumber = Number((novelData as any).latestChapterNumber) || latestChap?.number || resolvedTotal;
      const resolvedCreatedAt = resolveTimestampMs((novelData as any).createdAt) || 0;
      const resolvedUpdatedAt = resolveTimestampMs(novelData.updatedAt) || resolvedCreatedAt || 0;
      const resolvedLastChapterUpdatedAt = resolveTimestampMs((novelData as any).lastChapterUpdatedAt) || resolvedUpdatedAt || 0;
      const resolvedCategories = Array.isArray(novelData.categories)
        ? novelData.categories
        : Array.isArray((novelData as any).genres)
        ? (novelData as any).genres
        : [];

      const audioFlags = computeNovelAudioFlags(lightweightChapters, novelData);
      const latestPublishAt = getNovelLatestPublishAt(novelData, lightweightChapters) || undefined;

      novels.push({
        ...novelData,
        id: docSnap.id,
        categories: resolvedCategories,
        genres: Array.isArray((novelData as any).genres) ? (novelData as any).genres : resolvedCategories,
        isShortStory: true,
        youtubeVideoId:
          typeof novelData.youtubeVideoId === 'string' && novelData.youtubeVideoId.trim()
            ? novelData.youtubeVideoId.trim()
            : '',
        isYoutubeVipLocked: Boolean(novelData.isYoutubeVipLocked),
        status: novelData.status || 'Đang ra',
        flowerCount: Number(novelData.flowerCount || 0),
        coinCount: Number(novelData.coinCount || 0),
        createdAt: resolvedCreatedAt,
        lastChapterUpdatedAt: resolvedLastChapterUpdatedAt,
        updatedAt: resolvedUpdatedAt,
        chapters: lightweightChapters,
        totalChapters: resolvedTotal,
        latestChapterTitle,
        latestChapterNumber,
        hasAudio: audioFlags.hasAudio,
        hasMaleAudio: audioFlags.hasMaleAudio,
        hasFemaleAudio: audioFlags.hasFemaleAudio,
        mp3NamMinhCount: audioFlags.mp3NamMinhCount,
        mp3HangNgaCount: audioFlags.mp3HangNgaCount,
        latestPublishAt,
      } as Novel);
    }

    novels.sort((a, b) => {
      const timeB = b.updatedAt || b.createdAt || b.lastChapterUpdatedAt || 0;
      const timeA = a.updatedAt || a.createdAt || a.lastChapterUpdatedAt || 0;
      return timeB - timeA;
    });
    return novels;
  } catch (error) {
    console.warn('Lỗi khi tải truyện ngắn từ Firestore:', error);
    return [];
  }
}

export interface QueryNovelsFilterParams {
  category?: string; // 'truyen-nu' | 'truyen-nam' | 'dam-my' | 'truyen-sang-tac' | 'all'
  status?: string;   // 'Hoàn thành' | 'Full' | 'completed' | 'all'
  format?: string;   // 'short' | 'original' | 'all'
  isShortStory?: boolean;
  tab?: 'hot' | 'latest' | 'completed';
  limitCount?: number;
  startAfterDoc?: QueryDocumentSnapshot<DocumentData> | null;
}

export interface QueryNovelsResult {
  novels: Novel[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  compositeIndexUrl: string | null;
  error: string | null;
}

/**
 * HÀM TRUY VẤN FIRESTORE GHÉP NỐI CÁC ĐIỀU KIỆN LỌC (AND LOGIC):
 * 1. Gom tất cả state lọc hiện tại vào chung 1 query:
 *    - mainCategory (Truyện Nữ, Truyện Nam, Đam Mỹ, Truyện Sáng Tác) -> where('mainCategory', '==', category)
 *    - status ('Hoàn thành' / 'Full') -> where('status', 'in', ['Hoàn thành', 'Full', 'Completed'])
 *    - format ('Truyện Ngắn') -> where('isShortStory', '==', true)
 *    - format ('Truyện Sáng Tác') -> where('isOriginal', '==', true)
 * 2. Xử lý triệt để khi không có dữ liệu (Empty State):
 *    - Nếu database rỗng, trả về [] để UI hiển thị: "Hiện chưa có truyện nào thuộc mục này"
 *    - TUYỆT ĐỐI KHÔNG tự động fetch truyện khác (như Đam Mỹ hay truyện chưa full) để đắp vào.
 * 3. Bắt lỗi Firebase Composite Index:
 *    - Bọc try/catch và trích xuất đường link tạo index từ message
 *    - console.error thông báo link tạo Composite Index của Firebase để người dùng click vào tạo index
 */
export async function queryNovelsWithFilters(
  params: QueryNovelsFilterParams = {}
): Promise<QueryNovelsResult> {
  const {
    category = 'all',
    status = 'all',
    format = 'all',
    isShortStory,
    tab = 'latest',
    limitCount = 25,
    startAfterDoc = null,
  } = params;

  try {
    const novelsCol = collection(db, 'novels');
    const constraints: any[] = [];

    // 1. Ghép nối Category (Truyện Nữ, Truyện Nam, Đam Mỹ, Truyện Sáng Tác)
    if (category && category !== 'all') {
      if (category === 'truyen-sang-tac') {
        constraints.push(where('mainCategory', '==', 'truyen-sang-tac'));
      } else {
        constraints.push(where('mainCategory', '==', category));
      }
    }

    // 2. Ghép nối Status 'Truyện Full'
    if (
      status === 'completed' ||
      status === 'Hoàn thành' ||
      status === 'Full' ||
      tab === 'completed'
    ) {
      constraints.push(where('status', 'in', ['Hoàn thành', 'Full', 'Completed']));
    }

    // 3. Ghép nối Format 'Truyện Ngắn'
    if (isShortStory === true || format === 'short') {
      constraints.push(where('isShortStory', '==', true));
    }

    // Ghép nối Format 'Truyện Sáng Tác'
    if (format === 'original') {
      constraints.push(where('isOriginal', '==', true));
    }

    // 4. Sắp xếp thứ tự
    if (tab === 'hot') {
      constraints.push(orderBy('views', 'desc'));
    } else {
      constraints.push(orderBy('lastChapterUpdatedAt', 'desc'));
    }

    // 5. Con trỏ phân trang & giới hạn số lượng Spark-safe limit(25)
    if (startAfterDoc) {
      constraints.push(startAfter(startAfterDoc));
    }
    constraints.push(limit(limitCount));

    const q = query(novelsCol, ...constraints);
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      // BẮT BUỘC: Không tự động nạp truyện khác, trả về mảng rỗng để UI hiển thị Empty State
      return {
        novels: [],
        lastDoc: null,
        hasMore: false,
        compositeIndexUrl: null,
        error: null,
      };
    }

    const novels: Novel[] = [];
    for (const docSnap of snapshot?.docs || []) {
      const novelData = (docSnap.data() || {}) as Novel;
      const rawChapters: Chapter[] = Array.isArray(novelData.chapters) ? novelData.chapters : [];
      const lightweightChapters: Chapter[] = (filterOutDummyChapters(rawChapters) || []).map((c: any) => {
        const pubAt = getChapterPublishAt(c);
        return {
          id: c.id || `c-${docSnap.id}-${c.number}`,
          number: Number(c.number) || 0,
          title: c.title || `Chương ${c.number}`,
          slug: c.slug || `chuong-${c.number}`,
          publishedDate: c.publishedDate || '',
          isVip: Boolean(c.isVip),
          priceXu: Number(c.priceXu || 0),
          wordCount: Number(c.wordCount || 0),
          isHidden: Boolean(c.isHidden),
          publishAt: pubAt,
          scheduledPublishAt: pubAt,
          ...extractChapterAudioFields(c),
          content: '',
        };
      });

      const maxNum = lightweightChapters.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
      const resolvedTotal = (novelData.totalChapters !== undefined && Number(novelData.totalChapters) > 0)
        ? Number(novelData.totalChapters)
        : Math.max(lightweightChapters?.length || 0, maxNum, (novelData as any).latestChapterNumber || 0, 1);

      const latestChap = (lightweightChapters?.length || 0) > 0 ? lightweightChapters[(lightweightChapters?.length || 0) - 1] : null;
      const latestChapterTitle = novelData.latestChapterTitle || (latestChap?.title || `Chương ${resolvedTotal}`);
      const latestChapterNumber = Number((novelData as any).latestChapterNumber) || latestChap?.number || resolvedTotal;
      const resolvedCreatedAt = resolveTimestampMs((novelData as any).createdAt) || 0;
      const resolvedUpdatedAt = resolveTimestampMs(novelData.updatedAt) || resolvedCreatedAt || 0;
      const resolvedLastChapterUpdatedAt = resolveTimestampMs((novelData as any).lastChapterUpdatedAt) || resolvedUpdatedAt || 0;
      const resolvedCategories = Array.isArray(novelData.categories)
        ? novelData.categories
        : Array.isArray((novelData as any).genres)
        ? (novelData as any).genres
        : [];
      const audioFlags = computeNovelAudioFlags(lightweightChapters, novelData);
      const latestPublishAt = getNovelLatestPublishAt(novelData, lightweightChapters) || undefined;

      novels.push({
        ...novelData,
        id: docSnap.id,
        categories: resolvedCategories,
        genres: Array.isArray((novelData as any).genres) ? (novelData as any).genres : resolvedCategories,
        isShortStory: Boolean(novelData.isShortStory),
        youtubeVideoId:
          typeof novelData.youtubeVideoId === 'string' && novelData.youtubeVideoId.trim()
            ? novelData.youtubeVideoId.trim()
            : '',
        isYoutubeVipLocked: Boolean(novelData.isYoutubeVipLocked),
        status: novelData.status || 'Đang ra',
        flowerCount: Number(novelData.flowerCount || 0),
        coinCount: Number(novelData.coinCount || 0),
        createdAt: resolvedCreatedAt,
        lastChapterUpdatedAt: resolvedLastChapterUpdatedAt,
        updatedAt: resolvedUpdatedAt,
        chapters: lightweightChapters,
        totalChapters: resolvedTotal,
        latestChapterTitle,
        latestChapterNumber,
        hasAudio: audioFlags.hasAudio,
        hasMaleAudio: audioFlags.hasMaleAudio,
        hasFemaleAudio: audioFlags.hasFemaleAudio,
        mp3NamMinhCount: audioFlags.mp3NamMinhCount,
        mp3HangNgaCount: audioFlags.mp3HangNgaCount,
        latestPublishAt,
      } as Novel);
    }

    const snapDocs = snapshot?.docs || [];
    const lastDoc = snapDocs[(snapDocs?.length || 0) - 1] || null;
    const hasMore = (snapDocs?.length || 0) === limitCount;

    return {
      novels,
      lastDoc,
      hasMore,
      compositeIndexUrl: null,
      error: null,
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const indexUrlMatch = errorMsg.match(/https:\/\/console\.firebase\.google\.com[^\s)\]]+/);
    const compositeIndexUrl = indexUrlMatch ? indexUrlMatch[0] : null;

    if (compositeIndexUrl) {
      console.error(
        `[Firebase Composite Index Required]: Bạn cần tạo chỉ mục cho truy vấn này tại:\n${compositeIndexUrl}`
      );
      console.error('Chi tiết lỗi Firestore:', error);
    } else {
      console.error(`[Firestore Query Error]:`, error);
    }

    // TUYỆT ĐỐI KHÔNG nạp truyện khác để đắp vào
    return {
      novels: [],
      lastDoc: null,
      hasMore: false,
      compositeIndexUrl,
      error: errorMsg,
    };
  }
}

/**
 * 1. HÀM XỬ LÝ TƯƠNG TÁC (TẶNG HOA / TẶNG XU / LƯỢT XEM):
 * Khi gọi updateDoc vào collection novels để tăng hoa/xu/views:
 * - CHỈ SỬ DỤNG increment() cho các field thống kê (flowerCount, coinCount, views, dailyViews).
 * - BẮT BUỘC KHÔNG ĐƯỢC ghi đè, cập nhật hay chạm vào trường updatedAt hoặc lastChapterUpdatedAt.
 */
export async function incrementNovelInteractionStatsInFirestore(
  novelId: string,
  stats: { flowerCount?: number; coinCount?: number; views?: number; dailyViews?: number }
): Promise<void> {
  if (!novelId) return;
  const updatePayload: Record<string, any> = {};

  if (typeof stats.flowerCount === 'number' && stats.flowerCount !== 0) {
    updatePayload.flowerCount = increment(stats.flowerCount);
  }
  if (typeof stats.coinCount === 'number' && stats.coinCount !== 0) {
    updatePayload.coinCount = increment(stats.coinCount);
  }
  if (typeof stats.views === 'number' && stats.views !== 0) {
    updatePayload.views = increment(stats.views);
  }
  if (typeof stats.dailyViews === 'number' && stats.dailyViews !== 0) {
    updatePayload.dailyViews = increment(stats.dailyViews);
  }

  if ((Object.keys(updatePayload || {})?.length || 0) === 0) return;

  try {
    const novelRef = doc(db, 'novels', novelId);
    await updateDoc(novelRef, updatePayload);
  } catch (e) {
    console.warn('Lỗi cập nhật thống kê tương tác truyện:', e);
  }
}

/**
 * Cập nhật các trường metadata của truyện (status, isHidden, author...)
 * TUYỆT ĐỐI KHÔNG tự ý ghi đè updatedAt nếu chỉ cập nhật cấu hình thông thường.
 * Chỉ ghi nhận updatedAt khi được truyền vào hoặc khi có thay đổi thực sự.
 */
export async function updateNovelMetadataInFirestore(
  novelId: string, 
  partial: Partial<Novel>, 
  options?: { touchUpdatedAt?: boolean }
): Promise<void> {
  if (!novelId) return;
  const payloadData: any = { ...partial };
  if (options?.touchUpdatedAt) {
    payloadData.updatedAt = Date.now();
  }
  const payload = cleanUndefinedFields(payloadData);
  try {
    await setDoc(doc(db, 'novels', novelId), payload, { merge: true });
  } catch (e) {
    console.warn('Lỗi cập nhật metadata novels:', e);
  }
}

/**
 * Ghi danh sách chương vào subcollection bằng WriteBatch của Firebase SDK (chia lô 40 doc/lô).
 * Tôn trọng 100% nội dung chữ thật của người dùng, không bao giờ chèn nội dung ảo.
 */
/**
 * Trợ giúp tạo thông tin chương siêu nhẹ (bỏ qua chuỗi content dài hàng nghìn chữ)
 * Giúp danh mục truyện (TOC) trên root doc chỉ chiếm vài chục KB thay vì nhiều MB,
 * tải siêu tốc trong 0-50ms và không bao giờ gây đầy bộ nhớ/đơ trình duyệt.
 */
export function stripChapterContent(chapter: Chapter): Chapter {
  const pubAt = getChapterPublishAt(chapter);
  return cleanUndefinedFields({
    id: chapter.id || `c-${chapter.number}`,
    number: Number(chapter.number),
    title: chapter.title ? (chapter.title.startsWith('Chương') ? chapter.title : `Chương ${chapter.number}: ${chapter.title}`) : `Chương ${chapter.number}`,
    slug: chapter.slug || `chuong-${chapter.number}`,
    publishedDate: chapter.publishedDate || new Date().toISOString().split('T')[0],
    isVip: Boolean(chapter.isVip),
    priceXu: chapter.priceXu ? Number(chapter.priceXu) : 0,
    wordCount: chapter.wordCount || 0,
    isHidden: Boolean(chapter.isHidden),
    publishAt: pubAt,
    scheduledPublishAt: pubAt,
    authorNote: typeof chapter.authorNote === 'string' && chapter.authorNote.trim() ? chapter.authorNote.trim() : undefined,
    content: '',
    ...extractChapterAudioFields(chapter),
  }) as Chapter;
}

/**
 * Ghi danh sách chương vào subcollection bằng WriteBatch của Firebase SDK (chia lô 25 doc/lô).
 * Tôn trọng 100% nội dung chữ thật của người dùng, không bao giờ chèn nội dung ảo.
 */
// Giới hạn an toàn tuyệt đối cho WriteBatch của Cloud Firestore (chuẩn Firestore tối đa 500 operations/batch)
export const FIRESTORE_BATCH_LIMIT = 400;

/**
 * Ghi danh sách chương vào subcollection novels/{novelId}/chapters bằng WriteBatch của Firebase SDK.
 * - Tự động chia nhỏ (Chunking) tối đa 400 docs/batch để tuân thủ giới hạn 500 của Firestore
 * - Nhường luồng xử lý (Yield loop) giữa các batch để giao diện không bao giờ bị đơ/treo
 * - Báo cáo tiến trình liên tục để hiển thị thanh Loading màu vàng
 */
async function commitChaptersInSafeBatches(
  collectionName: 'novels',
  novelId: string,
  chapters: Chapter[],
  nowTs: number,
  onProgress?: (saved: number, total: number) => void
): Promise<void> {
  if (!chapters || (chapters?.length || 0) === 0) return;

  const total = chapters?.length || 0;
  let savedCount = 0;

  for (let i = 0; i < (chapters?.length || 0); i += FIRESTORE_BATCH_LIMIT) {
    const chunk = (chapters || []).slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);

    chunk.forEach((ch) => {
      const chNumId = String(ch.number);
      const text = ch.content || '';
      const docData = cleanUndefinedFields({
        ...ch,
        content: text,
        wordCount: (text.split(/\s+/).filter(Boolean)?.length || 0) || ch.wordCount || 0,
        id: `c-${novelId}-${ch.number}`,
        number: Number(ch.number),
        updatedAt: nowTs,
      });

      const chRef = doc(db, 'novels', novelId, 'chapters', chNumId);
      batch.set(chRef, docData, { merge: true });

      // Cache nội dung vào localStorage v2 để độc giả đọc lại tức thì không cần tốn lượt đọc Firestore
      if (text) {
        safeSetItem(
          makeChapterCacheKey(novelId, ch.number),
          JSON.stringify({
            content: text,
            wordCount: (text.split(/\s+/).filter(Boolean)?.length || 0) || ch.wordCount || 0,
            ...extractChapterAudioFields(ch),
            cachedAt: nowTs,
          })
        );
        safeSetItem(makeChapterCacheTsKey(novelId, ch.number), String(nowTs));
      }
    });

    try {
      await withTimeout(batch.commit(), 25000, `Gộp ghi lô chương ${Math.floor(i / FIRESTORE_BATCH_LIMIT) + 1}`);
    } catch (batchErr: any) {
      if (batchErr?.message?.includes('quota') || batchErr?.message?.includes('RESOURCE_EXHAUSTED')) {
        console.warn('Spark Quota limit reached on batch save. Preserving local cache.');
        throw new Error('Hệ thống lưu trữ đang tạm thời quá tải lượt ghi. Dữ liệu các chương đã được lưu trữ an toàn trong bộ nhớ máy của bạn và sẵn sàng đọc.');
      }
      console.error(`Lỗi ghi batch ${Math.floor(i / FIRESTORE_BATCH_LIMIT) + 1}:`, batchErr);
      throw batchErr;
    }

    savedCount += chunk?.length || 0;
    if (onProgress) {
      onProgress(Math.min(savedCount, total), total);
    }

    // Nhường luồng JavaScript cho browser render thanh tiến trình màu vàng mượt mà (chống đơ UI)
    if (i + FIRESTORE_BATCH_LIMIT < (chapters?.length || 0)) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
}

/**
 * Xóa các document chương thừa trong subcollection novels/{novelId}/chapters nếu số chương bị giảm
 */
async function pruneRemovedSubcollectionChapters(
  collectionName: 'novels',
  novelId: string,
  validChapterNumbers: Set<number>,
  knownTotalChapters?: number
): Promise<void> {
  try {
    const chapsCol = collection(db, 'novels', novelId, 'chapters');
    const snap = await getDocs(chapsCol).catch(() => null);
    if (!snap || snap.empty) return;

    const toDelete = (snap?.docs || []).filter((d) => {
      const num = Number(d.data()?.number ?? d.id);
      return !Number.isNaN(num) && !validChapterNumbers.has(num);
    });

    if ((toDelete?.length || 0) === 0) return;

    for (let i = 0; i < (toDelete?.length || 0); i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      toDelete.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((d) => {
        batch.delete(d.ref);
        safeRemoveItem(makeChapterCacheKey(novelId, d.id));
        safeRemoveItem(makeChapterCacheTsKey(novelId, d.id));
        safeRemoveItem(`chapter_full_${novelId}_${d.id}`);
        const num = d.data()?.number;
        if (num !== undefined) {
          safeRemoveItem(makeChapterCacheKey(novelId, num));
          safeRemoveItem(makeChapterCacheTsKey(novelId, num));
          safeRemoveItem(`chapter_full_${novelId}_${num}`);
        }
      });
      await batch.commit().catch(() => {});
      await new Promise((r) => setTimeout(r, 20));
    }
  } catch (e) {
    console.warn(`Lỗi dọn chương thừa trong novels/${novelId}/chapters:`, e);
  }
}

/**
 * Lưu tác phẩm mới hoặc cập nhật truyện trong Firestore.
 * Lưu tóm tắt danh mục (metadata) trên root document và toàn bộ nội dung chương trong subcollection 'chapters'.
 */
export async function saveNovelToFirestore(
  novel: Novel,
  options?: { syncChapters?: boolean; onProgress?: (saved: number, total: number) => void }
): Promise<void> {
  const chapters = filterOutDummyChapters(Array.isArray(novel.chapters) ? novel.chapters : []) || [];
  const maxNumberInChaps = chapters.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
  const shouldSyncChapters = options?.syncChapters === true;

  const effectiveTotalChapters = shouldSyncChapters && (chapters?.length || 0) > 0
    ? Math.max(chapters?.length || 0, maxNumberInChaps)
    : ((novel.totalChapters !== undefined && novel.totalChapters >= 0)
        ? novel.totalChapters
        : Math.max(chapters?.length || 0, maxNumberInChaps, (novel as any).latestChapterNumber || 0, 1));

  const latestInfo = resolvePublicLatestChapterInfo(
    chapters,
    novel.latestChapterTitle,
    (novel as any).latestChapterNumber,
    effectiveTotalChapters
  );

  const nowTs = Date.now();
  // Tạo danh mục chương tóm tắt siêu nhẹ trên root doc (không chứa nội dung chữ text)
  const strippedChapters = (chapters || []).map(stripChapterContent);
  const audioFlags = computeNovelAudioFlags(chapters, novel);
  const latestPublishAt = getNovelLatestPublishAt(novel, chapters) || undefined;

  const payloadData: any = {
    ...novel,
    status: novel.status || 'Đang ra',
    totalChapters: effectiveTotalChapters,
    latestChapterTitle: latestInfo.latestChapterTitle,
    latestChapterNumber: latestInfo.latestChapterNumber || (shouldSyncChapters ? effectiveTotalChapters : ((novel as any).latestChapterNumber || effectiveTotalChapters)),
    lastUpdated: novel.lastUpdated || 'Vừa xong',
    updatedAt: nowTs,
    lastChapterUpdatedAt: shouldSyncChapters ? nowTs : (novel.lastChapterUpdatedAt ?? novel.updatedAt ?? nowTs),
    chapters: strippedChapters,
    hasAudio: audioFlags.hasAudio,
    hasMaleAudio: audioFlags.hasMaleAudio,
    hasFemaleAudio: audioFlags.hasFemaleAudio,
    mp3NamMinhCount: audioFlags.mp3NamMinhCount,
    mp3HangNgaCount: audioFlags.mp3HangNgaCount,
    youtubeVideoId:
      typeof novel.youtubeVideoId === 'string' ? novel.youtubeVideoId.trim() : '',
    isYoutubeVipLocked: Boolean(novel.isYoutubeVipLocked),
    latestPublishAt,
  };

  const payload = cleanUndefinedFields(payloadData);
  const validChapterNumbers = new Set<number>((chapters || []).map((c) => Number(c.number)));

  // Nếu cần đồng bộ chương và số chương <= 399 (bao gồm trường hợp 5 chương đầu),
  // gom 1 thao tác ghi truyện và các thao tác ghi chương vào CHUNG 1 writeBatch duy nhất!
  if (shouldSyncChapters && (chapters?.length || 0) > 0 && (chapters?.length || 0) <= 399) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'novels', novel.id), payload, { merge: true });

    chapters.forEach((ch) => {
      const chNumId = String(ch.number);
      const pubAt = getChapterPublishAt(ch);
      const cleanChap = cleanUndefinedFields({
        ...ch,
        id: ch.id || `${novel.id}-c${ch.number}`,
        number: Number(ch.number),
        title: ch.title || `Chương ${ch.number}`,
        slug: ch.slug || `chuong-${ch.number}`,
        wordCount: ch.wordCount || (ch.content ? (ch.content.split(/\s+/).filter(Boolean)?.length || 0) : 0),
        publishedDate: ch.publishedDate || new Date().toISOString().split('T')[0],
        isVip: !!ch.isVip,
        priceXu: ch.priceXu || 0,
        publishAt: pubAt,
        scheduledPublishAt: pubAt,
        content: typeof ch.content === 'string' ? ch.content : '',
        updatedAt: nowTs,
      });
      batch.set(doc(db, 'novels', novel.id, 'chapters', chNumId), cleanChap, { merge: true });
    });

    await withTimeout(batch.commit(), 15000, 'Batch ghi truyện và các chương');
    pruneRemovedSubcollectionChapters('novels', novel.id, validChapterNumbers, novel.totalChapters || 500).catch(() => {});
  } else {
    // Ghi root doc vào "novels"
    await setDoc(doc(db, 'novels', novel.id), payload, { merge: true });

    if (shouldSyncChapters && (chapters?.length || 0) > 0) {
      pruneRemovedSubcollectionChapters('novels', novel.id, validChapterNumbers, novel.totalChapters || 500).catch(() => {});
      await commitChaptersInSafeBatches('novels', novel.id, chapters, nowTs, options?.onProgress);
    }
  }
}

/**
 * Batch Write cho luật 5 chương:
 * Khi tác giả/editor đăng truyện mới lần đầu và gửi 5 chương để duyệt (hoặc khi admin phê duyệt),
 * bắt buộc dùng writeBatch gom 1 thao tác ghi truyện và 5 thao tác ghi chương vào CHUNG 1 luồng xử lý.
 * Đồng thời cập nhật trạng thái đơn duyệt novel_submissions (nếu có) trong cùng WriteBatch.
 */
export async function saveNovelWithInitialChaptersBatch(
  novel: Novel,
  chapters: Chapter[],
  submissionIdToApprove?: string
): Promise<void> {
  const cleanChapters = filterOutDummyChapters(chapters || []) || [];
  const nowTs = Date.now();
  const strippedChapters = (cleanChapters || []).map(stripChapterContent);
  const maxNumberInChaps = cleanChapters.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
  const effectiveTotal = Math.max(novel.totalChapters || 0, cleanChapters?.length || 0, maxNumberInChaps);
  const latestInfo = resolvePublicLatestChapterInfo(
    cleanChapters,
    novel.latestChapterTitle,
    (novel as any).latestChapterNumber,
    effectiveTotal
  );
  const audioFlags = computeNovelAudioFlags(cleanChapters, novel);
  const latestPublishAt = getNovelLatestPublishAt(novel, cleanChapters) || undefined;

  const novelPayload = cleanUndefinedFields({
    ...novel,
    status: novel.status || 'Đang ra',
    totalChapters: effectiveTotal,
    latestChapterTitle: latestInfo.latestChapterTitle,
    latestChapterNumber: latestInfo.latestChapterNumber || effectiveTotal,
    lastUpdated: 'Vừa xong',
    updatedAt: nowTs,
    lastChapterUpdatedAt: novel.lastChapterUpdatedAt || nowTs,
    chapters: strippedChapters,
    hasAudio: audioFlags.hasAudio,
    hasMaleAudio: audioFlags.hasMaleAudio,
    hasFemaleAudio: audioFlags.hasFemaleAudio,
    mp3NamMinhCount: audioFlags.mp3NamMinhCount,
    mp3HangNgaCount: audioFlags.mp3HangNgaCount,
    latestPublishAt,
  });

  const batch = writeBatch(db);

  // 1. Thao tác ghi truyện (1 root doc)
  batch.set(doc(db, 'novels', novel.id), novelPayload, { merge: true });

  // 2. Thao tác ghi 5 chương: mỗi chương là 1 Document duy nhất trong collection 'chapters'
  // Toàn bộ text nội dung nằm trong 1 field duy nhất dạng string 'content'
  cleanChapters.forEach((ch) => {
    const chNumId = String(ch.number);
    const pubAt = getChapterPublishAt(ch);
    const chapterDocData = cleanUndefinedFields({
      id: ch.id || `${novel.id}-c${ch.number}`,
      number: Number(ch.number),
      title: ch.title || `Chương ${ch.number}`,
      slug: ch.slug || `chuong-${ch.number}`,
      wordCount: ch.wordCount || (ch.content ? (ch.content.split(/\s+/).filter(Boolean)?.length || 0) : 0),
      publishedDate: ch.publishedDate || new Date().toISOString().split('T')[0],
      isVip: !!ch.isVip,
      priceXu: ch.priceXu || 0,
      publishAt: pubAt,
      scheduledPublishAt: pubAt,
      ...extractChapterAudioFields(ch),
      content: typeof ch.content === 'string' ? ch.content : '',
      updatedAt: nowTs,
    });
    batch.set(doc(db, 'novels', novel.id, 'chapters', chNumId), chapterDocData, { merge: true });
  });

  // 3. Nếu có submissionId cần duyệt, cập nhật trạng thái trong cùng batch
  if (submissionIdToApprove) {
    batch.update(doc(db, 'novel_submissions', submissionIdToApprove), {
      status: 'approved',
      approvedAt: nowTs,
    });
  }

  // 4. Commit nguyên tử toàn bộ vào Firestore
  await withTimeout(batch.commit(), 15000, 'Batch duyệt truyện và 5 chương');

  // Optimistic UI cache vào bộ nhớ máy để đọc được ngay tức khắc
  cleanChapters.forEach((ch) => {
    if (ch.content) {
      const payload = JSON.stringify({
        content: ch.content,
        wordCount: ch.wordCount || 0,
        ...extractChapterAudioFields(ch),
        cachedAt: nowTs,
      });
      safeSetItem(makeChapterCacheKey(novel.id, ch.number), payload);
      safeSetItem(makeChapterCacheTsKey(novel.id, ch.number), String(nowTs));
      safeSetItem(makeChapterCacheKey(novel.id, ch.id), payload);
      safeSetItem(makeChapterCacheTsKey(novel.id, ch.id), String(nowTs));
    }
  });
}

/**
 * Đăng hàng loạt chương mới bằng WriteBatch SDK native với Chunking an toàn <= 400 operations.
 * - Cập nhật tức thời Optimistic UI vào Cache/State (0ms phản hồi)
 * - Tự động chia nhỏ thành các batch <= 400 docs, không vượt quá giới hạn 500 của Firestore
 * - Nhường luồng (Yield loop) giữa các batch để web không bị đứng im vô cớ
 * - Cập nhật liên tục tiến trình (Progress Bar màu vàng)
 */
export async function saveBatchChaptersToFirestore(
  updatedNovel: Novel,
  newChapters: Chapter[],
  onProgress?: (savedCount: number, totalCount: number) => void
): Promise<void> {
  if (!updatedNovel || !newChapters || (newChapters?.length || 0) === 0) return;

  // Kích hoạt ngay hiển thị ban đầu cho thanh tiến trình màu vàng
  if (onProgress) {
    onProgress(1, newChapters?.length || 0);
  }

  // Lập bản đồ hợp nhất TOC siêu nhẹ (không chứa text content)
  const chapterMap = new Map<number, Chapter>();
  if (Array.isArray(updatedNovel.chapters)) {
    updatedNovel.chapters.forEach((c) => {
      chapterMap.set(Number(c.number), stripChapterContent(c));
    });
  }
  newChapters.forEach((c) => {
    chapterMap.set(Number(c.number), stripChapterContent(c));
  });

  const mergedTOC = Array.from(chapterMap.values()).sort((a, b) => Number(a.number) - Number(b.number));
  const maxNumberInChaps = mergedTOC.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
  const effectiveTotalChapters = Math.max(updatedNovel.totalChapters || 0, mergedTOC?.length || 0, maxNumberInChaps);

  const latestInfo = resolvePublicLatestChapterInfo(
    mergedTOC,
    updatedNovel.latestChapterTitle,
    (updatedNovel as any).latestChapterNumber,
    effectiveTotalChapters
  );
  const audioFlags = computeNovelAudioFlags(mergedTOC, updatedNovel);
  const latestPublishAt = getNovelLatestPublishAt(updatedNovel, mergedTOC) || undefined;

  const nowTs = Date.now();
  const rootUpdateData = cleanUndefinedFields({
    status: updatedNovel.status || 'Đang ra',
    totalChapters: effectiveTotalChapters,
    latestChapterTitle: latestInfo.latestChapterTitle,
    latestChapterNumber: latestInfo.latestChapterNumber || effectiveTotalChapters,
    lastUpdated: 'Vừa xong',
    updatedAt: nowTs,
    lastChapterUpdatedAt: nowTs,
    chapters: mergedTOC,
    hasAudio: audioFlags.hasAudio,
    hasMaleAudio: audioFlags.hasMaleAudio,
    hasFemaleAudio: audioFlags.hasFemaleAudio,
    mp3NamMinhCount: audioFlags.mp3NamMinhCount,
    mp3HangNgaCount: audioFlags.mp3HangNgaCount,
    latestPublishAt,
  });

  // 1. OPTIMISTIC UI: Lưu cache các chương vào localStorage v2 tức thì
  newChapters.forEach((ch) => {
    if (ch.content) {
      safeSetItem(
        makeChapterCacheKey(updatedNovel.id, ch.number),
        JSON.stringify({
          content: ch.content,
          wordCount: ch.wordCount || 0,
          ...extractChapterAudioFields(ch),
          cachedAt: nowTs,
        })
      );
      safeSetItem(makeChapterCacheTsKey(updatedNovel.id, ch.number), String(nowTs));
    }
  });

  // 2. GỘP THAO TÁC GHI BẰNG WRITEBATCH & CHUNKING (<= 400 operations mỗi batch)
  // Nếu tổng số chương mới <= 390, có thể gộp cả subcollection chapters VÀ root doc vào cùng 1 writeBatch!
  if ((newChapters?.length || 0) <= (FIRESTORE_BATCH_LIMIT - 10)) {
    const batch = writeBatch(db);
    newChapters.forEach((ch) => {
      const chNumId = String(ch.number);
      const text = ch.content || '';
      const pubAt = getChapterPublishAt(ch);
      const docData = cleanUndefinedFields({
        ...ch,
        content: text,
        wordCount: (text.split(/\s+/).filter(Boolean)?.length || 0) || ch.wordCount || 0,
        id: `c-${updatedNovel.id}-${ch.number}`,
        number: Number(ch.number),
        publishAt: pubAt,
        scheduledPublishAt: pubAt,
        updatedAt: nowTs,
      });
      batch.set(doc(db, 'novels', updatedNovel.id, 'chapters', chNumId), docData, { merge: true });
    });

    // Cập nhật root document ngay trong cùng batch đó
    const novelRootRef = doc(db, 'novels', updatedNovel.id);
    batch.set(novelRootRef, rootUpdateData, { merge: true });

    try {
      await withTimeout(batch.commit(), 25000, 'Gộp lưu chương truyện');
    } catch (batchErr: any) {
      if (batchErr?.message?.includes('quota') || batchErr?.message?.includes('RESOURCE_EXHAUSTED')) {
        console.warn('Spark Quota limit reached on single batch write. Local state preserved.');
        throw new Error('Hệ thống lưu trữ đang tạm thời quá tải lượt ghi. Dữ liệu các chương đã được lưu trữ an toàn trong bộ nhớ máy của bạn.');
      }
      throw batchErr;
    }

    if (onProgress) {
      onProgress(newChapters?.length || 0, newChapters?.length || 0);
    }
  } else {
    // Nếu vượt quá 400 operations: chia nhỏ thành từng chunk <= 400 ops để xử lý dần
    await commitChaptersInSafeBatches('novels', updatedNovel.id, newChapters, nowTs, onProgress);

    // Cập nhật root document
    await withTimeout(
      setDoc(doc(db, 'novels', updatedNovel.id), rootUpdateData, { merge: true }),
      15000,
      'Cập nhật mục lục tác phẩm'
    );
  }
}

/**
 * Xóa vĩnh viễn nhiều chương đã chọn khỏi Firestore bằng writeBatch theo chunk <= 400 ops.
 * Không tải getDocs toàn bộ collection, xóa trực tiếp bằng writeBatch.
 */
export async function deleteBatchChaptersFromFirestore(
  novelId: string,
  chapterNumbers: number[],
  chapterIds?: string[]
): Promise<{ success: boolean; remainingChaptersCount: number }> {
  if (!novelId || ((chapterNumbers?.length || 0) === 0 && (!chapterIds || (chapterIds?.length || 0) === 0))) {
    return { success: false, remainingChaptersCount: 0 };
  }

  const numSet = new Set((chapterNumbers || []).map(Number));
  const idSet = new Set(chapterIds || []);

  // 1. Tập hợp các khóa định danh document của các chương cần xóa
  const allDocIds = new Set<string>();
  (chapterNumbers || []).forEach((num) => {
    allDocIds.add(String(num));
    allDocIds.add(`c-${num}`);
    allDocIds.add(`${novelId}-c${num}`);
    allDocIds.add(`c-${novelId}-${num}`);
  });
  if (chapterIds) {
    chapterIds.forEach((id) => allDocIds.add(id));
  }

  // 2. Xóa trực tiếp bằng writeBatch chunking <= 400 operations
  const docIdsArray = Array.from(allDocIds);

  for (let i = 0; i < (docIdsArray?.length || 0); i += FIRESTORE_BATCH_LIMIT) {
    const chunk = docIdsArray.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((docId) => {
      batch.delete(doc(db, 'novels', novelId, 'chapters', docId));
    });
    try {
      await batch.commit();
    } catch (e: any) {
      console.warn('Batch delete chunk warning:', e?.message || e);
    }
    if (i + FIRESTORE_BATCH_LIMIT < (docIdsArray?.length || 0)) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  // 3. Xóa cache localStorage tức thì
  (chapterNumbers || []).forEach((num) => {
    safeRemoveItem(makeChapterCacheKey(novelId, num));
    safeRemoveItem(makeChapterCacheTsKey(novelId, num));
    safeRemoveItem(`chapter_full_${novelId}_${num}`);
    safeRemoveItem(`chapter_full_ts_${novelId}_${num}`);
  });
  (chapterIds || []).forEach((id) => {
    safeRemoveItem(makeChapterCacheKey(novelId, id));
    safeRemoveItem(makeChapterCacheTsKey(novelId, id));
    safeRemoveItem(`chapter_full_${novelId}_${id}`);
    safeRemoveItem(`chapter_full_ts_${novelId}_${id}`);
  });

  // 4. Cập nhật root document chính xác
  let remainingCount = 0;
  try {
    const novelSnap = await getDoc(doc(db, 'novels', novelId)).catch(() => null);
    if (novelSnap && novelSnap.exists()) {
      const data = novelSnap.data();
      const prevTotal = Number(data.totalChapters || 0);
      remainingCount = Math.max(0, prevTotal - numSet.size);

      let remainingChapters: Chapter[] = [];
      if (Array.isArray(data.chapters)) {
        remainingChapters = data.chapters.filter(
          (c: any) => !numSet.has(Number(c.number)) && (!c.id || !idSet.has(c.id))
        );
        remainingCount = remainingChapters?.length || 0;
      }

      const latestInfo = resolvePublicLatestChapterInfo(
        remainingChapters,
        undefined,
        remainingCount,
        remainingCount
      );
      const audioFlags = computeNovelAudioFlags(remainingChapters, data as Novel);
      const latestPublishAt = getNovelLatestPublishAt(undefined, remainingChapters);

      const updateData: any = {
        totalChapters: remainingCount,
        latestChapterNumber: latestInfo.latestChapterNumber,
        latestChapterTitle: latestInfo.latestChapterTitle,
        updatedAt: Date.now(),
        lastUpdated: 'Vừa xong',
        chapters: remainingChapters,
        hasAudio: audioFlags.hasAudio,
        hasMaleAudio: audioFlags.hasMaleAudio,
        hasFemaleAudio: audioFlags.hasFemaleAudio,
        mp3NamMinhCount: audioFlags.mp3NamMinhCount,
        mp3HangNgaCount: audioFlags.mp3HangNgaCount,
        latestPublishAt: latestPublishAt > 0 ? latestPublishAt : deleteField(),
      };

      await setDoc(doc(db, 'novels', novelId), updateData, { merge: true });
    }
  } catch (err) {
    console.warn('Lỗi cập nhật root doc sau khi batch xóa chương:', err);
  }

  return { success: true, remainingChaptersCount: remainingCount };
}

/**
 * Ẩn hoặc Hiện một chương cụ thể khỏi độc giả (chỉ Tác giả & Quản trị viên mới xem được)
 */
export async function toggleHideChapterInFirestore(
  novelId: string,
  chapterNumber: number,
  isHidden: boolean
): Promise<void> {
  if (!novelId || !chapterNumber) return;
  const chNumId = String(chapterNumber);
  const patch = { isHidden, updatedAt: Date.now() };

  await setDoc(doc(db, 'novels', novelId, 'chapters', chNumId), patch, { merge: true });
  clearChapterAudioCache(novelId, [{ number: chapterNumber }]);
}

/**
 * Cập nhật hoặc xóa liên kết MP3 theo từng giọng (Nam Minh / Hằng Nga) cho 1 chương:
 * - voice = 'male'   -> cập nhật/xóa audioUrlMale (khi xóa cũng dọn audioUrl cũ để tránh sót link cũ)
 * - voice = 'female' -> chỉ cập nhật/xóa audioUrlFemale, giữ nguyên 100% giọng Nam Minh & audioUrl cũ
 */
export async function updateChapterAudioUrlInFirestore(
  novelId: string,
  chapter: Chapter,
  audioUrl: string | null,
  voice: 'male' | 'female' = 'male',
  overrideCounts?: { mp3NamMinhCount: number; mp3HangNgaCount: number }
): Promise<void> {
  if (!novelId || !chapter) return;

  const cleanUrl = typeof audioUrl === 'string' ? audioUrl.trim() : '';
  const nowTs = Date.now();
  const subPayload: Record<string, any> = { updatedAt: nowTs };

  if (voice === 'female') {
    subPayload.audioUrlFemale = cleanUrl ? cleanUrl : deleteField();
    subPayload.femaleAudioUrl = deleteField();
    subPayload.mp3Female = deleteField();
  } else {
    if (cleanUrl) {
      subPayload.audioUrlMale = cleanUrl;
      subPayload.audioUrl = cleanUrl;
    } else {
      subPayload.audioUrlMale = deleteField();
      subPayload.audioUrl = deleteField();
    }
    subPayload.mp3Url = deleteField();
    subPayload.maleAudioUrl = deleteField();
    subPayload.audio = deleteField();
  }

  const chNumId = String(chapter.number);
  const targetDocIds = Array.from(
    new Set(
      [chNumId, chapter.id]
        .map((id) => (id ? String(id).trim() : ''))
        .filter(Boolean)
    )
  );

  // 1. Cập nhật subcollection chapter doc(s)
  for (let i = 0; i < targetDocIds.length; i++) {
    const docId = targetDocIds[i];
    const chRef = doc(db, 'novels', novelId, 'chapters', docId);
    if (i === 0) {
      await setDoc(chRef, subPayload, { merge: true });
    } else {
      try {
        const snap = await getDoc(chRef);
        if (snap.exists()) {
          await setDoc(chRef, subPayload, { merge: true });
        }
      } catch {}
    }
  }

  // 2. Đồng bộ trong mảng mục lục chapters và cờ hasMaleAudio / hasFemaleAudio / bộ đếm MP3 trên root doc novels/{novelId}
  let syncedMetaPatch:
    | {
        mp3NamMinhCount?: number;
        mp3HangNgaCount?: number;
        hasMaleAudio?: boolean;
        hasFemaleAudio?: boolean;
        hasAudio?: boolean;
      }
    | undefined;
  try {
    const novelRef = doc(db, 'novels', novelId);
    const novelSnap = await getDoc(novelRef);
    if (novelSnap.exists()) {
      const data = novelSnap.data();
      if (Array.isArray(data.chapters) && data.chapters.length > 0) {
        const updatedChapters = data.chapters.map((c: any) => {
          const isMatch =
            (chapter.id && c.id === chapter.id) ||
            (Number(c.number) > 0 && Number(c.number) === Number(chapter.number));
          if (!isMatch) return c;
          const nextEntry: Record<string, any> = { ...c };
          if (voice === 'female') {
            if (cleanUrl) {
              nextEntry.audioUrlFemale = cleanUrl;
            } else {
              delete nextEntry.audioUrlFemale;
            }
            delete nextEntry.femaleAudioUrl;
            delete nextEntry.mp3Female;
          } else {
            if (cleanUrl) {
              nextEntry.audioUrlMale = cleanUrl;
              nextEntry.audioUrl = cleanUrl;
            } else {
              delete nextEntry.audioUrlMale;
              delete nextEntry.audioUrl;
            }
            delete nextEntry.mp3Url;
            delete nextEntry.maleAudioUrl;
            delete nextEntry.audio;
          }
          return cleanUndefinedFields(nextEntry);
        });
        const flags = computeNovelAudioFlags(updatedChapters);
        const resolvedMaleCount = overrideCounts ? overrideCounts.mp3NamMinhCount : flags.mp3NamMinhCount;
        const resolvedFemaleCount = overrideCounts ? overrideCounts.mp3HangNgaCount : flags.mp3HangNgaCount;
        if (cleanUrl) {
          if (voice === 'female') flags.hasFemaleAudio = true;
          else flags.hasMaleAudio = true;
          flags.hasAudio = true;
        }
        syncedMetaPatch = {
          hasMaleAudio: flags.hasMaleAudio || resolvedMaleCount > 0,
          hasFemaleAudio: flags.hasFemaleAudio || resolvedFemaleCount > 0,
          hasAudio: flags.hasAudio || resolvedMaleCount > 0 || resolvedFemaleCount > 0,
          mp3NamMinhCount: resolvedMaleCount,
          mp3HangNgaCount: resolvedFemaleCount,
        };
        await setDoc(
          novelRef,
          {
            chapters: updatedChapters,
            ...syncedMetaPatch,
            updatedAt: nowTs,
          },
          { merge: true }
        );
      } else {
        const nextFlags: Record<string, any> = { updatedAt: nowTs };
        if (overrideCounts) {
          nextFlags.mp3NamMinhCount = Math.max(0, overrideCounts.mp3NamMinhCount);
          nextFlags.mp3HangNgaCount = Math.max(0, overrideCounts.mp3HangNgaCount);
          nextFlags.hasMaleAudio = nextFlags.mp3NamMinhCount > 0;
          nextFlags.hasFemaleAudio = nextFlags.mp3HangNgaCount > 0;
          nextFlags.hasAudio = nextFlags.hasMaleAudio || nextFlags.hasFemaleAudio;
        } else {
          if (voice === 'female') {
            if (cleanUrl) nextFlags.hasFemaleAudio = true;
          } else {
            if (cleanUrl) nextFlags.hasMaleAudio = true;
          }
          if (cleanUrl) nextFlags.hasAudio = true;
        }
        syncedMetaPatch = {
          ...(typeof nextFlags.mp3NamMinhCount === 'number'
            ? { mp3NamMinhCount: nextFlags.mp3NamMinhCount }
            : {}),
          ...(typeof nextFlags.mp3HangNgaCount === 'number'
            ? { mp3HangNgaCount: nextFlags.mp3HangNgaCount }
            : {}),
          ...(typeof nextFlags.hasMaleAudio === 'boolean'
            ? { hasMaleAudio: nextFlags.hasMaleAudio }
            : {}),
          ...(typeof nextFlags.hasFemaleAudio === 'boolean'
            ? { hasFemaleAudio: nextFlags.hasFemaleAudio }
            : {}),
          ...(typeof nextFlags.hasAudio === 'boolean' ? { hasAudio: nextFlags.hasAudio } : {}),
        };
        await setDoc(novelRef, nextFlags, { merge: true });
      }
    }
    // Cập nhật trực tiếp link mới vào cache localStorage/sessionStorage (0 Reads phát sinh)
    syncChapterAudioInStorageCache(
      novelId,
      [
        {
          id: chapter.id,
          number: chapter.number,
          updateMale: voice === 'male',
          updateFemale: voice === 'female',
          ...(voice === 'male'
            ? { audioUrlMale: cleanUrl || null, audioUrl: cleanUrl || null }
            : { audioUrlFemale: cleanUrl || null }),
        },
      ],
      syncedMetaPatch
    );
  } catch (err) {
    console.warn('Lỗi đồng bộ liên kết audio lên mục lục truyện:', err);
  }
}

/**
 * Đảm bảo cờ hasMaleAudio / hasFemaleAudio (và hasAudio) trên novels/{novelId} được bật true
 * khi Admin bấm Nghe thử thành công hoặc lưu link MP3 mới.
 */
export async function ensureNovelAudioVoiceFlagInFirestore(
  novelId: string,
  voice: 'male' | 'female'
): Promise<void> {
  if (!novelId) return;
  try {
    const payload: Record<string, any> = {
      hasAudio: true,
      updatedAt: Date.now(),
    };
    if (voice === 'female') {
      payload.hasFemaleAudio = true;
    } else {
      payload.hasMaleAudio = true;
    }
    await setDoc(doc(db, 'novels', novelId), payload, { merge: true });
    invalidateNovelsCache();
  } catch (err) {
    console.warn('Lỗi cập nhật cờ giọng MP3 trên truyện:', err);
  }
}

export interface ChapterAudioLinkBatchItem {
  chapter: Chapter;
  audioUrlMale?: string | null;
  audioUrlFemale?: string | null;
}

/**
 * Cập nhật hoặc xóa hàng loạt link MP3 (chỉ chạm vào đúng chương và đúng giọng được truyền vào).
 * Dùng WriteBatch <= 400 operations cho subcollection và cập nhật 1 lần lên root doc novels/{novelId}.
 */
export async function batchUpdateChapterAudioLinksInFirestore(
  novelId: string,
  items: ChapterAudioLinkBatchItem[],
  overrideCounts?: { mp3NamMinhCount: number; mp3HangNgaCount: number }
): Promise<void> {
  if (!novelId || !Array.isArray(items) || items.length === 0) return;

  const validItems = items.filter(
    (item) =>
      item?.chapter &&
      (item.audioUrlMale !== undefined || item.audioUrlFemale !== undefined)
  );
  if (validItems.length === 0) return;

  const nowTs = Date.now();
  const byChapterNum = new Map<number, ChapterAudioLinkBatchItem>();
  const byChapterId = new Map<string, ChapterAudioLinkBatchItem>();

  validItems.forEach((item) => {
    const num = Number(item.chapter.number);
    if (Number.isFinite(num)) {
      byChapterNum.set(num, item);
    }
    if (item.chapter.id) {
      byChapterId.set(item.chapter.id, item);
    }
  });

  // 1. Ghi subcollection theo từng batch an toàn (<= 400 ops/batch)
  for (let i = 0; i < validItems.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = validItems.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);

    chunk.forEach((item) => {
      const chNumId = String(item.chapter.number);
      const subPayload: Record<string, any> = { updatedAt: nowTs };

      if (item.audioUrlMale !== undefined) {
        const cleanMale = typeof item.audioUrlMale === 'string' ? item.audioUrlMale.trim() : '';
        if (cleanMale) {
          subPayload.audioUrlMale = cleanMale;
          subPayload.audioUrl = cleanMale;
        } else {
          subPayload.audioUrlMale = deleteField();
          subPayload.audioUrl = deleteField();
        }
        subPayload.mp3Url = deleteField();
        subPayload.maleAudioUrl = deleteField();
        subPayload.audio = deleteField();
      }

      if (item.audioUrlFemale !== undefined) {
        const cleanFemale =
          typeof item.audioUrlFemale === 'string' ? item.audioUrlFemale.trim() : '';
        if (cleanFemale) {
          subPayload.audioUrlFemale = cleanFemale;
        } else {
          subPayload.audioUrlFemale = deleteField();
        }
        subPayload.femaleAudioUrl = deleteField();
        subPayload.mp3Female = deleteField();
      }

      batch.set(doc(db, 'novels', novelId, 'chapters', chNumId), subPayload, { merge: true });
    });

    await withTimeout(
      batch.commit(),
      25000,
      `Cập nhật lô link MP3 ${Math.floor(i / FIRESTORE_BATCH_LIMIT) + 1}`
    );

    if (i + FIRESTORE_BATCH_LIMIT < validItems.length) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  // 2. Đồng bộ 1 lần duy nhất lên mảng chapters và cờ + bộ đếm MP3 trên root doc novels/{novelId}
  let syncedMetaPatch:
    | {
        mp3NamMinhCount?: number;
        mp3HangNgaCount?: number;
        hasMaleAudio?: boolean;
        hasFemaleAudio?: boolean;
        hasAudio?: boolean;
      }
    | undefined;
  const novelRef = doc(db, 'novels', novelId);
  const novelSnap = await getDoc(novelRef);
  if (novelSnap.exists()) {
    const data = novelSnap.data();
    if (Array.isArray(data.chapters) && data.chapters.length > 0) {
      const updatedChapters = data.chapters.map((c: any) => {
        const match =
          (c.id ? byChapterId.get(String(c.id)) : undefined) ||
          (Number(c.number) > 0 ? byChapterNum.get(Number(c.number)) : undefined);
        if (!match) return c;

        const nextEntry: Record<string, any> = { ...c };
        if (match.audioUrlMale !== undefined) {
          const cleanMale =
            typeof match.audioUrlMale === 'string' ? match.audioUrlMale.trim() : '';
          if (cleanMale) {
            nextEntry.audioUrlMale = cleanMale;
            nextEntry.audioUrl = cleanMale;
          } else {
            delete nextEntry.audioUrlMale;
            delete nextEntry.audioUrl;
          }
          delete nextEntry.mp3Url;
          delete nextEntry.maleAudioUrl;
          delete nextEntry.audio;
        }
        if (match.audioUrlFemale !== undefined) {
          const cleanFemale =
            typeof match.audioUrlFemale === 'string' ? match.audioUrlFemale.trim() : '';
          if (cleanFemale) {
            nextEntry.audioUrlFemale = cleanFemale;
          } else {
            delete nextEntry.audioUrlFemale;
          }
          delete nextEntry.femaleAudioUrl;
          delete nextEntry.mp3Female;
        }
        return cleanUndefinedFields(nextEntry);
      });

      const anyMaleAdded = validItems.some(
        (i) => typeof i.audioUrlMale === 'string' && i.audioUrlMale.trim().length > 0
      );
      const anyFemaleAdded = validItems.some(
        (i) => typeof i.audioUrlFemale === 'string' && i.audioUrlFemale.trim().length > 0
      );
      const flags = computeNovelAudioFlags(updatedChapters);
      const resolvedMaleCount = overrideCounts ? overrideCounts.mp3NamMinhCount : flags.mp3NamMinhCount;
      const resolvedFemaleCount = overrideCounts ? overrideCounts.mp3HangNgaCount : flags.mp3HangNgaCount;
      if (anyMaleAdded) {
        flags.hasMaleAudio = true;
        flags.hasAudio = true;
      }
      if (anyFemaleAdded) {
        flags.hasFemaleAudio = true;
        flags.hasAudio = true;
      }

      syncedMetaPatch = {
        hasMaleAudio: flags.hasMaleAudio || resolvedMaleCount > 0,
        hasFemaleAudio: flags.hasFemaleAudio || resolvedFemaleCount > 0,
        hasAudio: flags.hasAudio || resolvedMaleCount > 0 || resolvedFemaleCount > 0,
        mp3NamMinhCount: resolvedMaleCount,
        mp3HangNgaCount: resolvedFemaleCount,
      };

      await withTimeout(
        setDoc(
          novelRef,
          {
            chapters: updatedChapters,
            ...syncedMetaPatch,
            updatedAt: nowTs,
          },
          { merge: true }
        ),
        15000,
        'Đồng bộ mục lục MP3 lên truyện'
      );
    } else {
      const anyMaleAdded = validItems.some(
        (i) => typeof i.audioUrlMale === 'string' && i.audioUrlMale.trim().length > 0
      );
      const anyFemaleAdded = validItems.some(
        (i) => typeof i.audioUrlFemale === 'string' && i.audioUrlFemale.trim().length > 0
      );
      const patchFlags: Record<string, any> = { updatedAt: nowTs };
      if (overrideCounts) {
        patchFlags.mp3NamMinhCount = Math.max(0, overrideCounts.mp3NamMinhCount);
        patchFlags.mp3HangNgaCount = Math.max(0, overrideCounts.mp3HangNgaCount);
        patchFlags.hasMaleAudio = patchFlags.mp3NamMinhCount > 0 || anyMaleAdded;
        patchFlags.hasFemaleAudio = patchFlags.mp3HangNgaCount > 0 || anyFemaleAdded;
        patchFlags.hasAudio = patchFlags.hasMaleAudio || patchFlags.hasFemaleAudio;
      } else {
        if (anyMaleAdded) patchFlags.hasMaleAudio = true;
        if (anyFemaleAdded) patchFlags.hasFemaleAudio = true;
        if (anyMaleAdded || anyFemaleAdded) patchFlags.hasAudio = true;
      }
      syncedMetaPatch = {
        ...(typeof patchFlags.mp3NamMinhCount === 'number'
          ? { mp3NamMinhCount: patchFlags.mp3NamMinhCount }
          : {}),
        ...(typeof patchFlags.mp3HangNgaCount === 'number'
          ? { mp3HangNgaCount: patchFlags.mp3HangNgaCount }
          : {}),
        ...(typeof patchFlags.hasMaleAudio === 'boolean'
          ? { hasMaleAudio: patchFlags.hasMaleAudio }
          : {}),
        ...(typeof patchFlags.hasFemaleAudio === 'boolean'
          ? { hasFemaleAudio: patchFlags.hasFemaleAudio }
          : {}),
        ...(typeof patchFlags.hasAudio === 'boolean' ? { hasAudio: patchFlags.hasAudio } : {}),
      };
      await withTimeout(
        setDoc(novelRef, patchFlags, { merge: true }),
        15000,
        'Đồng bộ cờ giọng MP3 lên truyện'
      );
    }
  }

  // Cập nhật trực tiếp link mới vào cache localStorage & sessionStorage của bộ truyện (0 Reads phát sinh)
  syncChapterAudioInStorageCache(
    novelId,
    validItems.map((item) => ({
      id: item.chapter.id,
      number: item.chapter.number,
      updateMale: item.audioUrlMale !== undefined,
      updateFemale: item.audioUrlFemale !== undefined,
      ...(item.audioUrlMale !== undefined
        ? {
            audioUrlMale:
              typeof item.audioUrlMale === 'string' && item.audioUrlMale.trim()
                ? item.audioUrlMale.trim()
                : null,
            audioUrl:
              typeof item.audioUrlMale === 'string' && item.audioUrlMale.trim()
                ? item.audioUrlMale.trim()
                : null,
          }
        : {}),
      ...(item.audioUrlFemale !== undefined
        ? {
            audioUrlFemale:
              typeof item.audioUrlFemale === 'string' && item.audioUrlFemale.trim()
                ? item.audioUrlFemale.trim()
                : null,
          }
        : {}),
    })),
    syncedMetaPatch
  );
}

/**
 * Đồng bộ bộ đếm MP3 (Nam Minh / Hằng Nga) lên root document novels/{novelId} bằng duy nhất 1 lệnh ghi.
 */
export async function syncNovelMp3CountsInFirestore(
  novelId: string,
  counts: {
    mp3NamMinhCount: number;
    mp3HangNgaCount: number;
    hasMaleAudio: boolean;
    hasFemaleAudio: boolean;
    hasAudio: boolean;
  }
): Promise<void> {
  if (!novelId) return;
  try {
    await setDoc(
      doc(db, 'novels', novelId),
      {
        mp3NamMinhCount: Math.max(0, counts.mp3NamMinhCount),
        mp3HangNgaCount: Math.max(0, counts.mp3HangNgaCount),
        hasMaleAudio: Boolean(counts.hasMaleAudio),
        hasFemaleAudio: Boolean(counts.hasFemaleAudio),
        hasAudio: Boolean(counts.hasAudio),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Lỗi đồng bộ thống kê MP3 lên truyện:', err);
  }
}

/**
 * Lưu riêng các chương vừa được chỉnh sửa/thêm mới từ EditNovelModal vào subcollection chapters.
 */
export async function saveEditedChaptersToSubcollection(
  novelId: string,
  chapters: Chapter[]
): Promise<void> {
  if (!novelId || !Array.isArray(chapters) || chapters.length === 0) return;
  const nowTs = Date.now();
  for (let i = 0; i < chapters.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = chapters.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((ch) => {
      const chNumId = String(ch.number);
      const pubAt = getChapterPublishAt(ch);
      const docRef = doc(db, 'novels', novelId, 'chapters', chNumId);
      const payload: Record<string, any> = cleanUndefinedFields({
        id: ch.id || `${novelId}-c${ch.number}`,
        number: Number(ch.number),
        title: ch.title || `Chương ${ch.number}`,
        slug: ch.slug || `chuong-${ch.number}`,
        wordCount: ch.wordCount || (ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0),
        publishedDate: ch.publishedDate || new Date().toISOString().split('T')[0],
        isVip: Boolean(ch.isVip),
        priceXu: ch.isVip ? Number(ch.priceXu || 0) : 0,
        isHidden: Boolean(ch.isHidden),
        authorNote: typeof ch.authorNote === 'string' && ch.authorNote.trim() ? ch.authorNote.trim() : undefined,
        ...extractChapterAudioFields(ch),
        updatedAt: nowTs,
      });
      if (typeof ch.content === 'string' && ch.content.trim().length > 0) {
        payload.content = ch.content;
      }
      if (typeof pubAt === 'number' && pubAt > 0) {
        payload.publishAt = pubAt;
        payload.scheduledPublishAt = pubAt;
      } else {
        payload.publishAt = deleteField();
        payload.scheduledPublishAt = deleteField();
      }
      batch.set(docRef, payload, { merge: true });
    });
    await withTimeout(batch.commit(), 20000, 'Lưu chỉnh sửa chương');
  }
  clearChapterAudioCache(
    novelId,
    chapters.map((c) => ({ id: c.id, number: c.number }))
  );
}

/**
 * Ẩn hoặc Hiện hàng loạt chương đã chọn bằng writeBatch theo chunk <= 400 ops
 */
export async function toggleHideBatchChaptersInFirestore(
  novelId: string,
  chapterNumbers: number[],
  isHidden: boolean
): Promise<void> {
  if (!novelId || (chapterNumbers?.length || 0) === 0) return;
  const nowTs = Date.now();

  for (let i = 0; i < (chapterNumbers?.length || 0); i += FIRESTORE_BATCH_LIMIT) {
    const chunk = (chapterNumbers || []).slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((num) => {
      const ref = doc(db, 'novels', novelId, 'chapters', String(num));
      batch.set(ref, { isHidden, updatedAt: nowTs }, { merge: true });
    });
    await batch.commit();
    if (i + FIRESTORE_BATCH_LIMIT < (chapterNumbers?.length || 0)) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }
}

/**
 * Xóa vĩnh viễn một chương duy nhất khỏi Firestore qua batch delete
 */
export async function deleteChapterFromFirestore(
  novelId: string,
  chapterNumber: number,
  chapterId?: string
): Promise<{ success: boolean; remainingChaptersCount: number }> {
  return deleteBatchChaptersFromFirestore(novelId, [chapterNumber], chapterId ? [chapterId] : []);
}

/**
 * Ghi một chương mới bằng WriteBatch nguyên tử (cập nhật đồng thời subcollection chapter và root doc)
 */
export async function addSingleChapterToFirestore(
  novelId: string, 
  chapter: Chapter,
  novelMeta?: Partial<Novel>
): Promise<void> {
  const pubAt = getChapterPublishAt(chapter);
  const cleanChap = cleanUndefinedFields({
    ...chapter,
    id: chapter.id || `${novelId}-c${chapter.number}`,
    number: Number(chapter.number),
    publishedDate: chapter.publishedDate || new Date().toISOString().split('T')[0],
    publishAt: pubAt,
    scheduledPublishAt: pubAt,
  });
  const chNumId = String(chapter.number);

  try {
    const batch = writeBatch(db);
    // 1. Ghi vào subcollection novels/{novelId}/chapters/{chNumId}
    batch.set(doc(db, 'novels', novelId, 'chapters', chNumId), cleanChap, { merge: true });

    // 2. Cập nhật root novel doc trong cùng batch (gộp 1 thao tác ghi)
    const strippedMetaChapters = Array.isArray(novelMeta?.chapters)
      ? (novelMeta.chapters || []).map(stripChapterContent)
      : undefined;

    const nowTs = Date.now();
    const metaChapsPool = strippedMetaChapters || [stripChapterContent(chapter)];
    const latestInfo = resolvePublicLatestChapterInfo(
      metaChapsPool,
      chapter.title,
      chapter.number,
      novelMeta?.totalChapters || Number(chapter.number) || 1
    );
    const latestPublishAt = getNovelLatestPublishAt(novelMeta, metaChapsPool) || undefined;
    const audioFlags = strippedMetaChapters ? computeNovelAudioFlags(strippedMetaChapters, novelMeta) : null;

    const rootPatch = cleanUndefinedFields({
      latestChapterTitle: latestInfo.latestChapterTitle,
      latestChapterNumber: latestInfo.latestChapterNumber,
      lastUpdated: 'Vừa xong',
      updatedAt: nowTs,
      lastChapterUpdatedAt: nowTs,
      status: novelMeta?.status,
      totalChapters: novelMeta?.totalChapters,
      chapters: strippedMetaChapters,
      latestPublishAt,
      ...(audioFlags
        ? {
            hasAudio: audioFlags.hasAudio,
            hasMaleAudio: audioFlags.hasMaleAudio,
            hasFemaleAudio: audioFlags.hasFemaleAudio,
            mp3NamMinhCount: audioFlags.mp3NamMinhCount,
            mp3HangNgaCount: audioFlags.mp3HangNgaCount,
          }
        : {}),
    });

    batch.set(doc(db, 'novels', novelId), rootPatch, { merge: true });

    await withTimeout(batch.commit(), 10000, 'Ghi chương mới');
  } catch (e: any) {
    if (e?.message?.includes('quota') || e?.message?.includes('RESOURCE_EXHAUSTED')) {
      console.warn('Spark Quota limit reached on single chapter write.');
    } else {
      console.warn(`Lỗi ghi subcollection novels/${novelId}/chapters:`, e);
    }
  }
}

/**
 * Nạp dữ liệu mẫu ban đầu vào Firestore nếu database đang trống.
 */
export async function seedNovelsIfEmpty(_sampleNovels: Novel[]): Promise<Novel[]> {
  return [];
}

/**
 * Xóa vĩnh viễn truyện khỏi Firestore siêu tốc:
 * - Xóa ngay root document (novels, submissions) để truyện biến mất trong 0ms (Optimistic UI)
 * - Dọn dẹp subcollection chapters bằng writeBatch chunking trong background không chặn UI
 */
export async function deleteNovelFromFirestore(
  novelId: string,
  extra?: { slug?: string; title?: string; totalChapters?: number }
): Promise<void> {
  if (!novelId) return;

  // 1. XÓA ROOT DOCUMENTS ĐẦU TIÊN (Đảm bảo truyện biến mất tức thì cho tất cả người dùng trong ~30ms)
  const rootDeletions = [
    deleteDoc(doc(db, 'novels', novelId)).catch(() => {}),
    deleteDoc(doc(db, 'novel_submissions', novelId)).catch(() => {}),
  ];

  if (extra?.slug && extra.slug !== novelId) {
    rootDeletions.push(deleteDoc(doc(db, 'novels', extra.slug)).catch(() => {}));
  }

  await Promise.allSettled(rootDeletions);

  // 2. Dọn sạch cache localStorage tức thì
  try {
    const cached = safeGetItem('dao_tam_novels');
    if (cached) {
      const parsed = safeJsonParse<any[]>(cached, []);
      if (Array.isArray(parsed)) {
        const remaining = parsed.filter(
          (n: any) => n.id !== novelId && (!extra?.slug || n.slug !== extra.slug)
        );
        saveNovelsToStorage(remaining);
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < (window.localStorage?.length || 0); i++) {
        const k = window.localStorage.key(i);
        if (
          k &&
          (k.startsWith(`${CHAPTER_CACHE_PREFIX}${novelId}`) ||
            k.startsWith(`${CHAPTER_CACHE_TS_PREFIX}${novelId}`) ||
            k.startsWith(`chapter_full_${novelId}`) ||
            k.includes(novelId))
        ) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => safeRemoveItem(k));
    }
  } catch {}

  // 3. Dọn dẹp subcollection chapters chạy ngầm (background non-blocking với writeBatch chunking <= 400 ops)
  (async () => {
    try {
      const chapsCol = collection(db, 'novels', novelId, 'chapters');
      const snap = await getDocs(chapsCol).catch(() => null);
      if (snap && !snap.empty) {
        const snapDocs = snap?.docs || [];
        for (let i = 0; i < (snapDocs?.length || 0); i += FIRESTORE_BATCH_LIMIT) {
          const batch = writeBatch(db);
          snapDocs.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
          await batch.commit().catch(() => {});
          await new Promise((r) => setTimeout(r, 40));
        }
      }
    } catch (error) {
      console.warn(`Lỗi dọn subcollection chapters của novels/${novelId}:`, error);
    }
  })();
}

/**
 * Ẩn hoặc hiện truyện trên Firestore siêu tốc (Optimistic UI & single doc update)
 */
export async function toggleHideNovelInFirestore(novelId: string, isHidden: boolean): Promise<void> {
  const updatePayload = {
    isHidden,
    publishStatus: isHidden ? 'hidden' : 'published',
  };

  await setDoc(doc(db, 'novels', novelId), updatePayload, { merge: true });
  invalidateNovelsCache();
}

/* ==========================================================================
   FIRESTORE REALTIME SERVICES: YÊU CẦU NẠP TIỀN (TOP-UP REQUESTS)
   ========================================================================== */

/**
 * Gửi yêu cầu nạp Xu lên Firestore collection "topup_requests"
 * BẮT BUỘC: Lấy thông tin thật từ Firebase Auth (currentUser):
 * - userEmail: currentUser.email thật
 * - userName: currentUser.displayName (nếu không có thì lấy phần trước ký tự @ của email)
 * - uid & userId: currentUser.uid
 * Tuyệt đối không lưu dữ liệu giả 'Khách Đọc Truyện' hay 'docgia@daotam.vn'.
 */
export async function createTopUpRequestInFirestore(
  requestData: Omit<TopUpRequest, 'id' | 'createdAt' | 'status'>
): Promise<TopUpRequest> {
  const path = 'topup_requests';
  try {
    const currentUser = auth.currentUser;
    const realUid = currentUser?.uid || requestData.uid || requestData.userId;
    const realEmail = currentUser?.email || requestData.userEmail;
    const realName = currentUser?.displayName || 
      (realEmail && realEmail.includes('@') ? realEmail.split('@')[0] : (requestData.userName || 'Độc giả Đạo Tâm'));

    if (!realUid || !realEmail || realEmail === 'docgia@daotam.vn') {
      throw new Error('Bạn cần đăng nhập tài khoản thật trước khi gửi lệnh nạp tiền. Tuyệt đối không dùng dữ liệu giả.');
    }

    const newDocRef = doc(collection(db, path));
    const newRequest: TopUpRequest = {
      ...requestData,
      id: newDocRef.id,
      uid: realUid,
      userId: realUid,
      userEmail: realEmail,
      userName: realName,
      status: 'pending',
      createdAt: Date.now(),
    };
    await setDoc(newDocRef, cleanUndefinedFields(newRequest));
    return newRequest;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Tải danh sách yêu cầu nạp tiền:
 * - Admin: Tải toàn bộ danh sách
 * - User thường: Chỉ tải yêu cầu của chính user (filterUserId)
 */
export async function fetchTopUpRequestsFromFirestore(filterUserId?: string): Promise<TopUpRequest[]> {
  const path = 'topup_requests';
  try {
    const colRef = collection(db, path);
    const q = filterUserId
      ? query(colRef, where('userId', '==', filterUserId), limit(20))
      : query(colRef, orderBy('createdAt', 'desc'), limit(20));

    const snap = await getDocs(q);
    const list: TopUpRequest[] = (snap?.docs || []).map((d) => ({
      ...(d.data() as TopUpRequest),
      id: d.id,
    }));

    if (filterUserId) {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  } catch (error) {
    console.warn('Lỗi tải topup_requests:', error);
    return [];
  }
}

/**
 * ==============================================================================
 * PHÍA ADMIN: LẮNG NGHE REAL-TIME LỆNH NẠP CHỜ DUYỆT (PENDING ONLY)
 * ==============================================================================
 * Sử dụng onSnapshot với query: where('status', '==', 'pending'), limit(20)
 * Bảo vệ Quota (Spark Plan): Tiết kiệm tối đa lượt đọc Firestore.
 * Trả về hàm unsubscribe() để caller cleanup trong useEffect khi unmount / rời trang.
 */
export function listenToPendingTopUpRequestsRealtime(
  onUpdate: (requests: TopUpRequest[]) => void
): () => void {
  const path = 'topup_requests';
  try {
    if (!auth.currentUser) {
      return () => {};
    }
    const colRef = collection(db, path);
    const q = query(colRef, where('status', '==', 'pending'), limit(20));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: TopUpRequest[] = (snap?.docs || []).map((d) => ({
          ...(d.data() as TopUpRequest),
          id: d.id,
        }));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        onUpdate(list);
      },
      (error) => {
        console.warn('Lỗi onSnapshot pending topup:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.warn('Lỗi khởi tạo listener pending topup:', error);
    return () => {};
  }
}

/**
 * Cập nhật trạng thái duyệt nạp tiền bằng updateDoc của Firestore
 */
export async function updateTopUpRequestStatusInFirestore(
  requestId: string,
  status: 'approved' | 'rejected' | 'cancelled',
  rejectionReason?: string
): Promise<void> {
  const path = `topup_requests/${requestId}`;
  try {
    const reqRef = doc(db, 'topup_requests', requestId);
    const updatePayload: Record<string, any> = {
      status,
    };
    if (status === 'approved') {
      updatePayload.approvedAt = Date.now();
    } else if (status === 'rejected') {
      updatePayload.rejectedAt = Date.now();
      if (rejectionReason) updatePayload.rejectionReason = rejectionReason;
    }
    await updateDoc(reqRef, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface FinanceStats {
  totalRevenueVnd: number;
  totalApprovedXu: number;
  updatedAt?: number;
}

/**
 * Tính mốc 00:00:00.000 hôm nay theo múi giờ Việt Nam (UTC+7)
 */
export function getVietnamStartOfDayMs(referenceMs: number = Date.now()): number {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const vnDate = new Date(referenceMs + VN_OFFSET_MS);
  return (
    Date.UTC(vnDate.getUTCFullYear(), vnDate.getUTCMonth(), vnDate.getUTCDate()) -
    VN_OFFSET_MS
  );
}

/**
 * Đọc 1 document duy nhất stats/finance (chỉ tốn 1 Read) để lấy Tổng Doanh Thu Tích Lũy & Tổng Xu Đã Duyệt
 */
export async function fetchFinanceStatsFromFirestore(): Promise<FinanceStats> {
  try {
    const snap = await getDoc(doc(db, 'stats', 'finance'));
    if (!snap.exists()) {
      return { totalRevenueVnd: 0, totalApprovedXu: 0 };
    }
    const data = snap.data() as Record<string, any>;
    return {
      totalRevenueVnd: Number(data.totalRevenueVnd) || 0,
      totalApprovedXu: Number(data.totalApprovedXu) || 0,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
    };
  } catch (error) {
    console.warn('Lỗi tải thống kê stats/finance:', error);
    return { totalRevenueVnd: 0, totalApprovedXu: 0 };
  }
}

/**
 * Đọc các đơn nạp đã duyệt từ 00:00:00 hôm nay theo giờ Việt Nam (tối ưu Quota, không quét lịch sử cũ)
 */
export async function fetchTodayApprovedTopUpsFromFirestore(): Promise<TopUpRequest[]> {
  try {
    const startOfDayMs = getVietnamStartOfDayMs();
    const q = query(
      collection(db, 'topup_requests'),
      where('approvedAt', '>=', startOfDayMs),
      limit(200)
    );
    const snap = await getDocs(q);
    return (snap?.docs || [])
      .map((d) => ({
        ...(d.data() as TopUpRequest),
        id: d.id,
      }))
      .filter((r) => r.status === 'approved');
  } catch (error) {
    console.warn('Lỗi tải đơn nạp đã duyệt hôm nay:', error);
    return [];
  }
}

/**
 * DUYỆT NẠP XU NGUYÊN TỬ VỚI FIRESTORE TRANSACTION:
 * QUY TẮC BẮT BUỘC CỦA FIRESTORE:
 * TẤT CẢ các lệnh ĐỌC (transaction.get) BẮT BUỘC phải thực hiện trước toàn bộ lệnh GHI.
 * (1) Đổi status lệnh nạp thành 'approved' kèm approvedAt
 * (2) Cộng số Xu tương ứng vào ví của User (users/{userId}.xuBalance)
 * (3) Ghi một document vào collection notifications của user đó báo nạp thành công
 * Nếu 1 trong 3 việc thất bại, Firebase tự động Rollback toàn bộ.
 * (4) Sau khi transaction cộng xu thành công, cập nhật stats/finance trong try/catch riêng để không ảnh hưởng tới khách.
 */
export async function approveTopUpTransactionInFirestore(requestId: string): Promise<{
  nextXu: number;
  userId: string;
  xuAmount: number;
  amountVnd: number;
  transferCode: string;
}> {
  const path = `topup_requests/${requestId}`;
  try {
    const reqRef = doc(db, 'topup_requests', requestId);

    const result = await runTransaction(db, async (transaction) => {
      // =========================================================================
      // GIAI ĐOẠN 1: TẤT CẢ LỆNH ĐỌC (READS) PHẢI CHẠY TRƯỚC HẾT
      // =========================================================================

      // 1. Đọc doc lệnh nạp tiền
      const reqSnap = await transaction.get(reqRef);
      if (!reqSnap.exists()) {
        throw new Error(`Lệnh nạp tiền mã ${requestId} không tồn tại trên hệ thống.`);
      }

      const reqData = reqSnap.data() as TopUpRequest;

      // VALIDATION CHẶT CHẼ: Chặn double-click và lệnh đã xử lý
      if (reqData.status !== 'pending') {
        throw new Error(
          `Lệnh nạp "${reqData.transferCode || requestId}" không ở trạng thái 'pending' (trạng thái hiện tại: '${reqData.status}'). Hệ thống đã tự động chặn thao tác để tránh cộng xu lặp.`
        );
      }

      const targetUserId = reqData.userId || reqData.uid;
      if (!targetUserId) {
        throw new Error(`Lệnh nạp mã ${requestId} thiếu thông tin ID người nhận (userId).`);
      }

      // 2. Đọc doc ví của user TRƯỚC KHI THỰC HIỆN BẤT KỲ LỆNH GHI NÀO
      const userRef = doc(db, 'users', targetUserId);
      const userSnap = await transaction.get(userRef);

      // Tính toán dữ liệu trong bộ nhớ (Chưa gọi bất kỳ lệnh ghi nào)
      let nextXu = reqData.xuAmount;
      let existingNotifications: UserNotification[] = [];

      if (userSnap.exists()) {
        const uData = userSnap.data() as Record<string, any>;
        nextXu = extractXuBalances(uData).xuBalance + reqData.xuAmount;
        existingNotifications = Array.isArray(uData?.notifications) ? uData.notifications : [];
      }

      // Chuẩn bị document thông báo nạp thành công (Chỉ tạo tham chiếu, chưa ghi)
      const notifCol = collection(db, 'notifications');
      const notifDocRef = doc(notifCol);
      const notifItem: UserNotification & { userId: string; topUpRequestId: string } = {
        id: notifDocRef.id,
        userId: targetUserId,
        title: `Bạn đã nạp ${formatXu(reqData.xuAmount)} Xu thành công`,
        message: `Yêu cầu nạp ${reqData.amountVnd.toLocaleString('vi-VN')}đ (+${formatXu(reqData.xuAmount)} Xu) với mã GD "${reqData.transferCode}" đã được Admin phê duyệt thành công! Số dư ví hiện tại là ${formatXu(nextXu)} Xu.`,
        type: 'topup',
        createdAt: Date.now(),
        isRead: false,
        topUpRequestId: requestId,
      };

      // =========================================================================
      // GIAI ĐOẠN 2: TẤT CẢ LỆNH GHI (WRITES) NẰM Ở NỬA DƯỚI (TUYỆT ĐỐI KHÔNG CÒN GET)
      // =========================================================================

      // (1) Đổi status lệnh nạp thành 'approved'
      transaction.update(reqRef, {
        status: 'approved',
        approvedAt: Date.now(),
      });

      // (2) Cập nhật ví User bằng increment() an toàn tuyệt đối (không ghi đè số dư tuyệt đối)
      if (userSnap.exists()) {
        transaction.update(userRef, {
          xuBalance: increment(reqData.xuAmount),
          notifications: arrayUnion(notifItem),
        });
      } else {
        transaction.set(userRef, {
          id: targetUserId,
          email: reqData.userEmail || '',
          displayName: reqData.userName || 'Độc giả',
          avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${targetUserId}`,
          role: 'reader',
          xuBalance: reqData.xuAmount,
          purchasedChapters: [],
          notifications: [notifItem],
          readingHistory: [],
          bookmarks: [],
          isLoggedIn: true,
        }, { merge: true });
      }

      // (3) Ghi document vào collection 'notifications'
      transaction.set(notifDocRef, cleanUndefinedFields(notifItem));

      return {
        nextXu,
        userId: targetUserId,
        xuAmount: reqData.xuAmount,
        amountVnd: reqData.amountVnd,
        transferCode: reqData.transferCode,
      };
    });

    // LƯU Ý AN TOÀN: Chạy trong try/catch riêng SAU KHI cộng xu cho user thành công,
    // tuyệt đối không để lỗi ghi stats/finance (nếu có) làm ảnh hưởng hay hủy bỏ việc cộng xu của khách.
    try {
      const amount = Number(result.amountVnd) || 0;
      const xu = Number(result.xuAmount) || 0;
      await setDoc(
        doc(db, 'stats', 'finance'),
        {
          totalRevenueVnd: increment(amount),
          totalApprovedXu: increment(xu),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (statsError) {
      console.warn(
        'Cảnh báo: Không thể cập nhật stats/finance (Xu đã cộng thành công cho user):',
        statsError
      );
    }

    return result;
  } catch (error) {
    console.error('Lỗi approveTopUpTransactionInFirestore:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export const approveTopUpRequest = approveTopUpTransactionInFirestore;

/**
 * TỪ CHỐI LỆNH NẠP XU VỚI TRANSACTION VÀ TẠO THÔNG BÁO CHO USER:
 * QUY TẮC BẮT BUỘC CỦA FIRESTORE:
 * TẤT CẢ các lệnh ĐỌC (transaction.get) BẮT BUỘC phải thực hiện trước toàn bộ lệnh GHI.
 * - Kiểm tra validation trạng thái: Lệnh phải đang ở 'pending'
 * - Cập nhật status thành 'rejected' kèm rejectedAt
 * - Ghi document thông báo vào collection 'notifications' báo user biết lệnh nạp bị từ chối
 */
export async function rejectTopUpTransactionInFirestore(
  requestId: string,
  reason?: string
): Promise<{
  userId: string;
  transferCode: string;
  amountVnd: number;
  xuAmount: number;
}> {
  const path = `topup_requests/${requestId}`;
  try {
    const reqRef = doc(db, 'topup_requests', requestId);

    return await runTransaction(db, async (transaction) => {
      // =========================================================================
      // GIAI ĐOẠN 1: TẤT CẢ LỆNH ĐỌC (READS) PHẢI CHẠY TRƯỚC HẾT
      // =========================================================================

      // 1. Đọc doc lệnh nạp tiền
      const reqSnap = await transaction.get(reqRef);
      if (!reqSnap.exists()) {
        throw new Error(`Lệnh nạp tiền mã ${requestId} không tồn tại trên hệ thống.`);
      }

      const reqData = reqSnap.data() as TopUpRequest;

      // VALIDATION CHẶT CHẼ: Chặn double-click hoặc lệnh đã xử lý
      if (reqData.status !== 'pending') {
        throw new Error(
          `Lệnh nạp "${reqData.transferCode || requestId}" không ở trạng thái 'pending' (trạng thái hiện tại: '${reqData.status}'). Hệ thống đã tự động chặn thao tác để tránh trùng lặp.`
        );
      }

      const targetUserId = reqData.userId || reqData.uid;

      // 2. Đọc doc user TRƯỚC KHI THỰC HIỆN BẤT KỲ LỆNH GHI NÀO
      let userRef: any = null;
      let userSnap: any = null;
      let existingNotifications: UserNotification[] = [];

      if (targetUserId) {
        userRef = doc(db, 'users', targetUserId);
        userSnap = await transaction.get(userRef); // <-- ĐỌC TẠI ĐÂY, TRƯỚC MỌI LỆNH UPDATE/SET!
        if (userSnap.exists()) {
          const uData = userSnap.data() as UserProfile;
          existingNotifications = Array.isArray(uData?.notifications) ? uData.notifications : [];
        }
      }

      // Chuẩn bị payload thông báo từ chối (trong bộ nhớ)
      const notifCol = collection(db, 'notifications');
      const notifDocRef = doc(notifCol);
      const customReason = reason?.trim() 
        ? `Lý do: ${reason.trim()}`
        : 'Vui lòng kiểm tra lại thông tin chuyển khoản ngân hàng, mã giao dịch hoặc liên hệ Ban Quản Trị Đạo Tâm để được hỗ trợ.';

      const notifItem: UserNotification & { userId: string; topUpRequestId: string } = {
        id: notifDocRef.id,
        userId: targetUserId || '',
        title: `Lệnh nạp ${formatXu(reqData.xuAmount)} Xu đã bị từ chối`,
        message: `Lệnh nạp ${reqData.amountVnd.toLocaleString('vi-VN')}đ (+${formatXu(reqData.xuAmount)} Xu) với mã GD "${reqData.transferCode}" đã bị từ chối. ${customReason}`,
        type: 'topup',
        createdAt: Date.now(),
        isRead: false,
        topUpRequestId: requestId,
      };

      // =========================================================================
      // GIAI ĐOẠN 2: TẤT CẢ LỆNH GHI (WRITES) NẰM Ở NỬA DƯỚI (TUYỆT ĐỐI KHÔNG CÒN GET)
      // =========================================================================

      // (1) Cập nhật trạng thái lệnh nạp thành 'rejected'
      transaction.update(reqRef, {
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectionReason: reason || 'Từ chối bởi Quản trị viên',
      });

      // (2) Ghi document thông báo vào collection 'notifications'
      transaction.set(notifDocRef, cleanUndefinedFields(notifItem));

      // (3) Nếu user doc tồn tại, cập nhật thêm vào notifications array của user doc
      if (userRef && userSnap && userSnap.exists()) {
        transaction.update(userRef, {
          notifications: [notifItem, ...existingNotifications],
        });
      }

      return {
        userId: targetUserId || '',
        transferCode: reqData.transferCode,
        amountVnd: reqData.amountVnd,
        xuAmount: reqData.xuAmount,
      };
    });
  } catch (error) {
    console.error('Lỗi rejectTopUpTransactionInFirestore:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Độc giả gửi hoặc cập nhật ảnh bill chuyển khoản ngân hàng cho đơn nạp tiền
 */
export async function updateTopUpBillImageInFirestore(
  requestId: string,
  billImageUrl: string
): Promise<void> {
  const path = `topup_requests/${requestId}`;
  try {
    const reqRef = doc(db, 'topup_requests', requestId);
    await updateDoc(reqRef, {
      billImageUrl,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* ==========================================================================
   FIRESTORE REALTIME SERVICES: BẢN THẢO TRUYỆN (NOVEL SUBMISSIONS)
   ========================================================================== */

/**
 * Gửi bản thảo truyện lên collection "novel_submissions"
/**
 * Gửi bản thảo truyện lên collection "novel_submissions"
 * Đảm bảo:
 * 1. Root document chỉ lưu METADATA cơ bản (tiêu đề, tác giả, văn án, thông tin STK, v.v.)
 * 2. Nội dung text của 5 chương được lưu vào subcollection /novel_submissions/{id}/chapters/{num}
 *    giúp bảo toàn Quota Spark (không kéo text chương khi onSnapshot)
 * 3. BẮT BUỘC có status: 'pending' và submittedAt: Date.now()
 * 4. Ném lỗi nếu Firebase thất bại (không nuốt lỗi để Form xử lý chuẩn)
 */
export async function submitNovelSubmissionToFirestore(
  submissionData: Omit<NovelSubmission, 'id'>
): Promise<NovelSubmission> {
  const path = 'novel_submissions';
  try {
    const newDocRef = doc(collection(db, path));
    const draftChapters = filterOutDummyChapters(submissionData.chapters || []) || [];

    // Metadata rút gọn của các chương để lưu trong root document
    const chaptersMeta = (draftChapters || []).map((ch) => ({
      number: Number(ch.number),
      title: ch.title || `Chương ${ch.number}`,
      wordCount: ch.wordCount || (ch.content ? (ch.content.split(/\s+/).filter(Boolean)?.length || 0) : 0),
    }));

    const newSub: NovelSubmission = {
      ...submissionData,
      id: newDocRef.id,
      status: 'pending',
      submittedAt: Date.now(),
      chapters: chaptersMeta as any,
    };
    const cleaned = cleanUndefinedFields(newSub);

    // Gom thao tác ghi root doc và ghi các chương vào WriteBatch
    const batch = writeBatch(db);
    batch.set(newDocRef, cleaned);

    if ((draftChapters?.length || 0) > 0 && (draftChapters?.length || 0) <= 400) {
      draftChapters.forEach((ch) => {
        const chDocRef = doc(db, 'novel_submissions', newDocRef.id, 'chapters', String(ch.number));
        batch.set(chDocRef, cleanUndefinedFields({
          number: Number(ch.number),
          title: ch.title || `Chương ${ch.number}`,
          content: typeof ch.content === 'string' ? ch.content : '',
          wordCount: ch.wordCount || (ch.content ? (ch.content.split(/\s+/).filter(Boolean)?.length || 0) : 0),
          updatedAt: Date.now(),
        }), { merge: true });
      });
    }

    await withTimeout(batch.commit(), 15000, 'Ghi đơn nộp bản thảo và các chương');
    return newSub;
  } catch (error) {
    console.error('Lỗi lưu novel_submissions vào Firestore:', error);
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Tải danh sách bản thảo:
 * - Admin: Tải toàn bộ
 * - Author: Chỉ tải bản thảo của chính mình (filterAuthorId)
 */
export async function fetchNovelSubmissionsFromFirestore(filterAuthorId?: string): Promise<NovelSubmission[]> {
  const path = 'novel_submissions';
  try {
    const colRef = collection(db, path);
    const q = filterAuthorId
      ? query(colRef, where('submittedBy.userId', '==', filterAuthorId))
      : query(colRef, orderBy('submittedAt', 'desc'));

    const snap = await getDocs(q);
    const list: NovelSubmission[] = (snap?.docs || []).map((d) => {
      const data = d.data() as NovelSubmission;
      return {
        ...data,
        id: d.id,
        categories: Array.isArray((data as any).categories) ? (data as any).categories : [],
        chapters: Array.isArray(data.chapters) ? data.chapters : [],
      };
    });

    if (filterAuthorId) {
      list.sort((a, b) => b.submittedAt - a.submittedAt);
    }
    return list;
  } catch (error) {
    console.warn('Lỗi tải novel_submissions:', error);
    return [];
  }
}

/**
 * Tải 1 lần (getDocs) danh sách truyện chờ duyệt dành riêng cho Admin
 * Thay thế onSnapshot để tối ưu Quota Spark, có try/catch chống trắng trang
 */
export async function fetchPendingNovelSubmissionsFromFirestore(
  userEmail: string | undefined | null
): Promise<NovelSubmission[]> {
  if (!checkIsAdmin(userEmail)) {
    throw new Error('Tài khoản không có quyền Quản trị viên (Chỉ chấp nhận hoaamcac@gmail.com và meoyeutien22@gmail.com).');
  }

  const path = 'novel_submissions';
  try {
    const colRef = collection(db, path);
    let snapshot;
    try {
      const q = query(
        colRef,
        where('status', '==', 'pending'),
        orderBy('submittedAt', 'desc'),
        limit(50)
      );
      snapshot = await getDocs(q);
    } catch {
      const fallbackQ = query(
        colRef,
        where('status', '==', 'pending'),
        limit(50)
      );
      snapshot = await getDocs(fallbackQ);
    }

    const list: NovelSubmission[] = (snapshot?.docs || []).map((d) => {
      const data = d.data() as NovelSubmission;
      return {
        ...data,
        id: d.id,
        categories: Array.isArray((data as any).categories) ? (data as any).categories : [],
        chapters: Array.isArray(data.chapters) ? data.chapters : [],
      };
    });
    list.sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0));
    return list;
  } catch (err: any) {
    console.warn('Lỗi tải danh sách novel_submissions chờ duyệt:', err);
    throw new Error(err?.message || 'Không thể tải danh sách truyện chờ duyệt từ hệ thống.');
  }
}

/**
 * Tải chi tiết nội dung các chương bản thảo khi Admin mở xem thử (On-demand preview)
 * Giúp tiết kiệm reads cho danh sách tổng quan
 */
export async function fetchSubmissionChaptersFromFirestore(submissionId: string): Promise<SubmissionChapterDraft[]> {
  try {
    const snap = await getDocs(collection(db, 'novel_submissions', submissionId, 'chapters'));
    if (snap.empty) return [];
    const chaps = (snap?.docs || []).map((d) => d.data() as SubmissionChapterDraft);
    return chaps.sort((a, b) => Number(a.number) - Number(b.number));
  } catch (e) {
    console.warn('Lỗi tải chương bản thảo:', e);
    return [];
  }
}

/**
 * Xóa hoàn toàn bản thảo khỏi Firestore (Chỉ Admin)
 */
export async function deleteNovelSubmissionFromFirestore(submissionId: string): Promise<void> {
  const path = `novel_submissions/${submissionId}`;
  try {
    await deleteDoc(doc(db, 'novel_submissions', submissionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Cập nhật trạng thái duyệt bản thảo truyện (Chỉ Admin: approved / rejected / hidden)
 */
export async function updateNovelSubmissionStatusInFirestore(
  submissionId: string,
  status: 'approved' | 'rejected' | 'hidden',
  rejectionReason?: string
): Promise<void> {
  const path = `novel_submissions/${submissionId}`;
  try {
    const subRef = doc(db, 'novel_submissions', submissionId);
    await updateDoc(subRef, {
      status,
      rejectionReason: rejectionReason || '',
      reviewedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Nâng cấp quyền Tác giả cho độc giả và gửi thông báo trực tiếp vào tài khoản Firestore khi Admin duyệt bản thảo
 */
export async function upgradeAuthorAndSendNotification(
  userId: string,
  userEmail: string,
  novelTitle: string,
  novelId: string,
  bankInfo?: any
): Promise<void> {
  const notifPayload: UserNotification = {
    id: `approved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: '🎉 Bản thảo truyện đã được Admin phê duyệt',
    message: `Chúc mừng bạn! Bản thảo tác phẩm "${novelTitle}" đã được Admin phê duyệt và xuất bản chính thức trên Đạo Tâm! Tài khoản của bạn đã được nâng cấp quyền Tác Giả / Editor.`,
    type: 'novel_approved',
    createdAt: Date.now(),
    isRead: false,
    novelId,
  };

  const targetDocRefs = new Map<string, any>();

  // 1. Thử tìm tài khoản theo userId
  if (userId && userId !== 'guest') {
    targetDocRefs.set(userId, doc(db, 'users', userId));
  }

  // 2. Tìm tất cả tài khoản theo email
  if (userEmail) {
    const cleanEmail = userEmail.toLowerCase().trim();
    try {
      const usersCol = collection(db, 'users');
      const q = query(usersCol, where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        targetDocRefs.set(d.id, doc(db, 'users', d.id));
      }
    } catch (e) {
      console.warn('Lỗi tìm kiếm user theo email:', e);
    }

    // 3. Fallback uid dạng usr-email
    const fallbackId = `usr-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    targetDocRefs.set(fallbackId, doc(db, 'users', fallbackId));
  }

  // Áp dụng nâng cấp quyền tác giả và thêm thông báo cho tất cả user docs tìm được
  for (const [id, userDocRef] of targetDocRefs.entries()) {
    try {
      const snap = await getDoc(userDocRef);
      const existingData = (snap.exists() ? snap.data() : {}) as Record<string, any>;
      const existingNotifs = Array.isArray(existingData?.notifications) ? existingData.notifications : [];
      const isEmailAdmin = checkIsAdmin(existingData?.email || userEmail);
      const newRole = isEmailAdmin ? 'admin' : 'author';

      const alreadyHasNotif = existingNotifs.some((n: any) => n.id === notifPayload.id || n.novelId === novelId);
      const updatedNotifs = alreadyHasNotif ? existingNotifs : [notifPayload, ...existingNotifs];

      const updatePayload: Record<string, any> = {
        role: newRole,
        isApprovedAuthor: true,
        creatorApproved: true,
        notifications: updatedNotifs,
      };

      if (bankInfo && (!existingData?.bankInfo?.accountNumber || !existingData?.bankInfo?.bankName)) {
        updatePayload.bankInfo = bankInfo;
      }

      await setDoc(userDocRef, updatePayload, { merge: true });
    } catch (err) {
      console.error(`Lỗi cập nhật user doc ${id}:`, err);
    }
  }

  // Tự động duyệt đơn creator_applications tương ứng nếu có
  try {
    const appsCol = collection(db, 'creator_applications');
    const q1 = userId ? query(appsCol, where('userId', '==', userId)) : null;
    if (q1) {
      const snap1 = await getDocs(q1);
      for (const d of snap1.docs) {
        if (d.data().status === 'pending') {
          await updateDoc(doc(db, 'creator_applications', d.id), { status: 'approved' }).catch(() => {});
        }
      }
    }
  } catch {}
}

/**
 * Gửi thông báo từ chối bản thảo vào tài khoản người nộp
 */
export async function rejectNovelSubmissionAndNotify(
  submissionId: string,
  userId: string,
  userEmail: string,
  novelTitle: string,
  reason?: string
): Promise<void> {
  await updateNovelSubmissionStatusInFirestore(submissionId, 'rejected', reason);

  const notifPayload: UserNotification = {
    id: `rejected-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'Thông báo xét duyệt truyện',
    message: `Truyện của bạn đã bị từ chối với lý do: ${reason || 'Chưa đạt tiêu chuẩn kiểm duyệt nội dung của Đạo Tâm'}`,
    type: 'system',
    createdAt: Date.now(),
    isRead: false,
  };

  let targetUserDocRef = userId && userId !== 'guest' ? doc(db, 'users', userId) : null;
  let userSnap = targetUserDocRef ? await getDoc(targetUserDocRef).catch(() => null) : null;

  if ((!userSnap || !userSnap.exists()) && userEmail) {
    try {
      const usersCol = collection(db, 'users');
      const q = query(usersCol, where('email', '==', userEmail.toLowerCase().trim()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        targetUserDocRef = doc(db, 'users', snap.docs[0].id);
        userSnap = snap.docs[0];
      }
    } catch {}
  }

  if (targetUserDocRef) {
    const existingData = userSnap && userSnap.exists() ? userSnap.data() : {};
    const existingNotifs = Array.isArray(existingData?.notifications) ? existingData.notifications : [];
    await setDoc(targetUserDocRef, {
      notifications: [notifPayload, ...existingNotifs],
    }, { merge: true }).catch(() => {});
  }
}

/* ==========================================================================
   FIRESTORE REALTIME SERVICES: ĐƠN XIN LÀM TÁC GIẢ / EDITOR (CREATOR APPLICATIONS)
   ========================================================================== */

/**
 * Gửi đơn xin làm Editor / Tác giả lên collection "creator_applications"
 */
export async function submitApplicationToFirestore(
  applicationData: Omit<CreatorApplication, 'id' | 'submittedAt' | 'status'>
): Promise<CreatorApplication> {
  const path = 'creator_applications';
  try {
    const newDocRef = doc(collection(db, path));
    const newApp: CreatorApplication = {
      ...applicationData,
      id: newDocRef.id,
      submittedAt: Date.now(),
      status: 'pending',
    };
    const cleaned = cleanUndefinedFields(newApp);
    await setDoc(newDocRef, cleaned);
    return newApp;
  } catch (error) {
    console.warn('Lỗi lưu creator_applications vào Firestore:', error);
    return {
      ...applicationData,
      id: `app-${Date.now()}`,
      submittedAt: Date.now(),
      status: 'pending',
    };
  }
}

/**
 * Tải danh sách đơn đăng ký Editor / Tác giả:
 * - Admin: Toàn bộ
 * - Reader/Author: Chỉ đơn của chính mình
 */
export async function fetchCreatorApplicationsFromFirestore(filterUserId?: string): Promise<CreatorApplication[]> {
  const path = 'creator_applications';
  try {
    const colRef = collection(db, path);
    const q = filterUserId
      ? query(colRef, where('userId', '==', filterUserId))
      : query(colRef, orderBy('submittedAt', 'desc'));

    const snap = await getDocs(q);
    const list: CreatorApplication[] = (snap?.docs || []).map((d) => ({
      ...(d.data() as CreatorApplication),
      id: d.id,
    }));

    if (filterUserId) {
      list.sort((a, b) => b.submittedAt - a.submittedAt);
    }
    return list;
  } catch (error) {
    console.warn('Lỗi tải creator_applications:', error);
    return [];
  }
}

/**
 * Duyệt hoặc từ chối đơn đăng ký làm Tác giả / Editor (Chỉ Admin)
 */
export async function updateCreatorApplicationStatusInFirestore(
  applicationId: string,
  status: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<void> {
  const path = `creator_applications/${applicationId}`;
  try {
    const appRef = doc(db, 'creator_applications', applicationId);
    await updateDoc(appRef, {
      status,
      approvedAt: status === 'approved' ? Date.now() : undefined,
      rejectionReason: rejectionReason || '',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* ==========================================================================
   FIRESTORE REALTIME SERVICES: YÊU CẦU RÚT TIỀN NHUẬN BÚT (WITHDRAWAL REQUESTS)
   ========================================================================== */

/**
 * Gửi yêu cầu rút tiền nhuận bút lên collection "withdrawal_requests"
 */
export async function createWithdrawalRequestInFirestore(
  requestData: Omit<WithdrawalRequest, 'id' | 'createdAt' | 'status'>
): Promise<WithdrawalRequest> {
  const path = 'withdrawal_requests';
  try {
    const newDocRef = doc(collection(db, path));
    const randomCode = requestData.code || `WR${Math.floor(10000000 + Math.random() * 90000000)}`;
    const newReq: WithdrawalRequest = {
      ...requestData,
      id: newDocRef.id,
      code: randomCode,
      createdAt: Date.now(),
      status: 'pending',
    };
    await setDoc(newDocRef, newReq);
    return newReq;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}



/**
 * Tải danh sách yêu cầu rút tiền:
 * - Admin: Toàn bộ
 * - Author: Chỉ các yêu cầu của tác giả đó (filterAuthorId)
 */
export async function fetchWithdrawalRequestsFromFirestore(filterAuthorId?: string): Promise<WithdrawalRequest[]> {
  const path = 'withdrawal_requests';
  try {
    const colRef = collection(db, path);
    const q = filterAuthorId
      ? query(colRef, where('authorId', '==', filterAuthorId))
      : query(colRef, orderBy('createdAt', 'desc'));

    const snap = await getDocs(q);
    const list: WithdrawalRequest[] = (snap?.docs || []).map((d) => ({
      ...(d.data() as WithdrawalRequest),
      id: d.id,
    }));

    if (filterAuthorId) {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  } catch (error) {
    console.warn('Lỗi tải withdrawal_requests:', error);
    return [];
  }
}

/**
 * Gửi thông báo đến toàn bộ Admin khi có độc giả / tác giả yêu cầu rút tiền mới
 */
export async function notifyAdminsOfWithdrawalRequest(req: WithdrawalRequest): Promise<void> {
  const adminNotif: UserNotification = {
    id: `admin-withdraw-notice-${req.id}-${Date.now()}`,
    title: `🔔 Yêu Cầu Rút Xu Mới Cần Duyệt`,
    message: `Tài khoản ${req.authorName} (${req.authorEmail || 'Chưa có email'}) vừa gửi yêu cầu rút ${req.amountXu.toLocaleString('vi-VN')} Xu (${req.amountVnd.toLocaleString('vi-VN')} VNĐ) về ngân hàng ${req.bankName} - STK: ${req.accountNumber} (${req.accountHolder}). Mã đơn: ${req.code || req.id}.`,
    type: 'payout',
    createdAt: Date.now(),
    isRead: false,
  };

  const adminTargetEmails = ['hoaamcac@gmail.com', 'meoyeutien22@gmail.com'];
  for (const email of adminTargetEmails) {
    try {
      const safeId = `usr-${email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`;
      const userRef = doc(db, 'users', safeId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const cur = snap.data() || {};
        const existing = Array.isArray(cur.notifications) ? cur.notifications : [];
        await updateDoc(userRef, {
          notifications: [adminNotif, ...existing.filter((n: any) => n.id !== adminNotif.id)],
        });
      } else {
        const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
        const snapDocs = await getDocs(q);
        if (!snapDocs.empty) {
          for (const d of snapDocs.docs) {
            const cur = d.data() || {};
            const existing = Array.isArray(cur.notifications) ? cur.notifications : [];
            await updateDoc(d.ref, {
              notifications: [adminNotif, ...existing.filter((n: any) => n.id !== adminNotif.id)],
            });
          }
        }
      }
    } catch (e) {
      console.warn('Lỗi ghi thông báo rút xu tới Admin:', email, e);
    }
  }
}

/**
 * Duyệt hoặc từ chối yêu cầu rút tiền nhuận bút (Chỉ Admin)
 */
export async function updateWithdrawalRequestStatusInFirestore(
  requestId: string,
  status: 'approved' | 'rejected',
  reason?: string
): Promise<void> {
  const path = `withdrawal_requests/${requestId}`;
  try {
    const reqRef = doc(db, 'withdrawal_requests', requestId);
    await setDoc(reqRef, {
      status,
      approvedAt: status === 'approved' ? Date.now() : undefined,
      rejectionReason: reason || '',
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Admin xác nhận đã chuyển tiền và duyệt yêu cầu rút xu:
 * Cập nhật Firestore và tự động gửi thông báo rút xu thành công tới tài khoản tác giả
 */
export async function approveWithdrawalAndNotifyAuthor(
  requestId: string,
  req: WithdrawalRequest
): Promise<UserNotification> {
  const path = `withdrawal_requests/${requestId}`;
  try {
    const reqRef = doc(db, 'withdrawal_requests', requestId);
    await setDoc(reqRef, {
      status: 'approved',
      approvedAt: Date.now(),
    }, { merge: true });

    const notifPayload: UserNotification = {
      id: `payout-approved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Yêu cầu rút xu của ${req.authorName} đã được duyệt.`,
      message: `Yêu cầu rút xu của ${req.authorName} (Mã đơn: ${req.code || req.id}, ${req.amountXu.toLocaleString('vi-VN')} xu - ${req.amountVnd.toLocaleString('vi-VN')} VNĐ) đã được admin duyệt và hoàn tất chuyển tiền về ngân hàng ${req.bankName} (STK: ${req.accountNumber}).`,
      type: 'withdrawal_approved',
      createdAt: Date.now(),
      isRead: false,
    };

    // Tìm và cập nhật thông báo trực tiếp vào hồ sơ tác giả trên Firestore
    const candidateIds: string[] = [];
    if (req.authorId && req.authorId !== 'guest') candidateIds.push(req.authorId);
    if (req.authorEmail) {
      candidateIds.push(`usr-${req.authorEmail.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`);
    }

    let notified = false;
    for (const uId of candidateIds) {
      try {
        const uRef = doc(db, 'users', uId);
        const snap = await getDoc(uRef);
        if (snap.exists()) {
          const authorData = snap.data() || {};
          const currentNotifs = Array.isArray(authorData.notifications) ? authorData.notifications : [];
          await setDoc(uRef, {
            notifications: [notifPayload, ...currentNotifs.filter((n: any) => n.id !== notifPayload.id)],
          }, { merge: true });
          notified = true;
          break;
        }
      } catch (err) {
        console.warn('Lỗi cập nhật notif vào candidate user id:', uId, err);
      }
    }

    if (!notified && req.authorEmail) {
      try {
        const q = query(collection(db, 'users'), where('email', '==', req.authorEmail.toLowerCase().trim()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          for (const d of snap.docs) {
            const authorData = d.data() || {};
            const currentNotifs = Array.isArray(authorData.notifications) ? authorData.notifications : [];
            await setDoc(d.ref, {
              notifications: [notifPayload, ...currentNotifs.filter((n: any) => n.id !== notifPayload.id)],
            }, { merge: true });
            notified = true;
          }
        }
      } catch (err) {
        console.warn('Lỗi query user theo email:', err);
      }
    }

    // Nếu tác giả chưa có document trên Firestore, tự động khởi tạo document kèm thông báo
    if (!notified && req.authorEmail) {
      try {
        const fallbackId = req.authorId && req.authorId !== 'guest' 
          ? req.authorId 
          : `usr-${req.authorEmail.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`;
        const uRef = doc(db, 'users', fallbackId);
        await setDoc(uRef, {
          id: fallbackId,
          email: req.authorEmail,
          displayName: req.authorName,
          notifications: [notifPayload],
        }, { merge: true });
      } catch (e) {
        console.warn('Lỗi fallback setDoc author:', e);
      }
    }

    return notifPayload;
  } catch (error) {
    console.error('Lỗi approveWithdrawalAndNotifyAuthor:', error);
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

/* ==========================================================================
   FIRESTORE REALTIME SERVICES: BÁO CÁO VI PHẠM (NOVEL REPORTS)
   ========================================================================== */

/**
 * Gửi báo cáo vi phạm tác phẩm lên collection "novel_reports"
 */
export async function submitNovelReportToFirestore(
  reportData: Omit<NovelReport, 'id' | 'createdAt' | 'status'>
): Promise<NovelReport> {
  const path = 'novel_reports';
  try {
    const newDocRef = doc(collection(db, path));
    const newReport: NovelReport = {
      ...reportData,
      id: newDocRef.id,
      createdAt: Date.now(),
      status: 'pending',
    };
    await setDoc(newDocRef, newReport);
    return newReport;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Tải danh sách báo cáo vi phạm (Chỉ dành cho Admin)
 */
export async function fetchNovelReportsFromFirestore(): Promise<NovelReport[]> {
  const path = 'novel_reports';
  try {
    const colRef = collection(db, path);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return (snap?.docs || []).map((d) => ({
      ...(d.data() as NovelReport),
      id: d.id,
    }));
  } catch (error) {
    console.warn('Lỗi tải novel_reports:', error);
    return [];
  }
}

/**
 * Cập nhật trạng thái báo cáo vi phạm (Chỉ Admin)
 */
export async function updateNovelReportStatusInFirestore(
  reportId: string,
  status: 'resolved' | 'dismissed',
  actionTaken?: string
): Promise<void> {
  const path = `novel_reports/${reportId}`;
  try {
    const repRef = doc(db, 'novel_reports', reportId);
    await updateDoc(repRef, {
      status,
      adminNotes: actionTaken || '',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* ==========================================================================
   FIRESTORE DYNAMIC CATEGORIES & STORIES (FETCH THỰC TẾ TỪ DATABASE)
   ========================================================================== */

export interface DbCategory {
  id: string;
  name: string;
  description?: string;
}

/**
 * Tải danh mục thể loại truyện trực tiếp từ collection "categories" trên Firestore.
 * Bọc trong try/catch và in console.error để debug.
 */
export async function fetchCategoriesFromFirestore(): Promise<DbCategory[]> {
  const path = 'categories';
  try {
    const colRef = collection(db, path);
    const snap = await getDocs(colRef);

    if (snap.empty) {
      // Khởi tạo các thể loại mẫu phổ biến vào Firestore nếu database rỗng
      const defaultCategories: DbCategory[] = [
        { id: 'tien-hiep', name: 'Tiên Hiệp', description: 'Tu chân luyện khí, trúc cơ, phi thăng tiên giới' },
        { id: 'dam-my', name: 'Đam Mỹ', description: 'Tình cảm nam x nam đặc sắc, sủng ngọt ngào' },
        { id: 'ngon-tinh', name: 'Ngôn Tình', description: 'Tình yêu đôi lứa lãng mạn, thanh xuân ngọt ngào' },
        { id: 'huyen-huyen', name: 'Huyền Huyễn', description: 'Thế giới huyền bí kỳ ảo, pháp thuật thần thông' },
        { id: 'do-thi', name: 'Đô Thị', description: 'Bối cảnh hiện đại, thương trường, tài phiệt' },
        { id: 'co-dai', name: 'Cổ Đại', description: 'Phong kiến cung đình, giang hồ nghĩa hiệp' },
        { id: 'mat-the', name: 'Mạt Thế', description: 'Sinh tồn khắc nghiệt trong thế giới suy tàn' },
        { id: 'xuyen-khong', name: 'Xuyên Không', description: 'Xuyên qua không gian và thời gian khác' },
        { id: 'trong-sinh', name: 'Trọng Sinh', description: 'Sống lại kiếp trước để làm lại cuộc đời' },
        { id: 'he-thong', name: 'Hệ Thống', description: 'Sở hữu hệ thống hỗ trợ thăng cấp sức mạnh' },
        { id: 'dien-van', name: 'Điền Văn', description: 'Làm nông, bình yên, cuộc sống điền trang' },
        { id: 'kinh-di', name: 'Kinh Dị', description: 'Rùng rợn, giật gân, tâm linh huyền bí' },
      ];

      return defaultCategories;
    }

    const categories: DbCategory[] = (snap?.docs || []).map((d) => ({
      ...(d.data() as DbCategory),
      id: d.id,
    }));
    return categories;
  } catch (error) {
    console.warn('Thông báo fetchCategoriesFromFirestore: sử dụng danh mục thể loại chuẩn hệ thống:', error);
    // Trả về danh mục mặc định an toàn để ứng dụng luôn hoạt động mượt mà
    return [
      { id: 'tien-hiep', name: 'Tiên Hiệp', description: 'Tu chân luyện khí, trúc cơ, phi thăng tiên giới' },
      { id: 'dam-my', name: 'Đam Mỹ', description: 'Tình cảm nam x nam đặc sắc, sủng ngọt ngào' },
      { id: 'ngon-tinh', name: 'Ngôn Tình', description: 'Tình yêu đôi lứa lãng mạn, thanh xuân ngọt ngào' },
      { id: 'huyen-huyen', name: 'Huyền Huyễn', description: 'Thế giới huyền bí kỳ ảo, pháp thuật thần thông' },
      { id: 'do-thi', name: 'Đô Thị', description: 'Bối cảnh hiện đại, thương trường, tài phiệt' },
      { id: 'co-dai', name: 'Cổ Đại', description: 'Phong kiến cung đình, giang hồ nghĩa hiệp' },
      { id: 'mat-the', name: 'Mạt Thế', description: 'Sinh tồn khắc nghiệt trong thế giới suy tàn' },
      { id: 'xuyen-khong', name: 'Xuyên Không', description: 'Xuyên qua không gian và thời gian khác' },
      { id: 'trong-sinh', name: 'Trọng Sinh', description: 'Sống lại kiếp trước để làm lại cuộc đời' },
      { id: 'he-thong', name: 'Hệ Thống', description: 'Sở hữu hệ thống hỗ trợ thăng cấp sức mạnh' },
      { id: 'dien-van', name: 'Điền Văn', description: 'Làm nông, bình yên, cuộc sống điền trang' },
      { id: 'kinh-di', name: 'Kinh Dị', description: 'Rùng rợn, giật gân, tâm linh huyền bí' },
    ];
  }
}

/**
 * Tải danh sách truyện từ cả 2 collection "stories" và "novels" trên Firestore.
 * Bọc trong try/catch và in console.error để debug.
 */
export async function fetchStoriesFromFirestore(): Promise<Novel[]> {
  const novelMap = new Map<string, Novel>();

  try {
    // 1. Lấy từ collection "novels"
    const novelsList = await fetchNovelsFromFirestore();
    for (const n of novelsList) {
      novelMap.set(n.id, n);
    }
  } catch (err) {
    console.warn('Lỗi đọc collection "novels":', err);
  }

  try {
    // 2. Lấy từ collection "stories"
    const storiesCol = collection(db, 'stories');
    const snap = await getDocs(storiesCol);

    if (!snap.empty) {
      for (const d of snap?.docs || []) {
        const data = (d.data() || {}) as Novel;
        const existing = novelMap.get(d.id);
        const rawChaps = (Array.isArray(data.chapters) && (data.chapters?.length || 0) > 0)
          ? data.chapters
          : (Array.isArray(existing?.chapters) && (existing?.chapters?.length || 0) > 0 ? existing!.chapters : []);
        const resolvedChapters = filterOutDummyChapters(rawChaps) || [];

        const maxNum = resolvedChapters.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
        const resolvedTotal = Math.max(
          data.totalChapters || 0,
          existing?.totalChapters || 0,
          resolvedChapters?.length || 0,
          maxNum,
          (data as any).latestChapterNumber || 0
        );
        const resolvedCategories = Array.isArray(data.categories)
          ? data.categories
          : Array.isArray((data as any).genres)
          ? (data as any).genres
          : Array.isArray(existing?.categories)
          ? existing!.categories
          : [];

        const resolvedCreatedAt = resolveTimestampMs((data as any).createdAt) || existing?.createdAt || 0;
        const resolvedUpdatedAt = resolveTimestampMs(data.updatedAt) || resolvedCreatedAt || existing?.updatedAt || 0;
        const resolvedLastChapterUpdatedAt = resolveTimestampMs((data as any).lastChapterUpdatedAt) || resolvedUpdatedAt || existing?.lastChapterUpdatedAt || 0;

        novelMap.set(d.id, {
          ...data,
          id: d.id,
          categories: resolvedCategories,
          genres: Array.isArray((data as any).genres) ? (data as any).genres : resolvedCategories,
          status: data.status || existing?.status || 'Đang ra',
          createdAt: resolvedCreatedAt,
          updatedAt: resolvedUpdatedAt,
          lastChapterUpdatedAt: resolvedLastChapterUpdatedAt,
          chapters: resolvedChapters,
          totalChapters: resolvedTotal,
        } as Novel);
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc collection "stories":', err);
  }

  return Array.from(novelMap.values()).sort((a, b) => {
    const timeB = b.updatedAt || b.createdAt || b.lastChapterUpdatedAt || 0;
    const timeA = a.updatedAt || a.createdAt || a.lastChapterUpdatedAt || 0;
    return timeB - timeA;
  });
}

function resolveTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Realtime listener lắng nghe biến động trên ĐÚNG 1 User Document (users/{userId}).
 * Khi Admin phê duyệt Xu hoặc gửi thông báo, listener này sẽ cập nhật ngay lập tức số dư Xu vào state của độc giả.
 */
export function listenToUserProfile(
  userId: string,
  onUpdate: (user: UserProfile) => void,
  onError?: (error: Error) => void
): () => void {
  if (!userId || userId === 'guest') {
    return () => {};
  }
  try {
    const userRef = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = (snap.data() || {}) as Record<string, any>;
        const balances = extractXuBalances(data);
        const isBanned = Boolean(
          data.isBanned === true ||
          data.isLocked === true ||
          data.status === 'banned' ||
          data.status === 'Bị khóa'
        );
        onUpdate({
          ...(data as UserProfile),
          id: snap.id,
          isLoggedIn: true,
          isBanned,
          isLocked: isBanned,
          xuBalance: balances.xuBalance,
          authorEarnedXu: balances.authorEarnedXu,
          flowerBalance: balances.flowerBalance,
          followers: Array.isArray(data.followers) ? data.followers : [],
          followingCreators: Array.isArray(data.followingCreators) ? data.followingCreators : [],
          notifications: Array.isArray(data.notifications) ? data.notifications : [],
          readingHistory: Array.isArray(data.readingHistory) ? data.readingHistory : [],
          bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
          purchasedChapters: extractPurchasedChaptersList(data),
          unlockedChapters: extractPurchasedChaptersMap(data),
          unlockedFullBooks: Array.isArray(data.unlockedFullBooks) ? data.unlockedFullBooks : [],
          purchases: Array.isArray(data.purchases) ? data.purchases : [],
        });
      },
      (error) => {
        console.warn('Lỗi onSnapshot profile user:', error);
        if (onError) onError(error);
      }
    );
    return unsubscribe;
  } catch (err: any) {
    console.warn('Lỗi khởi tạo listener profile user:', err);
    return () => {};
  }
}

/**
 * Cộng xu cho độc giả khi Admin phê duyệt nạp bằng runTransaction + increment() và gửi thông báo
 */
export async function creditUserXuAndNotify(
  userId: string, 
  xuAmount: number, 
  amountVnd: number
): Promise<number> {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    const newNotification = {
      id: `topup-approved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Bạn đã nạp ${xuAmount} xu thành công`,
      message: `Giao dịch nạp ${amountVnd.toLocaleString('vi-VN')}đ đã được Admin phê duyệt thành công! Bạn nhận được +${xuAmount} Xu vào tài khoản.`,
      type: 'topup',
      createdAt: Date.now(),
      isRead: false,
    };

    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists()) {
        throw new Error('Không tìm thấy tài khoản người dùng trên hệ thống.');
      }

      const currentData = snap.data() as Record<string, any>;
      const nextXu = extractXuBalances(currentData).xuBalance + xuAmount;

      transaction.update(userRef, {
        xuBalance: increment(xuAmount),
        notifications: arrayUnion(newNotification),
      });

      return nextXu;
    });
  } catch (error) {
    console.error('Lỗi creditUserXuAndNotify:', error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Gửi thông báo đến tất cả độc giả đang theo dõi người sáng tác / nhà đăng truyện khi có truyện mới được xuất bản
 */
export async function notifyFollowersOfNewNovel(
  creatorNameOrId: string,
  novelTitle: string,
  novelId: string,
  options?: {
    creatorId?: string;
    creatorEmail?: string;
    editorName?: string;
    submittedByUserName?: string;
    displayLabel?: string;
  }
): Promise<number> {
  try {
    const usersCol = collection(db, 'users');
    const snap = await getDocs(usersCol);
    const allDocs = snap?.docs || [];

    const normalizeKey = (val?: string | null) => (val || '').trim().toLowerCase();
    const stripCreatorPrefix = (val: string) =>
      val.startsWith('creator-') ? val.slice('creator-'.length).trim() : val;

    const candidateNames = new Set<string>();
    const addCandidateName = (val?: string | null) => {
      const clean = normalizeKey(val);
      if (!clean || clean === 'khách độc truyện') return;
      candidateNames.add(clean);
      candidateNames.add(`creator-${clean}`);
    };

    addCandidateName(creatorNameOrId);
    addCandidateName(options?.editorName);
    addCandidateName(options?.submittedByUserName);
    addCandidateName(options?.displayLabel);

    const candidateIds = new Set<string>();
    const addCandidateId = (val?: string | null) => {
      const clean = (val || '').trim();
      if (!clean || clean === 'guest' || clean === 'creator' || clean === 'usr-guest') return;
      candidateIds.add(clean);
      candidateIds.add(clean.toLowerCase());
    };

    addCandidateId(options?.creatorId);
    if (creatorNameOrId && !creatorNameOrId.includes(' ')) {
      addCandidateId(creatorNameOrId);
    }

    const cleanCreatorEmail = normalizeKey(options?.creatorEmail);
    const creatorFollowerIds = new Set<string>();
    const creatorOwnDocIds = new Set<string>();

    // Bước 1: Quét tìm document tài khoản của tác giả/nhà đăng truyện để lấy đủ ID, UID, displayName và mảng followers
    for (const d of allDocs) {
      const u = (d.data() || {}) as Record<string, any>;
      const docUid = String(u.uid || '').trim();
      const docEmail = normalizeKey(u.email);
      const docDisplayName = normalizeKey(u.displayName);

      const matchesCreatorDoc =
        candidateIds.has(d.id) ||
        candidateIds.has(d.id.toLowerCase()) ||
        (docUid && (candidateIds.has(docUid) || candidateIds.has(docUid.toLowerCase()))) ||
        (cleanCreatorEmail && docEmail === cleanCreatorEmail) ||
        (docDisplayName && candidateNames.has(docDisplayName));

      if (matchesCreatorDoc) {
        creatorOwnDocIds.add(d.id);
        if (docUid) creatorOwnDocIds.add(docUid);
        addCandidateId(d.id);
        addCandidateId(docUid);
        addCandidateName(u.displayName);
        if (Array.isArray(u.followers)) {
          u.followers.forEach((fid: any) => {
            const cleanFid = String(fid || '').trim();
            if (cleanFid) creatorFollowerIds.add(cleanFid);
          });
        }
      }
    }

    const publisherLabel =
      (options?.displayLabel ||
        options?.editorName ||
        options?.submittedByUserName ||
        creatorNameOrId ||
        'Nhà đăng truyện').trim();

    let notifiedCount = 0;
    const now = Date.now();
    const baseNotifId = `new-novel-${novelId}-${now}`;

    // Bước 2: Gửi thông báo cho toàn bộ độc giả đang theo dõi (khớp theo ID, tên, tiền tố creator- hoặc nằm trong followers)
    for (const d of allDocs) {
      const u = (d.data() || {}) as Record<string, any>;
      const readerUid = String(u.uid || '').trim();
      const readerEmail = normalizeKey(u.email);

      // Không gửi trùng thông báo cho chính tài khoản đang đăng truyện
      if (
        (options?.creatorId && (d.id === options.creatorId || readerUid === options.creatorId)) ||
        (cleanCreatorEmail && readerEmail === cleanCreatorEmail)
      ) {
        continue;
      }

      const following = Array.isArray(u?.followingCreators) ? u.followingCreators : [];
      const isInCreatorFollowers =
        creatorFollowerIds.has(d.id) || (readerUid ? creatorFollowerIds.has(readerUid) : false);

      const isFollowing =
        isInCreatorFollowers ||
        following.some((rawKey: any) => {
          const key = String(rawKey || '').trim();
          if (!key) return false;
          const lower = key.toLowerCase();
          const stripped = stripCreatorPrefix(lower);
          return (
            candidateIds.has(key) ||
            candidateIds.has(lower) ||
            candidateNames.has(lower) ||
            candidateNames.has(stripped)
          );
        });

      if (isFollowing) {
        const notifPayload: UserNotification = {
          id: baseNotifId,
          title: `${publisherLabel} vừa đăng truyện mới!`,
          message: `Tác phẩm mới "${novelTitle}" đã được xuất bản. Nhấn vào để đón đọc những chương đầu tiên ngay!`,
          type: 'system',
          createdAt: now,
          isRead: false,
          novelId,
        };

        const batch = writeBatch(db);
        batch.update(doc(db, 'users', d.id), {
          notifications: arrayUnion(notifPayload),
        });
        const notifDocRef = doc(collection(db, 'notifications'));
        batch.set(notifDocRef, {
          ...notifPayload,
          userId: readerUid || d.id,
          targetDocId: d.id,
        });

        await batch.commit().catch((err) => {
          console.error('Lỗi gửi thông báo follower:', err);
          return updateDoc(doc(db, 'users', d.id), {
            notifications: arrayUnion(notifPayload),
          }).catch((fallbackErr) => console.error('Lỗi fallback gửi thông báo follower:', fallbackErr));
        });

        notifiedCount++;
      }
    }

    return notifiedCount;
  } catch (error) {
    console.error('Lỗi notifyFollowersOfNewNovel:', error);
    return 0;
  }
}

/**
 * Thực hiện giao dịch Donate Xu giữa Độc giả và Tác giả / Người đăng truyện trên Firestore:
 * - Trừ Xu của độc giả, thêm thông báo trừ Xu
 * - Xác định chính xác tài khoản Người Đăng Truyện / Tác Giả (qua uploaderUserId, uploaderEmail, creatorId, displayName)
 * - Cộng Xu vào CẢ authorEarnedXu (doanh thu nhuận bút) và xuBalance (ví cá nhân) của người nhận
 * - Thêm thông báo nhận Xu trực tiếp vào tài khoản Firestore của người đăng truyện
 * - Lưu lịch sử giao dịch vào collection "donations" để cả hai bên đối soát thực tế
 */
export async function processDonationInFirestore(params: {
  donorUserId: string;
  donorName: string;
  donorEmail?: string;
  creatorId: string;
  creatorName: string;
  creatorEmail?: string;
  uploaderUserId?: string;
  uploaderEmail?: string;
  novelId?: string;
  novelTitle?: string;
  amountXu: number;
  message: string;
}): Promise<{
  success: boolean;
  donorNextXu: number;
  creatorNextXu: number;
  creatorUserId: string | null;
  creatorNotif: UserNotification;
  donorNotif: UserNotification;
  donationRecord: DonationRecord;
}> {
  const {
    donorUserId,
    donorName,
    donorEmail,
    creatorId,
    creatorName,
    creatorEmail,
    uploaderUserId,
    uploaderEmail,
    novelId,
    novelTitle,
    amountXu,
    message,
  } = params;

  // 1. Chuẩn bị thông báo & tìm chính xác tài khoản tác giả / người đăng truyện trước khi chạy transaction
  const donorRef = doc(db, 'users', donorUserId);
  const targetLabel = novelTitle ? `cho người đăng truyện "${novelTitle}" (${creatorName})` : `cho tác giả/người đăng "${creatorName}"`;
  const donorNotif: UserNotification = {
    id: `donate-sent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `🎁 Đã ủng hộ -${amountXu} Xu`,
    message: `Bạn vừa gửi tặng ${amountXu} Xu ${targetLabel}. Lời nhắn: "${message}".`,
    type: 'payout',
    createdAt: Date.now(),
    isRead: false,
    novelId,
  };

  let creatorDocRef: any = null;
  let targetCreatorUid: string | null = null;

  const candidateIds = [
    uploaderUserId,
    creatorId && !creatorId.startsWith('creator-') && !creatorId.startsWith('author-') ? creatorId : null,
  ].filter(Boolean) as string[];

  for (const cid of candidateIds) {
    try {
      const snap = await getDoc(doc(db, 'users', cid));
      if (snap.exists()) {
        creatorDocRef = snap.ref;
        targetCreatorUid = cid;
        break;
      }
    } catch (e) {}
  }

  const candidateEmails = [uploaderEmail, creatorEmail].filter(Boolean).map((e) => e!.trim().toLowerCase());
  if (!creatorDocRef && (candidateEmails?.length || 0) > 0) {
    for (const em of candidateEmails) {
      try {
        const qEmail = query(collection(db, 'users'), where('email', '==', em));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          creatorDocRef = snapEmail.docs[0].ref;
          targetCreatorUid = snapEmail.docs[0].id;
          break;
        }
      } catch (e) {}
    }
  }

  if (!creatorDocRef && creatorName) {
    try {
      const qName = query(collection(db, 'users'), where('displayName', '==', creatorName.trim()));
      const snapName = await getDocs(qName);
      if (!snapName.empty) {
        creatorDocRef = snapName.docs[0].ref;
        targetCreatorUid = snapName.docs[0].id;
      } else {
        const allUsers = await getDocs(collection(db, 'users'));
        for (const d of allUsers.docs) {
          const u = d.data() as UserProfile;
          const uName = (u.displayName || '').trim().toLowerCase();
          const target = creatorName.trim().toLowerCase();
          if (uName && target && (uName === target || target.includes(uName) || uName.includes(target))) {
            creatorDocRef = d.ref;
            targetCreatorUid = d.id;
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (!creatorDocRef) {
    const newUid = uploaderUserId || (creatorId && !creatorId.startsWith('creator-') ? creatorId : `usr-${creatorName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
    creatorDocRef = doc(db, 'users', newUid);
    targetCreatorUid = newUid;
  }

  const creatorNotif: UserNotification = {
    id: `donate-rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `🎉 Bạn nhận được +${amountXu} Xu donate!`,
    message: `Độc giả "${donorName || 'Ẩn danh'}" vừa gửi tặng bạn +${amountXu} Xu${novelTitle ? ` cho truyện "${novelTitle}"` : ''}. Lời nhắn: "${message}".`,
    type: 'payout',
    createdAt: Date.now(),
    isRead: false,
    novelId,
  };

  // 2. Chạy runTransaction bảo vệ giao dịch: Đọc số dư thật trên Server, kiểm tra đủ Xu mới trừ, và cộng bằng increment()
  const isSelfDonation = creatorDocRef.id === donorRef.id;
  const txResult = await runTransaction(db, async (transaction) => {
    const donorSnap = await transaction.get(donorRef);
    if (!donorSnap.exists()) {
      throw new Error('Không tìm thấy tài khoản người gửi trên hệ thống.');
    }

    const donorData = donorSnap.data() as Record<string, any>;
    const currentDonorXu = extractXuBalances(donorData).xuBalance;
    if (currentDonorXu < amountXu) {
      throw new Error(`Số dư Xu không đủ để gửi tặng (Hiện có ${currentDonorXu} Xu, cần ${amountXu} Xu).`);
    }

    const creatorSnap = isSelfDonation ? donorSnap : await transaction.get(creatorDocRef);

    const donorNextXu = parseFloat((currentDonorXu - amountXu).toFixed(2));
    donorNotif.message = `Bạn vừa gửi tặng ${amountXu} Xu ${targetLabel}. Lời nhắn: "${message}". Số dư ví còn lại: ${donorNextXu} Xu.`;

    let creatorNextXu = amountXu;
    if (creatorSnap.exists()) {
      const cData = creatorSnap.data() as Record<string, any>;
      const cb = extractXuBalances(cData);
      creatorNextXu = parseFloat((cb.authorEarnedXu + amountXu).toFixed(2));
      const nextWallet = parseFloat(((isSelfDonation ? donorNextXu : cb.xuBalance) + amountXu).toFixed(2));
      creatorNotif.message = `Độc giả "${donorName || 'Ẩn danh'}" vừa gửi tặng bạn +${amountXu} Xu${novelTitle ? ` cho truyện "${novelTitle}"` : ''}. Lời nhắn: "${message}". Số dư ví: ${nextWallet} Xu | Doanh thu nhuận bút: ${creatorNextXu} Xu.`;
    }

    if (isSelfDonation) {
      transaction.update(donorRef, {
        authorEarnedXu: increment(amountXu),
        notifications: arrayUnion(donorNotif, creatorNotif),
      });
    } else {
      transaction.update(donorRef, {
        xuBalance: increment(-amountXu),
        notifications: arrayUnion(donorNotif),
      });

      if (creatorSnap.exists()) {
        transaction.update(creatorDocRef, {
          authorEarnedXu: increment(amountXu),
          xuBalance: increment(amountXu),
          notifications: arrayUnion(creatorNotif),
        });
      } else {
        transaction.set(
          creatorDocRef,
          {
            id: targetCreatorUid,
            displayName: creatorName,
            email: uploaderEmail || creatorEmail || '',
            role: 'author',
            xuBalance: amountXu,
            authorEarnedXu: amountXu,
            purchasedChapters: [],
            notifications: [creatorNotif],
            createdAt: Date.now(),
          },
          { merge: true }
        );
      }
    }

    return {
      donorNextXu: isSelfDonation ? currentDonorXu : donorNextXu,
      creatorNextXu,
      donorEmailResolved: donorEmail || donorData.email || '',
    };
  });

  const donorNextXu = txResult.donorNextXu;
  const creatorNextXu = txResult.creatorNextXu;
  const donorSnap = { exists: () => true, data: () => ({ email: txResult.donorEmailResolved }) };

  // 4. Lưu ghi nhận giao dịch vào collection "donations" để 2 bên xác nhận thực tế qua lại
  const donationRef = doc(collection(db, 'donations'));
  const donationRecord: DonationRecord = {
    id: donationRef.id,
    donorUserId,
    donorName: donorName || 'Độc giả',
    donorEmail: donorEmail || (donorSnap.exists() ? (donorSnap.data() as any).email || '' : ''),
    recipientUserId: targetCreatorUid || creatorId || 'unknown',
    recipientName: creatorName,
    recipientEmail: creatorEmail || uploaderEmail || '',
    novelId: novelId || '',
    novelTitle: novelTitle || '',
    amountXu,
    message,
    createdAt: Date.now(),
    status: 'completed',
  };

  await setDoc(donationRef, donationRecord).catch((err) => console.warn('Lỗi ghi record donation:', err));

  // Tăng coinCount cho novel bằng increment(), tuyệt đối KHÔNG đụng đến updatedAt hay lastChapterUpdatedAt
  if (novelId) {
    incrementNovelInteractionStatsInFirestore(novelId, { coinCount: amountXu }).catch((e) =>
      console.warn('Lỗi cập nhật coinCount truyện:', e)
    );
  }

  return {
    success: true,
    donorNextXu,
    creatorNextXu,
    creatorUserId: targetCreatorUid,
    creatorNotif,
    donorNotif,
    donationRecord,
  };
}

/**
 * Tải danh sách giao dịch donate thực tế của một truyện từ collection "donations"
 */
export async function fetchDonationsForNovel(novelId: string): Promise<DonationRecord[]> {
  const path = 'donations';
  try {
    const colRef = collection(db, path);
    const q = query(colRef, where('novelId', '==', novelId));
    const snap = await getDocs(q);
    const list: DonationRecord[] = (snap?.docs || []).map((d) => ({
      ...(d.data() as DonationRecord),
      id: d.id,
    }));
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (error) {
    console.warn('Lỗi tải danh sách donations cho truyện:', error);
    return [];
  }
}

/**
 * Tải danh sách giao dịch donate mà một tác giả/người đăng nhận được từ độc giả
 */
export async function fetchDonationsForRecipient(recipientUserIdOrName: string): Promise<DonationRecord[]> {
  const path = 'donations';
  try {
    const colRef = collection(db, path);
    const snap = await getDocs(colRef);
    const list: DonationRecord[] = [];
    const cleanTarget = recipientUserIdOrName.trim().toLowerCase();

    for (const d of snap.docs) {
      const data = d.data() as DonationRecord;
      if (
        data.recipientUserId === recipientUserIdOrName ||
        data.recipientName?.trim().toLowerCase() === cleanTarget
      ) {
        list.push({ ...data, id: d.id });
      }
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (error) {
    console.warn('Lỗi tải donations của tác giả:', error);
    return [];
  }
}

/**
 * Ghi nhận nhuận bút cho tác giả và gửi thông báo khi độc giả mua chương / trọn bộ truyện
 */
export async function creditAuthorRoyaltyAndNotify(params: {
  authorIdOrName: string;
  authorEmail?: string;
  novelTitle: string;
  type: 'chapter' | 'full_book';
  chapterNumber?: number;
  earnedXu: number;
  buyerName: string;
}): Promise<{ authorNextXu: number; notif: UserNotification } | null> {
  const { authorIdOrName, authorEmail, novelTitle, type, chapterNumber, earnedXu, buyerName } = params;
  if (earnedXu <= 0) return null;

  try {
    let authorDocRef = null;
    let authorData: UserProfile | null = null;

    if (authorIdOrName && !authorIdOrName.startsWith('creator-') && !authorIdOrName.startsWith('author-')) {
      const snap = await getDoc(doc(db, 'users', authorIdOrName));
      if (snap.exists()) {
        authorDocRef = snap.ref;
        authorData = snap.data() as UserProfile;
      }
    }

    if (!authorDocRef && authorEmail) {
      const q = query(collection(db, 'users'), where('email', '==', authorEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        authorDocRef = snap.docs[0].ref;
        authorData = snap.docs[0].data() as UserProfile;
      }
    }

    if (!authorDocRef && authorIdOrName) {
      const cleanName = authorIdOrName.replace(/^author-/, '').replace(/^creator-/, '').trim();
      const q = query(collection(db, 'users'), where('displayName', '==', cleanName));
      const snap = await getDocs(q);
      if (!snap.empty) {
        authorDocRef = snap.docs[0].ref;
        authorData = snap.docs[0].data() as UserProfile;
      } else {
        const allUsers = await getDocs(collection(db, 'users'));
        for (const d of allUsers.docs) {
          const u = d.data() as UserProfile;
          if (u.displayName?.trim().toLowerCase() === cleanName.toLowerCase()) {
            authorDocRef = d.ref;
            authorData = u;
            break;
          }
        }
      }
    }

    const itemLabel = type === 'full_book' ? 'trọn bộ' : `chương ${chapterNumber || ''}`;
    const notif: UserNotification = {
      id: `royalty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `🎉 Nhận được +${earnedXu} Xu nhuận bút!`,
      message: `Độc giả "${buyerName || 'Ẩn danh'}" vừa mua ${itemLabel} truyện "${novelTitle}". Bạn được cộng +${earnedXu} Xu vào doanh thu nhuận bút.`,
      type: 'payout',
      createdAt: Date.now(),
      isRead: false,
    };

    if (authorDocRef && authorData) {
      const currentEarned = extractXuBalances(authorData as Record<string, any>).authorEarnedXu;
      const nextEarned = currentEarned + earnedXu;
      await updateDoc(authorDocRef, {
        authorEarnedXu: increment(earnedXu),
        notifications: arrayUnion(notif),
      });
      return { authorNextXu: nextEarned, notif };
    } else if (authorIdOrName) {
      const cleanName = authorIdOrName.replace(/^author-/, '').replace(/^creator-/, '').trim();
      const newUid = `usr-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const newRef = doc(db, 'users', newUid);
      return await runTransaction(db, async (transaction) => {
        const checkSnap = await transaction.get(newRef);
        if (checkSnap.exists()) {
          const existingData = checkSnap.data() as Record<string, any>;
          const currentEarned = extractXuBalances(existingData).authorEarnedXu;
          const nextEarned = currentEarned + earnedXu;
          transaction.update(newRef, {
            authorEarnedXu: increment(earnedXu),
            notifications: arrayUnion(notif),
          });
          return { authorNextXu: nextEarned, notif };
        }
        transaction.set(
          newRef,
          {
            id: newUid,
            displayName: cleanName,
            email: authorEmail || '',
            role: 'author',
            xuBalance: 0,
            authorEarnedXu: earnedXu,
            purchasedChapters: [],
            notifications: [notif],
            createdAt: Date.now(),
          },
          { merge: true }
        );
        return { authorNextXu: earnedXu, notif };
      });
    }
  } catch (err) {
    console.error('Lỗi creditAuthorRoyaltyAndNotify:', err);
  }
  return null;
}

/* ==========================================================================
   FIRESTORE REALTIME SERVICES: BÌNH LUẬN THẬT (REAL COMMENTS) & ADMIN MODERATION
   ========================================================================== */

/**
 * Tải bình luận thật của một truyện từ Firestore
 */
export async function fetchNovelCommentsFromFirestore(novelId: string): Promise<Comment[]> {
  const path = 'comments';
  try {
    const colRef = collection(db, path);
    const q = query(colRef, where('novelId', '==', novelId));
    const snap = await getDocs(q);
    const list: Comment[] = (snap?.docs || []).map((d) => ({
      ...(d.data() as Comment),
      id: d.id,
    }));
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (error) {
    console.warn('Lỗi tải comments từ Firestore:', error);
    return [];
  }
}

/**
 * Tải toàn bộ bình luận thật của hệ thống để Quản Trị Viên (Admin) kiểm duyệt
 */
export async function fetchAllCommentsForAdmin(): Promise<Comment[]> {
  const path = 'comments';
  try {
    const colRef = collection(db, path);
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const rawList: Comment[] = (snap?.docs || []).map((d) => ({
      ...(d.data() as Comment),
      id: d.id,
    }));

    // Bổ sung tên truyện nếu comment trong database thiếu trường novelTitle
    const missingNovelIds = Array.from(new Set(rawList.filter((c) => !c.novelTitle && c.novelId).map((c) => c.novelId)));
    if ((missingNovelIds?.length || 0) > 0) {
      const titlesMap = new Map<string, string>();
      await Promise.all(
        (missingNovelIds || []).map(async (nId) => {
          try {
            const nDoc = await getDoc(doc(db, 'novels', nId));
            if (nDoc.exists()) {
              titlesMap.set(nId, nDoc.data().title || nId);
            } else {
              const sDoc = await getDoc(doc(db, 'stories', nId));
              if (sDoc.exists()) titlesMap.set(nId, sDoc.data().title || nId);
            }
          } catch {}
        })
      );

      return (rawList || []).map((c) => ({
        ...c,
        novelTitle: c.novelTitle || titlesMap.get(c.novelId) || c.novelId,
      }));
    }

    return rawList;
  } catch (error) {
    console.warn('Lỗi tải toàn bộ bình luận cho Admin:', error);
    return [];
  }
}

/**
 * Độc giả gửi bình luận thật mới lên Firestore
 */
export async function addNovelCommentToFirestore(
  commentData: Omit<Comment, 'id'>
): Promise<Comment> {
  const path = 'comments';
  try {
    const newDocRef = doc(collection(db, path));
    const newComment: Comment = {
      ...commentData,
      id: newDocRef.id,
      createdAt: commentData.createdAt || Date.now(),
      likes: commentData.likes || 0,
    };
    await setDoc(newDocRef, newComment);
    return newComment;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    // Offline fallback
    return {
      ...commentData,
      id: `cm-${Date.now()}`,
      createdAt: commentData.createdAt || Date.now(),
      likes: 0,
    };
  }
}

/**
 * Admin hoặc người đăng xóa bình luận
 */
export async function deleteNovelCommentFromFirestore(commentId: string): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    const docRef = doc(db, 'comments', commentId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* ==========================================================================
   FIRESTORE REALTIME SERVICES: TÍNH VIEW THẬT THEO TIÊU CHÍ GOOGLE (GA4)
   ========================================================================== */

// Set theo dõi các bộ truyện đã tính view trong phiên làm việc hiện tại
const viewedNovelsInSession = new Set<string>();

const VIEW_COOLDOWN_24H_MS = 24 * 60 * 60 * 1000;

/**
 * Tăng lượt view thật cho truyện (Tối đa 1 lần / 24 giờ / bộ truyện / thiết bị)
 */
export async function incrementNovelRealViewsInFirestore(novelId: string): Promise<void> {
  const canonicalId = normalizeStoryId(novelId) || String(novelId || '').trim();
  if (!canonicalId) return;

  if (viewedNovelsInSession.has(canonicalId)) return;

  const storageKey = `daotam_viewed_24h_${canonicalId}`;
  const sessionKey = `daotam_viewed_${canonicalId}`;
  if (safeSessionGetItem(sessionKey)) {
    return;
  }

  const lastViewedRaw = safeGetItem(storageKey);
  if (lastViewedRaw) {
    const lastTs = Number(lastViewedRaw);
    if (Number.isFinite(lastTs) && Date.now() - lastTs < VIEW_COOLDOWN_24H_MS) {
      viewedNovelsInSession.add(canonicalId);
      safeSessionSetItem(sessionKey, '1');
      return;
    }
  }

  viewedNovelsInSession.add(canonicalId);
  safeSessionSetItem(sessionKey, '1');
  safeSetItem(storageKey, String(Date.now()));

  try {
    const novelRef = doc(db, 'novels', canonicalId);
    await updateDoc(novelRef, {
      views: increment(1),
      dailyViews: increment(1),
    });
  } catch (err: any) {
    if (err?.message?.includes('quota') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
      console.warn('Quota limit reached on view increment.');
    }
  }
}

/* ==========================================================================
   TỦ TRUYỆN CỦA BẠN: RETROACTIVE AGGREGATION & FIX LOGIC CHƯƠNG VIP
   ========================================================================== */

export interface PurchasedStorySummary {
  storyId: string;
  storyTitle: string;
  storyAuthor: string;
  storyEditor?: string;
  storyCoverImage: string;
  storySlug?: string;
  storyMainCategory?: string;
  totalChapters: number;
  freeChaptersCount: number;
  totalVipChapters: number;
  isFullStoryBought: boolean;
  purchasedChapterIds: string[];
  purchasedChapterNumbers: number[];
  purchasedVipChaptersCount: number;
  totalSpentXu: number;
  lastPurchasedAt: number;
  purchaseBadgeType: 'full_book' | 'single_chapters';
  novel?: Novel;
}

export interface LocalSavedNovelRecord {
  storyId: string;
  storyTitle?: string;
  storyAuthor?: string;
  storyCoverImage?: string;
  storySlug?: string;
  savedAt?: number;
}

const LOCAL_SAVED_NOVELS_KEY = 'daotam_saved_novels';
const LOCAL_BOOKMARKS_LEGACY_KEY = 'daotam_bookmarks';

/**
 * Đọc danh sách ID / metadata truyện đã lưu cục bộ từ localStorage (0 Reads)
 */
export function readLocalSavedNovelsFromStorage(): LocalSavedNovelRecord[] {
  const seen = new Map<string, LocalSavedNovelRecord>();
  const keys = [LOCAL_SAVED_NOVELS_KEY, LOCAL_BOOKMARKS_LEGACY_KEY];

  for (const key of keys) {
    const raw = safeGetItem(key);
    if (!raw) continue;
    const parsed = safeJsonParse<any[]>(raw, []);
    if (!Array.isArray(parsed)) continue;

    for (const item of parsed) {
      if (typeof item === 'string' || typeof item === 'number') {
        const id = normalizeStoryId(String(item));
        if (id && !seen.has(id)) {
          seen.set(id, { storyId: id });
        }
      } else if (item && typeof item === 'object') {
        const id = normalizeStoryId(String(item.storyId || item.novelId || item.id || ''));
        if (id && !seen.has(id)) {
          seen.set(id, {
            storyId: id,
            storyTitle: item.storyTitle || item.title,
            storyAuthor: item.storyAuthor || item.author,
            storyCoverImage: item.storyCoverImage || item.coverImage,
            storySlug: item.storySlug || item.slug,
            savedAt: Number(item.savedAt || item.updatedAt || 0) || undefined,
          });
        }
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Lưu danh sách ID truyện đã lưu cục bộ vào localStorage (0 Writes Firestore)
 */
export function saveLocalSavedStoryIds(storyIds: string[]): void {
  const uniqueIds = Array.from(
    new Set(
      (Array.isArray(storyIds) ? storyIds : [])
        .map((id) => normalizeStoryId(String(id || '')))
        .filter(Boolean)
    )
  );
  safeSetItem(LOCAL_SAVED_NOVELS_KEY, JSON.stringify(uniqueIds));
  safeRemoveItem(LOCAL_BOOKMARKS_LEGACY_KEY);
}

/**
 * Gom nhóm toàn bộ truyện đã mua từ dữ liệu tài khoản users/{uid} đã tải sẵn
 * VÀ khớp ID với danh sách truyện đã lưu trong cache (0 Firestore Reads).
 */
export function aggregateUserPurchasedNovelsFromCache(
  user: UserProfile | null | undefined,
  cachedNovels: Novel[] = []
): PurchasedStorySummary[] {
  if (!user || !user.isLoggedIn || !user.id || user.id === 'guest') return [];

  const existingNovelsMap = new Map<string, Novel>();
  const existingNovelsLowerMap = new Map<string, Novel>();
  const registerNovelToLookup = (n: Novel) => {
    if (!n) return;
    if (n.id) {
      const normId = normalizeStoryId(n.id);
      existingNovelsMap.set(n.id, n);
      existingNovelsLowerMap.set(String(n.id).trim().toLowerCase(), n);
      if (normId) {
        existingNovelsMap.set(normId, n);
        existingNovelsLowerMap.set(normId.toLowerCase(), n);
      }
    }
    if (n.slug) {
      const normSlug = normalizeStoryId(n.slug);
      existingNovelsMap.set(n.slug, n);
      existingNovelsLowerMap.set(String(n.slug).trim().toLowerCase(), n);
      if (normSlug) {
        existingNovelsMap.set(normSlug, n);
        existingNovelsLowerMap.set(normSlug.toLowerCase(), n);
      }
    }
  };

  // Fallback đọc danh sách truyện từ cache localStorage (0 Reads)
  const localCachedRaw = safeGetItem('dao_tam_novels');
  const localCachedNovels = localCachedRaw ? safeJsonParse<Novel[]>(localCachedRaw, []) : [];
  if (Array.isArray(localCachedNovels)) {
    localCachedNovels.forEach(registerNovelToLookup);
  }
  if (Array.isArray(cachedNovels)) {
    cachedNovels.forEach(registerNovelToLookup);
  }

  const findCachedNovel = (key: string): Novel | undefined => {
    const clean = String(key || '').trim();
    if (!clean) return undefined;
    const stripped = normalizeStoryId(clean);
    return (
      existingNovelsMap.get(clean) ||
      existingNovelsLowerMap.get(clean.toLowerCase()) ||
      (stripped ? existingNovelsMap.get(stripped) || existingNovelsLowerMap.get(stripped.toLowerCase()) : undefined)
    );
  };

  const rawPurchases: any[] = Array.isArray(user.purchases) ? [...user.purchases] : [];
  const userUnlockedFullBooks: string[] = Array.isArray(user.unlockedFullBooks)
    ? user.unlockedFullBooks.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  const userUnlockedChapters = extractPurchasedChaptersMap({
    purchasedChapters: user.purchasedChapters,
    unlockedChapters: user.unlockedChapters,
  });

  const legacyGrantedFullIds = new Set<string>();
  const legacyEntries = userUnlockedChapters['__legacy__'] || [];
  delete userUnlockedChapters['__legacy__'];

  const storyIdsSet = new Set<string>();
  const purchasedStoriesMetaMap = new Map<
    string,
    {
      title?: string;
      author?: string;
      coverImage?: string;
      slug?: string;
      isFull?: boolean;
      purchasedAt?: number;
      pricePaid?: number;
      chapterIds: string[];
      chapterNumbers: number[];
    }
  >();

  const toCanonicalStoryId = (rawId: string): string => {
    const stripped = normalizeStoryId(rawId);
    if (!stripped) return '';
    const matched = findCachedNovel(stripped) || findCachedNovel(rawId);
    return matched?.id || stripped;
  };

  rawPurchases.forEach((p) => {
    const rawId = p?.storyId || p?.novelId || p?.bookId;
    const cId = toCanonicalStoryId(String(rawId || ''));
    if (cId) storyIdsSet.add(cId);
  });

  userUnlockedFullBooks.forEach((rawId) => {
    const cId = toCanonicalStoryId(rawId);
    if (cId) storyIdsSet.add(cId);
  });

  const normalizedUnlockedByCanonical: Record<string, string[]> = {};
  Object.entries(userUnlockedChapters || {}).forEach(([rawId, chaps]) => {
    if (!Array.isArray(chaps) || chaps.length === 0) return;
    const cId = toCanonicalStoryId(rawId);
    if (!cId) return;
    storyIdsSet.add(cId);
    const prev = normalizedUnlockedByCanonical[cId] || [];
    normalizedUnlockedByCanonical[cId] = Array.from(new Set([...prev, ...chaps.map((c) => String(c))]));
  });

  for (const entry of legacyEntries) {
    const cleanEntry = String(entry || '').trim();
    if (!cleanEntry) continue;
    const cId = toCanonicalStoryId(cleanEntry);
    if (!cId) continue;
    storyIdsSet.add(cId);
    legacyGrantedFullIds.add(cId);
  }

  // Hỗ trợ thêm trường purchasedStories nếu có trên users/{uid}
  const rawPurchasedStories = Array.isArray((user as any).purchasedStories)
    ? ((user as any).purchasedStories as Array<string | Record<string, any>>)
    : [];

  for (const item of rawPurchasedStories) {
    if (typeof item === 'string' || typeof item === 'number') {
      const cId = toCanonicalStoryId(String(item));
      if (cId) storyIdsSet.add(cId);
    } else if (item && typeof item === 'object') {
      const rawId = item.storyId || item.novelId || item.bookId || item.id;
      const cId = toCanonicalStoryId(String(rawId || ''));
      if (!cId) continue;
      storyIdsSet.add(cId);
      const existingMeta = purchasedStoriesMetaMap.get(cId) || {
        chapterIds: [],
        chapterNumbers: [],
      };
      const chIds = Array.isArray(item.purchasedChapterIds)
        ? item.purchasedChapterIds.map((c: any) => String(c))
        : item.chapterId
        ? [String(item.chapterId)]
        : [];
      const chNums = Array.isArray(item.purchasedChapterNumbers)
        ? item.purchasedChapterNumbers.map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n))
        : typeof item.chapterNumber === 'number'
        ? [item.chapterNumber]
        : [];
      purchasedStoriesMetaMap.set(cId, {
        title: existingMeta.title || item.storyTitle || item.novelTitle || item.title,
        author: existingMeta.author || item.storyAuthor || item.authorName || item.author,
        coverImage: existingMeta.coverImage || item.storyCoverImage || item.coverImage,
        slug: existingMeta.slug || item.storySlug || item.slug,
        isFull:
          Boolean(existingMeta.isFull) ||
          Boolean(item.isFullStoryBought) ||
          item.type === 'full_book',
        purchasedAt: Math.max(
          existingMeta.purchasedAt || 0,
          Number(item.purchasedAt || item.updatedAt || item.createdAt || 0)
        ),
        pricePaid: (existingMeta.pricePaid || 0) + (Number(item.pricePaid || item.totalSpentXu || 0) || 0),
        chapterIds: Array.from(new Set([...existingMeta.chapterIds, ...chIds])),
        chapterNumbers: Array.from(new Set([...existingMeta.chapterNumbers, ...chNums])),
      });
    }
  }

  if (storyIdsSet.size === 0) return [];

  const summaries: PurchasedStorySummary[] = [];

  for (const storyId of storyIdsSet) {
    const novel = findCachedNovel(storyId);
    const storyMeta = purchasedStoriesMetaMap.get(storyId);
    const storyPurchases = rawPurchases.filter((p) => {
      const pRaw = String(p?.storyId || p?.novelId || p?.bookId || '').trim();
      if (!pRaw) return false;
      return (
        pRaw === storyId ||
        toCanonicalStoryId(pRaw) === storyId ||
        (novel?.slug ? pRaw === novel.slug : false)
      );
    });

    const unlockedListForCheck = normalizedUnlockedByCanonical[storyId] || [];

    const isFullStoryBought =
      legacyGrantedFullIds.has(storyId) ||
      Boolean(storyMeta?.isFull) ||
      unlockedListForCheck.includes('all') ||
      unlockedListForCheck.includes('*') ||
      userUnlockedFullBooks.some((id) => id === storyId || toCanonicalStoryId(id) === storyId || (novel?.slug ? id === novel.slug : false)) ||
      storyPurchases.some((p) => p?.type === 'full_book' || p?.isFullStoryBought === true);

    const totalChapters =
      novel?.totalChapters ||
      (Array.isArray(novel?.chapters) ? novel.chapters.length : 0) ||
      storyPurchases.length ||
      storyMeta?.chapterIds.length ||
      1;

    const freeChaptersCount = totalChapters >= 200 ? 50 : 30;
    let totalVipChapters = Math.max(0, totalChapters - freeChaptersCount);

    if (typeof (novel as any)?.totalVipChapters === 'number' && (novel as any).totalVipChapters > 0) {
      totalVipChapters = (novel as any).totalVipChapters;
    } else if (Array.isArray(novel?.chapters)) {
      const explicitVips = novel.chapters.filter(
        (c) => c.isVip || (typeof c.number === 'number' && c.number > freeChaptersCount)
      );
      if (explicitVips.length > 0) {
        totalVipChapters = explicitVips.length;
      }
    }

    const purchasedChapterIdsSet = new Set<string>(storyMeta?.chapterIds || []);
    const purchasedChapterNumsSet = new Set<number>(storyMeta?.chapterNumbers || []);
    const purchasedVipChaptersSet = new Set<number | string>();

    (storyMeta?.chapterNumbers || []).forEach((num) => {
      if (num > freeChaptersCount) {
        purchasedVipChaptersSet.add(num);
      }
    });

    storyPurchases.forEach((p) => {
      if (p.chapterId) purchasedChapterIdsSet.add(String(p.chapterId));
      if (typeof p.chapterNumber === 'number') {
        purchasedChapterNumsSet.add(p.chapterNumber);
        if (p.chapterNumber > freeChaptersCount) {
          purchasedVipChaptersSet.add(p.chapterNumber);
        }
      } else if (p.chapterId) {
        const numMatch = String(p.chapterId).match(/(\d+)/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          purchasedChapterNumsSet.add(num);
          if (num > freeChaptersCount) {
            purchasedVipChaptersSet.add(num);
          }
        } else {
          purchasedVipChaptersSet.add(String(p.chapterId));
        }
      }
    });

    unlockedListForCheck.forEach((chId) => {
      if (chId === 'all' || chId === '*') return;
      purchasedChapterIdsSet.add(chId);
      const numMatch = chId.match(/(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        purchasedChapterNumsSet.add(num);
        if (num > freeChaptersCount) {
          purchasedVipChaptersSet.add(num);
        }
      } else {
        purchasedVipChaptersSet.add(chId);
      }
    });

    const totalSpentXu =
      storyPurchases.reduce((acc, p) => acc + (Number(p.pricePaid) || 0), 0) ||
      (storyMeta?.pricePaid || 0);
    const lastPurchasedAt =
      Math.max(
        storyPurchases.reduce(
          (max, p) => Math.max(max, Number(p.purchasedAt || p.createdAt || 0)),
          0
        ),
        storyMeta?.purchasedAt || 0
      ) || 0;

    const purchasedVipChaptersCount = Math.max(
      purchasedVipChaptersSet.size,
      purchasedChapterIdsSet.size
    );

    const isCompletedVip =
      isFullStoryBought ||
      (totalVipChapters > 0 && purchasedVipChaptersCount >= totalVipChapters);

    const purchaseBadgeType: 'full_book' | 'single_chapters' = isCompletedVip
      ? 'full_book'
      : 'single_chapters';

    const resolvedTitle = (
      novel?.title ||
      storyPurchases[0]?.novelTitle ||
      storyMeta?.title ||
      ''
    ).trim();
    if (!resolvedTitle || /^Bộ truyện #/i.test(resolvedTitle)) {
      continue;
    }

    summaries.push({
      storyId,
      storyTitle: resolvedTitle,
      storyAuthor:
        novel?.author ||
        storyPurchases[0]?.authorName ||
        storyMeta?.author ||
        'Đang cập nhật',
      storyEditor: novel?.editor,
      storyCoverImage:
        novel?.coverImage ||
        storyMeta?.coverImage ||
        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80',
      storySlug: novel?.slug || storyMeta?.slug || normalizeStoryId(storyId),
      storyMainCategory: novel?.mainCategory,
      totalChapters,
      freeChaptersCount,
      totalVipChapters,
      isFullStoryBought,
      purchasedChapterIds: Array.from(purchasedChapterIdsSet),
      purchasedChapterNumbers: Array.from(purchasedChapterNumsSet),
      purchasedVipChaptersCount,
      totalSpentXu,
      lastPurchasedAt,
      purchaseBadgeType,
      novel,
    });
  }

  summaries.sort((a, b) => b.lastPurchasedAt - a.lastPurchasedAt);
  return summaries;
}

/**
 * Gom nhóm tất cả giao dịch mua chương / mua trọn bộ từ Firestore của User (Retroactive Aggregation)
 * Tự động tính toán chuẩn xác số chương VIP và phân loại nhãn 'Mua Trọn Bộ' / 'Mua Chương Lẻ'.
 */
export async function fetchUserPurchasedNovelsAggregated(
  userId: string,
  cachedNovels: Novel[] = []
): Promise<PurchasedStorySummary[]> {
  if (!userId || userId === 'guest') return [];

  const existingNovelsMap = new Map<string, Novel>();
  cachedNovels.forEach((n) => {
    if (n.id) existingNovelsMap.set(n.id, n);
    if (n.slug) existingNovelsMap.set(n.slug, n);
  });

  const rawPurchases: any[] = [];
  let userUnlockedFullBooks: string[] = [];
  let userUnlockedChapters: Record<string, string[]> = {};

  try {
    // 1. Query Firestore user doc
    const userDocRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (Array.isArray(userData.purchases)) {
        rawPurchases.push(...userData.purchases);
      }
      if (Array.isArray(userData.unlockedFullBooks)) {
        userUnlockedFullBooks = userData.unlockedFullBooks;
      }
      userUnlockedChapters = extractPurchasedChaptersMap(userData);
    }
  } catch (err) {
    console.warn('Lỗi đọc user doc cho lịch sử mua:', err);
  }

  // 2. Query subcollection users/{userId}/purchases nếu có
  try {
    const subColRef = collection(db, 'users', userId, 'purchases');
    const subSnap = await getDocs(subColRef);
    subSnap.forEach((d) => {
      rawPurchases.push({ id: d.id, ...d.data() });
    });
  } catch {}

  // 3. Query collection purchases (top-level) nếu có
  try {
    const pCol = collection(db, 'purchases');
    const qPurchases = query(pCol, where('userId', '==', userId));
    const pSnap = await getDocs(qPurchases);
    pSnap.forEach((d) => {
      rawPurchases.push({ id: d.id, ...d.data() });
    });
  } catch {}

  // Gom tất cả các storyId có phát sinh giao dịch hoặc đã lưu mở khóa
  const storyIdsSet = new Set<string>();
  rawPurchases.forEach((p) => {
    const sId = p.storyId || p.novelId;
    if (sId) storyIdsSet.add(String(sId));
  });
  userUnlockedFullBooks.forEach((sId) => {
    if (sId) storyIdsSet.add(String(sId));
  });
  const legacyGrantedFullIds = new Set<string>();
  const legacyEntries = userUnlockedChapters['__legacy__'] || [];
  delete userUnlockedChapters['__legacy__'];

  Object.keys(userUnlockedChapters || {}).forEach((sId) => {
    if (sId && Array.isArray(userUnlockedChapters[sId]) && (userUnlockedChapters[sId]?.length || 0) > 0) {
      storyIdsSet.add(String(sId));
    }
  });

  // Nhận diện các ID truyện được Admin cấp thẳng bằng arrayUnion(novelId)
  for (const entry of legacyEntries) {
    const cleanEntry = String(entry || '').trim();
    if (!cleanEntry) continue;
    const matchedNovel = existingNovelsMap.get(cleanEntry);
    const resolvedId = matchedNovel?.id || cleanEntry;
    storyIdsSet.add(resolvedId);
    legacyGrantedFullIds.add(resolvedId);
  }

  if (storyIdsSet.size === 0) {
    return [];
  }

  // Lấy chi tiết thông tin các truyện chưa có trong cachedNovels từ Firestore
  const missingStoryIds = Array.from(storyIdsSet).filter((id) => !existingNovelsMap.has(id));
  await Promise.all(
    (missingStoryIds || []).map(async (storyId) => {
      try {
        const nRef = doc(db, 'novels', storyId);
        const nSnap = await getDoc(nRef);
        if (nSnap.exists()) {
          const rawNovelData = nSnap.data() || {};
          const resolvedCategories = Array.isArray(rawNovelData.categories)
            ? rawNovelData.categories
            : Array.isArray(rawNovelData.genres)
            ? rawNovelData.genres
            : [];
          const novelData = {
            id: nSnap.id,
            ...rawNovelData,
            categories: resolvedCategories,
            genres: Array.isArray(rawNovelData.genres) ? rawNovelData.genres : resolvedCategories,
            chapters: Array.isArray(rawNovelData.chapters) ? rawNovelData.chapters : [],
          } as unknown as Novel;
          existingNovelsMap.set(storyId, novelData);
          if (novelData.slug) existingNovelsMap.set(novelData.slug, novelData);
          return;
        }

        const sRef = doc(db, 'stories', storyId);
        const sSnap = await getDoc(sRef);
        if (sSnap.exists()) {
          const rawStoryData = sSnap.data() || {};
          const resolvedCategories = Array.isArray(rawStoryData.categories)
            ? rawStoryData.categories
            : Array.isArray(rawStoryData.genres)
            ? rawStoryData.genres
            : [];
          const storyData = {
            id: sSnap.id,
            ...rawStoryData,
            categories: resolvedCategories,
            genres: Array.isArray(rawStoryData.genres) ? rawStoryData.genres : resolvedCategories,
            chapters: Array.isArray(rawStoryData.chapters) ? rawStoryData.chapters : [],
          } as unknown as Novel;
          existingNovelsMap.set(storyId, storyData);
        }
      } catch (err) {
        console.warn(`Lỗi fetch novel ${storyId}:`, err);
      }
    })
  );

  // Gom nhóm giao dịch theo storyId (Retroactive Aggregation)
  const summaries: PurchasedStorySummary[] = [];

  for (const storyId of storyIdsSet) {
    const novel = existingNovelsMap.get(storyId);
    const storyPurchases = rawPurchases.filter(
      (p) => (p.storyId || p.novelId) === storyId || (novel?.slug && (p.storyId || p.novelId) === novel.slug)
    );

    const unlockedListForCheck = userUnlockedChapters[storyId] || [];

    // Kiểm tra mua trọn bộ hoặc được Admin cấp quyền trọn bộ
    const isFullStoryBought =
      legacyGrantedFullIds.has(storyId) ||
      unlockedListForCheck.includes('all') ||
      unlockedListForCheck.includes('*') ||
      userUnlockedFullBooks.includes(storyId) ||
      (novel?.slug ? userUnlockedFullBooks.includes(novel.slug) : false) ||
      storyPurchases.some((p) => p.type === 'full_book' || p.isFullStoryBought === true);

    const totalChapters =
      novel?.totalChapters ||
      (Array.isArray(novel?.chapters) ? (novel.chapters?.length || 0) : 0) ||
      (storyPurchases?.length || 0) ||
      1;

    // Quy chuẩn VIP Đạo Tâm:
    // - Truyện dài trên 200 chương: Set VIP từ chương thứ 51 trở về sau (50c đầu miễn phí).
    // - Truyện ngắn dưới 200 chương: Set VIP từ chương thứ 31 trở về sau (30c đầu miễn phí).
    const freeChaptersCount = totalChapters >= 200 ? 50 : 30;
    let totalVipChapters = Math.max(0, totalChapters - freeChaptersCount);

    if (typeof (novel as any)?.totalVipChapters === 'number' && (novel as any).totalVipChapters > 0) {
      totalVipChapters = (novel as any).totalVipChapters;
    } else if (Array.isArray(novel?.chapters)) {
      const explicitVips = novel.chapters.filter((c) => c.isVip || (typeof c.number === 'number' && c.number > freeChaptersCount));
      if ((explicitVips?.length || 0) > 0) {
        totalVipChapters = explicitVips?.length || 0;
      }
    }

    // Tập hợp các chương đã mua
    const purchasedChapterIdsSet = new Set<string>();
    const purchasedChapterNumsSet = new Set<number>();
    const purchasedVipChaptersSet = new Set<number | string>();

    // Từ mảng transactions
    storyPurchases.forEach((p) => {
      if (p.chapterId) purchasedChapterIdsSet.add(p.chapterId);
      if (typeof p.chapterNumber === 'number') {
        purchasedChapterNumsSet.add(p.chapterNumber);
        // Tuyệt đối không đếm chương free vào điều kiện này
        if (p.chapterNumber > freeChaptersCount) {
          purchasedVipChaptersSet.add(p.chapterNumber);
        }
      } else if (p.chapterId) {
        const numMatch = p.chapterId.match(/(\d+)/);
        if (numMatch) {
          const num = parseInt(numMatch[1], 10);
          purchasedChapterNumsSet.add(num);
          if (num > freeChaptersCount) {
            purchasedVipChaptersSet.add(num);
          }
        } else {
          purchasedVipChaptersSet.add(p.chapterId);
        }
      }
    });

    // Từ unlockedChapters object của user doc
    const unlockedList = userUnlockedChapters[storyId] || (novel?.slug ? userUnlockedChapters[novel.slug] : []) || [];
    unlockedList.forEach((chId) => {
      purchasedChapterIdsSet.add(chId);
      const numMatch = chId.match(/(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        purchasedChapterNumsSet.add(num);
        if (num > freeChaptersCount) {
          purchasedVipChaptersSet.add(num);
        }
      } else {
        purchasedVipChaptersSet.add(chId);
      }
    });

    // Tổng số chi tiêu Xu
    const totalSpentXu = storyPurchases.reduce((acc, p) => acc + (Number(p.pricePaid) || 0), 0);
    const lastPurchasedAt = storyPurchases.reduce(
      (max, p) => Math.max(max, Number(p.purchasedAt || p.createdAt || 0)),
      0
    ) || Date.now();

    const purchasedVipChaptersCount = purchasedVipChaptersSet.size;

    // Phân loại nhãn theo đúng 3 trường hợp BẮT BUỘC:
    // Trường hợp 1: User đã mua gói trọn bộ (isFullStoryBought == true).
    // Trường hợp 2: User mua gom từng chương lẻ, và tổng số chương lẻ đã mua BẰNG VỚI tổng số chương VIP
    // (purchasedChapters.length === story.totalVipChapters hoặc tổng số chương - số chương free).
    // => Cả 2 trường hợp này đều hiển thị nhãn: 'Mua Trọn Bộ'
    // Trường hợp 3: User mua chương lẻ nhưng chưa mua hết toàn bộ số chương VIP => Hiển thị nhãn: 'Mua Chương Lẻ'
    const isCompletedVip =
      isFullStoryBought ||
      (totalVipChapters > 0 && purchasedVipChaptersCount >= totalVipChapters);

    const purchaseBadgeType: 'full_book' | 'single_chapters' = isCompletedVip
      ? 'full_book'
      : 'single_chapters';

    summaries.push({
      storyId,
      storyTitle: novel?.title || storyPurchases[0]?.novelTitle || `Bộ truyện #${storyId}`,
      storyAuthor: novel?.author || storyPurchases[0]?.authorName || 'Đang cập nhật',
      storyEditor: novel?.editor,
      storyCoverImage:
        novel?.coverImage ||
        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80',
      storySlug: novel?.slug,
      storyMainCategory: novel?.mainCategory,
      totalChapters,
      freeChaptersCount,
      totalVipChapters,
      isFullStoryBought,
      purchasedChapterIds: Array.from(purchasedChapterIdsSet),
      purchasedChapterNumbers: Array.from(purchasedChapterNumsSet),
      purchasedVipChaptersCount,
      totalSpentXu,
      lastPurchasedAt,
      purchaseBadgeType,
      novel,
    });
  }

  // Sắp xếp truyện mua gần nhất lên đầu
  summaries.sort((a, b) => b.lastPurchasedAt - a.lastPurchasedAt);

  return summaries;
}

/**
 * ==============================================================================
 * THÔNG BÁO TOÀN TRANG (GLOBAL BANNER) - TỐI ƯU READ/WRITE TRÊN 1 DOCUMENT DUY NHẤT
 * Document path: settings/global_banner
 * ==============================================================================
 */
export async function fetchGlobalBannerSettingsForAdmin(): Promise<GlobalBannerConfig> {
  const path = 'settings/global_banner';
  try {
    const snap = await getDoc(doc(db, 'settings', 'global_banner'));
    if (!snap.exists()) {
      return { isActive: false, message: '', updatedAt: null };
    }
    const data = snap.data();
    return {
      isActive: Boolean(data?.isActive),
      message: typeof data?.message === 'string' ? data.message : '',
      updatedAt:
        typeof data?.updatedAt?.toMillis === 'function'
          ? data.updatedAt.toMillis()
          : typeof data?.updatedAt === 'number'
          ? data.updatedAt
          : null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveGlobalBannerSettings(params: {
  isActive: boolean;
  message: string;
  adminEmail?: string | null;
}): Promise<GlobalBannerConfig> {
  const path = 'settings/global_banner';
  const effectiveEmail = auth.currentUser?.email || params.adminEmail;
  if (!checkIsAdmin(effectiveEmail)) {
    throw new Error('Quyền truy cập bị từ chối: Chỉ hoaamcac@gmail.com hoặc meoyeutien22@gmail.com mới có quyền cập nhật Thông Báo Toàn Trang.');
  }

  const trimmedMessage = String(params.message || '').trim().slice(0, 2000);
  const payload = {
    isActive: Boolean(params.isActive),
    message: trimmedMessage,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'settings', 'global_banner'), payload, { merge: true });
    const nextCache: GlobalBannerConfig = {
      isActive: payload.isActive,
      message: payload.message,
      updatedAt: Date.now(),
    };
    invalidateGlobalBannerCache(nextCache);
    return nextCache;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}



