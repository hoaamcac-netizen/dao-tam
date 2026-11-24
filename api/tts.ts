/**
 * Vercel Serverless Function: Edge TTS Audio Streamer
 * Endpoint: /api/tts?text=...&voice=...
 * Supports: vi-VN-HoaiMyNeural (Nữ), vi-VN-NamMinhNeural (Nam)
 * Output: audio/mpeg stream with HTTP caching
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// In-memory cache for synthesized speech segments (LRU buffer cache, max 40 items)
const audioBufferCache = new Map<string, Buffer>();
const MAX_CACHE_ITEMS = 40;
const EDGE_TTS_PROBE_TIMEOUT_MS = 1500;
const EDGE_TTS_COOLDOWN_MS = 3 * 60 * 1000;
const VERCEL_HARD_DEADLINE_MS = 8500;

let edgeTtsDegradedUntil = 0;

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

function stripLeadingId3v2Vercel(buf: Buffer): Buffer {
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const flags = buf[5];
    const hasFooter = (flags & 0x10) !== 0;
    const tagSize =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    const totalHeaderSize = 10 + tagSize + (hasFooter ? 10 : 0);
    if (totalHeaderSize > 10 && totalHeaderSize < buf.length) {
      return buf.subarray(totalHeaderSize);
    }
  }
  return buf;
}

function splitTextForShortTtsSegments(text: string, maxLen = 175): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const sentences = clean
    .split(/(?<=[.?!;…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const fineUnits: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      fineUnits.push(sentence);
      continue;
    }
    const clauses = sentence
      .split(/(?<=[,:])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
    for (const clause of clauses) {
      if (clause.length <= maxLen) {
        fineUnits.push(clause);
        continue;
      }
      const words = clause.split(/\s+/).filter(Boolean);
      let wordAcc = '';
      for (const word of words) {
        if (word.length > maxLen) {
          if (wordAcc) {
            fineUnits.push(wordAcc);
            wordAcc = '';
          }
          for (let i = 0; i < word.length; i += maxLen) {
            fineUnits.push(word.slice(i, i + maxLen));
          }
          continue;
        }
        const cand = wordAcc ? `${wordAcc} ${word}` : word;
        if (cand.length <= maxLen) {
          wordAcc = cand;
        } else {
          if (wordAcc) fineUnits.push(wordAcc);
          wordAcc = word;
        }
      }
      if (wordAcc) fineUnits.push(wordAcc);
    }
  }

  const packed: string[] = [];
  let buf = '';
  for (const unit of fineUnits) {
    const cand = buf ? `${buf} ${unit}` : unit;
    if (cand.length <= maxLen) {
      buf = cand;
    } else {
      if (buf && /[\p{L}\p{N}]/u.test(buf)) packed.push(buf);
      buf = unit;
    }
  }
  if (buf && /[\p{L}\p{N}]/u.test(buf)) packed.push(buf);
  return packed;
}

async function fetchGoogleTranslateMp3Segment(segmentText: string, timeoutMs: number): Promise<Buffer> {
  const endpoints = [
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(segmentText)}`,
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&q=${encodeURIComponent(segmentText)}`,
  ];

  let lastErr: unknown = null;
  for (const url of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(2000, timeoutMs));
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`Google TTS HTTP ${resp.status}`);
      }
      const arrBuf = await resp.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      if (buf.length < 256) {
        throw new Error('Google TTS returned empty audio');
      }
      return buf;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Fallback TTS failed');
}

async function synthesizeGoogleTtsFallbackBuffer(cleanText: string, startedAt: number): Promise<Buffer> {
  const segments = splitTextForShortTtsSegments(cleanText, 175);
  if (segments.length === 0) {
    throw new Error('Không có nội dung hợp lệ để tổng hợp giọng đọc.');
  }

  const buffers: Buffer[] = [];
  for (let i = 0; i < segments.length; i++) {
    const remaining = VERCEL_HARD_DEADLINE_MS - (Date.now() - startedAt);
    if (remaining < 1200) {
      throw new Error('Quá thời gian xử lý hàm Vercel.');
    }
    const segBuf = await fetchGoogleTranslateMp3Segment(segments[i], Math.min(4500, remaining));
    buffers.push(i === 0 ? segBuf : stripLeadingId3v2Vercel(segBuf));
  }
  return Buffer.concat(buffers);
}

async function synthesizeOnce(cleanText: string, voiceCode: string, timeoutMs: number): Promise<Buffer> {
  const safeTimeout = Math.max(1800, timeoutMs);
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: Math.min(2500, safeTimeout),
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
            if (fullBuffer.length > 0) {
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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    return res.end(cachedBuffer);
  }

  const startedAt = Date.now();
  try {
    let fullBuffer: Buffer | null = null;

    if (Date.now() >= edgeTtsDegradedUntil) {
      try {
        fullBuffer = await synthesizeOnce(cleanText, voiceCode, EDGE_TTS_PROBE_TIMEOUT_MS);
        edgeTtsDegradedUntil = 0;
      } catch {
        edgeTtsDegradedUntil = Date.now() + EDGE_TTS_COOLDOWN_MS;
      }
    }

    if (!fullBuffer) {
      fullBuffer = await synthesizeGoogleTtsFallbackBuffer(cleanText, startedAt);
    }

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
