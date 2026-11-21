import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dns from 'dns';
import http from 'http';
import https from 'https';
import { createRequire } from 'module';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const require = createRequire(import.meta.url);
const WsClient = require('ws');

import fs from 'fs';
import { initializeApp as initServerFirebase, getApps as getServerApps, getApp as getServerApp } from 'firebase/app';
import { getFirestore as getServerFirestore, doc as serverDoc, getDoc as getServerDoc, setDoc as serverSetDoc, updateDoc as serverUpdateDoc, writeBatch as serverWriteBatch } from 'firebase/firestore';

// Ưu tiên IPv4 cho toàn bộ DNS & WebSocket outbound trên VPS để tránh treo/khựng do IPv6 timeout
dns.setDefaultResultOrder('ipv4first');
const ipv4HttpAgent = new http.Agent({ keepAlive: true, family: 4, maxSockets: 32 });
const ipv4HttpsAgent = new https.Agent({ keepAlive: true, family: 4, maxSockets: 32 });
// WebSocket upgrade không dùng keepAlive agent để tránh socket cũ bị đóng nửa chừng gây lỗi Stream closed (1006)
const wsIpv4Agent = new https.Agent({ keepAlive: false, family: 4, maxSockets: 16 });
http.globalAgent = ipv4HttpAgent;
https.globalAgent = ipv4HttpsAgent;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS cho Cloudflare Pages (https://truyen-doc-va-nghe-dao-tam.pages.dev) & custom domain
const ALLOWED_CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const reqOrigin = req.headers.origin;
  const allowOrigin =
    ALLOWED_CORS_ORIGIN === '*' ? reqOrigin || '*' : ALLOWED_CORS_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

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

  const tts = new MsEdgeTTS({
    connectionTimeoutMs: 10000,
    agent: ipv4HttpsAgent,
  });
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
// TỐI ƯU EDGE TTS CHO CLOUDFLY VPS (1 vCPU, 1GB RAM, 20GB SSD) & CLOUDFLARE
// 1. RAM LRU Cache 80 đoạn hot (~8MB RAM) + SSD Disk Cache (tối đa ~3GB trên 20GB SSD)
// 2. Giới hạn tối đa 2 luồng đồng thời lên Edge TTS + độ trễ 150ms giữa các lần mở WebSocket chống rate-limit
// 3. Timeout mỗi lần thử 8s để retry tức thì + Fallback engine nhanh & ổn định khi lỗi Stream closed 2 lần
// =========================================================================
const MAX_AUDIO_CACHE_ITEMS = 80;
const MAX_CONCURRENT_TTS = Math.max(1, Math.min(2, Number(process.env.TTS_MAX_CONCURRENCY) || 2));
const WS_OPEN_PACE_MS = 150;
const TTS_SYNTHESIS_TIMEOUT_MS = 8000;
const TTS_MS_EDGE_MAX_ATTEMPTS = 2;
const TTS_BACKEND_RETRY_DELAY_MS = 150;
const TTS_DISK_CACHE_DIR =
  process.env.TTS_DISK_CACHE_DIR || path.resolve(__dirname, '.tts-cache');
const MAX_DISK_CACHE_BYTES =
  Math.max(128, Number(process.env.TTS_DISK_CACHE_MAX_MB) || 3072) * 1024 * 1024;

let diskCacheReady = false;
let diskCacheWriteCounter = 0;
let isPruningDiskCache = false;
let estimatedDiskFiles = 0;
let estimatedDiskBytes = 0;

function ensureDiskCacheDir() {
  if (diskCacheReady) return;
  try {
    fs.mkdirSync(TTS_DISK_CACHE_DIR, { recursive: true });
    diskCacheReady = true;
  } catch (err) {
    console.warn('[TTS DiskCache] Không thể tạo thư mục cache:', err);
  }
}

function getDiskCachePath(cacheKey: string): string {
  const hash = crypto.createHash('sha256').update(cacheKey).digest('hex');
  return path.join(TTS_DISK_CACHE_DIR, `${hash}.mp3`);
}

async function readDiskCache(cacheKey: string): Promise<Buffer | null> {
  if (!diskCacheReady) return null;
  const filePath = getDiskCachePath(cacheKey);
  try {
    const buf = await fs.promises.readFile(filePath);
    if (buf && buf.length > 100) {
      // Cập nhật mtime nhẹ để giữ file hot lâu hơn khi dọn cache LRU trên SSD
      const now = new Date();
      fs.promises.utimes(filePath, now, now).catch(() => {});
      return buf;
    }
  } catch {}
  return null;
}

async function pruneDiskCacheIfNeeded() {
  if (!diskCacheReady || isPruningDiskCache) return;
  isPruningDiskCache = true;
  try {
    const entries = await fs.promises.readdir(TTS_DISK_CACHE_DIR, { withFileTypes: true });
    const files: Array<{ filePath: string; size: number; mtimeMs: number }> = [];
    let totalBytes = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.mp3')) continue;
      const filePath = path.join(TTS_DISK_CACHE_DIR, entry.name);
      try {
        const st = await fs.promises.stat(filePath);
        totalBytes += st.size;
        files.push({ filePath, size: st.size, mtimeMs: st.mtimeMs });
      } catch {}
    }

    estimatedDiskFiles = files.length;
    estimatedDiskBytes = totalBytes;

    if (totalBytes <= MAX_DISK_CACHE_BYTES) return;

    const targetBytes = Math.floor(MAX_DISK_CACHE_BYTES * 0.85);
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of files) {
      if (totalBytes <= targetBytes) break;
      try {
        await fs.promises.unlink(file.filePath);
        totalBytes -= file.size;
        estimatedDiskFiles = Math.max(0, estimatedDiskFiles - 1);
      } catch {}
    }
    estimatedDiskBytes = totalBytes;
  } catch {
  } finally {
    isPruningDiskCache = false;
  }
}

