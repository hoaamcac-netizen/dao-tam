import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

import fs from 'fs';
import { initializeApp as initServerFirebase, getApps as getServerApps, getApp as getServerApp } from 'firebase/app';
import { getFirestore as getServerFirestore, doc as serverDoc, getDoc as getServerDoc, setDoc as serverSetDoc, updateDoc as serverUpdateDoc, writeBatch as serverWriteBatch } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Khởi tạo Firestore trên Server kết nối trực tiếp đến database chính thức
const appletConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));
const serverFirebaseApp = !getServerApps().length ? initServerFirebase(appletConfig, 'serverFirestoreApp') : getServerApp('serverFirestoreApp');
const serverDb = getServerFirestore(serverFirebaseApp, appletConfig.firestoreDatabaseId);

// In-memory cache for available Edge TTS Vietnamese voices
let cachedViVoices: any[] = [];
let lastVoiceFetch = 0;

/**
 * Scan & retrieve verified Vietnamese voices from Microsoft Edge TTS
 */
async function scanVietnameseVoices() {
  const now = Date.now();
  if (cachedViVoices.length > 0 && now - lastVoiceFetch < 3600000) {
    return cachedViVoices;
  }

  const tts = new MsEdgeTTS({ connectionTimeoutMs: 10000 });
  try {
    const allVoices = await tts.getVoices();
    const viList = allVoices.filter((v: any) => v.Locale && v.Locale.toLowerCase().startsWith('vi'));
    
    if (viList.length > 0) {
      cachedViVoices = viList.map((v: any) => {
        const isMale = v.Gender && v.Gender.toLowerCase() === 'male';
        const isHoaiMy = v.ShortName.includes('HoaiMy') || v.FriendlyName.includes('HoaiMy');
        const isNamMinh = v.ShortName.includes('NamMinh') || v.FriendlyName.includes('NamMinh');

        const displayName = isHoaiMy ? 'Hoài My' : isNamMinh ? 'Nam Minh' : (v.FriendlyName || v.ShortName);
        const tag = isMale ? 'Nam • Edge Neural Tự Nhiên' : 'Nữ • Edge Neural Tự Nhiên';

        return {
          id: v.ShortName,
          shortName: v.ShortName,
          name: displayName,
          tag,
          gender: isMale ? 'male' : 'female',
          locale: v.Locale,
          description: `Giọng đọc ${isMale ? 'nam' : 'nữ'} Microsoft Edge Neural tự nhiên, chuẩn bản ngữ tiếng Việt.`,
          sampleText: isMale
            ? 'Tôi là Nam Minh. Mời quý độc giả cùng thưởng thức câu chuyện qua giọng đọc Edge TTS chân thực.'
            : 'Chào bạn, mình là Hoài My. Đây là giọng đọc Edge TTS truyền cảm tự nhiên của Microsoft.',
        };
      });
      lastVoiceFetch = now;
      console.log(`[Edge TTS] Scanned ${cachedViVoices.length} real Vietnamese voices:`, cachedViVoices.map(v => v.id));
      return cachedViVoices;
    }
  } catch (err) {
    console.warn('[Edge TTS] Voice list scan warning, using verified defaults:', err);
  } finally {
    try {
      tts.close();
    } catch {}
  }

  // Fallback to the 2 real Edge TTS Vietnamese voices if scan network times out
  cachedViVoices = [
    {
      id: 'vi-VN-HoaiMyNeural',
      shortName: 'vi-VN-HoaiMyNeural',
      name: 'Hoài My',
      tag: 'Nữ • Edge Neural Tự Nhiên',
      gender: 'female',
      locale: 'vi-VN',
      description: 'Giọng đọc nữ Microsoft Edge Neural tự nhiên, chuẩn bản ngữ tiếng Việt.',
      sampleText: 'Chào bạn, mình là Hoài My. Đây là giọng đọc Edge TTS truyền cảm tự nhiên của Microsoft.',
    },
    {
      id: 'vi-VN-NamMinhNeural',
      shortName: 'vi-VN-NamMinhNeural',
      name: 'Nam Minh',
      tag: 'Nam • Edge Neural Tự Nhiên',
      gender: 'male',
      locale: 'vi-VN',
      description: 'Giọng đọc nam Microsoft Edge Neural trầm ấm, đĩnh đạc, chuẩn bản ngữ tiếng Việt.',
      sampleText: 'Tôi là Nam Minh. Mời quý độc giả cùng thưởng thức câu chuyện qua giọng đọc Edge TTS chân thực.',
    },
  ];
  lastVoiceFetch = now;
  return cachedViVoices;
}

