'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  checkIsAdmin,
  trackChapterFetchAndEnforceRateLimit,
  subscribeUserBanStatus,
  BAN_WARNING_MESSAGE,
  TEMP_LOCK_TOAST_MESSAGE,
} from '../../lib/antiCrawlerRateLimiter';
import { useGlobalAudio } from '../../contexts/AudioContext';
import { useReaderSettings } from '../../hooks/useReaderSettings';
import { ReaderSettingsPanel } from '../../components/ReaderSettingsPanel';
import { NovelCommentsClient } from '../../components/NovelCommentsClient';
import {
  AlertTriangle,
  AlertCircle,
  Play,
  Pause,
  ShieldAlert,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Share2,
  Flag,
  Sliders,
  List,
  X,
} from 'lucide-react';

const DECOY_WATERMARKS = [
  'Truyện được đăng độc quyền tại Đạo Tâm. Các web khác đều là ăn cắp.',
  'Bản quyền thuộc Đạo Tâm (daotam.vn) - Nghiêm cấm mọi hành vi sao chép, reup hay cào dữ liệu trái phép.',
  'Cảnh báo: Đoạn văn ẩn này được nhúng tự động để nhận diện website ăn cắp nội dung.',
  'Truyện đang đọc tại Đạo Tâm. Mọi trang web sao chép lại đều vi phạm bản quyền tác giả.',
  'Đọc bản chính thức tại Đạo Tâm để ủng hộ dịch giả và tác giả.',
];

interface ChapterData {
  id: string;
  number: number;
  title: string;
  content: string;
  slug?: string;
  isVip?: boolean;
}

interface NovelData {
  id: string;
  title: string;
  author: string;
  slug?: string;
  coverImage?: string;
}

interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  isBanned?: boolean;
}

interface ChapterListItem {
  id: string;
  number: number;
  title: string;
  slug?: string;
}

interface AntiTheftChapterReaderProps {
  novel: NovelData;
  chapter: ChapterData;
  currentUser?: CurrentUser | null;
  chaptersList?: ChapterListItem[];
  onBackToNovel?: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
  onManualSelectChapter?: (chapterIdOrNum: string | number) => void;
}

