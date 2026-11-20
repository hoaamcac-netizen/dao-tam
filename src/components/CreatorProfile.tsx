import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  Eye, 
  BookOpen, 
  UserCheck, 
  UserPlus, 
  DollarSign, 
  Search,
  Plus,
  SlidersHorizontal,
  Edit3,
  Sparkles,
  PenTool,
  MessageSquare,
  Library,
  Crown,
  Bookmark,
  Loader2,
  Lock
} from 'lucide-react';
import { Novel, UserProfile, ChatTargetUser } from '../types';
import StoryCard from './StoryCard';
import { canChatTogether, normalizeChatRole } from '../services/chatService';

export interface CreatorProfileData {
  id?: string;
  uid?: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  role?: string;
  followers?: string[];
  email?: string;
  xuBalance?: number;
  authorEarnedXu?: number;
}

interface CreatorProfileProps {
  creator: CreatorProfileData;
  allNovels: Novel[];
  currentUser: UserProfile;
  onBack: () => void;
  onSelectNovel: (novel: Novel) => void;
  onFollowToggle: (creatorIdOrName: string, shouldFollow: boolean) => void;
  onOpenDonateModal: (creator: CreatorProfileData) => void;
  onSelectCreator?: (creatorName: string) => void;
  onOpenEditProfile?: () => void;
  onOpenSubmitNovel?: () => void;
  onOpenRegisterCreator?: () => void;
  onOpenDirectChat?: (target: ChatTargetUser) => void;
  onOpenPurchasedNovels?: () => void;
}

