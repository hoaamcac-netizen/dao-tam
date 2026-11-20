"use client";

import React, { useState, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  limit, 
  getDocs, 
  QueryDocumentSnapshot,
  DocumentData 
} from "firebase/firestore";
import { 
  Search, 
  Sparkles, 
  AlertTriangle, 
  RotateCw, 
  X 
} from "lucide-react";
import firebaseAppConfig from "@/firebase-applet-config.json";
import StoryCard from "../components/StoryCard";

// Định nghĩa cấu trúc tác phẩm đồng bộ chuẩn với Firestore dao-tam
export interface Novel {
  id: string;
  title: string;
  author: string;
  coverImage?: string;
  description?: string;
  totalChapters?: number;
  latestChapterTitle?: string;
  status?: string;
  views?: number;
  flowerCount?: number;
  coinCount?: number;
  isCompleted?: boolean;
  categories?: string[];
  genres?: string[];
  tags?: string[];
  mainCategory?: string;
  updatedAt?: number;
  lastChapterUpdatedAt?: number;
  createdAt?: number;
}

// Khởi tạo Firebase Firestore kết nối chính xác theo cấu hình hệ thống
const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || firebaseAppConfig.projectId,
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || firebaseAppConfig.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || firebaseAppConfig.authDomain,
};

const app = (getApps()?.length || 0) > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const firestoreDbId = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || firebaseAppConfig.firestoreDatabaseId;
const db = getFirestore(app, firestoreDbId);

// Error logging helper chuẩn Firebase Skill
enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.warn("Firestore Error: ", JSON.stringify(errInfo));
}

// Chuyển đổi Firestore document snapshot sang Novel interface
function transformDocToNovel(docSnap: QueryDocumentSnapshot<DocumentData>): Novel {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    title: data.title || "Tác phẩm chưa đặt tên",
    author: data.author || "Đang cập nhật",
    coverImage: data.coverImage || "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80",
    description: data.description || "",
    totalChapters: Number(data.totalChapters || (Array.isArray(data.chapters) ? data.chapters?.length || 0 : 0)),
    latestChapterTitle: data.latestChapterTitle || (data.totalChapters ? `Chương ${data.totalChapters}` : "Chương 1"),
    status: data.status || "Đang ra",
    views: Number(data.views || 0),
    flowerCount: Number(data.flowerCount || 0),
    coinCount: Number(data.coinCount || 0),
    isCompleted: Boolean(data.isCompleted || data.status === "Hoàn thành" || data.status === "Full"),
    categories: Array.isArray(data.categories) ? data.categories : [],
    genres: Array.isArray(data.genres) ? data.genres : (Array.isArray(data.categories) ? data.categories : []),
    tags: Array.isArray(data.tags) ? data.tags : (Array.isArray(data.categories) ? data.categories : []),
    mainCategory: data.mainCategory || "truyen-hot",
    updatedAt: data.updatedAt ? Number(data.updatedAt) : undefined,
    lastChapterUpdatedAt: data.lastChapterUpdatedAt ? Number(data.lastChapterUpdatedAt) : (data.updatedAt ? Number(data.updatedAt) : undefined),
    createdAt: data.createdAt ? Number(data.createdAt) : undefined,
  };
}

// Danh sách từ khóa gợi ý mặc định
const SUGGESTED_TAGS = [
  "Đam Mỹ",
  "Hào Môn",
  "Trọng Sinh",
  "Ngọt Sủng",
  "Tiên Hiệp",
  "Cung Đấu",
  "Xuyên Nhanh",
  "Hiện Đại"
];

interface SearchBarProps {
  onSelectNovel?: (novel: Novel) => void;
  className?: string;
}

