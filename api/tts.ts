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
const TTS_SYNTHESIS_TIMEOUT_MS = 15000;

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
  const cleanText = text.trim().slice(0, 3000);
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

  try {
    // Cấu hình định dạng MP3 24kHz 48kbps Mono tối ưu cho giọng đọc truyện tiếng Việt
    await tts.setMetadata(voiceCode, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const streams = tts.toStream(cleanText);
    audioStream = streams.audioStream;
    metadataStream = streams.metadataStream;
    if (metadataStream && typeof metadataStream.on === 'function') {
      metadataStream.on('error', () => {});
      metadataStream.resume?.();
    }

    const chunks: Buffer[] = [];
    let isTerminated = false;

    timeout = setTimeout(() => {
      if (!isTerminated) {
        isTerminated = true;
        cleanup();
        if (!res.headersSent) {
          res.status(504).json({ error: 'Quá thời gian 15s kết nối tới máy chủ Microsoft Edge TTS.' });
        }
      }
    }, TTS_SYNTHESIS_TIMEOUT_MS);

    audioStream.on('data', (chunk: Buffer) => {
      if (!isTerminated && chunk && chunk.length > 0) {
        chunks.push(chunk);
      }
    });

    audioStream.on('end', () => {
      if (isTerminated) return;
      isTerminated = true;
      const fullBuffer = Buffer.concat(chunks);
      chunks.length = 0;
      cleanup();

      if (fullBuffer.length > 0) {
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
      } else if (!res.headersSent) {
        res.status(502).json({ error: 'Không nhận được dữ liệu âm thanh từ Edge TTS.' });
      }
    });

    audioStream.on('error', (err: any) => {
      if (isTerminated) return;
      isTerminated = true;
      chunks.length = 0;
      cleanup();
      if (!res.headersSent) {
        console.error('[Edge TTS Serverless Stream Error]:', err);
        res.status(502).json({ error: 'Lỗi stream Edge TTS: ' + (err?.message || 'Không xác định') });
      }
    });
  } catch (err: any) {
    cleanup();
    console.error('[Edge TTS Serverless Handler Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Không thể tổng hợp giọng đọc: ' + (err?.message || 'Unknown error') });
    }
  }
}