function writeDiskCacheAsync(cacheKey: string, buf: Buffer) {
  if (!diskCacheReady || !buf || buf.length < 100) return;
  const filePath = getDiskCachePath(cacheKey);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.promises
    .writeFile(tmpPath, buf)
    .then(() => fs.promises.rename(tmpPath, filePath))
    .then(() => {
      estimatedDiskFiles += 1;
      estimatedDiskBytes += buf.length;
      diskCacheWriteCounter += 1;
      if (diskCacheWriteCounter % 50 === 0 || estimatedDiskBytes > MAX_DISK_CACHE_BYTES) {
        pruneDiskCacheIfNeeded().catch(() => {});
      }
    })
    .catch(() => {
      fs.promises.unlink(tmpPath).catch(() => {});
    });
}

function sanitizeTextForEdgeTts(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    // Loại bỏ các ký tự điều khiển ẩn, zero-width, BOM, ký tự lỗi Unicode
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFFD]/g, ' ')
    // Xử lý HTML entities trước khi loại bỏ ký tự đặc biệt SSML
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' và ')
    .replace(/&lt;|&gt;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    // Thay thế / loại bỏ các ký tự làm hỏng SSML (<, >, &)
    .replace(/[<>]/g, ' ')
    .replace(/&/g, ' và ')
    // Chuẩn hóa dấu ngoặc kép, nháy đơn và khoảng trắng
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}

function sleepWithAbortServer(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error('Client aborted TTS request'));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Client aborted TTS request'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
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

interface CachedAudioEntry {
  buffer: Buffer;
  isPrimaryEdge: boolean;
}

interface InFlightTtsEntry {
  promise: Promise<CachedAudioEntry>;
  activeClients: number;
  abortController: AbortController;
}

interface QueuedTtsJob {
  run: () => Promise<void>;
  isStillWanted: () => boolean;
  cancel: () => void;
}

// In-memory LRU audio cache for synthesized segments (Key: `${voiceCode}:::${cleanText}`)
const audioCache = new Map<string, CachedAudioEntry>();
const inFlightTtsRequests = new Map<string, InFlightTtsEntry>();
const ttsWaitQueue: QueuedTtsJob[] = [];
let activeTtsWorkers = 0;
let nextWsOpenAllowedAt = 0;

let cachedBingIpv4s: string[] = [];
let lastBingDnsLookupAt = 0;
const perIpWsAgents = new Map<string, https.Agent>();
let bingIpCursor = 0;

