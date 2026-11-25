import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chapter, Novel } from '../types';
import {
  fetchChaptersForNovel,
  updateChapterAudioUrlInFirestore,
  batchUpdateChapterAudioLinksInFirestore,
  type ChapterAudioLinkBatchItem,
} from '../firebase/services';
import { removeVietnameseTones } from '../utils/rulesAndVoices';
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
  Edit3,
} from 'lucide-react';

const CHAPTERS_PER_PAGE = 100;

type VoiceKey = 'male' | 'female';
type DeleteVoiceScope = 'male' | 'female' | 'both';
type VoiceFilterMode = 'all' | 'missing_male' | 'missing_female' | 'both_ready' | 'broken';

export interface BrokenVoiceState {
  male?: boolean;
  female?: boolean;
}

interface BrokenLinkEntry {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  voice: VoiceKey;
  voiceLabel: string;
}

function getMaleAudioUrl(chapter: Chapter): string {
  return (chapter.audioUrlMale || chapter.audioUrl || '').trim();
}

function getFemaleAudioUrl(chapter: Chapter): string {
  return (chapter.audioUrlFemale || '').trim();
}

function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
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

function probeAudioUrlMetadata(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const trimmed = url.trim();
    if (!isValidHttpUrl(trimmed)) {
      resolve(false);
      return;
    }

    let settled = false;
    const probe = new Audio();
    probe.preload = 'metadata';

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      probe.onloadedmetadata = null;
      probe.oncanplay = null;
      probe.onerror = null;
      try {
        probe.pause();
        probe.removeAttribute('src');
        probe.load();
      } catch {}
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    probe.onloadedmetadata = () => finish(true);
    probe.oncanplay = () => finish(true);
    probe.onerror = () => finish(false);

    try {
      probe.src = trimmed;
      probe.load();
    } catch {
      finish(false);
    }
  });
}

interface AdminChapterMp3ActionsProps {
  novel: Novel;
  chapter: Chapter;
  disabledExternally?: boolean;
  brokenVoices?: BrokenVoiceState;
  externalEditRequest?: { chapterId: string; voice: VoiceKey; nonce: number } | null;
  onAudioLinksUpdated: (
    chapter: Chapter,
    links: { audioUrl?: string; audioUrlMale?: string; audioUrlFemale?: string }
  ) => void;
  onClearBrokenFlag?: (chapterId: string, voice: VoiceKey) => void;
}

