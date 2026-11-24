import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chapter, Novel } from '../types';
import {
  DEFAULT_GITHUB_AUDIO_REPO,
  getAdminGitHubConfig,
  saveAdminGitHubConfig,
  parseGitHubRepo,
  uploadMp3ToGitHub,
  generateChapterMp3FromText,
  extractChapterNumberFromMp3Filename,
  isValidMp3UploadFile,
  type AdminGitHubConfig,
} from '../utils/githubAudioStorage';
import { sleepWithAbort } from '../utils/audioChunker';
import {
  fetchChaptersForNovel,
  fetchFullChapterContent,
  updateChapterAudioUrlInFirestore,
} from '../firebase/services';
import {
  EDGE_TTS_VOICES,
  isDeviceFallbackVoice,
  normalizeEdgeVoiceId,
} from '../utils/rulesAndVoices';
import { useAudio } from '../contexts/AudioContext';
import {
  Github,
  KeyRound,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Upload,
  FolderUp,
  Sparkles,
  Volume2,
  Pause,
  Trash2,
  Loader2,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  Headphones,
  ExternalLink,
  Square,
} from 'lucide-react';

interface AdminGitHubConfigCardProps {
  defaultCollapsed?: boolean;
  onConfigSaved?: (config: AdminGitHubConfig) => void;
}

/**
 * Khung cấu hình kho lưu trữ GitHub (CHỈ HIỆN TRONG TRANG ADMIN)
 * Lưu hoàn toàn trong localStorage của trình duyệt Admin, tuyệt đối KHÔNG lưu lên Firestore.
 */
