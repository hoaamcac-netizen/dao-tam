/**
 * Audio Chunker Engine & AudioStreamer for Đạo Tâm
 * - Làm sạch văn bản bằng Regex (loại bỏ HTML, URL, ký tự rác)
 * - Gộp câu thành các đoạn tối ưu 200 - 350 ký tự theo ranh giới dấu chấm/xuống dòng (không quá timeout 10s Netlify)
 * - Thứ tự server TTS bắt buộc: Netlify chính (retry tối đa 2 lần) -> Vercel dự phòng
 * - Bộ nhớ đệm Blob URL tải trước N+1, N+2 và tự động revokeObjectURL chống tràn RAM di động
 */

export interface AudioChunk {
  id: number;
  text: string;
  charStart: number;
  charEnd: number;
  rawText: string;
  paraIndex?: number;
}

export const TTS_FETCH_TIMEOUT_MS = 9500;
export const TTS_MAX_RETRIES = 2; // Thử lại tối đa 2 lần trên server chính trước khi chuyển sang server dự phòng
export const TTS_RETRY_DELAY_MS = 450;
export const TTS_ACTIVE_SERVER_STORAGE_KEY = 'daotam_active_tts_endpoint';
export const DEFAULT_FIRST_CHUNK_MIN_LENGTH = 260;
export const DEFAULT_FIRST_CHUNK_MAX_LENGTH = 420;
export const DEFAULT_CHUNK_MIN_LENGTH = 400;
export const DEFAULT_CHUNK_MAX_LENGTH = 550;
export const MAX_BLOB_CACHE_ENTRIES = 8;
export const SKIPPED_TTS_CHUNK_URL = '__SKIPPED_204__';

export function sanitizeUserFacingErrorText(raw?: string | null, fallback = 'Máy chủ âm thanh đang bận'): string {
  const input = String(raw || '').trim();
  if (!input) return fallback;
  const cleaned = input
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(github|firebase|firestore|netlify|vercel|cloudflare)\b/gi, 'máy chủ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:\-|]+\s*$/g, '')
    .trim();
  return cleaned || fallback;
}

export function extractPlainTextFromChapterHtml(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCharCode(code) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : ' ';
    })
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export interface TtsServerTierConfig {
  primaryEndpoints: string[]; // Netlify (ưu tiên tuyệt đối gọi trước)
  backupEndpoints: string[];  // Vercel (chỉ gọi dự phòng khi Netlify lỗi 402/429/500/502/504/timeout/mạng)
}

function isLocalOrServerHost(): boolean {
  if (typeof window === 'undefined' || !window.location?.hostname) return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.run.app') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.netlify.app')
  );
}

function normalizeTtsEndpoint(rawUrl: string): string {
  const clean = rawUrl.trim().replace(/\/+$/, '');
  if (!clean) return '/api/tts';
  if (
    clean.endsWith('/api/tts') ||
    clean.endsWith('/.netlify/functions/tts') ||
    clean.includes('/api/tts?') ||
    clean.includes('/.netlify/functions/tts?')
  ) {
    return clean;
  }
  return `${clean}/api/tts`;
}

function isNetlifyEndpointUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('netlify.app') || lower.includes('/.netlify/functions/');
}

function isVercelEndpointUrl(url: string): boolean {
  return url.toLowerCase().includes('vercel.app');
}

export function getTtsProviderLabel(endpointUrl: string): string {
  if (isNetlifyEndpointUrl(endpointUrl)) return 'máy chủ âm thanh';
  if (isVercelEndpointUrl(endpointUrl)) return 'máy chủ âm thanh dự phòng';
  if (endpointUrl === '/api/tts') return 'máy chủ âm thanh';
  return 'máy chủ âm thanh';
}

/**
 * Phân tách rõ 2 tầng máy chủ TTS theo thứ tự ưu tiên bắt buộc:
 * 1. Tầng chính (Primary): LUÔN ưu tiên Netlify (VITE_TTS_NETLIFY_URL hoặc URL Netlify trong VITE_TTS_API_URL).
 * 2. Tầng dự phòng (Backup): CHỈ gọi Vercel (VITE_TTS_VERCEL_URL / URL Vercel trong VITE_TTS_API_URL) khi Netlify lỗi.
 * Tuyệt đối KHÔNG gọi Vercel trước Netlify và KHÔNG ghim Vercel vào sessionStorage.
 */
