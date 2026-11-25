import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Novel, Chapter, ReaderSettings, ReadingProgress, UserProfile } from '../types';
import { 
  normalizeEdgeVoiceId,
  checkIsChapterUnlocked,
  formatXu,
  getNovelVoiceAvailability,
  resolveEffectiveVoiceForNovel
} from '../utils/rulesAndVoices';
import { useAudio } from '../contexts/AudioContext';
import { fetchFullChapterContent } from '../firebase/services';
import { safeSetItem, safeGetItem } from '../utils/safeStorage';
import { FONT_FAMILY_OPTIONS, resolveReaderFontCss } from '../hooks/useReaderSettings';
import { AudioChunk, chunkChapterContent } from '../utils/audioChunker';
import { CommentsSection } from './CommentsSection';
import { VoiceSelectorDropdown } from './VoiceSelectorDropdown';
import { checkIsAdmin } from '../firebase/config';
import { 
  recordChapterAccessAndCheckRateLimit, 
  subscribeUserBanStatus,
  BAN_MESSAGE,
  TEMP_LOCK_TOAST_MESSAGE
} from '../services/antiCrawlerRateLimiter';
import { 
  ArrowLeft, 
  BookOpen,
  ChevronLeft, 
  ChevronRight, 
  Sliders, 
  Headphones, 
  List, 
  Bookmark, 
  BookmarkCheck, 
  Play, 
  Pause, 
  Lock, 
  Coins, 
  ShieldAlert, 
  ShieldCheck,
  Smartphone,
  Sparkles, 
  X, 
  Volume2, 
  SkipBack, 
  SkipForward,
  Mic,
  Flag,
  FastForward,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Share2,
  Check
} from 'lucide-react';

/**
 * ==============================================================================
 * LỚP 4: BẪY CHỮ RÁC (DECOY DOM / WATERMARK)
 * ==============================================================================
 * Chèn xen kẽ vào giữa các đoạn văn <p> các thẻ <span> ẩn khỏi mắt độc giả nhưng
 * dính chặt vào DOM để khi tool cào ePub quét innerText sẽ copy cả chữ rác, làm
 * hỏng toàn bộ file sách cào trộm.
 */
const DECOY_WARNING_SENTENCES = [
  'Truyện được đăng độc quyền tại Đạo Tâm. Các web khác đều là ăn cắp.',
  'Bản quyền thuộc Đạo Tâm (daotam.vn) - Nghiêm cấm mọi hành vi sao chép, reup hay cào dữ liệu trái phép.',
  'Cảnh báo: Đoạn văn ẩn này được nhúng tự động để nhận diện website ăn cắp nội dung.',
  'Truyện đang đọc tại Đạo Tâm. Mọi trang web sao chép lại đều vi phạm đạo đức và pháp luật.',
  'Đọc bản chính thức tại Đạo Tâm để ủng hộ dịch giả và tác giả.'
];

interface ChapterReaderProps {
  novel: Novel;
  chapter: Chapter;
  readerSettings: ReaderSettings;
  setReaderSettings: React.Dispatch<React.SetStateAction<ReaderSettings>>;
  onSelectChapter: (novel: Novel, chapter: Chapter) => void;
  onBackToNovel: () => void;
  onSaveProgress: (progress: ReadingProgress) => void;
  user: UserProfile;
  onOpenVipPurchase: (novel: Novel, chapter: Chapter, mode?: 'all' | 'full_book_only' | 'chapter_only') => void;
  onDirectUnlockChapter?: (novel: Novel, chapter: Chapter, price: number) => Promise<boolean>;
  onOpenTopUp: () => void;
  onOpenAuthModal?: () => void;
  onOpenReport?: (novel: Novel) => void;
  onRecordRealView?: (novelId: string) => void;
}

