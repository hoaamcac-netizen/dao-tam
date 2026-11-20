"use client";

import React, { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Megaphone } from "lucide-react";
import { db } from "../lib/firebase";

export interface GlobalBannerData {
  isActive: boolean;
  message: string;
  updatedAt?: number | string | null;
}

interface GlobalBannerProps {
  /**
   * Ưu tiên nhận dữ liệu fetch sẵn từ Server Component (app/page.tsx)
   * để đạt 0 Firestore Read trên Client.
   */
  initialBanner?: GlobalBannerData | null;
}

/**
 * ==============================================================================
 * GLOBAL BANNER - THÔNG BÁO TOÀN TRANG (ĐẶT NGAY TRÊN SEARCH BAR)
 * ==============================================================================
 * - TUYỆT ĐỐI KHÔNG dùng onSnapshot để bảo vệ lượt Read Firebase.
 * - Nếu chưa có initialBanner từ SSR, chỉ gọi getDoc ĐÚNG 1 LẦN DUY NHẤT khi mount.
 * - Nền màu vàng ấm, chữ đậm (nâu sẫm/đen), TUYỆT ĐỐI KHÔNG dùng màu đỏ.
 * - Ẩn hoàn toàn (return null) khi isActive === false hoặc message rỗng.
 * ==============================================================================
 */
export default function GlobalBanner({ initialBanner }: GlobalBannerProps) {
  const [banner, setBanner] = useState<GlobalBannerData | null>(
    initialBanner ?? null
  );
  const hasFetchedRef = useRef<boolean>(initialBanner !== undefined);

  useEffect(() => {
    if (initialBanner !== undefined) {
      setBanner(initialBanner);
      hasFetchedRef.current = true;
      return;
    }

    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    let isMounted = true;
    const fetchBannerOnce = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "global_banner"));
        if (!isMounted) return;
        if (snap.exists()) {
          const data = snap.data();
          setBanner({
            isActive: Boolean(data?.isActive),
            message: typeof data?.message === "string" ? data.message : "",
            updatedAt:
              typeof data?.updatedAt?.toMillis === "function"
                ? data.updatedAt.toMillis()
                : data?.updatedAt ?? null,
          });
        } else {
          setBanner(null);
        }
      } catch (err) {
        console.warn("[GlobalBanner] Không thể tải thông báo toàn trang:", err);
      }
    };

    fetchBannerOnce();

    return () => {
      isMounted = false;
    };
  }, [initialBanner]);

  const cleanMessage = banner?.message?.trim() || "";
  if (!banner || !banner.isActive || !cleanMessage) {
    return null;
  }

  return (
    <section
      aria-label="Thông báo toàn trang"
      className="w-full rounded-2xl bg-gradient-to-r from-yellow-100 via-amber-100 to-yellow-100 dark:from-yellow-300 dark:via-amber-200 dark:to-yellow-300 border border-yellow-400/90 dark:border-yellow-500 px-3.5 py-2.5 sm:px-5 sm:py-3.5 shadow-xs"
    >
      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-yellow-400 dark:bg-amber-400 text-amber-950 flex items-center justify-center shrink-0 shadow-2xs mt-0.5 sm:mt-0">
          <Megaphone className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-bold text-amber-950 leading-relaxed whitespace-pre-line break-words">
            {cleanMessage}
          </p>
        </div>
      </div>
    </section>
  );
}
