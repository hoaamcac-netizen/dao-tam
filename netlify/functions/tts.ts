import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

interface NetlifyEvent {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface NetlifyResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_CACHE_ITEMS = 40;
const audioBufferCache = new Map<string, Buffer>();
const EDGE_TTS_PROBE_TIMEOUT_MS = 1500;
const EDGE_TTS_COOLDOWN_MS = 3 * 60 * 1000;
const NETLIFY_HARD_DEADLINE_MS = 8200;

let edgeTtsDegradedUntil = 0;

/**
 * Bộ lọc làm sạch văn bản cho TTS:
 * - Chỉ giữ lại chữ cái Unicode (\p{L} để giữ đủ tiếng Việt có dấu), chữ số (\p{N}),
 *   khoảng trắng (\s) và dấu câu cơ bản (. , ? ! : ;)
 * - Thay tất cả ký tự lạ (【】, 《》, 「」, —, ***, ~, emoji...) bằng khoảng trắng.
 */
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

function normalizeVoiceCode(requestedVoice?: string): string {
  if (!requestedVoice || typeof requestedVoice !== 'string') {
    return 'vi-VN-NamMinhNeural';
  }
  const lower = requestedVoice.toLowerCase().trim();
  if (lower.includes('hoaimy') || lower === 'hoai-my') {
    return 'vi-VN-HoaiMyNeural';
  }
  if (lower.includes('namminh') || lower === 'nam-minh') {
    return 'vi-VN-NamMinhNeural';
  }
  if (requestedVoice.startsWith('vi-VN-')) {
    return requestedVoice;
  }
  return 'vi-VN-NamMinhNeural';
}

function stripLeadingId3v2Netlify(buf: Buffer): Buffer {
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
    const remaining = NETLIFY_HARD_DEADLINE_MS - (Date.now() - startedAt);
    if (remaining < 1200) {
      throw new Error('Quá thời gian xử lý hàm Netlify.');
    }
    const segBuf = await fetchGoogleTranslateMp3Segment(segments[i], Math.min(4500, remaining));
    buffers.push(i === 0 ? segBuf : stripLeadingId3v2Netlify(segBuf));
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

function parsePostBody(event: NetlifyEvent): { text?: string; voice?: string } {
  if (!event.body) return {};
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    try {
      const params = new URLSearchParams(rawBody);
      return {
        text: params.get('text') || undefined,
        voice: params.get('voice') || undefined,
      };
    } catch {}
  }
  return {};
}

export const handler = async (event: NetlifyEvent): Promise<NetlifyResponse> => {
  const method = (event.httpMethod || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (method !== 'GET' && method !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ error: 'Phương thức không được hỗ trợ. Vui lòng dùng GET hoặc POST.' }),
    };
  }

  let text = '';
  let requestedVoice = '';

  if (method === 'GET') {
    text = event.queryStringParameters?.text || '';
    requestedVoice = event.queryStringParameters?.voice || '';
  } else {
    const body = parsePostBody(event);
    text = typeof body.text === 'string' ? body.text : event.queryStringParameters?.text || '';
    requestedVoice =
      typeof body.voice === 'string' ? body.voice : event.queryStringParameters?.voice || '';
  }

  const cleanText = sanitizeTextForEdgeTts(text);
  // Nếu sau khi lọc không còn chữ cái hay chữ số nào, trả về 204 để frontend trượt qua mượt mà
  if (!cleanText || !/[\p{L}\p{N}]/u.test(cleanText)) {
    return {
      statusCode: 204,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=86400',
      },
      body: '',
    };
  }

  const voiceCode = normalizeVoiceCode(requestedVoice);
  const cacheKey = `${voiceCode}:::${cleanText}`;

  if (audioBufferCache.has(cacheKey)) {
    const cachedBuffer = audioBufferCache.get(cacheKey)!;
    audioBufferCache.delete(cacheKey);
    audioBufferCache.set(cacheKey, cachedBuffer);
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
      body: cachedBuffer.toString('base64'),
      isBase64Encoded: true,
    };
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

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
      body: fullBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err: any) {
    console.error('[Netlify Edge TTS Function Error]:', err);
    const msg = String(err?.message || 'Unknown error');
    const isTimeout = msg.includes('Quá thời gian') || msg.includes('timed out');
    return {
      statusCode: isTimeout ? 504 : 502,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ error: 'Không thể tổng hợp giọng đọc: ' + msg }),
    };
  }
};
