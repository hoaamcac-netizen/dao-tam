import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Novel, Chapter, MainCategory, StoryRole, GenreItem } from '../types';
import {
  EDGE_TTS_VOICES,
  calculateChapterVip,
  isDeviceFallbackVoice,
  normalizeEdgeVoiceId,
} from '../utils/rulesAndVoices';
import { useAudio } from '../contexts/AudioContext';
import { AdminGitHubConfigCard, AdminChapterMp3Actions } from './AdminGitHubAudioManager';
import { 
  fetchChaptersForNovel, 
  deleteChapterFromFirestore, 
  deleteBatchChaptersFromFirestore,
  toggleHideChapterInFirestore,
  toggleHideBatchChaptersInFirestore
} from '../firebase/services';
import { 
  X, 
  Edit3, 
  Save, 
  Trash2, 
  Plus, 
  Upload, 
  Image as ImageIcon, 
  BookOpen, 
  Lock, 
  Unlock, 
  Coins, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  CheckSquare, 
  Square, 
  ArrowLeft,
  FileText,
  PenTool,
  Scissors,
  Sparkles,
  Percent,
  Home,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Headphones
} from 'lucide-react';

export interface EditNovelModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  novel: Novel | null;
  genres: GenreItem[];
  onAddNewGenre?: (name: string) => void;
  onSaveNovel: (updatedNovel: Novel) => Promise<void> | void;
  onChapterAudioUpdated?: (novelId: string, updatedChapter: Chapter) => void;
  onHomeClick?: () => void;
}

