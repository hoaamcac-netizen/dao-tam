import { Chapter, VoiceOption, Novel } from '../types';
import { checkIsAdmin } from '../firebase/config';

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
 * DANH SÁCH GIỌNG ĐỌC MP3 CHÍNH THỨC TRÊN ĐẠO TÂM:
 * 1. vi-VN-NamMinhNeural: Giọng Nam Minh (audioUrlMale || audioUrl)
 * 2. vi-VN-HoaiMyNeural: Giọng Hằng Nga (audioUrlFemale)
 */
export const EDGE_TTS_VOICES: VoiceOption[] = [
  {
    id: 'vi-VN-NamMinhNeural',
    shortName: 'vi-VN-NamMinhNeural',
    name: 'Nam Minh',
    tag: 'Giọng Nam • MP3 trực tiếp',
    gender: 'male',
    region: 'Bắc',
    locale: 'vi-VN',
    pitch: 1.0,
    rateMultiplier: 1.0,
    sampleText: 'Tôi là Nam Minh. Mời quý bạn đọc cùng thưởng thức câu chuyện hấp dẫn này.',
    description: 'Giọng đọc nam trầm ấm, đĩnh đạc (phát từ liên kết MP3 trực tiếp).',
    audioSampleUrl: '/assets/audio/nam-minh.wav',
  },
  {
    id: 'vi-VN-HoaiMyNeural',
    shortName: 'vi-VN-HoaiMyNeural',
    name: 'Hằng Nga',
    tag: 'Giọng Nữ • MP3 trực tiếp',
    gender: 'female',
    region: 'Nam',
    locale: 'vi-VN',
    pitch: 1.0,
    rateMultiplier: 1.0,
    sampleText: 'Chào bạn, mình là Hằng Nga. Chúc bạn có những phút giây nghe truyện thư giãn và thú vị.',
    description: 'Giọng đọc nữ truyền cảm, dịu dàng (phát từ liên kết MP3 trực tiếp).',
    audioSampleUrl: '/assets/audio/hoai-my.wav',
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

export const DEVICE_FALLBACK_VOICE_META: VoiceSelectorOption = {
  id: DEVICE_FALLBACK_VOICE_ID,
  label: 'Giọng Máy',
  shortLabel: 'Giọng Máy',
  subtitle: 'Giọng đọc trực tiếp trên thiết bị (tiếng Việt)',
};

export const VOICE_SELECTOR_OPTIONS: VoiceSelectorOption[] = [
  {
    id: 'vi-VN-NamMinhNeural',
    label: 'Nam Minh',
    shortLabel: 'Nam Minh',
    subtitle: 'Giọng Nam • MP3 trực tiếp',
  },
  {
    id: 'vi-VN-HoaiMyNeural',
    label: 'Hằng Nga',
    shortLabel: 'Hằng Nga',
    subtitle: 'Giọng Nữ • MP3 trực tiếp',
  },
  DEVICE_FALLBACK_VOICE_META,
];

export function isDeviceFallbackVoice(voiceId?: string | null): boolean {
  if (!voiceId) return false;
  const lower = voiceId.trim().toLowerCase();
  return (
    lower === DEVICE_FALLBACK_VOICE_ID ||
    lower === 'browser-speech' ||
    lower === 'device' ||
    lower === 'speechsynthesis' ||
    lower === 'google-device'
  );
}

export function getVoiceDisplayMeta(voiceId?: string | null): VoiceSelectorOption {
  const normalized = normalizeEdgeVoiceId(voiceId || undefined);
  if (isDeviceFallbackVoice(normalized)) {
    return DEVICE_FALLBACK_VOICE_META;
  }
  return (
    VOICE_SELECTOR_OPTIONS.find((opt) => opt.id === normalized) ||
    VOICE_SELECTOR_OPTIONS[0]
  );
}

export interface NovelAudioVoiceAvailability {
  hasMaleMp3: boolean;
  hasFemaleMp3: boolean;
  availableVoiceIds: string[];
}

/**
 * Chuẩn hóa ID truyện: cắt bỏ tiền tố thừa `story-` (vd: story-novel-123 -> novel-123)
 */
export function normalizeStoryId(rawId?: string | null): string {
  const trimmed = String(rawId || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/^(story-)+/i, '');
}

function isValidVoiceMp3Url(raw?: string | null): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  return '';
}

/**
 * Helper dùng chung DUY NHẤT cho cả Admin & Trang Đọc để lấy link MP3 theo giọng.
 * - Nam Minh: audioUrlMale -> audioUrl -> mp3Url -> maleAudioUrl -> audio
 * - Hằng Nga: audioUrlFemale -> femaleAudioUrl -> mp3Female
 */
export function getChapterAudioUrl(
  chapter?: Partial<Chapter> | null,
  voice?: string | null
): string {
  if (!chapter) return '';
  const rawVoice = String(voice || '').trim();
  if (rawVoice && isDeviceFallbackVoice(rawVoice)) {
    return '';
  }

  const isFemale =
    rawVoice.toLowerCase() === 'female' ||
    normalizeEdgeVoiceId(rawVoice || undefined) === 'vi-VN-HoaiMyNeural';

  if (isFemale) {
    return (
      isValidVoiceMp3Url(chapter.audioUrlFemale) ||
      isValidVoiceMp3Url(chapter.femaleAudioUrl) ||
      isValidVoiceMp3Url(chapter.mp3Female) ||
      ''
    );
  }

  return (
    isValidVoiceMp3Url(chapter.audioUrlMale) ||
    isValidVoiceMp3Url(chapter.audioUrl) ||
    isValidVoiceMp3Url(chapter.mp3Url) ||
    isValidVoiceMp3Url(chapter.maleAudioUrl) ||
    isValidVoiceMp3Url(chapter.audio) ||
    ''
  );
}

/**
 * Kiểm tra xem bộ truyện (hoặc chương hiện tại) đã có link MP3 cho giọng nào.
 * Giọng nào chưa có bất kỳ link MP3 nào sẽ bị ẩn khỏi menu chọn giọng của người đọc.
 * Giọng Máy luôn khả dụng.
 */
export function getNovelVoiceAvailability(
  novel?: Novel | null,
  extraChapters?: Chapter[] | null,
  currentChapter?: Chapter | null
): NovelAudioVoiceAvailability {
  let hasMaleMp3 = Boolean(novel?.hasMaleAudio);
  let hasFemaleMp3 = Boolean(novel?.hasFemaleAudio);

  if (!hasMaleMp3 || !hasFemaleMp3) {
    const chaptersToScan: Chapter[] = [];
    if (currentChapter) chaptersToScan.push(currentChapter);
    if (Array.isArray(extraChapters)) chaptersToScan.push(...extraChapters);
    if (Array.isArray(novel?.chapters)) chaptersToScan.push(...novel.chapters);

    for (const ch of chaptersToScan) {
      if (!ch) continue;
      if (!hasMaleMp3 && getChapterAudioUrl(ch, 'male')) {
        hasMaleMp3 = true;
      }
      if (!hasFemaleMp3 && getChapterAudioUrl(ch, 'female')) {
        hasFemaleMp3 = true;
      }
      if (hasMaleMp3 && hasFemaleMp3) break;
    }
  }

  const availableVoiceIds: string[] = [];
  if (hasMaleMp3) availableVoiceIds.push('vi-VN-NamMinhNeural');
  if (hasFemaleMp3) availableVoiceIds.push('vi-VN-HoaiMyNeural');
  availableVoiceIds.push(DEVICE_FALLBACK_VOICE_ID);

  return { hasMaleMp3, hasFemaleMp3, availableVoiceIds };
}

/**
 * Chọn giọng phù hợp với dữ liệu MP3 hiện có của bộ truyện:
 * - Nếu người đọc chủ động chọn Giọng Máy Google -> giữ nguyên Giọng Máy Google.
 * - Nếu giọng đang ưu tiên chưa có link MP3 trong bộ truyện -> chuyển sang giọng MP3 còn lại nếu có, hoặc mặc định Giọng Máy Google.
 */
export function resolveEffectiveVoiceForNovel(
  preferredVoiceId: string | null | undefined,
  availability: NovelAudioVoiceAvailability
): string {
  const normalized = normalizeEdgeVoiceId(preferredVoiceId || undefined);
  if (isDeviceFallbackVoice(normalized)) {
    return DEVICE_FALLBACK_VOICE_ID;
  }
  if (normalized === 'vi-VN-HoaiMyNeural') {
    if (availability.hasFemaleMp3) return 'vi-VN-HoaiMyNeural';
    if (availability.hasMaleMp3) return 'vi-VN-NamMinhNeural';
    return DEVICE_FALLBACK_VOICE_ID;
  }
  if (availability.hasMaleMp3) return 'vi-VN-NamMinhNeural';
  if (availability.hasFemaleMp3) return 'vi-VN-HoaiMyNeural';
  return DEVICE_FALLBACK_VOICE_ID;
}

/**
 * Chuẩn hóa mã giọng đọc (mặc định Nam Minh để tương thích liên kết MP3 cũ & mới)
 */
export function normalizeEdgeVoiceId(voiceId?: string): string {
  if (!voiceId) return 'vi-VN-NamMinhNeural';
  if (isDeviceFallbackVoice(voiceId)) {
    return DEVICE_FALLBACK_VOICE_ID;
  }
  const lower = voiceId.toLowerCase();
  if (
    lower.includes('hoaimy') ||
    lower.includes('hoài my') ||
    lower.includes('hang-nga') ||
    lower.includes('hangnga') ||
    lower.includes('hằng nga') ||
    lower === 'female'
  ) {
    return 'vi-VN-HoaiMyNeural';
  }
  return 'vi-VN-NamMinhNeural';
}

const dynamicEdgeVoices: VoiceOption[] = [...EDGE_TTS_VOICES];

export async function fetchAvailableEdgeVoices(): Promise<VoiceOption[]> {
  return [...dynamicEdgeVoices];
}

export function getLoadedEdgeVoices(): VoiceOption[] {
  return dynamicEdgeVoices;
}

/**
 * Tìm kiếm giọng đọc tiếng Việt NỮ tốt nhất trong Web Speech API của thiết bị
 * (Ưu tiên 1: Google Tiếng Việt / Google Vietnamese; Ưu tiên 2: HoaiMy, Linh, Female, Nữ, gft, vie;
 * Loại trừ giọng nam: An, NamMinh, Male, Nam, vid trừ khi không còn giọng nào khác).
 */
let cachedVoices: SpeechSynthesisVoice[] = [];
const browserVoiceChangeListeners = new Set<() => void>();

function notifyBrowserVoiceChangeListeners() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    const latest = window.speechSynthesis.getVoices() || [];
    if (latest.length > 0) {
      cachedVoices = latest;
    }
  }
  browserVoiceChangeListeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  cachedVoices = window.speechSynthesis.getVoices() || [];
  try {
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', notifyBrowserVoiceChangeListeners);
    } else {
      window.speechSynthesis.onvoiceschanged = notifyBrowserVoiceChangeListeners;
    }
  } catch {
    window.speechSynthesis.onvoiceschanged = notifyBrowserVoiceChangeListeners;
  }
}

