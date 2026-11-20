import React, { useState } from 'react';
import { Novel, UserProfile } from '../types';
import { checkIsAdmin } from '../firebase/config';
import { X, Heart, CheckCircle2, AlertCircle } from 'lucide-react';

interface NominateNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  novel: Novel | null;
  user: UserProfile;
  onNominate: (novelId: string, flowerCount: number) => void;
  onOpenDailyReward: () => void;
}

export const NominateNovelModal: React.FC<NominateNovelModalProps> = ({
  isOpen,
  onClose,
  novel,
  user,
  onNominate,
  onOpenDailyReward,
}) => {
  const [selectedAmount, setSelectedAmount] = useState<number>(5);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !novel) return null;

  const isAdmin = user.role === 'admin' || checkIsAdmin(user?.email);
  const userFlowers = user.flowerBalance ?? 0;

  // Preset flower amounts matching Image 3 (1, 5, 10, 20, 50, 100)
  const quickAmounts = [1, 5, 10, 20, 50, 100];
  if (isAdmin) {
    quickAmounts.push(500, 1000);
  }

  const effectiveAmount = customAmount ? parseInt(customAmount, 10) || 0 : selectedAmount;

  const handleNominateSubmit = () => {
    setErrorMsg('');
    if (!effectiveAmount || effectiveAmount <= 0) {
      setErrorMsg('Vui lòng chọn hoặc nhập số hoa hợp lệ (tối thiểu 1 hoa)!');
      return;
    }

    if (!isAdmin && effectiveAmount > userFlowers) {
      setErrorMsg(`Bạn không đủ hoa (Hiện có: ${userFlowers} hoa). Hãy điểm danh mỗi ngày để nhận thêm hoa miễn phí!`);
      return;
    }

    onNominate(novel.id, effectiveAmount);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Modal Dialog: White background, black text as instructed by user */}
      <div 
        className="relative w-full max-w-md bg-white border border-pink-200/90 rounded-3xl p-6 sm:p-7 shadow-2xl text-slate-900 overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
          title="Đóng cửa sổ"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title matching Image 3 */}
        <div className="flex items-center gap-2.5 mb-5">
          <span className="text-2xl flex-shrink-0">🌸</span>
          <div>
            <h2 className="font-serif text-xl font-black text-slate-950 leading-tight">
              Đề Cử Tác Phẩm
            </h2>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Tặng hoa hồng để vinh danh tác phẩm lên Bảng Vàng
            </p>
          </div>
        </div>

        {/* Novel Card Preview matching Image 3 */}
        <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-pink-50/70 border border-pink-200/80 mb-4 shadow-2xs">
          <img
            src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
            alt={novel.title}
            className="w-14 h-20 object-cover rounded-xl border border-pink-300 flex-shrink-0 shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-slate-950 truncate leading-snug">
              {novel.title}
            </h3>
            <p className="text-xs text-slate-700 font-medium mt-0.5">
              Tác giả: <span className="text-pink-600 font-bold">{novel.author}</span>
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-300 text-[11px] font-extrabold flex items-center gap-1 shadow-2xs">
                <span>🌸</span>
                <span>{(novel.flowerCount || 0).toLocaleString()} Hoa hiện có</span>
              </span>
            </div>
          </div>
        </div>

        {/* User Balance Card ("TÚI HOA CỦA BẠN" matching Image 3) */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 mb-5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[11px] text-slate-600 uppercase tracking-wider font-extrabold">
              TÚI HOA CỦA BẠN
            </div>
            <div className="text-lg font-black text-slate-950 flex items-center gap-1.5 mt-0.5">
              <span className="text-pink-500">🌸</span>
              <span>{isAdmin ? 'Vô Hạn (∞)' : userFlowers}</span>
              <span className="text-xs text-slate-600 font-normal">hoa</span>
            </div>
          </div>

          {!isAdmin && (
            <button
              onClick={() => {
                onClose();
                onOpenDailyReward();
              }}
              className="text-xs text-pink-600 hover:text-pink-700 underline font-bold cursor-pointer"
            >
              + Nhận 5 hoa hôm nay
            </button>
          )}

          {isAdmin && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">
              👑 Admin: Hoa Vô Hạn
            </span>
          )}
        </div>

        {/* Quick Amount Options matching Image 3 */}
        <div className="mb-4">
          <label className="block text-xs font-black text-slate-950 uppercase tracking-wider mb-2.5">
            CHỌN SỐ LƯỢNG HOA ĐỀ CỬ:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(quickAmounts || []).map((amt) => {
              const isSelected = !customAmount && selectedAmount === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setSelectedAmount(amt);
                    setCustomAmount('');
                    setErrorMsg('');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                    isSelected
                      ? 'bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-500/30 scale-102 font-black'
                      : 'bg-slate-100 text-slate-900 hover:bg-pink-50 border-slate-200 hover:border-pink-300'
                  }`}
                >
                  <span>🌸</span>
                  <span>{amt}</span>
                  <span className="text-[11px] font-medium">hoa</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Amount Input matching Image 3 */}
        <div className="mb-5">
          <div className="relative">
            <input
              type="number"
              min="1"
              max={isAdmin ? 999999 : userFlowers}
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setErrorMsg('');
              }}
              placeholder="Hoặc tự nhập số hoa muốn tặng..."
              className="w-full bg-slate-50 border border-slate-300 focus:border-pink-500 rounded-xl py-2.5 pl-3.5 pr-16 text-xs text-slate-950 font-bold placeholder:text-slate-400 focus:outline-none focus:bg-white transition-all"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-pink-600">
              🌸 Hoa
            </span>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success message / Submit Button */}
        {isSuccess ? (
          <div className="py-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 font-black text-sm flex items-center justify-center gap-2 shadow-inner">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Đã đề cử thành công {effectiveAmount} hoa cho tác phẩm!</span>
          </div>
        ) : (
          <button
            onClick={handleNominateSubmit}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 hover:from-pink-700 hover:to-amber-600 text-white font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-pink-500/25 hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Heart className="w-4 h-4 fill-white text-white" />
            <span>XÁC NHẬN ĐỀ CỬ ({effectiveAmount} HOA)</span>
          </button>
        )}
      </div>
    </div>
  );
};
