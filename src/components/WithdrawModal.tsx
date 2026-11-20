import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, WithdrawalRequest } from '../types';
import { formatXu } from '../utils/rulesAndVoices';
import { 
  X, 
  Coins, 
  AlertCircle, 
  Check,
  Building2, 
  Clock,
  Lock,
  ListOrdered
} from 'lucide-react';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  withdrawalRequests?: WithdrawalRequest[];
  onSubmitWithdrawal: (data: {
    amountXu: number;
    amountVnd: number;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    note?: string;
  }) => void;
}

const COMMON_BANKS = [
  'MB Bank (Ngân hàng Quân Đội)',
  'Vietcombank',
  'Techcombank',
  'BIDV',
  'VietinBank',
  'ACB',
  'TPBank',
  'VPBank',
  'Sacombank',
  'HDBank',
  'Khác',
];

// Định dạng thời gian chuẩn: DD/MM/YYYY HH:mm:ss (như hình 2)
function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  user,
  withdrawalRequests = [],
  onSubmitWithdrawal,
}) => {
  const authorXu = user.authorEarnedXu || 0;
  const walletXu = user.xuBalance || 0;
  // Số xu khả dụng của người đăng truyện
  const currentEarnedXu = Math.max(authorXu, walletXu, authorXu + walletXu);
  const isEligible = currentEarnedXu >= 1000;

  // Lọc lịch sử các yêu cầu rút tiền của tài khoản này
  const userWithdrawals = useMemo(() => {
    const safeList = Array.isArray(withdrawalRequests) ? withdrawalRequests : [];
    return safeList.filter(
      (w) =>
        w.authorId === user.id ||
        (user.email && w.authorEmail?.toLowerCase().trim() === user.email.toLowerCase().trim()) ||
        (user.displayName && w.authorName?.toLowerCase().trim() === user.displayName.toLowerCase().trim())
    ).sort((a, b) => b.createdAt - a.createdAt);
  }, [withdrawalRequests, user.id, user.email, user.displayName]);

  // Kiểm tra đơn chưa được duyệt
  const pendingRequest = useMemo(() => {
    return (userWithdrawals || []).find((w) => w.status === 'pending');
  }, [userWithdrawals]);
  const hasPendingWithdrawal = Boolean(pendingRequest);

  // Tab: 'request' (Tạo lệnh rút) | 'history' (Lịch sử rút)
  const [activeTab, setActiveTab] = useState<'request' | 'history'>('request');

  const [amountXu, setAmountXu] = useState<number>(() => Math.max(1000, Math.min(currentEarnedXu >= 1000 ? 1000 : currentEarnedXu, 1000)));
  const [bankName, setBankName] = useState<string>(user.bankInfo?.bankName || '');
  const [accountNumber, setAccountNumber] = useState<string>(user.bankInfo?.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState<string>(user.bankInfo?.accountHolder || '');
  const [note, setNote] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tự động đồng bộ thông tin tài khoản ngân hàng nếu user đã lưu trong hồ sơ
  useEffect(() => {
    if (user.bankInfo) {
      if (user.bankInfo.bankName && !bankName) setBankName(user.bankInfo.bankName);
      if (user.bankInfo.accountNumber && !accountNumber) setAccountNumber(user.bankInfo.accountNumber);
      if (user.bankInfo.accountHolder && !accountHolder) setAccountHolder(user.bankInfo.accountHolder);
    }
  }, [user.bankInfo]);

  // Khi mở modal: Nếu đang có đơn chưa duyệt thì tự động hiển thị tab Lịch Sử Rút
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (hasPendingWithdrawal) {
        setActiveTab('history');
      } else {
        setActiveTab('request');
      }
      if (currentEarnedXu >= 1000 && amountXu < 1000) {
        setAmountXu(1000);
      }
    }
  }, [isOpen, hasPendingWithdrawal]);

  if (!isOpen) return null;

  const amountVnd = amountXu;
  const remainingXu = Math.max(0, currentEarnedXu - amountXu);
  const isBankInfoComplete = Boolean(bankName.trim() && accountNumber.trim() && accountHolder.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // QUY ĐỊNH: Số lần rút xu không được thực hiện nhiều lần, chỉ khi nào đơn trước đó được duyệt thì mới rút tiếp
    if (hasPendingWithdrawal) {
      setErrorMessage('Bạn đang có một yêu cầu rút xu chưa được duyệt. Vui lòng chờ Admin duyệt đơn trước đó.');
      setActiveTab('history');
      return;
    }

    if (!isEligible) {
      setErrorMessage('Số dư cần đạt tối thiểu 1000 Xu để tạo lệnh rút tiền.');
      return;
    }

    if (amountXu < 1000) {
      setErrorMessage('Số xu rút tối thiểu là 1000 Xu.');
      return;
    }

    if (amountXu > currentEarnedXu) {
      setErrorMessage(`Bạn chỉ có tối đa ${formatXu(currentEarnedXu)} Xu để rút.`);
      return;
    }

    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      setErrorMessage('Yêu cầu trước đó: Các thông tin về tài khoản ngân hàng (Ngân hàng, STK, Tên chủ tài khoản) phải được điền đầy đủ.');
      return;
    }

    // Gửi yêu cầu rút xu
    onSubmitWithdrawal({
      amountXu,
      amountVnd,
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountHolder: accountHolder.trim().toUpperCase(),
      note: note.trim(),
    });

    // Sau khi gửi, hiện ngay trang lịch sử rút xu với trạng thái chưa được duyệt (như hình 2)
    setActiveTab('history');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#faf6f0] dark:bg-[#12101e] border border-[#ebdcd5] dark:border-pink-500/25 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative transition-colors">
        
        {/* Header */}
        <div className="px-6 py-4 bg-white dark:bg-[#181528] border-b border-[#ebdcd5] dark:border-pink-500/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/25">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif text-lg sm:text-xl font-bold text-[#231c26] dark:text-white">
                Rút Xu Người Đăng Truyện
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tối thiểu 1000 Xu • Tỷ lệ quy đổi: 1 Xu = 1 VNĐ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation: Tạo Lệnh Rút vs Lịch Sử Rút Xu (Hình 2) */}
        <div className="px-6 pt-3 bg-white dark:bg-[#181528] border-b border-[#ebdcd5] dark:border-pink-500/20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('request')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'request'
                ? 'border-pink-600 text-pink-600 dark:border-pink-400 dark:text-pink-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Tạo Lệnh Rút Xu</span>
            {hasPendingWithdrawal && (
              <span className="p-0.5 rounded-full text-amber-500" title="Đang có đơn chờ duyệt">
                <Lock className="w-3 h-3" />
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'border-pink-600 text-pink-600 dark:border-pink-400 dark:text-pink-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>Lịch Sử Rút Xu</span>
            {(userWithdrawals?.length || 0) > 0 && (
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-extrabold ${
                hasPendingWithdrawal 
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {userWithdrawals?.length || 0}
              </span>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          
          {/* TAB 1: FORM TẠO LỆNH RÚT XU */}
          {activeTab === 'request' && (
            <div className="space-y-5">
              {/* Balance Status Banner */}
              <div className="bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-purple-500/10 border border-pink-500/30 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Số xu khả dụng hiện có:
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-pink-600 dark:text-pink-400">
                      {currentEarnedXu.toLocaleString('vi-VN')} Xu
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      (~ {currentEarnedXu.toLocaleString('vi-VN')} đ)
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 border border-pink-200 dark:border-pink-700/50">
                    {isEligible ? '✅ Đủ điều kiện rút' : '⚠️ Cần tối thiểu 1000 Xu'}
                  </span>
                </div>
              </div>

              {/* Nếu đang có đơn chờ duyệt: Chặn tạo thêm đơn mới */}
              {hasPendingWithdrawal ? (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-600/40 rounded-2xl p-5 text-center space-y-3">
                  <Clock className="w-10 h-10 text-amber-500 mx-auto animate-pulse" />
                  <h4 className="text-base font-bold text-amber-800 dark:text-amber-300">
                    Đang Có Đơn Rút Xu Chờ Admin Duyệt
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
                    Đơn rút xu mã <strong className="font-mono text-amber-700 dark:text-amber-400 font-bold">{pendingRequest?.code || pendingRequest?.id}</strong> ({pendingRequest?.amountXu.toLocaleString('vi-VN')} xu) đang ở trạng thái <strong>CHƯA ĐƯỢC DUYỆT</strong>.
                  </p>
                  <div className="p-3 rounded-xl bg-white dark:bg-[#181528] border border-amber-200 dark:border-amber-700/50 text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto text-left leading-relaxed">
                    📌 <strong>Quy định rút xu:</strong> Số lần rút xu không được thực hiện nhiều lần, chỉ khi nào đơn rút xu trước đó được duyệt thì người rút mới có thể yêu cầu rút xu tiếp.
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow transition-all hover:scale-102"
                  >
                    Xem Chi Tiết Trong Lịch Sử Rút Xu &rarr;
                  </button>
                </div>
              ) : !isEligible ? (
                /* Ineligible warning */
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-600/40 rounded-2xl p-5 text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                  <h4 className="text-base font-bold text-amber-800 dark:text-amber-300">
                    Chưa Đạt Hạn Mức Tối Thiểu 1000 Xu
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
                    Theo quy định sàn Đạo Tâm, tác giả và editor cần tích lũy tối thiểu <strong>1000 Xu</strong> từ độc giả mua chương truyện VIP trước khi có thể yêu cầu rút tiền về tài khoản ngân hàng.
                  </p>
                  <div className="pt-2 text-xs font-semibold text-slate-500">
                    Hiện bạn có: <span className="text-amber-600 font-bold">{currentEarnedXu.toLocaleString('vi-VN')} Xu</span> (còn thiếu {Math.max(0, 1000 - currentEarnedXu).toLocaleString('vi-VN')} Xu nữa).
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-2 px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow"
                  >
                    Tiếp Tục Sáng Tác &amp; Đăng Truyện
                  </button>
                </div>
              ) : (
                /* Eligible Form */
                <form onSubmit={handleSubmit} className="space-y-4">
                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Amount to Withdraw */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Số Xu Yêu Cầu Rút (Tối thiểu 1000 Xu):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1000"
                        max={currentEarnedXu}
                        step="1"
                        value={amountXu}
                        onChange={(e) => setAmountXu(Number(e.target.value))}
                        className="w-full pl-3 pr-16 py-2.5 rounded-xl bg-white dark:bg-[#1a172a] border border-[#ebdcd5] dark:border-slate-700 font-bold text-lg text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        Xu
                      </span>
                    </div>

                    {/* Quick Select Buttons */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setAmountXu(1000)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        1.000 Xu (1.000đ)
                      </button>
                      {currentEarnedXu >= 10000 && (
                        <button
                          type="button"
                          onClick={() => setAmountXu(10000)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          10.000 Xu (10.000đ)
                        </button>
                      )}
                      {currentEarnedXu >= 50000 && (
                        <button
                          type="button"
                          onClick={() => setAmountXu(50000)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          50.000 Xu (50.000đ)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAmountXu(currentEarnedXu)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300 cursor-pointer"
                      >
                        Tất cả ({currentEarnedXu.toLocaleString('vi-VN')} Xu)
                      </button>
                    </div>
                  </div>

                  {/* Conversion Preview Box */}
                  <div className="bg-slate-50 dark:bg-[#1a172a] rounded-xl p-3 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                      <span>Số tiền thực nhận (1 Xu = 1 VNĐ):</span>
                      <span className="font-extrabold text-base text-pink-600 dark:text-pink-400">
                        {amountVnd.toLocaleString('vi-VN')} VNĐ
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 text-[11px]">
                      <span>Số xu còn lại sau khi rút:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {formatXu(remainingXu)} Xu
                      </span>
                    </div>
                  </div>

                  {/* Bank Information for Payout */}
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-pink-600" />
                        Thông Tin Tài Khoản Ngân Hàng Nhận Tiền
                      </h4>
                      {isBankInfoComplete ? (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" /> Đã đủ thông tin
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-600" /> Bắt buộc điền đủ
                        </span>
                      )}
                    </div>

                    {!isBankInfoComplete && (
                      <div className="p-2.5 rounded-xl bg-pink-50/80 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800 text-[11px] text-pink-800 dark:text-pink-300 leading-relaxed flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-pink-600 flex-shrink-0" />
                        <span>Yêu cầu trước đó: Các thông tin về tài khoản ngân hàng (Ngân hàng, STK, Tên chủ thẻ) phải được điền đầy đủ để Admin chuyển tiền.</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Ngân hàng <span className="text-rose-500 font-bold">*</span>:
                      </label>
                      <select
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#1a172a] border border-[#ebdcd5] dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
                      >
                        <option value="">-- Chọn ngân hàng thụ hưởng --</option>
                        {(COMMON_BANKS || []).map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Số tài khoản (STK) <span className="text-rose-500 font-bold">*</span>:
                        </label>
                        <input
                          type="text"
                          placeholder="Nhập số tài khoản ngân hàng..."
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#1a172a] border border-[#ebdcd5] dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Tên chủ tài khoản <span className="text-rose-500 font-bold">*</span>:
                        </label>
                        <input
                          type="text"
                          placeholder="Nhập họ và tên chủ tài khoản..."
                          value={accountHolder}
                          onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#1a172a] border border-[#ebdcd5] dark:border-slate-700 text-xs font-bold uppercase text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Ghi chú thêm cho BQT (không bắt buộc):
                      </label>
                      <input
                        type="text"
                        placeholder="VD: Rút nhuận bút truyện tháng này..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#1a172a] border border-[#ebdcd5] dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* Submit Button (Màu hồng theo yêu cầu) */}
                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={!isBankInfoComplete || amountXu < 1000 || amountXu > currentEarnedXu || hasPendingWithdrawal}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-600 to-pink-500 hover:from-pink-500 hover:to-rose-400 text-white font-black text-sm shadow-lg shadow-pink-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-101 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Coins className="w-4 h-4" />
                      <span>Xác Nhận Gửi Yêu Cầu Rút {formatXu(amountXu)} Xu ({formatXu(amountVnd)} đ)</span>
                    </button>
                    {!isBankInfoComplete && (
                      <p className="text-[11px] text-pink-600 dark:text-pink-400 text-center mt-2 font-semibold flex items-center justify-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Yêu cầu trước đó: Điền đủ Ngân hàng, STK và Tên chủ tài khoản để gửi yêu cầu</span>
                      </p>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: TRANG LỊCH SỬ RÚT XU (CHÍNH XÁC NHƯ HÌNH 2) */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              
              {/* Bảng Lịch Sử Rút Xu chuẩn hình 2 */}
              <div className="bg-white dark:bg-[#161327] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 font-extrabold bg-slate-50/70 dark:bg-slate-800/40">
                        <th className="py-3.5 px-4 pl-5">
                          {/* Thanh gạch đứng màu đen bên trái như hình 2 */}
                          <span className="border-l-[3px] border-slate-900 dark:border-slate-100 pl-2 inline-block">
                            Thời gian
                          </span>
                        </th>
                        <th className="py-3.5 px-4 font-extrabold">Code</th>
                        <th className="py-3.5 px-4 font-extrabold">Số xu</th>
                        <th className="py-3.5 px-4 pr-5 font-extrabold">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {(userWithdrawals?.length || 0) === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-10 text-center text-slate-400 dark:text-slate-500">
                            Bạn chưa có yêu cầu rút xu nào.
                          </td>
                        </tr>
                      ) : (
                        (userWithdrawals || []).map((req) => {
                          const dateStr = formatDateTime(req.createdAt);
                          const code = req.code || ('WR' + (req.id ? req.id.replace(/\D/g, '').slice(-8).padStart(8, '0') : '85143792'));
                          const isApproved = req.status === 'approved';
                          const isPending = req.status === 'pending';

                          return (
                            <tr key={req.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="py-3.5 px-4 pl-5 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                                {dateStr}
                              </td>
                              <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-mono font-medium whitespace-nowrap">
                                {code}
                              </td>
                              <td className="py-3.5 px-4 font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                                {req.amountXu.toLocaleString('vi-VN')} xu
                              </td>
                              <td className="py-3.5 px-4 pr-5 whitespace-nowrap">
                                {isApproved ? (
                                  /* Pill ĐÃ DUYỆT màu xanh ngọc nhạt như hình 2 */
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#dff6fe] text-[#00b4d8] dark:bg-sky-950/80 dark:text-cyan-400">
                                    <span className="text-[9px]">●</span> ĐÃ DUYỆT
                                  </span>
                                ) : isPending ? (
                                  /* Pill CHƯA ĐƯỢC DUYỆT */
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-200 dark:border-amber-700/60">
                                    <span className="text-[9px]">●</span> CHƯA ĐƯỢC DUYỆT
                                  </span>
                                ) : (
                                  /* Pill TỪ CHỐI */
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400 border border-rose-200 dark:border-rose-700/60">
                                    <span className="text-[9px]">●</span> TỪ CHỐI
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Thông tin giải thích & hướng dẫn quy trình */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181528] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <Clock className="w-4 h-4 text-pink-600" />
                  <span>Quy trình giải ngân và duyệt lệnh</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  • Khi bạn gửi yêu cầu, đơn rút xu sẽ ở trạng thái <strong className="text-amber-600">CHƯA ĐƯỢC DUYỆT</strong> và được chuyển ngay tới Ban Quản Trị.
                </p>
                <p className="text-[11px] leading-relaxed">
                  • Sau khi Admin thực hiện chuyển khoản và bấm nút <strong>Duyệt</strong>, trạng thái sẽ đổi sang <strong className="text-sky-600">ĐÃ DUYỆT</strong> và hệ thống sẽ gửi 1 thông báo thành công đến hộp thư của bạn.
                </p>
                <p className="text-[11px] leading-relaxed text-pink-600 dark:text-pink-400 font-semibold">
                  • Lưu ý: Số lần rút xu không được thực hiện nhiều lần. Chỉ khi nào đơn rút xu trước đó được duyệt thì bạn mới có thể yêu cầu rút xu tiếp.
                </p>
              </div>

              {!hasPendingWithdrawal && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('request')}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 cursor-pointer transition-all hover:scale-102"
                  >
                    + Tạo Thêm Yêu Cầu Rút Xu Mới
                  </button>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-white dark:bg-[#181528] border-t border-[#ebdcd5] dark:border-pink-500/20 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>Tác giả được hưởng tới 98% nhuận bút VIP.</span>
          <span>Đối soát &amp; chuyển khoản 24/7</span>
        </div>

      </div>
    </div>
  );
};
