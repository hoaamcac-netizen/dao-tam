import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Megaphone } from 'lucide-react';
import { db } from '../firebase/config';

export interface GlobalBannerConfig {
  isActive: boolean;
  message: string;
  updatedAt?: number | null;
}

// Cache trong phiên nhằm bảo đảm tối đa CHỈ 1 LẦN getDoc duy nhất khi tải trang chủ (KHÔNG dùng onSnapshot)
let cachedBanner: GlobalBannerConfig | null | undefined = undefined;
let inflightBannerPromise: Promise<GlobalBannerConfig | null> | null = null;

export function invalidateGlobalBannerCache(nextValue?: GlobalBannerConfig | null) {
  cachedBanner = nextValue;
  inflightBannerPromise = null;
}

export async function fetchGlobalBannerOnce(): Promise<GlobalBannerConfig | null> {
  if (cachedBanner !== undefined) {
    return cachedBanner;
  }
  if (inflightBannerPromise) {
    return inflightBannerPromise;
  }

  inflightBannerPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'global_banner'));
      if (snap.exists()) {
        const data = snap.data();
        const normalized: GlobalBannerConfig = {
          isActive: Boolean(data?.isActive),
          message: typeof data?.message === 'string' ? data.message : '',
          updatedAt:
            typeof data?.updatedAt?.toMillis === 'function'
              ? data.updatedAt.toMillis()
              : typeof data?.updatedAt === 'number'
              ? data.updatedAt
              : null,
        };
        cachedBanner = normalized;
        return normalized;
      }
      cachedBanner = null;
      return null;
    } catch (err) {
      console.warn('[GlobalBanner] Không thể tải thông báo toàn trang:', err);
      cachedBanner = null;
      return null;
    } finally {
      inflightBannerPromise = null;
    }
  })();

  return inflightBannerPromise;
}

export const GlobalBanner: React.FC = () => {
  const [banner, setBanner] = useState<GlobalBannerConfig | null>(() =>
    cachedBanner !== undefined ? cachedBanner : null
  );

  useEffect(() => {
    let isMounted = true;
    fetchGlobalBannerOnce().then((res) => {
      if (isMounted) {
        setBanner(res);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const cleanMessage = banner?.message?.trim() || '';
  if (!banner || !banner.isActive || !cleanMessage) {
    return null;
  }

  return (
    <section
      aria-label="Thông báo toàn trang"
      className="w-full mb-4 sm:mb-5 rounded-2xl bg-gradient-to-r from-yellow-100 via-amber-100 to-yellow-100 dark:from-yellow-300 dark:via-amber-200 dark:to-yellow-300 border border-yellow-400/90 dark:border-yellow-500 px-3.5 py-2.5 sm:px-5 sm:py-3.5 shadow-xs"
    >
      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-yellow-400 dark:bg-amber-400 text-amber-950 flex items-center justify-center shrink-0 shadow-2xs mt-0.5 sm:mt-0">
          <Megaphone className="w-4 h-4 shrink-0" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-bold text-amber-950 leading-relaxed whitespace-pre-line break-words">
            {cleanMessage}
          </p>
        </div>
      </div>
    </section>
  );
};
