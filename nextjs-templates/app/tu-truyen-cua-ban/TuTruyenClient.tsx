'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Library,
  Crown,
  Sparkles,
  BookOpen,
  Search,
  ArrowLeft,
  Coins,
  Bookmark,
  Loader2,
} from 'lucide-react';
import { db, auth } from '../../lib/firebase';

interface PurchasedStoryItem {
  storyId: string;
  storyTitle: string;
  storyAuthor: string;
  storyEditor?: string;
  storyCoverImage: string;
  storySlug?: string;
  totalChapters: number;
  freeChaptersCount: number;
  totalVipChapters: number;
  isFullStoryBought: boolean;
  purchasedChapterIds: string[];
  purchasedVipChaptersCount: number;
  totalSpentXu: number;
  lastPurchasedAt: number;
  purchaseBadgeType: 'full_book' | 'single_chapters';
}

export default function TuTruyenClient() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [purchasedStories, setPurchasedStories] = useState<PurchasedStoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'full_book' | 'single_chapters'>('all');
  const [userBalance, setUserBalance] = useState<number>(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Chỉ dùng getDoc(doc(db, 'users', userId)) 1 lần duy nhất (tuyệt đối không dùng onSnapshot cho user doc)
  useEffect(() => {
    if (!currentUser?.uid) {
      if (!isAuthLoading) setIsLoading(false);
      return;
    }

    let isMounted = true;
    const userId = currentUser.uid;
    setIsLoading(true);

    const parseXu = (d: Record<string, any> | null | undefined) => {
      if (!d) return 0;
      const toNum = (v: unknown) => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
          const n = Number(v.trim().replace(/,/g, ''));
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      };
      return toNum(d.xuBalance) || toNum(d.xu) || toNum(d.coin) || toNum(d.coins) || toNum(d.balance) || 0;
    };

    const buildPurchasedSummary = async (userData: Record<string, any> | null) => {
      try {
        const rawPurchases: any[] = [];
        let userUnlockedFullBooks: string[] = [];
        const userUnlockedChapters: Record<string, string[]> = {};

        if (userData) {
          if (isMounted) setUserBalance(parseXu(userData));
          if (Array.isArray(userData.purchases)) rawPurchases.push(...userData.purchases);
          if (Array.isArray(userData.unlockedFullBooks)) userUnlockedFullBooks = userData.unlockedFullBooks;
          for (const src of [
            userData.purchasedChapters,
            userData.unlockedChapters,
            userData.boughtChapters,
          ]) {
            if (!src) continue;
            if (Array.isArray(src)) {
              for (const item of src) {
                if (typeof item === 'string' || typeof item === 'number') {
                  const raw = String(item).trim();
                  if (!raw) continue;
                  const sepMatch = raw.match(/^([^:/|]+)[:/|](.+)$/);
                  if (sepMatch) {
                    const [, nKey, cVal] = sepMatch;
                    if (cVal === 'all' || cVal === '*') {
                      if (!userUnlockedFullBooks.includes(nKey)) {
                        userUnlockedFullBooks.push(nKey);
                      }
                    } else {
                      userUnlockedChapters[nKey] = Array.from(
                        new Set([...(userUnlockedChapters[nKey] || []), cVal])
                      );
                    }
                  } else {
                    if (!userUnlockedFullBooks.includes(raw)) {
                      userUnlockedFullBooks.push(raw);
                    }
                  }
                } else if (item && typeof item === 'object') {
                  const nKey = String(item.novelId || item.storyId || item.bookId || '').trim();
                  const cVal = String(
                    item.chapterId ||
                      item.id ||
                      (item.chapterNumber !== undefined ? `c${item.chapterNumber}` : '')
                  ).trim();
                  if (nKey && cVal) {
                    userUnlockedChapters[nKey] = Array.from(
                      new Set([...(userUnlockedChapters[nKey] || []), cVal])
                    );
                  }
                }
              }
            } else if (typeof src === 'object') {
              for (const [k, v] of Object.entries(src)) {
                if (Array.isArray(v)) {
                  userUnlockedChapters[k] = Array.from(
                    new Set([...(userUnlockedChapters[k] || []), ...(v || []).map((c) => String(c)).filter(Boolean)])
                  );
                }
              }
            }
          }
        }

        // Query subcollection users/{userId}/purchases
        try {
          const subSnap = await getDocs(collection(db, 'users', userId, 'purchases'));
          subSnap.forEach((d) => rawPurchases.push({ id: d.id, ...(d.data() || {}) }));
        } catch {}

        // Query top-level purchases collection
        try {
          const qPurchases = query(collection(db, 'purchases'), where('userId', '==', userId));
          const pSnap = await getDocs(qPurchases);
          pSnap.forEach((d) => rawPurchases.push({ id: d.id, ...(d.data() || {}) }));
        } catch {}

        const storyIdsSet = new Set<string>();
        (rawPurchases || []).forEach((p) => {
          const sId = p?.storyId || p?.novelId;
          if (sId) storyIdsSet.add(String(sId));
        });
        (userUnlockedFullBooks || []).forEach((sId) => {
          if (sId) storyIdsSet.add(String(sId));
        });
        Object.keys(userUnlockedChapters).forEach((sId) => {
          if (sId && Array.isArray(userUnlockedChapters[sId]) && (userUnlockedChapters[sId]?.length || 0) > 0) {
            storyIdsSet.add(String(sId));
          }
        });

        if (storyIdsSet.size === 0) {
          if (isMounted) setPurchasedStories([]);
          return;
        }

        const novelDetailsMap = new Map<string, any>();
        await Promise.all(
          (Array.from(storyIdsSet) || []).map(async (storyId) => {
            try {
              const nSnap = await getDoc(doc(db, 'novels', storyId));
              if (nSnap.exists()) {
                const nData = nSnap.data() || {};
                novelDetailsMap.set(storyId, {
                  id: nSnap.id,
                  ...nData,
                  categories: Array.isArray(nData.categories) ? nData.categories : [],
                  genres: Array.isArray(nData.genres) ? nData.genres : [],
                  chapters: Array.isArray(nData.chapters) ? nData.chapters : [],
                });
                return;
              }
              const sSnap = await getDoc(doc(db, 'stories', storyId));
              if (sSnap.exists()) {
                const sData = sSnap.data() || {};
                novelDetailsMap.set(storyId, {
                  id: sSnap.id,
                  ...sData,
                  categories: Array.isArray(sData.categories) ? sData.categories : [],
                  genres: Array.isArray(sData.genres) ? sData.genres : [],
                  chapters: Array.isArray(sData.chapters) ? sData.chapters : [],
                });
              }
            } catch (err) {
              console.warn(`Lỗi fetch novel ${storyId}:`, err);
            }
          })
        );

        const summaries: PurchasedStoryItem[] = [];

        for (const storyId of storyIdsSet) {
          const novel = novelDetailsMap.get(storyId);
          const storyPurchases = rawPurchases.filter(
            (p) => (p.storyId || p.novelId) === storyId || (novel?.slug && (p.storyId || p.novelId) === novel.slug)
          );

          const isFullStoryBought =
            userUnlockedFullBooks.includes(storyId) ||
            (novel?.slug ? userUnlockedFullBooks.includes(novel.slug) : false) ||
            storyPurchases.some((p) => p.type === 'full_book' || p.isFullStoryBought === true);

          const totalChapters =
            novel?.totalChapters ||
            (Array.isArray(novel?.chapters) ? novel.chapters?.length || 0 : 0) ||
            storyPurchases?.length ||
            1;

          const freeChaptersCount = totalChapters >= 200 ? 50 : 30;
          let totalVipChapters = Math.max(0, totalChapters - freeChaptersCount);

          if (typeof novel?.totalVipChapters === 'number' && novel.totalVipChapters > 0) {
            totalVipChapters = novel.totalVipChapters;
          } else if (Array.isArray(novel?.chapters)) {
            const explicitVip = (novel?.chapters || []).filter(
              (c: any) => c?.isVip || (typeof c?.number === 'number' && c.number > freeChaptersCount)
            );
            if ((explicitVip?.length || 0) > 0) totalVipChapters = explicitVip?.length || 0;
          }

          const purchasedVipChaptersSet = new Set<number | string>();
          const purchasedChapterIdsSet = new Set<string>();

          storyPurchases.forEach((p) => {
            if (p.chapterId) purchasedChapterIdsSet.add(p.chapterId);
            if (typeof p.chapterNumber === 'number') {
              if (p.chapterNumber > freeChaptersCount) {
                purchasedVipChaptersSet.add(p.chapterNumber);
              }
            } else if (p.chapterId) {
              const numMatch = p.chapterId.match(/(\d+)/);
              if (numMatch) {
                const num = parseInt(numMatch[1], 10);
                if (num > freeChaptersCount) purchasedVipChaptersSet.add(num);
              } else {
                purchasedVipChaptersSet.add(p.chapterId);
              }
            }
          });

          const unlockedList =
            userUnlockedChapters[storyId] || (novel?.slug ? userUnlockedChapters[novel.slug] : []) || [];
          unlockedList.forEach((chId) => {
            purchasedChapterIdsSet.add(chId);
            const numMatch = chId.match(/(\d+)/);
            if (numMatch) {
              const num = parseInt(numMatch[1], 10);
              if (num > freeChaptersCount) purchasedVipChaptersSet.add(num);
            } else {
              purchasedVipChaptersSet.add(chId);
            }
          });

          const totalSpentXu = storyPurchases.reduce((acc, p) => acc + (Number(p.pricePaid) || 0), 0);
          const lastPurchasedAt =
            storyPurchases.reduce((max, p) => Math.max(max, Number(p.purchasedAt || p.createdAt || 0)), 0) ||
            Date.now();

          const purchasedVipChaptersCount = purchasedVipChaptersSet.size;
          const isCompletedVip =
            isFullStoryBought || (totalVipChapters > 0 && purchasedVipChaptersCount >= totalVipChapters);
          const purchaseBadgeType: 'full_book' | 'single_chapters' = isCompletedVip ? 'full_book' : 'single_chapters';

          summaries.push({
            storyId,
            storyTitle: novel?.title || storyPurchases[0]?.novelTitle || `Bộ truyện #${storyId}`,
            storyAuthor: novel?.author || storyPurchases[0]?.authorName || 'Đang cập nhật',
            storyEditor: novel?.editor,
            storyCoverImage:
              novel?.coverImage ||
              'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80',
            storySlug: novel?.slug,
            totalChapters,
            freeChaptersCount,
            totalVipChapters,
            isFullStoryBought,
            purchasedChapterIds: Array.from(purchasedChapterIdsSet),
            purchasedVipChaptersCount,
            totalSpentXu,
            lastPurchasedAt,
            purchaseBadgeType,
          });
        }

        summaries.sort((a, b) => b.lastPurchasedAt - a.lastPurchasedAt);
        if (isMounted) setPurchasedStories(summaries);
      } catch (err) {
        console.error('Lỗi khi nạp dữ liệu mua:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const userDocRef = doc(db, 'users', userId);
    getDoc(userDocRef)
      .then((userSnap) => {
        if (!isMounted) return;
        const rawUserData = userSnap.exists() ? (userSnap.data() || {}) : null;
        const userData = rawUserData
          ? {
              ...rawUserData,
              purchases: Array.isArray(rawUserData.purchases) ? rawUserData.purchases : [],
              unlockedFullBooks: Array.isArray(rawUserData.unlockedFullBooks) ? rawUserData.unlockedFullBooks : [],
              readingHistory: Array.isArray(rawUserData.readingHistory) ? rawUserData.readingHistory : [],
              history: Array.isArray(rawUserData.history) ? rawUserData.history : [],
              notifications: Array.isArray(rawUserData.notifications) ? rawUserData.notifications : [],
            }
          : null;
        if (userData) {
          setUserBalance(parseXu(userData));
        }
        buildPurchasedSummary(userData);
      })
      .catch((err) => {
        console.warn('Lỗi đọc dữ liệu tủ truyện / ví xu:', err);
        if (isMounted) buildPurchasedSummary(null);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid, isAuthLoading]);

  const filteredStories = useMemo(() => {
    return (purchasedStories || []).filter((item) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          (item?.storyTitle || '').toLowerCase().includes(term) ||
          (item?.storyAuthor || '').toLowerCase().includes(term) ||
          (item?.storyEditor && item.storyEditor.toLowerCase().includes(term));
        if (!match) return false;
      }
      if (filterType === 'full_book') return item?.purchaseBadgeType === 'full_book';
      if (filterType === 'single_chapters') return item?.purchaseBadgeType === 'single_chapters';
      return true;
    });
  }, [purchasedStories, searchTerm, filterType]);

  const stats = useMemo(() => {
    const safeList = Array.isArray(purchasedStories) ? purchasedStories : [];
    const totalStories = safeList?.length || 0;
    const fullBookCount = safeList.filter((s) => s?.purchaseBadgeType === 'full_book')?.length || 0;
    const singleChaptersCount = safeList.filter((s) => s?.purchaseBadgeType === 'single_chapters')?.length || 0;
    const totalXuSpent = safeList.reduce((acc, s) => acc + (s?.totalSpentXu || 0), 0);
    return { totalStories, fullBookCount, singleChaptersCount, totalXuSpent };
  }, [purchasedStories]);

  if (isAuthLoading || (currentUser && isLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 space-y-3">
        <Loader2 className="w-8 h-8 text-pink-600 animate-spin" />
        <p className="text-xs font-semibold text-pink-600 dark:text-pink-400">
          Đang đồng bộ Ví Xu &amp; Tủ truyện realtime từ Firestore...
        </p>
      </div>
    );
  }

  if (!currentUser && !isAuthLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-pink-200 dark:border-pink-900/50 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-pink-50 dark:bg-pink-950/60 border border-pink-200 text-pink-600 flex items-center justify-center mx-auto">
            <Library className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
            Yêu Cầu Đăng Nhập Tài Khoản
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Bạn cần đăng nhập tài khoản để hệ thống đối soát dữ liệu truyện đã mua trọn bộ và mở khóa chương VIP của bạn.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-block px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-md transition"
            >
              Về Trang Chủ Đăng Nhập
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-pink-50/60 via-white to-pink-50/40 dark:from-[#180a14] dark:via-slate-950 dark:to-[#180a14] text-slate-900 dark:text-slate-100 transition-colors pb-16">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/90 dark:bg-slate-950/90 border-b border-pink-100 dark:border-pink-950/60 py-3.5 px-4 sm:px-6 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 transition"
              title="Quay lại Trang Chủ"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Library className="w-6 h-6 text-pink-600 shrink-0" />
                <span>Tủ truyện của bạn</span>
              </h1>
              <p className="text-xs text-slate-900 dark:text-slate-300 font-medium">
                Tất cả tác phẩm bạn đã sở hữu trọn bộ hoặc mở khóa chương VIP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-100/70 dark:bg-pink-950/70 border border-pink-200 dark:border-pink-800 text-xs font-bold text-slate-900 dark:text-slate-100">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span>Ví của bạn: {userBalance.toLocaleString('vi-VN')} Xu</span>
            </div>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white text-xs font-bold shadow-xs transition"
            >
              + Nạp Xu
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-pink-200/70 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-pink-600" />
              <span>Tổng Truyện Đã Mua</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
              {stats.totalStories} <span className="text-xs font-bold text-slate-400">bộ</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-pink-200/70 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <span>Mua Trọn Bộ</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
              {stats.fullBookCount} <span className="text-xs font-bold text-slate-400">bộ</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-pink-200/70 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-sky-500" />
              <span>Mua Chương Lẻ</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-sky-600 dark:text-sky-400">
              {stats.singleChaptersCount} <span className="text-xs font-bold text-slate-400">bộ</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm tác phẩm đã mua..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-pink-200/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-0.5 scrollbar-none">
            {([
              { id: 'all', label: 'Tất cả', count: purchasedStories?.length || 0 },
              { id: 'full_book', label: 'Mua Trọn Bộ', count: stats.fullBookCount },
              { id: 'single_chapters', label: 'Mua Chương Lẻ', count: stats.singleChaptersCount },
            ] || []).map((tab) => {
              const isActive = filterType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-pink-600 text-white font-extrabold shadow-sm shadow-pink-600/30 ring-2 ring-pink-400/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-pink-600" />
            <p className="text-xs font-semibold text-pink-600">Đang tổng hợp dữ liệu giao dịch từ Firestore...</p>
          </div>
        ) : (filteredStories?.length || 0) === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-pink-200/60 dark:border-slate-800 p-8 shadow-xs max-w-xl mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-pink-50 dark:bg-pink-950/50 flex items-center justify-center mx-auto mb-4 border border-pink-200 text-pink-600">
              <Library className="w-8 h-8" />
            </div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200 mb-1">
              {(purchasedStories?.length || 0) === 0 ? 'Tủ truyện của bạn hiện đang trống' : 'Không tìm thấy bộ truyện nào'}
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Khi bạn mua trọn bộ hoặc mở khóa chương VIP, quyền đọc trọn đời sẽ tự động đồng bộ vào đây.
            </p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold shadow-md transition"
            >
              Khám Phá Truyện Ngay
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4.5">
            {(filteredStories || []).map((item) => {
              const storyUrl = item?.storySlug
                ? `/truyen/${encodeURIComponent(item.storySlug)}`
                : `/truyen/${encodeURIComponent(item?.storyId ?? '')}`;

              return (
                <Link
                  key={item?.storyId}
                  href={storyUrl}
                  className="group flex flex-col justify-between bg-white dark:bg-slate-900 rounded-2xl border border-pink-200/80 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-xl hover:border-pink-400 transition-all duration-300 transform hover:-translate-y-1"
                >
                  <div>
                    <div className="relative aspect-[3/4] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img
                        src={
                          item?.storyCoverImage ||
                          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'
                        }
                        alt={item?.storyTitle ?? 'Bìa truyện'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-80" />

                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white backdrop-blur-md border border-white/20">
                          {item?.totalChapters ?? 0} chương
                        </span>
                      </div>

                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="text-[10px] text-white/90 font-medium truncate drop-shadow-md">
                          {item?.purchaseBadgeType === 'full_book' ? (
                            <span className="text-amber-300 font-bold flex items-center gap-1">
                              <Crown className="w-3 h-3 text-amber-300" />
                              <span>Sở hữu trọn bộ</span>
                            </span>
                          ) : (
                            <span>
                              Đã mua: {item?.purchasedVipChaptersCount ?? 0}/{item?.totalVipChapters ?? 0}c VIP
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 space-y-1.5">
                      <h3
                        className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-pink-600 transition-colors"
                        title={item?.storyTitle ?? 'Tác phẩm'}
                      >
                        {item?.storyTitle ?? 'Tác phẩm'}
                      </h3>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{item?.storyAuthor ?? 'Tác giả'}</p>
                      {item?.storyEditor && (
                        <p className="text-[10px] text-pink-600 font-medium line-clamp-1">
                          Ed: {item.storyEditor}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-3 pt-0">
                    {item.purchaseBadgeType === 'full_book' ? (
                      <div className="w-full text-center py-1.5 px-2 rounded-xl text-xs font-black bg-rose-100 text-amber-700 dark:bg-rose-950/80 dark:text-amber-300 border border-rose-300 dark:border-rose-800 shadow-2xs flex items-center justify-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        <span className="truncate">Mua Trọn Bộ</span>
                      </div>
                    ) : (
                      <div className="w-full text-center py-1.5 px-2 rounded-xl text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs flex items-center justify-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span className="truncate">Mua Chương Lẻ</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
