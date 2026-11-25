/**
 * Audio Chunker & Text Preparation Utilities for Đạo Tâm
 * - Làm sạch văn bản (loại bỏ HTML, URL, ký tự rác)
 * - Phân đoạn văn bản tối ưu cho trình đọc Giọng Máy Google & highlight câu theo chương
 */

export interface AudioChunk {
  id: number;
  text: string;
  charStart: number;
  charEnd: number;
  rawText: string;
  paraIndex?: number;
}

export const DEFAULT_FIRST_CHUNK_MIN_LENGTH = 260;
export const DEFAULT_FIRST_CHUNK_MAX_LENGTH = 420;
export const DEFAULT_CHUNK_MIN_LENGTH = 400;
export const DEFAULT_CHUNK_MAX_LENGTH = 550;

export function sanitizeUserFacingErrorText(raw?: string | null, fallback = 'Máy chủ âm thanh đang bận'): string {
  const input = String(raw || '').trim();
  if (!input) return fallback;
  const cleaned = input
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(github|firebase|firestore|netlify|vercel|cloudflare|catbox)\b/gi, 'máy chủ')
    .replace(/\b(?:microsoft\s*)?edge\s*tts\b/gi, 'hệ thống âm thanh')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:\-|]+\s*$/g, '')
    .trim();
  return cleaned || fallback;
}

export function extractPlainTextFromChapterHtml(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCharCode(code) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : ' ';
    })
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
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

/**
 * Làm sạch văn bản trước khi đọc bằng Giọng Máy Google:
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

  const nextMinLen = Math.max(150, idealMinLength);
  const nextMaxLen = Math.max(nextMinLen + 40, idealMaxLength);
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
export function splitTextForDeviceSpeech(text: string, maxLength: number = 200): string[] {
  const cleaned = cleanTextForTTS(text);
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) return [];

  const safeMax = Math.max(60, Math.min(200, maxLength));
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

