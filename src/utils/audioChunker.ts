/**
 * Audio Chunker Engine & AudioStreamer for Đạo Tâm
 * - Làm sạch văn bản bằng Regex (loại bỏ HTML, URL, ký tự rác)
 * - Gộp câu thành các đoạn tối ưu 500 - 800 ký tự theo ranh giới dấu chấm/xuống dòng
 * - Fetch TTS với AbortController timeout 8 giây + Retry tối đa 3 lần
 * - Bộ nhớ đệm Blob URL giới hạn cứng tối đa 3 đoạn, tự động revokeObjectURL chống tràn RAM
 */

import { buildTtsEndpoint } from './ttsApi';

export interface AudioChunk {
  id: number;
  text: string;
  charStart: number;
  charEnd: number;
  rawText: string;
  paraIndex?: number;
}

export const TTS_FETCH_TIMEOUT_MS = 20000;
export const TTS_MAX_RETRIES = 3;
export const TTS_RETRY_DELAY_MS = 2000;
export const DEFAULT_FIRST_CHUNK_MIN_LENGTH = 80;
export const DEFAULT_FIRST_CHUNK_MAX_LENGTH = 150;
export const DEFAULT_HEAD_CHUNK_COUNT = 2;
export const DEFAULT_CHUNK_MIN_LENGTH = 250;
export const DEFAULT_CHUNK_MAX_LENGTH = 350;
export const MAX_BLOB_CACHE_ENTRIES = 6;

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
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

/**
 * Fetch audio TTS qua AbortController giới hạn cứng 20 giây + Retry tối đa 3 lần (mỗi lần nghỉ 2s).
 * Hoàn toàn không đọc/ghi Firestore, chỉ giao tiếp Client <-> /api/tts.
 */
export async function fetchTtsAudioBlobWithWatchdog(params: {
  text: string;
  voiceId: string;
  signal?: AbortSignal;
  onRetryAttempt?: (attempt: number) => void;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<Blob> {
  const {
    text,
    voiceId,
    signal: externalSignal,
    onRetryAttempt,
    timeoutMs = TTS_FETCH_TIMEOUT_MS,
    maxRetries = TTS_MAX_RETRIES,
  } = params;

  const cleanText = cleanTextForTTS(text);
  if (!cleanText) {
    throw new Error('Empty audio chunk');
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (attempt > 0) {
      onRetryAttempt?.(attempt);
      await sleepWithAbort(TTS_RETRY_DELAY_MS, externalSignal);
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    try {
      const baseEndpoint = buildTtsEndpoint('/api/tts');
      const getUrl = `${baseEndpoint}?voice=${encodeURIComponent(voiceId)}&text=${encodeURIComponent(cleanText)}`;
      const useGetRequest = getUrl.length <= 1800;

      const response = useGetRequest
        ? await fetch(getUrl, {
            method: 'GET',
            signal: controller.signal,
          })
        : await fetch(baseEndpoint, {
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

      if (!response.ok) {
        throw new Error(`TTS API failed with status ${response.status}`);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        throw new Error('Máy chủ TTS chưa phản hồi đúng định dạng âm thanh (HTML thay vì MP3)');
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength < 100) {
        throw new Error('Dữ liệu âm thanh trả về không hợp lệ');
      }

      return new Blob([arrayBuffer], { type: 'audio/mpeg' });
    } catch (err) {
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      lastError = didTimeout
        ? new Error(`Quá thời gian ${Math.round(timeoutMs / 1000)}s kết nối máy chủ giọng đọc`)
        : err;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Không thể tải âm thanh sau 3 lần thử lại');
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
    .replace(/<[^>]*>/g, ' ')
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
  firstMaxLength: number = DEFAULT_FIRST_CHUNK_MAX_LENGTH,
  headChunkCount: number = DEFAULT_HEAD_CHUNK_COUNT
): AudioChunk[] {
  if (!content || !content.trim()) return [];

  const activeHeadChunkCount = Math.max(1, headChunkCount);
  const nextMinLen = Math.max(150, idealMinLength);
  const nextMaxLen = Math.max(nextMinLen + 50, idealMaxLength);
  const headMinLen = Math.max(60, firstMinLength);
  const headMaxLen = Math.max(headMinLen + 40, firstMaxLength);

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
    if (chunks.length < activeHeadChunkCount) {
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
        (chunks.length < activeHeadChunkCount && accumulator.length > 0 && accumulator.length < 80 && accumulator.length + 1 + sentence.length > maxLen);

      if (needsSubSplit) {
        if (accumulator && (accumulator.length >= 80 || chunks.length >= activeHeadChunkCount)) {
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
    if (!cleanText) {
      throw new Error('Empty audio chunk');
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
          seamlessAudioCache.revokeEntry(this.voiceId, chunk.text);
          this.playChunk(index + 1);
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

      // Chỉ prefetch đúng 1 đoạn kế tiếp ngay khi đoạn hiện tại bắt đầu phát
      const nextTarget = this.chunks[index + 1];
      if (nextTarget && !signal.aborted) {
        seamlessAudioCache
          .fetchAndCache(this.voiceId, nextTarget.text, undefined, signal, chunk.text)
          .catch(() => {});
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
