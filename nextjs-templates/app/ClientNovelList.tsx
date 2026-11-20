"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { 
  collection, 
  query, 
  orderBy, 
  where, 
  limit, 
  startAfter, 
  getDocs, 
  QueryDocumentSnapshot,
  DocumentData
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Flame, 
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCw,
} from "lucide-react";
import GlobalBanner, { type GlobalBannerData } from "../components/GlobalBanner";
import StoryCard from "../components/StoryCard";
import FilterMenu from "../components/FilterMenu";
import Top10HotSidebar from "../components/Top10HotSidebar";
import { getGenreConfigById, type CategoryFilterId } from "../lib/genreConfig";

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
  dailyViews?: number;
  flowerCount?: number;
  coinCount?: number;
  isCompleted?: boolean;
  isFull?: boolean;
  categories?: string[];
  genres?: string[];
  mainCategory?: string;
  isOriginal?: boolean;
  isShortStory?: boolean;
  fullBookPriceXu?: number;
  fullBookDiscountPriceXu?: number;
  updatedAt?: number;
  lastChapterUpdatedAt?: number;
  createdAt?: number;
}

import SearchBar from "./SearchBar";

const PAGE_SIZE = 25; // Giới hạn nghiêm ngặt 25 bộ truyện mỗi trang theo đúng yêu cầu bảo vệ gói Spark

type TabType = "hot" | "latest" | "completed";

interface PageCacheItem {
  novels: Novel[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasNext: boolean;
}

export default function ClientNovelList({
  initialNovels,
  initialBanner,
}: {
  initialNovels?: Novel[];
  initialBanner?: GlobalBannerData | null;
}) {
  // ============================================================================
  // 1. STATE BẢNG VÀNG ĐỀ CỬ (SLIDER TỰ ĐỘNG TRƯỢT 4.5S TRÊN UI, 0 FIRESTORE READ)
  // GIAI ĐOẠN 1: BẮT BUỘC dùng CSS Tailwind Responsive, KHÔNG dùng window.innerWidth
  // ============================================================================
  const [mobileSlide, setMobileSlide] = useState<number>(0);
  const [desktopSlide, setDesktopSlide] = useState<number>(0);
  const [isSlidePaused, setIsSlidePaused] = useState<boolean>(false);
  const touchStartX = useRef<number | null>(null);

  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Top 12 truyện đề cử cho Slider (Chỉ dùng initialNovels khi SSR để khớp 100%, đọc localStorage trong useEffect)
  const [topNominatedNovels, setTopNominatedNovels] = useState<Novel[]>(() => {
    if (Array.isArray(initialNovels) && initialNovels.length > 0) {
      return [...initialNovels]
        .sort((a, b) => ((b.flowerCount || 0) * 10 + (b.views || 0)) - ((a.flowerCount || 0) * 10 + (a.views || 0)))
        .slice(0, 12);
    }
    return [];
  });

  // Mobile: 3 truyện / slide (4 slides cho 12 truyện)
  const mobileSlides = useMemo(() => {
    const safeTop = Array.isArray(topNominatedNovels) ? topNominatedNovels : [];
    if ((safeTop?.length || 0) === 0) return [];
    const chunks: Novel[][] = [];
    for (let i = 0; i < (safeTop?.length || 0); i += 3) {
      chunks.push(safeTop.slice(i, i + 3));
    }
    return chunks;
  }, [topNominatedNovels]);

  // Desktop: 6 truyện / slide (2 slides cho 12 truyện)
  const desktopSlides = useMemo(() => {
    const safeTop = Array.isArray(topNominatedNovels) ? topNominatedNovels : [];
    if ((safeTop?.length || 0) === 0) return [];
    const chunks: Novel[][] = [];
    for (let i = 0; i < (safeTop?.length || 0); i += 6) {
      chunks.push(safeTop.slice(i, i + 6));
    }
    return chunks;
  }, [topNominatedNovels]);

  const totalMobileSlides = mobileSlides?.length || 1;
  const totalDesktopSlides = desktopSlides?.length || 1;

  // Tự động trượt 4.5s
  useEffect(() => {
    if (isSlidePaused) return;
    const timer = setInterval(() => {
      setMobileSlide((prev) => (prev + 1) % totalMobileSlides);
      setDesktopSlide((prev) => (prev + 1) % totalDesktopSlides);
    }, 4500);
    return () => clearInterval(timer);
  }, [totalMobileSlides, totalDesktopSlides, isSlidePaused]);

  // ============================================================================
  // 2. PHÂN TRANG TỐI ƯU SPARK VỚI FIRESTORE CURSOR (limit(25) & startAfter)
  // GHÉP NỐI ĐẦY ĐỦ CÁC ĐIỀU KIỆN LỌC (AND LOGIC): Phân mục + Trạng thái + Định dạng
  // ============================================================================
  const [currentTab, setCurrentTab] = useState<TabType>("latest");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedFormat, setSelectedFormat] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [novels, setNovels] = useState<Novel[]>(() => (initialNovels ? initialNovels.slice(0, PAGE_SIZE) : []));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [indexCreationUrl, setIndexCreationUrl] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState<boolean>(true);

