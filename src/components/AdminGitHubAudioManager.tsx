import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Chapter, Novel } from '../types';
import {
  getAdminGitHubConfig,
  saveAdminGitHubConfig,
  parseGitHubRepo,
  uploadMp3ToGitHub,
  generateChapterMp3FromText,
  type AdminGitHubConfig,
} from '../utils/githubAudioStorage';
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

  const isConfigured = Boolean(initialConfig.repo && initialConfig.token) || Boolean(repoInput.trim() && tokenInput.trim());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSavedNotice(null);

    const trimmedRepo = repoInput.trim();
    const trimmedToken = tokenInput.trim();

    if (!trimmedRepo) {
      setErrorNotice('Vui lòng nhập Tên kho GitHub (dạng username/daotam-audio).');
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
      <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-zinc-900 text-white flex items-center justify-center shrink-0 border border-slate-700">
            <Github className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
              Cấu hình kho lưu trữ MP3 trên GitHub (Admin)
            </h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
              Chỉ lưu cục bộ trong trình duyệt Admin (localStorage), tuyệt đối không đẩy lên Firestore
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
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
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-white flex items-center gap-1 cursor-pointer"
            >
              <span>{isCollapsed ? 'Mở cài đặt' : 'Thu gọn'}</span>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <form onSubmit={handleSave} className="p-4 space-y-3 bg-white dark:bg-zinc-900">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Tên kho GitHub (dạng username/daotam-audio):
              </label>
              <div className="relative">
                <Github className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="username/daotam-audio"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-pink-500 focus:bg-white rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition"
                />
              </div>
            </div>

            <div>
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
                  className="w-full bg-slate-50 border border-slate-300 focus:border-pink-500 focus:bg-white rounded-xl pl-8 pr-9 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={showToken ? 'Ẩn Token' : 'Hiện Token'}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              {errorNotice && (
                <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
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
                <p className="text-[11px] text-slate-500">
                  Cần tạo repo public trên GitHub (nhánh <code className="font-mono font-bold">main</code>) và cấp PAT có quyền <code className="font-mono font-bold">Contents: Read &amp; Write</code>.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu</span>
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
  onAudioUrlUpdated: (chapter: Chapter, nextAudioUrl: string | undefined) => void;
}

/**
 * 2 nút chức năng MP3 ở mỗi chương + nhãn "Đã có MP3" + Nghe thử / Xóa audioUrl
 */