async function waitForWebSocketOpenSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new Error('Client aborted TTS request');
  }
  const now = Date.now();
  const waitMs = Math.max(0, nextWsOpenAllowedAt - now);
  nextWsOpenAllowedAt = Math.max(now, nextWsOpenAllowedAt) + WS_OPEN_PACE_MS;
  if (waitMs > 0) {
    await sleepWithAbortServer(waitMs, signal);
  }
}

async function getNextBingIpv4Agent(): Promise<https.Agent> {
  const now = Date.now();
  if (cachedBingIpv4s.length === 0 || now - lastBingDnsLookupAt > 60000) {
    try {
      const ips = await dns.promises.resolve4('speech.platform.bing.com');
      if (ips.length > 0) {
        cachedBingIpv4s = ips;
        lastBingDnsLookupAt = now;
      }
    } catch {}
  }
  if (cachedBingIpv4s.length === 0) {
    return wsIpv4Agent;
  }
  const ip = cachedBingIpv4s[bingIpCursor++ % cachedBingIpv4s.length];
  let agent = perIpWsAgents.get(ip);
  if (!agent) {
    agent = new https.Agent({
      keepAlive: false,
      family: 4,
      maxSockets: 8,
      lookup: (_host: string, opts: any, cb: any) => {
        if (typeof opts === 'function') return opts(null, ip, 4);
        if (opts && opts.all) return cb(null, [{ address: ip, family: 4 }]);
        return cb(null, ip, 4);
      },
    });
    perIpWsAgents.set(ip, agent);
  }
  return agent;
}

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

function setLruAudioCache(cacheKey: string, entry: CachedAudioEntry) {
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
  audioCache.set(cacheKey, entry);
}

async function runEdgeTtsSynthesisOnce(
  cleanText: string,
  voiceCode: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  if (abortSignal.aborted) {
    throw new Error('Client aborted TTS request');
  }

  // Giãn nhịp mở WebSocket tối thiểu 150ms giữa các kết nối để tránh Microsoft rate-limit IP VPS
  await waitForWebSocketOpenSlot(abortSignal);

  // Luôn khởi tạo một instance MsEdgeTTS mới cho mỗi lượt tổng hợp + agent IPv4 non-keepAlive
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: 6000,
    synthesisTimeoutMs: TTS_SYNTHESIS_TIMEOUT_MS,
    agent: wsIpv4Agent,
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
      finishWithError(new Error('Quá thời gian 8s tổng hợp âm thanh từ Edge TTS'));
    }, TTS_SYNTHESIS_TIMEOUT_MS);

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

