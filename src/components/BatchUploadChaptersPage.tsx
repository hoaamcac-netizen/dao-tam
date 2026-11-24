import React, { useState, useMemo, useEffect } from 'react';
import { Novel, Chapter } from '../types';
import { getLatestChapterNumberFromFirestore } from '../firebase/services';
import { safeSetItem } from '../utils/safeStorage';
import { filterOutDummyChapters } from '../utils/rulesAndVoices';
import { 
  ArrowLeft, 
  BookOpen, 
  CheckCircle2, 
  Coins, 
  Copy, 
  FileText, 
  Home, 
  Lock, 
  Plus, 
  Save, 
  Sparkles, 
  Trash2, 
  Unlock, 
  Upload, 
  Eye, 
  AlertCircle,
  HelpCircle,
  Check
} from 'lucide-react';

export interface BatchUploadChaptersPageProps {
  novel: Novel;
  onClose: () => void;
  onSaveBatchChapters: (
    novelId: string,
    chapters: Chapter[],
    isCompleted?: boolean,
    onProgress?: (savedCount: number, totalCount: number) => void
  ) => Promise<void> | void;
  onHomeClick?: () => void;
}

export interface ParsedChapterItem {
  id: string;
  number: number;
  title: string;
  content: string;
  wordCount: number;
  isVip: boolean;
  priceXu: number;
}

