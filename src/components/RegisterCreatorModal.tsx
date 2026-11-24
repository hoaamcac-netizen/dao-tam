import React, { useState, useRef, useMemo } from 'react';
import { MainCategory, UserProfile, SubmissionChapterDraft, GenreItem, StoryRole, NovelSubmission } from '../types';
import { 
  X, 
  BookPlus, 
  CheckCircle2, 
  FileText,
  Image as ImageIcon,
  FileUp,
  PenTool,
  Scissors,
  Info,
  Check,
  Plus,
  Sparkles,
  Layers
} from 'lucide-react';
import { DbCategory } from '../firebase/services';

interface RegisterCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  genres: (GenreItem | DbCategory)[];
  isCategoriesLoading?: boolean;
  categoriesError?: string | null;
  onAddNewGenre?: (name: string) => void;
  onSubmitApplication: (submission: {
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
    chapters: SubmissionChapterDraft[];
    totalExpectedChapters: number;
    bankInfo: {
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    };
    isCreatorApplication: boolean;
  }) => void;
  existingSubmission?: NovelSubmission | null;
}

/**
 * 3 Thể Loại Chính chuẩn mực theo yêu cầu
 */
const MAIN_CATEGORIES: { id: MainCategory; label: string }[] = [
  { id: 'truyen-nam', label: 'Truyện Nam' },
  { id: 'truyen-nu', label: 'Truyện Nữ' },
  { id: 'dam-my', label: 'Đam Mỹ' },
];

/**
 * Danh sách thể loại phụ phổ biến để chọn nhanh
 */
const DEFAULT_SUB_GENRES = [
  'Tiên Hiệp',
  'Huyền Huyễn',
  'Trọng Sinh',
  'Xuyên Không',
  'Đô Thị',
  'Võng Du',
  'Ngôn Tình',
  'Bách Hợp',
  'Khoa Huyễn',
  'Dị Giới',
  'Mạt Thế',
  'Điền Văn',
  'Cung Đấu',
  'Trinh Thám',
  'Hài Hước',
  'Kiếm Hiệp',
  'Hệ Thống',
  'Linh Dị',
  'Nữ Cường',
  'Cổ Đại',
  'Kinh Dị',
];

/**
 * Minimalist Tooltip Component: Chuyển chú thích dài thành icon (i) gọn gàng
 */
