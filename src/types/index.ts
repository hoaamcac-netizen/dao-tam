export type MainCategory = 'dam-my' | 'truyen-nam' | 'truyen-nu' | 'truyen-sang-tac';

export type UserRole = 'admin' | 'author' | 'reader';

export type StoryRole = 'author' | 'editor';

export interface GenreItem {
  id: string;
  name: string;
  iconName?: string;
  description?: string;
  isCustom?: boolean;
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  slug: string;
  content: string;
  wordCount?: number;
  publishedDate?: string;
  isVip?: boolean; // Rule: >= 51 if total >= 200, >= 31 if total < 200
  priceXu?: number;
  publishAt?: number;
  scheduledPublishAt?: number;
  authorNote?: string;
  isHidden?: boolean; // Ẩn chương khỏi độc giả, chỉ Tác giả và Quản trị viên mới thấy
  audioUrl?: string;
  audioUrlMale?: string;
  audioUrlFemale?: string;
  mp3Url?: string;
  maleAudioUrl?: string;
  audio?: string;
  femaleAudioUrl?: string;
  mp3Female?: string;
  audioCache?: Record<string, Record<string, string>>;
}

export interface Novel {
  id: string;
  title: string;
  slug: string;
  author: string;
  editor?: string; // Tên Editor hoặc dịch giả
  publisherRoles?: StoryRole[]; // ['author'], ['editor'], hoặc cả hai ['author', 'editor']
  coverImage: string;
  mainCategory: MainCategory; // 'dam-my' | 'truyen-nam' | 'truyen-nu' | 'truyen-sang-tac'
  status: 'Hoàn thành' | 'Full' | 'Đang ra' | 'Drop';
  publishStatus?: 'published' | 'pending_approval' | 'rejected' | 'hidden';
  isHidden?: boolean; // Ẩn khỏi độc giả, chỉ Admin mới thấy để quản lý
  submittedBy?: {
    userId: string;
    userName: string;
    userEmail: string;
  };
  isHot?: boolean;
  isOriginal?: boolean; // Đánh dấu truyện tự sáng tác chính chủ
  isShortStory?: boolean; // Đánh dấu truyện ngắn / đoản văn (thuộc tính Format bổ sung)
  youtubeVideoId?: string; // Video ID YouTube cho Truyện Ngắn
  isYoutubeVipLocked?: boolean; // Công tắc khóa VIP Audio YouTube (mặc định TẮT / false = miễn phí)
  isSensitive?: boolean; // Truyện có sử dụng một số từ ngữ nhạy cảm (bạo lực, kích thích,...)
  isExclusive?: boolean; // Đăng độc quyền tại Đạo Tâm (hưởng 90% doanh thu cho Editor, 95% cho Tác giả)
  royaltyRate?: number; // Tỷ lệ nhuận bút (Tác giả 95%, Editor độc quyền 90%, Editor không độc quyền 70%)
  totalChapters: number;
  views: number;
  dailyViews: number;
  rating: number;
  categories: string[];
  genres?: string[];
  description: string;
  translator?: string;
  createdAt?: number;
  updatedAt: number;
  lastChapterUpdatedAt?: number; // Thời điểm ra/sửa chương gần nhất (chỉ tác giả/admin thêm/sửa chương mới cập nhật)
  lastUpdated: string;
  hasAudio: boolean;
  hasMaleAudio?: boolean;
  hasFemaleAudio?: boolean;
  mp3NamMinhCount?: number;
  mp3HangNgaCount?: number;
  latestPublishAt?: number;
  flowerCount?: number; // Số hoa được bạn đọc và BQT đề cử
  coinCount?: number; // Tổng số xu được bạn đọc donate
  fullBookPriceXu: number;
  fullBookDiscountPriceXu?: number;
  chapters: Chapter[];
  latestChapterTitle?: string;
  latestChapterNumber?: number;
}

export interface SubmissionChapterDraft {
  number: number;
  title: string;
  content: string;
  wordCount?: number;
}

