import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { safeSessionGetItem, safeSessionSetItem } from '../utils/safeStorage';
import { 
  Download, 
  Smartphone, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Share, 
  PlusSquare,
  Sparkles
} from 'lucide-react';

interface PWAInstallPromptProps {
  forceShowForMobile?: boolean;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = () => {
  const {
    isInstalled,
    isIOS,
    isMobile,
    hasNativePrompt,
    installError,
    promptInstall,
    clearError,
  } = usePWAInstall();

  const [isDismissed, setIsDismissed] = useState(() => {
    return safeSessionGetItem('pwa_prompt_dismissed') === 'true';
  });

  const [showIOSModal, setShowIOSModal] = useState(false);

  // Nếu người dùng đã cài đặt và đang chạy PWA standalone thì không cần hiển thị
  if (isInstalled) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    safeSessionSetItem('pwa_prompt_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    const success = await promptInstall();
    if (!success && !hasNativePrompt) {
      // Khi không có native prompt (trình duyệt không hỗ trợ hoặc webview)
      // Hook sẽ tự động set installError hiển thị banner màu vàng!
    }
  };

  return (
    <>
      {/* ==============================================================
          BANNER CẢNH BÁO LỖI / THIẾT BỊ KHÔNG HỖ TRỢ:
          BẮT BUỘC NỀN MÀU VÀNG, TUYỆT ĐỐI KHÔNG DÙNG MÀU ĐỎ THEO QUY CHUẨN
          ============================================================== */}
      {installError && (
        <div className="fixed top-20 inset-x-3 sm:inset-x-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-amber-100/95 dark:bg-amber-950/95 border-2 border-amber-500/90 dark:border-amber-400 rounded-2xl p-4 shadow-xl backdrop-blur-md text-amber-950 dark:text-amber-100 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="flex-1 text-xs">
              <h4 className="font-black text-sm text-amber-950 dark:text-amber-200 mb-1 flex items-center gap-1.5">
                <span>Thông báo cài đặt ứng dụng</span>
              </h4>
              <p className="text-amber-900 dark:text-amber-100 font-medium leading-relaxed">
                {installError}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearError}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  Đã hiểu
                </button>
                <button
                  type="button"
                  onClick={() => setShowIOSModal(true)}
                  className="px-3 py-1.5 bg-white/80 hover:bg-white text-amber-900 border border-amber-300 rounded-lg font-semibold text-xs transition cursor-pointer"
                >
                  Xem hướng dẫn chi tiết
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="text-amber-800 hover:text-amber-950 p-1 rounded-full cursor-pointer transition shrink-0"
              title="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==============================================================
          MODAL HƯỚNG DẪN CÀI ĐẶT DÀNH CHO IPHONE / IPAD (IOS SAFARI)
          ============================================================== */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-pink-200 dark:border-pink-900/60 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-pink-400 text-white flex items-center justify-center font-black shadow-md shadow-pink-500/20">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Cài đặt trên iPhone / iPad
                  </h3>
                  <p className="text-[11px] text-pink-600 dark:text-pink-400 font-semibold">
                    Ứng dụng Đạo Tâm PWA
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700 dark:text-slate-300 mb-6">
              <div className="flex items-start gap-3 p-3 bg-pink-50/70 dark:bg-pink-950/30 rounded-xl border border-pink-100 dark:border-pink-900/40">
                <div className="w-6 h-6 rounded-lg bg-pink-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  Mở trang web bằng trình duyệt <strong className="text-pink-700 dark:text-pink-300">Safari</strong> và nhấn vào nút <strong>Chia sẻ (Share)</strong> <Share className="w-3.5 h-3.5 inline text-pink-600 mb-0.5" /> ở thanh công cụ phía dưới.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-pink-50/70 dark:bg-pink-950/30 rounded-xl border border-pink-100 dark:border-pink-900/40">
                <div className="w-6 h-6 rounded-lg bg-pink-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  Cuộn xuống và chọn <strong className="text-pink-700 dark:text-pink-300">"Thêm vào Màn hình chính"</strong> (Add to Home Screen) <PlusSquare className="w-3.5 h-3.5 inline text-pink-600 mb-0.5" />.
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-pink-50/70 dark:bg-pink-950/30 rounded-xl border border-pink-100 dark:border-pink-900/40">
                <div className="w-6 h-6 rounded-lg bg-pink-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  Nhấn <strong className="text-pink-700 dark:text-pink-300">"Thêm" (Add)</strong> ở góc trên bên phải để hoàn tất. Biểu tượng Đạo Tâm sẽ xuất hiện trên màn hình điện thoại như một App chuyên nghiệp!
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 text-white font-bold text-xs shadow-md shadow-pink-500/25 transition cursor-pointer"
            >
              Đã hiểu, đóng hướng dẫn
            </button>
          </div>
        </div>
      )}

      {/* ==============================================================
          FLOATING PROMPT DI ĐỘNG: LỜI MỜI CÀI ĐẶT APP HÒA HỢP TONE HỒNG
          ============================================================== */}
      {!isDismissed && isMobile && (
        <aside
          aria-label="Cài đặt ứng dụng Đạo Tâm"
          className="fixed bottom-20 inset-x-3 sm:bottom-4 sm:inset-x-auto sm:left-4 sm:max-w-md z-40 animate-in slide-in-from-bottom-4 duration-300"
        >
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-pink-200 dark:border-pink-900/80 rounded-2xl p-3.5 shadow-2xl shadow-pink-500/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-pink-400 text-white flex items-center justify-center font-black text-lg shadow-md shadow-pink-500/25 shrink-0">
                Đ
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                    Cài đặt Đạo Tâm App
                  </h4>
                  <span className="px-1.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950/80 text-[9px] font-black text-pink-700 dark:text-pink-300 shrink-0">
                    PWA
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Đọc truyện mượt mà, mở tức thì, toàn màn hình
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-700 hover:to-rose-700 text-white font-bold text-xs shadow-md shadow-pink-500/25 transition cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Cài đặt</span>
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full cursor-pointer transition"
                title="Bỏ qua"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
};

/**
 * Nút "Cài đặt App" độc lập có thể đặt trên Header hoặc Menu bất kỳ
 */
export const PWAHeaderInstallButton: React.FC = () => {
  const { isInstalled, isIOS, promptInstall, hasNativePrompt } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }
    await promptInstall();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/60 dark:hover:bg-pink-900/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800/80 font-bold text-xs shadow-2xs transition cursor-pointer"
        title="Cài đặt Đạo Tâm App vào điện thoại / máy tính"
      >
        <Smartphone className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
        <span className="hidden sm:inline">Cài đặt App</span>
        <span className="sm:hidden">Tải App</span>
      </button>

      {showIOSModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-pink-200 dark:border-pink-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-pink-600" />
                Cài đặt trên iPhone/iPad
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs space-y-3 text-slate-700 dark:text-slate-300">
              <p>1. Mở trang này bằng trình duyệt <strong>Safari</strong>.</p>
              <p>2. Nhấn nút <strong>Chia sẻ (Share)</strong> <Share className="w-3.5 h-3.5 inline text-pink-600" /> ở cạnh dưới.</p>
              <p>3. Chọn <strong>"Thêm vào Màn hình chính"</strong> (Add to Home Screen).</p>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold transition"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </>
  );
};
