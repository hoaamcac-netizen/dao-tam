import React, { useState, useMemo } from 'react';
import { Novel, Chapter, UserProfile, WithdrawalRequest, MainCategory, SubmissionChapterDraft, StoryRole, DonationRecord } from '../types';
import { fetchDonationsForRecipient } from '../firebase/services';
import { formatXu } from '../utils/rulesAndVoices';
import { 
  X, 
  BookOpen, 
  Edit3, 
  Plus, 
  Coins, 
  Clock, 
  CheckCircle2, 
  Calendar, 
  TrendingUp, 
  FileText, 
  Save, 
  Send, 
  Building2, 
  AlertCircle,
  Eye,
  Trash2,
  Sparkles,
  Search,
  Lock,
  Unlock,
  Layers,
  ArrowUpRight,
  LayoutGrid,
  Table as TableIcon
} from 'lucide-react';
import { DaoTamLogo } from './DaoTamLogo';
import { NovelManagementTable } from './NovelManagementTable';

interface AuthorDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  novels: Novel[];
  withdrawalRequests: WithdrawalRequest[];
  onSubmitWithdrawal: (data: {
    amountXu: number;
    amountVnd: number;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    note?: string;
  }) => void;
  onSaveChapter: (novelId: string, chapter: {
    title: string;
    number: number;
    content: string;
    isVip: boolean;
    priceXu: number;
    scheduledPublishAt?: number;
    status: 'draft' | 'pending' | 'published';
  }) => void;
  onOpenCreateNovel: () => void;
  onOpenEditNovel?: (novel: Novel) => void;
}

const COMMON_BANKS = [
  'MB Bank (Ngân Hàng Quân Đội)',
  'Vietcombank',
  'Techcombank',
  'BIDV',
  'VietinBank',
  'ACB',
  'TPBank',
  'VPBank',
  'Sacombank',
  'Khác',
];