export const AdminChapterMp3Actions: React.FC<AdminChapterMp3ActionsProps> = ({
  novel,
  chapter,
  preferredVoiceId,
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

  const resolveEffectiveVoice = () => {
    const raw = preferredVoiceId || audioContext.voiceId || 'vi-VN-NamMinhNeural';
    const normalized = normalizeEdgeVoiceId(raw);
    return isDeviceFallbackVoice(normalized) ? 'vi-VN-NamMinhNeural' : normalized;
  };

  const ensureGitHubConfigured = () => {
    const cfg = getAdminGitHubConfig();
    if (!cfg.repo || !cfg.token) {
      throw new Error(
        'Vui lòng nhập Tên kho GitHub và GitHub Token (PAT) ở khung cấu hình phía trên và bấm Lưu trước.'
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
      if (
        !file.name.toLowerCase().endsWith('.mp3') &&
        !file.type.includes('mpeg') &&
        !file.type.includes('audio')
      ) {
        throw new Error('Vui lòng chọn file âm thanh định dạng .mp3 hợp lệ.');
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
      const mergedMp3Bytes = await generateChapterMp3FromText({
        text: textContent,
        chapterTitle: chapter.title || `Chương ${chapter.number}`,
        voiceId: selectedVoice,
        signal: controller.signal,
        onProgress: ({ percent, label }) => {
          setProgressPercent(percent);
          setStatusLabel(label);
        },
      });

      const { cdnUrl } = await uploadMp3ToGitHub({
        repoInput: cfg.repo,
        token: cfg.token,
        storyId: novel.id,
        chapterId: chapter.id || `c-${chapter.number}`,
        mp3Bytes: mergedMp3Bytes,
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
      setSuccessMsg('Đã tạo MP3, đẩy lên GitHub và lưu link CDN thành công!');
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
    <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,audio/mpeg,audio/*"
        onChange={handleUploadFileChange}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {hasMp3 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold">
            <Headphones className="w-3 h-3" />
            <span>Đã có MP3</span>
          </span>
        )}

        <button
          type="button"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Chọn file .mp3 có sẵn và đẩy lên GitHub"
        >
          <Upload className="w-3.5 h-3.5 text-slate-700" />
          <span>Tải MP3 lên</span>
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleAutoGenerateMp3}
          className="px-2.5 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Chia nội dung chương thành đoạn ~600 ký tự, ghép TTS thành MP3 và đẩy lên GitHub"
        >
          {isBusy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-600" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-pink-600" />
          )}
          <span>Tự tạo MP3 từ chữ</span>
        </button>

        {hasMp3 && (
          <>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleTogglePreview}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50 ${
                isPreviewPlaying
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}
              title={isPreviewPlaying ? 'Dừng nghe thử' : 'Nghe thử file MP3 của chương'}
            >
              {isPreviewPlaying ? (
                <Pause className="w-3 h-3 fill-current" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span>{isPreviewPlaying ? 'Dừng thử' : 'Nghe thử'}</span>
            </button>

            <a
              href={chapter.audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200 transition"
              title="Mở link MP3 CDN"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleRemoveAudioUrl}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50 ${
                confirmClear
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
              }`}
              title="Xóa đường dẫn audioUrl của chương khỏi Firestore"
            >
              <Trash2 className="w-3 h-3" />
              <span>{confirmClear ? 'Xác nhận xóa MP3?' : 'Xóa MP3'}</span>
            </button>
          </>
        )}
      </div>

      {isBusy && (
        <div className="p-2.5 rounded-xl bg-pink-50/70 border border-pink-200 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-pink-800 truncate">
              {statusLabel || 'Đang xử lý audio MP3...'}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-black text-pink-700 tabular-nums">{progressPercent}%</span>
              <button
                type="button"
                onClick={handleCancelOperation}
                className="px-2 py-0.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold cursor-pointer"
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
        <div className="px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold flex items-start justify-between gap-2">
          <span className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
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
}

/**
 * Cửa sổ quản lý & tạo MP3 cho toàn bộ chương của 1 truyện ngay bên trong Trang Admin (Tab Quản lý truyện)
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
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [synthesisVoiceId, setSynthesisVoiceId] = useState<string>(() => {
    const normalized = normalizeEdgeVoiceId(audioContext.voiceId || 'vi-VN-NamMinhNeural');
    return isDeviceFallbackVoice(normalized) ? 'vi-VN-NamMinhNeural' : normalized;
  });

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
    setChapters((prev) =>
      prev.map((c) =>
        c.id === targetChapter.id || Number(c.number) === Number(targetChapter.number)
          ? { ...c, audioUrl: nextAudioUrl }
          : c
      )
    );
    onChapterAudioUpdated(novel.id, updatedChap);
  };

  return (
    <div
      className="fixed inset-0 z-[10005] bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] bg-slate-50 rounded-2xl sm:rounded-3xl border border-pink-200 shadow-2xl flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-black text-sm sm:text-base text-slate-900 truncate flex items-center gap-2">
              <Headphones className="w-4 h-4 text-pink-600 shrink-0" />
              <span>Quản lý MP3 GitHub — {novel.title}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Đã có MP3: <strong className="text-emerald-700">{mp3ReadyCount}/{chapters.length}</strong> chương
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition shrink-0"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-32 space-y-4">
          <AdminGitHubConfigCard defaultCollapsed />

          <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nhanh theo tên hoặc số chương..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-pink-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                Giọng tạo MP3:
              </label>
              <select
                value={synthesisVoiceId}
                onChange={(e) => setSynthesisVoiceId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-pink-500 cursor-pointer"
              >
                {EDGE_TTS_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.tag})
                  </option>
                ))}
              </select>
            </div>
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
                  className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                          {ch.title || `Chương ${ch.number}`}
                        </span>
                        {ch.audioUrl && (
                          <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full text-[10px] border border-emerald-300 inline-flex items-center gap-1">
                            <Headphones className="w-2.5 h-2.5" />
                            Đã có MP3
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Chương {ch.number} • ID: <code className="font-mono">{ch.id}</code>
                      </div>
                    </div>
                  </div>

                  <AdminChapterMp3Actions
                    novel={novel}
                    chapter={ch}
                    preferredVoiceId={synthesisVoiceId}
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
