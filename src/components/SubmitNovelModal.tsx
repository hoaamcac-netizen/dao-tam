import React, { useState, useRef, useMemo, useEffect } from 'react';
import { MainCategory, UserProfile, Novel, SubmissionChapterDraft, GenreItem, StoryRole } from '../types';
import { checkIsAdmin, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { 
  X, 
  Upload, 
  CheckCircle2, 
  Plus, 
  Sparkles, 
  Calendar, 
  Clock, 
  Layers, 
  Info,
  BookOpen,
  Image as ImageIcon,
  Building,
  Search,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Lock,
  FileText,
  Youtube
} from 'lucide-react';
import { extractYouTubeVideoId } from '../utils/youtube';

interface SubmitNovelModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  onClose: () => void;
  user: UserProfile;
  genres: GenreItem[];
  onAddNewGenre?: (name: string) => void;
  onDeleteGenre?: (name: string) => void;
  onSubmitForApproval?: (submission: {
    title: string;
    author: string;
    editor?: string;
    publisherRoles: StoryRole[];
    isExclusive?: boolean;
    royaltyRate?: number;
    mainCategory: MainCategory;
    categories: string[];
    description: string;
    coverImage: string;
    chapters?: SubmissionChapterDraft[];
    totalExpectedChapters?: number;
    isOriginal?: boolean;
    isShortStory?: boolean;
    youtubeVideoId?: string;
    isYoutubeVipLocked?: boolean;
    isSensitive?: boolean;
    status?: 'Hoàn thành' | 'Đang ra';
    scheduledPublishAt?: number;
    bankInfo?: {
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    };
    isCreatorApplication?: boolean;
  }) => void;
  onDirectPublishByAdmin?: (newNovel: Novel) => void;
}

// 60 thể loại phổ biến và phong phú theo đúng ảnh mẫu giao diện
const DEFAULT_GENRE_OPTIONS = [
  'ABO', 'BE', 'Chủ công', 'Chủ thụ', 'Chữa Lành', 'Cổ Đại', 
  'Cung Đấu', 'Cưới Trước Yêu Sau', 'Cường Thủ Hào Đoạt', 'Dị Năng', 
  'Dưỡng Thành', 'Điền Văn', 'Đô Thị', 'Đoản Văn', 'Độc Tâm', 
  'Giả Thây', 'Gia Đình', 'Hài Hước', 'Hành Động', 'Hào Môn Thế Gia', 
  'HE', 'Hệ Thống', 'Hiện Đại', 'Hoán Đổi Thân Xác', 'Học Đường', 
  'Hư Cấu Kỳ Ảo', 'Huyền Huyễn', 'Kinh Dị', 'Linh Dị', 'Mạt Thế', 
  'Ngọt', 'Ngược Luyến Tàn Tâm', 'Nhân Thú', 'Niên Đại', 'OE', 
  'Phép Thuật', 'Phiêu Lưu', 'Phương Đông', 'Phương Tây', 'Quỷ Tắc', 
  'Sáng Văn', 'SE', 'Showbiz', 'Sủng', 'Thanh Xuân Vườn Trường', 
  'Tiên Hiệp', 'Tiểu Thuyết', 'Tổng Tài', 'Trinh Thám', 'Trọng Sinh', 
  'Truy Thê', 'Vô Năng', 'Vô Tri', 'Xuyên Không', 'Xuyên Nhanh'
];