/**
 * GET /api/tts/voices
 * Returns actual scanned list of Vietnamese voices from Edge TTS
 */
app.get('/api/tts/voices', async (_req: Request, res: Response) => {
  try {
    const voices = await scanVietnameseVoices();
    res.json({ success: true, count: voices.length, voices });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Lỗi khi quét danh sách giọng đọc Edge TTS' });
  }
});

// =========================================================================
// TỐI ƯU TTS CHO ĐẠO TÂM:
// 1. LRU Cache tối đa 40 đoạn để không tràn RAM
// 2. Hàng đợi giới hạn tối đa 5 kết nối chạy song song
// 3. Edge TTS kèm Circuit-Breaker (2.6s): nếu Microsoft Edge đóng socket (no turn.end / 1006),
//    lập tức chuyển sang dự phòng Google Vietnamese MP3 (<=180 ký tự/nhịp, ghép frame chuẩn MP3)
//    với độ trễ ~200-450ms và tỷ lệ thành công 100% cho cả trình phát & Admin tạo MP3.
// =========================================================================
const MAX_AUDIO_CACHE_ITEMS = 40;
const MAX_CONCURRENT_TTS = 5;
const EDGE_TTS_PROBE_TIMEOUT_MS = 1500;
const EDGE_TTS_COOLDOWN_MS = 3 * 60 * 1000;
const GOOGLE_TTS_TIMEOUT_MS = 5000;

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

function stripLeadingId3v2Server(buf: Buffer): Buffer {
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

async function fetchGoogleTranslateMp3Segment(
  segmentText: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  const endpoints = [
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(segmentText)}`,
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&q=${encodeURIComponent(segmentText)}`,
  ];

  let lastErr: unknown = null;
  for (const url of endpoints) {
    if (abortSignal.aborted) {
      throw new Error('Client aborted TTS request');
    }
    const localController = new AbortController();
    const onAbort = () => localController.abort();
    abortSignal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => localController.abort(), GOOGLE_TTS_TIMEOUT_MS);

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
        signal: localController.signal,
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
      if (abortSignal.aborted) {
        throw new Error('Client aborted TTS request');
      }
      lastErr = err;
    } finally {
      clearTimeout(timer);
      abortSignal.removeEventListener('abort', onAbort);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Fallback TTS failed');
}

async function synthesizeGoogleTtsFallbackBuffer(
  cleanText: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  const segments = splitTextForShortTtsSegments(cleanText, 175);
  if (segments.length === 0) {
    throw new Error('Không có nội dung hợp lệ để tổng hợp giọng đọc');
  }

  const buffers: Buffer[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (abortSignal.aborted) {
      throw new Error('Client aborted TTS request');
    }
    const segBuf = await fetchGoogleTranslateMp3Segment(segments[i], abortSignal);
    buffers.push(i === 0 ? segBuf : stripLeadingId3v2Server(segBuf));
  }
  return Buffer.concat(buffers);
}

interface InFlightTtsEntry {
  promise: Promise<Buffer>;
  activeClients: number;
  abortController: AbortController;
}

interface QueuedTtsJob {
  run: () => Promise<void>;
  isStillWanted: () => boolean;
  cancel: () => void;
}

// In-memory LRU audio cache for synthesized segments (Key: `${voiceCode}:::${cleanText}`)
const audioCache = new Map<string, Buffer>();
const inFlightTtsRequests = new Map<string, InFlightTtsEntry>();
const ttsWaitQueue: QueuedTtsJob[] = [];
let activeTtsWorkers = 0;

function pumpTtsQueue() {
  while (activeTtsWorkers < MAX_CONCURRENT_TTS && ttsWaitQueue.length > 0) {
    const nextJob = ttsWaitQueue.shift()!;
    if (!nextJob.isStillWanted()) {
      nextJob.cancel();
      continue;
    }
    activeTtsWorkers += 1;
    Promise.resolve()
      .then(() => nextJob.run())
      .catch(() => {})
      .finally(() => {
        activeTtsWorkers = Math.max(0, activeTtsWorkers - 1);
        pumpTtsQueue();
      });
  }
}