async function runDirectWsEdgeTtsOnce(
  cleanText: string,
  voiceCode: string,
  abortSignal: AbortSignal,
  timeoutMs: number = 4500
): Promise<Buffer> {
  if (abortSignal.aborted) {
    throw new Error('Client aborted TTS request');
  }

  await waitForWebSocketOpenSlot(abortSignal);
  const getSynthUrl = (MsEdgeTTS as unknown as { getSynthUrl: () => Promise<string> }).getSynthUrl.bind(MsEdgeTTS);
  const [synthUrl, agent] = await Promise.all([
    getSynthUrl(),
    getNextBingIpv4Agent(),
  ]);

  if (abortSignal.aborted) {
    throw new Error('Client aborted TTS request');
  }

  return await new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    const reqId = crypto.randomBytes(16).toString('hex');
    const langMatch = /\b[a-z]{2,}-[A-Z]{2}\b/.exec(voiceCode);
    const voiceLang = langMatch ? langMatch[0] : 'vi-VN';

    const ws = new WsClient(synthUrl, {
      agent,
      perMessageDeflate: false,
      handshakeTimeout: 3500,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });

    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      abortSignal.removeEventListener('abort', onAbort);
      try {
        ws.removeAllListeners();
        if (ws.readyState === WsClient.OPEN) {
          ws.close();
        } else if (ws.readyState !== WsClient.CLOSED) {
          ws.terminate();
        }
      } catch {}
    };

    const finishError = (err: Error) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      cleanup();
      reject(err);
    };

    const finishSuccess = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buf);
    };

    const onAbort = () => finishError(new Error('Client aborted TTS request'));
    abortSignal.addEventListener('abort', onAbort, { once: true });

    timer = setTimeout(() => {
      finishError(
        new Error(`Quá thời gian ${Math.round(timeoutMs / 1000)}s kết nối Direct WebSocket Edge TTS`)
      );
    }, timeoutMs);

    ws.on('open', () => {
      if (settled || abortSignal.aborted) return;
      const speechConfig =
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${voiceLang}">` +
        `<voice name="${voiceCode}"><prosody pitch="+0Hz" rate="+0%" volume="+0%">${cleanText}</prosody></voice></speak>`;
      const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(speechConfig);
      ws.send(ssmlMsg);
    });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (settled) return;
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data);

      if (!isBinary) {
        const textMsg = buf.toString('utf8');
        if (textMsg.includes('Path:turn.end')) {
          const full = Buffer.concat(chunks);
          chunks.length = 0;
          if (full.length > 100) {
            finishSuccess(full);
          } else {
            finishError(new Error('Direct WebSocket Edge TTS returned empty audio'));
          }
        }
      } else {
        const audioDelim = 'Path:audio\r\n';
        const delimIdx = buf.indexOf(audioDelim);
        if (delimIdx !== -1) {
          const payload = buf.subarray(delimIdx + audioDelim.length);
          if (payload.length > 0) {
            chunks.push(payload);
          }
        }
      }
    });

    ws.on('close', () => {
      finishError(
        new Error('Stream closed before the synthesis completed (no turn.end received).')
      );
    });

    ws.on('error', (err: any) => {
      finishError(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function splitTextForHttpTtsFallback(text: string, maxLen = 180): string[] {
  const parts: string[] = [];
  const sentences = text.split(/(?<=[.?!…;,:])\s+/).filter(Boolean);
  let buf = '';

  for (const s of sentences) {
    if (s.length > maxLen) {
      if (buf) {
        parts.push(buf);
        buf = '';
      }
      const words = s.split(/\s+/).filter(Boolean);
      for (const w of words) {
        if (w.length > maxLen) {
          if (buf) {
            parts.push(buf);
            buf = '';
          }
          for (let i = 0; i < w.length; i += maxLen) {
            parts.push(w.slice(i, i + maxLen));
          }
        } else if (!buf) {
          buf = w;
        } else if (buf.length + 1 + w.length <= maxLen) {
          buf += ` ${w}`;
        } else {
          parts.push(buf);
          buf = w;
        }
      }
      if (buf) {
        parts.push(buf);
        buf = '';
      }
    } else if (!buf) {
      buf = s;
    } else if (buf.length + 1 + s.length <= maxLen) {
      buf += ` ${s}`;
    } else {
      parts.push(buf);
      buf = s;
    }
  }

  if (buf) {
    parts.push(buf);
  }
  return parts;
}

function stripLeadingId3v2(buf: Buffer): Buffer {
  if (
    buf.length >= 10 &&
    buf[0] === 0x49 &&
    buf[1] === 0x44 &&
    buf[2] === 0x33
  ) {
    const tagSize =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    const audioOffset = 10 + tagSize;
    if (audioOffset < buf.length) {
      return buf.subarray(audioOffset);
    }
  }
  return buf;
}

async function fetchHttpTtsSegment(
  segmentText: string,
  lang: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  if (abortSignal.aborted) {
    throw new Error('Client aborted TTS request');
  }

  return await new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(segmentText)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;

    const req = https.get(
      url,
      {
        agent: ipv4HttpsAgent,
        timeout: 6000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          if (!settled) {
            settled = true;
            abortSignal.removeEventListener('abort', onAbort);
            reject(new Error(`HTTP fallback TTS status ${res.statusCode}`));
          }
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          if (!settled) chunks.push(c);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          abortSignal.removeEventListener('abort', onAbort);
          const raw = Buffer.concat(chunks);
          const audioBuf = stripLeadingId3v2(raw);
          if (audioBuf.length > 100) {
            resolve(audioBuf);
          } else {
            reject(new Error('HTTP fallback TTS returned empty audio'));
          }
        });
        res.on('error', (err) => {
          if (settled) return;
          settled = true;
          abortSignal.removeEventListener('abort', onAbort);
          reject(err);
        });
      }
    );

    const onAbort = () => {
      if (!settled) {
        settled = true;
        req.destroy(new Error('Client aborted TTS request'));
        reject(new Error('Client aborted TTS request'));
      }
    };

    abortSignal.addEventListener('abort', onAbort, { once: true });

    req.on('timeout', () => {
      req.destroy(new Error('Quá thời gian 6s với HTTP TTS dự phòng'));
    });

    req.on('error', (err) => {
      if (!settled) {
        settled = true;
        abortSignal.removeEventListener('abort', onAbort);
        reject(err);
      }
    });
  });
}

