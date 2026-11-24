/**
 * Audio Chunker Engine & AudioStreamer for Đạo Tâm
 * - Làm sạch văn bản bằng Regex (loại bỏ HTML, URL, ký tự rác)
 * - Gộp câu thành các đoạn tối ưu 500 - 800 ký tự theo ranh giới dấu chấm/xuống dòng
 * - Fetch TTS với AbortController timeout 8 giây + Retry tối đa 3 lần
 * - Bộ nhớ đệm Blob URL giới hạn cứng tối đa 5 đoạn, tự động revokeObjectURL chống tràn RAM
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
export const TTS_MAX_RETRIES = 2;
export const TTS_RETRY_DELAY_MS = 850;
export const TTS_ACTIVE_SERVER_STORAGE_KEY = 'daotam_active_tts_endpoint';
export const DEFAULT_FIRST_CHUNK_MIN_LENGTH = 100;
export const DEFAULT_FIRST_CHUNK_MAX_LENGTH = 175;
export const DEFAULT_CHUNK_MIN_LENGTH = 400;
export const DEFAULT_CHUNK_MAX_LENGTH = 560;
export const MAX_BLOB_CACHE_ENTRIES = 8;
export const SKIPPED_TTS_CHUNK_URL = '__SKIPPED_204__';

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

/**
 * Đọc danh sách các server TTS từ biến môi trường VITE_TTS_API_URL (cách nhau bằng dấu phẩy).
 * Luôn bổ sung '/api/tts' cùng domain làm dự phòng cuối cùng (không dính CORS).
 */