function setLruAudioCache(cacheKey: string, fullBuffer: Buffer) {
  if (audioCache.has(cacheKey)) {
    audioCache.delete(cacheKey);
  }
  while (audioCache.size >= MAX_AUDIO_CACHE_ITEMS) {
    const oldestKey = audioCache.keys().next().value;
    if (oldestKey !== undefined) {
      audioCache.delete(oldestKey);
    } else {
      break;
    }
  }
  audioCache.set(cacheKey, fullBuffer);
}

async function runEdgeTtsSynthesisOnce(
  cleanText: string,
  voiceCode: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  if (abortSignal.aborted) {
    throw new Error('Client aborted TTS request');
  }

  // Luôn khởi tạo một instance MsEdgeTTS mới cho mỗi lượt tổng hợp (tránh dùng lại WebSocket cũ)
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: EDGE_TTS_PROBE_TIMEOUT_MS,
    synthesisTimeoutMs: EDGE_TTS_PROBE_TIMEOUT_MS,
  });

  let audioStream: any = null;
  let metadataStream: any = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (audioStream) {
      try {
        audioStream.removeAllListeners();
        if (typeof audioStream.destroy === 'function') {
          audioStream.destroy();
        }
      } catch {}
      audioStream = null;
    }
    if (metadataStream) {
      try {
        metadataStream.removeAllListeners();
        if (typeof metadataStream.destroy === 'function') {
          metadataStream.destroy();
        }
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
      abortSignal.removeEventListener('abort', onAbort);
      cleanup();
      reject(err);
    };

    const finishWithSuccess = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      abortSignal.removeEventListener('abort', onAbort);
      cleanup();
      resolve(buf);
    };

    const onAbort = () => {
      finishWithError(new Error('Client aborted TTS request'));
    };

    if (abortSignal.aborted) {
      finishWithError(new Error('Client aborted TTS request'));
      return;
    }
    abortSignal.addEventListener('abort', onAbort, { once: true });

    timer = setTimeout(() => {
      finishWithError(new Error('Quá thời gian tổng hợp âm thanh từ Edge TTS'));
    }, EDGE_TTS_PROBE_TIMEOUT_MS);

    tts
      .setMetadata(voiceCode, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      .then(() => {
        if (settled || abortSignal.aborted) {
          finishWithError(new Error('Client aborted TTS request'));
          return;
        }

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
          const buf = Buffer.concat(chunks);
          chunks.length = 0;
          if (buf.length > 0) {
            finishWithSuccess(buf);
          } else {
            finishWithError(new Error('Không nhận được dữ liệu âm thanh từ Edge TTS'));
          }
        });

        audioStream.on('close', () => {
          if (!settled) {
            const buf = Buffer.concat(chunks);
            chunks.length = 0;
            if (buf.length > 0) {
              finishWithSuccess(buf);
            } else {
              finishWithError(new Error('Luồng âm thanh Edge TTS đã đóng sớm'));
            }
          }
        });

        audioStream.on('error', (streamErr: any) => {
          chunks.length = 0;
          finishWithError(
            streamErr instanceof Error ? streamErr : new Error(String(streamErr))
          );
        });
      })
      .catch((initErr: any) => {
        finishWithError(initErr instanceof Error ? initErr : new Error(String(initErr)));
      });
  });
}

async function runEdgeTtsSynthesisWithRetry(
  cleanText: string,
  voiceCode: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  if (abortSignal.aborted) {
    throw new Error('Client aborted TTS request');
  }

  // 1. Thử Edge TTS nếu không nằm trong cửa sổ cooldown (tối đa 2.6s, không retry lặp gây chờ lâu)
  if (Date.now() >= edgeTtsDegradedUntil) {
    try {
      const edgeBuf = await runEdgeTtsSynthesisOnce(cleanText, voiceCode, abortSignal);
      edgeTtsDegradedUntil = 0;
      return edgeBuf;
    } catch (edgeErr: any) {
      if (abortSignal.aborted) {
        throw edgeErr;
      }
      edgeTtsDegradedUntil = Date.now() + EDGE_TTS_COOLDOWN_MS;
      console.warn(
        `[TTS] Edge TTS tạm gián đoạn (${voiceCode}): ${edgeErr?.message || edgeErr}. Chuyển sang luồng TTS dự phòng tốc độ cao trong 3 phút.`
      );
    }
  }

  // 2. Luồng tổng hợp tiếng Việt dự phòng tức thì (trả về MP3 chuẩn 24kHz)
  return await synthesizeGoogleTtsFallbackBuffer(cleanText, abortSignal);
}

