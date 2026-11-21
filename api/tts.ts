/**
 * Vercel Serverless Function: Edge TTS Audio Streamer
 * Endpoint: /api/tts?text=...&voice=...
 * Supports: vi-VN-HoaiMyNeural (Nữ), vi-VN-NamMinhNeural (Nam)
 * Output: audio/mpeg stream with HTTP caching
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// In-memory cache for synthesized speech segments (LRU buffer cache, max 40 items)
const audioBufferCache = new Map<string, Buffer>();
const MAX_CACHE_ITEMS = 450;
const TTS_SYNTHESIS_TIMEOUT_MS = 14000;
const TTS_BACKEND_MAX_RETRIES = 2;
const TTS_BACKEND_RETRY_DELAY_MS = 350;
const MIN_SALVAGE_AUDIO_BYTES = 2048;

function sanitizeTextForEdgeTts(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFFD]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' và ')
    .replace(/&lt;|&gt;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[<>]/g, ' ')
    .replace(/&/g, ' và ')
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}

function isRetryableEdgeTtsError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('stream closed') ||
    msg.includes('no turn.end') ||
    msg.includes('turn.end') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('quá thời gian') ||
    msg.includes('đóng sớm') ||
    msg.includes('websocket') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('không nhận được dữ liệu âm thanh')
  );
}

function isAudioBufferSubstantial(buf: Buffer | null | undefined, cleanTextLength: number): boolean {
  if (!buf || buf.length < MIN_SALVAGE_AUDIO_BYTES) return false;
  const minExpectedBytes = Math.max(MIN_SALVAGE_AUDIO_BYTES, Math.min(18000, cleanTextLength * 180));
  return buf.length >= minExpectedBytes;
}

async function synthesizeOnce(cleanText: string, voiceCode: string): Promise<Buffer> {
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: 8000,
    synthesisTimeoutMs: TTS_SYNTHESIS_TIMEOUT_MS,
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

    const collectSalvage = (): Buffer | undefined => {
      if (chunks.length === 0) return undefined;
      const buf = Buffer.concat(chunks);
      chunks.length = 0;
      return buf.length >= MIN_SALVAGE_AUDIO_BYTES ? buf : undefined;
    };

    const finishWithError = (err: Error, salvaged?: Buffer) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (salvaged) (err as any).salvagedBuffer = salvaged;
      reject(err);
    };

    const finishWithSuccess = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buf);
    };

    timeout = setTimeout(() => {
      finishWithError(
        new Error('Quá thời gian 14s kết nối tới máy chủ Microsoft Edge TTS.'),
        collectSalvage()
      );
    }, TTS_SYNTHESIS_TIMEOUT_MS);

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
          if (fullBuffer.length > 0) {
            finishWithSuccess(fullBuffer);
          } else {
            finishWithError(new Error('Không nhận được dữ liệu âm thanh từ Edge TTS.'));
          }
        });

        audioStream.on('close', () => {
          if (!settled) {
            const fullBuffer = Buffer.concat(chunks);
            chunks.length = 0;
            if (isAudioBufferSubstantial(fullBuffer, cleanText.length)) {
              finishWithSuccess(fullBuffer);
            } else {
              finishWithError(
                new Error('Luồng âm thanh Edge TTS đã đóng sớm.'),
                fullBuffer.length >= MIN_SALVAGE_AUDIO_BYTES ? fullBuffer : undefined
              );
            }
          }
        });

        audioStream.on('error', (err: any) => {
          const salvaged = collectSalvage();
          finishWithError(err instanceof Error ? err : new Error(String(err)), salvaged);
        });
      })
      .catch((err: any) => {
        chunks.length = 0;
        finishWithError(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

export default async function handler(req: any, res: any) {
  // Support both GET (query parameters) and POST (JSON body)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Phương thức không được hỗ trợ. Vui lòng dùng GET hoặc POST.' });
  }

  const text = (req.method === 'GET' ? req.query?.text : req.body?.text) as string;
  const requestedVoice = (req.method === 'GET' ? req.query?.voice : req.body?.voice) as string;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Nội dung văn bản (text) không được để trống.' });
  }

  // Chuẩn hóa voice code sang giọng Edge TTS tiếng Việt chính thức
  let voiceCode = 'vi-VN-HoaiMyNeural';
  if (requestedVoice) {
    const lower = requestedVoice.toLowerCase();
    if (lower.includes('namminh') || lower === 'nam-minh') {
      voiceCode = 'vi-VN-NamMinhNeural';
    } else if (lower.includes('hoaimy') || lower === 'hoai-my') {
      voiceCode = 'vi-VN-HoaiMyNeural';
    } else if (requestedVoice.startsWith('vi-VN-')) {
      voiceCode = requestedVoice;
    }
  }

  // Làm sạch văn bản và giới hạn an toàn cho từng chunk
  const cleanText = sanitizeTextForEdgeTts(text);
  if (!cleanText) {
    return res.status(400).json({ error: 'Nội dung văn bản (text) không hợp lệ sau khi làm sạch.' });
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
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    return res.end(cachedBuffer);
  }

  try {
    let fullBuffer: Buffer | null = null;
    let isComplete = true;
    let bestSalvaged: Buffer | undefined;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= TTS_BACKEND_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, TTS_BACKEND_RETRY_DELAY_MS));
      }
      try {
        fullBuffer = await synthesizeOnce(cleanText, voiceCode);
        break;
      } catch (err: any) {
        lastErr = err;
        const salvaged: Buffer | undefined = err?.salvagedBuffer;
        if (salvaged && (!bestSalvaged || salvaged.length > bestSalvaged.length)) {
          bestSalvaged = salvaged;
        }
        if (attempt < TTS_BACKEND_MAX_RETRIES && isRetryableEdgeTtsError(err)) {
          continue;
        }
        break;
      }
    }

    if (!fullBuffer) {
      if (bestSalvaged && isAudioBufferSubstantial(bestSalvaged, cleanText.length)) {
        fullBuffer = bestSalvaged;
        isComplete = false;
      } else {
        throw lastErr instanceof Error ? lastErr : new Error('Không thể tổng hợp giọng đọc.');
      }
    }

    if (isComplete) {
      if (audioBufferCache.has(cacheKey)) {
        audioBufferCache.delete(cacheKey);
      }
      while (audioBufferCache.size >= MAX_CACHE_ITEMS) {
        const oldestKey = audioBufferCache.keys().next().value;
        if (oldestKey !== undefined) audioBufferCache.delete(oldestKey);
        else break;
      }
      audioBufferCache.set(cacheKey, fullBuffer);
    }

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', fullBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
      res.end(fullBuffer);
    }
  } catch (err: any) {
    console.error('[Edge TTS Serverless Handler Error]:', err);
    if (!res.headersSent) {
      const msg = String(err?.message || 'Unknown error');
      const isTimeout = msg.includes('Quá thời gian') || msg.includes('timed out');
      res.status(isTimeout ? 504 : 502).json({ error: 'Không thể tổng hợp giọng đọc: ' + msg });
    }
  }
}
