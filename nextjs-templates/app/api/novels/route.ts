import { NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, query, limit, orderBy, where } from "firebase/firestore";

/**
 * ==============================================================================
 * API ROUTE FETCH TRUYỆN REAL-TIME (TẮT HOÀN TOÀN CACHE TRÊN VERCEL EDGE)
 * Vị trí file trong dự án Next.js: app/api/novels/route.ts
 *
 * 🛑 GIỚI HẠN NGHIÊM NGẶT LIMIT(25) ĐỂ BẢO VỆ GÓI SPARK FIRESTORE
 * ==============================================================================
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Cấu hình Firebase đồng bộ chính xác với dự án dao-tam
const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "gen-lang-client-0605440182",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDQEO0cRi-QQjB0SLqJuDXWI99764Whn9U",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0605440182.firebaseapp.com",
};

const app = (getApps()?.length || 0) > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const firestoreDbId = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || "ai-studio-otmctruynaudio26-f457f44e-237a-41f7-bd77-16850d388b24";
const db = getFirestore(app, firestoreDbId);

export async function GET(request?: Request) {
  try {
    const url = request?.url ? new URL(request.url) : null;
    const tab = url?.searchParams.get("tab") || "latest";
    const category = url?.searchParams.get("category") || "all";
    const format = url?.searchParams.get("format") || "all";
    const isShort = url?.searchParams.get("isShortStory");

    const novelsCol = collection(db, "novels");
    const constraints: any[] = [];

    // 1. GHÉP NỐI ĐIỀU KIỆN CATEGORY (AND Logic)
    if (category && category !== "all") {
      if (category === "truyen-sang-tac") {
        constraints.push(where("mainCategory", "==", "truyen-sang-tac"));
      } else {
        constraints.push(where("mainCategory", "==", category));
      }
    }

    // 2. GHÉP NỐI ĐIỀU KIỆN STATUS 'Truyện Full' (AND Logic)
    if (tab === "completed") {
      constraints.push(where("status", "in", ["Hoàn thành", "Full", "Completed"]));
    }

    // 3. GHÉP NỐI ĐIỀU KIỆN FORMAT 'Truyện Ngắn' (AND Logic)
    if (format === "short" || isShort === "true") {
      constraints.push(where("isShortStory", "==", true));
    } else if (format === "original") {
      constraints.push(where("isOriginal", "==", true));
    }

    // 4. SẮP XẾP
    if (tab === "hot") {
      constraints.push(orderBy("views", "desc"));
    } else {
      constraints.push(orderBy("lastChapterUpdatedAt", "desc"));
    }

    // 5. GIỚI HẠN SPARK-SAFE LIMIT(25)
    constraints.push(limit(25));

    const q = query(novelsCol, ...constraints);
    let snap;
    try {
      snap = await getDocs(q);
    } catch (queryErr: any) {
      const msg = queryErr?.message || String(queryErr);
      const indexUrlMatch = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)\]]+/);
      const compositeUrl = indexUrlMatch ? indexUrlMatch[0] : null;

      if (compositeUrl) {
        console.error(`[API Firebase Composite Index Required]: Cần tạo Composite Index tại:\n${compositeUrl}`);
      } else {
        console.error(`[API Firestore Query Error]:`, queryErr);
      }

      // TUYỆT ĐỐI KHÔNG tự động lấy truyện khác đắp vào khi xảy ra lỗi index!
      return NextResponse.json({
        success: false,
        count: 0,
        novels: [],
        compositeIndexUrl: compositeUrl,
        error: msg,
      });
    }

    const novels = (snap?.docs || []).map((docSnap) => {
      const data = docSnap.data() || {};
      const safeCategories = Array.isArray(data.categories)
        ? data.categories
        : Array.isArray(data.genres)
        ? data.genres
        : [];
      const safeGenres = Array.isArray(data.genres) ? data.genres : safeCategories;
      const safeChapters = Array.isArray(data.chapters)
        ? (data.chapters || []).map((c: any) => ({ ...c, content: '' }))
        : [];
      return {
        ...data,
        id: docSnap.id,
        categories: safeCategories,
        genres: safeGenres,
        lastChapterUpdatedAt: data.lastChapterUpdatedAt ?? data.updatedAt,
        chapters: safeChapters,
        totalChapters: Number(data.totalChapters || safeChapters?.length || 0),
      };
    });

    return NextResponse.json(
      {
        success: true,
        count: novels?.length || 0,
        timestamp: Date.now(),
        novels,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
          "Pragma": "no-cache",
          "Expires": "0",
          "Surrogate-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    console.error("Lỗi khi đọc Firestore với limit(25):", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Lỗi lấy dữ liệu từ Firestore",
        timestamp: Date.now(),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