export default function SearchBar({ onSelectNovel, className = "" }: SearchBarProps) {
  // 1. Quota Protection: State từ khóa chỉ lưu nội bộ input, TUYỆT ĐỐI KHÔNG gọi Firebase trong onChange
  const [keyword, setKeyword] = useState<string>("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Trạng thái tìm kiếm
  const [results, setResults] = useState<Novel[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [searchLabel, setSearchLabel] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Kỹ thuật 1: Tìm theo tên truyện bằng Prefix Search (where >= keyword & where <= keyword + \uf8ff)
   * Giới hạn limit(10) nghiêm ngặt để bảo vệ Quota Spark
   * CHỈ ĐƯỢC KÍCH HOẠT khi người dùng bấm phím Enter hoặc click vào nút 'Tìm Kiếm' màu hồng
   */
  const executeTitleSearch = useCallback(async (targetTerm?: string) => {
    const term = (targetTerm !== undefined ? targetTerm : keyword).trim();
    if (!term) return;

    setIsLoading(true);
    setError(null);
    setActiveTag(null);
    setSearchLabel(`Tên truyện: "${term}"`);

    try {
      const novelsCol = collection(db, "novels");
      
      // Prefix Search kỹ thuật chuẩn Firestore: where('title', '>=', keyword) & where('title', '<=', keyword + '\uf8ff')
      const q = query(
        novelsCol,
        where("title", ">=", term),
        where("title", "<=", term + "\uf8ff"),
        limit(10)
      );

      const snap = await getDocs(q);
      const items: Novel[] = (snap?.docs || []).map(transformDocToNovel);
      setResults(items);
      setHasSearched(true);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, "novels");
      console.warn("[SearchBar] Lỗi khi tìm kiếm prefix theo tiêu đề:", err);

      let msg = "Đã xảy ra lỗi mạng hoặc lỗi truy vấn cơ sở dữ liệu. Vui lòng kiểm tra kết nối mạng và thử lại.";
      if (err?.message?.includes("Quota") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
        msg = "Đã vượt quá hạn mức đọc (Quota) của gói Firestore Spark. Hệ thống sẽ tự động đặt lại vào ngày tiếp theo.";
      } else if (err?.message) {
        msg = `Lỗi truy vấn: ${err.message}`;
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [keyword]);

  /**
   * Kỹ thuật 2: Tìm theo Từ khóa gợi ý bằng where('tags', 'array-contains', clickedTag)
   * Giới hạn limit(20) nghiêm ngặt để bảo vệ Quota Spark
   * Kích hoạt khi click vào các nút tag gợi ý bên dưới
   */
  const executeTagSearch = useCallback(async (tag: string) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;

    // Cập nhật giao diện input theo tag được bấm
    setKeyword(cleanTag);
    setActiveTag(cleanTag);
    setIsLoading(true);
    setError(null);
    setSearchLabel(`Từ khóa: "${cleanTag}"`);

    try {
      const novelsCol = collection(db, "novels");
      
      // Truy vấn where('tags', 'array-contains', clickedTag) với limit(20)
      const q = query(
        novelsCol,
        where("tags", "array-contains", cleanTag),
        limit(20)
      );

      const snap = await getDocs(q);
      let items: Novel[] = (snap?.docs || []).map(transformDocToNovel);

      // Dự phòng nhẹ: Nếu cơ sở dữ liệu lưu mảng dưới trường 'categories' thay vì 'tags'
      if ((items?.length || 0) === 0) {
        try {
          const fallbackQ = query(
            novelsCol,
            where("categories", "array-contains", cleanTag),
            limit(20)
          );
          const fallbackSnap = await getDocs(fallbackQ);
          if (!fallbackSnap.empty) {
            items = (fallbackSnap?.docs || []).map(transformDocToNovel);
          }
        } catch {
          // Bỏ qua lỗi fallback phụ
        }
      }

      setResults(items);
      setHasSearched(true);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, "novels");
      console.warn(`[SearchBar] Lỗi khi tìm kiếm theo tag [${cleanTag}]:`, err);

      let msg = "Đã xảy ra lỗi mạng hoặc lỗi truy vấn cơ sở dữ liệu khi tìm kiếm theo từ khóa. Vui lòng thử lại.";
      if (err?.message?.includes("Quota") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
        msg = "Đã vượt quá hạn mức đọc (Quota) của gói Firestore Spark. Hệ thống sẽ tự động đặt lại vào ngày tiếp theo.";
      } else if (err?.message) {
        msg = `Lỗi truy vấn: ${err.message}`;
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Xóa kết quả tìm kiếm và quay về trạng thái ban đầu
  const handleClear = () => {
    setKeyword("");
    setActiveTag(null);
    setResults([]);
    setHasSearched(false);
    setError(null);
    setSearchLabel("");
  };

  return (
    <div className={`w-full ${className}`}>
      {/* KHUNG TÌM KIẾM CHỦ ĐẠO TONE MÀU HỒNG */}
      <div className="bg-gradient-to-r from-pink-50/90 via-white to-rose-50/90 dark:from-slate-900/90 dark:via-slate-800/90 dark:to-slate-900/90 rounded-2xl p-4 sm:p-6 border border-pink-200/70 dark:border-pink-950/60 shadow-md">
        
        {/* Form tìm kiếm: Gộp ô input và nút tìm kiếm lên cùng 1 hàng bằng Flexbox (flex-row, items-center) trên cả Mobile & Desktop */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeTitleSearch();
          }}
          className="relative flex flex-row items-center gap-2 sm:gap-2.5 w-full"
        >
          {/* Ô nhập từ khóa (Chặn spam API: onChange CHỈ CẬP NHẬT STATE LOCAL, TUYỆT ĐỐI KHÔNG GỌI API) */}
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none text-pink-500">
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>

            <input
              type="text"
              value={keyword}
              onChange={(e) => {
                // TUYỆT ĐỐI KHÔNG gọi API Firebase mỗi khi người dùng gõ phím (onChange)
                setKeyword(e.target.value);
              }}
              placeholder="Nhập tên truyện cần tìm (Bấm Enter hoặc click Tìm Kiếm)..."
              className="w-full pl-9 sm:pl-11 pr-8 sm:pr-10 py-2.5 sm:py-3 rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-900/80 text-xs sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 shadow-inner transition-all"
            />

            {keyword.trim() && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3.5 flex items-center text-slate-400 hover:text-pink-600 cursor-pointer transition"
                title="Xóa ô tìm kiếm"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>

          {/* NÚT 'TÌM KIẾM' MÀU HỒNG CHỦ ĐẠO - GỘP CHUNG 1 HÀNG TRÊN CẢ MOBILE & DESKTOP */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="submit"
              disabled={isLoading || !keyword.trim()}
              className="px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-bold text-xs sm:text-sm shadow-md shadow-pink-600/25 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer transition transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              title="Tìm Kiếm"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="hidden sm:inline">Đang tìm...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden sm:inline">Tìm Kiếm</span>
                </>
              )}
            </button>

            {hasSearched && (
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer shrink-0"
              >
                Đóng
              </button>
            )}
          </div>
        </form>

        {/* CÁC NÚT TỪ KHÓA GỢI Ý (ĐAM MỸ, HÀO MÔN, TRỌNG SINH...) */}
        <div className="mt-3.5 pt-3 border-t border-pink-100/70 dark:border-pink-950/40 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-pink-700 dark:text-pink-300 flex items-center gap-1">
            <span>🔥</span> Từ khóa gợi ý:
          </span>
          {(SUGGESTED_TAGS || []).map((tag) => {
            const isSelected = activeTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => executeTagSearch(tag)}
                disabled={isLoading}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer shadow-2xs border ${
                  isSelected
                    ? "bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-600/20 scale-105"
                    : "bg-white dark:bg-slate-800 border-pink-200 dark:border-pink-900/60 text-slate-700 dark:text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 hover:border-pink-400"
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>

        {/* TRẠNG THÁI LOADING: HIỂN THỊ CHỮ HOẶC SPINNER MÀU HỒNG THEO YÊU CẦU */}
        {isLoading && (
          <div className="mt-4 pt-3 border-t border-pink-100 dark:border-pink-950/40 flex items-center justify-center gap-2.5 text-pink-600 dark:text-pink-400 font-bold text-xs sm:text-sm animate-pulse">
            <div className="w-4 h-4 border-2 border-pink-600 dark:border-pink-400 border-t-transparent rounded-full animate-spin" />
            <span>Đang tìm kiếm tác phẩm từ cơ sở dữ liệu Firestore...</span>
          </div>
        )}

        {/* BẮT BUỘC: NẾU CÓ LỖI MẠNG HOẶC LỖI TRUY VẤN, HIỂN THỊ CẢNH BÁO BẰNG BANNER NỀN MÀU VÀNG, TUYỆT ĐỐI KHÔNG DÙNG MÀU ĐỎ */}
        {error && (
          <div className="mt-4 p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-in fade-in duration-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="font-bold block">Cảnh báo kết nối &amp; truy vấn:</span>
              <span className="mt-0.5 text-xs text-amber-800 dark:text-amber-300 block leading-relaxed">
                {error}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (activeTag) {
                  executeTagSearch(activeTag);
                } else {
                  executeTitleSearch();
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition flex items-center gap-1 cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* THÔNG BÁO KHI KHÔNG TÌM THẤY TRUYỆN: "Không tìm thấy tác phẩm phù hợp" */}
        {hasSearched && (results?.length || 0) === 0 && !isLoading && !error && (
          <div className="mt-4 p-4 text-center rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-dashed border-pink-200 dark:border-pink-900 text-xs sm:text-sm text-pink-700 dark:text-pink-300">
            <span className="font-semibold block">Không tìm thấy tác phẩm phù hợp</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Không có truyện nào khớp với {searchLabel}. Hãy thử nhập từ khóa ngắn hơn hoặc chọn tag gợi ý phía trên.
            </span>
          </div>
        )}

        {/* HIỂN THỊ KẾT QUẢ TÌM KIẾM KHI CÓ DỮ LIỆU */}
        {hasSearched && (results?.length || 0) > 0 && !isLoading && (
          <div className="mt-5 pt-4 border-t border-pink-100 dark:border-pink-950/40 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-pink-600" />
                <span>Kết quả tìm kiếm cho {searchLabel}:</span>
                <span className="px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300 font-extrabold text-[11px]">
                  {results?.length || 0} tác phẩm
                </span>
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-pink-600 hover:underline font-semibold cursor-pointer"
              >
                Đóng kết quả
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {(results || []).map((novel) => (
                <StoryCard
                  key={novel.id}
                  novel={novel}
                  variant="catalog"
                  onClick={() => {
                    if (onSelectNovel) onSelectNovel(novel);
                  }}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