export const CreatorProfile: React.FC<CreatorProfileProps> = ({
  creator,
  allNovels,
  currentUser,
  onBack,
  onSelectNovel,
  onFollowToggle,
  onOpenDonateModal,
  onSelectCreator,
  onOpenEditProfile,
  onOpenSubmitNovel,
  onOpenRegisterCreator,
  onOpenDirectChat,
  onOpenPurchasedNovels,
}) => {
  const [novelSearch, setNovelSearch] = useState('');
  const [selectedGenreFilter, setSelectedGenreFilter] = useState('all');

  // Tab state trên Trang Cá Nhân: 'novels' (Truyện đã đăng) | 'tu-truyen' (Tủ truyện)
  const [activeProfileTab, setActiveProfileTab] = useState<'novels' | 'tu-truyen'>('novels');

  // Định danh UID và dữ liệu hồ sơ
  const profileData = creator;
  const currentUid = (currentUser as any)?.uid || currentUser?.id;
  const profileUid = (profileData as any)?.uid || profileData?.id;

  const isSelf = currentUser.isLoggedIn && (
    (creator.id && creator.id === currentUser.id) ||
    (creator.email && creator.email === currentUser.email) ||
    creator.name.toLowerCase().trim() === currentUser.displayName.toLowerCase().trim()
  );

  // Bảo mật hiển thị (Privacy Guard): Tab 'Tủ Truyện' chứa tài sản cá nhân, BẮT BUỘC bọc nó bằng điều kiện:
  // currentUser?.uid === profileData?.uid
  const isPrivacyOwner = Boolean(
    currentUser?.isLoggedIn &&
    (
      (currentUser as any)?.uid === (profileData as any)?.uid ||
      (currentUid && profileUid && currentUid === profileUid) ||
      isSelf
    )
  );

  // Phân quyền tương tác: Kiểm tra Độc Giả <-> Tác Giả/Editor (Ẩn danh hoàn toàn vai trò Admin)
  const canChatWithCreator = useMemo(() => {
    if (isSelf) return false;
    const maskedCreatorRole = creator.role === 'admin' ? 'author' : (creator.role || 'author');
    const check = canChatTogether(currentUser, {
      id: creator.id || creator.name,
      role: maskedCreatorRole,
    });
    return check.allowed;
  }, [currentUser, creator.id, creator.name, creator.role, isSelf]);

  // Lọc tất cả truyện liên quan đến Creator này
  const creatorNovels = useMemo(() => {
    const creatorNameLower = (creator?.name || '').toLowerCase().trim();
    return (allNovels || []).filter((n) => {
      const matchAuthor = n.author?.toLowerCase().trim() === creatorNameLower;
      const matchEditor = n.editor?.toLowerCase().trim() === creatorNameLower;
      const matchUserId = creator?.id && n.submittedBy?.userId === creator.id;
      return matchAuthor || matchEditor || matchUserId;
    });
  }, [allNovels, creator]);

  // Kiểm tra tài khoản có phải là nhà đăng truyện / tác giả / admin đã được duyệt
  const targetRole = isSelf ? currentUser.role : (creator.role || 'reader');
  // Đối tượng Admin, Tác giả, Editor: BẮT BUỘC dùng điều kiện isPrivilegedUser để CHỈ hiển thị tab 'Truyện đã đăng' cho nhóm này
  const isPrivilegedUser = Boolean(
    targetRole === 'admin' ||
    targetRole === 'author' ||
    targetRole === 'editor' ||
    (creator.role === 'admin' || creator.role === 'author' || creator.role === 'editor') ||
    Boolean((creator as any)?.isAuthor) ||
    (creatorNovels?.length || 0) > 0
  );
  const isApprovedCreator = isPrivilegedUser;

  // Điều chỉnh tab tự động: TUYỆT ĐỐI ẨN tab 'Truyện đã đăng' đối với Độc giả
  useEffect(() => {
    if (!isPrivilegedUser && activeProfileTab === 'novels' && isPrivacyOwner) {
      setActiveProfileTab('tu-truyen');
    }
  }, [isPrivilegedUser, isPrivacyOwner, activeProfileTab]);

  // Thống kê tổng
  const totalNovels = creatorNovels?.length || 0;
  const totalViews = useMemo(() => {
    return (creatorNovels || []).reduce((sum, n) => sum + (n.views || 0), 0);
  }, [creatorNovels]);

  // Số dư xu hiển thị (chỉ hiển thị cho chính chủ)
  const displayXu = isSelf 
    ? ((currentUser?.xuBalance || 0) + (currentUser?.authorEarnedXu || 0))
    : (typeof creator?.xuBalance === 'number' ? ((creator.xuBalance || 0) + (creator.authorEarnedXu || 0)) : 0);

  // Kiểm tra trạng thái đã theo dõi hay chưa
  const creatorKey = creator?.id || creator?.name || '';
  const isFollowing = useMemo(() => {
    if (!Array.isArray(currentUser?.followingCreators)) return false;
    return (
      (creator?.id && currentUser.followingCreators.includes(creator.id)) ||
      currentUser.followingCreators.includes(creator?.name)
    );
  }, [currentUser?.followingCreators, creator]);

  const followers = Array.isArray(creator?.followers) ? creator.followers : [];
  const followersCount = (followers?.length || 0) + (isFollowing && !followers.includes(currentUser?.id) ? 1 : 0);

  // Danh sách truyện có nhiều lượt xem trong tháng
  const topViewedNovels = useMemo(() => {
    return [...(creatorNovels || [])]
      .sort((a, b) => (b.dailyViews || b.views || 0) - (a.dailyViews || a.views || 0))
      .slice(0, 10);
  }, [creatorNovels]);

  // Lọc danh sách truyện theo ô tìm kiếm & thể loại
  const filteredAllNovels = useMemo(() => {
    return (creatorNovels || []).filter((n) => {
      const matchSearch = !novelSearch.trim() || (n.title || '').toLowerCase().includes(novelSearch.toLowerCase().trim());
      const matchGenre = selectedGenreFilter === 'all' || (Array.isArray(n.categories) && n.categories.includes(selectedGenreFilter));
      return matchSearch && matchGenre;
    });
  }, [creatorNovels, novelSearch, selectedGenreFilter]);

  // Danh sách thể loại có trong truyện của tác giả này
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    (creatorNovels || []).forEach((n) => (Array.isArray(n.categories) ? n.categories : []).forEach((c) => set.add(c)));
    return Array.from(set);
  }, [creatorNovels]);

  // Avatar, Tên & Tiểu sử
  const avatarUrl = isSelf ? currentUser.avatarUrl : creator.avatarUrl;
  const displayName = isSelf ? currentUser.displayName : creator.name;
  const bioText = isSelf ? currentUser.bio : creator.bio;

  return (
    <div className="max-w-7xl mx-auto w-full overflow-x-hidden px-3 sm:px-6 lg:px-8 py-4 sm:py-6 animate-in fade-in duration-200">
      
      {/* Top Navigation Back Button */}
      <div className="mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại trang trước</span>
        </button>
      </div>

      {/* =========================================================================
          KHỐI THÔNG TIN HỒ SƠ CÁ NHÂN (Chuẩn theo hình 2 & 3)
         ========================================================================= */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 p-6 sm:p-8 mb-8">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          
          {/* Avatar Lớn */}
          <div className="relative flex-shrink-0">
            {avatarUrl && avatarUrl.trim() !== '' ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-slate-200 dark:border-slate-700 shadow-md bg-slate-100"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80';
                }}
              />
            ) : (
              /* Avatar chữ tròn màu xám xanh chuẩn hình 2 */
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#64748b] text-white flex items-center justify-center font-bold text-4xl shadow-md border-4 border-slate-200 dark:border-slate-700">
                <span className="uppercase">{displayName?.charAt(0) || 'C'}</span>
              </div>
            )}
            
            {/* Nút icon bút chỉnh sửa ảnh đại diện (Chỉ hiện khi là chính mình theo hình 2) */}
            {isSelf && onOpenEditProfile && (
              <button
                type="button"
                onClick={onOpenEditProfile}
                className="absolute bottom-1 right-1 p-2 rounded-full bg-[#f43f5e] hover:bg-[#e11d48] text-white shadow-md transition cursor-pointer"
                title="Thay đổi ảnh đại diện & thông tin"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Chi tiết Tên, Tiểu sử, Thống kê, Cụm nút bấm */}
          <div className="flex-1 text-center md:text-left space-y-3">
            
            {/* Tên người dùng */}
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {displayName || 'Chi Phạm'}
            </h1>

            {/* Tiểu sử (Bio) chuẩn câu chữ như hình 2 */}
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {bioText?.trim() ? (
                bioText
              ) : isSelf ? (
                isApprovedCreator ? (
                  <span className="text-slate-600 dark:text-slate-400">
                    Chưa có tiểu sử giới thiệu. Nhấn "Thiết lập danh sách truyện hay" hoặc icon cây bút ở ảnh đại diện để điền thông tin và đổi ảnh đại diện.
                  </span>
                ) : (
                  <span className="text-slate-600 dark:text-slate-400">
                    Chưa có tiểu sử giới thiệu. Nhấn icon cây bút ở ảnh đại diện để điền thông tin và đổi ảnh đại diện.
                  </span>
                )
              ) : (
                <span className="italic text-slate-400">
                  Tác giả chưa cập nhật tiểu sử giới thiệu.
                </span>
              )}
            </p>

            {/* Thống kê:
                - Nếu là Độc giả thông thường tự xem trang của mình: BỎ LƯỢT XEM, BỎ SỐ TRUYỆN (chỉ hiện Xu hiện có và Lượt theo dõi).
                - Nếu là Nhà đăng truyện tự xem trang của mình (Hình 2): Hiện đủ Xu hiện có, Lượt theo dõi, Lượt xem, Số truyện.
                - Nếu người khác vào xem trang người đăng truyện (Hình 3): Ẩn Xu hiện có (bảo mật ví cá nhân), chỉ hiện Lượt theo dõi, Lượt xem, Số truyện!
            */}
            <div className="pt-2 text-xs text-slate-700 dark:text-slate-300 space-y-1 font-medium">
              
              {/* Xu hiện có: Chỉ hiển thị cho chính chủ */}
              {isSelf && (
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">Xu hiện có:</span>{' '}
                  <span className="text-rose-600 font-bold">{displayXu} xu</span>
                </div>
              )}

              {/* Lượt theo dõi */}
              <div>
                <span className="font-semibold text-slate-900 dark:text-white">Lượt theo dõi:</span>{' '}
                <span>{followersCount}</span>
              </div>

              {/* Lượt xem & Số truyện: CHỈ HIỆN KHI LÀ NHÀ ĐĂNG TRUYỆN ĐÃ ĐƯỢC DUYỆT (ẨN VỚI ĐỘC GIẢ THƯỜNG THEO YÊU CẦU) */}
              {isApprovedCreator && (
                <>
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">Lượt xem:</span>{' '}
                    <span>{totalViews}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">Số truyện:</span>{' '}
                    <span>{totalNovels}</span>
                  </div>
                </>
              )}

            </div>

            {/* Cụm Nút Bấm:
                - Độc giả thông thường tự xem: BỎ DONATE, BỎ THIẾT LẬP DANH SÁCH TRUYỆN HAY.
                - Nhà đăng truyện tự xem (Hình 2): Hiện $ Donate và THIẾT LẬP DANH SÁCH TRUYỆN HAY.
                - Người khác vào xem nhà đăng truyện (Hình 3): Hiện $ Donate và + Theo dõi.
            */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 pt-3">
              
              {isSelf ? (
                /* CHÍNH CHỦ XEM TRANG CÁ NHÂN */
                isApprovedCreator ? (
                  /* HÌNH 2: NHÀ ĐĂNG TRUYỆN TỰ XEM */
                  <>
                    {/* Nút $ $ Donate màu hồng chuẩn hình 2 */}
                    <button
                      type="button"
                      onClick={() => onOpenDonateModal(creator)}
                      className="px-5 py-2.5 rounded-xl bg-[#f03d5f] hover:bg-[#e02d4f] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-rose-500/20 cursor-pointer transition"
                    >
                      <span>$ $ Donate</span>
                    </button>

                    {/* Nút THIẾT LẬP DANH SÁCH TRUYỆN HAY màu vàng chuẩn hình 2 */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenEditProfile) {
                          onOpenEditProfile();
                        }
                      }}
                      className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-amber-400/20 cursor-pointer transition uppercase tracking-wide"
                    >
                      <span>🎨 THIẾT LẬP DANH SÁCH TRUYỆN HAY</span>
                    </button>
                  </>
                ) : (
                  /* ĐỘC GIẢ THÔNG THƯỜNG: BỎ DONATE & THIẾT LẬP TRUYỆN HAY */
                  <div className="flex items-center gap-2">
                    {onOpenEditProfile && (
                      <button
                        type="button"
                        onClick={onOpenEditProfile}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition cursor-pointer"
                      >
                        ✏️ Chỉnh sửa thông tin
                      </button>
                    )}
                    {onOpenRegisterCreator && (
                      <button
                        type="button"
                        onClick={onOpenRegisterCreator}
                        className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/25 transition cursor-pointer"
                      >
                        ✍️ Đăng ký làm nhà đăng truyện
                      </button>
                    )}
                  </div>
                )
              ) : (
                /* HÌNH 3: NGƯỜI KHÁC VÀO XEM TRANG CỦA NGƯỜI ĐĂNG TRUYỆN */
                isApprovedCreator && (
                  <>
                    {/* Nút $ $ Donate để độc giả ủng hộ tác giả */}
                    <button
                      type="button"
                      onClick={() => onOpenDonateModal(creator)}
                      className="px-5 py-2.5 rounded-xl bg-[#f03d5f] hover:bg-[#e02d4f] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-rose-500/20 cursor-pointer transition"
                    >
                      <DollarSign className="w-4 h-4 stroke-[2.5]" />
                      <span>$ Donate Tác Giả</span>
                    </button>

                    {/* Nút Nhắn Tin Trực Tiếp: Tự động ẩn nếu vi phạm luật phân quyền tương tác */}
                    {canChatWithCreator && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenDirectChat) {
                            onOpenDirectChat({
                              id: creator.id || creator.name,
                              displayName: creator.name,
                              avatarUrl: creator.avatarUrl,
                              role: normalizeChatRole(creator.role === 'admin' ? 'author' : (creator.role || 'author')),
                            });
                          }
                        }}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-pink-500/20 cursor-pointer transition"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Nhắn tin</span>
                      </button>
                    )}

                    {/* Nút + Theo dõi / Đang theo dõi */}
                    <button
                      type="button"
                      onClick={() => onFollowToggle(creatorKey, !isFollowing)}
                      className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                        isFollowing
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-4 h-4 text-emerald-600" />
                          <span>Đang theo dõi</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          <span>+ Theo dõi</span>
                        </>
                      )}
                    </button>
                  </>
                )
              )}

            </div>

          </div>

        </div>
      </div>

      {/* =========================================================================
          CÁC TAB ĐIỀU HƯỚNG TRÊN TRANG CÁ NHÂN (/tac-gia/...)
          1. Tab 'Truyện đã đăng': Danh sách truyện của tác giả
          2. Tab 'Tủ Truyện': Chỉ hiển thị cho chính chủ (Privacy Guard)
          ========================================================================= */}
      {(isPrivilegedUser || isPrivacyOwner) && (
        <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3 mb-6 overflow-x-auto whitespace-nowrap">
          {/* Tab 1: Truyện đã đăng - CHỈ hiển thị cho người đăng truyện */}
          {isPrivilegedUser && (
            <button
              type="button"
              onClick={() => setActiveProfileTab('novels')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                activeProfileTab === 'novels'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Truyện đã đăng</span>
              {(creatorNovels?.length || 0) > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeProfileTab === 'novels' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  {creatorNovels?.length || 0}
                </span>
              )}
            </button>
          )}

          {/* Tab 2: Tủ Truyện - Hiển thị cho chính chủ xem hồ sơ của mình */}
          {isPrivacyOwner && (
            <button
              type="button"
              onClick={() => setActiveProfileTab('tu-truyen')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                activeProfileTab === 'tu-truyen'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Library className="w-4 h-4" />
              <span>Tủ Truyện</span>
            </button>
          )}
        </div>
      )}

      {/* =========================================================================
          NỘI DUNG THEO TAB ĐANG CHỌN
         ========================================================================= */}
      {activeProfileTab === 'novels' && isPrivilegedUser ? (
        <>
          {/* MỤC 1: TRUYỆN CÓ NHIỀU LƯỢT XEM TRONG THÁNG */}
            <section className="mb-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 sm:p-6 lg:p-7 shadow-xs">
              <div className="flex items-center justify-between pb-3.5 mb-5 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  TRUYỆN CÓ NHIỀU LƯỢT XEM TRONG THÁNG
                </h2>
                <span className="text-xs font-semibold text-slate-500">
                  {topViewedNovels?.length || 0} bộ truyện
                </span>
              </div>

              {(topViewedNovels?.length || 0) === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-2">
                  <BookOpen className="w-10 h-10 mx-auto text-slate-700 dark:text-slate-400" strokeWidth={1.5} />
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Chưa có truyện nào trong tháng này.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
                  {(topViewedNovels || []).map((novel, idx) => (
                    <StoryCard
                      key={`top-${novel.id}`}
                      novel={novel}
                      rank={idx + 1}
                      variant="catalog"
                      onSelect={onSelectNovel}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* MỤC 2: DANH SÁCH TRUYỆN */}
            <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 sm:p-6 lg:p-7 shadow-xs">
              
              <div className="mb-4">
                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  DANH SÁCH TRUYỆN
                </h2>
              </div>

              {/* Thanh Tìm Kiếm, Chọn Thể Loại, Lọc và Nút + Thêm */}
              <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                
                {/* Ô Tìm truyện */}
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={novelSearch}
                    onChange={(e) => setNovelSearch(e.target.value)}
                    placeholder="Tìm truyện..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-rose-500 transition"
                  />
                </div>

                {/* Chọn thể loại */}
                <div className="w-full sm:w-48">
                  <select
                    value={selectedGenreFilter}
                    onChange={(e) => setSelectedGenreFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="all">Chọn thể loại...</option>
                    {(availableGenres || []).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Nút Lọc */}
                <button
                  type="button"
                  className="w-full sm:w-auto px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Lọc</span>
                </button>

                {/* Nút + Thêm (Chỉ hiện khi là chính mình) */}
                {isSelf && onOpenSubmitNovel && (
                  <button
                    type="button"
                    onClick={onOpenSubmitNovel}
                    className="w-full sm:w-auto px-5 py-2 rounded-full bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm</span>
                  </button>
                )}

              </div>

              {/* Danh sách các tác phẩm dạng lưới hoặc rỗng */}
              {(filteredAllNovels?.length || 0) === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <BookOpen className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {isSelf ? 'Bạn chưa đăng tác phẩm nào.' : 'Tác giả chưa có tác phẩm nào.'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {isSelf 
                      ? 'Nhấn vào nút "+ Thêm" bên trên để bắt đầu sáng tác và gửi bản thảo!' 
                      : 'Hãy quay lại sau để đón đọc những bộ truyện mới nhất.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
                  {(filteredAllNovels || []).map((novel) => (
                    <StoryCard
                      key={novel.id}
                      novel={novel}
                      variant="catalog"
                      onSelect={(n) => onSelectNovel(n)}
                    />
                  ))}
                </div>
              )}

            </section>
          </>
      ) : activeProfileTab === 'tu-truyen' && isPrivacyOwner ? (
        /* TAB 2: TỦ TRUYỆN (BẢO MẬT PRIVACY GUARD: currentUser?.uid === profileData?.uid) */
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-black text-black dark:text-black title-tu-truyen uppercase tracking-wider flex items-center gap-2">
                <Library className="w-5 h-5 text-rose-500" />
                <span className="text-black dark:text-black">TỦ TRUYỆN CỦA BẠN</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Toàn bộ các tác phẩm bạn đã sở hữu trọn bộ hoặc mua chương VIP được quản lý độc lập tại trang Tủ Truyện.
              </p>
            </div>

            {onOpenPurchasedNovels && (
              <button
                type="button"
                onClick={onOpenPurchasedNovels}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition cursor-pointer flex items-center gap-2 self-start sm:self-auto"
              >
                <span>Mở Trang Tủ Truyện Độc Lập</span>
                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
              </button>
            )}
          </div>

          <div className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-6 sm:p-8 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center mx-auto">
              <Library className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
              Khu Vực Quản Lý Tủ Truyện Độc Lập
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Theo quy chuẩn kiến trúc mới, toàn bộ dữ liệu mua trọn bộ và mở khóa chương VIP đã được tách biệt hoàn toàn sang route page độc lập <strong>/tu-truyen-cua-ban</strong> với đầy đủ bộ lọc, thống kê và gắn nhãn VIP chính xác.
            </p>
            {onOpenPurchasedNovels && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onOpenPurchasedNovels}
                  className="px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/20 transition cursor-pointer"
                >
                  Truy cập Tủ truyện của bạn ngay &rarr;
                </button>
              </div>
            )}
          </div>
        </section>
      ) : null}

    </div>
  );
};