export const EditNovelModal: React.FC<EditNovelModalProps> = ({
  isOpen,
  isPageView = true,
  isAdmin = false,
  onClose,
  novel,
  genres = [],
  onAddNewGenre,
  onSaveNovel,
  onChapterAudioUpdated,
  onHomeClick,
}) => {
  if (!isOpen || !novel) return null;

  const audioContext = useAudio();
  const [activeTab, setActiveTab] = useState<'info' | 'chapters'>('info');
  const [adminTtsVoiceId, setAdminTtsVoiceId] = useState<string>(() => {
    const normalized = normalizeEdgeVoiceId(audioContext.voiceId || 'vi-VN-NamMinhNeural');
    return isDeviceFallbackVoice(normalized) ? 'vi-VN-NamMinhNeural' : normalized;
  });

  // Form states for Novel Metadata with complete null/undefined protection
  const [title, setTitle] = useState(novel.title || '');
  const [author, setAuthor] = useState(novel.author || 'Khuyết danh');
  const [editor, setEditor] = useState(novel.editor || '');
  const [isAuthorRole, setIsAuthorRole] = useState(novel.publisherRoles?.includes('author') ?? true);
  const [isEditorRole, setIsEditorRole] = useState(novel.publisherRoles?.includes('editor') ?? !!novel.editor);
  const [isExclusive, setIsExclusive] = useState(!!novel.isExclusive);
  const [isShortStory, setIsShortStory] = useState(!!novel.isShortStory);
  const [mainCategory, setMainCategory] = useState<MainCategory>(novel.mainCategory || 'dam-my');
  const [status, setStatus] = useState<Novel['status']>(novel.status || 'Đang ra');
  const [coverImage, setCoverImage] = useState(novel.coverImage || '');
  const [description, setDescription] = useState(novel.description || '');
  const [selectedGenres, setSelectedGenres] = useState<string[]>(Array.isArray(novel.categories) ? novel.categories : []);
  const [customGenreInput, setCustomGenreInput] = useState('');
  // Chapters list state (Safely guarded from undefined/null)
  const [chapters, setChapters] = useState<Chapter[]>(() => {
    return Array.isArray(novel.chapters) ? [...novel.chapters] : [];
  });

  // Tính tổng số xu được set VIP thực tế của các chương trong bộ truyện này
  const calculatedListedPrice = useMemo(() => {
    const vipSum = (chapters || [])
      .filter((c) => c.isVip)
      .reduce((sum, c) => sum + (c.priceXu || 0), 0);
    return Math.round(vipSum * 100) / 100;
  }, [chapters]);

  const vipChaptersCount = useMemo(() => {
    return (chapters || []).filter((c) => c.isVip)?.length || 0;
  }, [chapters]);

  const [fullBookPriceXu, setFullBookPriceXu] = useState<number>(() => {
    return novel.fullBookPriceXu || calculatedListedPrice || 0;
  });
  const [fullBookDiscountPriceXu, setFullBookDiscountPriceXu] = useState<number>(novel.fullBookDiscountPriceXu || 0);

  // Split Full Book Price evenly across VIP chapters state
  const [splitPriceInput, setSplitPriceInput] = useState<number>(novel.fullBookDiscountPriceXu || 50);
  const [batchPriceInput, setBatchPriceInput] = useState<string>('0.35');
  const [showBatchPriceModal, setShowBatchPriceModal] = useState(false);

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chapterSearch, setChapterSearch] = useState('');
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [deletingChapterIds, setDeletingChapterIds] = useState<Set<string>>(new Set());
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  // Single Chapter Editing state
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [isNewChapter, setIsNewChapter] = useState(false);

  // Success & Error message state
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveErrorMsg, setSaveErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChapterChanges, setHasChapterChanges] = useState(false);

  // Synchronize state whenever novel prop changes or changes ID
  useEffect(() => {
    if (novel) {
      setHasChapterChanges(false);
      setTitle(novel.title || '');
      setAuthor(novel.author || 'Khuyết danh');
      setEditor(novel.editor || '');
      setIsAuthorRole(novel.publisherRoles?.includes('author') ?? true);
      setIsEditorRole(novel.publisherRoles?.includes('editor') ?? !!novel.editor);
      setIsExclusive(!!novel.isExclusive);
      setIsShortStory(!!novel.isShortStory);
      setMainCategory(novel.mainCategory || 'dam-my');
      setStatus(novel.status || 'Đang ra');
      setCoverImage(novel.coverImage || '');
      setDescription(novel.description || '');
      setSelectedGenres(Array.isArray(novel.categories) ? novel.categories : []);
      const currentChaps = Array.isArray(novel.chapters) && (novel.chapters?.length || 0) > 0 ? [...novel.chapters] : [];
      setChapters(currentChaps);
      const chapsVipSum = currentChaps.filter((c) => c.isVip).reduce((s, c) => s + (c.priceXu || 0), 0);
      const realTotal = Math.round(chapsVipSum * 100) / 100;
      setFullBookPriceXu(novel.fullBookPriceXu || realTotal || 0);
      setFullBookDiscountPriceXu(novel.fullBookDiscountPriceXu || 0);
      setSplitPriceInput(novel.fullBookDiscountPriceXu || 50);
      if (((currentChaps?.length || 0) === 0 || (currentChaps?.length || 0) < (novel.totalChapters || 0)) && novel.id) {
        fetchChaptersForNovel(novel.id).then((fetched) => {
          const safeFetched = Array.isArray(fetched) ? fetched : [];
          if ((safeFetched?.length || 0) > 0) {
            setChapters(safeFetched);
            const fetchedVipSum = safeFetched.filter((c) => c.isVip).reduce((s, c) => s + (c.priceXu || 0), 0);
            const fTotal = Math.round(fetchedVipSum * 100) / 100;
            if (fTotal > 0 && (!novel.fullBookPriceXu || novel.fullBookPriceXu === 0)) {
              setFullBookPriceXu(fTotal);
            }
          }
        }).catch(() => {});
      }
      setSelectedChapterIds([]);
      setEditingChapter(null);
    }
  }, [novel?.id]);

  // Handle Cover File Upload with automatic Canvas compression
  const handleCoverFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      if (!rawData) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 420;
        const maxH = 630;
        let width = img.width;
        let height = img.height;

        if (width > maxW || height > maxH) {
          const ratio = Math.min(maxW / width, maxH / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.75);
          setCoverImage(compressed);
        } else {
          setCoverImage(rawData);
        }
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  // Toggle Genre
  const handleToggleGenre = (genreName: string) => {
    const currentSelected = Array.isArray(selectedGenres) ? selectedGenres : [];
    if (currentSelected.includes(genreName)) {
      if ((currentSelected?.length || 0) > 1) {
        setSelectedGenres(currentSelected.filter((g) => g !== genreName));
      }
    } else {
      setSelectedGenres([...currentSelected, genreName]);
    }
  };

  const handleAddNewCustomGenre = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customGenreInput.trim();
    if (!trimmed) return;
    if (onAddNewGenre) {
      onAddNewGenre(trimmed);
    }
    const currentSelected = Array.isArray(selectedGenres) ? selectedGenres : [];
    if (!currentSelected.includes(trimmed)) {
      setSelectedGenres([...currentSelected, trimmed]);
    }
    setCustomGenreInput('');
  };

  // Filtered Chapters
  const filteredChapters = useMemo(() => {
    const safeChaps = Array.isArray(chapters) ? chapters : [];
    if (!chapterSearch.trim()) return safeChaps;
    const q = chapterSearch.toLowerCase().trim();
    return safeChaps.filter(
      (c) => (c.title || '').toLowerCase().includes(q) || (c.number || '').toString().includes(q)
    );
  }, [chapters, chapterSearch]);

  // Batch Selection Handlers
  const handleToggleSelectAll = () => {
    const safeFiltered = filteredChapters || [];
    if ((selectedChapterIds?.length || 0) === (safeFiltered?.length || 0)) {
      setSelectedChapterIds([]);
    } else {
      setSelectedChapterIds(safeFiltered.map((c) => c.id));
    }
  };

  const handleToggleSelectChapter = (id: string) => {
    const currentIds = Array.isArray(selectedChapterIds) ? selectedChapterIds : [];
    if (currentIds.includes(id)) {
      setSelectedChapterIds(currentIds.filter((cid) => cid !== id));
    } else {
      setSelectedChapterIds([...currentIds, id]);
    }
  };

  // Batch Delete Execution
  const handleExecuteBatchDelete = async () => {
    const safeChaps = Array.isArray(chapters) ? chapters : [];
    const currentIds = Array.isArray(selectedChapterIds) ? selectedChapterIds : [];
    const toDelete = safeChaps.filter((c) => currentIds.includes(c.id));
    const remaining = safeChaps.filter((c) => !currentIds.includes(c.id));
    setChapters(remaining);
    setSelectedChapterIds([]);
    setConfirmBatchDelete(false);
    setIsDeletingBatch(true);

    if ((toDelete?.length || 0) > 0) {
      try {
        await deleteBatchChaptersFromFirestore(
          novel.id,
          (toDelete || []).map((c) => c.number),
          (toDelete || []).map((c) => c.id)
        );
        const remLen = remaining?.length || 0;
        const latestChap = remLen > 0 ? remaining[remLen - 1] : null;
        if (onSaveNovel) {
          onSaveNovel({
            ...novel,
            chapters: remaining,
            totalChapters: remLen,
            latestChapterNumber: latestChap?.number || remLen,
            latestChapterTitle: latestChap?.title || (remLen > 0 ? `Chương ${remLen}` : 'Chưa có chương'),
            lastChapterUpdatedAt: novel.lastChapterUpdatedAt ?? novel.updatedAt,
          });
        }
        setSaveSuccessMsg(`Đã xóa vĩnh viễn ${toDelete?.length || 0} chương khỏi hệ thống!`);
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } catch (err: any) {
        console.error('Error batch deleting chapters:', err);
        // Khôi phục lại mảng chương nếu Firestore báo lỗi
        setChapters((prev) => [...prev, ...toDelete].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0)));
        setSaveErrorMsg(`Lỗi khi xóa các chương khỏi Firestore: ${err?.message || 'Không thể xóa'}`);
        setTimeout(() => setSaveErrorMsg(''), 5000);
      } finally {
        setIsDeletingBatch(false);
      }
    } else {
      setIsDeletingBatch(false);
    }
  };

  // Chia đều giá trọn bộ cho các chương VIP
  const handleSplitPriceAcrossVipChapters = () => {
    const safeChaps = Array.isArray(chapters) ? chapters : [];
    let vipChapters = safeChaps.filter((c) => c.isVip);

    if ((vipChapters?.length || 0) === 0) {
      const shouldAutoVip = confirm(
        `Hiện chưa có chương nào được đánh dấu là VIP.\nBạn có muốn tự động bật VIP theo quy chuẩn (từ chương 51 nếu trên 200c, hoặc từ chương 31 nếu dưới 200c) và chia đều ${splitPriceInput} Xu không?`
      );
      if (!shouldAutoVip) return;

      const totalCount = safeChaps?.length || 0;
      const updatedWithVip = safeChaps.map((c) => {
        const { isVip } = calculateChapterVip(c.number, totalCount);
        return { ...c, isVip };
      });
      vipChapters = updatedWithVip.filter((c) => c.isVip);
      if ((vipChapters?.length || 0) === 0) {
        alert('Truyện chưa đủ số chương theo quy chuẩn để set VIP tự động.');
        return;
      }
      setChapters(updatedWithVip);
    }

    const pricePerChapter = parseFloat((splitPriceInput / (vipChapters?.length || 1)).toFixed(2));
    const effectivePrice = Math.max(0.01, pricePerChapter);

    setChapters((prev) =>
      (prev || []).map((c) => (c.isVip ? { ...c, priceXu: effectivePrice } : c))
    );

    setSaveSuccessMsg(
      `Đã chia đều ${splitPriceInput} Xu cho ${vipChapters?.length || 0} chương VIP! Mỗi chương VIP là ${effectivePrice} Xu.`
    );
    setTimeout(() => setSaveSuccessMsg(''), 4500);
  };

  // Đặt giá Xu hàng loạt cho các chương đã chọn
  const handleApplyBatchPrice = () => {
    const parsed = parseFloat(batchPriceInput);
    if (isNaN(parsed) || parsed < 0) {
      alert('Vui lòng nhập số Xu hợp lệ (ví dụ: 0.01 hoặc 0.35).');
      return;
    }
    const currentIds = Array.isArray(selectedChapterIds) ? selectedChapterIds : [];
    setChapters((prev) =>
      (prev || []).map((c) =>
        currentIds.includes(c.id)
          ? { ...c, isVip: parsed > 0, priceXu: parsed }
          : c
      )
    );
    setShowBatchPriceModal(false);
    setSaveSuccessMsg(`Đã đặt giá ${parsed} Xu cho ${currentIds?.length || 0} chương đã chọn!`);
    setTimeout(() => setSaveSuccessMsg(''), 4000);
  };

  const [confirmDeleteChapter, setConfirmDeleteChapter] = useState<Chapter | null>(null);

  // Single Chapter Delete
  const handleDeleteSingleChapter = (chapterId: string) => {
    const target = (chapters || []).find((c) => c.id === chapterId) || null;
    if (target) {
      setConfirmDeleteChapter(target);
    }
  };

  const executeDeleteSingleChapter = async (chapterId: string) => {
    const safeChaps = Array.isArray(chapters) ? chapters : [];
    const target = safeChaps.find((c) => c.id === chapterId);
    if (!target) return;

    setDeletingChapterIds((prev) => new Set(prev).add(chapterId));
    setChapters((prev) => (prev || []).filter((c) => c.id !== chapterId));
    if ((selectedChapterIds || []).includes(chapterId)) {
      setSelectedChapterIds((prev) => (prev || []).filter((id) => id !== chapterId));
    }
    setConfirmDeleteChapter(null);

    try {
      await deleteChapterFromFirestore(novel.id, target.number, target.id);
      const remaining = safeChaps.filter((c) => c.id !== chapterId);
      const remLen = remaining?.length || 0;
      const latestChap = remLen > 0 ? remaining[remLen - 1] : null;
      if (onSaveNovel) {
        onSaveNovel({
          ...novel,
          chapters: remaining,
          totalChapters: remLen,
          latestChapterNumber: latestChap?.number || remLen,
          latestChapterTitle: latestChap?.title || (remLen > 0 ? `Chương ${remLen}` : 'Chưa có chương'),
          lastChapterUpdatedAt: novel.lastChapterUpdatedAt ?? novel.updatedAt,
        });
      }
      setSaveSuccessMsg(`Đã xóa vĩnh viễn ${target.title || `Chương ${target.number}`} khỏi hệ thống!`);
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error('Error deleting single chapter:', err);
      // Khôi phục nếu lỗi
      setChapters((prev) => [...prev, target].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0)));
      setSaveErrorMsg(`Lỗi khi xóa chương khỏi Firestore: ${err?.message || 'Không thể xóa'}`);
      setTimeout(() => setSaveErrorMsg(''), 5000);
    } finally {
      setDeletingChapterIds((prev) => {
        const next = new Set(prev);
        next.delete(chapterId);
        return next;
      });
    }
  };

  // Toggle Hide / Show single chapter
  const handleToggleHideChapter = async (chapterId: string) => {
    const target = chapters.find((c) => c.id === chapterId);
    if (!target) return;
    const nextHidden = !target.isHidden;

    // Cập nhật giao diện tức thì trong 0ms (Optimistic UI)
    setChapters((prev) =>
      prev.map((c) => (c.id === chapterId ? { ...c, isHidden: nextHidden } : c))
    );

    setSaveSuccessMsg(nextHidden ? `Đã ẩn Chương ${target.number} khỏi độc giả!` : `Đã hiển thị lại Chương ${target.number} cho độc giả!`);
    setTimeout(() => setSaveSuccessMsg(''), 3000);

    // Đồng bộ Firestore chạy ngầm
    try {
      await toggleHideChapterInFirestore(novel.id, target.number, nextHidden);
    } catch (err: any) {
      console.warn('Lỗi đồng bộ ẩn/hiện chương lên Firestore:', err);
    }
  };

  // Toggle Hide / Show batch selected chapters
  const handleToggleHideSelectedChapters = async (toHide: boolean) => {
    if ((selectedChapterIds?.length || 0) === 0) return;
    const toChange = (chapters || []).filter((c) => (selectedChapterIds || []).includes(c.id));
    if ((toChange?.length || 0) === 0) return;

    // Cập nhật giao diện tức thì
    setChapters((prev) =>
      (prev || []).map((c) => ((selectedChapterIds || []).includes(c.id) ? { ...c, isHidden: toHide } : c))
    );
    setSelectedChapterIds([]);

    setSaveSuccessMsg(toHide ? `Đã ẩn ${toChange?.length || 0} chương khỏi độc giả!` : `Đã hiển thị lại ${toChange?.length || 0} chương cho độc giả!`);
    setTimeout(() => setSaveSuccessMsg(''), 3500);

    // Đồng bộ Firestore
    try {
      await toggleHideBatchChaptersInFirestore(
        novel.id,
        (toChange || []).map((c) => c.number),
        toHide
      );
    } catch (err: any) {
      console.warn('Lỗi đồng bộ batch ẩn/hiện chương lên Firestore:', err);
    }
  };

  // Open Chapter Editor for new chapter
  const handleAddNewChapter = () => {
    const safeChaps = Array.isArray(chapters) ? chapters : [];
    const nextNumber = (safeChaps?.length || 0) > 0 ? Math.max(...safeChaps.map((c) => c.number || 0)) + 1 : 1;
    const { isVip, priceXu } = calculateChapterVip(nextNumber, novel.totalChapters || safeChaps?.length || 100);
    
    setEditingChapter({
      id: `${novel.id}-c${nextNumber}-${Date.now()}`,
      number: nextNumber,
      title: `Chương ${nextNumber}: Tiêu đề chương mới`,
      slug: `chuong-${nextNumber}`,
      content: '',
      wordCount: 0,
      publishedDate: new Date().toISOString().split('T')[0],
      isVip,
      priceXu,
    });
    setIsNewChapter(true);
  };

  // Save single chapter edit
  const handleSaveChapterEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChapter) return;

    const wordCount = (editingChapter.content || '').split(/\s+/).filter(Boolean)?.length || 0;
    const updatedChapter: Chapter = {
      ...editingChapter,
      wordCount,
      title: (editingChapter.title || '').trim() || `Chương ${editingChapter.number}`,
    };

    if (isNewChapter) {
      setChapters((prev) => [...(prev || []), updatedChapter].sort((a, b) => a.number - b.number));
    } else {
      setChapters((prev) =>
        (prev || [])
          .map((c) => (c.id === updatedChapter.id ? updatedChapter : c))
          .sort((a, b) => a.number - b.number)
      );
    }

    setHasChapterChanges(true);
    setEditingChapter(null);
    setIsNewChapter(false);
  };

  // Save entire novel changes
  const handleSaveAllChanges = async () => {
    if (!title.trim()) {
      alert('Vui lòng nhập tên truyện.');
      return;
    }

    const publisherRoles: StoryRole[] = [];
    if (isAuthorRole) publisherRoles.push('author');
    if (isEditorRole) publisherRoles.push('editor');

    const isCompleted = status === 'Hoàn thành' || status === 'Full';
    const effectiveListedPrice = fullBookPriceXu > 0 ? fullBookPriceXu : (calculatedListedPrice > 0 ? calculatedListedPrice : 0);
    const effectiveDiscountPrice = isCompleted && fullBookDiscountPriceXu > 0 && fullBookDiscountPriceXu < effectiveListedPrice
      ? fullBookDiscountPriceXu
      : (isCompleted && fullBookDiscountPriceXu > 0 ? fullBookDiscountPriceXu : undefined);

    const safeChaps = Array.isArray(chapters) ? chapters : [];
    const chapsLen = safeChaps?.length || 0;
    const effectiveTotal = chapsLen > 0 
      ? Math.max(chapsLen, Number(safeChaps[chapsLen - 1]?.number) || 0)
      : 0;

    const latestChap = chapsLen > 0 ? safeChaps[chapsLen - 1] : null;
    const latestChapterTitle = latestChap?.title
      ? (latestChap.title.startsWith('Chương') ? latestChap.title : `Chương ${latestChap.number}: ${latestChap.title}`)
      : 'Chưa có chương';

    const updatedNovel: Novel = {
      ...novel,
      title: title.trim(),
      author: author.trim() || 'Khuyết danh',
      editor: editor.trim() || undefined,
      publisherRoles,
      isExclusive,
      isShortStory,
      mainCategory,
      isOriginal: mainCategory === 'truyen-sang-tac',
      status,
      coverImage: coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      description: description.trim(),
      categories: selectedGenres,
      totalChapters: effectiveTotal,
      latestChapterTitle,
      latestChapterNumber: latestChap?.number || 0,
      fullBookPriceXu: effectiveListedPrice,
      fullBookDiscountPriceXu: effectiveDiscountPrice,
      chapters,
      updatedAt: Date.now(),
      lastChapterUpdatedAt: hasChapterChanges ? Date.now() : (novel.lastChapterUpdatedAt ?? novel.updatedAt),
      lastUpdated: hasChapterChanges ? 'Vừa xong' : (novel.lastUpdated || 'Vừa chỉnh sửa xong'),
    };

    setIsSaving(true);
    setSaveErrorMsg('');

    // Watchdog timer 30s để không bao giờ bị kẹt trạng thái đang lưu
    const watchdog = setTimeout(() => {
      setIsSaving(false);
      setSaveErrorMsg('Thời gian phản hồi máy chủ hơi lâu. Các thay đổi đã được lưu vào bộ nhớ tạm trên máy bạn, bạn có thể đóng hoặc thử lại.');
    }, 30000);

    try {
      await onSaveNovel(updatedNovel);
      setSaveSuccessMsg('Đã lưu thành công tất cả thay đổi của truyện và các chương!');
      setTimeout(() => {
        setSaveSuccessMsg('');
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Lỗi khi lưu chỉnh sửa truyện:', err);
      setSaveErrorMsg(err?.message || 'Không thể lưu thay đổi lên máy chủ. Vui lòng thử lại!');
    } finally {
      clearTimeout(watchdog);
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full min-h-[90vh] bg-white text-slate-900 pb-16 animate-in fade-in duration-200">
      
      {/* 1. Header Toolbar (Nền trắng, chữ đen hoặc hồng theo đúng yêu cầu) */}
      <div className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4 shadow-xs sticky top-16 z-30">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          
          {/* Breadcrumbs: Trang chủ > Tủ truyện > Truyện của bạn > Chỉnh sửa */}
          <div>
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold mb-1">
              <button
                type="button"
                onClick={onHomeClick || onClose}
                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-pink-600 transition cursor-pointer"
              >
                <span>Trang chủ</span>
                <Home className="w-3.5 h-3.5 text-pink-500" />
              </button>
              <span className="text-slate-400">&gt;</span>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-600 hover:text-pink-600 transition cursor-pointer"
              >
                Truyện của bạn
              </button>
              <span className="text-slate-400">&gt;</span>
              <span className="text-pink-600 font-bold">Chỉnh sửa truyện</span>
            </div>

            <h1 className="text-lg sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-pink-600" />
              <span>Chỉnh Sửa Truyện: </span>
              <span className="text-pink-600">{novel.title}</span>
            </h1>
          </div>

          {/* Action Buttons: Quay lại & Lưu thay đổi */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại</span>
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveAllChanges}
              className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-pink-600/20 flex items-center gap-2 transition-all cursor-pointer hover:scale-102 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang lưu lên hệ thống...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Lưu Thay Đổi</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Cảnh báo nền màu vàng khi ĐANG LƯU */}
      {isSaving && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-4">
          <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 font-bold flex items-center gap-3 shadow-md animate-pulse">
            <div className="w-5 h-5 border-2 border-amber-700 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs sm:text-sm font-black">⚡ Đang cập nhật và lưu thay đổi lên máy chủ Cloud Firestore...</p>
              <p className="text-[11px] text-amber-800 font-normal">Hệ thống đang đồng bộ an toàn bằng WriteBatch. Vui lòng không nhấn nút nhiều lần.</p>
            </div>
          </div>
        </div>
      )}

      {/* Cảnh báo nền màu vàng khi GẶP LỖI */}
      {saveErrorMsg && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-4">
          <div className="p-4 rounded-xl bg-amber-100 border-2 border-amber-500 text-amber-950 font-bold flex items-start gap-3 shadow-md">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs sm:text-sm font-black">Cảnh báo / Lỗi xử lý:</p>
              <p className="text-xs text-amber-900 font-medium mt-0.5">{saveErrorMsg}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Alert Banner */}
      {saveSuccessMsg && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-4">
          <div className="px-5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        </div>
      )}

      {/* 2. Main Content Container (Nền trắng tinh, chữ đen sắc nét, viền hồng tinh tế) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
        
        {/* Navigation Tabs Bar */}
        <div className="border-b border-slate-200 flex items-center gap-6 mb-6 text-sm font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`pb-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'info'
                ? 'border-pink-600 text-pink-600 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>1. Thông Tin Chung &amp; Ảnh Bìa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={`pb-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'chapters'
                ? 'border-pink-600 text-pink-600 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>2. Quản Lý &amp; Sửa Từng Chương ({chapters?.length || 0} chương)</span>
          </button>
        </div>

        {/* TAB 1: THÔNG TIN CHUNG & ẢNH BÌA */}
        {activeTab === 'info' && (
          <div className="space-y-6 bg-white">
            
            {/* Top Grid: Cover Upload + Essential Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Cover Image Upload Card */}
              <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 flex flex-col items-center justify-center text-center shadow-xs">
                <label className="block text-slate-900 font-bold mb-3 text-xs sm:text-sm">
                  Ảnh Bìa Tác Phẩm:
                </label>

                <div className="relative group w-40 h-56 rounded-xl overflow-hidden border-2 border-pink-200 shadow-md mb-4 bg-slate-100">
                  <img
                    src={coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'}
                    alt={title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-pink-600 text-white text-xs font-bold cursor-pointer hover:bg-pink-700 shadow"
                    >
                      Đổi ảnh từ máy
                    </button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverFileUpload}
                  className="hidden"
                />

                <div className="w-full space-y-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold flex items-center justify-center gap-2 cursor-pointer text-xs shadow-2xs"
                  >
                    <Upload className="w-4 h-4 text-pink-600" />
                    <span>Tải ảnh bìa mới từ máy</span>
                  </button>

                  <input
                    type="text"
                    value={coverImage}
                    onChange={(e) => setCoverImage(e.target.value)}
                    placeholder="Hoặc dán liên kết URL ảnh bìa..."
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-pink-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Novel Details Form Column */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-slate-900 font-black mb-1.5 text-xs sm:text-sm">
                    Tên Tác Phẩm / Truyện *:
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Nhập tên truyện..."
                    className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-3 text-slate-900 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-pink-500 shadow-2xs"
                  />
                </div>

                {/* Role and Authorship */}
                <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-2.5">
                  <label className="block text-slate-900 font-bold text-xs sm:text-sm">
                    Vai trò &amp; Cơ chế phát hành:
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className={`flex items-center gap-2 cursor-pointer px-3.5 py-2 rounded-xl border shadow-2xs select-none transition ${
                      isAuthorRole
                        ? 'bg-pink-50 border-pink-400 text-pink-700 ring-1 ring-pink-300 dark:bg-slate-800 dark:border-pink-500 dark:text-slate-200 dark:ring-pink-400'
                        : 'bg-white border-slate-200 text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isAuthorRole}
                        onChange={(e) => setIsAuthorRole(e.target.checked)}
                        className="w-4 h-4 rounded text-pink-600 accent-pink-600 dark:border-slate-600 dark:bg-slate-800"
                      />
                      <span className="font-bold flex items-center gap-1.5 text-xs dark:text-slate-200">
                        <PenTool className="w-3.5 h-3.5 text-pink-600" /> Tác giả sáng tác
                      </span>
                    </label>

                    <label className={`flex items-center gap-2 cursor-pointer px-3.5 py-2 rounded-xl border shadow-2xs select-none transition ${
                      isEditorRole
                        ? 'bg-pink-50 border-pink-400 text-pink-700 ring-1 ring-pink-300 dark:bg-slate-800 dark:border-pink-500 dark:text-slate-200 dark:ring-pink-400'
                        : 'bg-white border-slate-200 text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isEditorRole}
                        onChange={(e) => setIsEditorRole(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 dark:border-slate-600 dark:bg-slate-800"
                      />
                      <span className="font-bold flex items-center gap-1.5 text-xs dark:text-slate-200">
                        <Scissors className="w-3.5 h-3.5 text-indigo-600" /> Editor / Bản Edit
                      </span>
                    </label>

                    <label className={`flex items-center gap-2 cursor-pointer px-3.5 py-2 rounded-xl border shadow-2xs select-none transition ${
                      isExclusive
                        ? 'bg-pink-50 border-pink-400 text-pink-700 ring-1 ring-pink-300 dark:bg-slate-800 dark:border-pink-500 dark:text-slate-200 dark:ring-pink-400'
                        : 'bg-white border-slate-200 text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isExclusive}
                        onChange={(e) => setIsExclusive(e.target.checked)}
                        className="w-4 h-4 rounded text-pink-600 accent-pink-600 dark:border-slate-600 dark:bg-slate-800"
                      />
                      <span className="font-bold flex items-center gap-1.5 text-xs dark:text-slate-200">
                        ⭐ Phát Hành Độc Quyền (95% Nhuận Bút)
                      </span>
                    </label>

                    <label className={`flex items-center gap-2 cursor-pointer px-3.5 py-2 rounded-xl border shadow-2xs select-none transition ${
                      isShortStory
                        ? 'bg-pink-50 border-pink-400 text-pink-700 ring-1 ring-pink-300 dark:bg-slate-800 dark:border-pink-500 dark:text-slate-200 dark:ring-pink-400'
                        : 'bg-white border-slate-200 text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isShortStory}
                        onChange={(e) => setIsShortStory(e.target.checked)}
                        className="w-4 h-4 rounded text-pink-600 accent-pink-600 dark:border-slate-600 dark:bg-slate-800"
                      />
                      <span className="font-bold flex items-center gap-1.5 text-xs dark:text-slate-200">
                        📖 Truyện Ngắn / Đoản Văn
                      </span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-900 font-bold mb-1.5 text-xs sm:text-sm">
                      Tác Giả Gốc *:
                    </label>
                    <input
                      type="text"
                      required
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-900 font-bold mb-1.5 text-xs sm:text-sm">
                      Tên Editor / Dịch Giả:
                    </label>
                    <input
                      type="text"
                      value={editor}
                      onChange={(e) => setEditor(e.target.value)}
                      placeholder="Tên người edit hoặc dịch..."
                      className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-900 font-bold mb-1.5 text-xs sm:text-sm">
                      Phân mục chính *:
                    </label>
                    <select
                      value={mainCategory}
                      onChange={(e) => setMainCategory(e.target.value as MainCategory)}
                      className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none"
                    >
                      <option value="dam-my">❤️ Đam Mỹ</option>
                      <option value="truyen-nam">⚔️ Truyện Nam</option>
                      <option value="truyen-nu">🌸 Truyện Nữ</option>
                      <option value="truyen-sang-tac">✍️ Truyện Sáng Tác</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-900 font-bold mb-1.5 text-xs sm:text-sm">
                      Tình trạng truyện:
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none"
                    >
                      <option value="Đang ra">Đang ra</option>
                      <option value="Hoàn thành">Hoàn thành (Full)</option>
                      <option value="Drop">Drop (Ngưng ra)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Description Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-slate-900 font-black text-xs sm:text-sm">
                  Văn Án / Giới Thiệu Tác Phẩm *:
                </label>
                <span className="text-xs text-pink-600 font-bold">
                  {(description || '').trim().split(/\s+/).filter(Boolean)?.length || 0} từ
                </span>
              </div>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nhập nội dung văn án giới thiệu truyện..."
                className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-2xl p-4 text-slate-900 leading-relaxed focus:outline-none text-xs sm:text-sm shadow-2xs"
              />
            </div>

            {/* Genres Tag Selector */}
            <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-slate-900 font-black flex items-center gap-1.5 text-xs sm:text-sm">
                  <Sparkles className="w-4 h-4 text-pink-600" />
                  Gắn Thể Loại:
                </label>
                <span className="text-xs text-pink-600 font-extrabold">
                  Đã chọn {selectedGenres?.length || 0} thể loại
                </span>
              </div>

              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                {(genres || []).map((g) => {
                  const isSelected = (selectedGenres || []).includes(g.name);
                  return (
                    <button
                      key={g.id || g.name}
                      type="button"
                      onClick={() => handleToggleGenre(g.name)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 font-semibold ${
                        isSelected
                          ? 'bg-pink-600 text-white border-pink-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-pink-400'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span>{g.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                <input
                  type="text"
                  value={customGenreInput}
                  onChange={(e) => setCustomGenreInput(e.target.value)}
                  placeholder="Thêm thể loại mới tùy chỉnh..."
                  className="flex-1 bg-white border border-slate-300 text-slate-900 text-xs rounded-xl px-3 py-2 focus:border-pink-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddNewCustomGenre}
                  className="px-4 py-2 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 border border-pink-300 cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm thể loại
                </button>
              </div>
            </div>

            {/* Pricing Section (Kích hoạt khi truyện Hoàn thành / Full theo hình 3) */}
            {(status === 'Hoàn thành' || status === 'Full') ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 rounded-2xl bg-slate-50/70 border border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-slate-900 font-bold text-xs sm:text-sm">
                      Giá trọn bộ niêm yết (Xu):
                    </label>
                    <span className="text-[11px] text-pink-600 font-semibold">
                      Tổng {vipChaptersCount} c VIP: <strong>{calculatedListedPrice} Xu</strong>
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fullBookPriceXu !== undefined ? fullBookPriceXu : (calculatedListedPrice || 0)}
                    onChange={(e) => setFullBookPriceXu(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-slate-900 font-bold text-xs sm:text-sm focus:outline-none"
                    placeholder="Nhập tổng xu niêm yết..."
                  />
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                    <span>Giá trọn bộ niêm yết dựa trên tổng số xu VIP thực tế</span>
                    {calculatedListedPrice > 0 && fullBookPriceXu !== calculatedListedPrice && (
                      <button
                        type="button"
                        onClick={() => setFullBookPriceXu(calculatedListedPrice)}
                        className="text-pink-600 hover:underline font-bold cursor-pointer"
                      >
                        Dùng tổng thực tế ({calculatedListedPrice} Xu)
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-900 font-bold mb-1.5 text-xs sm:text-sm">
                    Giá khuyến mãi combo trọn bộ (Xu):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fullBookDiscountPriceXu}
                    onChange={(e) => setFullBookDiscountPriceXu(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-slate-900 font-bold text-xs sm:text-sm focus:outline-none"
                    placeholder="Nhập số xu khuyến mãi (nhỏ hơn giá niêm yết)..."
                  />
                  <div className="mt-1">
                    {(() => {
                      const effectiveListed = fullBookPriceXu || calculatedListedPrice;
                      if (effectiveListed > 0 && fullBookDiscountPriceXu > 0) {
                        if (fullBookDiscountPriceXu < effectiveListed) {
                          const discountPercent = Math.round(((effectiveListed - fullBookDiscountPriceXu) / effectiveListed) * 100);
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-rose-600 via-pink-600 to-amber-500 text-white font-black text-[10px] shadow-sm animate-pulse">
                                <span>🔥</span> GIẢM -{discountPercent}%
                              </span>
                              <span className="text-[11px] text-emerald-600 font-bold">
                                Tiết kiệm {(effectiveListed - fullBookDiscountPriceXu).toFixed(1)} Xu • Sẽ hiện nhãn -{discountPercent}% trên bìa truyện!
                              </span>
                            </div>
                          );
                        } else {
                          return (
                            <p className="text-[11px] text-amber-600 font-semibold">
                              ⚠️ Giá khuyến mãi ({fullBookDiscountPriceXu} Xu) phải nhỏ hơn giá niêm yết ({effectiveListed} Xu) để kích hoạt nhãn giảm giá trên bìa truyện.
                            </p>
                          );
                        }
                      }
                      return (
                        <p className="text-[11px] text-slate-500">
                          Nhập giá khuyến mãi nhỏ hơn giá niêm yết để giảm giá và gắn nhãn % ưu đãi trên bìa truyện.
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50/70 border border-dashed border-slate-300 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-800">Cơ chế định giá trọn bộ &amp; Giảm giá:</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Khi truyện ở trạng thái <strong>"Hoàn thành (Full)"</strong>, bạn có quyền điều chỉnh Giá trọn bộ niêm yết (tính từ tổng VIP thực tế) và thiết lập Giá khuyến mãi combo trọn bộ kèm nhãn Giảm % bắt mắt trên bìa truyện.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStatus('Hoàn thành')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 text-xs font-bold whitespace-nowrap cursor-pointer transition flex items-center gap-1 self-start sm:self-auto"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Chuyển sang Hoàn thành (Full)</span>
                </button>
              </div>
            )}

          </div>
        )}

        {/* TAB 2: QUẢN LÝ & SỬA TỪNG CHƯƠNG */}
        {activeTab === 'chapters' && (
          <div className="space-y-5 bg-white">
            
            {/* Split Price Across VIP Chapters Tool */}
            <div className="p-5 rounded-2xl bg-pink-50/60 border border-pink-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 border border-pink-300 flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-2 flex-wrap">
                      <span>Thiết Lập Giá Trọn Bộ &amp; Tự Động Chia Đều Cho Chương VIP</span>
                      <span className="text-[10px] bg-pink-200/80 text-pink-800 px-2 py-0.5 rounded-full font-bold">
                        Hỗ trợ Xu lẻ: 0,01 • 0,35...
                      </span>
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Nhập số Xu mong muốn, hệ thống sẽ tự động tính toán và chia đều chính xác cho các chương VIP.
                    </p>
                  </div>
                </div>

                <div className="text-xs font-bold bg-white px-3.5 py-1.5 rounded-xl border border-pink-200 flex items-center gap-2 text-slate-800 shadow-2xs">
                  <span>Chương VIP:</span>
                  <strong className="text-pink-600 font-mono text-sm">{(chapters || []).filter((c) => c.isVip)?.length || 0}</strong> / {chapters?.length || 0} chương
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3 border-t border-pink-200">
                <div className="flex items-center gap-2">
                  <span className="text-slate-800 text-xs font-semibold whitespace-nowrap">Giá trọn bộ cần chia:</span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={splitPriceInput}
                    onChange={(e) => setSplitPriceInput(parseFloat(e.target.value) || 0)}
                    placeholder="Ví dụ: 50, 85..."
                    className="w-28 bg-white border border-pink-300 focus:border-pink-500 rounded-xl px-3 py-1.5 text-pink-700 font-bold text-xs text-center focus:outline-none"
                  />
                  <span className="text-pink-600 font-bold text-xs">Xu</span>
                </div>

                <button
                  type="button"
                  onClick={handleSplitPriceAcrossVipChapters}
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-98"
                >
                  <Percent className="w-4 h-4" />
                  <span>
                    Chia Đều Cho {((chapters || []).filter((c) => c.isVip)?.length || 0) > 0 ? ((chapters || []).filter((c) => c.isVip)?.length || 0) : 'Tất Cả'} Chương VIP (~{((chapters || []).filter((c) => c.isVip)?.length || 0) > 0 ? (splitPriceInput / ((chapters || []).filter((c) => c.isVip)?.length || 1)).toFixed(2) : (splitPriceInput / Math.max(1, (chapters?.length || 0) - 30)).toFixed(2)} Xu/chương)
                  </span>
                </button>
              </div>
            </div>

            {/* Khung cấu hình GitHub & chọn giọng tạo MP3 (CHỈ HIỆN VỚI ADMIN) */}
            {isAdmin && (
              <div className="space-y-3">
                <AdminGitHubConfigCard defaultCollapsed />
                <div className="px-4 py-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-900 font-semibold">
                    <Headphones className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Audio MP3 GitHub: đã có{' '}
                      <strong className="text-emerald-700">
                        {(chapters || []).filter((c) => Boolean(c.audioUrl && c.audioUrl.trim())).length}/{chapters?.length || 0}
                      </strong>{' '}
                      chương
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                      Giọng tạo MP3:
                    </label>
                    <select
                      value={adminTtsVoiceId}
                      onChange={(e) => setAdminTtsVoiceId(e.target.value)}
                      className="bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-pink-500 cursor-pointer"
                    >
                      {EDGE_TTS_VOICES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.tag})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Toolbar: Search, Select All, Batch Set Price, Batch Delete, Add Chapter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2 flex-1 max-w-md relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Tìm theo số chương hoặc tiêu đề..."
                  className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs hover:bg-slate-50"
                >
                  {(selectedChapterIds?.length || 0) === (filteredChapters?.length || 0) && (filteredChapters?.length || 0) > 0 ? (
                    <CheckSquare className="w-4 h-4 text-pink-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>{(selectedChapterIds?.length || 0) === (filteredChapters?.length || 0) ? 'Bỏ chọn' : 'Chọn tất cả'}</span>
                </button>

                {(selectedChapterIds?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBatchPriceModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Đặt giá Xu ({selectedChapterIds?.length || 0}c)</span>
                  </button>
                )}

                {(selectedChapterIds?.length || 0) > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleHideSelectedChapters(true)}
                      className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm transition"
                      title="Ẩn các chương đã chọn khỏi độc giả"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Ẩn ({selectedChapterIds?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleHideSelectedChapters(false)}
                      className="px-3 py-1.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm transition"
                      title="Hiện lại các chương đã chọn cho độc giả"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Hiện ({selectedChapterIds?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmBatchDelete(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer animate-pulse"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa {selectedChapterIds?.length || 0} chương</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleAddNewChapter}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Thêm Chương Mới</span>
                </button>
              </div>
            </div>

            {/* Chapters Table List */}
            <div className="space-y-2.5">
              {(filteredChapters?.length || 0) === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-300">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Chưa có chương nào hoặc không tìm thấy chương phù hợp.</p>
                </div>
              ) : (
                (filteredChapters || []).map((ch) => {
                  const isChecked = selectedChapterIds.includes(ch.id);
                  return (
                    <div
                      key={ch.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isChecked
                          ? 'bg-pink-50/50 border-pink-400 shadow-2xs'
                          : ch.isHidden
                          ? 'bg-slate-50 border-amber-300/80 shadow-2xs opacity-90'
                          : 'bg-white border-slate-200 hover:border-pink-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectChapter(ch.id)}
                            className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4.5 h-4.5 text-pink-600" />
                            ) : (
                              <Square className="w-4.5 h-4.5 text-slate-400" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm truncate">
                                {ch.title}
                              </span>
                              {ch.isVip ? (
                                <span className="bg-amber-100 text-amber-800 font-extrabold px-2.5 py-0.5 rounded-full text-[10px] border border-amber-300 flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" /> VIP ({Number((typeof ch.priceXu === 'number' ? ch.priceXu : 5).toFixed(2))} Xu)
                                </span>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-300">
                                  Miễn Phí
                                </span>
                              )}
                              {ch.isHidden && (
                                <span className="bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-full text-[10px] border border-amber-400 flex items-center gap-1">
                                  <EyeOff className="w-2.5 h-2.5 text-amber-700" /> Đã ẩn
                                </span>
                              )}
                              {ch.audioUrl && (
                                <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-300 flex items-center gap-1">
                                  <Headphones className="w-2.5 h-2.5 text-emerald-700" /> Đã có MP3
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 font-medium">
                              <span>Chương {ch.number}</span>
                              <span>• {ch.wordCount || ((ch.content || '').split(/\s+/).filter(Boolean)?.length || 0)} từ</span>
                              <span>• Ngày đăng: {ch.publishedDate || 'Mới'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Nút Ẩn / Hiện chương nhanh */}
                          <button
                            type="button"
                            onClick={() => handleToggleHideChapter(ch.id)}
                            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                              ch.isHidden
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                            }`}
                            title={ch.isHidden ? 'Chương này đang ẩn. Bấm để hiển thị lại cho độc giả' : 'Bấm để ẩn chương này khỏi độc giả'}
                          >
                            {ch.isHidden ? <Eye className="w-3.5 h-3.5 text-amber-700" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                            <span className="hidden sm:inline">{ch.isHidden ? 'Hiện' : 'Ẩn'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingChapter({ ...ch });
                              setIsNewChapter(false);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                            title="Sửa nội dung chương"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Sửa</span>
                          </button>

                          <button
                            type="button"
                            disabled={deletingChapterIds.has(ch.id)}
                            onClick={() => handleDeleteSingleChapter(ch.id)}
                            className={`p-1.5 rounded-xl border transition ${
                              deletingChapterIds.has(ch.id)
                                ? 'bg-rose-50 text-rose-400 border-rose-200 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-rose-600 text-slate-500 hover:text-white border-slate-200 cursor-pointer'
                            }`}
                            title={deletingChapterIds.has(ch.id) ? 'Đang xóa...' : 'Xóa chương này'}
                          >
                            {deletingChapterIds.has(ch.id) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {isAdmin && (
                        <AdminChapterMp3Actions
                          novel={novel}
                          chapter={ch}
                          preferredVoiceId={adminTtsVoiceId}
                          onAudioUrlUpdated={(targetChap, nextAudioUrl) => {
                            const updatedChap: Chapter = {
                              ...targetChap,
                              audioUrl: nextAudioUrl,
                            };
                            setChapters((prev) =>
                              (prev || []).map((item) =>
                                item.id === targetChap.id ||
                                Number(item.number) === Number(targetChap.number)
                                  ? { ...item, audioUrl: nextAudioUrl }
                                  : item
                              )
                            );
                            onChapterAudioUpdated?.(novel.id, updatedChap);
                          }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

      </div>

      {/* Modal Xác Nhận Xóa Nhiều Chương Đã Chọn */}
      {confirmBatchDelete && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-rose-200 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center border border-rose-200 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                Xác Nhận Xóa {selectedChapterIds?.length || 0} Chương Đã Chọn?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Bạn có chắc chắn muốn xóa vĩnh viễn <strong className="text-rose-600">{selectedChapterIds?.length || 0} chương</strong> khỏi truyện này không?
              </p>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 text-left">
                ⚠️ Thao tác này sẽ xóa toàn bộ nội dung của các chương được chọn. Độc giả sẽ không còn đọc được các chương này.
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmBatchDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={isDeletingBatch}
                onClick={handleExecuteBatchDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-1.5 transition"
              >
                {isDeletingBatch ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang Xóa Siêu Tốc...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa Ngay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sửa Từng Chương (Chapter Editor) */}
      {editingChapter && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in zoom-in-95 text-slate-900">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-pink-600" />
                {isNewChapter ? 'Thêm Chương Mới' : `Sửa Chương ${editingChapter.number}`}
              </h3>

              <button
                type="button"
                onClick={() => setEditingChapter(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveChapterEdit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-white text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-900 font-bold mb-1 text-xs">
                    Số thứ tự chương:
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingChapter.number}
                    onChange={(e) =>
                      setEditingChapter({ ...editingChapter, number: Number(e.target.value) })
                    }
                    className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-slate-900 font-bold focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-slate-900 font-bold mb-1 text-xs">
                    Tiêu đề chương *:
                  </label>
                  <input
                    type="text"
                    required
                    value={editingChapter.title}
                    onChange={(e) =>
                      setEditingChapter({ ...editingChapter, title: e.target.value })
                    }
                    placeholder="Ví dụ: Chương 1: Khởi đầu định mệnh..."
                    className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* VIP Configuration with Decimal / Fractional Xu support */}
              <div className="p-3.5 rounded-2xl bg-pink-50/60 border border-pink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editingChapter.isVip}
                    onChange={(e) =>
                      setEditingChapter({
                        ...editingChapter,
                        isVip: e.target.checked,
                        priceXu: e.target.checked ? (editingChapter.priceXu ?? 5) : 0,
                      })
                    }
                    className="w-4 h-4 accent-pink-600 rounded"
                  />
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <Lock className="w-3.5 h-3.5 text-pink-600" />
                    Đặt làm Chương VIP (Yêu cầu độc giả mở khóa bằng Xu)
                  </span>
                </label>

                {editingChapter.isVip && (
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-pink-300">
                    <span className="text-slate-700 font-semibold text-xs">Giá Xu:</span>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={editingChapter.priceXu ?? 5}
                      onChange={(e) =>
                        setEditingChapter({ ...editingChapter, priceXu: parseFloat(e.target.value) || 0 })
                      }
                      placeholder="0.01 hay 0.35..."
                      className="w-24 bg-white border border-pink-400 text-pink-700 font-bold rounded-lg p-1.5 text-center focus:outline-none text-xs"
                    />
                    <span className="text-pink-600 font-bold text-xs">Xu</span>
                  </div>
                )}
              </div>

              {/* Content Editor */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-900 font-bold text-xs">
                    Nội Dung Chi Tiết Của Chương *:
                  </label>
                  <span className="text-xs text-pink-600 font-bold">
                    {(editingChapter.content || '').split(/\s+/).filter(Boolean)?.length || 0} từ
                  </span>
                </div>
                <textarea
                  rows={12}
                  required
                  value={editingChapter.content}
                  onChange={(e) =>
                    setEditingChapter({ ...editingChapter, content: e.target.value })
                  }
                  placeholder="Dán hoặc nhập toàn bộ nội dung văn bản của chương vào đây..."
                  className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-2xl p-4 text-slate-900 leading-relaxed text-xs sm:text-sm focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingChapter(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu Chương Này</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Đặt Giá Xu Hàng Loạt Cho Các Chương Đã Chọn */}
      {showBatchPriceModal && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-amber-200 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 text-slate-900">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200 mx-auto">
              <Coins className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900">
                Đặt Giá Xu Cho {selectedChapterIds?.length || 0} Chương Đã Chọn
              </h3>
              <p className="text-xs text-slate-600">
                Nhập số Xu mong muốn. Hệ thống hỗ trợ cả số Xu lẻ như <strong className="text-amber-700">0,01</strong> hay <strong className="text-amber-700">0,35</strong> Xu.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Số Xu cho mỗi chương:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={batchPriceInput}
                  onChange={(e) => setBatchPriceInput(e.target.value)}
                  placeholder="0.01 hay 0.35 hay 5..."
                  className="flex-1 bg-white border border-amber-400 rounded-xl p-2.5 text-slate-900 font-bold text-sm focus:outline-none"
                />
                <span className="font-bold text-amber-700 text-sm">Xu</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] text-slate-500">Gợi ý nhanh:</span>
                {['0.01', '0.05', '0.1', '0.35', '0.5', '1', '2', '5'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBatchPriceInput(val)}
                    className="px-2 py-0.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-[10px] text-amber-800 font-bold cursor-pointer"
                  >
                    {val} Xu
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchPriceModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleApplyBatchPrice}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Áp Dụng Ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteChapter && (
        <div className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-rose-100 space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              Xác Nhận Xóa Chương
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa <strong>Chương {confirmDeleteChapter.number}: {confirmDeleteChapter.title}</strong> không? (Nhớ bấm <strong>Lưu Thay Đổi</strong> sau khi xóa để cập nhật lên hệ thống).
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteChapter(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => executeDeleteSingleChapter(confirmDeleteChapter.id)}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition"
              >
                Xóa Chương
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