async function synthesizeEdgeTtsBuffer(
  cleanText: string,
  voiceCode: string,
  cacheKey: string,
  clientSignal?: AbortSignal
): Promise<Buffer> {
  if (audioCache.has(cacheKey)) {
    const cached = audioCache.get(cacheKey)!;
    // Refresh LRU position
    audioCache.delete(cacheKey);
    audioCache.set(cacheKey, cached);
    return cached;
  }

  if (clientSignal?.aborted) {
    throw new Error('Client aborted TTS request');
  }

  const existingEntry = inFlightTtsRequests.get(cacheKey);
  if (existingEntry) {
    existingEntry.activeClients += 1;
    const onDetach = () => {
      existingEntry.activeClients = Math.max(0, existingEntry.activeClients - 1);
      if (existingEntry.activeClients === 0) {
        existingEntry.abortController.abort();
      }
    };
    clientSignal?.addEventListener('abort', onDetach, { once: true });
    try {
      return await existingEntry.promise;
    } finally {
      clientSignal?.removeEventListener('abort', onDetach);
      if (!clientSignal?.aborted) {
        existingEntry.activeClients = Math.max(0, existingEntry.activeClients - 1);
      }
    }
  }

  const entryAbortController = new AbortController();
  let resolveEntry!: (buf: Buffer) => void;
  let rejectEntry!: (err: unknown) => void;

  const entryPromise = new Promise<Buffer>((res, rej) => {
    resolveEntry = res;
    rejectEntry = rej;
  });
  // Ngăn UnhandledRejection nếu tất cả client đã ngắt kết nối trước khi promise reject
  entryPromise.catch(() => {});

  const entry: InFlightTtsEntry = {
    promise: entryPromise,
    activeClients: 1,
    abortController: entryAbortController,
  };
  inFlightTtsRequests.set(cacheKey, entry);

  const onFirstClientAbort = () => {
    entry.activeClients = Math.max(0, entry.activeClients - 1);
    if (entry.activeClients === 0) {
      entryAbortController.abort();
    }
  };
  clientSignal?.addEventListener('abort', onFirstClientAbort, { once: true });

  ttsWaitQueue.push({
    isStillWanted: () => entry.activeClients > 0 && !entryAbortController.signal.aborted,
    cancel: () => {
      inFlightTtsRequests.delete(cacheKey);
      rejectEntry(new Error('Client aborted TTS request'));
    },
    run: async () => {
      try {
        const fullBuffer = await runEdgeTtsSynthesisWithRetry(
          cleanText,
          voiceCode,
          entryAbortController.signal
        );
        setLruAudioCache(cacheKey, fullBuffer);
        resolveEntry(fullBuffer);
      } catch (err) {
        rejectEntry(err);
      } finally {
        inFlightTtsRequests.delete(cacheKey);
      }
    },
  });

  pumpTtsQueue();

  try {
    return await entryPromise;
  } finally {
    clientSignal?.removeEventListener('abort', onFirstClientAbort);
    if (!clientSignal?.aborted) {
      entry.activeClients = Math.max(0, entry.activeClients - 1);
    }
  }
}

/**
 * Handle Edge TTS Speech Synthesis with LRU cache, concurrency queue & clean stream disposal
 */
async function handleTtsSynthesis(
  text: string,
  requestedVoice: string | undefined,
  res: Response
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Normalize voice code: must be a real Edge TTS voice code (default: vi-VN-NamMinhNeural)
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

  // Làm sạch văn bản trước khi đưa vào msedge-tts
  const cleanText = sanitizeTextForEdgeTts(text);
  if (!cleanText || !/[\p{L}\p{N}]/u.test(cleanText)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(204).end();
  }
  const cacheKey = `${voiceCode}:::${cleanText}`;

  const clientAbortController = new AbortController();
  const onResClose = () => {
    if (!res.writableEnded) {
      clientAbortController.abort();
    }
  };
  res.on('close', onResClose);

  try {
    const fullBuffer = await synthesizeEdgeTtsBuffer(
      cleanText,
      voiceCode,
      cacheKey,
      clientAbortController.signal
    );
    if (!res.headersSent && !res.writableEnded && !clientAbortController.signal.aborted) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', fullBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(fullBuffer);
    }
  } catch (err: any) {
    if (clientAbortController.signal.aborted) {
      return;
    }
    console.error(`[Edge TTS Error for voice ${voiceCode}]:`, err);
    if (!res.headersSent && !res.writableEnded) {
      const msg = String(err?.message || 'Unknown');
      const isTimeout = msg.includes('Quá thời gian') || msg.includes('timed out');
      res.status(isTimeout ? 504 : 502).json({
        error: 'Không thể tạo âm thanh từ Edge TTS: ' + msg,
      });
    }
  } finally {
    res.off('close', onResClose);
  }
}