const TooltipIcon: React.FC<{ content: string; title?: string }> = ({ content, title }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex items-center ml-1.5 align-middle">
      <button
        type="button"
        onClick={() => setShow(!show)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-sky-500 hover:text-sky-600 transition-colors p-0.5 rounded-full hover:bg-sky-100 cursor-pointer"
        aria-label="Thông tin chi tiết"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 sm:w-72 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl z-50 pointer-events-none animate-in fade-in zoom-in-95">
          {title && <div className="font-bold text-sky-300 mb-1">{title}</div>}
          <div className="leading-relaxed font-normal text-slate-200">{content}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
};

/**
 * Hàm phân tích và tự động nhận diện các chương từ 1 ô văn bản duy nhất
 */
function parseChaptersFromManuscript(rawText: string): SubmissionChapterDraft[] {
  if (!rawText.trim()) return [];

  // Nhận diện các mẫu định dạng chương: "Chương 1", "Chương 1: ...", "Chương 1 - ...", "Chapter 1", "Hồi 1"
  const chapterRegex = /(?:^|\n)\s*(?:Chương|Hồi|Chapter)\s*(\d+|[0-9]+|[IVXLCDM]+)[\s:.-]*(.*?)(?=\n|$)/gi;
  const matches = [...rawText.matchAll(chapterRegex)];

  if ((matches?.length || 0) > 0) {
    const chapters: SubmissionChapterDraft[] = [];
    for (let i = 0; i < (matches?.length || 0); i++) {
      const match = matches[i];
      const matchIndex = match?.index ?? 0;
      const chapterNum = parseInt(match?.[1], 10) || (i + 1);
      const subTitle = match?.[2]?.trim();
      const title = subTitle ? `Chương ${chapterNum}: ${subTitle}` : `Chương ${chapterNum}`;

      const headerEndIndex = matchIndex + (match?.[0]?.length || 0);
      const nextMatchIndex = i < (matches?.length || 0) - 1 ? (matches[i + 1]?.index ?? rawText.length) : rawText.length;
      const content = rawText.slice(headerEndIndex, nextMatchIndex).trim();

      chapters.push({
        number: chapterNum,
        title,
        content: content || 'Nội dung đang cập nhật...',
        wordCount: content.split(/\s+/).filter(Boolean)?.length || 0,
      });
    }
    return chapters;
  }

  // Nếu không có từ khóa "Chương" và văn bản có nội dung thực tế, xem như 1 chương duy nhất
  if ((rawText.trim()?.length || 0) > 0) {
    return [{
      number: 1,
      title: 'Chương 1',
      content: rawText.trim(),
      wordCount: rawText.split(/\s+/).filter(Boolean)?.length || 0,
    }];
  }

  return [];
}

export const RegisterCreatorModal: React.FC<RegisterCreatorModalProps> = ({
  isOpen,
  onClose,
  user,
  genres = [],
  onAddNewGenre,
  onSubmitApplication,
}) => {
  // Vai trò: Tác giả sáng tác hoặc Editor/Dịch giả
  const [roleType, setRoleType] = useState<'author' | 'editor'>('author');
  const [isExclusive, setIsExclusive] = useState<boolean>(false);

  // Thông tin tác phẩm đầu tay - Khởi tạo trống hoàn toàn để người dùng tự nhập bút danh
  const [novelTitle, setNovelTitle] = useState('');
  const [novelAuthor, setNovelAuthor] = useState('');
  const [novelDescription, setNovelDescription] = useState('');
  const [coverImage, setCoverImage] = useState<string>('');

  // 1. Thể Loại Chính (Truyện Nam, Truyện Nữ, Đam Mỹ)
  const [selectedMainCategory, setSelectedMainCategory] = useState<MainCategory>('truyen-nam');

  // 2. Kèm thêm nhiều thể loại phụ (Multi-select)
  const [selectedSubGenres, setSelectedSubGenres] = useState<string[]>(['Tiên Hiệp']);
  const [customGenreInput, setCustomGenreInput] = useState('');

  // 3. Bản thảo khởi đầu (Khởi tạo rỗng, không tự ý chèn chương mẫu)
  const [manuscriptText, setManuscriptText] = useState<string>('');

  const [agreedToPolicy, setAgreedToPolicy] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  // Danh sách các thể loại phụ kết hợp từ database và mặc định
  const availableSubGenres = useMemo(() => {
    const list = [...DEFAULT_SUB_GENRES];
    (Array.isArray(genres) ? genres : []).forEach((g) => {
      const name = g?.name?.trim();
      if (name && !list.includes(name) && !['Truyện Nam', 'Truyện Nữ', 'Đam Mỹ'].includes(name)) {
        list.push(name);
      }
    });
    return list;
  }, [genres]);

  // Nhận diện chương theo thời gian thực từ 1 ô duy nhất
  const detectedChapters = useMemo(() => {
    return parseChaptersFromManuscript(manuscriptText);
  }, [manuscriptText]);

  if (!isOpen) return null;

  // Toggle chọn / bỏ chọn thể loại phụ
  const handleToggleSubGenre = (genreName: string) => {
    setSelectedSubGenres((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      if (safePrev.includes(genreName)) {
        return safePrev.filter((g) => g !== genreName);
      } else {
        return [...safePrev, genreName];
      }
    });
  };

  // Thêm thể loại phụ tùy chỉnh
  const handleAddCustomGenre = () => {
    const trimmed = customGenreInput.trim();
    if (!trimmed) return;
    if (!(selectedSubGenres || []).includes(trimmed)) {
      setSelectedSubGenres((prev) => [...(Array.isArray(prev) ? prev : []), trimmed]);
    }
    if (onAddNewGenre) {
      onAddNewGenre(trimmed);
    }
    setCustomGenreInput('');
  };

  // Tải ảnh bìa
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCoverImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Tải nội dung bản thảo từ tệp .txt vào 1 ô duy nhất
  const handleTextFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      if (!content.trim()) {
        alert('Tệp văn bản trống.');
        return;
      }
      setManuscriptText(content);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!agreedToPolicy) {
      setErrorMsg('Vui lòng đồng ý với Cam kết quy chế đăng truyện của Đạo Tâm.');
      return;
    }

    if (!novelTitle.trim()) {
      setErrorMsg('Vui lòng điền Tên tác phẩm khởi đầu.');
      return;
    }

    if (!novelAuthor.trim()) {
      setErrorMsg('Vui lòng điền Tác giả / Bút danh của tác phẩm.');
      return;
    }

    // KIỂM TRA LUỒNG DỮ LIỆU (VALIDATION) TRƯỚC KHI LƯU:
    // Đối với tác giả/editor đăng truyện lần đầu, hệ thống phải đếm đủ số lượng chương.
    // Nếu dưới 5 chương, tuyệt đối không gọi API Firebase. Chặn ngay tại form và hiển thị cảnh báo nền vàng:
    if ((detectedChapters?.length || 0) < 5) {
      setErrorMsg('Bạn phải đăng ít nhất 5 chương cho lần đầu tiên gửi duyệt');
      return;
    }

    const effectiveRoyaltyRate = roleType === 'author' ? 95 : (isExclusive ? 90 : 70);
    const authorName = novelAuthor.trim();
    const finalCover = coverImage.trim() || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
    const finalDescription = novelDescription.trim() || 'Bản thảo tác phẩm mới đang trong quá trình thẩm định và cập nhật văn án.';

    setIsSubmitting(true);
    try {
      // ĐỢI FIREBASE XÁC NHẬN (AWAITED PROMISE)
      await onSubmitApplication({
        title: novelTitle.trim(),
        author: authorName,
        editor: roleType === 'editor' ? authorName : '',
        publisherRoles: [roleType],
        isExclusive: roleType === 'author' ? false : isExclusive,
        royaltyRate: effectiveRoyaltyRate,
        mainCategory: selectedMainCategory,
        categories: (selectedSubGenres?.length || 0) > 0 ? selectedSubGenres : ['Tổng Hợp'],
        description: finalDescription,
        coverImage: finalCover,
        chapters: detectedChapters,
        totalExpectedChapters: 150,
        bankInfo: user?.bankInfo || {
          bankName: '',
          accountNumber: '',
          accountHolder: '',
        },
        isCreatorApplication: true,
      });

      // CHỈ KHI FIREBASE TRẢ VỀ THÀNH CÔNG: Mới hiển thị thông báo & xóa form (reset state)
      setIsSuccess(true);
      setErrorMsg('');
      setNovelTitle('');
      setNovelAuthor('');
      setNovelDescription('');
      setCoverImage('');
      setManuscriptText('');

      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      // BẮT LỖI FIREBASE VÀO BLOCK CATCH & HIỆN CẢNH BÁO NỀN MÀU VÀNG
      console.error('Lỗi khi gửi bản thảo duyệt:', err);
      setErrorMsg(err?.message || 'Có lỗi khi kết nối máy chủ để gửi bản thảo. Vui lòng kiểm tra lại mạng và thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div 
        className="w-full max-w-3xl bg-slate-50 border border-sky-100 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Tối Giản Xanh Pastel */}
        <div className="px-6 py-4.5 bg-white border-b border-sky-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
              <BookPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-sans text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                Đăng Ký Người Sáng Tác &amp; Editor
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                  Nhuận bút đến 95%
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Xuất bản truyện và thẩm định bản thảo đầu tay
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thanh quy chuẩn bắt buộc - Nổi bật rực rỡ với chữ màu vàng theo yêu cầu */}
        <div className="mx-6 mt-4 p-3.5 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 rounded-2xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-1 bg-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-2xs flex items-center gap-1">
              <span>⚠️</span>
              <span>QUY CHUẨN BẮT BUỘC:</span>
            </span>
            <span className="font-black text-xs sm:text-sm text-yellow-600 dark:text-yellow-400">
              Không đăng truyện bản quyền và truyện 18+
            </span>
          </div>
          <TooltipIcon
            title="Quy chế bắt buộc khi đăng truyện"
            content="Các tác giả, editor không được phép đăng truyện bản quyền, truyện 18+, không tự ý cố tình xóa chương đăng lại để hiện truyện lên trang. Ai vi phạm và có xác nhận từ web sẽ bị cấm vĩnh viễn."
          />
        </div>

        {/* Form Body - Tối giản, nền trắng, viền xám, text đen, khoảng cách thoáng đãng */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          
          {/* MỤC 1: VAI TRÒ SÁNG TÁC */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center">
                1. Vai Trò Bạn Muốn Đăng Ký
                <TooltipIcon
                  title="Quyền lợi tỷ lệ nhuận bút"
                  content="Tác giả sáng tác truyện chính chủ nhận 95% doanh thu mở khóa chương VIP. Editor dịch và biên tập truyện nhận 70% (không độc quyền) hoặc 90% (độc quyền)."
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => setRoleType('author')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  roleType === 'author'
                    ? 'bg-pink-50/70 border-pink-400 ring-2 ring-pink-200 text-slate-900'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-sm text-slate-900">
                  <span className="flex items-center gap-1.5">
                    <PenTool className="w-4 h-4 text-pink-600" />
                    Tác Giả Sáng Tác
                  </span>
                  <span className="text-xs font-bold text-pink-600">95% Nhuận Bút</span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Viết truyện chính chủ của bạn. Hưởng 95% tổng doanh thu bạn đọc mở khóa chương VIP.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRoleType('editor')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  roleType === 'editor'
                    ? 'bg-pink-50/70 border-pink-400 ring-2 ring-pink-200 text-slate-900'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-sm text-slate-900">
                  <span className="flex items-center gap-1.5">
                    <Scissors className="w-4 h-4 text-pink-600" />
                    Editor / Dịch Giả
                  </span>
                  <span className="text-xs font-bold text-pink-600">70% - 90% Nhuận Bút</span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Biên tập và dịch truyện. Hưởng 70% không độc quyền hoặc 90% độc quyền xuất bản.
                </p>
              </button>
            </div>

            {roleType === 'editor' && (
              <div className="mt-3 p-3 rounded-xl bg-pink-50/60 border border-pink-200 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-900">Cam kết phát hành độc quyền tại Đạo Tâm</span>
                  <p className="text-[11px] text-pink-700 font-semibold">
                    {isExclusive ? '⭐ Hưởng 90% nhuận bút VIP (Độc quyền)' : 'Đang chọn 70% nhuận bút VIP (Không độc quyền). Bật để nhận 90%.'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={isExclusive}
                    onChange={(e) => setIsExclusive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
                </label>
              </div>
            )}
          </div>

          {/* MỤC 2: TÁC PHẨM KHỞI ĐẦU & BẢN THẢO THẨM ĐỊNH */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center">
                2. Tác Phẩm Khởi Đầu &amp; Bản Thảo Thẩm Định
                <TooltipIcon
                  title="Thẩm định chất lượng"
                  content="BQT sẽ duyệt tác phẩm dựa trên bản thảo bạn gửi. Hệ thống tự động nhận diện các chương 1, chương 2, chương 3... để thẩm định văn phong."
                />
              </label>
              <span className="text-[11px] font-semibold text-pink-700 bg-pink-50 border border-pink-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-pink-500" />
                Tự động nhận diện chương
              </span>
            </div>

            {/* Tên truyện đầu tay */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Tên Truyện Đầu Tay: <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={novelTitle}
                onChange={(e) => setNovelTitle(e.target.value)}
                placeholder="Ví dụ: Ma Đạo Tông Sư, Trọng Sinh Nghịch Thiên..."
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 placeholder-slate-400"
                required
              />
            </div>

            {/* Thêm mục Tác Giả sau tên truyện */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Tác Giả / Bút Danh: <span className="text-rose-500">*</span></span>
                <span className="text-[11px] font-normal text-slate-500">
                  {roleType === 'author' ? 'Bút danh của bạn' : 'Tên tác giả nguyên tác'}
                </span>
              </label>
              <input
                type="text"
                value={novelAuthor}
                onChange={(e) => setNovelAuthor(e.target.value)}
                placeholder={roleType === 'author' ? "Nhập bút danh tác giả của bạn..." : "Nhập tên tác giả nguyên tác truyện dịch..."}
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 placeholder-slate-400"
                required
              />
            </div>

            {/* PHÂN CHIA THỂ LOẠI LÀM 3 LOẠI CHÍNH: TRUYỆN NAM, TRUYỆN NỮ, ĐAM MỸ */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-900">
                Thể Loại Chính: <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(MAIN_CATEGORIES || []).map((cat) => {
                  const isSelected = selectedMainCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedMainCategory(cat.id)}
                      className={`py-2.5 px-3 rounded-xl border text-center font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? 'bg-pink-600 text-white border-pink-600 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* KÈM THÊM NHIỀU THỂ LOẠI PHỤ (ĐƯỢC THÊM NHIỀU CÁI) */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-pink-600" />
                  Thể Loại Phụ Kèm Theo:
                  <span className="text-slate-500 font-normal text-[11px]">
                    (Được chọn nhiều thể loại, đã chọn: {selectedSubGenres?.length || 0})
                  </span>
                </label>
              </div>

              {/* Danh sách thẻ thể loại phụ để chọn nhanh */}
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50/80 rounded-xl border border-slate-200">
                {(availableSubGenres || []).map((genre) => {
                  const isSelected = (selectedSubGenres || []).includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => handleToggleSubGenre(genre)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-pink-600 text-white font-bold shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                      <span>{genre}</span>
                    </button>
                  );
                })}
              </div>

              {/* Ô nhập thêm thể loại phụ tùy ý */}
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={customGenreInput}
                  onChange={(e) => setCustomGenreInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomGenre();
                    }
                  }}
                  placeholder="Gõ tên thể loại phụ khác rồi bấm Thêm..."
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={handleAddCustomGenre}
                  className="px-3.5 py-2 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-800 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm</span>
                </button>
              </div>
            </div>

            {/* Tóm tắt cốt truyện (Văn án) */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Tóm Tắt Cốt Truyện (Văn Án):</span>
                <span className="text-[11px] font-normal text-slate-400">(Tùy chọn - có thể cập nhật sau)</span>
              </label>
              <textarea
                rows={2}
                value={novelDescription}
                onChange={(e) => setNovelDescription(e.target.value)}
                placeholder="Mô tả bối cảnh, nhân vật chính và nội dung cuốn hút của tác phẩm (hoặc để trống cập nhật sau)..."
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 placeholder-slate-400 leading-relaxed"
              />
            </div>

            {/* Tải Ảnh Bìa Tối Giản */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-16 h-22 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs">
                {coverImage && coverImage.trim() !== '' ? (
                  <img src={coverImage} alt="Cover Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-slate-400" />
                )}
              </div>

              <div className="flex-1 text-center sm:text-left space-y-1">
                <div className="text-xs font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1">
                  Ảnh Bìa Tác Phẩm
                  <span className="text-[11px] font-normal text-slate-400 ml-1">(Tùy chọn - có ảnh bìa mặc định)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tải ảnh bìa rõ nét hoặc hệ thống sẽ gán ảnh bìa sách thanh nhã mặc định
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleCoverUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                  {coverImage ? 'Đổi ảnh bìa khác' : 'Chọn ảnh bìa từ máy'}
                </button>
              </div>
            </div>

            {/* 1 Ô DUY NHẤT GỬI BẢN THẢO DUYỆT - TỰ ĐỘNG NHẬN DIỆN CHƯƠNG 1, CHƯƠNG 2, CHƯƠNG 3... */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-pink-600" />
                    Bản Thảo Thẩm Định (1 ô duy nhất - Tự động tách chương): <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Dán toàn bộ các chương vào đây. Web tự động nhận diện theo định dạng: Chương 1, Chương 2, Chương 3...
                  </p>
                </div>

                <div>
                  <input
                    type="file"
                    ref={textFileInputRef}
                    onChange={handleTextFileUpload}
                    accept=".txt"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => textFileInputRef.current?.click()}
                    className="text-xs text-pink-600 hover:text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-200 px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>Tải nhanh từ tệp .txt</span>
                  </button>
                </div>
              </div>

              {/* 1 Ô Textarea Duy Nhất */}
              <div className="relative">
                <textarea
                  rows={6}
                  value={manuscriptText}
                  onChange={(e) => setManuscriptText(e.target.value)}
                  placeholder={`Dán nội dung chương nếu có (tùy chọn)...\n\nVí dụ định dạng:\nChương 1: Tiêu đề chương 1\nNội dung chương 1...`}
                  className="w-full bg-white border border-slate-300 rounded-2xl p-4 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 placeholder-slate-400 leading-relaxed font-sans shadow-inner"
                />
              </div>

              {/* Thanh trạng thái tự động nhận diện chương theo thời gian thực */}
              <div className="p-3 bg-pink-50/70 rounded-xl border border-pink-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-pink-900">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pink-600" />
                    Đã nhận diện: {detectedChapters?.length || 0} chương {(detectedChapters?.length || 0) === 0 ? '(Có thể bổ sung chương sau)' : ''}
                  </span>
                  {(detectedChapters?.length || 0) > 0 && (
                    <span className="text-[11px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" />
                      Sẵn sàng gửi kèm {detectedChapters?.length || 0} chương
                    </span>
                  )}
                </div>

                {/* Danh sách các chương đã tự động tách */}
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                  {(detectedChapters || []).map((ch) => (
                    <span
                      key={ch.number}
                      className="text-[11px] bg-white border border-pink-200 text-pink-950 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 shadow-2xs"
                    >
                      <span className="font-bold text-pink-700">Chương {ch.number}</span>
                      {ch.title.includes(':') && (
                        <span className="text-slate-500 max-w-[120px] truncate">
                          {ch.title.split(':')[1]?.trim()}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">({ch.wordCount || 0} từ)</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Cam kết & Nút Gửi */}
          <div className="pt-2 space-y-4">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToPolicy}
                onChange={(e) => setAgreedToPolicy(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
              />
              <span className="leading-relaxed">
                Tôi cam kết toàn bộ thông tin đăng ký và bản thảo là chính xác, không vi phạm bản quyền hoặc thuần phong mỹ tục. Tôi đồng ý với chính sách trả thưởng và thẩm định của Đạo Tâm.
              </span>
            </label>

            {/* Cảnh báo nền vàng khi đang xử lý gửi Firebase */}
            {isSubmitting && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs sm:text-sm font-bold flex items-center gap-2.5 shadow-xs animate-pulse">
                <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span>⚡ Đang gửi bản thảo và hồ sơ đăng ký lên hệ thống... Vui lòng không nhấn liên tục!</span>
              </div>
            )}

            {/* Cảnh báo nền vàng khi có lỗi */}
            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-amber-100 border-2 border-amber-500 text-amber-950 text-xs sm:text-sm font-bold flex items-start gap-2 shadow-xs">
                <Info className="w-4 h-4 flex-shrink-0 text-amber-700 mt-0.5" />
                <div className="flex-1">
                  <span className="font-black">⚠️ Chú ý: </span>
                  <span>{errorMsg}</span>
                </div>
              </div>
            )}

            {isSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Hồ sơ đã được gửi thành công! Ban Quản Trị sẽ xem xét và thẩm định trong thời gian sớm nhất.</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !agreedToPolicy || !novelTitle.trim() || !novelAuthor.trim()}
                className="w-full py-3.5 rounded-2xl bg-[#e11d48] hover:bg-[#be123c] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none text-white text-sm font-bold shadow-lg shadow-rose-600/25 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang gửi hồ sơ...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Gửi Bản Thảo &amp; Đăng Ký {roleType === 'author' ? 'Tác Giả' : 'Editor'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
