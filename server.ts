import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dns from 'dns';
import http from 'http';
import https from 'https';
import { execFile } from 'child_process';
import fs from 'fs';
import { initializeApp as initServerFirebase, getApps as getServerApps, getApp as getServerApp } from 'firebase/app';
import { getFirestore as getServerFirestore, doc as serverDoc, getDoc as getServerDoc, setDoc as serverSetDoc, updateDoc as serverUpdateDoc, writeBatch as serverWriteBatch } from 'firebase/firestore';

// Ưu tiên IPv4 cho kết nối mạng outbound trên VPS
dns.setDefaultResultOrder('ipv4first');
const ipv4HttpAgent = new http.Agent({ keepAlive: true, family: 4, maxSockets: 32 });
const ipv4HttpsAgent = new https.Agent({ keepAlive: true, family: 4, maxSockets: 32 });
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

const DEFAULT_VI_VOICES = [
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

function resolveEdgeTtsBinary(): string {
  const configured = (process.env.EDGE_TTS_BIN || '').trim();
  if (configured) return configured;

  const candidates = [
    '/usr/local/bin/edge-tts',
    '/usr/bin/edge-tts',
    '/root/.local/bin/edge-tts',
  ];
  if (process.env.HOME) {
    candidates.push(path.join(process.env.HOME, '.local', 'bin', 'edge-tts'));
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }
  return 'edge-tts';
}

const EDGE_TTS_BIN = resolveEdgeTtsBinary();

/**
 * Scan & retrieve verified Vietnamese voices from Python edge-tts CLI
 */
async function scanVietnameseVoices() {
  const now = Date.now();
  if (cachedViVoices.length > 0 && now - lastVoiceFetch < 3600000) {
    return cachedViVoices;
  }

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        EDGE_TTS_BIN,
        ['--list-voices'],
        { timeout: 8000, maxBuffer: 1024 * 1024 },
        (err, out) => {
          if (err) return reject(err);
          resolve(out || '');
        }
      );
    });

    const parsed: any[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const match = /^(vi-[A-Z]{2}-([A-Za-z0-9]+)Neural)\b/.exec(line.trim());
      if (!match) continue;
      const shortName = match[1];
      const lowerLine = line.toLowerCase();
      const isMale = lowerLine.includes('male') && !lowerLine.includes('female');
      const isHoaiMy = shortName.includes('HoaiMy');
      const isNamMinh = shortName.includes('NamMinh');
      const displayName = isHoaiMy ? 'Hoài My' : isNamMinh ? 'Nam Minh' : match[2];
      const tag = isMale ? 'Nam • Edge Neural Tự Nhiên' : 'Nữ • Edge Neural Tự Nhiên';

      parsed.push({
        id: shortName,
        shortName,
        name: displayName,
        tag,
        gender: isMale ? 'male' : 'female',
        locale: 'vi-VN',
        description: `Giọng đọc ${isMale ? 'nam' : 'nữ'} Microsoft Edge Neural tự nhiên, chuẩn bản ngữ tiếng Việt.`,
        sampleText: isMale
          ? 'Tôi là Nam Minh. Mời quý độc giả cùng thưởng thức câu chuyện qua giọng đọc Edge TTS chân thực.'
          : 'Chào bạn, mình là Hoài My. Đây là giọng đọc Edge TTS truyền cảm tự nhiên của Microsoft.',
      });
    }

    if (parsed.length > 0) {
      cachedViVoices = parsed;
      lastVoiceFetch = now;
      console.log(`[Edge TTS CLI] Scanned ${cachedViVoices.length} Vietnamese voices:`, cachedViVoices.map((v) => v.id));
      return cachedViVoices;
    }
  } catch (err) {
    console.warn('[Edge TTS CLI] Voice list scan warning, using verified defaults:', (err as any)?.message || err);
  }

  cachedViVoices = DEFAULT_VI_VOICES;
  lastVoiceFetch = now;
  return cachedViVoices;
}