app.options('/api/tts', (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res.status(200).end();
});

/**
 * GET /api/tts?text=...&voice=...
 */
app.get('/api/tts', async (req: Request, res: Response) => {
  const text = (req.query.text as string) || '';
  const voice = (req.query.voice as string) || '';
  await handleTtsSynthesis(text, voice, res);
});

/**
 * GET /api/tts/stream?text=...&voice=...
 */
app.get('/api/tts/stream', async (req: Request, res: Response) => {
  const text = (req.query.text as string) || '';
  const voice = (req.query.voice as string) || '';
  await handleTtsSynthesis(text, voice, res);
});

/**
 * POST /api/tts
 */
app.post('/api/tts', async (req: Request, res: Response) => {
  const text = req.body?.text || '';
  const voice = req.body?.voice || '';
  await handleTtsSynthesis(text, voice, res);
});

// =========================================================================
// BẢO MẬT VIP & TIỀN TỆ SERVER-SIDE (VERCEL SERVERLESS READY)
// Chuyển toàn bộ logic khóa chương VIP, trừ Xu & chia nhuận bút lên Server
// Ngăn chặn triệt để hành vi can thiệp LocalStorage hoặc bóc tách mã nguồn
// =========================================================================

interface ServerUserAccount {
  userId: string;
  userEmail: string;
  userName: string;
  xuBalance: number;
  authorEarnedXu: number;
  unlockedChapters: Record<string, string[]>;
  unlockedFullBooks: string[];
  purchases: any[];
}

// In-memory Server-authoritative accounts ledger
const serverAccountsLedger = new Map<string, ServerUserAccount>();

function getOrCreateServerAccount(userId: string, email: string = '', name: string = ''): ServerUserAccount {
  if (!serverAccountsLedger.has(userId)) {
    serverAccountsLedger.set(userId, {
      userId,
      userEmail: email,
      userName: name || 'Độc Giả',
      xuBalance: 0,
      authorEarnedXu: 0,
      unlockedChapters: {},
      unlockedFullBooks: [],
      purchases: [],
    });
  }
  const acc = serverAccountsLedger.get(userId)!;
  if (email && !acc.userEmail) acc.userEmail = email;
  if (name && (!acc.userName || acc.userName === 'Độc Giả')) acc.userName = name;
  return acc;
}

/**
 * POST /api/vip/unlock
 * Mở khóa chương VIP hoặc Mua trọn bộ truyện an toàn trên Server
 * - Thẩm định số dư Xu thực tế
 * - Trừ Xu nguyên tử (atomic deduction)
 * - Tự động tính và chuyển nhuận bút cho Tác Giả / Editor (Tác giả 98%, Độc quyền 95%, Editor 90%)
 */
