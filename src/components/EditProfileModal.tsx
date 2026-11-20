import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from '../types';
import { X, Upload, Check, Link as LinkIcon } from 'lucide-react';

export const PRESET_AVATARS = [
  {
    group: 'Tiên Hiệp & Tu Chân',
    avatars: [
      { name: 'Kiếm Tiên', url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=150&q=80' },
      { name: 'Đạo Trưởng', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=150&q=80' },
      { name: 'Thần Thú', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=150&q=80' },
      { name: 'Luyện Đan', url: 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=150&q=80' },
    ]
  },
  {
    group: 'Cổ Đại & Cung Đình',
    avatars: [
      { name: 'Quân Vương', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80' },
      { name: 'Thư Sinh', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80' },
      { name: 'Tướng Quân', url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=150&q=80' },
      { name: 'Ẩn Sĩ', url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80' },
    ]
  }
];

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onSaveProfile: (
    name: string, 
    avatarUrl: string,
    extra?: any
  ) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onSaveProfile,
}) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [urlInput, setUrlInput] = useState('');
  const [showUrlField, setShowUrlField] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(user.displayName || '');
      setAvatarUrl(user.avatarUrl || '');
      setUrlInput('');
      setShowUrlField(false);
      setIsSaved(false);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          const compressed = canvas.toDataURL('image/jpeg', 0.8);
          setAvatarUrl(compressed);
        } else {
          setAvatarUrl(rawData);
        }
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) return;
    setAvatarUrl(urlInput.trim());
    setUrlInput('');
    setShowUrlField(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = displayName.trim();
    if (!cleanName) {
      alert('Vui lòng nhập bút danh hoặc tên hiển thị.');
      return;
    }

    onSaveProfile(cleanName, avatarUrl);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-pink-100 overflow-hidden relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Nền trắng, Chữ đen & hồng */}
        <div className="px-6 py-4 border-b border-pink-100 flex items-center justify-between bg-white">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Sửa Ảnh Đại Diện &amp; Bút Danh</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body: Nền trắng chữ đen/hồng */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-white text-slate-900">
          
          {/* 1. Chỗ tải ảnh đại diện */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full border-3 border-pink-500 overflow-hidden bg-slate-100 flex items-center justify-center shadow-md">
                {avatarUrl && avatarUrl.trim() !== '' ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-pink-600 uppercase">
                    {(displayName || user.displayName || 'U').charAt(0)}
                  </span>
                )}
              </div>
            </div>

            {/* Nút bấm tải ảnh từ máy tính / điện thoại */}
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Tải ảnh từ máy</span>
              </button>

              <button
                type="button"
                onClick={() => setShowUrlField(!showUrlField)}
                className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1 transition cursor-pointer"
              >
                <LinkIcon className="w-3.5 h-3.5 text-pink-600" />
                <span>Dán link ảnh</span>
              </button>
            </div>

            {/* Ô dán link ảnh nếu người dùng chọn */}
            {showUrlField && (
              <div className="w-full flex gap-2 pt-1 animate-in fade-in duration-150">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/anh-dai-dien.jpg"
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="px-3 py-2 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 cursor-pointer"
                >
                  Áp dụng
                </button>
              </div>
            )}
          </div>

          {/* 2. Bút danh */}
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-bold text-slate-900">
              Bút Danh / Tên Hiển Thị: <span className="text-pink-600">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nhập bút danh của bạn..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 font-semibold placeholder-slate-400 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
              required
            />
          </div>

          {/* Thông báo đã lưu */}
          {isSaved && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center justify-center gap-1.5 font-bold">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Đã cập nhật ảnh đại diện và bút danh thành công!</span>
            </div>
          )}

          {/* Nút hành động */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white font-bold text-xs shadow-md shadow-pink-500/25 transition cursor-pointer"
            >
              Lưu thay đổi
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