  // Bộ nhớ đệm Client-side Cache theo từng tổ hợp bộ lọc (Tab_Category_Format) & từng Trang:
  // Giúp khi người dùng bấm quay lại Trang 1, Trang 2 sẽ tải ngay lập tức với 0 lượt đọc Firestore!
  const cacheRef = useRef<Record<string, Record<number, PageCacheItem>>>({});
  const pageLastDocRef = useRef<Record<string, Record<number, QueryDocumentSnapshot<DocumentData> | null>>>({});

  // Đọc localStorage và URL search params AN TOÀN bên trong useEffect sau khi mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const sp = new URLSearchParams(window.location.search);
        const cat = sp.get("category");
        const fmt = sp.get("format");
        if (cat) setSelectedCategory(cat);
        if (fmt) setSelectedFormat(fmt);
      } catch {}

      if (!Array.isArray(initialNovels) || (initialNovels?.length || 0) === 0) {
        try {
          const stored = window.localStorage.getItem("dao_tam_novels");
          if (stored) {
            const parsed: Novel[] = JSON.parse(stored);
            if (Array.isArray(parsed) && (parsed?.length || 0) > 0) {
              setTopNominatedNovels(
                [...parsed]
                  .sort((a, b) => ((b.flowerCount || 0) * 10 + (b.views || 0)) - ((a.flowerCount || 0) * 10 + (a.views || 0)))
                  .slice(0, 12)
              );
            }
          }
        } catch {}
      }
    }

    setIsMounted(true);

    const handlePopState = () => {
      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search);
        setSelectedCategory(sp.get("category") || "all");
        setSelectedFormat(sp.get("format") || "all");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialNovels]);

  const currentFilterKey = `${currentTab}_${selectedCategory}_${selectedFormat}`;

  // Số trang tối đa đã từng khám phá của tổ hợp bộ lọc hiện tại
  const maxDiscoveredPage = useMemo(() => {
    const pages = (Object.keys(cacheRef.current[currentFilterKey] || {}) || []).map(Number);
    return (pages?.length || 0) > 0 ? Math.max(...pages) : 1;
  }, [currentFilterKey, novels]);

  const resolveMs = (val: any): number | undefined => {
    if (!val) return undefined;
    if (typeof val === "number") return val;
    if (typeof val?.toMillis === "function") return val.toMillis();
    if (typeof val?.seconds === "number") return val.seconds * 1000;
    if (typeof val === "string") {
      const parsed = Date.parse(val);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  // Hàm chuyển đổi dữ liệu document từ Firestore sang định dạng Novel chuẩn
  const transformDocToNovel = (docSnap: QueryDocumentSnapshot<DocumentData>): Novel => {
    const data = docSnap.data() || {};
    const resolvedUpdatedAt = resolveMs(data.updatedAt) ?? resolveMs(data.createdAt);
    const resolvedLastChapterUpdatedAt = resolveMs(data.lastChapterUpdatedAt) ?? resolvedUpdatedAt;

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
      dailyViews: Number(data.dailyViews || 0),
      flowerCount: Number(data.flowerCount || 0),
      coinCount: Number(data.coinCount || 0),
      isCompleted: Boolean(data.isCompleted || data.status === "Hoàn thành" || data.status === "Full"),
      categories: Array.isArray(data.categories) ? data.categories : [],
      genres: Array.isArray(data.genres) ? data.genres : (Array.isArray(data.categories) ? data.categories : []),
      mainCategory: data.mainCategory || "truyen-hot",
      isOriginal: Boolean(data.isOriginal),
      isShortStory: Boolean(data.isShortStory),
      fullBookPriceXu: data.fullBookPriceXu ? Number(data.fullBookPriceXu) : undefined,
      fullBookDiscountPriceXu: data.fullBookDiscountPriceXu ? Number(data.fullBookDiscountPriceXu) : undefined,
      updatedAt: resolvedUpdatedAt,
      lastChapterUpdatedAt: resolvedLastChapterUpdatedAt,
      createdAt: resolveMs(data.createdAt),
    };
  };

  /**
   * HÀM TRUY VẤN FIRESTORE GHÉP NỐI TẤT CẢ ĐIỀU KIỆN LỌC (AND LOGIC):
   * 1. Phân mục chính: where('mainCategory', '==', category)
   * 2. Trạng thái 'Truyện Full': where('status', 'in', ['Hoàn thành', 'Full', 'Completed'])
   * 3. Định dạng 'Truyện Ngắn': where('isShortStory', '==', true)
   * 4. Bắt lỗi Composite Index và trích xuất link URL báo qua console.error
   * 5. Khi không có dữ liệu trả về mảng rỗng [] (TUYỆT ĐỐI KHÔNG fetch truyện khác đắp vào!)
   */
  const fetchPageData = useCallback(async (
    tab: TabType, 
    page: number,
    category: string,
    format: string
  ) => {
    const key = `${tab}_${category}_${format}`;
    if (!cacheRef.current[key]) cacheRef.current[key] = {};
    if (!pageLastDocRef.current[key]) pageLastDocRef.current[key] = { 1: null };

    // 1. Kiểm tra cache trong bộ nhớ trước để tiết kiệm triệt để hạn mức Spark
    if (cacheRef.current[key][page]) {
      const cached = cacheRef.current[key][page];
      setNovels(cached.novels);
      setHasNextPage(cached.hasNext);
      setQueryError(null);
      setIndexCreationUrl(null);
      return;
    }

    setIsLoading(true);
    setQueryError(null);
    setIndexCreationUrl(null);

    try {
      const novelsCol = collection(db, "novels");
      const baseConstraints: any[] = [];

      // 1. GHÉP NỐI ĐIỀU KIỆN PHÂN MỤC CHÍNH (AND Logic)
      if (category && category !== "all") {
        if (category === "truyen-sang-tac") {
          baseConstraints.push(where("mainCategory", "==", "truyen-sang-tac"));
        } else {
          baseConstraints.push(where("mainCategory", "==", category));
        }
      }

      // 2. GHÉP NỐI ĐIỀU KIỆN TRẠNG THÁI 'Truyện Full' (AND Logic)
      if (tab === "completed") {
        baseConstraints.push(where("status", "in", ["Hoàn thành", "Full", "Completed"]));
      }

      // 3. GHÉP NỐI ĐIỀU KIỆN ĐỊNH DẠNG 'Truyện Ngắn' (AND Logic)
      if (format === "short") {
        baseConstraints.push(where("isShortStory", "==", true));
      } else if (format === "original") {
        baseConstraints.push(where("isOriginal", "==", true));
      }

      // 4. SẮP XẾP THỨ TỰ (ORDER BY)
      if (tab === "hot") {
        baseConstraints.push(orderBy("views", "desc"));
      } else {
        baseConstraints.push(orderBy("lastChapterUpdatedAt", "desc"));
      }

      // 5. GIỚI HẠN SPARK-SAFE LIMIT(25) & CURSOR PHÂN TRANG
      let q;
      if (page === 1) {
        q = query(novelsCol, ...baseConstraints, limit(25));
      } else {
        const prevDoc = pageLastDocRef.current[key][page - 1];
        if (!prevDoc) {
          throw new Error(`Không tìm thấy con trỏ (cursor) của trang ${page - 1}. Vui lòng quay lại trang trước.`);
        }
        q = query(novelsCol, ...baseConstraints, startAfter(prevDoc), limit(25));
      }

      const snap = await getDocs(q);
      const snapDocs = snap?.docs || [];
      const items: Novel[] = (snapDocs || []).map(transformDocToNovel);
      const lastDoc = (snapDocs?.length || 0) > 0 ? snapDocs[(snapDocs?.length || 0) - 1] : null;
      const hasMore = (snapDocs?.length || 0) === 25;

      // Cập nhật State:
      // THAY THẾ hoàn toàn bằng kết quả truy vấn, TUYỆT ĐỐI KHÔNG fetch truyện khác đắp vào!
      setNovels(items);
      setHasNextPage(hasMore);

      // Lưu con trỏ trang và bộ nhớ đệm
      pageLastDocRef.current[key][page] = lastDoc;
      cacheRef.current[key][page] = {
        novels: items,
        lastDoc,
        hasNext: hasMore,
      };

      // Cập nhật Bảng Vàng nếu chưa có đủ
      if ((items?.length || 0) > 0 && (topNominatedNovels?.length || 0) < 12) {
        setTopNominatedNovels((prev) => {
          const merged = [...(prev || []), ...(items || [])];
          const unique = Array.from(new Map((merged || []).map((item) => [item.id, item])).values());
          return unique.slice(0, 12);
        });
      }
    } catch (err: any) {
      console.warn(`[Firestore Pagination] Lỗi khi tải [${tab}]-[${category}]-[${format}] trang ${page}:`, err);

      const msg = err?.message || String(err);
      const indexUrlMatch = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)\]]+/);
      const compositeUrl = indexUrlMatch ? indexUrlMatch[0] : null;

      if (compositeUrl) {
        // 3. LOG ĐƯỜNG LINK COMPOSITE INDEX CỦA FIREBASE
        console.error(
          `[Firebase Composite Index Required]: Truy vấn kết hợp nhiều điều kiện lọc yêu cầu tạo Composite Index. Bấm vào đường link sau để tạo trên Firebase Console:\n${compositeUrl}`
        );
        console.error("Chi tiết lỗi Firestore:", err);
        setIndexCreationUrl(compositeUrl);
        setQueryError("Truy vấn kết hợp nhiều điều kiện lọc yêu cầu tạo Composite Index trên Firebase Console.");
      } else if (msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED")) {
        setQueryError("Đã chạm giới hạn hạn mức Đọc (Spark Quota) của Firestore. Vui lòng thử lại sau.");
      } else {
        console.error("[Firestore Query Error]:", err);
        setQueryError(msg || "Đã xảy ra lỗi khi truy vấn Firestore.");
      }

      // 2. XỬ LÝ EMPTY STATE TRIỆT ĐỂ:
      // TUYỆT ĐỐI KHÔNG tự động nạp truyện khác (như Đam Mỹ hay truyện chưa full) để lấp chỗ trống!
      setNovels([]);
      setHasNextPage(false);
    } finally {
      setIsLoading(false);
    }
  }, [topNominatedNovels?.length]);

  // Kích hoạt nạp dữ liệu sau khi đã mount & đồng bộ URL search params
  useEffect(() => {
    if (!isMounted) return;
    fetchPageData(currentTab, currentPage, selectedCategory, selectedFormat);
  }, [isMounted, currentTab, currentPage, selectedCategory, selectedFormat, fetchPageData]);

  // Chuyển tab: Reset về trang 1
  const handleTabChange = (newTab: TabType) => {
    if (newTab === currentTab) return;
    setCurrentTab(newTab);
    setCurrentPage(1);
  };

  // Chuyển phân mục: Reset về trang 1
  const handleCategoryChange = (newCategory: string) => {
    if (newCategory === selectedCategory) return;
    setSelectedCategory(newCategory);
    setCurrentPage(1);
  };

  // Chuyển định dạng: Reset về trang 1
  const handleFormatChange = (newFormat: string) => {
    if (newFormat === selectedFormat) return;
    setSelectedFormat(newFormat);
    setCurrentPage(1);
  };

  // Chuyển trang an toàn
  const handlePageChange = (targetPage: number) => {
    if (targetPage < 1 || targetPage === currentPage || isLoading) return;
    window.scrollTo({ top: 380, behavior: "smooth" });
    setCurrentPage(targetPage);
  };

  return (
    <div className="max-w-7xl mx-auto w-full overflow-x-hidden p-3 sm:p-6 lg:p-8 space-y-8 sm:space-y-12">
      
      {/* ====================================================================
          PHẦN 1: BẢNG VÀNG ĐỀ CỬ DẠNG SLIDER/CAROUSEL TỰ ĐỘNG TRƯỢT
          - Desktop: Hiển thị đúng 6 truyện / khung hình
          - Mobile: Hiển thị đúng 3 truyện / khung hình
          - Auto-play: 4.5 giây (chỉ xử lý UI state & CSS Translate, 0 read Firebase)
          ==================================================================== */}
      {(topNominatedNovels?.length || 0) > 0 && (
        <section 
          className="relative w-full overflow-hidden bg-gradient-to-b from-pink-50/80 via-white to-pink-50/40 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-pink-100 dark:border-pink-950/70 shadow-sm"
          onMouseEnter={() => setIsSlidePaused(true)}
          onMouseLeave={() => setIsSlidePaused(false)}
        >
          {/* Header Bảng Vàng */}
          <div className="flex items-center justify-between gap-2 pb-3 mb-3 sm:mb-4 border-b border-pink-100 dark:border-pink-950/60">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-pink-600 via-rose-500 to-pink-400 p-0.5 shadow-md shrink-0">
                <div className="w-full h-full rounded-[10px] bg-white dark:bg-slate-900 flex items-center justify-center text-sm sm:text-base">
                  🏆
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-sm sm:text-xl font-black bg-gradient-to-r from-pink-600 via-rose-600 to-pink-500 bg-clip-text text-transparent truncate">
                    Bảng Vàng Đề Cử • Top Tác Phẩm
                  </h2>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 text-[10px] font-bold">
                    <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                    Tự Động Trượt 4.5s
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                  <span className="hidden lg:inline">Máy tính: 6 truyện/slide</span>
                  <span className="lg:hidden">Điện thoại: 3 truyện/slide</span> • Tự động chuyển tuần tự
                </p>
              </div>
            </div>

            {/* Nút điều hướng Carousel Mobile */}
            <div className="flex lg:hidden items-center gap-1 shrink-0">
              <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 mr-1">
                {mobileSlide + 1}/{totalMobileSlides}
              </span>
              <button
                type="button"
                onClick={() => setMobileSlide((prev) => (prev - 1 + totalMobileSlides) % totalMobileSlides)}
                aria-label="Slide trước"
                className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-pink-200 dark:border-pink-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-pink-50 hover:text-pink-600 dark:hover:bg-pink-950/50 transition-colors shadow-xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMobileSlide((prev) => (prev + 1) % totalMobileSlides)}
                aria-label="Slide tiếp theo"
                className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-pink-200 dark:border-pink-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-pink-50 hover:text-pink-600 dark:hover:bg-pink-950/50 transition-colors shadow-xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Nút điều hướng Carousel Desktop */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-pink-600 dark:text-pink-400 mr-1">
                {desktopSlide + 1}/{totalDesktopSlides}
              </span>
              <button
                type="button"
                onClick={() => setDesktopSlide((prev) => (prev - 1 + totalDesktopSlides) % totalDesktopSlides)}
                aria-label="Slide trước"
                className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-pink-200 dark:border-pink-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-pink-50 hover:text-pink-600 dark:hover:bg-pink-950/50 transition-colors shadow-xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDesktopSlide((prev) => (prev + 1) % totalDesktopSlides)}
                aria-label="Slide tiếp theo"
                className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-pink-200 dark:border-pink-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-pink-50 hover:text-pink-600 dark:hover:bg-pink-950/50 transition-colors shadow-xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ================================================================ */}
          {/* 1. SLIDER MOBILE (< lg: 3 truyện / slide, 100% Tailwind CSS)       */}
          {/* ================================================================ */}
          <div 
            className="block lg:hidden overflow-hidden relative touch-pan-y"
            onTouchStart={(e) => { touchStartX.current = e.touches?.[0]?.clientX ?? null; }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null) return;
              const endX = e.changedTouches?.[0]?.clientX;
              if (typeof endX !== "number") return;
              const diff = touchStartX.current - endX;
              if (Math.abs(diff) > 40) {
                setMobileSlide((prev) => (diff > 0 ? (prev + 1) % totalMobileSlides : (prev - 1 + totalMobileSlides) % totalMobileSlides));
              }
              touchStartX.current = null;
            }}
          >
            <div 
              className="flex transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${mobileSlide * 100}%)` }}
            >
              {(mobileSlides || []).map((slideNovels, slideIndex) => (
                <div key={slideIndex} className="w-full shrink-0 grid grid-cols-3 gap-2">
                  {(slideNovels || []).map((novel, indexInSlide) => (
                    <StoryCard
                      key={novel.id}
                      novel={novel}
                      rank={slideIndex * 3 + indexInSlide + 1}
                      variant="featured"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ================================================================ */}
          {/* 2. SLIDER DESKTOP (>= lg: 6 truyện / slide, 100% Tailwind CSS)     */}
          {/* ================================================================ */}
          <div className="hidden lg:block overflow-hidden relative">
            <div 
              className="flex transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${desktopSlide * 100}%)` }}
            >
              {(desktopSlides || []).map((slideNovels, slideIndex) => (
                <div key={slideIndex} className="w-full shrink-0 grid grid-cols-6 gap-3.5">
                  {(slideNovels || []).map((novel, indexInSlide) => (
                    <StoryCard
                      key={novel.id}
                      novel={novel}
                      rank={slideIndex * 6 + indexInSlide + 1}
                      variant="featured"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ====================================================================
          THÔNG BÁO TOÀN TRANG (GLOBAL BANNER) ĐẶT NGAY TRÊN THANH TÌM KIẾM
          ==================================================================== */}
      <GlobalBanner initialBanner={initialBanner} />

      {/* ====================================================================
          THANH TÌM KIẾM TRUYỆN NỔI BẬT & TỪ KHÓA GỢI Ý (SPARK QUOTA-SAFE)
          - Chặn spam API (không gọi onChange)
          - Prefix search where('title', '>=', keyword) limit(10)
          - Tag search where('tags', 'array-contains', clickedTag) limit(20)
          - Nút màu hồng, spinner hồng, thông báo không tìm thấy tác phẩm
          - Banner cảnh báo lỗi nền màu vàng (tuyệt đối không dùng đỏ)
          ==================================================================== */}
      <SearchBar />

      {/* ====================================================================
          PHẦN 2: DANH SÁCH TRUYỆN PHÂN TRANG (PAGINATION 25 TRUYỆN / TRANG)
          - Tabs: Truyện Hot, Mới Cập Nhật, Truyện Full
          - Cursor-based limit(25) & startAfter()
          - Nút chuyển trang màu hồng với nút active hồng đậm
          - Loading mờ nhẹ không giật khung hình
          - Thông báo lỗi nền màu vàng
          ==================================================================== */}
      <section className="space-y-4">
        
        {/* THANH ĐIỀU HƯỚNG TỔNG HỢP: PHÂN MỤC + ĐỊNH DẠNG + TRẠNG THÁI (AND LOGIC) */}
        <div className="space-y-3 pb-3 border-b border-pink-100 dark:border-pink-950/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-2xl font-black text-pink-950 dark:text-pink-100 flex items-center gap-2">
                <span>🌸</span>
                <span>
                  {currentTab === "hot"
                    ? "Bảng Xếp Hạng Truyện Hot"
                    : currentTab === "latest"
                    ? "Truyện Mới Cập Nhật"
                    : "Truyện Đã Hoàn Thành (Full)"}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300">
                  Trang {currentPage} (Tối đa 25 bộ)
                </span>
              </h2>
              <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-pink-700 dark:text-pink-300">
                <span className="font-semibold">Bộ lọc hiện tại:</span>
                {(() => {
                  const activeCfg = getGenreConfigById(selectedCategory);
                  const ActiveIcon = activeCfg.icon;
                  return (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${
                        selectedCategory === "all"
                          ? "bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800"
                          : activeCfg.activeClass
                      }`}
                    >
                      <ActiveIcon
                        className={`w-3 h-3 shrink-0 ${
                          activeCfg.iconFilled ? "fill-current" : ""
                        }`}
                      />
                      <span>
                        {selectedCategory === "all" ? "Tất cả thể loại" : activeCfg.name}
                      </span>
                    </span>
                  );
                })()}
                {selectedFormat === "short" && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/80 font-bold text-[10px] text-rose-700 dark:text-rose-300">
                    📖 Truyện Ngắn
                  </span>
                )}
                {currentTab === "completed" && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 font-bold text-[10px] text-emerald-700 dark:text-emerald-300">
                    ✅ Đã Full
                  </span>
                )}
              </div>
            </div>

            {/* 3 Nút chuyển đổi Tab */}
            <div className="flex items-center gap-1.5 bg-pink-50/80 dark:bg-slate-900/80 p-1 rounded-xl border border-pink-200/70 dark:border-pink-950/70 shadow-xs self-start sm:self-auto">
              <button
                type="button"
                onClick={() => handleTabChange("latest")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  currentTab === "latest"
                    ? "bg-pink-600 text-white shadow-md shadow-pink-600/30"
                    : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-white/60 dark:hover:bg-slate-800"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Mới Cập Nhật</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("hot")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  currentTab === "hot"
                    ? "bg-pink-600 text-white shadow-md shadow-pink-600/30"
                    : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-white/60 dark:hover:bg-slate-800"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Truyện Hot</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("completed")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  currentTab === "completed"
                    ? "bg-pink-600 text-white shadow-md shadow-pink-600/30"
                    : "text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-white/60 dark:hover:bg-slate-800"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Truyện Full</span>
              </button>
            </div>
          </div>

          {/* DÃY BỘ LỌC PHÂN MỤC CHÍNH VÀ ĐỊNH DẠNG (Bảo đảm AND Logic, đồng bộ GENRE_CONFIG) */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 pt-1">
            <FilterMenu
              activeCategory={selectedCategory}
              onSelectCategory={(catId: CategoryFilterId) => handleCategoryChange(catId)}
              visibleIds={["all", "truyen-nam", "dam-my", "truyen-nu", "truyen-sang-tac"]}
              className="sm:w-auto"
            />

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                Định dạng:
              </span>
              <button
                type="button"
                onClick={() => handleFormatChange("all")}
                className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold border transition ${
                  selectedFormat === "all"
                    ? "bg-pink-600 text-white border-pink-600 shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-pink-200 dark:border-pink-950 hover:border-pink-400"
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => handleFormatChange(selectedFormat === "short" ? "all" : "short")}
                className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold border transition flex items-center gap-1.5 ${
                  selectedFormat === "short"
                    ? "bg-emerald-500 text-white border-emerald-500 shadow-xs"
                    : "bg-white dark:bg-slate-900 text-emerald-500 border-emerald-500 hover:bg-emerald-500/10"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Truyện Ngắn</span>
              </button>
            </div>
          </div>
        </div>

        {/* THÔNG BÁO LỖI TRUY VẤN NỀN MÀU VÀNG & LINK COMPOSITE INDEX THEO ĐÚNG YÊU CẦU */}
        {queryError && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-start justify-between gap-3 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-2">
                <span className="font-bold block">Thông báo truy vấn dữ liệu Firestore:</span>
                <span className="text-xs text-amber-800 dark:text-amber-300 block leading-relaxed">{queryError}</span>
                {indexCreationUrl && (
                  <div className="pt-2 border-t border-amber-200 dark:border-amber-900">
                    <a
                      href={indexCreationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition"
                    >
                      <span>👉 Bấm vào đây để tạo Composite Index trên Firebase Console</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchPageData(currentTab, currentPage, selectedCategory, selectedFormat)}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition flex items-center gap-1 self-start sm:self-center"
            >
              <RotateCw className="w-3 h-3" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* BỐ CỤC 2 CỘT: DANH SÁCH TRUYỆN + CỘT TOP 10 HOT TRONG NGÀY BÊN PHẢI */}
        <div className="flex flex-col lg:flex-row items-start gap-6 lg:gap-8">
          <div className="flex-1 min-w-0 w-full space-y-6">
            {/* KHUNG HIỂN THỊ DANH SÁCH 25 TRUYỆN KÈM HIỆU ỨNG LOADING MỜ NHẸ KHÔNG GIẬT KHUNG HÌNH */}
            <div className="relative min-h-[360px]">
              {/* Lớp phủ mờ nhẹ khi chuyển trang (Loading State) */}
              {isLoading && (
                <div className="absolute inset-0 bg-white/60 dark:bg-slate-950/60 backdrop-blur-[1.5px] z-30 flex items-center justify-center rounded-2xl transition-all duration-300">
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-pink-600 text-white text-xs font-bold shadow-xl shadow-pink-600/30 animate-pulse border border-pink-400/30">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang tải danh sách 25 truyện...</span>
                  </div>
                </div>
              )}

              {(novels?.length || 0) === 0 && !isLoading ? (
                <div className="py-16 px-4 text-center bg-pink-50/50 dark:bg-pink-950/20 rounded-2xl border border-dashed border-pink-200 dark:border-pink-900/60 flex flex-col items-center justify-center">
                  <BookOpen className="w-12 h-12 text-pink-400 dark:text-pink-500 mb-3" />
                  <h3 className="text-base sm:text-lg font-bold text-pink-900 dark:text-pink-200">
                    Hiện chưa có truyện nào thuộc mục này
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                    Không tìm thấy tác phẩm thỏa mãn đồng thời các điều kiện lọc bạn đã chọn. Vui lòng thử chọn lại phân mục hoặc trạng thái khác.
                  </p>
                </div>
              ) : (
                /* Ép buộc cắt mảng bằng (novels || []).slice(0, 25).map(...) */
                <div className={`grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4 transition-opacity duration-300 ${isLoading ? "opacity-40" : "opacity-100"}`}>
                  {(novels || []).slice(0, 25).map((novel) => (
                    <StoryCard
                      key={novel.id}
                      novel={novel}
                      variant="catalog"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ====================================================================
                GIAO DIỆN NÚT CHUYỂN TRANG (PAGINATION BAR) Ở DƯỚI CÙNG 25 TRUYỆN
                ==================================================================== */}
            <div className="pt-6 pb-2 border-t border-pink-100 dark:border-pink-950/60 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Đang hiển thị <strong className="text-pink-600 dark:text-pink-400 font-bold">{Math.min(novels?.length || 0, 25)}</strong> bộ truyện • Trang <strong className="text-pink-600 dark:text-pink-400">{currentPage}</strong>
              </div>

              <nav aria-label="Điều hướng phân trang" className="flex items-center gap-1.5 flex-wrap">
                {/* NÚT TRƯỚC */}
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-slate-900 border-pink-200 dark:border-pink-900 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-950/40 shadow-xs"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Trước</span>
                </button>

                {/* CÁC NÚT SỐ TRANG */}
                {(Array.from({ length: Math.max(currentPage + (hasNextPage ? 1 : 0), maxDiscoveredPage) }, (_, i) => i + 1) || []).map((pageNum) => {
                  const isActive = pageNum === currentPage;

                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => handlePageChange(pageNum)}
                      disabled={isLoading || (pageNum > currentPage + 1 && !cacheRef.current[currentFilterKey]?.[pageNum])}
                      className={`min-w-8 h-8 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center border shadow-xs ${
                        isActive
                          ? "bg-pink-600 dark:bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-600/30 scale-105"
                          : "bg-white dark:bg-slate-900 border-pink-200 dark:border-pink-900 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-950/40 disabled:opacity-30 disabled:cursor-not-allowed"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                {/* NÚT SAU */}
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!hasNextPage || isLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-slate-900 border-pink-200 dark:border-pink-900 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-950/40 shadow-xs"
                >
                  <span>Sau</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </nav>
            </div>
          </div>

          {/* CỘT PHẢI: TOP 10 HOT TRONG NGÀY (QUERY ORDER BY dailyViews DESC LIMIT 10) */}
          <Top10HotSidebar initialNovels={initialNovels || novels} />
        </div>

      </section>
    </div>
  );
}