export function subscribeBrowserVoicesChanged(listener: () => void): () => void {
  browserVoiceChangeListeners.add(listener);
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.onvoiceschanged = notifyBrowserVoiceChangeListeners;
    } catch {}
  }
  return () => {
    browserVoiceChangeListeners.delete(listener);
  };
}

function tokenizeBrowserVoiceText(text: string): string[] {
  return (text || '')
    .normalize('NFC')
    .toLowerCase()
    .split(/[^a-z0-9àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]+/i)
    .filter(Boolean);
}

function isMaleVietnameseBrowserVoice(v: SpeechSynthesisVoice): boolean {
  const rawName = (v.name || '').normalize('NFC').toLowerCase();
  const rawUri = (v.voiceURI || '').normalize('NFC').toLowerCase();
  if (
    rawName.includes('namminh') ||
    rawName.includes('nam minh') ||
    rawUri.includes('namminh')
  ) {
    return true;
  }
  const allTokens = new Set([
    ...tokenizeBrowserVoiceText(rawName),
    ...tokenizeBrowserVoiceText(rawUri),
  ]);
  return (
    allTokens.has('an') ||
    allTokens.has('namminh') ||
    allTokens.has('male') ||
    allTokens.has('nam') ||
    allTokens.has('vid')
  );
}

