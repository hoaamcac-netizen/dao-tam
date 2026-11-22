import { Chapter, VoiceOption, Novel } from '../types';
import { checkIsAdmin } from '../firebase/config';
import { getTtsEndpointUrl } from './audioChunker';

/**
 * QUY TẮC THIẾT LẬP VIP TỰ ĐỘNG:
 * - Truyện dài trên 200 chương: Set VIP từ chương thứ 51 trở về sau (50c đầu miễn phí).
 * - Truyện ngắn dưới 200 chương: Set VIP từ chương thứ 31 trở về sau (30c đầu miễn phí).
 */
export function calculateChapterVip(chapterNumber: number, totalChapters: number): { isVip: boolean; priceXu: number } {
  const isVip = totalChapters >= 200 ? chapterNumber >= 51 : chapterNumber >= 31;
  return {
    isVip,
    priceXu: isVip ? 5 : 0,
  };
}

/**
 * Chuẩn hóa chuỗi tiếng Việt sang chuẩn Unicode Canonical Composition (NFC).
 * Loại bỏ hoàn toàn lỗi hiển thị dấu rời rạc, dấu huyền/sắc bị tách thành backtick hay khoảng cách.
 */
export function normalizeViText(text?: string | null): string {
  if (!text) return '';
  return text.normalize('NFC');
}

/**
 * Định dạng số Xu theo chuẩn tiền tệ Việt Nam (dùng dấu chấm '.' ngăn cách hàng nghìn, ví dụ: 14.000 xu).
 */
