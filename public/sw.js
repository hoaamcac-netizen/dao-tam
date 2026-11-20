/**
 * ==============================================================================
 * SERVICE WORKER AN TOÀN CHO ĐẠO TÂM PWA (Vercel Next.js / Vite React)
 * ==============================================================================
 * NGUYÊN TẮC BẢO VỆ DỮ LIỆU THỜI GIAN THỰC & VÍ XU / TÀI CHÍNH:
 * 1. CHỈ CACHE TÀI NGUYÊN TĨNH (CSS, JS bundles, font chữ, icon, ảnh tĩnh).
 * 2. TUYỆT ĐỐI KHÔNG CACHE BẤT KỲ LỜI GỌI FIRESTORE / FIREBASE NÀO HOẶC TRANG/API VÍ XU:
 *    - Toàn bộ kết nối firestore.googleapis.com, Firebase Auth, /api/*,
 *      /tu-truyen-cua-ban, /tu-truyen, /profile, /admin, /topup, /vip, /wallet
 *      được BỎ QUA HOÀN TOÀN (Network-Only) để số dư Xu và giao dịch nạp tiền
 *      luôn đồng bộ tức thì sau mỗi lần F5 trên cả Mobile lẫn Desktop.
 * 3. BỎ QUA MỌI METHOD KHÔNG PHẢI GET (POST, PUT, DELETE, PATCH).
 * ==============================================================================
 */

const CACHE_NAME = 'daotam-static-cache-v2';

// Danh sách các tài nguyên tĩnh cơ bản của App Shell
const PRECACHE_ASSETS = [
  '/favicon.ico',
  '/favicon.png',
  '/logo.png',
  '/apple-touch-icon.png',
  '/manifest-icon-192.png',
  '/manifest-icon-512.png',
  '/site.webmanifest',
  '/manifest.json',
];

// Danh sách các domain và đường dẫn TUYỆT ĐỐI KHÔNG ĐƯỢC CACHE (Network Only)
const REALTIME_EXCLUSION_PATTERNS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'google.firestore',
  'channel?VER=',
  '/api/',
  '/api/vip',
  '/api/author',
  '/api/user',
  '/api/wallet',
  '/api/topup',
  '/api/auth',
  '/tu-truyen-cua-ban',
  '/tu-truyen',
  '/profile',
  '/admin',
  '/topup',
  '/vip',
  '/wallet',
  'xuBalance',
  '_rsc=',
  'chrome-extension',
];

// 1. Cài đặt Service Worker và precache các file tĩnh cơ bản
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[PWA SW] Precache assets warning:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Kích hoạt và dọn dẹp triệt để toàn bộ các cache phiên bản cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              console.log('[PWA SW] Xóa cache cũ:', name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. Xử lý Intercept Fetch
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // BỎ QUA các yêu cầu không phải GET (chẳng hạn mutation, POST Firestore, API nạp/mở khóa)
  if (req.method !== 'GET') {
    return;
  }

  // BỎ QUA TUYỆT ĐỐI mọi request thuộc Firestore / Firebase realtime, API & trang Ví Xu / Tài chính
  const isRealtimeOrFinancialRequest = REALTIME_EXCLUSION_PATTERNS.some((pattern) =>
    url.includes(pattern)
  );
  if (isRealtimeOrFinancialRequest) {
    // Không đọc/ghi cache trình duyệt hay Service Worker cho dữ liệu user/tiền
    return;
  }

  // Đối với request mở trang HTML (Navigation / F5): Network-Only (no-store) để không bao giờ kẹt số dư cũ trên Mobile
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => {
        return caches.match('/index.html') || caches.match('/');
      })
    );
    return;
  }

  // Chỉ cache tài nguyên tĩnh đã hash hoặc media/font không đổi (JS/CSS không thuộc API, Web Fonts, Ảnh)
  const isStaticAsset =
    url.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff|woff2|ttf|eot)$/i) ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
            }
            return networkResponse;
          })
          .catch(() => null);

        // Trả về cache ngay nếu có, đồng thời âm thầm fetch cập nhật phiên bản mới
        return cachedResponse || fetchPromise;
      })
    );
  }
});
