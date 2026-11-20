'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  startAfter,
  runTransaction,
  updateDoc,
  increment,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Coins,
  Search,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  X,
  Image as ImageIcon,
  Copy,
} from 'lucide-react';
import Link from 'next/link';
import { db, auth } from '../../../lib/firebase';
import { useAuth } from '../../../components/AuthProvider';

const ADMIN_EMAILS: string[] = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

export interface TopUpRequestItem {
  id: string;
  userId: string;
  uid?: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  amountVnd: number;
  xuAmount: number;
  transferCode: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  billImageUrl?: string;
  createdAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
  bankName?: string;
  accountNumber?: string;
}

export default function AdminRequestsClient() {
  const { refreshUserData } = useAuth();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [requestsList, setRequestsList] = useState<TopUpRequestItem[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewBillUrl, setPreviewBillUrl] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [rejectingTarget, setRejectingTarget] = useState<TopUpRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState('Không nhận được tiền chuyển khoản khớp với mã giao dịch');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const isAuthorizedAdmin = Boolean(
    currentUser &&
      currentUser.email &&
      ADMIN_EMAILS.some((adm) => adm.toLowerCase().trim() === currentUser.email?.toLowerCase().trim())
  );

  // Luôn truy vấn dữ liệu tươi từ Firestore khi mở trang / F5 trên Mobile để không bị lệch trạng thái nạp Xu
  const loadRequests = async () => {
    setIsLoadingRequests(true);
    setFeedbackMsg(null);
    try {
      const topUpCol = collection(db, 'topup_requests');
      const q = query(topUpCol, orderBy('createdAt', 'desc'), limit(20));
      const snap = await getDocs(q);
      const docs = snap?.docs || [];

      const items: TopUpRequestItem[] = (docs || []).map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          userId: data.userId || data.uid || '',
          userName: data.userName || data.userDisplayName || 'Độc giả',
          userEmail: data.userEmail || '',
          userAvatar: data.userAvatar,
          amountVnd: Number(data.amountVnd || 0),
          xuAmount: Number(data.xuAmount || 0),
          transferCode: data.transferCode || d.id,
          status: (data.status as any) || 'pending',
          billImageUrl: data.billImageUrl || '',
          createdAt: Number(data.createdAt || Date.now()),
          approvedAt: data.approvedAt ? Number(data.approvedAt) : undefined,
          rejectedAt: data.rejectedAt ? Number(data.rejectedAt) : undefined,
          rejectionReason: data.rejectionReason || '',
          bankName: data.bankName || 'MBBank',
          accountNumber: data.accountNumber || '',
        };
      });

      const lastDoc = (docs?.length || 0) > 0 ? docs[(docs?.length || 0) - 1] : null;
      setLastVisibleDoc(lastDoc);
      setHasMore((docs?.length || 0) === 20);
      setRequestsList(items);
    } catch (err: any) {
      console.error('Lỗi nạp danh sách topup:', err);
      setFeedbackMsg({
        type: 'error',
        text: `Không thể tải danh sách nạp tiền: ${err?.message || 'Lỗi Firestore'}`,
      });
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const loadMoreRequests = async () => {
    if (!lastVisibleDoc || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const topUpCol = collection(db, 'topup_requests');
      const q = query(topUpCol, orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(20));
      const snap = await getDocs(q);
      const docs = snap?.docs || [];

      const newItems: TopUpRequestItem[] = (docs || []).map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          userId: data.userId || data.uid || '',
          userName: data.userName || data.userDisplayName || 'Độc giả',
          userEmail: data.userEmail || '',
          userAvatar: data.userAvatar,
          amountVnd: Number(data.amountVnd || 0),
          xuAmount: Number(data.xuAmount || 0),
          transferCode: data.transferCode || d.id,
          status: (data.status as any) || 'pending',
          billImageUrl: data.billImageUrl || '',
          createdAt: Number(data.createdAt || Date.now()),
          approvedAt: data.approvedAt ? Number(data.approvedAt) : undefined,
          rejectedAt: data.rejectedAt ? Number(data.rejectedAt) : undefined,
          rejectionReason: data.rejectionReason || '',
          bankName: data.bankName || 'MBBank',
          accountNumber: data.accountNumber || '',
        };
      });

      const nextLastDoc = (docs?.length || 0) > 0 ? docs[(docs?.length || 0) - 1] : null;
      setLastVisibleDoc(nextLastDoc);
      setHasMore((docs?.length || 0) === 20);
      setRequestsList((prev) => [...(prev || []), ...(newItems || [])]);
    } catch (err: any) {
      console.error('Lỗi khi tải thêm danh sách topup:', err);
      setFeedbackMsg({
        type: 'error',
        text: `Không thể tải thêm yêu cầu nạp tiền: ${err?.message || 'Lỗi Firestore'}`,
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (isAuthorizedAdmin) {
      loadRequests();
    }
  }, [isAuthorizedAdmin]);

  const handleApproveTopUp = async (req: TopUpRequestItem) => {
    if (!req.id || processingId || req.status !== 'pending') return;

    setProcessingId(req.id);
    setFeedbackMsg(null);

    try {
      const reqRef = doc(db, 'topup_requests', req.id);
      const userRef = doc(db, 'users', req.userId);

      await runTransaction(db, async (transaction) => {
        const reqSnap = await transaction.get(reqRef);
        if (!reqSnap.exists()) {
          throw new Error(`Đơn nạp ${req.id} không tồn tại trên hệ thống.`);
        }
        const currentData = reqSnap.data();
        if (currentData.status !== 'pending') {
          throw new Error(`Đơn nạp này đã được xử lý (trạng thái: ${currentData.status}).`);
        }

        const userSnap = await transaction.get(userRef);

        transaction.update(reqRef, {
          status: 'approved',
          approvedAt: Date.now(),
        });

        if (userSnap.exists()) {
          transaction.update(userRef, {
            xuBalance: increment(req.xuAmount),
          });
        }
      });

      setRequestsList((prev) =>
        (prev || []).map((r) => (r.id === req.id ? { ...r, status: 'approved' as const, approvedAt: Date.now() } : r))
      );

      if (req.userId === currentUser?.uid) {
        await refreshUserData().catch(() => {});
      }

      setFeedbackMsg({
        type: 'success',
        text: `✓ Đã phê duyệt đơn nạp mã "${req.transferCode}". Đã cộng +${req.xuAmount.toLocaleString('vi-VN')} Xu cho độc giả ${req.userName}.`,
      });
    } catch (err: any) {
      console.error('Lỗi khi duyệt nạp tiền:', err);
      setFeedbackMsg({
        type: 'error',
        text: `Cảnh báo lỗi duyệt nạp tiền: ${err?.message || 'Lỗi thao tác'}`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const confirmRejectTopUp = async () => {
    if (!rejectingTarget?.id || processingId || rejectingTarget.status !== 'pending') return;

    const req = rejectingTarget;
    const trimmedReason = rejectReason.trim() || 'Admin từ chối duyệt lệnh nạp';

    setProcessingId(req.id);
    setFeedbackMsg(null);

    try {
      const reqRef = doc(db, 'topup_requests', req.id);
      await updateDoc(reqRef, {
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectionReason: trimmedReason,
      });

      setRequestsList((prev) =>
        (prev || []).map((r) =>
          r.id === req.id
            ? { ...r, status: 'rejected' as const, rejectedAt: Date.now(), rejectionReason: trimmedReason }
            : r
        )
      );

      setFeedbackMsg({
        type: 'success',
        text: `✓ Đã từ chối đơn nạp mã "${req.transferCode}" với lý do: ${trimmedReason}`,
      });
      setRejectingTarget(null);
    } catch (err: any) {
      console.error('Lỗi từ chối nạp tiền:', err);
      setFeedbackMsg({
        type: 'error',
        text: `Lỗi thao tác từ chối đơn: ${err?.message || 'Lỗi Firestore'}`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredRequests = (requestsList || []).filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const match =
        (r.transferCode || '').toLowerCase().includes(term) ||
        (r.userName || '').toLowerCase().includes(term) ||
        (r.userEmail || '').toLowerCase().includes(term) ||
        (r.userId || '').toLowerCase().includes(term);
      if (!match) return false;
    }
    return true;
  });

  const pendingCount = (requestsList || []).filter((r) => r.status === 'pending')?.length || 0;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 text-pink-600 animate-spin" />
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <ShieldCheck className="w-16 h-16 text-rose-500 mb-4" />
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">Truy Cập Bị Giới Hạn</h2>
        <p className="text-sm text-slate-500 max-w-md mt-2">
          Khu vực quản lý nạp tiền chỉ dành riêng cho Quản trị viên hệ thống (hoaamcac@gmail.com, meoyeutien22@gmail.com).
        </p>
        <Link
          href="/"
          className="mt-6 px-4 py-2 rounded-xl bg-pink-600 text-white font-bold text-xs hover:bg-pink-700 transition"
        >
          Quay lại Trang Chủ
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-pink-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-900/60 text-slate-600 hover:text-pink-600 shadow-xs transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6 text-pink-600" />
                <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
                  Quản Lý Nạp Tiền &amp; Duyệt Bill
                </h1>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Xác thực chuyển khoản MBBank, duyệt bill cộng Xu nguyên tử realtime
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadRequests}
              disabled={isLoadingRequests}
              className="px-3.5 py-2 rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              {isLoadingRequests ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Làm mới dữ liệu</span>}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã giao dịch, email, tên người nạp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-pink-200/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1 scrollbar-none">
            {([
              { id: 'all', label: 'Tất cả' },
              { id: 'pending', label: 'Chờ duyệt', badge: pendingCount },
              { id: 'approved', label: 'Đã duyệt' },
              { id: 'rejected', label: 'Từ chối' },
            ] || []).map((tab) => {
              const isActive = filterStatus === tab.id;
              const count =
                tab.id === 'all'
                  ? requestsList?.length || 0
                  : (requestsList || []).filter((r) => r.status === tab.id)?.length || 0;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterStatus(tab.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-pink-600 text-white font-extrabold shadow-sm shadow-pink-600/30'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {copiedCode && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
            ✓ Đã sao chép mã giao dịch: {copiedCode}
          </div>
        )}

        {feedbackMsg && (
          <div
            className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between gap-3 ${
              feedbackMsg.type === 'error'
                ? 'bg-yellow-400 text-yellow-950 border-2 border-yellow-500 font-bold'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="p-1 hover:bg-black/10 rounded-lg text-xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {isLoadingRequests && (requestsList?.length || 0) === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-pink-600" />
              <p className="text-xs font-medium">Đang nạp danh sách giao dịch từ Firestore...</p>
            </div>
          ) : (filteredRequests?.length || 0) === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Coins className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Không có yêu cầu nạp tiền nào</p>
              <p className="text-xs">Chuyển sang bộ lọc &quot;Tất cả&quot; hoặc đợi độc giả gửi yêu cầu nạp mới.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-pink-100 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-4">Mã Giao Dịch</th>
                      <th className="py-3 px-4">Độc Giả</th>
                      <th className="py-3 px-4 text-right">Số Tiền (VNĐ)</th>
                      <th className="py-3 px-4 text-right">Xu Nhận</th>
                      <th className="py-3 px-4 text-center">Biên Lai (Bill)</th>
                      <th className="py-3 px-4 text-center">Trạng Thái</th>
                      <th className="py-3 px-4 text-right">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {(filteredRequests || []).map((req) => {
                      const isProcessing = processingId === req.id;
                      const isPending = req.status === 'pending';

                      return (
                        <tr
                          key={req.id}
                          className={`hover:bg-pink-50/20 dark:hover:bg-slate-800/40 transition-colors ${
                            isPending ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-mono font-bold text-pink-600 dark:text-pink-400">
                              <span>{req.transferCode}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(req.transferCode)}
                                title="Sao chép mã"
                                className="p-1 hover:bg-pink-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-pink-600 transition"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(req.createdAt).toLocaleString('vi-VN')}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-slate-100">{req.userName}</div>
                            <div className="text-[11px] text-slate-400 font-mono truncate max-w-[180px]">
                              {req.userEmail || `UID: ${req.userId.slice(0, 10)}...`}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-slate-100">
                            {req.amountVnd.toLocaleString('vi-VN')} đ
                          </td>

                          <td className="py-3 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                            +{req.xuAmount.toLocaleString('vi-VN')} Xu
                          </td>

                          <td className="py-3 px-4 text-center">
                            {req.billImageUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewBillUrl(req.billImageUrl || null)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300 border border-pink-200 text-[11px] font-bold transition cursor-pointer"
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>Xem Bill</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Chưa up</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            {req.status === 'approved' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Đã duyệt</span>
                              </span>
                            ) : req.status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                <span>Từ chối</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 animate-pulse">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Chờ duyệt</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            {isPending ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectReason('Không nhận được tiền chuyển khoản khớp với mã giao dịch');
                                    setRejectingTarget(req);
                                  }}
                                  disabled={isProcessing}
                                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200 font-bold text-xs transition disabled:opacity-50 cursor-pointer"
                                >
                                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Từ chối</span>}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApproveTopUp(req)}
                                  disabled={isProcessing}
                                  className="px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-1 cursor-pointer shadow-xs"
                                >
                                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                  <span>Duyệt nạp</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Đã xử lý</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="block md:hidden space-y-3 p-3 bg-pink-50/20 dark:bg-slate-950/40">
                {(filteredRequests || []).map((req) => {
                  const isProcessing = processingId === req.id;
                  const isPending = req.status === 'pending';

                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl border border-pink-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 font-mono font-bold text-pink-600">
                          <span>{req.transferCode}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(req.transferCode)}
                            className="p-1 text-slate-400 hover:text-pink-600"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        {req.status === 'approved' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Đã duyệt
                          </span>
                        ) : req.status === 'rejected' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            Từ chối
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Chờ duyệt
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Người nạp:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{req.userName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Số tiền:</span>
                          <span className="font-black text-slate-900 dark:text-slate-100">
                            {req.amountVnd.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Xu nhận:</span>
                          <span className="font-black text-emerald-600">+{req.xuAmount.toLocaleString('vi-VN')} Xu</span>
                        </div>
                      </div>

                      {req.billImageUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewBillUrl(req.billImageUrl || null)}
                          className="w-full py-1.5 rounded-lg bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Xem Ảnh Biên Lai (Bill)</span>
                        </button>
                      )}

                      {isPending && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectReason('Không nhận được tiền chuyển khoản khớp với mã giao dịch');
                              setRejectingTarget(req);
                            }}
                            disabled={isProcessing}
                            className="py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200"
                          >
                            Từ chối
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveTopUp(req)}
                            disabled={isProcessing}
                            className="py-2 rounded-xl bg-pink-600 text-white font-bold text-xs"
                          >
                            Duyệt nạp
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t border-pink-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Hiển thị <span className="font-bold text-slate-800 dark:text-slate-200">{filteredRequests?.length || 0}</span> / tổng{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">{requestsList?.length || 0}</span> lệnh đã tải
                </span>

                {hasMore ? (
                  <button
                    type="button"
                    onClick={loadMoreRequests}
                    disabled={isLoadingMore}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang tải thêm 20 lệnh...</span>
                      </>
                    ) : (
                      <span>Tải thêm (+20 lệnh nạp)</span>
                    )}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 italic">Đã nạp toàn bộ danh sách lệnh nạp</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal nhập lý do từ chối thay cho window.prompt */}
      {rejectingTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          onClick={() => setRejectingTarget(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-rose-200 dark:border-rose-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                Từ chối đơn nạp {rejectingTarget.transferCode}
              </h3>
              <button
                type="button"
                onClick={() => setRejectingTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Lý do từ chối (gửi cho độc giả):
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmRejectTopUp}
                disabled={processingId === rejectingTarget.id}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                {processingId === rejectingTarget.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Xác nhận từ chối</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {previewBillUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          onClick={() => setPreviewBillUrl(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-4 space-y-3 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Biên Lai Chuyển Khoản Ngân Hàng</h3>
              <button
                type="button"
                onClick={() => setPreviewBillUrl(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl p-2">
              <img
                src={previewBillUrl}
                alt="Bill chuyển khoản"
                className="max-h-[60vh] object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewBillUrl(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
