"use client";

import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { BookOpen, Clock, ArrowLeft } from "lucide-react";
import StoryCard from "../../components/StoryCard";
import FilterMenu from "../../components/FilterMenu";

interface Novel {
  id: string;
  title: string;
  author: string;
  coverImage: string;
  totalChapters?: number;
  latestChapterTitle?: string;
  status?: string;
  views?: number;
  mainCategory?: string;
  isShortStory?: boolean;
  categories?: string[];
  genres?: string[];
}

const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "eminent-option-33rp2",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyFakeKeyForPreview1234567890",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "eminent-option-33rp2.firebaseapp.com",
};

const app = !(getApps()?.length || 0) ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export default function ShortStoriesPage() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchShortStories() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const novelsCol = collection(db, "novels");
        // BẮT BUỘC: Query từ Firestore với điều kiện where('isShortStory', '==', true)
        const q = query(novelsCol, where("isShortStory", "==", true), limit(50));
        const snap = await getDocs(q);

        if (!isMounted) return;

        const items: Novel[] = (snap?.docs || []).map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            title: data.title || "Truyện ngắn chưa đặt tên",
            author: data.author || "Khuyết danh",
            coverImage: data.coverImage || "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80",
            totalChapters: Number(data.totalChapters || (Array.isArray(data.chapters) ? data.chapters?.length || 1 : 1)),
            latestChapterTitle: data.latestChapterTitle || "Chương 1",
            status: data.status || "Hoàn thành",
            views: Number(data.views || 0),
            mainCategory: data.mainCategory || "dam-my",
            isShortStory: true,
            categories: Array.isArray(data.categories) ? data.categories : [],
            genres: Array.isArray(data.genres) ? data.genres : (Array.isArray(data.categories) ? data.categories : []),
          };
        });

        setNovels(items);
      } catch (err: any) {
        const msg = err?.message || String(err);
        const indexUrlMatch = msg.match(/https:\/\/console\.firebase\.google\.com[^\s)\]]+/);
        const compositeUrl = indexUrlMatch ? indexUrlMatch[0] : null;
        if (compositeUrl) {
          console.error(`[Firebase Composite Index Required]: Truy vấn truyện ngắn yêu cầu tạo index:\n${compositeUrl}`);
        } else {
          console.error("Lỗi khi nạp danh sách truyện ngắn từ Firestore:", err);
        }
        setErrorMsg("Không thể tải danh sách truyện ngắn lúc này. Vui lòng thử lại sau.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchShortStories();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-pink-50/60 via-white to-pink-50/40 dark:from-[#180a14] dark:via-slate-950 dark:to-[#180a14] text-slate-900 dark:text-slate-100 transition-colors">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/85 dark:bg-slate-950/85 border-b border-pink-100 dark:border-pink-950/65 py-4 px-4 sm:px-6 shadow-xs">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 via-pink-500 to-rose-400 flex items-center justify-center text-white font-black text-lg shadow-md shadow-pink-500/20 hover:scale-105 transition"
            >
              Đ
            </a>
            <div>
              <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-pink-600 via-pink-500 to-rose-400 bg-clip-text text-transparent flex items-center gap-2">
                <span>Đạo Tâm</span>
                <span className="text-sm font-semibold text-pink-600 dark:text-pink-400">/ Truyện Ngắn</span>
              </h1>
              <p className="text-xs text-pink-600/80 dark:text-pink-400 font-medium">
                Định dạng Truyện Ngắn &amp; Đoản Văn • Query Firestore Realtime
              </p>
            </div>
          </div>
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 hover:bg-pink-200 dark:hover:bg-pink-900 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Trang Chủ</span>
          </a>
        </div>

        {/* Thanh Menu Phân mục trên cùng đồng bộ theo GENRE_CONFIG */}
        <div className="max-w-7xl mx-auto mt-2.5 pt-2 border-t border-pink-100/70 dark:border-pink-950/50">
          <FilterMenu
            asLinks={true}
            activeCategory="short-story"
            visibleIds={["all", "truyen-nam", "dam-my", "truyen-nu", "truyen-sang-tac", "short-story"]}
            useShortName={true}
          />
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-6 border-b border-pink-100 dark:border-slate-800">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-pink-700 dark:text-pink-300 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-pink-600" />
              <span>Danh Sách Truyện Ngắn / Đoản Văn</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tuyển tập các tác phẩm truyện ngắn, đoản văn súc tích, hoàn thành nhanh (where isShortStory == true)
            </p>
          </div>
          <span className="text-xs font-bold text-pink-600 dark:text-pink-400 px-3 py-1 rounded-full bg-pink-100 dark:bg-pink-950 border border-pink-200 dark:border-pink-800 self-start sm:self-auto">
            {novels?.length || 0} bộ truyện
          </span>
        </div>

        {errorMsg && (
          <div className="p-4 mb-6 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
            {errorMsg}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <div className="animate-spin w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full mb-3" />
            <span className="text-xs font-semibold text-pink-600">Đang tải truyện ngắn từ Firestore...</span>
          </div>
        ) : (novels?.length || 0) === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-pink-100 dark:border-slate-800 p-8">
            <BookOpen className="w-12 h-12 text-pink-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
              Hiện chưa có truyện nào thuộc mục này
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
              Hãy là người đầu tiên sáng tác hoặc biên tập truyện ngắn / đoản văn bằng cách bật công tắc &ldquo;Truyện Ngắn&rdquo; khi thêm truyện mới!
            </p>
            <a
              href="/dang-truyen"
              className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-pink-700 transition"
            >
              Đăng Truyện Ngắn Ngay
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
            {(novels || []).map((novel) => (
              <StoryCard
                key={novel?.id}
                novel={{ ...novel, isShortStory: true }}
                variant="catalog"
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