export const AuthorDashboardModal: React.FC<AuthorDashboardModalProps> = ({
  isOpen,
  onClose,
  user,
  novels = [],
  withdrawalRequests = [],
  onSubmitWithdrawal,
  onSaveChapter,
  onOpenCreateNovel,
  onOpenEditNovel,
}) => {
  const [activeTab, setActiveTab] = useState<'novels' | 'editor' | 'earnings'>('novels');
  const [novelViewMode, setNovelViewMode] = useState<'table' | 'cards'>('table');
  
  // Tác phẩm của người dùng hiện tại (lọc theo tên hoặc email/id)
  const myNovels = useMemo(() => {
    const list = Array.isArray(novels) ? novels : [];
    const cleanEmail = user?.email?.toLowerCase().trim();
    const cleanName = user?.displayName?.toLowerCase().trim();
    return list.filter((n) => {
      const isOwner = (Boolean(user?.id) && user?.id !== 'guest' && (n?.submittedBy?.userId === user?.id || (n as any)?.authorId === user?.id)) ||
        (Boolean(cleanEmail) && (n?.submittedBy?.userEmail?.toLowerCase().trim() === cleanEmail || (n as any)?.authorEmail?.toLowerCase().trim() === cleanEmail));
      const isAuthorName = Boolean(cleanName) && (
        n?.author?.toLowerCase().trim() === cleanName ||
        n?.submittedBy?.userName?.toLowerCase().trim() === cleanName
      );
      const isEditorName = Boolean(cleanName) && n?.editor?.toLowerCase().trim() === cleanName;
      return isOwner || isAuthorName || isEditorName;
    });
  }, [novels, user]);

  // Hiển thị chính xác các tác phẩm của tác giả này (nếu chưa có thì trống)
  const displayNovels = myNovels;

  // Trình soạn thảo & lên lịch đăng
  const [selectedNovelId, setSelectedNovelId] = useState<string>(displayNovels?.[0]?.id || '');
  const targetNovel = (Array.isArray(novels) ? novels : []).find((n) => n?.id === selectedNovelId) || displayNovels?.[0];

  const [chapterNumber, setChapterNumber] = useState<number>(() => ((targetNovel?.chapters?.length) || 0) + 1);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [isVip, setIsVip] = useState(true);
  const [priceXu, setPriceXu] = useState(5);
  const [publishOption, setPublishOption] = useState<'instant' | 'scheduled' | 'draft'>('instant');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [editorSuccessMsg, setEditorSuccessMsg] = useState('');

  // Rút tiền State
  const currentEarnedXu = user?.authorEarnedXu || 0;
  const isEligible = currentEarnedXu >= 1000; // ĐỦ TRÊN 1000 XU MỚI ĐƯỢC RÚT
  const [withdrawAmountXu, setWithdrawAmountXu] = useState<number>(() => Math.max(1000, Math.min(currentEarnedXu, 1000)));
  const [bankName, setBankName] = useState(user?.bankInfo?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(user?.bankInfo?.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState(user?.bankInfo?.accountHolder || '');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState('');
  const [withdrawErrMsg, setWithdrawErrMsg] = useState<string | null>(null);
  const [receivedDonations, setReceivedDonations] = useState<DonationRecord[]>([]);

  // Tải danh sách giao dịch donate thực tế tác giả đã nhận từ độc giả
  React.useEffect(() => {
    if (user?.id || user?.displayName) {
      const target = user.id && user.id !== 'guest' ? user.id : user.displayName;
      fetchDonationsForRecipient(target).then((list) => {
        setReceivedDonations(Array.isArray(list) ? list : []);
      }).catch((err) => console.warn('Lỗi tải donations cho tác giả:', err));
    }
  }, [user?.id, user?.displayName]);

  // Cập nhật số chương khi đổi truyện
  React.useEffect(() => {
    if (targetNovel) {
      setChapterNumber((targetNovel?.chapters?.length || 0) + 1);
    }
  }, [selectedNovelId, targetNovel]);

  if (!isOpen) return null;

  // Tính số từ tự động
  const wordCount = (chapterContent || '').trim() ? (chapterContent.trim().split(/\s+/)?.length || 0) : 0;

  // Xử lý gửi chương
  const handleSaveChapterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetNovel || !chapterTitle.trim() || !chapterContent.trim()) {
      alert('Vui lòng nhập đầy đủ tiêu đề và nội dung chương!');
      return;
    }

    let scheduledPublishAt: number | undefined;
    if (publishOption === 'scheduled' && scheduledDate) {
      scheduledPublishAt = new Date(`${scheduledDate}T${scheduledTime}`).getTime();
    }

    onSaveChapter(targetNovel.id, {
      title: chapterTitle.trim(),
      number: chapterNumber,
      content: chapterContent.trim(),
      isVip,
      priceXu: isVip ? priceXu : 0,
      scheduledPublishAt,
      status: publishOption === 'draft' ? 'draft' : 'published',
    });

    setEditorSuccessMsg(
      publishOption === 'draft' 
        ? 'Đã lưu bản nháp thành công!' 
        : publishOption === 'scheduled'
        ? `Đã lên lịch đăng chương vào lúc ${scheduledTime} ngày ${scheduledDate}!`
        : `Đã xuất bản thành công Chương ${chapterNumber}: "${chapterTitle}"!`
    );

    setChapterTitle('');
    setChapterContent('');
    setChapterNumber((prev) => prev + 1);
    setTimeout(() => setEditorSuccessMsg(''), 4000);
  };

  // Xử lý gửi lệnh rút xu
  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawErrMsg(null);

    const hasPending = (myWithdrawals || []).some((w) => w?.status === 'pending');
    if (hasPending) {
      setWithdrawErrMsg('Bạn đang có một yêu cầu rút xu chưa được duyệt. Theo quy định, chỉ khi nào đơn trước đó được duyệt thì bạn mới có thể yêu cầu rút tiếp.');
      return;
    }

    if (currentEarnedXu < 1000) {
      setWithdrawErrMsg('Số dư nhuận bút của bạn cần đạt tối thiểu 1000 Xu để được quyền rút tiền.');
      return;
    }

    if (withdrawAmountXu < 1000) {
      setWithdrawErrMsg('Số xu rút tối thiểu là 1000 Xu.');
      return;
    }

    if (withdrawAmountXu > currentEarnedXu) {
      setWithdrawErrMsg(`Bạn chỉ có tối đa ${formatXu(currentEarnedXu)} Xu để rút.`);
      return;
    }

    if (!accountNumber.trim()) {
      setWithdrawErrMsg('Vui lòng nhập số tài khoản ngân hàng (STK).');
      return;
    }

    if (!accountHolder.trim()) {
      setWithdrawErrMsg('Vui lòng nhập họ và tên chủ tài khoản ngân hàng.');
      return;
    }

    onSubmitWithdrawal({
      amountXu: withdrawAmountXu,
      amountVnd: withdrawAmountXu,
      bankName,
      accountNumber: accountNumber.trim(),
      accountHolder: accountHolder.trim().toUpperCase(),
      note: withdrawNote.trim(),
    });

    setWithdrawSuccessMsg(`Đã gửi yêu cầu rút ${withdrawAmountXu.toLocaleString('vi-VN')} Xu (~ ${withdrawAmountXu.toLocaleString('vi-VN')} đ) thành công! Quản trị viên sẽ đối soát và chuyển khoản vào STK của bạn.`);
    setTimeout(() => setWithdrawSuccessMsg(''), 5000);
  };

  // Thống kê doanh thu cá nhân
  const totalNovelsCount = displayNovels?.length || 0;
  const totalVipChapters = (displayNovels || []).reduce((acc, n) => acc + ((Array.isArray(n?.chapters) ? n.chapters : []).filter((c) => c?.isVip)?.length || 0), 0);
  const totalViews = (displayNovels || []).reduce((acc, n) => acc + (n?.views || 0), 0);

  // Lọc các yêu cầu rút của chính tác giả này
  const myWithdrawals = (withdrawalRequests || []).filter(
    (w) => w?.authorId === user?.id || w?.authorEmail === user?.email
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-slate-200">
      <div className="w-full max-w-5xl bg-[#090d16] border border-indigo-500/40 rounded-2xl shadow-2xl flex flex-col h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Top Header */}
        <div className="px-6 py-4 bg-[#0e1424] border-b border-indigo-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-md">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-white flex items-center gap-2">
                Bàn Làm Việc Tác Giả &amp; Editor — {user.displayName}
                <span className="bg-indigo-600/30 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/40">
                  {user.role === 'admin' ? '👑 Quản Trị / Tác Giả' : '✍️ Tác Giả Chính Thức'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Quản lý tác phẩm cá nhân, soạn thảo &amp; lên lịch đăng chương, theo dõi doanh thu và rút nhuận bút
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 bg-[#0c101c] border-b border-slate-800 text-xs sm:text-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('novels')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'novels'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-600/15'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Tác Phẩm Cá Nhân ({displayNovels?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('editor')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'editor'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-600/15'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            <span>Soạn Thảo &amp; Lên Lịch Đăng</span>
          </button>

          <button
            onClick={() => setActiveTab('earnings')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'earnings'
                ? 'border-emerald-500 text-emerald-300 bg-emerald-600/15'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>Thu Nhập &amp; Rút Nhuận Bút</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              {formatXu(currentEarnedXu)} Xu
            </span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* CẢNH BÁO QUY ĐỊNH BẮT BUỘC DÀNH CHO TÁC GIẢ & EDITOR */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/90 via-red-950/80 to-amber-950/80 border border-rose-500/40 text-rose-200 text-xs shadow-lg">
            <div className="flex items-start gap-3">
              <span className="p-1.5 rounded-xl bg-rose-600/30 border border-rose-500/50 text-rose-300 flex-shrink-0 text-base">
                ⚠️
              </span>
              <div className="space-y-1">
                <strong className="text-white uppercase font-bold tracking-wider block text-xs">
                  Cảnh báo quy chế bản quyền &amp; đăng truyện:
                </strong>
                <p className="text-rose-100 leading-relaxed font-medium">
                  "Các tác giả, editor không được phép đăng truyện bản quyền, truyện 18+, không tự ý cố tình xóa chương đăng lại để hiện truyện lên trang. Ai vi phạm và có xác nhận từ web sẽ bị cấm vĩnh viễn, doanh thu tháng đó cũng sẽ mất. Các team lưu ý giúp mình."
                </p>
              </div>
            </div>
          </div>

          {/* =========================================================================
              TAB 1: TÁC PHẨM CÁ NHÂN
             ========================================================================= */}
          {activeTab === 'novels' && (
            <div className="space-y-6">
              {/* Top Banner & Quick Add */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-[#0e1424] border border-indigo-500/30">
                <div>
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Không Gian Quản Trị Tác Phẩm
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Quản lý danh sách truyện theo dạng Bảng chuyên nghiệp hoặc Thẻ trực quan.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* View Mode Switcher */}
                  <div className="flex items-center bg-[#0e1424] p-1 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setNovelViewMode('table')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                        novelViewMode === 'table'
                          ? 'bg-blue-500 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>Bảng</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNovelViewMode('cards')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                        novelViewMode === 'cards'
                          ? 'bg-blue-500 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Thẻ</span>
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      onOpenCreateNovel();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer hover:scale-102 flex-shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Đăng Tác Phẩm Mới</span>
                  </button>
                </div>
              </div>

              {novelViewMode === 'table' ? (
                <NovelManagementTable
                  novels={displayNovels}
                  onOpenSubmitModal={() => {
                    onClose();
                    onOpenCreateNovel();
                  }}
                  onEditNovel={onOpenEditNovel}
                  onViewNovel={(novel) => {
                    onClose();
                    window.location.hash = `#novel-${novel.slug}`;
                  }}
                  onAddNewChapter={(novel) => {
                    setSelectedNovelId(novel.id);
                    setActiveTab('editor');
                  }}
                  onViewChapterList={(novel) => {
                    setSelectedNovelId(novel.id);
                    setActiveTab('editor');
                  }}
                  onBatchUploadChapters={(novel) => {
                    setSelectedNovelId(novel.id);
                    setActiveTab('editor');
                  }}
                />
              ) : (
                /* Novels List Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(displayNovels || []).map((novel) => (
                  <div
                    key={novel.id}
                    className="p-4 rounded-2xl bg-[#0e1424] border border-slate-800 hover:border-indigo-500/50 transition-all flex gap-4 group"
                  >
                    <img
                      src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80'}
                      alt={novel.title}
                      className="w-20 h-28 object-cover rounded-xl border border-slate-700 flex-shrink-0 shadow-md group-hover:scale-102 transition-transform"
                    />

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            novel.publishStatus === 'published' || !novel.publishStatus
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : novel.publishStatus === 'pending_approval'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-slate-700/50 text-slate-300'
                          }`}>
                            {novel.publishStatus === 'pending_approval' ? '⏳ Đang chờ duyệt' : '✅ Đã xuất bản'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {novel.status}
                          </span>
                        </div>

                        <h4 className="font-bold text-sm text-white group-hover:text-indigo-300 truncate mb-1">
                          {novel.title}
                        </h4>

                        <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                          {novel.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
                        <span className="text-slate-400 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-indigo-400" />
                          <strong>{novel?.chapters?.length || 0}</strong> chương
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedNovelId(novel.id);
                              setActiveTab('editor');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 font-semibold text-xs flex items-center gap-1 border border-indigo-500/30 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Thêm chương</span>
                          </button>

                          {onOpenEditNovel && (
                            <button
                              onClick={() => onOpenEditNovel(novel)}
                              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                              title="Chỉnh sửa thông tin truyện"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 2: TRÌNH SOẠN THẢO & LÊN LỊCH ĐĂNG CHƯƠNG NÂNG CAO
             ========================================================================= */}
          {activeTab === 'editor' && (
            <form onSubmit={handleSaveChapterSubmit} className="space-y-5">
              {editorSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-bounce">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{editorSuccessMsg}</span>
                </div>
              )}

              {/* Select Novel & Chapter Number */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Chọn tác phẩm cần đăng/soạn chương:
                  </label>
                  <select
                    value={selectedNovelId}
                    onChange={(e) => setSelectedNovelId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0e1424] border border-slate-700 text-xs font-semibold text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                  >
                    {(Array.isArray(novels) ? novels : []).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title} ({(n?.chapters?.length || 0)} chương hiện có) — Tác giả: {n.author}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Số thứ tự chương:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={chapterNumber}
                    onChange={(e) => setChapterNumber(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0e1424] border border-slate-700 text-xs font-mono font-bold text-indigo-300 focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Chapter Title */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Tiêu đề chương:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Chương 52: Đại chiến đỉnh Hắc Phong Sơn"
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0e1424] border border-slate-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {/* VIP Settings & Pricing */}
              <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      {isVip ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-emerald-400" />}
                      Phân Loại Chương &amp; Thu Phí:
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Chương VIP sẽ thu phí Xu từ độc giả để tích lũy doanh thu nhuận bút cho tác giả.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsVip(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                        !isVip 
                          ? 'bg-emerald-600 text-white shadow-md' 
                          : 'bg-[#151a2d] text-slate-400 hover:text-white border border-slate-700'
                      }`}
                    >
                      Chương Thường (Miễn Phí)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsVip(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                        isVip 
                          ? 'bg-amber-600 text-white shadow-md' 
                          : 'bg-[#151a2d] text-slate-400 hover:text-white border border-slate-700'
                      }`}
                    >
                      Chương VIP (Thu Phí Xu)
                    </button>
                  </div>
                </div>

                {isVip && (
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-300">Giá mở khóa:</span>
                    {[3, 5, 8, 10, 15].map((x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => setPriceXu(x)}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all ${
                          priceXu === x
                            ? 'bg-amber-500 text-stone-950 ring-2 ring-amber-300'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {x} Xu
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-2 text-xs text-slate-400">
                      <span>Tự nhập:</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={priceXu}
                        onChange={(e) => setPriceXu(Number(e.target.value))}
                        className="w-16 px-2 py-1 rounded bg-black border border-slate-700 text-amber-400 font-bold text-center text-xs"
                      />
                      <span>Xu</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chapter Content & Word Count */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-xs text-slate-400">
                  <label className="font-bold text-slate-300">Nội dung chương truyện:</label>
                  <span className="font-mono text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/30">
                    Đếm từ tự động: <strong>{wordCount.toLocaleString()}</strong> từ
                  </span>
                </div>
                <textarea
                  rows={14}
                  placeholder="Nhập nội dung văn bản chương truyện vào đây... Tự động phân đoạn và lưu trữ an toàn."
                  value={chapterContent}
                  onChange={(e) => setChapterContent(e.target.value)}
                  className="w-full p-4 rounded-xl bg-[#090d16] border border-slate-700 text-xs sm:text-sm text-slate-200 leading-relaxed focus:border-indigo-500 focus:outline-none font-serif"
                  required
                />
              </div>

              {/* Publish Options & Scheduling */}
              <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 space-y-3">
                <span className="block text-xs font-bold text-white">Chế độ xuất bản:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    publishOption === 'instant' 
                      ? 'bg-indigo-600/20 border-indigo-500 text-white' 
                      : 'bg-[#151a2d] border-slate-800 text-slate-400 hover:text-white'
                  }`}>
                    <input
                      type="radio"
                      name="publishOption"
                      checked={publishOption === 'instant'}
                      onChange={() => setPublishOption('instant')}
                      className="accent-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold">Xuất Bản Ngay</div>
                      <div className="text-[10px] text-slate-400">Đăng tức thì lên web</div>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    publishOption === 'scheduled' 
                      ? 'bg-amber-600/20 border-amber-500 text-white' 
                      : 'bg-[#151a2d] border-slate-800 text-slate-400 hover:text-white'
                  }`}>
                    <input
                      type="radio"
                      name="publishOption"
                      checked={publishOption === 'scheduled'}
                      onChange={() => setPublishOption('scheduled')}
                      className="accent-amber-500"
                    />
                    <div>
                      <div className="text-xs font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        Hẹn Giờ Xuất Bản
                      </div>
                      <div className="text-[10px] text-slate-400">Tự động phát hành theo lịch</div>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    publishOption === 'draft' 
                      ? 'bg-slate-700/40 border-slate-500 text-white' 
                      : 'bg-[#151a2d] border-slate-800 text-slate-400 hover:text-white'
                  }`}>
                    <input
                      type="radio"
                      name="publishOption"
                      checked={publishOption === 'draft'}
                      onChange={() => setPublishOption('draft')}
                      className="accent-slate-400"
                    />
                    <div>
                      <div className="text-xs font-bold">Lưu Bản Nháp</div>
                      <div className="text-[10px] text-slate-400">Chưa hiển thị ra công chúng</div>
                    </div>
                  </label>
                </div>

                {publishOption === 'scheduled' && (
                  <div className="pt-2 flex items-center gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Ngày đăng:</label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-black border border-slate-700 text-xs text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Giờ đăng:</label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-black border border-slate-700 text-xs text-white"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all hover:scale-102"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {publishOption === 'draft' ? 'Lưu Bản Nháp Chương' : publishOption === 'scheduled' ? 'Lên Lịch Đăng Chương' : 'Xuất Bản Chương Mới Ngay'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* =========================================================================
              TAB 3: THỐNG KÊ THU NHẬP & RÚT XU NHUẬN BÚT (QUY CHUẨN ĐỦ TRÊN 1000 XU)
             ========================================================================= */}
          {activeTab === 'earnings' && (
            <div className="space-y-6">
              {/* 4 Cards Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-[#0e1424] border border-emerald-500/30 shadow-md">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    Số Xu Nhuận Bút
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
                    {currentEarnedXu.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-300/80 mt-1">
                    ~ {currentEarnedXu.toLocaleString('vi-VN')} VNĐ
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#0e1424] border border-slate-800">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    Chương VIP Đã Đăng
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white">
                    {totalVipChapters}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Trên tổng {totalNovelsCount} tác phẩm
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#0e1424] border border-slate-800">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                    <Eye className="w-4 h-4 text-sky-400" />
                    Tổng Lượt Xem
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-sky-400">
                    {totalViews.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Từ bạn đọc Đạo Tâm
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#0e1424] border border-slate-800">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-4 h-4 text-pink-400" />
                    Tỷ Lệ Nhuận Bút
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold text-pink-400">
                    95% <span className="text-xs text-slate-400 font-normal">/ 90% / 70%</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    TG 95% • Editor ĐQ 90% • Thường 70%
                  </div>
                </div>
              </div>

              {/* Rút Xu Nhuận Bút Form & Điều Kiện */}
              <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1424] border border-indigo-500/30 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-400" />
                      Yêu Cầu Rút Tiền / Nhuận Bút Về Ngân Hàng
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Quy chuẩn: Tác giả và Editor có số dư <strong>đủ từ 1000 Xu trở lên</strong> mới được quyền rút tiền. Tỷ lệ quy đổi 1 Xu = 1 VNĐ (1 Xu = 1 đồng).
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                      isEligible
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      {isEligible ? '✅ Đủ điều kiện rút tiền' : `⚠️ Còn thiếu ${formatXu(1000 - currentEarnedXu)} Xu để rút`}
                    </span>
                  </div>
                </div>

                {withdrawSuccessMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-bounce">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{withdrawSuccessMsg}</span>
                  </div>
                )}

                {withdrawErrMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>{withdrawErrMsg}</span>
                  </div>
                )}

                {!isEligible ? (
                  <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200/90 space-y-2">
                    <p>
                      📌 <strong>Chính sách đầu tháng rút xu:</strong> Đầu tháng sau, tác giả và editor nhận xu từ các chương VIP độc giả mở khóa. Khi tích lũy đủ trên 1000 xu, bạn sẽ được quyền tạo lệnh rút xu.
                    </p>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-amber-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (currentEarnedXu / 1000) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Hiện tại: {formatXu(currentEarnedXu)} Xu</span>
                      <span>Mục tiêu tối thiểu: 1.000 Xu</span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          Số Xu muốn rút (tối thiểu 1.000 Xu):
                        </label>
                        <input
                          type="number"
                          min="1000"
                          max={currentEarnedXu}
                          value={withdrawAmountXu}
                          onChange={(e) => setWithdrawAmountXu(Number(e.target.value))}
                          className="w-full px-3 py-2.5 rounded-xl bg-black border border-slate-700 text-emerald-400 font-bold text-base focus:border-emerald-500 focus:outline-none"
                          required
                        />
                        <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                          <span>Quy đổi: <strong className="text-emerald-400 font-bold">{formatXu(withdrawAmountXu)} VNĐ</strong></span>
                          <span>Còn lại: <strong className="text-slate-300">{formatXu(Math.max(0, currentEarnedXu - withdrawAmountXu))} Xu</strong></span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          Ngân hàng nhận tiền:
                        </label>
                        <select
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-black border border-slate-700 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">-- Chọn ngân hàng thụ hưởng --</option>
                          {(COMMON_BANKS || []).map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          Số tài khoản ngân hàng (STK):
                        </label>
                        <input
                          type="text"
                          placeholder="Nhập số tài khoản ngân hàng..."
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-black border border-slate-700 text-xs font-mono font-bold text-white focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          Tên chủ tài khoản (in hoa):
                        </label>
                        <input
                          type="text"
                          placeholder="Nhập họ tên chủ tài khoản..."
                          value={accountHolder}
                          onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                          className="w-full px-3 py-2.5 rounded-xl bg-black border border-slate-700 text-xs font-bold uppercase text-white focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Ghi chú cho Admin (không bắt buộc):
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Nhuận bút tháng này..."
                        value={withdrawNote}
                        onChange={(e) => setWithdrawNote(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black border border-slate-700 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-101"
                    >
                      <Coins className="w-4 h-4" />
                      <span>Xác Nhận Gửi Yêu Cầu Rút {withdrawAmountXu.toLocaleString('vi-VN')} Xu ({withdrawAmountXu.toLocaleString('vi-VN')} đ)</span>
                    </button>
                  </form>
                )}
              </div>

              {/* Lịch Sử Lệnh Rút Nhuận Bút */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  Lịch Sử Các Lệnh Rút Tiền ({myWithdrawals?.length || 0})
                </h4>

                {(myWithdrawals?.length || 0) === 0 ? (
                  <div className="p-4 rounded-xl bg-[#0e1424] text-xs text-slate-500 text-center">
                    Bạn chưa có lệnh rút tiền nào. Khi tạo lệnh, thông tin và trạng thái thanh toán sẽ hiển thị tại đây.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(myWithdrawals || []).map((w) => (
                      <div
                        key={w.id}
                        className="p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{formatXu(w.amountXu)} Xu</span>
                            <span className="text-slate-400 font-normal">
                              (~ {formatXu(w.amountVnd)} đ)
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              w.status === 'approved'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : w.status === 'rejected'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}>
                              {w.status === 'approved' ? '✅ Đã thanh toán / Đã chuyển khoản' : w.status === 'rejected' ? '❌ Từ chối' : '⏳ Đang chờ Admin chuyển khoản'}
                            </span>
                          </div>
                          <div className="text-slate-400 text-[11px] mt-0.5">
                            STK: {w.accountNumber} ({w.bankName}) • Chủ thẻ: {w.accountHolder} • {new Date(w.createdAt).toLocaleString('vi-VN')}
                          </div>
                        </div>

                        {w.status === 'approved' && (
                          <div className="text-emerald-400 font-semibold text-right text-[11px]">
                            Thành công
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lịch Sử Độc Giả Donate & Tặng Xu (Xác nhận thực tế qua lại) */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <span className="text-sm">🎁</span>
                    Lịch Sử Độc Giả Tặng Xu &amp; Donate ({receivedDonations?.length || 0})
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-400">
                    +{formatXu((receivedDonations || []).reduce((sum, d) => sum + (d?.amountXu || 0), 0))} Xu nhận được
                  </span>
                </div>

                {(receivedDonations?.length || 0) === 0 ? (
                  <div className="p-4 rounded-xl bg-[#0e1424] text-xs text-slate-500 text-center">
                    Chưa có giao dịch donate nào từ độc giả. Khi độc giả tặng Xu ủng hộ tác phẩm của bạn, chi tiết sẽ hiển thị tại đây.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {(receivedDonations || []).map((d) => (
                      <div
                        key={d.id}
                        className="p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-white flex items-center gap-2">
                            <span className="text-pink-400">{d.donorName}</span>
                            <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                              +{formatXu(d.amountXu)} Xu
                            </span>
                            {d.novelTitle && (
                              <span className="text-slate-400 text-[11px]">
                                • Truyện: "{d.novelTitle}"
                              </span>
                            )}
                          </div>
                          {d.message && (
                            <p className="text-[11px] text-slate-300 italic mt-0.5">
                              "{d.message}"
                            </p>
                          )}
                          <div className="text-slate-500 text-[10px] mt-1">
                            {new Date(d.createdAt).toLocaleString('vi-VN')}
                          </div>
                        </div>

                        <div className="text-emerald-400 font-bold text-xs bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 whitespace-nowrap">
                          Đã ghi nhận
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
