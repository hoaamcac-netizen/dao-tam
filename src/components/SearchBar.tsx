import React, { useState, useCallback } from 'react';
import { 
  collection, 
  query, 
  limit, 
  getDocs, 
  QueryDocumentSnapshot,
  DocumentData 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Novel } from '../types';
import { SAMPLE_NOVELS } from '../data/novels';
import { 
  Search, 
  Sparkles, 
  AlertTriangle, 
  RotateCw, 
  X 
} from 'lucide-react';
import StoryCard from './StoryCard';

// Error logging helper chuẩn Firebase Skill
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
}

// Chuyển đổi Firestore document snapshot sang Novel
function transformDocToNovel(docSnap: QueryDocumentSnapshot<DocumentData>): Novel {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    title: data.title || 'Tác phẩm chưa đặt tên',
    slug: data.slug || docSnap.id,
    author: data.author || 'Đang cập nhật',
    editor: data.editor || undefined,
    coverImage: data.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80',
    description: data.description || '',
    totalChapters: Number(data.totalChapters || (Array.isArray(data.chapters) ? data.chapters?.length : 0)),
    latestChapterTitle: data.latestChapterTitle || (data.totalChapters ? `Chương ${data.totalChapters}` : 'Chương 1'),
    status: (data.status as any) || 'Đang ra',
    publishStatus: data.publishStatus || 'published',
    views: Number(data.views || 0),
    dailyViews: Number(data.dailyViews || 0),
    rating: Number(data.rating || 5.0),
    flowerCount: Number(data.flowerCount || 0),
    coinCount: Number(data.coinCount || 0),
    categories: Array.isArray(data.categories) ? data.categories : [],
    genres: Array.isArray(data.genres) ? data.genres : (Array.isArray(data.categories) ? data.categories : []),
    mainCategory: (data.mainCategory as any) || 'dam-my',
    updatedAt: Number(data.updatedAt || Date.now()),
    lastChapterUpdatedAt: Number(data.lastChapterUpdatedAt || data.updatedAt || Date.now()),
    lastUpdated: data.lastUpdated || new Date().toISOString(),
    hasAudio: Boolean(data.hasAudio),
    fullBookPriceXu: Number(data.fullBookPriceXu || 0),
    chapters: Array.isArray(data.chapters) ? data.chapters : [],
  };
}

/**
 * Chuẩn hóa chuỗi tiếng Việt: Bỏ toàn bộ dấu thanh, dấu mũ, trả về chữ thường không dấu
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .toLowerCase();
}

/**
 * Làm sạch chuỗi: bỏ dấu câu, ký tự đặc biệt, gộp khoảng trắng thừa
 */
