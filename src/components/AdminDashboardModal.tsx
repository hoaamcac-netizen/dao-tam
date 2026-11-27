import React, { useState, useEffect, useRef } from 'react';
import { TopUpRequest, UserProfile, Novel, Chapter, NovelSubmission, WithdrawalRequest, NovelReport, Comment } from '../types';
import { parseBatchChapters, calculateChapterVip, getNovelMp3Counts } from '../utils/rulesAndVoices';
import { 
  fetchAllCommentsForAdmin, 
  deleteNovelCommentFromFirestore,
  approveTopUpTransactionInFirestore,
  rejectTopUpTransactionInFirestore,
  fetchUsersPaginatedFromFirestore,
  searchUsersByEmailPrefixFromFirestore,
  fetchLockedUsersCountFromFirestore,
  sortUsersAdminPriority,
  toggleBanUserInFirestore,
  listenToPendingTopUpRequestsRealtime,
  fetchGlobalBannerSettingsForAdmin,
  saveGlobalBannerSettings,
  donateCoinsToUserByAdmin,
  grantStoryAccessToUserByAdmin,
  mergeDuplicateUsers,
  fetchFinanceStatsFromFirestore,
  fetchTodayApprovedTopUpsFromFirestore,
  getVietnamStartOfDayMs,
  updateNovelMetadataInFirestore,
  type FinanceStats
} from '../firebase/services';
import { extractYouTubeVideoId, buildYouTubeShareUrl } from '../utils/youtube';
import { checkIsAdmin } from '../firebase/config';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { AdminPendingNovelsList } from './AdminPendingNovelsList';
import { AdminSupportChat } from './AdminSupportChat';
import { 
  X, 
  ShieldCheck, 
  Coins, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Clock, 
  TrendingUp, 
  Users, 
  BookOpen, 
  Lock, 
  PlusCircle, 
  Sparkles, 
  Layers, 
  FileText, 
  BookPlus, 
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  Search,
  Edit3,
  Building2,
  Copy,
  Check,
  Percent,
  Sliders,
  FileCode2,
  QrCode,
  Flag,
  ShieldAlert,
  UserX,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Camera,
  AlertCircle,
  MessageSquare,
  Menu,
  ExternalLink,
  Megaphone,
  Gift,
  KeyRound,
  GitMerge,
  RefreshCw,
  Headphones,
  Youtube
} from 'lucide-react';
import { DaoTamLogo } from './DaoTamLogo';
import { AdminNovelMp3DrawerModal } from './AdminGitHubAudioManager';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  topUpRequests: TopUpRequest[];
  onApproveRequest: (
    requestId: string,
    options?: {
      alreadyProcessedInFirestore?: boolean;
      approvedRequest?: TopUpRequest;
      nextXu?: number;
    }
  ) => void;
  onRejectRequest: (requestId: string) => void;
  user: UserProfile;
  novels: Novel[];
  onAddBatchChapters: (novelId: string, chapters: Chapter[]) => void;
  novelSubmissions: NovelSubmission[];
  onApproveNovelSubmission: (submissionId: string) => void;
  onRejectNovelSubmission: (submissionId: string, reason?: string) => void;
  onToggleHideNovel?: (novelId: string) => void;
  onDeleteNovel?: (novelId: string) => void;
  onOpenEditNovel?: (novel: Novel) => void;
  withdrawalRequests?: WithdrawalRequest[];
  onApproveWithdrawal?: (requestId: string) => void;
  onRejectWithdrawal?: (requestId: string, reason?: string) => void;
  royaltyConfig?: { authorRate: number; editorRate: number; exclusiveRate: number };
  onUpdateRoyaltyConfig?: (config: { authorRate: number; editorRate: number; exclusiveRate: number }) => void;
  onOpenXmlModal?: () => void;
  onOpenArchitecture?: () => void;
  novelReports?: NovelReport[];
  onResolveReport?: (reportId: string, action: 'dismiss' | 'hide_novel' | 'delete_novel' | 'ban_author', novelId: string) => void;
  onOpenAdminMessages?: () => void;
  onDonateCoinsSuccess?: (targetUserId: string, amount: number) => void;
  onReloadNovels?: () => Promise<void> | void;
  onChapterAudioUpdated?: (novelId: string, updatedChapter: Chapter) => void;
  onBatchChaptersAudioUpdated?: (novelId: string, updatedChapters: Chapter[]) => void;
  onNovelMp3CountsSynced?: (
    novelId: string,
    counts: {
      mp3NamMinhCount: number;
      mp3HangNgaCount: number;
      hasMaleAudio: boolean;
      hasFemaleAudio: boolean;
      hasAudio: boolean;
    }
  ) => void;
  onUpdateNovelYoutubeSettings?: (
    novelId: string,
    payload: {
      isShortStory: boolean;
      youtubeVideoId: string;
      isYoutubeVipLocked: boolean;
    }
  ) => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  onClose,
  topUpRequests = [],
  onApproveRequest,
  onRejectRequest,
  user,
  novels = [],
  onAddBatchChapters,
  novelSubmissions = [],
  onApproveNovelSubmission,
  onRejectNovelSubmission,
  onToggleHideNovel,
  onDeleteNovel,
  onOpenEditNovel,
  withdrawalRequests = [],
  onApproveWithdrawal,
  onRejectWithdrawal,
  royaltyConfig = { authorRate: 95, editorRate: 70, exclusiveRate: 90 },
  onUpdateRoyaltyConfig,
  onOpenXmlModal,
  onOpenArchitecture,
  novelReports = [],
  onResolveReport,
  onOpenAdminMessages,
  onDonateCoinsSuccess,
  onReloadNovels,
  onChapterAudioUpdated,
  onBatchChaptersAudioUpdated,
  onNovelMp3CountsSynced,
  onUpdateNovelYoutubeSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'submissions' | 'payouts' | 'reports' | 'novels' | 'batch' | 'comments' | 'tools' | 'users' | 'support_chat' | 'global_banner'>('requests');
  const [mp3ManagingNovel, setMp3ManagingNovel] = useState<Novel | null>(null);
  const [youtubeManagingNovel, setYoutubeManagingNovel] = useState<Novel | null>(null);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState<string>('');
  const [youtubeVipLockedInput, setYoutubeVipLockedInput] = useState<boolean>(false);
  const [youtubeIsShortStoryInput, setYoutubeIsShortStoryInput] = useState<boolean>(true);
  const [youtubeFormError, setYoutubeFormError] = useState<string | null>(null);
  const [isSavingYoutubeSettings, setIsSavingYoutubeSettings] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('pending');
  const [reportFilterStatus, setReportFilterStatus] = useState<'all' | 'pending' | 'resolved'>('pending');
  const [previewSubmission, setPreviewSubmission] = useState<NovelSubmission | null>(null);
  const [previewChapterIndex, setPreviewChapterIndex] = useState<number>(0);
  const [copiedStkId, setCopiedStkId] = useState<string | null>(null);
  const [inspectingBillRequest, setInspectingBillRequest] = useState<TopUpRequest | null>(null);
  const [copiedCodeInModal, setCopiedCodeInModal] = useState(false);

  // Top-Up Request Approval & Rejection Safe Handling State
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [topUpFeedback, setTopUpFeedback] = useState<{
    type: 'success' | 'warning_error';
    text: string;
  } | null>(null);

  // Realtime onSnapshot (DUY NHẤT cho Tab 1 Duyệt Nạp Xu): Lắng nghe lệnh nạp pending limit(20), tự hủy khi đóng modal hoặc chuyển tab
  const [livePendingTopUps, setLivePendingTopUps] = useState<TopUpRequest[] | null>(null);
  const [financeStats, setFinanceStats] = useState<FinanceStats | null>(null);
  const [isLoadingFinanceStats, setIsLoadingFinanceStats] = useState<boolean>(false);
  const [todayApprovedRequests, setTodayApprovedRequests] = useState<TopUpRequest[]>([]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'requests') return;

    let isMounted = true;

    // Đọc 1 lần duy nhất document stats/finance (chỉ tốn 1 Read) + đơn duyệt hôm nay theo giờ VN
    setIsLoadingFinanceStats(true);
    Promise.all([
      fetchFinanceStatsFromFirestore(),
      fetchTodayApprovedTopUpsFromFirestore(),
    ])
      .then(([statsDoc, todayApprovedList]) => {
        if (!isMounted) return;
        setFinanceStats(statsDoc);
        setTodayApprovedRequests(Array.isArray(todayApprovedList) ? todayApprovedList : []);
      })
      .catch((err) => {
        console.warn('Không thể tải thống kê doanh thu Admin:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingFinanceStats(false);
      });

    // Truy vấn Realtime where('status', '==', 'pending'), limit(20)
    const unsubscribe = listenToPendingTopUpRequestsRealtime((pendingList) => {
      if (!isMounted) return;
      setLivePendingTopUps(Array.isArray(pendingList) ? pendingList : []);
    });

    // Cleanup function: Ngắt kết nối ngay khi đóng modal hoặc chuyển tab khác để bảo vệ Quota
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isOpen, activeTab]);

  // User Management State (Spark Quota Optimized with limit 25 & startAfter)
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);
  const [userCursors, setUserCursors] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [hasMoreUsers, setHasMoreUsers] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [processingBanUid, setProcessingBanUid] = useState<string | null>(null);
  const [userFeedbackMsg, setUserFeedbackMsg] = useState<{
    type: 'success' | 'warning_error';
    text: string;
  } | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [isSearchingUsersServer, setIsSearchingUsersServer] = useState<boolean>(false);
  const wasSearchingUsersRef = useRef<boolean>(false);
  const [userFilterCategory, setUserFilterCategory] = useState<'all' | 'admin' | 'author' | 'reader' | 'banned'>('all');
  const [totalLockedUsersCount, setTotalLockedUsersCount] = useState<number>(0);

  // Donate Coins (Tặng Xu) Modal State
  const [donateTargetUser, setDonateTargetUser] = useState<UserProfile | null>(null);
  const [donateAmountInput, setDonateAmountInput] = useState<string>('100');
  const [isDonatingCoins, setIsDonatingCoins] = useState<boolean>(false);
  const [donateModalError, setDonateModalError] = useState<string | null>(null);

  // Grant Story Access (Cấp Quyền Truyện - Đền bù) Modal State
  const [grantTargetUser, setGrantTargetUser] = useState<UserProfile | null>(null);
  const [grantNovelIdInput, setGrantNovelIdInput] = useState<string>('');
  const [grantChapterIdInput, setGrantChapterIdInput] = useState<string>('');
  const [isGrantingStory, setIsGrantingStory] = useState<boolean>(false);
  const [grantModalError, setGrantModalError] = useState<string | null>(null);
  const [isMergingUsers, setIsMergingUsers] = useState<boolean>(false);

  const handleMergeDuplicateUsers = async () => {
    if (!checkIsAdmin(user?.email) || isMergingUsers) return;
    setIsMergingUsers(true);
    setUserFeedbackMsg(null);
    try {
      const result = await mergeDuplicateUsers(user.email || '');
      if (result.mergedEmailsCount === 0) {
        setUserFeedbackMsg({
          type: 'success',
          text: 'Hệ thống đã sạch! Không phát hiện tài khoản nào bị trùng email.',
        });
      } else {
        setUserFeedbackMsg({
          type: 'success',
          text: `Đã gộp thành công ${result.mergedEmailsCount} email trùng lặp (${result.mergedSecondaryDocsCount} document phụ đã bị khóa & chuyển vào document chính, tổng cộng dồn +${result.totalXuMerged.toLocaleString('vi-VN')} Xu).`,
        });
      }
      if (userSearchTerm.trim()) {
        await runServerUserSearch(userSearchTerm);
      } else {
        await loadUsersPage(0, null);
      }
    } catch (err: any) {
      console.error('Lỗi khi gộp tài khoản trùng:', err);
      setUserFeedbackMsg({
        type: 'warning_error',
        text: `Cảnh báo lỗi khi gộp tài khoản: ${err?.message || 'Thao tác thất bại'}`,
      });
    } finally {
      setIsMergingUsers(false);
    }
  };

  const runServerUserSearch = async (rawTerm: string) => {
    const clean = rawTerm.trim();
    if (!clean) return;
    setIsLoadingUsers(true);
    setIsSearchingUsersServer(true);
    setUserFeedbackMsg(null);
    try {
      const results = await searchUsersByEmailPrefixFromFirestore(clean);
      setUsersList(Array.isArray(results) ? results : []);
      setNextCursor(null);
      setHasMoreUsers(false);
      setCurrentPageIndex(0);
    } catch (err: any) {
      console.error('Lỗi tìm kiếm server-side user:', err);
      setUserFeedbackMsg({
        type: 'warning_error',
        text: `Cảnh báo lỗi tìm kiếm máy chủ: ${err?.message || 'Không thể truy vấn cơ sở dữ liệu'}`,
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadUsersPage = async (pageIdx: number, cursor: QueryDocumentSnapshot<DocumentData> | null) => {
    setIsLoadingUsers(true);
    setIsSearchingUsersServer(false);
    setUserFeedbackMsg(null);
    try {
      const [res, lockedCount] = await Promise.all([
        fetchUsersPaginatedFromFirestore(25, cursor),
        pageIdx === 0 ? fetchLockedUsersCountFromFirestore() : Promise.resolve(totalLockedUsersCount),
      ]);
      setUsersList(Array.isArray(res?.users) ? res.users : []);
      setNextCursor(res?.lastVisible || null);
      setHasMoreUsers(Boolean(res?.hasMore));
      setCurrentPageIndex(pageIdx);
      if (pageIdx === 0) {
        setTotalLockedUsersCount(lockedCount || 0);
      }
    } catch (err: any) {
      console.error('Lỗi khi tải danh sách người dùng:', err);
      setUserFeedbackMsg({
        type: 'warning_error',
        text: `Cảnh báo lỗi: Không thể tải danh sách người dùng từ hệ thống. Chi tiết: ${err?.message || 'Lỗi mạng hoặc phân quyền'}`
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Tải danh sách user khi mở tab Quản lý User lần đầu
  useEffect(() => {
    if (isOpen && activeTab === 'users' && (usersList?.length || 0) === 0 && !userSearchTerm.trim()) {
      loadUsersPage(0, null);
    }
  }, [isOpen, activeTab]);

  // Theo dõi ô tìm kiếm: Server-Side Prefix Query (limit 20) & tự động reset về phân trang gốc (startAfter, limit 25) khi xóa trắng
  useEffect(() => {
    if (!isOpen || activeTab !== 'users') return;
    const trimmed = userSearchTerm.trim();

    if (!trimmed) {
      if (wasSearchingUsersRef.current) {
        wasSearchingUsersRef.current = false;
        setIsSearchingUsersServer(false);
        setUserCursors([null]);
        setNextCursor(null);
        setCurrentPageIndex(0);
        loadUsersPage(0, null);
      }
      return;
    }

    wasSearchingUsersRef.current = true;
    const timer = setTimeout(() => {
      runServerUserSearch(trimmed);
    }, 350);

    return () => clearTimeout(timer);
  }, [userSearchTerm, isOpen, activeTab]);

  const handleNextUserPage = () => {
    if (isSearchingUsersServer || !hasMoreUsers || !nextCursor || isLoadingUsers) return;
    const newCursors = [...(userCursors || []).slice(0, currentPageIndex + 1), nextCursor];
    setUserCursors(newCursors);
    loadUsersPage(currentPageIndex + 1, nextCursor);
  };

  const handlePrevUserPage = () => {
    if (isSearchingUsersServer || currentPageIndex <= 0 || isLoadingUsers) return;
    const prevCursor = userCursors[currentPageIndex - 1] || null;
    loadUsersPage(currentPageIndex - 1, prevCursor);
  };

  const handleToggleBanUser = async (targetUser: UserProfile) => {
    const isCurrentlyBanned = Boolean(targetUser.isBanned || targetUser.isLocked);
    const confirmPrompt = isCurrentlyBanned
      ? `[BQT Đạo Tâm] Bạn có chắc muốn MỞ KHÓA tài khoản cho "${targetUser.displayName || targetUser.email}"?\n\nTài khoản sẽ được khôi phục quyền đăng truyện.`
      : `[BQT Đạo Tâm] BẠN CÓ CHẮC CHẮN MUỐN KHÓA VĨNH VIỄN tài khoản "${targetUser.displayName || targetUser.email}"?\n\nTài khoản bị khóa sẽ bị chặn hoàn toàn tính năng đăng truyện do vi phạm chính sách của Dao Tâm.`;

    if (!window.confirm(confirmPrompt)) {
      return;
    }

    setProcessingBanUid(targetUser.id);
    setUserFeedbackMsg(null);
    try {
      const nextBan = !isCurrentlyBanned;
      await toggleBanUserInFirestore(targetUser.id, nextBan);
      setUsersList((prev) =>
        sortUsersAdminPriority(
          (prev || []).map((u) =>
            u.id === targetUser.id ? { ...u, isBanned: nextBan, isLocked: nextBan } : u
          )
        )
      );
      setTotalLockedUsersCount((prev) => Math.max(0, prev + (nextBan ? 1 : -1)));
      setUserFeedbackMsg({
        type: 'success',
        text: isCurrentlyBanned
          ? `Đã mở khóa thành công tài khoản "${targetUser.displayName || targetUser.email}".`
          : `Đã khóa vĩnh viễn tài khoản "${targetUser.displayName || targetUser.email}". Người dùng này đã bị chặn đăng truyện.`
      });
    } catch (err: any) {
      console.error('Lỗi khi thao tác khóa/mở khóa user:', err);
      // BẮT LỖI FIREBASE BẰNG BANNER NỀN MÀU VÀNG (TUYỆT ĐỐI KHÔNG DÙNG MÀU ĐỎ)
      setUserFeedbackMsg({
        type: 'warning_error',
        text: `Cảnh báo lỗi: Không thể ${isCurrentlyBanned ? 'mở khóa' : 'khóa'} tài khoản. Chi tiết: ${err?.message || 'Lỗi phân quyền hoặc mất kết nối hệ thống'}`
      });
    } finally {
      setProcessingBanUid(null);
    }
  };

  const handleOpenDonateModal = (targetUser: UserProfile) => {
    if (!checkIsAdmin(user?.email)) return;
    setDonateTargetUser(targetUser);
    setDonateAmountInput('100');
    setDonateModalError(null);
  };

  const handleConfirmDonateCoins = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!donateTargetUser || !checkIsAdmin(user?.email)) {
      setDonateModalError('Chỉ Quản trị viên hợp lệ mới được thực hiện thao tác Tặng Xu.');
      return;
    }

    const parsedAmount = Math.floor(Number(donateAmountInput.replace(/[^\d]/g, '')));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setDonateModalError('Vui lòng nhập số lượng Xu nguyên dương lớn hơn 0.');
      return;
    }

    setIsDonatingCoins(true);
    setDonateModalError(null);
    setUserFeedbackMsg(null);

    try {
      await donateCoinsToUserByAdmin(donateTargetUser.id, parsedAmount, user.email || '');

      // Chỉ cập nhật đúng dòng user vừa được tặng trong local state (KHÔNG gọi lại getDocs)
      setUsersList((prev) =>
        (prev || []).map((u) =>
          u.id === donateTargetUser.id
            ? { ...u, xuBalance: (u.xuBalance || 0) + parsedAmount }
            : u
        )
      );

      if (onDonateCoinsSuccess) {
        onDonateCoinsSuccess(donateTargetUser.id, parsedAmount);
      }

      setUserFeedbackMsg({
        type: 'success',
        text: `Đã tặng thành công +${parsedAmount.toLocaleString('vi-VN')} Xu cho "${donateTargetUser.displayName || donateTargetUser.email}" và gửi thông báo tới người dùng.`,
      });
      setDonateTargetUser(null);
    } catch (err: any) {
      console.error('Lỗi khi tặng xu cho user:', err);
      setDonateModalError(
        err?.message || 'Không thể tặng xu. Vui lòng kiểm tra quyền quản trị hoặc kết nối mạng.'
      );
    } finally {
      setIsDonatingCoins(false);
    }
  };

  const handleOpenGrantStoryModal = (targetUser: UserProfile) => {
    if (!checkIsAdmin(user?.email)) return;
    setGrantTargetUser(targetUser);
    setGrantNovelIdInput('');
    setGrantChapterIdInput('');
    setGrantModalError(null);
  };

  const handleConfirmGrantStory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!grantTargetUser || !checkIsAdmin(user?.email)) {
      setGrantModalError('Chỉ Quản trị viên hợp lệ mới được thực hiện thao tác Cấp Quyền Truyện.');
      return;
    }

    const cleanNovelId = grantNovelIdInput.trim();
    const cleanChapterId = grantChapterIdInput.trim();
    if (!cleanNovelId && !cleanChapterId) {
      setGrantModalError('Vui lòng nhập ID Truyện và/hoặc ID Chương cần cấp quyền.');
      return;
    }

    setIsGrantingStory(true);
    setGrantModalError(null);
    setUserFeedbackMsg(null);

    try {
      const result = await grantStoryAccessToUserByAdmin({
        targetUserId: grantTargetUser.id,
        novelIdInput: cleanNovelId,
        chapterIdInput: cleanChapterId,
        adminEmail: user?.email || '',
      });

      setUsersList((prev) =>
        (prev || []).map((u) => {
          if (u.id !== grantTargetUser.id) return u;
          const prevList = Array.isArray(u.purchasedChapters) ? u.purchasedChapters : [];
          return {
            ...u,
            purchasedChapters: Array.from(new Set([...prevList, ...result.grantedIds])),
          };
        })
      );

      setUserFeedbackMsg({
        type: 'success',
        text: `Đã cấp quyền đọc truyện (${result.grantedIds.join(', ')}) cho "${grantTargetUser.displayName || grantTargetUser.email}" mà không làm thay đổi số dư Xu.`,
      });
      setGrantTargetUser(null);
    } catch (err: any) {
      console.error('Lỗi khi cấp quyền truyện:', err);
      setGrantModalError(
        err?.message || 'Không thể cấp quyền truyện. Vui lòng kiểm tra quyền quản trị hoặc kết nối mạng.'
      );
    } finally {
      setIsGrantingStory(false);
    }
  };

  // Comments Moderation State
  const [adminComments, setAdminComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState<boolean>(false);
  const [commentSearchQuery, setCommentSearchQuery] = useState<string>('');

  // Tải bình luận thật của hệ thống khi mở tab bình luận
  useEffect(() => {
    if (isOpen && activeTab === 'comments') {
      setIsLoadingComments(true);
      fetchAllCommentsForAdmin()
        .then((list) => {
          setAdminComments(Array.isArray(list) ? list : []);
          setIsLoadingComments(false);
        })
        .catch(() => setIsLoadingComments(false));
    }
  }, [isOpen, activeTab]);

  const handleDeleteCommentByAdmin = async (commentId: string, authorName: string) => {
    if (!window.confirm(`[BQT Đạo Tâm] Bạn có chắc muốn xóa bình luận của độc giả "${authorName}"? Thao tác này sẽ gỡ bỏ bình luận ngay lập tức khỏi hệ thống.`)) {
      return;
    }
    try {
      await deleteNovelCommentFromFirestore(commentId);
      setAdminComments((prev) => (prev || []).filter((c) => c.id !== commentId));
    } catch (err) {
      console.error('Lỗi xóa bình luận:', err);
      alert('Không thể xóa bình luận, vui lòng thử lại.');
    }
  };

  // Novel Management state
  const [novelSearchQuery, setNovelSearchQuery] = useState('');
  const [novelStatusFilter, setNovelStatusFilter] = useState<'all' | 'visible' | 'hidden' | 'short_stories' | 'missing_male' | 'missing_female'>('all');
  const [confirmDeleteNovel, setConfirmDeleteNovel] = useState<Novel | null>(null);
  const [isReloadingNovels, setIsReloadingNovels] = useState(false);

  const openYoutubeManager = (novel: Novel) => {
    setYoutubeManagingNovel(novel);
    setYoutubeIsShortStoryInput(Boolean(novel.isShortStory));
    setYoutubeUrlInput(novel.youtubeVideoId ? buildYouTubeShareUrl(novel.youtubeVideoId) : '');
    setYoutubeVipLockedInput(Boolean(novel.isYoutubeVipLocked));
    setYoutubeFormError(null);
  };

  const handleSaveYoutubeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeManagingNovel || isSavingYoutubeSettings) return;

    const trimmedUrl = youtubeUrlInput.trim();
    let resolvedVideoId = '';
    if (trimmedUrl) {
      const parsed = extractYouTubeVideoId(trimmedUrl);
      if (!parsed.videoId) {
        setYoutubeFormError(
          parsed.error ||
            'Link YouTube chưa đúng định dạng. Vui lòng dán link youtu.be/..., watch?v=..., shorts/... hoặc embed/...'
        );
        return;
      }
      resolvedVideoId = parsed.videoId;
    }

    setYoutubeFormError(null);
    setIsSavingYoutubeSettings(true);
    try {
      const nextIsShort = youtubeIsShortStoryInput;
      const nextVideoId = nextIsShort ? resolvedVideoId : '';
      const nextVipLocked = nextIsShort ? Boolean(youtubeVipLockedInput) : false;

      await updateNovelMetadataInFirestore(
        youtubeManagingNovel.id,
        {
          isShortStory: nextIsShort,
          youtubeVideoId: nextVideoId,
          isYoutubeVipLocked: nextVipLocked,
        },
        { touchUpdatedAt: false }
      );

      onUpdateNovelYoutubeSettings?.(youtubeManagingNovel.id, {
        isShortStory: nextIsShort,
        youtubeVideoId: nextVideoId,
        isYoutubeVipLocked: nextVipLocked,
      });

      setYoutubeManagingNovel(null);
    } catch (err: any) {
      setYoutubeFormError(err?.message || 'Không thể lưu cấu hình YouTube vào Firestore.');
    } finally {
      setIsSavingYoutubeSettings(false);
    }
  };

  // Batch chapters state
  const [selectedNovelId, setSelectedNovelId] = useState<string>(novels?.[0]?.id || '');
  const [batchRawText, setBatchRawText] = useState('');
  const [batchSuccessMsg, setBatchSuccessMsg] = useState('');

  // Revenue Share rates
  const [authorRate, setAuthorRate] = useState(royaltyConfig.authorRate);
  const [editorRate, setEditorRate] = useState(royaltyConfig.editorRate);
  const [exclusiveRate, setExclusiveRate] = useState(royaltyConfig.exclusiveRate);
  const [configSaved, setConfigSaved] = useState(false);

  const [submissionFilterStatus, setSubmissionFilterStatus] = useState<'pending' | 'processed'>('pending');
  const [rejectingSubId, setRejectingSubId] = useState<string | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState<string>('');
  const [confirmingWithdrawId, setConfirmingWithdrawId] = useState<string | null>(null);
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState<string | null>(null);

  // 12. Thông Báo Toàn Trang (Global Banner) State
  const isAuthorizedGlobalBannerAdmin = checkIsAdmin(user?.email);
  const [bannerIsActive, setBannerIsActive] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<string>('');
  const [bannerUpdatedAt, setBannerUpdatedAt] = useState<number | null>(null);
  const [isLoadingBanner, setIsLoadingBanner] = useState<boolean>(false);
  const [isSavingBanner, setIsSavingBanner] = useState<boolean>(false);
  const [bannerLoadedOnce, setBannerLoadedOnce] = useState<boolean>(false);
  const [bannerFeedback, setBannerFeedback] = useState<{
    type: 'success' | 'warning_error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || activeTab !== 'global_banner' || bannerLoadedOnce || !isAuthorizedGlobalBannerAdmin) {
      return;
    }
    let mounted = true;
    setIsLoadingBanner(true);
    setBannerFeedback(null);
    fetchGlobalBannerSettingsForAdmin()
      .then((res) => {
        if (!mounted) return;
        setBannerIsActive(res.isActive);
        setBannerMessage(res.message);
        setBannerUpdatedAt(res.updatedAt ?? null);
        setBannerLoadedOnce(true);
      })
      .catch((err: any) => {
        if (!mounted) return;
        setBannerFeedback({
          type: 'warning_error',
          text: `Không thể tải cấu hình Thông Báo Toàn Trang: ${err?.message || 'Lỗi kết nối hệ thống'}`,
        });
      })
      .finally(() => {
        if (mounted) setIsLoadingBanner(false);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen, activeTab, bannerLoadedOnce, isAuthorizedGlobalBannerAdmin]);

  const handleSaveGlobalBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedGlobalBannerAdmin || isSavingBanner) return;

    setIsSavingBanner(true);
    setBannerFeedback(null);
    try {
      const saved = await saveGlobalBannerSettings({
        isActive: bannerIsActive,
        message: bannerMessage,
        adminEmail: user?.email,
      });
      setBannerIsActive(saved.isActive);
      setBannerMessage(saved.message);
      setBannerUpdatedAt(saved.updatedAt ?? Date.now());
      setBannerFeedback({
        type: 'success',
        text: saved.isActive
          ? '✓ Đã lưu và BẬT Thông Báo Toàn Trang trên đầu Trang Chủ (1 lượt Write vào settings/global_banner).'
          : '✓ Đã lưu và TẮT Thông Báo Toàn Trang (banner sẽ ẩn hoàn toàn trên Trang Chủ).',
      });
    } catch (err: any) {
      let msg = err?.message || 'Lỗi không xác định khi lưu Thông Báo Toàn Trang.';
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error) msg = parsed.error;
      } catch {}
      setBannerFeedback({
        type: 'warning_error',
        text: `Cảnh báo lỗi hệ thống: ${msg}`,
      });
    } finally {
      setIsSavingBanner(false);
    }
  };

  if (!isOpen) return null;

  const safeNovels = Array.isArray(novels) ? novels : [];
  const safeTopUpRequests = Array.isArray(topUpRequests) ? topUpRequests : [];
  const safeNovelSubmissions = Array.isArray(novelSubmissions) ? novelSubmissions : [];
  const safeWithdrawalRequests = Array.isArray(withdrawalRequests) ? withdrawalRequests : [];
  const safeNovelReports = Array.isArray(novelReports) ? novelReports : [];

  const targetNovel = safeNovels.find((n) => n.id === selectedNovelId) || safeNovels[0];

  const shortStoriesCount = safeNovels.filter((n) => Boolean(n.isShortStory)).length;

  const missingMaleNovelsCount = safeNovels.filter((n) => {
    const { totalChapters, namMinhCount } = getNovelMp3Counts(n);
    return totalChapters > 0 ? namMinhCount < totalChapters : namMinhCount === 0;
  }).length;

  const missingFemaleNovelsCount = safeNovels.filter((n) => {
    const { totalChapters, hangNgaCount } = getNovelMp3Counts(n);
    return totalChapters > 0 ? hangNgaCount < totalChapters : hangNgaCount === 0;
  }).length;

  const filteredNovels = safeNovels.filter((n) => {
    const q = novelSearchQuery.toLowerCase().trim();
    const matchesSearch = 
      !q ||
      (n.title || '').toLowerCase().includes(q) ||
      (n.author || '').toLowerCase().includes(q) ||
      (n.editor && n.editor.toLowerCase().includes(q));
    
    if (!matchesSearch) return false;
    if (novelStatusFilter === 'visible') return !n.isHidden;
    if (novelStatusFilter === 'hidden') return !!n.isHidden;
    if (novelStatusFilter === 'short_stories') return Boolean(n.isShortStory);
    if (novelStatusFilter === 'missing_male') {
      const { totalChapters, namMinhCount } = getNovelMp3Counts(n);
      return totalChapters > 0 ? namMinhCount < totalChapters : namMinhCount === 0;
    }
    if (novelStatusFilter === 'missing_female') {
      const { totalChapters, hangNgaCount } = getNovelMp3Counts(n);
      return totalChapters > 0 ? hangNgaCount < totalChapters : hangNgaCount === 0;
    }
    return true;
  });

  const effectiveTopUpRequests = livePendingTopUps
    ? [...livePendingTopUps, ...safeTopUpRequests.filter((r) => r.status !== 'pending')]
    : safeTopUpRequests;

  const filteredRequests = (effectiveTopUpRequests || []).filter((r) => {
    if (filterStatus === 'all') return true;
    return r.status === filterStatus;
  });

  const pendingSubmissions = safeNovelSubmissions.filter((s) => s.status === 'pending');
  const processedSubmissions = safeNovelSubmissions.filter((s) => s.status !== 'pending');
  const displayedSubmissions = submissionFilterStatus === 'pending' ? pendingSubmissions : processedSubmissions;
  const pendingTopUpCount = (livePendingTopUps || safeTopUpRequests).filter((r) => r.status === 'pending')?.length || 0;
  const pendingWithdrawalCount = safeWithdrawalRequests.filter((w) => w.status === 'pending')?.length || 0;
  const pendingReportsCount = safeNovelReports.filter((r) => r.status === 'pending')?.length || 0;

  const toTimestampMs = (val: any): number => {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (val && typeof val.toMillis === 'function') return val.toMillis();
    if (val && typeof val.seconds === 'number') return val.seconds * 1000;
    return 0;
  };

  // Tính doanh thu & Xu đã duyệt HÔM NAY (từ 00:00:00 giờ Việt Nam)
  const vnStartOfDayMs = getVietnamStartOfDayMs();
  const approvedTopUpsById = new Map<string, TopUpRequest>();
  [...effectiveTopUpRequests, ...todayApprovedRequests].forEach((req) => {
    if (!req?.id || req.status !== 'approved') return;
    approvedTopUpsById.set(req.id, req);
  });

  const todayApprovedList = Array.from(approvedTopUpsById.values()).filter((r) => {
    const actionTimeMs = toTimestampMs(r.approvedAt) || toTimestampMs(r.createdAt);
    return actionTimeMs >= vnStartOfDayMs;
  });

  const todayRevenueVnd = todayApprovedList.reduce(
    (acc, cur) => acc + (Number(cur.amountVnd) || 0),
    0
  );

  const todayXuApproved = todayApprovedList.reduce(
    (acc, cur) => acc + (Number(cur.xuAmount) || 0),
    0
  );

  const allTimeRevenueVnd = financeStats?.totalRevenueVnd ?? 0;
  const allTimeApprovedXu = financeStats?.totalApprovedXu ?? 0;

  const handleBatchPublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNovelId || !batchRawText.trim() || !targetNovel) return;

    const currentCount = targetNovel.chapters?.length || 0;
    const finalChapters = parseBatchChapters(
      batchRawText,
      currentCount,
      currentCount + 100
    );

    if ((finalChapters?.length || 0) === 0) {
      alert('Không nhận diện được chương nào. Hãy đảm bảo format dạng: === Chương [X]: Tiêu đề ===');
      return;
    }

    onAddBatchChapters(selectedNovelId, finalChapters);
    setBatchSuccessMsg(`Đã đăng thành công ${finalChapters?.length || 0} chương mới vào truyện "${targetNovel.title}"!`);
    setBatchRawText('');
    setTimeout(() => setBatchSuccessMsg(''), 4000);
  };

  const handleQuickGenerateDemo = (count: number) => {
    if (!targetNovel) return;
    const startNum = (targetNovel.chapters?.length || 0) + 1;

    let demoText = '';
    for (let i = 0; i < count; i++) {
      const num = startNum + i;
      demoText += `=== Chương ${num}: Diễn biến cao trào hồi mục ${num} ===\n\nGió thu thổi qua mái ngói lưu ly phủ đầy rêu phong. Nhân vật chính bước những bước đi vững chãi vào đại điện, ánh mắt ngập tràn sự kiên định sau chuỗi ngày khổ luyện gian nan.\n\n"Ngươi rốt cuộc đã chịu xuất hiện rồi sao?" Tiếng cười trầm thấp vang lên từ trong góc tối, báo hiệu một cuộc chạm trán không thể tránh khỏi.\n\n`;
    }
    setBatchRawText(demoText);
  };

  const handleCopyStk = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStkId(id);
    setTimeout(() => setCopiedStkId(null), 2000);
  };

  // Xử lý duyệt nạp xu nguyên tử (Atomic Transaction):
  // 1. Kiểm tra validation: status phải là 'pending'
  // 2. Chặn double-click bằng processingRequestId
  // 3. Thực hiện 3 việc cùng lúc: Đổi status 'approved', cộng Xu vào ví User, ghi document vào collection notifications
  // 4. Nếu thành công: hiển thị banner màu HỒNG
  // 5. Nếu lỗi mạng/database: bắt lỗi catch và hiển thị banner màu VÀNG (tuyệt đối không dùng màu đỏ)
  const handleApprove = async (docId: string) => {
    const targetReq = effectiveTopUpRequests.find((r) => r.id === docId);
    if (!targetReq) return;

    if (processingRequestId || targetReq.status !== 'pending') {
      console.warn(`[Admin] Lệnh nạp ${docId} không ở trạng thái pending hoặc đang được xử lý.`);
      return;
    }

    setProcessingRequestId(docId);
    try {
      const approvedResult = await approveTopUpTransactionInFirestore(docId);
      const approvedNow = Date.now();
      const updatedReq: TopUpRequest = {
        ...targetReq,
        status: 'approved',
        approvedAt: approvedNow,
      };

      setTodayApprovedRequests((prev) => [
        updatedReq,
        ...prev.filter((r) => r.id !== docId),
      ]);
      setFinanceStats((prev) => ({
        totalRevenueVnd: (prev?.totalRevenueVnd || 0) + (Number(approvedResult.amountVnd) || 0),
        totalApprovedXu: (prev?.totalApprovedXu || 0) + (Number(approvedResult.xuAmount) || 0),
        updatedAt: approvedNow,
      }));

      onApproveRequest(docId, {
        alreadyProcessedInFirestore: true,
        approvedRequest: updatedReq,
        nextXu: approvedResult.nextXu,
      });

      setTopUpFeedback({
        type: 'success',
        text: `✓ Đã phê duyệt thành công lệnh nạp mã "${targetReq.transferCode}"! Đã cộng +${targetReq.xuAmount.toLocaleString('vi-VN')} Xu vào ví của độc giả ${targetReq.userName}.`,
      });
    } catch (err: any) {
      console.error('Lỗi khi duyệt nạp xu:', err);
      let errMsg = err?.message || 'Lỗi mạng hoặc không thể kết nối tới cơ sở dữ liệu.';
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed && parsed.error) errMsg = parsed.error;
      } catch {}
      setTopUpFeedback({
        type: 'warning_error',
        text: `⚠️ Cảnh báo lỗi duyệt nạp tiền: ${errMsg}`,
      });
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Xử lý từ chối nạp xu:
  // 1. Kiểm tra validation: status phải là 'pending'
  // 2. Chặn double-click bằng processingRequestId
  // 3. Hộp thoại xác nhận nhỏ (confirm) trước khi từ chối để tránh admin bấm nhầm
  // 4. Cập nhật status thành 'rejected' và ghi document vào collection notifications báo user biết mã XYZ bị từ chối
  // 5. Nếu thành công: hiển thị banner màu HỒNG
  // 6. Nếu lỗi: bắt lỗi catch và hiển thị banner màu VÀNG (tuyệt đối không dùng màu đỏ)
  const handleReject = async (docId: string) => {
    const targetReq = safeTopUpRequests.find((r) => r.id === docId);
    if (!targetReq) return;

    if (processingRequestId || targetReq.status !== 'pending') {
      console.warn(`[Admin] Lệnh nạp ${docId} không ở trạng thái pending hoặc đang được xử lý.`);
      return;
    }

    const confirmed = window.confirm(
      `⚠️ Bạn có chắc chắn muốn TỪ CHỐI lệnh nạp này không?\n\n• Mã GD: ${targetReq.transferCode}\n• Độc giả: ${targetReq.userName} (${targetReq.userEmail})\n• Số tiền: ${targetReq.amountVnd.toLocaleString('vi-VN')} VNĐ (+${targetReq.xuAmount} Xu)\n\nHệ thống sẽ đổi trạng thái thành "Từ chối" và gửi thông báo tới độc giả.`
    );
    if (!confirmed) return;

    setProcessingRequestId(docId);
    try {
      await rejectTopUpTransactionInFirestore(docId);
      onRejectRequest(docId);

      setTopUpFeedback({
        type: 'success',
        text: `✓ Đã từ chối lệnh nạp mã "${targetReq.transferCode}" của độc giả ${targetReq.userName} và gửi thông báo phản hồi tới tài khoản.`,
      });
    } catch (err: any) {
      console.error('Lỗi khi từ chối nạp xu:', err);
      let errMsg = err?.message || 'Lỗi mạng hoặc không thể cập nhật cơ sở dữ liệu.';
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed && parsed.error) errMsg = parsed.error;
      } catch {}
      setTopUpFeedback({
        type: 'warning_error',
        text: `⚠️ Cảnh báo lỗi từ chối lệnh nạp: ${errMsg}`,
      });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleSaveRoyaltyConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateRoyaltyConfig) {
      onUpdateRoyaltyConfig({ authorRate, editorRate, exclusiveRate });
    }
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  };

  const handleSelectTab = (
    tab: 'requests' | 'submissions' | 'payouts' | 'reports' | 'novels' | 'batch' | 'comments' | 'tools' | 'users' | 'support_chat' | 'global_banner'
  ) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 text-slate-900 flex flex-col h-screen w-screen overflow-hidden animate-in fade-in duration-150">
      
      {/* 1. Header Trang Quản Trị Admin (Cố định top-0, z-40, h-16) */}
      <header className="fixed top-0 inset-x-0 z-40 h-16 bg-white/95 backdrop-blur-md border-b border-pink-100 shadow-xs">
        {/* Header Mobile (< md): Tối giản gọn gàng đúng 3 phần (Hamburger | Admin Đạo Tâm | Thoát) */}
        <div className="flex md:hidden items-center justify-between h-full px-3 gap-2">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Mở danh mục quản lý"
            className="w-10 h-10 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-600 flex items-center justify-center border border-pink-200 transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="text-base font-black bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent truncate text-center">
            Admin Đạo Tâm
          </h1>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Thoát</span>
          </button>
        </div>

        {/* Header Desktop (>= md): Đầy đủ thông tin & thao tác quản trị */}
        <div className="hidden md:flex items-center justify-between h-full px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-pink-50 text-slate-700 hover:text-pink-600 text-xs font-bold transition cursor-pointer border border-slate-200 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-pink-600" />
              <span>Quay lại trang chủ</span>
            </button>
            
            <div className="h-5 w-px bg-slate-200" />
            
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center text-pink-600 shadow-xs shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  Hệ Thống Quản Trị Admin — <span className="text-pink-600">Đạo Tâm</span>
                </h1>
                <p className="text-[11px] text-pink-600 font-semibold">
                  Kiểm duyệt tác phẩm, đối soát lương &amp; vận hành nền tảng
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(pendingTopUpCount > 0 || (pendingSubmissions?.length || 0) > 0 || pendingWithdrawalCount > 0 || pendingReportsCount > 0) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-700 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-pink-600" />
                <span>
                  {pendingTopUpCount + (pendingSubmissions?.length || 0) + pendingWithdrawalCount + pendingReportsCount} việc cần xử lý
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-800">{user.displayName || 'Admin'}</span>
              <span className="text-[9px] bg-pink-600 text-white px-2 py-0.5 rounded font-black tracking-wide">
                SUPER ADMIN
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Đóng trang quản trị"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Thân Trang: Drawer Sidebar trên Mobile + Cột cố định trên Desktop */}
      <div className="flex-1 flex h-full overflow-hidden relative">
        
        {/* Lớp phủ đen mờ Backdrop trên Mobile khi Drawer mở */}
        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden transition-opacity"
          />
        )}

        {/* SIDEBAR (<aside>): Overlay Drawer trượt trên Mobile (-translate-x-full -> translate-x-0), Cố định w-64 trên Desktop */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 md:w-64 lg:w-72 bg-white border-r border-pink-100 flex flex-col flex-shrink-0 overflow-y-auto shadow-2xl md:shadow-none transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 md:z-auto md:pt-16 md:flex ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-pink-100 flex items-center justify-between bg-pink-50/40 md:bg-white">
            <span className="text-pink-700">Danh mục quản lý</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-pink-600 font-bold bg-pink-100 px-2 py-0.5 rounded-full">
                12 mục
              </span>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-pink-600 hover:bg-pink-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-2.5 space-y-1.5 flex-1 overflow-y-auto">
            
            {/* 1. Duyệt Nạp Xu */}
            <button
              type="button"
              onClick={() => handleSelectTab('requests')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'requests'
                  ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Coins className={`w-4 h-4 shrink-0 ${activeTab === 'requests' ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'requests' ? 'text-pink-700 dark:text-pink-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>1. Duyệt Nạp Xu</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">Khớp lệnh MBBank</div>
                </div>
              </div>
              {pendingTopUpCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-pink-600 text-white text-[10px] font-black shrink-0">
                  {pendingTopUpCount}
                </span>
              )}
            </button>

            {/* 2. Kiểm Duyệt Nội Dung & Tác Giả */}
            <button
              type="button"
              onClick={() => handleSelectTab('submissions')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'submissions'
                  ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <BookOpen className={`w-4 h-4 shrink-0 ${activeTab === 'submissions' ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'submissions' ? 'text-pink-700 dark:text-pink-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>2. Kiểm Duyệt Tác Giả</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">Bản thảo 5 chương &amp; STK</div>
                </div>
              </div>
              {(pendingSubmissions?.length || 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-pink-600 text-white text-[10px] font-black shrink-0">
                  {pendingSubmissions?.length || 0}
                </span>
              )}
            </button>

            {/* 3. Đối Soát Lương & Duyệt Rút Xu */}
            <button
              type="button"
              onClick={() => handleSelectTab('payouts')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'payouts'
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 shadow-xs dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Building2 className={`w-4 h-4 shrink-0 ${activeTab === 'payouts' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'payouts' ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>3. Đối Soát &amp; Rút Lương</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">Duyệt nhuận bút tác giả</div>
                </div>
              </div>
              {pendingWithdrawalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black shrink-0">
                  {pendingWithdrawalCount}
                </span>
              )}
            </button>

            {/* 4. Báo Cáo Vi Phạm */}
            <button
              type="button"
              onClick={() => handleSelectTab('reports')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'reports'
                  ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200 shadow-xs dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-slate-50 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Flag className={`w-4 h-4 shrink-0 ${activeTab === 'reports' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'reports' ? 'text-rose-800 dark:text-rose-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>4. Báo Cáo Vi Phạm</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">Bản quyền, 18+, reup</div>
                </div>
              </div>
              {pendingReportsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black shrink-0">
                  {pendingReportsCount}
                </span>
              )}
            </button>

            {/* 5. Quản Lý Danh Sách Truyện */}
            <button
              type="button"
              onClick={() => handleSelectTab('novels')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'novels'
                  ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers className={`w-4 h-4 shrink-0 ${activeTab === 'novels' ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'novels' ? 'text-pink-700 dark:text-pink-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>5. Quản Lý Truyện</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">Ẩn/hiện, sửa, xóa truyện</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-bold shrink-0">
                {safeNovels?.length || 0} bộ
              </span>
            </button>

            {/* 6. Đăng Chương Hàng Loạt */}
            <button
              type="button"
              onClick={() => handleSelectTab('batch')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'batch'
                  ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <BookPlus className={`w-4 h-4 shrink-0 ${activeTab === 'batch' ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'batch' ? 'text-pink-700 dark:text-pink-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>6. Đăng Hàng Loạt</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">Batch Upload chương</div>
                </div>
              </div>
            </button>

            {/* 7. Quản Lý Bình Luận */}
            <button
              type="button"
              onClick={() => handleSelectTab('comments')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'comments'
                  ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageSquare className={`w-4 h-4 shrink-0 ${activeTab === 'comments' ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'comments' ? 'text-pink-700 dark:text-pink-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>7. Quản Lý Bình Luận</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">100% Bình luận thật &amp; gỡ vi phạm</div>
                </div>
              </div>
              {(adminComments?.length || 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-bold shrink-0">
                  {adminComments?.length || 0}
                </span>
              )}
            </button>

            {/* 8. Kiến Trúc Vercel & Cấu Hình Nhuận Bút */}
            <button
              type="button"
              onClick={() => handleSelectTab('tools')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'tools'
                  ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileCode2 className={`w-4 h-4 shrink-0 ${activeTab === 'tools' ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'tools' ? 'text-pink-700 dark:text-pink-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>8. Cấu Hình &amp; Kiến Trúc</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">% Nhuận bút &amp; DRM</div>
                </div>
              </div>
            </button>

            {/* 9. Quản Lý Người Dùng & Khóa Tài Khoản */}
            <button
              type="button"
              onClick={() => handleSelectTab('users')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'users'
                  ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Users className={`w-4 h-4 shrink-0 ${activeTab === 'users' ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'users' ? 'text-pink-700 dark:text-pink-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>9. Quản Lý Người Dùng</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">Khóa vi phạm &amp; phân quyền</div>
                </div>
              </div>
              {(usersList || []).some((u) => u.isBanned) && (
                <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-bold shrink-0">
                  {(usersList || []).filter((u) => u.isBanned)?.length || 0} bị khóa
                </span>
              )}
            </button>

            {/* 10. Giám Sát Tin Nhắn Tàng Hình (Stealth Mode) */}
            <button
              type="button"
              onClick={() => {
                if (onOpenAdminMessages) {
                  onOpenAdminMessages();
                  setIsMobileMenuOpen(false);
                }
              }}
              className="w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group bg-gradient-to-r from-pink-500/10 to-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-300/60 dark:border-rose-900/40 hover:bg-rose-500/20"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Eye className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 animate-pulse" />
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate flex items-center gap-1.5">
                    <span>10. Giám Sát Tin Nhắn</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-black">
                      Tàng hình
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal truncate">
                    Stealth Admin Monitoring
                  </div>
                </div>
              </div>
            </button>

            {/* 11. Live Chat Hỗ Trợ Độc Giả (Realtime Firestore) */}
            <button
              type="button"
              onClick={() => handleSelectTab('support_chat')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'support_chat'
                  ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200 shadow-xs dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800'
                  : 'text-slate-600 dark:text-slate-300 hover:text-pink-600 hover:bg-pink-50/40 dark:hover:bg-yellow-400 dark:hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageSquare className={`w-4 h-4 shrink-0 ${activeTab === 'support_chat' ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'support_chat' ? 'text-pink-700 dark:text-pink-300' : 'text-slate-800 dark:text-slate-200 group-hover:dark:text-slate-900'}`}>11. Live Chat Hỗ Trợ</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 group-hover:dark:text-slate-900 font-normal truncate">support_chats Realtime</div>
                </div>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Trực tuyến" />
            </button>

            {/* 12. Thông Báo Toàn Trang (Global Banner) */}
            <button
              type="button"
              onClick={() => handleSelectTab('global_banner')}
              className={`w-full p-3 rounded-xl font-semibold flex items-center justify-between transition-all cursor-pointer text-left group ${
                activeTab === 'global_banner'
                  ? 'bg-yellow-50 text-amber-950 ring-1 ring-amber-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-amber-900 hover:bg-yellow-50/70'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Megaphone className={`w-4 h-4 shrink-0 ${activeTab === 'global_banner' ? 'text-amber-700' : 'text-slate-400 group-hover:text-amber-600'}`} />
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${activeTab === 'global_banner' ? 'text-amber-950' : 'text-slate-800 dark:text-slate-200'}`}>
                    12. Thông Báo Toàn Trang
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">
                    Banner vàng trên Trang Chủ
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-black shrink-0 ${
                  bannerIsActive
                    ? 'bg-yellow-300 text-amber-950 border border-yellow-500'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}
              >
                {bannerIsActive ? 'BẬT' : 'TẮT'}
              </span>
            </button>

          </div>
        </aside>

        {/* CỘT BÊN PHẢI: Toàn bộ thông báo và nội dung chi tiết tương ứng từng mục - Cuộn độc lập & chừa pt-16 tránh Header cố định */}
        <main className="flex-1 h-full bg-slate-50 pt-16 overflow-y-auto text-slate-800">
          <div className="p-4 sm:p-6 lg:p-8 pb-40 space-y-6">
          
          {/* Thông báo tương ứng mục đang chọn (Nếu có việc cần xử lý) */}
          {activeTab === 'requests' && pendingTopUpCount > 0 && (
            <div className="p-4 rounded-2xl bg-pink-50 border border-pink-200 text-pink-900 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping" />
                <span>
                  <strong className="text-pink-800">Thông báo mục nạp xu:</strong> Có <strong className="text-pink-800">{pendingTopUpCount}</strong> lệnh nạp tiền đang chờ xác nhận chuyển khoản ngân hàng.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'submissions' && (pendingSubmissions?.length || 0) > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                <span>
                  <strong className="text-amber-800">Thông báo kiểm duyệt:</strong> Có <strong className="text-amber-800">{pendingSubmissions?.length || 0}</strong> tác phẩm và đơn đăng ký tác giả đang chờ thẩm định.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'payouts' && pendingWithdrawalCount > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span>
                  <strong className="text-emerald-800">Thông báo trả lương:</strong> Có <strong className="text-emerald-800">{pendingWithdrawalCount}</strong> lệnh rút nhuận bút của tác giả đang chờ giải ngân.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'reports' && pendingReportsCount > 0 && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                <span>
                  <strong className="text-rose-800">Thông báo báo cáo vi phạm:</strong> Có <strong className="text-rose-800">{pendingReportsCount}</strong> báo cáo vi phạm cần Ban Quản Trị xác minh.
                </span>
              </div>
            </div>
          )}
          
          {/* =========================================================================
              TAB 1: DUYỆT NẠP XU (TOP-UP QUEUE)
             ========================================================================= */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="text-slate-500 text-xs font-semibold">Doanh Thu Hôm Nay:</div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">
                    {todayRevenueVnd.toLocaleString('vi-VN')} VNĐ
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="text-slate-500 text-xs font-semibold">Xu Đã Duyệt Hôm Nay:</div>
                  <div className="text-xl sm:text-2xl font-black text-pink-600 mt-1">
                    {todayXuApproved.toLocaleString('vi-VN')} Xu
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="text-slate-500 text-xs font-semibold">Tổng Doanh Thu Tích Lũy:</div>
                  <div className="text-xl sm:text-2xl font-black text-indigo-600 mt-1">
                    {isLoadingFinanceStats && !financeStats
                      ? '...'
                      : `${allTimeRevenueVnd.toLocaleString('vi-VN')} VNĐ`}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
                    Tổng Xu đã duyệt: {allTimeApprovedXu.toLocaleString('vi-VN')} Xu
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="text-slate-500 text-xs font-semibold">Yêu Cầu Chờ Duyệt:</div>
                  <div className="text-xl sm:text-2xl font-black text-rose-600 mt-1">
                    {pendingTopUpCount} lệnh nạp
                  </div>
                </div>
              </div>

              {/* Banner Thông báo kết quả thao tác Nạp Xu */}
              {topUpFeedback && (
                <div
                  className={`p-4 rounded-2xl flex items-start sm:items-center justify-between gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-200 ${
                    topUpFeedback.type === 'success'
                      ? 'bg-gradient-to-r from-pink-600 via-rose-500 to-pink-500 text-white border border-pink-300 shadow-pink-500/20'
                      : 'bg-yellow-400 text-yellow-950 border-2 border-yellow-500 shadow-yellow-500/20 font-semibold'
                  }`}
                  role="alert"
                >
                  <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                    {topUpFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-white" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-950" />
                    )}
                    <span className="leading-relaxed font-medium">{topUpFeedback.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTopUpFeedback(null)}
                    className={`p-1.5 rounded-xl transition cursor-pointer flex-shrink-0 ${
                      topUpFeedback.type === 'success'
                        ? 'text-white/80 hover:text-white hover:bg-white/20'
                        : 'text-yellow-900 hover:text-black hover:bg-yellow-500/30'
                    }`}
                    title="Đóng thông báo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {(filteredRequests?.length || 0) === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200 shadow-xs">
                  Không có yêu cầu nạp tiền nào theo bộ lọc.
                </div>
              ) : (
                <div className="space-y-3">
                  {(filteredRequests || []).map((req) => {
                    const isAnyProcessing = !!processingRequestId;
                    const isThisProcessing = processingRequestId === req.id;

                    return (
                      <div
                        key={req.id}
                        className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-pink-300 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                      >
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm">
                              {req.userName}
                            </span>
                            <span className="text-xs text-slate-500">
                              ({req.userEmail})
                            </span>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                              req.status === 'approved' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : req.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : req.status === 'cancelled'
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {req.status === 'approved' ? '✓ Đã duyệt' : req.status === 'rejected' ? '✕ Đã từ chối' : req.status === 'cancelled' ? 'Đã hủy' : '⏳ Chờ duyệt'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              • {new Date(req.createdAt).toLocaleString('vi-VN')}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                            <span>Số tiền: <strong className="text-emerald-600 font-bold text-sm">{req.amountVnd.toLocaleString('vi-VN')} đ</strong></span>
                            <span>Cộng ví: <strong className="text-pink-600 font-bold text-sm">+{req.xuAmount} Xu</strong></span>
                            <div className="flex items-center gap-1">
                              <span>Mã GD:</span>
                              <strong className="font-mono text-pink-700 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded text-xs select-all">
                                {req.transferCode}
                              </strong>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(req.transferCode);
                                  setCopiedStkId(req.id);
                                  setTimeout(() => setCopiedStkId(null), 2000);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-pink-600 hover:bg-pink-50 cursor-pointer transition"
                                title="Sao chép mã GD"
                              >
                                {copiedStkId === req.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {/* MỤC ẢNH BILL CHUYỂN KHOẢN (Cho Admin nhìn vào thấy bill đúng để duyệt) */}
                          <div className="pt-1 flex items-center gap-3 flex-wrap">
                            {req.billImageUrl ? (
                              <div className="flex items-center gap-2.5 bg-rose-50/70 border border-pink-200 rounded-xl p-1.5 pr-3 shadow-2xs">
                                <img
                                  src={req.billImageUrl}
                                  alt={`Bill của ${req.userName}`}
                                  onClick={() => setInspectingBillRequest(req)}
                                  className="w-12 h-12 object-cover rounded-lg border border-pink-300 cursor-pointer hover:scale-105 transition-transform flex-shrink-0"
                                  title="Bấm để phóng to xem chi tiết bill"
                                />
                                <div>
                                  <div className="text-[11px] font-bold text-pink-800 flex items-center gap-1">
                                    <Camera className="w-3 h-3 text-pink-600" />
                                    <span>Đã gửi ảnh bill chuyển khoản</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setInspectingBillRequest(req)}
                                    className="text-[11px] font-bold text-pink-600 hover:text-pink-800 underline flex items-center gap-1 cursor-pointer mt-0.5"
                                  >
                                    <Eye className="w-3 h-3" />
                                    Xem ảnh bill để đối soát
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                <span>Chưa gửi ảnh bill (Admin hãy đối soát sao kê MB theo Mã GD {req.transferCode})</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Các nút hành động duyệt / từ chối */}
                        <div className="flex items-center gap-2 self-end lg:self-center flex-shrink-0">
                          {req.billImageUrl && (
                            <button
                              type="button"
                              onClick={() => setInspectingBillRequest(req)}
                              className="px-3 py-2 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                              title="Mở ảnh bill toàn màn hình để đối soát"
                            >
                              <Eye className="w-4 h-4 text-pink-600" />
                              <span>Soi Bill</span>
                            </button>
                          )}

                          {req.status === 'pending' && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isAnyProcessing}
                                onClick={() => handleApprove(req.id)}
                                className={`px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition ${
                                  isAnyProcessing
                                    ? 'opacity-40 cursor-not-allowed pointer-events-none'
                                    : 'hover:bg-emerald-700 active:scale-98 cursor-pointer shadow-emerald-600/20'
                                }`}
                                title={isThisProcessing ? 'Đang duyệt và cộng Xu...' : 'Duyệt nạp và cộng Xu vào ví độc giả'}
                              >
                                {isThisProcessing ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Đang duyệt...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Duyệt Ngay (+{req.xuAmount} Xu)</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={isAnyProcessing}
                                onClick={() => handleReject(req.id)}
                                className={`px-3.5 py-2 rounded-xl font-semibold text-xs border transition ${
                                  isAnyProcessing
                                    ? 'opacity-40 cursor-not-allowed pointer-events-none bg-slate-100 text-slate-400 border-slate-200'
                                    : 'bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 hover:border-amber-300 border-slate-200 cursor-pointer active:scale-98'
                                }`}
                                title={isThisProcessing ? 'Đang xử lý...' : 'Từ chối yêu cầu nạp tiền'}
                              >
                                {isThisProcessing ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-slate-500" />
                                )}
                                <span>Từ chối</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 2: KIỂM DUYỆT NỘI DUNG & ĐƠN ĐĂNG KÝ TÁC GIẢ (KÈM 5 CHƯƠNG MẪU & STK)
             ========================================================================= */}
          {activeTab === 'submissions' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-pink-50 border border-pink-200 text-xs text-slate-700 shadow-xs leading-relaxed">
                <strong className="text-pink-700">Quy chuẩn kiểm duyệt Tác Giả &amp; Editor:</strong> Bất kỳ độc giả nào nộp bản thảo khi được Admin phê duyệt sẽ tự động được nâng cấp lên quyền Tác Giả / Editor. Người đó sẽ có toàn quyền đăng truyện mới xuất bản trực tiếp không cần qua kiểm duyệt, tất cả truyện người đó đăng đều hiển thị đầy đủ tại mục "Truyện của bạn", và có đầy đủ quyền tác giả (thêm chương, đăng nhiều chương, chỉnh sửa truyện, nhận 95% - 98% nhuận bút Xu). Truyện đã duyệt sẽ xuất hiện ngay trên trang chủ và rời khỏi danh sách chờ để bảng luôn gọn gàng.
              </div>

              {/* Bộ lọc: Chờ duyệt (Mặc định) vs Đã xử lý xong */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSubmissionFilterStatus('pending')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      submissionFilterStatus === 'pending'
                        ? 'bg-pink-600 text-white shadow-sm shadow-pink-600/30'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-pink-50'
                    }`}
                  >
                    <span>Chờ thẩm định</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      submissionFilterStatus === 'pending' ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-700'
                    }`}>
                      {pendingSubmissions?.length || 0}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubmissionFilterStatus('processed')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      submissionFilterStatus === 'processed'
                        ? 'bg-pink-600 text-white shadow-sm shadow-pink-600/30'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-pink-50'
                    }`}
                  >
                    <span>Đã xử lý xong</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      submissionFilterStatus === 'processed' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {processedSubmissions?.length || 0}
                    </span>
                  </button>
                </div>

                <span className="text-[11px] text-slate-500 font-medium">
                  {submissionFilterStatus === 'pending'
                    ? 'Chỉ hiển thị các bản thảo mới đang chờ phê duyệt'
                    : 'Lịch sử các bản thảo đã phê duyệt hoặc từ chối'}
                </span>
              </div>

              {submissionFilterStatus === 'pending' ? (
                /* COMPONENT ĐỒNG BỘ REAL-TIME ONSNAPSHOT DANH SÁCH CHỜ DUYỆT */
                <AdminPendingNovelsList
                  currentUser={user}
                  onApproveSubmission={onApproveNovelSubmission}
                  onRejectSubmission={onRejectNovelSubmission}
                  onDeleteSubmission={onDeleteNovel}
                />
              ) : (displayedSubmissions?.length || 0) === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="font-bold text-slate-700 text-sm">
                    Chưa có bản thảo nào trong danh sách đã xử lý
                  </p>
                  <p className="text-slate-400 text-xs">
                    Khi bạn duyệt hoặc từ chối đơn, chúng sẽ được lưu trữ lại tại đây.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(displayedSubmissions || []).map((sub) => (
                    <div
                      key={sub.id}
                      className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-pink-300 transition-all flex flex-col md:flex-row gap-4 items-start"
                    >
                      <img
                        src={sub.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                        alt={sub.title}
                        className="w-20 h-28 object-cover rounded-xl border border-slate-200 flex-shrink-0 shadow-xs"
                      />

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-serif text-base sm:text-lg font-bold text-slate-900">
                            {sub.title}
                          </h4>
                          {sub.isCreatorApplication && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200 flex items-center gap-1">
                              <span>✍️</span> Đơn Đăng Ký Tác Giả / Editor Mới
                            </span>
                          )}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {sub.mainCategory}
                          </span>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            sub.status === 'approved' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : sub.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {sub.status === 'approved' ? '✓ Đã duyệt' : sub.status === 'rejected' ? '✕ Đã từ chối' : '⏳ Chờ thẩm định'}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600">
                          Bút danh: <strong className="text-pink-600 font-bold">{sub.author}</strong>
                          {sub.editor && <> • Editor: <strong className="text-pink-600 font-bold">{sub.editor}</strong></>}
                          {' '}• Tài khoản nộp: <span className="text-slate-700 font-medium">{sub.submittedBy.userName} ({sub.submittedBy.userEmail})</span>
                        </div>

                        {sub.bankInfo && (
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 flex items-center gap-3">
                            <Building2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span>STK Nhận Nhuận Bút: <strong className="text-emerald-700 font-mono font-bold">{sub.bankInfo.accountNumber}</strong> ({sub.bankInfo.bankName}) • Chủ thẻ: <strong className="text-slate-900 uppercase font-bold">{sub.bankInfo.accountHolder}</strong></span>
                          </div>
                        )}

                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {sub.description}
                        </p>

                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <FileText className="w-3 h-3 text-amber-600" />
                            Bản thảo: {sub.chapters?.length || 5} chương thẩm định
                          </span>

                          <button
                            onClick={() => {
                              setPreviewSubmission(sub);
                              setPreviewChapterIndex(0);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                          >
                            <Eye className="w-3.5 h-3.5 text-pink-600" />
                            Đọc Thẩm Định 5 Chương
                          </button>
                        </div>
                      </div>

                      {sub.status === 'pending' && (
                        <div className="flex flex-col gap-2 w-full md:w-64">
                          <button
                            onClick={() => onApproveNovelSubmission(sub.id)}
                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Duyệt &amp; Nâng Cấp Tác Giả / Editor
                          </button>

                          {rejectingSubId === sub.id ? (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                              <label className="block text-[11px] font-bold text-rose-800">
                                Nhập lý do từ chối:
                              </label>
                              <textarea
                                value={rejectionReasonText}
                                onChange={(e) => setRejectionReasonText(e.target.value)}
                                placeholder="Ví dụ: Bản thảo chưa đạt chuẩn chính tả / nội dung trùng lặp..."
                                rows={2}
                                className="w-full p-2 text-xs border border-rose-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                              />
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const reason = rejectionReasonText.trim() || 'Chưa đạt tiêu chuẩn kiểm duyệt nội dung của Đạo Tâm';
                                    onRejectNovelSubmission(sub.id, reason);
                                    setRejectingSubId(null);
                                    setRejectionReasonText('');
                                  }}
                                  className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg cursor-pointer transition"
                                >
                                  Gửi Từ Chối
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectingSubId(null);
                                    setRejectionReasonText('');
                                  }}
                                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold rounded-lg cursor-pointer transition"
                                >
                                  Hủy
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setRejectingSubId(sub.id);
                                setRejectionReasonText('Bản thảo chưa đạt tiêu chuẩn kiểm duyệt nội dung của Đạo Tâm');
                              }}
                              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                            >
                              <XCircle className="w-4 h-4" />
                              Từ chối đơn
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 3: ĐỐI SOÁT LƯƠNG & DUYỆT RÚT XU NHUẬN BÚT (PAYOUT MANAGEMENT)
             ========================================================================= */}
          {activeTab === 'payouts' && (
            <div className="space-y-6">
              
              {/* Configuration Section: Revenue Sharing Rates */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-600" />
                    Cấu Hình Tỷ Lệ Chia Sẻ Doanh Thu Nhuận Bút
                  </h3>
                  {configSaved && (
                    <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <Check className="w-3.5 h-3.5" /> Đã lưu cấu hình tỷ lệ!
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveRoyaltyConfig} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tác Giả Sáng Tác:</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="50"
                        max="100"
                        value={authorRate}
                        onChange={(e) => setAuthorRate(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:border-pink-500 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Editor Không Độc Quyền:</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="50"
                        max="100"
                        value={editorRate}
                        onChange={(e) => setEditorRate(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:border-pink-500 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Editor Độc Quyền:</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="50"
                        max="100"
                        value={exclusiveRate}
                        onChange={(e) => setExclusiveRate(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:border-pink-500 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs transition"
                  >
                    Cập Nhật Tỷ Lệ
                  </button>
                </form>
              </div>

              {/* Moderation Payout Requests Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    Danh Sách Yêu Cầu Rút Xu Nhuận Bút (Đủ &gt;= 1000 Xu)
                  </h3>
                  <span className="text-xs text-pink-600 font-bold bg-pink-50 px-2.5 py-0.5 rounded-full border border-pink-200">
                    Quy chuẩn: 1 Xu = 1 VNĐ
                  </span>
                </div>

                {withdrawSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{withdrawSuccessMsg}</span>
                  </div>
                )}

                {(safeWithdrawalRequests?.length || 0) === 0 ? (
                  <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs text-slate-400 text-center">
                    Hiện chưa có yêu cầu rút tiền nào từ tác giả hoặc editor.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(safeWithdrawalRequests || []).map((req) => (
                      <div
                        key={req.id}
                        className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-pink-300 transition-all space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">
                                {req.authorName}
                              </span>
                              <span className="text-xs text-slate-500">
                                ({req.authorEmail})
                              </span>
                              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                                {req.code || ('WR' + (req.id ? req.id.replace(/\D/g, '').slice(-8).padStart(8, '0') : '85143792'))}
                              </span>
                              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                req.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : req.status === 'rejected'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {req.status === 'approved' ? '✓ Đã duyệt' : req.status === 'rejected' ? '✕ Từ chối' : '⏳ Chưa duyệt'}
                              </span>
                            </div>

                            <div className="text-xs text-slate-700 mt-1 flex items-center gap-4 flex-wrap">
                              <span>Số xu rút: <strong className="text-emerald-600 text-sm font-extrabold">{req.amountXu} Xu</strong></span>
                              <span>Số tiền VNĐ cần chuyển: <strong className="text-pink-600 text-sm font-extrabold">{req.amountVnd.toLocaleString('vi-VN')} VNĐ</strong></span>
                              <span>Số xu còn lại sau khi rút: <strong className="text-slate-900 font-bold">{req.remainingXu} Xu</strong></span>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500">
                            Thời gian: {new Date(req.createdAt).toLocaleString('vi-VN')}
                          </div>
                        </div>

                        {/* STK Details Box */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5">
                            <div className="text-slate-600">
                              Ngân hàng: <strong className="text-slate-900 font-bold">{req.bankName}</strong>
                            </div>
                            <div className="text-slate-600 flex items-center gap-2">
                              <span>Số tài khoản (STK): <strong className="text-emerald-700 font-mono text-sm font-black">{req.accountNumber}</strong></span>
                              <button
                                onClick={() => handleCopyStk(req.id, req.accountNumber)}
                                className="p-1 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer transition"
                                title="Sao chép STK"
                              >
                                {copiedStkId === req.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <div className="text-slate-600">
                              Chủ tài khoản: <strong className="text-slate-900 uppercase font-bold">{req.accountHolder}</strong>
                            </div>
                            {req.note && (
                              <div className="text-[11px] text-slate-500 italic">
                                Ghi chú: "{req.note}"
                              </div>
                            )}
                          </div>

                          {req.status === 'pending' && onApproveWithdrawal && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {confirmingWithdrawId === req.id ? (
                                <div className="flex items-center gap-2 p-1.5 bg-emerald-50 border border-emerald-200 rounded-xl animate-in fade-in duration-150">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await onApproveWithdrawal(req.id);
                                        setConfirmingWithdrawId(null);
                                        setWithdrawSuccessMsg(`✓ Đã duyệt và gửi thông báo thành công cho ${req.authorName}!`);
                                        setTimeout(() => setWithdrawSuccessMsg(null), 5000);
                                      } catch (e) {
                                        setConfirmingWithdrawId(null);
                                      }
                                    }}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition active:scale-95"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Xác Nhận ĐÃ CHUYỂN TIỀN</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingWithdrawId(null)}
                                    className="px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs cursor-pointer transition"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmingWithdrawId(req.id)}
                                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/25 cursor-pointer transition-all hover:scale-102 active:scale-98"
                                  title="Bấm Duyệt sau khi Admin đã chuyển tiền thành công"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Duyệt (Đã Chuyển Tiền)</span>
                                </button>
                              )}

                              {onRejectWithdrawal && (
                                <button
                                  type="button"
                                  onClick={() => onRejectWithdrawal(req.id)}
                                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 text-xs font-semibold cursor-pointer transition"
                                >
                                  Từ chối
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* =========================================================================
              TAB 4: BÁO CÁO VI PHẠM TÁC PHẨM (BẢN QUYỀN, 18+, REUP, BÔI NHỌ VN, KHÁC)
             ========================================================================= */}
          {activeTab === 'reports' && (
            <div className="space-y-5">
              {/* Strict Policy Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs shadow-xs">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="text-rose-950 uppercase font-bold tracking-wider block text-xs">
                      Quy chế xử lý vi phạm tác quyền &amp; nội dung Đạo Tâm:
                    </strong>
                    <p className="text-rose-800 leading-relaxed font-medium">
                      "Các tác giả, editor không được phép đăng truyện bản quyền, truyện 18+, không tự ý cố tình xóa chương đăng lại để hiện truyện lên trang. Ai vi phạm và có xác nhận từ web sẽ bị cấm vĩnh viễn, doanh thu tháng đó cũng sẽ mất. Các team lưu ý giúp mình."
                    </p>
                  </div>
                </div>
              </div>

              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 font-semibold">Lọc trạng thái:</span>
                  <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 text-xs shadow-2xs">
                    {(['pending', 'resolved', 'all'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setReportFilterStatus(st)}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          reportFilterStatus === st
                            ? 'bg-pink-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-pink-600'
                        }`}
                      >
                        {st === 'pending' ? 'Chờ xử lý' : st === 'resolved' ? 'Đã giải quyết' : 'Tất cả'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  Tổng cộng: <strong className="text-slate-800">{safeNovelReports?.length || 0}</strong> báo cáo ({pendingReportsCount} đang chờ xử lý)
                </div>
              </div>

              {/* Reports List */}
              {(safeNovelReports.filter((r) => {
                if (reportFilterStatus === 'all') return true;
                return r.status === reportFilterStatus;
              })?.length || 0) === 0 ? (
                <div className="p-10 rounded-2xl bg-white border border-slate-200 shadow-xs text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <h4 className="font-bold text-sm text-slate-900">Không Có Báo Cáo Vi Phạm Nào Cần Xử Lý</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Toàn bộ tác phẩm trên sàn hiện tại đều tuân thủ tốt chính sách bản quyền và chuẩn mực nội dung.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(safeNovelReports || [])
                    .filter((r) => {
                      if (reportFilterStatus === 'all') return true;
                      return r.status === reportFilterStatus;
                    })
                    .map((report) => {
                      const targetNovel = safeNovels.find((n) => n.id === report.novelId);
                      return (
                        <div
                          key={report.id}
                          className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-pink-300 transition-all space-y-3.5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="flex items-start gap-3.5">
                              {report.novelCover ? (
                                <img
                                  src={report.novelCover}
                                  alt={report.novelTitle}
                                  className="w-12 h-16 object-cover rounded-lg border border-slate-200 flex-shrink-0 shadow-xs"
                                />
                              ) : (
                                <div className="w-12 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                                  <BookOpen className="w-5 h-5" />
                                </div>
                              )}

                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                                    report.reason === 'Truyện bản quyền'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : report.reason === 'Truyện 18+'
                                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                                      : report.reason === 'Truyện reup'
                                      ? 'bg-orange-50 text-orange-800 border-orange-200'
                                      : report.reason === 'Truyện bôi nhọ Việt Nam'
                                      ? 'bg-red-50 text-red-800 border-red-200'
                                      : 'bg-pink-50 text-pink-700 border-pink-200'
                                  }`}>
                                    🚩 {report.reason}
                                  </span>

                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    report.status === 'pending'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}>
                                    {report.status === 'pending' ? 'Chờ thẩm định' : 'Đã giải quyết'}
                                  </span>

                                  {targetNovel?.isHidden && (
                                    <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 font-bold">
                                      Đã ẩn khỏi trang chủ
                                    </span>
                                  )}
                                </div>

                                <h4 className="font-bold text-sm sm:text-base text-slate-900">
                                  {report.novelTitle}
                                </h4>

                                <div className="text-xs text-slate-600 mt-0.5">
                                  Tác giả: <strong className="text-pink-600 font-bold">{report.author}</strong>
                                </div>
                              </div>
                            </div>

                            <div className="text-right text-[11px] text-slate-500">
                              <div>Người gửi: <strong className="text-slate-800 font-semibold">{report.reporterName || 'Độc giả'}</strong></div>
                              {report.reporterEmail && <div className="text-slate-400">{report.reporterEmail}</div>}
                              <div className="text-slate-400 mt-1">{new Date(report.createdAt).toLocaleString('vi-VN')}</div>
                            </div>
                          </div>

                          {/* Reason details */}
                          {report.details && (
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed font-sans">
                              <span className="text-slate-500 font-semibold block mb-0.5">Nội dung phản ánh từ người dùng:</span>
                              "{report.details}"
                            </div>
                          )}

                          {/* Admin Resolution Toolbar */}
                          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
                            <span className="text-[11px] text-slate-500 italic">
                              Hành động quản trị viên:
                            </span>

                            <div className="flex items-center gap-2 flex-wrap">
                              {/* 1. Toggle Hide Novel */}
                              {onToggleHideNovel && targetNovel && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onToggleHideNovel(report.novelId);
                                    if (onResolveReport) onResolveReport(report.id, 'hide_novel', report.novelId);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                                  title="Ẩn truyện khỏi độc giả để kiểm tra"
                                >
                                  {targetNovel.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                  <span>{targetNovel.isHidden ? 'Mở Lại Truyện' : 'Ẩn Truyện Ngay'}</span>
                                </button>
                              )}

                              {/* 2. Permanent Ban Author & Forfeit monthly revenue */}
                              {onResolveReport && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Xác nhận xử phạt vi phạm: Cấm vĩnh viễn tài khoản của "${report.author}", tịch thu toàn bộ doanh thu tháng này theo quy chế web?`)) {
                                      onResolveReport(report.id, 'ban_author', report.novelId);
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                                  title="Cấm tác giả vĩnh viễn & tịch thu toàn bộ doanh thu tháng đó"
                                >
                                  <UserX className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Cấm Vĩnh Viễn &amp; Hủy Nhuận Bút</span>
                                </button>
                              )}

                              {/* 3. Delete Novel Permanently */}
                              {onDeleteNovel && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn truyện "${report.novelTitle}" khỏi hệ thống không?`)) {
                                      onDeleteNovel(report.novelId);
                                      if (onResolveReport) onResolveReport(report.id, 'delete_novel', report.novelId);
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                                  title="Xóa truyện vi phạm vĩnh viễn"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                  <span>Xóa Truyện</span>
                                </button>
                              )}

                              {/* 4. Dismiss / Mark Resolved */}
                              {report.status === 'pending' && onResolveReport && (
                                <button
                                  type="button"
                                  onClick={() => onResolveReport(report.id, 'dismiss', report.novelId)}
                                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Đã Xác Minh / Bỏ Qua</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 5: QUẢN LÝ DANH SÁCH TRUYỆN (ẨN & XÓA)
             ========================================================================= */}
          {activeTab === 'novels' && (
            <div className="space-y-4 overflow-x-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs overflow-x-hidden">
                <div className="flex-1 min-w-0 sm:max-w-md relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={novelSearchQuery}
                    onChange={(e) => setNovelSearchQuery(e.target.value)}
                    placeholder="Tìm theo tên truyện, tác giả, editor..."
                    className="w-full min-h-[42px] bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-pink-500 focus:bg-white transition"
                  />
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {(['all', 'visible', 'hidden', 'short_stories', 'missing_male', 'missing_female'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setNovelStatusFilter(st)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                        novelStatusFilter === st
                          ? 'bg-pink-600 text-white shadow-xs font-bold'
                          : 'bg-slate-100 text-slate-600 hover:text-pink-600 border border-slate-200'
                      }`}
                    >
                      {st === 'all'
                        ? `Tất cả (${safeNovels?.length || 0})`
                        : st === 'visible'
                        ? `Đang hiện (${safeNovels.filter((n) => !n.isHidden)?.length || 0})`
                        : st === 'hidden'
                        ? `Đã ẩn (${safeNovels.filter((n) => n.isHidden)?.length || 0})`
                        : st === 'short_stories'
                        ? `Truyện Ngắn (${shortStoriesCount})`
                        : st === 'missing_male'
                        ? `Thiếu MP3 Nam Minh (${missingMaleNovelsCount})`
                        : `Thiếu MP3 Hằng Nga (${missingFemaleNovelsCount})`}
                    </button>
                  ))}
                  {onReloadNovels && (
                    <button
                      type="button"
                      disabled={isReloadingNovels}
                      onClick={async () => {
                        setIsReloadingNovels(true);
                        try {
                          await onReloadNovels();
                        } finally {
                          setIsReloadingNovels(false);
                        }
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                      title="Tải lại danh sách truyện từ hệ thống"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isReloadingNovels ? 'animate-spin' : ''}`} />
                      <span>Tải lại</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 overflow-x-hidden">
                {(filteredNovels || []).map((novel) => {
                  const { totalChapters, namMinhCount, hangNgaCount } = getNovelMp3Counts(novel);
                  const maleBadgeClass =
                    totalChapters > 0 && namMinhCount >= totalChapters
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : namMinhCount > 0
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : totalChapters > 0
                      ? 'bg-rose-50/70 text-rose-700 border-rose-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200';
                  const femaleBadgeClass =
                    totalChapters > 0 && hangNgaCount >= totalChapters
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : hangNgaCount > 0
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : totalChapters > 0
                      ? 'bg-rose-50/70 text-rose-700 border-rose-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200';

                  return (
                  <div
                    key={novel.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200 hover:border-pink-300 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3 transition-all overflow-x-hidden"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0 w-full md:flex-1">
                      <img
                        src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                        alt={novel.title}
                        className="w-12 h-16 object-cover rounded-xl border border-slate-200 flex-shrink-0 shadow-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm text-slate-900 line-clamp-2 md:truncate">
                          {novel.title}
                        </h4>
                        <div className="text-xs text-slate-500 mt-1 break-words">
                          Tác giả: <span className="text-pink-600 font-semibold">{novel.author}</span> • {totalChapters} chương • {(novel.views || 0).toLocaleString()} lượt xem
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 max-w-full">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border tabular-nums max-w-full ${maleBadgeClass}`}>
                            Nam Minh: {namMinhCount}/{totalChapters}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border tabular-nums max-w-full ${femaleBadgeClass}`}>
                            Hằng Nga: {hangNgaCount}/{totalChapters}
                          </span>
                          {novel.isShortStory && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-pink-50 text-pink-700 border-pink-200">
                              Truyện Ngắn
                            </span>
                          )}
                          {novel.isShortStory && novel.youtubeVideoId && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                novel.isYoutubeVipLocked
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              <Youtube className="w-3 h-3" />
                              {novel.isYoutubeVipLocked ? 'YouTube VIP' : 'YouTube FREE'}
                            </span>
                          )}
                          {novel.isShortStory && !novel.youtubeVideoId && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-100 text-slate-600 border-slate-200">
                              Chưa có YouTube
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap w-full md:w-auto md:justify-end pt-2 border-t border-slate-100 md:border-t-0 md:pt-0 shrink-0">
                      <button
                        type="button"
                        onClick={() => openYoutubeManager(novel)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                          novel.isShortStory
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title="Cài đặt link Audio/Video YouTube và khóa VIP cho Truyện Ngắn"
                      >
                        <Youtube className={`w-3.5 h-3.5 ${novel.isShortStory ? 'text-rose-600' : 'text-slate-500'}`} />
                        <span>YouTube</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMp3ManagingNovel(novel)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                        title="Quản lý và dán link MP3 cho từng chương (Nam Minh & Hằng Nga)"
                      >
                        <Headphones className="w-3.5 h-3.5 text-emerald-600" />
                        <span>MP3 Chương</span>
                      </button>

                      {onOpenEditNovel && (
                        <button
                          onClick={() => onOpenEditNovel(novel)}
                          className="px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-pink-600" />
                          <span>Sửa</span>
                        </button>
                      )}

                      {onToggleHideNovel && (
                        <button
                          onClick={() => onToggleHideNovel(novel.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                            novel.isHidden 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {novel.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          <span>{novel.isHidden ? 'Hiện truyện' : 'Ẩn truyện'}</span>
                        </button>
                      )}

                      {onDeleteNovel && (
                        <button
                          onClick={() => setConfirmDeleteNovel(novel)}
                          className="p-2 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer transition ml-auto md:ml-0"
                          title="Xóa truyện"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 6: ĐĂNG CHƯƠNG HÀNG LOẠT
             ========================================================================= */}
          {activeTab === 'batch' && (
            <div className="space-y-4">
              {batchSuccessMsg && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{batchSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleBatchPublish} className="space-y-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Chọn tác phẩm cần đăng thêm chương hàng loạt:
                  </label>
                  <select
                    value={selectedNovelId}
                    onChange={(e) => setSelectedNovelId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-pink-500 rounded-xl p-2.5 text-xs text-slate-900 cursor-pointer focus:bg-white focus:outline-none transition"
                  >
                    {(safeNovels || []).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title} (Hiện có: {n.chapters?.length || 0}/{n.totalChapters} chương)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Dán nội dung nhiều chương (Cấu trúc: === Chương [X]: Tiêu đề ===):
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Mẫu thử nhanh:</span>
                    <button
                      type="button"
                      onClick={() => handleQuickGenerateDemo(5)}
                      className="px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-[11px] font-bold cursor-pointer transition"
                    >
                      + 5 Chương mẫu
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickGenerateDemo(20)}
                      className="px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-[11px] font-bold cursor-pointer transition"
                    >
                      + 20 Chương mẫu
                    </button>
                  </div>
                </div>

                <textarea
                  value={batchRawText}
                  onChange={(e) => setBatchRawText(e.target.value)}
                  placeholder="Dán toàn bộ văn bản của hàng chục chương vào đây..."
                  rows={10}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-pink-500 rounded-xl p-3.5 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white transition"
                />

                <button
                  type="submit"
                  disabled={!batchRawText.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  Đăng Tự Động Toàn Bộ Chương (Áp Dụng Phân Quyền VIP Chuẩn)
                </button>
              </form>
            </div>
          )}

          {/* =========================================================================
              TAB 7: QUẢN LÝ BÌNH LUẬN (100% BÌNH LUẬN THẬT TỪ ĐỘC GIẢ)
             ========================================================================= */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              {/* Header Tab Bình Luận */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-pink-600" />
                      Kiểm Duyệt Bình Luận Độc Giả (100% Thật)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    Toàn bộ bình luận ảo đã được loại bỏ. Admin có quyền kiểm tra và xóa vĩnh viễn các bình luận vi phạm thuần phong mỹ tục, spam hoặc toxic.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-700 text-xs font-bold">
                    Tổng: {adminComments?.length || 0} bình luận thật
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoadingComments(true);
                      fetchAllCommentsForAdmin()
                        .then((list) => {
                          setAdminComments(Array.isArray(list) ? list : []);
                          setIsLoadingComments(false);
                        })
                        .catch(() => setIsLoadingComments(false));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
                  >
                    <span>Làm mới</span>
                  </button>
                </div>
              </div>

              {/* Ô tìm kiếm bình luận */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3">
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  type="text"
                  value={commentSearchQuery}
                  onChange={(e) => setCommentSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm theo nội dung bình luận, tên độc giả hoặc tên truyện..."
                  className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                />
                {commentSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCommentSearchQuery('')}
                    className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Danh sách bình luận */}
              {isLoadingComments ? (
                <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 space-y-2">
                  <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs">Đang tải danh sách bình luận thật từ máy chủ...</p>
                </div>
              ) : (
                (() => {
                  const filtered = (adminComments || []).filter((c) => {
                    if (!commentSearchQuery.trim()) return true;
                    const q = commentSearchQuery.toLowerCase();
                    return (
                      c.content?.toLowerCase().includes(q) ||
                      c.userName?.toLowerCase().includes(q) ||
                      c.novelTitle?.toLowerCase().includes(q)
                    );
                  });

                  if ((filtered?.length || 0) === 0) {
                    return (
                      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
                        <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
                        <h4 className="text-sm font-bold text-slate-700">Không tìm thấy bình luận nào</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          {commentSearchQuery
                            ? 'Không có bình luận nào khớp với từ khóa tìm kiếm.'
                            : 'Chưa có bình luận thật nào từ độc giả. Hệ thống cam kết không sử dụng bình luận ảo mạo danh.'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {(filtered || []).map((c) => (
                        <div
                          key={c.id}
                          className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition hover:border-pink-200"
                        >
                          <div className="flex items-start gap-3.5 min-w-0">
                            {/* Avatar */}
                            {c.userAvatar ? (
                              <img
                                src={c.userAvatar}
                                alt={c.userName}
                                className="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
                                {c.userName?.charAt(0).toUpperCase() || 'U'}
                              </div>
                            )}

                            {/* Thông tin bình luận */}
                            <div className="min-w-0 space-y-1.5 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">{c.userName}</span>
                                <span className="text-[11px] text-slate-400">
                                  {new Date(c.createdAt).toLocaleString('vi-VN')}
                                </span>
                                <span className="font-bold text-xs text-pink-700">
                                  [{c.novelTitle || 'Truyện Đạo Tâm'}]
                                </span>
                                {(typeof c.chapterNumber === 'number' || c.chapterId) && (
                                  <a
                                    href={`/truyen/${encodeURIComponent(c.novelId)}/chuong/${encodeURIComponent(c.chapterId || `chuong-${c.chapterNumber || 1}`)}#comments`}
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 text-[10.5px] font-bold border border-pink-200 transition cursor-pointer"
                                    title="Mở chương này và cuộn tới khu vực bình luận"
                                  >
                                    <BookOpen className="w-3 h-3 text-pink-600" />
                                    <span>Chương {c.chapterNumber || c.chapterId?.replace('chuong-', '') || 1}</span>
                                    <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-70" />
                                  </a>
                                )}
                              </div>

                              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line break-words bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                                {c.content}
                              </p>

                              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                                <span>❤️ {c.likes || 0} lượt thích</span>
                                <span>•</span>
                                <span className="font-mono text-[10px]">ID: {c.id}</span>
                              </div>
                            </div>
                          </div>

                          {/* Nút Xóa Bình Luận Vi Phạm Dành Cho Admin */}
                          <div className="flex items-center sm:self-center flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDeleteCommentByAdmin(c.id, c.userName)}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center gap-1.5 border border-rose-200 cursor-pointer transition active:scale-95"
                              title="Xóa vĩnh viễn bình luận này khỏi hệ thống"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Xóa Bình Luận</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 8: CÔNG CỤ NỘI BỘ (ẨN KHỎI KHÁCH VÀ ĐỘC GIẢ TRANG CHỦ)
             ========================================================================= */}
          {activeTab === 'tools' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-pink-50 border border-pink-200 text-xs text-pink-900 leading-relaxed shadow-xs">
                <strong className="text-pink-700">Khu vực công cụ kỹ thuật dành riêng cho Admin:</strong> Các chức năng này đã được ẩn hoàn toàn khỏi người dùng và độc giả bên ngoài để bảo vệ tính bảo mật và trải nghiệm gọn gàng cho trang web.
              </div>

              {/* Cấu hình tỷ lệ nhuận bút */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                      <Percent className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">
                        Cấu Hình Tỷ Lệ Nhuận Bút Tác Giả &amp; Editor
                      </h4>
                      <p className="text-xs text-slate-500">
                        Quy chuẩn hệ thống: Tác giả sáng tác 95% • Editor độc quyền 90% • Editor không độc quyền 70%
                      </p>
                    </div>
                  </div>
                  {configSaved && (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Đã lưu cấu hình
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Tác giả */}
                  <div className="p-4 rounded-xl bg-pink-50/50 border border-pink-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-900">Tác Giả Sáng Tác:</label>
                      <span className="text-xs font-black text-pink-600 bg-white px-2 py-0.5 rounded border border-pink-200">
                        {authorRate}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="98"
                      value={authorRate}
                      onChange={(e) => setAuthorRate(Number(e.target.value))}
                      className="w-full accent-pink-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Tác giả viết truyện chính chủ (mặc định 95%). Nền tảng giữ {100 - authorRate}%.
                    </p>
                  </div>

                  {/* Editor Độc Quyền */}
                  <div className="p-4 rounded-xl bg-sky-50/50 border border-sky-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-900">Editor Độc Quyền:</label>
                      <span className="text-xs font-black text-sky-600 bg-white px-2 py-0.5 rounded border border-sky-200">
                        {exclusiveRate}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={exclusiveRate}
                      onChange={(e) => setExclusiveRate(Number(e.target.value))}
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Editor phát hành độc quyền tại Đạo Tâm (mặc định 90%). Nền tảng giữ {100 - exclusiveRate}%.
                    </p>
                  </div>

                  {/* Editor Thường (Không độc quyền) */}
                  <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-900">Editor Không Độc Quyền:</label>
                      <span className="text-xs font-black text-indigo-600 bg-white px-2 py-0.5 rounded border border-indigo-200">
                        {editorRate}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="90"
                      value={editorRate}
                      onChange={(e) => setEditorRate(Number(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Editor đăng truyện không độc quyền (mặc định 70%). Nền tảng giữ {100 - editorRate}%.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onUpdateRoyaltyConfig) {
                        onUpdateRoyaltyConfig({
                          authorRate,
                          editorRate,
                          exclusiveRate,
                        });
                      }
                      setConfigSaved(true);
                      setTimeout(() => setConfigSaved(false), 3000);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-xs cursor-pointer transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Lưu Cấu Hình Tỷ Lệ Nhuận Bút
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center text-pink-600">
                    <FileCode2 className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">Kiến Trúc Máy Chủ &amp; API Bảo Mật</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Toàn bộ logic trừ Xu, kiểm tra quyền VIP, trả nội dung đã mã hóa và chia nhuận bút được chạy trên môi trường Server an toàn chống can thiệp.
                  </p>
                  {onOpenArchitecture && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenArchitecture();
                      }}
                      className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs cursor-pointer shadow-xs transition"
                    >
                      Xem Hồ Sơ Kiến Trúc Hệ Thống
                    </button>
                  )}
                </div>

                <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center text-pink-600">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">Âm Thanh MP3 Song Giọng &amp; DRM Bản Quyền</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Hỗ trợ liên kết MP3 trực tiếp theo 2 giọng đọc Nam Minh &amp; Hằng Nga kết hợp Giọng Máy mượt mà trên mọi thiết bị.
                  </p>
                  {onOpenArchitecture && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenArchitecture();
                      }}
                      className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs cursor-pointer shadow-xs transition"
                    >
                      Xem Ma Trận Bảo Mật DRM
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              9. QUẢN LÝ NGƯỜI DÙNG & KHÓA TÀI KHOẢN (PHÂN TRANG LIMIT 25 & STARTAFTER)
             ========================================================================= */}
          {activeTab === 'users' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Tiêu đề & Thanh công cụ */}
              {/* Tiêu đề & Thanh công cụ */}
              <div className="flex flex-col gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-pink-600" />
                      <h3 className="font-black text-lg text-slate-900 dark:text-slate-100">
                        Quản Lý Người Dùng &amp; Tài Khoản
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Kiểm soát phân quyền độc giả, tác giả, editor và áp dụng chế tài khóa vĩnh viễn với tài khoản vi phạm.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {/* Nút thống kê nổi bật từ getCountFromServer */}
                    <button
                      type="button"
                      onClick={() => setUserFilterCategory((prev) => (prev === 'banned' ? 'all' : 'banned'))}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 border ${
                        userFilterCategory === 'banned'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-600/30'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                      }`}
                      title="Bấm để lọc nhanh tất cả tài khoản bị khóa"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Tài khoản bị khóa: {totalLockedUsersCount}</span>
                    </button>

                    {/* Ô tìm kiếm trực tiếp trên máy chủ Firestore theo tiền tố Email (limit 20) */}
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tìm theo tiền tố Email (toàn DB, max 20)..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="pl-9 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500 min-w-[230px]"
                      />
                      {userSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setUserSearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Xóa tìm kiếm & về phân trang gốc"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleMergeDuplicateUsers}
                      disabled={isMergingUsers || isLoadingUsers}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                      title="Quét toàn bộ người dùng trùng email, gộp Xu & truyện vào tài khoản chính và khóa tài khoản phụ"
                    >
                      {isMergingUsers ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang gộp...</span>
                        </>
                      ) : (
                        <>
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>Đồng Bộ &amp; Gộp Tài Khoản</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (userSearchTerm.trim()) {
                          runServerUserSearch(userSearchTerm);
                        } else {
                          loadUsersPage(0, null);
                        }
                      }}
                      disabled={isLoadingUsers}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                      title="Làm mới danh sách"
                    >
                      {isLoadingUsers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Tải lại</span>}
                    </button>
                  </div>
                </div>

                {/* 1. BỘ LỌC PHÂN LOẠI NGƯỜI DÙNG (NGAY DƯỚI THANH TÌM KIẾM, HỖ TRỢ CUỘN NGANG TRÊN MOBILE) */}
                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1 scrollbar-none">
                  {[
                    { id: 'all', label: 'Tất cả' },
                    { id: 'admin', label: 'Admin' },
                    { id: 'author', label: 'Tác giả' },
                    { id: 'reader', label: 'Độc giả' },
                    { id: 'banned', label: 'Bị khóa' },
                  ].map((filterTab) => {
                    const isActive = userFilterCategory === filterTab.id;
                    const adminEmailsList = ['hoaamcac@gmail.com', 'meoyeutien22@gmail.com'];
                    const safeUsers = Array.isArray(usersList) ? usersList : [];
                    const badgeCount =
                      filterTab.id === 'all'
                        ? (safeUsers?.length || 0)
                        : filterTab.id === 'admin'
                        ? (safeUsers.filter((u) => adminEmailsList.some((adm) => adm.toLowerCase().trim() === u.email?.toLowerCase().trim()))?.length || 0)
                        : filterTab.id === 'author'
                        ? (safeUsers.filter((u) => u.role === 'author' || (u.role as string) === 'editor' || Boolean((u as any).isAuthor))?.length || 0)
                        : filterTab.id === 'reader'
                        ? (safeUsers.filter((u) => {
                            const isAdmin = adminEmailsList.some((adm) => adm.toLowerCase().trim() === u.email?.toLowerCase().trim());
                            const isAuthor = u.role === 'author' || (u.role as string) === 'editor' || Boolean((u as any).isAuthor);
                            return !isAdmin && !isAuthor;
                          })?.length || 0)
                        : Math.max(
                            totalLockedUsersCount,
                            safeUsers.filter((u) => Boolean(u.isBanned || u.isLocked || (u as any).status === 'Bị khóa' || (u as any).status === 'banned'))?.length || 0
                          );

                    return (
                      <button
                        key={filterTab.id}
                        type="button"
                        onClick={() => setUserFilterCategory(filterTab.id as any)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                          isActive
                            ? 'bg-pink-600 text-white font-extrabold shadow-sm shadow-pink-600/30'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
                        }`}
                      >
                        <span>{filterTab.label}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                            isActive
                              ? 'bg-white/25 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {badgeCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Thông báo tối ưu hóa Quota Spark */}
              <div className="p-3.5 rounded-2xl bg-pink-50/70 dark:bg-slate-800/80 border border-pink-200/60 dark:border-slate-700 text-xs text-pink-900 dark:text-pink-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-pink-600 flex-shrink-0" />
                  <span>
                    {isSearchingUsersServer ? (
                      <>
                        <strong>Tìm kiếm máy chủ (Theo Email):</strong> Đang truy vấn trực tiếp trên cơ sở dữ liệu (giới hạn tối đa <strong>20</strong> kết quả mỗi lượt).
                      </>
                    ) : (
                      <>
                        <strong>Tối ưu tốc độ tải:</strong> Hệ thống sử dụng phân trang theo từng đợt (25 tài khoản/trang), không tải toàn bộ cơ sở dữ liệu cùng lúc.
                      </>
                    )}
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-pink-200 dark:border-slate-700 text-pink-700 dark:text-pink-400">
                  {isSearchingUsersServer ? 'Tìm kiếm (Max 20)' : `Trang ${currentPageIndex + 1}`}
                </span>
              </div>

              {/* Banner cảnh báo lỗi màu vàng (BẮT BUỘC KHÔNG DÙNG MÀU ĐỎ) */}
              {userFeedbackMsg && (
                <div
                  className={`p-4 rounded-2xl shadow-sm text-xs font-semibold flex items-center justify-between gap-3 ${
                    userFeedbackMsg.type === 'warning_error'
                      ? 'bg-yellow-400 text-yellow-950 border-2 border-yellow-500 shadow-md font-bold'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {userFeedbackMsg.type === 'warning_error' ? (
                      <AlertTriangle className="w-5 h-5 text-yellow-950 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    )}
                    <span>{userFeedbackMsg.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUserFeedbackMsg(null)}
                    className="p-1 hover:bg-black/10 rounded-lg transition cursor-pointer text-xs font-bold"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Bảng Danh Sách Người Dùng (Desktop: Table, Mobile: Card) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
                {isLoadingUsers && (usersList?.length || 0) === 0 ? (
                  <div className="p-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-pink-600" />
                    <p className="text-xs font-medium">
                      {isSearchingUsersServer
                        ? 'Đang tìm kiếm người dùng trên hệ thống...'
                        : 'Đang tải danh sách người dùng từ hệ thống...'}
                    </p>
                  </div>
                ) : (usersList?.length || 0) === 0 ? (
                  <div className="p-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
                    <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {isSearchingUsersServer
                        ? 'Không tìm thấy tài khoản nào có email bắt đầu bằng từ khóa này'
                        : 'Chưa có người dùng nào trong cơ sở dữ liệu'}
                    </p>
                    <p className="text-xs">
                      {isSearchingUsersServer
                        ? 'Hãy kiểm tra lại tiền tố email (chữ thường) hoặc xóa ô tìm kiếm để quay lại danh sách phân trang.'
                        : 'Khi có thành viên đăng ký hoặc đăng nhập, thông tin sẽ tự động đồng bộ vào đây.'}
                    </p>
                  </div>
                ) : (() => {
                  const adminEmailsList = ['hoaamcac@gmail.com', 'meoyeutien22@gmail.com'];
                  const filteredUsersList = (usersList || []).filter((u) => {
                    // 1. Khi không ở chế độ tìm kiếm server-side, chỉ lọc theo danh mục (Admin/Author/Reader/Banned)
                    // Nếu đang ở chế độ server-side search, Firestore đã lọc theo tiền tố email rồi.

                    // 2. Logic Lọc:
                    // Admin: Chỉ hiển thị user có email là hoaamcac@gmail.com hoặc meoyeutien22@gmail.com
                    const isAdmin = Boolean(u.email && adminEmailsList.some((adm) => adm.toLowerCase().trim() === u.email?.toLowerCase().trim()));
                    // Tác giả: Hiển thị user có role là tác giả/editor (hoặc dựa trên cờ isAuthor)
                    const isAuthor = u.role === 'author' || (u.role as string) === 'editor' || Boolean((u as any).isAuthor);
                    // Độc giả: Hiển thị user có role là độc giả (người dùng bình thường)
                    const isReader = !isAdmin && !isAuthor;
                    // Bị khóa: Hiển thị các user có trạng thái isBanned == true (hoặc status là 'Bị khóa')
                    const isBanned = Boolean(u.isBanned === true || (u as any).status === 'Bị khóa' || (u as any).status === 'banned');

                    if (userFilterCategory === 'admin') return isAdmin;
                    if (userFilterCategory === 'author') return isAuthor;
                    if (userFilterCategory === 'reader') return isReader;
                    if (userFilterCategory === 'banned') return isBanned;
                    return true;
                  });

                  if ((filteredUsersList?.length || 0) === 0) {
                    return (
                      <div className="p-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
                        <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy người dùng nào phù hợp</p>
                        <p className="text-xs">Thử chuyển sang bộ lọc &quot;Tất cả&quot; hoặc xóa bớt ký tự tìm kiếm.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="w-full overflow-x-auto whitespace-nowrap">
                      <table className="w-full min-w-[780px] text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <th className="py-3 px-4">Thành Viên</th>
                            <th className="py-3 px-4">Email Liên Hệ</th>
                            <th className="py-3 px-4 text-center">Chức Danh (Role)</th>
                            <th className="py-3 px-4 text-center">Trạng Thái</th>
                            <th className="py-3 px-4 text-right">Số Xu</th>
                            <th className="py-3 px-4 text-right">Thao Tác Quản Trị</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                          {(filteredUsersList || []).map((targetUser) => {
                            const isBanned = Boolean(targetUser.isBanned || (targetUser as any).status === 'Bị khóa' || (targetUser as any).status === 'banned');
                            const isProcessing = processingBanUid === targetUser.id;
                            const isSelf = targetUser.id === user.id;

                            const isAdminRole = Boolean(targetUser.email && adminEmailsList.some((adm) => adm.toLowerCase().trim() === targetUser.email?.toLowerCase().trim()));
                            const roleText = 
                              isAdminRole || targetUser.role === 'admin'
                                ? 'Admin'
                                : targetUser.role === 'author'
                                ? 'Tác giả'
                                : (targetUser.role as string) === 'editor'
                                ? 'Tác giả - Editor'
                                : 'Độc giả';

                            const roleBadgeClass =
                              roleText === 'Admin'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200 dark:border-purple-700'
                                : targetUser.role === 'author'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-700'
                                : (targetUser.role as string) === 'editor'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                                : 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-400/40 badge-reader-yellow font-extrabold';

                            return (
                              <tr 
                                key={targetUser.id} 
                                className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                                  isBanned ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                                }`}
                              >
                                {/* Cột 1: Avatar bo tròn + Bút danh */}
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    <img
                                      src={targetUser.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${targetUser.id}`}
                                      alt={targetUser.displayName || 'Avatar'}
                                      className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0 bg-slate-100 dark:bg-slate-800"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${targetUser.id}`;
                                      }}
                                    />
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                        <span>{targetUser.displayName || 'Chưa đặt bút danh'}</span>
                                        {isSelf && (
                                          <span className="text-[10px] bg-pink-100 text-pink-700 dark:bg-pink-900/60 dark:text-pink-300 px-1.5 py-0.2 rounded font-extrabold">
                                            Bạn
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-400 font-mono">
                                        UID: {targetUser.id.slice(0, 12)}...
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Cột 2: Email */}
                                <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                                  {targetUser.email || 'Không có email'}
                                </td>

                                {/* Cột 3: Role Badge */}
                                <td className="py-3 px-4 text-center">
                                  <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${roleBadgeClass}`}>
                                    {roleText}
                                  </span>
                                </td>

                                {/* Cột 4: Status Badge */}
                                <td className="py-3 px-4 text-center">
                                  {isBanned ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                      <Lock className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                      <span>Bị khóa</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                      <span>Hoạt động</span>
                                    </span>
                                  )}
                                </td>

                                {/* Cột 5: Số Xu hiện tại (đọc 100% từ xuBalance Firestore, fallback 0) */}
                                <td className="py-3 px-4 text-right">
                                  <span className="inline-flex items-center justify-end gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/70 font-black tabular-nums">
                                    <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span>{(targetUser.xuBalance ?? 0).toLocaleString('vi-VN')} Xu</span>
                                  </span>
                                </td>

                                {/* Cột 6: Thao tác quản trị (Tặng Xu + Cấp Quyền Truyện + Khóa vĩnh viễn / Mở khóa) */}
                                <td className="py-3 px-4 text-right">
                                  <div className="inline-flex items-center justify-end gap-2 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDonateModal(targetUser)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs shadow-emerald-500/20 transition cursor-pointer"
                                      title="Tặng Xu trực tiếp cho thành viên này"
                                    >
                                      <Gift className="w-3.5 h-3.5 shrink-0" />
                                      <span>Tặng Xu</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenGrantStoryModal(targetUser)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs shadow-indigo-500/20 transition cursor-pointer"
                                      title="Cấp quyền đọc truyện / chương đền bù (không trừ/cộng Xu)"
                                    >
                                      <KeyRound className="w-3.5 h-3.5 shrink-0" />
                                      <span>Cấp Quyền Truyện</span>
                                    </button>

                                    {isSelf ? (
                                      <span className="text-[11px] text-slate-400 italic px-1">Tài khoản bạn</span>
                                    ) : isBanned ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleBanUser(targetUser)}
                                        disabled={isProcessing}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                                        title="Khôi phục quyền đăng nhập & đăng truyện"
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <ShieldCheck className="w-3.5 h-3.5" />
                                        )}
                                        <span>Mở khóa</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleBanUser(targetUser)}
                                        disabled={isProcessing}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white dark:bg-rose-950/40 dark:hover:bg-rose-700 dark:text-rose-300 dark:hover:text-white border border-rose-200 dark:border-rose-800 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                                        title="Chặn hoàn toàn quyền đăng truyện và đánh dấu tài khoản vi phạm"
                                      >
                                        {isProcessing ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <UserX className="w-3.5 h-3.5" />
                                        )}
                                        <span>Khóa vĩnh viễn</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Thanh phân trang tối ưu Quota Spark (limit 25 & startAfter) */}
                <div className="bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {isSearchingUsersServer ? (
                      <>
                        Tìm thấy <strong>{usersList?.length || 0}</strong> kết quả trên máy chủ (giới hạn tối đa 20)
                      </>
                    ) : (
                      <>
                        Hiển thị <strong>{usersList?.length || 0}</strong> người dùng trên trang hiện tại
                      </>
                    )}
                  </div>

                  {isSearchingUsersServer ? (
                    <button
                      type="button"
                      onClick={() => setUserSearchTerm('')}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Xóa tìm kiếm &amp; về phân trang gốc</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePrevUserPage}
                        disabled={currentPageIndex === 0 || isLoadingUsers}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Trang trước</span>
                      </button>

                      <span className="text-xs font-bold px-3 py-1 rounded-xl bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300">
                        Trang {currentPageIndex + 1}
                      </span>

                      <button
                        type="button"
                        onClick={handleNextUserPage}
                        disabled={!hasMoreUsers || isLoadingUsers}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>Trang tiếp</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 11. TAB LIVE CHAT HỖ TRỢ ĐỘC GIả (REALTIME FIRESTORE) */}
          {activeTab === 'support_chat' && (
            <div className="h-[750px] bg-white dark:bg-slate-900 rounded-2xl border border-pink-200 dark:border-pink-900/60 overflow-hidden shadow-sm flex flex-col">
              <AdminSupportChat currentUser={user} />
            </div>
          )}

          {/* 12. TAB THÔNG BÁO TOÀN TRANG (GLOBAL BANNER - CHỈ ADMIN ĐƯỢC CẤP PHÉP) */}
          {activeTab === 'global_banner' && (
            <div className="max-w-3xl space-y-5">
              {!isAuthorizedGlobalBannerAdmin ? (
                <div className="p-6 rounded-2xl bg-yellow-50 border border-amber-300 text-amber-950 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 font-black text-sm">
                    <Lock className="w-5 h-5 text-amber-700 shrink-0" />
                    <span>Quyền Truy Cập Bị Từ Chối</span>
                  </div>
                  <p className="text-xs leading-relaxed">
                    Chức năng <strong>12. Thông Báo Toàn Trang</strong> chỉ cho phép tài khoản đăng nhập bằng email <strong>hoaamcac@gmail.com</strong> hoặc <strong>meoyeutien22@gmail.com</strong> truy cập và thao tác.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSaveGlobalBanner} className="bg-white rounded-2xl border border-pink-100 shadow-xs p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-yellow-100 border border-yellow-300 flex items-center justify-center text-amber-900 shrink-0">
                        <Megaphone className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-black text-slate-900">
                          12. Thông Báo Toàn Trang (GlobalBanner)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Lưu duy nhất tại document <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">settings/global_banner</code> • Tối ưu 1 Write / lần lưu
                        </p>
                      </div>
                    </div>

                    {/* Nút Toggle Bật / Tắt */}
                    <button
                      type="button"
                      onClick={() => setBannerIsActive((prev) => !prev)}
                      role="switch"
                      aria-checked={bannerIsActive}
                      className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition cursor-pointer self-start sm:self-auto ${
                        bannerIsActive
                          ? 'bg-yellow-100 border-yellow-400 text-amber-950 shadow-2xs'
                          : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                          bannerIsActive ? 'bg-amber-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            bannerIsActive ? 'translate-x-4.5' : 'translate-x-1'
                          }`}
                        />
                      </span>
                      <span>{bannerIsActive ? 'Đang BẬT hiển thị' : 'Đang TẮT (Ẩn hoàn toàn)'}</span>
                    </button>
                  </div>

                  {bannerFeedback && (
                    <div
                      className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                        bannerFeedback.type === 'success'
                          ? 'bg-pink-50 border-pink-200 text-pink-800'
                          : 'bg-yellow-50 border-amber-300 text-amber-950'
                      }`}
                    >
                      {bannerFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-pink-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      )}
                      <span>{bannerFeedback.text}</span>
                    </div>
                  )}

                  {isLoadingBanner ? (
                    <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin text-pink-600" />
                      <span>Đang tải cấu hình Thông Báo Toàn Trang...</span>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="global-banner-textarea" className="text-xs font-bold text-slate-700">
                            Nội dung thông báo hiển thị ngay trên Thanh Tìm Kiếm Trang Chủ:
                          </label>
                          <span className="text-[11px] font-medium text-slate-400">
                            {bannerMessage?.length || 0}/2000 ký tự
                          </span>
                        </div>
                        <textarea
                          id="global-banner-textarea"
                          rows={4}
                          maxLength={2000}
                          value={bannerMessage}
                          onChange={(e) => setBannerMessage(e.target.value)}
                          placeholder="Ví dụ: Bảo trì hệ thống audio từ 02:00 - 02:30 sáng. Chúc quý độc giả đọc truyện vui vẻ tại Đạo Tâm!"
                          className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-pink-500 focus:outline-none transition leading-relaxed"
                        />
                      </div>

                      {/* Xem trước giao diện nền vàng trên Trang Chủ */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          Xem trước hiển thị thực tế trên Trang Chủ:
                        </span>
                        {bannerIsActive && bannerMessage.trim() ? (
                          <div className="w-full rounded-2xl bg-gradient-to-r from-yellow-100 via-amber-100 to-yellow-100 border border-yellow-400/90 px-3.5 py-2.5 sm:px-5 sm:py-3.5 shadow-2xs">
                            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-yellow-400 text-amber-950 flex items-center justify-center shrink-0">
                                <Megaphone className="w-4 h-4" />
                              </div>
                              <p className="text-xs sm:text-sm font-bold text-amber-950 leading-relaxed whitespace-pre-line break-words">
                                {bannerMessage.trim()}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500">
                            Banner đang ở trạng thái <strong>ẩn hoàn toàn</strong> (return null) do Toggle đang tắt hoặc chưa có nội dung.
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-500">
                          {bannerUpdatedAt
                            ? `Cập nhật lần cuối: ${new Date(bannerUpdatedAt).toLocaleString('vi-VN')}`
                            : 'Chưa có mốc cập nhật trước đó'}
                        </div>

                        <button
                          type="submit"
                          disabled={isSavingBanner}
                          className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 transition"
                        >
                          {isSavingBanner ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Đang lưu...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Lưu Thông Báo Toàn Trang</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}
            </div>
          )}

          </div>
        </main>

      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteNovel && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-rose-200 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="font-bold text-base text-rose-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              Xác Nhận Xóa Truyện
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed">
              Bạn có chắc chắn muốn xóa tác phẩm <strong>"{confirmDeleteNovel.title}"</strong> không? Hành động này không thể hoàn tác.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteNovel(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (onDeleteNovel) onDeleteNovel(confirmDeleteNovel.id);
                  setConfirmDeleteNovel(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition"
              >
                Xóa Vĩnh Viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANG THẨM ĐỊNH BẢN THẢO CHUYÊN BIỆT (FULL-SCREEN DEDICATED PAGE THAY VÌ POPUP) */}
      {previewSubmission && (
        <div className="fixed inset-0 z-70 bg-white flex flex-col overflow-hidden animate-in fade-in duration-150">
          {/* 1. Header Trang Thẩm Định: Nền trắng, viền mỏng, chữ đen, điểm nhấn hồng */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 shadow-2xs z-10 flex-shrink-0">
            {/* Nút quay lại & Tiêu đề bản thảo */}
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={() => setPreviewSubmission(null)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-bold transition cursor-pointer flex-shrink-0"
                title="Quay lại danh sách thẩm định"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Quay lại danh sách</span>
              </button>

              <div className="h-6 w-px bg-slate-200 hidden sm:block flex-shrink-0" />

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-700 text-[11px] font-extrabold uppercase tracking-wide">
                    Thẩm Định Bản Thảo
                  </span>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 truncate">
                    {previewSubmission.title}
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 truncate">
                  <span>Tác giả: <strong className="text-pink-600 font-bold">{previewSubmission.author || 'Chưa cập nhật'}</strong></span>
                  <span>•</span>
                  <span>Người gửi: <strong className="text-slate-700 font-medium">{previewSubmission.submittedBy?.userName || previewSubmission.submittedBy?.userEmail || 'Thành viên'}</strong></span>
                  <span>•</span>
                  <span>Nhuận bút: <strong className="text-emerald-600 font-bold">{previewSubmission.royaltyRate || 95}%</strong></span>
                </div>
              </div>
            </div>

            {/* Các nút hành động duyệt / từ chối */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {previewSubmission.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      onRejectNovelSubmission(previewSubmission.id);
                      setPreviewSubmission(null);
                    }}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Từ Chối</span>
                  </button>

                  <button
                    onClick={() => {
                      onApproveNovelSubmission(previewSubmission.id);
                      setPreviewSubmission(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Duyệt Bản Thảo Này</span>
                  </button>
                </>
              )}

              <button
                onClick={() => setPreviewSubmission(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Đóng trang"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 2. Thanh Danh Sách Chương: Rộng rãi, đệm lề trên dưới đầy đủ để KHÔNG BỊ CẮT XÉN */}
          <div className="bg-pink-50/70 border-b border-pink-100 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 flex-shrink-0">
            {/* Cụm các nút chương 1, chương 2, chương 3... RÕ RÀNG, ĐẸP MẮT */}
            <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-1 scroll-smooth no-scrollbar flex-1">
              <span className="text-xs font-bold text-slate-600 whitespace-nowrap flex items-center gap-1 mr-1">
                <BookOpen className="w-3.5 h-3.5 text-pink-600" />
                <span>Các chương thẩm định:</span>
              </span>
              {(previewSubmission.chapters || []).map((ch: any, idx: number) => {
                const isSelected = previewChapterIndex === idx;
                const wordCount = ch.wordCount || (ch.content?.split(/\s+/).filter(Boolean)?.length || 0);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPreviewChapterIndex(idx)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all flex items-center gap-2 flex-shrink-0 shadow-2xs ${
                      isSelected
                        ? 'bg-pink-600 text-white shadow-md shadow-pink-500/25 ring-2 ring-pink-400'
                        : 'bg-white text-slate-700 hover:bg-pink-100/70 hover:text-pink-700 border border-slate-200'
                    }`}
                  >
                    <span>Chương {ch.number}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                      isSelected ? 'bg-pink-700/70 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {wordCount} từ
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Điều hướng nhanh chương trước / chương sau */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                disabled={previewChapterIndex === 0}
                onClick={() => setPreviewChapterIndex((prev) => Math.max(0, prev - 1))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-pink-50 text-slate-700 hover:text-pink-600 text-xs font-bold disabled:opacity-30 disabled:pointer-events-none transition flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden md:inline">Chương trước</span>
              </button>
              <button
                type="button"
                disabled={previewChapterIndex >= (previewSubmission.chapters?.length || 1) - 1}
                onClick={() => setPreviewChapterIndex((prev) => Math.min((previewSubmission.chapters?.length || 1) - 1, prev + 1))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-pink-50 text-slate-700 hover:text-pink-600 text-xs font-bold disabled:opacity-30 disabled:pointer-events-none transition flex items-center gap-1 cursor-pointer"
              >
                <span className="hidden md:inline">Chương sau</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 3. Nội Dung Trang Đọc Thẩm Định: Nền trắng, chữ đen, điểm xuyết hồng */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/70">
            <div className="max-w-4xl mx-auto bg-white rounded-3xl p-6 sm:p-12 border border-slate-200 shadow-sm space-y-6">
              
              {/* Thẻ thông tin tác phẩm */}
              <div className="p-4 sm:p-5 rounded-2xl bg-pink-50/50 border border-pink-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pink-100/80 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      Tác Phẩm: <span className="text-pink-600 font-extrabold">{previewSubmission.title}</span>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-700">
                      Tác giả: <strong className="text-pink-600 font-bold">{previewSubmission.author || 'Chưa cập nhật'}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-lg bg-pink-100 text-pink-700 text-[11px] font-bold">
                      {previewSubmission.mainCategory === 'truyen-nam' ? 'Truyện Nam' : previewSubmission.mainCategory === 'truyen-nu' ? 'Truyện Nữ' : 'Đam Mỹ'}
                    </span>
                    {(previewSubmission.categories || []).map((cat, idx) => (
                      <span key={idx} className="px-2.5 py-0.5 rounded-lg bg-white border border-pink-200 text-pink-800 text-[11px] font-medium">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
                  <strong className="text-pink-600 font-bold">Tóm tắt (Văn án): </strong>
                  {previewSubmission.description}
                </p>
              </div>

              {/* Tiêu đề chương đang xem */}
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1 font-sans">
                  <span>Chương {previewChapterIndex + 1} / {previewSubmission.chapters?.length || 1}</span>
                  <span className="text-pink-600 font-semibold">
                    ~{previewSubmission.chapters?.[previewChapterIndex]?.wordCount || previewSubmission.chapters?.[previewChapterIndex]?.content?.split(/\s+/).filter(Boolean)?.length || 0} từ
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-serif font-black text-pink-600 font-sans">
                  {previewSubmission.chapters?.[previewChapterIndex]?.title || `Chương ${previewChapterIndex + 1}`}
                </h3>
              </div>

              {/* Nội dung chương bản thảo - Nền trắng, chữ đen, font chữ trang nhã */}
              <div className="font-serif text-slate-900 text-base sm:text-lg leading-relaxed sm:leading-loose whitespace-pre-line tracking-wide select-text py-2">
                {previewSubmission.chapters?.[previewChapterIndex]?.content || 'Chưa có nội dung cho chương này.'}
              </div>

              {/* Phân trang dưới cuối bài đọc */}
              <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  disabled={previewChapterIndex === 0}
                  onClick={() => {
                    setPreviewChapterIndex((prev) => Math.max(0, prev - 1));
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold disabled:opacity-30 disabled:pointer-events-none transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Chương trước</span>
                </button>

                <div className="text-xs text-slate-400 font-sans">
                  Đang xem chương {previewChapterIndex + 1} / {previewSubmission.chapters?.length || 1}
                </div>

                <button
                  type="button"
                  disabled={previewChapterIndex >= (previewSubmission.chapters?.length || 1) - 1}
                  onClick={() => {
                    setPreviewChapterIndex((prev) => Math.min((previewSubmission.chapters?.length || 1) - 1, prev + 1));
                  }}
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold disabled:opacity-30 disabled:pointer-events-none transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>Chương tiếp theo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>

          {/* 4. Thanh tác vụ cố định dưới đáy */}
          <div className="bg-white border-t border-slate-200 px-4 sm:px-8 py-3 flex items-center justify-between gap-4 shadow-lg z-10 flex-shrink-0">
            <button
              onClick={() => setPreviewSubmission(null)}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Đóng trang thẩm định</span>
            </button>

            <div className="flex items-center gap-2">
              {previewSubmission.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      onRejectNovelSubmission(previewSubmission.id);
                      setPreviewSubmission(null);
                    }}
                    className="px-4 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Từ Chối Bản Thảo</span>
                  </button>

                  <button
                    onClick={() => {
                      onApproveNovelSubmission(previewSubmission.id);
                      setPreviewSubmission(null);
                    }}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Duyệt Bản Thảo Này</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL ĐỐI SOÁT BILL CHUYỂN KHOẢN NGÂN HÀNG (DÀNH CHO ADMIN)
         ========================================================================= */}
      {inspectingBillRequest && (
        <div 
          className="fixed inset-0 z-80 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onClick={() => setInspectingBillRequest(null)}
        >
          <div 
            className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[94vh] flex flex-col md:flex-row animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cột trái: Hình ảnh bill chuyển khoản phóng to */}
            <div className="flex-1 bg-slate-950 p-4 sm:p-6 flex flex-col items-center justify-center relative min-h-[350px] md:min-h-[500px] overflow-auto">
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1 rounded-full border border-white/20 flex items-center gap-1.5 z-10">
                <Camera className="w-3.5 h-3.5 text-pink-400" />
                <span>Ảnh Biên Lai Gốc</span>
              </div>

              {inspectingBillRequest.billImageUrl ? (
                <img
                  src={inspectingBillRequest.billImageUrl}
                  alt={`Biên lai của ${inspectingBillRequest.userName}`}
                  className="max-h-[75vh] w-auto max-w-full object-contain rounded-xl shadow-2xl border border-slate-800 transition-transform duration-200 hover:scale-102"
                />
              ) : (
                <div className="text-center text-slate-400 p-8 space-y-2">
                  <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
                  <p className="text-sm font-bold text-white">Độc giả chưa gửi ảnh biên lai</p>
                  <p className="text-xs text-slate-400">Vui lòng đối soát trực tiếp sao kê app MB Bank theo mã GD.</p>
                </div>
              )}
            </div>

            {/* Cột phải: Bảng thông tin đối soát chi tiết & Nút duyệt */}
            <div className="w-full md:w-96 p-6 sm:p-7 bg-white flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-200 overflow-y-auto space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center text-pink-600">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                        Đối Soát Biên Lai
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Kiểm tra trước khi cộng Xu
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setInspectingBillRequest(null)}
                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition cursor-pointer"
                    title="Đóng cửa sổ"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Trạng thái:</span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    inspectingBillRequest.status === 'approved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : inspectingBillRequest.status === 'rejected'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : inspectingBillRequest.status === 'cancelled'
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {inspectingBillRequest.status === 'approved' ? '✓ Đã duyệt thành công' : inspectingBillRequest.status === 'rejected' ? '✕ Đã từ chối' : inspectingBillRequest.status === 'cancelled' ? 'Đã hủy' : '⏳ Chờ Admin duyệt'}
                  </span>
                </div>

                {/* Thông tin đối chiếu */}
                <div className="p-4 rounded-2xl bg-pink-50/50 border border-pink-200 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Mã GD chuyển khoản:</span>
                    <div className="flex items-center gap-1.5">
                      <strong className="font-mono text-pink-700 bg-white border border-pink-200 px-2 py-0.5 rounded font-black">
                        {inspectingBillRequest.transferCode}
                      </strong>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(inspectingBillRequest.transferCode);
                          setCopiedCodeInModal(true);
                          setTimeout(() => setCopiedCodeInModal(false), 2000);
                        }}
                        className="p-1 rounded bg-white hover:bg-pink-100 text-pink-700 border border-pink-200 cursor-pointer transition"
                        title="Sao chép mã GD"
                      >
                        {copiedCodeInModal ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Số tiền nạp:</span>
                    <strong className="text-emerald-700 font-extrabold text-sm">
                      {inspectingBillRequest.amountVnd.toLocaleString('vi-VN')} đ
                    </strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Xu được cộng:</span>
                    <strong className="text-pink-600 font-black text-sm">
                      +{inspectingBillRequest.xuAmount.toLocaleString('vi-VN')} Xu
                    </strong>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-pink-200/60">
                    <span className="text-slate-600 font-medium">Người nạp:</span>
                    <span className="font-bold text-slate-900 truncate max-w-[170px]" title={inspectingBillRequest.userName}>
                      {inspectingBillRequest.userName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Email:</span>
                    <span className="font-medium text-slate-600 truncate max-w-[170px]" title={inspectingBillRequest.userEmail}>
                      {inspectingBillRequest.userEmail}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Thời gian:</span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(inspectingBillRequest.createdAt).toLocaleString('vi-VN')}
                    </span>
                  </div>
                </div>

                {/* Hướng dẫn kiểm tra */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <span>💡</span>
                    <span>Quy trình đối soát chuẩn:</span>
                  </div>
                  <p>1. So khớp <strong>Mã GD {inspectingBillRequest.transferCode}</strong> và <strong>Số tiền {inspectingBillRequest.amountVnd.toLocaleString('vi-VN')}đ</strong> trên ảnh bill.</p>
                  <p>2. Đảm bảo tiền đã nổi trên app MB Bank (STK 0703765892).</p>
                  <p>3. Bấm nút <strong>"Duyệt &amp; Cộng Xu"</strong> để hệ thống tự động cộng Xu vào ví độc giả ngay lập tức.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4 border-t border-slate-100">
                {inspectingBillRequest.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = inspectingBillRequest.id;
                        setInspectingBillRequest(null);
                        handleApprove(targetId);
                      }}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition active:scale-98"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Duyệt &amp; Cộng +{inspectingBillRequest.xuAmount} Xu Ngay</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onRejectRequest(inspectingBillRequest.id);
                        setInspectingBillRequest(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold text-xs border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Từ Chối Đơn Nạp Này</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setInspectingBillRequest(null)}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 cursor-pointer transition"
                >
                  Đóng Cửa Sổ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tặng Xu (Donate Coins) dành cho Quản trị viên */}
      {donateTargetUser && (
        <div
          className="fixed inset-0 z-[10002] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            if (!isDonatingCoins) setDonateTargetUser(null);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-900/70 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 shrink-0" />
                <h3 className="font-black text-sm">Tặng Xu Cho Thành Viên</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isDonatingCoins) setDonateTargetUser(null);
                }}
                disabled={isDonatingCoins}
                className="p-1 rounded-lg hover:bg-white/20 text-white transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDonateCoins} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                    {donateTargetUser.displayName || 'Chưa đặt bút danh'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {donateTargetUser.email || donateTargetUser.id}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Hiện có</span>
                  <span className="text-xs font-black text-amber-600 dark:text-amber-400 tabular-nums">
                    {(donateTargetUser.xuBalance || 0).toLocaleString('vi-VN')} Xu
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Số lượng Xu muốn tặng
                </label>
                <div className="relative">
                  <Coins className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={donateAmountInput}
                    onChange={(e) => setDonateAmountInput(e.target.value)}
                    placeholder="Nhập số lượng Xu (VD: 500)"
                    disabled={isDonatingCoins}
                    className="w-full pl-9 pr-12 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400">
                    Xu
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[100, 500, 1000, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={isDonatingCoins}
                      onClick={() => setDonateAmountInput(String(preset))}
                      className={`py-1.5 rounded-lg text-[11px] font-extrabold border transition cursor-pointer ${
                        donateAmountInput === String(preset)
                          ? 'bg-emerald-500 text-white border-emerald-600'
                          : 'bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      +{preset.toLocaleString('vi-VN')}
                    </button>
                  ))}
                </div>
              </div>

              {donateModalError && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold">
                  {donateModalError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDonatingCoins}
                  onClick={() => setDonateTargetUser(null)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isDonatingCoins}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-md shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {isDonatingCoins ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang tặng...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác nhận tặng</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cấp Quyền Truyện (Đền bù) dành cho Quản trị viên - KHÔNG đụng chạm xuBalance */}
      {grantTargetUser && (
        <div
          className="fixed inset-0 z-[10002] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            if (!isGrantingStory) setGrantTargetUser(null);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/70 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 shrink-0" />
                <h3 className="font-black text-sm">Cấp Quyền Truyện / Chương (Đền Bù)</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isGrantingStory) setGrantTargetUser(null);
                }}
                disabled={isGrantingStory}
                className="p-1 rounded-lg hover:bg-white/20 text-white transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmGrantStory} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                    {grantTargetUser.displayName || 'Chưa đặt bút danh'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {grantTargetUser.email || grantTargetUser.id}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                  Giữ nguyên Xu
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ID Truyện (bắt buộc nếu cấp trọn bộ hoặc theo bộ truyện)
                </label>
                <input
                  type="text"
                  list="admin-grant-novel-ids"
                  value={grantNovelIdInput}
                  onChange={(e) => setGrantNovelIdInput(e.target.value)}
                  placeholder="Nhập ID Truyện (VD: novel-123)"
                  disabled={isGrantingStory}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="admin-grant-novel-ids">
                  {(safeNovels || []).map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ID Chương (tùy chọn — bỏ trống để cấp trọn bộ truyện)
                </label>
                <input
                  type="text"
                  value={grantChapterIdInput}
                  onChange={(e) => setGrantChapterIdInput(e.target.value)}
                  placeholder="VD: c5 hoặc ch-1, ch-2 (ngăn cách bằng dấu phẩy)"
                  disabled={isGrantingStory}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Hệ thống cập nhật trực tiếp danh sách chương đã mở khóa trên cơ sở dữ liệu và không ảnh hưởng tới số dư Xu.
                </p>
              </div>

              {grantModalError && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold">
                  {grantModalError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isGrantingStory}
                  onClick={() => setGrantTargetUser(null)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isGrantingStory}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {isGrantingStory ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang cấp quyền...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Xác nhận cấp quyền</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mp3ManagingNovel && (
        <AdminNovelMp3DrawerModal
          novel={mp3ManagingNovel}
          onClose={() => setMp3ManagingNovel(null)}
          onChapterAudioUpdated={(novelId, updatedChapter) => {
            setMp3ManagingNovel((prev) => {
              if (!prev || prev.id !== novelId) return prev;
              const nextChaps = Array.isArray(prev.chapters)
                ? prev.chapters.map((c) =>
                    c.id === updatedChapter.id || Number(c.number) === Number(updatedChapter.number)
                      ? {
                          ...c,
                          audioUrl: updatedChapter.audioUrl,
                          audioUrlMale: updatedChapter.audioUrlMale,
                          audioUrlFemale: updatedChapter.audioUrlFemale,
                        }
                      : c
                  )
                : prev.chapters;
              return { ...prev, chapters: nextChaps };
            });
            onChapterAudioUpdated?.(novelId, updatedChapter);
          }}
          onBatchChaptersAudioUpdated={(novelId, updatedChapters) => {
            const byId = new Map<string, Chapter>();
            const byNumber = new Map<number, Chapter>();
            for (const ch of updatedChapters) {
              if (ch.id) byId.set(ch.id, ch);
              if (Number(ch.number) > 0) byNumber.set(Number(ch.number), ch);
            }
            setMp3ManagingNovel((prev) => {
              if (!prev || prev.id !== novelId) return prev;
              const nextChaps = Array.isArray(prev.chapters)
                ? prev.chapters.map((c) => {
                    const matched = byId.get(c.id) || byNumber.get(Number(c.number));
                    if (!matched) return c;
                    return {
                      ...c,
                      audioUrl: matched.audioUrl,
                      audioUrlMale: matched.audioUrlMale,
                      audioUrlFemale: matched.audioUrlFemale,
                    };
                  })
                : prev.chapters;
              return { ...prev, chapters: nextChaps };
            });
            onBatchChaptersAudioUpdated?.(novelId, updatedChapters);
          }}
          onNovelMp3CountsSynced={(novelId, counts) => {
            setMp3ManagingNovel((prev) => {
              if (!prev || prev.id !== novelId) return prev;
              return {
                ...prev,
                mp3NamMinhCount: counts.mp3NamMinhCount,
                mp3HangNgaCount: counts.mp3HangNgaCount,
                hasMaleAudio: counts.hasMaleAudio,
                hasFemaleAudio: counts.hasFemaleAudio,
                hasAudio: counts.hasAudio,
              };
            });
            onNovelMp3CountsSynced?.(novelId, counts);
          }}
        />
      )}

      {/* Modal quản lý Audio / Video YouTube & Khóa VIP cho Truyện Ngắn */}
      {youtubeManagingNovel && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <Youtube className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-slate-900 truncate">
                    Audio / Video YouTube (Truyện Ngắn)
                  </h3>
                  <p className="text-[11px] text-slate-600 truncate">
                    {youtubeManagingNovel.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setYoutubeManagingNovel(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveYoutubeSettings} className="p-4 sm:p-5 space-y-4">
              {youtubeFormError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{youtubeFormError}</span>
                </div>
              )}

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Phân loại là Truyện Ngắn
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Bật để hiển thị trình phát Audio YouTube nổi bật phía trên nội dung truyện chữ
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={youtubeIsShortStoryInput}
                  onChange={(e) => setYoutubeIsShortStoryInput(e.target.checked)}
                  className="w-5 h-5 accent-pink-600 rounded cursor-pointer shrink-0"
                />
              </label>

              {youtubeIsShortStoryInput && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">
                      Link chia sẻ YouTube (youtu.be, watch?v=, shorts, embed)
                    </label>
                    <input
                      type="text"
                      value={youtubeUrlInput}
                      onChange={(e) => {
                        setYoutubeUrlInput(e.target.value);
                        if (youtubeFormError) setYoutubeFormError(null);
                      }}
                      placeholder="https://youtu.be/... hoặc https://www.youtube.com/watch?v=..."
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-pink-500"
                    />
                    {youtubeUrlInput.trim() && (() => {
                      const previewParsed = extractYouTubeVideoId(youtubeUrlInput.trim());
                      if (previewParsed.videoId) {
                        return (
                          <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Video ID hợp lệ: {previewParsed.videoId}</span>
                          </p>
                        );
                      }
                      if (previewParsed.error) {
                        return (
                          <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{previewParsed.error}</span>
                          </p>
                        );
                      }
                      return null;
                    })()}
                    <p className="text-[11px] text-slate-500">
                      Để trống nếu muốn gỡ link YouTube khỏi truyện này.
                    </p>
                  </div>

                  <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50/70 border border-amber-200 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Khóa VIP Audio YouTube
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Mặc định TẮT (nghe miễn phí có quảng cáo YouTube). Bật nếu chỉ cho thành viên đã mở khóa/VIP nghe.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={youtubeVipLockedInput}
                      onChange={(e) => setYoutubeVipLockedInput(e.target.checked)}
                      className="w-5 h-5 accent-amber-600 rounded cursor-pointer shrink-0"
                    />
                  </label>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setYoutubeManagingNovel(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingYoutubeSettings}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingYoutubeSettings ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Lưu cài đặt YouTube</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
