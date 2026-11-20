import React from "react";
import ClientNovelList from "./ClientNovelList";
import DynamicContinueReadingBanner from "../components/DynamicContinueReadingBanner";
import Header from "../components/Header";
import type { GlobalBannerData } from "../components/GlobalBanner";
import firebaseAppletConfig from "../../firebase-applet-config.json";

/**
 * ==============================================================================
 * RENDER TRANG CHỦ NEXT.JS (APP ROUTER) - VỊ TRÍ: app/page.tsx
 * GIAO DIỆN TONE MÀU HỒNG NGỌT NGÀO & SANG TRỌNG THEO YÊU CẦU
 *
 * 🛑 TẮT HOÀN TOÀN CACHE TẠI TẦNG SERVER VERCEL CHO MỌI NGƯỜI DÙNG:
 * - dynamic = 'force-dynamic'  => Render server theo từng request, không tạo file HTML tĩnh
 * - revalidate = 0             => Không lưu cache ISR
 * - fetch(..., { cache: 'no-store' }) => Bỏ qua cache Vercel Edge Server
 *
 * Dù người dùng là khách vãng lai (Guest) hay Admin:
 * Đều nhận cùng một danh sách truyện thời gian thực từ Firestore, không bị hiện lại truyện đã xóa.
 * ==============================================================================
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function getInitialNovels() {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "https://dao-tam-doc-truyen.vercel.app";
    const res = await fetch(`${baseUrl}/api/novels`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.novels || [];
  } catch (error) {
    console.warn("Could not fetch initial novels from API, falling back to client load:", error);
    return [];
  }
}

/**
 * Fetch 1 document duy nhất settings/global_banner tại Server Component
 * để tối ưu 0 lượt Read của Client và tăng tốc độ hiển thị trên điện thoại.
 */
async function getInitialGlobalBanner(): Promise<GlobalBannerData | null> {
  try {
    const projectId =
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId;
    const apiKey =
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY || firebaseAppletConfig.apiKey;
    const databaseId =
      process.env.NEXT_PUBLIC_FIRESTORE_DB_ID ||
      firebaseAppletConfig.firestoreDatabaseId ||
      "(default)";

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(
      databaseId
    )}/documents/settings/global_banner?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return null;
    }

    const docJson = await res.json();
    const fields = docJson?.fields;
    if (!fields) return null;

    const isActive = Boolean(fields.isActive?.booleanValue);
    const message = String(fields.message?.stringValue || "");
    const updatedAt = fields.updatedAt?.timestampValue || null;

    return {
      isActive,
      message,
      updatedAt,
    };
  } catch (error) {
    console.warn("Could not fetch global_banner on server:", error);
    return null;
  }
}

export default async function HomePage() {
  const [initialNovels, initialBanner] = await Promise.all([
    getInitialNovels(),
    getInitialGlobalBanner(),
  ]);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-pink-50/60 via-white to-pink-50/40 dark:from-[#180a14] dark:via-slate-950 dark:to-[#180a14] text-slate-900 dark:text-slate-100 transition-colors">
      <Header />

      {/* Thanh nhắc nhở đọc tiếp đặt ngay đầu Trang chủ dưới Header (dynamic ssr:false) */}
      <DynamicContinueReadingBanner />

      {/* Component Client đồng bộ Firestore Realtime cho MỌI độc giả (dù chưa đăng nhập hay đã đăng nhập) */}
      <ClientNovelList
        initialNovels={initialNovels}
        initialBanner={initialBanner}
      />
    </main>
  );
}
