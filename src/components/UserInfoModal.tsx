import React, { useState } from 'react';
import { UserProfile } from '../types';
import { checkIsAdmin } from '../firebase/config';
import { 
  X, 
  User, 
  Mail, 
  ShieldCheck, 
  Coins, 
  Phone, 
  Globe, 
  Building2, 
  Calendar, 
  Save, 
  CheckCircle2, 
  Edit3 
} from 'lucide-react';

interface UserInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpdateProfile: (data: Partial<UserProfile>) => void;
}

export const UserInfoModal: React.FC<UserInfoModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateProfile,
}) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [bio, setBio] = useState(user.bio || '');
  const [facebookUrl, setFacebookUrl] = useState(user.facebookUrl || user.fanpageUrl || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [bankName, setBankName] = useState(user.bankInfo?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(user.bankInfo?.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState(user.bankInfo?.accountHolder || '');
  const [isSaved, setIsSaved] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setDisplayName(user.displayName || '');
      setAvatarUrl(user.avatarUrl || '');
      setBio(user.bio || '');
      setFacebookUrl(user.facebookUrl || user.fanpageUrl || '');
      setPhoneNumber(user.phoneNumber || '');
      setBankName(user.bankInfo?.bankName || '');
      setAccountNumber(user.bankInfo?.accountNumber || '');
      setAccountHolder(user.bankInfo?.accountHolder || '');
      setIsSaved(false);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const isAdmin = user.role === 'admin' || checkIsAdmin(user?.email);
  const isAuthor = user.role === 'author';

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      if (!rawData) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 200;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setAvatarUrl(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          setAvatarUrl(rawData);
        }
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      displayName: displayName.trim() || user.displayName,
      avatarUrl: avatarUrl || user.avatarUrl,
      bio: bio.trim(),
      facebookUrl: facebookUrl.trim(),
      fanpageUrl: facebookUrl.trim(),
      phoneNumber: phoneNumber.trim(),
      bankInfo: {
        bankName,
        accountNumber,
        accountHolder,
      },
    });
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white uppercase tracking-wider">
                THÔNG TIN TÀI KHOẢN
              </h3>
              <p className="text-[11px] text-slate-500">
                Hồ sơ cá nhân và thông tin đại diện tác giả
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
          {isSaved && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Cập nhật thông tin thành công!</span>
            </div>
          )}

          {/* User overview banner with avatar upload */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
              <input
                type="file"
                ref={avatarInputRef}
                onChange={handleAvatarFile}
                accept="image/*"
                className="hidden"
              />
              {avatarUrl || user?.avatarUrl ? (
                <img
                  src={avatarUrl || user.avatarUrl}
                  alt={displayName || user.displayName || 'Avatar'}
                  className="w-16 h-16 rounded-full object-cover ring-2 ring-pink-500/50 shadow-sm"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-600 text-white flex items-center justify-center font-bold text-2xl ring-2 ring-pink-500/50 uppercase flex-shrink-0">
                  {(displayName || user?.displayName || 'U').charAt(0)}
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity">
                Đổi ảnh
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {user.displayName}
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  isAdmin 
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' 
                    : isAuthor 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' 
                    : 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-400/40 badge-reader-yellow font-extrabold'
                }`}>
                  {isAdmin ? 'ADMIN' : isAuthor ? 'TÁC GIẢ' : 'ĐỘC GIẢ'}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
              <div className="flex items-center gap-4 text-xs font-semibold mt-2 text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1 text-blue-600 dark:text-cyan-400">
                  <Coins className="w-3.5 h-3.5" />
                  {Number(user.xuBalance.toFixed(2))} Xu
                </span>
                <span>🌸 {user.flowerBalance || 0} Hoa đề cử</span>
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tên hiển thị / Bút danh
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Email đăng ký
              </label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs sm:text-sm text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Tiểu sử / Lời chào độc giả
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Giới thiệu đôi nét về bản thân hoặc các dự án truyện đang thực hiện..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Link Facebook / Fanpage
              </label>
              <input
                type="text"
                placeholder="https://facebook.com/..."
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Số điện thoại liên hệ
              </label>
              <input
                type="text"
                placeholder="09xx..."
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Bank Info (for author withdrawals) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-3">
            <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Tài khoản ngân hàng nhận nhuận bút (Tác giả / Editor)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Ngân hàng</label>
                <input
                  type="text"
                  placeholder="MB Bank, Vietcombank..."
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Số tài khoản</label>
                <input
                  type="text"
                  placeholder="0703765892..."
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Chủ tài khoản</label>
                <input
                  type="text"
                  placeholder="NGUYEN VAN A..."
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Cập nhật thông tin</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
