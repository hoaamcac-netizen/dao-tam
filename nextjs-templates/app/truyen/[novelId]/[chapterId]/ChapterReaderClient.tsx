'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  limit,
  orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../../../../lib/firebase';
import type { CachedChapter, CachedNovel } from '../../../../lib/firestoreServerCache';
import { AlertCircle, RefreshCw, BookOpen } from 'lucide-react';
import LoadingSpinner from '../../../components/LoadingSpinner';
import AntiTheftChapterReader from '../../../components/AntiTheftChapterReader';

interface ChapterReaderClientProps {
  initialNovel: CachedNovel | null;
  initialChapter: CachedChapter | null;
  initialChaptersList: CachedChapter[];
  needsClientAuthContent: boolean;
  rawNovelId: string;
  rawChapterId: string;
}

export default function ChapterReaderClient({
  initialNovel,
  initialChapter,
  initialChaptersList,
  needsClientAuthContent,
  rawNovelId,
  rawChapterId,
}: ChapterReaderClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  let novelId = rawNovelId;
  let chapterId = rawChapterId;
  try {
    novelId = decodeURIComponent(rawNovelId).trim();
  } catch {}
  try {
    chapterId = decodeURIComponent(rawChapterId).trim();
  } catch {}

  const autoPlay = searchParams?.get('autoPlay') === 'true';

  const hasReadyInitialData = Boolean(
    initialNovel &&
      initialChapter &&
      (!needsClientAuthContent || ((initialChapter?.content?.length ?? 0) > 20))
  );

  const [isLoading, setIsLoading] = useState<boolean>(!hasReadyInitialData);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [story, setStory] = useState<CachedNovel | null>(initialNovel);
  const [chapter, setChapter] = useState<CachedChapter | null>(initialChapter);
  const [chaptersList, setChaptersList] = useState<CachedChapter[]>(Array.isArray(initialChaptersList) ? initialChaptersList : []);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Cờ khóa chống Race Condition (tránh nhảy cóc nhiều chương khi auto-next)
  const isNavigating = useRef<boolean>(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
    });
    return () => unsub();
  }, []);

  // Nếu dữ liệu đã được cache đầy đủ bởi ISR Server Component -> 0 lượt Read Firestore ở client!
  // Chỉ fetch ở client nếu: (1) chưa có initialNovel/initialChapter hoặc (2) nội dung chương nằm ở subcollection yêu cầu Auth.
  useEffect(() => {
    if (!needsClientAuthContent && initialNovel && initialChapter?.content) {
      setStory(initialNovel);
      setChapter(initialChapter);
      setChaptersList(initialChaptersList);
      setIsLoading(false);
      isNavigating.current = false;
      return;
    }

    let isMounted = true;

    async function loadClientFallbackOrAuthContent() {
      if (!novelId) {
        setIsLoading(false);
        setErrorMessage('Đường dẫn truyện không hợp lệ.');
        return;
      }

      if (!initialNovel) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        let currentStory: CachedNovel | null = initialNovel;

        if (!currentStory) {
          const novelsCol = collection(db, 'novels');
          const qSlug = query(novelsCol, where('slug', '==', novelId), limit(1));
          const slugSnap = await getDocs(qSlug);

          if (!slugSnap.empty && slugSnap.docs?.[0]) {
            const docSnap = slugSnap.docs[0];
            const raw = (docSnap.data() as any) || {};
            currentStory = {
              id: docSnap.id,
              ...raw,
              categories: Array.isArray(raw.categories) ? raw.categories : [],
              genres: Array.isArray(raw.genres) ? raw.genres : (Array.isArray(raw.categories) ? raw.categories : []),
              chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
            };
          } else {
            const docSnap = await getDoc(doc(db, 'novels', novelId));
            if (docSnap.exists()) {
              const raw = (docSnap.data() as any) || {};
              currentStory = {
                id: docSnap.id,
                ...raw,
                categories: Array.isArray(raw.categories) ? raw.categories : [],
                genres: Array.isArray(raw.genres) ? raw.genres : (Array.isArray(raw.categories) ? raw.categories : []),
                chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
              };
            }
          }
        }

        if (!currentStory) {
          if (isMounted) {
            setErrorMessage(
              `Không tìm thấy bộ truyện "${novelId}". Truyện có thể đã bị gỡ hoặc chỉnh sửa slug.`
            );
            setIsLoading(false);
          }
          return;
        }

        let sortedChapters =
          (initialChaptersList?.length || 0) > 0
            ? [...(initialChaptersList || [])]
            : Array.isArray(currentStory.chapters)
            ? [...currentStory.chapters]
            : [];

        if ((sortedChapters?.length || 0) === 0) {
          try {
            const subCol = collection(db, 'novels', currentStory.id, 'chapters');
            const qChapters = query(subCol, orderBy('number', 'asc'), limit(100));
            const subSnap = await getDocs(qChapters);
            sortedChapters = (subSnap?.docs || []).map((d) => ({ id: d.id, ...(d.data() as any) }));
          } catch {}
        }

        sortedChapters.sort((a, b) => (a.number || 0) - (b.number || 0));

        const parsedNumber = parseInt(chapterId.replace(/[^0-9]/g, ''), 10) || 1;
        let targetChapter =
          (sortedChapters || []).find(
            (c) =>
              c.id === chapterId ||
              c.slug === chapterId ||
              (typeof c.number === 'number' && c.number === parsedNumber)
          ) || initialChapter;

        if (targetChapter && (!targetChapter.content || (targetChapter.content?.length ?? 0) < 20 || targetChapter.isVip)) {
          try {
            const chDocRef = doc(db, 'novels', currentStory.id, 'chapters', targetChapter.id);
            const chSnap = await getDoc(chDocRef);
            if (chSnap.exists()) {
              const fullData = chSnap.data();
              targetChapter = {
                ...targetChapter,
                content: fullData.content || targetChapter.content,
                title: fullData.title || targetChapter.title,
              };
            }
          } catch {}
        }

        if (!targetChapter) {
          targetChapter = {
            id: chapterId || `chuong-${parsedNumber}`,
            number: parsedNumber,
            title: `Chương ${parsedNumber}`,
            content: `Nội dung Chương ${parsedNumber} của bộ truyện "${
              currentStory?.title || 'Đạo Tâm'
            }" đang được đồng bộ và cập nhật.`,
          };
        } else if (!targetChapter.content) {
          targetChapter = {
            ...targetChapter,
            content: `Nội dung Chương ${targetChapter.number}: ${targetChapter.title} yêu cầu đăng nhập hoặc đang được đồng bộ.`,
          };
        }

        if (!isMounted) return;

        setStory(currentStory);
        setChaptersList(sortedChapters);
        setChapter(targetChapter);
        setIsLoading(false);
        isNavigating.current = false;
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(`Lỗi tải dữ liệu: ${err?.message || 'Không thể kết nối Firestore'}`);
        setIsLoading(false);
        isNavigating.current = false;
      }
    }

    loadClientFallbackOrAuthContent();
    return () => {
      isMounted = false;
    };
  }, [
    novelId,
    chapterId,
    initialNovel,
    initialChapter,
    initialChaptersList,
    needsClientAuthContent,
    currentUser?.uid,
  ]);

  // Đồng bộ UI trang đọc chương khi GlobalAudioPlayer tự động gối đầu sang Chương B (via window.history.pushState)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isCancelled = false;

    const handleSilentAudioChapterChanged = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        novel?: { id?: string };
        chapter?: {
          id: string;
          number: number;
          title?: string;
          slug?: string;
          content?: string;
        };
      }>;
      const detail = customEvent.detail;
      if (!detail?.chapter || !story?.id) return;
      if (detail.novel?.id && detail.novel.id !== story.id) return;

      const incoming = detail.chapter;
      if (
        chapter &&
        chapter.id === incoming.id &&
        Number(chapter.number) === Number(incoming.number) &&
        chapter.content
      ) {
        return;
      }

      const matched = (chaptersList || []).find(
        (c) => c.id === incoming.id || Number(c.number) === Number(incoming.number)
      );

      let nextChapter: CachedChapter = {
        ...(matched || {}),
        id: matched?.id || incoming.id,
        number: matched?.number ?? incoming.number,
        title: matched?.title || incoming.title || `Chương ${incoming.number}`,
        slug: matched?.slug || incoming.slug,
        content: incoming.content || matched?.content || '',
      };

      if (!nextChapter.content || (nextChapter.content?.trim()?.length ?? 0) < 20 || nextChapter.isVip) {
        const candidateIds = Array.from(
          new Set([
            nextChapter.id,
            `chuong-${nextChapter.number}`,
            String(nextChapter.number),
          ].filter(Boolean))
        );
        for (const docId of candidateIds) {
          try {
            const snap = await getDoc(doc(db, 'novels', story.id, 'chapters', docId));
            if (isCancelled) return;
            if (snap.exists()) {
              const data = snap.data();
              if (data?.content) {
                nextChapter = {
                  ...nextChapter,
                  content: data.content,
                  title: data.title || nextChapter.title,
                };
                break;
              }
            }
          } catch {}
        }
      }

      if (isCancelled) return;
      isNavigating.current = false;
      setChapter(nextChapter);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener(
      'daotam:audio-chapter-changed',
      handleSilentAudioChapterChanged as EventListener
    );
    return () => {
      isCancelled = true;
      window.removeEventListener(
        'daotam:audio-chapter-changed',
        handleSilentAudioChapterChanged as EventListener
      );
    };
  }, [story?.id, chapter?.id, chapter?.number, chapter?.content, chaptersList]);

  const handleAutoNextChapter = useCallback(() => {
    if (isNavigating.current) return;
    isNavigating.current = true;

    const safeChapters = Array.isArray(chaptersList) ? chaptersList : [];
    const currentIndex = safeChapters.findIndex(
      (c) => c.id === chapter?.id || c.number === chapter?.number
    );
    const cleanNovelSlug =
      story?.slug && story.slug.trim() ? story.slug.trim() : story?.id || novelId;

    if (currentIndex >= 0 && currentIndex < (safeChapters?.length || 0) - 1) {
      const nextCh = safeChapters[currentIndex + 1];
      const nextTarget =
        nextCh.slug || (nextCh.number ? `chuong-${nextCh.number}` : nextCh.id);
      router.push(
        `/truyen/${encodeURIComponent(cleanNovelSlug)}/chuong/${encodeURIComponent(
          nextTarget
        )}?autoPlay=true`
      );
    } else {
      const nextNum = (chapter?.number || 1) + 1;
      router.push(
        `/truyen/${encodeURIComponent(cleanNovelSlug)}/chuong/chuong-${nextNum}?autoPlay=true`
      );
    }
  }, [chaptersList, chapter?.id, chapter?.number, story?.slug, story?.id, novelId, router]);

  const handleManualSelectChapter = useCallback(
    (targetIdOrNum: string | number) => {
      isNavigating.current = false;
      const cleanNovelSlug =
        story?.slug && story.slug.trim() ? story.slug.trim() : story?.id || novelId;
      const targetSlug =
        typeof targetIdOrNum === 'number' ? `chuong-${targetIdOrNum}` : String(targetIdOrNum);
      router.push(
        `/truyen/${encodeURIComponent(cleanNovelSlug)}/chuong/${encodeURIComponent(targetSlug)}${
          autoPlay ? '?autoPlay=true' : ''
        }`
      );
    },
    [story?.slug, story?.id, novelId, autoPlay, router]
  );

  const handleManualPrev = useCallback(() => {
    isNavigating.current = false;
    const safeChapters = Array.isArray(chaptersList) ? chaptersList : [];
    const currentIndex = safeChapters.findIndex(
      (c) => c.id === chapter?.id || c.number === chapter?.number
    );
    const cleanNovelSlug =
      story?.slug && story.slug.trim() ? story.slug.trim() : story?.id || novelId;

    if (currentIndex > 0) {
      const prevCh = safeChapters[currentIndex - 1];
      const prevTarget =
        prevCh.slug || (prevCh.number ? `chuong-${prevCh.number}` : prevCh.id);
      router.push(
        `/truyen/${encodeURIComponent(cleanNovelSlug)}/chuong/${encodeURIComponent(prevTarget)}${
          autoPlay ? '?autoPlay=true' : ''
        }`
      );
    } else {
      const prevNum = Math.max(1, (chapter?.number || 1) - 1);
      router.push(
        `/truyen/${encodeURIComponent(cleanNovelSlug)}/chuong/chuong-${prevNum}${
          autoPlay ? '?autoPlay=true' : ''
        }`
      );
    }
  }, [chaptersList, chapter?.id, chapter?.number, story?.slug, story?.id, novelId, autoPlay, router]);

  if (isLoading) {
    return (
      <LoadingSpinner
        message="Đang tải chương truyện..."
        subMessage="Đạo Tâm đang kết nối và nạp nội dung mượt mà, tối ưu Quota..."
        fullScreen={true}
      />
    );
  }

  if (errorMessage || !story || !chapter) {
    return (
      <div className="min-h-screen bg-pink-50/20 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-pink-100 dark:border-pink-950/60 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
            Không tìm thấy chương truyện
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            {errorMessage || 'Dữ liệu chương bạn yêu cầu hiện không khả dụng.'}
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2 justify-center">
            <button
              onClick={() =>
                router.push(
                  `/truyen/${encodeURIComponent(
                    story?.slug && story.slug.trim() ? story.slug.trim() : story?.id || novelId
                  )}`
                )
              }
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-pink-600/20"
            >
              <BookOpen className="w-4 h-4" />
              <span>Về Mục Lục Truyện</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tải lại trang</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AntiTheftChapterReader
      novel={{
        id: story?.id ?? novelId,
        title: story?.title ?? 'Đạo Tâm Truyện',
        author: story?.author ?? 'Tác giả',
        slug: story?.slug,
        coverImage: story?.coverImage,
      }}
      chapter={{
        id: chapter?.id ?? chapterId,
        number: chapter?.number ?? 1,
        title: chapter?.title ?? `Chương ${chapter?.number ?? 1}`,
        content: chapter?.content ?? '',
        slug: chapter?.slug,
        isVip: chapter?.isVip ?? false,
      }}
      chaptersList={chaptersList}
      currentUser={
        currentUser
          ? {
              id: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'Độc giả',
            }
          : {
              id: 'guest',
              email: 'reader@daotam.vn',
              displayName: 'Độc giả',
            }
      }
      onBackToNovel={() =>
        router.push(
          `/truyen/${encodeURIComponent(
            story?.slug && story.slug.trim() ? story.slug.trim() : story?.id || novelId
          )}`
        )
      }
      onNextChapter={handleAutoNextChapter}
      onPrevChapter={handleManualPrev}
      onManualSelectChapter={handleManualSelectChapter}
    />
  );
}
