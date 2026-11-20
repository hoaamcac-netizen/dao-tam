import React, { useState, useRef } from 'react';
import { UserProfile, ReadingProgress, Novel, TopUpRequest, NovelSubmission } from '../types';
import { formatXu } from '../utils/rulesAndVoices';
import { 
  X, 
  User, 
  Bookmark, 
  Trash2, 
  BookOpen, 
  ExternalLink, 
  Cloud, 
  CheckCircle2, 
  Sparkles,
  ShieldCheck,
  LogIn,
  LogOut,
  Camera,
  Edit3,
  Upload,
  Save,
  Coins,
  History,
  Lock,
  Plus,
  BookPlus,
  CreditCard,
  Building2,
  Clock,
  Link as LinkIcon,
  Check
} from 'lucide-react';
import { DaoTamLogo } from './DaoTamLogo';
import { PRESET_AVATARS } from './EditProfileModal';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onLogin: () => void;
  onLogout: () => void;
  onClearHistory: () => void;
  onResumeReading: (novelId: string, chapterId: string) => void;
  onUpdateProfile: (name: string, avatarUrl: string) => void;
  onOpenTopUp: () => void;
  onOpenAuthorShowcase?: () => void;
  onOpenSubmitNovel?: () => void;
  onOpenRegisterCreator?: () => void;
  topUpRequests?: TopUpRequest[];
  userSubmissions?: NovelSubmission[];
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogin,
  onLogout,
  onClearHistory,
  onResumeReading,
  onUpdateProfile,
  onOpenTopUp,
  onOpenAuthorShowcase,
  onOpenSubmitNovel,
  onOpenRegisterCreator,
  topUpRequests = [],
  userSubmissions = [],
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'wallet' | 'reading' | 'creator'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isAuthor = user?.role === 'author' || user?.role === 'admin';
  const safeReadingHistory = Array.isArray(user?.readingHistory) ? user.readingHistory : [];
  const safePurchases = Array.isArray(user?.purchases) ? user.purchases : [];
  const safeSubmissions = Array.isArray(userSubmissions) ? userSubmissions : [];
  const safeTopUps = Array.isArray(topUpRequests) ? topUpRequests : [];

  const mySubmission = safeSubmissions.find((s) => s.submittedBy?.userId === user?.id || s.submittedBy?.userEmail === user?.email);

  // Lọc lịch sử nạp xu của user
  const myTopUps = safeTopUps.filter((r) => r.userId === user?.id || r.userEmail === user?.email);

  // Lịch sử biến động số dư: kết hợp nạp xu và mua chương
  const combinedHistory = [
    ...(myTopUps || []).map((t) => ({
      id: `topup-${t.id}`,
      type: 'topup' as const,
      title: `Nạp Xu qua ${t.bankName || 'Ngân Hàng'}`,
      amount: t.xuAmount,
      isPositive: true,
      timestamp: t.createdAt,
      status: t.status,
    })),
    ...(safePurchases || []).map((p) => ({
      id: `purchase-${p.id}`,
      type: 'purchase' as const,
      title: p.type === 'chapter' ? `Mở khóa Chương ${p.chapterNumber || ''}: ${p.novelTitle}` : `Mở khóa trọn bộ: ${p.novelTitle}`,
      amount: p.pricePaid,
      isPositive: false,
      timestamp: p.purchasedAt,
      status: 'approved',
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Kích thước ảnh tối đa là 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setAvatarUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    setAvatarUrl(customUrl.trim());
    setCustomUrl('');
    setShowUrlInput(false);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      alert('Biệt danh / Bút danh không được để trống.');
      return;
    }
    onUpdateProfile(trimmed, avatarUrl);
    setIsEditing(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleOpenCreator = () => {
    onClose();
    if (onOpenRegisterCreator) {
      onOpenRegisterCreator();
    } else if (onOpenSubmitNovel) {
      onOpenSubmitNovel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-slate-200">
      <div className="w-full max-w-2xl bg-[#090d16] border border-blue-500/40 rounded-2xl p-5 sm:p-6 shadow-2xl relative max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-sky-400">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-bold text-white flex items-center gap-2">
              Tài Khoản &amp; Hồ Sơ Cá Nhân
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                user.role === 'admin'
                  ? 'bg-blue-600/20 text-sky-300 border-blue-500/40'
                  : user.role === 'author'
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-400/40 badge-reader-yellow font-extrabold'
              }`}>
                {user.role === 'admin' ? '👑 Admin' : user.role === 'author' ? '✍️ Tác Giả / Editor' : '📖 Độc Giả'}
              </span>
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              <span>Đồng bộ tiến trình đọc, ví xu và hồ sơ theo thời gian thực</span>
            </div>
          </div>
        </div>

        {/* Top Profile Summary Card */}
        <div className="my-3 p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 w-full sm:w-auto">
            <div className="relative group flex-shrink-0">
              {avatarUrl || user?.avatarUrl ? (
                <img
                  src={avatarUrl || user.avatarUrl}
                  alt={user.displayName}
                  className="w-13 h-13 rounded-full object-cover border-2 border-sky-400 shadow-md"
                />
              ) : (
                <div className="w-13 h-13 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-xl border-2 border-sky-400 shadow-md uppercase">
                  {(user?.displayName || 'U').charAt(0)}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setActiveTab('profile');
                }}
                className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Bấm để đổi ảnh đại diện"
              >
                <Camera className="w-4 h-4 text-sky-300" />
                <span className="text-[9px] font-bold">Đổi ảnh</span>
              </button>
            </div>

            <div className="min-w-0">
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <span className="truncate">{user.displayName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(!isEditing);
                    setActiveTab('profile');
                  }}
                  className="px-2 py-0.5 rounded-md bg-blue-600/20 hover:bg-blue-600/30 text-sky-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors border border-blue-500/30"
                  title="Chỉnh sửa tên và ảnh đại diện"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditing ? 'Đang sửa' : 'Đổi tên & Avatar'}</span>
                </button>
              </div>
              <div className="text-xs text-slate-400 truncate mt-0.5">
                {user.email || 'Khách vãng lai (Chưa đăng nhập Gmail)'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {user.isLoggedIn ? (
              <button
                onClick={onLogout}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 text-xs font-semibold cursor-pointer transition-colors"
              >
                Đăng xuất
              </button>
            ) : (
              <button
                onClick={onLogin}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow"
              >
                <LogIn className="w-3.5 h-3.5" />
                Đăng nhập Gmail
              </button>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border-b border-slate-800 text-xs mb-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2 px-3 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-sky-500 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-sky-400" />
            <span>Đổi Tên &amp; Avatar</span>
          </button>

          <button
            onClick={() => setActiveTab('wallet')}
            className={`py-2 px-3 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'wallet'
                ? 'border-blue-500 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Coins className="w-3.5 h-3.5 text-sky-400" />
            <span>Ví Xu &amp; Giao Dịch</span>
          </button>

          <button
            onClick={() => setActiveTab('reading')}
            className={`py-2 px-3 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'reading'
                ? 'border-blue-500 text-sky-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5 text-sky-400" />
            <span>Tiến Trình Đọc ({safeReadingHistory?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('creator')}
            className={`py-2 px-3 font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'creator'
                ? 'border-pink-500 text-pink-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <BookPlus className="w-3.5 h-3.5 text-pink-400" />
            <span>{isAuthor ? 'Bàn Làm Việc Tác Giả' : '✍️ Đăng Ký Làm Tác Giả/Editor'}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          
          {/* TAB 0: ĐỔI TÊN & ĐỔI ẢNH ĐẠI DIỆN */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Đã cập nhật tên và ảnh đại diện thành công!</span>
                </div>
              )}

              {/* Input Display Name */}
              <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Biệt Danh / Bút Danh Độc Giả:</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {displayName?.length || 0}/40 ký tự
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={40}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nhập tên biệt danh mới..."
                    className="w-full bg-black border border-slate-700 focus:border-sky-500 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none pl-9"
                    required
                  />
                  <User className="w-4 h-4 text-sky-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[11px] text-slate-400">
                  Tên này sẽ xuất hiện trên bình luận, điểm danh nhận hoa và bảng đề cử truyện.
                </p>
              </div>

              {/* Avatar Selection Area */}
              <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-sky-400" />
                    <span>Chọn Hoặc Tải Ảnh Đại Diện Mới:</span>
                  </label>

                  {/* Upload from device buttons */}
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleAvatarFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow transition-all hover:scale-102"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Tải ảnh từ máy</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Dán URL</span>
                    </button>
                  </div>
                </div>

                {/* Direct URL input if expanded */}
                {showUrlInput && (
                  <div className="p-2.5 rounded-lg bg-black border border-slate-700 flex items-center gap-2 text-xs">
                    <input
                      type="url"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder="https://example.com/anh-dai-dien.jpg"
                      className="flex-1 bg-transparent border-none text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCustomUrl}
                      className="px-3 py-1 rounded bg-sky-600 text-white font-bold text-xs cursor-pointer hover:bg-sky-500"
                    >
                      Áp dụng
                    </button>
                  </div>
                )}

                {/* Curated Preset Avatars Grid */}
                <div className="space-y-3 pt-1">
                  <div className="text-[11px] text-slate-400 font-semibold">
                    Bộ sưu tập Avatar độc quyền:
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {(PRESET_AVATARS || []).flatMap((g: { avatars: { name: string; url: string }[] }) => g?.avatars || []).slice(0, 12)?.map((item: { name: string; url: string }) => {
                      const isSelected = avatarUrl === item.url;
                      return (
                        <button
                          key={item.url}
                          type="button"
                          onClick={() => setAvatarUrl(item.url)}
                          className={`group relative p-1 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600/20 border-sky-400 ring-2 ring-sky-400/50 scale-105'
                              : 'bg-black/40 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <img
                            src={item.url}
                            alt={item.name}
                            className="w-11 h-11 rounded-full object-cover border border-slate-700 group-hover:border-sky-400"
                          />
                          <span className="text-[9px] text-slate-300 truncate max-w-full text-center px-0.5">
                            {item.name}
                          </span>
                          {isSelected && (
                            <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-sky-500 text-white flex items-center justify-center">
                              <Check className="w-2 h-2 stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer transition-all hover:scale-102"
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu Thay Đổi Tên &amp; Avatar</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 1: VÍ XU & LỊCH SỬ BIẾN ĐỘNG SỐ DƯ */}
          {activeTab === 'wallet' && (
            <div className="space-y-4">
              {/* Balance Summary Box */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0e1424] border border-blue-500/30">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
                    <Coins className="w-3.5 h-3.5 text-sky-400" />
                    Số Dư Xu
                  </div>
                  <div className="text-xl font-extrabold text-sky-300">
                    {formatXu(user.xuBalance)} Xu
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenTopUp();
                    }}
                    className="mt-2 text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Nạp thêm Xu
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0e1424] border border-pink-500/30">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
                    <span>🌸</span> Hoa Đề Cử
                  </div>
                  <div className="text-xl font-extrabold text-pink-400">
                    {user.role === 'admin' ? '∞' : (user.flowerBalance || 0)}
                  </div>
                  <div className="mt-2 text-[10px] text-pink-300">
                    Đăng nhập Gmail nhận 5 hoa (24h/lần)
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Chương VIP Đã Mở
                  </div>
                  <div className="text-xl font-extrabold text-white">
                    {Object.values(user?.unlockedChapters || {}).reduce((acc, c) => acc + (Array.isArray(c) ? c.length : 0), 0)}
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400">
                    Đọc vĩnh viễn không giới hạn
                  </div>
                </div>
              </div>

              {/* Notice on Xu rules */}
              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 text-[11px] text-sky-200 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Quy tắc Ví Xu:</strong> Độc giả mặc định có <strong>0 Xu</strong>. Xu chỉ được cộng vào ví sau khi bạn gửi yêu cầu nạp tiền và được Admin kiểm tra phê duyệt.
                </div>
              </div>

              {/* Lịch Sử Biến Động Số Dư */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-sky-400" />
                  Lịch Sử Biến Động Số Dư ({combinedHistory?.length || 0})
                </h4>

                {(combinedHistory?.length || 0) === 0 ? (
                  <div className="p-6 rounded-xl bg-[#0e1424] text-xs text-slate-500 text-center">
                    Chưa có giao dịch biến động số dư nào. Khi nạp tiền hoặc mua chương VIP, dữ liệu sẽ được lưu tại đây.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(combinedHistory || []).map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-[#0e1424] border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(item.timestamp).toLocaleString('vi-VN')}
                          </div>
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <div className={`font-extrabold text-sm ${
                            item.isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {item.isPositive ? `+${formatXu(item.amount)}` : `-${formatXu(item.amount)}`} Xu
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            item.status === 'approved' 
                              ? 'bg-emerald-500/20 text-emerald-300' 
                              : item.status === 'rejected'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {item.status === 'approved' ? 'Thành công' : item.status === 'rejected' ? 'Thất bại' : 'Chờ duyệt'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: TIẾN TRÌNH ĐỌC */}
          {activeTab === 'reading' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Danh sách các truyện đã lưu tiến trình:</span>
                {(safeReadingHistory?.length || 0) > 0 && (
                  <button
                    onClick={onClearHistory}
                    className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Xóa tất cả
                  </button>
                )}
              </div>

              {(safeReadingHistory?.length || 0) === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Bạn chưa đọc chương nào. Hãy chọn truyện trên trang chủ để bắt đầu!
                </div>
              ) : (
                <div className="space-y-2">
                  {(safeReadingHistory || []).map((item) => (
                    <div
                      key={item.novelId}
                      onClick={() => {
                        onClose();
                        onResumeReading(item.novelId, item.chapterId);
                      }}
                      className="p-3 rounded-xl bg-[#0e1424] hover:bg-[#131b2e] border border-slate-800 hover:border-sky-500/50 flex items-center justify-between gap-3 cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={item.novelCover || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                          alt={item.novelTitle}
                          className="w-10 h-14 object-cover rounded-md flex-shrink-0 border border-slate-700"
                        />
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-white group-hover:text-sky-300 truncate">
                            {item.novelTitle}
                          </h4>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Chương {item.chapterNumber} • {item.scrollPercentage}%
                          </div>
                        </div>
                      </div>

                      <span className="text-xs text-sky-400 font-semibold group-hover:underline">
                        Đọc tiếp &rarr;
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ĐĂNG KÝ TRỞ THÀNH TÁC GIẢ & EDITOR */}
          {activeTab === 'creator' && (
            <div className="space-y-4">
              {isAuthor ? (
                /* Already an author / admin */
                <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-[#0e1424] border border-indigo-500/40 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-white">
                        Tài Khoản Tác Giả &amp; Editor Chính Thức
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Bạn đã được BQT Đạo Tâm kích hoạt quyền đăng truyện, quản lý tác phẩm và nhận nhuận bút VIP.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        onClose();
                        if (onOpenAuthorShowcase) onOpenAuthorShowcase();
                      }}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all hover:scale-101"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-300" />
                      <span>Truy Cập Bàn Làm Việc Tác Giả (Quản Lý &amp; Soạn Thảo)</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Reader applying to become Author */
                <div className="p-5 rounded-2xl bg-[#0e1424] border border-pink-500/30 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-pink-600/20 border border-pink-500/40 flex items-center justify-center text-pink-400">
                      <BookPlus className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-white">
                        Đăng Ký Trở Thành Tác Giả &amp; Editor
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Thăng cấp tài khoản Độc Giả thành Tác Giả / Editor để tự do xuất bản truyện và nhận nhuận bút lên tới 95%.
                      </p>
                    </div>
                  </div>

                  {mySubmission && mySubmission.status === 'pending' && (
                    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-300">
                        <Clock className="w-4 h-4" />
                        <span>Hồ sơ đang chờ Ban Quản Trị thẩm định</span>
                      </div>
                      <p className="text-slate-300 text-[11px]">
                        Tác phẩm: <strong>"{mySubmission.title}"</strong> ({mySubmission?.chapters?.length || 5} chương bản thảo mẫu). Kết quả xét duyệt sẽ được thông báo sớm nhất!
                      </p>
                    </div>
                  )}

                  <div className="p-3.5 rounded-xl bg-black/50 border border-slate-800 text-xs text-slate-300 space-y-2">
                    <div className="font-bold text-pink-300">Quyền lợi và điều kiện xét duyệt:</div>
                    <ul className="list-disc pl-5 space-y-1 text-slate-400">
                      <li><strong>Tác giả sáng tác:</strong> Nhận <strong className="text-emerald-400">95%</strong> doanh thu mở khóa chương VIP</li>
                      <li><strong>Editor độc quyền:</strong> Nhận <strong className="text-amber-400">90%</strong> doanh thu + Đẩy Top Bảng Vàng</li>
                      <li><strong>Editor không độc quyền:</strong> Nhận <strong className="text-indigo-400">70%</strong> doanh thu</li>
                      <li><strong>Yêu cầu xét duyệt:</strong> Gửi <strong>5 chương bản thảo mẫu</strong> để BQT thẩm định chất lượng (Thông tin STK ngân hàng để trống, sẽ nhập sau khi được duyệt)</li>
                    </ul>
                  </div>

                  <button
                    onClick={handleOpenCreator}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-pink-600/30 cursor-pointer transition-all hover:scale-101"
                  >
                    <BookPlus className="w-4 h-4" />
                    <span>Mở Đơn Đăng Ký Trở Thành Tác Giả &amp; Editor</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
