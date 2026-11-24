/**
 * GitHub MP3 Audio Storage & Browser-side TTS-to-MP3 Builder (Admin Only)
 * - Cấu hình GitHub Repo & PAT chỉ lưu trong localStorage của trình duyệt Admin (tuyệt đối không ghi lên Firestore).
 * - Đẩy file MP3 trực tiếp lên GitHub qua Contents API:
 *   PUT https://api.github.com/repos/{owner}/{repo}/contents/audio/{storyId}-chap-{chapterId}.mp3
 * - Trả về link CDN tốc độ cao jsDelivr:
 *   https://cdn.jsdelivr.net/gh/{owner}/{repo}@main/audio/{storyId}-chap-{chapterId}.mp3
 */

import {
  chunkChapterContent,
  cleanTextForTTS,
  extractPlainTextFromChapterHtml,
  fetchTtsAudioBlobWithWatchdog,
  getOrderedTtsEndpoints,
  sanitizeUserFacingErrorText,
  sleepWithAbort,
  splitTextIntoSpeechChunks,
} from './audioChunker';
import { isDeviceFallbackVoice, normalizeEdgeVoiceId } from './rulesAndVoices';

export const ADMIN_GITHUB_REPO_STORAGE_KEY = 'daotam_admin_github_repo';
export const ADMIN_GITHUB_TOKEN_STORAGE_KEY = 'daotam_admin_github_token';

export interface AdminGitHubConfig {
  repo: string;
  token: string;
}

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  fullName: string;
}

export function sanitizeGitHubToken(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, '')
    .trim();
}

export function getAdminGitHubConfig(): AdminGitHubConfig {
  if (typeof window === 'undefined') {
    return { repo: '', token: '' };
  }
  try {
    return {
      repo: normalizeGitHubRepoInput(window.localStorage.getItem(ADMIN_GITHUB_REPO_STORAGE_KEY) || ''),
      token: sanitizeGitHubToken(window.localStorage.getItem(ADMIN_GITHUB_TOKEN_STORAGE_KEY) || ''),
    };
  } catch {
    return { repo: '', token: '' };
  }
}

export function normalizeGitHubRepoInput(raw: string): string {
  let clean = (raw || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, '').trim();
  clean = clean.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
  clean = clean.replace(/\.git$/i, '');
  clean = clean.replace(/^\/+|\/+$/g, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].trim()}/${parts[1].trim()}`;
  }
  return clean;
}

export const DEFAULT_GITHUB_AUDIO_REPO = 'hoaamcac-netizen/daotam-audio';

export function parseGitHubRepo(input: string): ParsedGitHubRepo {
  const normalized = normalizeGitHubRepoInput(input);
  const match = normalized.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) {
    throw new Error(
      'Tên kho âm thanh không hợp lệ. Vui lòng nhập đúng định dạng chủ-sở-hữu/tên-kho.'
    );
  }
  return {
    owner: match[1].trim(),
    repo: match[2].trim(),
    fullName: `${match[1].trim()}/${match[2].trim()}`,
  };
}

/**
 * Tách số chương từ tên file MP3 tải lên hàng loạt:
 * Hỗ trợ các dạng: Chương_1_..., Chương 1..., Chuong_01..., chuong-12.mp3, Chương.005...
 * Tự động chuẩn hóa Unicode NFC để tránh lỗi dấu tiếng Việt tổ hợp trên macOS/iOS.
 */
export function extractChapterNumberFromMp3Filename(fileName: string): number | null {
  const normalized = String(fileName || '').normalize('NFC').trim();
  if (!normalized) return null;
  const match = normalized.match(/(?:chương|chuong)[\s_\-.]*(\d+)/i);
  if (!match || !match[1]) return null;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export function isValidMp3UploadFile(file: File): boolean {
  if (!file) return false;
  const nameLower = (file.name || '').trim().toLowerCase();
  const typeLower = (file.type || '').trim().toLowerCase();
  if (nameLower.endsWith('.mp3')) return true;
  if (typeLower === 'audio/mpeg' || typeLower === 'audio/mp3') return true;
  return false;
}

export function saveAdminGitHubConfig(repoInput: string, tokenInput: string): AdminGitHubConfig {
  const normalizedRepo = normalizeGitHubRepoInput(repoInput);
  const cleanToken = sanitizeGitHubToken(tokenInput);

  if (normalizedRepo) {
    parseGitHubRepo(normalizedRepo);
  }

  if (typeof window !== 'undefined') {
    if (normalizedRepo) {
      window.localStorage.setItem(ADMIN_GITHUB_REPO_STORAGE_KEY, normalizedRepo);
    } else {
      window.localStorage.removeItem(ADMIN_GITHUB_REPO_STORAGE_KEY);
    }

    if (cleanToken) {
      window.localStorage.setItem(ADMIN_GITHUB_TOKEN_STORAGE_KEY, cleanToken);
    } else {
      window.localStorage.removeItem(ADMIN_GITHUB_TOKEN_STORAGE_KEY);
    }
  }

  return { repo: normalizedRepo, token: cleanToken };
}

export function sanitizeAudioFileSegment(rawId: string): string {
  const clean = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'item';
}

export function buildChapterMp3GitHubPath(storyId: string, chapterId: string): string {
  const safeStory = sanitizeAudioFileSegment(storyId);
  const safeChap = sanitizeAudioFileSegment(chapterId);
  return `audio/${safeStory}-chap-${safeChap}.mp3`;
}

export function buildChapterMp3CdnUrl(
  owner: string,
  repo: string,
  storyId: string,
  chapterId: string
): string {
  const filePath = buildChapterMp3GitHubPath(storyId, chapterId);
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/${filePath}`;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (!bytes || bytes.byteLength === 0) return '';
  const chunkSize = 0x8000; // 32KB chunks để tránh tràn call stack với file MP3 lớn
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode.apply(null, Array.from(sub)));
  }
  return btoa(parts.join(''));
}