export const AdminGitHubConfigCard: React.FC<AdminGitHubConfigCardProps> = ({
  defaultCollapsed = false,
  onConfigSaved,
}) => {
  const initialConfig = useMemo(() => getAdminGitHubConfig(), []);
  const [repoInput, setRepoInput] = useState(initialConfig.repo);
  const [tokenInput, setTokenInput] = useState(initialConfig.token);
  const [showToken, setShowToken] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    defaultCollapsed && Boolean(initialConfig.repo && initialConfig.token)
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const isConfigured =
    Boolean(initialConfig.repo && initialConfig.token) ||
    Boolean(repoInput.trim() && tokenInput.trim());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSavedNotice(null);

    const trimmedRepo = repoInput.trim();
    const trimmedToken = tokenInput.trim();

    if (!trimmedRepo) {
      setErrorNotice(`Vui lòng nhập Tên kho GitHub (dạng ${DEFAULT_GITHUB_AUDIO_REPO}).`);
      return;
    }

    try {
      parseGitHubRepo(trimmedRepo);
      const saved = saveAdminGitHubConfig(trimmedRepo, trimmedToken);
      setRepoInput(saved.repo);
      setTokenInput(saved.token);
      setSavedNotice(
        saved.token
          ? 'Đã lưu cấu hình GitHub vào trình duyệt Admin!'
          : 'Đã lưu tên kho GitHub (chưa có Token PAT).'
      );
      onConfigSaved?.(saved);
      setTimeout(() => setSavedNotice(null), 3500);
    } catch (err: any) {
      setErrorNotice(err?.message || 'Tên kho GitHub không đúng định dạng.');
    }
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
      <div className="px-3.5 sm:px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-zinc-900 text-white flex items-center justify-center shrink-0 border border-slate-700">
            <Github className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-words">
              Cấu hình kho lưu trữ MP3 trên GitHub (Admin)
            </h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              Chỉ lưu cục bộ trong trình duyệt Admin (localStorage), không đẩy lên Firestore
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 flex-wrap">
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border max-w-full truncate ${
              repoInput.trim() && tokenInput.trim()
                ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                : 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700'
            }`}
          >
            {repoInput.trim() && tokenInput.trim() ? `Sẵn sàng: ${repoInput.trim()}` : 'Chưa cấu hình đủ'}
          </span>
          {defaultCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-white flex items-center gap-1 cursor-pointer"
            >
              <span>{isCollapsed ? 'Mở cài đặt' : 'Thu gọn'}</span>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <form onSubmit={handleSave} className="p-3.5 sm:p-4 space-y-3 bg-white dark:bg-zinc-900">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Tên kho GitHub (dạng {DEFAULT_GITHUB_AUDIO_REPO}):
              </label>
              <div className="relative">
                <Github className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder={DEFAULT_GITHUB_AUDIO_REPO}
                  className="w-full min-h-[42px] bg-slate-50 border border-slate-300 focus:border-pink-500 focus:bg-white rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition"
                />
              </div>
            </div>

            <div className="min-w-0">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                GitHub Token (PAT):
              </label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_... hoặc github_pat_..."
                  autoComplete="off"
                  className="w-full min-h-[42px] bg-slate-50 border border-slate-300 focus:border-pink-500 focus:bg-white rounded-xl pl-8 pr-10 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={showToken ? 'Ẩn Token' : 'Hiện Token'}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex-1 min-w-0">
              {errorNotice && (
                <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5 break-words">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{errorNotice}</span>
                </div>
              )}
              {savedNotice && (
                <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{savedNotice}</span>
                </div>
              )}
              {!errorNotice && !savedNotice && !isConfigured && (
                <p className="text-[11px] text-slate-500 leading-snug">
                  Repo public nhánh <code className="font-mono font-bold">main</code>, PAT có quyền{' '}
                  <code className="font-mono font-bold">Contents: Read &amp; Write</code>.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu cấu hình</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

interface AdminChapterMp3ActionsProps {
  novel: Novel;
  chapter: Chapter;
  preferredVoiceId?: string;
  disabledExternally?: boolean;
  onAudioUrlUpdated: (chapter: Chapter, nextAudioUrl: string | undefined) => void;
}

/**
 * 2 nút chức năng MP3 ở mỗi chương + nhãn "Đã có MP3" + Nghe thử / Xóa audioUrl
 */
export const AdminChapterMp3Actions: React.FC<AdminChapterMp3ActionsProps> = ({
  novel,
  chapter,
  preferredVoiceId,
  disabledExternally = false,
  onAudioUrlUpdated,
}) => {
  const audioContext = useAudio();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [justUploadedAt, setJustUploadedAt] = useState<number>(0);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
        previewAudioRef.current = null;
      }
    };
  }, []);

  const hasMp3 = Boolean(chapter.audioUrl && chapter.audioUrl.trim());
  const actionsDisabled = isBusy || disabledExternally;

  const resolveEffectiveVoice = () => {
    const raw = preferredVoiceId || audioContext.voiceId || 'vi-VN-NamMinhNeural';
    const normalized = normalizeEdgeVoiceId(raw);
    return isDeviceFallbackVoice(normalized) ? 'vi-VN-NamMinhNeural' : normalized;
  };

  const ensureGitHubConfigured = () => {
    const cfg = getAdminGitHubConfig();
    if (!cfg.repo || !cfg.token) {
      throw new Error(
        `Vui lòng nhập Tên kho GitHub (${DEFAULT_GITHUB_AUDIO_REPO}) và GitHub Token (PAT) ở khung cấu hình phía trên rồi bấm Lưu.`
      );
    }
    return cfg;
  };

  const handleUploadFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const cfg = ensureGitHubConfigured();
      if (!isValidMp3UploadFile(file)) {
        throw new Error('Vui lòng chọn file âm thanh định dạng .mp3 (audio/mpeg) hợp lệ.');
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsBusy(true);
      setProgressPercent(25);
      setStatusLabel(`Đang đọc file "${file.name}"...`);

      const arrayBuffer = await file.arrayBuffer();
      const mp3Bytes = new Uint8Array(arrayBuffer);

      setProgressPercent(55);
      const { cdnUrl } = await uploadMp3ToGitHub({
        repoInput: cfg.repo,
        token: cfg.token,
        storyId: novel.id,
        chapterId: chapter.id || `c-${chapter.number}`,
        mp3Bytes,
        commitMessage: `Upload MP3: ${novel.id} - Chương ${chapter.number}`,
        signal: controller.signal,
        onProgress: (pct, lbl) => {
          setProgressPercent(pct);
          setStatusLabel(lbl);
        },
      });

      setProgressPercent(98);
      setStatusLabel('Đang lưu link phát CDN vào Firestore...');
      try {
        await updateChapterAudioUrlInFirestore(novel.id, chapter, cdnUrl);
      } catch (fsErr: any) {
        throw new Error(
          `Đã đẩy MP3 lên GitHub nhưng lưu Firestore thất bại: ${fsErr?.message || 'Lỗi Firestore'}`
        );
      }

      setJustUploadedAt(Date.now());
      onAudioUrlUpdated(chapter, cdnUrl);
      setProgressPercent(100);
      setSuccessMsg('Đã tải file MP3 lên GitHub và lưu link phát CDN thành công!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setErrorMsg(err?.message || 'Lỗi tải MP3 lên GitHub (không xác định).');
      }
    } finally {
      abortControllerRef.current = null;
      setIsBusy(false);
    }
  };

  const handleAutoGenerateMp3 = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const cfg = ensureGitHubConfigured();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsBusy(true);
      setProgressPercent(2);
      setStatusLabel('Đang tải nội dung đầy đủ của chương...');

      let textContent = (chapter.content || '').trim();
      if (!textContent) {
        const fetched = await fetchFullChapterContent(
          novel.id,
          chapter.id,
          chapter.number,
          novel.updatedAt
        );
        textContent = (fetched?.content || '').trim();
      }

      if (!textContent) {
        throw new Error('Chương này chưa có nội dung văn bản để chuyển thành MP3.');
      }

      const selectedVoice = resolveEffectiveVoice();
      const mergedMp3Blob = await generateChapterMp3FromText({
        text: textContent,
        chapterTitle: chapter.title || `Chương ${chapter.number}`,
        voiceId: selectedVoice,
        signal: controller.signal,
        onProgress: ({ percent, label }) => {
          setProgressPercent(percent);
          setStatusLabel(label);
        },
      });

      setProgressPercent(90);
      setStatusLabel('Đang đẩy lên GitHub...');
      const { cdnUrl } = await uploadMp3ToGitHub({
        repoInput: cfg.repo,
        token: cfg.token,
        storyId: novel.id,
        chapterId: chapter.id || `c-${chapter.number}`,
        mp3Blob: mergedMp3Blob,
        commitMessage: `Generate TTS MP3 (${selectedVoice}): ${novel.id} - Chương ${chapter.number}`,
        signal: controller.signal,
        onProgress: (pct, lbl) => {
          setProgressPercent(pct);
          setStatusLabel(lbl);
        },
      });

      setProgressPercent(98);
      setStatusLabel('Đang lưu link phát CDN vào Firestore...');
      try {
        await updateChapterAudioUrlInFirestore(novel.id, chapter, cdnUrl);
      } catch (fsErr: any) {
        throw new Error(
          `Đã đẩy MP3 lên GitHub nhưng lưu Firestore thất bại: ${fsErr?.message || 'Lỗi Firestore'}`
        );
      }

      setJustUploadedAt(Date.now());
      onAudioUrlUpdated(chapter, cdnUrl);
      setProgressPercent(100);
      setSuccessMsg('Đã tạo MP3, ghép file, đẩy lên GitHub và lưu link CDN thành công!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setErrorMsg(err?.message || 'Lỗi khi tự tạo file MP3 từ nội dung chương.');
      }
    } finally {
      abortControllerRef.current = null;
      setIsBusy(false);
    }
  };

  const handleCancelOperation = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsBusy(false);
    setProgressPercent(0);
    setStatusLabel('');
  };

  const handleTogglePreview = () => {
    if (!chapter.audioUrl) return;

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.onended = () => setIsPreviewPlaying(false);
      previewAudioRef.current.onerror = () => {
        setIsPreviewPlaying(false);
        setErrorMsg(
          'Không phát được file MP3 (nếu vừa mới đẩy lên GitHub, CDN jsDelivr có thể cần vài giây để đồng bộ).'
        );
      };
    }

    const audioEl = previewAudioRef.current;
    if (isPreviewPlaying) {
      audioEl.pause();
      setIsPreviewPlaying(false);
      return;
    }

    setErrorMsg(null);
    const playUrl =
      justUploadedAt > 0 && Date.now() - justUploadedAt < 120000
        ? `${chapter.audioUrl}?t=${justUploadedAt}`
        : chapter.audioUrl;

    if (audioEl.src !== playUrl) {
      audioEl.src = playUrl;
    }
    audioEl
      .play()
      .then(() => setIsPreviewPlaying(true))
      .catch((err) => {
        setIsPreviewPlaying(false);
        setErrorMsg(`Không thể phát thử MP3: ${err?.message || 'Lỗi trình duyệt'}`);
      });
  };

  const handleRemoveAudioUrl = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }

    setConfirmClear(false);
    setErrorMsg(null);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    }

    try {
      setIsBusy(true);
      setStatusLabel('Đang xóa link audioUrl khỏi Firestore...');
      await updateChapterAudioUrlInFirestore(novel.id, chapter, null);
      onAudioUrlUpdated(chapter, undefined);
      setSuccessMsg('Đã xóa link MP3 khỏi chương này.');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể xóa audioUrl trên Firestore.');
    } finally {
      setIsBusy(false);
      setStatusLabel('');
    }
  };

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2 min-w-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        onChange={handleUploadFileChange}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs sm:text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Chọn file .mp3 có sẵn và đẩy lên GitHub"
        >
          <Upload className="w-3.5 h-3.5 text-slate-700 shrink-0" />
          <span>Tải MP3 lên</span>
        </button>

        <button
          type="button"
          disabled={actionsDisabled}
          onClick={handleAutoGenerateMp3}
          className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-xs sm:text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Chia nhỏ chương <= 400 ký tự, ghép TTS thành 1 file MP3 và đẩy lên GitHub"
        >
          {isBusy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-600 shrink-0" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-pink-600 shrink-0" />
          )}
          <span>Tự tạo MP3 từ chữ</span>
        </button>

        {hasMp3 && (
          <>
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={handleTogglePreview}
              className={`min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border text-xs sm:text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 ${
                isPreviewPlaying
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}
              title={isPreviewPlaying ? 'Dừng nghe thử' : 'Nghe thử file MP3 của chương'}
            >
              {isPreviewPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isPreviewPlaying ? 'Dừng thử' : 'Nghe thử'}</span>
            </button>

            <a
              href={chapter.audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 transition"
              title="Mở link MP3 CDN"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              disabled={actionsDisabled}
              onClick={handleRemoveAudioUrl}
              className={`min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border text-xs sm:text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 ${
                confirmClear
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
              }`}
              title="Xóa đường dẫn audioUrl của chương khỏi Firestore"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>{confirmClear ? 'Xác nhận xóa?' : 'Xóa MP3'}</span>
            </button>
          </>
        )}
      </div>

      {isBusy && (
        <div className="p-2.5 rounded-xl bg-pink-50/70 border border-pink-200 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-pink-800 min-w-0 break-words">
              {statusLabel || 'Đang xử lý audio MP3...'}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-black text-pink-700 tabular-nums">{progressPercent}%</span>
              <button
                type="button"
                onClick={handleCancelOperation}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-bold cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-pink-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all duration-200"
              style={{ width: `${Math.min(100, Math.max(4, progressPercent))}%` }}
            />
          </div>
        </div>
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
            className="text-rose-500 hover:text-rose-700 cursor-pointer p-1 shrink-0"
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

interface BulkUploadIssueItem {
  fileName: string;
  reason: string;
  type: 'error' | 'unmatched';
}

interface BulkUploadState {
  isRunning: boolean;
  wasCancelled: boolean;
  totalMatched: number;
  currentIndex: number;
  currentLabel: string;
  successCount: number;
  skippedCount: number;
  errorCount: number;
  unmatchedCount: number;
  ignoredNonMp3Count: number;
  issues: BulkUploadIssueItem[];
  summaryNotice: string | null;
}

const INITIAL_BULK_STATE: BulkUploadState = {
  isRunning: false,
  wasCancelled: false,
  totalMatched: 0,
  currentIndex: 0,
  currentLabel: '',
  successCount: 0,
  skippedCount: 0,
  errorCount: 0,
  unmatchedCount: 0,
  ignoredNonMp3Count: 0,
  issues: [],
  summaryNotice: null,
};

interface AdminNovelMp3DrawerModalProps {
  novel: Novel;
  onClose: () => void;
  onChapterAudioUpdated: (novelId: string, updatedChapter: Chapter) => void;
}

/**
 * Cửa sổ quản lý & tạo MP3 cho toàn bộ chương của 1 truyện ngay bên trong Trang Admin (Tab Quản lý truyện)
 * Hỗ trợ:
 * - Tải MP3 hàng loạt tuần tự an toàn (tự lọc .mp3, tách số chương theo regex, delay 300ms chống GitHub 409/rate limit)
 * - Tự tạo MP3 từ chữ (chia <= 400 ký tự, Netlify -> Vercel, ghép Blob ngay trên trình duyệt)
 * - Giao diện responsive mobile-first (< 640px không tràn ngang)
 */
export const AdminNovelMp3DrawerModal: React.FC<AdminNovelMp3DrawerModalProps> = ({
  novel,
  onClose,
  onChapterAudioUpdated,
}) => {
  const audioContext = useAudio();
  const [chapters, setChapters] = useState<Chapter[]>(() =>
    Array.isArray(novel.chapters) ? [...novel.chapters] : []
  );
  const chaptersRef = useRef<Chapter[]>(chapters);
  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [synthesisVoiceId, setSynthesisVoiceId] = useState<string>(() => {
    const normalized = normalizeEdgeVoiceId(audioContext.voiceId || 'vi-VN-NamMinhNeural');
    return isDeviceFallbackVoice(normalized) ? 'vi-VN-NamMinhNeural' : normalized;
  });

  // Bulk Upload state
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const bulkAbortRef = useRef<AbortController | null>(null);
  const [skipExistingMp3, setSkipExistingMp3] = useState<boolean>(true);
  const [bulkState, setBulkState] = useState<BulkUploadState>(INITIAL_BULK_STATE);
  const [bulkConfigError, setBulkConfigError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      bulkAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingChapters(true);
    fetchChaptersForNovel(novel.id)
      .then((fetched) => {
        if (!cancelled && Array.isArray(fetched) && fetched.length > 0) {
          setChapters(fetched);
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

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter(
      (c) =>
        (c.title || '').toLowerCase().includes(q) || String(c.number || '').includes(q)
    );
  }, [chapters, searchQuery]);

  const mp3ReadyCount = useMemo(
    () => chapters.filter((c) => Boolean(c.audioUrl && c.audioUrl.trim())).length,
    [chapters]
  );

  const handleUpdated = (targetChapter: Chapter, nextAudioUrl: string | undefined) => {
    const updatedChap: Chapter = { ...targetChapter, audioUrl: nextAudioUrl };
    setChapters((prev) => {
      const next = prev.map((c) =>
        c.id === targetChapter.id || Number(c.number) === Number(targetChapter.number)
          ? { ...c, audioUrl: nextAudioUrl }
          : c
      );
      chaptersRef.current = next;
      return next;
    });
    onChapterAudioUpdated(novel.id, updatedChap);
  };

  const handleCancelBulkUpload = () => {
    bulkAbortRef.current?.abort();
  };

  const handleBulkFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0) return;

    setBulkConfigError(null);

    const cfg = getAdminGitHubConfig();
    if (!cfg.repo || !cfg.token) {
      setBulkConfigError(
        `Vui lòng nhập Tên kho GitHub (${DEFAULT_GITHUB_AUDIO_REPO}) và GitHub Token (PAT) rồi bấm "Lưu cấu hình" trước khi tải MP3 hàng loạt.`
      );
      return;
    }

    try {
      parseGitHubRepo(cfg.repo);
    } catch (err: any) {
      setBulkConfigError(err?.message || 'Tên kho GitHub không hợp lệ.');
      return;
    }

    // 1. Lọc file .mp3 (bỏ qua .txt, .srt, ảnh...)
    const validMp3Files: File[] = [];
    let ignoredNonMp3Count = 0;
    for (const f of fileList) {
      if (isValidMp3UploadFile(f)) {
        validMp3Files.push(f);
      } else {
        ignoredNonMp3Count += 1;
      }
    }

    if (validMp3Files.length === 0) {
      setBulkConfigError('Không có file .mp3 hợp lệ nào trong danh sách vừa chọn (các file .txt, .srt... đã được tự động bỏ qua).');
      return;
    }

    // 2. Tạo bản đồ số chương hiện có của truyện
    const chapterByNumber = new Map<number, Chapter>();
    for (const ch of chaptersRef.current) {
      const num = Number(ch.number);
      if (Number.isFinite(num) && !chapterByNumber.has(num)) {
        chapterByNumber.set(num, ch);
      }
    }

    // 3. Tách số chương từ tên file & khớp chương
    const matchedQueue: Array<{ file: File; chapterNumber: number; chapter: Chapter }> = [];
    const seenChapterNumbers = new Set<number>();
    const initialIssues: BulkUploadIssueItem[] = [];
    let unmatchedCount = 0;

    // Sắp xếp tên file trước để xử lý nhất quán nếu lỡ chọn trùng số chương
    const sortedFiles = [...validMp3Files].sort((a, b) =>
      a.name.localeCompare(b.name, 'vi', { numeric: true })
    );

    for (const file of sortedFiles) {
      const chapNum = extractChapterNumberFromMp3Filename(file.name);
      if (chapNum === null) {
        unmatchedCount += 1;
        initialIssues.push({
          fileName: file.name,
          reason: 'Không tìm thấy số chương (vd: Chương_1, Chương 12, Chuong_01)',
          type: 'unmatched',
        });
        continue;
      }

      const matchedChapter = chapterByNumber.get(chapNum);
      if (!matchedChapter) {
        unmatchedCount += 1;
        initialIssues.push({
          fileName: file.name,
          reason: `Không tìm thấy Chương ${chapNum} trong truyện này`,
          type: 'unmatched',
        });
        continue;
      }

      if (seenChapterNumbers.has(chapNum)) {
        unmatchedCount += 1;
        initialIssues.push({
          fileName: file.name,
          reason: `Trùng số Chương ${chapNum} với một file MP3 khác đã chọn`,
          type: 'unmatched',
        });
        continue;
      }

      seenChapterNumbers.add(chapNum);
      matchedQueue.push({
        file,
        chapterNumber: chapNum,
        chapter: matchedChapter,
      });
    }

    // Sắp xếp tăng dần theo số chương
    matchedQueue.sort((a, b) => a.chapterNumber - b.chapterNumber);

    if (matchedQueue.length === 0) {
      setBulkState({
        isRunning: false,
        wasCancelled: false,
        totalMatched: 0,
        currentIndex: 0,
        currentLabel: 'Không có file MP3 nào khớp với danh sách chương của truyện.',
        successCount: 0,
        skippedCount: 0,
        errorCount: 0,
        unmatchedCount,
        ignoredNonMp3Count,
        issues: initialIssues,
        summaryNotice: `Đã quét ${validMp3Files.length} file MP3 nhưng không khớp chương nào.`,
      });
      return;
    }

    const controller = new AbortController();
    bulkAbortRef.current = controller;

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const issues: BulkUploadIssueItem[] = [...initialIssues];
    const totalMatched = matchedQueue.length;
    let wasCancelled = false;
    let stoppedByAuthError = false;

    setBulkState({
      isRunning: true,
      wasCancelled: false,
      totalMatched,
      currentIndex: 0,
      currentLabel: `Chuẩn bị tải ${totalMatched} file MP3 theo thứ tự tăng dần...`,
      successCount: 0,
      skippedCount: 0,
      errorCount: 0,
      unmatchedCount,
      ignoredNonMp3Count,
      issues: [...issues],
      summaryNotice: null,
    });

    // 4. BẮT BUỘC tải TUẦN TỰ từng file (for...of + await, TUYỆT ĐỐI KHÔNG dùng Promise.all)
    let index = 0;
    for (const item of matchedQueue) {
      index += 1;
      if (controller.signal.aborted) {
        wasCancelled = true;
        break;
      }

      const latestChapter =
        chaptersRef.current.find(
          (c) => c.id === item.chapter.id || Number(c.number) === Number(item.chapterNumber)
        ) || item.chapter;

      if (skipExistingMp3 && latestChapter.audioUrl && latestChapter.audioUrl.trim()) {
        skippedCount += 1;
        setBulkState({
          isRunning: true,
          wasCancelled: false,
          totalMatched,
          currentIndex: index,
          currentLabel: `Bỏ qua ${index}/${totalMatched} - Chương ${item.chapterNumber} (đã có MP3)`,
          successCount,
          skippedCount,
          errorCount,
          unmatchedCount,
          ignoredNonMp3Count,
          issues: [...issues],
          summaryNotice: null,
        });
        continue;
      }

      setBulkState({
        isRunning: true,
        wasCancelled: false,
        totalMatched,
        currentIndex: index,
        currentLabel: `Đang tải ${index}/${totalMatched} - Chương ${item.chapterNumber}...`,
        successCount,
        skippedCount,
        errorCount,
        unmatchedCount,
        ignoredNonMp3Count,
        issues: [...issues],
        summaryNotice: null,
      });

      try {
        const buffer = await item.file.arrayBuffer();
        if (controller.signal.aborted) {
          wasCancelled = true;
          break;
        }
        const mp3Bytes = new Uint8Array(buffer);

        const { cdnUrl } = await uploadMp3ToGitHub({
          repoInput: cfg.repo,
          token: cfg.token,
          storyId: novel.id,
          chapterId: latestChapter.id || `c-${latestChapter.number}`,
          mp3Bytes,
          commitMessage: `Bulk upload MP3: ${novel.id} - Chương ${latestChapter.number}`,
          signal: controller.signal,
        });

        await updateChapterAudioUrlInFirestore(novel.id, latestChapter, cdnUrl);

        // Cập nhật ngay trạng thái "Đã có MP3" cho từng chương vừa xong
        handleUpdated(latestChapter, cdnUrl);
        successCount += 1;

        setBulkState({
          isRunning: true,
          wasCancelled: false,
          totalMatched,
          currentIndex: index,
          currentLabel: `Đã xong ${index}/${totalMatched} - Chương ${item.chapterNumber}`,
          successCount,
          skippedCount,
          errorCount,
          unmatchedCount,
          ignoredNonMp3Count,
          issues: [...issues],
          summaryNotice: null,
        });

        // Nghỉ 300ms sau mỗi file đẩy thành công để chống xung đột commit 409 / rate limit GitHub
        if (index < totalMatched && !controller.signal.aborted) {
          await sleepWithAbort(300, controller.signal);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          wasCancelled = true;
          break;
        }
        const msg = err?.message || 'Lỗi tải lên không xác định';
        errorCount += 1;
        issues.push({
          fileName: `${item.file.name} (Chương ${item.chapterNumber})`,
          reason: msg,
          type: 'error',
        });

        setBulkState({
          isRunning: true,
          wasCancelled: false,
          totalMatched,
          currentIndex: index,
          currentLabel: `Lỗi tại ${index}/${totalMatched} - Chương ${item.chapterNumber}`,
          successCount,
          skippedCount,
          errorCount,
          unmatchedCount,
          ignoredNonMp3Count,
          issues: [...issues],
          summaryNotice: null,
        });

        // Nếu lỗi xác thực GitHub Token (401/403) thì dừng sớm để tránh lặp lỗi vô ích
        if (msg.includes('HTTP 401') || msg.includes('HTTP 403')) {
          stoppedByAuthError = true;
          break;
        }

        if (index < totalMatched && !controller.signal.aborted) {
          await sleepWithAbort(300, controller.signal).catch(() => {});
        }
      }
    }

    bulkAbortRef.current = null;
    const summaryNotice = stoppedByAuthError
      ? 'Đã dừng sớm do lỗi xác thực GitHub Token (HTTP 401/403). Vui lòng kiểm tra lại PAT.'
      : wasCancelled
      ? `Đã dừng tải hàng loạt (${successCount} thành công, ${skippedCount} bỏ qua, ${errorCount} lỗi).`
      : `Hoàn tất tải MP3 hàng loạt: ${successCount} thành công, ${skippedCount} bỏ qua, ${errorCount} lỗi, ${unmatchedCount} không khớp.`;

    setBulkState({
      isRunning: false,
      wasCancelled,
      totalMatched,
      currentIndex: index,
      currentLabel: summaryNotice,
      successCount,
      skippedCount,
      errorCount,
      unmatchedCount,
      ignoredNonMp3Count,
      issues: [...issues],
      summaryNotice,
    });
  };

  const bulkProgressPct =
    bulkState.totalMatched > 0
      ? Math.min(100, Math.round((bulkState.currentIndex / bulkState.totalMatched) * 100))
      : 0;

  const hasBulkActivity =
    bulkState.isRunning ||
    bulkState.summaryNotice !== null ||
    bulkState.issues.length > 0;

  return (
    <div
      className="fixed inset-0 z-[10005] bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => {
        if (!bulkState.isRunning) onClose();
      }}
    >
      <div
        className="w-full max-w-4xl h-[94dvh] sm:h-auto sm:max-h-[92vh] bg-slate-50 rounded-t-2xl sm:rounded-3xl border border-pink-200 shadow-2xl flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-2.5 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-sm sm:text-base text-slate-900 flex items-center gap-2 min-w-0">
              <Headphones className="w-4 h-4 text-pink-600 shrink-0" />
              <span className="truncate">Quản lý MP3 GitHub — {novel.title}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Đã có MP3: <strong className="text-emerald-700">{mp3ReadyCount}/{chapters.length}</strong> chương
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (bulkState.isRunning) {
                handleCancelBulkUpload();
              }
              onClose();
            }}
            className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition shrink-0"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 pb-28 sm:pb-32 space-y-3.5 sm:space-y-4">
          <AdminGitHubConfigCard defaultCollapsed />

          {/* Thanh công cụ responsive Mobile-First: xếp dọc trên <640px, không tràn ngang */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-3">
            <input
              ref={bulkFileInputRef}
              type="file"
              multiple
              accept=".mp3,audio/mpeg"
              onChange={handleBulkFilesSelected}
              className="hidden"
            />

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm nhanh theo tên hoặc số chương..."
                  className="w-full min-h-[42px] bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-pink-500 focus:bg-white"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700 whitespace-nowrap shrink-0">
                    Giọng tạo MP3:
                  </label>
                  <select
                    value={synthesisVoiceId}
                    onChange={(e) => setSynthesisVoiceId(e.target.value)}
                    disabled={bulkState.isRunning}
                    className="flex-1 sm:flex-none min-h-[42px] bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-pink-500 cursor-pointer disabled:opacity-50"
                  >
                    {EDGE_TTS_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.tag})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={bulkState.isRunning || chapters.length === 0}
                  onClick={() => {
                    setBulkConfigError(null);
                    bulkFileInputRef.current?.click();
                  }}
                  className="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Chọn nhiều file .mp3 (vd: Chương_1.mp3, Chuong_02.mp3...) để tự khớp chương và đẩy tuần tự lên GitHub"
                >
                  {bulkState.isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <FolderUp className="w-4 h-4 shrink-0" />
                  )}
                  <span>Tải MP3 hàng loạt</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none min-h-[32px]">
                <input
                  type="checkbox"
                  checked={skipExistingMp3}
                  disabled={bulkState.isRunning}
                  onChange={(e) => setSkipExistingMp3(e.target.checked)}
                  className="w-4 h-4 rounded accent-pink-600 cursor-pointer"
                />
                <span>Bỏ qua các chương đã có MP3</span>
              </label>

              <p className="text-[11px] text-slate-500 leading-snug">
                Chỉ nhận file <code className="font-mono font-bold">.mp3</code>, tự tách số chương (<code className="font-mono">Chương_1</code>, <code className="font-mono">Chuong_01</code>...) và đẩy tuần tự an toàn.
              </p>
            </div>

            {bulkConfigError && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start justify-between gap-2">
                <span className="flex items-start gap-1.5 min-w-0 break-words">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="break-words">{bulkConfigError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setBulkConfigError(null)}
                  className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {hasBulkActivity && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-pink-200/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2 min-w-0">
                    {bulkState.isRunning ? (
                      <Loader2 className="w-4 h-4 animate-spin text-pink-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <span className="break-words">{bulkState.currentLabel}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {bulkState.totalMatched > 0 && (
                      <span className="text-xs font-black text-pink-700 tabular-nums">
                        {bulkProgressPct}%
                      </span>
                    )}
                    {bulkState.isRunning ? (
                      <button
                        type="button"
                        onClick={handleCancelBulkUpload}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>Dừng/Hủy</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBulkState(INITIAL_BULK_STATE)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold cursor-pointer"
                      >
                        Đóng báo cáo
                      </button>
                    )}
                  </div>
                </div>

                {bulkState.totalMatched > 0 && (
                  <div className="h-2.5 w-full rounded-full bg-pink-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all duration-200"
                      style={{ width: `${Math.max(bulkState.isRunning ? 4 : 0, bulkProgressPct)}%` }}
                    />
                  </div>
                )}

                {/* Bộ đếm Thành công / Bỏ qua / Lỗi / Không khớp chương */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="px-2.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-[10px] font-bold text-emerald-700 uppercase">Thành công</div>
                    <div className="text-sm font-black text-emerald-800 tabular-nums">
                      {bulkState.successCount}
                    </div>
                  </div>
                  <div className="px-2.5 py-2 rounded-xl bg-slate-100 border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-600 uppercase">Bỏ qua</div>
                    <div className="text-sm font-black text-slate-800 tabular-nums">
                      {bulkState.skippedCount}
                    </div>
                  </div>
                  <div className="px-2.5 py-2 rounded-xl bg-rose-50 border border-rose-200">
                    <div className="text-[10px] font-bold text-rose-700 uppercase">Lỗi</div>
                    <div className="text-sm font-black text-rose-800 tabular-nums">
                      {bulkState.errorCount}
                    </div>
                  </div>
                  <div className="px-2.5 py-2 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="text-[10px] font-bold text-amber-800 uppercase">Không khớp</div>
                    <div className="text-sm font-black text-amber-900 tabular-nums">
                      {bulkState.unmatchedCount}
                    </div>
                  </div>
                </div>

                {bulkState.ignoredNonMp3Count > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Đã tự động bỏ qua {bulkState.ignoredNonMp3Count} file không phải định dạng .mp3 (.txt, .srt...).
                  </p>
                )}

                {bulkState.issues.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded-xl bg-white border border-slate-200 divide-y divide-slate-100 text-[11px]">
                    {bulkState.issues.map((issue, idx) => (
                      <div key={`${issue.fileName}-${idx}`} className="px-2.5 py-1.5 flex items-start gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] shrink-0 ${
                            issue.type === 'error'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {issue.type === 'error' ? 'Lỗi' : 'Không khớp'}
                        </span>
                        <div className="min-w-0 flex-1 break-words">
                          <span className="font-bold text-slate-800">{issue.fileName}:</span>{' '}
                          <span className="text-slate-600">{issue.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {isLoadingChapters && chapters.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-pink-600 mx-auto" />
              <p>Đang tải danh sách chương...</p>
            </div>
          ) : filteredChapters.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500">
              Không tìm thấy chương nào phù hợp.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredChapters.map((ch) => (
                <div
                  key={ch.id || `chap-${ch.number}`}
                  className="p-3 sm:p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs min-w-0"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 break-words">
                          {ch.title || `Chương ${ch.number}`}
                        </span>
                        {ch.audioUrl && (
                          <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full text-[10px] border border-emerald-300 inline-flex items-center gap-1 shrink-0">
                            <Headphones className="w-2.5 h-2.5" />
                            Đã có MP3
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 break-all">
                        Chương {ch.number} • ID: <code className="font-mono">{ch.id}</code>
                      </div>
                    </div>
                  </div>

                  <AdminChapterMp3Actions
                    novel={novel}
                    chapter={ch}
                    preferredVoiceId={synthesisVoiceId}
                    disabledExternally={bulkState.isRunning}
                    onAudioUrlUpdated={handleUpdated}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
