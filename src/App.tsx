import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Novel, 
  Chapter, 
  ReaderSettings, 
  ReadingProgress, 
  UserProfile, 
  TopUpRequest, 
  MainCategory, 
  NovelSubmission,
  SubmissionChapterDraft,
  GenreItem,
  UserRole,
  WithdrawalRequest,
  NovelReport,
  PurchaseHistoryItem,
  UserNotification,
  ChatTargetUser
} from './types';
import { FloatingChatWidget } from './components/FloatingChatWidget';
import { ClientLiveChat } from './components/ClientLiveChat';
import { AdminMessagesModal } from './components/AdminMessagesModal';
import { fetchUnreadMessageCount } from './services/chatService';
import { getStoredGenres, saveGenres, createGenreItem, INITIAL_HOT_GENRES } from './data/genres';
import { SAMPLE_NOVELS, CHAPTER_1_TSTN60_FULL, generateChapters } from './data/novels';
import { formatXu } from './utils/rulesAndVoices';
import { Header } from './components/Header';
import { NovelCard } from './components/NovelCard';
import { NovelDetail } from './components/NovelDetail';
import { ChapterReader } from './components/ChapterReader';
import { AccountModal } from './components/AccountModal';
import { TopUpModal } from './components/TopUpModal';
import { VipPurchaseModal } from './components/VipPurchaseModal';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { ArchitectureGuideModal } from './components/ArchitectureGuideModal';
import { SubmitNovelModal } from './components/SubmitNovelModal';
import { Top10HotSidebar } from './components/Top10HotSidebar';
import { calculateChapterVip, filterOutDummyChapters, isDummyChapter, removeVietnameseTones } from './utils/rulesAndVoices';
import { DaoTamLogo } from './components/DaoTamLogo';
import { VipPolicyModal } from './components/VipPolicyModal';
import { EditNovelModal } from './components/EditNovelModal';
import { DailyRewardModal } from './components/DailyRewardModal';
import { NominateNovelModal } from './components/NominateNovelModal';
import { TopNominatedSection } from './components/TopNominatedSection';
import { GlobalBanner } from './components/GlobalBanner';
import { AuthorDashboardModal } from './components/AuthorDashboardModal';
import { EditProfileModal } from './components/EditProfileModal';
import { RegisterCreatorModal } from './components/RegisterCreatorModal';
import { ReportNovelModal } from './components/ReportNovelModal';
import { CreatorProfile, CreatorProfileData } from './components/CreatorProfile';
import { DonateModal } from './components/DonateModal';
import { AuthModal } from './components/AuthModal';
import { MyNovelsModal } from './components/MyNovelsModal';
import { AuthorStatsModal } from './components/AuthorStatsModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { InterestedNovelsModal } from './components/InterestedNovelsModal';
import { FollowingNovelsModal } from './components/FollowingNovelsModal';
import { ReadingHistoryModal } from './components/ReadingHistoryModal';
import { SavedNovelsModal } from './components/SavedNovelsModal';
import { UserInfoModal } from './components/UserInfoModal';
import { WithdrawModal } from './components/WithdrawModal';
import { BatchUploadChaptersPage } from './components/BatchUploadChaptersPage';
import { PublishChapterPage } from './components/PublishChapterPage';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { SearchBar } from './components/SearchBar';
import { ContinueReadingBanner } from './components/ContinueReadingBanner';
import { EdgeTTSFloatingAudioBar } from './components/EdgeTTSFloatingAudioBar';
import { UserPurchasedNovelsPage } from './components/UserPurchasedNovelsPage';
import { unlockVipItemOnServer } from './services/vipSecurityService';
import { 
  loginWithGoogle, 
  logoutUser, 
  syncUserProfile, 
  updateUserState, 
  fetchNovelsFromFirestore, 
  fetchNovelBySlugOrId,
  saveNovelToFirestore,
  fetchShortStoriesFromFirestore,
  saveNovelWithInitialChaptersBatch,
  saveBatchChaptersToFirestore,
  deleteNovelFromFirestore, 
  toggleHideNovelInFirestore,
  createTopUpRequestInFirestore,
  fetchTopUpRequestsFromFirestore,
  updateTopUpRequestStatusInFirestore,
  approveTopUpTransactionInFirestore,
  rejectTopUpTransactionInFirestore,
  updateTopUpBillImageInFirestore,
  submitNovelSubmissionToFirestore,
  fetchNovelSubmissionsFromFirestore,
  updateNovelSubmissionStatusInFirestore,
  submitApplicationToFirestore,
  fetchCreatorApplicationsFromFirestore,
  createWithdrawalRequestInFirestore,
  fetchWithdrawalRequestsFromFirestore,
  updateWithdrawalRequestStatusInFirestore,
  approveWithdrawalAndNotifyAuthor,
  notifyAdminsOfWithdrawalRequest,
  submitNovelReportToFirestore,
  fetchNovelReportsFromFirestore,
  updateNovelReportStatusInFirestore,
  fetchUserProfileById,
  fetchCreatorByDisplayName,
  followCreatorInFirestore,
  fetchCategoriesFromFirestore,
  fetchStoriesFromFirestore,
  creditUserXuAndNotify,
  notifyFollowersOfNewNovel,
  fetchChaptersForNovel,
  addSingleChapterToFirestore,
  updateNovelMetadataInFirestore,
  incrementNovelInteractionStatsInFirestore,
  upgradeAuthorAndSendNotification,
  rejectNovelSubmissionAndNotify,
  processDonationInFirestore,
  creditAuthorRoyaltyAndNotify,
  incrementNovelRealViewsInFirestore,
  updateUserProfileInFirestore,
  markNotificationsCollectionAsRead,
  purchaseVipItemWithTransaction,
  createWithdrawalWithTransaction,
  refundRejectedWithdrawalWithTransaction
} from './firebase/services';
import { auth, db, checkIsAdmin } from './firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  FileCode2, 
  Sparkles, 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  Bookmark, 
  Flame, 
  Coins, 
  ShieldCheck, 
  Layers, 
  BookPlus, 
  UserCheck,
  Tag,
  AlertCircle,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { AuthProvider, useAuth, GUEST_USER } from './contexts/AuthContext';
import { AudioProvider, useAudio } from './contexts/AudioContext';
import { safeSetItem, safeGetItem, saveNovelsToStorage } from './utils/safeStorage';
import { 
  checkHasActiveBanNotice, 
  subscribeUserBanStatus, 
  clearLocalBanFlags, 
  BAN_MESSAGE 
} from './services/antiCrawlerRateLimiter';

