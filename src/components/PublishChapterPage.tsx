import React, { useState, useEffect, useId, useMemo } from 'react';
import { Novel, Chapter } from '../types';
import { fetchChaptersForNovel } from '../firebase/services';
import {
  filterOutDummyChapters,
  formatScheduleFull,
  fromDatetimeLocalInput,
  getNovelLatestPublishAt,
  toDatetimeLocalInput,
} from '../utils/rulesAndVoices';
import { 
  ArrowLeft, 
  BookOpen, 
  FileText, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  Coins, 
  Lock, 
  Unlock, 
  Clipboard, 
  Trash2, 
  Info,
  Calendar,
  Layers,
  Check,
  Clock,
  AlertCircle,
  Wand2
} from 'lucide-react';

interface PublishChapterPageProps {
  novel: Novel;
  onClose: () => void;
  onSaveChapter: (novelId: string, chapterData: {
    title: string;
    number: number;
    content: string;
    isVip: boolean;
    priceXu: number;
    authorNote?: string;
    publishAt?: number;
    scheduledPublishAt?: number;
  }, isCompleted?: boolean) => Promise<void> | void;
  onViewChapterList?: (novel: Novel) => void;
  onHomeClick?: () => void;
}

export const PublishChapterPage: React.FC<PublishChapterPageProps> = ({
  novel,
  onClose,
  onSaveChapter,
  onViewChapterList,
  onHomeClick,
}) => {
  // 1. Quản lý danh sách chương hiện tại và đồng bộ trực tiếp từ Firestore
  const [currentChapters, setCurrentChapters] = useState<Chapter[]>(() => {
    return filterOutDummyChapters(Array.isArray(novel?.chapters) ? novel.chapters : []);
  });
  const currentMaxChapterNumber = (currentChapters?.length || 0) > 0 
    ? Math.max(...(currentChapters || []).map((c) => Number(c.number) || 0)) 
    : 0;
  
  const [chapterNumber, setChapterNumber] = useState<number>(currentMaxChapterNumber > 0 ? currentMaxChapterNumber + 1 : 1);
  const [chapterTitle, setChapterTitle] = useState<string>(`Chương ${currentMaxChapterNumber > 0 ? currentMaxChapterNumber + 1 : 1}: `);

  useEffect(() => {
    let isCancelled = false;
    fetchChaptersForNovel(novel.id).then((fetched) => {
      if (!isCancelled && Array.isArray(fetched) && (fetched?.length || 0) > 0) {
        const cleaned = filterOutDummyChapters(fetched) || [];
        setCurrentChapters(cleaned);
        const maxNum = (cleaned?.length || 0) > 0 ? Math.max(...(cleaned || []).map((c) => Number(c.number) || 0)) : 0;
        if (maxNum >= chapterNumber) {
          setChapterNumber(maxNum + 1);
          setChapterTitle(`Chương ${maxNum + 1}: `);
        }
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [novel.id]);
  const [content, setContent] = useState<string>('');
  const [isVip, setIsVip] = useState<boolean>(chapterNumber > 30);
  const [priceXu, setPriceXu] = useState<number>(2);
  const [authorNote, setAuthorNote] = useState<string>('');
  const [isCompletedNovel, setIsCompletedNovel] = useState<boolean>(
    novel.status === 'Hoàn thành' || novel.status === 'Full'
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{
    chapterNumber: number;
    title: string;
    wordCount: number;
    publishAt?: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const fileInputId = useId();

  // Cấu hình Lịch đăng chương
  const existingMaxPublishAt = useMemo(
    () => getNovelLatestPublishAt(novel, currentChapters),
    [novel, currentChapters]
  );
  const [scheduleMode, setScheduleMode] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduleInputStr, setScheduleInputStr] = useState<string>(() =>
    toDatetimeLocalInput(Math.max(Date.now() + 30 * 60_000, getNovelLatestPublishAt(novel, currentChapters) + 60_000))
  );

  useEffect(() => {
    const minValid = Math.max(Date.now() + 30 * 60_000, existingMaxPublishAt + 60_000);
    setScheduleInputStr((prev) => {
      const parsed = fromDatetimeLocalInput(prev);
      if (!parsed || (existingMaxPublishAt > 0 && parsed < existingMaxPublishAt + 60_000)) {
        return toDatetimeLocalInput(minValid);
      }
      return prev;
    });
  }, [existingMaxPublishAt]);

  const scheduledTimestamp = scheduleMode === 'scheduled' ? fromDatetimeLocalInput(scheduleInputStr) : undefined;
  const scheduleError = useMemo(() => {
    if (scheduleMode !== 'scheduled') return '';
    if (!scheduledTimestamp) return 'Vui lòng chọn ngày và giờ xuất bản hợp lệ.';
    if (existingMaxPublishAt > 0 && scheduledTimestamp < existingMaxPublishAt + 60_000) {
      return `Thời gian hẹn giờ phải trễ hơn mốc đã hẹn cao nhất của truyện ít nhất 1 phút (${formatScheduleFull(existingMaxPublishAt + 60_000)}).`;
    }
    return '';
  }, [scheduleMode, scheduledTimestamp, existingMaxPublishAt]);

  const handleAutoFixSchedule = () => {
    const nextValid = Math.max(Date.now() + 60_000, existingMaxPublishAt + 60_000);
    setScheduleInputStr(toDatetimeLocalInput(nextValid));
  };

  // Word count & Character count
  const wordCount = (content || '').trim() ? (content.trim().split(/\s+/).filter(Boolean)?.length || 0) : 0;
  const charCount = content?.length || 0;

  // Thay đổi số thứ tự chương -> tự động gợi ý cập nhật lại tiêu đề nếu chưa gõ quá nhiều
  const handleChapterNumberChange = (newNum: number) => {
    setChapterNumber(newNum);
    // Nếu tiêu đề hiện tại đang theo format "Chương X: ..." thì tự đổi X thành newNum
    const regex = /^Chương\s+\d+:\s*(.*)$/i;
    const match = chapterTitle.match(regex);
    if (match) {
      setChapterTitle(`Chương ${newNum}: ${match[1] || ''}`);
    } else if (!chapterTitle.trim() || chapterTitle.startsWith('Chương')) {
      setChapterTitle(`Chương ${newNum}: `);
    }
  };

  // Tải lên tệp .txt từ máy tính
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Lấy tên tệp làm gợi ý tiêu đề nếu phù hợp
    const rawFileName = file.name.replace(/\.[^/.]+$/, '');
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setContent(text);
        if (!chapterTitle.replace(/^Chương\s+\d+:\s*/i, '').trim()) {
          setChapterTitle(`Chương ${chapterNumber}: ${rawFileName}`);
        }
      }
    };
    reader.readAsText(file, 'UTF-8');
    // Reset file input
    e.target.value = '';
  };

  // Dán nhanh từ Clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setContent((prev) => (prev ? prev + '\n\n' + text : text));
      }
    } catch {
      setErrorMsg('Không thể truy cập bộ nhớ tạm. Bạn hãy dùng phím tắt Ctrl+V (hoặc Cmd+V).');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  // Xuất bản chương
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!chapterTitle.trim()) {
      setErrorMsg('Vui lòng nhập tiêu đề chương.');
      return;
    }

    if (!content.trim()) {
      setErrorMsg('Vui lòng nhập nội dung chương.');
      return;
    }

    if (chapterNumber <= 0) {
      setErrorMsg('Số thứ tự chương phải lớn hơn 0.');
      return;
    }

    if (scheduleMode === 'scheduled' && scheduleError) {
      setErrorMsg(scheduleError);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    // Watchdog timer 15s để không bao giờ bị xoay vô tận
    const watchdog = setTimeout(() => {
      setIsSubmitting(false);
      setErrorMsg('Kết nối máy chủ bị chậm. Chương đã được lưu vào bộ nhớ tạm thời của máy, vui lòng bấm thử lại hoặc kiểm tra danh sách chương.');
    }, 15000);

    try {
      const effectivePublishAt = scheduleMode === 'scheduled' ? scheduledTimestamp : undefined;
      await onSaveChapter(novel.id, {
        title: chapterTitle.trim(),
        number: chapterNumber,
        content: content.trim(),
        isVip,
        priceXu: isVip ? priceXu : 0,
        authorNote: authorNote.trim() || undefined,
        ...(effectivePublishAt
          ? { publishAt: effectivePublishAt, scheduledPublishAt: effectivePublishAt }
          : {}),
      }, isCompletedNovel);

      const newChapItem: Chapter = {
        id: `${novel.id}-c${chapterNumber}-${Date.now()}`,
        number: chapterNumber,
        title: chapterTitle.trim(),
        slug: `chuong-${chapterNumber}`,
        content: content.trim(),
        wordCount,
        publishedDate: new Date().toISOString().split('T')[0],
        isVip,
        priceXu: isVip ? priceXu : 0,
        ...(effectivePublishAt
          ? { publishAt: effectivePublishAt, scheduledPublishAt: effectivePublishAt }
          : {}),
      };

      setCurrentChapters((prev) => {
        const nextList = [...(prev || []).filter((c) => Number(c.number) !== chapterNumber), newChapItem].sort(
          (a, b) => (Number(a.number) || 0) - (Number(b.number) || 0)
        );
        return nextList;
      });

      setSuccessInfo({
        chapterNumber,
        title: chapterTitle.trim(),
        wordCount,
        publishAt: effectivePublishAt,
      });
    } catch (err: any) {
      console.error('Lỗi khi đăng chương mới:', err);
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi lưu chương. Vui lòng thử lại!');
    } finally {
      clearTimeout(watchdog);
      setIsSubmitting(false);
    }
  };

  // Chuẩn bị form cho chương tiếp theo sau khi đăng thành công
  const handleContinueNextChapter = () => {
    const nextNum = (successInfo ? successInfo.chapterNumber : chapterNumber) + 1;
    setChapterNumber(nextNum);
    setChapterTitle(`Chương ${nextNum}: `);
    setContent('');
    setAuthorNote('');
    if (scheduleMode === 'scheduled') {
      const baseMs = Math.max(scheduledTimestamp || Date.now(), existingMaxPublishAt);
      setScheduleInputStr(toDatetimeLocalInput(baseMs + 60 * 60_000));
    }
    setSuccessInfo(null);
    setErrorMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-6 sm:py-8 px-4 sm:px-6 lg:px-8 text-slate-800 dark:text-slate-100 transition-colors">
      <div className="max-w-5xl mx-auto">
        
        {/* Breadcrumb & Navigation Bar (Chuẩn phong cách Tủ truyện > Truyện của bạn) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 flex-wrap">
            <button 
              type="button"
              onClick={onHomeClick}
              className="hover:text-blue-600 dark:hover:text-cyan-400 transition cursor-pointer"
            >
              Trang chủ
            </button>
            <span>&gt;</span>
            <button 
              type="button"
              onClick={onClose}
              className="hover:text-blue-600 dark:hover:text-cyan-400 transition cursor-pointer font-medium"
            >
              Tủ truyện
            </button>
            <span>&gt;</span>
            <button 
              type="button"
              onClick={onClose}
              className="hover:text-blue-600 dark:hover:text-cyan-400 transition cursor-pointer font-medium"
            >
              Truyện của bạn
            </button>
            <span>&gt;</span>
            <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-[300px]">
              {novel.title}
            </span>
            <span>&gt;</span>
            <span className="font-bold text-rose-600 dark:text-rose-400">
              Đăng chương mới
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại trang trước</span>
          </button>
        </div>

        {/* Thông báo đăng thành công */}
        {successInfo && (
          <div className="mb-6 p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 shadow-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/30">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-lg font-black text-emerald-800 dark:text-emerald-300">
                  🎉 Xuất bản thành công Chương {successInfo.chapterNumber}!
                </h3>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 mt-1">
                  &ldquo;{successInfo.title}&rdquo; • {successInfo.wordCount.toLocaleString()} từ
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  {successInfo.publishAt
                    ? `Chương đã được lên lịch tự động xuất bản vào lúc ${formatScheduleFull(successInfo.publishAt)}. Độc giả sẽ thấy chương này khi đến giờ hẹn.`
                    : 'Chương đã được cập nhật trực tiếp vào bộ truyện và độc giả có thể đọc ngay bây giờ.'}
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleContinueNextChapter}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <span>+ Đăng tiếp Chương {successInfo.chapterNumber + 1}</span>
                  </button>

                  {onViewChapterList && (
                    <button
                      type="button"
                      onClick={() => {
                        const latestCh = (currentChapters?.length || 0) > 0 ? currentChapters[(currentChapters?.length || 0) - 1] : null;
                        const chTitle = successInfo?.title 
                          ? `Chương ${successInfo.chapterNumber}: ${successInfo.title}`
                          : (latestCh ? `Chương ${latestCh.number}: ${latestCh.title}` : undefined);
                        const updatedNovel: Novel = {
                          ...novel,
                          chapters: currentChapters || [],
                          totalChapters: Math.max(novel.totalChapters || 0, currentChapters?.length || 0),
                          latestChapterTitle: chTitle,
                          latestChapterNumber: Math.max((novel as any).latestChapterNumber || 0, successInfo?.chapterNumber || latestCh?.number || 0),
                          lastUpdated: 'Vừa xong',
                        };
                        onViewChapterList(updatedNovel);
                      }}
                      className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/50 text-xs font-bold transition cursor-pointer"
                    >
                      <span>Xem danh sách chương</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
                  >
                    <span>Về &ldquo;Truyện của bạn&rdquo;</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Thông tin tác phẩm & Box chính */}
        <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-8">
          
          {/* Header của Khung đăng chương */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-rose-50 via-white to-pink-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                alt={novel.title}
                className="w-14 h-20 object-cover rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 flex-shrink-0"
              />
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-[11px] font-bold mb-1">
                  Soạn thảo &amp; Phát hành chương
                </span>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">
                  {novel.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400 mt-1">
                  <span>Tác giả: <strong className="text-slate-800 dark:text-slate-200">{novel.author}</strong></span>
                  <span>•</span>
                  <span>Hiện có: <strong className="text-rose-600 dark:text-rose-400">{currentMaxChapterNumber} chương</strong></span>
                  <span>•</span>
                  <span>Chương mới nhất kế tiếp: <strong className="text-blue-600 dark:text-cyan-400">Chương {currentMaxChapterNumber + 1}</strong></span>
                </div>
              </div>
            </div>

            {/* Trạng thái VIP gợi ý */}
            <div className="bg-white/80 dark:bg-slate-700/60 p-3 rounded-xl border border-slate-200 dark:border-slate-600 text-xs text-right hidden md:block">
              <div className="text-slate-500 dark:text-slate-400">Hệ thống Đạo Tâm</div>
              <div className="font-bold text-slate-800 dark:text-slate-100">Đồng bộ tự động &amp; Bảo mật DRM</div>
            </div>
          </div>

          {/* Form nội dung chương mới */}
          <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-6">
            
            {/* Cảnh báo nền vàng khi đang xử lý lưu lên Firebase */}
            {isSubmitting && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 text-amber-950 dark:text-amber-200 text-xs sm:text-sm font-bold flex items-center gap-3 shadow-xs animate-pulse">
                <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div className="flex-1">
                  <span>⚡ Đang lưu chương lên hệ thống... Vui lòng không nhấn liên tục hoặc làm mới trang!</span>
                </div>
              </div>
            )}

            {/* Cảnh báo nền vàng khi phát hiện lỗi */}
            {errorMsg && (
              <div className="p-4 rounded-xl bg-amber-100 dark:bg-amber-950/70 border-2 border-amber-500 text-amber-950 dark:text-amber-200 text-xs sm:text-sm font-bold flex items-start gap-2.5 shadow-xs">
                <Info className="w-5 h-5 flex-shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-black uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-0.5">⚠️ Thông báo lưu dữ liệu:</div>
                  <div className="font-semibold text-amber-900 dark:text-amber-100">{errorMsg}</div>
                </div>
              </div>
            )}

            {/* Hàng 1: Số thứ tự chương & Tiêu đề chương */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              
              {/* Ô 1: Số thứ tự chương (Tự động là số tiếp theo) */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Số thứ tự chương <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={chapterNumber}
                    onChange={(e) => handleChapterNumberChange(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="VD: 25"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 pointer-events-none">
                    Chương
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Đã tự động tính: <strong>Chương {currentMaxChapterNumber + 1}</strong>
                </p>
              </div>

              {/* Ô 2: Tiêu đề chương */}
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên / Tiêu đề chương <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  placeholder={`VD: Chương ${chapterNumber}: Khởi đầu mới...`}
                  required
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Gợi ý: Giữ định dạng <code>Chương {chapterNumber}: [Tên chương]</code> để mục lục chuẩn đẹp.
                </p>
              </div>
            </div>

            {/* Hàng 2: Thiết lập Xu / Chế độ Miễn phí & VIP */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Phân loại chương:
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsVip(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      !isVip
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Miễn phí (0 Xu)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsVip(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      isVip
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Chương VIP (Tính Xu)</span>
                  </button>
                </div>
              </div>

              {isVip && (
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-500" />
                    <span>Giá mở khóa:</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 5, 8].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setPriceXu(amount)}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                          priceXu === amount
                            ? 'bg-amber-500 text-white ring-2 ring-amber-400/50'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {amount} Xu
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-1">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={priceXu}
                        onChange={(e) => setPriceXu(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 text-xs font-bold text-center text-slate-900 dark:text-white"
                      />
                      <span className="text-xs font-semibold text-slate-500">Xu</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Hàng 3: Ô nhập nội dung chương & Thanh công cụ tiện ích */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-rose-500" />
                  <span>Nội dung chương truyện</span>
                  <span className="text-rose-500">*</span>
                </label>

                {/* Các nút tiện ích: Tải file .txt, Dán từ clipboard, Xóa trắng */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  
                  {/* Tải lên file .txt */}
                  <label
                    htmlFor={fileInputId}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title="Chọn file văn bản .txt từ máy tính để tự động điền"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Tải tệp .txt</span>
                  </label>
                  <input
                    id={fileInputId}
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {/* Dán từ Clipboard */}
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    <span>Dán nhanh</span>
                  </button>

                  {/* Xóa trắng */}
                  {(content?.length || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ nội dung đã nhập?')) {
                          setContent('');
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa trắng</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Textarea nội dung */}
              <div className="relative">
                <textarea
                  rows={16}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-2xl p-4 text-sm text-slate-900 dark:text-slate-100 leading-relaxed font-normal focus:outline-none focus:ring-2 focus:ring-rose-500 scrollbar-thin resize-y"
                  placeholder="Nhập hoặc dán toàn bộ nội dung của chương mới vào đây. Hệ thống tự động phân tách đoạn văn và định dạng chuẩn đọc sách..."
                  required
                />
              </div>

              {/* Thống kê từ & ký tự */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1.5 px-1">
                <div className="flex items-center gap-3">
                  <span>Số từ: <strong className="text-slate-800 dark:text-slate-200">{wordCount.toLocaleString()} từ</strong></span>
                  <span>•</span>
                  <span>Ký tự: <strong className="text-slate-800 dark:text-slate-200">{charCount.toLocaleString()} ký tự</strong></span>
                </div>
                <div>
                  {wordCount < 500 && wordCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      (Chương dưới 500 từ hơi ngắn)
                    </span>
                  )}
                  {wordCount >= 1000 && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Độ dài tiêu chuẩn
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Hàng 4: Lời tác giả muốn nói / Ghi chú (Tùy chọn) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Lời nhắn của tác giả / Ghi chú cuối chương (Không bắt buộc)
              </label>
              <textarea
                rows={2}
                value={authorNote}
                onChange={(e) => setAuthorNote(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder="VD: Cảm ơn các đạo hữu đã theo dõi. Nhớ thả hoa và đánh giá 5 sao ủng hộ nhé!"
              />
            </div>

            {/* Tùy chọn trạng thái truyện: Đang ra vs Hoàn thành (Full) */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500" />
                  Đánh dấu tác phẩm đã hoàn thành (Full bộ)
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Khi bật, truyện sẽ hiển thị huy hiệu "Full" (xanh lá) trên trang chủ, bảng xếp hạng và danh mục.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCompletedNovel}
                  onChange={(e) => setIsCompletedNovel(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Cấu hình Lịch đăng chương */}
            <div className={`p-4 rounded-xl border-2 space-y-3 ${
              scheduleError
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500'
                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <Clock className="w-4 h-4 text-pink-500 flex-shrink-0" />
                  <span>Cấu hình Lịch đăng chương</span>
                </div>
                {existingMaxPublishAt > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                    <Calendar className="w-3 h-3" />
                    <span>Mốc cao nhất đã hẹn: {formatScheduleFull(existingMaxPublishAt)}</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode('immediate')}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                    scheduleMode === 'immediate'
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Đăng ngay lập tức</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('scheduled')}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                    scheduleMode === 'scheduled'
                      ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Lên lịch đăng tự động</span>
                </button>
              </div>

              {scheduleMode === 'scheduled' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Ngày giờ xuất bản chương này:
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleInputStr}
                      onChange={(e) => setScheduleInputStr(e.target.value)}
                      className={`w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl border bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white focus:outline-none ${
                        scheduleError ? 'border-rose-500' : 'border-slate-300 dark:border-slate-600 focus:border-pink-500'
                      }`}
                    />
                  </div>
                  {scheduleError && (
                    <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-400 text-rose-900 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                        <span className="font-bold">{scheduleError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoFixSchedule}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Tự động sắp xếp lại giờ tăng dần</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Nút hành động chính */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                Hủy / Quay lại
              </button>

              <div className="w-full sm:w-auto flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || !chapterTitle.trim() || !content.trim() || Boolean(scheduleError)}
                  className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 active:from-rose-700 active:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none text-white font-black text-sm shadow-md shadow-rose-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Đang xuất bản chương {chapterNumber}...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {scheduleMode === 'scheduled'
                          ? `Lên lịch Chương ${chapterNumber}`
                          : `Xuất bản Chương ${chapterNumber} ngay`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </form>
        </div>

      </div>
    </div>
  );
};
