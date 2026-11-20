import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Kiểm tra nếu app đã được cài đặt và đang chạy ở chế độ standalone
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(Boolean(isStandalone));

      // 2. Nhận diện thiết bị di động & iOS
      const ua = window.navigator.userAgent.toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
      setIsIOS(isIOSDevice);

      const isMobileDevice = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(ua) || window.innerWidth < 768;
      setIsMobile(isMobileDevice);

      // 3. Đăng ký Service Worker an toàn
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker đã đăng ký thành công:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Lỗi đăng ký Service Worker:', err);
          });
      }

      // 4. Lắng nghe sự kiện trước khi cài đặt (Chrome, Edge, Samsung Internet, Android)
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setInstallError(null);
      };

      const handleAppInstalled = () => {
        setIsInstalled(true);
        setDeferredPrompt(null);
        setInstallError(null);
        console.log('[PWA] Ứng dụng Đạo Tâm đã được cài đặt thành công!');
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', handleAppInstalled);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }
  }, []);

  // Hàm kích hoạt quá trình cài đặt
  const promptInstall = useCallback(async (): Promise<boolean> => {
    setInstallError(null);

    // Nếu đã cài đặt
    if (isInstalled) {
      return true;
    }

    // Nếu trình duyệt cung cấp prompt trực tiếp
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          return true;
        } else {
          setInstallError(
            'Bạn đã hủy thao tác cài đặt ứng dụng. Bạn có thể bấm lại nút "Cài đặt App" bất cứ lúc nào khi muốn tải về màn hình chính.'
          );
          return false;
        }
      } catch (err: any) {
        setInstallError(
          `Quá trình cài đặt gặp sự cố: ${err?.message || 'Không thể mở hộp thoại cài đặt của trình duyệt.'}. Vui lòng thử lại hoặc chọn 'Thêm vào màn hình chính' từ menu trình duyệt.`
        );
        return false;
      }
    }

    // Nếu là thiết bị iOS
    if (isIOS) {
      // iOS không hỗ trợ sự kiện beforeinstallprompt, cần hướng dẫn thủ công
      return false;
    }

    // Nếu trình duyệt / thiết bị không hỗ trợ direct prompt (ví dụ webview trong app Facebook, Zalo, hoặc trình duyệt cũ)
    setInstallError(
      'Trình duyệt hoặc môi trường hiện tại không hỗ trợ cài đặt tự động 1 chạm. Vui lòng mở trang web trên trình duyệt Google Chrome (Android) hoặc Safari (iOS), sau đó nhấn vào menu [⋮] hoặc [📤] và chọn "Cài đặt ứng dụng" / "Thêm vào màn hình chính".'
    );
    return false;
  }, [deferredPrompt, isInstalled, isIOS]);

  const clearError = useCallback(() => {
    setInstallError(null);
  }, []);

  return {
    isInstallable: Boolean(deferredPrompt) || isIOS,
    hasNativePrompt: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isMobile,
    installError,
    promptInstall,
    clearError,
  };
}
