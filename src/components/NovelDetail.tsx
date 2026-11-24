import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Novel, Chapter, ReadingProgress, UserProfile, DonationRecord } from '../types';
import { CommentsSection } from './CommentsSection';
import { fetchChaptersForNovel, fetchDonationsForNovel } from '../firebase/services';
import { filterOutDummyChapters, checkIsChapterUnlocked, formatXu } from '../utils/rulesAndVoices';
import { checkIsAdmin } from '../firebase/config';
import { safeSetItem } from '../utils/safeStorage';
import { useAudio } from '../contexts/AudioContext';
import { 
  BookOpen, 
  Heart, 
  ArrowLeft, 
  Search, 
  ArrowDownUp, 
  Eye, 
  EyeOff,
  Edit3,
  Trash2,
  AlertTriangle,
  Lock,
  Unlock,
  Coins,
  CheckCircle2,
  Sparkles,
  ShoppingBag,
  Flag,
  Flame,
  Share2,
  List,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Tag,
  Clock,
  Compass,
  Check,
  Send,
  UserCheck,
  Headphones
} from 'lucide-react';

interface NovelDetailProps {
  novel: Novel;
  allNovels?: Novel[];
  savedProgress?: ReadingProgress;
  isBookmarked: boolean;
  onToggleBookmark: (novelId: string) => void;
  onSelectChapter: (novel: Novel, chapter: Chapter, autoPlay?: boolean) => void;
  onBack: () => void;
  user: UserProfile;
  onOpenVipPurchase: (novel: Novel, chapter: Chapter, mode?: 'all' | 'full_book_only' | 'chapter_only') => void;
  onOpenDonateNovel?: (novel: Novel) => void;
  onToggleHideNovel?: (novelId: string) => void;
  onDeleteNovel?: (novelId: string) => void;
  onOpenEditNovel?: (novel: Novel) => void;
  onOpenBatchUpload?: (novel: Novel) => void;
  onOpenNominate?: (novel: Novel) => void;
  onOpenAuthorShowcase?: (name: string, role: 'author' | 'editor') => void;
  onOpenReport?: (novel: Novel) => void;
  onSelectNovel?: (novel: Novel) => void;
  onHomeClick?: () => void;
  onUpdateNovelChapters?: (novelId: string, chapters: Chapter[]) => void;
}