export function cleanPunctuation(str: string): string {
  if (!str) return '';
  return str
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'«»“”‘’[\]|\\<>+@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Thuật toán tìm kiếm thông minh đa trường (Tên truyện, Tác giả, Editor, Thể loại, Mô tả nội dung)
 * - Không phân biệt hoa/thường (Case-insensitive)
 * - Không phân biệt có dấu / không dấu (Diacritics-insensitive)
 * - Bỏ qua dấu câu, chấp nhận gõ một phần hoặc các từ liên quan
 * - Xếp hạng độ liên quan (Relevance scoring)
 */
export function searchNovelsSmart(novels: Novel[], rawQuery: string): Novel[] {
  const cleanQ = cleanPunctuation(rawQuery).toLowerCase();
  if (!cleanQ) return [];

  const noAccentsQ = removeVietnameseTones(cleanQ);
  const qWords = cleanQ.split(' ').filter(Boolean);
  const noAccentsWords = noAccentsQ.split(' ').filter(Boolean);

  const scoredList: { novel: Novel; score: number }[] = [];

  for (const novel of (novels || [])) {
    const rawTitle = cleanPunctuation(novel.title || '').toLowerCase();
    const noAccentsTitle = removeVietnameseTones(rawTitle);

    const rawAuthor = cleanPunctuation(novel.author || '').toLowerCase();
    const noAccentsAuthor = removeVietnameseTones(rawAuthor);

    const rawEditor = cleanPunctuation(novel.editor || '').toLowerCase();
    const noAccentsEditor = removeVietnameseTones(rawEditor);

    const rawCategories = (novel.categories || []).map(c => cleanPunctuation(c).toLowerCase()).join(' ');
    const noAccentsCategories = removeVietnameseTones(rawCategories);

    const rawDesc = cleanPunctuation(novel.description || '').toLowerCase();
    const noAccentsDesc = removeVietnameseTones(rawDesc);

    const fullRaw = `${rawTitle} ${rawAuthor} ${rawEditor} ${rawCategories} ${rawDesc}`;
    const fullNoAccents = `${noAccentsTitle} ${noAccentsAuthor} ${noAccentsEditor} ${noAccentsCategories} ${noAccentsDesc}`;

    let score = 0;

    // 1. Khớp nguyên cụm từ (phrase match)
    const exactTitle = rawTitle === cleanQ || noAccentsTitle === noAccentsQ;
    const titleHasPhrase = rawTitle.includes(cleanQ) || noAccentsTitle.includes(noAccentsQ);
    const authorHasPhrase = rawAuthor.includes(cleanQ) || noAccentsAuthor.includes(noAccentsQ);
    const editorHasPhrase = rawEditor.includes(cleanQ) || noAccentsEditor.includes(noAccentsQ);
    const catHasPhrase = rawCategories.includes(cleanQ) || noAccentsCategories.includes(noAccentsQ);
    const descHasPhrase = rawDesc.includes(cleanQ) || noAccentsDesc.includes(noAccentsQ);

    if (exactTitle) {
      score += 400;
    } else if (titleHasPhrase) {
      score += 200;
    }

    if (authorHasPhrase) score += 100;
    if (editorHasPhrase) score += 80;
    if (catHasPhrase) score += 90;
    if (descHasPhrase) score += 60;

    // 2. Khớp từng từ khóa trong cụm từ
    let matchedWordsCount = 0;
    for (let i = 0; i < (qWords?.length || 0); i++) {
      const w = qWords[i];
      const nw = noAccentsWords[i] || removeVietnameseTones(w);

      const inTitle = rawTitle.includes(w) || noAccentsTitle.includes(nw);
      const inAuthor = rawAuthor.includes(w) || noAccentsAuthor.includes(nw);
      const inCat = rawCategories.includes(w) || noAccentsCategories.includes(nw);
      const inDesc = rawDesc.includes(w) || noAccentsDesc.includes(nw);
      const inFull = fullRaw.includes(w) || fullNoAccents.includes(nw);

      if (inTitle) score += 30;
      if (inAuthor) score += 20;
      if (inCat) score += 20;
      if (inDesc) score += 10;

      if (inFull) {
        matchedWordsCount++;
      }
    }

    // Điểm thưởng khi xuất hiện đầy đủ các từ trong cụm
    if ((qWords?.length || 0) > 1 && matchedWordsCount === (qWords?.length || 0)) {
      score += 50;
    }

    // Điều kiện lọt vào danh sách kết quả:
    // Khớp cụm từ hoặc khớp toàn bộ từ khóa hoặc khớp đa số từ khóa
    const hasPhraseMatch = titleHasPhrase || authorHasPhrase || editorHasPhrase || catHasPhrase || descHasPhrase;
    const hasAllWords = (qWords?.length || 0) > 0 && matchedWordsCount === (qWords?.length || 0);
    const hasMostWords = (qWords?.length || 0) >= 3 && matchedWordsCount >= (qWords?.length || 0) - 1;

    if (score > 0 && (hasPhraseMatch || hasAllWords || hasMostWords)) {
      scoredList.push({ novel, score });
    }
  }

  // Sắp xếp giảm dần theo điểm số độ liên quan
  scoredList.sort((a, b) => b.score - a.score);

  return (scoredList || []).map(item => item.novel);
}

// Bộ nhớ cache tạm thời để không bị gọi Firestore lặp lại (Quota Protection)
let memoryNovelsCache: Novel[] | null = null;

interface SearchBarProps {
  novels?: Novel[];
  onSelectNovel?: (novel: Novel) => void;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ novels: initialNovels = [], onSelectNovel, className = '' }) => {
  // Quota Protection: State từ khóa chỉ lưu nội bộ input, TUYỆT ĐỐI KHÔNG gọi Firebase trong onChange
  const [keyword, setKeyword] = useState<string>('');

  // Trạng thái kết quả tìm kiếm
  const [results, setResults] = useState<Novel[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [searchLabel, setSearchLabel] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Kích hoạt tìm kiếm thông minh:
   * CHỈ ĐƯỢC KÍCH HOẠT khi người dùng bấm phím Enter hoặc click vào nút 'Tìm Kiếm' màu hồng
   */
  const handleExecuteSearch = useCallback(async (targetTerm?: string) => {
    const term = (targetTerm !== undefined ? targetTerm : keyword).trim();
    if (!term) return;

    setIsLoading(true);
    setError(null);
    setSearchLabel(`"${term}"`);

    try {
      // 1. Chuẩn bị kho dữ liệu truyện đầy đủ (ưu tiên props đã tải sẵn & cache để tốn 0 Reads)
      let combinedNovels: Novel[] = [];

      if ((initialNovels?.length || 0) > 0) {
        const novelMap = new Map<string, Novel>();
        (SAMPLE_NOVELS || []).forEach((n) => novelMap.set(n.id, n));
        (initialNovels || []).forEach((n) => novelMap.set(n.id, n));
        combinedNovels = Array.from(novelMap.values());
        memoryNovelsCache = combinedNovels;
      } else if (memoryNovelsCache && (memoryNovelsCache?.length || 0) > 0) {
        combinedNovels = memoryNovelsCache;
      } else {
        const novelMap = new Map<string, Novel>();
        (SAMPLE_NOVELS || []).forEach((n) => novelMap.set(n.id, n));

        try {
          const novelsCol = collection(db, 'novels');
          const snap = await getDocs(query(novelsCol, limit(100)));
          (snap?.docs || []).forEach((docSnap) => {
            const transformed = transformDocToNovel(docSnap);
            novelMap.set(transformed.id, transformed);
          });
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.LIST, 'novels');
          console.warn('[SearchBar] Không thể tải thêm dữ liệu, sử dụng kho truyện hiện tại:', fsErr);
        }

        combinedNovels = Array.from(novelMap.values());
        memoryNovelsCache = combinedNovels;
      }

      // 2. Chạy thuật toán tìm kiếm thông minh (không phân biệt hoa/thường, không cần dấu, tìm theo tên, tác giả, thể loại, văn án)
      const matched = searchNovelsSmart(combinedNovels, term);

      setResults(matched);
      setHasSearched(true);
    } catch (err: any) {
      console.warn('[SearchBar] Lỗi khi xử lý tìm kiếm:', err);
      let msg = 'Đã xảy ra lỗi trong quá trình tìm kiếm. Vui lòng kiểm tra lại đường truyền mạng.';
      if (err?.message?.includes('Quota') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
        msg = 'Hệ thống tìm kiếm đang tạm thời quá tải lưu lượng truy cập. Vui lòng thử lại sau ít phút.';
      } else if (err?.message) {
        msg = `Lỗi tìm kiếm: ${err.message}`;
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [keyword, initialNovels]);

  // Xóa kết quả tìm kiếm và quay về trạng thái ban đầu
  const handleClear = () => {
    setKeyword('');
    setResults([]);
    setHasSearched(false);
    setError(null);
    setSearchLabel('');
  };

  return (
    <div className={`w-full ${className}`}>
      {/* KHUNG TÌM KIẾM CHỦ ĐẠO TONE MÀU HỒNG SANG TRỌNG */}
      <div className="bg-gradient-to-r from-pink-50/90 via-white to-rose-50/90 dark:from-slate-900/90 dark:via-slate-800/90 dark:to-slate-900/90 rounded-2xl p-4 sm:p-6 border border-pink-200/70 dark:border-pink-950/60 shadow-md">
        
        {/* Form tìm kiếm: Gộp ô input và nút tìm kiếm lên cùng 1 hàng bằng Flexbox (flex-row, items-center) trên cả Mobile & Desktop */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleExecuteSearch();
          }}
          className="relative flex flex-row items-center gap-2 sm:gap-2.5 w-full"
        >
          {/* Ô nhập từ khóa (Chặn spam API: onChange CHỈ CẬP NHẬT STATE LOCAL, TUYỆT ĐỐI KHÔNG GỌI API) */}
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none text-pink-500">
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>

            <input
              type="text"
              value={keyword}
              onChange={(e) => {
                // TUYỆT ĐỐI KHÔNG gọi API Firebase mỗi khi người dùng gõ phím (onChange)
                setKeyword(e.target.value);
              }}
              placeholder="Tìm theo tên truyện, tác giả, thể loại, từ khóa..."
              className="w-full pl-9 sm:pl-11 pr-8 sm:pr-10 py-2.5 sm:py-3 rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-900/80 text-xs sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 shadow-inner transition-all"
            />

            {keyword.trim() && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3.5 flex items-center text-slate-400 hover:text-pink-600 cursor-pointer transition"
                title="Xóa ô tìm kiếm"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>

          {/* NÚT 'TÌM KIẾM' MÀU HỒNG CHỦ ĐẠO - GỘP CHUNG 1 HÀNG TRÊN CẢ MOBILE & DESKTOP */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="submit"
              disabled={isLoading || !keyword.trim()}
              className="px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-bold text-xs sm:text-sm shadow-md shadow-pink-600/25 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer transition transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              title="Tìm Kiếm"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="hidden sm:inline">Đang tìm...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden sm:inline">Tìm Kiếm</span>
                </>
              )}
            </button>

            {hasSearched && (
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer shrink-0"
              >
                Đóng
              </button>
            )}
          </div>
        </form>

        {/* TRẠNG THÁI LOADING: HIỂN THỊ CHỮ VÀ SPINNER MÀU HỒNG THEO YÊU CẦU */}
        {isLoading && (
          <div className="mt-4 pt-3 border-t border-pink-100 dark:border-pink-950/40 flex items-center justify-center gap-2.5 text-pink-600 dark:text-pink-400 font-bold text-xs sm:text-sm animate-pulse">
            <div className="w-4 h-4 border-2 border-pink-600 dark:border-pink-400 border-t-transparent rounded-full animate-spin" />
            <span>Đang tìm kiếm tác phẩm phù hợp từ hệ thống...</span>
          </div>
        )}

        {/* BẮT BUỘC: NẾU CÓ LỖI MẠNG HOẶC LỖI TRUY VẤN, HIỂN THỊ CẢNH BÁO BẰNG BANNER NỀN MÀU VÀNG, TUYỆT ĐỐI KHÔNG DÙNG MÀU ĐỎ */}
        {error && (
          <div className="mt-4 p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-in fade-in duration-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="font-bold block">Cảnh báo kết nối &amp; truy vấn:</span>
              <span className="mt-0.5 text-xs text-amber-800 dark:text-amber-300 block leading-relaxed">
                {error}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleExecuteSearch()}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition flex items-center gap-1 cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* THÔNG BÁO KHI KHÔNG TÌM THẤY TRUYỆN: "Không tìm thấy tác phẩm phù hợp" */}
        {hasSearched && (results?.length || 0) === 0 && !isLoading && !error && (
          <div className="mt-4 p-4 text-center rounded-xl bg-pink-50/60 dark:bg-pink-950/20 border border-dashed border-pink-200 dark:border-pink-900 text-xs sm:text-sm text-pink-700 dark:text-pink-300">
            <span className="font-bold text-sm block">Không tìm thấy tác phẩm phù hợp</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Không có truyện nào khớp với từ khóa {searchLabel}. Bạn có thể thử tìm theo tên tác giả, thể loại (ví dụ: Điền Văn, Cổ Đại, Đam Mỹ) hoặc các từ khóa nội dung khác.
            </span>
          </div>
        )}

        {/* HIỂN THỊ KẾT QUẢ TÌM KIẾM KHI CÓ DỮ LIỆU */}
        {hasSearched && (results?.length || 0) > 0 && !isLoading && (
          <div className="mt-5 pt-4 border-t border-pink-100 dark:border-pink-950/40 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-pink-600" />
                <span>Kết quả tìm kiếm cho {searchLabel}:</span>
                <span className="px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300 font-extrabold text-[11px]">
                  {results?.length || 0} tác phẩm
                </span>
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-pink-600 hover:underline font-semibold cursor-pointer"
              >
                Đóng kết quả
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {(results || []).map((novel) => (
                <StoryCard
                  key={novel.id}
                  novel={novel}
                  variant="catalog"
                  onSelect={(selected) => {
                    if (onSelectNovel) onSelectNovel(selected);
                  }}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