export function getMatchingBrowserVoice(_voiceId?: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const freshVoices = window.speechSynthesis.getVoices() || [];
  const voices = freshVoices.length > 0 ? freshVoices : cachedVoices;
  if ((voices?.length || 0) === 0) return null;
  if (freshVoices.length > 0) cachedVoices = freshVoices;

  const viVoices = voices.filter((v) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').normalize('NFC').toLowerCase();
    return (
      lang.includes('vi') ||
      lang.includes('vn') ||
      name.includes('vietnam') ||
      name.includes('việt') ||
      name.includes('tiếng việt')
    );
  });

  if (viVoices.length === 0) return null;

  // Loại trừ các giọng nam; chỉ fallback sang giọng nam nếu thiết bị hoàn toàn không có giọng nữ nào khác
  const nonMaleViVoices = viVoices.filter((v) => !isMaleVietnameseBrowserVoice(v));
  const candidateVoices = nonMaleViVoices.length > 0 ? nonMaleViVoices : viVoices;

  const scoreFemaleVoice = (v: SpeechSynthesisVoice): number => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').normalize('NFC').toLowerCase();
    const uri = (v.voiceURI || '').normalize('NFC').toLowerCase();
    const tokens = new Set([
      ...tokenizeBrowserVoiceText(name),
      ...tokenizeBrowserVoiceText(uri),
    ]);
    let score = 0;

    // Ưu tiên 1: Google Tiếng Việt / Google Vietnamese
    if (
      name === 'google tiếng việt' ||
      name === 'google vietnamese' ||
      name.includes('google tiếng việt') ||
      name.includes('google vietnamese') ||
      uri.includes('google tiếng việt') ||
      uri.includes('google vietnamese')
    ) {
      score += 1000;
    }

    // Ưu tiên 2: Các giọng nữ tiếng Việt phổ biến (HoaiMy, Linh, Female, Nữ, gft, vie)
    if (
      name.includes('hoaimy') ||
      name.includes('hoài my') ||
      uri.includes('hoaimy') ||
      tokens.has('hoaimy') ||
      tokens.has('linh') ||
      tokens.has('female') ||
      tokens.has('nữ') ||
      tokens.has('gft') ||
      tokens.has('vie')
    ) {
      score += 350;
    }

    if (name.includes('google')) score += 150;
    if (lang === 'vi-vn' || lang === 'vi_vn') score += 50;
    else if (lang.includes('vi')) score += 30;

    if (name.includes('natural') || name.includes('neural') || name.includes('online')) score += 25;
    if (name.includes('microsoft')) score += 10;
    if (v.localService) score += 5;
    if (v.default) score += 5;

    return score;
  };

  return [...candidateVoices].sort((a, b) => scoreFemaleVoice(b) - scoreFemaleVoice(a))[0] || null;
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

