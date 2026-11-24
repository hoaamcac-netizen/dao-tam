import React, { useState, useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import { UserProfile } from '../types';
import { DaoTamLogo } from './DaoTamLogo';
import { 
  syncUserProfile,
  detectInAppBrowser,
} from '../firebase/services';
import { X, RotateCw, AlertCircle, ShieldAlert, ExternalLink, Copy, Check } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onSuccessLogin: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccessLogin,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPopupBlocked, setIsPopupBlocked] = useState(false);
  const [isOriginMismatch, setIsOriginMismatch] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const isInAppBrowser = detectInAppBrowser();

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setIsPopupBlocked(false);
    setIsOriginMismatch(false);
    setCopiedUrl(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const currentHostname =
    typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopyCurrentUrl = async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {}
  };

  // Gọi trực tiếp và đồng bộ signInWithPopup(auth, googleProvider) ngay trong onClick để Safari iPhone không chặn popup
  const handleGoogleSignIn = async () => {
    try {
      const popupPromise = signInWithPopup(auth, googleProvider);
      setIsLoading(true);
      setErrorMsg(null);
      setIsPopupBlocked(false);
      setIsOriginMismatch(false);

      const result = await popupPromise;
      const fbUser = result.user;
      if (fbUser?.email) {
        const profile = await syncUserProfile(fbUser);
        onSuccessLogin(profile);
        onClose();
        return;
      }
    } catch (fbErr: any) {
      const code = fbErr?.code || '';
      const errMsg = fbErr?.message || String(fbErr);

      if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        setIsPopupBlocked(true);
        setErrorMsg(
          "Trình duyệt đang chặn cửa sổ đăng nhập. Vui lòng chọn 'Cho phép' (Allow) hoặc mở web bằng trình duyệt Safari/Chrome ngoài."
        );
        return;
      }

      if (
        code === 'auth/popup-closed-by-user' ||
        errMsg.includes('popup-closed-by-user') ||
        errMsg.includes('access_denied')
      ) {
        setErrorMsg('Bạn đã đóng cửa sổ đăng nhập Google.');
        return;
      }

      if (
        code === 'auth/unauthorized-domain' ||
        errMsg.includes('origin_mismatch') ||
        errMsg.includes('unregistered_origin')
      ) {
        setIsOriginMismatch(true);
        setErrorMsg(
          `Tên miền "${currentHostname}" chưa được cấp phép đăng nhập Google. Vui lòng liên hệ quản trị viên để cấu hình tên miền được phép.`
        );
        return;
      }

      console.warn('Firebase Google sign-in error:', fbErr);
      setErrorMsg(`Không thể đăng nhập bằng Google (${code || errMsg}). Vui lòng thử lại.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer z-10"
          title="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8 space-y-5 flex flex-col items-center text-center">
          {/* Logo & Tiêu đề */}
          <div className="flex flex-col items-center space-y-2">
            <DaoTamLogo size="md" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Đăng nhập tài khoản Đạo Tâm
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Xác thực an toàn bằng tài khoản Google của bạn
            </p>
          </div>

          {/* Cảnh báo trình duyệt nhúng Messenger / Zalo / Facebook / TikTok */}
          {isInAppBrowser && (
            <div
              role="alert"
              className="w-full p-3.5 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100 text-xs text-left leading-relaxed space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <ExternalLink className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="font-semibold">
                  Trình duyệt Messenger/Zalo chặn đăng nhập Google. Vui lòng bấm dấu 3 chấm (...) góc trên bên phải &rarr; chọn Mở bằng Safari hoặc Chrome.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyCurrentUrl}
                className="w-full py-2 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-100 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Đã sao chép link trang web</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép link để dán vào Safari / Chrome</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Thông báo nếu có lỗi hoặc bị chặn popup / thiếu domain */}
          {errorMsg && (
            <div className={`w-full p-3.5 rounded-2xl border text-xs flex flex-col gap-2.5 text-left leading-relaxed ${
              isOriginMismatch
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100'
                : isPopupBlocked 
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
            }`}>
              <div className="flex items-start gap-2.5">
                {isOriginMismatch || isPopupBlocked ? (
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span className="font-medium">{errorMsg}</span>
                </div>
              </div>

              {isOriginMismatch && (
                <div className="mt-1 pt-2 border-t border-amber-200 dark:border-amber-800/60 text-[11px] space-y-2">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    Thông tin tên miền cần cấp phép trong cài đặt xác thực hệ thống:
                  </p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                    <li>
                      Tên miền (Domain):
                      <code className="block mt-0.5 p-1 bg-amber-100/80 dark:bg-amber-900/50 rounded font-mono text-[10px] break-all select-all">
                        {currentHostname}
                      </code>
                    </li>
                    <li>
                      Nguồn gốc truy cập (Origin):
                      <code className="block mt-0.5 p-1 bg-amber-100/80 dark:bg-amber-900/50 rounded font-mono text-[10px] break-all select-all">
                        {currentOrigin}
                      </code>
                    </li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Nút Đăng nhập bằng Google qua Firebase Auth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-rose-500 dark:hover:border-rose-500 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-3 text-sm font-bold text-slate-800 dark:text-slate-100 group disabled:opacity-60"
          >
            {isLoading ? (
              <span className="flex items-center gap-2 text-rose-500">
                <RotateCw className="w-4 h-4 animate-spin" />
                Đang kết nối tài khoản Google...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Đăng nhập với Google</span>
              </>
            )}
          </button>

          {/* Ghi chú bảo mật */}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Hệ thống xác thực trực tiếp qua tài khoản Google của bạn. Tuyệt đối an toàn và bảo mật.
          </p>
        </div>
      </div>
    </div>
  );
};