export function getTtsEndpointUrls(): string[] {
  const raw = String((import.meta as any)?.env?.VITE_TTS_API_URL || '').trim();
  const seen = new Set<string>();
  const endpoints: string[] = [];

  if (raw) {
    for (const part of raw.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const normalized = normalizeTtsEndpoint(trimmed);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        endpoints.push(normalized);
      }
    }
  }

  const sameOriginUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/api/tts`
      : '';
  const hasSameOrigin =
    seen.has('/api/tts') || (sameOriginUrl ? seen.has(sameOriginUrl) : false);

  if (!hasSameOrigin) {
    endpoints.push('/api/tts');
  }

  return endpoints.length > 0 ? endpoints : ['/api/tts'];
}

function getSessionActiveTtsEndpoint(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.sessionStorage.getItem(TTS_ACTIVE_SERVER_STORAGE_KEY);
    return val ? val.trim() : null;
  } catch {
    return null;
  }
}

export function rememberActiveTtsEndpoint(endpointUrl: string): void {
  if (typeof window === 'undefined' || !endpointUrl) return;
  try {
    window.sessionStorage.setItem(TTS_ACTIVE_SERVER_STORAGE_KEY, endpointUrl);
  } catch {}
}

export function clearActiveTtsEndpoint(onlyIfMatches?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (onlyIfMatches) {
      const current = window.sessionStorage.getItem(TTS_ACTIVE_SERVER_STORAGE_KEY);
      if (current && current.trim() === onlyIfMatches.trim()) {
        window.sessionStorage.removeItem(TTS_ACTIVE_SERVER_STORAGE_KEY);
      }
    } else {
      window.sessionStorage.removeItem(TTS_ACTIVE_SERVER_STORAGE_KEY);
    }
  } catch {}
}

export function getOrderedTtsEndpoints(): string[] {
  const configured = getTtsEndpointUrls();
  const savedActive = getSessionActiveTtsEndpoint();
  if (savedActive && configured.includes(savedActive)) {
    return [savedActive, ...configured.filter((url) => url !== savedActive)];
  }
  return configured;
}

/**
 * Lấy địa chỉ endpoint TTS ưu tiên hiện tại (từ sessionStorage nếu đã failover, hoặc server đầu tiên trong VITE_TTS_API_URL).
 */
export function getTtsEndpointUrl(): string {
  return getOrderedTtsEndpoints()[0] || '/api/tts';
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

function isNonRetryableSingleServerStatus(status: number): boolean {
  return status === 402;
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

    if (
      response.status === 402 ||
      response.status === 429 ||
      response.status >= 500 ||
      !response.ok
    ) {
      const err: any = new Error(`TTS API failed with status ${response.status}`);
      err.httpStatus = response.status;
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const byteView = new Uint8Array(arrayBuffer);

    if (arrayBuffer.byteLength < 100 || isLikelyHtmlOrTextPayload(byteView, contentType)) {
      throw new Error('Dữ liệu âm thanh trả về không hợp lệ');
    }

    return { blob: new Blob([arrayBuffer], { type: 'audio/mpeg' }), status: response.status };
  } catch (err) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (didTimeout) {
      const timeoutErr: any = new Error(
        `Quá thời gian ${Math.round(timeoutMs / 1000)}s kết nối máy chủ giọng đọc`
      );
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Fetch audio TTS hỗ trợ đa server Failover:
 * - Dùng GET (CORS Simple Request) cho đoạn ngắn/trung bình để loại bỏ OPTIONS preflight.
 * - Thử lần lượt từng server (gồm VITE_TTS_API_URL + /api/tts cùng domain dự phòng).
 * - Nếu 1 server lỗi: xóa ghim sessionStorage và xoay vòng server ở lượt thử lại với backoff tăng dần.
 */
export async function fetchTtsAudioBlobWithWatchdog(params: {
  text: string;
  voiceId: string;
  signal?: AbortSignal;
  onRetryAttempt?: (attempt: number) => void;
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

  const orderedEndpoints = getOrderedTtsEndpoints();
  let lastError: unknown = null;

  for (let round = 0; round <= maxRetries; round++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (round > 0) {
      onRetryAttempt?.(round);
      const backoffMs = Math.min(5000, Math.round(retryDelayMs * Math.pow(1.75, round - 1)));
      await sleepWithAbort(backoffMs, externalSignal);
    }

    let roundHadRetryableError = false;
    const len = orderedEndpoints.length;

    for (let offset = 0; offset < len; offset++) {
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const idx = (offset + round) % len;
      if (round === 0 && offset > 0) {
        onRetryAttempt?.(offset);
      }

      const endpointUrl = orderedEndpoints[idx];
      const attemptTimeoutMs =
        round === 0 && len > 1 && offset < len - 1
          ? Math.min(timeoutMs, 7500)
          : timeoutMs;

      try {
        const result = await fetchSingleTtsEndpoint({
          endpointUrl,
          cleanText,
          voiceId,
          externalSignal,
          timeoutMs: attemptTimeoutMs,
        });
        rememberActiveTtsEndpoint(endpointUrl);
        return result.blob;
      } catch (err: any) {
        if (err?.name === 'AbortError' || externalSignal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        clearActiveTtsEndpoint(endpointUrl);
        lastError = err;
        const isSingleNonRetryable =
          len === 1 &&
          typeof err?.httpStatus === 'number' &&
          isNonRetryableSingleServerStatus(err.httpStatus);
        if (!isSingleNonRetryable) {
          roundHadRetryableError = true;
        }
        console.warn(
          `[TTS Failover] Lượt ${round + 1}, Server #${idx + 1} (${endpointUrl}) lỗi:`,
          err?.message || err
        );
      }
    }

    if (!roundHadRetryableError) {
      break;
    }
  }

  const baseMessage =
    lastError instanceof Error && lastError.message
      ? lastError.message
      : 'Máy chủ giọng đọc không phản hồi';
  throw new Error(`Lỗi gọi server TTS: ${baseMessage}`);
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

  const nextMinLen = Math.max(200, idealMinLength);
  const nextMaxLen = Math.max(nextMinLen + 50, idealMaxLength);
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
export function splitTextForDeviceSpeech(text: string, maxLength: number = 175): string[] {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) return [];

  const safeMax = Math.max(60, Math.min(178, maxLength));
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
      this.audioElement.defaultPlaybackRate = this.playbackRate;
      this.audioElement.playbackRate = this.playbackRate;

      let recoveryAttempted = false;

      this.audioElement.onloadedmetadata = () => {
        this.audioElement.defaultPlaybackRate = this.playbackRate;
        this.audioElement.playbackRate = this.playbackRate;
      };

      this.audioElement.onplaying = () => {
        this.clearStallTimer();
        this.audioElement.playbackRate = this.playbackRate;
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
                this.audioElement.defaultPlaybackRate = this.playbackRate;
                this.audioElement.playbackRate = this.playbackRate;
                await this.audioElement.play();
                this.audioElement.playbackRate = this.playbackRate;
                return;
              }
              const savedTime = Number.isFinite(this.audioElement.currentTime) ? this.audioElement.currentTime : 0;
              const savedDuration = Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0;
              this.audioElement.load();
              this.audioElement.defaultPlaybackRate = this.playbackRate;
              this.audioElement.playbackRate = this.playbackRate;
              await this.audioElement.play();
              this.audioElement.playbackRate = this.playbackRate;
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

      // Tải trước TUẦN TỰ 3 đoạn kế tiếp: đoạn kế tiếp (offset 1) tải ngay không chờ, các đoạn sau nghỉ 250ms
      const lookahead = [1, 2, 3]
        .map((offset) => this.chunks[index + offset])
        .filter(Boolean);
      if (lookahead.length > 0 && !signal.aborted) {
        (async () => {
          for (let i = 0; i < lookahead.length; i++) {
            const nextTarget = lookahead[i];
            if (signal.aborted || !this.isPlaying) break;
            try {
              if (i > 0) {
                await sleepWithAbort(250, signal);
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
      console.warn(`[AudioStreamer] Failed after 3 retries for chunk #${index}:`, err);
      this.isPlaying = false;
      this.onError?.('Kết nối giọng đọc bị gián đoạn sau 3 lần thử.');
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