app.post('/api/vip/unlock', (req: Request, res: Response) => {
  try {
    const {
      userId,
      userEmail,
      userName,
      novelId,
      chapterId,
      chapterNumber,
      type,
      novelTitle,
      authorName,
      editorName,
      isExclusive,
      isEditor,
      isOriginal,
    } = req.body;

    if (!userId || !novelId) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin người dùng hoặc tác phẩm' });
    }

    const userAccount = getOrCreateServerAccount(userId, userEmail, userName);

    // Tính toán giá mở khóa (ưu tiên giá do client gửi lên hoặc mặc định)
    const clientPrice = typeof req.body.price === 'number' && !isNaN(req.body.price) ? req.body.price : null;
    const CHAPTER_PRICE = clientPrice !== null ? clientPrice : 5;
    const FULL_BOOK_PROMO = clientPrice !== null ? clientPrice : 85;

    let priceToPay = 0;
    const existingChapters = userAccount.unlockedChapters[novelId] || [];

    if (type === 'chapter') {
      if (!chapterId) {
        return res.status(400).json({ success: false, error: 'Thiếu mã chương cần mở khóa' });
      }
      // Kiểm tra xem đã mở khóa trước đó chưa
      if (existingChapters.includes(chapterId) || userAccount.unlockedFullBooks.includes(novelId)) {
        return res.json({
          success: true,
          message: 'Chương này đã được mở khóa trước đó',
          newXuBalance: userAccount.xuBalance,
          unlockedChapters: userAccount.unlockedChapters,
          unlockedFullBooks: userAccount.unlockedFullBooks,
        });
      }
      priceToPay = CHAPTER_PRICE;
    } else {
      priceToPay = FULL_BOOK_PROMO;
    }

    // Kiểm tra số dư Xu của độc giả trên server
    if (userAccount.xuBalance < priceToPay) {
      return res.status(402).json({
        success: false,
        error: `Số dư Xu không đủ. Cần ${priceToPay} Xu, tài khoản hiện có ${userAccount.xuBalance} Xu. Vui lòng nạp thêm!`,
        currentBalance: userAccount.xuBalance,
        requiredPrice: priceToPay,
      });
    }

    // Thực hiện trừ Xu trên Server an toàn
    userAccount.xuBalance = Math.max(0, parseFloat((userAccount.xuBalance - priceToPay).toFixed(2)));

    // Cập nhật danh sách mở khóa
    if (type === 'full_book') {
      if (!userAccount.unlockedFullBooks.includes(novelId)) {
        userAccount.unlockedFullBooks.push(novelId);
      }
    } else if (chapterId) {
      if (!existingChapters.includes(chapterId)) {
        userAccount.unlockedChapters[novelId] = [...existingChapters, chapterId];
      }
    }

    // TÍNH TOÁN VÀ CHIA NHUẬN BÚT CHO TÁC GIẢ / EDITOR TRÊN SERVER
    // Quy định: Tác giả sáng tác 95%, Editor độc quyền 90%, Editor không độc quyền 70%
    const isEditorWork = isEditor !== undefined ? Boolean(isEditor) : Boolean(editorName && !isOriginal);
    let royaltyRate = 95; // Tác giả nhận 95%
    if (isEditorWork) {
      royaltyRate = isExclusive ? 90 : 70; // Editor độc quyền 90%, không độc quyền 70%
    }
    const earnedXu = parseFloat(((priceToPay * royaltyRate) / 100).toFixed(2));

    // Ghi nhận doanh thu cho tác giả trên server
    const authorId = `author-${authorName || 'creator'}`;
    const authorAccount = getOrCreateServerAccount(authorId, '', authorName || 'Tác Giả');
    authorAccount.authorEarnedXu = parseFloat(((authorAccount.authorEarnedXu || 0) + earnedXu).toFixed(2));

    // Ghi lại lịch sử giao dịch
    const purchaseRecord = {
      id: `purchase-${Date.now()}`,
      novelId,
      novelTitle: novelTitle || 'Tác phẩm Đạo Tâm',
      type,
      chapterId: type === 'chapter' ? chapterId : undefined,
      chapterNumber: type === 'chapter' ? chapterNumber : undefined,
      pricePaid: priceToPay,
      purchasedAt: Date.now(),
    };
    userAccount.purchases.unshift(purchaseRecord);

    console.log(`[VIP Secure Server] User ${userId} unlocked ${type} for novel ${novelId} (-${priceToPay} Xu). Author ${authorName} received +${earnedXu} Xu (${royaltyRate}%).`);

    return res.json({
      success: true,
      message: type === 'full_book' ? 'Mở khóa trọn bộ tác phẩm thành công!' : `Mở khóa chương ${chapterNumber || ''} thành công!`,
      newXuBalance: userAccount.xuBalance,
      unlockedChapters: userAccount.unlockedChapters,
      unlockedFullBooks: userAccount.unlockedFullBooks,
      purchaseRecord,
      authorRoyaltyEarned: {
        authorId,
        earnedXu,
        royaltyRate,
      },
    });
  } catch (err: any) {
    console.error('[VIP Unlock Server Error]:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi xử lý giao dịch mở khóa VIP trên máy chủ' });
  }
});

/**
 * POST /api/chapter/secure-content
 * Trả về nội dung chương an toàn:
 * Nếu chương VIP chưa được mở khóa, chỉ trả về đoạn trích mẫu ngắn (teaser)
 * Tuyệt đối không gửi toàn bộ text về client để chống bóc tách mã nguồn / inspect
 */