export const BatchUploadChaptersPage: React.FC<BatchUploadChaptersPageProps> = ({
  novel,
  onClose,
  onSaveBatchChapters,
  onHomeClick,
}) => {
  // Lọc chỉ lấy các chương thực tế đã đăng (loại bỏ dummy/placeholder chapters)
  const cleanExistingChapters = useMemo(() => {
    return filterOutDummyChapters(novel.chapters || []);
  }, [novel.chapters]);

  // Existing count chỉ tính từ các chương thực tế đã đăng. Truyện mới chưa đăng chương nào => 0
  const existingCount = (cleanExistingChapters?.length || 0) > 0
    ? Math.max(...(cleanExistingChapters || []).map((c) => Number(c.number) || 0))
    : 0;

  // Truyện mới chưa đăng chương nào phải luôn bắt đầu bằng số 1
  const nextStartNumber = existingCount > 0 ? existingCount + 1 : 1;

  // Toggle Hoàn thành (Full bộ)
  const [isCompletedNovel, setIsCompletedNovel] = useState<boolean>(
    novel.status === 'Hoàn thành' || novel.status === 'Full'
  );

  // Textarea input
  const [rawText, setRawText] = useState('');
  const [parsedChapters, setParsedChapters] = useState<ParsedChapterItem[]>([]);

  // Start numbering mode: 'continue' (starts at existingCount + 1) or 'keep_parsed' (uses numbers from text)
  const [numberingMode, setNumberingMode] = useState<'continue' | 'keep_parsed'>('continue');
  const [customStartNum, setCustomStartNum] = useState<number>(nextStartNumber);

  useEffect(() => {
    let cancelled = false;
    getLatestChapterNumberFromFirestore(novel.id).then((topNum) => {
      if (!cancelled) {
        if (topNum > 0) {
          setCustomStartNum(topNum + 1);
        } else if ((cleanExistingChapters?.length || 0) === 0) {
          // Truyện mới chưa đăng chương nào luôn bắt đầu bằng số 1
          setCustomStartNum(1);
        }
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [novel.id, cleanExistingChapters?.length]);

  // VIP Configuration States
  // Option 1: All 0 Xu (Free)
  const [isAllFree, setIsAllFree] = useState<boolean>(false);

  // Option 2: Set VIP from chapter X with fixed price (Để trống mặc định, ai muốn điền gì thì điền)
  const [isBatchVipEnabled, setIsBatchVipEnabled] = useState<boolean>(true);
  const [vipStartChapter, setVipStartChapter] = useState<string>('');
  const [fixedVipPrice, setFixedVipPrice] = useState<string>('');

  // Preview single chapter modal
  const [previewChapter, setPreviewChapter] = useState<ParsedChapterItem | null>(null);
  const [parsedPage, setParsedPage] = useState<number>(1);

  // Status & Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ saved: number; total: number } | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Function to parse the raw text into chapters
  const parseChaptersFromText = (
    text: string, 
    mode: 'continue' | 'keep_parsed', 
    startNum: number,
    allFree: boolean,
    vipFromStr: string,
    vipPrice: number
  ) => {
    if (!text.trim()) {
      return [];
    }

    const vipFromNum = vipFromStr ? parseInt(vipFromStr, 10) : NaN;

    // Support multiple common delimiters (case-sensitive for Chương/Hồi/Chapter):
    // 1. === Chương 1: Tiêu đề ===
    // 2. Chương 1: Tiêu đề / Chương 1. Tiêu đề / Chương 1 - Tiêu đề
    // 3. Hồi 1: Tiêu đề / Hồi 1. Tiêu đề
    // 4. Chapter 1: Title
    // 5. [Chương 1] Tiêu đề
    // 6. --- Chương 1: Tiêu đề ---
    const chapterHeaderRegex = /(?:^|\n)\s*(?:(?:={3,}|-{3,}|\[)\s*(?:Chương|CHƯƠNG|Hồi|HỒI|Chapter|CHAPTER)\s+(\d+)[:\s.-]*([^\n=]*?)(?:\s*(?:={3,}|-{3,}|\]))|(?:Chương|CHƯƠNG|Chapter|CHAPTER)\s+(\d+)(?:\s*[:.\-–—\]]\s*([^\n]*)|(?=\s*(?:\n|$)))|(?:Hồi|HỒI)\s+(\d+)\s*[:.\-–—\]]\s*([^\n]*))(?:\n|$)/g;

    const matches: { index: number; fullMatch: string; rawNum: number; title: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = chapterHeaderRegex.exec(text)) !== null) {
      const rawNumStr = match[1] || match[3] || match[5];
      const rawTitleStr = match[2] ?? match[4] ?? match[6] ?? '';
      matches.push({
        index: match.index,
        fullMatch: match[0],
        rawNum: parseInt(rawNumStr, 10),
        title: rawTitleStr.trim(),
      });
    }

    const result: ParsedChapterItem[] = [];

    if ((matches?.length || 0) > 0) {
      for (let i = 0; i < (matches?.length || 0); i++) {
        const cur = matches[i];
        const next = matches[i + 1];
        const startIndex = cur.index + (cur.fullMatch?.length || 0);
        const endIndex = next ? next.index : (text?.length || 0);

        const content = text.slice(startIndex, endIndex).trim();
        const effectiveNum = mode === 'continue' ? (startNum + i) : cur.rawNum;
        const cleanTitle = cur.title || `Chương ${effectiveNum}`;

        const isVip = allFree 
          ? false 
          : (!isNaN(vipFromNum) && vipFromNum > 0 && effectiveNum >= vipFromNum && vipPrice > 0);
        const priceXu = allFree ? 0 : (isVip ? Math.max(0, vipPrice) : 0);

        result.push({
          id: `batch-${Date.now()}-${i + 1}-${Math.random().toString(36).substring(2, 7)}`,
          number: effectiveNum,
          title: cleanTitle.startsWith('Chương') ? cleanTitle : `Chương ${effectiveNum}: ${cleanTitle}`,
          content: content,
          wordCount: content ? (content.split(/\s+/).filter(Boolean)?.length || 0) : 0,
          isVip,
          priceXu,
        });
      }
    } else {
      // Khi không tìm thấy từ khóa chương phân cách, giữ nguyên 100% toàn bộ nội dung văn bản cho 1 chương, tuyệt đối KHÔNG cắt nhỏ
      const isVip = allFree 
        ? false 
        : (!isNaN(vipFromNum) && vipFromNum > 0 && startNum >= vipFromNum && vipPrice > 0);
      const priceXu = allFree ? 0 : (isVip ? Math.max(0, vipPrice) : 0);
      result.push({
        id: `batch-${Date.now()}-1-${Math.random().toString(36).substring(2, 7)}`,
        number: startNum,
        title: `Chương ${startNum}`,
        content: text.trim(),
        wordCount: text.trim().split(/\s+/).filter(Boolean)?.length || 0,
        isVip,
        priceXu,
      });
    }

    return result;
  };

  // Re-parse automatically with smooth debounce to avoid freezing UI
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseChaptersFromText(
        rawText, 
        numberingMode, 
        customStartNum, 
        isAllFree, 
        vipStartChapter, 
        Math.max(0, parseFloat(fixedVipPrice) || 0)
      );
      setParsedChapters(parsed);
      setParsedPage(1);
    }, (rawText?.length || 0) > 30000 ? 150 : 30);

    return () => clearTimeout(timer);
  }, [rawText, numberingMode, customStartNum, isAllFree, vipStartChapter, fixedVipPrice]);

  // Apply batch VIP configuration to current parsed chapters
  const handleApplyBatchVip = () => {
    if ((parsedChapters?.length || 0) === 0) {
      setFeedbackMsg({ text: 'Vui lòng dán nội dung các chương vào ô trước khi áp dụng VIP.', type: 'error' });
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    if (isAllFree) {
      setParsedChapters((prev) =>
        (prev || []).map((c) => ({
          ...c,
          isVip: false,
          priceXu: 0,
        }))
      );
      setFeedbackMsg({ text: 'Đã đặt tất cả các chương là Miễn Phí (0 Xu)!', type: 'success' });
      setTimeout(() => setFeedbackMsg(null), 3500);
      return;
    }

    const startNum = parseInt(vipStartChapter, 10);
    if (!vipStartChapter || isNaN(startNum) || startNum < 1) {
      setFeedbackMsg({
        text: 'Vui lòng điền số chương bắt đầu bật VIP vào ô "Bật VIP từ chương số" (hoặc tích vào ô 0 Xu nếu muốn miễn phí hoàn toàn).',
        type: 'error',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }

    const price = Math.max(0, parseFloat(fixedVipPrice) || 0);
    if (price <= 0) {
      setFeedbackMsg({
        text: 'Vui lòng nhập số Xu cố định mỗi chương VIP lớn hơn 0 (hoặc tích vào ô 0 Xu nếu muốn miễn phí).',
        type: 'error',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }

    setParsedChapters((prev) =>
      (prev || []).map((c) => {
        const isVip = c.number >= startNum;
        return {
          ...c,
          isVip,
          priceXu: isVip ? price : 0,
        };
      })
    );

    const vipCount = (parsedChapters || []).filter((c) => c.number >= startNum)?.length || 0;
    const freeCount = (parsedChapters?.length || 0) - vipCount;
    setFeedbackMsg({
      text: `Đã áp dụng VIP thành công: ${freeCount} chương miễn phí (0 xu) & ${vipCount} chương VIP (${price} Xu/chương từ chương ${startNum})!`,
      type: 'success',
    });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Toggle single chapter VIP (Set lẻ từng chương)
  const handleToggleSingleVip = (chapterId: string) => {
    setParsedChapters((prev) =>
      (prev || []).map((c) => {
        if (c.id === chapterId) {
          const nextVip = !c.isVip;
          const defaultSinglePrice = Math.max(0, parseFloat(fixedVipPrice) || 0) || 5;
          return {
            ...c,
            isVip: nextVip,
            priceXu: nextVip ? (c.priceXu > 0 ? c.priceXu : defaultSinglePrice) : 0,
          };
        }
        return c;
      })
    );
  };

  // Change single chapter price (Set lẻ số xu từng chương)
  const handleChangeSinglePrice = (chapterId: string, price: number) => {
    const effectivePrice = Math.max(0, price);
    setParsedChapters((prev) =>
      (prev || []).map((c) => {
        if (c.id === chapterId) {
          return {
            ...c,
            isVip: effectivePrice > 0,
            priceXu: effectivePrice,
          };
        }
        return c;
      })
    );
  };

  // Edit single chapter title
  const handleChangeSingleTitle = (chapterId: string, newTitle: string) => {
    setParsedChapters((prev) =>
      (prev || []).map((c) => (c.id === chapterId ? { ...c, title: newTitle } : c))
    );
  };

  // Delete single chapter from parsed list
  const handleDeleteSingleChapter = (chapterId: string) => {
    setParsedChapters((prev) => (prev || []).filter((c) => c.id !== chapterId));
  };

  // Template demo text generator
  const handlePasteDemo = (count: number) => {
    let demo = '';
    const start = customStartNum;
    for (let i = 0; i < count; i++) {
      const num = start + i;
      demo += `=== Chương ${num}: Diễn biến cao trào hồi thứ ${num} ===\n\n`;
      demo += `Ánh hoàng hôn buông xuống phủ một màu vàng cam rực rỡ lên đỉnh núi Thiên Sơn. Tiếng gió rít qua những rặng tùng cổ thụ tạo nên âm hưởng thê lương nhưng hùng tráng.\n\n`;
      demo += `Nhân vật chính bước từng bước vững vàng trên bậc thang đá rêu phong, ánh mắt kiên định nhìn về phía trước. Sau bao ngày tháng gian khổ tu luyện, thời khắc quyết định rốt cuộc cũng đã đến.\n\n`;
      demo += `"Ngươi quả nhiên không phụ sự kỳ vọng của ta." Một giọng nói trầm ấm từ trong đại điện vọng ra, mở ra một chương mới đầy thử thách.\n\n`;
    }
    setRawText(demo);
  };

  // Copy standard template to clipboard
  const handleCopyTemplate = () => {
    const template = `=== Chương 1: Khởi đầu hành trình ===
Nội dung chương 1 viết ở đây...
Mỗi đoạn văn cách nhau bằng một dòng trống.

=== Chương 2: Bước ngoặt bất ngờ ===
Nội dung chương 2 viết ở đây...

=== Chương 3: Gặp gỡ định mệnh ===
Nội dung chương 3 viết ở đây...`;

    navigator.clipboard.writeText(template);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  // Handle text file upload (.txt, .docx)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setRawText(text);
        setFeedbackMsg({ text: `Đã nạp file "${file.name}" thành công!`, type: 'success' });
        setTimeout(() => setFeedbackMsg(null), 3000);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Empty chapters detection
  const emptyChapters = useMemo(() => {
    return (parsedChapters || []).filter((c) => !c.content || !c.content.trim());
  }, [parsedChapters]);

  // Save all chapters to novel
  const handleSaveAndPublish = async () => {
    if ((parsedChapters?.length || 0) === 0) {
      setFeedbackMsg({ text: 'Chưa có chương nào được phân tích. Vui lòng dán văn bản vào ô trước khi lưu.', type: 'error' });
      return;
    }

    if ((emptyChapters?.length || 0) > 0) {
      const confirmSave = confirm(
        `⚠️ Cảnh báo: Có ${emptyChapters?.length || 0} chương chưa có nội dung chữ (ví dụ chương ${(emptyChapters || []).slice(0, 3).map((c) => c.number).join(', ')}${(emptyChapters?.length || 0) > 3 ? '...' : ''}).\n\nBạn có chắc chắn muốn đăng không? (Nên kiểm tra lại dấu phân cách để không bị thiếu văn bản gốc).`
      );
      if (!confirmSave) return;
    }

    setIsSaving(true);
    setUploadProgress({ saved: 1, total: parsedChapters?.length || 0 });
    setFeedbackMsg(null);

    try {
      const formattedChapters: Chapter[] = (parsedChapters || []).map((pc) => ({
        id: `c-${novel.id}-${pc.number}-${Date.now()}`,
        number: pc.number,
        title: (pc.title || '').trim(),
        slug: `chuong-${pc.number}`,
        content: pc.content,
        wordCount: pc.wordCount,
        publishedDate: new Date().toISOString().split('T')[0],
        isVip: pc.isVip,
        priceXu: pc.isVip ? Number((pc.priceXu || 0).toFixed(2)) : 0,
      }));

      await onSaveBatchChapters(
        novel.id, 
        formattedChapters, 
        isCompletedNovel,
        (saved, total) => {
          setUploadProgress({ saved: Math.max(1, saved), total });
        }
      );

      // Caching nhẹ nhàng chạy ngầm sau khi lưu thành công (chỉ cache 1 chương đầu tiên, không làm nghẽn bộ nhớ)
      setTimeout(() => {
        if (formattedChapters[0]?.content) {
          safeSetItem(`chapter_full_${novel.id}_${formattedChapters[0].number}`, formattedChapters[0].content);
        }
      }, 100);

      setUploadProgress({ saved: formattedChapters?.length || 0, total: formattedChapters?.length || 0 });
      setFeedbackMsg({
        text: `🎉 Đã đăng thành công ${formattedChapters?.length || 0} chương mới vào tác phẩm "${novel.title}"! Dữ liệu đã được đồng bộ thời gian thực lên hệ thống.`,
        type: 'success',
      });

      setTimeout(() => {
        setIsSaving(false);
        setUploadProgress(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error saving batch chapters:', err);
      setIsSaving(false);
      setUploadProgress(null);
      setFeedbackMsg({ 
        text: `Lỗi khi lưu chương truyện: ${err?.message || 'Không thể kết nối máy chủ'}. Vui lòng thử lại!`, 
        type: 'error' 
      });
    }
  };

  // Stats calculation
  const totalParsed = parsedChapters?.length || 0;
  const vipCount = (parsedChapters || []).filter((c) => c.isVip)?.length || 0;
  const freeCount = totalParsed - vipCount;
  const totalWords = (parsedChapters || []).reduce((acc, c) => acc + c.wordCount, 0);

  return (
    <div className="w-full min-h-[90vh] bg-white text-slate-900 pb-20 animate-in fade-in duration-200">
      
      {/* 1. Header Toolbar (Nền trắng, chữ đen sắc nét, viền hồng tinh tế) */}
      <div className="border-b border-slate-200 bg-white px-4 sm:px-8 py-4 shadow-xs sticky top-16 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Breadcrumbs: Trang chủ > Tủ truyện > Truyện của bạn > Đăng nhiều chương */}
          <div>
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold mb-1">
              <button
                type="button"
                onClick={onHomeClick || onClose}
                className="inline-flex items-center gap-1 text-slate-700 hover:text-pink-600 transition cursor-pointer"
              >
                <span>Trang chủ</span>
                <Home className="w-3.5 h-3.5 text-pink-500" />
              </button>
              <span className="text-slate-400">&gt;</span>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-600 hover:text-pink-600 transition cursor-pointer"
              >
                Tủ truyện
              </button>
              <span className="text-slate-400">&gt;</span>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-600 hover:text-pink-600 transition cursor-pointer"
              >
                Truyện của bạn
              </button>
              <span className="text-slate-400">&gt;</span>
              <span className="text-cyan-600 font-bold">Đăng nhiều chương</span>
            </div>

            <div className="flex items-center gap-3">
              <img
                src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=120&q=80'}
                alt={novel.title}
                className="w-10 h-14 object-cover rounded-lg border border-slate-200 shadow-xs hidden sm:block"
              />
              <div>
                <h1 className="text-lg sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-cyan-100 text-cyan-800 text-xs font-bold border border-cyan-300">
                    Đăng nhiều chương
                  </span>
                  <span className="truncate max-w-md">{novel.title}</span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tác giả: <strong className="text-slate-700">{novel.author}</strong> • Hiện có:{' '}
                  <strong className="text-pink-600">{existingCount} chương</strong> trong hệ thống
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons & Status Toggle */}
          <div className="flex flex-wrap items-center gap-3 self-end md:self-center">
            {/* Toggle Hoàn Thành (Full bộ truyện) */}
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer select-none transition-all shadow-2xs">
              <input
                type="checkbox"
                checked={isCompletedNovel}
                onChange={(e) => setIsCompletedNovel(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>Trạng thái:</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-black ${isCompletedNovel ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-slate-950'}`}>
                  {isCompletedNovel ? 'Full (Hoàn thành)' : 'Đang ra'}
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại</span>
            </button>

            <button
              type="button"
              disabled={isSaving || (parsedChapters?.length || 0) === 0}
              onClick={handleSaveAndPublish}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-102 ${
                isSaving 
                  ? 'bg-amber-400 hover:bg-amber-500 text-amber-950 border border-amber-500 shadow-md shadow-amber-400/20' 
                  : 'bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white shadow-md shadow-pink-600/20'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-amber-950 border-t-transparent rounded-full flex-shrink-0" />
                  <span>
                    {uploadProgress && uploadProgress.total > 0
                      ? `Đang gộp lưu ${uploadProgress.saved}/${uploadProgress.total} (${Math.min(100, Math.max(5, Math.round((uploadProgress.saved / uploadProgress.total) * 100)))}%)...`
                      : 'Đang chuẩn bị lưu (writeBatch)...'}
                  </span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Đăng {parsedChapters?.length || 0} Chương Ngay</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Visual Live Upload Progress Card - Thanh Loading Màu Vàng (Amber/Yellow) theo yêu cầu */}
      {isSaving && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-4">
          <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-lg shadow-amber-500/10 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-amber-950">
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span>⚡ Đang gộp thao tác ghi (WriteBatch chunking an toàn)... Đang xử lý {parsedChapters?.length || 0} chương</span>
              </span>
              <span className="px-3 py-1 bg-amber-400 text-amber-950 font-black rounded-full text-xs shadow-xs">
                {uploadProgress && uploadProgress.total > 0
                  ? `${Math.min(100, Math.max(5, Math.round((uploadProgress.saved / uploadProgress.total) * 100)))}%`
                  : '10%'}
              </span>
            </div>
            <div className="w-full h-3.5 bg-amber-200/70 rounded-full overflow-hidden p-0.5 border border-amber-300">
              <div 
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 rounded-full transition-all duration-300 ease-out shadow-sm"
                style={{
                  width: `${uploadProgress && uploadProgress.total > 0
                    ? Math.min(100, Math.max(5, Math.round((uploadProgress.saved / uploadProgress.total) * 100)))
                    : 10}%`
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-amber-900 font-semibold">
              <span>Đã lưu thành công: {uploadProgress?.saved || 1}/{uploadProgress?.total || parsedChapters?.length || 0} chương</span>
              <span className="text-[11px] text-amber-700">Tự động chia nhỏ &lt; 500 ops • Không làm nghẽn mạng hay treo trình duyệt</span>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-4">
          <div
            className={`px-5 py-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in border ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        </div>
      )}

      {/* 2. Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        
        {/* =========================================================================
            SECTION 1: HƯỚNG DẪN CẤU TRÚC & DÁN NỘI DUNG (CHỈ CẦN DÁN VÀO LÀ ĐƯỢC)
           ========================================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-600" />
                <span>1. Cấu Trúc Đăng Nhiều Chương (Chỉ cần dán vào là được)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hệ thống tự động nhận diện tiêu đề và bóc tách từng chương một cách thông minh.
              </p>
            </div>

            {/* Quick Demo & Template Helpers */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyTemplate}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="Sao chép cấu trúc mẫu vào clipboard"
              >
                {copiedTemplate ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTemplate ? 'Đã chép mẫu' : 'Sao chép mẫu'}</span>
              </button>

              <button
                type="button"
                onClick={() => handlePasteDemo(5)}
                className="px-3 py-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ 5 Chương mẫu thử</span>
              </button>

              <button
                type="button"
                onClick={() => handlePasteDemo(20)}
                className="px-3 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ 20 Chương mẫu thử</span>
              </button>

              <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Tải file .txt</span>
                <input
                  type="file"
                  accept=".txt,.doc,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Guide Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-cyan-600" />
              <span>Các cấu trúc tiêu đề được hỗ trợ tự động:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11.5px] text-slate-800 pt-1">
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-cyan-700 font-bold">Cấu trúc 1 (Chuẩn):</span>
                <br />=== Chương 1: Tiêu đề ===
                <br />Nội dung chương 1...
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-pink-700 font-bold">Cấu trúc 2 (Tiểu thuyết):</span>
                <br />Chương 1: Tiêu đề chương
                <br />Nội dung chương 1...
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-purple-700 font-bold">Cấu trúc 3 (Linh hoạt):</span>
                <br />Hồi 1: Tiêu đề / Chapter 1
                <br />[Chương 1] Tiêu đề...
              </div>
            </div>
          </div>



          {/* Numbering settings */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-800">Đánh số chương mới:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="numberingMode"
                  checked={numberingMode === 'continue'}
                  onChange={() => setNumberingMode('continue')}
                  className="text-cyan-600 focus:ring-cyan-500"
                />
                <span className="font-semibold text-slate-700">
                  {existingCount > 0 
                    ? `Tự động tiếp nối số chương hiện có (Bắt đầu từ chương ${customStartNum})`
                    : `Bắt đầu từ chương số 1 (Truyện mới chưa đăng chương nào)`}
                </span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="numberingMode"
                  checked={numberingMode === 'keep_parsed'}
                  onChange={() => setNumberingMode('keep_parsed')}
                  className="text-cyan-600 focus:ring-cyan-500"
                />
                <span className="font-semibold text-slate-700">
                  Giữ nguyên số chương theo văn bản dán vào
                </span>
              </label>
            </div>

            {numberingMode === 'continue' && (
              <div className="flex items-center gap-2">
                <span className="text-slate-600 font-medium">Bắt đầu từ số:</span>
                <input
                  type="number"
                  min="1"
                  value={customStartNum}
                  onChange={(e) => setCustomStartNum(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-900 text-xs text-center focus:border-cyan-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Large Textarea */}
          <div>
            <textarea
              rows={12}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Dán toàn bộ nội dung của hàng chục hoặc hàng trăm chương vào đây...&#10;&#10;Ví dụ:&#10;=== Chương 1: Tiêu đề chương 1 ===&#10;Nội dung chương 1...&#10;&#10;=== Chương 2: Tiêu đề chương 2 ===&#10;Nội dung chương 2..."
              className="w-full p-4 rounded-xl border border-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white leading-relaxed shadow-inner focus:outline-none"
            />
            <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
              <span>Độ dài văn bản: {(rawText?.length || 0).toLocaleString('vi-VN')} ký tự</span>
              <span>Đã phát hiện: <strong className="text-cyan-600 font-bold">{parsedChapters?.length || 0} chương</strong></span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 2: MỤC SET VIP (THEO ĐÚNG YÊU CẦU: 0 XU HOẶC SET VIP TỪ CHƯƠNG X)
           ========================================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              <span>2. Cấu Hình Set VIP &amp; Đặt Giá Xu</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tùy chọn đặt tất cả 0 Xu (miễn phí), hoặc đặt VIP cố định từ chương nào, hoặc chỉnh lẻ từng chương bên dưới.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Lựa chọn A: TÍCH VÀO Ô 0 XU (KHÔNG SET VIP / MIỄN PHÍ HOÀN TOÀN) */}
            <div
              onClick={() => setIsAllFree(!isAllFree)}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                isAllFree
                  ? 'bg-emerald-50/80 border-emerald-500 shadow-xs'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                checked={isAllFree}
                onChange={(e) => setIsAllFree(e.target.checked)}
                className="mt-1 w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <div>
                <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-emerald-600" />
                  <span>Tích vào ô 0 Xu (Không set VIP)</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Tất cả các chương vừa dán sẽ được đặt là <strong>0 Xu (Miễn phí hoàn toàn)</strong>. 
                  Độc giả có thể đọc tự do mà không cần mở khóa.
                </p>
              </div>
            </div>

            {/* Lựa chọn B: SET VIP TỪ CHƯƠNG ... VỚI Ô XU CỐ ĐỊNH */}
            <div
              className={`p-4 rounded-xl border-2 transition-all space-y-3 ${
                !isAllFree
                  ? 'bg-amber-50/50 border-amber-400 shadow-xs'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>Set VIP hàng loạt kể từ chương chỉ định (Xu cố định)</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Bật VIP từ chương số:
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={isAllFree}
                    value={vipStartChapter}
                    onChange={(e) => setVipStartChapter(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:border-amber-500 focus:outline-none disabled:bg-slate-100 placeholder:font-normal placeholder:text-slate-400"
                    placeholder="Để trống hoặc nhập số (VD: 30)"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {vipStartChapter 
                      ? `(Trước chương ${vipStartChapter} sẽ là 0 Xu miễn phí)` 
                      : '(Để trống nếu không bật VIP, ai muốn điền gì thì điền)'}
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Ô Xu cố định mỗi chương VIP:
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={isAllFree}
                      value={fixedVipPrice}
                      onChange={(e) => setFixedVipPrice(e.target.value)}
                      className="w-full p-2.5 pr-10 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:border-amber-500 focus:outline-none disabled:bg-slate-100 placeholder:font-normal placeholder:text-slate-400"
                      placeholder="Nhập số Xu (VD: 5 hoặc 0.35)"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-amber-600 text-xs">
                      Xu
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {vipStartChapter 
                      ? `(Áp dụng cố định cho từ chương ${vipStartChapter} trở đi)` 
                      : '(Áp dụng cho các chương VIP)'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={isAllFree}
                onClick={handleApplyBatchVip}
                className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-40"
              >
                <Check className="w-4 h-4" />
                <span>
                  {vipStartChapter 
                    ? `Áp Dụng Xu Cố Định Từ Chương ${vipStartChapter}` 
                    : 'Áp Dụng Xu Cố Định'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 3: DANH SÁCH CHI TIẾT TỪNG CHƯƠNG & SET LẺ TỪNG CHƯƠNG
           ========================================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-pink-600" />
                <span>3. Danh Sách Chương Đã Phân Tích &amp; Set Lẻ Từng Chương</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bạn có thể sửa trực tiếp tiêu đề, bật/tắt VIP hoặc chỉnh số Xu lẻ cho từng chương tùy ý.
              </p>
            </div>

            {/* Summary badges */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-3 py-1 rounded-full bg-slate-100 font-bold text-slate-700">
                Tổng: {totalParsed} chương
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-100 font-bold text-emerald-800 border border-emerald-300">
                0 Xu (Miễn phí): {freeCount} chương
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-100 font-bold text-amber-800 border border-amber-300">
                VIP: {vipCount} chương
              </span>
              <span className="px-3 py-1 rounded-full bg-cyan-100 font-bold text-cyan-800">
                ~{totalWords.toLocaleString('vi-VN')} từ
              </span>
            </div>
          </div>

          {(emptyChapters?.length || 0) > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-start gap-3 text-xs text-rose-900 shadow-2xs animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold text-sm text-rose-950">
                  Phát hiện {emptyChapters?.length || 0} chương chưa có nội dung văn bản!
                </span>
                <p className="mt-1 text-rose-800 leading-relaxed text-[11.5px]">
                  Các chương số: <strong>{(emptyChapters || []).slice(0, 10).map((c) => c.number).join(', ')}{(emptyChapters?.length || 0) > 10 ? '...' : ''}</strong> hiện chưa có văn bản (có thể do tiêu đề dính liền hoặc dòng phân cách bị lỗi). Vui lòng bấm "Xem" hoặc kiểm tra lại văn bản để không bị thiếu nội dung gốc khi lưu.
                </p>
              </div>
            </div>
          )}

          {(parsedChapters?.length || 0) === 0 ? (
            <div className="py-16 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">Chưa có chương nào được phân tích</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Hãy dán văn bản vào khung ở Bước 1 hoặc bấm nút <strong>"+ 5 Chương mẫu thử"</strong> để trải nghiệm ngay.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(parsedChapters?.length || 0) > 50 && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <span className="font-bold text-slate-700">
                    Đang hiển thị {(parsedPage - 1) * 50 + 1} - {Math.min(parsedPage * 50, parsedChapters?.length || 0)} / {parsedChapters?.length || 0} chương
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Array.from({ length: Math.ceil((parsedChapters?.length || 0) / 50) }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setParsedPage(p)}
                        className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                          parsedPage === p
                            ? 'bg-cyan-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {(p - 1) * 50 + 1}-{Math.min(p * 50, parsedChapters?.length || 0)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(parsedChapters || []).slice((parsedPage - 1) * 50, parsedPage * 50).map((ch) => (
                <div
                  key={ch.id}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${
                    ch.isVip
                      ? 'bg-amber-50/30 border-amber-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Left: Chapter Number, Title Input & Word count */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 font-black text-xs flex items-center justify-center flex-shrink-0 border border-slate-200">
                      #{ch.number}
                    </span>

                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        type="text"
                        value={ch.title}
                        onChange={(e) => handleChangeSingleTitle(ch.id, e.target.value)}
                        className="w-full font-bold text-xs sm:text-sm text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none py-0.5"
                        placeholder="Tiêu đề chương..."
                      />
                      <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                        <span>Chương số {ch.number}</span>
                        <span>• {ch.wordCount.toLocaleString('vi-VN')} từ</span>
                        {(!ch.content || !ch.content.trim()) && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-extrabold border border-rose-300">
                            ⚠️ Thiếu nội dung chữ
                          </span>
                        )}
                        <span className="truncate max-w-xs text-slate-400 hidden sm:inline">
                          • {ch.content ? ch.content.slice(0, 45) + '...' : '(Nội dung trống)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: SET LẺ TỪNG CHƯƠNG (VIP Toggle, Price Input, Preview & Delete) */}
                  <div className="flex items-center gap-3 flex-shrink-0 self-end md:self-center">
                    
                    {/* VIP Toggle button */}
                    <button
                      type="button"
                      onClick={() => handleToggleSingleVip(ch.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        ch.isVip
                          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                      }`}
                    >
                      {ch.isVip ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>VIP</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>0 Xu (Free)</span>
                        </>
                      )}
                    </button>

                    {/* Single Price Input (Set lẻ số xu) */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ch.priceXu}
                        onChange={(e) => handleChangeSinglePrice(ch.id, parseFloat(e.target.value) || 0)}
                        className={`w-18 px-2 py-1.5 rounded-xl border text-xs font-bold text-center focus:outline-none ${
                          ch.isVip
                            ? 'border-amber-400 bg-white text-amber-900 focus:border-amber-500'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                        title="Chỉnh lẻ giá Xu cho chương này"
                      />
                      <span className="text-xs font-bold text-slate-600">Xu</span>
                    </div>

                    {/* Preview Button */}
                    <button
                      type="button"
                      onClick={() => setPreviewChapter(ch)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer"
                      title="Xem nội dung chương"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteSingleChapter(ch.id)}
                      className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition cursor-pointer"
                      title="Xóa chương này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Save Call-to-action */}
        {(parsedChapters?.length || 0) > 0 && (
          <div className="p-5 rounded-2xl bg-cyan-50 border border-cyan-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="font-black text-sm text-cyan-950 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-cyan-600" />
                <span>Sẵn sàng xuất bản {parsedChapters?.length || 0} chương mới!</span>
              </div>
              <p className="text-xs text-cyan-800 mt-0.5">
                Các chương sẽ được tự động gắn vào tác phẩm "{novel.title}" và lưu trực tiếp lên hệ thống Đạo Tâm.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAndPublish}
                className={`px-6 py-2.5 rounded-xl font-extrabold text-sm cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                  isSaving
                    ? 'bg-amber-400 hover:bg-amber-500 text-amber-950 border border-amber-500 shadow-md shadow-amber-400/20'
                    : 'bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white shadow-md shadow-pink-600/20'
                }`}
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-amber-950 border-t-transparent rounded-full flex-shrink-0" />
                    <span>
                      {uploadProgress && uploadProgress.total > 0
                        ? `Đang lưu ${uploadProgress.saved}/${uploadProgress.total} (${Math.min(100, Math.max(5, Math.round((uploadProgress.saved / uploadProgress.total) * 100)))}%)...`
                        : 'Đang gộp lưu writeBatch...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Đăng Ngay {parsedChapters?.length || 0} Chương</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Preview Modal for single chapter */}
      {previewChapter && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-600" />
                <h3 className="font-black text-sm text-slate-900 truncate">
                  {previewChapter.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewChapter(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto font-serif text-sm leading-relaxed text-slate-800 whitespace-pre-line space-y-3">
              {previewChapter.content}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                {previewChapter.wordCount.toLocaleString('vi-VN')} từ • {previewChapter.isVip ? `VIP (${previewChapter.priceXu} Xu)` : '0 Xu (Miễn phí)'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewChapter(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-white font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
