import { getDoc, doc } from 'firebase/firestore';
import { auth, db, checkIsAdmin } from '../firebase/config';
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  safeSessionGetItem,
  safeSessionSetItem,
  safeSessionRemoveItem,
  safeJsonParse,
} from '../utils/safeStorage';

/**
 * ==============================================================================
 * LỚP 3: CƠ CHẾ CHỐNG SPAM NỚI LỎNG CHO THIẾT BỊ DI ĐỘNG (ANTI-SPAM / RATE LIMIT)
 * ==============================================================================
 * - Ngưỡng giới hạn đã tăng gấp 2 lần: 60 lượt tải chương / 60 giây.
 * - Khi điện thoại lag khiến click dồn cục vượt ngưỡng:
 *   + KHÔNG khóa vĩnh viễn (isBanned: true) và KHÔNG ép signOut().
 *   + Chỉ kích hoạt khóa tạm thời 1 phút (60 giây) + hiển thị Toast cảnh báo nhẹ nhàng:
 *     "Thao tác quá nhanh, vui lòng chờ chút"
 * ==============================================================================
 */

export const RATE_LIMIT_CONFIG = {
  MAX_CHAPTERS_WINDOW: 60, // Tăng ngưỡng gấp 2 lần (từ 30 -> 60 chương/phút)
  WINDOW_MS: 60 * 1000, // Trong vòng 60 giây
  TEMP_LOCK_DURATION_MS: 60 * 1000, // Khóa tạm thời 1 phút
  STORAGE_KEY: 'daotam_access_timestamps',
  TEMP_LOCK_UNTIL_KEY: 'daotam_rate_limit_cooldown_until',
  BAN_FLAG_KEY: 'daotam_user_banned_notice',
};

export const BAN_MESSAGE =
  'Tài khoản của bạn đã bị hạn chế do vi phạm quy định. Vui lòng liên hệ Admin.';

export const TEMP_LOCK_TOAST_MESSAGE = 'Thao tác quá nhanh, vui lòng chờ chút';

export interface RateLimitCheckResult {
  isBanned: boolean;
  isTempLocked?: boolean;
  cooldownSeconds?: number;
  message?: string;
  triggeredJustNow?: boolean;
}

/**
 * Kiểm tra xem người dùng có đang trong thời gian chờ tạm thời 1 phút hay không
 */
export function getTempLockRemainingMs(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw =
      safeSessionGetItem(RATE_LIMIT_CONFIG.TEMP_LOCK_UNTIL_KEY) ||
      safeGetItem(RATE_LIMIT_CONFIG.TEMP_LOCK_UNTIL_KEY);
    if (!raw) return 0;
    const lockUntil = parseInt(raw, 10);
    if (Number.isNaN(lockUntil)) return 0;
    const remaining = lockUntil - Date.now();
    if (remaining <= 0) {
      safeSessionRemoveItem(RATE_LIMIT_CONFIG.TEMP_LOCK_UNTIL_KEY);
      safeRemoveItem(RATE_LIMIT_CONFIG.TEMP_LOCK_UNTIL_KEY);
      return 0;
    }
    return remaining;
  } catch {
    return 0;
  }
}

/**
 * Kiểm tra và ghi nhận lượt tải chương của người dùng (Nới lỏng 2x, chỉ khóa tạm 1 phút)
 */
export async function recordChapterAccessAndCheckRateLimit(
  userId?: string | null,
  userEmail?: string | null,
  _novelId?: string,
  _chapterId?: string
): Promise<RateLimitCheckResult> {
  // 1. Nếu là Admin: Bỏ qua mọi giới hạn tốc độ
  if (checkIsAdmin(userEmail)) {
    return { isBanned: false, isTempLocked: false };
  }

  const now = Date.now();

  // 2. Nếu đang trong thời gian khóa tạm 1 phút -> tiếp tục trả Toast nhẹ nhàng, KHÔNG ban vĩnh viễn
  const existingRemainingMs = getTempLockRemainingMs();
  if (existingRemainingMs > 0) {
    return {
      isBanned: false,
      isTempLocked: true,
      cooldownSeconds: Math.ceil(existingRemainingMs / 1000),
      message: `${TEMP_LOCK_TOAST_MESSAGE} (${Math.ceil(existingRemainingMs / 1000)}s)`,
    };
  }

  // 3. Lấy danh sách timestamp truy cập trong vòng 60 giây gần nhất
  let timestamps: number[] = [];
  const raw =
    safeSessionGetItem(RATE_LIMIT_CONFIG.STORAGE_KEY) ||
    safeGetItem(RATE_LIMIT_CONFIG.STORAGE_KEY);
  const parsed = safeJsonParse<unknown[]>(raw, []);
  if (Array.isArray(parsed)) {
    timestamps = parsed.filter(
      (ts): ts is number => typeof ts === 'number' && now - ts < RATE_LIMIT_CONFIG.WINDOW_MS
    );
  }

  timestamps.push(now);

  const serialized = JSON.stringify(timestamps);
  safeSessionSetItem(RATE_LIMIT_CONFIG.STORAGE_KEY, serialized);
  safeSetItem(RATE_LIMIT_CONFIG.STORAGE_KEY, serialized);

  // 4. KIỂM TRA NGƯỠNG MỚI (60 chương / 60 giây): chỉ áp dụng khóa tạm thời 1 phút + Toast
  if (timestamps.length > RATE_LIMIT_CONFIG.MAX_CHAPTERS_WINDOW) {
    console.warn(
      `[RateLimit] Thao tác quá nhanh từ user: ${userId || 'anonymous'} - áp dụng chờ tạm 1 phút`
    );

    const lockUntil = now + RATE_LIMIT_CONFIG.TEMP_LOCK_DURATION_MS;
    safeSessionSetItem(RATE_LIMIT_CONFIG.TEMP_LOCK_UNTIL_KEY, String(lockUntil));
    safeSetItem(RATE_LIMIT_CONFIG.TEMP_LOCK_UNTIL_KEY, String(lockUntil));
    safeSessionRemoveItem(RATE_LIMIT_CONFIG.STORAGE_KEY);
    safeRemoveItem(RATE_LIMIT_CONFIG.STORAGE_KEY);

    return {
      isBanned: false,
      isTempLocked: true,
      cooldownSeconds: 60,
      message: TEMP_LOCK_TOAST_MESSAGE,
      triggeredJustNow: true,
    };
  }

  return { isBanned: false, isTempLocked: false };
}

export const RATE_LIMIT_BAN_STORAGE_KEYS = [
  'isRateLimitBanned',
  'daotam_user_banned_notice',
  'daotam_banned_notice_flag',
  'daotam_chapter_fetch_timestamps',
  'daotam_access_timestamps',
  'daotam_rate_limit_cooldown_until',
];

/**
 * Xóa sạch toàn bộ các biến cờ phạt rate-limit ở LocalStorage và SessionStorage
 */
export function clearLocalBanFlags(): void {
  if (typeof window === 'undefined') return;
  for (const key of RATE_LIMIT_BAN_STORAGE_KEYS) {
    safeRemoveItem(key);
    safeSessionRemoveItem(key);
  }
}

/**
 * Kiểm tra cờ khóa cục bộ (đã tắt auto-ban từ rate-limit nên mặc định trả false)
 */
export function checkHasActiveBanNotice(): boolean {
  return false;
}

export function clearBanNotice(): void {
  clearLocalBanFlags();
}

/**
 * Đồng bộ Real-time trạng thái khóa tài khoản do Admin xử phạt trực tiếp từ Firestore
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
        const data = snap.data();
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