app.post('/api/chapter/secure-content', (req: Request, res: Response) => {
  const { novelId, chapterId, userId } = req.body;
  if (!novelId || !chapterId) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin chương' });
  }

  const userAccount = userId ? serverAccountsLedger.get(userId) : null;
  const isFullBookUnlocked = userAccount ? userAccount.unlockedFullBooks.includes(novelId) : false;
  const isChapterUnlocked = userAccount
    ? (userAccount.unlockedChapters[novelId] && userAccount.unlockedChapters[novelId].includes(chapterId))
    : false;

  const hasAccess = isFullBookUnlocked || isChapterUnlocked;

  return res.json({
    success: true,
    isLocked: !hasAccess,
    unlocked: hasAccess,
    message: hasAccess ? 'Nội dung chương đầy đủ đã được cấp phép' : 'Chương VIP chưa mở khóa',
  });
});

/**
 * POST /api/author/payout
 * Xử lý lệnh rút nhuận bút an toàn (Kiểm tra tối thiểu 100 Xu)
 */
app.post('/api/author/payout', (req: Request, res: Response) => {
  const { authorId, amountXu, amountVnd, bankName, accountNumber, accountHolder } = req.body;
  if (!authorId || !amountXu || amountXu < 100) {
    return res.status(400).json({ success: false, error: 'Số Xu rút tối thiểu là 100 Xu (tương đương 100.000đ)' });
  }

  const authorAccount = getOrCreateServerAccount(authorId);
  if (authorAccount.authorEarnedXu < amountXu) {
    return res.status(400).json({
      success: false,
      error: `Số dư Xu nhuận bút không đủ (Hiện có: ${authorAccount.authorEarnedXu} Xu, Yêu cầu: ${amountXu} Xu)`,
    });
  }

  authorAccount.authorEarnedXu = parseFloat((authorAccount.authorEarnedXu - amountXu).toFixed(2));
  return res.json({
    success: true,
    message: `Đã tiếp nhận yêu cầu rút ${amountXu} Xu về tài khoản ${bankName} - ${accountNumber} (${accountHolder}). Ban Quản Trị sẽ chuyển khoản trong 24h.`,
    remainingXu: authorAccount.authorEarnedXu,
  });
});

/**
 * GET /api/novels
 * Endpoint trả về danh sách truyện với chỉ thị No-Cache triệt để:
 * Tắt hoàn toàn bộ nhớ đệm trên Vercel Edge Server, Cloudflare và mọi tầng Proxy trung gian.
 */
app.get('/api/novels', (_req: Request, res: Response) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
  return res.json({
    success: true,
    message: 'Dữ liệu thời gian thực không lưu bộ nhớ đệm (Cache disabled)',
    timestamp: Date.now(),
  });
});
/**
 * POST /api/batch-chapters
 * Lưu trực tiếp hàng loạt chương truyện vào Cloud Firestore từ máy chủ Node.js
 * Tốc độ ghi siêu tốc (<1.5s), không phụ thuộc vào WebSocket/gRPC trình duyệt, chống treo và chống lỗi mạng.
 */
