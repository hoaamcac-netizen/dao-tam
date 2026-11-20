import React, { useState, useEffect } from 'react';
import { Novel, Chapter, UserProfile } from '../types';
import { formatXu } from '../utils/rulesAndVoices';
import { 
  X, 
  Lock, 
  Coins, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ShoppingBag, 
  Tag, 
  ArrowRight,
  ShieldCheck,
  BookOpen
} from 'lucide-react';

interface VipPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  novel: Novel;
  chapter: Chapter;
  user: UserProfile;
  onConfirmPurchase: (type: 'chapter' | 'full_book', price: number) => void;
  onOpenTopUp: () => void;
  purchaseMode?: 'all' | 'full_book_only' | 'chapter_only';
}

export const VipPurchaseModal: React.FC<VipPurchaseModalProps> = ({
  isOpen,
  onClose,
  novel,
  chapter,
  user,
  onConfirmPurchase,
  onOpenTopUp,
  purchaseMode = 'all',
}) => {
  // Khi ở chế độ full_book_only (Chốt đơn trọn bộ), mặc định và khóa chọn full_book
  const isFullBookOnly = purchaseMode === 'full_book_only';
  const isChapterOnly = purchaseMode === 'chapter_only';

  const [purchaseType, setPurchaseType] = useState<'chapter' | 'full_book'>(() => 
    isFullBookOnly ? 'full_book' : (isChapterOnly ? 'chapter' : 'full_book')
  );

  useEffect(() => {
    if (isFullBookOnly) {
      setPurchaseType('full_book');
    } else if (isChapterOnly) {
      setPurchaseType('chapter');
    }
  }, [isFullBookOnly, isChapterOnly]);

  if (!isOpen) return null;

  // Single chapter price (supports decimal like 0.01 or 0.35)
  const chapterPrice = typeof chapter.priceXu === 'number' ? chapter.priceXu : 5;

  // Full book base price & discount price based on actual VIP chapters
  const safeChapters = Array.isArray(novel?.chapters) ? novel.chapters : [];
  const realVipSum = safeChapters.filter((c) => c.isVip).reduce((s, c) => s + (c.priceXu || 0), 0);
  const comboBasePrice = novel.fullBookPriceXu || (realVipSum > 0 ? Math.round(realVipSum * 100) / 100 : 85);
  const comboPromoPrice = (novel.fullBookDiscountPriceXu && novel.fullBookDiscountPriceXu > 0 && novel.fullBookDiscountPriceXu < comboBasePrice)
    ? novel.fullBookDiscountPriceXu
    : (novel.fullBookDiscountPriceXu || comboBasePrice);
  const comboDiscountPercent = (comboBasePrice > 0 && comboPromoPrice < comboBasePrice)
    ? Math.round(((comboBasePrice - comboPromoPrice) / comboBasePrice) * 100)
    : 0;

  // Smart Pricing Algorithm: Calculate already spent Xu on individual chapters for this novel
  const unlockedChaptersForNovel = Array.isArray(user?.unlockedChapters?.[novel?.id])
    ? user.unlockedChapters[novel.id]
    : [];
  const alreadyPurchasedCount = unlockedChaptersForNovel?.length || 0;
  const alreadyPaidXu = (unlockedChaptersForNovel || []).reduce((sum, chId) => {
    const ch = safeChapters.find((c) => c.id === chId);
    const p = ch && typeof ch.priceXu === 'number' ? ch.priceXu : 5;
    return sum + p;
  }, 0);

  // Final Price for Full Book = Promo Price MINUS already paid Xu
  const fullBookFinalPrice = Math.max(0, parseFloat((comboPromoPrice - alreadyPaidXu).toFixed(2)));

  const selectedPrice = purchaseType === 'chapter' ? chapterPrice : fullBookFinalPrice;
  // Tổng số dư Xu khả dụng thực tế của người dùng
  const totalSpendableXu = (user.xuBalance || 0) + (user.authorEarnedXu || 0);
  const hasEnoughBalance = totalSpendableXu >= selectedPrice;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePurchase = async () => {
    if (!hasEnoughBalance) {
      onOpenTopUp();
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirmPurchase(purchaseType, selectedPrice);
      onClose();
    } catch (err) {
      console.error('Lỗi thanh toán VIP:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-pink-100 p-6 relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header - Nền hồng cánh sen nhẹ hoặc gradient Đạo Tâm */}
        <div className="flex items-center justify-between pb-4 border-b border-pink-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-100 dark:bg-pink-950/70 text-pink-600 dark:text-pink-300 flex items-center justify-center shadow-xs">
              {isFullBookOnly ? <ShoppingBag className="w-5 h-5 text-pink-600 dark:text-pink-300" /> : <Lock className="w-5 h-5 text-pink-600 dark:text-pink-300" />}
            </div>
            <div>
              <h3 className="font-serif text-lg font-black text-slate-900 dark:text-white">
                {isFullBookOnly ? 'Chốt Đơn Mua Trọn Bộ' : 'Mở Khóa Tác Phẩm VIP'}
              </h3>
              <p className="text-xs text-pink-600 dark:text-pink-400 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Hệ Thống Bản Quyền Đạo Tâm
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-full hover:bg-pink-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Novel Information Card */}
        <div className="my-4 p-3.5 rounded-2xl bg-pink-50/60 dark:bg-slate-800/80 border border-pink-200 dark:border-slate-700 flex items-center gap-3.5">
          <img
            src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
            alt={novel.title}
            className="w-13 h-18 rounded-xl object-cover flex-shrink-0 shadow-md border border-pink-200 dark:border-slate-700"
          />
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {novel.title}
            </h4>
            <div className="text-xs text-pink-700 dark:text-pink-300 font-bold mt-0.5">
              Tác giả: {novel.author}
              {novel.editor ? ` • Editor: ${novel.editor}` : ''}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium mt-1 flex items-center gap-2">
              <span>{novel.totalChapters} chương</span>
              <span>•</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 inline" /> Đọc &amp; Nghe Audio TTS vĩnh viễn
              </span>
            </div>
          </div>
        </div>

        {/* Purchase Options Selector */}
        <div className="space-y-3">
          {/* Option 1: Mua lẻ chương này (BỊ LOẠI BỎ HOÀN TOÀN KHI CHỌN CHỐT ĐƠN TRỌN BỘ NHƯ YÊU CẦU) */}
          {!isFullBookOnly && (
            <div
              onClick={() => setPurchaseType('chapter')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                purchaseType === 'chapter'
                  ? 'bg-pink-50/90 dark:bg-slate-800 border-pink-500 shadow-sm ring-2 ring-pink-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-pink-300'
              }`}
            >
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Chỉ Mua Chương {chapter.number}</span>
                  <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    Chương lẻ
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Mở khóa vĩnh viễn nội dung chữ &amp; Audio TTS của riêng chương này.
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-extrabold text-base text-pink-600 dark:text-pink-400 flex items-center gap-1 justify-end">
                  <Coins className="w-4 h-4 text-pink-500 dark:text-pink-400" />
                  {formatXu(chapterPrice)} Xu
                </div>
              </div>
            </div>
          )}

          {/* Option 2: Mua trọn bộ (Smart Pricing with auto-deduction) */}
          {!isChapterOnly && (
            <div
              onClick={() => setPurchaseType('full_book')}
              className={`p-4 rounded-2xl border transition-all relative overflow-hidden ${
                isFullBookOnly
                  ? 'bg-pink-50/70 dark:bg-slate-800 border-pink-500 shadow-md ring-2 ring-pink-400'
                  : purchaseType === 'full_book'
                  ? 'bg-pink-50/70 dark:bg-slate-800 border-pink-500 shadow-sm ring-2 ring-pink-400 cursor-pointer'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-pink-300 cursor-pointer'
              }`}
            >
              <div className="absolute top-0 right-0 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-extrabold text-[10px] px-3 py-1 rounded-bl-xl uppercase tracking-wider shadow-xs">
                Ưu Đãi Trọn Bộ • Tiết Kiệm Nhất
              </div>

              <div className="pt-2">
                <div className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                  <span>Mua Trọn Bộ Cả Truyện</span>
                  <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                    Combo VIP
                  </span>
                  {comboDiscountPercent > 0 && (
                    <span className="bg-gradient-to-r from-rose-600 to-pink-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs flex items-center gap-0.5 animate-pulse">
                      <span>🔥</span> Tiết kiệm {comboDiscountPercent}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Mở khóa tất cả {novel.totalChapters} chương hiện tại &amp; toàn bộ các chương mới cập nhật trong tương lai.
                </p>

                {/* Smart Pricing Deductions Breakdown */}
                <div className="mt-3 p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-pink-200 dark:border-slate-700 text-xs space-y-1.5 shadow-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-300 font-medium">
                    <span>Giá trọn bộ niêm yết:</span>
                    <span className="line-through text-slate-400">{formatXu(comboBasePrice)} Xu &rarr; <span className="text-pink-600 dark:text-pink-400 font-bold">{formatXu(comboPromoPrice)} Xu</span></span>
                  </div>

                  {alreadyPaidXu > 0 ? (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                      <span>Đã khấu trừ {alreadyPurchasedCount} chương bạn từng mua lẻ:</span>
                      <span>- {formatXu(alreadyPaidXu)} Xu</span>
                    </div>
                  ) : (
                    <div className="text-slate-500 dark:text-slate-400 italic text-[11px]">
                      (Chưa mua chương lẻ nào trước đó)
                    </div>
                  )}

                  <div className="flex justify-between text-slate-900 dark:text-white font-black pt-2 border-t border-pink-100 dark:border-slate-700 text-sm">
                    <span>Thực tế chốt đơn thanh toán:</span>
                    <span className="text-pink-600 dark:text-pink-400 text-base font-black flex items-center gap-1">
                      <Coins className="w-4 h-4 text-pink-500 dark:text-pink-400 inline" />
                      {formatXu(fullBookFinalPrice)} Xu
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Button & Balance Check */}
        <div className="mt-5 pt-4 border-t border-pink-100 dark:border-slate-700">
          {/* Wallet Balance Display */}
          <div className="mb-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-600 dark:text-slate-300 font-semibold">Số dư ví khả dụng của bạn:</span>
            <span className="font-black text-slate-900 dark:text-white flex items-center gap-1.5 text-sm sm:text-base">
              <Coins className="w-4 h-4 text-pink-500" />
              {formatXu(totalSpendableXu)} Xu
            </span>
          </div>

          {hasEnoughBalance ? (
            <button
              onClick={handlePurchase}
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:from-pink-600 hover:to-rose-700 text-white font-extrabold text-sm sm:text-base shadow-lg shadow-pink-500/25 flex items-center justify-center gap-2 transition-all hover:scale-101 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang xử lý giao dịch...</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-5 h-5" />
                  {isFullBookOnly 
                    ? `Chốt Đơn Mua Trọn Bộ (${formatXu(selectedPrice)} Xu)` 
                    : `Thanh Toán Ngay (${formatXu(selectedPrice)} Xu)`}
                </>
              )}
            </button>
          ) : (
            <div className="space-y-2.5">
              <div className="text-center text-xs text-rose-600 font-bold flex items-center justify-center gap-1.5 p-2.5 bg-rose-50 rounded-xl border border-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                Số dư Xu không đủ (Cần {formatXu(selectedPrice)} Xu, hiện có {formatXu(totalSpendableXu)} Xu)
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenTopUp();
                }}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-extrabold text-sm shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Coins className="w-4 h-4" />
                Nạp Thêm Xu Vào Ví Ngay
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
