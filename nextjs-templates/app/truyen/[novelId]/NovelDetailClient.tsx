'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  limit,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { CachedNovel } from '../../../lib/firestoreServerCache';
import { NovelCommentsClient } from '../../../components/NovelCommentsClient';
import {
  BookOpen,
  Headphones,
  Share2,
  Eye,
  ChevronRight,
  ArrowLeft,
  Check,
  AlertCircle,
} from 'lucide-react';

interface NovelDetailClientProps {
  initialNovel: CachedNovel | null;
  rawIdentifier: string;
}

export default function NovelDetailClient({
  initialNovel,
  rawIdentifier,
}: NovelDetailClientProps) {
  const router = useRouter();

  const [novel, setNovel] = useState<CachedNovel | null>(initialNovel);
  const [isLoading, setIsLoading] = useState<boolean>(!initialNovel);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  // Chỉ fallback fetch trên Client nếu ISR server chưa lấy được (ví dụ truyện mới tạo chưa revalidate)
  useEffect(() => {
    if (initialNovel) {
      setNovel(initialNovel);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    async function fallbackLoadNovel() {
      let decodedSlug = '';
      try {
        decodedSlug = decodeURIComponent(rawIdentifier).trim();
      } catch {
        decodedSlug = rawIdentifier.trim();
      }

      if (!decodedSlug) {
        setIsLoading(false);
        setErrorMessage('Đường dẫn không hợp lệ');
        return;
      }

      setIsLoading(true);
      try {
        const novelsCol = collection(db, 'novels');
        let novelData: CachedNovel | null = null;

        const qSlug = query(novelsCol, where('slug', '==', decodedSlug), limit(1));
        const snapSlug = await getDocs(qSlug);
        if (!snapSlug.empty && snapSlug.docs?.[0]) {
          const d = snapSlug.docs[0];
          const raw = (d.data() as any) || {};
          novelData = {
            id: d.id,
            ...raw,
            categories: Array.isArray(raw.categories) ? raw.categories : [],
            genres: Array.isArray(raw.genres) ? raw.genres : (Array.isArray(raw.categories) ? raw.categories : []),
            chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
          };
        }

        if (!novelData) {
          const docSnap = await getDoc(doc(db, 'novels', decodedSlug));
          if (docSnap.exists()) {
            const raw = (docSnap.data() as any) || {};
            novelData = {
              id: docSnap.id,
              ...raw,
              categories: Array.isArray(raw.categories) ? raw.categories : [],
              genres: Array.isArray(raw.genres) ? raw.genres : (Array.isArray(raw.categories) ? raw.categories : []),
              chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
            };
          }
        }

        if (!isMounted) return;
        if (novelData) {
          setNovel(novelData);
        } else {
          setErrorMessage(
            `Không tìm thấy bộ truyện "${decodedSlug}". Bộ truyện này có thể đã bị xóa hoặc chưa xuất bản.`
          );
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(`Lỗi tải dữ liệu: ${err?.message || 'Không thể kết nối Firestore'}`);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fallbackLoadNovel();
    return () => {
      isMounted = false;
    };
  }, [initialNovel, rawIdentifier]);

  const handleShare = () => {
    if (!novel) return;
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://dao-tam-doc-truyen.vercel.app';
    const cleanIdentifier =
      novel.slug && novel.slug.trim() ? novel.slug.trim() : (novel.id || '').trim();
    const shareUrl = `${origin}/truyen/${cleanIdentifier}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator
        .share({
          title: novel.title,
          text: `Đọc truyện "${novel.title}" tại Đạo Tâm`,
          url: shareUrl,
        })
        .catch(() => {});
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  const handleStartAudio = (targetChapterNumber: number = 1) => {
    if (!novel) return;
    try {
      localStorage.setItem('daotam_audio_bar_visible', 'true');
      localStorage.setItem('daotam_audio_active', 'true');
    } catch {}

    const cleanIdentifier =
      novel.slug && novel.slug.trim() ? novel.slug.trim() : novel.id;
    router.push(
      `/truyen/${encodeURIComponent(cleanIdentifier)}/chuong/chuong-${targetChapterNumber}?autoPlay=true`
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Đang tìm nạp bộ truyện...
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage || !novel) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-rose-100 dark:border-rose-950 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
            Không tìm thấy nội dung
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            {errorMessage || 'Bộ truyện bạn đang tìm kiếm không tồn tại hoặc đã được gỡ bỏ.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Về Trang Chủ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const chapters = Array.isArray(novel?.chapters) ? novel.chapters : [];
  const cleanIdentifier =
    novel?.slug && novel.slug.trim() ? novel.slug.trim() : novel?.id ?? '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-pink-600 mb-6 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </button>

        {/* Card thông tin truyện */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 mb-8">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-full sm:w-48 h-64 shrink-0 rounded-xl overflow-hidden shadow-md bg-slate-100 dark:bg-slate-800">
              <img
                src={
                  novel?.coverImage ||
                  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'
                }
                alt={novel?.title ?? 'Bìa truyện'}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-300 border border-pink-200/50 dark:border-pink-900/50">
                    {novel?.status ?? 'Đang ra'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> {(novel?.views ?? 0).toLocaleString()} lượt đọc
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-2 leading-tight">
                  {novel?.title ?? 'Tác phẩm'}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Tác giả:{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {novel?.author ?? 'Tác giả'}
                  </span>
                </p>

                {novel?.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-4 leading-relaxed mb-6">
                    {novel.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    router.push(`/truyen/${encodeURIComponent(cleanIdentifier)}/chuong/chuong-1`);
                  }}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm bg-pink-600 hover:bg-pink-700 text-white flex items-center gap-2 shadow-md shadow-pink-500/20 transition-all cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" /> Đọc từ đầu
                </button>

                <button
                  onClick={() => handleStartAudio(1)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-900 flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                  title="Nghe Audio Microsoft Edge TTS"
                >
                  <Headphones className="w-4 h-4" /> Nghe Audio C1
                </button>

                <button
                  onClick={handleShare}
                  className="px-4 py-2.5 rounded-xl font-semibold text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                  title="Chia sẻ truyện"
                >
                  {copiedShare ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Đã copy link!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>Chia sẻ</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Danh sách chương */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-pink-600" />
              Mục lục ({(chapters?.length ?? 0) > 0 ? chapters?.length ?? 0 : novel?.totalChapters ?? 1}{' '}
              chương)
            </h2>
          </div>

          {(chapters?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              Chương đang được cập nhật. Bạn có thể nhấn &quot;Đọc từ đầu&quot; để tải dữ liệu.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(chapters || []).map((ch) => {
                const cleanChapterSlug = ch?.slug || `chuong-${ch?.number ?? 1}`;
                return (
                  <button
                    key={ch?.id || ch?.number}
                    onClick={() =>
                      router.push(
                        `/truyen/${encodeURIComponent(cleanIdentifier)}/chuong/${encodeURIComponent(
                          cleanChapterSlug
                        )}`
                      )
                    }
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-pink-300 dark:hover:border-pink-800 hover:bg-pink-50/50 dark:hover:bg-pink-950/20 text-left transition-colors cursor-pointer group"
                  >
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-pink-600 dark:group-hover:text-pink-400 truncate">
                      {ch?.title || `Chương ${ch?.number ?? 1}`}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-pink-600 shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bình luận động: Luôn dùng Client-side fetching để không ảnh hưởng ISR cache */}
        <NovelCommentsClient novelId={novel.id} novelTitle={novel.title} />
      </div>
    </div>
  );
}
