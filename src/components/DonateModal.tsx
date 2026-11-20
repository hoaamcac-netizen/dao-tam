import React, { useState } from 'react';
import { X, DollarSign, Heart, Sparkles, Coins, CheckCircle2 } from 'lucide-react';
import { Novel, UserProfile } from '../types';
import { CreatorProfileData } from './CreatorProfile';
import { formatXu } from '../utils/rulesAndVoices';

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
  creator: CreatorProfileData | null;
  novel?: Novel | null;
  user: UserProfile;
  onDonateXu: (creator: CreatorProfileData, amountXu: number, message: string, novel?: Novel | null) => Promise<boolean>;
  onOpenTopUp: () => void;
}

const PRESET_AMOUNTS = [10, 20, 50, 100, 200];

export const DonateModal: React.FC<DonateModalProps> = ({
  isOpen,
  onClose,
  creator,
  novel,
  user,
  onDonateXu,
  onOpenTopUp,
}) => {
  const [selectedAmount, setSelectedAmount] = useState<number>(20);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);
  const [message, setMessage] = useState('Ủng hộ người đăng / tác giả ra chương đều tay và nhiều kiệt tác mới nhé!');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen || !creator) return null;

  const actualAmount = isCustom ? Number(customAmount) || 0 : selectedAmount;
  const hasEnoughXu = user.xuBalance >= actualAmount;

  const handleConfirmDonate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualAmount <= 0) return;
    if (!hasEnoughXu) {
      onOpenTopUp();
      return;
    }

    setIsSubmitting(true);
    const success = await onDonateXu(creator, actualAmount, message, novel);
    setIsSubmitting(false);

    if (success) {
      setSuccessMessage(`Đã ủng hộ thành công ${formatXu(actualAmount)} Xu đến ${creator.name}! Giao dịch đã được ghi nhận vào tài khoản tác giả.`);
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 2200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shadow-inner">
              🎁
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-rose-200 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                Ủng Hộ Người Đăng &amp; Sáng Tác
              </div>
              <h3 className="text-lg font-bold text-white">
                Tặng Xu Cho {creator.name}
              </h3>
              {novel && (
                <div className="text-xs text-rose-100 font-medium truncate max-w-[260px]">
                  Truyện: "{novel.title}"
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {successMessage ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-2xl">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Cảm Ơn Đạo Hữu!
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {successMessage}
              </p>
            </div>
          ) : (
            <form onSubmit={handleConfirmDonate} className="space-y-4">
              {/* Wallet Balance Display */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Số dư ví của bạn:</span>
                <span className="font-bold text-blue-600 dark:text-cyan-400 flex items-center gap-1">
                  <Coins className="w-4 h-4" />
                  {formatXu(user.xuBalance)} Xu
                </span>
              </div>

              {/* Preset Amounts */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Chọn mức Xu ủng hộ:
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {(PRESET_AMOUNTS || []).map((amt) => {
                    const active = !isCustom && selectedAmount === amt;
                    return (
                      <button
                        type="button"
                        key={amt}
                        onClick={() => {
                          setSelectedAmount(amt);
                          setIsCustom(false);
                        }}
                        className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-500'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {formatXu(amt)} Xu
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Amount Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Hoặc nhập số Xu tùy chọn:
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    placeholder="Số Xu khác..."
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setIsCustom(true);
                    }}
                    onFocus={() => setIsCustom(true)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">
                    Xu
                  </span>
                </div>
              </div>

              {/* Message to Creator */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Lời nhắn gửi đến tác giả:
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                  placeholder="Gửi lời động viên..."
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2">
                {hasEnoughXu ? (
                  <button
                    type="submit"
                    disabled={isSubmitting || actualAmount <= 0}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold text-xs shadow-md shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <DollarSign className="w-4 h-4 stroke-[2.5]" />
                    <span>
                      {isSubmitting ? 'Đang gửi donate...' : `Xác Nhận Ủng Hộ ${formatXu(actualAmount)} Xu (~${formatXu(actualAmount)}đ)`}
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-center text-xs text-rose-500 font-medium">
                      Số dư ví không đủ (cần {formatXu(actualAmount)} Xu, hiện có {formatXu(user.xuBalance)} Xu)
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTopUp();
                      }}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Coins className="w-4 h-4" />
                      <span>Nạp Thêm Xu Vào Ví</span>
                    </button>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