export const AdminChapterMp3Actions: React.FC<AdminChapterMp3ActionsProps> = ({
  novel,
  chapter,
  disabledExternally = false,
  brokenVoices,
  externalEditRequest,
  onAudioLinksUpdated,
  onClearBrokenFlag,
}) => {
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [editingVoice, setEditingVoice] = useState<VoiceKey | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [previewVoice, setPreviewVoice] = useState<VoiceKey | null>(null);
  const [confirmClearVoice, setConfirmClearVoice] = useState<VoiceKey | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
        previewAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!externalEditRequest || externalEditRequest.chapterId !== chapter.id) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingVoice(externalEditRequest.voice);
    setLinkInput(
      externalEditRequest.voice === 'male'
        ? getMaleAudioUrl(chapter)
        : getFemaleAudioUrl(chapter)
    );
  }, [externalEditRequest, chapter]);

  const maleUrl = getMaleAudioUrl(chapter);
  const femaleUrl = getFemaleAudioUrl(chapter);
  const missingVoices: string[] = [];
  if (!maleUrl) missingVoices.push('Nam Minh');
  if (!femaleUrl) missingVoices.push('Hằng Nga');

  const actionsDisabled = isBusy || disabledExternally;

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setPreviewVoice(null);
  };

  const handleTogglePreview = (voice: VoiceKey, url: string) => {
    if (!url) return;

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.onended = () => setPreviewVoice(null);
      previewAudioRef.current.onerror = () => {
        setPreviewVoice(null);
        setErrorMsg(
          `Không phát được file MP3 (${voice === 'male' ? 'Nam Minh' : 'Hằng Nga'}). Vui lòng kiểm tra lại đường dẫn.`
        );
      };
    }

    const audioEl = previewAudioRef.current;
    if (previewVoice === voice) {
      audioEl.pause();
      setPreviewVoice(null);
      return;
    }

    setErrorMsg(null);
    audioEl.pause();
    audioEl.src = url;
    audioEl
      .play()
      .then(() => setPreviewVoice(voice))
      .catch((err) => {
        setPreviewVoice(null);
        setErrorMsg(`Không thể nghe thử: ${err?.message || 'Đường dẫn chưa sẵn sàng'}`);
      });
  };

  const openEditorForVoice = (voice: VoiceKey) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingVoice(voice);
    setLinkInput(voice === 'male' ? maleUrl : femaleUrl);
  };

  const handleSaveSingleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVoice) return;
    const trimmed = linkInput.trim();
    if (!isValidHttpUrl(trimmed)) {
      setErrorMsg('Vui lòng nhập đường dẫn MP3 hợp lệ bắt đầu bằng http:// hoặc https://');
      return;
    }

    const targetVoice = editingVoice;
    setErrorMsg(null);
    setIsBusy(true);
    try {
      await updateChapterAudioUrlInFirestore(novel.id, chapter, trimmed, targetVoice);
      onClearBrokenFlag?.(chapter.id, targetVoice);
      if (targetVoice === 'male') {
        onAudioLinksUpdated(chapter, {
          audioUrl: chapter.audioUrl,
          audioUrlMale: trimmed,
          audioUrlFemale: chapter.audioUrlFemale,
        });
      } else {
        onAudioLinksUpdated(chapter, {
          audioUrl: chapter.audioUrl,
          audioUrlMale: chapter.audioUrlMale,
          audioUrlFemale: trimmed,
        });
      }
      setEditingVoice(null);
      setLinkInput('');
      setSuccessMsg(
        `Đã lưu link MP3 giọng ${targetVoice === 'male' ? 'Nam Minh' : 'Hằng Nga'}.`
      );
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
      if (voice === 'male') {
        onAudioLinksUpdated(chapter, {
          audioUrl: undefined,
          audioUrlMale: undefined,
          audioUrlFemale: chapter.audioUrlFemale,
        });
      } else {
        onAudioLinksUpdated(chapter, {
          audioUrl: chapter.audioUrl,
          audioUrlMale: chapter.audioUrlMale,
          audioUrlFemale: undefined,
        });
      }
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

  const renderVoiceRow = (voice: VoiceKey, url: string) => {
    const isMale = voice === 'male';
    const voiceLabel = isMale ? 'Nam Minh' : 'Hằng Nga';
    const isBroken = isMale ? Boolean(brokenVoices?.male) : Boolean(brokenVoices?.female);
    const isThisPreviewPlaying = previewVoice === voice;
    const isThisConfirming = confirmClearVoice === voice;

    return (
      <div
        className={`rounded-xl px-3 py-2 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition ${
          isBroken
            ? 'bg-rose-50/90 border-rose-400'
            : url
            ? 'bg-slate-50/80 border-slate-200'
            : 'bg-slate-50/40 border-dashed border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
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

          {url ? (
            isBroken ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300 text-[10px] font-bold">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Link lỗi</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>Đã có</span>
              </span>
            )
          ) : (
            <span className="text-[11px] font-medium text-slate-400">Chưa gắn link</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {url ? (
            <>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => handleTogglePreview(voice, url)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50 ${
                  isThisPreviewPlaying
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
                title={isThisPreviewPlaying ? 'Dừng nghe thử' : `Nghe thử ${voiceLabel}`}
              >
                {isThisPreviewPlaying ? (
                  <Pause className="w-3 h-3 fill-current shrink-0" />
                ) : (
                  <Volume2 className="w-3 h-3 shrink-0" />
                )}
                <span>{isThisPreviewPlaying ? 'Dừng' : 'Nghe thử'}</span>
              </button>

              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => openEditorForVoice(voice)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                title={`Sửa link MP3 ${voiceLabel}`}
              >
                <Edit3 className="w-3 h-3 shrink-0" />
                <span>Sửa link</span>
              </button>

              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 transition"
                title="Mở link MP3"
              >
                <ExternalLink className="w-3 h-3" />
              </a>

              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => handleRemoveVoiceLink(voice)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50 ${
                  isThisConfirming
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white hover:bg-rose-50 text-rose-600 border-rose-200'
                }`}
                title={`Xóa link MP3 ${voiceLabel}`}
              >
                <Trash2 className="w-3 h-3 shrink-0" />
                <span>{isThisConfirming ? 'Xác nhận?' : 'Xóa'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => openEditorForVoice(voice)}
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white hover:bg-pink-50 text-pink-700 border border-pink-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
            >
              <Link2 className="w-3 h-3 shrink-0" />
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
        <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              Còn thiếu link MP3: <strong>{missingVoices.join(' / ')}</strong>
            </span>
          </span>
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={() => openEditorForVoice(!maleUrl ? 'male' : 'female')}
            className="min-h-[30px] px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition shrink-0 disabled:opacity-50"
          >
            <Link2 className="w-3 h-3 shrink-0" />
            <span>Dán link</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {renderVoiceRow('male', maleUrl)}
        {renderVoiceRow('female', femaleUrl)}
      </div>

      {editingVoice && (
        <form
          onSubmit={handleSaveSingleLink}
          className="p-2.5 rounded-xl bg-slate-50 border border-slate-300 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingVoice('male');
                setLinkInput(maleUrl);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border transition ${
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
                setLinkInput(femaleUrl);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border transition ${
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
            className="flex-1 min-w-0 min-h-[36px] bg-white border border-slate-300 focus:border-pink-500 rounded-lg px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
            autoFocus
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="submit"
              disabled={isBusy}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
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
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 text-xs font-semibold cursor-pointer"
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
}

export const AdminNovelMp3DrawerModal: React.FC<AdminNovelMp3DrawerModalProps> = ({
  novel,
  onClose,
  onChapterAudioUpdated,
  onBatchChaptersAudioUpdated,
}) => {
  const [chapters, setChapters] = useState<Chapter[]>(() =>
    Array.isArray(novel.chapters) ? [...novel.chapters] : []
  );
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

  // Page Link Health Check & Jump-to-Broken Chapter
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ checked: number; total: number }>({
    checked: 0,
    total: 0,
  });
  const checkAbortRef = useRef<boolean>(false);
  const [brokenLinksMap, setBrokenLinksMap] = useState<Record<string, BrokenVoiceState>>({});
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      checkAbortRef.current = true;
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingChapters(true);
    fetchChaptersForNovel(novel.id)
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          const sorted = [...list].sort((a, b) => Number(a.number) - Number(b.number));
          setChapters(sorted);
          const maxNum = sorted.reduce((acc, c) => Math.max(acc, Number(c.number) || 0), 1);
          setDeleteFromChapter(sorted[0]?.number || 1);
          setDeleteToChapter(maxNum);
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

  const sortedChapters = useMemo(() => {
    return [...(chapters || [])].sort((a, b) => Number(a.number) - Number(b.number));
  }, [chapters]);

  const { brokenEntries, brokenChapterIdsSet } = useMemo(() => {
    const entries: BrokenLinkEntry[] = [];
    const chapIds = new Set<string>();
    for (const ch of sortedChapters) {
      const state = brokenLinksMap[ch.id];
      if (!state) continue;
      if (state.male && getMaleAudioUrl(ch)) {
        entries.push({
          chapterId: ch.id,
          chapterNumber: Number(ch.number),
          chapterTitle: ch.title || `Chương ${ch.number}`,
          voice: 'male',
          voiceLabel: 'Nam Minh',
        });
        chapIds.add(ch.id);
      }
      if (state.female && getFemaleAudioUrl(ch)) {
        entries.push({
          chapterId: ch.id,
          chapterNumber: Number(ch.number),
          chapterTitle: ch.title || `Chương ${ch.number}`,
          voice: 'female',
          voiceLabel: 'Hằng Nga',
        });
        chapIds.add(ch.id);
      }
    }
    return { brokenEntries: entries, brokenChapterIdsSet: chapIds };
  }, [sortedChapters, brokenLinksMap]);

  useEffect(() => {
    if (voiceFilter === 'broken' && brokenChapterIdsSet.size === 0) {
      setVoiceFilter('all');
      setCurrentPage(1);
    }
  }, [voiceFilter, brokenChapterIdsSet.size]);

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
        const hasBrokenMale = Boolean(b?.male && hasMale);
        const hasBrokenFemale = Boolean(b?.female && hasFemale);
        if (!hasBrokenMale && !hasBrokenFemale) return false;
      }

      if (!q && !rawTrimmed) return true;
      const numMatch = String(ch.number) === rawTrimmed || String(ch.number).includes(rawTrimmed);
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
  }, [pageChapters, safeCurrentPage]);

  const handleJumpToBrokenChapter = (entry: BrokenLinkEntry) => {
    const nextFilter: VoiceFilterMode = voiceFilter === 'broken' ? 'broken' : 'all';
    const nextList = sortedChapters.filter((ch) => {
      if (nextFilter === 'broken') {
        const b = brokenLinksMap[ch.id];
        return Boolean((b?.male && getMaleAudioUrl(ch)) || (b?.female && getFemaleAudioUrl(ch)));
      }
      return true;
    });
    const idx = nextList.findIndex(
      (ch) => ch.id === entry.chapterId || Number(ch.number) === entry.chapterNumber
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
      if (Number(u.number) > 0) byNumber.set(Number(u.number), u);
    }
    setChapters((prev) =>
      prev.map((item) => {
        const matched = byId.get(item.id) || byNumber.get(Number(item.number));
        if (!matched) return item;
        return {
          ...item,
          audioUrl: matched.audioUrl,
          audioUrlMale: matched.audioUrlMale,
          audioUrlFemale: matched.audioUrlFemale,
        };
      })
    );
    if (onBatchChaptersAudioUpdated) {
      onBatchChaptersAudioUpdated(novel.id, updatedChaptersList);
    } else {
      for (const u of updatedChaptersList) {
        onChapterAudioUpdated(novel.id, u);
      }
    }
  };

  // Logic 1: Dán link MP3 hàng loạt
  const handleBulkPasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkReport(null);

    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkReport({
        type: 'error',
        message: 'Vui lòng dán ít nhất 1 dòng chứa đường dẫn MP3.',
        details: [],
      });
      return;
    }

    const chapterByNumber = new Map<number, Chapter>();
    for (const ch of sortedChapters) {
      chapterByNumber.set(Number(ch.number), ch);
    }

    let sequentialChapterNum = 1;
    const mappedByChapterKey = new Map<
      string,
      { chapter: Chapter; url: string }
    >();
    const issues: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ưu tiên 1: Chương <số> | <URL> (hỗ trợ |, :, -)
      const labeledMatch = line.match(
        /^(?:chương|chuong|c|hồi|hoi|chapter)\s*(\d+)(?:[^|\r\n]*?)\s*(?:\||:|-)\s*(https?:\/\/\S+)$/i
      );
      if (labeledMatch) {
        const chapNum = parseInt(labeledMatch[1], 10);
        const url = labeledMatch[2].trim();
        const targetChapter = chapterByNumber.get(chapNum);
        if (!targetChapter) {
          issues.push(`Dòng ${i + 1}: Không tìm thấy Chương ${chapNum} trong truyện.`);
          continue;
        }
        if (!isValidHttpUrl(url)) {
          issues.push(`Dòng ${i + 1}: Đường dẫn không hợp lệ.`);
          continue;
        }
        mappedByChapterKey.set(targetChapter.id, { chapter: targetChapter, url });
        continue;
      }

      // Ưu tiên 2: Chỉ có <URL> -> gán lần lượt từ Chương 1
      const bareUrlMatch = line.match(/^(https?:\/\/\S+)$/i);
      if (bareUrlMatch) {
        const chapNum = sequentialChapterNum++;
        const url = bareUrlMatch[1].trim();
        const targetChapter = chapterByNumber.get(chapNum);
        if (!targetChapter) {
          issues.push(
            `Dòng ${i + 1}: Không tìm thấy Chương ${chapNum} (khi gán tuần tự từ Chương 1).`
          );
          continue;
        }
        mappedByChapterKey.set(targetChapter.id, { chapter: targetChapter, url });
        continue;
      }

      issues.push(`Dòng ${i + 1}: Không nhận diện được định dạng ("${line.slice(0, 50)}...")`);
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

    setIsSavingBulk(true);
    try {
      const batchItems: ChapterAudioLinkBatchItem[] = entries.map(({ chapter, url }) => ({
        chapter,
        audioUrlMale: bulkVoice === 'male' ? url : undefined,
        audioUrlFemale: bulkVoice === 'female' ? url : undefined,
      }));

      await batchUpdateChapterAudioLinksInFirestore(novel.id, batchItems);

      const updatedChapters: Chapter[] = entries.map(({ chapter, url }) => ({
        ...chapter,
        audioUrlMale: bulkVoice === 'male' ? url : chapter.audioUrlMale,
        audioUrlFemale: bulkVoice === 'female' ? url : chapter.audioUrlFemale,
      }));

      setBrokenLinksMap((prev) => {
        const next = { ...prev };
        for (const ch of updatedChapters) {
          if (next[ch.id]) {
            next[ch.id] = {
              ...next[ch.id],
              [bulkVoice]: false,
            };
          }
        }
        return next;
      });

      applyBatchUpdatesToState(updatedChapters);

      const voiceLabel = bulkVoice === 'male' ? 'Nam Minh' : 'Hằng Nga';
      setBulkReport({
        type: 'success',
        message: `Đã ghép thành công ${updatedChapters.length} link MP3 cho giọng ${voiceLabel}${
          issues.length > 0 ? ` (${issues.length} dòng bị bỏ qua)` : ''
        }.`,
        details: issues.slice(0, 12),
      });
      if (issues.length === 0) {
        setBulkText('');
      }
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
      const num = Number(ch.number);
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
      const num = Number(ch.number);
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

      await batchUpdateChapterAudioLinksInFirestore(novel.id, batchItems);

      const updatedChapters: Chapter[] = targets.map((ch) => ({
        ...ch,
        audioUrl:
          deleteScope === 'male' || deleteScope === 'both' ? undefined : ch.audioUrl,
        audioUrlMale:
          deleteScope === 'male' || deleteScope === 'both' ? undefined : ch.audioUrlMale,
        audioUrlFemale:
          deleteScope === 'female' || deleteScope === 'both' ? undefined : ch.audioUrlFemale,
      }));

      setBrokenLinksMap((prev) => {
        const next = { ...prev };
        for (const ch of targets) {
          if (next[ch.id]) {
            next[ch.id] = {
              male: deleteScope === 'male' || deleteScope === 'both' ? false : next[ch.id].male,
              female:
                deleteScope === 'female' || deleteScope === 'both' ? false : next[ch.id].female,
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

  // Logic 3: Kiểm tra link hỏng trên trang hiện tại (tối đa 100 chương)
  const handleCheckLinksOnCurrentPage = async () => {
    if (isCheckingLinks) {
      checkAbortRef.current = true;
      return;
    }

    const tasks: { chapterId: string; voice: VoiceKey; url: string }[] = [];
    for (const ch of pageChapters) {
      const maleUrl = getMaleAudioUrl(ch);
      const femaleUrl = getFemaleAudioUrl(ch);
      if (maleUrl) tasks.push({ chapterId: ch.id, voice: 'male', url: maleUrl });
      if (femaleUrl) tasks.push({ chapterId: ch.id, voice: 'female', url: femaleUrl });
    }

    if (tasks.length === 0) {
      setToolbarMessage({
        type: 'warning',
        text: 'Trang hiện tại chưa có link MP3 nào để kiểm tra.',
      });
      return;
    }

    checkAbortRef.current = false;
    setIsCheckingLinks(true);
    setToolbarMessage(null);
    setCheckProgress({ checked: 0, total: tasks.length });

    let cursor = 0;
    let okCount = 0;
    let failCount = 0;
    const pageResults: Record<string, BrokenVoiceState> = {};

    const concurrency = Math.min(4, tasks.length);
    const worker = async () => {
      while (!checkAbortRef.current) {
        const idx = cursor++;
        if (idx >= tasks.length) break;
        const t = tasks[idx];
        const ok = await probeAudioUrlMetadata(t.url, 8000);
        if (checkAbortRef.current) break;

        if (!pageResults[t.chapterId]) {
          pageResults[t.chapterId] = {};
        }
        pageResults[t.chapterId][t.voice] = !ok;
        if (ok) okCount += 1;
        else failCount += 1;

        setCheckProgress((prev) => ({ ...prev, checked: prev.checked + 1 }));
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (!checkAbortRef.current) {
      setBrokenLinksMap((prev) => {
        const next = { ...prev };
        for (const [chId, state] of Object.entries(pageResults)) {
          next[chId] = { ...(next[chId] || {}), ...state };
        }
        return next;
      });
      setToolbarMessage({
        type: failCount > 0 ? 'warning' : 'success',
        text: `Đã kiểm tra ${tasks.length} link trang ${safeCurrentPage}: ${okCount} link hợp lệ, ${failCount} link lỗi.`,
        includeBrokenList: failCount > 0,
      });
    }
    setIsCheckingLinks(false);
  };

  // Logic 4: Xuất file dự phòng (.txt) chuẩn "Chương <số> | <url>"
  const handleExportTxtBackup = (voice: VoiceKey) => {
    setShowExportMenu(false);
    const lines: string[] = [];
    for (const ch of sortedChapters) {
      const url = voice === 'male' ? getMaleAudioUrl(ch) : getFemaleAudioUrl(ch);
      if (url) {
        lines.push(`Chương ${ch.number} | ${url}`);
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
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed transition"
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
                  className={`min-w-[34px] min-h-[34px] px-2 py-1 rounded-lg font-bold tabular-nums cursor-pointer transition ${
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
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed transition"
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
    <div className="fixed inset-0 z-[105] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-5xl max-h-[94dvh] bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden text-slate-900">
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
            onClick={onClose}
            aria-label="Đóng quản lý MP3"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar + Search + Filters */}
        <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary CTA: Dán link MP3 hàng loạt */}
            <button
              type="button"
              onClick={() => {
                setBulkReport(null);
                setShowBulkPasteModal((prev) => !prev);
                setShowBulkDeleteModal(false);
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition"
            >
              <ClipboardPaste className="w-4 h-4 shrink-0" />
              <span>Dán link MP3 hàng loạt</span>
            </button>

            {/* Tool 2: Kiểm tra link trang này */}
            <button
              type="button"
              onClick={handleCheckLinksOnCurrentPage}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition ${
                isCheckingLinks
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}
              title="Kiểm tra tốc độ & trạng thái toàn bộ link MP3 đang hiển thị ở trang hiện tại"
            >
              {isCheckingLinks ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                  <span className="tabular-nums">
                    Đang kiểm tra ({checkProgress.checked}/{checkProgress.total}) • Bấm để dừng
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Kiểm tra link trang này</span>
                </>
              )}
            </button>

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

          {toolbarMessage && (
            <div
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex flex-col gap-1.5 border ${
                toolbarMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : toolbarMessage.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  {toolbarMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{toolbarMessage.text}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setToolbarMessage(null)}
                  className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {toolbarMessage.includeBrokenList && brokenEntries.length > 0 && (
                <div className="pt-1.5 border-t border-amber-200/80 flex flex-wrap items-center gap-1.5 max-h-28 overflow-y-auto">
                  <span className="font-bold text-rose-700 shrink-0 tabular-nums">
                    {brokenEntries.length} link lỗi:
                  </span>
                  {brokenEntries.map((entry, idx) => (
                    <React.Fragment key={`${entry.chapterId}-${entry.voice}`}>
                      <button
                        type="button"
                        onClick={() => handleJumpToBrokenChapter(entry)}
                        className="inline-flex items-center px-2 py-0.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-bold text-[11px] cursor-pointer transition hover:underline underline-offset-2"
                        title={`Nhảy tới Chương ${entry.chapterNumber} để sửa link ${entry.voiceLabel}`}
                      >
                        Chương {entry.chapterNumber} ({entry.voiceLabel})
                      </button>
                      {idx < brokenEntries.length - 1 ? (
                        <span className="text-amber-700">,</span>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>
              )}
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
                  className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold border transition cursor-pointer tabular-nums ${
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
                  className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold border transition cursor-pointer tabular-nums inline-flex items-center gap-1 ${
                    voiceFilter === 'broken'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Link lỗi ({brokenChapterIdsSet.size})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chapters Body with Top & Bottom 100-chapter Pagination */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 bg-slate-50/70">
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
                  className={`p-3.5 rounded-2xl bg-white border shadow-2xs transition-all ${
                    highlightedChapterId === ch.id
                      ? 'border-rose-500 ring-2 ring-rose-300 bg-rose-50/30'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs sm:text-sm text-slate-900 break-words">
                        {ch.title || `Chương ${ch.number}`}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 tabular-nums">
                        Chương {ch.number}
                      </div>
                    </div>
                  </div>

                  <AdminChapterMp3Actions
                    novel={novel}
                    chapter={ch}
                    brokenVoices={brokenLinksMap[ch.id]}
                    externalEditRequest={editVoiceRequest}
                    onClearBrokenFlag={(chId, voice) => {
                      setBrokenLinksMap((prev) => {
                        if (!prev[chId]) return prev;
                        return {
                          ...prev,
                          [chId]: { ...prev[chId], [voice]: false },
                        };
                      });
                    }}
                    onAudioLinksUpdated={(targetChap, links) => {
                      const updated: Chapter = {
                        ...targetChap,
                        audioUrl: links.audioUrl,
                        audioUrlMale: links.audioUrlMale,
                        audioUrlFemale: links.audioUrlFemale,
                      };
                      setChapters((prev) =>
                        prev.map((item) =>
                          item.id === targetChap.id ||
                          Number(item.number) === Number(targetChap.number)
                            ? {
                                ...item,
                                audioUrl: links.audioUrl,
                                audioUrlMale: links.audioUrlMale,
                                audioUrlFemale: links.audioUrlFemale,
                              }
                            : item
                        )
                      );
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