function playBrowserSpeechSample(sampleText: string, voiceId: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.lang = 'vi-VN';
    const matched = getMatchingBrowserVoice(voiceId);
    if (matched) utterance.voice = matched;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

/**
 * Phát thử giọng đọc (ưu tiên file mẫu cục bộ, dự phòng qua giọng đọc thiết bị)
 */
export function playVoiceSample(voiceId: string) {
  if (typeof window === 'undefined') return;
  stopVoiceSample();

  const normalizedVoiceId = normalizeEdgeVoiceId(voiceId);
  if (isDeviceFallbackVoice(normalizedVoiceId)) {
    playBrowserSpeechSample(
      'Xin chào, đây là giọng đọc trực tiếp trên thiết bị của bạn.',
      normalizedVoiceId
    );
    return;
  }

  const voice =
    dynamicEdgeVoices.find((v) => v.id === normalizedVoiceId) ||
    dynamicEdgeVoices[0] ||
    EDGE_TTS_VOICES[0];

  if (voice.audioSampleUrl) {
    try {
      const localAudio = new Audio(voice.audioSampleUrl);
      localAudio.volume = 1.0;
      activeAudioSample = localAudio;
      localAudio
        .play()
        .then(() => {
          localAudio.onended = () => {
            if (activeAudioSample === localAudio) activeAudioSample = null;
          };
        })
        .catch(() => {
          playBrowserSpeechSample(voice.sampleText, normalizedVoiceId);
        });
      return;
    } catch {
      playBrowserSpeechSample(voice.sampleText, normalizedVoiceId);
      return;
    }
  }

  playBrowserSpeechSample(voice.sampleText, normalizedVoiceId);
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
  const publicChaptersList = chaptersList.filter(
    (c) => !c?.isHidden && !isChapterScheduledPending(c)
  );
  const hasLoadedChapters = chaptersList.length > 0;
  const maxNumberInPublic = publicChaptersList.reduce(
    (max, c) => Math.max(max, Number(c?.number) || 0),
    0
  );

  const effectiveTotal = hasLoadedChapters
    ? Math.max(publicChaptersList.length, maxNumberInPublic)
    : novel.totalChapters !== undefined && Number(novel.totalChapters) > 0
    ? Number(novel.totalChapters)
    : Math.max(Number((novel as any)?.latestChapterNumber) || 0, 0);

  const statusRaw = String(novel.status || '').trim().toLowerCase();
  const isCompleted = statusRaw === 'hoàn thành' || statusRaw === 'full' || statusRaw === 'completed';

  // Tìm chương cao nhất ĐÃ PHÁT HÀNH trong mảng chapters nạp sẵn
  const topChapterInList =
    publicChaptersList.find((c) => Number(c?.number) === effectiveTotal) ||
    (publicChaptersList.length > 0 ? publicChaptersList[publicChaptersList.length - 1] : null);

  let latestTitle = '';

  const rawLatest = (novel.latestChapterTitle || '').trim();
  const latestTitleNumMatch = rawLatest.match(/^(?:chương|hồi|chapter)\s+(\d+)/i);
  const latestTitleNum = latestTitleNumMatch ? parseInt(latestTitleNumMatch[1], 10) : null;
  const isLatestTitleStale =
    latestTitleNum !== null && effectiveTotal > 0 && latestTitleNum < effectiveTotal;
  const isLatestTitleAheadOfPublic =
    hasLoadedChapters &&
    latestTitleNum !== null &&
    (publicChaptersList.length === 0 || latestTitleNum > maxNumberInPublic);

  // 1. Nếu đã nạp danh sách chương, ưu tiên chương mới nhất đã phát hành thực tế
  if (hasLoadedChapters && topChapterInList && topChapterInList.title) {
    latestTitle = topChapterInList.title;
  }
  // 2. Ưu tiên tiêu đề chương mới nhất đã lưu trên novel nếu không bị cũ hoặc vượt quá chương đã phát hành
  else if (rawLatest !== '' && !isLatestTitleStale && !isLatestTitleAheadOfPublic) {
    latestTitle = rawLatest;
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
    latestTitle = `Chương ${topChapterInList?.number || effectiveTotal || 1}: ${latestTitle}`;
  }

  return {
    effectiveTotal,
    latestChapterTitle: latestTitle,
    latestChapterNumber: hasLoadedChapters
      ? Number(topChapterInList?.number || effectiveTotal || 0)
      : Math.max(Number((novel as any)?.latestChapterNumber) || 0, effectiveTotal),
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

/**
 * Trả về mốc thời gian hẹn giờ xuất bản (epoch ms) của chương nếu có (hỗ trợ cả publishAt và scheduledPublishAt).
 */
export function getChapterPublishAt(chapter?: Partial<Chapter> | null): number | undefined {
  if (!chapter) return undefined;
  const raw = chapter.publishAt ?? chapter.scheduledPublishAt;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return undefined;
}

/**
 * Kiểm tra xem chương có đang ở trạng thái chờ hẹn giờ xuất bản hay không.
 */
export function isChapterScheduledPending(
  chapter?: Partial<Chapter> | null,
  nowMs: number = Date.now()
): boolean {
  const pubAt = getChapterPublishAt(chapter);
  return typeof pubAt === 'number' && pubAt > nowMs;
}

/**
 * Kiểm tra xem chương có được phép hiển thị cho độc giả thường hay không:
 * - Tác giả / Editor sở hữu truyện hoặc Admin luôn thấy mọi chương.
 * - Độc giả thường: ẩn chương có isHidden === true hoặc publishAt > Date.now().
 */
export function isChapterVisibleToReader(
  chapter?: Partial<Chapter> | null,
  isOwnerOrAdmin: boolean = false,
  nowMs: number = Date.now()
): boolean {
  if (!chapter) return false;
  if (isOwnerOrAdmin) return true;
  if (chapter.isHidden) return false;
  return !isChapterScheduledPending(chapter, nowMs);
}

/**
 * Kiểm tra quyền Admin hoặc Chủ sở hữu (Tác giả / Editor / Người gửi truyện).
 */
export function isUserOwnerOrAdmin(user: any, novel?: Partial<Novel> | null): boolean {
  if (!user) return false;
  if (user.role === 'admin' || checkIsAdmin(user.email)) return true;
  if (!novel) return false;

  const userId = user.id && user.id !== 'guest' ? String(user.id).trim() : '';
  const userEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  const userName = typeof user.displayName === 'string' ? user.displayName.trim().toLowerCase() : '';

  if (
    userId &&
    ((novel as any).authorId === userId || novel.submittedBy?.userId === userId)
  ) {
    return true;
  }
  if (
    userEmail &&
    ((novel as any).authorEmail?.toLowerCase?.().trim() === userEmail ||
      novel.submittedBy?.userEmail?.toLowerCase?.().trim() === userEmail)
  ) {
    return true;
  }
  if (
    userName &&
    (novel.author?.trim().toLowerCase() === userName ||
      novel.editor?.trim().toLowerCase() === userName ||
      novel.submittedBy?.userName?.trim().toLowerCase() === userName)
  ) {
    return true;
  }
  return false;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Định dạng ngắn: DD/MM HH:mm
 */
export function formatScheduleShort(ms?: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Định dạng đầy đủ: DD/MM/YYYY HH:mm
 */
export function formatScheduleFull(ms?: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Chuyển timestamp ms sang chuỗi YYYY-MM-DDTHH:mm cho input datetime-local (giờ địa phương).
 */
export function toDatetimeLocalInput(ms?: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Chuyển chuỗi YYYY-MM-DDTHH:mm từ input datetime-local sang timestamp ms.
 */
export function fromDatetimeLocalInput(val?: string | null): number | undefined {
  if (!val || typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Đếm số chương đã gắn MP3 theo từng giọng từ mảng chapters trong RAM (0 Firestore Reads).
 */
export function computeChapterAudioCounts(
  chapters?: Array<Partial<Chapter>> | null
): {
  mp3NamMinhCount: number;
  mp3HangNgaCount: number;
  hasMaleAudio: boolean;
  hasFemaleAudio: boolean;
  hasAudio: boolean;
} {
  let mp3NamMinhCount = 0;
  let mp3HangNgaCount = 0;
  if (Array.isArray(chapters)) {
    for (const ch of chapters) {
      if (!ch) continue;
      if (getChapterAudioUrl(ch, 'male')) mp3NamMinhCount += 1;
      if (getChapterAudioUrl(ch, 'female')) mp3HangNgaCount += 1;
    }
  }
  const hasMaleAudio = mp3NamMinhCount > 0;
  const hasFemaleAudio = mp3HangNgaCount > 0;
  return {
    mp3NamMinhCount,
    mp3HangNgaCount,
    hasMaleAudio,
    hasFemaleAudio,
    hasAudio: hasMaleAudio || hasFemaleAudio,
  };
}

/**
 * Lấy mốc latestPublishAt cao nhất của bộ truyện (ưu tiên từ root doc hoặc quét chapters sẵn có, 0 Reads).
 */
export function getNovelLatestPublishAt(
  novel?: Partial<Novel> | null,
  extraChapters?: Array<Partial<Chapter>> | null
): number {
  let maxTs =
    typeof novel?.latestPublishAt === 'number' && Number.isFinite(novel.latestPublishAt)
      ? novel.latestPublishAt
      : 0;
  const scan = (list?: Array<Partial<Chapter>> | null) => {
    if (!Array.isArray(list)) return;
    for (const ch of list) {
      const pubAt = getChapterPublishAt(ch);
      if (typeof pubAt === 'number' && pubAt > maxTs) {
        maxTs = pubAt;
      }
    }
  };
  scan(novel?.chapters);
  scan(extraChapters);
  return maxTs;
}

/**
 * Lấy thống kê trạng thái MP3 của 1 truyện từ root metadata (0 Firestore Reads).
 */
export function getNovelMp3Counts(novel?: Partial<Novel> | null): {
  totalChapters: number;
  namMinhCount: number;
  hangNgaCount: number;
} {
  const chaps = Array.isArray(novel?.chapters) ? novel.chapters : [];
  const totalChapters = Math.max(Number(novel?.totalChapters || 0), chaps.length);

  let namMinhCount = 0;
  if (typeof novel?.mp3NamMinhCount === 'number' && Number.isFinite(novel.mp3NamMinhCount)) {
    namMinhCount = Math.max(0, novel.mp3NamMinhCount);
  } else if (chaps.length > 0) {
    namMinhCount = computeChapterAudioCounts(chaps).mp3NamMinhCount;
  }

  let hangNgaCount = 0;
  if (typeof novel?.mp3HangNgaCount === 'number' && Number.isFinite(novel.mp3HangNgaCount)) {
    hangNgaCount = Math.max(0, novel.mp3HangNgaCount);
  } else if (chaps.length > 0) {
    hangNgaCount = computeChapterAudioCounts(chaps).mp3HangNgaCount;
  }

  return {
    totalChapters,
    namMinhCount,
    hangNgaCount,
  };
}