export const SubmitNovelModal: React.FC<SubmitNovelModalProps> = ({
  isOpen,
  isPageView = false,
  onClose,
  user,
  genres,
  onAddNewGenre,
  onDeleteGenre,
  onSubmitForApproval,
  onDirectPublishByAdmin,
}) => {
  const isAdmin = user?.role === 'admin' || checkIsAdmin(user?.email);
  const isApprovedCreator = Boolean(
    isAdmin ||
    user?.role === 'admin' ||
    user?.role === 'author' ||
    (user?.role as string) === 'editor' ||
    (user as any)?.isApprovedAuthor ||
    (user as any)?.creatorApproved
  );

  // Real-time check isBanned status from collection users
  const [isBanned, setIsBanned] = useState<boolean>(Boolean(user?.isBanned));
  const [isCheckingBan, setIsCheckingBan] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !user?.id) {
      setIsCheckingBan(false);
      return;
    }
    let isMounted = true;
    const verifyBan = async () => {
      try {
        const userRef = doc(db, 'users', user.id);
        const snap = await getDoc(userRef);
        if (snap.exists() && isMounted) {
          const data = snap.data() || {};
          setIsBanned(Boolean(data?.isBanned));
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra trạng thái khóa user:', err);
      } finally {
        if (isMounted) setIsCheckingBan(false);
      }
    };
    verifyBan();
    return () => { isMounted = false; };
  }, [isOpen, user?.id]);

  // Left Column States: Thông tin truyện & Editor
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState<string>('');
  const [editor, setEditor] = useState<string>(() => {
    return user?.displayName && user.displayName !== 'Khách Độc Truyện' ? user.displayName : '';
  });
  const [publisherRoles, setPublisherRoles] = useState<StoryRole[]>(['editor']);
  const [source, setSource] = useState<string>('');
  const [isExclusive, setIsExclusive] = useState<boolean>(false);
  const [isOriginal, setIsOriginal] = useState(false); // Toggle Truyện sáng tác
  const [isShortStory, setIsShortStory] = useState<boolean>(false); // Toggle Truyện ngắn / đoản văn
  const [youtubeUrlInput, setYoutubeUrlInput] = useState<string>('');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string>('');
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [isYoutubeVipLocked, setIsYoutubeVipLocked] = useState<boolean>(false);
  const [description, setDescription] = useState('');
  const [isCompleted, setIsCompleted] = useState(false); // Toggle Đã bộ / Hoàn thành
  const [coverImage, setCoverImage] = useState<string>('');
  const [coverFileName, setCoverFileName] = useState<string>('');
  const [coverUrlInput, setCoverUrlInput] = useState<string>('');
  const [isSensitive, setIsSensitive] = useState(false);

  // Bank Info cho nhận nhuận bút Editor / Tác giả
  const [bankName, setBankName] = useState(user?.bankInfo?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(user?.bankInfo?.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState(user?.bankInfo?.accountHolder || user?.displayName || '');

  // Right Column States: Thể loại không chọn cố định, hỗ trợ tìm kiếm & xóa
  const [mainCategory, setMainCategory] = useState<MainCategory>('dam-my');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreSearchQuery, setGenreSearchQuery] = useState('');
  const [deletedGenres, setDeletedGenres] = useState<string[]>([]);
  const [customGenreInput, setCustomGenreInput] = useState('');
  const [scheduledPublishAt, setScheduledPublishAt] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 5 Chương bản thảo thẩm định (bắt buộc cho lần đầu gửi duyệt)
  const [chapters, setChapters] = useState<SubmissionChapterDraft[]>([]);
  const [manuscriptText, setManuscriptText] = useState<string>('');

  // Tính số đoạn (Paragraphs) và số từ (Words) của Mô tả truyện
  const { paragraphsCount, wordsCount } = useMemo(() => {
    if (!description.trim()) return { paragraphsCount: 0, wordsCount: 0 };
    const paragraphs = description.split(/\n+/).filter((p) => (p.trim()?.length || 0) > 0);
    const words = description.trim().split(/\s+/).filter(Boolean);
    return {
      paragraphsCount: paragraphs?.length || 0,
      wordsCount: words?.length || 0,
    };
  }, [description]);

  // Hợp nhất danh sách thể loại từ props và mặc định, lọc bỏ các thể loại admin đã xóa
  const allGenreList = useMemo(() => {
    const customNames = (Array.isArray(genres) ? genres : []).map((g) => g?.name).filter(Boolean);
    const combined = Array.from(new Set([...DEFAULT_GENRE_OPTIONS, ...customNames]))
      .filter((g) => !(deletedGenres || []).includes(g));
    return combined.sort((a, b) => a.localeCompare(b, 'vi'));
  }, [genres, deletedGenres]);

  // Danh sách thể loại được lọc theo ô tìm kiếm
  const filteredGenreList = useMemo(() => {
    if (!genreSearchQuery.trim()) return allGenreList || [];
    const q = genreSearchQuery.toLowerCase().trim();
    return (allGenreList || []).filter((g) => g.toLowerCase().includes(q));
  }, [allGenreList, genreSearchQuery]);

  if (!isOpen) return null;

  // Xử lý tải ảnh bìa từ máy
  const handleCoverFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
      return;
    }

    setCoverFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      if (!rawData) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 500;
        const maxH = 750;
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
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setCoverImage(compressed);
        } else {
          setCoverImage(rawData);
        }
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  const handleToggleGenre = (genreName: string) => {
    const safe = Array.isArray(selectedGenres) ? selectedGenres : [];
    if (safe.includes(genreName)) {
      setSelectedGenres(safe.filter((g) => g !== genreName));
    } else {
      setSelectedGenres([...safe, genreName]);
    }
  };

  const handleDeleteGenre = (genreName: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa thể loại "${genreName}" khỏi danh sách?`)) {
      setDeletedGenres((prev) => [...(Array.isArray(prev) ? prev : []), genreName]);
      setSelectedGenres((prev) => (Array.isArray(prev) ? prev : []).filter((g) => g !== genreName));
      if (onDeleteGenre) onDeleteGenre(genreName);
    }
  };

  const handleAddCustomGenre = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customGenreInput.trim();
    if (!trimmed) return;
    if (onAddNewGenre) onAddNewGenre(trimmed);
    const safe = Array.isArray(selectedGenres) ? selectedGenres : [];
    if (!safe.includes(trimmed)) {
      setSelectedGenres([...safe, trimmed]);
    }
    setCustomGenreInput('');
  };

  // Tự động nhận diện chia 5 chương từ văn bản
  const handleParseManuscript = () => {
    if (!manuscriptText.trim()) return;
    const regex = /(?:^|\n)\s*(?:Chương|Hồi|Chapter)\s*(\d+|[0-9]+|[IVXLCDM]+)[\s:.-]*(.*?)(?=\n|$)/gi;
    const matches = [...manuscriptText.matchAll(regex)];

    if ((matches?.length || 0) > 0) {
      const list: SubmissionChapterDraft[] = [];
      for (let i = 0; i < (matches?.length || 0); i++) {
        const match = matches[i];
        const matchIndex = match?.index ?? 0;
        const chapterNum = parseInt(match?.[1], 10) || (i + 1);
        const subTitle = match?.[2]?.trim();
        const chTitle = subTitle ? `Chương ${chapterNum}: ${subTitle}` : `Chương ${chapterNum}`;

        const headerEnd = matchIndex + (match?.[0]?.length || 0);
        const nextIndex = i < (matches?.length || 0) - 1 ? (matches[i + 1]?.index ?? manuscriptText.length) : manuscriptText.length;
        const content = manuscriptText.slice(headerEnd, nextIndex).trim();

        list.push({
          number: chapterNum,
          title: chTitle,
          content: content || 'Nội dung đang cập nhật...',
          wordCount: content.split(/\s+/).filter(Boolean)?.length || 0,
        });
      }
      setChapters(list);
      setSubmitError(null);
    } else {
      setSubmitError('Không tìm thấy định dạng tiêu đề chương (ví dụ: "Chương 1", "Chương 2"...).');
    }
  };

  // Submit Handler: Bắt buộc tối thiểu 5 chương cho lần đầu gửi duyệt, awaited promises, pending status
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError('Vui lòng nhập Tên truyện.');
      return;
    }

    if (!author.trim()) {
      setSubmitError('Vui lòng nhập Tên tác giả.');
      return;
    }

    if (!description.trim()) {
      setSubmitError('Vui lòng nhập Mô tả truyện.');
      return;
    }

    const finalCover = coverImage || coverUrlInput.trim() || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

    let finalYoutubeVideoId = '';
    if (isShortStory && youtubeUrlInput.trim()) {
      const ytRes = extractYouTubeVideoId(youtubeUrlInput);
      if (!ytRes.videoId) {
        const msg = ytRes.error || 'Link YouTube không hợp lệ.';
        setYoutubeError(msg);
        setSubmitError(msg);
        return;
      }
      finalYoutubeVideoId = ytRes.videoId;
    }

    let scheduledTimestamp: number | undefined = undefined;
    if (scheduledPublishAt) {
      const parsedTime = new Date(scheduledPublishAt).getTime();
      if (!isNaN(parsedTime) && parsedTime > Date.now()) {
        scheduledTimestamp = parsedTime;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const slug = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');

      const novelId = `novel-${Date.now()}`;

      const newNovel: Novel = {
        id: novelId,
        title: title.trim(),
        slug: `${slug}-${novelId}`,
        author: author.trim(),
        editor: editor.trim() || user.displayName,
        publisherRoles: (publisherRoles?.length || 0) > 0 ? publisherRoles : ['editor'],
        isExclusive,
        royaltyRate: (publisherRoles || []).includes('author') || isOriginal ? 0.95 : (isExclusive ? 0.90 : 0.70),
        coverImage: finalCover,
        mainCategory,
        isOriginal,
        isShortStory,
        youtubeVideoId: isShortStory ? finalYoutubeVideoId : '',
        isYoutubeVipLocked: isShortStory ? isYoutubeVipLocked : false,
        isSensitive,
        status: isCompleted ? 'Hoàn thành' : 'Đang ra',
        publishStatus: 'published',
        isHot: false,
        totalChapters: chapters?.length || 0,
        views: 0,
        dailyViews: 0,
        rating: 5.0,
        categories: selectedGenres,
        description: description.trim(),
        translator: editor.trim() || user.displayName,
        updatedAt: Date.now(),
        lastChapterUpdatedAt: Date.now(),
        lastUpdated: 'Vừa đăng',
        hasAudio: false,
        fullBookPriceXu: 0,
        fullBookDiscountPriceXu: 0,
        chapters: chapters as any,
        submittedBy: {
          userId: user.id || 'creator',
          userName: user.displayName || author.trim(),
          userEmail: user.email || '',
        },
      };

      (newNovel as any).authorId = user.id;
      (newNovel as any).authorEmail = user.email;

      // ĐỢI FIREBASE XÁC NHẬN (AWAITED PROMISES)
      if (onDirectPublishByAdmin && isAdmin) {
        await onDirectPublishByAdmin(newNovel);
        setSaveSuccessNotice(`🎉 Đã đăng truyện "${title.trim()}" thành công! Tác phẩm đã được xuất bản.`);
      } else if (onSubmitForApproval) {
        await onSubmitForApproval({
          title: title.trim(),
          author: author.trim(),
          editor: editor.trim() || user.displayName,
          publisherRoles: (publisherRoles?.length || 0) > 0 ? publisherRoles : ['editor'],
          isExclusive,
          royaltyRate: (publisherRoles || []).includes('author') || isOriginal ? 0.95 : (isExclusive ? 0.90 : 0.70),
          mainCategory,
          categories: selectedGenres,
          description: description.trim(),
          coverImage: finalCover,
          chapters,
          totalExpectedChapters: 100,
          isOriginal,
          isShortStory,
          youtubeVideoId: isShortStory ? finalYoutubeVideoId : '',
          isYoutubeVipLocked: isShortStory ? isYoutubeVipLocked : false,
          isSensitive,
          status: isCompleted ? 'Hoàn thành' : 'Đang ra',
          scheduledPublishAt: scheduledTimestamp,
          bankInfo: user?.bankInfo ? {
            bankName: user.bankInfo.bankName || '',
            accountNumber: user.bankInfo.accountNumber || '',
            accountHolder: user.bankInfo.accountHolder || '',
          } : undefined,
          isCreatorApplication: false,
        });

        // CHỈ KHI FIREBASE TRẢ VỀ THÀNH CÔNG: Mới hiển thị thông báo & xóa form (reset state)
        setSaveSuccessNotice('🎉 Gửi duyệt thành công! Tác phẩm của bạn đã được chuyển đến Ban Quản Trị.');
        setTitle('');
        setAuthor('');
        setDescription('');
        setCoverImage('');
        setCoverUrlInput('');
        setChapters([]);
        setManuscriptText('');
        setIsShortStory(false);
        setYoutubeUrlInput('');
        setYoutubeVideoId('');
        setYoutubeError(null);
        setIsYoutubeVipLocked(false);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      // BẮT LỖI FIREBASE VÀO BLOCK CATCH & HIỆN CẢNH BÁO NỀN MÀU VÀNG
      console.error('Lỗi khi đăng truyện:', err);
      setSubmitError(err?.message || 'Có lỗi xảy ra khi gửi dữ liệu lên hệ thống. Vui lòng kiểm tra lại mạng và thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const innerContent = (
    <div className={`w-full ${isPageView ? 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800' : 'max-w-6xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 my-auto max-h-[96vh]'} overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200`}>
      
      {/* Top Header / Breadcrumbs */}
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Trang chủ</span>
            <span>&gt;</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">Thêm truyện mới</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-pink-600 dark:text-pink-400 dark:stroke-pink-400" />
              <span>Thêm truyện mới</span>
            </h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-pink-50 dark:bg-pink-100 text-pink-700 dark:text-black border border-pink-200 dark:border-pink-300 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-pink-600 dark:text-black" />
              <span>Khu vực đăng truyện dành cho Tác Giả &amp; Editor / Người Dịch</span>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-full transition cursor-pointer"
          title="Đóng cửa sổ"
        >
          <X className="w-5 h-5 dark:text-white dark:stroke-white" />
        </button>
      </div>

      {/* NẾU USER BỊ KHÓA: CHẶN HOÀN TOÀN VIỆC RENDER FORM & HIỆN BANNER CẢNH BÁO MÀU VÀNG LỚN */}
      {isBanned ? (
        <div className="flex-1 overflow-y-auto p-6 sm:p-12 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-yellow-400 text-yellow-950 flex items-center justify-center shadow-lg border-2 border-yellow-500">
            <AlertTriangle className="w-10 h-10" />
          </div>

          <div className="max-w-2xl w-full p-6 sm:p-8 rounded-3xl bg-yellow-400 text-yellow-950 border-2 border-yellow-500 shadow-xl space-y-3">
            <h3 className="font-black text-lg sm:text-xl flex items-center justify-center gap-2">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <span>THÔNG BÁO TỪ BAN QUẢN TRỊ ĐẠO TÂM</span>
            </h3>
            <p className="text-base sm:text-lg font-bold leading-relaxed">
              Tài khoản của bạn đã bị khóa tính năng đăng truyện do vi phạm chính sách của Dao Tâm. Vui lòng liên hệ Admin.
            </p>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            Mọi thắc mắc hoặc đề nghị xem xét lại tài khoản, vui lòng gửi phản hồi đến Ban Quản Trị Đạo Tâm qua hệ thống liên hệ hỗ trợ.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
          >
            Đóng cửa sổ
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto p-6">
          
          {/* 3 MỤC CHÍNH RIÊNG BIỆT: Truyện nam, truyện nữ, đam mỹ */}
          <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2.5">
              Phân mục chính của tác phẩm <span className="text-rose-500">*</span>:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setMainCategory('truyen-nam')}
                className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                  mainCategory === 'truyen-nam'
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300 dark:bg-pink-600 dark:text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                }`}
              >
                <span>⚔️</span>
                <span className={mainCategory === 'truyen-nam' ? 'text-white' : 'dark:text-slate-200'}>Truyện Nam</span>
              </button>

              <button
                type="button"
                onClick={() => setMainCategory('truyen-nu')}
                className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                  mainCategory === 'truyen-nu'
                    ? 'bg-pink-600 text-white shadow-md ring-2 ring-pink-300 dark:bg-pink-600 dark:text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-pink-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                }`}
              >
                <span>🌸</span>
                <span className={mainCategory === 'truyen-nu' ? 'text-white' : 'dark:text-slate-200'}>Truyện Nữ</span>
              </button>

              <button
                type="button"
                onClick={() => setMainCategory('dam-my')}
                className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                  mainCategory === 'dam-my'
                    ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-300 dark:bg-pink-600 dark:text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-purple-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                }`}
              >
                <span>💜</span>
                <span className={mainCategory === 'dam-my' ? 'text-white' : 'dark:text-slate-200'}>Đam Mỹ</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* ==========================================
                CỘT TRÁI (LEFT COLUMN - 7 COLS)
               ========================================== */}
            <div className="lg:col-span-7 space-y-5">
              
              {/* Tên truyện */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Tên truyện <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nhập tên truyện"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                  required
                />
              </div>

              {/* Tác giả & Editor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    Tác giả (Nguyên tác) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Tên tác giả nguyên tác"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                    <span>Editor / Người dịch <span className="text-rose-500">*</span></span>
                    <span className="text-[11px] text-pink-600 dark:text-pink-400 font-normal">Bút danh biên tập</span>
                  </label>
                  <input
                    type="text"
                    value={editor}
                    onChange={(e) => setEditor(e.target.value)}
                    placeholder="Tên Editor / Người biên tập"
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                    required
                  />
                </div>
              </div>

              {/* Vai trò của người đăng (Tác giả, Editor, Dịch giả) */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
                  Vai trò của bạn đối với tác phẩm này:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'editor', label: 'Editor (Biên tập)' },
                    { id: 'author', label: 'Tác giả sáng tác' },
                    { id: 'translator', label: 'Dịch giả' },
                  ].map((role) => {
                    const isChecked = (publisherRoles || []).includes(role.id as StoryRole);
                    return (
                      <label
                        key={role.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-semibold cursor-pointer transition select-none ${
                          isChecked
                            ? 'bg-pink-50 border-pink-400 text-pink-700 ring-1 ring-pink-300 dark:text-black dark:border-pink-500 dark:ring-pink-400'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const safeRoles = Array.isArray(publisherRoles) ? publisherRoles : [];
                            if (e.target.checked) {
                              setPublisherRoles([...safeRoles, role.id as StoryRole]);
                            } else {
                              if ((safeRoles?.length || 0) > 1) {
                                setPublisherRoles(safeRoles.filter((r) => r !== role.id));
                              }
                            }
                          }}
                          className="w-3.5 h-3.5 text-pink-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:stroke-white focus:ring-pink-500 cursor-pointer"
                        />
                        <span className={isChecked ? 'font-semibold dark:text-black' : 'dark:text-slate-200 font-medium'}>{role.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Nguồn truyện & Độc quyền */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    Nguồn truyện / Nhượng quyền
                  </label>
                  <input
                    type="text"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Ví dụ: Tấn Giang, Qidian, Tự sáng tác..."
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Đăng độc quyền</span>
                      <p className="text-[11px] text-pink-600 dark:text-pink-400 font-semibold">
                        {publisherRoles.includes('author') || isOriginal ? '95% cho Tác giả sáng tác' : (isExclusive ? '90% cho Editor độc quyền' : '70% cho Editor (bật để nhận 90%)')}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isExclusive}
                        onChange={(e) => setIsExclusive(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 dark:border dark:border-white peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Toggle Truyện sáng tác */}
              <div className="flex items-center justify-between py-2 border-y border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Truyện sáng tác</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Đánh dấu tác phẩm do chính bạn sáng tác</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOriginal}
                    onChange={(e) => setIsOriginal(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 dark:border dark:border-white peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              {/* Toggle Truyện Ngắn */}
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Truyện Ngắn</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Đánh dấu nếu đây là truyện ngắn/đoản văn</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isShortStory}
                    onChange={(e) => setIsShortStory(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 dark:border dark:border-white peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                </label>
              </div>

              {isShortStory && (
                <div className="p-4 rounded-xl bg-rose-50/70 dark:bg-slate-800/80 border border-rose-200 dark:border-rose-900/60 space-y-3">
                  <div className="flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      Audio / Video YouTube cho Truyện Ngắn
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                      Link chia sẻ YouTube (hỗ trợ mọi định dạng link YouTube)
                    </label>
                    <input
                      type="text"
                      value={youtubeUrlInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setYoutubeUrlInput(val);
                        if (!val.trim()) {
                          setYoutubeVideoId('');
                          setYoutubeError(null);
                          return;
                        }
                        const res = extractYouTubeVideoId(val);
                        if (res.videoId) {
                          setYoutubeVideoId(res.videoId);
                          setYoutubeError(null);
                        } else {
                          setYoutubeVideoId('');
                          setYoutubeError(res.error || 'Link YouTube không hợp lệ.');
                        }
                      }}
                      placeholder="https://youtu.be/... hoặc https://www.youtube.com/watch?v=..."
                      className="w-full min-h-[44px] px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
                    />
                    {youtubeVideoId && !youtubeError && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Đã nhận diện Video ID: {youtubeVideoId}</span>
                      </div>
                    )}
                    {youtubeError && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{youtubeError}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-rose-200/70 dark:border-slate-700">
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 block">
                        Khóa VIP Audio YouTube
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Mặc định TẮT (miễn phí cho mọi người nghe vì có quảng cáo YouTube; có thể gạt BẬT để khóa VIP)
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isYoutubeVipLocked}
                        onChange={(e) => setIsYoutubeVipLocked(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                    </label>
                  </div>
                </div>
              )}

              {/* Mô tả truyện */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Mô tả truyện <span className="text-rose-500">*</span>
                </label>
                <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition">
                  <textarea
                    rows={8}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Nhập nội dung văn án, tóm tắt truyện..."
                    className="w-full p-3.5 bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none resize-y min-h-[160px]"
                    required
                  />
                  {/* Live Word & Paragraph Counter */}
                  <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-right text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Paragraphs: <span className="font-semibold text-slate-700 dark:text-slate-300">{paragraphsCount}</span>, Words: <span className="font-semibold text-slate-700 dark:text-slate-300">{wordsCount}</span>
                  </div>
                </div>
              </div>

              {/* Toggle Đã bộ / Hoàn thành */}
              <div className="flex items-center justify-between py-2 border-y border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Đã bộ</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Bật nếu truyện đã hoàn thành toàn bộ nội dung</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={(e) => setIsCompleted(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 dark:border dark:border-white peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              {/* Ảnh bìa */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Ảnh bìa
                </label>
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleCoverFileUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-white transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-700 dark:text-white dark:stroke-white" />
                        <span>Chọn tệp</span>
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                        {coverFileName || 'Chưa có tệp nào được chọn'}
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="url"
                        value={coverUrlInput}
                        onChange={(e) => setCoverUrlInput(e.target.value)}
                        placeholder="Hoặc dán link ảnh bìa (URL https://...)"
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>

                  {(coverImage?.trim() || coverUrlInput?.trim()) && (
                    <div className="w-16 h-24 rounded-lg overflow-hidden border border-slate-200 shadow-sm flex-shrink-0 bg-slate-50">
                      <img
                        src={(coverImage?.trim() || coverUrlInput?.trim())!}
                        alt="Bìa truyện"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ==========================================
                CỘT PHẢI (RIGHT COLUMN - 5 COLS)
               ========================================== */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Danh mục chính (3 Radio Buttons) */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mb-3">
                  Danh mục chính <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'dam-my', label: 'Đam Mỹ' },
                    { id: 'truyen-nam', label: 'Truyện Nam' },
                    { id: 'truyen-nu', label: 'Truyện Nữ' },
                  ].map((cat) => {
                    const isChecked = mainCategory === cat.id;
                    return (
                      <label
                        key={cat.id}
                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition select-none ${
                          isChecked
                            ? 'bg-blue-50 border-pink-500 text-pink-700 ring-1 ring-pink-400 dark:text-black dark:border-pink-500 dark:ring-pink-400'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="mainCategory"
                          value={cat.id}
                          checked={isChecked}
                          onChange={() => setMainCategory(cat.id as MainCategory)}
                          className="w-3.5 h-3.5 text-pink-600 focus:ring-pink-400 border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white cursor-pointer"
                        />
                        <span className={isChecked ? 'font-semibold dark:text-black' : 'dark:text-slate-200 font-medium'}>{cat.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Thể loại: Hiển thị toàn bộ, có thanh tìm kiếm, nút xóa cho Admin, không kéo cuộn */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Thể loại ({selectedGenres?.length || 0})
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {filteredGenreList?.length || 0} thể loại khả dụng • Chọn nhiều thể loại
                  </span>
                </div>

                {/* Thanh tìm kiếm thể loại truyện sau danh mục chính */}
                <div className="relative mb-3">
                  <input
                    type="text"
                    value={genreSearchQuery}
                    onChange={(e) => setGenreSearchQuery(e.target.value)}
                    placeholder="🔍 Tìm kiếm nhanh thể loại truyện..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-300 transition"
                  />
                  {genreSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setGenreSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-white dark:hover:text-pink-300 text-xs cursor-pointer p-0.5"
                      title="Xóa tìm kiếm"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Toàn bộ thể loại hiển thị hết (không còn max-h-64 kéo lên kéo xuống) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2.5 gap-y-1.5 text-xs">
                  {(filteredGenreList || []).map((gName) => {
                    const isChecked = (selectedGenres || []).includes(gName);
                    return (
                      <div
                        key={gName}
                        className={`flex items-center justify-between gap-1 p-1.5 rounded-lg border transition select-none ${
                          isChecked 
                            ? 'bg-pink-50 border-pink-400 text-pink-700 font-semibold ring-1 ring-pink-300 dark:text-black dark:border-pink-500 dark:ring-pink-400' 
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <label className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleGenre(gName)}
                            className="w-3.5 h-3.5 text-pink-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:stroke-white focus:ring-pink-500 flex-shrink-0 cursor-pointer"
                          />
                          <span className={`truncate text-[11px] ${isChecked ? 'font-semibold dark:text-black' : 'dark:text-slate-200 font-medium'}`} title={gName}>{gName}</span>
                        </label>

                        {/* Nút xóa thể loại cho Admin */}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGenre(gName);
                            }}
                            title={`Xóa thể loại "${gName}" (Dành cho Admin)`}
                            className={`p-1 rounded transition cursor-pointer flex-shrink-0 ${
                              isChecked
                                ? 'text-pink-600 hover:bg-pink-100 dark:text-slate-400 dark:hover:bg-slate-700'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-100/70 dark:text-slate-400 dark:hover:bg-slate-700'
                            }`}
                          >
                            <Trash2 className="w-3 h-3 text-rose-500 dark:text-slate-400 dark:stroke-slate-400" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {(filteredGenreList?.length || 0) === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-400 text-center py-3">
                    Không tìm thấy thể loại phù hợp với từ khóa "{genreSearchQuery}".
                  </p>
                )}

                {/* Thêm thể loại tùy chỉnh */}
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customGenreInput}
                      onChange={(e) => setCustomGenreInput(e.target.value)}
                      placeholder="Thêm thể loại khác..."
                      className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomGenre}
                      className="px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 text-white dark:text-white dark:stroke-white" />
                      <span>Thêm</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Hẹn giờ phát hành (Scheduled Publish) */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-600 dark:text-white dark:stroke-white" />
                  <span>Hẹn Giờ Xuất Bản Tự Động (Tùy chọn)</span>
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Nếu để trống, truyện sẽ được đăng ngay lập tức. Nếu đặt ngày giờ tương lai, truyện sẽ tự động hiển thị cho độc giả đúng thời điểm.
                </p>
                <input
                  type="datetime-local"
                  value={scheduledPublishAt}
                  onChange={(e) => setScheduledPublishAt(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* CẢNH BÁO NỀN MÀU VÀNG KHI ĐANG XỬ LÝ HOẶC GẶP LỖI */}
              {isSubmitting && (
                <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 font-bold flex items-center gap-3 shadow-md animate-pulse">
                  <div className="w-5 h-5 border-2 border-amber-700 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm font-black">⚡ Đang xử lý và lưu dữ liệu lên máy chủ...</p>
                    <p className="text-[11px] text-amber-800 font-normal">Hệ thống đang thực hiện luồng ghi gộp an toàn (WriteBatch). Vui lòng không nhấn nút liên tục.</p>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="p-4 rounded-xl bg-amber-100 border-2 border-amber-500 text-amber-950 font-bold flex items-start gap-3 shadow-md">
                  <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm font-black">Cảnh báo / Lỗi xử lý:</p>
                    <p className="text-xs text-amber-900 font-medium mt-0.5">{submitError}</p>
                  </div>
                </div>
              )}

              {saveSuccessNotice && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs sm:text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <span>{saveSuccessNotice}</span>
                </div>
              )}

              {/* Nút hành động */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-700 hover:to-rose-700 shadow-lg shadow-pink-500/25 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Đang lưu lên hệ thống (vui lòng đợi)...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-white dark:text-white dark:stroke-white" />
                      <span>Đăng Truyện &amp; Tự Động Duyệt Ngay</span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        </form>
      )}
    </div>
  );

  if (isPageView) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-900 dark:text-slate-100 animate-in fade-in duration-200">
        <div className="mb-4">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-pink-600 hover:text-pink-700 dark:text-black bg-pink-50 dark:bg-pink-100 border border-pink-200 dark:border-pink-300 px-3.5 py-1.5 rounded-xl cursor-pointer transition shadow-xs"
          >
            <span>&larr; Quay lại trang trước</span>
          </button>
        </div>
        {innerContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {innerContent}
    </div>
  );
};
