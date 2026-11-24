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
  fetchTtsAudioBlobWithWatchdog,
  getOrderedTtsEndpoints,
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

export function parseGitHubRepo(input: string): ParsedGitHubRepo {
  const normalized = normalizeGitHubRepoInput(input);
  const match = normalized.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) {
    throw new Error(
      'Tên kho GitHub không hợp lệ. Vui lòng nhập đúng dạng username/ten-repo (ví dụ: username/daotam-audio).'
    );
  }
  return {
    owner: match[1].trim(),
    repo: match[2].trim(),
    fullName: `${match[1].trim()}/${match[2].trim()}`,
  };
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
      `Lỗi kiểm tra file trên GitHub (${cleanOwner}/${cleanRepo}): ${
        err?.message || 'Không thể kết nối api.github.com'
      }. Vui lòng kiểm tra kết nối mạng, Tên kho GitHub và GitHub Token.`
    );
  }

  if (res.status === 404) {
    return undefined;
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Lỗi kiểm tra file trên GitHub (mã lỗi HTTP ${res.status}): GitHub Token (PAT) không hợp lệ, hết hạn hoặc thiếu quyền Contents.`
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Lỗi kiểm tra file trên GitHub (mã lỗi HTTP ${res.status}): ${errText || res.statusText}`);
  }

  const json = await res.json().catch(() => null);
  return typeof json?.sha === 'string' ? json.sha : undefined;
}