export interface NovelSubmission {
  id: string;
  title: string;
  author: string;
  editor?: string;
  publisherRoles?: StoryRole[]; // Tùy chọn vai trò: Tác giả, Editor hoặc cả hai
  isExclusive?: boolean; // Đăng độc quyền tại Đạo Tâm (95% nhuận bút)
  royaltyRate?: number; // 95% cho tác giả, 90% cho editor độc quyền, 70% cho không độc quyền
  mainCategory: MainCategory;
  isShortStory?: boolean; // Đánh dấu truyện ngắn / đoản văn (thuộc tính Format bổ sung)
  youtubeVideoId?: string; // Video ID YouTube cho Truyện Ngắn
  isYoutubeVipLocked?: boolean; // Công tắc khóa VIP Audio YouTube
  categories: string[];
  description: string;
  coverImage: string;
  chapters?: SubmissionChapterDraft[]; // Bắt buộc 5 chương bản thảo để Admin thẩm định chất lượng trước khi duyệt
  submittedBy: {
    userId: string;
    userName: string;
    userEmail: string;
  };
  bankInfo?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  isCreatorApplication?: boolean; // Đơn đăng ký từ Độc Giả nâng cấp thành Tác Giả / Editor
  submittedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface ReadingProgress {
  novelId: string;
  novelTitle: string;
  novelCover: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterId: string;
  scrollPercentage: number;
  lastSentenceIndex?: number;
  lastReadAt: number;
}

export interface TopUpRequest {
  id: string;
  uid?: string; // UID người dùng từ currentUser.uid
  userId: string;
  userEmail: string;
  userName: string;
  amountVnd: number;
  xuAmount: number; // 1 Xu = 1 VNĐ (1 xu = 1 đồng)
  transferCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder?: string;
  sellerName?: string;
  billImageUrl?: string; // Ảnh biên lai / bill chuyển khoản thành công từ ngân hàng
  proofNote?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  processedAt?: number;
  processedBy?: string;
  rejectReason?: string;
  rejectionReason?: string;
}

export interface PurchaseHistoryItem {
  id: string;
  novelId: string;
  novelTitle: string;
  type: 'chapter' | 'full_book';
  chapterId?: string;
  chapterNumber?: number;
  pricePaid: number;
  purchasedAt: number;
}

export interface Comment {
  id: string;
  novelId: string;
  novelTitle?: string;
  chapterId?: string;
  chapterNumber?: number;
  parentId?: string | null;
  userId?: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: number;
  likes: number;
  isLiked?: boolean;
}

export interface VoiceOption {
  id: string; // 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural'
  shortName?: string;
  name: string;
  tag: string;
  gender: 'female' | 'male';
  region?: 'Bắc' | 'Nam';
  locale?: string;
  pitch: number;
  rateMultiplier: number;
  sampleText: string;
  description: string;
  audioSampleUrl?: string;
}

export interface WithdrawalRequest {
  id: string;
  code?: string; // Mã đơn rút tiền chuẩn hình 2 (VD: WR85143792)
  authorId: string;
  authorName: string;
  authorEmail: string;
  amountXu: number; // Tối thiểu 1000 xu mới được rút
  amountVnd: number; // 1 Xu = 1 VNĐ (1 xu = 1 đồng)
  remainingXu: number; // Số xu còn lại của tác giả
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  approvedAt?: number;
  rejectionReason?: string;
}

export interface CreatorApplication {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleType: 'author' | 'editor' | 'both';
  penName: string;
  bio?: string;
  bankInfo: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  sampleNovel: {
    title: string;
    mainCategory: MainCategory;
    categories: string[];
    description: string;
    coverImage: string;
    chapters: SubmissionChapterDraft[]; // Tối thiểu 5 chương để duyệt
  };
  submittedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  approvedAt?: number;
}

export interface NovelReport {
  id: string;
  novelId: string;
  novelTitle: string;
  novelCover?: string;
  author: string;
  reason: 'Truyện bản quyền' | 'Truyện 18+' | 'Truyện reup' | 'Truyện bôi nhọ Việt Nam' | 'Lý do khác';
  details?: string;
  reporterId?: string;
  reporterName?: string;
  reporterEmail?: string;
  createdAt: number;
  status: 'pending' | 'resolved' | 'dismissed';
  adminNotes?: string;
}

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  type: 'creator_approved' | 'withdrawal_approved' | 'withdrawal_rejected' | 'novel_approved' | 'system' | 'topup' | 'payout' | 'report_action';
  createdAt: number;
  isRead: boolean;
  novelId?: string;
}

