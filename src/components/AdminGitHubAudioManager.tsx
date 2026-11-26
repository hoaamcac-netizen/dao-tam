import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chapter, Novel } from '../types';
import {
  fetchChaptersForNovel,
  updateChapterAudioUrlInFirestore,
  batchUpdateChapterAudioLinksInFirestore,
  ensureNovelAudioVoiceFlagInFirestore,
  syncNovelMp3CountsInFirestore,
  type ChapterAudioLinkBatchItem,
} from '../firebase/services';
import {
  removeVietnameseTones,
  getChapterAudioUrl,
  computeChapterAudioCounts,
  getChapterPublishAt,
  isChapterScheduledPending,
  formatScheduleShort,
} from '../utils/rulesAndVoices';
import { sanitizeUserFacingErrorText } from '../utils/audioChunker';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Volume2,
  Pause,
  Trash2,
  Loader2,
  X,
  Search,
  Headphones,
  ExternalLink,
  Link2,
  ClipboardPaste,
  Download,
  ShieldCheck,
  UserRound,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Edit3,
  Clock,
} from 'lucide-react';

const CHAPTERS_PER_PAGE = 100;
const LINK_PROBE_BATCH_SIZE = 4; // Kiểm tra từng đợt 3–5 link một lúc
const LINK_PROBE_BATCH_DELAY_MS = 200;
const LINK_PROBE_TIMEOUT_MS = 8000; // 8 giây timeout -> Link lỗi

type VoiceKey = 'male' | 'female';
type DeleteVoiceScope = 'male' | 'female' | 'both';
type VoiceFilterMode =
  | 'all'
  | 'missing_male'
  | 'missing_female'
  | 'both_ready'
  | 'broken'
  | 'duplicate';

export type BrokenReason = string;

export interface BrokenVoiceState {
  // Link lỗi (không phát được / sai định dạng)
  male?: boolean;
  female?: boolean;
  maleLive?: boolean;
  femaleLive?: boolean;
  maleChecking?: boolean;
  femaleChecking?: boolean;
  maleReason?: BrokenReason;
  femaleReason?: BrokenReason;
  // Link trùng (bị lặp ở chương khác) — tách biệt hoàn toàn với Link lỗi
  maleDuplicate?: boolean;
  femaleDuplicate?: boolean;
  maleDuplicateReason?: string;
  femaleDuplicateReason?: string;
}

interface IssueLinkEntry {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  voice: VoiceKey;
  voiceLabel: string;
  url: string;
  reason?: string;
}

export interface UpdatedAudioLinksPayload {
  audioUrl?: string;
  audioUrlMale?: string;
  audioUrlFemale?: string;
  mp3Url?: string;
  maleAudioUrl?: string;
  audio?: string;
  femaleAudioUrl?: string;
  mp3Female?: string;
}

