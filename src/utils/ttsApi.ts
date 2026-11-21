/**
 * Helper định tuyến API TTS cho Đạo Tâm:
 * - Nếu có VITE_TTS_API_URL (VD: https://tts.daotam.vn hoặc https://103-166-185-160.sslip.io),
 *   Client trên Cloudflare Pages sẽ gọi thẳng sang backend CloudFly (nhanh hơn, không tốn lượt Pages Function).
 * - Nếu không cấu hình VITE_TTS_API_URL, mặc định dùng đường dẫn tương đối '/api/...'
 *   để chạy qua Cloudflare Pages Function proxy (hoặc Express dev server nội bộ).
 */
export function getTtsApiBaseUrl(): string {
  const raw =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_TTS_API_URL) || '';
  return String(raw).trim().replace(/\/+$/, '');
}

export function buildTtsEndpoint(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getTtsApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}