async function runHttpFallbackTts(
  cleanText: string,
  voiceCode: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  if (abortSignal.aborted) {
    throw new Error('Client aborted TTS request');
  }
  const lang = voiceCode.toLowerCase().startsWith('en') ? 'en' : 'vi';
  const segments = splitTextForHttpTtsFallback(cleanText, 180);
  if (segments.length === 0) {
    throw new Error('Empty text for HTTP fallback TTS');
  }

  // Tải song song các cụm ngắn và ghép theo đúng thứ tự MP3 frames (~0.3-1.0s)
  const buffers = await Promise.all(
    segments.map((seg) => fetchHttpTtsSegment(seg, lang, abortSignal))
  );
  const combined = Buffer.concat(buffers);
  if (combined.length < 100) {
    throw new Error('Fallback TTS produced insufficient audio');
  }
  return combined;
}

async function runFastFallbackEngine(
  cleanText: string,
  voiceCode: string,
  abortSignal: AbortSignal,
  elapsedSinceStartMs: number
): Promise<CachedAudioEntry> {
  // Chỉ thử thêm 1 lượt Direct WebSocket Edge nhanh (4.5s) nếu 2 lượt trước kết thúc sớm (<7s)
  // để giữ giọng Neural mà không vượt ngưỡng timeout của trình duyệt/Cloudflare
  if (elapsedSinceStartMs <= 7000) {
    try {
      const directBuf = await runDirectWsEdgeTtsOnce(cleanText, voiceCode, abortSignal, 4500);
      return { buffer: directBuf, isPrimaryEdge: true };
    } catch (directErr) {
      if (abortSignal.aborted) {
        throw directErr;
      }
      console.warn(
        `[TTS Fallback] Direct WS Edge cũng bị ngắt (${voiceCode}), dùng luồng HTTPS dự phòng tức thì:`,
        (directErr as any)?.message || directErr
      );
    }
  }

  // Luồng HTTPS TTS siêu nhanh (<1s) đảm bảo trả về audio ổn định, không bao giờ treo
  const httpBuf = await runHttpFallbackTts(cleanText, voiceCode, abortSignal);
  return { buffer: httpBuf, isPrimaryEdge: false };
}

async function runEdgeTtsSynthesisWithRetry(
  cleanText: string,
  voiceCode: string,
  abortSignal: AbortSignal
): Promise<CachedAudioEntry> {
  const startedAt = Date.now();
  let lastError: unknown;
  let consecutiveStreamClosed = 0;

  for (let attempt = 0; attempt < TTS_MS_EDGE_MAX_ATTEMPTS; attempt++) {
    if (abortSignal.aborted) {
      throw new Error('Client aborted TTS request');
    }

    if (attempt > 0) {
      await sleepWithAbortServer(TTS_BACKEND_RETRY_DELAY_MS, abortSignal);
    }

    try {
      const buffer = await runEdgeTtsSynthesisOnce(cleanText, voiceCode, abortSignal);
      return { buffer, isPrimaryEdge: true };
    } catch (err) {
      lastError = err;
      if (abortSignal.aborted) {
        throw err;
      }

      const errMsg = String((err as any)?.message || err || '');
      const isStreamClosed = errMsg.toLowerCase().includes('stream closed');
      consecutiveStreamClosed = isStreamClosed ? consecutiveStreamClosed + 1 : 0;

      if (attempt + 1 < TTS_MS_EDGE_MAX_ATTEMPTS && isRetryableEdgeTtsError(err)) {
        console.warn(
          `[Edge TTS] Thử lại lần ${attempt + 1}/${TTS_MS_EDGE_MAX_ATTEMPTS - 1} (${voiceCode}): ${errMsg}`
        );
        continue;
      }

      if (isRetryableEdgeTtsError(err)) {
        break;
      }
      throw err;
    }
  }

  // Khi msedge-tts lỗi Stream closed 2 lần liên tiếp (hoặc lỗi mạng retryable ở cả 2 lượt),
  // chuyển ngay sang engine dự phòng nhanh & ổn định
  if (!abortSignal.aborted) {
    try {
      const elapsedMs = Date.now() - startedAt;
      console.warn(
        `[Edge TTS] ${
          consecutiveStreamClosed >= 2
            ? 'Lỗi Stream closed 2 lần liên tiếp'
            : 'Lỗi kết nối Edge TTS liên tiếp'
        } (${voiceCode}, ${elapsedMs}ms) -> Chuyển sang engine dự phòng`
      );
      return await runFastFallbackEngine(cleanText, voiceCode, abortSignal, elapsedMs);
    } catch (fallbackErr) {
      lastError = lastError || fallbackErr;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || 'Edge TTS synthesis failed'));
}