export function formatXu(amount?: number | null): string {
  const num = Number(amount) || 0;
  return num.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

/**
 * TỶ LỆ NHUẬN BÚT / CHIA SẺ DOANH THU VIP:
 * - Tác giả sáng tác (Author): Hưởng 95% (Nền tảng giữ 5%)
 * - Editor độc quyền tại Đạo Tâm: Hưởng 90% (Nền tảng giữ 10%)
 * - Editor không độc quyền: Hưởng 70% (Nền tảng giữ 30%)
 */
export const ROYALTY_RATES = {
  author: 95,
  editorExclusive: 90,
  editorNonExclusive: 70,
  platformShare: {
    author: 5,
    editorExclusive: 10,
    editorNonExclusive: 30,
  },
} as const;

export function getStoryRoyaltyRate(isExclusive?: boolean, isEditorOnly?: boolean): {
  rate: number;
  label: string;
  platformShare: number;
} {
  if (isEditorOnly) {
    if (isExclusive) {
      return {
        rate: 90,
        label: 'Editor Độc Quyền (90% Doanh Thu)',
        platformShare: 10,
      };
    }
    return {
      rate: 70,
      label: 'Editor Không Độc Quyền (70% Doanh Thu)',
      platformShare: 30,
    };
  }
  return {
    rate: 95,
    label: 'Tác Giả Sáng Tác (95% Doanh Thu)',
    platformShare: 5,
  };
}

/**
 * DANH SÁCH GIỌNG ĐỌC MICROSOFT EDGE TTS TIẾNG VIỆT THỰC TẾ
 * Tuyệt đối không bịa giọng ảo, không nhân bản bằng cách chỉnh pitch/rate.
 * Giữ nguyên chất giọng Neural tự nhiên chuẩn bản ngữ:
 * 1. vi-VN-HoaiMyNeural: Giọng Nữ truyền cảm, nhẹ nhàng, tự nhiên.
 * 2. vi-VN-NamMinhNeural: Giọng Nam trầm ấm, đĩnh đạc, chuẩn bản ngữ.
 */
export const EDGE_TTS_VOICES: VoiceOption[] = [
  {
    id: 'vi-VN-HoaiMyNeural',
    shortName: 'vi-VN-HoaiMyNeural',
    name: 'Hoài My',
    tag: 'Giọng Nữ • Miền Nam',
    gender: 'female',
    region: 'Nam',
    locale: 'vi-VN',
    pitch: 1.0,
    rateMultiplier: 1.0,
    sampleText: 'Chào bạn, mình là Hoài My. Chúc bạn có những phút giây nghe truyện thư giãn và thú vị.',
    description: 'Giọng đọc nữ truyền cảm, ngữ điệu tự nhiên, chuẩn bản ngữ tiếng Việt.',
    audioSampleUrl: '/assets/audio/hoai-my.wav',
  },
  {
    id: 'vi-VN-NamMinhNeural',
    shortName: 'vi-VN-NamMinhNeural',
    name: 'Nam Minh',
    tag: 'Giọng Nam • Miền Bắc',
    gender: 'male',
    region: 'Bắc',
    locale: 'vi-VN',
    pitch: 1.0,
    rateMultiplier: 1.0,
    sampleText: 'Tôi là Nam Minh. Mời quý bạn đọc cùng thưởng thức câu chuyện hấp dẫn này.',
    description: 'Giọng đọc nam trầm ấm, đĩnh đạc, ngữ điệu tự nhiên chuẩn bản ngữ.',
    audioSampleUrl: '/assets/audio/nam-minh.wav',
  },
];

// Alias for existing references
export const VOICE_OPTIONS: VoiceOption[] = EDGE_TTS_VOICES;

export const DEVICE_FALLBACK_VOICE_ID = 'device-fallback';

export interface VoiceSelectorOption {
  id: string;
  label: string;
  shortLabel: string;
  subtitle: string;
}

export const VOICE_SELECTOR_OPTIONS: VoiceSelectorOption[] = [
  {
    id: 'vi-VN-NamMinhNeural',
    label: 'Nam Minh',
    shortLabel: 'Nam Minh',
    subtitle: 'Giọng chính - Nam',
  },
  {
    id: 'vi-VN-HoaiMyNeural',
    label: 'Hoài My',
    shortLabel: 'Hoài My',
    subtitle: 'Giọng chính - Nữ',
  },
  {
    id: DEVICE_FALLBACK_VOICE_ID,
    label: 'Dự phòng (Giọng máy)',
    shortLabel: 'Giọng máy',
    subtitle: 'Giọng thiết bị vi-VN, không tốn băng thông',
  },
];

export function isDeviceFallbackVoice(voiceId?: string | null): boolean {
  if (!voiceId) return false;
  const lower = voiceId.trim().toLowerCase();
  return (
    lower === DEVICE_FALLBACK_VOICE_ID ||
    lower === 'browser-speech' ||
    lower === 'device' ||
    lower === 'speechsynthesis'
  );
}

export function getVoiceDisplayMeta(voiceId?: string | null): VoiceSelectorOption {
  const normalized = normalizeEdgeVoiceId(voiceId || undefined);
  return (
    VOICE_SELECTOR_OPTIONS.find((opt) => opt.id === normalized) ||
    VOICE_SELECTOR_OPTIONS[1]
  );
}

/**
 * Chuẩn hóa mã giọng Edge TTS hoặc giữ nguyên giọng dự phòng của thiết bị
 */
export function normalizeEdgeVoiceId(voiceId?: string): string {
  if (!voiceId) return 'vi-VN-HoaiMyNeural';
  if (isDeviceFallbackVoice(voiceId)) {
    return DEVICE_FALLBACK_VOICE_ID;
  }
  const lower = voiceId.toLowerCase();
  if (lower.includes('namminh') || lower === 'nam-minh' || lower.includes('minh-quan')) {
    return 'vi-VN-NamMinhNeural';
  }
  return 'vi-VN-HoaiMyNeural';
}

/**
 * Quét danh sách giọng tiếng Việt khả dụng thực tế từ Edge TTS qua API máy chủ
 */
let dynamicEdgeVoices: VoiceOption[] = [...EDGE_TTS_VOICES];

export async function fetchAvailableEdgeVoices(): Promise<VoiceOption[]> {
  const customTtsUrl = String((import.meta as any)?.env?.VITE_TTS_API_URL || '').trim();
  if (customTtsUrl) {
    return dynamicEdgeVoices;
  }
  try {
    const res = await fetch('/api/tts/voices');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return dynamicEdgeVoices;
    }
    const data = await res.json();
    if (data.success && Array.isArray(data.voices) && (data.voices?.length || 0) > 0) {
      dynamicEdgeVoices = (data.voices || []).map((v: any) => ({
        id: v.shortName || v.id,
        shortName: v.shortName || v.id,
        name: v.name || (v.gender === 'male' ? 'Nam Minh' : 'Hoài My'),
        tag: v.tag || (v.gender === 'male' ? 'Nam • Edge Neural Tự Nhiên' : 'Nữ • Edge Neural Tự Nhiên'),
        gender: v.gender || (v.id.includes('NamMinh') ? 'male' : 'female'),
        locale: v.locale || 'vi-VN',
        pitch: 1.0,
        rateMultiplier: 1.0,
        sampleText: v.sampleText || 'Đây là giọng đọc Edge TTS tự nhiên.',
        description: v.description || 'Giọng đọc Microsoft Edge Neural chuẩn bản ngữ tiếng Việt.',
      }));
      return dynamicEdgeVoices;
    }
  } catch (err) {
    console.warn('Không thể kết nối API quét giọng Edge TTS, sử dụng danh sách chuẩn:', err);
  }
  return dynamicEdgeVoices;
}

