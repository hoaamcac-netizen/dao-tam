import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from "firebase/app-check";

// Đưa thẳng cấu hình trực tiếp vào code (KHÔNG dùng file JSON nữa để tránh lỗi Vercel)
const firebaseConfig = {
  apiKey: "AIzaSyC9aoqv2xUbCmIu-U1SkqAwVzpyr_iFmI8",
  authDomain: "dao-tam.firebaseapp.com",
  projectId: "dao-tam",
  storageBucket: "dao-tam.firebasestorage.app",
  messagingSenderId: "909784804370",
  appId: "1:909784804370:web:e75090ba50b9b4e7687ccb",
  measurementId: "G-GH70V1FYNF",
  // Khai báo thêm 2 thông số này để đảm bảo các component cũ không bị lỗi
  firestoreDatabaseId: "(default)",
  oAuthClientId: "121387457310-f30294i8bbhc63trcbfr8t08gcibg58g.apps.googleusercontent.com"
};

export { firebaseConfig };

// 1. Khởi tạo app cho Firestore, Storage & Auth
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Khởi tạo Analytics (kiểm tra môi trường browser để tránh lỗi khi SSR)
export let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((yes) => {
    if (yes) analytics = getAnalytics(app);
  });
}

// 2. Khởi tạo Firestore, Cloud Storage và Auth
// CỰC KỲ QUAN TRỌNG: Kết nối trực tiếp vào firestoreDatabaseId của hệ thống
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
const storage = getStorage(app);
const auth = getAuth(app);

export { db, auth, storage };

// ==============================================================================
// LỚP 2: THIẾT LẬP FIREBASE APP CHECK (reCAPTCHA v3) CHẶN TOOL/BOT/API
// ==============================================================================
export let appCheck: AppCheck | null = null;

export function initFirebaseAppCheck(): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (appCheck) return appCheck;

  try {
    const isDevEnv =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.includes("run.app") ||
      window.location.hostname.includes("vercel.app");

    if (isDevEnv) {
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    const recaptchaKey =
      (firebaseConfig as any).recaptchaSiteKey ||
      process.env?.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ||
      "6LdXXXXXXXXXXXXX_YOUR_RECAPTCHA_V3_SITE_KEY";

    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    });

    return appCheck;
  } catch (err) {
    console.warn("[AppCheck] Lưu ý: App Check khởi tạo ở chế độ phát triển/fallback:", err);
    return null;
  }
}

if (typeof window !== "undefined") {
  try {
    initFirebaseAppCheck();
  } catch {}
}

// 3. Cấu hình đăng nhập Google
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const GOOGLE_OAUTH_CLIENT_ID = (firebaseConfig as any).oAuthClientId;

// 4. Danh sách 2 Quản Trị Viên (Admin) chính thức duy nhất
export const ADMIN_EMAILS: string[] = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

// 5. Hàm kiểm tra quyền Admin
export function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase().trim() === clean);
}