export function getTtsServerTiers(): TtsServerTierConfig {
  const env = ((import.meta as any)?.env || {}) as Record<string, string | undefined>;
  const rawPrimary = String(env.VITE_TTS_NETLIFY_URL || '').trim();
  const rawBackup = String(env.VITE_TTS_VERCEL_URL || env.VITE_TTS_BACKUP_URL || env.VITE_TTS_FALLBACK_URL || '').trim();
  const rawCombined = String(env.VITE_TTS_API_URL || '').trim();

  const primarySet = new Set<string>();
  const backupSet = new Set<string>();

  const addUnique = (target: Set<string>, raw: string) => {
    for (const part of raw.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const normalized = normalizeTtsEndpoint(trimmed);
      if (normalized) target.add(normalized);
    }
  };

  if (rawPrimary) {
    addUnique(primarySet, rawPrimary);
  }

  if (rawCombined) {
    const parts = rawCombined
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map(normalizeTtsEndpoint);

    for (const url of parts) {
      if (isNetlifyEndpointUrl(url)) {
        primarySet.add(url);
      } else if (isVercelEndpointUrl(url)) {
        backupSet.add(url);
      } else if (primarySet.size === 0) {
        // URL đầu tiên không mang tên miền vercel -> coi là server chính
        primarySet.add(url);
      } else {
        backupSet.add(url);
      }
    }
  }

  if (rawBackup) {
    addUnique(backupSet, rawBackup);
  }

  // Đảm bảo không trùng lặp giữa primary và backup
  for (const url of primarySet) {
    backupSet.delete(url);
  }

  const primaryEndpoints = Array.from(primarySet);
  const backupEndpoints = Array.from(backupSet);

  // Nếu chưa cấu hình biến môi trường (ví dụ chạy local dev / AI Studio preview), dùng /api/tts cùng domain
  if (primaryEndpoints.length === 0 && backupEndpoints.length === 0) {
    return {
      primaryEndpoints: ['/api/tts'],
      backupEndpoints: [],
    };
  }

  // Nếu chỉ cấu hình Vercel mà chưa có Netlify, giữ nguyên backupEndpoints nhưng khi chạy trên host có backend cục bộ vẫn ưu tiên /api/tts nếu cần
  if (primaryEndpoints.length === 0 && backupEndpoints.length > 0) {
    if (isLocalOrServerHost() && !backupEndpoints.includes('/api/tts')) {
      return {
        primaryEndpoints: ['/api/tts'],
        backupEndpoints,
      };
    }
    return {
      primaryEndpoints: [backupEndpoints[0]],
      backupEndpoints: backupEndpoints.slice(1),
    };
  }

  // Nếu đang chạy trên server dev/Vercel cục bộ mà chưa có backup, thêm /api/tts làm dự phòng cuối
  if (backupEndpoints.length === 0 && isLocalOrServerHost() && !primaryEndpoints.includes('/api/tts')) {
    backupEndpoints.push('/api/tts');
  }

  return {
    primaryEndpoints,
    backupEndpoints,
  };
}

/**
 * Trả về danh sách endpoint TTS theo thứ tự ưu tiên cố định: Netlify chính -> Vercel dự phòng.
 */
export function getTtsEndpointUrls(): string[] {
  const { primaryEndpoints, backupEndpoints } = getTtsServerTiers();
  const combined = [...primaryEndpoints, ...backupEndpoints];
  return combined.length > 0 ? combined : ['/api/tts'];
}

export function rememberActiveTtsEndpoint(_endpointUrl: string): void {
  // Cố ý không ghim Vercel lên trước Netlify để tuân thủ quy tắc LUÔN gọi Netlify trước.
}

export function clearActiveTtsEndpoint(_onlyIfMatches?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(TTS_ACTIVE_SERVER_STORAGE_KEY);
  } catch {}
}

export function getOrderedTtsEndpoints(): string[] {
  return getTtsEndpointUrls();
}

export function getTtsEndpointUrl(): string {
  return getTtsEndpointUrls()[0] || '/api/tts';
}

export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isQuotaOrHardFailoverStatus(status?: number): boolean {
  return status === 402 || status === 404 || status === 410;
}

function isFailoverEligibleError(err: any): boolean {
  if (!err) return true;
  if (err.isTimeout || err.isNetworkError || err.isInvalidAudio) return true;
  const status = typeof err.httpStatus === 'number' ? err.httpStatus : 0;
  return (
    status === 402 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 404 ||
    status >= 500
  );
}

function isLikelyHtmlOrTextPayload(bytes: Uint8Array, contentType: string): boolean {
  const ct = (contentType || '').toLowerCase();
  if (
    ct.includes('text/html') ||
    ct.includes('application/json') ||
    ct.includes('application/xhtml') ||
    ct.includes('text/plain')
  ) {
    return true;
  }
  if (bytes.byteLength >= 5) {
    const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]).toLowerCase();
    if (head.startsWith('<html') || head.startsWith('<!doc') || head.startsWith('{"err') || head.startsWith('<?xml')) {
      return true;
    }
  }
  return false;
}

