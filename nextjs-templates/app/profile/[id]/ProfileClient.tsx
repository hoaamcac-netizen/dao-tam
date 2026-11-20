'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Library,
  Loader2,
  UserCheck,
} from 'lucide-react';
import {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../../lib/firebase';

interface ProfileData {
  uid: string;
  id?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  role?: string;
  email?: string;
  followers?: string[];
  xuBalance?: number;
}

export default function ProfileClient() {
  const params = useParams();
  const router = useRouter();
  const profileId = (params?.id as string) || '';

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [novels, setNovels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'novels' | 'tu-truyen' | 'info'>('novels');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Chỉ dùng getDoc(doc(db, 'users', profileId)) 1 lần duy nhất (tuyệt đối không dùng onSnapshot cho user doc)
  useEffect(() => {
    if (!profileId) return;

    let isMounted = true;
    setLoading(true);

    const parseXu = (d: Record<string, any> | undefined) => {
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

    async function loadProfileAndNovels() {
      try {
        const userDocRef = doc(db, 'users', profileId);
        const [userSnap, novelsSnap] = await Promise.all([
          getDoc(userDocRef),
          getDocs(query(collection(db, 'novels'), where('submittedBy.userId', '==', profileId))),
        ]);

        if (!isMounted) return;

        if (userSnap.exists()) {
          const data = userSnap.data() || {};
          setProfileData({
            uid: userSnap.id,
            id: userSnap.id,
            displayName: data?.displayName ?? 'Người dùng',
            avatarUrl: data?.avatarUrl,
            bio: data?.bio ?? '',
            role: data?.role ?? 'reader',
            email: data?.email,
            followers: Array.isArray(data?.followers) ? data.followers : [],
            xuBalance: parseXu(data),
          });
        } else {
          setProfileData({
            uid: profileId,
            id: profileId,
            displayName: decodeURIComponent(profileId),
            role: 'reader',
            followers: [],
            xuBalance: 0,
          });
        }

        const list: any[] = [];
        novelsSnap.forEach((d) => {
          const nd = d.data() || {};
          list.push({
            id: d.id,
            ...nd,
            categories: Array.isArray(nd.categories) ? nd.categories : [],
            genres: Array.isArray(nd.genres) ? nd.genres : (Array.isArray(nd.categories) ? nd.categories : []),
            chapters: Array.isArray(nd.chapters) ? nd.chapters : [],
          });
        });
        setNovels(list);
      } catch (err) {
        console.warn('Lỗi tải hồ sơ người dùng từ Firestore:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProfileAndNovels();

    return () => {
      isMounted = false;
    };
  }, [profileId]);

  const isOwner = Boolean(
    currentUser?.uid &&
      profileData?.uid &&
      currentUser.uid === profileData.uid
  );

  const isPrivilegedUser = Boolean(
    profileData?.role === 'author' ||
      profileData?.role === 'editor' ||
      profileData?.role === 'admin' ||
      (novels?.length ?? 0) > 0
  );

  useEffect(() => {
    if (!isPrivilegedUser && activeTab === 'novels') {
      setActiveTab(isOwner ? 'tu-truyen' : 'info');
    }
  }, [isPrivilegedUser, isOwner, activeTab]);

  if (loading || isAuthLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Đang tải thông tin hồ sơ người dùng...
        </p>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-600 dark:text-slate-400">Không tìm thấy thông tin người dùng.</p>
        <Link href="/" className="mt-4 inline-block text-rose-500 font-bold hover:underline">
          Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-6">
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>
      </div>

      <div className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          <div className="relative flex-shrink-0">
            {profileData?.avatarUrl ? (
              <img
                src={profileData.avatarUrl}
                alt={profileData?.displayName ?? 'Avatar'}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-slate-200 dark:border-slate-700 shadow-md"
              />
            ) : (
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-600 text-white flex items-center justify-center font-bold text-4xl shadow-md border-4 border-slate-200 dark:border-slate-700 uppercase">
                {(profileData?.displayName ?? 'U').charAt(0)}
              </div>
            )}
          </div>

          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  {profileData?.displayName ?? 'Người dùng'}
                </h1>
                <div className="flex items-center gap-2 mt-1 justify-center md:justify-start">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                      profileData?.role === 'admin'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : profileData?.role === 'editor'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        : profileData?.role === 'author'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                        : 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-400/40 badge-reader-yellow font-extrabold'
                    }`}
                  >
                    {profileData?.role === 'admin'
                      ? 'Admin'
                      : profileData?.role === 'editor'
                      ? 'Editor'
                      : profileData?.role === 'author'
                      ? 'Tác Giả'
                      : 'Độc Giả'}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {profileData?.bio || 'Chưa có tiểu sử giới thiệu.'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3 mb-6 overflow-x-auto whitespace-nowrap">
        {isPrivilegedUser && (
          <button
            type="button"
            onClick={() => setActiveTab('novels')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeTab === 'novels'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Truyện đã đăng</span>
            {(novels?.length ?? 0) > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === 'novels'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {novels?.length ?? 0}
              </span>
            )}
          </button>
        )}

        {isOwner && (
          <button
            type="button"
            onClick={() => setActiveTab('tu-truyen')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeTab === 'tu-truyen'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Library className="w-4 h-4" />
            <span>Tủ Truyện</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeTab === 'info'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Thông tin tài khoản</span>
        </button>
      </div>

      {activeTab === 'novels' && isPrivilegedUser ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {(novels || []).map((novel) => (
              <Link
                key={novel?.id}
                href={`/truyen/${novel?.slug || novel?.id}`}
                className="group flex flex-col bg-white dark:bg-slate-900 rounded-2xl p-2.5 border border-slate-200 dark:border-slate-800 hover:border-pink-300 transition"
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2 bg-slate-100 dark:bg-slate-800">
                  <img
                    src={
                      novel?.coverImage ||
                      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'
                    }
                    alt={novel?.title ?? 'Bìa truyện'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1 group-hover:text-rose-500">
                  {novel?.title ?? 'Tác phẩm'}
                </h3>
                <p className="text-[11px] text-slate-500 truncate">{novel?.author || 'Tác giả'}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : activeTab === 'tu-truyen' && isOwner ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Library className="w-5 h-5 text-rose-500" />
                <span>Tủ Truyện Của Bạn</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Toàn bộ các tác phẩm bạn đã sở hữu trọn bộ hoặc mua chương VIP được quản lý độc lập tại trang Tủ Truyện.
              </p>
            </div>
            <Link
              href="/tu-truyen-cua-ban"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition flex items-center gap-2 self-start sm:self-auto"
            >
              <span>Mở Trang Tủ Truyện Độc Lập</span>
              <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
            </Link>
          </div>

          <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-6 sm:p-8 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center mx-auto">
              <Library className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
              Khu Vực Quản Lý Tủ Truyện Độc Lập
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Toàn bộ dữ liệu mua trọn bộ và mở khóa chương VIP đã được tách biệt hoàn toàn sang route page độc lập{' '}
              <strong>/tu-truyen-cua-ban</strong> với đầy đủ bộ lọc, thống kê và gắn nhãn VIP chính xác.
            </p>
            <div className="pt-2">
              <Link
                href="/tu-truyen-cua-ban"
                className="inline-block px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/20 transition"
              >
                Truy cập ngay Tủ truyện của bạn &rarr;
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-rose-500" />
              <span>THÔNG TIN TÀI KHOẢN</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Hồ sơ chi tiết và thông tin cơ bản người dùng tại Đạo Tâm
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Họ và tên / Biệt danh</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {profileData?.displayName || 'Chưa đặt tên'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vai trò tài khoản</div>
              <div className="text-sm font-bold text-rose-600 dark:text-rose-400 uppercase">
                {profileData?.role === 'admin'
                  ? 'Quản Trị Viên'
                  : profileData?.role === 'author'
                  ? 'Tác Giả'
                  : profileData?.role === 'editor'
                  ? 'Editor'
                  : 'Độc Giả'}
              </div>
            </div>

            {isOwner && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email liên kết</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {profileData?.email || currentUser?.email || 'Chưa liên kết'}
                </div>
              </div>
            )}

            {isOwner && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Số dư ví Xu (Realtime)</div>
                <div className="text-sm font-black text-rose-600 dark:text-rose-400">
                  {(profileData?.xuBalance ?? 0).toLocaleString('vi-VN')} Xu
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-1 md:col-span-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tiểu sử giới thiệu</div>
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {profileData?.bio || 'Chưa cập nhật tiểu sử giới thiệu.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