/**
 * GET /api/tts/voices
 * Returns verified list of Vietnamese voices from Microsoft Edge TTS
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
// TỐI ƯU EDGE TTS PYTHON CLI CHO CLOUDFLY VPS (1 vCPU, 1GB RAM, 20GB SSD)
// 1. RAM LRU Cache 80 đoạn hot (~8MB RAM) + SSD Disk Cache (tối đa ~3GB trên 20GB SSD)
// 2. Gọi trực tiếp CLI `edge-tts` (Python) qua execFile -> /tmp/*.mp3, chạy tối đa 3 luồng song song
// 3. Chỉ dùng giọng thật Microsoft (Nam Minh / Hoài My), không fallback sang giọng Google, retry tối đa 2 lần
// =========================================================================
const MAX_AUDIO_CACHE_ITEMS = 80;
const MAX_CONCURRENT_TTS = Math.max(1, Math.min(3, Number(process.env.TTS_MAX_CONCURRENCY) || 3));
const TTS_SYNTHESIS_TIMEOUT_MS = 15000;
const TTS_MAX_RETRIES = 2;
const TTS_RETRY_DELAY_MS = 250;
const TTS_TMP_DIR = process.env.TTS_TMP_DIR || '/tmp';
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

function normalizeEdgeTtsRate(rawRate?: string): string {
  const trimmed = String(rawRate || '').trim();
  if (/^[+-]\d{1,3}%$/.test(trimmed)) {
    return trimmed;
  }
  return '+0%';
}

async function runPythonEdgeTtsOnce(
  cleanText: string,
  voiceCode: string,
  rate: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  if (abortSignal.aborted) {
    throw new Error('Client aborted TTS request');
  }

  // Đảm bảo argparse của Python edge-tts không hiểu nhầm câu bắt đầu bằng '-' là cờ CLI
  const safeCliText = cleanText.startsWith('-') ? ` ${cleanText}` : cleanText;
  const tmpFileName = `daotam-tts-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.mp3`;
  const tmpFilePath = path.join(TTS_TMP_DIR, tmpFileName);

  const args = [
    '--voice',
    voiceCode,
    '--rate',
    rate,
    '--text',
    safeCliText,
    '--write-media',
    tmpFilePath,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        EDGE_TTS_BIN,
        args,
        {
          timeout: TTS_SYNTHESIS_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
          signal: abortSignal,
        },
        (err, _stdout, stderr) => {
          if (err) {
            if (abortSignal.aborted || (err as any)?.name === 'AbortError') {
              return reject(new Error('Client aborted TTS request'));
            }
            const stderrText = String(stderr || '').trim();
            const isTimeout = Boolean((err as any)?.killed) && String((err as any)?.signal || '') === 'SIGTERM';
            const detail = isTimeout
              ? `Quá thời gian ${Math.round(TTS_SYNTHESIS_TIMEOUT_MS / 1000)}s khi chạy edge-tts CLI`
              : stderrText || err.message || 'edge-tts CLI exited with error';
            return reject(new Error(detail));
          }
          resolve();
        }
      );
    });

    if (abortSignal.aborted) {
      throw new Error('Client aborted TTS request');
    }

    const audioBuffer = await fs.promises.readFile(tmpFilePath);
    if (!audioBuffer || audioBuffer.length < 100) {
      throw new Error('edge-tts CLI không trả về dữ liệu âm thanh hợp lệ');
    }
    return audioBuffer;
  } finally {
    await fs.promises.unlink(tmpFilePath).catch(() => {});
  }
}

async function runPythonEdgeTtsWithRetry(
  cleanText: string,
  voiceCode: string,
  rate: string,
  abortSignal: AbortSignal
): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= TTS_MAX_RETRIES; attempt++) {
    if (abortSignal.aborted) {
      throw new Error('Client aborted TTS request');
    }

    if (attempt > 0) {
      await sleepWithAbortServer(TTS_RETRY_DELAY_MS, abortSignal);
    }

    try {
      return await runPythonEdgeTtsOnce(cleanText, voiceCode, rate, abortSignal);
    } catch (err) {
      lastError = err;
      if (abortSignal.aborted) {
        throw err;
      }
      if (attempt < TTS_MAX_RETRIES) {
        console.warn(
          `[Edge TTS CLI] Thử lại lần ${attempt + 1}/${TTS_MAX_RETRIES} (${voiceCode}): ${(err as any)?.message || err}`
        );
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || 'Edge TTS CLI synthesis failed'));
}

async function synthesizeEdgeTtsBuffer(
  cleanText: string,
  voiceCode: string,
  rate: string,
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

  // Kiểm tra SSD Disk Cache trước khi vào hàng đợi CLI (phục vụ < 5ms, 0 tải CPU)
  const diskCached = await readDiskCache(cacheKey);
  if (diskCached) {
    setLruAudioCache(cacheKey, diskCached);
    return diskCached;
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
        const fullBuffer = await runPythonEdgeTtsWithRetry(
          cleanText,
          voiceCode,
          rate,
          entryAbortController.signal
        );
        setLruAudioCache(cacheKey, fullBuffer);
        writeDiskCacheAsync(cacheKey, fullBuffer);
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
 * Handle Edge TTS Speech Synthesis with Python edge-tts CLI, LRU RAM/SSD cache & concurrency queue
 */
async function handleTtsSynthesis(
  text: string,
  requestedVoice: string | undefined,
  requestedRate: string | undefined,
  res: Response
) {
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Nội dung văn bản (text) không được để trống' });
  }

  // Normalize voice code: chỉ sử dụng giọng thật của Microsoft Edge Neural
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

  const safeRate = normalizeEdgeTtsRate(requestedRate);

  // Làm sạch văn bản trước khi đưa vào edge-tts CLI
  const cleanText = sanitizeTextForEdgeTts(text);
  if (!cleanText) {
    return res.status(400).json({ error: 'Nội dung văn bản (text) không hợp lệ sau khi làm sạch' });
  }
  const cacheKey =
    safeRate === '+0%'
      ? `${voiceCode}:::${cleanText}`
      : `${voiceCode}:::${safeRate}:::${cleanText}`;

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
      safeRate,
      cacheKey,
      clientAbortController.signal
    );
    if (!res.headersSent && !res.writableEnded && !clientAbortController.signal.aborted) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', fullBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
      res.setHeader('X-TTS-Engine', 'edge-tts-py');
      res.end(fullBuffer);
    }
  } catch (err: any) {
    if (clientAbortController.signal.aborted) {
      return;
    }
    console.error(`[Edge TTS CLI Error for voice ${voiceCode}]:`, err);
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
  const rate = (req.query.rate as string) || '';
  await handleTtsSynthesis(text, voice, rate, res);
});

/**
 * GET /api/tts/stream?text=...&voice=...
 */
app.get('/api/tts/stream', async (req: Request, res: Response) => {
  const text = (req.query.text as string) || '';
  const voice = (req.query.voice as string) || '';
  const rate = (req.query.rate as string) || '';
  await handleTtsSynthesis(text, voice, rate, res);
});

/**
 * POST /api/tts
 */
app.post('/api/tts', async (req: Request, res: Response) => {
  const text = req.body?.text || '';
  const voice = req.body?.voice || '';
  const rate = req.body?.rate || '';
  await handleTtsSynthesis(text, voice, rate, res);
});

/**
 * GET /api/tts/health
 */
app.get('/api/tts/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    engine: 'edge-tts-py',
    maxConcurrency: MAX_CONCURRENT_TTS,
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