function extractChapterNumberFromTitle(title?: string | null): number | null {
  if (!title || typeof title !== 'string') return null;
  const normalized = title.normalize('NFC').trim();
  const match = normalized.match(/(?:chương|chuong|hồi|hoi|chapter)\s*0*(\d+)/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function resolveChapterNumber(chapter?: Partial<Chapter> | null): number {
  if (!chapter) return 0;
  const rawNum = Number(chapter.number);
  if (Number.isFinite(rawNum) && rawNum > 0) {
    return Math.floor(rawNum);
  }
  const fromTitle = extractChapterNumberFromTitle(chapter.title);
  if (fromTitle !== null) return fromTitle;
  const idStr = String(chapter.id || '').trim();
  const idMatch = idStr.match(/(?:^|[-_])(?:c|chuong|ch)?0*(\d+)$/i);
  if (idMatch) {
    const parsed = parseInt(idMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function sortChaptersNaturally(list: Chapter[]): Chapter[] {
  return [...(list || [])].sort((a, b) => {
    const numA = resolveChapterNumber(a);
    const numB = resolveChapterNumber(b);
    if (numA !== numB) return numA - numB;
    return String(a.title || a.id || '').localeCompare(String(b.title || b.id || ''), 'vi', {
      numeric: true,
    });
  });
}

function buildVoiceOverwriteLinks(
  chapter: Chapter,
  voice: VoiceKey,
  newUrl?: string
): UpdatedAudioLinksPayload {
  const cleanUrl = typeof newUrl === 'string' && newUrl.trim() ? newUrl.trim() : undefined;
  if (voice === 'male') {
    return {
      audioUrl: cleanUrl,
      audioUrlMale: cleanUrl,
      mp3Url: undefined,
      maleAudioUrl: undefined,
      audio: undefined,
      audioUrlFemale: chapter.audioUrlFemale,
      femaleAudioUrl: chapter.femaleAudioUrl,
      mp3Female: chapter.mp3Female,
    };
  }
  return {
    audioUrl: chapter.audioUrl,
    audioUrlMale: chapter.audioUrlMale,
    mp3Url: chapter.mp3Url,
    maleAudioUrl: chapter.maleAudioUrl,
    audio: chapter.audio,
    audioUrlFemale: cleanUrl,
    femaleAudioUrl: undefined,
    mp3Female: undefined,
  };
}

function getMaleAudioUrl(chapter: Chapter): string {
  return getChapterAudioUrl(chapter, 'male');
}

function getFemaleAudioUrl(chapter: Chapter): string {
  return getChapterAudioUrl(chapter, 'female');
}

function getRawVoiceUrl(chapter: Chapter, voice: VoiceKey): string {
  const candidates =
    voice === 'female'
      ? [chapter.audioUrlFemale, chapter.femaleAudioUrl, chapter.mp3Female]
      : [
          chapter.audioUrlMale,
          chapter.audioUrl,
          chapter.mp3Url,
          chapter.maleAudioUrl,
          chapter.audio,
        ];
  for (const val of candidates) {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupAudioElement(audio: HTMLAudioElement | null | undefined) {
  if (!audio) return;
  audio.onloadedmetadata = null;
  audio.oncanplay = null;
  audio.onerror = null;
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.src = '';
    audio.load();
  } catch {}
}

/**
 * Kiểm tra link MP3 bằng thẻ <audio> ẩn (preload="metadata") — tuyệt đối không dùng fetch() để tránh lỗi ảo CORS.
 * - Sự kiện `loadedmetadata` -> Link sống
 * - Sự kiện `error` hoặc quá 8 giây timeout -> Link lỗi (không phát được)
 */
function probeAudioMetadataOnce(
  url: string,
  timeoutMs = LINK_PROBE_TIMEOUT_MS,
  shouldAbort?: () => boolean,
  activeAudiosSet?: Set<HTMLAudioElement>
): Promise<{ ok: boolean; reason?: BrokenReason; cancelled?: boolean }> {
  return new Promise((resolve) => {
    if (shouldAbort?.()) {
      resolve({ ok: false, cancelled: true });
      return;
    }

    const trimmed = url.trim();
    if (!isValidHttpUrl(trimmed)) {
      resolve({ ok: false, reason: 'Sai định dạng link' });
      return;
    }

    let settled = false;
    const probe = document.createElement('audio');
    probe.style.display = 'none';
    probe.removeAttribute('crossorigin');
    probe.preload = 'metadata';
    activeAudiosSet?.add(probe);

    const onLoadedMetadata = () => finish(true);
    const onError = () => {
      if (shouldAbort?.()) {
        finish(false, undefined, true);
      } else {
        finish(false, 'Link lỗi (không phát được)');
      }
    };

    const finish = (ok: boolean, reason?: BrokenReason, cancelled?: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      probe.removeEventListener('loadedmetadata', onLoadedMetadata);
      probe.removeEventListener('error', onError);
      activeAudiosSet?.delete(probe);
      cleanupAudioElement(probe);
      resolve(
        cancelled ? { ok: false, cancelled: true } : ok ? { ok: true } : { ok: false, reason }
      );
    };

    const timer = setTimeout(() => {
      if (shouldAbort?.()) {
        finish(false, undefined, true);
      } else {
        finish(false, 'Link lỗi (quá thời gian 8s)');
      }
    }, timeoutMs);

    probe.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    probe.addEventListener('error', onError, { once: true });

    try {
      probe.src = trimmed;
      probe.load();
    } catch {
      finish(false, 'Link lỗi (không phát được)');
    }
  });
}

function sanitizeDownloadFilename(title: string): string {
  const noTones = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
  const cleaned = noTones
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return cleaned || 'TruyenDaoTam';
}

interface AdminChapterMp3ActionsProps {
  novel: Novel;
  chapter: Chapter;
  disabledExternally?: boolean;
  brokenVoices?: BrokenVoiceState;
  externalEditRequest?: { chapterId: string; voice: VoiceKey; nonce: number } | null;
  onAudioLinksUpdated: (chapter: Chapter, links: UpdatedAudioLinksPayload) => void;
  onSingleLinkSaved?: (updatedChapter: Chapter, voice: VoiceKey, newUrl: string) => void;
  onMarkVoiceLive?: (chapterId: string, voice: VoiceKey) => void;
  onClearBrokenFlag?: (chapterId: string, voice: VoiceKey) => void;
}

export const AdminChapterMp3Actions: React.FC<AdminChapterMp3ActionsProps> = ({
  novel,
  chapter,
  disabledExternally = false,
  brokenVoices,
  externalEditRequest,
  onAudioLinksUpdated,
  onSingleLinkSaved,
  onMarkVoiceLive,
  onClearBrokenFlag,
}) => {
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const activePreviewVoiceRef = useRef<VoiceKey | null>(null);
  const activePreviewUrlRef = useRef<string>('');
  const confirmedVoiceFlagKeysRef = useRef<Set<string>>(new Set());
  const isUnmountedRef = useRef<boolean>(false);
  const standaloneProbeAudiosRef = useRef<Set<HTMLAudioElement>>(new Set());

  const [isBusy, setIsBusy] = useState(false);
  const [editingVoice, setEditingVoice] = useState<VoiceKey | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [previewVoice, setPreviewVoice] = useState<VoiceKey | null>(null);
  const [confirmClearVoice, setConfirmClearVoice] = useState<VoiceKey | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [standaloneVoiceState, setStandaloneVoiceState] = useState<BrokenVoiceState>({});

  const effectiveVoiceState = brokenVoices ?? standaloneVoiceState;

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      activePreviewVoiceRef.current = null;
      activePreviewUrlRef.current = '';
      standaloneProbeAudiosRef.current.forEach((a) => cleanupAudioElement(a));
      standaloneProbeAudiosRef.current.clear();
      if (previewAudioRef.current) {
        previewAudioRef.current.onended = null;
        previewAudioRef.current.onerror = null;
        previewAudioRef.current.onplaying = null;
        previewAudioRef.current.oncanplay = null;
        cleanupAudioElement(previewAudioRef.current);
        previewAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!externalEditRequest || externalEditRequest.chapterId !== chapter.id) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingVoice(externalEditRequest.voice);
    setLinkInput(getRawVoiceUrl(chapter, externalEditRequest.voice));
  }, [externalEditRequest, chapter]);

  const maleUrl = getMaleAudioUrl(chapter);
  const femaleUrl = getFemaleAudioUrl(chapter);
  const rawMaleUrl = getRawVoiceUrl(chapter, 'male');
  const rawFemaleUrl = getRawVoiceUrl(chapter, 'female');
  const missingVoices: string[] = [];
  if (!rawMaleUrl) missingVoices.push('Nam Minh');
  if (!rawFemaleUrl) missingVoices.push('Hằng Nga');

  const actionsDisabled = isBusy || disabledExternally;

  const stopPreview = () => {
    activePreviewVoiceRef.current = null;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewVoice(null);
  };

  const confirmPreviewSuccessForVoice = (voice: VoiceKey, cleanUrl: string) => {
    if (onMarkVoiceLive) {
      onMarkVoiceLive(chapter.id, voice);
    } else {
      onClearBrokenFlag?.(chapter.id, voice);
      setStandaloneVoiceState((prev) => ({
        ...prev,
        [voice]: false,
        [voice === 'male' ? 'maleLive' : 'femaleLive']: true,
        [voice === 'male' ? 'maleChecking' : 'femaleChecking']: false,
        [voice === 'male' ? 'maleReason' : 'femaleReason']: undefined,
      }));
    }
    const sessionFlagKey = `${novel.id}::${voice}`;
    const alreadyFlaggedOnNovel =
      voice === 'male' ? Boolean(novel.hasMaleAudio) : Boolean(novel.hasFemaleAudio);
    if (!confirmedVoiceFlagKeysRef.current.has(sessionFlagKey)) {
      confirmedVoiceFlagKeysRef.current.add(sessionFlagKey);
      if (!alreadyFlaggedOnNovel) {
        ensureNovelAudioVoiceFlagInFirestore(novel.id, voice).catch(() => {});
      }
      onAudioLinksUpdated(chapter, {
        audioUrl: voice === 'male' ? chapter.audioUrl || cleanUrl : chapter.audioUrl,
        audioUrlMale:
          voice === 'male' ? chapter.audioUrlMale || cleanUrl : chapter.audioUrlMale,
        audioUrlFemale:
          voice === 'female' ? chapter.audioUrlFemale || cleanUrl : chapter.audioUrlFemale,
        mp3Url: chapter.mp3Url,
        maleAudioUrl: chapter.maleAudioUrl,
        audio: chapter.audio,
        femaleAudioUrl: chapter.femaleAudioUrl,
        mp3Female: chapter.mp3Female,
      });
    }
  };

  const handleTogglePreview = (voice: VoiceKey, url: string) => {
    const cleanUrl = (url || '').trim();
    if (!cleanUrl) return;

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.removeAttribute('crossorigin');
    }

    const audioEl = previewAudioRef.current;
    audioEl.removeAttribute('crossorigin');
    audioEl.onended = () => setPreviewVoice(null);
    audioEl.oncanplay = () => {
      const v = activePreviewVoiceRef.current;
      const u = activePreviewUrlRef.current;
      if (v && u) {
        confirmPreviewSuccessForVoice(v, u);
      }
    };
    audioEl.onplaying = () => {
      const v = activePreviewVoiceRef.current;
      const u = activePreviewUrlRef.current;
      if (v) {
        setPreviewVoice(v);
        if (u) {
          confirmPreviewSuccessForVoice(v, u);
        }
      }
    };
    audioEl.onerror = () => {
      const v = activePreviewVoiceRef.current || voice;
      setPreviewVoice(null);
      setErrorMsg(
        `Không phát được file MP3 (${v === 'male' ? 'Nam Minh' : 'Hằng Nga'}). Vui lòng kiểm tra lại đường dẫn.`
      );
    };

    if (previewVoice === voice) {
      audioEl.pause();
      activePreviewVoiceRef.current = null;
      setPreviewVoice(null);
      return;
    }

    activePreviewVoiceRef.current = voice;
    activePreviewUrlRef.current = cleanUrl;
    setErrorMsg(null);
    audioEl.pause();
    audioEl.src = cleanUrl;
    audioEl.load();
    audioEl
      .play()
      .then(() => {
        setPreviewVoice(voice);
        confirmPreviewSuccessForVoice(voice, cleanUrl);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || /AbortError|interrupted/i.test(String(err?.message || ''))) {
          return;
        }
        setPreviewVoice(null);
        setErrorMsg(`Không thể nghe thử: ${err?.message || 'Đường dẫn chưa sẵn sàng'}`);
      });
  };

  const openEditorForVoice = (voice: VoiceKey) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingVoice(voice);
    setLinkInput(voice === 'male' ? rawMaleUrl : rawFemaleUrl);
  };

  const handleSaveSingleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVoice) return;
    const trimmed = linkInput.trim();
    if (!isValidHttpUrl(trimmed)) {
      setErrorMsg('Sai định dạng: Vui lòng nhập đường dẫn bắt đầu bằng http:// hoặc https://');
      return;
    }

    const targetVoice = editingVoice;
    const hadPreviousLink = Boolean(
      targetVoice === 'male' ? rawMaleUrl : rawFemaleUrl
    );
    setErrorMsg(null);
    setIsBusy(true);
    try {
      await updateChapterAudioUrlInFirestore(novel.id, chapter, trimmed, targetVoice);
      const updatedLinks = buildVoiceOverwriteLinks(chapter, targetVoice, trimmed);

      const updatedChapter: Chapter = {
        ...chapter,
        ...updatedLinks,
      };

      onAudioLinksUpdated(chapter, updatedLinks);
      setEditingVoice(null);
      setLinkInput('');

      const voiceLabel = targetVoice === 'male' ? 'Nam Minh' : 'Hằng Nga';
      if (onSingleLinkSaved) {
        onSingleLinkSaved(updatedChapter, targetVoice, trimmed);
        setSuccessMsg(
          hadPreviousLink
            ? `Đã ghi đè link MP3 mới giọng ${voiceLabel} và đang kiểm tra...`
            : `Đã lưu link MP3 giọng ${voiceLabel} và đang kiểm tra...`
        );
      } else {
        onClearBrokenFlag?.(chapter.id, targetVoice);
        setStandaloneVoiceState((prev) => ({
          ...prev,
          [targetVoice]: false,
          [targetVoice === 'male' ? 'maleChecking' : 'femaleChecking']: true,
          [targetVoice === 'male' ? 'maleLive' : 'femaleLive']: false,
          [targetVoice === 'male' ? 'maleReason' : 'femaleReason']: undefined,
          [targetVoice === 'male' ? 'maleDuplicate' : 'femaleDuplicate']: false,
          [targetVoice === 'male' ? 'maleDuplicateReason' : 'femaleDuplicateReason']: undefined,
        }));
        setSuccessMsg(
          hadPreviousLink
            ? `Đã ghi đè link MP3 mới giọng ${voiceLabel}.`
            : `Đã lưu link MP3 giọng ${voiceLabel}.`
        );
        probeAudioMetadataOnce(
          trimmed,
          LINK_PROBE_TIMEOUT_MS,
          () => isUnmountedRef.current,
          standaloneProbeAudiosRef.current
        ).then((res) => {
          if (isUnmountedRef.current || res.cancelled) return;
          setStandaloneVoiceState((prev) => ({
            ...prev,
            [targetVoice]: !res.ok,
            [targetVoice === 'male' ? 'maleChecking' : 'femaleChecking']: false,
            [targetVoice === 'male' ? 'maleLive' : 'femaleLive']: res.ok,
            [targetVoice === 'male' ? 'maleReason' : 'femaleReason']: res.ok
              ? undefined
              : res.reason || 'Link lỗi (không phát được)',
          }));
        });
      }
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(
        sanitizeUserFacingErrorText(err?.message, 'Không thể lưu link MP3 lên hệ thống.')
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveVoiceLink = async (voice: VoiceKey) => {
    if (confirmClearVoice !== voice) {
      setConfirmClearVoice(voice);
      setTimeout(() => {
        setConfirmClearVoice((cur) => (cur === voice ? null : cur));
      }, 4000);
      return;
    }

    setConfirmClearVoice(null);
    setErrorMsg(null);
    if (previewVoice === voice) {
      stopPreview();
    }

    setIsBusy(true);
    try {
      await updateChapterAudioUrlInFirestore(novel.id, chapter, null, voice);
      onClearBrokenFlag?.(chapter.id, voice);
      setStandaloneVoiceState((prev) => ({
        ...prev,
        [voice]: false,
        [voice === 'male' ? 'maleLive' : 'femaleLive']: false,
        [voice === 'male' ? 'maleChecking' : 'femaleChecking']: false,
        [voice === 'male' ? 'maleReason' : 'femaleReason']: undefined,
        [voice === 'male' ? 'maleDuplicate' : 'femaleDuplicate']: false,
        [voice === 'male' ? 'maleDuplicateReason' : 'femaleDuplicateReason']: undefined,
      }));
      onAudioLinksUpdated(chapter, buildVoiceOverwriteLinks(chapter, voice, undefined));
      setSuccessMsg(
        `Đã xóa link MP3 giọng ${voice === 'male' ? 'Nam Minh' : 'Hằng Nga'}.`
      );
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(
        sanitizeUserFacingErrorText(err?.message, 'Không thể xóa link MP3 trên hệ thống.')
      );
    } finally {
      setIsBusy(false);
    }
  };

  const renderVoiceRow = (voice: VoiceKey, validUrl: string, rawUrl: string) => {
    const isMale = voice === 'male';
    const voiceLabel = isMale ? 'Nam Minh' : 'Hằng Nga';
    const isBroken = isMale
      ? Boolean(effectiveVoiceState?.male)
      : Boolean(effectiveVoiceState?.female);
    const isLive = isMale
      ? Boolean(effectiveVoiceState?.maleLive)
      : Boolean(effectiveVoiceState?.femaleLive);
    const isChecking = isMale
      ? Boolean(effectiveVoiceState?.maleChecking)
      : Boolean(effectiveVoiceState?.femaleChecking);
    const brokenReason = isMale
      ? effectiveVoiceState?.maleReason
      : effectiveVoiceState?.femaleReason;
    const isDuplicate = isMale
      ? Boolean(effectiveVoiceState?.maleDuplicate)
      : Boolean(effectiveVoiceState?.femaleDuplicate);
    const duplicateReason = isMale
      ? effectiveVoiceState?.maleDuplicateReason
      : effectiveVoiceState?.femaleDuplicateReason;
    const isThisPreviewPlaying = previewVoice === voice;
    const isThisConfirming = confirmClearVoice === voice;
    const displayUrl = validUrl || rawUrl;

    return (
      <div
        className={`rounded-xl px-3 py-2.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition min-w-0 ${
          isBroken
            ? 'bg-rose-50/90 border-rose-400'
            : isDuplicate
            ? 'bg-amber-50/80 border-amber-400'
            : isLive
            ? 'bg-emerald-50/50 border-emerald-300'
            : displayUrl
            ? 'bg-slate-50/80 border-slate-200'
            : 'bg-slate-50/40 border-dashed border-slate-200'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold ${
              isMale ? 'text-sky-700' : 'text-pink-700'
            }`}
          >
            <UserRound
              className={`w-3.5 h-3.5 shrink-0 ${isMale ? 'text-sky-600' : 'text-pink-600'}`}
            />
            <span>{voiceLabel}:</span>
          </span>

          {displayUrl ? (
            <>
              {isBroken ? (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300 text-[11px] font-bold"
                  title={brokenReason || 'Link lỗi (không phát được)'}
                >
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{brokenReason || 'Link lỗi (không phát được)'}</span>
                </span>
              ) : isChecking ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300 text-[11px] font-bold">
                  <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                  <span>Đang kiểm tra...</span>
                </span>
              ) : isLive ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 text-[11px] font-bold">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>Link sống</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>Đã có</span>
                </span>
              )}

              {isDuplicate && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold"
                  title={duplicateReason || 'Link trùng (bị lặp ở chương khác)'}
                >
                  <AlertTriangle className="w-3 h-3 shrink-0 text-amber-700" />
                  <span>{duplicateReason || 'Link trùng'}</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] font-medium text-slate-400">Chưa gắn link</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {displayUrl ? (
            <>
              <button
                type="button"
                disabled={actionsDisabled || !validUrl}
                onClick={() => validUrl && handleTogglePreview(voice, validUrl)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 ${
                  isThisPreviewPlaying
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
                title={
                  !validUrl
                    ? 'Link sai định dạng'
                    : isThisPreviewPlaying
                    ? 'Dừng nghe thử'
                    : `Nghe thử ${voiceLabel}`
                }
              >
                {isThisPreviewPlaying ? (
                  <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{isThisPreviewPlaying ? 'Dừng' : 'Nghe thử'}</span>
              </button>

              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => openEditorForVoice(voice)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                title={`Sửa link MP3 ${voiceLabel}`}
              >
                <Edit3 className="w-3.5 h-3.5 shrink-0" />
                <span>Sửa link</span>
              </button>

              {validUrl && (
                <a
                  href={validUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 transition"
                  title="Mở link MP3"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => handleRemoveVoiceLink(voice)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 ${
                  isThisConfirming
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white hover:bg-rose-50 text-rose-600 border-rose-200'
                }`}
                title={`Xóa link MP3 ${voiceLabel}`}
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>{isThisConfirming ? 'Xác nhận?' : 'Xóa'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => openEditorForVoice(voice)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-pink-50 text-pink-700 border border-pink-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span>Dán link</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2 min-w-0">
      {missingVoices.length > 0 && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              Còn thiếu link MP3: <strong>{missingVoices.join(' / ')}</strong>
            </span>
          </span>
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={() => openEditorForVoice(!rawMaleUrl ? 'male' : 'female')}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition shrink-0 disabled:opacity-50"
          >
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span>Dán link</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {renderVoiceRow('male', maleUrl, rawMaleUrl)}
        {renderVoiceRow('female', femaleUrl, rawFemaleUrl)}
      </div>

      {editingVoice && (
        <form
          onSubmit={handleSaveSingleLink}
          className="p-3 rounded-xl bg-slate-50 border border-slate-300 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingVoice('male');
                setLinkInput(rawMaleUrl);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition ${
                editingVoice === 'male'
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              Nam Minh
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingVoice('female');
                setLinkInput(rawFemaleUrl);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition ${
                editingVoice === 'female'
                  ? 'bg-pink-600 text-white border-pink-600'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              Hằng Nga
            </button>
          </div>
          <input
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder={`Dán link MP3 trực tiếp (https://...) cho giọng ${
              editingVoice === 'male' ? 'Nam Minh' : 'Hằng Nga'
            }`}
            className="flex-1 min-w-0 min-h-[42px] bg-white border border-slate-300 focus:border-pink-500 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
            autoFocus
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              disabled={isBusy}
              className="flex-1 sm:flex-initial min-h-[40px] px-4 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Lưu link</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingVoice(null);
                setLinkInput('');
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 text-xs font-semibold cursor-pointer"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {errorMsg && (
        <div className="px-2.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold flex items-start justify-between gap-2">
          <span className="flex items-start gap-1.5 min-w-0 break-words">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-words">{errorMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer p-0.5 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
};

interface AdminNovelMp3DrawerModalProps {
  novel: Novel;
  onClose: () => void;
  onChapterAudioUpdated: (novelId: string, updatedChapter: Chapter) => void;
  onBatchChaptersAudioUpdated?: (novelId: string, updatedChapters: Chapter[]) => void;
  onNovelMp3CountsSynced?: (
    novelId: string,
    counts: {
      mp3NamMinhCount: number;
      mp3HangNgaCount: number;
      hasMaleAudio: boolean;
      hasFemaleAudio: boolean;
      hasAudio: boolean;
    }
  ) => void;
}

export const AdminNovelMp3DrawerModal: React.FC<AdminNovelMp3DrawerModalProps> = ({
  novel,
  onClose,
  onChapterAudioUpdated,
  onBatchChaptersAudioUpdated,
  onNovelMp3CountsSynced,
}) => {
  const [chapters, setChapters] = useState<Chapter[]>(() =>
    sortChaptersNaturally(Array.isArray(novel.chapters) ? novel.chapters : [])
  );
  const chaptersRef = useRef<Chapter[]>(chapters);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  // Search, Quick Filters & 100-chapter Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilterMode>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Bulk Paste Modal / Panel
  const [showBulkPasteModal, setShowBulkPasteModal] = useState(false);
  const [bulkVoice, setBulkVoice] = useState<VoiceKey>('male');
  const [bulkText, setBulkText] = useState('');
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [bulkReport, setBulkReport] = useState<{
    type: 'success' | 'error';
    message: string;
    details: string[];
  } | null>(null);

  // Bulk Delete Modal
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deleteScope, setDeleteScope] = useState<DeleteVoiceScope>('male');
  const [deleteFromChapter, setDeleteFromChapter] = useState<number>(1);
  const [deleteToChapter, setDeleteToChapter] = useState<number>(100);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [toolbarMessage, setToolbarMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
    includeBrokenList?: boolean;
  } | null>(null);

  // Hàng đợi kiểm tra link sống/chết & trùng lặp trên trình duyệt (0 Reads / 0 Writes)
  const [brokenLinksMap, setBrokenLinksMap] = useState<Record<string, BrokenVoiceState>>({});
  const [isProbingQueue, setIsProbingQueue] = useState(false);
  const [probeProgress, setProbeProgress] = useState<{ checked: number; total: number }>({
    checked: 0,
    total: 0,
  });
  const [isErrorSummaryCollapsed, setIsErrorSummaryCollapsed] = useState(false);
  const [isDuplicateSummaryCollapsed, setIsDuplicateSummaryCollapsed] = useState(false);
  const isCancelledRef = useRef<boolean>(false);
  const stopQueueRef = useRef<boolean>(false);
  const activeProbeAudiosRef = useRef<Set<HTMLAudioElement>>(new Set());
  const latestTargetNonceMapRef = useRef<Map<string, number>>(new Map());
  const chapterCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingJumpChapterIdRef = useRef<string | null>(null);
  const [highlightedChapterId, setHighlightedChapterId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editVoiceRequest, setEditVoiceRequest] = useState<{
    chapterId: string;
    voice: VoiceKey;
    nonce: number;
  } | null>(null);

  // Export Backup (.txt) Dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const cleanupAllProbeAudios = () => {
    activeProbeAudiosRef.current.forEach((audioEl) => cleanupAudioElement(audioEl));
    activeProbeAudiosRef.current.clear();
  };

  useEffect(() => {
    isCancelledRef.current = false;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      isCancelledRef.current = true;
      stopQueueRef.current = true;
      cleanupAllProbeAudios();
      document.removeEventListener('mousedown', handleClickOutside);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const syncedCountsKeyRef = useRef<string>('');

  useEffect(() => {
    const syncCountsIfNeeded = (loadedList: Chapter[]) => {
      if (!Array.isArray(loadedList) || loadedList.length === 0) return;
      const counts = computeChapterAudioCounts(loadedList);
      const syncSignature = `${novel.id}:${counts.mp3NamMinhCount}:${counts.mp3HangNgaCount}`;
      if (syncedCountsKeyRef.current === syncSignature) return;
      const needsSync =
        typeof novel.mp3NamMinhCount !== 'number' ||
        typeof novel.mp3HangNgaCount !== 'number' ||
        novel.mp3NamMinhCount !== counts.mp3NamMinhCount ||
        novel.mp3HangNgaCount !== counts.mp3HangNgaCount ||
        Boolean(novel.hasMaleAudio) !== counts.hasMaleAudio ||
        Boolean(novel.hasFemaleAudio) !== counts.hasFemaleAudio;

      if (needsSync) {
        syncedCountsKeyRef.current = syncSignature;
        syncNovelMp3CountsInFirestore(novel.id, counts).catch(() => {});
        onNovelMp3CountsSynced?.(novel.id, counts);
      }
    };

    const preloaded = Array.isArray(novel.chapters) ? novel.chapters : [];
    const expectedTotal = Number(novel.totalChapters || 0);
    if (preloaded.length > 0 && (expectedTotal === 0 || preloaded.length >= expectedTotal)) {
      const sorted = sortChaptersNaturally(preloaded);
      chaptersRef.current = sorted;
      setChapters(sorted);
      const maxNum = sorted.reduce((acc, c) => Math.max(acc, resolveChapterNumber(c)), 1);
      setDeleteFromChapter(resolveChapterNumber(sorted[0]) || 1);
      setDeleteToChapter(maxNum);
      setIsLoadingChapters(false);
      syncCountsIfNeeded(sorted);
      return;
    }

    let cancelled = false;
    setIsLoadingChapters(true);
    fetchChaptersForNovel(novel.id)
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          const sorted = sortChaptersNaturally(list);
          chaptersRef.current = sorted;
          setChapters(sorted);
          const maxNum = sorted.reduce((acc, c) => Math.max(acc, resolveChapterNumber(c)), 1);
          setDeleteFromChapter(resolveChapterNumber(sorted[0]) || 1);
          setDeleteToChapter(maxNum);
          syncCountsIfNeeded(sorted);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingChapters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [novel.id]);

  // Luôn sắp xếp danh sách chương theo thứ tự số tự nhiên (1, 2, 3... 10, 11...)
  const sortedChapters = useMemo(() => {
    return sortChaptersNaturally(chapters || []);
  }, [chapters]);

  // Tách riêng hoàn toàn "Link lỗi (không phát được)" và "Link trùng (bị lặp ở chương khác)"
  const {
    brokenEntries,
    brokenChapterIdsSet,
    duplicateEntries,
    duplicateChapterIdsSet,
  } = useMemo(() => {
    const brokenList: IssueLinkEntry[] = [];
    const brokenChapIds = new Set<string>();
    const dupList: IssueLinkEntry[] = [];
    const dupChapIds = new Set<string>();

    for (const ch of sortedChapters) {
      const state = brokenLinksMap[ch.id];
      if (!state) continue;
      const chapNum = resolveChapterNumber(ch);
      const chapTitle = ch.title || `Chương ${chapNum}`;

      const maleUrl = getRawVoiceUrl(ch, 'male');
      if (state.male && maleUrl) {
        brokenList.push({
          chapterId: ch.id,
          chapterNumber: chapNum,
          chapterTitle: chapTitle,
          voice: 'male',
          voiceLabel: 'Nam Minh',
          url: maleUrl,
          reason: state.maleReason || 'Link lỗi (không phát được)',
        });
        brokenChapIds.add(ch.id);
      }
      if (state.maleDuplicate && maleUrl) {
        dupList.push({
          chapterId: ch.id,
          chapterNumber: chapNum,
          chapterTitle: chapTitle,
          voice: 'male',
          voiceLabel: 'Nam Minh',
          url: maleUrl,
          reason: state.maleDuplicateReason || 'Bị lặp ở chương khác',
        });
        dupChapIds.add(ch.id);
      }

      const femaleUrl = getRawVoiceUrl(ch, 'female');
      if (state.female && femaleUrl) {
        brokenList.push({
          chapterId: ch.id,
          chapterNumber: chapNum,
          chapterTitle: chapTitle,
          voice: 'female',
          voiceLabel: 'Hằng Nga',
          url: femaleUrl,
          reason: state.femaleReason || 'Link lỗi (không phát được)',
        });
        brokenChapIds.add(ch.id);
      }
      if (state.femaleDuplicate && femaleUrl) {
        dupList.push({
          chapterId: ch.id,
          chapterNumber: chapNum,
          chapterTitle: chapTitle,
          voice: 'female',
          voiceLabel: 'Hằng Nga',
          url: femaleUrl,
          reason: state.femaleDuplicateReason || 'Bị lặp ở chương khác',
        });
        dupChapIds.add(ch.id);
      }
    }

    return {
      brokenEntries: brokenList,
      brokenChapterIdsSet: brokenChapIds,
      duplicateEntries: dupList,
      duplicateChapterIdsSet: dupChapIds,
    };
  }, [sortedChapters, brokenLinksMap]);

  useEffect(() => {
    if (voiceFilter === 'broken' && brokenChapterIdsSet.size === 0) {
      setVoiceFilter('all');
      setCurrentPage(1);
    }
    if (voiceFilter === 'duplicate' && duplicateChapterIdsSet.size === 0) {
      setVoiceFilter('all');
      setCurrentPage(1);
    }
  }, [voiceFilter, brokenChapterIdsSet.size, duplicateChapterIdsSet.size]);

  const audioStats = useMemo(() => {
    let maleCount = 0;
    let femaleCount = 0;
    let missingMaleCount = 0;
    let missingFemaleCount = 0;
    let bothReadyCount = 0;
    for (const ch of sortedChapters) {
      const hasMale = Boolean(getMaleAudioUrl(ch));
      const hasFemale = Boolean(getFemaleAudioUrl(ch));
      if (hasMale) maleCount += 1;
      else missingMaleCount += 1;
      if (hasFemale) femaleCount += 1;
      else missingFemaleCount += 1;
      if (hasMale && hasFemale) bothReadyCount += 1;
    }
    return {
      total: sortedChapters.length,
      maleCount,
      femaleCount,
      missingMaleCount,
      missingFemaleCount,
      bothReadyCount,
    };
  }, [sortedChapters]);

  const filteredChapters = useMemo(() => {
    const q = removeVietnameseTones(searchQuery);
    const rawTrimmed = searchQuery.trim();
    return sortedChapters.filter((ch) => {
      const hasMale = Boolean(getMaleAudioUrl(ch));
      const hasFemale = Boolean(getFemaleAudioUrl(ch));

      if (voiceFilter === 'missing_male' && hasMale) return false;
      if (voiceFilter === 'missing_female' && hasFemale) return false;
      if (voiceFilter === 'both_ready' && (!hasMale || !hasFemale)) return false;
      if (voiceFilter === 'broken') {
        const b = brokenLinksMap[ch.id];
        const hasBrokenMale = Boolean(b?.male && getRawVoiceUrl(ch, 'male'));
        const hasBrokenFemale = Boolean(b?.female && getRawVoiceUrl(ch, 'female'));
        if (!hasBrokenMale && !hasBrokenFemale) return false;
      }
      if (voiceFilter === 'duplicate') {
        const b = brokenLinksMap[ch.id];
        const hasDupMale = Boolean(b?.maleDuplicate && getRawVoiceUrl(ch, 'male'));
        const hasDupFemale = Boolean(b?.femaleDuplicate && getRawVoiceUrl(ch, 'female'));
        if (!hasDupMale && !hasDupFemale) return false;
      }

      if (!q && !rawTrimmed) return true;
      const chapNumStr = String(resolveChapterNumber(ch));
      const numMatch = chapNumStr === rawTrimmed || chapNumStr.includes(rawTrimmed);
      const titleMatch = removeVietnameseTones(ch.title || '').includes(q);
      return numMatch || titleMatch;
    });
  }, [sortedChapters, searchQuery, voiceFilter, brokenLinksMap]);

  const totalPages = Math.max(1, Math.ceil(filteredChapters.length / CHAPTERS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * CHAPTERS_PER_PAGE;
  const pageChapters = useMemo(() => {
    return filteredChapters.slice(pageStartIndex, pageStartIndex + CHAPTERS_PER_PAGE);
  }, [filteredChapters, pageStartIndex]);

  useEffect(() => {
    const targetId = pendingJumpChapterIdRef.current;
    if (!targetId) return;
    const cardEl = chapterCardRefs.current[targetId];
    if (!cardEl) return;

    pendingJumpChapterIdRef.current = null;
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedChapterId(targetId);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedChapterId((cur) => (cur === targetId ? null : cur));
    }, 3200);
  }, [pageChapters, safeCurrentPage, editVoiceRequest]);

  const handleJumpToIssueChapter = (entry: IssueLinkEntry, targetKind: 'broken' | 'duplicate') => {
    const nextFilter: VoiceFilterMode =
      voiceFilter === targetKind ? targetKind : 'all';
    const nextList = sortedChapters.filter((ch) => {
      if (nextFilter === 'broken') {
        const b = brokenLinksMap[ch.id];
        return Boolean(
          (b?.male && getRawVoiceUrl(ch, 'male')) ||
            (b?.female && getRawVoiceUrl(ch, 'female'))
        );
      }
      if (nextFilter === 'duplicate') {
        const b = brokenLinksMap[ch.id];
        return Boolean(
          (b?.maleDuplicate && getRawVoiceUrl(ch, 'male')) ||
            (b?.femaleDuplicate && getRawVoiceUrl(ch, 'female'))
        );
      }
      return true;
    });
    const idx = nextList.findIndex(
      (ch) => ch.id === entry.chapterId || resolveChapterNumber(ch) === entry.chapterNumber
    );
    const targetPage = idx >= 0 ? Math.floor(idx / CHAPTERS_PER_PAGE) + 1 : 1;

    setSearchQuery('');
    setVoiceFilter(nextFilter);
    setCurrentPage(targetPage);
    pendingJumpChapterIdRef.current = entry.chapterId;
    setEditVoiceRequest({
      chapterId: entry.chapterId,
      voice: entry.voice,
      nonce: Date.now(),
    });
  };

  const applyBatchUpdatesToState = (updatedChaptersList: Chapter[]) => {
    const byId = new Map<string, Chapter>();
    const byNumber = new Map<number, Chapter>();
    for (const u of updatedChaptersList) {
      if (u.id) byId.set(u.id, u);
      const num = resolveChapterNumber(u);
      if (num > 0) byNumber.set(num, u);
    }
    const nextChapters = sortChaptersNaturally(
      chaptersRef.current.map((item) => {
        const matched = byId.get(item.id) || byNumber.get(resolveChapterNumber(item));
        if (!matched) return item;
        return {
          ...item,
          audioUrl: matched.audioUrl,
          audioUrlMale: matched.audioUrlMale,
          audioUrlFemale: matched.audioUrlFemale,
          mp3Url: matched.mp3Url,
          maleAudioUrl: matched.maleAudioUrl,
          audio: matched.audio,
          femaleAudioUrl: matched.femaleAudioUrl,
          mp3Female: matched.mp3Female,
        };
      })
    );
    chaptersRef.current = nextChapters;
    setChapters(nextChapters);

    const counts = computeChapterAudioCounts(nextChapters);
    syncedCountsKeyRef.current = `${novel.id}:${counts.mp3NamMinhCount}:${counts.mp3HangNgaCount}`;
    onNovelMp3CountsSynced?.(novel.id, counts);

    if (onBatchChaptersAudioUpdated) {
      onBatchChaptersAudioUpdated(novel.id, updatedChaptersList);
    } else {
      for (const u of updatedChaptersList) {
        onChapterAudioUpdated(novel.id, u);
      }
    }
  };

  // Logic 1: Dán link MP3 hàng loạt — ghép chính xác tuyệt đối theo số chương (KHÔNG dùng chỉ số mảng) & tự động ghi đè link cũ
  const handleBulkPasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkReport(null);

    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.replace(/[\u200B-\u200D\uFEFF]/g, '').normalize('NFC').trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkReport({
        type: 'error',
        message: 'Vui lòng dán ít nhất 1 dòng chứa đường dẫn MP3.',
        details: [],
      });
      return;
    }

    // Lập bản đồ tra cứu tuyệt đối theo số chương (chapterNumber === X) & dự phòng theo số chương trích từ tiêu đề
    const chapterByNumber = new Map<number, Chapter>();
    const chapterByTitleNumber = new Map<number, Chapter>();
    for (const ch of sortedChapters) {
      const resolvedNum = resolveChapterNumber(ch);
      if (resolvedNum > 0 && !chapterByNumber.has(resolvedNum)) {
        chapterByNumber.set(resolvedNum, ch);
      }
      const titleNum = extractChapterNumberFromTitle(ch.title);
      if (titleNum !== null && !chapterByTitleNumber.has(titleNum)) {
        chapterByTitleNumber.set(titleNum, ch);
      }
    }

    const findChapterByExactNumber = (chapNum: number): Chapter | undefined => {
      if (!Number.isFinite(chapNum) || chapNum <= 0) return undefined;
      return chapterByNumber.get(chapNum) || chapterByTitleNumber.get(chapNum);
    };

    let sequentialChapterNum = 1;
    const mappedByChapterKey = new Map<
      string,
      { chapter: Chapter; url: string; hadExistingLink: boolean }
    >();
    const issues: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Trích xuất URL ở cuối dòng
      const urlMatch = line.match(/(https?:\/\/\S+)\s*$/i);
      if (!urlMatch || urlMatch.index === undefined) {
        issues.push(
          `Dòng ${i + 1}: Không tìm thấy đường dẫn hợp lệ ("${line.slice(0, 50)}${
            line.length > 50 ? '...' : ''
          }").`
        );
        continue;
      }

      const url = urlMatch[1].trim();
      if (!isValidHttpUrl(url)) {
        issues.push(`Dòng ${i + 1}: Đường dẫn không hợp lệ.`);
        continue;
      }

      const prefixRaw = line.slice(0, urlMatch.index).trim();

      if (prefixRaw.length > 0) {
        // Bắt buộc trích xuất chính xác con số X đứng sau "Chương" (hoặc Hồi/Chapter/C) trước dấu phân cách |, :, -
        let extractedChapNum: number | null = null;
        const explicitMatch = prefixRaw.match(/(?:chương|chuong|hồi|hoi|chapter)\s*0*(\d+)\b/i);
        if (explicitMatch) {
          extractedChapNum = parseInt(explicitMatch[1], 10);
        } else {
          const shortMatch = prefixRaw.match(
            /^(?:c\.?\s*)?0*(\d+)\s*(?:\||:|：|-|–|—)\s*$/i
          );
          if (shortMatch) {
            extractedChapNum = parseInt(shortMatch[1], 10);
          }
        }

        if (extractedChapNum === null || !Number.isFinite(extractedChapNum) || extractedChapNum <= 0) {
          issues.push(
            `Dòng ${i + 1}: Không trích xuất được số chương từ "${prefixRaw.slice(
              0,
              40
            )}". Vui lòng dùng định dạng "Chương X | https://...".`
          );
          continue;
        }

        const targetChapter = findChapterByExactNumber(extractedChapNum);
        if (!targetChapter) {
          issues.push(
            `Dòng ${i + 1}: Không tìm thấy Chương ${extractedChapNum} trong danh sách chương của truyện.`
          );
          continue;
        }

        const existingUrl = getRawVoiceUrl(targetChapter, bulkVoice);
        mappedByChapterKey.set(targetChapter.id, {
          chapter: targetChapter,
          url,
          hadExistingLink: Boolean(existingUrl),
        });
        continue;
      }

      // Chỉ dán URL trần (không ghi "Chương X") -> tìm chính xác theo số chương 1, 2, 3... (tuyệt đối không lấy theo array index)
      const chapNum = sequentialChapterNum++;
      const targetChapter = findChapterByExactNumber(chapNum);
      if (!targetChapter) {
        issues.push(
          `Dòng ${i + 1}: Không tìm thấy Chương ${chapNum} trong truyện (khuyên dùng định dạng "Chương X | https://...").`
        );
        continue;
      }
      const existingUrl = getRawVoiceUrl(targetChapter, bulkVoice);
      mappedByChapterKey.set(targetChapter.id, {
        chapter: targetChapter,
        url,
        hadExistingLink: Boolean(existingUrl),
      });
    }

    const entries = Array.from(mappedByChapterKey.values());
    if (entries.length === 0) {
      setBulkReport({
        type: 'error',
        message: 'Không có chương nào hợp lệ để cập nhật.',
        details: issues.slice(0, 10),
      });
      return;
    }

    const overwrittenCount = entries.filter((item) => item.hadExistingLink).length;

    setIsSavingBulk(true);
    try {
      const batchItems: ChapterAudioLinkBatchItem[] = entries.map(({ chapter, url }) => ({
        chapter,
        audioUrlMale: bulkVoice === 'male' ? url : undefined,
        audioUrlFemale: bulkVoice === 'female' ? url : undefined,
      }));

      // Tự động ghi đè link cũ (bao gồm dọn sạch các trường link cũ của giọng đang chọn)
      const updatedChapters: Chapter[] = entries.map(({ chapter, url }) => ({
        ...chapter,
        ...buildVoiceOverwriteLinks(chapter, bulkVoice, url),
      }));

      const nextChaptersSnapshot = sortChaptersNaturally(
        sortedChapters.map((item) => {
          const matched = updatedChapters.find(
            (u) => u.id === item.id || resolveChapterNumber(u) === resolveChapterNumber(item)
          );
          return matched ? { ...item, ...matched } : item;
        })
      );
      const nextCounts = computeChapterAudioCounts(nextChaptersSnapshot);

      await batchUpdateChapterAudioLinksInFirestore(novel.id, batchItems, nextCounts);

      applyBatchUpdatesToState(updatedChapters);

      const voiceLabel = bulkVoice === 'male' ? 'Nam Minh' : 'Hằng Nga';
      const overwriteNote =
        overwrittenCount > 0 ? ` (đã tự động ghi đè ${overwrittenCount} link cũ)` : '';
      setBulkReport({
        type: 'success',
        message: `Đã ghép thành công ${updatedChapters.length} link MP3 giọng ${voiceLabel}${overwriteNote}${
          issues.length > 0 ? ` • ${issues.length} dòng bỏ qua` : ''
        }. Đang tự động kiểm tra link sống/lỗi & trùng lặp...`,
        details: issues.slice(0, 12),
      });
      if (issues.length === 0) {
        setBulkText('');
      }

      // Kiểm tra ngay danh sách vừa dán (đợt 4 link/lần, thẻ <audio preload="metadata">, timeout 8s)
      const targetsToVerify = entries.map(({ chapter, url }) => ({
        chapterId: chapter.id,
        chapterNumber: resolveChapterNumber(chapter),
        voice: bulkVoice,
        url,
      }));
      verifyTargetLinksQueue(targetsToVerify, nextChaptersSnapshot, {
        summaryPrefix: `Đã kiểm tra ${targetsToVerify.length} link vừa dán`,
      }).catch(() => {});
    } catch (err: any) {
      setBulkReport({
        type: 'error',
        message: sanitizeUserFacingErrorText(
          err?.message,
          'Lỗi khi lưu danh sách link MP3 lên hệ thống.'
        ),
        details: issues.slice(0, 10),
      });
    } finally {
      setIsSavingBulk(false);
    }
  };

  // Logic 2: Xóa link hàng loạt theo phạm vi chương & giọng
  const deletePreviewCount = useMemo(() => {
    const minC = Math.min(deleteFromChapter, deleteToChapter);
    const maxC = Math.max(deleteFromChapter, deleteToChapter);
    return sortedChapters.filter((ch) => {
      const num = resolveChapterNumber(ch);
      if (num < minC || num > maxC) return false;
      const hasMale = Boolean(getMaleAudioUrl(ch));
      const hasFemale = Boolean(getFemaleAudioUrl(ch));
      if (deleteScope === 'male') return hasMale;
      if (deleteScope === 'female') return hasFemale;
      return hasMale || hasFemale;
    }).length;
  }, [sortedChapters, deleteFromChapter, deleteToChapter, deleteScope]);

  const handleBulkDeleteConfirm = async () => {
    const minC = Math.min(deleteFromChapter, deleteToChapter);
    const maxC = Math.max(deleteFromChapter, deleteToChapter);
    const targets = sortedChapters.filter((ch) => {
      const num = resolveChapterNumber(ch);
      if (num < minC || num > maxC) return false;
      const hasMale = Boolean(getMaleAudioUrl(ch));
      const hasFemale = Boolean(getFemaleAudioUrl(ch));
      if (deleteScope === 'male') return hasMale;
      if (deleteScope === 'female') return hasFemale;
      return hasMale || hasFemale;
    });

    if (targets.length === 0) {
      setToolbarMessage({
        type: 'warning',
        text: `Không có link MP3 nào thuộc phạm vi Chương ${minC}–${maxC} để xóa.`,
      });
      setShowBulkDeleteModal(false);
      return;
    }

    setIsDeletingBulk(true);
    try {
      const batchItems: ChapterAudioLinkBatchItem[] = targets.map((ch) => ({
        chapter: ch,
        audioUrlMale: deleteScope === 'male' || deleteScope === 'both' ? '' : undefined,
        audioUrlFemale: deleteScope === 'female' || deleteScope === 'both' ? '' : undefined,
      }));

      const updatedChapters: Chapter[] = targets.map((ch) => ({
        ...ch,
        audioUrl:
          deleteScope === 'male' || deleteScope === 'both' ? undefined : ch.audioUrl,
        audioUrlMale:
          deleteScope === 'male' || deleteScope === 'both' ? undefined : ch.audioUrlMale,
        mp3Url:
          deleteScope === 'male' || deleteScope === 'both' ? undefined : ch.mp3Url,
        maleAudioUrl:
          deleteScope === 'male' || deleteScope === 'both' ? undefined : ch.maleAudioUrl,
        audio:
          deleteScope === 'male' || deleteScope === 'both' ? undefined : ch.audio,
        audioUrlFemale:
          deleteScope === 'female' || deleteScope === 'both' ? undefined : ch.audioUrlFemale,
        femaleAudioUrl:
          deleteScope === 'female' || deleteScope === 'both' ? undefined : ch.femaleAudioUrl,
        mp3Female:
          deleteScope === 'female' || deleteScope === 'both' ? undefined : ch.mp3Female,
      }));

      const nextChaptersSnapshot = sortChaptersNaturally(
        sortedChapters.map((item) => {
          const matched = updatedChapters.find(
            (u) => u.id === item.id || resolveChapterNumber(u) === resolveChapterNumber(item)
          );
          return matched ? { ...item, ...matched } : item;
        })
      );
      const nextCounts = computeChapterAudioCounts(nextChaptersSnapshot);

      await batchUpdateChapterAudioLinksInFirestore(novel.id, batchItems, nextCounts);

      setBrokenLinksMap((prev) => {
        const next = { ...prev };
        for (const ch of targets) {
          if (next[ch.id]) {
            const clearMale = deleteScope === 'male' || deleteScope === 'both';
            const clearFemale = deleteScope === 'female' || deleteScope === 'both';
            next[ch.id] = {
              male: clearMale ? false : next[ch.id].male,
              female: clearFemale ? false : next[ch.id].female,
              maleLive: clearMale ? false : next[ch.id].maleLive,
              femaleLive: clearFemale ? false : next[ch.id].femaleLive,
              maleChecking: clearMale ? false : next[ch.id].maleChecking,
              femaleChecking: clearFemale ? false : next[ch.id].femaleChecking,
              maleReason: clearMale ? undefined : next[ch.id].maleReason,
              femaleReason: clearFemale ? undefined : next[ch.id].femaleReason,
              maleDuplicate: clearMale ? false : next[ch.id].maleDuplicate,
              femaleDuplicate: clearFemale ? false : next[ch.id].femaleDuplicate,
              maleDuplicateReason: clearMale ? undefined : next[ch.id].maleDuplicateReason,
              femaleDuplicateReason: clearFemale ? undefined : next[ch.id].femaleDuplicateReason,
            };
          }
        }
        return next;
      });

      applyBatchUpdatesToState(updatedChapters);
      setShowBulkDeleteModal(false);
      const scopeLabel =
        deleteScope === 'male'
          ? 'Nam Minh'
          : deleteScope === 'female'
          ? 'Hằng Nga'
          : 'Cả 2 giọng';
      setToolbarMessage({
        type: 'success',
        text: `Đã xóa link MP3 (${scopeLabel}) của ${targets.length} chương trong phạm vi Chương ${minC}–${maxC}.`,
      });
    } catch (err: any) {
      setToolbarMessage({
        type: 'error',
        text: sanitizeUserFacingErrorText(
          err?.message,
          'Không thể xóa hàng loạt link MP3.'
        ),
      });
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // Logic 3: Kiểm tra bằng thẻ <audio preload="metadata"> theo đợt 4 link (timeout 8s, 0 fetch, 0 Reads/Writes)
  // Tách rõ hoàn toàn "Link lỗi (không phát được)" và "Link trùng (bị lặp ở chương khác)"
  const verifyTargetLinksQueue = async (
    targetItems: {
      chapterId: string;
      chapterNumber: number;
      voice: VoiceKey;
      url: string;
    }[],
    chaptersSnapshot: Chapter[],
    options?: {
      isFullScan?: boolean;
      summaryPrefix?: string;
    }
  ) => {
    if (targetItems.length === 0) {
      setToolbarMessage({
        type: 'warning',
        text: 'Không có link MP3 nào để kiểm tra.',
      });
      return;
    }

    // Bước 1: Quét trùng lặp giữa các chương (tách riêng với kết quả phát được/lỗi)
    const urlOccurrences = new Map<string, { chapterId: string; chapterNumber: number }[]>();
    for (const ch of chaptersSnapshot) {
      const chapNum = resolveChapterNumber(ch);
      const urls = [getRawVoiceUrl(ch, 'male'), getRawVoiceUrl(ch, 'female')];
      for (const rawUrl of urls) {
        if (!rawUrl || !isValidHttpUrl(rawUrl)) continue;
        const list = urlOccurrences.get(rawUrl) || [];
        if (!list.some((existing) => existing.chapterId === ch.id)) {
          list.push({ chapterId: ch.id, chapterNumber: chapNum });
        }
        urlOccurrences.set(rawUrl, list);
      }
    }

    const immediateResults: Record<string, Partial<BrokenVoiceState>> = {};
    const liveProbeTasks: {
      chapterId: string;
      chapterNumber: number;
      voice: VoiceKey;
      url: string;
      nonce: number;
    }[] = [];

    let formatBrokenCount = 0;
    let duplicateCount = 0;

    for (const item of targetItems) {
      const trimmedUrl = item.url.trim();
      const liveKey = item.voice === 'male' ? 'maleLive' : 'femaleLive';
      const checkingKey = item.voice === 'male' ? 'maleChecking' : 'femaleChecking';
      const reasonKey = item.voice === 'male' ? 'maleReason' : 'femaleReason';
      const dupKey = item.voice === 'male' ? 'maleDuplicate' : 'femaleDuplicate';
      const dupReasonKey = item.voice === 'male' ? 'maleDuplicateReason' : 'femaleDuplicateReason';

      if (!immediateResults[item.chapterId]) {
        immediateResults[item.chapterId] = {};
      }

      if (!isValidHttpUrl(trimmedUrl)) {
        formatBrokenCount += 1;
        immediateResults[item.chapterId][item.voice] = true;
        immediateResults[item.chapterId][liveKey] = false;
        immediateResults[item.chapterId][checkingKey] = false;
        immediateResults[item.chapterId][reasonKey] = 'Link lỗi (sai định dạng)';
        immediateResults[item.chapterId][dupKey] = false;
        immediateResults[item.chapterId][dupReasonKey] = undefined;
        continue;
      }

      // Kiểm tra link trùng ở chương khác (KHÔNG đánh dấu nhầm là Link lỗi không phát được)
      const occurrences = urlOccurrences.get(trimmedUrl) || [];
      const otherNums = occurrences
        .filter((occ) => occ.chapterId !== item.chapterId)
        .map((occ) => occ.chapterNumber)
        .sort((a, b) => a - b);

      if (otherNums.length > 0) {
        duplicateCount += 1;
        const previewNums =
          otherNums.length > 3
            ? `${otherNums.slice(0, 3).join(', ')}...`
            : otherNums.join(', ');
        immediateResults[item.chapterId][dupKey] = true;
        immediateResults[item.chapterId][dupReasonKey] = `Trùng với Chương ${previewNums}`;
      } else {
        immediateResults[item.chapterId][dupKey] = false;
        immediateResults[item.chapterId][dupReasonKey] = undefined;
      }

      // Vẫn đưa vào hàng đợi kiểm tra thẻ <audio preload="metadata"> để xác định độc lập Link sống hay Link lỗi
      const taskNonce = Date.now() + Math.random();
      latestTargetNonceMapRef.current.set(`${item.chapterId}::${item.voice}`, taskNonce);
      immediateResults[item.chapterId][item.voice] = false;
      immediateResults[item.chapterId][liveKey] = false;
      immediateResults[item.chapterId][checkingKey] = true;
      immediateResults[item.chapterId][reasonKey] = undefined;
      liveProbeTasks.push({
        ...item,
        url: trimmedUrl,
        nonce: taskNonce,
      });
    }

    // Đồng bộ lại cờ trùng lặp trên toàn bộ danh sách chương (ví dụ khi 1 chương vừa đổi sang link mới khiến chương cũ hết trùng)
    setBrokenLinksMap((prev) => {
      const next: Record<string, BrokenVoiceState> = options?.isFullScan ? {} : { ...prev };

      if (!options?.isFullScan) {
        for (const ch of chaptersSnapshot) {
          const prevState = next[ch.id];
          const updatedState: BrokenVoiceState = { ...(prevState || {}) };
          let touched = false;
          for (const v of ['male', 'female'] as VoiceKey[]) {
            const dupKey = v === 'male' ? 'maleDuplicate' : 'femaleDuplicate';
            const dupReasonKey = v === 'male' ? 'maleDuplicateReason' : 'femaleDuplicateReason';
            const curUrl = getRawVoiceUrl(ch, v);
            const occ = curUrl && isValidHttpUrl(curUrl) ? urlOccurrences.get(curUrl) || [] : [];
            const otherNums = occ
              .filter((o) => o.chapterId !== ch.id)
              .map((o) => o.chapterNumber)
              .sort((a, b) => a - b);

            if (otherNums.length > 0) {
              const previewNums =
                otherNums.length > 3
                  ? `${otherNums.slice(0, 3).join(', ')}...`
                  : otherNums.join(', ');
              const nextReason = `Trùng với Chương ${previewNums}`;
              if (!updatedState[dupKey] || updatedState[dupReasonKey] !== nextReason) {
                updatedState[dupKey] = true;
                updatedState[dupReasonKey] = nextReason;
                touched = true;
              }
            } else if (updatedState[dupKey]) {
              updatedState[dupKey] = false;
              updatedState[dupReasonKey] = undefined;
              touched = true;
            }
          }
          if (touched) {
            next[ch.id] = updatedState;
          }
        }
      }

      for (const [chId, patch] of Object.entries(immediateResults)) {
        next[chId] = { ...(next[chId] || {}), ...patch };
      }
      return next;
    });

    const buildSummaryText = (
      prefixText: string,
      liveCnt: number,
      brokenCnt: number,
      dupCnt: number
    ) => {
      const parts: string[] = [`${liveCnt} link sống`];
      parts.push(`${brokenCnt} link lỗi (không phát được)`);
      parts.push(`${dupCnt} link trùng (bị lặp ở chương khác)`);
      return `${prefixText}: ${parts.join(' • ')}.`;
    };

    if (liveProbeTasks.length === 0) {
      setIsProbingQueue(false);
      setProbeProgress({ checked: 0, total: 0 });
      setToolbarMessage({
        type: formatBrokenCount > 0 || duplicateCount > 0 ? 'warning' : 'success',
        text: buildSummaryText(
          options?.summaryPrefix || 'Đã kiểm tra',
          0,
          formatBrokenCount,
          duplicateCount
        ),
        includeBrokenList: formatBrokenCount > 0 || duplicateCount > 0,
      });
      return;
    }

    // Gom các task có cùng URL để mỗi URL chỉ tạo 1 thẻ <audio>, vẫn chạy từng đợt 4 URL
    const tasksByUrl = new Map<string, typeof liveProbeTasks>();
    for (const task of liveProbeTasks) {
      const group = tasksByUrl.get(task.url) || [];
      group.push(task);
      tasksByUrl.set(task.url, group);
    }
    const uniqueUrlGroups = Array.from(tasksByUrl.entries());

    stopQueueRef.current = false;
    setIsProbingQueue(true);
    setProbeProgress({ checked: 0, total: liveProbeTasks.length });
    if (options?.isFullScan) {
      setToolbarMessage(null);
    }

    let liveOkCount = 0;
    let probeBrokenCount = 0;
    let processedCount = 0;

    for (let i = 0; i < uniqueUrlGroups.length; i += LINK_PROBE_BATCH_SIZE) {
      if (isCancelledRef.current || stopQueueRef.current) break;
      const batchGroups = uniqueUrlGroups.slice(i, i + LINK_PROBE_BATCH_SIZE);

      await Promise.all(
        batchGroups.map(async ([urlToProbe, groupTasks]) => {
          const isGroupStillActive = () =>
            groupTasks.some(
              (t) => latestTargetNonceMapRef.current.get(`${t.chapterId}::${t.voice}`) === t.nonce
            );

          const res = await probeAudioMetadataOnce(
            urlToProbe,
            LINK_PROBE_TIMEOUT_MS,
            () => isCancelledRef.current || stopQueueRef.current || !isGroupStillActive(),
            activeProbeAudiosRef.current
          );

          if (isCancelledRef.current || res.cancelled) {
            return;
          }

          const activeTasks = groupTasks.filter(
            (t) => latestTargetNonceMapRef.current.get(`${t.chapterId}::${t.voice}`) === t.nonce
          );
          if (activeTasks.length === 0) return;

          setBrokenLinksMap((prev) => {
            const next = { ...prev };
            for (const task of activeTasks) {
              const liveKey = task.voice === 'male' ? 'maleLive' : 'femaleLive';
              const checkingKey = task.voice === 'male' ? 'maleChecking' : 'femaleChecking';
              const reasonKey = task.voice === 'male' ? 'maleReason' : 'femaleReason';
              next[task.chapterId] = {
                ...(next[task.chapterId] || {}),
                [task.voice]: !res.ok,
                [liveKey]: res.ok,
                [checkingKey]: false,
                [reasonKey]: res.ok ? undefined : res.reason || 'Link lỗi (không phát được)',
              };
            }
            return next;
          });

          if (res.ok) liveOkCount += activeTasks.length;
          else probeBrokenCount += activeTasks.length;
          processedCount += activeTasks.length;
          setProbeProgress((prev) => ({
            ...prev,
            checked: Math.min(prev.total, prev.checked + activeTasks.length),
          }));
        })
      );

      if (
        i + LINK_PROBE_BATCH_SIZE < uniqueUrlGroups.length &&
        !isCancelledRef.current &&
        !stopQueueRef.current
      ) {
        await sleepMs(LINK_PROBE_BATCH_DELAY_MS);
      }
    }

    if (isCancelledRef.current) return;

    if (stopQueueRef.current) {
      setBrokenLinksMap((prev) => {
        const next = { ...prev };
        for (const task of liveProbeTasks) {
          const checkingKey = task.voice === 'male' ? 'maleChecking' : 'femaleChecking';
          if (next[task.chapterId]?.[checkingKey]) {
            next[task.chapterId] = {
              ...next[task.chapterId],
              [checkingKey]: false,
            };
          }
        }
        return next;
      });
    }

    const totalBroken = formatBrokenCount + probeBrokenCount;
    const prefix = options?.summaryPrefix || `Đã kiểm tra ${targetItems.length} link`;
    if (stopQueueRef.current) {
      setToolbarMessage({
        type: totalBroken > 0 || duplicateCount > 0 ? 'warning' : 'success',
        text: buildSummaryText(
          `Đã dừng kiểm tra (${processedCount}/${liveProbeTasks.length} link)`,
          liveOkCount,
          totalBroken,
          duplicateCount
        ),
        includeBrokenList: totalBroken > 0 || duplicateCount > 0,
      });
    } else if (totalBroken === 0 && duplicateCount === 0) {
      setToolbarMessage({
        type: 'success',
        text: `${prefix}: tất cả ${liveOkCount} link đều sống và không bị trùng.`,
        includeBrokenList: false,
      });
    } else {
      setToolbarMessage({
        type: 'warning',
        text: buildSummaryText(prefix, liveOkCount, totalBroken, duplicateCount),
        includeBrokenList: true,
      });
    }

    setIsProbingQueue(false);
  };

  const handleCheckAllLinks = () => {
    if (isProbingQueue) return;

    const entriesToInspect: {
      chapterId: string;
      chapterNumber: number;
      voice: VoiceKey;
      url: string;
    }[] = [];

    for (const ch of sortedChapters) {
      const chapNum = resolveChapterNumber(ch);
      const rawMale = getRawVoiceUrl(ch, 'male');
      const rawFemale = getRawVoiceUrl(ch, 'female');
      if (rawMale) {
        entriesToInspect.push({
          chapterId: ch.id,
          chapterNumber: chapNum,
          voice: 'male',
          url: rawMale,
        });
      }
      if (rawFemale) {
        entriesToInspect.push({
          chapterId: ch.id,
          chapterNumber: chapNum,
          voice: 'female',
          url: rawFemale,
        });
      }
    }

    if (entriesToInspect.length === 0) {
      setBrokenLinksMap({});
      setToolbarMessage({
        type: 'warning',
        text: 'Bộ truyện này chưa có link MP3 nào để kiểm tra.',
      });
      return;
    }

    verifyTargetLinksQueue(entriesToInspect, sortedChapters, {
      isFullScan: true,
      summaryPrefix: `Đã kiểm tra toàn bộ ${entriesToInspect.length} link`,
    }).catch(() => {});
  };

  const handleSingleLinkSaved = (updatedChapter: Chapter, voice: VoiceKey, newUrl: string) => {
    const chapNum = resolveChapterNumber(updatedChapter);
    const nextChaptersSnapshot = sortChaptersNaturally(
      sortedChapters.map((item) =>
        item.id === updatedChapter.id || resolveChapterNumber(item) === chapNum
          ? { ...item, ...updatedChapter }
          : item
      )
    );

    verifyTargetLinksQueue(
      [
        {
          chapterId: updatedChapter.id,
          chapterNumber: chapNum,
          voice,
          url: newUrl,
        },
      ],
      nextChaptersSnapshot,
      {
        summaryPrefix: `Đã kiểm tra Chương ${chapNum} (${
          voice === 'male' ? 'Nam Minh' : 'Hằng Nga'
        })`,
      }
    ).catch(() => {});
  };

  const handleStopProbeQueue = () => {
    stopQueueRef.current = true;
    cleanupAllProbeAudios();
  };

  const handleCloseModal = () => {
    isCancelledRef.current = true;
    stopQueueRef.current = true;
    cleanupAllProbeAudios();
    onClose();
  };

  // Logic 4: Xuất file dự phòng (.txt) chuẩn "Chương <số> | <url>"
  const handleExportTxtBackup = (voice: VoiceKey) => {
    setShowExportMenu(false);
    const lines: string[] = [];
    for (const ch of sortedChapters) {
      const url = voice === 'male' ? getMaleAudioUrl(ch) : getFemaleAudioUrl(ch);
      if (url) {
        lines.push(`Chương ${resolveChapterNumber(ch)} | ${url}`);
      }
    }

    if (lines.length === 0) {
      setToolbarMessage({
        type: 'warning',
        text: `Truyện này chưa có link MP3 nào cho giọng ${
          voice === 'male' ? 'Nam Minh' : 'Hằng Nga'
        } để xuất file.`,
      });
      return;
    }

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const baseName = sanitizeDownloadFilename(novel.title);
    const voiceSuffix = voice === 'male' ? 'NamMinh' : 'HangNga';
    anchor.href = objectUrl;
    anchor.download = `${baseName}_${voiceSuffix}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    setToolbarMessage({
      type: 'success',
      text: `Đã xuất ${lines.length} link giọng ${
        voice === 'male' ? 'Nam Minh' : 'Hằng Nga'
      } ra file ${baseName}_${voiceSuffix}.txt.`,
    });
  };

  const renderPaginationBar = (positionLabel: 'top' | 'bottom') => {
    if (filteredChapters.length === 0) return null;
    const fromItem = pageStartIndex + 1;
    const toItem = Math.min(pageStartIndex + CHAPTERS_PER_PAGE, filteredChapters.length);

    const pageNumbers: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let p = 1; p <= totalPages; p++) pageNumbers.push(p);
    } else {
      pageNumbers.push(1);
      if (safeCurrentPage > 3) pageNumbers.push('ellipsis');
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let p = start; p <= end; p++) pageNumbers.push(p);
      if (safeCurrentPage < totalPages - 2) pageNumbers.push('ellipsis');
      pageNumbers.push(totalPages);
    }

    return (
      <div
        key={positionLabel}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs"
      >
        <div className="text-slate-600 font-medium tabular-nums">
          Trang <strong>{safeCurrentPage}/{totalPages}</strong> • Hiển thị{' '}
          <strong>
            {fromItem}–{toItem}
          </strong>{' '}
          / {filteredChapters.length} chương
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Trước</span>
            </button>

            {pageNumbers.map((item, idx) =>
              item === 'ellipsis' ? (
                <span key={`el-${idx}`} className="px-1.5 text-slate-400 font-bold">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCurrentPage(item)}
                  className={`min-w-[40px] min-h-[40px] px-2.5 py-1.5 rounded-lg font-bold tabular-nums cursor-pointer transition ${
                    safeCurrentPage === item
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {item}
                </button>
              )
            )}

            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed transition"
            >
              <span>Sau</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[105] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-x-hidden animate-in fade-in duration-150">
      <div className="w-full max-w-5xl max-h-[94dvh] bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden overflow-x-hidden text-slate-900">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Headphones className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                Quản lý MP3: {novel.title}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 tabular-nums">
                <span className="inline-flex items-center gap-1 font-bold text-sky-700">
                  <UserRound className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>
                    Nam Minh: {audioStats.maleCount}/{audioStats.total} chương
                  </span>
                </span>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span className="inline-flex items-center gap-1 font-bold text-pink-700">
                  <UserRound className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                  <span>
                    Hằng Nga: {audioStats.femaleCount}/{audioStats.total} chương
                  </span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            aria-label="Đóng quản lý MP3"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar + Search + Filters */}
        <div className="px-3 sm:px-6 py-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0 overflow-x-hidden">
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary CTA: Dán link MP3 hàng loạt */}
            <button
              type="button"
              onClick={() => {
                setBulkReport(null);
                setShowBulkPasteModal((prev) => !prev);
                setShowBulkDeleteModal(false);
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition"
            >
              <ClipboardPaste className="w-4 h-4 shrink-0" />
              <span>Dán link MP3 hàng loạt</span>
            </button>

            {/* Tool 2: Kiểm tra toàn bộ link (Trùng, Định dạng & Sống/Chết) */}
            {!isProbingQueue ? (
              <button
                type="button"
                onClick={handleCheckAllLinks}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
                title="Kiểm tra toàn bộ link MP3 (trùng lặp, định dạng và tải thử metadata)"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Kiểm tra toàn bộ link</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="min-h-[42px] px-3.5 py-2 rounded-xl border bg-amber-50 border-amber-300 text-amber-900 text-xs font-bold inline-flex items-center gap-2 tabular-nums">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                  <span>
                    Đang kiểm tra: {probeProgress.checked}/{probeProgress.total} link...
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleStopProbeQueue}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shadow-xs transition"
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                  <span>Dừng</span>
                </button>
              </div>
            )}

            {/* Tool 3: Xóa link hàng loạt */}
            <button
              type="button"
              onClick={() => {
                setShowBulkDeleteModal(true);
                setShowBulkPasteModal(false);
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Xóa link hàng loạt</span>
            </button>

            {/* Tool 4: Xuất file dự phòng (.txt) */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu((prev) => !prev)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Xuất file dự phòng (.txt)</span>
              </button>

              {showExportMenu && (
                <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-40 space-y-1">
                  <button
                    type="button"
                    onClick={() => handleExportTxtBackup('male')}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-sky-800 hover:bg-sky-50 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="w-3.5 h-3.5 text-sky-600" />
                      <span>Xuất Nam Minh (.txt)</span>
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {audioStats.maleCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportTxtBackup('female')}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-pink-800 hover:bg-pink-50 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="w-3.5 h-3.5 text-pink-600" />
                      <span>Xuất Hằng Nga (.txt)</span>
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {audioStats.femaleCount}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {isProbingQueue && probeProgress.total > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 tabular-nums">
                <span>Đang kiểm tra: {probeProgress.checked}/{probeProgress.total} link...</span>
                <span>
                  {Math.min(
                    100,
                    Math.round((probeProgress.checked / Math.max(1, probeProgress.total)) * 100)
                  )}
                  %
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-amber-200/70 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-pink-500 transition-all duration-200"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((probeProgress.checked / Math.max(1, probeProgress.total)) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {toolbarMessage && (
            <div
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border ${
                toolbarMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : toolbarMessage.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {toolbarMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span className="break-words">{toolbarMessage.text}</span>
              </span>
              <button
                type="button"
                onClick={() => setToolbarMessage(null)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Panel: Dán link MP3 hàng loạt */}
          {showBulkPasteModal && (
            <form
              onSubmit={handleBulkPasteSubmit}
              className="p-3.5 rounded-2xl bg-slate-50 border border-pink-200 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                    Dán link MP3 hàng loạt
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    Hỗ trợ định dạng <code className="font-mono bg-white px-1 rounded">Chương 1 | https://...</code> (nhận diện dấu <code className="font-mono">|</code>, <code className="font-mono">:</code>, <code className="font-mono">-</code>) hoặc dán mỗi dòng 1 đường dẫn MP3 để tự đánh số từ Chương 1.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkPasteModal(false)}
                  className="self-end sm:self-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Chọn giọng cần ghép:</span>
                <button
                  type="button"
                  onClick={() => setBulkVoice('male')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border transition ${
                    bulkVoice === 'male'
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-sky-50'
                  }`}
                >
                  <UserRound className="w-3.5 h-3.5 shrink-0" />
                  <span>Nam Minh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkVoice('female')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border transition ${
                    bulkVoice === 'female'
                      ? 'bg-pink-600 text-white border-pink-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-pink-50'
                  }`}
                >
                  <UserRound className="w-3.5 h-3.5 shrink-0" />
                  <span>Hằng Nga</span>
                </button>
              </div>

              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={6}
                placeholder={`Chương 1 | https://example.com/chuong-1.mp3\nChương 2 | https://example.com/chuong-2.mp3\n(Hoặc dán từng dòng chỉ chứa URL https://... để ghép tuần tự từ Chương 1)`}
                className="w-full bg-white border border-slate-300 focus:border-pink-500 rounded-xl p-3 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />

              {bulkReport && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    bulkReport.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    {bulkReport.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{bulkReport.message}</span>
                  </div>
                  {bulkReport.details.length > 0 && (
                    <ul className="list-disc pl-5 text-[11px] space-y-0.5 max-h-28 overflow-y-auto">
                      {bulkReport.details.map((d, idx) => (
                        <li key={idx}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkPasteModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isSavingBulk || !bulkText.trim()}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isSavingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <span>Ghép vào các chương</span>
                </button>
              </div>
            </form>
          )}

          {/* Thanh tìm kiếm & các nút lọc nhanh */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm nhanh theo số chương (vd: 15, 120) hoặc tên chương..."
                className="w-full min-h-[40px] bg-slate-50 border border-slate-300 focus:border-pink-500 focus:bg-white rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: 'all', label: `Tất cả (${audioStats.total})` },
                  { id: 'missing_male', label: `Thiếu Nam Minh (${audioStats.missingMaleCount})` },
                  {
                    id: 'missing_female',
                    label: `Thiếu Hằng Nga (${audioStats.missingFemaleCount})`,
                  },
                  { id: 'both_ready', label: `Đủ cả 2 giọng (${audioStats.bothReadyCount})` },
                ] as { id: VoiceFilterMode; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setVoiceFilter(f.id);
                    setCurrentPage(1);
                  }}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer tabular-nums ${
                    voiceFilter === f.id
                      ? 'bg-pink-600 text-white border-pink-600 shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}

              {brokenChapterIdsSet.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setVoiceFilter('broken');
                    setCurrentPage(1);
                  }}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer tabular-nums inline-flex items-center gap-1 ${
                    voiceFilter === 'broken'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Link lỗi ({brokenChapterIdsSet.size})</span>
                </button>
              )}

              {duplicateChapterIdsSet.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setVoiceFilter('duplicate');
                    setCurrentPage(1);
                  }}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer tabular-nums inline-flex items-center gap-1 ${
                    voiceFilter === 'duplicate'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Link trùng ({duplicateChapterIdsSet.size})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chapters Body with Separated Broken & Duplicate Summary Banners + 100-chapter Pagination */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 space-y-3 bg-slate-50/70">
          {/* Thông báo 1 (Đỏ): Link lỗi (không phát được) — tách biệt hoàn toàn với Link trùng */}
          {brokenEntries.length > 0 && (
            <div className="rounded-2xl bg-rose-50 border-2 border-rose-300 shadow-xs p-3 sm:p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="text-xs sm:text-sm font-extrabold text-rose-800 tabular-nums">
                    Link lỗi (không phát được): {brokenChapterIdsSet.size} chương ({brokenEntries.length} link)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsErrorSummaryCollapsed((prev) => !prev)}
                  className="min-h-[40px] px-3 py-1 rounded-xl bg-white hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 transition"
                >
                  <span>{isErrorSummaryCollapsed ? 'Mở rộng' : 'Thu gọn'}</span>
                  {isErrorSummaryCollapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {!isErrorSummaryCollapsed && (
                <div className="flex flex-wrap items-center gap-2 max-h-36 sm:max-h-44 overflow-y-auto pr-1 pt-0.5">
                  {brokenEntries.map((entry) => (
                    <button
                      key={`broken-${entry.chapterId}-${entry.voice}`}
                      type="button"
                      onClick={() => handleJumpToIssueChapter(entry, 'broken')}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-rose-600 hover:text-white border border-rose-300 text-rose-700 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition shadow-2xs group"
                      title={`Bấm để nhảy tới Chương ${entry.chapterNumber} và sửa link lỗi ${entry.voiceLabel}`}
                    >
                      <span>
                        Chương {entry.chapterNumber} ({entry.voiceLabel})
                      </span>
                      {entry.reason ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-100 group-hover:bg-rose-500 text-rose-700 group-hover:text-white text-[10px] font-extrabold">
                          {entry.reason}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thông báo 2 (Vàng cam): Link trùng (bị lặp ở chương khác) — tách biệt hoàn toàn với Link lỗi */}
          {duplicateEntries.length > 0 && (
            <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-xs p-3 sm:p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs sm:text-sm font-extrabold text-amber-900 tabular-nums">
                    Link trùng (bị lặp ở chương khác): {duplicateChapterIdsSet.size} chương ({duplicateEntries.length} link)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDuplicateSummaryCollapsed((prev) => !prev)}
                  className="min-h-[40px] px-3 py-1 rounded-xl bg-white hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 transition"
                >
                  <span>{isDuplicateSummaryCollapsed ? 'Mở rộng' : 'Thu gọn'}</span>
                  {isDuplicateSummaryCollapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {!isDuplicateSummaryCollapsed && (
                <div className="flex flex-wrap items-center gap-2 max-h-36 sm:max-h-44 overflow-y-auto pr-1 pt-0.5">
                  {duplicateEntries.map((entry) => (
                    <button
                      key={`dup-${entry.chapterId}-${entry.voice}`}
                      type="button"
                      onClick={() => handleJumpToIssueChapter(entry, 'duplicate')}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-amber-600 hover:text-white border border-amber-300 text-amber-900 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition shadow-2xs group"
                      title={`Bấm để nhảy tới Chương ${entry.chapterNumber} và đổi link trùng ${entry.voiceLabel}`}
                    >
                      <span>
                        Chương {entry.chapterNumber} ({entry.voiceLabel})
                      </span>
                      {entry.reason ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-100 group-hover:bg-amber-500 text-amber-900 group-hover:text-white text-[10px] font-extrabold">
                          {entry.reason}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {renderPaginationBar('top')}

          {isLoadingChapters && chapters.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-pink-600" />
              <span>Đang tải danh sách chương...</span>
            </div>
          ) : pageChapters.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500">
              Không tìm thấy chương nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pageChapters.map((ch) => (
                <div
                  key={ch.id}
                  ref={(el) => {
                    chapterCardRefs.current[ch.id] = el;
                  }}
                  className={`p-3 sm:p-3.5 rounded-2xl bg-white border shadow-2xs transition-all min-w-0 ${
                    highlightedChapterId === ch.id
                      ? 'border-rose-500 ring-2 ring-rose-300 bg-rose-50/30'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs sm:text-sm text-slate-900 break-words flex flex-wrap items-center gap-1.5">
                        <span>{ch.title || `Chương ${resolveChapterNumber(ch)}`}</span>
                        {isChapterScheduledPending(ch) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[10px] font-bold">
                            <Clock className="w-3 h-3" />
                            <span>Hẹn giờ: {formatScheduleShort(getChapterPublishAt(ch))}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 tabular-nums">
                        Chương {resolveChapterNumber(ch)}
                      </div>
                    </div>
                  </div>

                  <AdminChapterMp3Actions
                    novel={novel}
                    chapter={ch}
                    brokenVoices={brokenLinksMap[ch.id]}
                    externalEditRequest={editVoiceRequest}
                    onSingleLinkSaved={handleSingleLinkSaved}
                    onMarkVoiceLive={(chId, voice) => {
                      const liveKey = voice === 'male' ? 'maleLive' : 'femaleLive';
                      const checkingKey = voice === 'male' ? 'maleChecking' : 'femaleChecking';
                      const reasonKey = voice === 'male' ? 'maleReason' : 'femaleReason';
                      setBrokenLinksMap((prev) => ({
                        ...prev,
                        [chId]: {
                          ...(prev[chId] || {}),
                          [voice]: false,
                          [liveKey]: true,
                          [checkingKey]: false,
                          [reasonKey]: undefined,
                        },
                      }));
                    }}
                    onClearBrokenFlag={(chId, voice) => {
                      setBrokenLinksMap((prev) => {
                        if (!prev[chId]) return prev;
                        const reasonKey = voice === 'male' ? 'maleReason' : 'femaleReason';
                        const checkingKey = voice === 'male' ? 'maleChecking' : 'femaleChecking';
                        const liveKey = voice === 'male' ? 'maleLive' : 'femaleLive';
                        const dupKey = voice === 'male' ? 'maleDuplicate' : 'femaleDuplicate';
                        const dupReasonKey =
                          voice === 'male' ? 'maleDuplicateReason' : 'femaleDuplicateReason';
                        return {
                          ...prev,
                          [chId]: {
                            ...prev[chId],
                            [voice]: false,
                            [liveKey]: false,
                            [checkingKey]: false,
                            [reasonKey]: undefined,
                            [dupKey]: false,
                            [dupReasonKey]: undefined,
                          },
                        };
                      });
                    }}
                    onAudioLinksUpdated={(targetChap, links) => {
                      const prevCounts = computeChapterAudioCounts(chaptersRef.current);
                      const updated: Chapter = {
                        ...targetChap,
                        audioUrl: links.audioUrl,
                        audioUrlMale: links.audioUrlMale,
                        audioUrlFemale: links.audioUrlFemale,
                        mp3Url: links.mp3Url,
                        maleAudioUrl: links.maleAudioUrl,
                        audio: links.audio,
                        femaleAudioUrl: links.femaleAudioUrl,
                        mp3Female: links.mp3Female,
                      };
                      const targetNum = resolveChapterNumber(targetChap);
                      const nextChapters = sortChaptersNaturally(
                        chaptersRef.current.map((item) =>
                          item.id === targetChap.id ||
                          resolveChapterNumber(item) === targetNum
                            ? {
                                ...item,
                                audioUrl: links.audioUrl,
                                audioUrlMale: links.audioUrlMale,
                                audioUrlFemale: links.audioUrlFemale,
                                mp3Url: links.mp3Url,
                                maleAudioUrl: links.maleAudioUrl,
                                audio: links.audio,
                                femaleAudioUrl: links.femaleAudioUrl,
                                mp3Female: links.mp3Female,
                              }
                            : item
                        )
                      );
                      chaptersRef.current = nextChapters;
                      setChapters(nextChapters);
                      const counts = computeChapterAudioCounts(nextChapters);
                      onNovelMp3CountsSynced?.(novel.id, counts);
                      const countsChanged =
                        prevCounts.mp3NamMinhCount !== counts.mp3NamMinhCount ||
                        prevCounts.mp3HangNgaCount !== counts.mp3HangNgaCount ||
                        prevCounts.hasMaleAudio !== counts.hasMaleAudio ||
                        prevCounts.hasFemaleAudio !== counts.hasFemaleAudio;
                      if (countsChanged) {
                        syncedCountsKeyRef.current = `${novel.id}:${counts.mp3NamMinhCount}:${counts.mp3HangNgaCount}`;
                        syncNovelMp3CountsInFirestore(novel.id, counts).catch(() => {});
                      }
                      onChapterAudioUpdated(novel.id, updated);
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {renderPaginationBar('bottom')}
        </div>
      </div>

      {/* Modal: Xóa link hàng loạt */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-[115] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4 text-slate-900">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Xóa link MP3 hàng loạt</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Chọn giọng cần xóa link:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'male', label: 'Nam Minh' },
                      { id: 'female', label: 'Hằng Nga' },
                      { id: 'both', label: 'Cả 2 giọng' },
                    ] as { id: DeleteVoiceScope; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDeleteScope(opt.id)}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition ${
                        deleteScope === opt.id
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Từ chương:
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={deleteFromChapter}
                    onChange={(e) => setDeleteFromChapter(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full min-h-[40px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 tabular-nums focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Đến chương:
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={deleteToChapter}
                    onChange={(e) => setDeleteToChapter(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full min-h-[40px] bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 tabular-nums focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium tabular-nums">
                Sẽ xóa link của <strong>{deletePreviewCount}</strong> chương trong khoảng Chương{' '}
                <strong>{Math.min(deleteFromChapter, deleteToChapter)}</strong> –{' '}
                <strong>{Math.max(deleteFromChapter, deleteToChapter)}</strong>. Các chương và
                giọng khác vẫn được giữ nguyên.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeletingBulk || deletePreviewCount === 0}
                onClick={handleBulkDeleteConfirm}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Xác nhận xóa ({deletePreviewCount} chương)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