export const ChapterReader: React.FC<ChapterReaderProps> = ({
  novel,
  chapter,
  readerSettings,
  setReaderSettings,
  onSelectChapter,
  onBackToNovel,
  onSaveProgress,
  user,
  onOpenVipPurchase,
  onDirectUnlockChapter,
  onOpenTopUp,
  onOpenAuthModal,
  onOpenReport,
  onRecordRealView,
}) => {
  if (!novel || !chapter) {
    return null;
  }

  const [scrollProgress, setScrollProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapterDrawer, setShowChapterDrawer] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [drmWarning, setDrmWarning] = useState<string | null>(null);
  const [unlockSuccessBanner, setUnlockSuccessBanner] = useState<string | null>(null);
  const [isUnlockingDirectly, setIsUnlockingDirectly] = useState(false);
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  // LỚP 1: KIỂM TRA QUYỀN ADMIN ('hoaamcac@gmail.com', 'meoyeutien22@gmail.com')
  const isAdmin = checkIsAdmin(user?.email);

  // LỚP 3: STATE THÔNG BÁO BANNER VÀNG (CHỈ KHI ADMIN KHÓA) VÀ TOAST TẠM THỜI (1 PHÚT)
  const [rateLimitBanNotice, setRateLimitBanNotice] = useState<string | null>(() =>
    user?.isBanned || user?.isLocked ? BAN_MESSAGE : null
  );
  const [rateLimitToast, setRateLimitToast] = useState<string | null>(null);

  // 1. ĐỒNG BỘ REAL-TIME TRẠNG THÁI KHÓA USER TRỰC TIẾP TỪ FIRESTORE
  useEffect(() => {
    const unsub = subscribeUserBanStatus(user?.id, (isBanned) => {
      setRateLimitBanNotice(isBanned ? BAN_MESSAGE : null);
    });
    return () => unsub();
  }, [user?.id]);

  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const shouldAutoPlayRef = useRef<boolean>(false);
  const [isAudioActive, setIsAudioActive] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('autoPlay') === 'true') {
          return true;
        }
      }
      return safeGetItem('daotam_audio_active') === 'true';
    } catch {
      return false;
    }
  });

  // Single Source of Truth: Quản lý Audio hoàn toàn tập trung qua AudioPlayerBar gốc
  const [isTransitioningChapter, setIsTransitioningChapter] = useState<boolean>(false);

  // LỚP 3: NỚI LỎNG RATE LIMIT (60 chương/phút) - CHỈ TOAST & CHỜ TẠM 1 PHÚT, KHÔNG KHÓA VĨNH VIỄN
  useEffect(() => {
    if (novel?.id && chapter?.id && !isAdmin) {
      recordChapterAccessAndCheckRateLimit(user?.id, user?.email, novel.id, chapter.id).then((res) => {
        if (res.isTempLocked) {
          setRateLimitToast(res.message || TEMP_LOCK_TOAST_MESSAGE);
          setTimeout(() => {
            setRateLimitToast(null);
          }, 5000);
        }
      });
    }
  }, [novel?.id, chapter?.id, user?.id, user?.email, isAdmin]);

  // Kiểm tra quyền mở khóa chương VIP (Quyền Admin, Mua trọn bộ, và Mở khóa lẻ)
  const isFullBookUnlocked = Boolean(user?.unlockedFullBooks?.includes(novel?.id));
  const isChapterUnlocked = checkIsChapterUnlocked(user, novel?.id, chapter);

  // Giá chương lẻ chuẩn (mặc định 5 Xu hoặc thiết lập trong chương)
  const chapterPrice = typeof chapter.priceXu === 'number' ? chapter.priceXu : 5;
  // Tổng số dư Xu khả dụng thực tế của người dùng
  const totalSpendableXu = (user?.xuBalance || 0) + (user?.authorEarnedXu || 0);

  // Lấy nội dung chương truyện thật sự, tôn trọng văn bản do người dùng tải lên
  const getCleanChapterContent = (rawText?: string) => {
    return (rawText || '').trim();
  };

  // Tải trọn vẹn văn bản chương truyện từ Firestore subcollection
  const hasInitialRealContent = Boolean(chapter?.content && (chapter.content.trim()?.length || 0) > 0);
  const [fullContent, setFullContent] = useState<string>(() =>
    hasInitialRealContent ? getCleanChapterContent(chapter.content) : ''
  );
  const [isLoadingFullContent, setIsLoadingFullContent] = useState<boolean>(!hasInitialRealContent);
  const [chapterAudioMetaTick, setChapterAudioMetaTick] = useState<number>(0);

  const lastFetchedChapterKeyRef = useRef<string>('');
  const lastSyncedAudioKeyRef = useRef<string>('');

  useEffect(() => {
    const fetchKey = `${novel?.id || ''}::${chapter?.id || ''}::${chapter?.number ?? ''}`;
    if (lastFetchedChapterKeyRef.current === fetchKey) {
      return;
    }
    lastFetchedChapterKeyRef.current = fetchKey;

    const initialIsReal = Boolean(chapter?.content && (chapter.content.trim()?.length || 0) > 0);
    if (initialIsReal) {
      setFullContent(getCleanChapterContent(chapter.content));
      setIsLoadingFullContent(false);
    } else {
      setFullContent('');
      setIsLoadingFullContent(true);
    }

    let isCancelled = false;
    if (novel?.id && (chapter?.id || chapter?.number !== undefined)) {
      fetchFullChapterContent(novel.id, chapter.id, chapter.number, novel.updatedAt)
        .then((res) => {
          if (!isCancelled && res) {
            let foundAudioMeta = false;
            if (res.audioUrl && !chapter.audioUrl) {
              chapter.audioUrl = res.audioUrl;
              foundAudioMeta = true;
            }
            if (res.audioUrlMale && !chapter.audioUrlMale) {
              chapter.audioUrlMale = res.audioUrlMale;
              foundAudioMeta = true;
            }
            if (res.audioUrlFemale && !chapter.audioUrlFemale) {
              chapter.audioUrlFemale = res.audioUrlFemale;
              foundAudioMeta = true;
            }
            if (foundAudioMeta) {
              setChapterAudioMetaTick((t) => t + 1);
            }
            const cleanFetched = getCleanChapterContent(res.content);
            if (cleanFetched) {
              setFullContent(cleanFetched);
              chapter.content = cleanFetched;
              if (res.wordCount) {
                chapter.wordCount = res.wordCount;
              } else {
                chapter.wordCount = cleanFetched.split(/\s+/).filter(Boolean)?.length || 0;
              }
            } else if (!initialIsReal) {
              setFullContent('');
            }
          }
        })
        .catch((err) => console.warn('Lỗi fetchFullChapterContent:', err))
        .finally(() => {
          if (!isCancelled) setIsLoadingFullContent(false);
        });
    } else {
      setIsLoadingFullContent(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [novel?.id, chapter?.id, chapter?.number]);

  // Nội dung đầy đủ và đoạn trích đọc thử của chương
  const chapterFullContent = useMemo(() => {
    if (fullContent && (fullContent.trim()?.length || 0) > 0) {
      return fullContent;
    }
    if (chapter?.content && (chapter.content.trim()?.length || 0) > 0) {
      return getCleanChapterContent(chapter.content);
    }
    return '';
  }, [fullContent, chapter?.content]);

  const displayWordCount = useMemo(() => {
    const text = chapterFullContent || fullContent || chapter?.content || '';
    const calculated = (text || '').split(/\s+/).filter(Boolean)?.length || 0;
    if (calculated > 50) return calculated;
    return chapter?.wordCount || 1732;
  }, [chapterFullContent, fullContent, chapter?.wordCount, chapter?.content]);

  const effectivePreviewLines = useMemo(() => {
    return ((chapterFullContent || '').split('\n') || []).map((l: string) => l.trim()).filter(Boolean).slice(0, 3);
  }, [chapterFullContent]);


  // Tự động mở khóa chương lẻ ngay khi người dùng đồng ý trả số xu tương ứng (không hiện pop-up rườm rà)
  const handleQuickUnlockChapter = async () => {
    if (!user || !user.isLoggedIn || user.id === 'guest') {
      if (onOpenAuthModal) onOpenAuthModal();
      else onOpenTopUp();
      return;
    }

    if (totalSpendableXu < chapterPrice) {
      onOpenTopUp();
      return;
    }

    setIsUnlockingDirectly(true);
    try {
      let success = false;
      if (onDirectUnlockChapter) {
        success = await onDirectUnlockChapter(novel, chapter, chapterPrice);
      } else {
        onOpenVipPurchase(novel, chapter, 'chapter_only');
        success = true;
      }

      if (success) {
        setUnlockSuccessBanner(`Bạn đã mở khóa chương thành công ( bị trừ ${formatXu(chapterPrice)} xu )`);
        setTimeout(() => {
          setUnlockSuccessBanner(null);
        }, 5000);
      }
    } catch (err) {
      console.error('Lỗi mở khóa:', err);
    } finally {
      setIsUnlockingDirectly(false);
    }
  };

  // Điều hướng chương trước / sau (Sắp xếp theo số chương để chuyển chương chính xác)
  const safeChapters = useMemo(() => {
    return [...(novel?.chapters || [])].sort((a, b) => Number(a.number) - Number(b.number));
  }, [novel?.chapters]);
  const currentIndex = (safeChapters || []).findIndex((c) => c.id === chapter?.id || (Number(c.number) > 0 && Number(c.number) === Number(chapter?.number)));
  const prevChapter = currentIndex > 0 ? safeChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < (safeChapters?.length || 0) - 1 ? safeChapters[currentIndex + 1] : null;

  const audioContext = useAudio();

  // Kiểm tra xem luồng Audio đang phát có phải của đúng truyện & chương hiện tại không
  const isCurrentChapterAudio = Boolean(
    audioContext.activeChapter &&
      audioContext.activeNovel?.id === novel.id &&
      (audioContext.activeChapter.id === chapter.id ||
        (Number(audioContext.activeChapter.number) > 0 &&
          Number(audioContext.activeChapter.number) === Number(chapter.number)))
  );

  const chunks = useMemo(() => {
    if (isCurrentChapterAudio && (audioContext?.chunks?.length || 0) > 0) {
      return audioContext.chunks || [];
    }
    if (isChapterUnlocked && chapterFullContent) {
      return chunkChapterContent(chapterFullContent) || [];
    }
    return [];
  }, [isCurrentChapterAudio, audioContext.chunks, isChapterUnlocked, chapterFullContent]);

  const audioContextRef = useRef(audioContext);
  useEffect(() => {
    audioContextRef.current = audioContext;
  }, [audioContext]);

  // Giải phóng tài nguyên & ngắt Giọng Máy nếu thanh điều khiển không hiển thị khi thoát trang đọc
  useEffect(() => {
    return () => {
      if (
        !audioContextRef.current.isBarVisible &&
        !audioContextRef.current.isDirectMp3
      ) {
        if (audioContextRef.current.isPlaying || audioContextRef.current.isLoading) {
          audioContextRef.current.pause();
        } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
          } catch {}
        }
      }
      if (
        !audioContextRef.current.isPlaying &&
        !audioContextRef.current.isLoading &&
        !audioContextRef.current.isBarVisible
      ) {
        audioContextRef.current.stop();
      }
    };
  }, []);

  const currentChunkIndex = isCurrentChapterAudio ? audioContext.currentChunkIndex : -1;
  const isTtsPlaying = isCurrentChapterAudio && audioContext.isPlaying;
  const isTtsLoading = isCurrentChapterAudio && audioContext.isLoading;
  const playbackRate = audioContext.playbackRate;

  const readerVoiceAvailability = useMemo(() => {
    void chapterAudioMetaTick;
    return getNovelVoiceAvailability(
      novel,
      safeChapters,
      audioContext.activeNovel?.id === novel.id ? audioContext.activeChapter || chapter : chapter
    );
  }, [
    novel,
    safeChapters,
    chapter,
    audioContext.activeNovel?.id,
    audioContext.activeChapter,
    chapterAudioMetaTick,
  ]);

  const effectiveReaderVoiceId = useMemo(() => {
    const baseVoice =
      audioContext.activeNovel?.id === novel.id
        ? audioContext.voiceId
        : readerSettings.selectedVoiceId;
    return resolveEffectiveVoiceForNovel(baseVoice, readerVoiceAvailability);
  }, [
    audioContext.activeNovel?.id,
    audioContext.voiceId,
    novel.id,
    readerSettings.selectedVoiceId,
    readerVoiceAvailability,
  ]);

  // Điều phối các hành động Audio qua AudioContext
  const playTts = useCallback(async (startIndex?: number) => {
    safeSetItem('daotam_audio_bar_visible', 'true');
    safeSetItem('daotam_audio_active', 'true');
    audioContext.setIsBarVisible(true);
    if (isCurrentChapterAudio && ((audioContext?.chunks?.length || 0) > 0 || audioContext.isDirectMp3)) {
      await audioContext.play(startIndex);
    } else {
      await audioContext.playChapter(novel, chapter, true, safeChapters, true, {
        startChunkIndex: startIndex,
      });
    }
  }, [isCurrentChapterAudio, audioContext, novel, chapter, safeChapters]);

  const pauseTts = useCallback(() => {
    audioContext.pause();
  }, [audioContext]);

  const toggleTtsPlay = useCallback(() => {
    safeSetItem('daotam_audio_bar_visible', 'true');
    audioContext.setIsBarVisible(true);
    if (isCurrentChapterAudio && ((audioContext?.chunks?.length || 0) > 0 || audioContext.isDirectMp3)) {
      audioContext.togglePlay();
    } else {
      audioContext.playChapter(novel, chapter, true, safeChapters, true);
    }
  }, [isCurrentChapterAudio, audioContext, novel, chapter, safeChapters]);

  const stopTts = useCallback(() => {
    audioContext.stop();
  }, [audioContext]);

  const seekToChunk = useCallback(async (index: number) => {
    if (isCurrentChapterAudio && (audioContext?.chunks?.length || 0) > 0) {
      await audioContext.seekToChunk(index);
    } else {
      await audioContext.playChapter(novel, chapter, true, safeChapters, true, {
        startChunkIndex: index,
      });
    }
  }, [isCurrentChapterAudio, audioContext, novel, chapter, safeChapters]);

  const skipNextTts = useCallback(async () => {
    await audioContext.skipNext();
  }, [audioContext]);

  const skipPrevTts = useCallback(async () => {
    await audioContext.skipPrev();
  }, [audioContext]);

  const setVoiceId = useCallback((v: string) => {
    audioContext.setVoiceId(v);
  }, [audioContext]);

  const setPlaybackRate = useCallback((r: number) => {
    audioContext.setPlaybackRate(r);
  }, [audioContext]);

  // Cuộn mượt mà đưa câu đang đọc vào giữa màn hình (Karaoke auto-scroll)
  useEffect(() => {
    if (isCurrentChapterAudio && currentChunkIndex >= 0 && sentenceRefs.current[currentChunkIndex]) {
      sentenceRefs.current[currentChunkIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [isCurrentChapterAudio, currentChunkIndex]);

  // Single Source of Truth: Chuyển chương từ thanh Audio hoặc màn hình khóa được đồng bộ 1 chiều qua sự kiện 'daotam:audio-chapter-changed' tại App.tsx,
  // tuyệt đối không gọi onSelectChapter ngược trong useEffect tại đây để tránh vòng lặp giật màn hình / nhảy ngược về chương cũ.

  const groupedParagraphs = useMemo(() => {
    if ((chunks?.length || 0) === 0) {
      return ((chapterFullContent || '').split(/\r?\n+/) || [])
        .map((p) => p.trim())
        .filter(Boolean)
        .map((text, idx) => ({
          paraIndex: idx,
          chunks: [] as AudioChunk[],
          rawText: text,
        }));
    }

    const map = new Map<number, AudioChunk[]>();
    for (const chunk of chunks || []) {
      const pIdx = chunk.paraIndex ?? 0;
      if (!map.has(pIdx)) map.set(pIdx, []);
      map.get(pIdx)!.push(chunk);
    }

    return (Array.from(map.entries()) || [])
      .sort(([a], [b]) => a - b)
      .map(([paraIndex, paraChunks]) => ({
        paraIndex,
        chunks: paraChunks || [],
        rawText: (paraChunks || []).map((c) => c.text).join(' '),
      }));
  }, [chunks, chapterFullContent]);

  // Đồng bộ khi audio đang phát
  useEffect(() => {
    if (isTtsPlaying) {
      setIsTransitioningChapter(false);
    }
  }, [isTtsPlaying]);

  // Đồng bộ Audio 1 chiều khi người dùng đổi chương trên trang đọc (dùng useRef chặn gọi lặp):
  // Chỉ kích hoạt khi chương trang đọc thực sự khác chương đang nạp trong AudioContext
  useEffect(() => {
    if (!novel?.id || !chapter?.id || !isChapterUnlocked) return;
    const syncKey = `${novel.id}::${chapter.id}::${chapter.number}::${isAudioActive}`;
    if (lastSyncedAudioKeyRef.current === syncKey) return;
    lastSyncedAudioKeyRef.current = syncKey;

    const ctx = audioContextRef.current;
    const isBarSavedVisible = safeGetItem('daotam_audio_bar_visible') === 'true';
    const isAudioSessionCurrentlyOpen =
      ctx.isPlaying || ctx.isLoading || (ctx.isBarVisible && (isAudioActive || ctx.isAudioMode));
    const shouldAutoSyncAudio = isAudioSessionCurrentlyOpen || (isBarSavedVisible && isAudioActive);

    const isDifferentChapter =
      !ctx.activeChapter ||
      ctx.activeNovel?.id !== novel.id ||
      (ctx.activeChapter.id !== chapter.id &&
        Number(ctx.activeChapter.number) !== Number(chapter.number));

    if (isDifferentChapter) {
      setIsTransitioningChapter(false);
      if (shouldAutoSyncAudio) {
        const shouldStartPlaying = ctx.isPlaying || ctx.isLoading || isAudioActive;
        ctx.playChapter(novel, chapter, shouldStartPlaying, safeChapters, true).catch((err: any) => {
          console.warn('[ChapterReader] Setup audio for chapter error:', err);
        });
      }
    }
  }, [novel?.id, chapter?.id, chapter?.number, isChapterUnlocked, isAudioActive]);

  // =========================================================================
  // TÍNH LƯỢT VIEW THẬT THEO TIÊU CHÍ GOOGLE (GA4 ENGAGED SESSION STANDARD)
  // 1. Tiêu chí thời gian (Dwell Time): Người đọc phải ở lại trang đọc ít nhất 10 giây.
  //    (Nếu thoát ra hoặc lướt qua dưới 10 giây thì Google KHÔNG tính là lượt đọc/engaged view).
  // 2. Tiêu chí tương tác thực tế (Active Visibility): Chỉ tính thời gian khi người đọc đang
  //    mở tab hiển thị (document.visibilityState === 'visible') hoặc đang nghe Audio TTS.
  // 3. Tiêu chí chống ảo / chống spam F5 (Anti-spam Deduplication): Mỗi phiên đọc của độc giả
  //    chỉ tính 1 lượt view duy nhất cho chương đó trong vòng 30 phút (Session Cooldown).
  // =========================================================================
  useEffect(() => {
    if (!novel?.id || !chapter?.id) return;
    const cooldownKey = `google_engaged_view_${novel.id}_${chapter.id}`;
    const previousEngagedTimestamp = sessionStorage.getItem(cooldownKey);

    // Nếu trong phiên này đã từng được tính view (trong 30 phút qua) thì không tính lặp
    if (previousEngagedTimestamp) {
      const elapsedMs = Date.now() - parseInt(previousEngagedTimestamp, 10);
      if (elapsedMs < 30 * 60 * 1000) {
        return;
      }
    }

    let activeSeconds = 0;
    let hasCounted = false;

    const interval = setInterval(() => {
      // Chỉ tính khi tab đang mở hoặc đang nghe audio TTS
      const isActiveTab = typeof document !== 'undefined' && document.visibilityState === 'visible';
      if (isActiveTab || isTtsPlaying) {
        activeSeconds += 1;
        if (activeSeconds >= 10 && !hasCounted) {
          hasCounted = true;
          clearInterval(interval);
          try {
            sessionStorage.setItem(cooldownKey, Date.now().toString());
          } catch (e) {}
          if (onRecordRealView) {
            onRecordRealView(novel.id);
          }
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [novel?.id, chapter?.id, isTtsPlaying, onRecordRealView]);

  // Background Audio & Lock Screen Media Session được quản lý tập trung tại AudioContext.tsx

  const handleChangeVoice = (newVoiceId: string) => {
    const normalized = normalizeEdgeVoiceId(newVoiceId);
    setReaderSettings((prev) => {
      const updated = { ...prev, selectedVoiceId: normalized };
      safeSetItem('daotam_reader_settings', JSON.stringify(updated));
      return updated;
    });
    setVoiceId(normalized);
    if (!isCurrentChapterAudio && isChapterUnlocked && (audioContext.isBarVisible || isAudioActive)) {
      setIsAudioActive(true);
      safeSetItem('daotam_audio_active', 'true');
      audioContext.playChapter(novel, chapter, true, safeChapters, true).catch(() => {});
    }
  };

  // ==============================================================================
  // LỚP 1: KHÓA GIAO DIỆN & THAO TÁC (FRONT-END)
  // Ưu tiên Admin ('hoaamcac@gmail.com', 'meoyeutien22@gmail.com'): Bỏ qua mọi rào cản
  // Người dùng thường: Chặn bôi đen, chuột phải, copy, cut, F12, Ctrl+C, Ctrl+A, Ctrl+U, Ctrl+S, Ctrl+Shift+I
  // ==============================================================================
  useEffect(() => {
    // Nếu là Quản trị viên (Admin): Cho phép bôi đen, copy, dùng phím tắt hoàn toàn bình thường
    if (isAdmin) {
      return () => {};
    }

    // Nếu KHÔNG PHẢI Admin: Kích hoạt toàn bộ lớp phòng thủ
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setDrmWarning('Chuột phải đã bị vô hiệu hóa để bảo vệ bản quyền.');
      setTimeout(() => setDrmWarning(null), 2500);
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.clipboardData) {
        const currentSource = typeof window !== 'undefined' ? window.location.origin : 'Đạo Tâm';
        e.clipboardData.setData(
          'text/plain',
          `[NỘI DUNG BẢN QUYỀN ĐẠO TÂM]\nTác phẩm: "${novel.title}" - ${chapter.title}\nTác giả: ${novel.author}\nNguồn chính thức: ${currentSource}\nCảnh báo: Tác phẩm được bảo hộ bản quyền. Mọi hành vi cào dữ liệu hoặc sao chép lậu đều bị xử lý.`
        );
      }
      setDrmWarning('Cảnh báo: Hành vi sao chép nội dung đã bị chặn!');
      setTimeout(() => setDrmWarning(null), 3000);
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      setDrmWarning('Cắt văn bản đã bị vô hiệu hóa.');
      setTimeout(() => setDrmWarning(null), 2500);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key ? e.key.toUpperCase() : '';

      // Chặn Ctrl + C, Ctrl + A, Ctrl + U, Ctrl + S, Ctrl + P
      if (isCtrlOrCmd && ['C', 'A', 'U', 'S', 'P'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        setDrmWarning(`Phím tắt ${isCtrlOrCmd ? 'Ctrl+' : ''}${key} đã bị vô hiệu hóa để bảo vệ tác phẩm!`);
        setTimeout(() => setDrmWarning(null), 2500);
        return false;
      }

      // Chặn F12
      if (e.key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        setDrmWarning('Công cụ kiểm tra phần tử (DevTools) đã bị vô hiệu hóa.');
        setTimeout(() => setDrmWarning(null), 2500);
        return false;
      }

      // Chặn Ctrl + Shift + I, Ctrl + Shift + J, Ctrl + Shift + C
      if (isCtrlOrCmd && e.shiftKey && ['I', 'J', 'C'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        setDrmWarning('Công cụ lập trình (DevTools) đã bị vô hiệu hóa.');
        setTimeout(() => setDrmWarning(null), 2500);
        return false;
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('cut', handleCut);
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('cut', handleCut);
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as any);
    };
  }, [isAdmin, novel.title, novel.author, chapter.title]);

  // Restore scroll position
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const existing = (user?.readingHistory || []).find(
      (h) => h.novelId === novel?.id && h.chapterNumber === chapter?.number
    );
    if (existing && existing.scrollPercentage > 5) {
      setTimeout(() => {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const targetScroll = (existing.scrollPercentage / 100) * docHeight;
        window.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }, 400);
    }
  }, [chapter.id]);

  // Track scroll percentage and auto-save (Throttled ~150ms to prevent lagging & CPU spikes)
  useEffect(() => {
    let saveTimeoutId: any = null;
    let lastThrottledTime = 0;
    let throttleTimeoutId: any = null;

    const processScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const scrolled = window.scrollY;
      const pct = Math.min(100, Math.max(0, Math.round((scrolled / docHeight) * 100)));
      setScrollProgress(pct);

      clearTimeout(saveTimeoutId);
      saveTimeoutId = setTimeout(() => {
        onSaveProgress({
          novelId: novel.id,
          novelTitle: novel.title,
          novelCover: novel.coverImage,
          chapterNumber: chapter.number,
          chapterTitle: chapter.title,
          chapterId: chapter.id,
          scrollPercentage: pct,
          lastSentenceIndex: currentChunkIndex,
          lastReadAt: Date.now(),
        });
      }, 1500);
    };

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastThrottledTime >= 150) {
        lastThrottledTime = now;
        processScroll();
      } else {
        clearTimeout(throttleTimeoutId);
        throttleTimeoutId = setTimeout(() => {
          lastThrottledTime = Date.now();
          processScroll();
        }, 150);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(saveTimeoutId);
      clearTimeout(throttleTimeoutId);
    };
  }, [novel, chapter, currentChunkIndex, onSaveProgress]);

  const handleManualSave = () => {
    onSaveProgress({
      novelId: novel.id,
      novelTitle: novel.title,
      novelCover: novel.coverImage,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      chapterId: chapter.id,
      scrollPercentage: scrollProgress,
      lastSentenceIndex: currentChunkIndex,
      lastReadAt: Date.now(),
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  const isDocDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const getThemeClasses = () => {
    if (isDocDark || readerSettings.theme === 'dark' || readerSettings.theme === 'midnight') {
      if (readerSettings.theme === 'midnight') {
        return 'bg-[#06070a] text-white';
      }
      return 'bg-slate-950 text-white';
    }
    if (readerSettings.theme === 'sepia') {
      return 'reader-theme-sepia bg-[#f8f5eb] text-[#2c2214]';
    }
    return 'bg-slate-50 text-slate-900';
  };

  return (
    <div
      className={`reader-container min-h-screen relative transition-colors duration-300 pt-12 ${
        audioContext.isBarVisible && !audioContext.isMinimized
          ? 'pb-64 sm:pb-48'
          : 'pb-36 sm:pb-40'
      } ${
        isAdmin ? 'select-text' : 'select-none'
      } ${getThemeClasses()}`}
      onContextMenu={
        !isAdmin
          ? (e) => {
              e.preventDefault();
              setDrmWarning('Chuột phải đã bị vô hiệu hóa.');
              setTimeout(() => setDrmWarning(null), 2500);
            }
          : undefined
      }
      onCopy={
        !isAdmin
          ? (e) => {
              e.preventDefault();
              setDrmWarning('Cảnh báo: Hành vi sao chép nội dung đã bị chặn!');
              setTimeout(() => setDrmWarning(null), 3000);
            }
          : undefined
      }
      onCut={
        !isAdmin
          ? (e) => {
              e.preventDefault();
            }
          : undefined
      }
    >
      {/* LỚP 3: BANNER THÔNG BÁO TÀI KHOẢN BỊ HẠN CHẾ DO ADMIN KHÓA */}
      {rateLimitBanNotice && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-2xl bg-yellow-400 dark:bg-yellow-500 border-2 border-yellow-600 text-slate-950 px-5 py-4 rounded-2xl shadow-2xl flex items-start sm:items-center gap-3.5 animate-in slide-in-from-top-4 duration-300">
          <AlertTriangle className="w-6 h-6 text-slate-950 flex-shrink-0 mt-0.5 sm:mt-0" />
          <div className="text-xs sm:text-sm font-bold leading-relaxed flex-1 text-slate-950">
            {rateLimitBanNotice}
          </div>
        </div>
      )}

      {/* TOAST NHẮC NHỞ TẠM THỜI KHI THAO TÁC QUÁ NHANH (1 PHÚT COOLDOWN - KHÔNG KHÓA VĨNH VIỄN) */}
      {rateLimitToast && !rateLimitBanNotice && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-amber-100 dark:bg-amber-900/95 border border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-100 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 animate-in slide-in-from-top-4 duration-200">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-300 flex-shrink-0" />
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

      {/* Thông báo mở khóa chương thành công: "Bạn đã mở khóa chương thành công ( bị trừ ... xu )" */}
      {unlockSuccessBanner && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white font-extrabold text-xs sm:text-sm px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-top-4 duration-300 border-2 border-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 flex-shrink-0 animate-bounce" />
          <span>{unlockSuccessBanner}</span>
        </div>
      )}

      {/* Scroll Progress Bar (Oceanic Blue) */}
      <div 
        className="fixed top-0 left-0 h-1 bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-400 z-50 transition-all duration-150"
        style={{ width: `${scrollProgress}%` }}
      />

      {/* Floating Reader Top Bar (Gọn nhẹ h-12 py-1 ôm sát nội dung trên Mobile) */}
      <div className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md bg-white/95 dark:bg-slate-900/95 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] dark:shadow-md dark:shadow-black/40 px-2 sm:px-4 py-1">
        <div className="max-w-4xl mx-auto h-10 sm:h-11 flex items-center justify-between gap-1 sm:gap-2 flex-nowrap">
          <button
            onClick={onBackToNovel}
            className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
            title="Quay lại mục lục"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mục lục</span>
          </button>

          {/* Chapter selector */}
          <div className="flex items-center gap-0.5 sm:gap-1.5 min-w-0">
            <button
              onClick={() => {
                if (prevChapter) {
                  if (readerSettings.autoNextChapter || isTtsPlaying || isAudioActive) {
                    setIsAudioActive(true);
                    setIsTransitioningChapter(true);
                    safeSetItem('daotam_audio_active', 'true');
                  }
                  onSelectChapter(novel, prevChapter);
                }
              }}
              disabled={!prevChapter}
              className={`p-1 sm:p-1.5 rounded-lg text-xs transition-colors flex-shrink-0 ${
                prevChapter
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-600 hover:text-white cursor-pointer'
                  : 'bg-slate-100/50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 cursor-not-allowed'
              }`}
              title="Chương trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowChapterDrawer(true)}
              className="flex items-center gap-1 px-2 sm:px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-blue-600 dark:text-cyan-400 font-semibold cursor-pointer max-w-[92px] sm:max-w-xs truncate"
              title="Mục lục chương nhanh"
            >
              <List className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 flex-shrink-0" />
              <span className="truncate">Chương {chapter.number}</span>
              {chapter.isVip && !isChapterUnlocked && (
                <Lock className="w-3 h-3 text-rose-500 flex-shrink-0 ml-0.5" />
              )}
            </button>

            <button
              onClick={() => {
                if (nextChapter) {
                  if (readerSettings.autoNextChapter || isTtsPlaying || isAudioActive) {
                    setIsAudioActive(true);
                    setIsTransitioningChapter(true);
                    safeSetItem('daotam_audio_active', 'true');
                  }
                  onSelectChapter(novel, nextChapter);
                }
              }}
              disabled={!nextChapter}
              className={`p-1 sm:p-1.5 rounded-lg text-xs transition-colors flex-shrink-0 ${
                nextChapter
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-600 hover:text-white cursor-pointer'
                  : 'bg-slate-100/50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 cursor-not-allowed'
              }`}
              title="Chương sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <VoiceSelectorDropdown
              selectedVoiceId={effectiveReaderVoiceId}
              onSelectVoice={handleChangeVoice}
              availableVoiceIds={readerVoiceAvailability.availableVoiceIds}
              direction="down"
              variant="readerHeader"
            />

            {/* Play/Pause Button */}
            <button
              onClick={() => {
                if (!isChapterUnlocked) {
                  onOpenVipPurchase(novel, chapter);
                  return;
                }
                if (isTtsPlaying) {
                  setIsAudioActive(false);
                  safeSetItem('daotam_audio_active', 'false');
                  pauseTts();
                } else {
                  setIsAudioActive(true);
                  safeSetItem('daotam_audio_active', 'true');
                  if (currentChunkIndex >= 0) {
                    playTts(currentChunkIndex).catch(() => {});
                  } else {
                    playTts(0).catch(() => {});
                  }
                }
              }}
              className={`p-1.5 sm:px-3 sm:py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer shadow-sm ${
                isTtsPlaying || isTransitioningChapter
                  ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white font-bold shadow-pink-500/25'
                  : 'bg-pink-600 hover:bg-pink-500 text-white font-semibold'
              }`}
              title={isTtsPlaying ? 'Tạm dừng nghe' : 'Bắt đầu nghe Audio'}
            >
              {isTransitioningChapter || isTtsLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isTtsPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span className="hidden md:inline font-medium">
                {isTransitioningChapter ? 'Đang chuyển...' : isTtsLoading ? 'Đang đệm...' : isTtsPlaying ? 'Đang đọc' : 'Phát Audio'}
              </span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                showSettings
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600'
              }`}
              title="Cài đặt đọc"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            {/* Manual Save */}
            <button
              onClick={handleManualSave}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 text-xs transition-colors cursor-pointer"
              title="Lưu tiến trình đọc"
            >
              <Bookmark className="w-3.5 h-3.5" />
            </button>

            {/* Share / Copy direct link */}
            <button
              onClick={() => {
                const origin = typeof window !== 'undefined' ? window.location.origin : '';
                const cleanNovelSlug = (novel.slug && novel.slug.trim()) ? novel.slug.trim() : (novel.id || '').trim();
                const cleanChapterSlug = (chapter.slug && chapter.slug.trim()) ? chapter.slug.trim() : `chuong-${chapter.number}`;
                const shareUrl = `${origin}/truyen/${cleanNovelSlug}/${cleanChapterSlug}`;

                if (navigator.share) {
                  navigator.share({
                    title: `${novel.title} - Chương ${chapter.number}`,
                    text: `Đọc "${novel.title}" - Chương ${chapter.number}: ${chapter.title}`,
                    url: shareUrl,
                  }).catch(() => {});
                } else if (navigator.clipboard) {
                  navigator.clipboard.writeText(shareUrl);
                  setDrmWarning('Đã sao chép liên kết chương truyện vào bộ nhớ tạm!');
                  setTimeout(() => setDrmWarning(null), 3000);
                }
              }}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 text-xs transition-colors cursor-pointer"
              title="Chia sẻ / Sao chép link chương truyện"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>

            {/* Report */}
            {onOpenReport && (
              <button
                onClick={() => onOpenReport(novel)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs transition-colors cursor-pointer"
                title="Báo cáo vi phạm"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Reader Settings Panel (Borderless & Flat) */}
        {showSettings && (
          <div className="max-w-4xl mx-auto mt-2.5 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-[0_4px_25px_-4px_rgba(0,0,0,0.08)] dark:shadow-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-700 dark:text-slate-300">
            {/* Speed Selector */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Tốc độ đọc Audio:</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      const updated = { ...readerSettings, voiceSpeed: speed };
                      setReaderSettings(updated);
                      safeSetItem('daotam_reader_settings', JSON.stringify(updated));
                      setPlaybackRate(speed);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all tabular-nums ${
                      playbackRate === speed
                        ? 'bg-pink-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <div className="flex justify-between items-center mb-1.5 text-slate-500 dark:text-slate-400">
                <span>Cỡ chữ:</span>
                <span className="text-blue-600 dark:text-cyan-400 font-semibold">{readerSettings.fontSize}px</span>
              </div>
              <input
                type="range"
                min="14"
                max="28"
                step="1"
                value={readerSettings.fontSize}
                onChange={(e) => {
                  const updated = { ...readerSettings, fontSize: Number(e.target.value) };
                  setReaderSettings(updated);
                  safeSetItem('daotam_reader_settings', JSON.stringify(updated));
                }}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Line Height (Dãn dòng - Local Only) */}
            <div>
              <div className="flex justify-between items-center mb-1.5 text-slate-500 dark:text-slate-400">
                <span>Dãn dòng:</span>
                <span className="text-blue-600 dark:text-cyan-400 font-semibold">{readerSettings.lineHeight || 1.85}</span>
              </div>
              <input
                type="range"
                min="1.4"
                max="2.4"
                step="0.05"
                value={readerSettings.lineHeight || 1.85}
                onChange={(e) => {
                  const updated = { ...readerSettings, lineHeight: Number(e.target.value) };
                  setReaderSettings(updated);
                  safeSetItem('daotam_reader_settings', JSON.stringify(updated));
                }}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Font Family (Font chữ - Local Only) */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Font chữ:</label>
              <select
                value={readerSettings.fontFamily || 'vietnam'}
                onChange={(e) => {
                  const updated = { ...readerSettings, fontFamily: e.target.value as ReaderSettings['fontFamily'] };
                  setReaderSettings(updated);
                  safeSetItem('daotam_reader_settings', JSON.stringify(updated));
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                {(FONT_FAMILY_OPTIONS || []).map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Background Theme */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Màu nền:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'light', label: 'Sáng', bg: 'bg-slate-100 text-slate-800' },
                  { id: 'sepia', label: 'Ấm', bg: 'bg-[#f8f5eb] text-[#2c2214]' },
                  { id: 'dark', label: 'Tối', bg: 'bg-slate-900 text-white' },
                ].map((th) => (
                  <button
                    key={th.id}
                    onClick={() => {
                      const updated = { ...readerSettings, theme: th.id as any };
                      setReaderSettings(updated);
                      safeSetItem('daotam_reader_settings', JSON.stringify(updated));
                    }}
                    className={`py-1.5 rounded-lg font-medium text-center transition-all cursor-pointer text-xs ${th.bg} ${
                      readerSettings.theme === th.id ? 'ring-2 ring-blue-600 font-bold' : ''
                    }`}
                  >
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Next Chapter Setting */}
            <div className="sm:col-span-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 block">Tự động chuyển chương (Audio)</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Tự động tải và phát chương kế tiếp khi nghe hết chương hiện tại</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setReaderSettings((prev) => {
                    const newAutoNext = !prev.autoNextChapter;
                    const updated = { ...prev, autoNextChapter: newAutoNext };
                    safeSetItem('daotam_reader_settings', JSON.stringify(updated));
                    // Khi chế độ Chuyển chương BẬT thì nút play cũng tự động bật và giữ nguyên giọng đọc trước đó
                    if (newAutoNext && !isTtsPlaying && isChapterUnlocked) {
                      setIsAudioActive(true);
                      safeSetItem('daotam_audio_active', 'true');
                      setTimeout(() => {
                        playTts(currentChunkIndex >= 0 ? currentChunkIndex : 0).catch(() => {});
                      }, 50);
                    }
                    return updated;
                  })
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  readerSettings.autoNextChapter
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>{readerSettings.autoNextChapter ? 'Đang BẬT' : 'Đang TẮT'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Xóa bỏ thanh audio trùng lặp: Toàn bộ điều khiển audio tập trung vào AudioPlayerBar duy nhất */}

      {/* Main Chapter Content Body (Sans-serif flat layout) */}
      <article className="max-w-3xl mx-auto px-4 sm:px-8 py-4 sm:py-8 relative select-none">
        <div className="text-center mb-2">
          <span className="text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">
            {novel.title}
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-center text-slate-900 dark:text-slate-100 leading-snug mb-2">
          {chapter.title}
        </h1>

        <div className="flex items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-5 sm:mb-8 pb-3 sm:pb-4 border-b border-slate-200 dark:border-slate-800/80 flex-wrap">
          <span>{displayWordCount} từ</span>
          <span>•</span>
          <span>Cập nhật: {chapter.publishedDate || 'Hôm nay'}</span>
          <span>•</span>
          <span className="text-blue-600 dark:text-blue-400">Tiến trình: {scrollProgress}%</span>
          {chapter.isVip && (
            <span className="bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-cyan-400 font-semibold px-2 py-0.5 rounded-full text-[10px]">
              VIP • {formatXu(typeof chapter.priceXu === 'number' ? chapter.priceXu : 5)} Xu
            </span>
          )}
        </div>

        {isCurrentChapterAudio && audioContext.fallbackNotice && (
          <div className="mb-5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 text-amber-800 dark:text-amber-200 text-xs font-medium flex items-center justify-center gap-2 text-center">
            <Smartphone className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{audioContext.fallbackNotice}</span>
          </div>
        )}

        {/* Text Body with Karaoke Mode Highlighting */}
        <div
          style={{
            fontSize: `${readerSettings.fontSize}px`,
            lineHeight: readerSettings.lineHeight || 1.85,
            fontFamily: resolveReaderFontCss(readerSettings.fontFamily),
          }}
          className="text-justify leading-relaxed space-y-4 select-none relative z-10"
        >
          {isChapterUnlocked ? (
            isLoadingFullContent && !chapterFullContent ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Đang tải trọn vẹn nội dung chương...
              </div>
            ) : (groupedParagraphs?.length || 0) > 0 ? (
              <div className="space-y-4 text-justify leading-relaxed">
                {(groupedParagraphs || []).map((para, idx) => (
                  <React.Fragment key={para.paraIndex}>
                    <p className="chapter-paragraph indent-6 text-justify leading-relaxed text-slate-800 dark:text-white">
                      {(para?.chunks?.length || 0) > 0 ? (
                        (para?.chunks || []).map((chunk) => {
                          const isCurrentSentence = currentChunkIndex === chunk.id;
                          return (
                            <span
                              key={chunk.id}
                              ref={(el) => {
                                sentenceRefs.current[chunk.id] = el;
                              }}
                              onClick={() => seekToChunk(chunk.id)}
                              className={`chapter-sentence inline rounded-md px-0.5 py-0.5 transition-all duration-150 cursor-pointer text-slate-800 dark:text-white ${
                                isCurrentSentence
                                  ? 'tts-karaoke-active font-semibold shadow-xs'
                                  : 'tts-karaoke-chunk hover:text-pink-600 dark:hover:text-pink-300'
                              }`}
                              title="Bấm để nghe từ đoạn này"
                            >
                              {(chunk.rawText || chunk.text).split('\n').map((segment, segIdx, arr) => (
                                <React.Fragment key={segIdx}>
                                  {segment}
                                  {segIdx < arr.length - 1 ? (
                                    <span className="block h-3" aria-hidden="true" />
                                  ) : (
                                    ' '
                                  )}
                                </React.Fragment>
                              ))}
                            </span>
                          );
                        })
                      ) : (
                        para.rawText
                      )}
                    </p>

                    {/* LỚP 4: BẪY CHỮ RÁC (DECOY WATERMARK) - ẨN HOÀN TOÀN KHỎI MẮT ĐỘC GIẢ, NHƯNG LÀM HỎNG TOOL CÀO INNERTEXT */}
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
                          pointerEvents: 'none',
                        }}
                      >
                        {DECOY_WARNING_SENTENCES[idx % (DECOY_WARNING_SENTENCES?.length || 1)]}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : ((chapterFullContent || '').trim()?.length || 0) > 0 ? (
              <div className="space-y-4 text-justify leading-relaxed">
                {((chapterFullContent || '').split(/\r?\n+/).filter(Boolean) || []).map((para: string, idx: number) => (
                  <React.Fragment key={idx}>
                    <p className="chapter-paragraph indent-6 text-justify leading-relaxed text-slate-800 dark:text-white">
                      {para}
                    </p>
                    {/* LỚP 4: BẪY CHỮ RÁC CHO BẢN VĂN BẢN TRUYỀN THỐNG */}
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
                          pointerEvents: 'none',
                        }}
                      >
                        {DECOY_WARNING_SENTENCES[idx % (DECOY_WARNING_SENTENCES?.length || 1)]}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 my-4">
                <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">Chương này chưa có nội dung văn bản</p>
                <p className="text-xs text-slate-500 mt-1">Nội dung đang được tác giả / người đăng cập nhật. Quý độc giả vui lòng quay lại sau.</p>
              </div>
            )
          ) : (
            <div className="w-full max-w-3xl mx-auto py-2">
              {/* Đoạn trích đọc thử mẫu với hiệu ứng mờ dần tự nhiên */}
              <div className="relative mb-8">
                <div className="space-y-4 text-slate-700 dark:text-slate-300">
                  {(effectivePreviewLines || []).map((line: string, idx: number) => (
                    <p key={idx} className="indent-6 leading-relaxed">
                      {line}
                    </p>
                  ))}
                </div>
                {/* Lớp chuyển tiếp mờ dần */}
                <div className="h-20 w-full bg-gradient-to-b from-transparent via-white/80 to-white dark:via-slate-900/80 dark:to-slate-900 -mt-12 relative pointer-events-none" />
              </div>

              {/* KHỐI TRÌNH BÀY CHƯƠNG VIP: Thoáng đãng, rõ ràng, không dính chùm, chuẩn Dark & Light mode */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-800/90 border-2 border-pink-200 dark:border-pink-900/50 shadow-xl text-center space-y-6 text-slate-900 dark:text-white">
                
                {/* Huy hiệu khóa VIP nổi bật */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-pink-500 via-rose-500 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-pink-500/25 mb-3 ring-4 ring-pink-100 dark:ring-pink-950/50">
                    <Lock className="w-8 h-8 text-white" />
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-pink-100 dark:bg-pink-950/70 text-pink-700 dark:text-pink-300 text-xs font-black uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" />
                    Chương VIP • Bản Quyền Đạo Tâm
                  </div>
                </div>

                {/* Tiêu đề chương & Lời giới thiệu */}
                <div className="space-y-2">
                  <h3 className="text-xl sm:text-2xl font-bold font-serif text-slate-900 dark:text-white" style={{ color: undefined }}>
                    Chương {chapter.number}: {chapter.title.replace(/^Chương\s*\d+[:.]*\s*/i, '')}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                    Nội dung chương này đã được bảo hộ bản quyền. Mở khóa để đọc toàn bộ tác phẩm và trải nghiệm giọng đọc Audio mượt mà.
                  </p>
                </div>

                {/* Hộp thông tin giá chương & số dư ví khả dụng rõ ràng */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-md mx-auto text-left">
                  <div className="p-4 rounded-2xl bg-pink-50/80 dark:bg-slate-700/60 border border-pink-200 dark:border-slate-600">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Giá mở khóa chương:</div>
                    <div className="text-lg font-black text-pink-600 dark:text-pink-400 flex items-center gap-1 mt-0.5">
                      <Coins className="w-5 h-5 text-pink-500" />
                      {formatXu(chapterPrice)} Xu
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Số dư ví khả dụng:</div>
                    <div className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1 mt-0.5">
                      <Coins className="w-5 h-5 text-amber-500" />
                      {formatXu(totalSpendableXu)} Xu
                    </div>
                  </div>
                </div>

                {/* Banner trạng thái số dư ví */}
                {totalSpendableXu >= chapterPrice ? (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 max-w-md mx-auto">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Số dư ví của bạn đủ để mở khóa chương này ngay lập tức.</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-2 max-w-md mx-auto">
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>Số dư ví chưa đủ (Cần thêm {formatXu(chapterPrice - totalSpendableXu)} Xu để mở khóa).</span>
                  </div>
                )}

                {/* Các nút hành động chính: Mở khóa ngay hoặc Chốt đơn trọn bộ */}
                <div className="flex flex-col sm:flex-row items-center gap-3 justify-center max-w-md mx-auto pt-1">
                  {totalSpendableXu >= chapterPrice ? (
                    <button
                      onClick={handleQuickUnlockChapter}
                      disabled={isUnlockingDirectly}
                      className="w-full sm:flex-1 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:from-pink-600 hover:to-rose-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-pink-500/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] cursor-pointer disabled:opacity-50"
                    >
                      <Coins className="w-4 h-4 text-pink-100" />
                      <span>
                        {isUnlockingDirectly ? 'Đang mở khóa...' : `Mở Khóa Chương Này (${formatXu(chapterPrice)} Xu)`}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={onOpenTopUp}
                      className="w-full sm:flex-1 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 hover:from-rose-500 hover:to-pink-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] cursor-pointer"
                    >
                      <Coins className="w-4 h-4 text-amber-200" />
                      <span>Nạp Thêm Xu Vào Ví Ngay</span>
                    </button>
                  )}

                  <button
                    onClick={() => onOpenVipPurchase(novel, chapter, 'full_book_only')}
                    className="w-full sm:w-auto py-3.5 px-5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-pink-50 dark:hover:bg-slate-700 border-2 border-pink-400 dark:border-pink-500 text-pink-600 dark:text-pink-400 font-extrabold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap shadow-xs hover:scale-[1.02]"
                  >
                    Chốt Đơn Trọn Bộ &rarr;
                  </button>
                </div>

                {/* Hướng dẫn nạp xu phụ */}
                <div className="pt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                  <span>Cần nạp thêm xu vào ví?</span>
                  <button
                    onClick={onOpenTopUp}
                    className="text-pink-600 dark:text-pink-400 hover:underline font-bold cursor-pointer"
                  >
                    Nạp Xu Ngay
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            {prevChapter ? (
              <button
                onClick={() => onSelectChapter(novel, prevChapter)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-600 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Chương trước
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all cursor-pointer shadow-sm"
            >
              Lên đầu trang
            </button>

            {nextChapter ? (
              <button
                onClick={() => onSelectChapter(novel, nextChapter)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-600 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                Chương sau
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <div />
            )}
          </div>
        </div>

        {/* Comments Section */}
        <CommentsSection novelId={novel.id} chapterId={chapter.id} chapterNumber={chapter.number} user={user} />
      </article>

      {/* Quick Chapter Drawer */}
      {showChapterDrawer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full p-6 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <List className="w-4 h-4 text-blue-600" />
                Mục lục chương
              </h3>
              <button
                onClick={() => setShowChapterDrawer(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-1.5 pr-2 chapter-list-scrollbar">
              {(novel?.chapters || []).map((c) => {
                const unlocked =
                  !c.isVip ||
                  isFullBookUnlocked ||
                  (user?.unlockedChapters?.[novel?.id] || []).includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelectChapter(novel, c);
                      setShowChapterDrawer(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      c.id === chapter.id
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate pr-2">{c.title}</span>
                    {c.isVip && !unlocked && (
                      <Lock className="w-3 h-3 text-rose-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
