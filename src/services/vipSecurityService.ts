/**
 * VIP Security & Currency Service - Vercel Serverless Ready
 * Đảm bảo an toàn tuyệt đối cho hệ thống khóa VIP, tiền tệ Xu và chia nhuận bút tác giả.
 * Loại bỏ hoàn toàn lỗ hổng sửa LocalStorage/inspect element ở phía Client.
 */

import { UserProfile, Novel, Chapter, PurchaseHistoryItem } from '../types';

export interface UnlockVipResponse {
  success: boolean;
  message: string;
  newXuBalance: number;
  unlockedChapters: Record<string, string[]>;
  unlockedFullBooks: string[];
  purchaseRecord?: PurchaseHistoryItem;
  authorRoyaltyEarned?: {
    authorId: string;
    earnedXu: number;
    royaltyRate: number;
  };
  error?: string;
}

export interface SecureChapterResponse {
  success: boolean;
  isLocked: boolean;
  content: string;
  isVip: boolean;
  priceXu: number;
  unlocked: boolean;
}

/**
 * Gọi API Serverless an toàn để mở khóa chương lẻ hoặc trọn bộ truyện
 * Server sẽ kiểm tra số dư thực tế, trừ Xu, cấp quyền và tính nhuận bút cho Tác Giả
 */
export async function unlockVipItemOnServer(params: {
  userId: string;
  userEmail: string;
  userName: string;
  novelId: string;
  chapterId?: string;
  chapterNumber?: number;
  type: 'chapter' | 'full_book';
  novelTitle: string;
  authorName: string;
  editorName?: string;
  isExclusive?: boolean;
  isEditor?: boolean;
  isOriginal?: boolean;
  clientBalance?: number;
  price?: number;
}): Promise<UnlockVipResponse> {
  try {
    const res = await fetch('/api/vip/unlock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || `Lỗi server (${res.status})`);
    }

    const data: UnlockVipResponse = await res.json();
    return data;
  } catch (err: any) {
    console.error('[vipSecurityService] Unlock error:', err);
    return {
      success: false,
      message: err.message || 'Không thể kết nối đến máy chủ bảo mật VIP',
      newXuBalance: 0,
      unlockedChapters: {},
      unlockedFullBooks: [],
      error: err.message,
    };
  }
}

/**
 * Kiểm tra quyền đọc chương và tải nội dung được mã hóa/bảo vệ từ Server
 * Nếu chưa mở khóa VIP, Server chỉ trả về đoạn trích mẫu, không gửi toàn bộ text về client
 */
export async function getSecureChapterContent(
  novelId: string,
  chapterId: string,
  userId: string
): Promise<SecureChapterResponse> {
  try {
    const res = await fetch('/api/chapter/secure-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ novelId, chapterId, userId }),
    });

    if (!res.ok) {
      throw new Error('Lỗi khi tải nội dung chương an toàn');
    }

    return await res.json();
  } catch (err: any) {
    console.warn('[vipSecurityService] Get secure chapter fallback:', err);
    return {
      success: false,
      isLocked: true,
      content: '',
      isVip: true,
      priceXu: 5,
      unlocked: false,
    };
  }
}

/**
 * Gửi yêu cầu rút nhuận bút qua API server (Kiểm tra điều kiện >= 100 Xu)
 */
export async function submitAuthorPayoutOnServer(data: {
  authorId: string;
  authorName: string;
  authorEmail: string;
  amountXu: number;
  amountVnd: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note?: string;
}): Promise<{ success: boolean; message: string; remainingXu?: number }> {
  try {
    const res = await fetch('/api/author/payout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || result.message || 'Lỗi khi gửi yêu cầu rút tiền');
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Không thể kết nối đến máy chủ thanh toán',
    };
  }
}