async function synthesizeEdgeTtsBuffer(
  cleanText: string,
  voiceCode: string,
  cacheKey: string,
  clientSignal?: AbortSignal
): Promise<CachedAudioEntry> {
  if (audioCache.has(cacheKey)) {
    const cached = audioCache.get(cacheKey)!;
    // Refresh LRU position
    audioCache.delete(cacheKey);
    audioCache.set(cacheKey, cached);
    return cached;
  }

  // Kiểm tra SSD Disk Cache trước khi vào hàng đợi WebSocket (phục vụ < 5ms, 0 tải CPU)
  const diskCached = await readDiskCache(cacheKey);
  if (diskCached) {
    const diskEntry: CachedAudioEntry = { buffer: diskCached, isPrimaryEdge: true };
    setLruAudioCache(cacheKey, diskEntry);
    return diskEntry;
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
  let resolveEntry!: (entry: CachedAudioEntry) => void;
  let rejectEntry!: (err: unknown) => void;

  const entryPromise = new Promise<CachedAudioEntry>((res, rej) => {
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
        const result = await runEdgeTtsSynthesisWithRetry(
          cleanText,
          voiceCode,
          entryAbortController.signal
        );
        setLruAudioCache(cacheKey, result);
        // Chỉ lưu vĩnh viễn trên SSD khi audio đến từ giọng Neural chính thức (Hoài My / Nam Minh)
        if (result.isPrimaryEdge) {
          writeDiskCacheAsync(cacheKey, result.buffer);
        }
        resolveEntry(result);
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
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Nội dung văn bản (text) không được để trống' });
  }

  // Normalize voice code: must be a real Edge TTS voice code (default: vi-VN-HoaiMyNeural)
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

  // Làm sạch văn bản trước khi đưa vào msedge-tts (loại ký tự điều khiển, <, >, &, chuẩn hóa ngoặc/khoảng trắng)
  const cleanText = sanitizeTextForEdgeTts(text);
  if (!cleanText) {
    return res.status(400).json({ error: 'Nội dung văn bản (text) không hợp lệ sau khi làm sạch' });
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
    const { buffer: fullBuffer, isPrimaryEdge } = await synthesizeEdgeTtsBuffer(
      cleanText,
      voiceCode,
      cacheKey,
      clientAbortController.signal
    );
    if (!res.headersSent && !res.writableEnded && !clientAbortController.signal.aborted) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', fullBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader(
        'Cache-Control',
        isPrimaryEdge
          ? 'public, max-age=2592000, stale-while-revalidate=604800'
          : 'public, max-age=300'
      );
      res.setHeader('X-TTS-Engine', isPrimaryEdge ? 'msedge' : 'fallback');
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

/**
 * GET /api/tts/health
 */
app.get('/api/tts/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    ramCacheItems: audioCache.size,
    diskCacheFiles: estimatedDiskFiles,
    diskCacheMb: Number((estimatedDiskBytes / (1024 * 1024)).toFixed(1)),
    activeWorkers: activeTtsWorkers,
    queueLength: ttsWaitQueue.length,
    uptimeSec: Math.round(process.uptime()),
  });
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
  ensureDiskCacheDir();
  pruneDiskCacheIfNeeded().catch(() => {});

  // Pre-scan voices on boot
  scanVietnameseVoices().catch(() => {});

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.TTS_ONLY_MODE !== 'true') {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(path.join(distDir, 'index.html'))) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Đạo Tâm Server] Running on http://0.0.0.0:${PORT} (SSD Cache: ${TTS_DISK_CACHE_DIR})`);
  });
}

startServer();