function DaoTamApp() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = safeGetItem('daotam_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return 'light';
  });
  const location = useLocation();
  const navigate = useNavigate();
  const [isResolvingRoute, setIsResolvingRoute] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      return p !== '/' && p !== '';
    }
    return false;
  });
  const [routeError, setRouteError] = useState<string | null>(null);

  const [currentTab, setCurrentTab] = useState<'home' | 'completed' | 'latest'>('latest');
  const [isShortStoryMode, setIsShortStoryMode] = useState<boolean>(false);
  const [selectedMainCategory, setSelectedMainCategory] = useState<'all' | MainCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // Dynamic Hot Genres State (Persistent & extensible từ Firestore database)
  const [genres, setGenres] = useState<GenreItem[]>(() => getStoredGenres());
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // Dynamic Novels State: Khởi tạo từ cache an toàn và tự động đồng bộ thời gian thực từ Firestore (Single Source of Truth)
  const [novels, setNovels] = useState<Novel[]>(() => {
    try {
      const stored = safeGetItem('dao_tam_novels');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const deletingNovelIdsRef = useRef<Set<string>>(new Set());
  const [isNovelsLoading, setIsNovelsLoading] = useState(false);
  const [novelsError, setNovelsError] = useState<string | null>(null);
  // Phân trang danh sách truyện (25 bộ/trang trên desktop 5 cột, 27 bộ/trang trên mobile 3 cột)
  const [currentNovelPage, setCurrentNovelPage] = useState<number>(1);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const novelListTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Novel Submissions Queue: Khởi tạo rỗng, đồng bộ Firestore thực
  const [novelSubmissions, setNovelSubmissions] = useState<NovelSubmission[]>([]);

  // Modals state
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isVipPurchaseOpen, setIsVipPurchaseOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);
  const [isSubmitNovelOpen, setIsSubmitNovelOpen] = useState(false);
  const [isVipPolicyOpen, setIsVipPolicyOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  // Khung Chat Nổi Trực Tiếp & Giám Sát Tàng Hình Admin
  const [isChatWidgetOpen, setIsChatWidgetOpen] = useState(false);
  const [chatInitialTarget, setChatInitialTarget] = useState<ChatTargetUser | null>(null);
  const [isAdminMessagesOpen, setIsAdminMessagesOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [liveChatOpenSignal, setLiveChatOpenSignal] = useState<number>(0);

  // Thông báo nổi toàn trang (Toast notification thay thế window.alert)
  const [globalBanner, setGlobalBanner] = useState<{
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showGlobalBanner = (message: string, type: 'success' | 'error' | 'info' = 'success', duration = 5000) => {
    const id = `gb-${Date.now()}`;
    setGlobalBanner({ id, type, message });
    setTimeout(() => {
      setGlobalBanner((curr) => (curr?.id === id ? null : curr));
    }, duration);
  };

  // Edit Novel Modal State (Admin)
  const [editingNovel, setEditingNovel] = useState<Novel | null>(null);
  const [isEditNovelOpen, setIsEditNovelOpen] = useState(false);

  // Daily Reward (5 flowers) & Story Nomination Modals
  const [isDailyRewardOpen, setIsDailyRewardOpen] = useState(false);
  const [isNominateOpen, setIsNominateOpen] = useState(false);
  const [nominatingNovel, setNominatingNovel] = useState<Novel | null>(null);

  // Novel Report Violations: Khởi tạo rỗng, đồng bộ Firestore thực
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportingNovel, setReportingNovel] = useState<Novel | null>(null);
  const [novelReports, setNovelReports] = useState<NovelReport[]>([]);

  // Dedicated Reader Profile Editor & Creator Registration Modals
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isRegisterCreatorOpen, setIsRegisterCreatorOpen] = useState(false);

  // Dedicated Full Page Views State (Hình 3, 4, 5, 6, 7 & Đăng nhiều chương / Đăng chương mới / Admin toàn trang / Tủ truyện của bạn)
  const [activePageView, setActivePageView] = useState<'my-novels' | 'submit-novel' | 'reading-history' | 'saved-novels' | 'stats' | 'edit-novel' | 'batch-upload' | 'publish-chapter' | 'admin' | 'purchased-novels' | null>(null);
  const [batchUploadingNovel, setBatchUploadingNovel] = useState<Novel | null>(null);
  const [publishingChapterNovel, setPublishingChapterNovel] = useState<Novel | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ active: boolean; novelTitle: string; saved: number; total: number } | null>(null);

  // 10 Exact Menu Items Modals State (Figures 1-11)
  const [isInterestedNovelsOpen, setIsInterestedNovelsOpen] = useState(false);
  const [isFollowingNovelsOpen, setIsFollowingNovelsOpen] = useState(false);
  const [isUserInfoOpen, setIsUserInfoOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Author & Editor Multi-Novel Studio & 4 Stat Cards Showcase (Image 2)
  const [isAuthorShowcaseOpen, setIsAuthorShowcaseOpen] = useState(false);
  const [showcaseAuthorName, setShowcaseAuthorName] = useState<string>('');
  const [showcaseRole, setShowcaseRole] = useState<'author' | 'editor'>('author');

  const handleOpenAuthorShowcase = (name?: string, role: 'author' | 'editor' = 'author') => {
    if (name) {
      setShowcaseAuthorName(name);
      setShowcaseRole(role);
    }
    setIsAuthorShowcaseOpen(true);
  };

  // Dedicated Creator / Author Public Profile State (áp dụng chung Tác giả, Editor và Admin)
  const [selectedCreator, setSelectedCreator] = useState<CreatorProfileData | null>(null);
  const [donatingCreator, setDonatingCreator] = useState<CreatorProfileData | null>(null);
  const [donatingNovel, setDonatingNovel] = useState<Novel | null>(null);
  const [isDonateOpen, setIsDonateOpen] = useState(false);

  // Điều hướng mở Trang Cá Nhân Người Sáng Tác
  const handleSelectCreator = async (creatorNameOrId: string, directCreatorId?: string) => {
    const cleanName = creatorNameOrId.trim();
    if (!cleanName) return;

    if (location.pathname !== `/tac-gia/${encodeURIComponent(cleanName)}`) {
      navigate(`/tac-gia/${encodeURIComponent(cleanName)}`);
    }

    // Tìm trong danh sách truyện hiện tại
    const relatedNovel = (novels || []).find((n) => 
      n.author?.toLowerCase().trim() === cleanName.toLowerCase() ||
      n.editor?.toLowerCase().trim() === cleanName.toLowerCase() ||
      n.submittedBy?.userName?.toLowerCase().trim() === cleanName.toLowerCase() ||
      (directCreatorId && n.submittedBy?.userId === directCreatorId) ||
      (n.submittedBy && n.submittedBy.userId === cleanName)
    );

    let fetchedUser: UserProfile | null = null;
    const targetUserId = directCreatorId || (relatedNovel?.submittedBy?.userId);
    if (targetUserId) {
      fetchedUser = await fetchUserProfileById(targetUserId);
    }
    if (!fetchedUser) {
      fetchedUser = await fetchCreatorByDisplayName(cleanName);
    }

    const isViewingSelf = Boolean(
      user?.isLoggedIn &&
      user?.id !== 'guest' &&
      (
        (fetchedUser?.id && fetchedUser.id === user.id) ||
        (directCreatorId && directCreatorId === user.id) ||
        (fetchedUser?.email && user.email && fetchedUser.email.toLowerCase() === user.email.toLowerCase()) ||
        cleanName.toLowerCase() === user.displayName?.toLowerCase().trim()
      )
    );

    const rawRole = fetchedUser?.role || (relatedNovel?.editor?.toLowerCase() === cleanName.toLowerCase() ? 'editor' : 'author');
    const isTargetAdmin = rawRole === 'admin' || checkIsAdmin(fetchedUser?.email);
    const safePublicRole = isTargetAdmin
      ? (relatedNovel?.editor?.toLowerCase() === cleanName.toLowerCase() ? 'editor' : 'author')
      : rawRole;

    const creatorData: CreatorProfileData = {
      id: fetchedUser?.id || targetUserId || `creator-${cleanName}`,
      name: fetchedUser?.displayName || cleanName,
      avatarUrl: fetchedUser?.avatarUrl || (cleanName === user?.displayName ? user?.avatarUrl : (relatedNovel?.coverImage || undefined)),
      bio: fetchedUser?.bio || (cleanName === user?.displayName && user?.bio ? user.bio : `Tác giả / Editor tại Đạo Tâm. Cảm ơn quý độc giả đã yêu mến và ủng hộ các tác phẩm!`),
      role: safePublicRole,
      followers: fetchedUser?.followers || [],
      email: isViewingSelf ? (fetchedUser?.email || user?.email || '') : '',
    };

    setSelectedCreator(creatorData);
    setSelectedNovel(null);
    setSelectedChapter(null);
    setActivePageView(null);
    setRouteError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Theo dõi / Hủy theo dõi Creator
  const handleFollowCreator = async (creatorKey: string, shouldFollow: boolean) => {
    if (!user || !user.isLoggedIn || user.id === 'guest') {
      setIsAccountModalOpen(true);
      return;
    }

    const currentFollowing = user.followingCreators || [];
    const nextFollowing = shouldFollow
      ? [...new Set([...currentFollowing, creatorKey])]
      : currentFollowing.filter((id) => id !== creatorKey);

    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        followingCreators: nextFollowing,
      };
    });

    if (selectedCreator) {
      const currentFollowers = selectedCreator.followers || [];
      const nextFollowers = shouldFollow
        ? [...new Set([...currentFollowers, user.id])]
        : currentFollowers.filter((id) => id !== user.id);
      setSelectedCreator((prev) => (prev ? { ...prev, followers: nextFollowers } : null));
    }

    try {
      await followCreatorInFirestore(user.id, creatorKey, shouldFollow);
    } catch (err) {
      console.warn('Lỗi đồng bộ Firestore theo dõi tác giả:', err);
    }
  };

  // Mở modal tặng Xu ủng hộ người đăng truyện
  const handleOpenDonateNovel = (targetNovel: Novel) => {
    const uploaderId = targetNovel.submittedBy?.userId || (targetNovel as any).authorId || `author-${targetNovel.author}`;
    const uploaderName = targetNovel.editor || targetNovel.submittedBy?.userName || targetNovel.author || 'Người đăng truyện';
    const uploaderEmail = targetNovel.submittedBy?.userEmail || (targetNovel as any).authorEmail;

    setDonatingNovel(targetNovel);
    setDonatingCreator({
      id: uploaderId,
      name: uploaderName,
      email: uploaderEmail,
      role: targetNovel.editor ? 'editor' : 'author',
      avatarUrl: targetNovel.coverImage,
      bio: `Người đăng tải tác phẩm "${targetNovel.title}"`,
      followers: [],
    });
    setIsDonateOpen(true);
  };

  // Xử lý gửi tặng Xu / Donate cho tác giả / người đăng truyện
  const handleDonateXu = async (
    creator: CreatorProfileData, 
    amountXu: number, 
    donateMsg: string,
    targetNovel?: Novel | null
  ): Promise<boolean> => {
    if (!user || !user.isLoggedIn || user.id === 'guest') {
      setIsAccountModalOpen(true);
      return false;
    }
    if ((user.xuBalance || 0) < amountXu) {
      setIsTopUpOpen(true);
      return false;
    }

    try {
      const activeNovel = targetNovel || donatingNovel;
      const result = await processDonationInFirestore({
        donorUserId: user.id,
        donorName: user.displayName || 'Độc giả',
        donorEmail: user.email,
        creatorId: creator.id || '',
        creatorName: creator.name,
        creatorEmail: creator.email,
        uploaderUserId: activeNovel?.submittedBy?.userId,
        uploaderEmail: activeNovel?.submittedBy?.userEmail,
        novelId: activeNovel?.id,
        novelTitle: activeNovel?.title,
        amountXu,
        message: donateMsg,
      });

      // Cập nhật state người dùng hiện tại (nếu chính là tác giả hoặc độc giả)
      setUser((prev) => {
        if (!prev) return null;
        const isSelf = prev.id === result.creatorUserId || 
          (prev.email && creator.email && prev.email.toLowerCase().trim() === creator.email.toLowerCase().trim()) ||
          (prev.displayName && creator.name && prev.displayName.toLowerCase().trim() === creator.name.toLowerCase().trim());
        
        const nextBalance = isSelf
          ? result.donorNextXu // Nếu tự tặng mình thì số dư trừ rồi cộng lại
          : result.donorNextXu;
        const nextEarned = isSelf ? result.creatorNextXu : (prev.authorEarnedXu || 0);
        const newNotifs = isSelf 
          ? [result.creatorNotif, result.donorNotif, ...(prev.notifications || [])]
          : [result.donorNotif, ...(prev.notifications || [])];

        return {
          ...prev,
          xuBalance: nextBalance,
          authorEarnedXu: nextEarned,
          notifications: newNotifs,
        };
      });

      // Nếu đang xem trang cá nhân của Creator này, cập nhật số dư hiển thị
      if (selectedCreator && (selectedCreator.name === creator.name || selectedCreator.id === creator.id)) {
        setSelectedCreator((prev) => prev ? {
          ...prev,
          xuBalance: (prev.xuBalance || 0) + amountXu,
          authorEarnedXu: (prev.authorEarnedXu || 0) + amountXu,
        } : null);
      }

      // Cập nhật coinCount cục bộ cho truyện mà TUYỆT ĐỐI KHÔNG chạm vào updatedAt hay lastChapterUpdatedAt
      if (activeNovel?.id) {
        setNovels((prev) => {
          const updated = prev.map((n) =>
            n.id === activeNovel.id ? { ...n, coinCount: (n.coinCount || 0) + amountXu } : n
          );
          saveNovelsToStorage(updated);
          return updated;
        });
        setSelectedNovel((prev) =>
          prev && prev.id === activeNovel.id ? { ...prev, coinCount: (prev.coinCount || 0) + amountXu } : prev
        );
      }

      // Đồng bộ lại số dư thực tế từ Firestore (1 lần getDoc thủ công)
      refreshUserData().catch(() => {});

      return true;
    } catch (err: any) {
      console.error('Lỗi lưu giao dịch donate lên Firestore:', err);
      const errMsg = String(err?.message || '');
      if (errMsg.includes('Số dư') || errMsg.includes('không đủ')) {
        setIsTopUpOpen(true);
      }
      showGlobalBanner(errMsg || 'Không thể thực hiện tặng Xu lúc này. Vui lòng thử lại!', 'error', 5000);
      return false;
    }
  };

  // Đăng xuất tài khoản
  const handleLogout = async () => {
    try {
      await logoutUser();
      setUser(null);
      setSelectedCreator(null);
      setActivePageView(null);
      setIsAccountModalOpen(false);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Purchasing targets
  const [purchasingTarget, setPurchasingTarget] = useState<{ novel: Novel; chapter: Chapter } | null>(null);

  // Top-Up Requests Queue: Khởi tạo rỗng, đồng bộ Firestore thực
  const [topUpRequests, setTopUpRequests] = useState<TopUpRequest[]>([]);

  // User Profile từ AuthContext (Mặc định user = null, không dùng dữ liệu giả)
  const { user, setUser, loading: isAuthLoading, refreshUserData } = useAuth();
  const activeUser = user || GUEST_USER;
  const pendingTopUpIdsRef = useRef<Set<string>>(new Set());

  // 1. ĐỒNG BỘ REAL-TIME TRẠNG THÁI KHÓA USER TRỰC TIẾP TỪ FIRESTORE
  const [isAccountBanned, setIsAccountBanned] = useState<boolean>(() => Boolean(activeUser?.isBanned));

  useEffect(() => {
    const unsub = subscribeUserBanStatus(activeUser?.id, (banned) => {
      setIsAccountBanned(banned);
    });
    return () => unsub();
  }, [activeUser?.id]);

  // Author Withdrawal Requests: Khởi tạo rỗng, đồng bộ Firestore thực
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);

  // Payout revenue share settings (configured by Admin)
  // Quy chuẩn: Tác giả sáng tác 95%, Editor đăng độc quyền 90%, Editor không độc quyền 70%
  const [royaltyConfig, setRoyaltyConfig] = useState({
    authorRate: 95,
    editorRate: 70,
    exclusiveRate: 90,
  });

  // Reader Settings with Vietnamese voice and 100% Vietnamese font (Persistent & giữ nguyên giọng đọc)
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = safeGetItem('daotam_reader_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            fontSize: parsed.fontSize || 19,
            lineHeight: parsed.lineHeight || 1.85,
            fontFamily: parsed.fontFamily || 'vietnam',
            theme: parsed.theme || 'dark',
            autoScroll: Boolean(parsed.autoScroll),
            autoNextChapter: parsed.autoNextChapter !== undefined ? Boolean(parsed.autoNextChapter) : true,
            voiceSpeed: parsed.voiceSpeed || 1.0,
            selectedVoiceId: parsed.selectedVoiceId || 'vi-VN-HoaiMyNeural',
            autoHighlight: parsed.autoHighlight !== undefined ? Boolean(parsed.autoHighlight) : true,
            audioEngine: parsed.audioEngine || 'native',
          };
        }
      }
    } catch {}
    return {
      fontSize: 19,
      lineHeight: 1.85,
      fontFamily: 'vietnam',
      theme: 'dark',
      autoScroll: false,
      autoNextChapter: true,
      voiceSpeed: 1.0,
      selectedVoiceId: 'vi-VN-HoaiMyNeural',
      autoHighlight: true,
      audioEngine: 'native',
    };
  });


  // Lắng nghe biến động số dư Xu Realtime từ đúng 1 User Doc trong AuthContext
  const prevXuBalanceRef = useRef<number | null>(null);
  const prevBalanceUserIdRef = useRef<string | null>(null);
  const [topUpSuccessToast, setTopUpSuccessToast] = useState<{
    text: string;
    amount: number;
  } | null>(null);

  useEffect(() => {
    if (!activeUser) return;
    if (prevBalanceUserIdRef.current !== activeUser.id) {
      prevBalanceUserIdRef.current = activeUser.id;
      prevXuBalanceRef.current = typeof activeUser.xuBalance === 'number' ? activeUser.xuBalance : null;
      return;
    }

    if (typeof activeUser.xuBalance === 'number') {
      if (
        prevXuBalanceRef.current !== null &&
        activeUser.xuBalance > prevXuBalanceRef.current &&
        activeUser.id !== 'guest'
      ) {
        const addedXu = activeUser.xuBalance - prevXuBalanceRef.current;
        setTopUpSuccessToast({
          text: `🎉 Nạp Xu thành công! Tài khoản của bạn vừa được cộng +${addedXu.toLocaleString('vi-VN')} Xu vào ví.`,
          amount: addedXu
        });
        setTimeout(() => setTopUpSuccessToast(null), 6000);
      }
      prevXuBalanceRef.current = activeUser.xuBalance;
    }
  }, [activeUser?.xuBalance, activeUser?.id]);

  // Kiểm tra 1 lần (getDocs) số lượng tin nhắn chưa đọc khi đăng nhập / đóng mở khung chat (không giữ onSnapshot toàn cục)
  useEffect(() => {
    if (!activeUser?.id || activeUser.id === 'guest' || !activeUser.isLoggedIn) {
      setUnreadChatCount(0);
      return;
    }
    let isActive = true;
    fetchUnreadMessageCount(activeUser.id)
      .then((count) => {
        if (isActive) setUnreadChatCount(count);
      })
      .catch(() => {
        if (isActive) setUnreadChatCount(0);
      });
    return () => {
      isActive = false;
    };
  }, [activeUser?.id, activeUser?.isLoggedIn, isChatWidgetOpen]);

  // Hàm đọc 1 lần danh sách truyện từ Firestore bằng getDocs (dùng lúc khởi tạo và nút "Tải lại" trong Admin)
  const reloadNovels = useCallback(async () => {
    setIsNovelsLoading(true);
    setNovelsError(null);
    try {
      const liveNovels = await fetchNovelsFromFirestore();
      if (Array.isArray(liveNovels) && liveNovels.length > 0) {
        const filteredLive = liveNovels.filter(
          (n) => !deletingNovelIdsRef.current.has(n.id) && (!n.slug || !deletingNovelIdsRef.current.has(n.slug))
        );
        setNovels(() => {
          saveNovelsToStorage(filteredLive);
          return filteredLive;
        });

        setSelectedNovel((curr) => {
          if (!curr) return null;
          const match = liveNovels.find((x) => x.id === curr.id || x.slug === curr.slug);
          if (!match) {
            setSelectedChapter(null);
            return null;
          }
          return {
            ...curr,
            ...match,
            status: match.status || 'Đang ra',
            totalChapters: match.totalChapters,
            latestChapterTitle: match.latestChapterTitle,
            latestChapterNumber: match.latestChapterNumber,
            chapters: (Array.isArray(match.chapters) && match.chapters.length > 0)
              ? match.chapters
              : (Array.isArray(curr.chapters) ? curr.chapters : []),
          };
        });
      }
    } catch (err: any) {
      console.warn('Lỗi tải danh sách truyện từ Firestore:', err);
      setNovelsError(err?.message || 'Không thể tải danh sách truyện.');
    } finally {
      setIsNovelsLoading(false);
    }
  }, []);

  // Fetch novels & categories 1 lần khi mở trang bằng getDocs (KHÔNG dùng onSnapshot toàn cục)
  useEffect(() => {
    let isMounted = true;

    reloadNovels();

    async function loadCategories() {
      setIsCategoriesLoading(true);
      setCategoriesError(null);
      try {
        const remoteCategories = await fetchCategoriesFromFirestore();
        if (isMounted) {
          const map = new Map<string, GenreItem>();
          // Luôn giữ đầy đủ toàn bộ 64 thể loại chuẩn phong phú của hệ thống
          for (const item of INITIAL_HOT_GENRES) {
            map.set(item.name.toLowerCase().trim(), item);
          }
          // Bổ sung thêm bất kỳ thể loại nào được thêm mới trên Firestore
          if (Array.isArray(remoteCategories) && remoteCategories.length > 0) {
            for (const c of remoteCategories) {
              const key = c.name.toLowerCase().trim();
              if (!map.has(key)) {
                map.set(key, {
                  id: c.id,
                  name: c.name,
                  description: c.description,
                });
              }
            }
          }
          const mergedList = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
          setGenres(mergedList);
          saveGenres(mergedList);
        }
      } catch (err: any) {
        console.warn('Lưu ý đồng bộ categories (sử dụng 64 thể loại mặc định):', err);
        if (isMounted) {
          setCategoriesError(null);
        }
      } finally {
        if (isMounted) {
          setIsCategoriesLoading(false);
        }
      }
    }

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [reloadNovels]);

  // ==========================================================================
  // PHÂN QUYỀN TRUY XUẤT DỮ LIỆU 1 LẦN (ROLE-BASED GETDOCS, ZERO GLOBAL ONSNAPSHOT)
  // ==========================================================================
  useEffect(() => {
    if (isAuthLoading) return;

    let isMounted = true;
    const currentUser = auth.currentUser;
    const isUserAdmin = (checkIsAdmin(user?.email) || user?.role === 'admin') && Boolean(currentUser);

    if (isUserAdmin) {
      const loadAdminData = async () => {
        try {
          const [topups, subs, withdrawals, reports] = await Promise.all([
            fetchTopUpRequestsFromFirestore(),
            fetchNovelSubmissionsFromFirestore(),
            fetchWithdrawalRequestsFromFirestore(),
            fetchNovelReportsFromFirestore(),
          ]);
          if (isMounted) {
            setTopUpRequests(Array.isArray(topups) ? topups : []);
            setNovelSubmissions(Array.isArray(subs) ? subs : []);
            setWithdrawalRequests(Array.isArray(withdrawals) ? withdrawals : []);
            setNovelReports(Array.isArray(reports) ? reports : []);
          }
        } catch (err) {
          console.warn('Lỗi tải dữ liệu Quản trị viên từ Firestore:', err);
        }
      };
      loadAdminData();
    } else if (user?.role === 'author' && user?.id && user?.id !== 'guest' && Boolean(currentUser)) {
      const loadAuthorData = async () => {
        try {
          const [myTopups, authorSubs, authorWithdrawals] = await Promise.all([
            fetchTopUpRequestsFromFirestore(user.id),
            fetchNovelSubmissionsFromFirestore(user.id),
            fetchWithdrawalRequestsFromFirestore(user.id),
          ]);
          if (isMounted) {
            setTopUpRequests(Array.isArray(myTopups) ? myTopups : []);
            setNovelSubmissions(Array.isArray(authorSubs) ? authorSubs : []);
            setWithdrawalRequests(Array.isArray(authorWithdrawals) ? authorWithdrawals : []);
            setNovelReports([]);
          }
        } catch (err) {
          console.warn('Lỗi tải dữ liệu Tác giả từ Firestore:', err);
        }
      };
      loadAuthorData();
    } else if (user?.id && user?.id !== 'guest' && Boolean(currentUser)) {
      const loadReaderData = async () => {
        try {
          const myTopups = await fetchTopUpRequestsFromFirestore(user.id);
          if (isMounted) {
            setTopUpRequests(Array.isArray(myTopups) ? myTopups : []);
            setNovelSubmissions([]);
            setWithdrawalRequests([]);
            setNovelReports([]);
          }
        } catch (err) {
          console.warn('Lỗi tải lịch sử nạp của độc giả:', err);
        }
      };
      loadReaderData();
    } else {
      setTopUpRequests([]);
      setNovelSubmissions([]);
      setWithdrawalRequests([]);
      setNovelReports([]);
    }

    return () => {
      isMounted = false;
    };
  }, [user?.role, user?.id, user?.email, isAuthLoading]);

  useEffect(() => {
    saveNovelsToStorage(novels);
  }, [novels]);

  // Persist dynamic genres
  useEffect(() => {
    saveGenres(genres);
  }, [genres]);

  // Handle adding custom genre on the fly
  const handleAddNewGenre = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = (genres || []).find((g) => g.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setSelectedGenre(existing.name);
      return;
    }
    const newGenre = createGenreItem(trimmed);
    const updated = [newGenre, ...(genres || [])];
    setGenres(updated);
    saveGenres(updated);
    setSelectedGenre(newGenre.name);
  };

  // Admin xóa thể loại truyện khỏi hệ thống
  const handleDeleteGenre = (name: string) => {
    const trimmed = name.trim().toLowerCase();
    const updated = (genres || []).filter((g) => g.name.toLowerCase().trim() !== trimmed);
    setGenres(updated);
    saveGenres(updated);
    if (selectedGenre && selectedGenre.toLowerCase().trim() === trimmed) {
      setSelectedGenre(null);
    }
  };

  // Sync theme: Ban Đêm (Dark) và Ban Ngày (Light) lưu vĩnh viễn vào localStorage
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    safeSetItem('daotam_theme', theme);
  }, [theme]);

  // DAILY REWARD (5 FLOWERS) - Người đọc tự bấm vào điểm danh, không tự động hiện popup ép điểm danh
  const REWARD_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const isGmailLoggedIn = Boolean(user?.isLoggedIn && user?.email && user?.id !== 'guest');
  const lastRewardTime = user?.lastDailyRewardTimestamp || 0;
  const canClaimDailyReward = isGmailLoggedIn && (!lastRewardTime || Date.now() - lastRewardTime >= REWARD_COOLDOWN_MS);

  // Xử lý điểm danh nhận 5 hoa
  const handleClaimDailyFlowers = () => {
    if (!isGmailLoggedIn) {
      alert('Vui lòng đăng nhập tài khoản Gmail để điểm danh nhận hoa!');
      return;
    }
    const now = Date.now();
    if (user?.lastDailyRewardTimestamp && now - user.lastDailyRewardTimestamp < REWARD_COOLDOWN_MS) {
      alert('Bạn vừa mới điểm danh! Vui lòng quay lại sau 24 giờ kể từ lần trước.');
      return;
    }

    setUser((prev) => {
      if (!prev) return null;
      const updated: UserProfile = {
        ...prev,
        flowerBalance: (prev.flowerBalance || 0) + 5,
        lastDailyRewardTimestamp: now,
        lastDailyRewardDate: new Date(now).toISOString(),
      };
      if (prev.isLoggedIn && prev.id && prev.id !== 'guest') {
        updateUserState(prev.id, {
          flowerBalance: updated.flowerBalance,
          lastDailyRewardTimestamp: now,
          lastDailyRewardDate: updated.lastDailyRewardDate,
        })
          .then(() => refreshUserData().catch(() => {}))
          .catch(() => {});
      }
      return updated;
    });
  };

  // Handle nominating flowers to a novel (Admin has unlimited flowers)
  const handleNominateNovel = (novelId: string, flowerAmount: number) => {
    const isAdmin = user?.role === 'admin';

    // Deduct flowers if not admin
    if (!isAdmin) {
      if ((user?.flowerBalance || 0) < flowerAmount) return;
      setUser((prev) => {
        if (!prev) return null;
        const updated: UserProfile = {
          ...prev,
          flowerBalance: Math.max(0, (prev.flowerBalance || 0) - flowerAmount),
        };
        if (prev.isLoggedIn && prev.id && prev.id !== 'guest') {
          updateUserState(prev.id, { flowerBalance: updated.flowerBalance }).catch(() => {});
        }
        return updated;
      });
    }

    // Add flowers to the novel (Chỉ cập nhật flowerCount bằng increment(), KHÔNG CHẠM updatedAt)
    setNovels((prev) => {
      const updatedNovels = prev.map((n) => {
        if (n.id === novelId) {
          const nextFlowers = (n.flowerCount || 0) + flowerAmount;
          const updated = {
            ...n,
            flowerCount: nextFlowers,
          };
          incrementNovelInteractionStatsInFirestore(novelId, { flowerCount: flowerAmount }).catch((err) =>
            console.warn('Could not sync flower count to Firestore:', err)
          );
          return updated;
        }
        return n;
      });
      saveNovelsToStorage(updatedNovels);
      return updatedNovels;
    });

    // Update selected novel if viewing
    if (selectedNovel && selectedNovel.id === novelId) {
      setSelectedNovel((prev) =>
        prev ? { ...prev, flowerCount: (prev.flowerCount || 0) + flowerAmount } : null
      );
    }
  };

  // Toggle Role: Chỉ tài khoản có email trong ADMIN_EMAILS mới được chọn admin
  const handleToggleRole = () => {
    setUser((prev) => {
      if (!prev) return null;
      const isAdminAllowed = checkIsAdmin(prev.email);
      let nextRole: UserRole;
      if (prev.role === 'admin') {
        nextRole = 'author';
      } else if (prev.role === 'author') {
        nextRole = 'reader';
      } else {
        nextRole = isAdminAllowed ? 'admin' : 'author';
      }
      return {
        ...prev,
        role: nextRole,
      };
    });
  };

  const handleSelectRole = (role: UserRole) => {
    setUser((prev) => {
      if (!prev) return null;
      if (role === 'admin' && !checkIsAdmin(prev.email)) {
        alert('Tài khoản này không có quyền Admin. Chỉ có 2 email được chỉ định mới có quyền Quản Trị Viên.');
        return prev;
      }
      return {
        ...prev,
        role,
      };
    });
  };

  // Profile update handler (avatar, display name, bio, and mandatory creator info: facebook, phone, bank info)
  const handleUpdateProfile = (
    name: string, 
    avatarUrl: string,
    extra?: {
      bio?: string;
      facebookUrl?: string;
      phoneNumber?: string;
      bankInfo?: {
        bankName: string;
        accountNumber: string;
        accountHolder: string;
      };
    }
  ) => {
    const base = user || activeUser;
    const targetUserId = base.id && base.id !== 'guest' ? base.id : `usr-${(base.email || 'user').replace(/[^a-zA-Z0-9]/g, '_')}`;

    const updatedUser: UserProfile = {
      ...base,
      id: targetUserId,
      displayName: name,
      avatarUrl,
      isLoggedIn: true,
      bio: extra?.bio !== undefined ? extra.bio : base.bio,
      facebookUrl: extra?.facebookUrl !== undefined ? extra.facebookUrl : base.facebookUrl,
      phoneNumber: extra?.phoneNumber !== undefined ? extra.phoneNumber : base.phoneNumber,
      bankInfo: extra?.bankInfo !== undefined ? extra.bankInfo : base.bankInfo,
    };

    setUser(updatedUser);

    // Lưu vào Firestore
    updateUserState(targetUserId, {
      displayName: name,
      avatarUrl,
      bio: updatedUser.bio || '',
      facebookUrl: updatedUser.facebookUrl || '',
      phoneNumber: updatedUser.phoneNumber || '',
      bankInfo: updatedUser.bankInfo,
    }).catch((err) => console.warn('Could not sync user profile to Firestore:', err));

    updateUserProfileInFirestore(targetUserId, {
      displayName: name,
      avatarUrl,
      bio: updatedUser.bio || ''
    }).catch((err) => console.warn('Could not update users collection in Firestore:', err));

    // Cập nhật bút danh và ảnh mới cho toàn bộ tác phẩm của tác giả này
    setNovels((prev) => {
      const updatedNovels = prev.map((n) => {
        const isAuthor = (targetUserId && n.submittedBy?.userId === targetUserId) || 
          (base.email && n.submittedBy?.userEmail?.toLowerCase() === base.email.toLowerCase()) ||
          n.author?.toLowerCase().trim() === base.displayName?.toLowerCase().trim();
        
        if (isAuthor) {
          const nextAuthor = n.author === base.displayName ? name : n.author;
          const nextSubmittedBy = {
            ...(n.submittedBy || { userId: targetUserId, userEmail: base.email || '' }),
            userName: name,
          };
          const updatedNovel: Novel = {
            ...n,
            author: nextAuthor,
            submittedBy: nextSubmittedBy,
          };
          updateNovelMetadataInFirestore(n.id, {
            author: nextAuthor,
            submittedBy: nextSubmittedBy,
          }).catch(() => {});
          return updatedNovel;
        }
        return n;
      });
      saveNovelsToStorage(updatedNovels);
      return updatedNovels;
    });

    // Cập nhật ngay lập tức giao diện Trang cá nhân (hình 4)
    setSelectedCreator((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        name,
        avatarUrl,
        bio: extra?.bio !== undefined ? extra.bio : prev.bio,
      };
    });
  };

  // Cập nhật các cờ trạng thái truyện (nhạy cảm, sáng tác, hoàn thành) và lưu vào Firestore
  const handleUpdateNovelFlags = async (novelId: string, flags: {
    isSensitive?: boolean;
    isOriginal?: boolean;
    isCompleted?: boolean;
  }) => {
    setNovels((prev) => {
      const updated = prev.map((n) => {
        if (n.id === novelId) {
          const partialFlags: Partial<Novel> = {
            ...(flags.isSensitive !== undefined && { isSensitive: flags.isSensitive }),
            ...(flags.isOriginal !== undefined && { isOriginal: flags.isOriginal }),
            ...(flags.isCompleted !== undefined && { status: flags.isCompleted ? 'Hoàn thành' : 'Đang ra' }),
          };
          const updatedNovel: Novel = {
            ...n,
            ...partialFlags,
          };
          updateNovelMetadataInFirestore(novelId, partialFlags).catch((err) => console.warn('Lỗi lưu cờ truyện vào Firestore:', err));
          return updatedNovel;
        }
        return n;
      });
      saveNovelsToStorage(updated);
      return updated;
    });
  };

  // Reading Progress auto-save: Tối ưu lưu tức thì vào cache bộ nhớ máy (Optimistic UI)
  // và chỉ debounce ghi Firestore khi tài khoản đã đăng nhập thật, không spam vòng lặp
  const handleSaveProgress = (progress: ReadingProgress) => {
    try {
      const raw = localStorage.getItem('daotam_reading_history');
      const parsed = raw ? JSON.parse(raw) : [];
      const existing: any[] = Array.isArray(parsed) ? parsed : [];
      const matchedNovel = novels.find((n) => n.id === progress.novelId);
      const novelSlug = matchedNovel?.slug || '';
      const matchedChap = matchedNovel?.chapters?.find(
        (c) => c.id === progress.chapterId || c.number === progress.chapterNumber
      );
      const chapterSlug = matchedChap?.slug || '';
      const entry = {
        ...progress,
        novelSlug,
        chapterSlug,
        url: `/truyen/${encodeURIComponent(novelSlug || progress.novelId)}/chuong/${encodeURIComponent(chapterSlug || progress.chapterId || `chuong-${progress.chapterNumber || 1}`)}`,
      };
      const nextLocal = [entry, ...existing.filter((item) => item?.novelId !== progress.novelId)].slice(0, 20);
      safeSetItem('daotam_reading_history', JSON.stringify(nextLocal));
    } catch {}

    setUser((prev) => {
      if (!prev) return null;
      const filtered = (prev.readingHistory || []).filter((item) => item.novelId !== progress.novelId);
      const nextHistory = [progress, ...filtered];
      const updated = {
        ...prev,
        readingHistory: nextHistory,
      };
      return updated;
    });
  };

  // Google Analytics Engaged Session Real View Tracker: Ghi nhận view thật vào Firestore
  const handleRecordRealView = async (novelId: string) => {
    try {
      await incrementNovelRealViewsInFirestore(novelId);
      setNovels((prev) =>
        prev.map((n) => {
          if (n.id === novelId) {
            return {
              ...n,
              views: (n.views || 0) + 1,
              dailyViews: (n.dailyViews || 0) + 1,
            };
          }
          return n;
        })
      );
      setSelectedNovel((curr) => {
        if (!curr || curr.id !== novelId) return curr;
        return {
          ...curr,
          views: (curr.views || 0) + 1,
          dailyViews: (curr.dailyViews || 0) + 1,
        };
      });
    } catch (err) {
      console.warn('Lỗi ghi nhận lượt xem thật:', err);
    }
  };

  const handleToggleBookmark = (novelId: string) => {
    setUser((prev) => {
      if (!prev) return null;
      const curBookmarks = Array.isArray(prev.bookmarks) ? prev.bookmarks : [];
      const exists = curBookmarks.includes(novelId);
      const nextBookmarks = exists
        ? curBookmarks.filter((id) => id !== novelId)
        : [...curBookmarks, novelId];
      const updated = {
        ...prev,
        bookmarks: nextBookmarks,
      };
      if (prev.isLoggedIn && prev.id && prev.id !== 'guest') {
        updateUserState(prev.id, { bookmarks: nextBookmarks }).catch(() => {});
      }
      return updated;
    });
  };

  const handleRemoveBookmark = (novelId: string) => {
    setUser((prev) => {
      if (!prev) return null;
      const nextBookmarks = (prev.bookmarks || []).filter((id) => id !== novelId);
      const updated = {
        ...prev,
        bookmarks: nextBookmarks,
      };
      if (prev.isLoggedIn && prev.id && prev.id !== 'guest') {
        updateUserState(prev.id, { bookmarks: nextBookmarks }).catch(() => {});
      }
      return updated;
    });
  };

  const handleToggleInterest = (novelId: string) => {
    setUser((prev) => {
      if (!prev) return null;
      const current = prev.interestedNovels || [];
      const exists = current.includes(novelId);
      const nextInterested = exists
        ? current.filter((id) => id !== novelId)
        : [...current, novelId];
      const updated = {
        ...prev,
        interestedNovels: nextInterested,
      };
      if (prev.isLoggedIn && prev.id && prev.id !== 'guest') {
        updateUserState(prev.id, { interestedNovels: nextInterested }).catch(() => {});
      }
      return updated;
    });
  };

  const handleClearReadingHistory = () => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = {
        ...prev,
        readingHistory: [],
      };
      if (prev.isLoggedIn && prev.id && prev.id !== 'guest') {
        updateUserState(prev.id, { readingHistory: [] }).catch(() => {});
      }
      return updated;
    });
  };

  const handleUpdateUserInfo = async (data: Partial<UserProfile>) => {
    const base = user || activeUser;
    const targetUserId = base.id && base.id !== 'guest' ? base.id : `usr-${(base.email || 'user').replace(/[^a-zA-Z0-9]/g, '_')}`;
    const updated = { ...base, id: targetUserId, ...data, isLoggedIn: true };
    setUser(updated);
    updateUserState(targetUserId, data, true).catch((err) => console.warn('Could not sync user info to Firestore:', err));
    updateUserProfileInFirestore(targetUserId, data).catch((err) => console.warn('Could not update users collection in Firestore:', err));
  };

  // Top-Up Request Handler: Lưu thẳng vào collection topup_requests
  const handleSubmitTopUp = async (reqData: Omit<TopUpRequest, 'id' | 'createdAt' | 'status'>) => {
    try {
      const created = await createTopUpRequestInFirestore(reqData);
      if (created) {
        setTopUpRequests((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      }

      // Thông báo cho độc giả đã gửi yêu cầu nạp tiền
      const submitNotif = {
        id: `topup-sent-${Date.now()}`,
        title: `⏳ Đã tạo yêu cầu nạp ${formatXu(reqData.xuAmount)} Xu`,
        message: `Bạn vừa gửi yêu cầu nạp ${formatXu(reqData.amountVnd)}đ (+${formatXu(reqData.xuAmount)} Xu) với mã GD "${reqData.transferCode}". Admin sẽ duyệt và cộng Xu sau khi đối soát sao kê.`,
        type: 'topup' as const,
        createdAt: Date.now(),
        isRead: false,
      };

      const targetUserId = reqData.userId || reqData.uid;
      if (user && user.isLoggedIn && (user.id === targetUserId)) {
        setUser((prev) => prev ? {
          ...prev,
          notifications: [submitNotif, ...(prev.notifications || [])],
        } : null);
      }

      return created;
    } catch (err) {
      console.error('Lỗi gửi yêu cầu nạp tiền lên Firestore:', err);
      throw err;
    }
  };

  // Admin Approval Handler: Duyệt trên Firestore và cộng Xu chính thức vào tài khoản với transaction nguyên tử
  const handleApproveTopUp = async (
    requestId: string,
    options?: {
      alreadyProcessedInFirestore?: boolean;
      approvedRequest?: TopUpRequest;
      nextXu?: number;
    }
  ) => {
    const req = topUpRequests.find((r) => r.id === requestId) || options?.approvedRequest;
    if (!req) return;
    if (!options?.alreadyProcessedInFirestore && req.status !== 'pending') {
      console.warn(`Lệnh nạp ${requestId} không ở trạng thái pending.`);
      return;
    }

    try {
      const result = options?.alreadyProcessedInFirestore
        ? {
            userId: req.userId,
            nextXu: options.nextXu ?? req.xuAmount,
          }
        : await approveTopUpTransactionInFirestore(requestId);

      const approvedAtMs = options?.approvedRequest?.approvedAt || Date.now();
      setTopUpRequests((prev) => {
        const exists = prev.some((r) => r.id === requestId);
        if (exists) {
          return prev.map((r) =>
            r.id === requestId ? { ...r, status: 'approved', approvedAt: approvedAtMs } : r
          );
        }
        return [{ ...req, status: 'approved', approvedAt: approvedAtMs }, ...prev];
      });

      // Nếu chính là tài khoản đang đăng nhập trên máy này
      if (user?.id === result.userId || user?.id === req.userId) {
        setUser((u) => {
          if (!u) return null;
          return {
            ...u,
            xuBalance: result.nextXu,
            notifications: [
              {
                id: `notif-${Date.now()}`,
                title: `Bạn đã nạp ${formatXu(req.xuAmount)} Xu thành công`,
                message: `Yêu cầu nạp ${formatXu(req.amountVnd)}đ (+${formatXu(req.xuAmount)} Xu) với mã GD "${req.transferCode}" đã được Admin phê duyệt thành công! Số dư ví hiện tại là ${formatXu(result.nextXu)} Xu.`,
                type: 'topup',
                createdAt: Date.now(),
                isRead: false,
              },
              ...(u.notifications || []),
            ],
          };
        });
        await refreshUserData().catch(() => {});
      }
    } catch (err) {
      console.error('Lỗi duyệt nạp tiền trên Firestore:', err);
      throw err;
    }
  };

  const handleRejectTopUp = async (requestId: string, reason?: string) => {
    const req = topUpRequests.find((r) => r.id === requestId);
    if (req && req.status !== 'pending') {
      console.warn(`Lệnh nạp ${requestId} không ở trạng thái pending.`);
      return;
    }

    try {
      await rejectTopUpTransactionInFirestore(requestId, reason);
      setTopUpRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'rejected', rejectedAt: Date.now() } : r))
      );
    } catch (err) {
      console.error('Lỗi từ chối nạp tiền trên Firestore:', err);
      throw err;
    }
  };

  const handleCancelTopUp = async (requestId: string) => {
    try {
      await updateTopUpRequestStatusInFirestore(requestId, 'cancelled');
      setTopUpRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'cancelled' } : r))
      );
    } catch (err) {
      console.error('Lỗi hủy nạp tiền trên Firestore:', err);
      setTopUpRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'cancelled' } : r))
      );
    }
  };

  // Độc giả gửi hoặc cập nhật ảnh biên lai/bill cho đơn nạp tiền
  const handleUpdateTopUpBillImage = async (requestId: string, billImageUrl: string) => {
    try {
      await updateTopUpBillImageInFirestore(requestId, billImageUrl);
      setTopUpRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, billImageUrl } : r))
      );
    } catch (err) {
      console.error('Lỗi cập nhật ảnh bill nạp tiền trên Firestore:', err);
      setTopUpRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, billImageUrl } : r))
      );
    }
  };

  const handleCreateWithdrawal = async (data: {
    amountXu: number;
    amountVnd: number;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    note?: string;
  }) => {
    if (!user) return;

    // QUY ĐỊNH: Số lần rút xu không được thực hiện nhiều lần, chỉ khi nào đơn rút xu trước đó được duyệt thì người rút mới có thể yêu cầu rút tiếp
    const hasPending = withdrawalRequests.some(
      (r) =>
        (r.authorId === user.id ||
          (user.email && r.authorEmail?.toLowerCase().trim() === user.email.toLowerCase().trim())) &&
        r.status === 'pending'
    );
    if (hasPending) {
      alert('Bạn đang có đơn rút xu đang chờ Admin duyệt. Theo quy định, chỉ khi nào đơn rút xu trước đó được duyệt thì bạn mới có thể yêu cầu rút xu tiếp.');
      return;
    }

    if (!user.isLoggedIn || !user.id || user.id === 'guest') {
      setIsAccountModalOpen(true);
      return;
    }

    try {
      const bankInfo = {
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        accountHolder: data.accountHolder,
      };

      // Khấu trừ an toàn bằng runTransaction trên Server (tuyệt đối không trừ ở client)
      const txBalances = await createWithdrawalWithTransaction({
        userId: user.id,
        amountXu: data.amountXu,
        bankInfo,
      });

      const generatedCode = `WR${Math.floor(10000000 + Math.random() * 90000000)}`;
      const created = await createWithdrawalRequestInFirestore({
        code: generatedCode,
        authorId: user.id,
        authorName: user.displayName || 'Tác giả',
        authorEmail: user.email || '',
        amountXu: data.amountXu,
        amountVnd: data.amountVnd,
        remainingXu: txBalances.newAuthorEarnedXu + txBalances.newXuBalance,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        accountHolder: data.accountHolder,
        note: data.note,
      });

      if (created) {
        setWithdrawalRequests((prev) => [created, ...prev.filter((w) => w.id !== created.id)]);
        notifyAdminsOfWithdrawalRequest(created).catch((e) => console.warn('Lỗi notify admin withdrawal:', e));

        // Nếu tài khoản hiện tại là Admin, cập nhật thông báo ngay trong thanh Header
        if (user.role === 'admin' || checkIsAdmin(user.email)) {
          const adminNotice: UserNotification = {
            id: `admin-withdraw-notice-${created.id}-${Date.now()}`,
            title: '🔔 Yêu Cầu Rút Xu Mới Cần Duyệt',
            message: `Tài khoản ${created.authorName} vừa gửi yêu cầu rút ${created.amountXu.toLocaleString('vi-VN')} Xu (${created.amountVnd.toLocaleString('vi-VN')} VNĐ) về ngân hàng ${created.bankName} - STK: ${created.accountNumber}.`,
            type: 'payout',
            createdAt: Date.now(),
            isRead: false,
          };
          setUser((prev) => prev ? {
            ...prev,
            notifications: [adminNotice, ...(prev.notifications || [])],
          } : null);
        }
      }

      setUser((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          authorEarnedXu: txBalances.newAuthorEarnedXu,
          xuBalance: txBalances.newXuBalance,
          bankInfo,
        };
      });
      refreshUserData().catch(() => {});
    } catch (err: any) {
      console.error('Lỗi tạo yêu cầu rút tiền:', err);
      setGlobalBanner({
        id: `banner-${Date.now()}`,
        type: 'error',
        message: err?.message || 'Không thể gửi yêu cầu rút tiền lên máy chủ. Vui lòng thử lại!',
      });
      setTimeout(() => setGlobalBanner(null), 5000);
    }
  };

  // Admin approves withdrawal payout and records in Firestore
  const handleApproveWithdrawal = async (requestId: string) => {
    const req = withdrawalRequests.find((r) => r.id === requestId);
    if (!req) return;

    try {
      // Cập nhật trạng thái duyệt trên Firestore và tự động ghi thông báo vào document tác giả
      const sentNotif = await approveWithdrawalAndNotifyAuthor(requestId, req);

      setWithdrawalRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'approved', approvedAt: Date.now() } : r))
      );

      // Nếu người đăng nhập hiện tại là tác giả đó
      if (req.authorId === user?.id || (user?.email && req.authorEmail?.toLowerCase() === user.email.toLowerCase())) {
        setUser((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            notifications: [
              sentNotif,
              ...(prev.notifications || []).filter((n) => n.id !== sentNotif.id),
            ],
          };
        });
      }

      setGlobalBanner({
        id: `banner-${Date.now()}`,
        type: 'success',
        message: `Đã duyệt thành công lệnh rút ${req.amountXu.toLocaleString('vi-VN')} xu (${req.amountVnd.toLocaleString('vi-VN')} VNĐ) cho ${req.authorName}. Thông báo đã được gửi tới người rút!`,
      });
      setTimeout(() => setGlobalBanner(null), 5000);
    } catch (err) {
      console.error('Lỗi duyệt rút tiền:', err);
      setGlobalBanner({
        id: `banner-${Date.now()}`,
        type: 'error',
        message: 'Không thể duyệt yêu cầu rút tiền do lỗi kết nối. Vui lòng thử lại!',
      });
      setTimeout(() => setGlobalBanner(null), 5000);
    }
  };

  // Admin rejects withdrawal payout and refunds Xu in Firestore using increment()
  const handleRejectWithdrawal = async (requestId: string, reason?: string) => {
    const req = withdrawalRequests.find((r) => r.id === requestId);
    if (!req) return;

    try {
      await updateWithdrawalRequestStatusInFirestore(requestId, 'rejected', reason);
      setWithdrawalRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'rejected', rejectionReason: reason } : r))
      );

      const refundNotif: UserNotification = {
        id: `notif-reject-withdraw-${requestId}-${Date.now()}`,
        title: '❌ Yêu Cầu Rút Nhuận Bút Bị Từ Chối',
        message: `Yêu cầu rút ${formatXu(req.amountXu)} xu bị từ chối.${reason ? ` Lý do: ${reason}` : ''} Toàn bộ ${formatXu(req.amountXu)} xu đã được hoàn trả lại vào ví của bạn.`,
        type: 'payout',
        createdAt: Date.now(),
        isRead: false,
      };

      if (req.authorId) {
        await refundRejectedWithdrawalWithTransaction({
          userId: req.authorId,
          amountXu: req.amountXu,
          notifItem: refundNotif,
        });
      }

      if (req.authorId === user?.id) {
        setUser((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            authorEarnedXu: (prev.authorEarnedXu || 0) + req.amountXu,
            notifications: [refundNotif, ...(prev.notifications || [])],
          };
        });
        refreshUserData().catch(() => {});
      }
    } catch (err) {
      console.error('Lỗi từ chối rút tiền:', err);
    }
  };

  // Tạo đối tượng Novel dự phòng chuẩn kiểu dữ liệu
  const createFallbackNovel = (id: string, authorName: string): Novel => ({
    id,
    title: 'Truyện',
    author: authorName,
    description: '',
    coverImage: '',
    mainCategory: 'truyen-sang-tac',
    status: 'Đang ra',
    rating: 5,
    views: 1,
    dailyViews: 1,
    slug: `truyen-${id}`,
    fullBookPriceXu: 0,
    hasAudio: true,
    updatedAt: Date.now(),
    lastChapterUpdatedAt: Date.now(),
    lastUpdated: 'Vừa xong',
    totalChapters: 0,
    categories: ['all'],
    chapters: [],
  });

  // Author chapter editor & scheduler save handler
  const handleSaveChapterFromAuthor = async (novelId: string, chapterData: {
    title: string;
    number: number;
    content: string;
    isVip: boolean;
    priceXu: number;
    scheduledPublishAt?: number;
    status: 'draft' | 'pending' | 'published';
  }) => {
    const newChapter: Chapter = {
      id: `${novelId}-c${chapterData.number}-${Date.now()}`,
      number: chapterData.number,
      title: chapterData.title,
      slug: `chuong-${chapterData.number}`,
      wordCount: (chapterData.content || '').split(/\s+/).filter(Boolean)?.length || 0,
      publishedDate: new Date().toISOString().split('T')[0],
      isVip: chapterData.isVip,
      priceXu: chapterData.isVip ? chapterData.priceXu : 0,
      content: chapterData.content,
      scheduledPublishAt: chapterData.scheduledPublishAt,
    };

    const currentNovel = (novels || []).find((n) => n.id === novelId) || (selectedNovel && selectedNovel.id === novelId ? selectedNovel : null);
    const existingChapters = Array.isArray(currentNovel?.chapters) ? currentNovel.chapters : [];
    const exists = existingChapters.some((c) => Number(c.number) === Number(chapterData.number));
    const chapters = exists
      ? (existingChapters || []).map((c) => (Number(c.number) === Number(chapterData.number) ? { ...c, ...newChapter } : c))
      : [...existingChapters, newChapter].sort((a, b) => Number(a.number) - Number(b.number));
    const latestChap = (chapters?.length || 0) > 0 ? chapters[(chapters?.length || 0) - 1] : undefined;

    const fallback = createFallbackNovel(novelId, user?.displayName || 'Tác giả');
    const updatedNovelTarget: Novel = {
      ...(currentNovel || fallback),
      chapters,
      totalChapters: Math.max(currentNovel?.totalChapters || 0, chapters?.length || 0),
      latestChapterTitle: latestChap?.title ? `Chương ${latestChap.number}: ${latestChap.title}` : undefined,
      latestChapterNumber: latestChap?.number,
      updatedAt: Date.now(),
      lastChapterUpdatedAt: Date.now(),
      lastUpdated: 'Vừa xong',
    };

    setNovels((prev) => {
      const idx = prev.findIndex((n) => n.id === novelId);
      const updated = idx >= 0 ? prev.map((n) => (n.id === novelId ? updatedNovelTarget : n)) : [updatedNovelTarget, ...prev];
      saveNovelsToStorage(updated);
      return updated;
    });

    setSelectedNovel((curr) => (curr && curr.id === novelId ? updatedNovelTarget : curr));

    try {
      if (newChapter.content) {
        safeSetItem(`chapter_full_${novelId}_${newChapter.number}`, newChapter.content);
        safeSetItem(`chapter_full_${novelId}_${newChapter.id}`, newChapter.content);
      }
      // Gom thao tác ghi 1 chương và cập nhật metadata của truyện vào DUY NHẤT 1 WriteBatch
      await addSingleChapterToFirestore(novelId, newChapter, updatedNovelTarget);
    } catch (err) {
      console.warn('Could not sync chapter to Firestore:', err);
    }

    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        notifications: [
          {
            id: `notif-${Date.now()}`,
            title: '📝 Đã Lưu Chương Truyện Mới',
            message: `Chương ${chapterData.number}: "${chapterData.title}" (${chapterData.isVip ? `VIP ${formatXu(chapterData.priceXu)} Xu` : 'Miễn phí'}${chapterData.scheduledPublishAt ? ' • Có hẹn giờ' : ''}) đã được lưu thành công!`,
            type: 'system',
            createdAt: Date.now(),
            isRead: false,
          },
          ...(prev.notifications || []),
        ],
      };
    });
  };

  // Cập nhật danh sách chương truyện khi NovelDetail tải trực tiếp từ Firestore
  const handleUpdateNovelChapters = (novelId: string, chapters: Chapter[]) => {
    const safeChaps = Array.isArray(chapters) ? chapters : [];
    setNovels((prev) => {
      const updated = (prev || []).map((n) => {
        if (n.id === novelId) {
          return {
            ...n,
            chapters: safeChaps,
            totalChapters: Math.max(n.totalChapters || 0, safeChaps?.length || 0),
          };
        }
        return n;
      });
      saveNovelsToStorage(updated);
      return updated;
    });

    if (selectedNovel && selectedNovel.id === novelId) {
      setSelectedNovel((curr) => (curr ? { ...curr, chapters: safeChaps, totalChapters: Math.max(curr.totalChapters || 0, safeChaps?.length || 0) } : null));
    }
  };

  // Batch chapter publishing handler (Đồng bộ Firestore thực & localStorage)
  const handleAddBatchChapters = async (
    novelId: string, 
    newChapters: Chapter[], 
    isCompleted?: boolean,
    onProgress?: (savedCount: number, totalCount: number) => void
  ) => {
    const safeNewChapters = Array.isArray(newChapters) ? newChapters : [];
    const currentNovel = (novels || []).find((n) => n.id === novelId) || (selectedNovel && selectedNovel.id === novelId ? selectedNovel : null) || (batchUploadingNovel && batchUploadingNovel.id === novelId ? batchUploadingNovel : null);
    const existingChapters = (Array.isArray(currentNovel?.chapters) ? currentNovel.chapters : []).map((c) => ({
      ...c,
      content: '',
    }));

    const chapterMap = new Map<number, Chapter>();
    existingChapters.forEach((c) => chapterMap.set(Number(c.number), { ...c, content: '' }));
    safeNewChapters.forEach((c) => chapterMap.set(Number(c.number), {
      ...c,
      content: '', // Không chứa nội dung chữ trong state tổng để tối ưu bộ nhớ trình duyệt
    }));
    const combined = Array.from(chapterMap.values()).sort((a, b) => Number(a.number) - Number(b.number));
    const latestChap = combined[(combined?.length || 0) - 1];

    const fallback = createFallbackNovel(novelId, user?.displayName || 'Tác giả');
    const finalStatus = isCompleted !== undefined
      ? (isCompleted ? 'Hoàn thành' : 'Đang ra')
      : (currentNovel?.status || 'Đang ra');

    const totalCount = Math.max(currentNovel?.totalChapters || 0, combined?.length || 0, latestChap?.number || 0);

    const updatedNovelTarget: Novel = {
      ...(currentNovel || fallback),
      status: finalStatus,
      chapters: combined,
      totalChapters: totalCount,
      latestChapterTitle: latestChap?.title ? (latestChap.title.startsWith('Chương') ? latestChap.title : `Chương ${latestChap.number}: ${latestChap.title}`) : `Chương ${totalCount}`,
      latestChapterNumber: latestChap?.number || totalCount,
      updatedAt: Date.now(),
      lastChapterUpdatedAt: Date.now(),
      lastUpdated: 'Vừa xong',
    };

    setNovels((prev) => {
      const idx = prev.findIndex((n) => n.id === novelId);
      const updated = idx >= 0 ? prev.map((n) => (n.id === novelId ? updatedNovelTarget : n)) : [updatedNovelTarget, ...prev];
      saveNovelsToStorage(updated);
      return updated;
    });

    setSelectedNovel((curr) => (curr && curr.id === novelId ? updatedNovelTarget : curr));
    setBatchUploadingNovel(updatedNovelTarget);
    setBatchProgress({ active: true, novelTitle: updatedNovelTarget.title, saved: 1, total: safeNewChapters?.length || 0 });

    try {
      await saveBatchChaptersToFirestore(updatedNovelTarget, safeNewChapters, (saved, total) => {
        setBatchProgress((prev) => (prev ? { ...prev, saved, total } : null));
        if (onProgress) onProgress(saved, total);
      });
      setBatchProgress(null);
      showGlobalBanner(`🎉 Đã tải lên và lưu thành công ${safeNewChapters?.length || 0} chương mới vào "${updatedNovelTarget.title}"!`, 'success');
    } catch (err: any) {
      setBatchProgress(null);
      console.error('Lỗi đồng bộ hàng loạt chương lên Firestore:', err);
      showGlobalBanner(`Lưu ý kết nối: ${err?.message || 'Đường truyền mạng bị chậm'}. Dữ liệu các chương đã lưu an toàn trên máy của bạn, bạn có thể bấm lưu lại ngay mà không cần phải chờ!`, 'error');
      throw err;
    }
  };

  // Novel Submission from reader/author handler: Ghi thẳng lên Firestore collection "novel_submissions"
  // và nếu là đơn đăng ký Editor/Tác giả thì ghi thẳng lên "creator_applications"
  const handleSubmitNovelForApproval = async (subData: any) => {
    const submissionPayload = {
      ...subData,
      submittedBy: {
        userId: user?.id || 'usr-guest',
        userName: user?.displayName || subData.author || 'Tác giả',
        userEmail: user?.email || '',
      },
    };

    try {
      const createdSub = await submitNovelSubmissionToFirestore(submissionPayload);

      // Khi user gửi form đăng ký Editor/Tác giả, gọi hàm ghi thẳng dữ liệu lên collection creator_applications
      if (subData.isCreatorApplication) {
        await submitApplicationToFirestore({
          userId: user?.id || 'usr-guest',
          userName: user?.displayName || subData.author || 'Tác giả',
          userEmail: user?.email || '',
          roleType: Array.isArray(subData.publisherRoles) && subData.publisherRoles.includes('both') ? 'both' : ((Array.isArray(subData.publisherRoles) && subData.publisherRoles[0]) || 'author'),
          penName: subData.author || user?.displayName || 'Tác giả',
          bankInfo: subData.bankInfo || {
            bankName: '',
            accountNumber: '',
            accountHolder: '',
          },
          sampleNovel: {
            title: subData.title || '',
            mainCategory: subData.mainCategory || 'truyen-nam',
            categories: Array.isArray(subData.categories) ? subData.categories : ['Tổng Hợp'],
            description: subData.description || '',
            coverImage: subData.coverImage || '',
            chapters: Array.isArray(subData.chapters) ? subData.chapters : [],
          },
        }).catch((appErr) => {
          console.warn('Lỗi lưu đơn creator_applications vào Firestore:', appErr);
        });
      }

      if (createdSub) {
        setNovelSubmissions((prev) => [createdSub, ...prev.filter((s) => s.id !== createdSub.id)]);
      }

      // Thông báo chúc mừng gửi bản thảo thành công vào hòm thư
      setUser((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          notifications: [
            {
              id: `notif-${Date.now()}`,
              title: '📤 Đã Gửi Bản Thảo Duyệt',
              message: `Tác phẩm "${subData.title}" đã được gửi lên Ban Quản Trị Đạo Tâm để kiểm duyệt. Kết quả sẽ được cập nhật sớm nhất!`,
              type: 'system',
              createdAt: Date.now(),
              isRead: false,
            },
            ...(prev.notifications || []),
          ],
        };
      });
    } catch (err) {
      console.error('Lỗi gửi bản thảo / đơn đăng ký lên Firestore:', err);
      throw err;
    }
  };

  // Direct Publish novel by Author / Admin handler: Ghi thẳng vào collection novels bằng WriteBatch
  const handleDirectPublishNovel = async (newNovel: Novel) => {
    (newNovel as any).authorId = (newNovel as any).authorId || activeUser.id;
    (newNovel as any).authorEmail = (newNovel as any).authorEmail || activeUser.email;
    setNovels((prev) => [newNovel, ...prev.filter((n) => n.id !== newNovel.id)]);
    try {
      if (Array.isArray(newNovel.chapters) && (newNovel.chapters?.length || 0) > 0) {
        await saveNovelWithInitialChaptersBatch(newNovel, newNovel.chapters);
      } else {
        await saveNovelToFirestore(newNovel, { syncChapters: false });
      }
      // Bắn thông báo cho độc giả đang theo dõi tác giả / nhà đăng truyện
      notifyFollowersOfNewNovel(newNovel.author, newNovel.title, newNovel.id, {
        creatorId: (newNovel as any).authorId || newNovel.submittedBy?.userId || activeUser.id,
        creatorEmail: (newNovel as any).authorEmail || newNovel.submittedBy?.userEmail || activeUser.email,
        editorName: newNovel.editor,
        submittedByUserName: newNovel.submittedBy?.userName,
        displayLabel: newNovel.editor || newNovel.submittedBy?.userName || newNovel.author,
      }).catch((err) => {
        console.error('Lỗi gửi thông báo cho follower:', err);
      });
    } catch (err) {
      console.warn('Could not save novel to Firestore:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!user || !user.id || user.id === 'guest') return;
    const updated = (user.notifications || []).map((n) => ({ ...n, isRead: true }));
    setUser((prev) => (prev ? { ...prev, notifications: updated } : null));
    try {
      await Promise.all([
        updateUserState(user.id, { notifications: updated }),
        markNotificationsCollectionAsRead(user.id),
      ]);
    } catch (err) {
      console.error('Lỗi cập nhật đã đọc thông báo lên Firestore:', err);
    }
  };

  // Admin approves a novel submission -> converts to a live Novel and updates Firestore
  const handleApproveNovelSubmission = async (submissionId: string) => {
    let sub = novelSubmissions.find((s) => s.id === submissionId);
    if (!sub) {
      try {
        const subSnap = await getDoc(doc(db, 'novel_submissions', submissionId));
        if (subSnap.exists()) {
          sub = { ...(subSnap.data() as NovelSubmission), id: subSnap.id };
        }
      } catch (err) {
        console.warn('Không thể tải bản thảo từ Firestore khi duyệt:', err);
      }
    }
    if (!sub) return;

    try {
      setNovelSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, status: 'approved' } : s))
      );

      const slug = sub.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');

      const novelId = `novel-${Date.now()}`;
      const draftChaptersList: SubmissionChapterDraft[] = filterOutDummyChapters(
        Array.isArray(sub?.chapters) ? sub.chapters : []
      );

      const approvedChapters: Chapter[] = (draftChaptersList || []).map((dc) => {
        const { isVip, priceXu } = calculateChapterVip(dc.number, draftChaptersList?.length || 0);
        return {
          id: `${novelId}-c${dc.number}`,
          number: dc.number,
          title: dc.title,
          slug: `chuong-${dc.number}`,
          wordCount: dc.wordCount || (dc.content ? dc.content.split(/\s+/).filter(Boolean)?.length || 0 : 0),
          publishedDate: new Date().toISOString().split('T')[0],
          isVip,
          priceXu,
          content: dc.content,
        };
      });

      const approvedNovel: Novel = {
        id: novelId,
        title: sub.title,
        slug: `${slug}-${novelId}`,
        author: sub.author,
        editor: sub.editor,
        publisherRoles: sub.publisherRoles,
        isExclusive: sub.isExclusive,
        royaltyRate: sub.royaltyRate || (sub.publisherRoles?.includes('author') ? 0.98 : 0.90),
        coverImage: sub.coverImage,
        mainCategory: sub.mainCategory,
        isOriginal: sub.mainCategory === 'truyen-sang-tac',
        isShortStory: Boolean(sub.isShortStory),
        status: 'Đang ra',
        publishStatus: 'published',
        isHot: true,
        totalChapters: approvedChapters?.length || 0,
        views: 0,
        dailyViews: 0,
        rating: 5.0,
        categories: sub.categories,
        description: sub.description,
        translator: sub.editor || sub.submittedBy.userName,
        updatedAt: Date.now(),
        lastChapterUpdatedAt: Date.now(),
        lastUpdated: 'Vừa duyệt xong',
        hasAudio: true,
        fullBookPriceXu: 120,
        fullBookDiscountPriceXu: 85,
        chapters: approvedChapters,
        submittedBy: sub.submittedBy,
      };

      (approvedNovel as any).authorId = sub.submittedBy?.userId;
      (approvedNovel as any).authorEmail = sub.submittedBy?.userEmail;

      setNovels((prev) => [approvedNovel, ...prev.filter((n) => n.id !== approvedNovel.id)]);

      // Batch Write cho luật 5 chương: gom 1 thao tác ghi truyện, 5 thao tác ghi chương và cập nhật submission vào chung 1 luồng WriteBatch
      await saveNovelWithInitialChaptersBatch(approvedNovel, approvedChapters, submissionId);

      // Gửi thông báo cho tất cả độc giả đang theo dõi tác giả / nhà đăng truyện
      notifyFollowersOfNewNovel(sub.author, sub.title, approvedNovel.id, {
        creatorId: sub.submittedBy?.userId,
        creatorEmail: sub.submittedBy?.userEmail,
        editorName: sub.editor,
        submittedByUserName: sub.submittedBy?.userName,
        displayLabel: sub.editor || sub.submittedBy?.userName || sub.author,
      }).catch((err) => {
        console.error('Lỗi gửi thông báo cho follower:', err);
      });

      // Nâng cấp quyền tác giả & gửi thông báo phê duyệt vào tài khoản người nộp trong Firestore
      if (sub.submittedBy?.userId || sub.submittedBy?.userEmail) {
        await upgradeAuthorAndSendNotification(
          sub.submittedBy?.userId || '',
          sub.submittedBy?.userEmail || '',
          sub.title,
          approvedNovel.id,
          sub.bankInfo
        ).catch((err) => console.error('Lỗi upgradeAuthorAndSendNotification:', err));
      }

      // Nếu người đăng nhập hiện tại chính là tác giả (hoặc cùng email hoặc cùng tên), cập nhật state tức thì
      const isCurrentUser = 
        (user?.id && user.id === sub.submittedBy?.userId) ||
        (user?.email && sub.submittedBy?.userEmail && user.email.toLowerCase().trim() === sub.submittedBy.userEmail.toLowerCase().trim()) ||
        (activeUser?.id && activeUser.id === sub.submittedBy?.userId) ||
        (activeUser?.email && sub.submittedBy?.userEmail && activeUser.email.toLowerCase().trim() === sub.submittedBy.userEmail.toLowerCase().trim()) ||
        (activeUser?.displayName && sub.author && activeUser.displayName.toLowerCase().trim() === sub.author.toLowerCase().trim());

      if (isCurrentUser) {
        setUser((prev) => {
          if (!prev) return null;
          const isEmailAdmin = checkIsAdmin(prev.email);
          const nextRole = isEmailAdmin ? 'admin' : 'author';
          const updated: UserProfile = {
            ...prev,
            role: nextRole,
            bankInfo: sub.bankInfo || prev.bankInfo,
            notifications: [
              {
                id: `approved-${Date.now()}`,
                title: '🎉 Bản thảo truyện đã được Admin phê duyệt',
                message: `Chúc mừng bạn! Bản thảo tác phẩm "${sub.title}" đã được Admin phê duyệt và xuất bản chính thức trên Đạo Tâm! Tài khoản của bạn đã được nâng cấp quyền Tác Giả / Editor.`,
                type: 'novel_approved',
                createdAt: Date.now(),
                isRead: false,
                novelId: approvedNovel.id,
              },
              ...(prev.notifications || []),
            ],
          };
          return updated;
        });
      }
    } catch (err) {
      console.error('Lỗi duyệt bản thảo:', err);
    }
  };

  const handleRejectNovelSubmission = async (submissionId: string, reason?: string) => {
    const sub = novelSubmissions.find((s) => s.id === submissionId);
    try {
      if (sub && (sub.submittedBy?.userId || sub.submittedBy?.userEmail)) {
        await rejectNovelSubmissionAndNotify(
          submissionId,
          sub.submittedBy.userId || '',
          sub.submittedBy.userEmail || '',
          sub.title,
          reason
        );
      } else {
        await updateNovelSubmissionStatusInFirestore(submissionId, 'rejected', reason);
      }
      setNovelSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, status: 'rejected', rejectionReason: reason } : s))
      );

      // Nếu tài khoản hiện tại chính là người bị từ chối, cập nhật thông báo và giữ nguyên quyền reader
      const isCurrentUser =
        (user?.id && user.id === sub?.submittedBy?.userId) ||
        (user?.email && sub?.submittedBy?.userEmail && user.email.toLowerCase().trim() === sub.submittedBy.userEmail.toLowerCase().trim());
      if (isCurrentUser) {
        setUser((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            role: prev.role === 'admin' ? 'admin' : 'reader',
            notifications: [
              {
                id: `rejected-${Date.now()}`,
                title: 'Thông báo xét duyệt truyện',
                message: `Truyện của bạn đã bị từ chối với lý do: ${reason || 'Chưa đạt tiêu chuẩn kiểm duyệt nội dung của Đạo Tâm'}`,
                type: 'system',
                createdAt: Date.now(),
                isRead: false,
              },
              ...(prev.notifications || []),
            ],
          };
        });
      }
    } catch (err) {
      console.error('Lỗi từ chối bản thảo:', err);
    }
  };

  // Ẩn hoặc Hiện truyện (Dành cho Quản Trị Viên)
  const handleToggleHideNovel = async (novelId: string) => {
    const targetNovel = novels.find((n) => n.id === novelId) || (selectedNovel?.id === novelId ? selectedNovel : null);
    const nextHiddenState = !(targetNovel?.isHidden);
    const novelTitle = targetNovel?.title || novelId;

    setNovels((prev) => {
      const next = prev.map((n) => {
        if (n.id === novelId) {
          return {
            ...n,
            isHidden: nextHiddenState,
            publishStatus: (nextHiddenState ? 'hidden' : 'published') as 'hidden' | 'published',
          };
        }
        return n;
      });
      saveNovelsToStorage(next);
      return next;
    });

    if (selectedNovel && selectedNovel.id === novelId) {
      setSelectedNovel((prev) =>
        prev
          ? {
              ...prev,
              isHidden: nextHiddenState,
              publishStatus: nextHiddenState ? 'hidden' : 'published',
            }
          : null
      );
    }

    try {
      await toggleHideNovelInFirestore(novelId, nextHiddenState);
      showGlobalBanner(
        nextHiddenState 
          ? `Đã ẩn truyện "${novelTitle}" khỏi trang chủ thành công!` 
          : `Đã hiển thị lại truyện "${novelTitle}" trên trang chủ!`,
        'success'
      );
    } catch (err: any) {
      console.warn('Could not toggle hide novel in Firestore:', err);
      showGlobalBanner(`Lỗi khi cập nhật trạng thái ẩn/hiện: ${err?.message || 'Thất bại'}`, 'error');
    }
  };

  // Xóa vĩnh viễn truyện khỏi hệ thống (Dành cho Quản Trị Viên & Tác giả)
  const handleDeleteNovel = async (novelId: string) => {
    const targetNovel = novels.find((n) => n.id === novelId) || (selectedNovel?.id === novelId ? selectedNovel : null);
    const novelTitle = targetNovel?.title || 'bộ truyện';
    deletingNovelIdsRef.current.add(novelId);
    if (targetNovel?.slug) deletingNovelIdsRef.current.add(targetNovel.slug);

    setNovels((prev) => {
      const next = prev.filter((n) => n.id !== novelId && (!targetNovel?.slug || n.slug !== targetNovel.slug));
      saveNovelsToStorage(next);
      return next;
    });
    if (selectedNovel && selectedNovel.id === novelId) {
      setSelectedNovel(null);
      setSelectedChapter(null);
      navigate('/');
    }
    try {
      await deleteNovelFromFirestore(novelId, {
        slug: targetNovel?.slug,
        title: targetNovel?.title,
        totalChapters: targetNovel?.totalChapters,
      });
      showGlobalBanner(`Đã xóa vĩnh viễn "${novelTitle}" và toàn bộ dữ liệu chương thành công!`, 'success');
      setTimeout(() => {
        deletingNovelIdsRef.current.delete(novelId);
        if (targetNovel?.slug) deletingNovelIdsRef.current.delete(targetNovel.slug);
      }, 10000);
    } catch (err: any) {
      console.warn('Could not delete novel from Firestore:', err);
      showGlobalBanner(`Có lỗi khi xóa bộ truyện: ${err?.message || 'Thất bại'}`, 'error');
      deletingNovelIdsRef.current.delete(novelId);
      if (targetNovel?.slug) deletingNovelIdsRef.current.delete(targetNovel.slug);
    }
  };

  // Chuyển sang TRANG Chỉnh sửa Truyện & Chương trong web (nền trắng, chữ đen/hồng, không phải popup)
  const handleOpenEditNovel = (novel: Novel) => {
    setEditingNovel(novel);
    setIsEditNovelOpen(false);
    setIsAdminOpen(false);
    setSelectedNovel(null);
    setSelectedChapter(null);
    setSelectedCreator(null);
    setActivePageView('edit-novel');
    navigate(`/truyen/${novel.slug || novel.id}/chinh-sua`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Chuyển sang TRANG Đăng Nhiều Chương trong web (cấu trúc dán nhanh, set 0 xu hoặc set VIP từ chương X, set lẻ từng chương)
  const handleOpenBatchUpload = (novel: Novel) => {
    setBatchUploadingNovel(novel);
    setPublishingChapterNovel(null);
    setEditingNovel(null);
    setIsEditNovelOpen(false);
    setIsAdminOpen(false);
    setSelectedNovel(null);
    setSelectedChapter(null);
    setSelectedCreator(null);
    setActivePageView('batch-upload');
    navigate(`/truyen/${novel.slug || novel.id}/dang-nhieu-chuong`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Chuyển sang TRANG Đăng Chương Mới (Tự động tính số thứ tự chương tiếp theo, hiện form soạn chương mới)
  const handleOpenPublishChapter = (novel: Novel) => {
    setPublishingChapterNovel(novel);
    setBatchUploadingNovel(null);
    setEditingNovel(null);
    setIsEditNovelOpen(false);
    setIsAdminOpen(false);
    setSelectedNovel(null);
    setSelectedChapter(null);
    setSelectedCreator(null);
    setActivePageView('publish-chapter');
    navigate(`/truyen/${novel.slug || novel.id}/dang-chuong`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Xuất bản chương mới cho bộ truyện (Đồng bộ vào State, localStorage và Firestore)
  const handlePublishNewChapter = async (novelId: string, chapterData: {
    title: string;
    number: number;
    content: string;
    isVip: boolean;
    priceXu: number;
    authorNote?: string;
  }, isCompleted?: boolean) => {
    const newChapter: Chapter = {
      id: `${novelId}-c${chapterData.number}`,
      number: chapterData.number,
      title: chapterData.title,
      slug: `chuong-${chapterData.number}`,
      wordCount: chapterData.content.split(/\s+/).filter(Boolean).length,
      publishedDate: new Date().toISOString().split('T')[0],
      isVip: chapterData.isVip,
      priceXu: chapterData.isVip ? chapterData.priceXu : 0,
      content: chapterData.content,
    };

    const currentNovel = (novels || []).find((n) => n.id === novelId) 
      || (selectedNovel && selectedNovel.id === novelId ? selectedNovel : null) 
      || (publishingChapterNovel && publishingChapterNovel.id === novelId ? publishingChapterNovel : null);

    let existingChapters = Array.isArray(currentNovel?.chapters) ? currentNovel.chapters : [];
    if ((existingChapters?.length || 0) < (currentNovel?.totalChapters || 0)) {
      try {
        const fetched = await fetchChaptersForNovel(novelId);
        if (Array.isArray(fetched) && fetched.length > (existingChapters?.length || 0)) {
          existingChapters = fetched;
        }
      } catch (e) {}
    }

    const exists = (existingChapters || []).some((c) => Number(c.number) === Number(chapterData.number));
    const mergedChapters = exists
      ? (existingChapters || []).map((c) => (Number(c.number) === Number(chapterData.number) ? { ...c, ...newChapter } : c))
      : [...(existingChapters || []), newChapter].sort((a, b) => Number(a.number) - Number(b.number));

    const latestChap = mergedChapters[(mergedChapters?.length || 0) - 1];
    const finalStatus = isCompleted !== undefined
      ? (isCompleted ? 'Hoàn thành' : 'Đang ra')
      : (currentNovel?.status || 'Đang ra');

    const totalCount = Math.max(currentNovel?.totalChapters || 0, mergedChapters?.length || 0, chapterData.number);

    const fallback = createFallbackNovel(novelId, user?.displayName || 'Tác giả');
    const updatedNovelTarget: Novel = {
      ...(currentNovel || fallback),
      status: finalStatus,
      chapters: mergedChapters,
      totalChapters: totalCount,
      latestChapterTitle: latestChap?.title ? (latestChap.title.startsWith('Chương') ? latestChap.title : `Chương ${latestChap.number}: ${latestChap.title}`) : `Chương ${chapterData.number}: ${chapterData.title}`,
      latestChapterNumber: latestChap?.number || chapterData.number,
      updatedAt: Date.now(),
      lastChapterUpdatedAt: Date.now(),
      lastUpdated: 'Vừa xong',
    };

    // 1. Cập nhật state novels và localStorage
    setNovels((prev) => {
      const idx = prev.findIndex((n) => n.id === novelId);
      const updated = idx >= 0 ? prev.map((n) => (n.id === novelId ? updatedNovelTarget : n)) : [updatedNovelTarget, ...prev];
      saveNovelsToStorage(updated);
      return updated;
    });

    // 2. Cập nhật selectedNovel nếu đang xem truyện này
    setSelectedNovel((curr) => (curr && curr.id === novelId ? updatedNovelTarget : curr));

    // 3. Cập nhật lại state của novel đang soạn
    setPublishingChapterNovel(updatedNovelTarget);

    // 4. Đồng bộ trực tiếp lên Firestore: Cả document tổng và subcollection 'chapters'
    try {
      if (newChapter.content) {
        safeSetItem(`chapter_full_${novelId}_${newChapter.number}`, newChapter.content);
        safeSetItem(`chapter_full_${novelId}_${newChapter.id}`, newChapter.content);
      }
      await Promise.all([
        saveNovelToFirestore(updatedNovelTarget, { syncChapters: false }),
        addSingleChapterToFirestore(novelId, newChapter),
      ]);
    } catch (err) {
      console.warn('Could not sync novel and new chapter to Firestore:', err);
    }

    // Thông báo cho tác giả
    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        notifications: [
          {
            id: `notif-${Date.now()}`,
            title: '📖 Đã Xuất Bản Chương Mới Thành Công',
            message: `Chương ${chapterData.number}: "${chapterData.title}" (${chapterData.isVip ? `VIP ${formatXu(chapterData.priceXu)} Xu` : 'Miễn phí'}) của truyện "${updatedNovelTarget?.title || ''}" đã được đăng thành công!`,
            type: 'system',
            createdAt: Date.now(),
            isRead: false,
          },
          ...(prev.notifications || []),
        ],
      };
    });
  };

  // QUAY VỀ MÀN HÌNH CHÍNH (Đồng bộ triệt để mọi trạng thái: Trang chủ, đóng hết trang con/modal/bộ lọc/chương đang đọc)
  const handleReturnToHome = () => {
    navigate('/');
    setActivePageView(null);
    setSelectedNovel(null);
    setSelectedChapter(null);
    setSelectedCreator(null);
    setSelectedGenre(null);
    setSelectedMainCategory('all');
    setIsShortStoryMode(false);
    setCurrentTab('latest');
    setSearchQuery('');
    setRouteError(null);
    setIsResolvingRoute(false);
    setEditingNovel(null);
    setBatchUploadingNovel(null);
    setPublishingChapterNovel(null);
    setIsEditNovelOpen(false);
    setIsAdminOpen(false);
    setIsSubmitNovelOpen(false);
    setIsAccountModalOpen(false);
    setIsTopUpOpen(false);
    setIsVipPurchaseOpen(false);
    setIsArchitectureOpen(false);
    setIsDailyRewardOpen(false);
    setIsNominateOpen(false);
    setIsReportOpen(false);
    setIsEditProfileOpen(false);
    setIsRegisterCreatorOpen(false);
    setIsInterestedNovelsOpen(false);
    setIsFollowingNovelsOpen(false);
    setIsUserInfoOpen(false);
    setIsChangePasswordOpen(false);
    setIsAuthorShowcaseOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Điều hướng mở chi tiết bộ truyện với URL riêng biệt (/truyen/:id-hoac-slug)
  const handleSelectNovel = (n: Novel) => {
    const slugOrId = n.slug || n.id;
    navigate(`/truyen/${slugOrId}`);
    setSelectedNovel(n);
    setSelectedChapter(null);
    setSelectedCreator(null);
    setActivePageView(null);
    setRouteError(null);
    setIsResolvingRoute(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Điều hướng mở chương đọc truyện với URL riêng biệt (/truyen/:id/chuong-:so)
  // Hỗ trợ tham số ?autoPlay=true khi người dùng nhấn nút 'Nghe Audio'
  const handleSelectChapter = (novelWithChapters: Novel, chapter: Chapter, autoPlay?: boolean) => {
    const slugOrId = novelWithChapters.slug || novelWithChapters.id;
    const searchParam = autoPlay ? '?autoPlay=true' : '';
    navigate(`/truyen/${slugOrId}/chuong-${chapter.number}${searchParam}`);
    setSelectedNovel(novelWithChapters);
    setSelectedChapter(chapter);
    setSelectedCreator(null);
    setActivePageView(null);
    setRouteError(null);
    setIsResolvingRoute(false);
    if (autoPlay) {
      safeSetItem('daotam_audio_active', 'true');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleSilentAudioChapterChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ novel?: Novel; chapter?: Chapter }>).detail;
      if (!detail?.novel || !detail?.chapter) return;
      if (selectedNovel?.id === detail.novel.id && selectedChapter) {
        if (
          selectedChapter.id !== detail.chapter.id ||
          Number(selectedChapter.number) !== Number(detail.chapter.number)
        ) {
          setSelectedChapter(detail.chapter);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    };
    window.addEventListener(
      'daotam:audio-chapter-changed',
      handleSilentAudioChapterChanged as EventListener
    );
    return () => {
      window.removeEventListener(
        'daotam:audio-chapter-changed',
        handleSilentAudioChapterChanged as EventListener
      );
    };
  }, [selectedNovel?.id, selectedChapter]);

  // =========================================================================
  // BỘ ĐỒNG BỘ ĐỊA CHỈ URL (REACT ROUTER) - ĐẢM BẢO F5 / COPY LINK KHÔNG VĂNG TRANG CHỦ
  // Hỗ trợ: /truyen/:novelId, /truyen/:novelId/chuong-:chapterNum, /tac-gia/:name,
  // /tu-truyen, /dang-truyen, /lich-su-doc, /truyen-da-luu, /thong-ke
  // =========================================================================
  useEffect(() => {
    const pathname = location.pathname;

    // 1. Trang chủ (Root /)
    if (pathname === '/' || pathname === '') {
      setIsResolvingRoute(false);
      setRouteError(null);
      if (isShortStoryMode && !location.search.includes('format=short')) {
        setIsShortStoryMode(false);
      }
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (selectedCreator) setSelectedCreator(null);
      if (activePageView) setActivePageView(null);
      return;
    }

    // 1.1. Trang danh sách Truyện Ngắn: /truyen-ngan hoặc /danh-sach?format=short
    if (pathname === '/truyen-ngan' || (pathname === '/danh-sach' && location.search.includes('format=short'))) {
      setIsResolvingRoute(false);
      setRouteError(null);
      setIsShortStoryMode(true);
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (selectedCreator) setSelectedCreator(null);
      if (activePageView) setActivePageView(null);

      // Query trực tiếp từ Firestore với điều kiện where('isShortStory', '==', true)
      fetchShortStoriesFromFirestore(50).then((stories) => {
        if ((stories?.length || 0) > 0) {
          setNovels((prev) => {
            const mergedMap = new Map<string, Novel>();
            stories.forEach((st) => mergedMap.set(st.id, st));
            prev.forEach((p) => {
              if (!mergedMap.has(p.id)) mergedMap.set(p.id, p);
            });
            return Array.from(mergedMap.values());
          });
        }
      }).catch((err) => console.warn('Lỗi tải truyện ngắn Firestore:', err));
      return;
    }

    // 2. Các trang tính năng độc lập
    if (pathname === '/login') {
      setIsResolvingRoute(false);
      setRouteError(null);
      setAuthModalMode('login');
      setIsAuthModalOpen(true);
      return;
    }
    if (pathname === '/admin/messages') {
      setIsResolvingRoute(false);
      setRouteError(null);
      setIsAdminMessagesOpen(true);
      return;
    }
    // Route Tủ truyện của bạn: BẮT BUỘC là Trang (Page) riêng biệt, không dùng Modal/Popup
    if (pathname === '/tu-truyen-cua-ban') {
      setIsResolvingRoute(false);
      setRouteError(null);
      if (activePageView !== 'purchased-novels') setActivePageView('purchased-novels');
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (selectedCreator) setSelectedCreator(null);
      return;
    }
    if (pathname === '/tu-truyen') {
      setIsResolvingRoute(false);
      setRouteError(null);
      if (activePageView !== 'my-novels') setActivePageView('my-novels');
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (selectedCreator) setSelectedCreator(null);
      return;
    }
    if (pathname === '/dang-truyen') {
      setIsResolvingRoute(false);
      setRouteError(null);
      if (activePageView !== 'submit-novel') setActivePageView('submit-novel');
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (selectedCreator) setSelectedCreator(null);
      return;
    }
    if (pathname === '/lich-su-doc') {
      setIsResolvingRoute(false);
      setRouteError(null);
      if (activePageView !== 'reading-history') setActivePageView('reading-history');
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (selectedCreator) setSelectedCreator(null);
      return;
    }
    if (pathname === '/truyen-da-luu') {
      setIsResolvingRoute(false);
      setRouteError(null);
      if (activePageView !== 'saved-novels') setActivePageView('saved-novels');
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (selectedCreator) setSelectedCreator(null);
      return;
    }
    if (pathname === '/thong-ke') {
      setIsResolvingRoute(false);
      setRouteError(null);
      if (activePageView !== 'stats') setActivePageView('stats');
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (selectedCreator) setSelectedCreator(null);
      return;
    }

    // 3. Trang cá nhân Tác giả / Editor: /tac-gia/:creatorName
    const creatorMatch = pathname.match(/^\/tac-gia\/([^/]+)$/);
    if (creatorMatch) {
      setIsResolvingRoute(false);
      setRouteError(null);
      const creatorName = decodeURIComponent(creatorMatch[1]);
      if (activePageView) setActivePageView(null);
      if (selectedNovel) setSelectedNovel(null);
      if (selectedChapter) setSelectedChapter(null);
      if (!selectedCreator || selectedCreator.name.toLowerCase() !== creatorName.toLowerCase()) {
        handleSelectCreator(creatorName);
      }
      return;
    }

    // 4. Các URL theo bộ truyện: /truyen/:novelId/...
    const batchMatch = pathname.match(/^\/truyen\/([^/]+)\/dang-nhieu-chuong$/);
    const publishMatch = pathname.match(/^\/truyen\/([^/]+)\/dang-chuong$/);
    const editMatch = pathname.match(/^\/truyen\/([^/]+)\/chinh-sua$/);
    const chapterMatch =
      !batchMatch && !publishMatch && !editMatch
        ? pathname.match(/^\/truyen\/([^/]+)\/chuong\/([^/]+)$/) ||
          pathname.match(/^\/truyen\/([^/]+)\/([^/]+)$/)
        : null;
    const novelMatch = !batchMatch && !publishMatch && !editMatch && !chapterMatch ? pathname.match(/^\/truyen\/([^/]+)$/) : null;

    if (batchMatch || publishMatch || editMatch || chapterMatch || novelMatch) {
      const rawId = decodeURIComponent(
        batchMatch ? batchMatch[1] :
        publishMatch ? publishMatch[1] :
        editMatch ? editMatch[1] :
        chapterMatch ? chapterMatch[1] :
        novelMatch![1]
      );

      const target = rawId.trim().toLowerCase();

      const findInList = (list: Novel[]) => list.find((n) => 
        n.id.toLowerCase() === target ||
        (n.slug && n.slug.toLowerCase() === target) ||
        n.title.toLowerCase() === target
      );

      let foundNovel = findInList(novels);

      const applyResolvedNovel = async (novelItem: Novel) => {
        if (editMatch) {
          setEditingNovel(novelItem);
          setActivePageView('edit-novel');
          setSelectedNovel(null);
          setSelectedChapter(null);
          setIsResolvingRoute(false);
          setRouteError(null);
          return;
        }
        if (batchMatch) {
          setBatchUploadingNovel(novelItem);
          setActivePageView('batch-upload');
          setSelectedNovel(null);
          setSelectedChapter(null);
          setIsResolvingRoute(false);
          setRouteError(null);
          return;
        }
        if (publishMatch) {
          setPublishingChapterNovel(novelItem);
          setActivePageView('publish-chapter');
          setSelectedNovel(null);
          setSelectedChapter(null);
          setIsResolvingRoute(false);
          setRouteError(null);
          return;
        }

        // Tải đầy đủ chương nếu truyện chưa có mảng chapters
        let fullNovel = novelItem;
        if (!fullNovel.chapters || (fullNovel.chapters?.length || 0) === 0) {
          try {
            const remoteChapters = await fetchChaptersForNovel(fullNovel.id);
            if ((remoteChapters?.length || 0) > 0) {
              fullNovel = {
                ...fullNovel,
                chapters: remoteChapters || [],
                totalChapters: Math.max(fullNovel.totalChapters || 0, remoteChapters?.length || 0),
              };
            } else {
              fullNovel = {
                ...fullNovel,
                chapters: fullNovel.chapters || [],
              };
            }
          } catch (e) {
            fullNovel = {
              ...fullNovel,
              chapters: fullNovel.chapters || [],
            };
          }
        }

        setSelectedNovel(fullNovel);
        setActivePageView(null);
        setSelectedCreator(null);

        if (novelMatch) {
          setSelectedChapter(null);
        } else if (chapterMatch) {
          const rawChapParam = decodeURIComponent(chapterMatch[2]);
          const chapNum = parseInt(rawChapParam.replace(/[^0-9]/g, ''), 10);

          const matchedChap = fullNovel.chapters?.find((c) => 
            (chapNum > 0 && c.number === chapNum) ||
            c.slug === rawChapParam ||
            c.id === rawChapParam ||
            c.slug === `chuong-${chapNum}` ||
            c.id === `c-${chapNum}`
          ) || fullNovel.chapters?.[0] || null;

          setSelectedChapter(matchedChap);

          // 3. ĐÓN LUỒNG AUTO-PLAY: Kiểm tra tham số ?autoPlay=true từ URL
          const searchParams = new URLSearchParams(location.search);
          if (searchParams.get('autoPlay') === 'true') {
            safeSetItem('daotam_audio_active', 'true');
          }

          // Cuộn tới #comments nếu đường dẫn chứa hash #comments
          if (location.hash === '#comments') {
            setTimeout(() => {
              const el = document.getElementById('comments');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
          }
        }

        setIsResolvingRoute(false);
        setRouteError(null);
      };

      if (foundNovel) {
        // Tránh giật màn hình nếu đã hiển thị đúng novel và chapter
        if (novelMatch && selectedNovel?.id === foundNovel.id && selectedChapter === null) {
          setIsResolvingRoute(false);
          return;
        }
        if (chapterMatch && selectedNovel?.id === foundNovel.id && selectedChapter) {
          const rawChapParam = decodeURIComponent(chapterMatch[2]);
          const chapNum = parseInt(rawChapParam.replace(/[^0-9]/g, ''), 10);
          if (selectedChapter.number === chapNum || selectedChapter.slug === rawChapParam) {
            setIsResolvingRoute(false);
            return;
          }
        }

        applyResolvedNovel(foundNovel);
      } else {
        // Chưa có trong local -> tải trực tiếp từ Firestore database qua fetchNovelBySlugOrId
        setIsResolvingRoute(true);
        fetchNovelBySlugOrId(rawId).then((singleNovel) => {
          if (singleNovel) {
            setNovels((prev) => {
              const exists = prev.some((n) => n.id === singleNovel.id);
              const updated = exists ? prev.map((n) => (n.id === singleNovel.id ? singleNovel : n)) : [singleNovel, ...prev];
              saveNovelsToStorage(updated);
              return updated;
            });
            applyResolvedNovel(singleNovel);
          } else {
            // Fallback: Kiểm tra thêm danh sách mới nhất từ Firestore
            fetchNovelsFromFirestore().then((remoteNovels) => {
              const safeRemoteNovels = Array.isArray(remoteNovels) ? remoteNovels : [];
              const remoteFound = findInList(safeRemoteNovels);
              if (remoteFound) {
                setNovels(safeRemoteNovels);
                applyResolvedNovel(remoteFound);
              } else {
                setIsResolvingRoute(false);
                setRouteError(`Không tìm thấy bộ truyện "${rawId}". Bộ truyện này có thể đã bị xóa hoặc chưa xuất bản.`);
              }
            }).catch((err) => {
              setIsResolvingRoute(false);
              setRouteError(`Không tìm thấy bộ truyện "${rawId}". Bộ truyện này có thể đã bị xóa hoặc chưa xuất bản.`);
            });
          }
        }).catch((err) => {
          setIsResolvingRoute(false);
          setRouteError(`Lỗi kết nối khi tải truyện: ${err.message || 'Vui lòng kiểm tra lại đường truyền mạng'}`);
        });
      }
      return;
    }

    // Không khớp bất kỳ định dạng nào -> trang chủ
    setIsResolvingRoute(false);
  }, [location.pathname]);

  // Lưu thông tin & danh sách chương sau khi Admin / Tác giả chỉnh sửa
  const handleSaveEditedNovel = async (updatedNovel: Novel) => {
    const sanitizedNovel: Novel = {
      ...updatedNovel,
      chapters: Array.isArray(updatedNovel.chapters)
        ? (updatedNovel.chapters || []).map((c) => ({ ...c, content: '' }))
        : (updatedNovel.chapters || []),
    };
    setNovels((prev) => {
      const next = prev.map((n) => (n.id === sanitizedNovel.id ? sanitizedNovel : n));
      saveNovelsToStorage(next);
      return next;
    });
    if (selectedNovel && selectedNovel.id === sanitizedNovel.id) {
      setSelectedNovel(sanitizedNovel);
    }
    try {
      await saveNovelToFirestore(sanitizedNovel, { syncChapters: false });
      showGlobalBanner(`Đã lưu thay đổi cho bộ truyện "${sanitizedNovel.title}" thành công!`, 'success');
    } catch (err: any) {
      console.error('Could not save edited novel to Firestore:', err);
      showGlobalBanner(`Lỗi khi lưu thay đổi lên máy chủ: ${err?.message || 'Thất bại'}`, 'error');
      throw err;
    }
  };

  // Đồng bộ tức thì audioUrl của 1 chương vào state của App sau khi Admin tải lên hoặc tạo MP3 GitHub
  const handleChapterAudioUpdated = (novelId: string, updatedChapter: Chapter) => {
    const patchChaptersList = (chaps?: Chapter[]) => {
      if (!Array.isArray(chaps)) return chaps;
      return chaps.map((c) =>
        (updatedChapter.id && c.id === updatedChapter.id) ||
        (Number(c.number) > 0 && Number(c.number) === Number(updatedChapter.number))
          ? { ...c, audioUrl: updatedChapter.audioUrl }
          : c
      );
    };

    setNovels((prev) => {
      const next = (prev || []).map((n) =>
        n.id === novelId
          ? { ...n, chapters: patchChaptersList(n.chapters) || [], updatedAt: Date.now() }
          : n
      );
      saveNovelsToStorage(next);
      return next;
    });

    setSelectedNovel((prev) =>
      prev && prev.id === novelId
        ? { ...prev, chapters: patchChaptersList(prev.chapters) || [] }
        : prev
    );
    setEditingNovel((prev) =>
      prev && prev.id === novelId
        ? { ...prev, chapters: patchChaptersList(prev.chapters) || [] }
        : prev
    );
    setSelectedChapter((prev) =>
      prev &&
      ((updatedChapter.id && prev.id === updatedChapter.id) ||
        (Number(prev.number) > 0 && Number(prev.number) === Number(updatedChapter.number)))
        ? { ...prev, audioUrl: updatedChapter.audioUrl }
        : prev
    );
  };

  // Mở modal Báo Cáo Vi Phạm Truyện
  const handleOpenReport = (novel: Novel) => {
    setReportingNovel(novel);
    setIsReportOpen(true);
  };

  // Người dùng gửi báo cáo vi phạm tác phẩm: Lưu thẳng lên Firestore collection "novel_reports"
  const handleSubmitReport = async (report: NovelReport) => {
    try {
      const created = await submitNovelReportToFirestore(report);
      if (created && user?.role === 'admin') {
        setNovelReports((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      }
      setUser((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          notifications: [
            {
              id: `notif-${Date.now()}`,
              title: '🚩 Đã Gửi Báo Cáo Vi Phạm',
              message: `Cảm ơn bạn đã báo cáo tác phẩm "${report.novelTitle}". Ban Quản Trị sẽ xác minh và xử lý nghiêm theo quy chế.`,
              type: 'system',
              createdAt: Date.now(),
              isRead: false,
            },
            ...(prev.notifications || []),
          ],
        };
      });
    } catch (err) {
      console.error('Lỗi gửi báo cáo lên Firestore:', err);
    }
  };

  // Admin xử lý báo cáo vi phạm: Cập nhật Firestore
  const handleResolveReport = async (
    reportId: string, 
    action: 'dismiss' | 'hide_novel' | 'delete_novel' | 'ban_author', 
    novelId: string
  ) => {
    const report = novelReports.find((r) => r.id === reportId);
    if (!report) return;

    try {
      await updateNovelReportStatusInFirestore(reportId, 'resolved', action);
      setNovelReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                status: 'resolved',
                adminNotes: action,
              }
            : r
        )
      );

      if (action === 'hide_novel') {
        handleToggleHideNovel(novelId);
      } else if (action === 'delete_novel') {
        handleDeleteNovel(novelId);
      } else if (action === 'ban_author') {
        // Ẩn hoặc xóa tác phẩm vi phạm
        handleToggleHideNovel(novelId);
        // Hủy và từ chối toàn bộ lệnh rút tiền chưa giải ngân của tác giả này
        setWithdrawalRequests((prev) =>
          prev.map((req) => {
            if (req.authorName === report.author || req.authorEmail === user?.email) {
              return {
                ...req,
                status: 'rejected',
                rejectionReason: 'Vi phạm bản quyền / 18+ / chính sách - Tịch thu toàn bộ doanh thu tháng & cấm tài khoản vĩnh viễn',
              };
            }
            return req;
          })
        );
        // Nếu chính tài khoản đang đăng nhập là tác giả bị phạt
        if (user?.displayName === report.author) {
          setUser((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              isBanned: true,
              authorEarnedXu: 0,
              notifications: [
                {
                  id: `notif-${Date.now()}`,
                  title: '🚫 TÀI KHOẢN BỊ KHÓA VĨNH VIỄN DO VI PHẠM',
                  message: 'Tài khoản của bạn đã bị cấm vĩnh viễn và mất toàn bộ doanh thu tháng do vi phạm chính sách tác quyền/nội dung theo quyết định của Ban Quản Trị.',
                  type: 'system',
                  createdAt: Date.now(),
                  isRead: false,
                },
                ...(prev.notifications || []),
              ],
            };
          });
        }
      }
    } catch (err) {
      console.error('Lỗi xử lý báo cáo trên Firestore:', err);
    }
  };

  // VIP Purchase & Unlock (Bảo vệ bằng Firestore runTransaction - tuyệt đối không trừ tiền ở client)
  const executeUnlockPurchase = async (
    type: 'chapter' | 'full_book',
    price: number,
    targetNovel?: Novel | null,
    targetChapter?: Chapter | null
  ): Promise<boolean> => {
    const novel = targetNovel || purchasingTarget?.novel || selectedNovel;
    const chapter = targetChapter || purchasingTarget?.chapter || selectedChapter;
    const targetUser = user || activeUser;

    if (!targetUser || !targetUser.isLoggedIn || targetUser.id === 'guest') {
      setAuthModalMode('login');
      setIsAuthModalOpen(true);
      return false;
    }

    if (!novel) {
      showGlobalBanner('Không tìm thấy thông tin tác phẩm để mở khóa.', 'error');
      return false;
    }

    const chapterIdentifiers: string[] = [];
    if (type === 'full_book') {
      for (const ch of (Array.isArray(novel.chapters) ? novel.chapters : [])) {
        if (ch.id) chapterIdentifiers.push(ch.id);
        if (ch.number !== undefined) {
          chapterIdentifiers.push(String(ch.number));
          chapterIdentifiers.push(`c${ch.number}`);
          chapterIdentifiers.push(`${novel.id}-c${ch.number}`);
        }
        if (ch.slug) chapterIdentifiers.push(ch.slug);
      }
    }

    let txResult;
    try {
      txResult = await purchaseVipItemWithTransaction({
        userId: targetUser.id,
        novelId: novel.id,
        novelTitle: novel.title,
        type,
        price,
        chapterId: chapter?.id,
        chapterNumber: chapter?.number,
        chapterSlug: chapter?.slug,
        chapterIdentifiers,
      });
    } catch (err: any) {
      const errMsg = String(err?.message || 'Giao dịch mở khóa thất bại. Vui lòng thử lại!');
      if (errMsg.includes('Số dư') || errMsg.includes('không đủ')) {
        setIsTopUpOpen(true);
      }
      showGlobalBanner(errMsg, 'error', 6000);
      return false;
    }

    // Nếu chương/truyện đã mở khóa trước đó trên Server -> đồng bộ lại state & thoát không trừ tiền
    if (txResult.alreadyUnlocked) {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              xuBalance: txResult.newXuBalance,
              authorEarnedXu: txResult.newAuthorEarnedXu,
              purchasedChapters: txResult.purchasedChapters,
              unlockedChapters: txResult.unlockedChapters,
              unlockedFullBooks: txResult.unlockedFullBooks,
            }
          : null
      );
      if (type === 'full_book') {
        setIsVipPurchaseOpen(false);
        setPurchasingTarget(null);
      }
      showGlobalBanner('Nội dung này đã được mở khóa trong tài khoản của bạn.', 'success', 4000);
      await refreshUserData().catch(() => {});
      return true;
    }

    const totalRemaining = parseFloat((txResult.newXuBalance + txResult.newAuthorEarnedXu).toFixed(2));

    // Cập nhật Global State từ kết quả chính xác của Firestore Transaction
    setUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        xuBalance: txResult.newXuBalance,
        authorEarnedXu: txResult.newAuthorEarnedXu,
        purchasedChapters: txResult.purchasedChapters,
        unlockedFullBooks: txResult.unlockedFullBooks,
        unlockedChapters: txResult.unlockedChapters,
        purchases: txResult.purchaseRecord
          ? [txResult.purchaseRecord, ...(prev.purchases || [])]
          : (prev.purchases || []),
        notifications: [txResult.notification, ...(prev.notifications || [])],
      };
    });

    refreshUserData().catch(() => {});

    // Thông báo thành công và đóng modal
    if (type === 'full_book') {
      setIsVipPurchaseOpen(false);
      setPurchasingTarget(null);
      showGlobalBanner(`🎉 Chúc mừng! Bạn đã chốt đơn mua TRỌN BỘ "${novel.title}" thành công! Trừ -${formatXu(price)} Xu. Tất cả các chương đã mở khóa vĩnh viễn.`, 'success', 6000);
    } else {
      showGlobalBanner(`💎 Mở khóa thành công chương ${chapter?.number || ''}! Đã trừ -${formatXu(price)} Xu. Số dư ví còn lại: ${formatXu(totalRemaining)} Xu.`, 'success', 5000);
    }

    // Chia nhuận bút và gửi thông báo cho Tác giả / Editor bằng increment() an toàn
    const isEditorWork = Boolean(novel.editor && (!novel.isOriginal || novel.publisherRoles?.includes('editor')));
    let royaltyRate = 0.95;
    if (isEditorWork) {
      royaltyRate = novel.isExclusive ? 0.90 : 0.70;
    }
    const earnedXu = Math.max(0.01, parseFloat((price * royaltyRate).toFixed(2)));
    const authorTargetIdOrName = (novel as any).authorId || novel.submittedBy?.userId || novel.author || novel.editor || 'creator';
    const authorTargetEmail = (novel as any).authorEmail || novel.submittedBy?.userEmail;

    creditAuthorRoyaltyAndNotify({
      authorIdOrName: authorTargetIdOrName,
      authorEmail: authorTargetEmail,
      novelTitle: novel.title,
      type,
      chapterNumber: chapter?.number,
      earnedXu,
      buyerName: targetUser.displayName || 'Độc giả',
    }).catch((err) => console.warn('Lỗi ghi nhận nhuận bút tác giả:', err));

    // Đồng bộ server background
    unlockVipItemOnServer({
      userId: targetUser.id,
      userEmail: targetUser.email,
      userName: targetUser.displayName,
      novelId: novel.id,
      chapterId: chapter?.id,
      chapterNumber: chapter?.number,
      type,
      novelTitle: novel.title,
      authorName: novel.author,
      editorName: novel.editor,
      isExclusive: novel.isExclusive,
      isEditor: isEditorWork,
      isOriginal: novel.isOriginal,
      clientBalance: totalRemaining,
      price,
    }).catch(() => {});

    return true;
  };

  const handleConfirmPurchase = async (type: 'chapter' | 'full_book', price: number) => {
    const targetNovel = purchasingTarget?.novel || selectedNovel;
    const targetChapter = purchasingTarget?.chapter || selectedChapter;
    await executeUnlockPurchase(type, price, targetNovel, targetChapter);
  };

  const [vipPurchaseMode, setVipPurchaseMode] = useState<'all' | 'full_book_only' | 'chapter_only'>('all');

  const handleOpenVipPurchase = (
    novel: Novel, 
    chapter: Chapter, 
    mode: 'all' | 'full_book_only' | 'chapter_only' = 'all'
  ) => {
    setPurchasingTarget({ novel, chapter });
    setVipPurchaseMode(mode);
    setIsVipPurchaseOpen(true);
  };

  // Mở khóa trực tiếp chương lẻ không cần qua pop-up rườm rà (yêu cầu hình 3)
  const handleDirectUnlockChapter = async (novel: Novel, chapter: Chapter, price: number): Promise<boolean> => {
    return await executeUnlockPurchase('chapter', price, novel, chapter);
  };



  // STRICT 4 MAIN CATEGORIES FILTERING (Truyện Nam, Truyện Nữ, Đam Mỹ, Truyện Sáng Tác) & SORTING
  const filteredAndSortedNovels = useMemo(() => {
    let list = Array.isArray(novels) ? [...novels] : [];

    // 0. Lọc truyện bị ẩn: Truyện đã ẩn được ẩn hoàn toàn khỏi trang chủ
    list = list.filter((n) => !n.isHidden && n.publishStatus !== 'hidden');

    // 1. Khi đang có từ khóa tìm kiếm: Ưu tiên tìm kiếm TOÀN DIỆN (Hỗ trợ cả Tiếng Việt có dấu, không dấu, viết hoa/thường)
    if (searchQuery.trim()) {
      const rawQ = searchQuery.toLowerCase().trim();
      const normQ = removeVietnameseTones(searchQuery);
      const keywords = normQ.split(/\s+/).filter(Boolean);

      const searchMatches = list.filter((novel) => {
        const titleRaw = (novel.title || '').toLowerCase();
        const authorRaw = (novel.author || '').toLowerCase();
        const editorRaw = (novel.editor || '').toLowerCase();
        const descRaw = (novel.description || '').toLowerCase();
        const safeCats = Array.isArray(novel.categories) ? novel.categories : [];
        const catRawList = (safeCats || []).map((c) => String(c || '').toLowerCase());

        const titleNorm = removeVietnameseTones(novel.title || '');
        const authorNorm = removeVietnameseTones(novel.author || '');
        const editorNorm = removeVietnameseTones(novel.editor || '');
        const descNorm = removeVietnameseTones(novel.description || '');
        const catNormList = (safeCats || []).map(removeVietnameseTones);
        const combinedText = `${titleNorm} ${authorNorm} ${editorNorm} ${catNormList.join(' ')} ${descNorm}`;

        // 1. Khớp cụm từ nguyên văn (có dấu hoặc không dấu)
        if (
          titleRaw.includes(rawQ) ||
          titleNorm.includes(normQ) ||
          authorRaw.includes(rawQ) ||
          authorNorm.includes(normQ) ||
          editorRaw.includes(rawQ) ||
          editorNorm.includes(normQ) ||
          catRawList.some((c) => c.includes(rawQ)) ||
          catNormList.some((c) => c.includes(normQ)) ||
          descRaw.includes(rawQ) ||
          descNorm.includes(normQ)
        ) {
          return true;
        }

        // 2. Khớp tất cả các từ trong chuỗi tìm kiếm (AND matching)
        if ((keywords?.length || 0) > 0 && keywords.every((kw) => combinedText.includes(kw))) {
          return true;
        }

        return false;
      });

      return searchMatches.sort(
        (a, b) =>
          (b.updatedAt || b.createdAt || b.lastChapterUpdatedAt || 0) -
          (a.updatedAt || a.createdAt || a.lastChapterUpdatedAt || 0)
      );
    }

    // 2. Phân mục chính: Chọn mục thể loại chính nào thì CHỈ hiện đúng thể loại chính đó! (Khóa chặt, không lẫn Đam Mỹ hay thể loại khác)
    if (selectedMainCategory !== 'all') {
      list = list.filter((n) => {
        if (selectedMainCategory === 'truyen-sang-tac') {
          return n.mainCategory === 'truyen-sang-tac' || n.isOriginal === true;
        }
        return n.mainCategory === selectedMainCategory;
      });
    }

    // 3. Lọc theo Thể Loại Phụ được chọn (đi kèm chung với thể loại chính)
    if (selectedGenre) {
      const q = selectedGenre.toLowerCase().trim();
      list = list.filter((novel) =>
        (Array.isArray(novel.categories) ? novel.categories : []).some((c) => String(c || '').toLowerCase().includes(q) || q.includes(String(c || '').toLowerCase()))
      );
    }

    // 3.5. Lọc theo định dạng Truyện Ngắn (Format bổ sung không ảnh hưởng 3 phân mục chính)
    if (isShortStoryMode) {
      list = list.filter((novel) => novel.isShortStory === true);
    }

    // 4. Tab filter & sorting (JavaScript phía client để không bỏ sót truyện cũ thiếu timestamp):
    const getSortTime = (n: Novel) => n.updatedAt || n.createdAt || n.lastChapterUpdatedAt || 0;
    if (currentTab === 'completed') {
      list = list
        .filter((n) => n.status === 'Hoàn thành' || n.status === 'Full')
        .sort((a, b) => getSortTime(b) - getSortTime(a));
    } else if (currentTab === 'latest') {
      list = list.sort((a, b) => getSortTime(b) - getSortTime(a));
    } else if (currentTab === 'home') {
      list = list.sort((a, b) => {
        const viewDiff = (b.views || 0) - (a.views || 0);
        if (viewDiff !== 0) return viewDiff;
        return getSortTime(b) - getSortTime(a);
      });
    }

    return list;
  }, [novels, selectedMainCategory, selectedGenre, searchQuery, currentTab, isShortStoryMode, user?.role]);

  // Phân trang tự động theo màn hình: Desktop 5 cột -> 25 truyện/trang; Mobile 3 cột -> 27 truyện/trang
  const NOVELS_PER_PAGE = isMobileViewport ? 27 : 25;
  const totalNovelPages = Math.max(1, Math.ceil((filteredAndSortedNovels?.length || 0) / NOVELS_PER_PAGE));
  const safeCurrentNovelPage = Math.min(currentNovelPage, totalNovelPages);
  const paginatedNovels = useMemo(() => {
    const start = (safeCurrentNovelPage - 1) * NOVELS_PER_PAGE;
    return (filteredAndSortedNovels || []).slice(start, start + NOVELS_PER_PAGE);
  }, [filteredAndSortedNovels, safeCurrentNovelPage, NOVELS_PER_PAGE]);

  const paginationDisplayPages = useMemo<(number | 'ellipsis-left' | 'ellipsis-right')[]>(() => {
    if (totalNovelPages <= 7) {
      return Array.from({ length: totalNovelPages }, (_, i) => i + 1);
    }
    const items: (number | 'ellipsis-left' | 'ellipsis-right')[] = [1];
    const start = Math.max(2, safeCurrentNovelPage - 1);
    const end = Math.min(totalNovelPages - 1, safeCurrentNovelPage + 1);
    if (start > 2) items.push('ellipsis-left');
    for (let i = start; i <= end; i++) {
      items.push(i);
    }
    if (end < totalNovelPages - 1) items.push('ellipsis-right');
    items.push(totalNovelPages);
    return items;
  }, [totalNovelPages, safeCurrentNovelPage]);

  const handleChangeNovelPage = useCallback((nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalNovelPages, nextPage));
    setCurrentNovelPage(clamped);
    if (novelListTopRef.current) {
      novelListTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 380, behavior: 'smooth' });
    }
  }, [totalNovelPages]);

  useEffect(() => {
    if (currentNovelPage > totalNovelPages) {
      setCurrentNovelPage(totalNovelPages);
    }
  }, [currentNovelPage, totalNovelPages]);

  // Reset trang về 1 khi chuyển tab hoặc bộ lọc
  useEffect(() => {
    setCurrentNovelPage(1);
  }, [currentTab, selectedMainCategory, selectedGenre, searchQuery, isShortStoryMode]);

  // Kích hoạt tìm kiếm: Xóa các modal/trang con để mở danh sách kết quả tìm kiếm trên trang chủ
  const handlePerformSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      setSelectedNovel(null);
      setSelectedChapter(null);
      setSelectedCreator(null);
      setActivePageView(null);
      setSelectedGenre(null);
      navigate('/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleResumeReading = (novel: Novel, progress: ReadingProgress) => {
    const chapter = novel.chapters?.find((c) => c.number === progress.chapterNumber) || novel.chapters?.[0];
    const chapNum = chapter ? chapter.number : (progress.chapterNumber || 1);
    const slugOrId = novel.slug || novel.id;
    navigate(`/truyen/${slugOrId}/chuong-${chapNum}`);
    setSelectedNovel(novel);
    if (chapter) setSelectedChapter(chapter);
    setSelectedCreator(null);
    setActivePageView(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pendingTopUpCount = (topUpRequests || []).filter((r) => r.status === 'pending')?.length || 0;
  const pendingSubmissionsCount = (novelSubmissions || []).filter((s) => s.status === 'pending')?.length || 0;
  const pendingReportsCount = (novelReports || []).filter((r) => r.status === 'pending')?.length || 0;
  const pendingWithdrawalCount = (withdrawalRequests || []).filter((w) => w.status === 'pending')?.length || 0;
  const totalPendingAdminCount = pendingTopUpCount + pendingSubmissionsCount + pendingReportsCount + pendingWithdrawalCount;

  // Người đăng truyện: Tác giả, Editor, Admin, hoặc đã có truyện sáng tác/đăng tải
  const isStoryPublisher = Boolean(
    activeUser &&
    activeUser.isLoggedIn &&
    activeUser.id !== 'guest' &&
    (
      activeUser.role === 'author' ||
      (activeUser.role as string) === 'editor' ||
      activeUser.role === 'admin' ||
      (activeUser.authorEarnedXu && activeUser.authorEarnedXu > 0) ||
      Boolean((activeUser as any).isCreator) ||
      (novels || []).some((n) => 
        (n.author && activeUser.displayName && n.author.toLowerCase() === activeUser.displayName.toLowerCase()) ||
        (n.editor && activeUser.displayName && n.editor.toLowerCase() === activeUser.displayName.toLowerCase()) ||
        (n.submittedBy && (
          n.submittedBy.userId === activeUser.id || 
          (activeUser.email && n.submittedBy.userEmail && n.submittedBy.userEmail.toLowerCase() === activeUser.email.toLowerCase())
        ))
      )
    )
  );

  // Ẩn Header chung của Web khi đang ở trang đọc chương để tránh chồng chéo 2 thanh tiêu đề trên Mobile
  const isInChapterReader = Boolean(!isResolvingRoute && !routeError && selectedChapter && selectedNovel);

  return (
    <div className={`min-h-screen w-full overflow-x-hidden ${theme === 'light' ? 'bg-slate-50 text-slate-800' : 'bg-slate-900 text-slate-200'} font-sans selection:bg-blue-500/20 selection:text-blue-600 transition-colors duration-300`}>
      {/* Top Header with Role Switcher & 3 Main Categories Bar (Ẩn khi đang trong trang đọc chương) */}
      {!isInChapterReader && (
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        selectedMainCategory={selectedMainCategory}
        setSelectedMainCategory={(cat) => {
          setSelectedMainCategory(cat);
          setIsShortStoryMode(false);
          setSelectedGenre(null);
          setActivePageView(null);
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setCurrentTab('latest');
          navigate('/');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        isShortStoryActive={isShortStoryMode}
        onSelectShortStory={() => {
          setIsShortStoryMode(true);
          setSelectedMainCategory('all');
          setSelectedGenre(null);
          setActivePageView(null);
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setCurrentTab('latest');
          navigate('/truyen-ngan');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        searchQuery={searchQuery}
        setSearchQuery={handlePerformSearch}
        allNovels={novels}
        onSelectNovel={handleSelectNovel}
        onPerformSearch={handlePerformSearch}
        theme={theme}
        setTheme={setTheme}
        genres={genres}
        selectedGenre={selectedGenre}
        onSelectGenre={setSelectedGenre}
        onMarkNotificationsRead={handleMarkAllNotificationsRead}
        onOpenAccount={() => setIsAccountModalOpen(true)}
        onOpenXmlModal={() => setIsXmlModalOpen(true)}
        onOpenTopUp={() => setIsTopUpOpen(true)}
        onOpenWithdraw={() => setIsWithdrawOpen(true)}
        isStoryPublisher={isStoryPublisher}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
        onOpenVipPolicy={() => setIsVipPolicyOpen(true)}
        onToggleRole={handleToggleRole}
        onSelectRole={handleSelectRole}
        user={activeUser}
        hasPendingApplication={(novelSubmissions || []).some(
          (s) => (s.submittedBy?.userId === activeUser.id || (activeUser.email && s.submittedBy?.userEmail && s.submittedBy.userEmail.toLowerCase() === activeUser.email.toLowerCase())) && s.status === 'pending'
        )}
        pendingCount={totalPendingAdminCount}
        onOpenDailyReward={() => setIsDailyRewardOpen(true)}
        hasClaimedToday={!canClaimDailyReward}
        onOpenAuthorShowcase={() => handleOpenAuthorShowcase()}
        onOpenRegisterCreator={() => {
          setIsRegisterCreatorOpen(true);
        }}
        onOpenProfile={() => handleSelectCreator(activeUser.displayName, activeUser.id)}
        onOpenPurchasedNovels={() => {
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setActivePageView('purchased-novels');
          navigate('/tu-truyen-cua-ban');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenInterestedNovels={() => {
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setActivePageView('purchased-novels');
          navigate('/tu-truyen-cua-ban');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenFollowingCreators={() => setIsFollowingNovelsOpen(true)}
        onOpenMyNovels={() => {
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setActivePageView('my-novels');
          navigate('/tu-truyen');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenSubmitNovel={() => {
          // Lần đầu độc giả đăng ký đăng truyện: Mở khung Đăng Ký Người Sáng Tác & Editor (Chuẩn Ảnh 2 & Ảnh 3)
          if (activeUser.role === 'reader' || (!activeUser.role && activeUser.id !== 'admin')) {
            setIsRegisterCreatorOpen(true);
          } else {
            // Tác giả / Editor / Admin đã được duyệt: Mở trang Thêm truyện mới (Chuẩn Ảnh 1)
            setSelectedNovel(null);
            setSelectedChapter(null);
            setSelectedCreator(null);
            setActivePageView('submit-novel');
            navigate('/dang-truyen');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        onOpenReadingHistory={() => {
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setActivePageView('reading-history');
          navigate('/lich-su-doc');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenBookmarks={() => {
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setActivePageView('saved-novels');
          navigate('/truyen-da-luu');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenStats={() => {
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setActivePageView('stats');
          navigate('/thong-ke');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenInfo={() => setIsUserInfoOpen(true)}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        onLogout={handleLogout}
        onLogin={() => {
          setAuthModalMode('login');
          setIsAuthModalOpen(true);
        }}
        onOpenLogin={() => {
          setAuthModalMode('login');
          setIsAuthModalOpen(true);
        }}
        onOpenRegister={() => {
          setAuthModalMode('register');
          setIsAuthModalOpen(true);
        }}
        onHomeClick={handleReturnToHome}
        onOpenChat={() => {
          setIsChatWidgetOpen(true);
        }}
        unreadChatCount={unreadChatCount}
      />
      )}

      {/* Toast Real-time thông báo nạp tiền thành công khi Admin vừa duyệt (Không cần F5) */}
      {topUpSuccessToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white font-extrabold text-xs sm:text-sm px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-top-4 duration-300 border-2 border-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 flex-shrink-0 animate-bounce" />
          <span>{topUpSuccessToast.text}</span>
          <button
            onClick={() => setTopUpSuccessToast(null)}
            className="ml-2 p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
            title="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* LỚP 3: BANNER THÔNG BÁO TÀI KHOẢN BỊ HẠN CHẾ (NỀN VÀNG BẮT BUỘC bg-yellow-400 / bg-yellow-500, TEXT MÀU TỐI, TUYỆT ĐỐI KHÔNG DÙNG ĐỎ) */}
      {isAccountBanned && (
        <div className="w-full bg-yellow-400 dark:bg-yellow-500 border-b-2 border-yellow-600 text-slate-950 px-4 py-3.5 shadow-sm">
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-3 text-xs sm:text-sm font-bold text-center text-slate-950">
            <AlertTriangle className="w-5 h-5 text-slate-950 flex-shrink-0" />
            <span>{BAN_MESSAGE}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className={isInChapterReader ? '' : 'pb-24'}>
        {isResolvingRoute ? (
          <div className="max-w-4xl mx-auto px-4 py-24 text-center">
            <div className="inline-block p-4 rounded-2xl bg-pink-500/10 text-pink-600 dark:text-pink-400 mb-4 animate-pulse">
              <BookOpen className="w-12 h-12 animate-bounce mx-auto" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white mb-2">Đang tải truyện...</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Hệ thống đang kết nối dữ liệu truyện theo thời gian thực tại Đạo Tâm.</p>
          </div>
        ) : routeError ? (
          <div className="max-w-xl mx-auto px-4 py-24 text-center">
            <div className="inline-block p-4 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 mb-4">
              <AlertCircle className="w-12 h-12 mx-auto" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white mb-2">Không tìm thấy nội dung</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{routeError}</p>
            <button
              onClick={handleReturnToHome}
              className="px-6 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-sm shadow-lg shadow-pink-600/30 transition-all cursor-pointer"
            >
              Quay về trang chủ
            </button>
          </div>
        ) : selectedChapter && selectedNovel ? (
          /* CHAPTER READER SCREEN (KARAOKE TTS + MULTI-VOICE + AUTO NEXT CHAPTER + DRM ANTI-THEFT + VIP LOCK) */
          <ChapterReader
            novel={selectedNovel}
            chapter={selectedChapter}
            readerSettings={readerSettings}
            setReaderSettings={setReaderSettings}
            onSelectChapter={(novel, chapter) => handleSelectChapter(novel, chapter)}
            onBackToNovel={() => {
              navigate(`/truyen/${selectedNovel.slug || selectedNovel.id}`);
              setSelectedChapter(null);
            }}
            onSaveProgress={handleSaveProgress}
            user={activeUser}
            onOpenVipPurchase={handleOpenVipPurchase}
            onDirectUnlockChapter={handleDirectUnlockChapter}
            onOpenAuthModal={() => {
              setAuthModalMode('login');
              setIsAuthModalOpen(true);
            }}
            onOpenTopUp={() => setIsTopUpOpen(true)}
            onOpenReport={handleOpenReport}
            onRecordRealView={handleRecordRealView}
          />
        ) : selectedNovel ? (
          /* NOVEL DETAIL & DETAILED TOC (COMMENTS & ZERO RECOMMENDATIONS) */
          <NovelDetail
            novel={selectedNovel}
            savedProgress={(activeUser?.readingHistory || []).find((h) => h.novelId === selectedNovel.id)}
            isBookmarked={(activeUser?.bookmarks || []).includes(selectedNovel.id)}
            onToggleBookmark={handleToggleBookmark}
            onSelectChapter={(novelWithChapters, chapter, autoPlay) => {
              handleSelectChapter(novelWithChapters, chapter, autoPlay);
            }}
            onBack={() => {
              navigate('/');
              setSelectedNovel(null);
              setSelectedChapter(null);
            }}
            user={activeUser}
            onOpenVipPurchase={handleOpenVipPurchase}
            onOpenDonateNovel={handleOpenDonateNovel}
            onToggleHideNovel={handleToggleHideNovel}
            onDeleteNovel={handleDeleteNovel}
            onOpenEditNovel={handleOpenEditNovel}
            onOpenBatchUpload={handleOpenBatchUpload}
            onOpenNominate={(novel) => {
              setNominatingNovel(novel);
              setIsNominateOpen(true);
            }}
            onOpenAuthorShowcase={(authorName) => {
              const isUploaderMatch = Boolean(
                selectedNovel?.submittedBy?.userId &&
                (authorName.trim().toLowerCase() === (selectedNovel.editor || '').trim().toLowerCase() ||
                  authorName.trim().toLowerCase() === (selectedNovel.submittedBy?.userName || '').trim().toLowerCase())
              );
              handleSelectCreator(
                authorName,
                isUploaderMatch ? selectedNovel?.submittedBy?.userId : undefined
              );
            }}
            onOpenReport={handleOpenReport}
            allNovels={novels}
            onSelectNovel={(n) => {
              handleSelectNovel(n);
            }}
            onHomeClick={handleReturnToHome}
            onUpdateNovelChapters={handleUpdateNovelChapters}
          />
        ) : selectedCreator ? (
          /* TRANG CÁ NHÂN NGƯỜI SÁNG TÁC (ÁP DỤNG CHUNG TÁC GIẢ, EDITOR VÀ ADMIN) */
          <CreatorProfile
            creator={selectedCreator}
            allNovels={novels}
            currentUser={activeUser}
            onBack={() => {
              navigate('/');
              setSelectedCreator(null);
            }}
            onSelectNovel={(n) => {
              setSelectedCreator(null);
              handleSelectNovel(n);
            }}
            onFollowToggle={handleFollowCreator}
            onOpenDonateModal={(creatorData) => {
              setDonatingCreator(creatorData);
              setIsDonateOpen(true);
            }}
            onSelectCreator={handleSelectCreator}
            onOpenEditProfile={() => setIsEditProfileOpen(true)}
            onOpenSubmitNovel={() => {
              setSelectedCreator(null);
              setActivePageView('submit-novel');
              navigate('/dang-truyen');
            }}
            onOpenRegisterCreator={() => setIsRegisterCreatorOpen(true)}
            onOpenDirectChat={(target) => {
              setChatInitialTarget(target);
              setIsChatWidgetOpen(true);
            }}
            onOpenPurchasedNovels={() => {
              setSelectedCreator(null);
              navigate('/tu-truyen-cua-ban');
            }}
          />
        ) : activePageView === 'my-novels' ? (
          /* TRANG TỦ TRUYỆN > TRUYỆN CỦA BẠN (HÌNH 3 - DẠNG TRANG) */
          <MyNovelsModal
            isOpen={true}
            isPageView={true}
            onClose={() => {
              navigate('/');
              setActivePageView(null);
            }}
            user={activeUser}
            novels={novels}
            onOpenSubmitNovel={() => {
              setActivePageView('submit-novel');
              navigate('/dang-truyen');
            }}
            onEditNovel={handleOpenEditNovel}
            onViewNovel={(novel) => {
              handleSelectNovel(novel);
            }}
            onViewChapterList={(novel) => {
              handleSelectNovel(novel);
              setTimeout(() => {
                const el = document.getElementById('danh-sach-chuong');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 200);
            }}
            onBatchUploadChapters={handleOpenBatchUpload}
            onAddNewChapter={handleOpenPublishChapter}
            onManageComments={(novel) => {
              handleSelectNovel(novel);
            }}
            onToggleHideNovel={handleToggleHideNovel}
            onDeleteNovel={handleDeleteNovel}
            onUpdateNovelFlags={handleUpdateNovelFlags}
          />
        ) : activePageView === 'publish-chapter' && publishingChapterNovel ? (
          /* TRANG ĐĂNG CHƯƠNG MỚI (TÍNH TOÁN CHƯƠNG KẾ TIẾP CỦA CHƯƠNG MỚI NHẤT, SOẠN THẢO VÀ PHÁT HÀNH) */
          <PublishChapterPage
            novel={publishingChapterNovel}
            onClose={() => {
              if (publishingChapterNovel) {
                navigate(`/truyen/${publishingChapterNovel.slug || publishingChapterNovel.id}`);
              } else {
                navigate('/tu-truyen');
                setActivePageView('my-novels');
              }
              setPublishingChapterNovel(null);
            }}
            onSaveChapter={handlePublishNewChapter}
            onViewChapterList={(novel) => {
              handleSelectNovel(novel);
              setTimeout(() => {
                const el = document.getElementById('danh-sach-chuong');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 200);
            }}
            onHomeClick={handleReturnToHome}
          />
        ) : activePageView === 'edit-novel' && editingNovel ? (
          /* TRANG CHỈNH SỬA TRUYỆN TRONG WEB (NỀN TRẮNG, CHỮ ĐEN/HỒNG, KHÔNG PHẢI POPUP) */
          <EditNovelModal
            isOpen={true}
            isPageView={true}
            isAdmin={checkIsAdmin(activeUser.email)}
            onClose={() => {
              if (editingNovel) {
                navigate(`/truyen/${editingNovel.slug || editingNovel.id}`);
              } else {
                navigate('/tu-truyen');
                setActivePageView('my-novels');
              }
              setEditingNovel(null);
            }}
            novel={editingNovel}
            onSaveNovel={handleSaveEditedNovel}
            onChapterAudioUpdated={handleChapterAudioUpdated}
            genres={genres}
            onAddNewGenre={handleAddNewGenre}
            onHomeClick={handleReturnToHome}
          />
        ) : activePageView === 'batch-upload' && batchUploadingNovel ? (
          /* TRANG ĐĂNG NHIỀU CHƯƠNG TRONG WEB (CẤU TRÚC DÁN NHANH, SET 0 XU HOẶC SET VIP TỪ CHƯƠNG X, SET LẺ TỪNG CHƯƠNG) */
          <BatchUploadChaptersPage
            novel={batchUploadingNovel}
            onClose={() => {
              if (batchUploadingNovel) {
                navigate(`/truyen/${batchUploadingNovel.slug || batchUploadingNovel.id}`);
              } else {
                navigate('/tu-truyen');
                setActivePageView('my-novels');
              }
              setBatchUploadingNovel(null);
            }}
            onSaveBatchChapters={handleAddBatchChapters}
            onHomeClick={handleReturnToHome}
          />
        ) : activePageView === 'submit-novel' ? (
          /* TRANG ĐĂNG TRUYỆN / ĐĂNG KÝ SÁNG TÁC (HÌNH 4 - DẠNG TRANG) */
          <SubmitNovelModal
            isOpen={true}
            isPageView={true}
            onClose={() => {
              navigate('/');
              setActivePageView(null);
            }}
            user={activeUser}
            genres={genres}
            onAddNewGenre={handleAddNewGenre}
            onDeleteGenre={handleDeleteGenre}
            onSubmitForApproval={handleSubmitNovelForApproval}
            onDirectPublishByAdmin={handleDirectPublishNovel}
          />
        ) : activePageView === 'reading-history' ? (
          /* TRANG TRUYỆN ĐÃ ĐỌC / LỊCH SỬ ĐỌC (HÌNH 5 - DẠNG TRANG) */
          <ReadingHistoryModal
            isOpen={true}
            isPageView={true}
            onClose={() => {
              navigate('/');
              setActivePageView(null);
            }}
            user={activeUser}
            novels={novels}
            onResumeReading={(novelId, chapterId) => {
              const novel = (novels || []).find((n) => n.id === novelId);
              if (novel) {
                const safeChaps = Array.isArray(novel.chapters) ? novel.chapters : [];
                const chapter = safeChaps.find((c) => c.id === chapterId) || safeChaps[0];
                if (chapter) handleSelectChapter(novel, chapter);
              }
            }}
            onClearHistory={handleClearReadingHistory}
          />
        ) : activePageView === 'saved-novels' ? (
          /* TRANG TRUYỆN ĐÃ LƯU / TỦ SÁCH (HÌNH 6 - DẠNG TRANG) */
          <SavedNovelsModal
            isOpen={true}
            isPageView={true}
            onClose={() => {
              navigate('/');
              setActivePageView(null);
            }}
            user={activeUser}
            novels={novels}
            onSelectNovel={(novel) => {
              handleSelectNovel(novel);
            }}
            onRemoveBookmark={handleRemoveBookmark}
          />
        ) : activePageView === 'stats' ? (
          /* TRANG THỐNG KÊ SÁNG TÁC & LƯỢT ĐỌC (HÌNH 7 - DẠNG TRANG) */
          <AuthorStatsModal
            isOpen={true}
            isPageView={true}
            onClose={() => {
              navigate('/');
              setActivePageView(null);
            }}
            user={activeUser}
            novels={novels}
            onSelectNovel={(novel) => {
              handleSelectNovel(novel);
            }}
          />
        ) : activePageView === 'purchased-novels' ? (
          /* TRANG TỦ TRUYỆN CỦA BẠN (ROUTE: /tu-truyen-cua-ban) - TUYỆT ĐỐI KHÔNG DÙNG POPUP/MODAL */
          <UserPurchasedNovelsPage
            user={activeUser}
            novels={novels}
            onSelectNovel={(novel) => {
              handleSelectNovel(novel);
            }}
            onBackToHome={handleReturnToHome}
            onOpenTopUp={() => setIsTopUpOpen(true)}
          />
        ) : (
          /* HOME CATALOG SCREEN WITH CONTINUE READING BANNER & TOP 10 HOT TRONG NGÀY RIGHT SIDEBAR */
          <>
            <ContinueReadingBanner onNavigateChapter={(url) => navigate(url)} />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">


            {/* THÔNG BÁO TOÀN TRANG (GLOBAL BANNER - CHỈ ĐỌC 1 LẦN KHI LOAD TRANG CHỦ) */}
            <GlobalBanner />

            {/* THANH TÌM KIẾM TRUYỆN NỔI BẬT DỄ NHÌN (SPARK QUOTA-SAFE FIRESTORE COMPONENT) */}
            <div className="mb-8">
              <SearchBar novels={novels} onSelectNovel={(novel) => handleSelectNovel(novel)} />
            </div>

            {/* BẢNG VÀNG ĐỀ CỬ: TOP 12 TRUYỆN ĐƯỢC ĐỀ CỬ NHIỀU NHẤT */}
            <TopNominatedSection
              novels={novels}
              onSelectNovel={(n) => handleSelectNovel(n)}
              onOpenNominate={(n) => {
                setNominatingNovel(n);
                setIsNominateOpen(true);
              }}
              onOpenDailyReward={() => setIsDailyRewardOpen(true)}
              user={activeUser}
              onSelectCreator={handleSelectCreator}
            />


            {/* TWO-COLUMN LAYOUT: MAIN CATALOG + TOP 10 HOT TRONG NGÀY RIGHT SIDEBAR */}
            <div className="flex flex-col lg:flex-row items-start gap-8">
              {/* Left Column: Novels Catalog */}
              <div ref={novelListTopRef} className="flex-1 min-w-0 w-full scroll-mt-20">
                {/* Catalog Section Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-pink-600/10 text-pink-600 flex items-center justify-center">
                      {searchQuery.trim() ? <Search className="w-4 h-4 text-pink-600" /> : <Flame className="w-4 h-4" />}
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-[#91C9FF] title-ice-blue tracking-tight flex items-center gap-2 flex-wrap">
                        {searchQuery.trim() ? (
                          <>
                            <span>Kết quả tìm kiếm: &ldquo;{searchQuery}&rdquo;</span>
                            <button
                              type="button"
                              onClick={() => setSearchQuery('')}
                              className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-pink-100 hover:bg-pink-200 dark:bg-pink-950/60 dark:hover:bg-pink-900/60 text-pink-700 dark:text-pink-300 transition cursor-pointer"
                              title="Xóa tìm kiếm"
                            >
                              ✕ Xóa tìm kiếm
                            </button>
                          </>
                        ) : (
                          <>
                            {currentTab === 'completed'
                              ? 'Truyện Hoàn Thành'
                              : currentTab === 'latest'
                              ? 'Truyện Mới Cập Nhật'
                              : 'Truyện Hot'}
                            {selectedMainCategory === 'dam-my' && ' • Đam Mỹ'}
                            {selectedMainCategory === 'truyen-nam' && ' • Truyện Nam'}
                            {selectedMainCategory === 'truyen-nu' && ' • Truyện Nữ'}
                            {selectedMainCategory === 'truyen-sang-tac' && ' • Truyện Sáng Tác'}
                            {isShortStoryMode && (
                              <span className="inline-flex items-center gap-1.5 ml-2 text-sm font-semibold text-pink-600 dark:text-pink-400 bg-pink-100/80 dark:bg-pink-950/60 px-2.5 py-0.5 rounded-lg border border-pink-200 dark:border-pink-800">
                                📖 Truyện Ngắn
                                <button
                                  onClick={() => {
                                    setIsShortStoryMode(false);
                                    navigate('/');
                                  }}
                                  className="text-xs hover:text-red-500 cursor-pointer px-1 rounded hover:bg-pink-200 dark:hover:bg-pink-900"
                                  title="Xem tất cả truyện"
                                >
                                  ✕
                                </button>
                              </span>
                            )}
                            {selectedGenre && (
                              <span className="inline-flex items-center gap-1.5 ml-2 text-sm font-semibold text-blue-600 dark:text-cyan-400">
                                • {selectedGenre}
                                <button
                                  onClick={() => setSelectedGenre(null)}
                                  className="text-xs hover:text-red-500 cursor-pointer px-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                  title="Bỏ lọc thể loại"
                                >
                                  ✕
                                </button>
                              </span>
                            )}
                          </>
                        )}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Hiển thị {paginatedNovels?.length || 0} / {filteredAndSortedNovels?.length || 0} bộ truyện • Trang {safeCurrentNovelPage}/{totalNovelPages}
                      </p>
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <button
                      onClick={() => {
                        setCurrentTab('latest');
                        setCurrentNovelPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        currentTab === 'latest'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Mới cập nhật
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('home');
                        setCurrentNovelPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        currentTab === 'home'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600'
                      }`}
                    >
                      <Flame className="w-3.5 h-3.5" />
                      Truyện Hot
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTab('completed');
                        setCurrentNovelPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        currentTab === 'completed'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Truyện Full
                    </button>
                  </div>
                </div>

                {/* Novel Grid */}
                {isNovelsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <div className="animate-spin w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full mb-3" />
                    <span className="text-xs font-semibold text-rose-500">Đang tải danh sách truyện...</span>
                  </div>
                ) : (filteredAndSortedNovels?.length || 0) === 0 ? (
                  <div className="text-center py-16 bg-[#13141c] rounded-2xl border border-neutral-800 p-8">
                    {searchQuery.trim() ? (
                      <>
                        <Search className="w-10 h-10 text-neutral-500 mx-auto mb-3" />
                        <h3 className="text-neutral-200 font-bold text-sm">
                          Không tìm thấy tác phẩm nào khớp với &ldquo;{searchQuery}&rdquo;
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1 mb-4">
                          Hãy thử kiểm tra lại từ khóa hoặc tìm theo tên tác giả, tên nhân vật, thể loại khác.
                        </p>
                        <button
                          onClick={() => setSearchQuery('')}
                          className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs cursor-pointer shadow-md"
                        >
                          Xem toàn bộ kho truyện
                        </button>
                      </>
                    ) : (
                      <>
                        <BookOpen className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
                        <h3 className="text-neutral-300 font-bold text-sm">Hiện chưa có truyện nào thuộc mục này</h3>
                        <p className="text-xs text-neutral-500 mt-1 mb-4">
                          {activeUser.role !== 'reader'
                            ? 'Bạn có thể là người đầu tiên đăng truyện mới vào danh mục này!'
                            : 'Vui lòng quay lại sau khi ban biên tập cập nhật thêm tác phẩm mới.'}
                        </p>
                        {activeUser.role !== 'reader' && (
                          <button
                            onClick={() => {
                              setSelectedNovel(null);
                              setSelectedChapter(null);
                              setSelectedCreator(null);
                              setActivePageView('submit-novel');
                            }}
                            className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer shadow-md"
                          >
                            + Đăng Truyện Ngay
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Lưới truyện khít màn hình: Mobile 3 cột (27 truyện/trang), Desktop 5 cột (25 truyện/trang) */}
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4">
                      {(paginatedNovels || []).map((novel) => (
                        <NovelCard
                          key={novel.id}
                          novel={novel}
                          progress={(activeUser?.readingHistory || []).find((h) => h.novelId === novel.id)}
                          onSelect={(n) => handleSelectNovel(n)}
                          onResumeReading={handleResumeReading}
                          onSelectCreator={handleSelectCreator}
                        />
                      ))}
                    </div>

                    {/* Thanh phân trang thân thiện điện thoại & hiển thị tổng số truyện */}
                    <div className="pt-6 pb-2 border-t border-pink-100 dark:border-pink-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium text-center sm:text-left">
                        Đang hiển thị <strong className="text-pink-600 dark:text-pink-400 font-bold">{paginatedNovels?.length || 0}</strong> / Tổng <strong className="text-pink-600 dark:text-pink-400 font-bold">{filteredAndSortedNovels?.length || 0}</strong> truyện • Trang <strong className="text-pink-600 dark:text-pink-400">{safeCurrentNovelPage}</strong>/{totalNovelPages}
                      </div>

                      {totalNovelPages > 1 && (
                        <nav aria-label="Điều hướng phân trang" className="flex items-center justify-center sm:justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleChangeNovelPage(safeCurrentNovelPage - 1)}
                            disabled={safeCurrentNovelPage <= 1}
                            className="min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-slate-900 border-pink-200 dark:border-pink-900 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-950/40 shadow-xs"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            <span>Trang trước</span>
                          </button>

                          {paginationDisplayPages.map((item) => {
                            if (typeof item !== 'number') {
                              return (
                                <span
                                  key={item}
                                  className="px-1.5 text-slate-400 dark:text-slate-500 font-bold select-none"
                                >
                                  ...
                                </span>
                              );
                            }
                            const isActive = item === safeCurrentNovelPage;
                            return (
                              <button
                                key={item}
                                type="button"
                                onClick={() => handleChangeNovelPage(item)}
                                className={`min-w-[40px] min-h-[40px] px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
                                  isActive
                                    ? 'bg-pink-600 border-pink-600 text-white shadow-md shadow-pink-600/30 scale-105'
                                    : 'bg-white dark:bg-slate-900 border-pink-200 dark:border-pink-900 text-slate-700 dark:text-slate-300 hover:border-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/40'
                                }`}
                              >
                                {item}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => handleChangeNovelPage(safeCurrentNovelPage + 1)}
                            disabled={safeCurrentNovelPage >= totalNovelPages}
                            className="min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-slate-900 border-pink-200 dark:border-pink-900 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-950/40 shadow-xs"
                          >
                            <span>Trang sau</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </nav>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Right Column: TOP 10 TRUYỆN HOT TRONG NGÀY */}
              <Top10HotSidebar
                novels={(novels || []).filter((n) => !n.isHidden && n.publishStatus !== 'hidden')}
                onSelectNovel={(n) => handleSelectNovel(n)}
                onSelectCreator={handleSelectCreator}
              />
            </div>

            {/* TUYỆT ĐỐI KHÔNG CHỨA PHẦN ĐỀ XUẤT TRUYỆN Ở ĐÂY HOẶC BẤT CỨ ĐÂU */}
          </div>
          </>
        )}
      </main>




      {/* TopUp Modal (Chuẩn Hình 3, 4, 5: MBBank, 1 xu = 1đ, Mua Xu to ở giữa) */}
      <TopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        user={activeUser}
        topUpRequests={topUpRequests}
        onSubmitTopUp={handleSubmitTopUp}
        onCancelTopUp={handleCancelTopUp}
        onUpdateBillImage={handleUpdateTopUpBillImage}
        onOpenWithdraw={() => {
          setIsTopUpOpen(false);
          setIsWithdrawOpen(true);
        }}
        isStoryPublisher={isStoryPublisher}
      />

      {/* Withdraw Modal (Rút Xu cho Người Đăng Truyện, Tối thiểu 1000 xu, bắt buộc điền đủ thông tin ngân hàng) */}
      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        user={activeUser}
        withdrawalRequests={withdrawalRequests}
        onSubmitWithdrawal={handleCreateWithdrawal}
      />

      {/* VIP Purchase Modal */}
      {purchasingTarget && (
        <VipPurchaseModal
          isOpen={isVipPurchaseOpen}
          onClose={() => {
            setIsVipPurchaseOpen(false);
            setPurchasingTarget(null);
          }}
          novel={purchasingTarget.novel}
          chapter={purchasingTarget.chapter}
          user={activeUser}
          purchaseMode={vipPurchaseMode}
          onConfirmPurchase={async (type, price) => {
            await executeUnlockPurchase(type, price, purchasingTarget.novel, purchasingTarget.chapter);
          }}
          onOpenTopUp={() => setIsTopUpOpen(true)}
        />
      )}

      {/* Admin Dashboard Modal (Duyệt Đơn Tác Giả 5 Chương + STK, Đối Soát Nhuận Bút, Quản Trị - Dạng Trang) */}
      <AdminDashboardModal
        isOpen={(isAdminOpen || activePageView === 'admin') && checkIsAdmin(activeUser.email)}
        onClose={() => {
          setIsAdminOpen(false);
          if (activePageView === 'admin') setActivePageView(null);
        }}
        topUpRequests={topUpRequests}
        onApproveRequest={handleApproveTopUp}
        onRejectRequest={handleRejectTopUp}
        user={activeUser}
        novels={novels}
        onAddBatchChapters={handleAddBatchChapters}
        novelSubmissions={novelSubmissions}
        onApproveNovelSubmission={handleApproveNovelSubmission}
        onRejectNovelSubmission={handleRejectNovelSubmission}
        onToggleHideNovel={handleToggleHideNovel}
        onDeleteNovel={handleDeleteNovel}
        onOpenEditNovel={handleOpenEditNovel}
        withdrawalRequests={withdrawalRequests}
        onApproveWithdrawal={handleApproveWithdrawal}
        onRejectWithdrawal={handleRejectWithdrawal}
        royaltyConfig={royaltyConfig}
        onUpdateRoyaltyConfig={setRoyaltyConfig}
        onOpenXmlModal={() => setIsXmlModalOpen(true)}
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
        novelReports={novelReports}
        onResolveReport={handleResolveReport}
        onOpenAdminMessages={() => {
          setIsAdminOpen(false);
          setIsAdminMessagesOpen(true);
        }}
        onDonateCoinsSuccess={(targetUserId, amount) => {
          if (user && user.id === targetUserId) {
            setUser((prev) => (prev ? { ...prev, xuBalance: (prev.xuBalance || 0) + amount } : null));
            refreshUserData().catch(() => {});
          }
        }}
        onReloadNovels={reloadNovels}
        onChapterAudioUpdated={handleChapterAudioUpdated}
      />

      {/* Edit Novel & Chapters (Page View is primary in-web flow) */}
      {editingNovel && activePageView !== 'edit-novel' && isEditNovelOpen && (
        <EditNovelModal
          isOpen={isEditNovelOpen}
          isPageView={false}
          isAdmin={checkIsAdmin(activeUser.email)}
          onClose={() => {
            setIsEditNovelOpen(false);
            setEditingNovel(null);
          }}
          novel={editingNovel}
          onSaveNovel={handleSaveEditedNovel}
          onChapterAudioUpdated={handleChapterAudioUpdated}
          genres={genres}
          onAddNewGenre={handleAddNewGenre}
          onHomeClick={handleReturnToHome}
        />
      )}

      {/* Architecture & Deployment Guide Modal */}
      <ArchitectureGuideModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />

      {/* Account Profile Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        user={activeUser}
        onLogin={() => {
          setIsAccountModalOpen(false);
          setIsAuthModalOpen(true);
        }}
        onLogout={handleLogout}
        onClearHistory={() => {
          setUser((prev) => (prev ? {
            ...prev,
            readingHistory: [],
          } : null));
        }}
        onResumeReading={(novelId, chapterId) => {
          setIsAccountModalOpen(false);
          const novel = (novels || []).find((n) => n.id === novelId);
          if (novel) {
            const safeChaps = Array.isArray(novel.chapters) ? novel.chapters : [];
            const chapter = safeChaps.find((c) => c.id === chapterId) || safeChaps[0];
            if (chapter) handleSelectChapter(novel, chapter);
          }
        }}
        onUpdateProfile={handleUpdateProfile}
        onOpenTopUp={() => {
          setIsAccountModalOpen(false);
          setIsTopUpOpen(true);
        }}
        onOpenAuthorShowcase={() => {
          setIsAccountModalOpen(false);
          handleOpenAuthorShowcase(activeUser.displayName);
        }}
        onOpenSubmitNovel={() => {
          setIsAccountModalOpen(false);
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setActivePageView('submit-novel');
          navigate('/dang-truyen');
        }}
        onOpenRegisterCreator={() => {
          setIsAccountModalOpen(false);
          setIsRegisterCreatorOpen(true);
        }}
        topUpRequests={topUpRequests}
        userSubmissions={novelSubmissions}
      />

      {/* Auth Modal (Bảng Đăng Ký & Đăng Nhập Chuẩn Hình 2 & 3) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccessLogin={(loggedInUser) => {
          setUser(loggedInUser);
          refreshUserData().catch(() => {});
          setIsAuthModalOpen(false);
          // Khi đăng nhập thì sẽ hiện như hình 4 nhưng mọi thứ đều trống
          setSelectedCreator({
            id: loggedInUser.id,
            name: loggedInUser.displayName,
            avatarUrl: loggedInUser.avatarUrl,
            bio: loggedInUser.bio,
            role: loggedInUser.role,
            email: loggedInUser.email,
            followers: loggedInUser.followers || [],
            xuBalance: loggedInUser.xuBalance || 0,
          });
          setSelectedNovel(null);
          setSelectedChapter(null);
        }}
      />

      {/* Edit Profile Modal (Change Display Name & Avatar with Upload, Presets & URL) */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        user={activeUser}
        onSaveProfile={handleUpdateProfile}
      />

      {/* Register Creator Modal (Author & Editor Registration with 5-chapter draft & Bank Info) */}
      <RegisterCreatorModal
        isOpen={isRegisterCreatorOpen}
        onClose={() => setIsRegisterCreatorOpen(false)}
        user={activeUser}
        genres={genres}
        isCategoriesLoading={isCategoriesLoading}
        categoriesError={categoriesError}
        onAddNewGenre={handleAddNewGenre}
        onSubmitApplication={handleSubmitNovelForApproval}
        existingSubmission={(novelSubmissions || []).find((s) => s.submittedBy?.userId === activeUser.id || s.submittedBy?.userEmail === activeUser.email)}
      />

      {/* Mục 2: Truyện được quan tâm (Hình 3) */}
      <InterestedNovelsModal
        isOpen={isInterestedNovelsOpen}
        onClose={() => setIsInterestedNovelsOpen(false)}
        user={activeUser}
        novels={novels}
        onSelectNovel={(novel) => {
          handleSelectNovel(novel);
        }}
        onToggleInterest={handleToggleInterest}
      />

      {/* Mục 3: Đang theo dõi (Hình 4) */}
      <FollowingNovelsModal
        isOpen={isFollowingNovelsOpen}
        onClose={() => setIsFollowingNovelsOpen(false)}
        user={activeUser}
        novels={novels}
        onSelectNovel={(novel) => {
          handleSelectNovel(novel);
        }}
        onSelectCreator={(creatorName) => handleSelectCreator(creatorName)}
        onUnfollowCreator={(creatorName) => handleFollowCreator(creatorName, false)}
      />


      {/* Mục 9: Thông tin tài khoản & tác giả (Hình 10) */}
      <UserInfoModal
        isOpen={isUserInfoOpen}
        onClose={() => setIsUserInfoOpen(false)}
        user={activeUser}
        onUpdateProfile={handleUpdateUserInfo}
      />

      {/* Mục 10: Đổi mật khẩu (Hình 11) */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        user={activeUser}
      />

      {/* Footer */}
      <footer className="site-footer bg-[#06080e] border-t border-rose-500/20 py-10 mt-16 text-xs text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2 space-y-3">
              <DaoTamLogo size="sm" />
              <p className="text-white text-xs leading-relaxed max-w-md">
                Nền tảng đọc truyện chữ trực tuyến phong phú. Không gian đọc tĩnh tâm, bảo vệ thị lực, tự động lưu và đồng bộ tiến trình đọc theo tài khoản.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-white uppercase tracking-wider mb-3">Thông Tin &amp; Hỗ Trợ</h4>
              <ul className="space-y-1.5 text-white">
                <li>• Điều khoản sử dụng &amp; Bản quyền</li>
                <li>• Chính sách bảo mật độc giả</li>
                <li>• Hướng dẫn nạp Xu &amp; mở khóa chương</li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white uppercase tracking-wider mb-3">Cam Kết Trải Nghiệm</h4>
              <p className="text-white text-xs leading-relaxed">
                Đạo Tâm tôn trọng trải nghiệm đọc sách thuần khiết của bạn, cam kết tốc độ tải trang nhanh chóng, không quảng cáo chen ngang gây khó chịu.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800/70 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-white">
            <div>
              &copy; 2026 Đạo Tâm. Hệ thống đọc truyện trực tuyến chuẩn mực.
            </div>
            <div className="flex items-center gap-2 text-white">
              <span className="font-semibold text-white">Fanpage:</span>
              <a 
                href="https://www.facebook.com/docvanghedaotam" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#91C9FF] hover:underline font-medium transition-colors"
              >
                https://www.facebook.com/docvanghedaotam
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* VIP Policy Modal */}
      <VipPolicyModal
        isOpen={isVipPolicyOpen}
        onClose={() => setIsVipPolicyOpen(false)}
      />

      {/* Daily Login Reward Modal (5 Flowers, yêu cầu đăng nhập Gmail, 24h cooldown) */}
      <DailyRewardModal
        isOpen={isDailyRewardOpen}
        onClose={() => setIsDailyRewardOpen(false)}
        user={activeUser}
        onClaim={handleClaimDailyFlowers}
        onLogin={() => {
          setIsDailyRewardOpen(false);
          setIsAuthModalOpen(true);
        }}
      />

      {/* Novel Nomination / Flower Gift Modal */}
      {nominatingNovel && (
        <NominateNovelModal
          isOpen={isNominateOpen}
          onClose={() => {
            setIsNominateOpen(false);
            setNominatingNovel(null);
          }}
          novel={nominatingNovel}
          user={activeUser}
          onNominate={handleNominateNovel}
          onOpenDailyReward={() => setIsDailyRewardOpen(true)}
        />
      )}

      {/* Author & Editor Workspace Modal (Quản Lý Tác Phẩm, Soạn & Hẹn Giờ Chương VIP, Doanh Thu & Rút Nhuận Bút >= 100 Xu) */}
      <AuthorDashboardModal
        isOpen={isAuthorShowcaseOpen}
        onClose={() => setIsAuthorShowcaseOpen(false)}
        user={activeUser}
        novels={novels}
        withdrawalRequests={withdrawalRequests}
        onSubmitWithdrawal={handleCreateWithdrawal}
        onSaveChapter={handleSaveChapterFromAuthor}
        onOpenCreateNovel={() => {
          setIsAuthorShowcaseOpen(false);
          setSelectedNovel(null);
          setSelectedChapter(null);
          setSelectedCreator(null);
          setActivePageView('submit-novel');
        }}
        onOpenEditNovel={handleOpenEditNovel}
      />

      {/* Report Novel Modal (Báo Cáo Vi Phạm: Bản Quyền, 18+, Reup, Bôi Nhọ VN, Khác) */}
      {reportingNovel && (
        <ReportNovelModal
          isOpen={isReportOpen}
          onClose={() => {
            setIsReportOpen(false);
            setReportingNovel(null);
          }}
          novel={reportingNovel}
          user={activeUser}
          onSubmitReport={handleSubmitReport}
        />
      )}

      {/* Donate Creator Modal ($ Donate cho Tác Giả / Editor / Admin) */}
      <DonateModal
        isOpen={isDonateOpen}
        onClose={() => {
          setIsDonateOpen(false);
          setDonatingCreator(null);
          setDonatingNovel(null);
        }}
        creator={donatingCreator}
        novel={donatingNovel}
        user={activeUser}
        onDonateXu={handleDonateXu}
        onOpenTopUp={() => {
          setIsDonateOpen(false);
          setIsTopUpOpen(true);
        }}
      />

      {/* Floating Yellow / Amber Loading Progress Card khi xử lý dữ liệu lớn (đăng nhiều chương) */}
      {batchProgress && batchProgress.active && (
        <div className="fixed bottom-6 right-6 z-[9998] max-w-sm w-[90vw] p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100 border-2 border-amber-400 shadow-2xl shadow-amber-500/25 text-amber-950 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 truncate">
              <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="font-extrabold text-xs truncate">⚡ Đang gộp lưu: {batchProgress.novelTitle}</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-black text-[11px] shadow-xs flex-shrink-0">
              {Math.min(100, Math.max(5, Math.round((batchProgress.saved / batchProgress.total) * 100)))}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-amber-200/80 rounded-full overflow-hidden p-0.5 border border-amber-300">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(5, Math.round((batchProgress.saved / batchProgress.total) * 100)))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-amber-900 font-semibold mt-1.5">
            <span>Đã ghi: {batchProgress.saved}/{batchProgress.total} chương</span>
            <span className="text-[10px] text-amber-700">writeBatch an toàn &lt; 500 ops</span>
          </div>
        </div>
      )}

      {/* Global Toast Notification Banner */}
      {globalBanner && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] max-w-lg w-[92vw] px-4 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-300 border border-pink-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
            globalBanner.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
            globalBanner.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-pink-100 text-pink-600'
          }`}>
            {globalBanner.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
             globalBanner.type === 'error' ? <AlertCircle className="w-5 h-5 text-rose-600" /> : <Sparkles className="w-5 h-5 text-pink-600" />}
          </div>
          <div className="flex-1 text-xs sm:text-sm font-semibold leading-relaxed">
            {globalBanner.message}
          </div>
          <button
            onClick={() => setGlobalBanner(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* PWA Mobile Install Prompt & Yellow Alert Banner */}
      <PWAInstallPrompt />

      {/* THANH NỔI AUDIO MICROSOFT EDGE TTS (CHUẨN HÌNH 1, HỖ TRỢ NGHE KHI TẮT MÀN HÌNH & MEDIA SESSION LOCKSCREEN) */}
      <EdgeTTSFloatingAudioBar
        onOpenReader={(novel, chapter) => {
          handleSelectChapter(novel, chapter, false);
        }}
      />

      {/* KHUNG CHAT NỔI RESPONSIVE (CHUẨN MESSENGER TRÊN DESKTOP, BOTTOM SHEET TRÊN MOBILE) */}
      <FloatingChatWidget
        isOpen={isChatWidgetOpen}
        onClose={() => {
          setIsChatWidgetOpen(false);
          setChatInitialTarget(null);
        }}
        currentUser={activeUser}
        initialTargetUser={chatInitialTarget}
        onClearInitialTarget={() => setChatInitialTarget(null)}
        onOpenLogin={() => {
          setAuthModalMode('login');
          setIsAuthModalOpen(true);
        }}
        onOpenAdminSupport={() => {
          setIsChatWidgetOpen(false);
          setLiveChatOpenSignal((s) => s + 1);
        }}
      />

      {/* KHUNG LIVE CHAT HỖ TRỢ TRỰC TUYẾN THỜI GIAN THỰC */}
      {!isChatWidgetOpen && (
        <ClientLiveChat
          currentUser={activeUser}
          openSignal={liveChatOpenSignal}
          onOpenLogin={() => {
            setAuthModalMode('login');
            setIsAuthModalOpen(true);
          }}
        />
      )}

      {/* MODAL GIÁM SÁT TIN NHẮN TÀNG HÌNH DÀNH CHO 2 ADMIN CHÍNH THỨC (STEALTH MODE) */}
      <AdminMessagesModal
        isOpen={isAdminMessagesOpen}
        onClose={() => {
          setIsAdminMessagesOpen(false);
          if (location.pathname === '/admin/messages') {
            navigate('/');
          }
        }}
        currentUser={activeUser}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AudioProvider>
        <DaoTamApp />
      </AudioProvider>
    </AuthProvider>
  );
}
