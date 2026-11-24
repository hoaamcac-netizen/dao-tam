/**
 * Vercel Serverless Function: Edge TTS Audio Streamer (Fallback Server)
 * Endpoint: /api/tts?text=...&voice=...
 * Supports: vi-VN-HoaiMyNeural (Nữ), vi-VN-NamMinhNeural (Nam)
 * Output: audio/mpeg stream with HTTP caching
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// In-memory cache for synthesized speech segments (LRU buffer cache, max 50 items)
const audioBufferCache = new Map<string, Buffer>();
const MAX_CACHE_ITEMS = 50;
const VERCEL_HARD_DEADLINE_MS = 9200;
const EDGE_CONNECT_TIMEOUT_MS = 3000;
const EDGE_ATTEMPT_TIMEOUT_MS = 4500;
const EDGE_MAX_ATTEMPTS = 4;
const EDGE_RETRY_DELAY_MS = 100;

function sanitizeTextForEdgeTts(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .normalize('NFC')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(?:p|div|span|br|hr|b|i|u|s|em|strong|small|sub|sup|h[1-6]|a|img|ul|ol|li|table|tr|td|th|thead|tbody|blockquote|pre|code|font|center|section|article|header|footer|aside|main|nav)\b(?:\s[^>]*)?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' và ')
    .replace(/&lt;|&gt;|&quot;|&#39;|&apos;/gi, ' ')
    .replace(/[^\p{L}\p{N}\s.,?!:;]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function synthesizeOnce(cleanText: string, voiceCode: string, timeoutMs: number): Promise<Buffer> {
  const safeTimeout = Math.max(2200, timeoutMs);
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: Math.min(EDGE_CONNECT_TIMEOUT_MS, safeTimeout),
    synthesisTimeoutMs: safeTimeout,
  });

  let audioStream: any = null;
  let metadataStream: any = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (audioStream) {
      try {
        audioStream.removeAllListeners();
        if (typeof audioStream.destroy === 'function') audioStream.destroy();
      } catch {}
      audioStream = null;
    }
    if (metadataStream) {
      try {
        metadataStream.removeAllListeners();
        if (typeof metadataStream.destroy === 'function') metadataStream.destroy();
      } catch {}
      metadataStream = null;
    }
    try {
      tts.close();
    } catch {}
  };

  return await new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];

    const finishWithError = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const finishWithSuccess = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buf);
    };

    timeout = setTimeout(() => {
      finishWithError(new Error('Quá thời gian kết nối tới máy chủ Microsoft Edge TTS.'));
    }, safeTimeout);

    tts
      .setMetadata(voiceCode, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      .then(() => {
        if (settled) return;
        const streams = tts.toStream(cleanText);
        audioStream = streams.audioStream;
        metadataStream = streams.metadataStream;
        if (metadataStream && typeof metadataStream.on === 'function') {
          metadataStream.on('error', () => {});
          metadataStream.resume?.();
        }

        audioStream.on('data', (chunk: Buffer) => {
          if (!settled && chunk && chunk.length > 0) {
            chunks.push(chunk);
          }
        });

        audioStream.on('end', () => {
          const fullBuffer = Buffer.concat(chunks);
          chunks.length = 0;
          if (fullBuffer.length >= 256) {
            finishWithSuccess(fullBuffer);
          } else {
            finishWithError(new Error('Không nhận được đủ dữ liệu âm thanh từ Edge TTS.'));
          }
        });

        audioStream.on('close', () => {
          if (!settled) {
            const fullBuffer = Buffer.concat(chunks);
            chunks.length = 0;
            if (fullBuffer.length >= 256) {
              finishWithSuccess(fullBuffer);
            } else {
              finishWithError(new Error('Luồng âm thanh Edge TTS đã đóng sớm.'));
            }
          }
        });

        audioStream.on('error', (err: any) => {
          chunks.length = 0;
          finishWithError(err instanceof Error ? err : new Error(String(err)));
        });
      })
      .catch((err: any) => {
        finishWithError(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

async function synthesizeEdgeTtsWithRetry(
  cleanText: string,
  voiceCode: string,
  startedAt: number
): Promise<Buffer> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= EDGE_MAX_ATTEMPTS; attempt++) {
    const remainingMs = VERCEL_HARD_DEADLINE_MS - (Date.now() - startedAt);
    if (remainingMs < 1800) {
      break;
    }

    const attemptTimeout = Math.min(EDGE_ATTEMPT_TIMEOUT_MS, remainingMs - 200);
    try {
      return await synthesizeOnce(cleanText, voiceCode, attemptTimeout);
    } catch (err: any) {
      lastError = err;
      const afterErrRemaining = VERCEL_HARD_DEADLINE_MS - (Date.now() - startedAt);
      if (attempt < EDGE_MAX_ATTEMPTS && afterErrRemaining >= 2200) {
        await delay(EDGE_RETRY_DELAY_MS);
      } else {
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Không thể tổng hợp giọng đọc Microsoft Edge TTS.');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-TTS-Voice, X-TTS-Provider');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Support both GET (query parameters) and POST (JSON body)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Phương thức không được hỗ trợ. Vui lòng dùng GET hoặc POST.' });
  }

  const text = (req.method === 'GET' ? req.query?.text : req.body?.text) as string;
  const requestedVoice = (req.method === 'GET' ? req.query?.voice : req.body?.voice) as string;

  // Chuẩn hóa voice code sang giọng Edge TTS tiếng Việt chính thức (mặc định Nam Minh)
  let voiceCode = 'vi-VN-NamMinhNeural';
  if (requestedVoice) {
    const lower = requestedVoice.toLowerCase();
    if (lower.includes('hoaimy') || lower === 'hoai-my') {
      voiceCode = 'vi-VN-HoaiMyNeural';
    } else if (lower.includes('namminh') || lower === 'nam-minh') {
      voiceCode = 'vi-VN-NamMinhNeural';
    } else if (requestedVoice.startsWith('vi-VN-')) {
      voiceCode = requestedVoice;
    }
  }

  // Làm sạch văn bản và giới hạn an toàn cho từng chunk
  const cleanText = sanitizeTextForEdgeTts(text);
  if (!cleanText || !/[\p{L}\p{N}]/u.test(cleanText)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(204).end();
  }
  const cacheKey = `${voiceCode}:::${cleanText}`;

  // Trả về ngay lập tức nếu đoạn âm thanh đã có trong cache bộ nhớ (0ms latency)
  if (audioBufferCache.has(cacheKey)) {
    const cachedBuffer = audioBufferCache.get(cacheKey)!;
    audioBufferCache.delete(cacheKey);
    audioBufferCache.set(cacheKey, cachedBuffer);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', cachedBuffer.length);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-TTS-Voice', voiceCode);
    res.setHeader('X-TTS-Provider', 'msedge-tts');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    return res.end(cachedBuffer);
  }

  const startedAt = Date.now();
  try {
    const fullBuffer = await synthesizeEdgeTtsWithRetry(cleanText, voiceCode, startedAt);

    if (audioBufferCache.has(cacheKey)) {
      audioBufferCache.delete(cacheKey);
    }
    while (audioBufferCache.size >= MAX_CACHE_ITEMS) {
      const oldestKey = audioBufferCache.keys().next().value;
      if (oldestKey !== undefined) audioBufferCache.delete(oldestKey);
      else break;
    }
    audioBufferCache.set(cacheKey, fullBuffer);

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', fullBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-TTS-Voice', voiceCode);
      res.setHeader('X-TTS-Provider', 'msedge-tts');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
      res.end(fullBuffer);
    }
  } catch (err: any) {
    console.error('[Edge TTS Serverless Handler Error]:', err);
    if (!res.headersSent) {
      const msg = String(err?.message || 'Unknown error');
      const isTimeout = msg.includes('Quá thời gian') || msg.includes('timed out');
      res.setHeader('Cache-Control', 'no-store');
      res.status(isTimeout ? 504 : 502).json({ error: 'Không thể tổng hợp giọng đọc Edge TTS: ' + msg });
    }
  }
}