export function getLoadedEdgeVoices(): VoiceOption[] {
  return dynamicEdgeVoices;
}

/**
 * Tạo URL luồng âm thanh Edge TTS chất lượng cao
 */
export function getEdgeTtsAudioUrl(text: string, voiceId: string): string {
  const normalizedVoice = normalizeEdgeVoiceId(voiceId);
  const endpoint = getTtsEndpointUrl();
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}text=${encodeURIComponent(text.trim())}&voice=${encodeURIComponent(normalizedVoice)}`;
}

/**
 * Tìm kiếm giọng đọc tiếng Việt tốt nhất trong Web Speech API của thiết bị
 */
let cachedVoices: SpeechSynthesisVoice[] = [];

if (typeof window !== 'undefined' && window.speechSynthesis) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

export function getMatchingBrowserVoice(voiceId: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const freshVoices = window.speechSynthesis.getVoices() || [];
  const voices = freshVoices.length > 0 ? freshVoices : cachedVoices;
  if ((voices?.length || 0) === 0) return null;
  if (freshVoices.length > 0) cachedVoices = freshVoices;

  const targetId = normalizeEdgeVoiceId(voiceId);
  const isFallbackMode = targetId === DEVICE_FALLBACK_VOICE_ID;
  const isMale = targetId === 'vi-VN-NamMinhNeural';

  const viVoices = voices.filter((v) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return lang.startsWith('vi') || lang.includes('vn') || name.includes('vietnam') || name.includes('tiếng việt');
  });

  if (viVoices.length === 0) return null;

  const scoreVoice = (v: SpeechSynthesisVoice): number => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    let score = 0;

    if (lang === 'vi-vn' || lang === 'vi_vn') score += 50;
    else if (lang.startsWith('vi')) score += 30;

    if (name.includes('natural') || name.includes('neural') || name.includes('online')) score += 35;
    if (name.includes('google')) score += 25;
    if (name.includes('microsoft')) score += 20;
    if (name.includes('linh') || name.includes('hoaimy') || name.includes('hoài my') || name.includes('namminh') || name.includes('nam minh') || name.includes('an')) {
      score += 20;
    }

    if (!isFallbackMode) {
      if (isMale && (name.includes('namminh') || name.includes('nam minh') || name.includes('male') || name.includes('nam') || name.includes('an'))) {
        score += 40;
      } else if (!isMale && (name.includes('hoaimy') || name.includes('hoài my') || name.includes('female') || name.includes('linh') || name.includes('mai'))) {
        score += 40;
      }
    }

    if (v.localService) score += 10;
    if (v.default) score += 5;

    return score;
  };

  return [...viVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
}

let activeAudioSample: HTMLAudioElement | null = null;

export function stopVoiceSample() {
  if (activeAudioSample) {
    activeAudioSample.pause();
    activeAudioSample.currentTime = 0;
    activeAudioSample = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Phát thử giọng đọc Edge TTS thực tế (truyền đúng mã voice vi-VN-HoaiMyNeural hoặc vi-VN-NamMinhNeural)
 */
export function playVoiceSample(voiceId: string) {
  if (typeof window === 'undefined') return;
  stopVoiceSample();

  const normalizedVoiceId = normalizeEdgeVoiceId(voiceId);
  const voice = dynamicEdgeVoices.find((v) => v.id === normalizedVoiceId) || dynamicEdgeVoices[0] || EDGE_TTS_VOICES[0];

  // 1. Ưu tiên phát file âm thanh mẫu chuẩn cục bộ (cực nhanh < 0.05s, không bị lag mạng)
  if (voice.audioSampleUrl) {
    try {
      const localAudio = new Audio(voice.audioSampleUrl);
      localAudio.volume = 1.0;
      activeAudioSample = localAudio;
      localAudio.play().then(() => {
        localAudio.onended = () => {
          if (activeAudioSample === localAudio) activeAudioSample = null;
        };
      }).catch(() => {
        // Nếu file cục bộ bị chặn, gọi API Edge TTS trực tuyến
        playOnlineEdgeSample(voice, normalizedVoiceId);
      });
      return;
    } catch (e) {
      console.warn('Lỗi audio cục bộ, chuyển online:', e);
    }
  }

  playOnlineEdgeSample(voice, normalizedVoiceId);
}

function playOnlineEdgeSample(voice: VoiceOption, normalizedVoiceId: string) {
  try {
    const audioUrl = getEdgeTtsAudioUrl(voice.sampleText, normalizedVoiceId);
    const audio = new Audio(audioUrl);
    audio.volume = 1.0;
    activeAudioSample = audio;
    audio.play().then(() => {
      audio.onended = () => {
        if (activeAudioSample === audio) activeAudioSample = null;
      };
    }).catch(() => {
      fallbackSpeechSample(voice);
    });
  } catch (e) {
    fallbackSpeechSample(voice);
  }
}

function fallbackSpeechSample(voice: VoiceOption) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(voice.sampleText);
  utterance.lang = 'vi-VN';
  utterance.pitch = 1.0;
  utterance.rate = 1.0;

  const matched = getMatchingBrowserVoice(voice.id);
  if (matched) {
    utterance.voice = matched;
  }

  window.speechSynthesis.speak(utterance);
}

/**
 * BÓC TÁCH VÀ TẠO CHƯƠNG HÀNG LOẠT (Batch Chapter Parser)
 */
export function parseBatchChapters(
  rawText: string,
  totalExistingChapters: number,
  expectedTotalChapters: number
): Chapter[] {
  if (!rawText.trim()) return [];

  const chapterRegex = /(?:===|\b)(?:Chương|Hồi)\s+(\d+)[:\s.-]*(.*?)(?:===|\n)([\s\S]*?)(?=(?:===|\b)(?:Chương|Hồi)\s+\d+|$)/gi;
  const parsedChapters: Chapter[] = [];
  let match;

  while ((match = chapterRegex.exec(rawText)) !== null) {
    const chapterNum = parseInt(match[1], 10);
    const chapterTitle = match[2]?.trim() || `Diễn biến hồi mục ${chapterNum}`;
    const chapterContent = match[3]?.trim() || 'Nội dung chương đang được cập nhật...';

    const { isVip, priceXu } = calculateChapterVip(chapterNum, expectedTotalChapters);

    parsedChapters.push({
      id: `batch-${chapterNum}-${Date.now()}`,
      number: chapterNum,
      title: `Chương ${chapterNum}: ${chapterTitle}`,
      slug: `chuong-${chapterNum}`,
      content: chapterContent,
      wordCount: chapterContent.split(/\s+/)?.length || 0,
      publishedDate: new Date().toISOString().split('T')[0],
      isVip,
      priceXu,
    });
  }

  if ((parsedChapters?.length || 0) === 0 && (rawText.trim()?.length || 0) > 0) {
    const chapterNum = totalExistingChapters + 1;
    const { isVip, priceXu } = calculateChapterVip(chapterNum, expectedTotalChapters);
    parsedChapters.push({
      id: `batch-${chapterNum}-${Date.now()}`,
      number: chapterNum,
      title: `Chương ${chapterNum}`,
      slug: `chuong-${chapterNum}`,
      content: rawText.trim(),
      wordCount: rawText.trim().split(/\s+/)?.length || 0,
      publishedDate: new Date().toISOString().split('T')[0],
      isVip,
      priceXu,
    });
  }

  return parsedChapters;
}

/**
 * Kiểm tra xem một chương có phải là chương mẫu tự động tạo hay không
 * (Chương 1-5 với tiêu đề mẫu như 'Khởi đầu định mệnh', 'Làn sóng ngầm', 'Cuộc chạm trán', 'Thăm dò và manh mối', 'Quyết định trọng đại')
 */
export function isDummyChapter(ch?: { title?: string; content?: string } | null): boolean {
  if (!ch) return false;
  const t = (ch.title || '').toLowerCase().normalize('NFC');
  const c = (ch.content || '').toLowerCase().normalize('NFC');

  const dummyTitlePatterns = [
    'khởi đầu định mệnh',
    'làn sóng ngầm',
    'cuộc chạm trán bất ngờ',
    'thăm dò và manh mối',
    'thăm dò lẫn nhau',
    'quyết định trọng đại',
    'bước ngoặt nguy nan',
    'bản thảo trích xuất từ tệp',
    'trích đoạn bản thảo',
  ];

  const dummyContentPatterns = [
    'gió thu rít qua khe cửa sổ',
    'tiểu nha hoàn hốt hoảng chạy vào',
    'dưới tàng hoa quế thơm ngát',
    'ngươi thật sự không nhớ gì sao',
    'bức mật thư giấu kín trong hộp gỗ',
  ];

  const hasDummyTitle = dummyTitlePatterns.some((p) => t.includes(p));
  const hasDummyContent = dummyContentPatterns.some((p) => c.includes(p));

  return hasDummyTitle || hasDummyContent;
}

/**
 * Lọc bỏ toàn bộ các chương mẫu tự tạo khỏi danh sách chương
 */
export function filterOutDummyChapters<T extends { title?: string; content?: string }>(chapters: T[]): T[] {
  if (!Array.isArray(chapters)) return [];
  return chapters.filter((c) => !isDummyChapter(c));
}

/**
 * Kiểm tra xem độc giả đã mở khóa chương này chưa
 * Hỗ trợ so khớp đa tầng: Cờ VIP, Quyền Admin, Mua trọn bộ, chapter.id, chapter.number, chapter.slug
 */
export function checkIsChapterUnlocked(
  user: any,
  novelId: string,
  chapter?: { id?: string; number?: number; isVip?: boolean; slug?: string } | null
): boolean {
  if (!chapter) return true;
  if (!chapter.isVip) return true;
  if (!user) return false;

  // 0. Quản trị viên (Admin) có toàn quyền đọc truyện và tự động mở khóa toàn bộ chương VIP
  if (user.role === 'admin' || checkIsAdmin(user.email)) return true;

  const targetNovelId = (novelId || '').trim();
  if (!targetNovelId) return false;

  // 1. Kiểm tra mua trọn bộ qua unlockedFullBooks (so khớp chính xác ID)
  if (Array.isArray(user.unlockedFullBooks)) {
    const isFullUnlocked = user.unlockedFullBooks.some((fb: string) => {
      if (!fb || typeof fb !== 'string') return false;
      const cleanFb = fb.trim().toLowerCase();
      const cleanId = targetNovelId.toLowerCase();
      return cleanFb === cleanId || 
             cleanFb === `story-${cleanId}` || 
             (cleanId.startsWith('story-') && cleanFb === cleanId.replace(/^story-/, ''));
    });
    if (isFullUnlocked) return true;
  }

  // 1b. Kiểm tra mảng purchasedChapters (từ arrayUnion cấp quyền hoặc mua chương/truyện)
  const cleanTargetNovelLower = targetNovelId.toLowerCase();
  const bareTargetNovelLower = cleanTargetNovelLower.replace(/^story-/, '');
  const matchesNovelId = (val: string) => {
    const cleanVal = val.trim().toLowerCase();
    return (
      cleanVal === cleanTargetNovelLower ||
      cleanVal === `story-${bareTargetNovelLower}` ||
      cleanVal === bareTargetNovelLower
    );
  };

  if (Array.isArray(user.purchasedChapters)) {
    const chapIdLower = chapter.id ? chapter.id.toLowerCase() : '';
    const chapSlugLower = chapter.slug ? chapter.slug.toLowerCase() : '';
    const chapNumStr = chapter.number !== undefined ? String(chapter.number) : '';

    const matchedInArray = user.purchasedChapters.some((entry: unknown) => {
      if (typeof entry !== 'string' && typeof entry !== 'number') return false;
      const raw = String(entry).trim();
      if (!raw) return false;
      const lower = raw.toLowerCase();

      // Admin cấp nguyên ID truyện (hoặc novelId:all / novelId:*)
      if (matchesNovelId(lower)) return true;

      const sepMatch = raw.match(/^([^:/|]+)[:/|](.+)$/);
      if (sepMatch) {
        const [, nPart, cPart] = sepMatch;
        if (!matchesNovelId(nPart)) return false;
        const cLower = cPart.trim().toLowerCase();
        if (cLower === 'all' || cLower === '*' || cLower === 'c-all') return true;
        if (chapIdLower && cLower === chapIdLower) return true;
        if (chapSlugLower && cLower === chapSlugLower) return true;
        if (
          chapNumStr &&
          (cLower === chapNumStr ||
            cLower === `c${chapNumStr}` ||
            cLower === `c-${chapNumStr}` ||
            cLower === `chuong-${chapNumStr}`)
        ) {
          return true;
        }
        return false;
      }

      // Admin cấp riêng chapterId hoặc slug
      if (chapIdLower && lower === chapIdLower) return true;
      if (chapSlugLower && lower === chapSlugLower) return true;
      return false;
    });

    if (matchedInArray) return true;
  }

  // Kiểm tra __legacy__ trong unlockedChapters (khi chuỗi trong purchasedChapters không có dấu phân cách)
  const legacyEntries = user.unlockedChapters?.['__legacy__'];
  if (Array.isArray(legacyEntries) && legacyEntries.length > 0) {
    const chapIdLower = chapter.id ? chapter.id.toLowerCase() : '';
    const chapSlugLower = chapter.slug ? chapter.slug.toLowerCase() : '';
    const matchedLegacy = legacyEntries.some((entry: string) => {
      if (!entry || typeof entry !== 'string') return false;
      const lower = entry.trim().toLowerCase();
      if (matchesNovelId(lower)) return true;
      if (chapIdLower && lower === chapIdLower) return true;
      if (chapSlugLower && lower === chapSlugLower) return true;
      return false;
    });
    if (matchedLegacy) return true;
  }

  // 2. Kiểm tra qua lịch sử mua hàng purchases (chống mất quyền truy cập)
  if (Array.isArray(user.purchases)) {
    const hasFullBookPurchase = user.purchases.some((p: any) => {
      if (!p || p.type !== 'full_book' || !p.novelId) return false;
      const cleanPNovel = String(p.novelId).trim().toLowerCase();
      const cleanId = targetNovelId.toLowerCase();
      return cleanPNovel === cleanId || 
             cleanPNovel === `story-${cleanId}` || 
             (cleanId.startsWith('story-') && cleanPNovel === cleanId.replace(/^story-/, ''));
    });
    if (hasFullBookPurchase) return true;

    if (chapter) {
      const hasChapterPurchase = user.purchases.some((p: any) => {
        if (!p || p.type !== 'chapter' || !p.novelId) return false;
        const cleanPNovel = String(p.novelId).trim().toLowerCase();
        const cleanId = targetNovelId.toLowerCase();
        const sameNovel = cleanPNovel === cleanId || 
                          cleanPNovel === `story-${cleanId}` || 
                          (cleanId.startsWith('story-') && cleanPNovel === cleanId.replace(/^story-/, ''));
        if (!sameNovel) return false;
        if (p.chapterId && chapter.id && p.chapterId === chapter.id) return true;
        if (p.chapterNumber !== undefined && chapter.number !== undefined && Number(p.chapterNumber) === Number(chapter.number)) return true;
        return false;
      });
      if (hasChapterPurchase) return true;
    }
  }

  // 3. Kiểm tra danh sách chương mở khóa theo novelId
  const chapsForNovel = user.unlockedChapters?.[targetNovelId] || 
    user.unlockedChapters?.[`story-${targetNovelId}`] ||
    user.unlockedChapters?.[targetNovelId.replace(/^story-/, '')];
    
  if (!Array.isArray(chapsForNovel) || chapsForNovel.length === 0) return false;

  const chapId = chapter.id;
  const chapNum = chapter.number;
  const chapNumStr = chapNum !== undefined ? String(chapNum) : '';
  const chapSlug = chapter.slug || '';

  return chapsForNovel.some((id: string) => {
    if (!id || typeof id !== 'string') return false;
    const cleanId = id.trim().toLowerCase();
    if (cleanId === 'all' || cleanId === '*' || cleanId === 'c-all') return true;
    if (chapId && cleanId === chapId.toLowerCase()) return true;
    if (chapNumStr && (
      cleanId === chapNumStr || 
      cleanId === `c${chapNumStr}` || 
      cleanId === `c-${chapNumStr}` || 
      cleanId === `chuong-${chapNumStr}`
    )) return true;
    if (chapSlug && cleanId === chapSlug.toLowerCase()) return true;
    if (chapNumStr && (
      cleanId.endsWith(`-c${chapNumStr}`) || 
      cleanId.endsWith(`_c${chapNumStr}`) || 
      cleanId.endsWith(`-${chapNumStr}`) || 
      cleanId.endsWith(`chuong-${chapNumStr}`)
    )) return true;
    return false;
  });
}

/**
 * TÍNH TOÁN CHUẨN XÁC CHƯƠNG MỚI NHẤT & TRẠNG THÁI CHO MỌI BỘ TRUYỆN:
 * Áp dụng thống nhất cho toàn bộ hệ thống (Trang chủ, Thẻ truyện, Bảng vàng đề cử, Chi tiết, Sidebar).
 * Không phụ thuộc vào việc mảng chapters trong RAM có bị giới hạn (paging/cache) hay không.
 */
export function getNovelChapterStats(novel?: Partial<Novel> | null): {
  effectiveTotal: number;
  latestChapterTitle: string;
  latestChapterNumber: number;
  isCompleted: boolean;
} {
  if (!novel) {
    return {
      effectiveTotal: 0,
      latestChapterTitle: 'Chương 1',
      latestChapterNumber: 1,
      isCompleted: false,
    };
  }

  const chaptersList = Array.isArray(novel.chapters) ? novel.chapters : [];
  const maxNumberInList = chaptersList.reduce((max, c) => Math.max(max, Number(c?.number) || 0), 0);
  
  const effectiveTotal = (novel.totalChapters !== undefined && Number(novel.totalChapters) > 0)
    ? Number(novel.totalChapters)
    : Math.max(chaptersList?.length || 0, maxNumberInList, Number((novel as any)?.latestChapterNumber) || 0, 1);

  const statusRaw = String(novel.status || '').trim().toLowerCase();
  const isCompleted = statusRaw === 'hoàn thành' || statusRaw === 'full' || statusRaw === 'completed';

  // Tìm chương cao nhất trong mảng chapters nạp sẵn
  const topChapterInList = chaptersList.find((c) => Number(c?.number) === effectiveTotal) ||
    ((chaptersList?.length || 0) > 0 ? chaptersList[(chaptersList?.length || 0) - 1] : null);

  let latestTitle = '';

  const rawLatest = (novel.latestChapterTitle || '').trim();
  const latestTitleNumMatch = rawLatest.match(/^(?:chương|hồi|chapter)\s+(\d+)/i);
  const latestTitleNum = latestTitleNumMatch ? parseInt(latestTitleNumMatch[1], 10) : null;
  const isLatestTitleStale = latestTitleNum !== null && effectiveTotal > 0 && latestTitleNum < effectiveTotal;

  // 1. Ưu tiên tiêu đề chương mới nhất đã lưu trên novel nếu có và không bị cũ hơn tổng số chương
  if (rawLatest !== '' && !isLatestTitleStale) {
    latestTitle = rawLatest;
  }
  // 2. Nếu tìm thấy chương khớp chính xác với effectiveTotal trong mảng và có tiêu đề
  else if (topChapterInList && topChapterInList.title) {
    latestTitle = topChapterInList.title;
  }
  // 3. Mặc định format theo số chương thực tế
  else {
    latestTitle = effectiveTotal > 0 ? `Chương ${effectiveTotal}` : 'Chưa có chương';
  }

  // Đảm bảo tiêu đề luôn có tiền tố Chương nếu chỉ có tên phụ
  if (
    latestTitle &&
    latestTitle !== 'Chưa có chương' &&
    !latestTitle.toLowerCase().startsWith('chương ') &&
    !latestTitle.toLowerCase().startsWith('hồi ')
  ) {
    latestTitle = `Chương ${effectiveTotal || 1}: ${latestTitle}`;
  }

  return {
    effectiveTotal,
    latestChapterTitle: latestTitle,
    latestChapterNumber: Math.max(Number((novel as any)?.latestChapterNumber) || 0, effectiveTotal),
    isCompleted,
  };
}

/**
 * Chuẩn hóa chuỗi tiếng Việt để tìm kiếm không dấu / có dấu / viết hoa / viết thường
 * Hỗ trợ chuyển đ/Đ thành d/D và khử toàn bộ dấu thanh/dấu mũ (Unicode NFD).
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