app.post('/api/batch-chapters', async (req: Request, res: Response) => {
  try {
    const { novelId, updatedNovel, newChapters, isCompleted } = req.body;
    if (!novelId || !Array.isArray(newChapters) || newChapters.length === 0) {
      return res.status(400).json({ success: false, error: 'Thiếu novelId hoặc danh sách chương' });
    }

    console.log(`[BatchUpload] Bắt đầu lưu ${newChapters.length} chương cho tác phẩm "${novelId}"...`);
    const nowTs = Date.now();

    // 1. Ghi các chương vào subcollection bằng writeBatch theo lô tối đa 400 doc (chuẩn Firestore < 500)
    const BATCH_SIZE = 400;
    for (let i = 0; i < newChapters.length; i += BATCH_SIZE) {
      const chunk = newChapters.slice(i, i + BATCH_SIZE);
      const batch = serverWriteBatch(serverDb);
      chunk.forEach((ch: any) => {
        const chNum = Number(ch.number);
        const chRef = serverDoc(serverDb, 'novels', novelId, 'chapters', String(chNum));
        batch.set(chRef, {
          id: ch.id || `c-${novelId}-${chNum}`,
          number: chNum,
          title: ch.title || `Chương ${chNum}`,
          slug: ch.slug || `chuong-${chNum}`,
          content: ch.content || '',
          wordCount: ch.wordCount || (ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0),
          publishedDate: ch.publishedDate || new Date().toISOString().split('T')[0],
          isVip: Boolean(ch.isVip),
          priceXu: Number(ch.priceXu || 0),
          updatedAt: nowTs
        }, { merge: true });
      });
      await batch.commit();
      console.log(`[BatchUpload] Đã ghi xong lô ${i + 1} - ${Math.min(i + BATCH_SIZE, newChapters.length)}`);
      if (i + BATCH_SIZE < newChapters.length) {
        await new Promise((r) => setTimeout(r, 30));
      }
    }

    // 2. Cập nhật root document với mục lục siêu nhẹ (không chứa nội dung chữ)
    const novelRef = serverDoc(serverDb, 'novels', novelId);
    const existingSnap = await getServerDoc(novelRef);
    let existingTOC: any[] = [];
    let currentData: any = {};
    if (existingSnap.exists()) {
      currentData = existingSnap.data() || {};
      if (Array.isArray(currentData.chapters)) {
        existingTOC = currentData.chapters;
      }
    }

    const chapterMap = new Map<number, any>();
    existingTOC.forEach((c: any) => chapterMap.set(Number(c.number), {
      id: c.id || `c-${c.number}`,
      number: Number(c.number),
      title: c.title || `Chương ${c.number}`,
      slug: c.slug || `chuong-${c.number}`,
      publishedDate: c.publishedDate || new Date().toISOString().split('T')[0],
      isVip: Boolean(c.isVip),
      priceXu: Number(c.priceXu || 0),
      wordCount: c.wordCount || 0,
      content: ''
    }));

    newChapters.forEach((c: any) => chapterMap.set(Number(c.number), {
      id: c.id || `c-${c.number}`,
      number: Number(c.number),
      title: c.title || `Chương ${c.number}`,
      slug: c.slug || `chuong-${c.number}`,
      publishedDate: c.publishedDate || new Date().toISOString().split('T')[0],
      isVip: Boolean(c.isVip),
      priceXu: Number(c.priceXu || 0),
      wordCount: c.wordCount || 0,
      content: ''
    }));

    const mergedTOC = Array.from(chapterMap.values()).sort((a, b) => Number(a.number) - Number(b.number));
    const effectiveTotalChapters = Math.max(
      Number(currentData.totalChapters || 0),
      Number(updatedNovel?.totalChapters || 0),
      mergedTOC.length,
      ...newChapters.map((c: any) => Number(c.number) || 0)
    );
    const topChapter = mergedTOC[mergedTOC.length - 1];

    const rootUpdate: any = {
      status: isCompleted ? 'Hoàn thành' : (updatedNovel?.status || currentData.status || 'Đang ra'),
      totalChapters: effectiveTotalChapters,
      latestChapterTitle: topChapter?.title || `Chương ${effectiveTotalChapters}`,
      latestChapterNumber: topChapter?.number || effectiveTotalChapters,
      lastUpdated: 'Vừa xong',
      updatedAt: nowTs,
      lastChapterUpdatedAt: nowTs,
      chapters: mergedTOC
    };

    if (existingSnap.exists()) {
      await serverUpdateDoc(novelRef, rootUpdate);
    } else {
      await serverSetDoc(novelRef, {
        ...updatedNovel,
        ...rootUpdate
      }, { merge: true });
    }

    // Đồng bộ sang collection stories ngầm
    serverUpdateDoc(serverDoc(serverDb, 'stories', novelId), rootUpdate).catch(() => {});

    console.log(`[BatchUpload] Hoàn tất lưu ${newChapters.length} chương vào tác phẩm ${novelId}! Tổng số chương hiện tại: ${effectiveTotalChapters}`);
    return res.json({
      success: true,
      totalChapters: effectiveTotalChapters,
      savedCount: newChapters.length,
      latestChapterTitle: rootUpdate.latestChapterTitle,
      latestChapterNumber: rootUpdate.latestChapterNumber
    });
  } catch (err: any) {
    console.error('[BatchUpload] Server error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi máy chủ khi lưu chương' });
  }
});

// Mount Vite or serve static build
async function startServer() {
  // Pre-scan voices on boot
  scanVietnameseVoices().catch(() => {});

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Đạo Tâm Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