export type AppNotification = UserNotification;

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  bio?: string; // Tiểu sử ngắn của tác giả / editor / độc giả
  followers?: string[]; // Mảng ID những người theo dõi
  followingCreators?: string[]; // Mảng ID các Tác giả/Editor/Admin đang theo dõi
  isLoggedIn: boolean;
  role: UserRole; // 'admin' | 'author' | 'reader'
  isBanned?: boolean; // Bị cấm vĩnh viễn do vi phạm bản quyền / 18+ / gian lận
  isLocked?: boolean; // Đồng bộ trạng thái khóa tài khoản để query Admin orderBy('isLocked', 'desc')
  xuBalance: number;
  authorEarnedXu?: number; // Số xu nhuận bút tác giả nhận được từ các chương VIP (>= 100 xu mới được rút)
  flowerBalance?: number; // Số hoa đề cử tích lũy (nhận 5 hoa/ngày, Admin vô hạn hoa)
  lastDailyRewardDate?: string; // Ngày nhận hoa gần nhất (ISO string)
  lastDailyRewardTimestamp?: number; // Timestamp nhận hoa gần nhất (ms) để tính 24h
  // Mục thông tin đại diện cá nhân bắt buộc cho Tác Giả & Editor
  facebookUrl?: string; // Facebook cá nhân hoặc Fanpage
  fanpageUrl?: string;
  phoneNumber?: string; // Số điện thoại liên hệ
  bankInfo?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  notifications?: UserNotification[];
  readingHistory: ReadingProgress[];
  bookmarks: string[];
  interestedNovels?: string[]; // Mảng ID các truyện được quan tâm (Mục 2)
  followingNovels?: string[]; // Mảng ID các truyện đang theo dõi (Mục 3)
  purchasedChapters?: string[] | Record<string, string[]>;
  purchasedStories?: Array<string | Record<string, any>>;
  unlockedChapters: Record<string, string[]>;
  unlockedFullBooks: string[];
  purchases: PurchaseHistoryItem[];
}

export interface ReaderSettings {
  fontSize: number; // 14 - 28px
  lineHeight: number; // 1.5 - 2.2
  fontFamily: 'vietnam' | 'lora' | 'merriweather' | 'sans';
  theme: 'dark' | 'midnight' | 'light' | 'sepia';
  autoScroll: boolean;
  autoNextChapter: boolean; // Tự động chuyển chương khi nghe audio hết chương
  voiceSpeed: number; // 0.75 - 3.0
  selectedVoiceId: string; // 'vi-VN-HoaiMyNeural' | 'vi-VN-NamMinhNeural' | 'device-fallback'
  selectedVoiceExplicitDevice?: boolean;
  autoHighlight: boolean;
  audioEngine?: 'native' | 'edge'; // 'native' (Tức thì 0s trễ, mượt mà tức thì) | 'edge' (Edge Cloud)
}

export interface DonationRecord {
  id: string;
  donorUserId: string;
  donorName: string;
  donorEmail?: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail?: string;
  novelId?: string;
  novelTitle?: string;
  amountXu: number;
  message: string;
  createdAt: number;
  status: 'completed';
}

export interface ChatParticipantInfo {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  role: 'reader' | 'author' | 'editor';
}

export interface Conversation {
  id: string;
  participants: string[];
  participantDetails?: Record<string, ChatParticipantInfo>;
  lastMessage: string;
  lastSenderId: string;
  lastSenderName: string;
  isRead: boolean;
  updatedAt: number;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderRole: 'reader' | 'author' | 'editor';
  text: string;
  createdAt: number;
  isRead?: boolean;
}

export interface ChatTargetUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  role: 'reader' | 'author' | 'editor';
}