async function fetchSingleTtsEndpoint(params: {
  endpointUrl: string;
  cleanText: string;
  voiceId: string;
  externalSignal?: AbortSignal;
  timeoutMs: number;
}): Promise<{ blob: Blob | null; status?: number }> {
  const { endpointUrl, cleanText, voiceId, externalSignal, timeoutMs } = params;
  const provider = getTtsProviderLabel(endpointUrl);
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const separator = endpointUrl.includes('?') ? '&' : '?';
    const getUrl = `${endpointUrl}${separator}text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(voiceId)}`;
    const useSimpleGet = getUrl.length <= 2048;

    const response = useSimpleGet
      ? await fetch(getUrl, {
          method: 'GET',
          signal: controller.signal,
        })
      : await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: cleanText,
            voice: voiceId,
          }),
          signal: controller.signal,
        });

    if (response.status === 204) {
      return { blob: null, status: 204 };
    }

    if (!response.ok) {
      let serverMsg = '';
      try {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const json = await response.json();
          serverMsg = json?.error || json?.message || '';
        }
      } catch {}
      const safeServerMsg = serverMsg ? sanitizeUserFacingErrorText(serverMsg, '') : '';
      const err: any = new Error(
        `${provider} lỗi HTTP ${response.status}${safeServerMsg ? ` (${safeServerMsg})` : ''}`
      );
      err.httpStatus = response.status;
      err.provider = provider;
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const byteView = new Uint8Array(arrayBuffer);

    if (arrayBuffer.byteLength < 100 || isLikelyHtmlOrTextPayload(byteView, contentType)) {
      const invalidErr: any = new Error(
        `${provider} trả về dữ liệu không phải audio MP3 hợp lệ (${contentType || 'rỗng'})`
      );
      invalidErr.isInvalidAudio = true;
      invalidErr.provider = provider;
      throw invalidErr;
    }

    return { blob: new Blob([arrayBuffer], { type: 'audio/mpeg' }), status: response.status };
  } catch (err: any) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (didTimeout) {
      const timeoutErr: any = new Error(
        `${provider} quá thời gian chờ (${Math.round(timeoutMs / 1000)}s)`
      );
      timeoutErr.isTimeout = true;
      timeoutErr.provider = provider;
      throw timeoutErr;
    }
    if (!err?.httpStatus && !err?.isInvalidAudio) {
      const netErr: any = new Error(
        `${provider} lỗi kết nối mạng (${err?.message || 'Failed to fetch'})`
      );
      netErr.isNetworkError = true;
      netErr.provider = provider;
      throw netErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Fetch audio TTS với thứ tự ưu tiên BẮT BUỘC:
 * 1. LUÔN gọi Netlify (Primary) trước. Nếu lỗi mạng/timeout/429/5xx -> tự động retry tối đa 2 lần trên Netlify.
 * 2. CHỈ khi Netlify hết hạn mức (402) hoặc sau khi retry vẫn lỗi (429/500/502/504/timeout/mạng) -> mới gọi Vercel dự phòng.
 * 3. Tuyệt đối KHÔNG gọi Vercel trước Netlify và KHÔNG tự ý chuyển sang giọng máy trình duyệt.
 */
export async function fetchTtsAudioBlobWithWatchdog(params: {
  text: string;
  voiceId: string;
  signal?: AbortSignal;
  onRetryAttempt?: (attempt: number, detail?: string) => void;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}): Promise<Blob | null> {
  const {
    text,
    voiceId,
    signal: externalSignal,
    onRetryAttempt,
    timeoutMs = TTS_FETCH_TIMEOUT_MS,
    maxRetries = TTS_MAX_RETRIES,
    retryDelayMs = TTS_RETRY_DELAY_MS,
  } = params;

  const cleanText = cleanTextForTTS(text);
  if (!cleanText || !/[\p{L}\p{N}]/u.test(cleanText)) {
    return null;
  }

  const { primaryEndpoints, backupEndpoints } = getTtsServerTiers();
  const errorTrail: string[] = [];
  let primaryError: any = null;
  let retryCounter = 0;

  // BƯỚC 1: LUÔN GỌI SERVER CHÍNH (NETLIFY) TRƯỚC — RETRY TỐI ĐA 2 LẦN
  for (const primaryUrl of primaryEndpoints) {
    const provider = getTtsProviderLabel(primaryUrl);
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (attempt > 0) {
        retryCounter += 1;
        onRetryAttempt?.(retryCounter, `Đang thử lại máy chủ âm thanh (lần ${attempt}/${maxRetries})...`);
        const backoffMs = Math.min(2000, Math.round(retryDelayMs * Math.pow(1.6, attempt - 1)));
        await sleepWithAbort(backoffMs, externalSignal);
      }

      try {
        const result = await fetchSingleTtsEndpoint({
          endpointUrl: primaryUrl,
          cleanText,
          voiceId,
          externalSignal,
          timeoutMs,
        });
        return result.blob;
      } catch (err: any) {
        if (err?.name === 'AbortError' || externalSignal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        primaryError = err;
        console.warn(
          `[TTS Primary - ${provider}] Lần ${attempt + 1}/${maxRetries + 1} lỗi:`,
          err?.message || err
        );
        // Nếu Netlify báo 402 (hết hạn mức) hoặc 404 -> chuyển ngay sang Vercel dự phòng
        if (isQuotaOrHardFailoverStatus(err?.httpStatus)) {
          break;
        }
      }
    }

    if (primaryError) {
      errorTrail.push(primaryError?.message || `${provider} lỗi không xác định`);
    }
  }

  // BƯỚC 2: CHỈ GỌI SERVER DỰ PHÒNG (VERCEL) KHI NETLIFY LỖI HẾT HẠN MỨC / QUÁ TẢI / TIMEOUT / 5XX
  let backupError: any = null;
  if (backupEndpoints.length > 0 && isFailoverEligibleError(primaryError)) {
    for (const backupUrl of backupEndpoints) {
      const provider = getTtsProviderLabel(backupUrl);
      const backupRetries = 1; // Dự phòng thử chính + 1 lần retry nếu chập chờn
      for (let attempt = 0; attempt <= backupRetries; attempt++) {
        if (externalSignal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        retryCounter += 1;
        onRetryAttempt?.(
          retryCounter,
          attempt === 0
            ? 'Đang chuyển sang máy chủ âm thanh dự phòng...'
            : 'Đang thử lại máy chủ âm thanh dự phòng...'
        );

        if (attempt > 0) {
          await sleepWithAbort(retryDelayMs, externalSignal);
        }

        try {
          const result = await fetchSingleTtsEndpoint({
            endpointUrl: backupUrl,
            cleanText,
            voiceId,
            externalSignal,
            timeoutMs,
          });
          return result.blob;
        } catch (err: any) {
          if (err?.name === 'AbortError' || externalSignal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          backupError = err;
          console.warn(
            `[TTS Backup - ${provider}] Lần ${attempt + 1}/${backupRetries + 1} lỗi:`,
            err?.message || err
          );
          if (isQuotaOrHardFailoverStatus(err?.httpStatus)) {
            break;
          }
        }
      }

      if (backupError) {
        errorTrail.push(sanitizeUserFacingErrorText(backupError?.message, `${provider} lỗi kết nối`));
      }
    }
  }

  const finalError: any = new Error(
    errorTrail.length > 0
      ? `Không thể kết nối máy chủ giọng đọc: ${sanitizeUserFacingErrorText(errorTrail.join(' | '))}`
      : 'Máy chủ giọng đọc không phản hồi.'
  );
  finalError.httpStatus = backupError?.httpStatus || primaryError?.httpStatus;
  finalError.isTimeout = Boolean(backupError?.isTimeout || primaryError?.isTimeout);
  finalError.isNetworkError = Boolean(backupError?.isNetworkError || primaryError?.isNetworkError);
  throw finalError;
}

/**
 * Làm sạch văn bản trước khi đưa vào Microsoft Edge TTS (Nam Minh / Hoài My):
 * - Gỡ bỏ thẻ HTML, HTML entities, link URL, Markdown & ký tự đặc biệt rác
 * - Chuẩn hóa khoảng trắng và dấu câu để giọng đọc mượt mà, không khựng
 */
export function cleanTextForTTS(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFFD]/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(?:p|div|span|br|hr|b|i|u|s|em|strong|small|sub|sup|h[1-6]|a|img|ul|ol|li|table|tr|td|th|thead|tbody|blockquote|pre|code|font|center|section|article|header|footer|aside|main|nav)\b(?:\s[^>]*)?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' và ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;|&gt;/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/&/g, ' và ')
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[*_~`#|\\<>^{}[\]•◆◇■□●○★☆※♥♡✿🌸⚔️💎]+/g, ' ')
    .replace(/[.]{4,}/g, '...')
    .replace(/[!]{2,}/g, '!')
    .replace(/[?]{2,}/g, '?')
    .replace(/[-–—]{2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Thuật toán Chunking tối ưu khởi động nhanh & tổng hợp Edge TTS ổn định ở tốc độ x2:
 * - Đoạn đầu tiên (chunk 0): cắt ngắn 150 - 250 ký tự để máy chủ tạo giọng và phát tiếng ngay lập tức.
 * - Các đoạn tiếp theo (chunk >= 1): gộp câu thành 250 - 350 ký tự theo ranh giới dấu câu / xuống dòng,
 *   tuyệt đối không cắt ngang từ, vừa đọc mượt 8 - 10s ở tốc độ x2 vừa tránh ngắt kết nối WebSocket.
 */
export function chunkChapterContent(
  content: string,
  idealMinLength: number = DEFAULT_CHUNK_MIN_LENGTH,
  idealMaxLength: number = DEFAULT_CHUNK_MAX_LENGTH,
  firstMinLength: number = DEFAULT_FIRST_CHUNK_MIN_LENGTH,
  firstMaxLength: number = DEFAULT_FIRST_CHUNK_MAX_LENGTH
): AudioChunk[] {
  if (!content || !content.trim()) return [];

  const nextMinLen = Math.max(150, idealMinLength);
  const nextMaxLen = Math.max(nextMinLen + 40, idealMaxLength);
  const headMinLen = Math.max(60, firstMinLength);
  const headMaxLen = Math.max(headMinLen + 20, firstMaxLength);

  const rawParagraphs = content
    .split(/\r?\n+/)
    .map((p) => cleanTextForTTS(p))
    .filter((p) => p.length > 0 && /[\p{L}\p{N}]/u.test(p));

  if (rawParagraphs.length === 0) return [];

  const chunks: AudioChunk[] = [];
  let chunkIndex = 0;
  let runningCharOffset = 0;

  let accumulator = '';
  let rawAccumulator = '';
  let accStartOffset = 0;
  let accParaIndex = 0;

  const getActiveLimits = () => {
    if (chunks.length === 0) {
      return { minLen: headMinLen, maxLen: headMaxLen };
    }
    return { minLen: nextMinLen, maxLen: nextMaxLen };
  };

  const pushChunk = (textVal: string, rawVal: string, startOffset: number, pIdx: number) => {
    const trimmedText = textVal.replace(/\s+/g, ' ').trim();
    const trimmedRaw = rawVal.trim() || trimmedText;
    if (!trimmedText || !/[\p{L}\p{N}]/u.test(trimmedText)) return;
    chunks.push({
      id: chunkIndex++,
      text: trimmedText,
      rawText: trimmedRaw,
      charStart: startOffset,
      charEnd: startOffset + trimmedText.length,
      paraIndex: pIdx,
    });
  };

  const flushAccumulator = () => {
    if (accumulator.trim()) {
      pushChunk(accumulator, rawAccumulator || accumulator, accStartOffset, accParaIndex);
      accStartOffset += accumulator.length + 1;
      accumulator = '';
      rawAccumulator = '';
    }
  };

  const appendSubUnit = (unit: string, rawSep: string, pIndex: number) => {
    const { minLen, maxLen } = getActiveLimits();
    if (!accumulator) {
      accParaIndex = pIndex;
      accStartOffset = runningCharOffset;
      accumulator = unit;
      rawAccumulator = unit;
      if (accumulator.length >= minLen) {
        flushAccumulator();
      }
      return;
    }

    if (accumulator.length + 1 + unit.length <= maxLen) {
      accumulator = `${accumulator} ${unit}`;
      rawAccumulator = `${rawAccumulator}${rawSep}${unit}`;
      if (accumulator.length >= minLen) {
        flushAccumulator();
      }
      return;
    }

    flushAccumulator();
    accParaIndex = pIndex;
    accStartOffset = runningCharOffset;
    accumulator = unit;
    rawAccumulator = unit;
    if (getActiveLimits().minLen <= accumulator.length) {
      flushAccumulator();
    }
  };

  for (let pIndex = 0; pIndex < rawParagraphs.length; pIndex++) {
    const paraText = rawParagraphs[pIndex];
    const sentences = paraText
      .split(/(?<=[.?!…;])\s+|(?<=[”"'])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let isFirstSentenceInPara = true;

    for (const sentence of sentences) {
      const { minLen, maxLen } = getActiveLimits();
      const rawSeparator = isFirstSentenceInPara ? '\n' : ' ';

      // Nếu câu hiện tại vượt quá maxLen (ví dụ > 250 ở đoạn đầu hoặc > 600 ở các đoạn sau)
      // Hoặc đoạn đầu mới chỉ có tiêu đề ngắn (< 120 ký tự) nhưng câu tiếp theo vượt quá 250 ký tự:
      // Tách theo ranh giới mệnh đề (dấu phẩy, hai chấm, gạch ngang) hoặc ranh giới từ (không bao giờ cắt ngang từ)
      const needsSubSplit =
        sentence.length > maxLen ||
        (chunks.length === 0 && accumulator.length > 0 && accumulator.length < headMinLen && accumulator.length + 1 + sentence.length > maxLen);

      if (needsSubSplit) {
        if (accumulator && (accumulator.length >= headMinLen || chunks.length > 0)) {
          flushAccumulator();
        }

        const clauses = sentence
          .split(/(?<=[,:—–-])\s+/)
          .map((c) => c.trim())
          .filter(Boolean);

        let firstClause = true;
        for (const clause of clauses) {
          const curMax = getActiveLimits().maxLen;
          const sep = firstClause ? rawSeparator : ' ';
          firstClause = false;

          if (clause.length > curMax) {
            const words = clause.split(/\s+/).filter(Boolean);
            for (const word of words) {
              const wordLimit = getActiveLimits().maxLen;
              if (word.length > wordLimit) {
                flushAccumulator();
                pushChunk(word, word, runningCharOffset, pIndex);
              } else {
                appendSubUnit(word, ' ', pIndex);
              }
            }
          } else {
            appendSubUnit(clause, sep, pIndex);
          }
        }

        isFirstSentenceInPara = false;
        continue;
      }

      if (!accumulator) {
        accParaIndex = pIndex;
        accStartOffset = runningCharOffset;
        accumulator = sentence;
        rawAccumulator = sentence;
        if (accumulator.length >= minLen) {
          flushAccumulator();
        }
      } else if (accumulator.length + 1 + sentence.length <= maxLen) {
        accumulator = `${accumulator} ${sentence}`;
        rawAccumulator = `${rawAccumulator}${rawSeparator}${sentence}`;
        if (accumulator.length >= minLen) {
          flushAccumulator();
        }
      } else {
        flushAccumulator();
        accParaIndex = pIndex;
        accStartOffset = runningCharOffset;
        accumulator = sentence;
        rawAccumulator = sentence;
        if (getActiveLimits().minLen <= accumulator.length) {
          flushAccumulator();
        }
      }

      isFirstSentenceInPara = false;
    }

    // Nếu đoạn văn vừa kết thúc và độ dài tích lũy đã đạt tối thiểu, ngắt đúng điểm xuống dòng
    if (accumulator.length >= getActiveLimits().minLen) {
      flushAccumulator();
    }

    runningCharOffset += paraText.length + 1;
  }

  flushAccumulator();
  return chunks;
}

export const splitChapterIntoSpeechChunks = chunkChapterContent;

export function splitTextIntoSpeechChunks(
  text: string,
  maxLength: number = DEFAULT_CHUNK_MAX_LENGTH
): string[] {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned) return [];

  const safeMax = Math.max(150, Math.min(DEFAULT_CHUNK_MAX_LENGTH, maxLength));
  const rawSegments = cleaned.split(/(?<=[.?!;…])/);
  const chunks: string[] = [];
  let buffer = '';

  const flushBuffer = () => {
    const trimmed = buffer.trim();
    if (trimmed && /[\p{L}\p{N}]/u.test(trimmed)) {
      chunks.push(trimmed);
    }
    buffer = '';
  };

  for (const rawSeg of rawSegments) {
    const seg = rawSeg.replace(/\s+/g, ' ').trim();
    if (!seg || !/[\p{L}\p{N}]/u.test(seg)) continue;

    if (seg.length > safeMax) {
      flushBuffer();
      const words = seg.split(' ');
      let wordBuf = '';
      for (const word of words) {
        if (!word) continue;
        if (word.length > safeMax) {
          if (wordBuf) {
            chunks.push(wordBuf.trim());
            wordBuf = '';
          }
          chunks.push(word);
          continue;
        }
        const nextWordBuf = wordBuf ? `${wordBuf} ${word}` : word;
        if (nextWordBuf.length <= safeMax) {
          wordBuf = nextWordBuf;
        } else {
          chunks.push(wordBuf.trim());
          wordBuf = word;
        }
      }
      if (wordBuf.trim()) chunks.push(wordBuf.trim());
      continue;
    }

    const candidate = buffer ? `${buffer} ${seg}` : seg;
    if (candidate.length <= safeMax) {
      buffer = candidate;
    } else {
      flushBuffer();
      buffer = seg;
    }
  }

  flushBuffer();
  return chunks;
}

/**
 * Chia nhỏ văn bản cho chế độ Giọng máy dự phòng (window.speechSynthesis):
 * - Mỗi đoạn BẮT BUỘC dưới 180 ký tự (mặc định tối đa 175 ký tự) để tránh lỗi
 *   trình duyệt Android/iOS tự ngắt âm thanh giữa chừng.
 * - Ưu tiên tách tại dấu câu kết thúc, tiếp theo dấu phẩy/hai chấm, cuối cùng theo ranh giới từ.
 */
export function splitTextForDeviceSpeech(text: string, maxLength: number = 200): string[] {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) return [];

  const safeMax = Math.max(60, Math.min(200, maxLength));
  const rawUnits = cleaned
    .split(/(?<=[.?!;…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const fineUnits: string[] = [];
  for (const unit of rawUnits) {
    if (unit.length <= safeMax) {
      fineUnits.push(unit);
      continue;
    }
    const clauses = unit
      .split(/(?<=[,:—–-])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
    for (const clause of clauses) {
      if (clause.length <= safeMax) {
        fineUnits.push(clause);
        continue;
      }
      const words = clause.split(/\s+/).filter(Boolean);
      let wordAcc = '';
      for (const word of words) {
        if (word.length > safeMax) {
          if (wordAcc) {
            fineUnits.push(wordAcc);
            wordAcc = '';
          }
          for (let i = 0; i < word.length; i += safeMax) {
            fineUnits.push(word.slice(i, i + safeMax));
          }
          continue;
        }
        const candidate = wordAcc ? `${wordAcc} ${word}` : word;
        if (candidate.length <= safeMax) {
          wordAcc = candidate;
        } else {
          if (wordAcc) fineUnits.push(wordAcc);
          wordAcc = word;
        }
      }
      if (wordAcc) fineUnits.push(wordAcc);
    }
  }

  const result: string[] = [];
  let buffer = '';
  for (const item of fineUnits) {
    const candidate = buffer ? `${buffer} ${item}` : item;
    if (candidate.length <= safeMax) {
      buffer = candidate;
    } else {
      if (buffer && /[\p{L}\p{N}]/u.test(buffer)) {
        result.push(buffer);
      }
      buffer = item;
    }
  }
  if (buffer && /[\p{L}\p{N}]/u.test(buffer)) {
    result.push(buffer);
  }
  return result;
}

/**
 * Bộ nhớ đệm Audio RAM trình duyệt (Blob ObjectURL Cache)
 * Giới hạn cứng tối đa 3 đoạn (MAX_BLOB_CACHE_ENTRIES = 3) để chống tràn RAM mobile.
 */
class SeamlessAudioCache {
  private blobUrls = new Map<string, string>();
  private activeFetches = new Map<string, Promise<string>>();
  private readonly MAX_CACHE_ENTRIES = MAX_BLOB_CACHE_ENTRIES;

  private makeKey(voiceId: string, text: string): string {
    return `${voiceId}:::${cleanTextForTTS(text)}`;
  }

  public has(voiceId: string, text: string): boolean {
    return this.blobUrls.has(this.makeKey(voiceId, text));
  }

  public get(voiceId: string, text: string): string | undefined {
    const key = this.makeKey(voiceId, text);
    return this.blobUrls.get(key);
  }

  public get size(): number {
    return this.blobUrls.size;
  }

  public revokeEntry(voiceId: string, text: string): void {
    const key = this.makeKey(voiceId, text);
    const url = this.blobUrls.get(key);
    this.blobUrls.delete(key);
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  }

  private setWithLimit(key: string, objectUrl: string, protectedKey?: string): void {
    if (this.blobUrls.has(key)) {
      const prev = this.blobUrls.get(key);
      if (prev && prev !== objectUrl && prev.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(prev);
        } catch {}
      }
      this.blobUrls.delete(key);
    }

    while (this.blobUrls.size >= this.MAX_CACHE_ENTRIES) {
      let evictKey: string | undefined;
      for (const candidateKey of this.blobUrls.keys()) {
        if (candidateKey !== protectedKey && candidateKey !== key) {
          evictKey = candidateKey;
          break;
        }
      }
      if (!evictKey) {
        evictKey = this.blobUrls.keys().next().value;
      }
      if (!evictKey) break;

      const oldestUrl = this.blobUrls.get(evictKey);
      this.blobUrls.delete(evictKey);
      if (oldestUrl && oldestUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(oldestUrl);
        } catch {}
      }
    }

    this.blobUrls.set(key, objectUrl);
  }

  public async fetchAndCache(
    voiceId: string,
    text: string,
    onRetryAttempt?: (attempt: number) => void,
    externalSignal?: AbortSignal,
    protectedText?: string
  ): Promise<string> {
    const cleanText = cleanTextForTTS(text);
    if (!cleanText || !/[\p{L}\p{N}]/u.test(cleanText)) {
      return SKIPPED_TTS_CHUNK_URL;
    }
    const key = this.makeKey(voiceId, cleanText);
    const protectedKey = protectedText ? this.makeKey(voiceId, protectedText) : undefined;

    const existing = this.blobUrls.get(key);
    if (existing) {
      return existing;
    }

    if (this.activeFetches.has(key)) {
      return this.activeFetches.get(key)!;
    }

    const fetchPromise = (async () => {
      try {
        const blob = await fetchTtsAudioBlobWithWatchdog({
          text: cleanText,
          voiceId,
          signal: externalSignal,
          onRetryAttempt,
          timeoutMs: TTS_FETCH_TIMEOUT_MS,
          maxRetries: TTS_MAX_RETRIES,
        });

        if (externalSignal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        if (!blob) {
          return SKIPPED_TTS_CHUNK_URL;
        }

        const objectUrl = URL.createObjectURL(blob);
        this.setWithLimit(key, objectUrl, protectedKey);
        return objectUrl;
      } finally {
        this.activeFetches.delete(key);
      }
    })();

    this.activeFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  public clear(): void {
    for (const url of this.blobUrls.values()) {
      if (url && url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
    }
    this.blobUrls.clear();
    this.activeFetches.clear();
  }
}

export const seamlessAudioCache = new SeamlessAudioCache();

export class AudioStreamer {
  private audioElement: HTMLAudioElement;
  private voiceId: string;
  private playbackRate: number;
  private chunks: AudioChunk[] = [];
  private currentChunkIndex: number = -1;
  private isPlaying: boolean = false;
  private autoNextChapter: boolean = true;
  private abortController: AbortController | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private onChunkChange?: (index: number, chunk: AudioChunk) => void;
  private onComplete?: () => void;
  private onNextChapter?: () => void;
  private onError?: (msg: string) => void;

  constructor(options?: {
    voiceId?: string;
    playbackRate?: number;
    autoNextChapter?: boolean;
    onChunkChange?: (index: number, chunk: AudioChunk) => void;
    onComplete?: () => void;
    onNextChapter?: () => void;
    onError?: (msg: string) => void;
  }) {
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.voiceId = options?.voiceId || 'vi-VN-HoaiMyNeural';
    this.playbackRate = options?.playbackRate || 1.0;
    this.autoNextChapter = options?.autoNextChapter ?? true;
    this.onChunkChange = options?.onChunkChange;
    this.onComplete = options?.onComplete;
    this.onNextChapter = options?.onNextChapter;
    this.onError = options?.onError;
  }

  private clearStallTimer() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  public setContent(content: string) {
    this.pause();
    seamlessAudioCache.clear();
    this.chunks = chunkChapterContent(content);
    this.currentChunkIndex = -1;
  }

  public setAutoNextChapter(enabled: boolean) {
    this.autoNextChapter = enabled;
  }

  public setOnNextChapter(callback: () => void) {
    this.onNextChapter = callback;
  }

  public setVoiceId(voice: string) {
    this.voiceId = voice;
    seamlessAudioCache.clear();
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = rate;
    const anyAudio = this.audioElement as any;
    if ('preservesPitch' in this.audioElement) this.audioElement.preservesPitch = true;
    if ('mozPreservesPitch' in anyAudio) anyAudio.mozPreservesPitch = true;
    if ('webkitPreservesPitch' in anyAudio) anyAudio.webkitPreservesPitch = true;
    this.audioElement.defaultPlaybackRate = rate;
    this.audioElement.playbackRate = rate;
  }

  public getChunks(): AudioChunk[] {
    return this.chunks;
  }

  public getCurrentIndex(): number {
    return this.currentChunkIndex;
  }

  public async playChunk(index: number): Promise<void> {
    this.clearStallTimer();

    if (index < 0 || index >= this.chunks.length) {
      this.isPlaying = false;
      seamlessAudioCache.clear();
      if (this.onComplete) this.onComplete();
      if (this.autoNextChapter && this.onNextChapter) {
        this.onNextChapter();
      }
      return;
    }

    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {}
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const chunk = this.chunks[index];
    this.currentChunkIndex = index;
    if (this.onChunkChange) this.onChunkChange(index, chunk);

    try {
      const audioUrl = await seamlessAudioCache.fetchAndCache(
        this.voiceId,
        chunk.text,
        undefined,
        signal,
        chunk.text
      );

      if (audioUrl === SKIPPED_TTS_CHUNK_URL) {
        if (!signal.aborted) {
          await this.playChunk(index + 1);
        }
        return;
      }

      this.audioElement.onended = null;
      this.audioElement.onerror = null;
      this.audioElement.onstalled = null;
      this.audioElement.onloadedmetadata = null;
      this.audioElement.onplaying = null;
      this.audioElement.src = audioUrl;
      this.setPlaybackRate(this.playbackRate);

      let recoveryAttempted = false;

      this.audioElement.onloadedmetadata = () => {
        this.setPlaybackRate(this.playbackRate);
      };

      this.audioElement.onplaying = () => {
        this.clearStallTimer();
        this.setPlaybackRate(this.playbackRate);
      };

      this.audioElement.onstalled = () => {
        if (!this.isPlaying || this.stallTimer) return;
        this.stallTimer = setTimeout(async () => {
          this.stallTimer = null;
          if (!this.isPlaying || this.currentChunkIndex !== index) return;
          if (!recoveryAttempted) {
            recoveryAttempted = true;
            try {
              if (this.audioElement.readyState >= 2) {
                this.setPlaybackRate(this.playbackRate);
                await this.audioElement.play();
                this.setPlaybackRate(this.playbackRate);
                return;
              }
              const savedTime = Number.isFinite(this.audioElement.currentTime) ? this.audioElement.currentTime : 0;
              const savedDuration = Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0;
              this.audioElement.load();
              this.setPlaybackRate(this.playbackRate);
              await this.audioElement.play();
              this.setPlaybackRate(this.playbackRate);
              if (savedTime > 0 && (savedDuration <= 0 || savedTime < savedDuration)) {
                try {
                  this.audioElement.currentTime = savedTime;
                } catch {}
              }
              return;
            } catch {}
          }
          // Tuyệt đối không nhảy sang đoạn khác khi đoạn hiện tại chưa phát xong
          this.isPlaying = false;
          this.onError?.('Phát đoạn hiện tại bị gián đoạn. Vui lòng nhấn Phát để tiếp tục đúng đoạn này.');
        }, 8000);
      };

      this.audioElement.onended = () => {
        this.clearStallTimer();
        this.audioElement.onended = null;
        seamlessAudioCache.revokeEntry(this.voiceId, chunk.text);
        this.playChunk(index + 1);
      };

      this.audioElement.onerror = () => {
        this.clearStallTimer();
        if (!recoveryAttempted) {
          recoveryAttempted = true;
          seamlessAudioCache.revokeEntry(this.voiceId, chunk.text);
          this.playChunk(index);
          return;
        }
        this.isPlaying = false;
        this.onError?.('Lỗi phát âm thanh hiện tại. Vui lòng nhấn Phát để thử lại.');
      };

      await this.audioElement.play();
      this.audioElement.defaultPlaybackRate = this.playbackRate;
      this.audioElement.playbackRate = this.playbackRate;
      this.isPlaying = true;

      // Tải trước TUẦN TỰ 2 đoạn kế tiếp (N+1 tải ngay, N+2 nghỉ 150ms) để nối câu không độ trễ
      const lookahead = [1, 2]
        .map((offset) => this.chunks[index + offset])
        .filter(Boolean);
      if (lookahead.length > 0 && !signal.aborted) {
        (async () => {
          for (let i = 0; i < lookahead.length; i++) {
            const nextTarget = lookahead[i];
            if (signal.aborted || !this.isPlaying) break;
            try {
              if (i > 0) {
                await sleepWithAbort(150, signal);
              }
              if (signal.aborted || !this.isPlaying) break;
              await seamlessAudioCache.fetchAndCache(this.voiceId, nextTarget.text, undefined, signal, chunk.text);
            } catch {
              // Bỏ qua lỗi prefetch đơn lẻ để không ảnh hưởng đoạn đang phát
            }
          }
        })();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn(`[AudioStreamer] Failed after retries & failover for chunk #${index}:`, err);
      this.isPlaying = false;
      this.onError?.(err?.message || 'Kết nối giọng đọc bị gián đoạn. Vui lòng thử lại.');
    }
  }

  public async play(): Promise<void> {
    const startIndex = this.currentChunkIndex >= 0 ? this.currentChunkIndex : 0;
    await this.playChunk(startIndex);
  }

  public pause() {
    this.isPlaying = false;
    this.clearStallTimer();
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {}
      this.abortController = null;
    }
    this.audioElement.pause();
  }

  public destroy() {
    this.pause();
    this.audioElement.onended = null;
    this.audioElement.onerror = null;
    this.audioElement.onstalled = null;
    this.audioElement.onloadedmetadata = null;
    this.audioElement.onplaying = null;
    this.audioElement.src = '';
    seamlessAudioCache.clear();
  }
}