export async function uploadMp3ToGitHub(params: {
  repoInput?: string;
  token?: string;
  storyId: string;
  chapterId: string;
  mp3Bytes: Uint8Array;
  commitMessage?: string;
  signal?: AbortSignal;
  onProgress?: (percent: number, statusText: string) => void;
}): Promise<{ cdnUrl: string; githubPath: string; sha: string }> {
  const stored = getAdminGitHubConfig();
  const repoRaw = normalizeGitHubRepoInput(params.repoInput ?? stored.repo);
  const token = sanitizeGitHubToken(params.token ?? stored.token);

  if (!repoRaw || !token) {
    throw new Error(
      'Vui lòng nhập đầy đủ Tên kho GitHub và GitHub Token (PAT) trong phần Cài đặt kho lưu trữ GitHub trước khi tải lên.'
    );
  }

  if (!params.mp3Bytes || params.mp3Bytes.byteLength === 0) {
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

  params.onProgress?.(88, 'Đang kiểm tra file cũ trên GitHub...');
  let existingSha = await fetchExistingGitHubFileSha({
    owner: cleanOwner,
    repo: cleanRepo,
    filePath,
    token,
    signal: params.signal,
  });

  params.onProgress?.(92, 'Đang tải file lên GitHub...');
  const base64Content = uint8ArrayToBase64(params.mp3Bytes);
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
        `Lỗi đẩy file lên GitHub (${cleanOwner}/${cleanRepo}): ${
          err?.message || 'Không thể kết nối api.github.com'
        }. Kiểm tra kết nối mạng, dung lượng file MP3 hoặc GitHub Token.`
      );
    }
  };

  let putRes = await executePut(existingSha);

  // Nếu bị xung đột sha (409/422), lấy lại sha mới nhất và thử ghi đè lại 1 lần
  if (putRes.status === 409 || putRes.status === 422) {
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
        `Lỗi đẩy file lên GitHub (mã lỗi HTTP ${putRes.status}): ${errMsg}. Hãy kiểm tra PAT có quyền Contents: Read & Write.`
      );
    }
    if (putRes.status === 404) {
      throw new Error(
        `Lỗi đẩy file lên GitHub (mã lỗi HTTP 404): Không tìm thấy kho "${cleanOwner}/${cleanRepo}" hoặc nhánh "main". Hãy đảm bảo repo đã được tạo và có nhánh main.`
      );
    }
    throw new Error(`Lỗi đẩy file lên GitHub (mã lỗi HTTP ${putRes.status}): ${errMsg}`);
  }

  const putData = await putRes.json().catch(() => ({}));
  const newSha = typeof putData?.content?.sha === 'string' ? putData.content.sha : '';
  const cdnUrl = buildChapterMp3CdnUrl(cleanOwner, cleanRepo, params.storyId, params.chapterId);

  params.onProgress?.(96, 'Đã đẩy file MP3 lên GitHub thành công!');
  return {
    cdnUrl,
    githubPath: filePath,
    sha: newSha,
  };
}

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
}): Promise<Uint8Array> {
  const rawBody = (params.text || '').trim();
  if (!rawBody) {
    throw new Error('Nội dung chương đang trống, không thể tạo file MP3.');
  }

  const cleanTitle = cleanTextForTTS(params.chapterTitle || '').replace(/[.?!…]+$/, '');
  const fullText =
    cleanTitle && !rawBody.toLowerCase().startsWith(cleanTitle.toLowerCase().slice(0, 20))
      ? `${cleanTitle}.\n\n${rawBody}`
      : rawBody;

  // Chia nội dung thành các đoạn ~420 ký tự theo dấu câu/xuống dòng để tổng hợp nhanh, không quá timeout serverless
  const chunks = chunkChapterContent(fullText, 360, 460, 320, 440);
  if (!chunks || chunks.length === 0) {
    throw new Error('Không có câu văn hợp lệ để chuyển thành giọng nói.');
  }

  const normalizedVoice = normalizeEdgeVoiceId(params.voiceId || 'vi-VN-NamMinhNeural');
  const synthesisVoice = isDeviceFallbackVoice(normalizedVoice)
    ? 'vi-VN-NamMinhNeural'
    : normalizedVoice;

  const audioSegments: Uint8Array[] = [];
  const total = chunks.length;

  for (let i = 0; i < total; i++) {
    if (params.signal?.aborted) {
      throw new DOMException('Đã hủy tạo MP3', 'AbortError');
    }

    // Nghỉ 200ms giữa các lần gọi tuần tự để tạo file MP3 nhanh và ổn định
    if (i > 0) {
      await sleepWithAbort(200, params.signal);
    }

    const percentBefore = Math.max(2, Math.round((i / total) * 85));
    params.onProgress?.({
      percent: percentBefore,
      currentChunk: i + 1,
      totalChunks: total,
      label: `Đang tạo đoạn ${i + 1}/${total}...`,
    });

    try {
      const blob = await fetchTtsAudioBlobWithWatchdog({
        text: chunks[i].text,
        voiceId: synthesisVoice,
        signal: params.signal,
        timeoutMs: 11000,
        maxRetries: 2,
        retryDelayMs: 650,
        onRetryAttempt: (attempt) => {
          params.onProgress?.({
            percent: percentBefore,
            currentChunk: i + 1,
            totalChunks: total,
            label: `Đoạn ${i + 1}/${total} đang thử lại (lần ${attempt}) qua server TTS dự phòng...`,
          });
        },
      });

      if (blob && blob.size > 0) {
        const arrayBuf = await blob.arrayBuffer();
        if (arrayBuf.byteLength > 0) {
          audioSegments.push(new Uint8Array(arrayBuf));
        }
      }
    } catch (primaryErr: any) {
      if (primaryErr?.name === 'AbortError' || params.signal?.aborted) {
        throw primaryErr;
      }

      // Dự phòng cấp 2: chia nhỏ chính đoạn bị lỗi thành các câu ngắn ~170 ký tự để cứu dữ liệu
      const subSegments = splitTextIntoSpeechChunks(chunks[i].text, 170);
      let rescued = false;
      if (subSegments.length > 0) {
        try {
          params.onProgress?.({
            percent: percentBefore,
            currentChunk: i + 1,
            totalChunks: total,
            label: `Đoạn ${i + 1}/${total} đang tách nhỏ để tổng hợp lại...`,
          });
          await sleepWithAbort(450, params.signal);
          for (let subIdx = 0; subIdx < subSegments.length; subIdx++) {
            if (subIdx > 0) {
              await sleepWithAbort(200, params.signal);
            }
            const subBlob = await fetchTtsAudioBlobWithWatchdog({
              text: subSegments[subIdx],
              voiceId: synthesisVoice,
              signal: params.signal,
              timeoutMs: 11000,
              maxRetries: 2,
              retryDelayMs: 650,
            });
            if (subBlob && subBlob.size > 0) {
              const subBuf = await subBlob.arrayBuffer();
              if (subBuf.byteLength > 0) {
                audioSegments.push(new Uint8Array(subBuf));
              }
            }
          }
          rescued = true;
        } catch (subErr: any) {
          if (subErr?.name === 'AbortError' || params.signal?.aborted) {
            throw subErr;
          }
        }
      }

      if (!rescued) {
        const endpoints = getOrderedTtsEndpoints().join(', ');
        const detail = primaryErr?.message || 'Không thể kết nối server';
        throw new Error(
          `Lỗi gọi server TTS tại đoạn ${i + 1}/${total}: ${detail} (Đã thử lần lượt: ${endpoints})`
        );
      }
    }

    const percentAfter = Math.max(3, Math.round(((i + 1) / total) * 85));
    params.onProgress?.({
      percent: percentAfter,
      currentChunk: i + 1,
      totalChunks: total,
      label: `Đã xong đoạn ${i + 1}/${total} (${percentAfter}%)`,
    });
  }

  if (audioSegments.length === 0) {
    throw new Error('Lỗi gọi server TTS: Máy chủ không trả về dữ liệu âm thanh cho chương này.');
  }

  params.onProgress?.({
    percent: 87,
    currentChunk: total,
    totalChunks: total,
    label: `Đang ghép nối ${total} đoạn thành file MP3...`,
  });

  return concatMp3Uint8Arrays(audioSegments);
}
