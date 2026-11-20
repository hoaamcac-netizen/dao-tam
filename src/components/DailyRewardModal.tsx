import React, { useState } from 'react';
import { Sparkles, CheckCircle2, Calendar, Trophy, X, LogIn, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../types';
import { checkIsAdmin } from '../firebase/config';

interface DailyRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onClaim: () => void;
  onLogin: () => void;
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export const DailyRewardModal: React.FC<DailyRewardModalProps> = ({
  isOpen,
  onClose,
  user,
  onClaim,
  onLogin,
}) => {
  const [isClaiming, setIsClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);

  if (!isOpen) return null;

  const isAdmin = checkIsAdmin(user?.email);
  const isGmailLoggedIn = Boolean(user.isLoggedIn && user.email && user.id !== 'guest');

  // Cooldown calculation: Tự động làm mới sau 24h không cần hiển thị đồng hồ đếm giờ
  const lastTime = user.lastDailyRewardTimestamp || 0;
  const elapsed = Date.now() - lastTime;
  const canClaim = isGmailLoggedIn && (!lastTime || elapsed >= COOLDOWN_MS) && !justClaimed;

  const handleClaimClick = () => {
    if (!canClaim || isClaiming) return;
    setIsClaiming(true);
    setTimeout(() => {
      onClaim();
      setIsClaiming(false);
      setJustClaimed(true);
    }, 300);
  };

  const todayStr = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-md bg-white border border-pink-200 rounded-3xl p-6 sm:p-7 shadow-2xl text-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient background effect */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-pink-100/60 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-black flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon */}
        <div className="relative inline-flex items-center justify-center mb-2">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 p-1 shadow-md shadow-pink-400/30">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-3xl">
              🌸
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-400 text-stone-950 font-black text-[10px] px-2 py-0.5 rounded-full shadow-xs border border-amber-300">
            +5 HOA
          </div>
        </div>

        {/* Title & Date */}
        <h2 className="text-xl font-black text-slate-900">
          Điểm Danh Nhận Hoa
        </h2>
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 mt-1 mb-4 font-medium">
          <Calendar className="w-3.5 h-3.5 text-rose-500" />
          <span className="capitalize">{todayStr}</span>
        </div>

        {/* Flower Balance Badge */}
        <div className="bg-pink-50/60 border border-pink-200/80 rounded-2xl p-4 mb-4 text-left flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[11px] text-slate-600 font-semibold uppercase tracking-wider">Túi hoa hiện có</div>
            <div className="text-2xl font-black text-slate-900 flex items-center gap-1.5 mt-0.5">
              <span>🌸</span>
              <span className="text-rose-600">{isAdmin ? 'Vô Hạn (∞)' : (user.flowerBalance ?? 0)}</span>
              <span className="text-xs text-slate-600 font-bold">hoa</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] px-3 py-1 rounded-full bg-white text-rose-700 border border-rose-200 font-bold inline-flex items-center gap-1 shadow-2xs">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              Đề cử truyện hay
            </span>
          </div>
        </div>

        {/* CASE 1: USER IS NOT LOGGED IN WITH GMAIL */}
        {!isGmailLoggedIn ? (
          <div className="space-y-4">
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 text-left space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                Yêu cầu đăng nhập tài khoản Gmail:
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Độc giả đăng nhập bằng Gmail để lưu 5 hoa mỗi ngày vào tài khoản. Sau 24h hệ thống sẽ tự động làm mới lượt điểm danh tiếp theo.
              </p>
            </div>

            <button
              onClick={() => {
                onClose();
                onLogin();
              }}
              className="w-full py-3 px-5 rounded-2xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold text-xs sm:text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-md shadow-rose-500/25 transition cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-white" />
              <span>Đăng Nhập Gmail Để Bắt Đầu Điểm Danh</span>
            </button>
          </div>
        ) : (
          /* CASE 2: LOGGED IN WITH GMAIL */
          <div className="space-y-4">
            <div className="text-xs text-slate-700 leading-relaxed text-left bg-slate-50 rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-1">
              <p className="flex items-center gap-2">
                <span className="text-rose-500 font-bold">✦</span>
                <span>Tài khoản: <strong className="text-slate-900">{user.email}</strong></span>
              </p>
              <p className="flex items-center gap-2">
                <span className="text-rose-500 font-bold">✦</span>
                <span>Mỗi lần nhận <strong className="text-rose-600">5 hoa 🌸</strong>. Sau 24h sẽ tự động làm mới lượt tiếp theo.</span>
              </p>
            </div>

            {/* ACTION */}
            {canClaim ? (
              <button
                onClick={handleClaimClick}
                disabled={isClaiming}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 active:scale-98 text-white font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4 animate-spin text-amber-200" />
                <span>{isClaiming ? 'Đang Nhận Hoa...' : '🌸 Điểm Danh Nhận 5 Hoa Ngay'}</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="w-full py-3 px-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Hôm nay bạn đã nhận 5 hoa thành công!</span>
                </div>

                <p className="text-xs text-slate-500 font-medium">
                  Lượt điểm danh sẽ tự động làm mới sau 24h.
                </p>

                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer transition shadow-2xs"
                >
                  Đóng
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