/**
 * Gỡ bỏ thẻ ID3v2 ở đầu các đoạn MP3 ghép nối (từ đoạn thứ 2 trở đi)
 * để các trình phát di động (iOS Safari, Android Chrome) không bị sai tổng thời lượng hoặc khựng giữa đoạn.
 */
function stripLeadingId3v2Tag(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x44 && // 'D'
    bytes[2] === 0x33    // '3'
  ) {
    const flags = bytes[5];
    const hasFooter = (flags & 0x10) !== 0;
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    const totalHeaderSize = 10 + tagSize + (hasFooter ? 10 : 0);
    if (totalHeaderSize > 10 && totalHeaderSize < bytes.length) {
      return bytes.subarray(totalHeaderSize);
    }
  }
  return bytes;
}

export function concatMp3Uint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const valid = (chunks || []).filter((c) => c && c.byteLength > 0);
  if (valid.length === 0) {
    throw new Error('Không có dữ liệu âm thanh MP3 để ghép nối.');
  }

  const normalized = valid.map((chunk, index) =>
    index === 0 ? chunk : stripLeadingId3v2Tag(chunk)
  );
  const totalLength = normalized.reduce((sum, arr) => sum + arr.byteLength, 0);
  const merged = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of normalized) {
    merged.set(arr, offset);
    offset += arr.byteLength;
  }
  return merged;
}

export function mergeMp3ChunksToBlob(chunks: Uint8Array[]): Blob {
  const valid = (chunks || []).filter((c) => c && c.byteLength > 0);
  if (valid.length === 0) {
    throw new Error('Không có dữ liệu âm thanh MP3 để ghép nối.');
  }
  const normalizedParts: BlobPart[] = valid.map((chunk, index) => {
    const slice = index === 0 ? chunk : stripLeadingId3v2Tag(chunk);
    const copy = new Uint8Array(slice.byteLength);
    copy.set(slice);
    return copy.buffer;
  });
  return new Blob(normalizedParts, { type: 'audio/mpeg' });
}

