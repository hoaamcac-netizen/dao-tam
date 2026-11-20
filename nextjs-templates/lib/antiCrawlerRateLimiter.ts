'use client';

import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

/**
 * ==============================================================================
 * LỚP 3 (NEXT.JS): CƠ CHẾ CHỐNG SPAM NỚI LỎNG CHO THIẾT BỊ DI ĐỘNG
 * ==============================================================================
 * - Ngưỡng giới hạn tăng gấp 2 lần: 60 lượt tải chương / 60 giây.
 * - Khi thao tác bị dồn cục trên máy yếu/lag:
 *   + TUYỆT ĐỐI KHÔNG khóa vĩnh viễn (`isBanned: true`) và KHÔNG gọi `signOut()`.
 *   + Chỉ áp dụng khóa tạm thời 1 phút + trả về Toast cảnh báo:
 *     "Thao tác quá nhanh, vui lòng chờ chút"
 * ==============================================================================
 */

export const ADMIN_EMAILS: string[] = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

export function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return ADMIN_EMAILS.some((adm) => adm.toLowerCase().trim() === clean);
}

export const BAN_WARNING_MESSAGE =
  'Tài khoản của bạn đã bị hạn chế do vi phạm quy định. Vui lòng liên hệ Admin.';

export const TEMP_LOCK_TOAST_MESSAGE = 'Thao tác quá nhanh, vui lòng chờ chút';

const RATE_CONFIG = {
  MAX_CHAPTERS_WINDOW: 60, // Tăng ngưỡng gấp 2 lần (từ 30 -> 60 chương/phút)
  WINDOW_MS: 60 * 1000, // 60 giây
  TEMP_LOCK_DURATION_MS: 60 * 1000, // Khóa tạm thời 1 phút
  STORAGE_KEY: 'daotam_chapter_fetch_timestamps',
  TEMP_LOCK_UNTIL_KEY: 'daotam_rate_limit_cooldown_until',
  BAN_FLAG_KEY: 'daotam_banned_notice_flag',
};

export interface CheckRateLimitResult {
  isBanned: boolean;
  isTempLocked?: boolean;
  cooldownSeconds?: number;
  message?: string;
  triggered?: boolean;
}

export function getTempLockRemainingMs(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw =
      sessionStorage.getItem(RATE_CONFIG.TEMP_LOCK_UNTIL_KEY) ||
      localStorage.getItem(RATE_CONFIG.TEMP_LOCK_UNTIL_KEY);
    if (!raw) return 0;
    const lockUntil = parseInt(raw, 10);
    if (Number.isNaN(lockUntil)) return 0;
    const remaining = lockUntil - Date.now();
    if (remaining <= 0) {
      sessionStorage.removeItem(RATE_CONFIG.TEMP_LOCK_UNTIL_KEY);
      localStorage.removeItem(RATE_CONFIG.TEMP_LOCK_UNTIL_KEY);
      return 0;
    }
    return remaining;
  } catch {
    return 0;
  }
}

/**
 * Theo dõi tần suất tải chương truyện — chỉ khóa tạm 1 phút + Toast khi vượt ngưỡng 60/phút
 */
export async function trackChapterFetchAndEnforceRateLimit(
  userId?: string | null,
  userEmail?: string | null,
  _chapterId?: string
): Promise<CheckRateLimitResult> {
  if (checkIsAdmin(userEmail)) {
    return { isBanned: false, isTempLocked: false };
  }

  const now = Date.now();

  const existingRemainingMs = getTempLockRemainingMs();
  if (existingRemainingMs > 0) {
    return {
      isBanned: false,
      isTempLocked: true,
      cooldownSeconds: Math.ceil(existingRemainingMs / 1000),
      message: `${TEMP_LOCK_TOAST_MESSAGE} (${Math.ceil(existingRemainingMs / 1000)}s)`,
    };
  }

  let timestamps: number[] = [];
  try {
    const raw = sessionStorage.getItem(RATE_CONFIG.STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        timestamps = parsed.filter(
          (t) => typeof t === 'number' && now - t < RATE_CONFIG.WINDOW_MS
        );
      }
    }
  } catch {
    timestamps = [];
  }

  timestamps.push(now);

  try {
    sessionStorage.setItem(RATE_CONFIG.STORAGE_KEY, JSON.stringify(timestamps));
  } catch {}

  if ((timestamps?.length || 0) > RATE_CONFIG.MAX_CHAPTERS_WINDOW) {
    console.warn(`[RateLimit] Quá 60 lần/phút (UID: ${userId || 'anonymous'}) -> Khóa tạm 1 phút`);

    const lockUntil = now + RATE_CONFIG.TEMP_LOCK_DURATION_MS;
    try {
      sessionStorage.setItem(RATE_CONFIG.TEMP_LOCK_UNTIL_KEY, String(lockUntil));
      localStorage.setItem(RATE_CONFIG.TEMP_LOCK_UNTIL_KEY, String(lockUntil));
      sessionStorage.removeItem(RATE_CONFIG.STORAGE_KEY);
    } catch {}

    return {
      isBanned: false,
      isTempLocked: true,
      cooldownSeconds: 60,
      message: TEMP_LOCK_TOAST_MESSAGE,
      triggered: true,
    };
  }

  return { isBanned: false, isTempLocked: false };
}

export const RATE_LIMIT_BAN_STORAGE_KEYS = [
  'isRateLimitBanned',
  'daotam_banned_notice_flag',
  'daotam_user_banned_notice',
  'daotam_chapter_fetch_timestamps',
  'daotam_access_timestamps',
  'daotam_rate_limit_cooldown_until',
];

export function clearLocalBanFlags(): void {
  if (typeof window === 'undefined') return;
  for (const key of RATE_LIMIT_BAN_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {}
  }
}

export function hasActiveBanNotice(): boolean {
  return false;
}

/**
 * Đồng bộ Real-time trạng thái khóa tài khoản do Admin thiết lập từ Firestore
 */
export function subscribeUserBanStatus(
  userId: string | null | undefined,
  callback: (isBanned: boolean) => void
): () => void {
  if (!userId || userId === 'guest') {
    callback(false);
    return () => {};
  }

  let isMounted = true;
  const userRef = doc(db, 'users', userId);

  getDoc(userRef)
    .then(async (snap) => {
      if (!isMounted) return;
      if (snap.exists()) {
        const data = snap.data() || {};
        const isLockedOrBanned = Boolean(
          data?.isLocked === true ||
            data?.isBanned === true ||
            data?.status === 'banned' ||
            data?.status === 'Bị khóa'
        );

        if (!isLockedOrBanned) {
          clearLocalBanFlags();
          if (auth?.currentUser) {
            try {
              await auth.currentUser.getIdToken(true);
            } catch {}
          }
          if (isMounted) callback(false);
        } else {
          callback(true);
        }
      } else {
        clearLocalBanFlags();
        callback(false);
      }
    })
    .catch((err) => {
      console.warn('[RateLimit] Lỗi kiểm tra trạng thái khóa user:', err);
      if (isMounted) callback(false);
    });

  return () => {
    isMounted = false;
  };
}
