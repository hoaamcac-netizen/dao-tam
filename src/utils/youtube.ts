const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export interface YouTubeExtractResult {
  videoId: string | null;
  error?: string;
}

/**
 * Trích xuất chính xác Video ID (11 ký tự) từ mọi định dạng link chia sẻ YouTube:
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube-nocookie.com/embed/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 * Hoặc nhập trực tiếp Video ID 11 ký tự.
 */
export function extractYouTubeVideoId(rawInput?: string | null): YouTubeExtractResult {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { videoId: null };
  }

  if (YOUTUBE_VIDEO_ID_REGEX.test(trimmed)) {
    return { videoId: trimmed };
  }

  let candidateUrl = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidateUrl)) {
    if (/^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(candidateUrl)) {
      candidateUrl = `https://${candidateUrl}`;
    } else {
      return {
        videoId: null,
        error:
          'Link YouTube không hợp lệ. Vui lòng dán đúng link dạng youtu.be/..., youtube.com/watch?v=..., youtube.com/shorts/... hoặc youtube.com/embed/...',
      };
    }
  }

  try {
    const url = new URL(candidateUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

    if (hostname === 'youtu.be') {
      const seg = url.pathname.split('/').filter(Boolean)[0] || '';
      if (YOUTUBE_VIDEO_ID_REGEX.test(seg)) {
        return { videoId: seg };
      }
      return {
        videoId: null,
        error: 'Không tìm thấy Video ID hợp lệ trong link youtu.be/. Vui lòng kiểm tra lại.',
      };
    }

    if (
      hostname === 'youtube.com' ||
      hostname === 'music.youtube.com' ||
      hostname === 'youtube-nocookie.com'
    ) {
      const vParam = url.searchParams.get('v')?.trim() || '';
      if (YOUTUBE_VIDEO_ID_REGEX.test(vParam)) {
        return { videoId: vParam };
      }

      const pathSegments = url.pathname.split('/').filter(Boolean);
      const markerIndex = pathSegments.findIndex((seg) =>
        ['shorts', 'embed', 'live', 'v', 'e'].includes(seg.toLowerCase())
      );
      if (markerIndex >= 0 && pathSegments[markerIndex + 1]) {
        const candidateId = pathSegments[markerIndex + 1].trim();
        if (YOUTUBE_VIDEO_ID_REGEX.test(candidateId)) {
          return { videoId: candidateId };
        }
      }

      return {
        videoId: null,
        error:
          'Không trích xuất được Video ID từ link YouTube này. Hãy dùng link watch?v=..., youtu.be/..., shorts/... hoặc embed/...',
      };
    }

    return {
      videoId: null,
      error: 'Đường dẫn này không phải link YouTube hợp lệ.',
    };
  } catch {
    return {
      videoId: null,
      error:
        'Định dạng link YouTube không hợp lệ. Vui lòng dán lại link chia sẻ YouTube đầy đủ.',
    };
  }
}

export function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId.trim())}?rel=0&playsinline=1`;
}

export function buildYouTubeShareUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId.trim())}`;
}