export const NovelDetail: React.FC<NovelDetailProps> = ({
  novel,
  allNovels = [],
  savedProgress,
  isBookmarked,
  onToggleBookmark,
  onSelectChapter,
  onBack,
  user,
  onOpenVipPurchase,
  onOpenDonateNovel,
  onToggleHideNovel,
  onDeleteNovel,
  onOpenEditNovel,
  onOpenBatchUpload,
  onOpenNominate,
  onOpenAuthorShowcase,
  onOpenReport,
  onSelectNovel,
  onHomeClick,
  onUpdateNovelChapters,
}) => {
  const audio = useAudio();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchChapter, setSearchChapter] = useState('');
  const [selectedRange, setSelectedRange] = useState<number>(0);
  const [isAscending, setIsAscending] = useState(true);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [shipFlowerCount, setShipFlowerCount] = useState<number>(100);
  const [isAnonymousShip, setIsAnonymousShip] = useState<boolean>(false);
  const [novelDonations, setNovelDonations] = useState<DonationRecord[]>([]);

  // Tải danh sách giao dịch donate thực tế cho truyện từ Firestore (Xác nhận thực tế qua lại)
  useEffect(() => {
    if (novel?.id) {
      fetchDonationsForNovel(novel.id).then((list) => {
        setNovelDonations(list);
      }).catch((err) => console.warn('Lỗi tải donations cho truyện:', err));
    }
  }, [novel?.id]);

  // Danh sách chương hoạt động - Đồng bộ hóa ngay từ Firestore nếu danh sách rỗng (Đã lọc sạch chương mẫu)
  const [activeChapters, setActiveChapters] = useState<Chapter[]>(() => {
    const raw = Array.isArray(novel?.chapters) && (novel.chapters?.length || 0) > 0 ? novel.chapters : [];
    return filterOutDummyChapters(raw);
  });
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  const chapterSectionRef = useRef<HTMLDivElement>(null);
  const rangeScrollRef = useRef<HTMLDivElement>(null);

  // Tải danh sách chương khi mở truyện: nếu chưa có chapters trong novel prop thì mới fetch từ Firestore
  useEffect(() => {
    let isCancelled = false;
    const initialChaps = filterOutDummyChapters(
      Array.isArray(novel?.chapters) && (novel.chapters?.length || 0) > 0 ? novel.chapters : []
    );
    setActiveChapters(initialChaps);

    // CHỈ fetch từ Firestore khi tác phẩm chưa có mảng chương nào trong state
    if ((initialChaps?.length || 0) === 0 && novel?.id) {
      setIsLoadingChapters(true);

      fetchChaptersForNovel(novel.id)
        .then((fetched) => {
          if (!isCancelled && Array.isArray(fetched) && (fetched?.length || 0) > 0) {
            const cleaned = filterOutDummyChapters(fetched);
            const allChaps = cleaned.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

            setActiveChapters(allChaps);
            if (onUpdateNovelChapters) {
              onUpdateNovelChapters(novel.id, allChaps);
            }
          }
        })
        .catch((err) => {
          console.warn('Lỗi khi tải chương từ Firestore:', err);
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoadingChapters(false);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [novel?.id]);

  const CHUNK_SIZE = 50;
  const safeChapters = Array.isArray(activeChapters) ? activeChapters : [];
  const totalChunks = Math.ceil((safeChapters?.length || 0) / CHUNK_SIZE) || 1;
  const isFullBookUnlocked = Boolean((user?.unlockedFullBooks || []).includes(novel?.id));
  const unlockedChapterIds = Array.isArray(user?.unlockedChapters?.[novel?.id])
    ? user.unlockedChapters[novel.id]
    : [];

  const isOwnerOrAdmin = user?.role === 'admin' || checkIsAdmin(user?.email) || (user?.id && (novel as any).authorId === user.id) || (user?.displayName && novel.author === user.displayName);
  const isAdmin = checkIsAdmin(user?.email);

  // LỚP 1: KHÓA PHÍM TẮT & THAO TÁC COPY DÀNH CHO NGƯỜI DÙNG THƯỜNG TRÊN TRANG CHI TIẾT
  useEffect(() => {
    if (isAdmin) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key ? e.key.toUpperCase() : '';

      if (isCtrlOrCmd && ['C', 'A', 'U', 'S', 'P'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      if (e.key === 'F12' || (isCtrlOrCmd && e.shiftKey && ['I', 'J', 'C'].includes(key))) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as any);
    };
  }, [isAdmin]);

  // Filtered and sorted chapters (Độc giả chỉ thấy chương đang mở, Tác giả & Admin thấy cả chương đã ẩn)
  const filteredChapters = useMemo(() => {
    let list = isOwnerOrAdmin ? [...activeChapters] : activeChapters.filter((c) => !c.isHidden);

    if (searchChapter.trim()) {
      const q = searchChapter.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.number.toString().includes(q)
      );
    } else {
      const start = selectedRange * CHUNK_SIZE;
      const end = start + CHUNK_SIZE;
      list = list.slice(start, end);
    }

    if (!isAscending) {
      list.reverse();
    }

    return list;
  }, [activeChapters, searchChapter, selectedRange, isAscending, isOwnerOrAdmin]);

  // Format helpers
  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('en-US');
  };

  // Author & Uploader
  const authorName = novel.author || 'Đang cập nhật';
  const uploaderName = novel.editor || novel.submittedBy?.userName || novel.translator || 'Đạo Tâm Team';

  // Latest chapter
  const latestChapter = (safeChapters?.length || 0) > 0 
    ? safeChapters[(safeChapters?.length || 0) - 1] 
    : null;
  const latestChapterTitle = latestChapter ? (latestChapter.title || '').replace(/^Chương\s*\d+[:.]*\s*/i, '') : `Chương ${novel?.totalChapters || safeChapters?.length || 1}`;

  // Status mapping: Full (xanh lá), Đang ra (vàng), hoặc Drop (đỏ)
  const getStatusDisplay = () => {
    const s = (novel.status || '').toLowerCase();
    if (s.includes('hoàn') || s.includes('full')) {
      return {
        label: 'Full',
        colorClass: 'text-emerald-600 dark:text-emerald-400 font-bold',
        dotClass: 'bg-emerald-500',
      };
    }
    if (s.includes('drop') || s.includes('tạm dừng')) {
      return {
        label: 'Drop',
        colorClass: 'text-rose-600 dark:text-rose-400 font-bold',
        dotClass: 'bg-rose-500',
      };
    }
    return {
      label: 'Đang ra',
      colorClass: 'text-amber-500 dark:text-amber-400 font-bold',
      dotClass: 'bg-amber-400',
    };
  };

  const statusInfo = getStatusDisplay();

  const novelCategories = Array.isArray(novel?.categories)
    ? novel.categories
    : Array.isArray((novel as any)?.genres)
    ? (novel as any).genres
    : [];

  // Related novels (same category or author)
  const relatedNovels = useMemo(() => {
    return (allNovels || [])
      .filter((n) => {
        if (!n || n.id === novel?.id) return false;
        const itemCats = Array.isArray(n.categories)
          ? n.categories
          : Array.isArray((n as any).genres)
          ? (n as any).genres
          : [];
        return (
          itemCats.some((c: string) => novelCategories.includes(c)) ||
          n.author === novel?.author ||
          n.mainCategory === novel?.mainCategory
        );
      })
      .slice(0, 5);
  }, [allNovels, novel, novelCategories]);

  // Main category display name
  const getCategoryLabel = () => {
    switch (novel?.mainCategory) {
      case 'dam-my': return 'Đam Mỹ';
      case 'truyen-nam': return 'Truyện Nam';
      case 'truyen-nu': return 'Truyện Nữ';
      case 'truyen-sang-tac': return 'Truyện Sáng Tác';
      default: return novelCategories?.[0] || 'Ngôn Tình';
    }
  };

  const handleShare = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const cleanSlug = (novel.slug && novel.slug.trim()) ? novel.slug.trim() : (novel.id || '').trim();
    const shareUrl = `${origin}/truyen/${cleanSlug}`;

    if (navigator.share) {
      navigator.share({
        title: novel.title,
        text: `Đọc truyện "${novel.title}" tại Đạo Tâm`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  const scrollToChapters = () => {
    chapterSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // First & Next chapter to read
  const firstChapter = (safeChapters?.length || 0) > 0 ? safeChapters[0] : null;
  const nextChapter = savedProgress
    ? safeChapters.find((c) => c.number === savedProgress.chapterNumber) || firstChapter
    : (safeChapters[1] || firstChapter);

  // Target Audio chapter: Nếu có lịch sử đọc dở thì trỏ đến chương đó, nếu chưa có thì trỏ đến chương 1
  const targetAudioChapter = savedProgress
    ? safeChapters.find((c) => c.number === savedProgress.chapterNumber) || firstChapter
    : firstChapter;

  // Tính % giảm giá trọn bộ nếu truyện Full và có thiết lập giá khuyến mãi nhỏ hơn giá niêm yết
  const isFull = novel.status === 'Hoàn thành' || novel.status === 'Full';
  const discountPercent = (
    isFull &&
    novel.fullBookPriceXu &&
    novel.fullBookDiscountPriceXu &&
    novel.fullBookDiscountPriceXu > 0 &&
    novel.fullBookDiscountPriceXu < novel.fullBookPriceXu
  ) ? Math.round(((novel.fullBookPriceXu - novel.fullBookDiscountPriceXu) / novel.fullBookPriceXu) * 100) : 0;

  return (
    <div 
      className={`max-w-6xl mx-auto px-4 py-6 text-slate-800 dark:text-slate-100 transition-colors ${
        isAdmin ? 'select-text' : 'select-none'
      }`}
      onContextMenu={!isAdmin ? (e) => e.preventDefault() : undefined}
      onCopy={!isAdmin ? (e) => e.preventDefault() : undefined}
      onCut={!isAdmin ? (e) => e.preventDefault() : undefined}
    >
      {/* 1. Breadcrumbs Top Navigation (Chuẩn theo hình 2) */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-5 overflow-x-auto whitespace-nowrap">
        <button
          onClick={onHomeClick || onBack}
          className="hover:text-pink-600 dark:hover:text-pink-400 font-medium cursor-pointer"
        >
          Trang chủ
        </button>
        <span>&rsaquo;</span>
        <button
          onClick={onBack}
          className="hover:text-pink-600 dark:hover:text-pink-400 font-medium cursor-pointer"
        >
          {getCategoryLabel()}
        </button>
        <span>&rsaquo;</span>
        <span className="text-pink-600 dark:text-pink-400 font-semibold truncate max-w-xs sm:max-w-md">
          {novel.title}
        </span>
      </nav>

      {/* Admin Quick Toolbar */}
      {(user?.role === 'admin' || checkIsAdmin(user?.email)) && (
        <div className="mb-6 p-4 rounded-2xl bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-purple-700 dark:text-purple-300">Quản Trị Viên:</span>
            {novel.isHidden ? (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-700 flex items-center gap-1">
                <EyeOff className="w-3.5 h-3.5" /> Truyện Đang Ẩn Khỏi Độc Giả
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> Đang Hiển Thị Công Khai
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOpenBatchUpload && (
              <button
                onClick={() => onOpenBatchUpload(novel)}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <BookOpen className="w-3.5 h-3.5" /> Đăng Nhiều Chương
              </button>
            )}

            {onOpenEditNovel && (
              <button
                onClick={() => onOpenEditNovel(novel)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5" /> Chỉnh Sửa Truyện
              </button>
            )}

            {onToggleHideNovel && (
              <button
                onClick={() => onToggleHideNovel(novel.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer ${
                  novel.isHidden
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                }`}
              >
                {novel.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {novel.isHidden ? 'Bỏ Ẩn' : 'Ẩn Truyện'}
              </button>
            )}

            {onDeleteNovel && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/70 hover:bg-rose-600 text-rose-700 hover:text-white dark:text-rose-300 font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. Novel Hero Container (Nền trắng ở Light mode, Nền tối sang trọng chữ trắng ở Dark mode) */}
      <div id="novel-detail-hero" className="bg-white dark:bg-slate-900 border border-pink-100 dark:border-pink-950/60 rounded-3xl p-5 sm:p-7 shadow-[0_4px_24px_-4px_rgba(244,114,182,0.12)] mb-8 transition-colors text-slate-900 dark:text-white">
        <div className="flex flex-col md:flex-row gap-6 sm:gap-8 items-start">
          
          {/* Cover Image with Ribbon & Heart Bookmark */}
          <div className="w-44 sm:w-56 mx-auto md:mx-0 flex-shrink-0">
            <div className="relative aspect-[2/3] rounded-2xl overflow-hidden shadow-xl border border-pink-100 bg-slate-900 group">
              <img
                src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'}
                alt={novel.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {/* Status Ribbon on Cover: Full (xanh lá), Đang ra (vàng), Drop (đỏ) - Bỏ icon HOT */}
              {(statusInfo.label === 'Full' || novel.status === 'Hoàn thành') && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
                  <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">
                    Full
                  </span>
                  {discountPercent > 0 && (
                    <span className="bg-gradient-to-r from-rose-600 via-pink-600 to-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-lg flex items-center gap-1 animate-pulse border border-white/30">
                      <span>🔥</span> GIẢM -{discountPercent}%
                    </span>
                  )}
                </div>
              )}
              {statusInfo.label === 'Đang ra' && (
                <div className="absolute top-2 left-2 bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded shadow">
                  Đang ra
                </div>
              )}
              {statusInfo.label === 'Drop' && (
                <div className="absolute top-2 left-2 bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">
                  Drop
                </div>
              )}

              {/* Heart Bookmark button at top-right of cover */}
              <button
                onClick={() => onToggleBookmark(novel.id)}
                className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-transform hover:scale-110 cursor-pointer shadow-md ${
                  isBookmarked
                    ? 'bg-pink-600 text-white'
                    : 'bg-white/90 text-rose-500 hover:text-pink-600'
                }`}
                title={isBookmarked ? 'Đã lưu theo dõi' : 'Thêm vào truyện theo dõi'}
              >
                <Heart className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>

          {/* Right Hero Information */}
          <div className="flex-1 min-w-0 w-full flex flex-col justify-between">
            <div>
              {/* Title */}
              <h1 
                className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 dark:text-white leading-snug mb-2.5 font-serif novel-detail-title"
              >
                {novel.title}
              </h1>

              {/* Xu hướng Tag */}
              {novel.isHot && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800">
                    <Sparkles className="w-3 h-3" />
                    <span># Xu hướng #{Math.floor((novel.views % 200) + 1)}</span>
                  </span>
                </div>
              )}

              {/* Meta details requested by user */}
              <div className="space-y-2.5 mb-4 text-xs sm:text-sm">
                {/* 1. Tên tác giả */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 dark:text-slate-300 font-bold min-w-[75px]">Tác giả:</span>
                  <button
                    onClick={() => onOpenAuthorShowcase && onOpenAuthorShowcase(authorName, 'author')}
                    className="font-bold text-pink-600 dark:text-pink-400 hover:underline cursor-pointer flex items-center gap-1 text-sm"
                  >
                    <span>{authorName}</span>
                  </button>
                </div>

                {/* 2. Tên nhà đăng */}
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 dark:text-slate-300 font-bold min-w-[75px]">Nhà đăng:</span>
                  <button
                    onClick={() => onOpenAuthorShowcase && onOpenAuthorShowcase(uploaderName, 'editor')}
                    className="font-bold text-rose-600 dark:text-pink-400 hover:underline cursor-pointer flex items-center gap-1 text-sm"
                  >
                    <span>{uploaderName}</span>
                  </button>
                </div>

                {/* 3. Thể loại */}
                <div className="flex items-start gap-2 pt-1 flex-wrap">
                  <span className="text-slate-700 dark:text-slate-300 font-bold min-w-[75px] pt-1">Thể loại:</span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {(novelCategories || []).map((cat: string) => (
                      <span
                        key={cat}
                        className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-pink-100 dark:bg-pink-950/70 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 hover:bg-pink-200 transition-colors cursor-default"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 4. Giới thiệu truyện - Ngay dưới phần Thể loại */}
                <div className="pt-3 pb-1 border-t border-slate-200 dark:border-slate-800 mt-2">
                  <div className="text-xs font-black text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
                    <span>Giới thiệu truyện:</span>
                  </div>
                  <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                    <p className={`whitespace-pre-line ${!isDescExpanded ? 'line-clamp-4' : ''}`}>
                      {novel?.description || ''}
                    </p>
                    {(novel?.description?.length || 0) > 200 && (
                      <button
                        onClick={() => setIsDescExpanded(!isDescExpanded)}
                        className="mt-1.5 text-xs font-bold text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isDescExpanded ? 'Thu gọn' : 'Xem thêm'}</span>
                        {isDescExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3 Stats Cards Row */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 py-3 px-3 sm:px-4 bg-pink-50/70 dark:bg-slate-800/90 rounded-2xl border border-pink-200/80 dark:border-slate-700 mb-4 transition-colors">
                {/* Lượt đọc */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-pink-100 dark:bg-pink-950/70 flex items-center justify-center text-pink-600 dark:text-pink-300 flex-shrink-0">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                      {formatNumber(novel.views)}
                    </div>
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-200">
                      Lượt đọc
                    </div>
                  </div>
                </div>

                {/* Lượt theo dõi */}
                <div className="flex items-center gap-2 sm:gap-3 border-l border-pink-200 dark:border-slate-700 pl-2.5 sm:pl-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-rose-100 dark:bg-rose-950/70 flex items-center justify-center text-rose-600 dark:text-rose-300 flex-shrink-0">
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                      {formatNumber((novel as any).bookmarksCount ?? (novel as any).followersCount ?? (isBookmarked ? 1 : 0))}
                    </div>
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-200">
                      Lượt theo dõi
                    </div>
                  </div>
                </div>

                {/* Hoa ("thay kẹo thành hoa như của mình") */}
                <div 
                  onClick={() => onOpenNominate && onOpenNominate(novel)}
                  className="flex items-center justify-between border-l border-pink-200 dark:border-slate-700 pl-2.5 sm:pl-3 cursor-pointer group"
                  title="Nhấn để tặng hoa đề cử cho truyện"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-pink-100 dark:bg-pink-950/70 flex items-center justify-center text-pink-600 dark:text-pink-300 flex-shrink-0 group-hover:scale-110 transition-transform">
                      <span className="text-sm">🌸</span>
                    </div>
                    <div>
                      <div className="font-black text-sm sm:text-base text-pink-600 dark:text-pink-400 leading-tight">
                        {formatNumber(novel.flowerCount || 0)}
                      </div>
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-200 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                        Hoa &rsaquo;
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2x2 Info Grid */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/90 rounded-2xl border border-slate-300/80 dark:border-slate-700 mb-5 text-xs transition-colors">
                {/* Tình trạng */}
                <div>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-200 mb-0.5">Tình trạng</div>
                  <div className={`font-black flex items-center gap-1.5 ${statusInfo.colorClass}`}>
                    <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`}></span>
                    {statusInfo.label}
                  </div>
                </div>

                {/* Cập nhật */}
                <div>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-200 mb-0.5">Cập nhật</div>
                  <div className="font-extrabold text-slate-900 dark:text-white">
                    {novel.lastUpdated || '13/10/2026'}
                  </div>
                </div>

                {/* Chương mới nhất */}
                <div>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-200 mb-0.5">Chương mới nhất</div>
                  <div 
                    onClick={scrollToChapters}
                    className="font-extrabold text-slate-900 dark:text-white truncate cursor-pointer hover:text-pink-600 dark:hover:text-pink-400"
                    title={latestChapterTitle}
                  >
                    {latestChapter ? `Chương ${latestChapter.number}` : `Chương ${novel.totalChapters}`}
                  </div>
                </div>

                {/* Số chương */}
                <div>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-200 mb-0.5">Số chương</div>
                  <div className="font-extrabold text-slate-900 dark:text-white">
                    {safeChapters?.length || 0} chương
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1. NÚT 'NGHE AUDIO' THÔNG MINH:
                    Nền vàng nổi bật (bg-gradient-to-r from-yellow-400 to-amber-500), chữ xám đen (text-slate-900),
                    font đậm, icon Headphones.
                    Nếu có lịch sử đọc dở: trỏ đến chương đang đọc. Chưa có: trỏ đến chương 1.
                    Kèm cờ ?autoPlay=true để kích hoạt phát âm thanh ngay lập tức.
                */}
                {targetAudioChapter && (
                  <button
                    onClick={() => {
                      safeSetItem('daotam_audio_bar_visible', 'true');
                      safeSetItem('daotam_audio_active', 'true');
                      audio.setIsBarVisible(true);
                      audio.setIsMinimized(false);
                      audio.playChapter({ ...novel, chapters: activeChapters }, targetAudioChapter, true, activeChapters, true);
                    }}
                    className={`px-5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all hover:scale-102 cursor-pointer border border-white/40 ${
                      audio.isPlaying && (audio.activeChapter?.id === targetAudioChapter.id || Number(audio.activeChapter?.number) === Number(targetAudioChapter.number))
                        ? 'bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 text-white shadow-pink-500/30 ring-2 ring-pink-400'
                        : 'bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-900 shadow-amber-500/25'
                    }`}
                    title={`Nghe Audio Chương ${targetAudioChapter.number} (Giọng Microsoft Edge TTS Hoài My & Nam Minh)`}
                  >
                    <Headphones className="w-4 h-4 shrink-0" />
                    <span>
                      {audio.isPlaying && (audio.activeChapter?.id === targetAudioChapter.id || Number(audio.activeChapter?.number) === Number(targetAudioChapter.number))
                        ? `Đang phát Audio C${targetAudioChapter.number}`
                        : `Nghe Audio ${savedProgress ? `C${targetAudioChapter.number}` : 'C1'}`}
                    </span>
                  </button>
                )}

                {/* Đọc chương đầu */}
                {firstChapter ? (
                  <button
                    onClick={() => onSelectChapter({ ...novel, chapters: activeChapters }, firstChapter)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-pink-500/20 transition-all hover:scale-102 cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Đọc chương đầu</span>
                  </button>
                ) : (
                  <button
                    disabled
                    className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-300 font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-not-allowed"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>{isLoadingChapters ? 'Đang tải...' : 'Chưa có chương'}</span>
                  </button>
                )}

                {/* Đọc chương tiếp theo */}
                {nextChapter && (
                  <button
                    onClick={() => onSelectChapter({ ...novel, chapters: activeChapters }, nextChapter)}
                    className="px-4 py-2.5 rounded-xl border-2 border-pink-500 hover:border-pink-600 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-slate-800 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>⏩ Đọc {savedProgress ? `tiếp C${savedProgress.chapterNumber}` : 'tiếp theo'}</span>
                  </button>
                )}

                {/* Theo dõi */}
                <button
                  onClick={() => onToggleBookmark(novel.id)}
                  className={`px-3.5 py-2.5 rounded-xl border-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isBookmarked
                      ? 'bg-pink-600 border-pink-600 text-white shadow-sm'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white hover:border-pink-500 hover:text-pink-600 dark:hover:text-pink-400'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                  <span>{isBookmarked ? 'Đang theo dõi' : 'Theo dõi'}</span>
                </button>

                {/* Danh mục */}
                <button
                  onClick={scrollToChapters}
                  className="px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white hover:border-pink-500 hover:text-pink-600 dark:hover:text-pink-400 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <List className="w-4 h-4" />
                  <span>Danh mục</span>
                </button>

                {/* Đề cử hoa - Thêm biểu tượng hình hoa trước nút chia sẻ */}
                <button
                  onClick={() => onOpenNominate && onOpenNominate(novel)}
                  className="px-4 py-2.5 rounded-xl border-2 border-pink-500 bg-pink-50 dark:bg-slate-800 hover:bg-pink-100 dark:hover:bg-slate-700 text-pink-700 dark:text-pink-300 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:scale-102"
                  title="Tặng hoa đề cử tác phẩm"
                >
                  <span className="text-base">🌸</span>
                  <span>Đề cử</span>
                </button>

                {/* Tặng Xu / Ủng Hộ Người Đăng Truyện */}
                {onOpenDonateNovel && (
                  <button
                    onClick={() => onOpenDonateNovel(novel)}
                    className="px-4 py-2.5 rounded-xl border-2 border-rose-500 bg-rose-50 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-slate-700 text-rose-700 dark:text-pink-300 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:scale-102"
                    title="Gửi tặng Xu ủng hộ người đăng truyện"
                  >
                    <span className="text-base">🎁</span>
                    <span>Tặng Xu</span>
                  </button>
                )}

                {/* Chia sẻ */}
                <button
                  onClick={handleShare}
                  className="px-3.5 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white hover:border-pink-500 hover:text-pink-600 dark:hover:text-pink-400 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Chia sẻ truyện hoặc sao chép liên kết"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{copiedShare ? 'Đã sao chép' : 'Chia sẻ'}</span>
                </button>

                {/* Báo cáo vi phạm */}
                {onOpenReport && (
                  <button
                    onClick={() => onOpenReport(novel)}
                    className="p-2.5 rounded-xl border-2 border-rose-300 text-rose-600 hover:bg-rose-50 text-xs transition-colors cursor-pointer ml-auto"
                    title="Báo cáo vi phạm truyện"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: Left Column (Giới thiệu, Ưu đãi, Danh sách chương) + Right Column (Dịch giả, Đẩy thuyền, Truyện liên quan) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left / Main Column */}
        <div className="lg:col-span-8 space-y-8">
          


          {/* Ưu Đãi Trọn Bộ Banner (Combo VIP) - Chỉ hiển thị khi truyện đã Hoàn thành / Full, ẩn khi Đang ra */}
          {!isFullBookUnlocked && isFull && (
            <div className="bundle-discount-block bg-gradient-to-r from-pink-50 to-rose-50 dark:from-slate-900 dark:to-slate-800 border border-pink-200 dark:border-pink-900/60 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm text-slate-900 dark:text-white">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 flex items-center justify-center flex-shrink-0 text-xl shadow-xs">
                  🎁
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-slate-900 dark:text-white font-extrabold text-sm sm:text-base">Ưu Đãi Trọn Bộ</span>
                    {discountPercent > 0 && (
                      <span className="text-[10px] font-black text-white bg-gradient-to-r from-rose-600 to-amber-500 px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 animate-pulse">
                        <span>🔥</span> Tiết kiệm {discountPercent}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5">
                    Mua combo trọn bộ tiết kiệm so với đọc lẻ. Mở khóa vĩnh viễn không giới hạn.
                  </p>
                  <div className="text-xs mt-1 text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    {discountPercent > 0 ? (
                      <>
                        <span className="line-through text-slate-500 dark:text-slate-400 mr-2">{formatXu(novel.fullBookPriceXu)} xu</span>
                        <span className="font-extrabold text-pink-600 dark:text-pink-400 text-sm sm:text-base">{formatXu(novel.fullBookDiscountPriceXu)} xu</span>
                      </>
                    ) : (
                      <span className="font-extrabold text-pink-600 dark:text-pink-400 text-sm sm:text-base">{formatXu(novel.fullBookPriceXu || 0)} xu</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  if (firstChapter) {
                    onOpenVipPurchase(novel, firstChapter, 'full_book_only');
                  }
                }}
                disabled={!firstChapter}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-md shadow-pink-600/25 cursor-pointer whitespace-nowrap transition-transform hover:scale-102"
              >
                Chốt Đơn &rarr;
              </button>
            </div>
          )}

          {/* 4. "Dưới cùng là danh sách chương truyện" (Chuẩn theo hình 2) */}
          <section 
            ref={chapterSectionRef} 
            id="danh-sach-chuong"
            className="bg-white dark:bg-slate-900 border border-pink-100/80 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-sm transition-colors text-slate-900 dark:text-white"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-pink-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-pink-100 dark:bg-pink-950/50 text-pink-500 flex items-center justify-center">
                  <List className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-serif">
                    Danh sách chương
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Tổng cộng {safeChapters?.length || 0} chương đã phát hành
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Search input */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchChapter}
                    onChange={(e) => setSearchChapter(e.target.value)}
                    placeholder="Tìm số hoặc tên chương..."
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-pink-500 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 rounded-xl py-2 pl-3 pr-8 w-44 sm:w-52 focus:outline-none transition-colors"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Sort Toggle */}
                <button
                  onClick={() => setIsAscending(!isAscending)}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-pink-400 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowDownUp className="w-3.5 h-3.5 text-pink-500" />
                  <span>{isAscending ? 'Cũ nhất' : 'Mới nhất'}</span>
                </button>
              </div>
            </div>

            {/* Range pagination buttons with visible horizontal scrollbar & quick scroll */}
            {!searchChapter && totalChunks > 1 && (
              <div className="flex items-center gap-1.5 py-3 text-xs border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold mr-1 flex-shrink-0">
                  Khoảng chương:
                </span>
                {totalChunks > 6 && (
                  <button
                    type="button"
                    onClick={() => rangeScrollRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
                    className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-pink-100 text-slate-700 dark:text-slate-200 flex-shrink-0 cursor-pointer transition-colors"
                    title="Cuộn sang trái"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <div
                  ref={rangeScrollRef}
                  className="flex items-center gap-1.5 overflow-x-auto pb-2 flex-1 chapter-range-scrollbar"
                >
                  {Array.from({ length: totalChunks }, (_, i) => {
                    const start = i * CHUNK_SIZE + 1;
                    const end = Math.min((i + 1) * CHUNK_SIZE, safeChapters?.length || 0);
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedRange(i)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0 cursor-pointer ${
                          selectedRange === i
                            ? 'bg-pink-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium'
                        }`}
                      >
                        {start} - {end}
                      </button>
                    );
                  })}
                </div>
                {totalChunks > 6 && (
                  <button
                    type="button"
                    onClick={() => rangeScrollRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
                    className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-pink-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex-shrink-0 cursor-pointer transition-colors"
                    title="Cuộn sang phải"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Chapter rows list */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-2 max-h-[700px] overflow-y-auto pr-2 chapter-list-scrollbar">
              {isLoadingChapters ? (
                <div className="py-14 text-center text-pink-600 text-xs flex flex-col items-center justify-center gap-2.5">
                  <div className="animate-spin w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Đang đồng bộ danh sách chương từ máy chủ...</span>
                </div>
              ) : (filteredChapters?.length || 0) === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Truyện hiện chưa có chương nào được cập nhật.
                </div>
              ) : (
                (filteredChapters || []).map((chapter) => {
                const isCurrentRead = savedProgress?.chapterNumber === chapter.number;
                const isAlreadyRead = savedProgress && chapter.number < savedProgress.chapterNumber;
                const isUnlocked = checkIsChapterUnlocked(user, novel.id, chapter);

                return (
                  <div
                    key={chapter.id}
                    onClick={() => onSelectChapter({ ...novel, chapters: activeChapters }, chapter)}
                    className={`group py-3.5 px-3 rounded-xl transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isCurrentRead
                        ? 'bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-300 font-bold'
                        : 'hover:bg-pink-50/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <BookOpen className={`w-4 h-4 flex-shrink-0 ${isCurrentRead ? 'text-pink-600' : 'text-slate-400 group-hover:text-pink-500'}`} />
                      
                      <div className="truncate text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                        <span className={`font-bold mr-1 ${isCurrentRead ? 'text-pink-600 dark:text-pink-400' : 'text-slate-800 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400'}`}>
                          Chương {chapter.number}
                        </span>
                        <span className="text-slate-600 dark:text-slate-100 truncate">
                          {chapter.title.replace(/^Chương\s*\d+[:.]*\s*/i, '')}
                        </span>
                        {/* 2. ICON AUDIO Ở DANH SÁCH CHƯƠNG: size w-3 h-3 màu vàng/hồng đậm báo hiệu có hỗ trợ âm thanh */}
                        <span 
                          className="inline-flex items-center text-amber-500 dark:text-pink-400 group-hover:scale-110 transition-transform shrink-0" 
                          title="Chương này có hỗ trợ đọc Audio (Web Speech API)"
                        >
                          <Headphones className="w-3 h-3" />
                        </span>
                      </div>

                      {isCurrentRead && (
                        <span className="bg-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                          Đang đọc
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                      {chapter.isHidden && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md flex items-center gap-1 font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                          <EyeOff className="w-3 h-3 text-amber-600" /> Đã ẩn
                        </span>
                      )}

                      {chapter.isVip && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-md flex items-center gap-1 font-bold ${
                          isUnlocked
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200'
                        }`}>
                          {isUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {isUnlocked ? 'Đã mở' : `${formatXu(chapter.priceXu)} Xu`}
                        </span>
                      )}

                      <span className="text-slate-400 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        {chapter.publishedDate || '09/10/2026'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </section>

          {/* Comments Section */}
          <CommentsSection novelId={novel.id} user={user} />
        </div>

        {/* Right Sidebar Column (Chuẩn theo hình 2) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Card: Dịch giả / Nhà đăng */}
          <div className="novel-sidebar-card bg-white dark:bg-slate-900 border border-pink-100/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm text-center text-slate-900 dark:text-white">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-bold mb-4">
              <span>🌸 Dịch giả / Nhà đăng</span>
            </div>

            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 text-white font-extrabold text-2xl flex items-center justify-center mx-auto shadow-md mb-3">
              {uploaderName.charAt(0).toUpperCase()}
            </div>

            <h3 className="font-black text-base text-slate-950 dark:text-white mb-1">
              {uploaderName}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mb-4">
              Nhà sáng tác &amp; đăng tải truyện tại Đạo Tâm
            </p>

            <div className="flex flex-col gap-2">
              {onOpenDonateNovel && (
                <button
                  onClick={() => onOpenDonateNovel(novel)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-black text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer hover:scale-101"
                >
                  <span>🎁</span>
                  <span>Tặng Xu Cho Người Đăng</span>
                </button>
              )}

              <button
                onClick={() => onOpenAuthorShowcase && onOpenAuthorShowcase(uploaderName, 'editor')}
                className="w-full py-2 rounded-xl border border-pink-300 dark:border-pink-900/60 hover:border-pink-500 text-slate-900 dark:text-white hover:bg-pink-50 dark:hover:bg-slate-800 font-bold text-xs transition-colors cursor-pointer"
              >
                Xem trang cá nhân
              </button>
            </div>
          </div>

          {/* Bảng Vàng Ủng Hộ (Xác nhận thực tế qua lại giữa độc giả và người đăng truyện) */}
          <div className="novel-sidebar-card bg-white dark:bg-slate-900 border border-pink-100/80 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-slate-900 dark:text-white">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-pink-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <span className="text-base">💝</span>
                <span>Bảng Vàng Ủng Hộ</span>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300">
                {novelDonations?.length || 0} lượt
              </span>
            </div>

            {(novelDonations?.length || 0) > 0 ? (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {(novelDonations || []).map((dn) => (
                  <div 
                    key={dn.id} 
                    className="p-2.5 rounded-xl bg-pink-50/60 dark:bg-slate-800/80 border border-pink-100 dark:border-slate-700 text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {dn.donorName}
                      </span>
                      <span className="font-black text-rose-600 dark:text-rose-400 whitespace-nowrap flex items-center gap-0.5">
                        <Coins className="w-3 h-3 inline" />
                        +{formatXu(dn.amountXu)} Xu
                      </span>
                    </div>
                    {dn.message && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 italic line-clamp-2">
                        "{dn.message}"
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 dark:text-slate-400">
                      {new Date(dn.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-400">
                <p className="mb-2">Chưa có lượt tặng Xu nào.</p>
                {onOpenDonateNovel && (
                  <button
                    onClick={() => onOpenDonateNovel(novel)}
                    className="text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 font-bold underline cursor-pointer"
                  >
                    Hãy là người đầu tiên tặng Xu!
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Card: Truyện liên quan */}
          {(relatedNovels?.length || 0) > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-pink-100/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white mb-4">
                <Heart className="w-4 h-4 text-pink-500" />
                <span>Truyện liên quan</span>
              </div>

              <div className="space-y-3.5">
                {(relatedNovels || []).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onSelectNovel && onSelectNovel(item)}
                    className="flex items-center gap-3 group cursor-pointer"
                  >
                    <img
                      src={item.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                      alt={item.title}
                      className="w-12 h-16 rounded-lg object-cover flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-pink-600 truncate transition-colors">
                        {item.title}
                      </h4>
                      <span className="inline-block text-[10px] text-pink-600 dark:text-pink-400 font-semibold bg-pink-50 dark:bg-pink-950/40 px-1.5 py-0.2 rounded mt-1">
                        {item?.categories?.[0] || (item as any)?.genres?.[0] || 'Ngôn Tình'}
                      </span>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        <span>{formatNumber(item.views)} lượt đọc</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modal Xác Nhận Xóa Vĩnh Viễn Truyện */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-500/50 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center border border-rose-500/40 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Xác Nhận Xóa Vĩnh Viễn Truyện?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Bạn có chắc chắn muốn xóa tác phẩm <strong className="text-rose-500">"{novel.title}"</strong> không?
              </p>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-[11px] text-rose-700 dark:text-rose-300 text-left">
                ⚠️ <strong>Cảnh báo:</strong> Thao tác này sẽ xóa vĩnh viễn toàn bộ chương của tác phẩm khỏi cơ sở dữ liệu và ứng dụng. Không thể khôi phục sau khi xóa.
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                onClick={() => {
                  if (onDeleteNovel) {
                    onDeleteNovel(novel.id);
                  }
                  setShowDeleteConfirm(false);
                  onBack();
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                Xóa Vĩnh Viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