async function fetchExistingGitHubFileSha(params: {
  owner: string;
  repo: string;
  filePath: string;
  token: string;
  signal?: AbortSignal;
}): Promise<string | undefined> {
  const { owner, repo, filePath, token, signal } = params;
  const cleanOwner = owner.trim();
  const cleanRepo = repo.trim();
  const cleanToken = sanitizeGitHubToken(token);
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(
    cleanRepo
  )}/contents/${filePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')}?ref=main`;

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw err;
    }
    throw new Error(
      `Lỗi mạng khi kiểm tra tệp trên kho âm thanh: ${
        err?.message || 'Không thể kết nối máy chủ lưu trữ'
      }.`
    );
  }

  if (res.status === 404) {
    return undefined;
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Lỗi mã xác thực kho âm thanh (HTTP ${res.status}): Mã không hợp lệ, đã hết hạn hoặc thiếu quyền đọc/ghi tệp.`
    );
  }

  if (res.status === 429) {
    throw new Error('Kho âm thanh đang quá tải (HTTP 429): Đang gửi quá nhiều yêu cầu, vui lòng thử lại sau ít phút.');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Lỗi kiểm tra tệp trên kho âm thanh (HTTP ${res.status}): ${errText || res.statusText}`);
  }

  const json = await res.json().catch(() => null);
  return typeof json?.sha === 'string' ? json.sha : undefined;
}

export async function uploadMp3ToGitHub(params: {
  repoInput?: string;
  token?: string;
  storyId: string;
  chapterId: string;
  mp3Bytes?: Uint8Array;
  mp3Blob?: Blob;
  commitMessage?: string;
  signal?: AbortSignal;
  onProgress?: (percent: number, statusText: string) => void;
}): Promise<{ cdnUrl: string; githubPath: string; sha: string }> {
  const stored = getAdminGitHubConfig();
  const repoRaw = normalizeGitHubRepoInput(params.repoInput ?? stored.repo);
  const token = sanitizeGitHubToken(params.token ?? stored.token);

  if (!repoRaw || !token) {
    throw new Error(
      'Vui lòng nhập đầy đủ Tên kho âm thanh và Mã xác thực trong phần Cài đặt trước khi tải lên.'
    );
  }

  let mp3Bytes = params.mp3Bytes;
  if ((!mp3Bytes || mp3Bytes.byteLength === 0) && params.mp3Blob && params.mp3Blob.size > 0) {
    const buf = await params.mp3Blob.arrayBuffer();
    mp3Bytes = new Uint8Array(buf);
  }

  if (!mp3Bytes || mp3Bytes.byteLength === 0) {
    throw new Error('File MP3 trống hoặc không hợp lệ.');
  }

  const { owner, repo } = parseGitHubRepo(repoRaw);
  const cleanOwner = owner.trim();
  const cleanRepo = repo.trim();
  const filePath = buildChapterMp3GitHubPath(params.storyId, params.chapterId);
  const encodedPath = filePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const putUrl = `https://api.github.com/repos/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(
    cleanRepo
  )}/contents/${encodedPath}`;

  params.onProgress?.(88, 'Đang kiểm tra tệp cũ trên kho âm thanh...');
  let existingSha = await fetchExistingGitHubFileSha({
    owner: cleanOwner,
    repo: cleanRepo,
    filePath,
    token,
    signal: params.signal,
  });

  params.onProgress?.(92, 'Đang tải MP3 lên kho âm thanh...');
  const base64Content = uint8ArrayToBase64(mp3Bytes);
  const commitMessage =
    params.commitMessage || `Upload audio MP3: ${filePath}`;

  const executePut = async (shaToUse?: string): Promise<Response> => {
    const body: Record<string, unknown> = {
      message: commitMessage,
      content: base64Content,
      branch: 'main',
    };
    if (shaToUse) {
      body.sha = shaToUse;
    }

    try {
      return await fetch(putUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(body),
        signal: params.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || params.signal?.aborted) {
        throw err;
      }
      throw new Error(
        `Lỗi mạng khi tải MP3 lên kho âm thanh: ${
          err?.message || 'Không thể kết nối máy chủ lưu trữ'
        }.`
      );
    }
  };

  let putRes = await executePut(existingSha);

  // Nếu bị xung đột sha (409/422), lấy lại sha mới nhất và thử ghi đè lại 1 lần
  if (putRes.status === 409 || putRes.status === 422) {
    await sleepWithAbort(300, params.signal).catch(() => {});
    const latestSha = await fetchExistingGitHubFileSha({
      owner: cleanOwner,
      repo: cleanRepo,
      filePath,
      token,
      signal: params.signal,
    }).catch(() => undefined);
    if (latestSha && latestSha !== existingSha) {
      existingSha = latestSha;
      putRes = await executePut(existingSha);
    }
  }

  if (!putRes.ok) {
    const errJson = await putRes.json().catch(() => null);
    const errMsg = errJson?.message || putRes.statusText || 'Lỗi không xác định';
    if (putRes.status === 401 || putRes.status === 403) {
      throw new Error(
        `Lỗi mã xác thực kho âm thanh (HTTP ${putRes.status}): ${errMsg}. Hãy kiểm tra lại quyền đọc/ghi của mã.`
      );
    }
    if (putRes.status === 404) {
      throw new Error(
        `Lỗi kho âm thanh (HTTP 404): Không tìm thấy kho lưu trữ hoặc nhánh cấu hình.`
      );
    }
    if (putRes.status === 409) {
      throw new Error(
        `Lỗi xung đột ghi dữ liệu (HTTP 409): Tệp đang được cập nhật đồng thời. Hãy thử lại.`
      );
    }
    if (putRes.status === 429) {
      throw new Error(
        `Kho âm thanh đang quá tải (HTTP 429): Quá nhiều lượt ghi liên tiếp. Hãy chờ 1 phút rồi tiếp tục.`
      );
    }
    throw new Error(`Lỗi tải tệp MP3 lên kho âm thanh (HTTP ${putRes.status}): ${errMsg}`);
  }

  const putData = await putRes.json().catch(() => ({}));
  const newSha = typeof putData?.content?.sha === 'string' ? putData.content.sha : '';
  const cdnUrl = buildChapterMp3CdnUrl(cleanOwner, cleanRepo, params.storyId, params.chapterId);

  params.onProgress?.(96, 'Đã tải tệp MP3 lên kho âm thanh thành công!');
  return {
    cdnUrl,
    githubPath: filePath,
    sha: newSha,
  };
}

