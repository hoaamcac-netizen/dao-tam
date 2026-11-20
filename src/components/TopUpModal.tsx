import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, TopUpRequest } from '../types';
import { 
  X, 
  Coins, 
  QrCode, 
  CheckCircle2, 
  Copy, 
  Check, 
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Building2,
  Calendar,
  Upload,
  Image as ImageIcon,
  Trash2,
  Eye,
  Camera,
  RefreshCw
} from 'lucide-react';

import { auth } from '../firebase/config';
import { fetchTopUpRequestsFromFirestore } from '../firebase/services';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  topUpRequests?: TopUpRequest[];
  onSubmitTopUp: (request: Omit<TopUpRequest, 'id' | 'createdAt' | 'status'>) => Promise<TopUpRequest | void>;
  onCancelTopUp?: (requestId: string) => void;
  onUpdateBillImage?: (requestId: string, billImageUrl: string) => Promise<void> | void;
  onOpenWithdraw?: () => void;
  isStoryPublisher?: boolean;
}

const QUICK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

export const TopUpModal: React.FC<TopUpModalProps> = ({
  isOpen,
  onClose,
  user,
  topUpRequests = [],
  onSubmitTopUp,
  onCancelTopUp,
  onUpdateBillImage,
  onOpenWithdraw,
  isStoryPublisher = false,
}) => {
  // Navigation inside modal: 'main' (Hình 3) | 'confirm_prompt' (Hình 4) | 'payment_bill' (Hình 5)
  const [viewMode, setViewMode] = useState<'main' | 'confirm_prompt' | 'payment_bill'>('main');

  // Active payment tab in Hình 3
  const [activeTab, setActiveTab] = useState<'vietqr' | 'paypal'>('vietqr');

  // Amount state
  const [amountVnd, setAmountVnd] = useState<number>(50000);
  const [rawAmountInput, setRawAmountInput] = useState<string>('50000');

  // Transfer code generation (e.g. DTXW + 5-6 digits/alphanumeric)
  const [transferCode, setTransferCode] = useState<string>('');

  // Active bill request ID if an order was created
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  // Bill Image proof state
  const [billImage, setBillImage] = useState<string | null>(null);
  const [billFileName, setBillFileName] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [previewingBillUrl, setPreviewingBillUrl] = useState<string | null>(null);
  const [uploadingRequestId, setUploadingRequestId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Copy feedbacks
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Notification banners
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null);

  // 15-minute countdown for bill
  const [timeLeftSecs, setTimeLeftSecs] = useState<number>(15 * 60);

  // Image load fallback for VietQR
  const [qrImgError, setQrImgError] = useState(false);

  // Reset or initialize when modal opens
  useEffect(() => {
    if (isOpen) {
      setViewMode('main');
      setToastMessage(null);
      setTimeLeftSecs(15 * 60);
      setQrImgError(false);
      setBillImage(null);
      setBillFileName(null);
      setPreviewingBillUrl(null);
    }
  }, [isOpen]);

  // Tải danh sách lệnh nạp của chính User bằng getDocs 1 lần (bọc try/catch chống trắng trang)
  const [liveUserTopUps, setLiveUserTopUps] = useState<TopUpRequest[] | null>(null);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState<boolean>(false);

  const loadUserTopUpHistory = async () => {
    if (!user.id || user.id === 'guest') return;
    setIsRefreshingHistory(true);
    try {
      const myRequests = await fetchTopUpRequestsFromFirestore(user.id);
      setLiveUserTopUps(Array.isArray(myRequests) ? myRequests : []);
    } catch (err) {
      console.warn('Lỗi tải lịch sử nạp xu:', err);
    } finally {
      setIsRefreshingHistory(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !user.id || user.id === 'guest') return;
    let isActive = true;
    setIsRefreshingHistory(true);
    fetchTopUpRequestsFromFirestore(user.id)
      .then((myRequests) => {
        if (isActive) {
          setLiveUserTopUps(Array.isArray(myRequests) ? myRequests : []);
        }
      })
      .catch((err) => {
        console.warn('Lỗi tải lịch sử nạp xu:', err);
      })
      .finally(() => {
        if (isActive) setIsRefreshingHistory(false);
      });
    return () => {
      isActive = false;
    };
  }, [isOpen, user.id]);

  // Countdown timer for bill view
  useEffect(() => {
    if (viewMode !== 'payment_bill') return;
    const interval = setInterval(() => {
      setTimeLeftSecs((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [viewMode]);

  if (!isOpen) return null;

  // Rate: 1 xu = 1 đồng -> xu = amount
  const calculatedXu = Math.floor(amountVnd);

  const bankName = 'MB (Ngân Hàng TMCP Quân Đội)';
  const accountNumber = '0703765892';
  const accountHolder = 'PHAM KIM CHI';
  const sellerName = 'Đạo Tâm';
  const fallbackQrImage = '/assets/aistudio/m__QA_df6eb6ad.jpg';
  const logoImage = '/assets/aistudio/image_64405714.png';

  // Dynamic VietQR code URL
  const dynamicQrUrl = `https://api.vietqr.io/image/970422-${accountNumber}-compact2.jpg?amount=${amountVnd}&addInfo=${encodeURIComponent(transferCode)}&accountName=${encodeURIComponent(accountHolder)}`;

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleOpenPurchasePrompt = () => {
    setAmountVnd(50000);
    setRawAmountInput('50000');
    setViewMode('confirm_prompt');
  };

  const handleConfirmPurchase = () => {
    if (amountVnd < 10000) {
      alert('Đơn nạp tối thiểu là 10.000đ');
      return;
    }
    if (amountVnd > 2000000) {
      alert('Đơn nạp tối đa là 2.000.000đ');
      return;
    }

    // Generate random realistic transfer code like DTXW9281 or DTXU7384
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randomNum = Math.floor(10 + Math.random() * 90);
    const newCode = `DTXU${randomChars}${randomNum}`;
    setTransferCode(newCode);
    setTimeLeftSecs(14 * 60 + 59);
    setQrImgError(false);
    setViewMode('payment_bill');
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } else {
            resolve(dataUrl);
          }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleBillImageUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp định dạng hình ảnh (PNG, JPG, JPEG, WebP)');
      return;
    }
    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      setBillImage(compressed);
      setBillFileName(file.name);
    } catch (err) {
      console.error('Error compressing bill:', err);
    } finally {
      setIsCompressing(false);
    }
  };

  // Upload or attach bill to an already created pending request from history table
  const handleUploadBillForExistingRequest = async (requestId: string, file?: File) => {
    if (!file || !onUpdateBillImage) return;
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp định dạng hình ảnh (PNG, JPG, JPEG, WebP)');
      return;
    }
    setUploadingRequestId(requestId);
    try {
      const compressed = await compressImage(file);
      await onUpdateBillImage(requestId, compressed);
      await loadUserTopUpHistory();
      setToastMessage({
        type: 'success',
        text: 'Đã gửi ảnh biên lai chuyển khoản thành công! Ban Quản Trị sẽ xem bill để duyệt xu ngay.',
      });
    } catch (err) {
      console.error('Lỗi tải ảnh bill:', err);
      alert('Không thể tải ảnh bill lên, vui lòng thử lại.');
    } finally {
      setUploadingRequestId(null);
    }
  };

  // User confirms: "Tôi đã chuyển khoản"
  const handleUserPaidConfirm = async () => {
    // BẮT BUỘC lấy thông tin thật từ Firebase Auth (currentUser)
    const currentUser = auth.currentUser;
    const realEmail = currentUser?.email || (user?.email && user.email !== 'docgia@daotam.vn' ? user.email : '');
    const realUid = currentUser?.uid || (user?.isLoggedIn && user?.id && user.id !== 'guest' ? user.id : '');
    const realName = currentUser?.displayName || 
      (realEmail && realEmail.includes('@') ? realEmail.split('@')[0] : (user?.displayName && user.displayName !== 'Khách Đọc Truyện' ? user.displayName : ''));

    if (!realUid || !realEmail) {
      alert('⚠️ Bạn cần đăng nhập tài khoản trước khi gửi lệnh nạp tiền để hệ thống cộng Xu chính xác.');
      return;
    }

    // If user hasn't selected a bill image, prompt them so they know bill speeds up approval
    if (!billImage) {
      const proceedWithoutBill = window.confirm(
        '💡 Bạn chưa tải ảnh biên lai (bill) chuyển khoản.\n\nĐính kèm ảnh bill giúp Admin Đạo Tâm đối soát tài khoản MBBank và duyệt cộng Xu nhanh nhất.\n\n• Bấm OK nếu bạn muốn gửi ngay mà không có ảnh bill.\n• Bấm Hủy nếu bạn muốn tải ảnh bill lên trước.'
      );
      if (!proceedWithoutBill) {
        fileInputRef.current?.click();
        return;
      }
    }

    try {
      const created = await onSubmitTopUp({
        uid: realUid,
        userId: realUid,
        userEmail: realEmail,
        userName: realName || (realEmail.split('@')[0]),
        amountVnd,
        xuAmount: calculatedXu,
        transferCode,
        bankName,
        accountNumber,
        accountHolder,
        sellerName,
        billImageUrl: billImage || undefined,
      });

      if (created) {
        setActiveRequestId(created.id);
      }

      setToastMessage({
        type: 'success',
        text: `Đã gửi xác nhận chuyển khoản ${amountVnd.toLocaleString('vi-VN')}đ (+${calculatedXu.toLocaleString('vi-VN')} Xu)${billImage ? ' kèm ảnh biên lai' : ''}! Admin Đạo Tâm sẽ đối soát và phê duyệt nạp xu ngay.`,
      });

      await loadUserTopUpHistory();
      setViewMode('main');
    } catch (err: any) {
      console.error('Error submitting top-up payment:', err);
      setToastMessage({
        type: 'warning',
        text: err?.message || 'Có lỗi xảy ra khi gửi xác nhận chuyển khoản, vui lòng thử lại.',
      });
      setViewMode('main');
    }
  };

  // User cancels: "Huỷ đơn"
  const handleCancelOrder = () => {
    const currentUser = auth.currentUser;
    const realEmail = currentUser?.email || (user?.email && user.email !== 'docgia@daotam.vn' ? user.email : '');
    const realUid = currentUser?.uid || (user?.isLoggedIn && user?.id && user.id !== 'guest' ? user.id : '');
    const realName = currentUser?.displayName || 
      (realEmail && realEmail.includes('@') ? realEmail.split('@')[0] : (user?.displayName && user.displayName !== 'Khách Đọc Truyện' ? user.displayName : ''));

    if (activeRequestId && onCancelTopUp) {
      onCancelTopUp(activeRequestId);
    } else if (realUid && realEmail) {
      // Record a cancelled topup record for the user so it displays "Đã hủy" in history
      onSubmitTopUp({
        uid: realUid,
        userId: realUid,
        userEmail: realEmail,
        userName: realName || (realEmail.split('@')[0]),
        amountVnd,
        xuAmount: calculatedXu,
        transferCode: transferCode || `DTXU${Math.floor(100000 + Math.random() * 900000)}`,
        bankName,
        accountNumber,
        accountHolder,
        sellerName,
      }).then((res) => {
        if (res && onCancelTopUp) {
          onCancelTopUp(res.id);
        }
      }).catch(() => {});
    }

    setToastMessage({
      type: 'warning',
      text: 'Đã hủy đơn nạp tiền. Đơn này sẽ không được tiếp tục xử lý.',
    });

    setViewMode('main');
  };

  const handleCopy = (text: string, type: 'account' | 'code' | 'amount') => {
    navigator.clipboard.writeText(text);
    if (type === 'account') {
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    } else if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else if (type === 'amount') {
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    }
  };

  // Filter history for current user or all if admin/demo (Ưu tiên realtime snapshot)
  const effectiveTopUps = Array.isArray(liveUserTopUps)
    ? liveUserTopUps
    : Array.isArray(topUpRequests)
    ? topUpRequests
    : [];
  const userHistory = (effectiveTopUps || []).filter(
    (r) => !user.id || user.id === 'guest' || r.userId === user.id || r.userEmail === user.email
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 text-slate-800 dark:text-slate-100 animate-in fade-in duration-200">
      
      {/* =========================================================================
          VIEW 1: HÌNH 3 (Giao diện chính Nạp xu vào tài khoản)
         ========================================================================= */}
      {viewMode === 'main' && (
        <div 
          className="relative w-full max-w-3xl bg-gradient-to-b from-[#ffffff] via-[#fff5f8] to-[#ffeef3] border-2 border-pink-200/90 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-rose-300/40 text-black overflow-hidden max-h-[92vh] overflow-y-auto topup-modal-main"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-700 hover:text-black border border-pink-200 flex items-center justify-center transition-colors cursor-pointer shadow-xs"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Top banner feedback if any */}
          {toastMessage && (
            <div className={`mb-5 p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-2 ${
              toastMessage.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : 'bg-rose-50 text-rose-800 border border-rose-300'
            }`}>
              <div className="flex items-center gap-2">
                {toastMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                )}
                <span>{toastMessage.text}</span>
              </div>
              <button 
                onClick={() => setToastMessage(null)}
                className="text-slate-500 hover:text-black p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Header Card (Hình 3) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-pink-100">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-black dark:text-black uppercase tracking-wide">
                <Coins className="w-3.5 h-3.5 text-pink-600 dark:text-pink-600" />
                <span className="text-black dark:text-black">Nạp xu</span>
              </div>
              <h2 className="font-sans text-2xl sm:text-3xl font-extrabold text-black dark:text-black mt-1">
                Nạp xu vào tài khoản
              </h2>
            </div>

            {/* Current Balance Badge (Right top badge matching Hình 3) */}
            <div className="bg-rose-50/80 border border-pink-200 rounded-2xl px-5 py-3 text-right shadow-xs self-start sm:self-auto">
              <div className="text-[11px] font-bold text-black dark:text-black">Số dư hiện tại</div>
              <div className="text-2xl sm:text-3xl font-black text-pink-600 dark:text-pink-600 flex items-center justify-end gap-1.5 mt-0.5 coin-number-pink">
                <Coins className="w-6 h-6 text-pink-600 dark:text-pink-600" />
                <span className="text-pink-600 dark:text-pink-600 font-black">{Number(user.xuBalance).toLocaleString('vi-VN')}</span>
              </div>
            </div>
          </div>

          {/* Exchange Rate Card (Tỉ giá 1 xu = 1 đồng chuẩn toàn hệ thống) */}
          <div className="bg-white/90 border border-pink-200 rounded-2xl p-4 sm:p-5 flex items-start gap-4 shadow-xs mb-6 mt-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-pink-600 dark:text-pink-600 flex items-center justify-center flex-shrink-0 text-xl font-bold shadow-xs">
              <Coins className="w-6 h-6 text-pink-600 dark:text-pink-600" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-bold text-black dark:text-black">Tỷ giá hiện tại</div>
              <div className="text-lg sm:text-xl font-black text-pink-600 dark:text-pink-600 coin-number-pink">
                1 xu = 1 đồng <span className="text-xs font-semibold text-black dark:text-black">(10.000đ = 10.000 xu • 50.000đ = 50.000 xu)</span>
              </div>
              <p className="text-xs text-black dark:text-black leading-relaxed font-medium">
                Quét QR chuyển khoản đúng nội dung số tiền, xu sẽ được hệ thống và Admin đối soát duyệt cộng ngay sau khi thanh toán thành công.
              </p>
            </div>
          </div>

          {/* NÚT MUA XU TO Ở GIỮA HÌNH VÀ ĐẶT TRƯỚC LỊCH SỬ NẠP XU (Yêu cầu chính) */}
          <div className="my-7 text-center space-y-3">
            <div>
              <button
                type="button"
                onClick={handleOpenPurchasePrompt}
                className="inline-flex items-center justify-center gap-3 px-12 py-4 rounded-2xl bg-gradient-to-r from-rose-500 via-pink-600 to-rose-600 hover:from-rose-600 hover:to-pink-700 text-white font-black text-base sm:text-lg shadow-xl shadow-rose-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Coins className="w-6 h-6 animate-pulse" />
                <span>Mua Xu Ngay</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            {/* Nút Rút xu màu hồng dưới nút Mua/Nạp xu dành cho người đăng truyện */}
            {isStoryPublisher && onOpenWithdraw && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWithdraw();
                  }}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:from-pink-600 hover:to-rose-600 text-white font-black text-xs sm:text-sm shadow-md shadow-pink-500/25 transition-all cursor-pointer hover:scale-102"
                  title="Dành riêng cho người đăng truyện (Tối thiểu 1000 xu)"
                >
                  <Coins className="w-4 h-4 text-white" />
                  <span>Rút xu người đăng truyện (Tối thiểu 1000 Xu) &rarr;</span>
                </button>
              </div>
            )}
          </div>

          {/* Lịch sử nạp xu Table (Hình 3) */}
          <div className="bg-white/95 border border-pink-200 rounded-2xl p-5 shadow-xs topup-card-light">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-base text-black dark:text-black flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-600" />
                  Lịch sử nạp xu
                </h3>
                <p className="text-xs text-rose-600 font-semibold mt-0.5 flex items-center gap-1">
                  <span>👆 Bấm vào một đơn để xem chi tiết và trạng thái duyệt.</span>
                </p>
              </div>
              <button
                type="button"
                onClick={loadUserTopUpHistory}
                disabled={isRefreshingHistory}
                className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-pink-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 shrink-0"
                title="Tải lại lịch sử nạp xu"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingHistory ? 'animate-spin' : ''}`} />
                <span>Tải lại</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pink-100 text-black dark:text-black font-bold uppercase text-[11px]">
                    <th className="py-2.5 px-3 text-black dark:text-black">Số tiền</th>
                    <th className="py-2.5 px-3 text-black dark:text-black">Người bán</th>
                    <th className="py-2.5 px-3 text-black dark:text-black">Biên lai / Bill</th>
                    <th className="py-2.5 px-3 text-black dark:text-black">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right text-black dark:text-black">Ngày</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pink-50">
                  {(userHistory?.length || 0) === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-black dark:text-black font-medium">
                        Chưa có lịch sử giao dịch nạp xu nào. Bấm nút <strong className="text-rose-600 font-bold">"Mua Xu Ngay"</strong> ở trên để nạp xu đọc truyện.
                      </td>
                    </tr>
                  ) : (
                    (userHistory || []).map((item) => {
                      const isPending = item.status === 'pending';
                      const isApproved = item.status === 'approved';
                      const isCancelled = item.status === 'cancelled';
                      const isRejected = item.status === 'rejected';

                      return (
                        <tr 
                          key={item.id}
                          onClick={() => {
                            if (isPending) {
                              setAmountVnd(item.amountVnd);
                              setTransferCode(item.transferCode);
                              setActiveRequestId(item.id);
                              setViewMode('payment_bill');
                            }
                          }}
                          className={`hover:bg-rose-50/50 transition-colors cursor-pointer ${
                            isPending ? 'font-semibold' : ''
                          }`}
                        >
                          <td className="py-3 px-3 font-extrabold text-black dark:text-black">
                            {item.amountVnd.toLocaleString('vi-VN')}đ
                            <span className="block text-[11px] text-rose-600 font-semibold">
                              (+{item.xuAmount.toLocaleString('vi-VN')} xu)
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-black dark:text-black">
                            {item.sellerName || 'Đạo Tâm'}
                          </td>
                          <td className="py-3 px-3">
                            {item.billImageUrl ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewingBillUrl(item.billImageUrl || null);
                                }}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-pink-50 dark:bg-pink-950/60 hover:bg-pink-100 dark:hover:bg-pink-900/60 text-pink-700 dark:text-pink-300 text-[11px] font-bold border border-pink-200 dark:border-pink-800 transition cursor-pointer shadow-2xs"
                                title="Bấm để xem ảnh biên lai chuyển khoản"
                              >
                                <img
                                  src={item.billImageUrl}
                                  alt="Bill"
                                  className="w-5 h-5 object-cover rounded border border-pink-300 dark:border-pink-700"
                                />
                                <Eye className="w-3 h-3 text-pink-600 dark:text-pink-400" />
                                <span>Xem bill</span>
                              </button>
                            ) : isPending ? (
                              <label
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold border border-pink-200 dark:border-pink-800 cursor-pointer transition shadow-2xs"
                                title="Tải ảnh bill lên cho đơn nạp này để Admin duyệt nhanh"
                              >
                                <Upload className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                <span>{uploadingRequestId === item.id ? 'Đang gửi...' : '+ Gửi bill'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingRequestId === item.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadBillForExistingRequest(item.id, file);
                                  }}
                                />
                              </label>
                            ) : (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">Không có</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {isPending && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 inline-flex items-center gap-1 shadow-2xs">
                                ⏳ Chờ chuyển tiền
                              </span>
                            )}
                            {isApproved && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1">
                                ✅ Thành công
                              </span>
                            )}
                            {isCancelled && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                Đã hủy
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                                Từ chối
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-slate-600 dark:text-slate-400 text-[11px]">
                            {new Date(item.createdAt).toLocaleDateString('vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: HÌNH 4 (Popup Xác nhận mua xu)
         ========================================================================= */}
      {viewMode === 'confirm_prompt' && (
        <div 
          className="relative w-full max-w-md bg-white dark:bg-slate-900 border-2 border-pink-200 dark:border-pink-900/60 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-rose-300/50 dark:shadow-none text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => setViewMode('main')}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-5">
            Xác nhận mua xu
          </h3>

          {/* Seller Card (Đạo Tâm Logo & Name per request) */}
          <div className="bg-[#fff9fb] border border-pink-200 rounded-2xl p-4 mb-4 topup-card-light">
            <div className="flex items-center gap-3 pb-3 border-b border-pink-100">
              <div className="w-14 h-14 rounded-full bg-white p-1 border-2 border-pink-300 shadow-sm flex items-center justify-center overflow-hidden flex-shrink-0">
                <img 
                  src={logoImage} 
                  alt="Đạo Tâm" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h4 className="font-black text-base text-black dark:text-black">
                  Đạo Tâm
                </h4>
                <div className="text-xs font-extrabold flex items-center gap-1 mt-0.5 text-black dark:text-black">
                  <Coins className="w-3.5 h-3.5 text-pink-600 dark:text-pink-600 flex-shrink-0" />
                  <span className="text-black dark:text-black">
                    Còn <strong className="text-pink-600 dark:text-pink-600 font-black text-sm coin-number-pink">1M+</strong> xu
                  </span>
                </div>
              </div>
            </div>

            {/* Min and Max Limits */}
            <div className="grid grid-cols-2 gap-2 pt-3 text-xs">
              <div className="bg-white/90 p-2.5 rounded-xl border border-pink-100">
                <span className="text-black dark:text-black font-semibold block text-[11px]">Đơn tối thiểu</span>
                <strong className="text-pink-600 dark:text-pink-600 font-extrabold text-sm coin-number-pink">10.000đ</strong>
              </div>
              <div className="bg-white/90 p-2.5 rounded-xl border border-pink-100">
                <span className="text-black dark:text-black font-semibold block text-[11px]">Đơn tối đa</span>
                <strong className="text-pink-600 dark:text-pink-600 font-extrabold text-sm coin-number-pink">2.000.000đ</strong>
              </div>
            </div>
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1.5">
              Số tiền muốn nạp (đ)
            </label>
            <div className="relative">
              <input
                type="text"
                value={amountVnd ? amountVnd.toLocaleString('vi-VN') : ''}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '');
                  const num = cleaned ? parseInt(cleaned, 10) : 0;
                  setAmountVnd(num);
                  setRawAmountInput(cleaned);
                }}
                className="w-full pl-4 pr-10 py-3 rounded-2xl bg-white dark:bg-slate-800 border-2 border-rose-400 dark:border-slate-700 focus:border-rose-600 dark:focus:border-rose-500 font-black text-xl text-slate-900 dark:text-slate-100 focus:outline-none shadow-xs"
                placeholder="50.000"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-sm text-slate-500 dark:text-slate-400">
                đ
              </span>
            </div>

            {/* Quick chips */}
            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              {(QUICK_AMOUNTS || []).map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setAmountVnd(amt);
                    setRawAmountInput(amt.toString());
                  }}
                  className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    amountVnd === amt
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-rose-50/70 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-slate-700 text-rose-700 dark:text-rose-300 border-pink-200 dark:border-slate-700'
                  }`}
                >
                  {amt.toLocaleString('vi-VN')}đ
                </button>
              ))}
            </div>
          </div>

          {/* Summary Box */}
          <div className="bg-[#fff9fb] border border-pink-200 rounded-2xl p-3.5 mb-5 space-y-2 text-xs topup-card-light">
            <div className="flex justify-between items-center">
              <span className="text-black dark:text-black font-semibold">Số tiền thanh toán:</span>
              <strong className="text-pink-600 dark:text-pink-600 font-extrabold text-sm coin-number-pink">
                {amountVnd.toLocaleString('vi-VN')}đ
              </strong>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-pink-100">
              <span className="text-black dark:text-black font-semibold">Số xu nhận được:</span>
              <strong className="text-pink-600 dark:text-pink-600 font-black text-base coin-number-pink">
                {calculatedXu.toLocaleString('vi-VN')} xu
              </strong>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setViewMode('main')}
              className="py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-rose-600 dark:text-rose-400 border border-pink-300 dark:border-slate-700 font-bold text-sm cursor-pointer transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmPurchase}
              className="py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-black text-sm shadow-lg shadow-rose-400/40 cursor-pointer transition-all hover:scale-102"
            >
              Xác nhận mua
            </button>
          </div>

        </div>
      )}

      {/* =========================================================================
          VIEW 3: HÌNH 5 (Thông tin chuyển khoản & Bill VietQR MBBank Đạo Tâm)
         ========================================================================= */}
      {viewMode === 'payment_bill' && (
        <div 
          className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border-2 border-pink-200 dark:border-pink-900/60 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-rose-300/40 dark:shadow-none text-slate-900 dark:text-slate-100 overflow-hidden max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => setViewMode('main')}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Top section: Two columns (QR Code on left, Banking Info on right) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pb-5 border-b border-pink-100 dark:border-slate-800">
            
            {/* Left Column: QR Code & Countdown */}
            <div className="md:col-span-5 flex flex-col items-center text-center">
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-white mb-2">
                Quét mã để chuyển khoản
              </h4>

              {/* QR Image Box matching VietQR MBBank */}
              <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border-2 border-rose-300 dark:border-slate-700 shadow-md relative group">
                <div className="text-[11px] font-black tracking-widest text-rose-600 mb-1 flex items-center justify-center gap-1">
                  <span>VIET</span>
                  <span className="text-sky-600">QR</span>
                </div>
                <img
                  src={qrImgError ? fallbackQrImage : dynamicQrUrl}
                  onError={() => setQrImgError(true)}
                  alt="Mã QR Chuyển Khoản MB"
                  className="w-44 h-44 object-contain mx-auto"
                />
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">
                  MB Bank • {accountNumber}
                </div>
              </div>

              {/* Countdown timer */}
              <div className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1.5">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span>Giữ Xu cho bạn trong {formatTimer(timeLeftSecs)}</span>
              </div>

              {/* Waiting status */}
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold flex items-center justify-center gap-1.5 animate-pulse">
                <span>✨ Đang chờ tiền về tài khoản...</span>
              </div>
            </div>

            {/* Right Column: Banking Details with copy buttons */}
            <div className="md:col-span-7 space-y-3">
              <h4 className="font-extrabold text-base text-slate-900 dark:text-white pb-1 border-b border-pink-100 dark:border-slate-800">
                Thông tin chuyển khoản
              </h4>

              <div className="space-y-2 text-xs">
                {/* Người bán */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Người bán:</span>
                  <strong className="text-slate-900 dark:text-white font-extrabold text-sm">{sellerName}</strong>
                </div>

                {/* Ngân hàng */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Ngân hàng:</span>
                  <strong className="text-slate-900 dark:text-white font-extrabold">{bankName}</strong>
                </div>

                {/* Số tài khoản */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Số tài khoản:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-slate-900 dark:text-white font-extrabold text-sm">{accountNumber}</strong>
                    <button
                      type="button"
                      onClick={() => handleCopy(accountNumber, 'account')}
                      className="p-1 rounded bg-rose-50 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-slate-700 text-rose-600 dark:text-rose-400 cursor-pointer transition-colors"
                      title="Sao chép số tài khoản"
                    >
                      {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Chủ tài khoản */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Chủ tài khoản:</span>
                  <strong className="text-slate-900 dark:text-white font-extrabold uppercase">{accountHolder}</strong>
                </div>

                {/* Số tiền */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Số tiền:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="text-rose-600 dark:text-rose-400 font-black text-base">{amountVnd.toLocaleString('vi-VN')}đ</strong>
                    <button
                      type="button"
                      onClick={() => handleCopy(amountVnd.toString(), 'amount')}
                      className="p-1 rounded bg-rose-50 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-slate-700 text-rose-600 dark:text-rose-400 cursor-pointer transition-colors"
                      title="Sao chép số tiền"
                    >
                      {copiedAmount ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Nội dung chuyển khoản */}
                <div className="flex items-center justify-between py-1 bg-rose-50/60 dark:bg-slate-800/90 p-2 rounded-xl border border-pink-200 dark:border-slate-700">
                  <span className="text-slate-700 dark:text-slate-200 font-bold">Nội dung CK:</span>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-rose-600 dark:text-rose-400 font-black text-sm tracking-wide">{transferCode}</strong>
                    <button
                      type="button"
                      onClick={() => handleCopy(transferCode, 'code')}
                      className="p-1 rounded bg-rose-200 dark:bg-rose-950/80 hover:bg-rose-300 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-200 cursor-pointer transition-colors"
                      title="Sao chép nội dung"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Bạn nhận */}
                <div className="flex items-center justify-between py-1 pt-2 border-t border-pink-100 dark:border-slate-800">
                  <span className="text-slate-700 dark:text-slate-200 font-bold">Bạn nhận:</span>
                  <strong className="text-rose-600 dark:text-rose-400 font-black text-base">
                    {calculatedXu.toLocaleString('vi-VN')} Xu
                  </strong>
                </div>
              </div>

              {/* Mục gửi ảnh bill đã chuyển */}
              <div className="p-3 bg-rose-50/60 dark:bg-slate-800/90 border border-pink-200 dark:border-slate-700 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Gửi ảnh bill đã chuyển:</span>
                  </span>
                  <span className="text-[10px] text-pink-600 dark:text-pink-400 font-bold">
                    (Để Admin kiểm tra &amp; duyệt xu nhanh)
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBillImageUpload(file);
                  }}
                  className="hidden"
                />

                {billImage ? (
                  <div className="flex items-center justify-between gap-3 p-2 bg-white dark:bg-slate-900 rounded-xl border border-pink-200 dark:border-slate-700 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => setPreviewingBillUrl(billImage)}
                        className="relative group w-12 h-12 rounded-lg border border-pink-300 dark:border-pink-700 overflow-hidden flex-shrink-0 cursor-pointer"
                        title="Bấm để xem ảnh phóng to"
                      >
                        <img
                          src={billImage}
                          alt="Ảnh bill đã chọn"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                          <Eye className="w-3.5 h-3.5" />
                        </div>
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">Đã đính kèm ảnh bill</span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {billFileName || 'anh_chuyen_khoan.jpg'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setPreviewingBillUrl(billImage)}
                          className="text-[10px] text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 font-semibold underline cursor-pointer mt-0.5 inline-block"
                        >
                          Xem phóng to ảnh bill
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-pink-50 dark:bg-slate-800 hover:bg-pink-100 dark:hover:bg-slate-700 text-pink-700 dark:text-pink-300 text-[11px] font-bold border border-pink-200 dark:border-slate-700 cursor-pointer transition"
                      >
                        Đổi ảnh
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBillImage(null);
                          setBillFileName(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-800 cursor-pointer transition"
                        title="Xóa ảnh bill"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isCompressing}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-pink-300 dark:border-slate-700 hover:border-pink-500 dark:hover:border-pink-500 bg-white dark:bg-slate-900 hover:bg-pink-50/40 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-pink-700 dark:hover:text-pink-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                    <span>{isCompressing ? 'Đang nén và xử lý ảnh...' : 'Tải lên ảnh chụp màn hình / bill chuyển khoản'}</span>
                  </button>
                )}
              </div>

              {/* Warning note per Hình 5 */}
              <div className="p-3 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-2xl text-[11px] text-amber-950 dark:text-amber-200 font-medium leading-relaxed">
                ⚠️ Chuyển <strong>đúng số tiền</strong>, ghi <strong>đúng nội dung {transferCode}</strong> và chỉ chuyển một lần. Sau khi chuyển tiền, đính kèm ảnh bill và bấm <strong>"Tôi đã chuyển khoản"</strong> để Admin đối soát duyệt Xu ngay.
              </div>

              {/* Action buttons (Tôi đã chuyển khoản & Huỷ đơn) */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleUserPaidConfirm}
                  className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-black text-sm shadow-lg shadow-rose-400/40 cursor-pointer transition-all hover:scale-102 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Tôi đã chuyển khoản</span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelOrder}
                  className="py-3 px-5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-sm cursor-pointer transition-colors"
                >
                  Huỷ đơn
                </button>
              </div>

            </div>
          </div>

          {/* Bottom Table: Lịch sử nạp xu in bill view */}
          <div className="mt-5">
            <h5 className="font-extrabold text-xs text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              Lịch sử nạp xu
            </h5>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pink-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-2 px-2">Số tiền</th>
                    <th className="py-2 px-2">Người bán</th>
                    <th className="py-2 px-2">Biên lai</th>
                    <th className="py-2 px-2">Trạng thái</th>
                    <th className="py-2 px-2 text-right">Ngày</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pink-50 dark:divide-slate-800">
                  {(userHistory || []).slice(0, 5).map((item) => (
                    <tr key={item.id} className="text-[11px]">
                      <td className="py-2 px-2 font-bold text-slate-900 dark:text-white">{item.amountVnd.toLocaleString('vi-VN')}đ</td>
                      <td className="py-2 px-2 text-slate-700 dark:text-slate-300">{item.sellerName || 'Đạo Tâm'}</td>
                      <td className="py-2 px-2">
                        {item.billImageUrl ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewingBillUrl(item.billImageUrl || null);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-50 dark:bg-pink-950/60 hover:bg-pink-100 dark:hover:bg-pink-900/60 text-pink-700 dark:text-pink-300 text-[10px] font-bold border border-pink-200 dark:border-pink-800 cursor-pointer transition"
                            title="Xem ảnh bill"
                          >
                            <Eye className="w-3 h-3 text-pink-600 dark:text-pink-400" />
                            <span>Xem bill</span>
                          </button>
                        ) : item.status === 'pending' ? (
                          <label
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold border border-pink-200 dark:border-pink-800 cursor-pointer transition"
                            title="Tải ảnh bill lên"
                          >
                            <Upload className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400" />
                            <span>{uploadingRequestId === item.id ? 'Đang gửi...' : 'Gửi bill'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingRequestId === item.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadBillForExistingRequest(item.id, file);
                              }}
                            />
                          </label>
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {item.status === 'pending' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                            Chờ chuyển tiền
                          </span>
                        )}
                        {item.status === 'approved' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                            Thành công
                          </span>
                        )}
                        {item.status === 'cancelled' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                            Đã hủy
                          </span>
                        )}
                        {item.status === 'rejected' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            Từ chối
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          LIGHTBOX: XEM ẢNH BIÊN LAI / BILL PHÓNG TO
         ========================================================================= */}
      {previewingBillUrl && (
        <div 
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewingBillUrl(null)}
        >
          <div 
            className="relative max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-2xl border-2 border-pink-200 dark:border-pink-900/60 flex flex-col items-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-300 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Ảnh biên lai bill chuyển khoản
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingBillUrl(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 flex items-center justify-center p-2">
              <img
                src={previewingBillUrl}
                alt="Biên lai chuyển khoản phóng to"
                className="max-h-[66vh] max-w-full object-contain rounded-lg"
              />
            </div>

            <div className="w-full flex items-center justify-between pt-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Được đối soát trực tiếp bởi Ban Quản Trị Đạo Tâm</span>
              <button
                type="button"
                onClick={() => setPreviewingBillUrl(null)}
                className="px-4 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold cursor-pointer transition"
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
