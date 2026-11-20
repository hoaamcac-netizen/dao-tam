'use client';

import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from 'firebase/app-check';
import { app } from './firebase'; // Hoặc import từ config firebase client của bạn

/**
 * ==============================================================================
 * LỚP 2: THIẾT LẬP FIREBASE APP CHECK (reCAPTCHA v3) TRÊN NEXT.JS
 * ==============================================================================
 * Mục đích:
 *  - Xác minh mọi request đọc/ghi Firestore phải xuất phát từ domain chính thức của ứng dụng Next.js.
 *  - Từ chối ngay lập tức các request gọi thẳng vào Firebase REST/gRPC API từ Postman, Python script,
 *    cURL hoặc crawler bên ngoài không có App Check Token hợp lệ.
 * ==============================================================================
 */

let appCheckInstance: AppCheck | null = null;

export function initClientAppCheck(): AppCheck | null {
  if (typeof window === 'undefined') return null;
  if (appCheckInstance) return appCheckInstance;

  try {
    // 1. Chế độ phát triển (Development / Localhost / Preview): Bật Debug Token để test không bị chặn
    const isDevelopment =
      process.env.NODE_ENV === 'development' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (isDevelopment) {
      // Firebase App Check Debug Token (tự sinh ra token hợp lệ trong console của trình duyệt)
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    // 2. Lấy Site Key reCAPTCHA v3 từ biến môi trường NEXT_PUBLIC
    const siteKey =
      process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY ||
      '6LdXXXXXXXXXXXXX_YOUR_RECAPTCHA_V3_SITE_KEY';

    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true, // Tự động làm mới token định kỳ
    });

    return appCheckInstance;
  } catch (error) {
    console.warn('[AppCheck] Warning: App Check initialization skipped or debug fallback:', error);
    return null;
  }
}