/**
 * Tự tạo file MP3 toàn chương ngay trên trình duyệt Admin:
 * - Chia nhỏ văn bản chương thành các đoạn <= 400 ký tự theo dấu câu để Netlify không bao giờ bị timeout 10s.
 * - Gọi API TTS tuần tự từng đoạn theo thứ tự bắt buộc: Netlify chính (retry tối đa 2 lần) -> Vercel dự phòng.
 * - Ghép toàn bộ dữ liệu nhị phân thành 1 file Blob audio/mpeg duy nhất ngay trên trình duyệt.
 */
export async function generateChapterMp3FromText(params: {
  text: string;
  chapterTitle?: string;
  voiceId?: string;
  signal?: AbortSignal;
  onProgress?: (info: {
    percent: number;
    currentChunk: number;
    totalChunks: number;
    label: string;
  }) => void;
}): Promise<Blob> {
  const rawBody = extractPlainTextFromChapterHtml(params.text || '');
  if (!rawBody) {
    throw new Error('Nội dung chương đang trống, không thể tạo file MP3.');
  }

  const cleanTitle = cleanTextForTTS(params.chapterTitle || '').replace(/[.?!…]+$/, '');
  const fullText =
    cleanTitle && !rawBody.toLowerCase().startsWith(cleanTitle.toLowerCase().slice(0, 20))
      ? `${cleanTitle}.\n\n${rawBody}`
      : rawBody;

  // BẮT BUỘC chia <= 400 ký tự mỗi đoạn theo dấu câu/xuống dòng
  const rawChunks = chunkChapterContent(fullText, 220, 390, 180, 350);
  const chunkTexts: string[] = [];
  for (const ch of rawChunks) {
    if (ch.text.length <= 400) {
      chunkTexts.push(ch.text);
    } else {
      const subParts = splitTextIntoSpeechChunks(ch.text, 350);
      for (const part of subParts) {
        if (part.trim()) chunkTexts.push(part.trim());
      }
    }
  }

  if (chunkTexts.length === 0) {
    throw new Error('Không có câu văn hợp lệ để chuyển thành giọng nói.');
  }

  const normalizedVoice = normalizeEdgeVoiceId(params.voiceId || 'vi-VN-NamMinhNeural');
  const synthesisVoice = isDeviceFallbackVoice(normalizedVoice)
    ? 'vi-VN-NamMinhNeural'
    : normalizedVoice;

  const mp3Chunks: Uint8Array[] = [];
  const total = chunkTexts.length;

  for (let i = 0; i < total; i++) {
    if (params.signal?.aborted) {
      throw new DOMException('Đã hủy tạo MP3', 'AbortError');
    }

    // Nghỉ 180ms giữa các đoạn tuần tự để tránh nghẽn serverless
    if (i > 0) {
      await sleepWithAbort(180, params.signal);
    }

    const percentBefore = Math.max(2, Math.round((i / total) * 85));
    params.onProgress?.({
      percent: percentBefore,
      currentChunk: i + 1,
      totalChunks: total,
      label: `Đang tạo ${i + 1}/${total}...`,
    });

    try {
      const blob = await fetchTtsAudioBlobWithWatchdog({
        text: chunkTexts[i],
        voiceId: synthesisVoice,
        signal: params.signal,
        timeoutMs: 9500,
        maxRetries: 2,
        retryDelayMs: 550,
        onRetryAttempt: (_attempt, detail) => {
          params.onProgress?.({
            percent: percentBefore,
            currentChunk: i + 1,
            totalChunks: total,
            label: detail
              ? `Đoạn ${i + 1}/${total}: ${detail}`
              : `Đoạn ${i + 1}/${total} đang thử lại...`,
          });
        },
      });

      if (blob && blob.size > 0) {
        const arrayBuf = await blob.arrayBuffer();
        if (arrayBuf.byteLength > 0) {
          mp3Chunks.push(new Uint8Array(arrayBuf));
        }
      }
    } catch (primaryErr: any) {
      if (primaryErr?.name === 'AbortError' || params.signal?.aborted) {
        throw primaryErr;
      }

      // Cứu đoạn dài bị timeout bằng cách tách nhỏ ~180 ký tự rồi gọi tuần tự Netlify -> Vercel
      const subSegments = splitTextIntoSpeechChunks(chunkTexts[i], 180);
      let rescued = false;
      if (subSegments.length > 1) {
        try {
          params.onProgress?.({
            percent: percentBefore,
            currentChunk: i + 1,
            totalChunks: total,
            label: `Đoạn ${i + 1}/${total} đang tách nhỏ để tổng hợp lại...`,
          });
          await sleepWithAbort(350, params.signal);
          const rescuedParts: Uint8Array[] = [];
          for (let subIdx = 0; subIdx < subSegments.length; subIdx++) {
            if (subIdx > 0) {
              await sleepWithAbort(180, params.signal);
            }
            const subBlob = await fetchTtsAudioBlobWithWatchdog({
              text: subSegments[subIdx],
              voiceId: synthesisVoice,
              signal: params.signal,
              timeoutMs: 9500,
              maxRetries: 2,
              retryDelayMs: 550,
            });
            if (subBlob && subBlob.size > 0) {
              const subBuf = await subBlob.arrayBuffer();
              if (subBuf.byteLength > 0) {
                rescuedParts.push(new Uint8Array(subBuf));
              }
            }
          }
          if (rescuedParts.length > 0) {
            mp3Chunks.push(...rescuedParts);
            rescued = true;
          }
        } catch (subErr: any) {
          if (subErr?.name === 'AbortError' || params.signal?.aborted) {
            throw subErr;
          }
        }
      }

      if (!rescued) {
        const endpoints = getOrderedTtsEndpoints().join(' -> ');
        console.error('[generateChapterMp3FromText] TTS chunk failed:', {
          chunkIndex: i + 1,
          total,
          endpoints,
          error: primaryErr,
        });
        const detail = sanitizeUserFacingErrorText(
          primaryErr?.message,
          'Không thể kết nối máy chủ TTS'
        );
        throw new Error(`Lỗi tạo âm thanh tại đoạn ${i + 1}/${total}: ${detail}`);
      }
    }

    const percentAfter = Math.max(3, Math.round(((i + 1) / total) * 85));
    params.onProgress?.({
      percent: percentAfter,
      currentChunk: i + 1,
      totalChunks: total,
      label: `Đang tạo ${i + 1}/${total}... (${percentAfter}%)`,
    });
  }

  if (mp3Chunks.length === 0) {
    throw new Error('Máy chủ TTS không trả về dữ liệu âm thanh MP3 cho chương này.');
  }

  params.onProgress?.({
    percent: 87,
    currentChunk: total,
    totalChunks: total,
    label: `Đang ghép ${total} đoạn thành 1 file MP3...`,
  });

  return mergeMp3ChunksToBlob(mp3Chunks);
}