export default function AntiTheftChapterReader({
  novel,
  chapter,
  currentUser,
  chaptersList = [],
  onBackToNovel,
  onNextChapter,
  onPrevChapter,
  onManualSelectChapter,
}: AntiTheftChapterReaderProps) {
  const isAdmin = checkIsAdmin(currentUser?.email);

  const [drmToast, setDrmToast] = useState<string | null>(null);
  const [rateLimitToast, setRateLimitToast] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState<boolean>(false);
  const [bannedNotice, setBannedNotice] = useState<string | null>(() =>
    currentUser?.isBanned ? BAN_WARNING_MESSAGE : null
  );

  // TÙY CHỈNH ĐỌC TRUYỆN CỤC BỘ (CHỈ LƯU localStorage - 0 FIRESTORE WRITE)
  const {
    settings: readerSettings,
    fontFamilyCss,
    updateSettings: updateReaderSettings,
    resetSettings: resetReaderSettings,
  } = useReaderSettings();

  const readerThemeClasses = useMemo(() => {
    if (readerSettings.theme === 'dark') {
      return {
        container: 'bg-slate-950 text-slate-100',
        paragraph: 'text-slate-100',
        title: 'text-white',
      };
    }
    if (readerSettings.theme === 'sepia') {
      return {
        container: 'bg-[#f8f3e6] text-[#3a2c1a]',
        paragraph: 'text-[#3a2c1a]',
        title: 'text-[#2b1f10]',
      };
    }
    return {
      container: 'bg-pink-50/20 dark:bg-slate-950 text-slate-800 dark:text-white',
      paragraph: 'text-slate-800 dark:text-white',
      title: 'text-slate-900 dark:text-white',
    };
  }, [readerSettings.theme]);

  // KẾT NỐI GLOBAL AUDIO STATE (Đặt ngoài layout.tsx - phát xuyên suốt khi chuyển trang)
  const {
    activeNovel,
    activeChapter,
    currentIndex,
    isPlaying: globalIsPlaying,
    isLoading: globalIsLoading,
    voiceId,
    playChapter,
    togglePlay,
    setVoiceId,
    seekToParagraph,
    stopForManualChapterChange,
  } = useGlobalAudio();

  const isCurrentChapterPlaying = Boolean(
    activeNovel?.id === novel.id &&
      activeChapter &&
      (activeChapter.id === chapter.id || Number(activeChapter.number) === Number(chapter.number))
  );

  const isPlaying = isCurrentChapterPlaying && globalIsPlaying;
  const isLoadingAudio = isCurrentChapterPlaying && globalIsLoading;
  const speakingIndex = isCurrentChapterPlaying ? currentIndex : -1;

  // 1. ĐỒNG BỘ REAL-TIME TRẠNG THÁI KHÓA USER TRỰC TIẾP TỪ FIRESTORE
  useEffect(() => {
    const unsub = subscribeUserBanStatus(currentUser?.id, (isBanned) => {
      setBannedNotice(isBanned ? BAN_WARNING_MESSAGE : null);
    });
    return () => unsub();
  }, [currentUser?.id]);

  // 2. TÍN HIỆU AUTO-PLAY TỪ URL (?autoPlay=true)
  const searchParams = useSearchParams();
  const autoPlayParam = searchParams?.get('autoPlay') === 'true';

  // 3. TIẾN TRÌNH ĐỌC (READING PROGRESS) THROTTLED ~150MS
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  useEffect(() => {
    let lastTime = 0;
    let timeoutId: any = null;

    const updateProgress = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const pct = Math.min(100, Math.max(0, Math.round((window.scrollY / docHeight) * 100)));
        setScrollProgress(pct);
      }
    };

    const onScroll = () => {
      const now = Date.now();
      if (now - lastTime >= 150) {
        lastTime = now;
        updateProgress();
      } else {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          lastTime = Date.now();
          updateProgress();
        }, 150);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timeoutId);
    };
  }, []);

  // 3b. LƯU LỊCH SỬ ĐỌC CỤC BỘ VÀO localStorage CHO ContinueReadingBanner (0 FIRESTORE WRITE)
  useEffect(() => {
    if (typeof window === 'undefined' || !novel?.id || !chapter?.id) return;
    try {
      const storageKey = 'daotam_reading_history';
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const existing: any[] = Array.isArray(parsed) ? parsed : [];

      const novelIdentifier = (novel.slug && novel.slug.trim()) || novel.id;
      const chapterIdentifier =
        (chapter.slug && chapter.slug.trim()) || chapter.id || `chuong-${chapter.number || 1}`;

      const entry = {
        novelId: novel.id,
        novelSlug: novel.slug || '',
        novelTitle: novel.title,
        chapterId: chapter.id,
        chapterSlug: chapter.slug || '',
        chapterNumber: chapter.number || 1,
        chapterTitle: chapter.title || `Chương ${chapter.number || 1}`,
        url: `/truyen/${encodeURIComponent(novelIdentifier)}/chuong/${encodeURIComponent(chapterIdentifier)}`,
        lastReadAt: Date.now(),
      };

      const filtered = existing.filter((item) => item?.novelId !== novel.id);
      const nextHistory = [entry, ...filtered].slice(0, 20);
      window.localStorage.setItem(storageKey, JSON.stringify(nextHistory));
    } catch {
      // Ignore storage quota errors
    }
  }, [novel?.id, novel?.slug, novel?.title, chapter?.id, chapter?.slug, chapter?.number, chapter?.title]);

  // 4. PHÂN TRANG DANH SÁCH CHƯƠNG (> 20 CHƯƠNG) TỐI ƯU DOM
  const safeChaptersList = useMemo(
    () => (Array.isArray(chaptersList) ? chaptersList : []),
    [chaptersList]
  );
  const [visibleChapterCount, setVisibleChapterCount] = useState<number>(20);
  const displayedChapters = useMemo(() => {
    return (safeChaptersList || []).slice(0, visibleChapterCount);
  }, [safeChaptersList, visibleChapterCount]);

  // Tách văn bản sạch theo từng câu
  const cleanParagraphs = useMemo(() => {
    if (!chapter?.content) return [];
    return (chapter.content.split(/\r?\n+/) || [])
      .map((p) => p.trim())
      .filter((p) => (p?.length || 0) > 0);
  }, [chapter?.content]);

  const autoPlayedChapterKeyRef = useRef<string>('');
  const trackedRateLimitKeyRef = useRef<string>('');

  // Kích hoạt phát tự động nếu ?autoPlay=true và Global Audio chưa đang phát chương này
  useEffect(() => {
    if (!autoPlayParam || (cleanParagraphs?.length || 0) === 0 || isCurrentChapterPlaying) return;
    const autoKey = `${novel?.id || ''}::${chapter?.id || ''}`;
    if (autoPlayedChapterKeyRef.current === autoKey) return;
    autoPlayedChapterKeyRef.current = autoKey;
    playChapter(novel, chapter, safeChaptersList, { startIndex: 0, autoStart: true });
  }, [autoPlayParam, cleanParagraphs?.length, isCurrentChapterPlaying, novel?.id, chapter?.id, playChapter, safeChaptersList]);

  // LUỒNG THỦ CÔNG: Chọn chương hoặc prev/next thủ công
  const handleManualPrev = useCallback(() => {
    stopForManualChapterChange();
    if (onPrevChapter) {
      onPrevChapter();
    }
  }, [onPrevChapter, stopForManualChapterChange]);

  const handleManualNext = useCallback(() => {
    stopForManualChapterChange();
    if (onNextChapter) {
      onNextChapter();
    }
  }, [onNextChapter, stopForManualChapterChange]);

  const handleManualSelectChapterItem = useCallback(
    (targetIdOrNum: string | number) => {
      stopForManualChapterChange();
      setShowDrawer(false);
      if (onManualSelectChapter) {
        onManualSelectChapter(targetIdOrNum);
      }
    },
    [onManualSelectChapter, stopForManualChapterChange]
  );

  const handleTogglePlay = useCallback(() => {
    if (isCurrentChapterPlaying) {
      togglePlay();
    } else {
      playChapter(novel, chapter, chaptersList, {
        startIndex: 0,
        autoStart: true,
        userExplicit: true,
      });
    }
  }, [isCurrentChapterPlaying, togglePlay, playChapter, novel, chapter, chaptersList]);

  const handleChangeVoice = useCallback(
    (newVoice: 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural') => {
      setVoiceId(newVoice);
    },
    [setVoiceId]
  );

  // Cơ chế chống spam nới lỏng 2x (60/phút) — chỉ Toast chờ 1 phút, KHÔNG khóa vĩnh viễn
  useEffect(() => {
    if (!isAdmin && chapter?.id) {
      const trackKey = `${currentUser?.id || 'guest'}::${chapter.id}`;
      if (trackedRateLimitKeyRef.current === trackKey) return;
      trackedRateLimitKeyRef.current = trackKey;
      trackChapterFetchAndEnforceRateLimit(
        currentUser?.id,
        currentUser?.email,
        chapter.id
      ).then((res) => {
        if (res.isTempLocked) {
          setRateLimitToast(res.message || TEMP_LOCK_TOAST_MESSAGE);
          setTimeout(() => setRateLimitToast(null), 5000);
        }
      });
    }
  }, [chapter?.id, currentUser?.id, currentUser?.email, isAdmin]);

  // Khóa thao tác giao diện chống cào trộm (KHÔNG pause Global Audio khi unmount!)
  useEffect(() => {
    if (isAdmin) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setDrmToast('Chuột phải đã bị vô hiệu hóa để bảo vệ bản quyền.');
      setTimeout(() => setDrmToast(null), 2500);
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData(
          'text/plain',
          `[BẢN QUYỀN ĐẠO TÂM]\nTác phẩm: "${novel.title}" - ${chapter.title}\nTác giả: ${novel.author}\nNguồn: https://dao-tam-doc-truyen.vercel.app`
        );
      }
      setDrmToast('Cảnh báo: Hành vi sao chép nội dung đã bị chặn!');
      setTimeout(() => setDrmToast(null), 3000);
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleCopy);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('copy', handleCopy);
    };
  }, [isAdmin, novel.title, novel.author, chapter.title]);

  return (
    <div
      className={`min-h-screen transition-colors pb-36 ${readerThemeClasses.container} ${
        isAdmin ? 'select-text' : 'select-none'
      }`}
    >
      {/* Banner cảnh báo chỉ hiện nếu tài khoản thực sự bị Admin khóa */}
      {bannedNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl bg-yellow-400 dark:bg-yellow-500 border-2 border-yellow-600 text-slate-950 px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3.5 animate-in slide-in-from-top-4">
          <AlertTriangle className="w-6 h-6 text-slate-950 shrink-0" />
          <div className="text-xs sm:text-sm font-bold leading-relaxed flex-1 text-slate-950">
            {bannedNotice}
          </div>
        </div>
      )}

      {/* Toast nhắc nhở tạm thời 1 phút khi thao tác quá nhanh (KHÔNG khóa vĩnh viễn) */}
      {rateLimitToast && !bannedNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-amber-100 dark:bg-amber-900/95 border border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-100 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-300 shrink-0" />
          <span className="text-xs sm:text-sm font-bold flex-1">{rateLimitToast}</span>
          <button
            type="button"
            onClick={() => setRateLimitToast(null)}
            className="p-1 rounded-lg hover:bg-black/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {drmToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in">
          <ShieldAlert className="w-4 h-4 text-pink-400" />
          <span>{drmToast}</span>
        </div>
      )}

      {/* Header điều khiển trên cùng */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-pink-100 dark:border-pink-950/60 shadow-xs px-3 sm:px-6 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {onBackToNovel && (
              <button
                type="button"
                onClick={onBackToNovel}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-pink-600 flex items-center gap-1 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mục lục</span>
              </button>
            )}

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5">
              <button
                type="button"
                onClick={handleManualPrev}
                disabled={!onPrevChapter}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-pink-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Chương trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowDrawer(true)}
                className="px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 hover:text-pink-600 transition cursor-pointer flex items-center gap-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                title="Bấm để chọn chương nhanh"
              >
                <span>Chương {chapter?.number ?? 1}</span>
                <List className="w-3 h-3 text-slate-400" />
              </button>
              <button
                type="button"
                onClick={handleManualNext}
                disabled={!onNextChapter}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-pink-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Chương sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => handleChangeVoice('vi-VN-HoaiMyNeural')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                  voiceId === 'vi-VN-HoaiMyNeural'
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
                }`}
                title="Giọng Nữ: Hoài My (Microsoft Edge Neural)"
              >
                <span>👩</span>
                <span className="hidden md:inline">Hoài My</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeVoice('vi-VN-NamMinhNeural')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                  voiceId === 'vi-VN-NamMinhNeural'
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
                }`}
                title="Giọng Nam: Nam Minh (Microsoft Edge Neural)"
              >
                <span>👨</span>
                <span className="hidden md:inline">Nam Minh</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleTogglePlay}
              className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white shadow-pink-500/25'
                  : 'bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/20'
              }`}
              title={isPlaying ? 'Tạm dừng nghe' : 'Bắt đầu nghe Audio'}
            >
              {isLoadingAudio ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{isPlaying ? 'Tạm dừng' : 'Phát Audio'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSettingsPanel(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-pink-600 transition cursor-pointer"
              title="Cỡ chữ, Font chữ, Dãn dòng"
            >
              <Sliders className="w-4 h-4" />
            </button>

            <div className="hidden lg:flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setShowDrawer(true)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Danh sách chương"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsPanel(true)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-pink-600 transition cursor-pointer"
                title="Cài đặt đọc (Cỡ chữ, Font chữ, Dãn dòng)"
              >
                <Sliders className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Lưu truyện"
              >
                <Bookmark className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Chia sẻ"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Báo cáo"
              >
                <Flag className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Thanh tiến trình đọc */}
      <div className="sticky top-[53px] inset-x-0 z-30 h-1 bg-pink-100/50 dark:bg-pink-950/40 pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 transition-all duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Drawer danh sách chương */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowDrawer(false)}
          />
          <div className="relative ml-auto w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-pink-100 dark:border-pink-950 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Mục Lục Chương</h3>
                <p className="text-xs text-pink-600 dark:text-pink-400 font-medium truncate max-w-xs">
                  {novel?.title || 'Đạo Tâm'}
                </p>
              </div>
              <button
                onClick={() => setShowDrawer(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {(displayedChapters?.length || 0) > 0 ? (
                <>
                  {(displayedChapters || []).map((ch) => {
                    const isCurrent = ch?.id === chapter?.id || ch?.number === chapter?.number;
                    return (
                      <button
                        key={ch?.id || ch?.number}
                        onClick={() => handleManualSelectChapterItem(ch?.slug || ch?.number || ch?.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                          isCurrent
                            ? 'bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 font-bold border border-pink-200 dark:border-pink-800'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="truncate">
                          Chương {ch?.number}: {ch?.title}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] uppercase font-bold text-pink-600 shrink-0 ml-2">
                            Đang đọc
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {(safeChaptersList?.length || 0) > visibleChapterCount && (
                    <button
                      type="button"
                      onClick={() => setVisibleChapterCount((prev) => prev + 25)}
                      className="w-full mt-2 py-2.5 rounded-xl bg-pink-50 dark:bg-pink-950/60 hover:bg-pink-100 dark:hover:bg-pink-900/60 text-pink-600 dark:text-pink-300 text-xs font-bold transition cursor-pointer border border-pink-200 dark:border-pink-900"
                    >
                      Tải thêm 25 chương (còn {(safeChaptersList?.length || 0) - visibleChapterCount} chương)
                    </button>
                  )}
                </>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">
                  Chương hiện tại: Chương {chapter?.number ?? 1}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel Tùy chỉnh đọc (LocalStorage Only) */}
      <ReaderSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        settings={readerSettings}
        onUpdateSettings={updateReaderSettings}
        onResetSettings={resetReaderSettings}
      />

      {/* Nội dung chương truyện */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-8">
          <span className="text-xs font-bold text-pink-600 dark:text-pink-400 uppercase tracking-widest block mb-2">
            {novel?.title}
          </span>
          <h1 className={`text-2xl sm:text-3xl font-black leading-snug mb-3 ${readerThemeClasses.title}`}>
            Chương {chapter?.number}: {chapter?.title}
          </h1>
          <div className="flex items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Tác giả: {novel?.author || 'Đang cập nhật'}</span>
            <span>•</span>
            <span>{cleanParagraphs?.length || 0} đoạn văn</span>
          </div>
        </div>

        <article
          style={{
            fontSize: `${readerSettings.fontSize}px`,
            fontFamily: fontFamilyCss,
            lineHeight: readerSettings.lineHeight,
          }}
          className="space-y-4 text-justify transition-all duration-200"
        >
          {(cleanParagraphs || []).map((para, idx) => (
            <React.Fragment key={idx}>
              <p
                onClick={() => {
                  if (isCurrentChapterPlaying) {
                    seekToParagraph(idx);
                  } else {
                    playChapter(novel, chapter, safeChaptersList, {
                      startIndex: idx,
                      autoStart: true,
                      userExplicit: true,
                    });
                  }
                }}
                style={{ lineHeight: readerSettings.lineHeight }}
                className={`chapter-paragraph indent-6 transition-all duration-200 cursor-pointer ${readerThemeClasses.paragraph} ${
                  speakingIndex === idx
                    ? 'bg-pink-100/90 dark:bg-pink-950/80 text-pink-950 dark:text-pink-200 rounded-lg p-2 font-medium shadow-xs'
                    : ''
                }`}
              >
                {para}
              </p>

              {idx % 3 === 1 && (
                <span
                  aria-hidden="true"
                  className="decoy-watermark select-none pointer-events-none"
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    userSelect: 'none',
                    left: '-9999px',
                    top: '-9999px',
                    height: 0,
                    width: 0,
                    overflow: 'hidden',
                  }}
                >
                  {DECOY_WATERMARKS?.[idx % (DECOY_WATERMARKS?.length || 1)]}
                </span>
              )}
            </React.Fragment>
          ))}
        </article>

        <div className="mt-12 pt-8 border-t border-pink-100 dark:border-pink-950/60 flex items-center justify-between gap-3">
          {onPrevChapter ? (
            <button
              type="button"
              onClick={handleManualPrev}
              className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-pink-600 shadow-xs cursor-pointer"
            >
              ← Chương trước
            </button>
          ) : (
            <div />
          )}

          {onNextChapter ? (
            <button
              type="button"
              onClick={handleManualNext}
              className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-md shadow-pink-500/25 cursor-pointer"
            >
              Chương sau →
            </button>
          ) : (
            <div />
          )}
        </div>

        {/* Bình luận độc giả: Luôn dùng Client-side fetching */}
        <NovelCommentsClient
          novelId={novel.id}
          novelTitle={novel.title}
          chapterId={chapter.id}
          chapterNumber={chapter.number}
        />
      </main>
    </div>
  );
}
