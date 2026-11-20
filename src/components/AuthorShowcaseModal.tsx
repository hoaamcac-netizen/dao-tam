import React, { useState, useMemo } from 'react';
import { Novel, UserProfile } from '../types';
import { formatXu } from '../utils/rulesAndVoices';
import { 
  X, 
  Book, 
  BookOpen, 
  BookCheck, 
  Eye, 
  Coins, 
  Sparkles, 
  Plus, 
  Search, 
  Edit3, 
  ExternalLink, 
  Filter, 
  Award, 
  UserCheck, 
  ShieldCheck, 
  Clock, 
  ChevronRight,
  TrendingUp,
  Share2
} from 'lucide-react';
import { DaoTamLogo } from './DaoTamLogo';
import { normalizeViText } from '../utils/rulesAndVoices';

interface AuthorShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorName?: string;
  role?: 'author' | 'editor';
  novels: Novel[];
  currentUser: UserProfile;
  onSelectNovel: (novel: Novel) => void;
  onOpenEditNovel: (novel: Novel) => void;
  onOpenSubmitNovel: () => void;
  onOpenWithdraw?: () => void;
}

export const AuthorShowcaseModal: React.FC<AuthorShowcaseModalProps> = ({
  isOpen,
  onClose,
  authorName,
  role = 'author',
  novels,
  currentUser,
  onSelectNovel,
  onOpenEditNovel,
  onOpenSubmitNovel,
  onOpenWithdraw,
}) => {
  // Extract all distinct authors and editors from novels list
  const creatorList = useMemo(() => {
    const map = new Map<string, { name: string; type: 'author' | 'editor'; count: number }>();
    (novels || []).forEach((n) => {
      const a = normalizeViText(n.author);
      if (a) {
        const existing = map.get(a);
        map.set(a, { name: a, type: 'author', count: (existing?.count || 0) + 1 });
      }
      const ed = normalizeViText(n.editor || n.translator);
      if (ed && ed !== a) {
        const existing = map.get(ed);
        map.set(ed, { name: ed, type: 'editor', count: (existing?.count || 0) + 1 });
      }
    });
    return Array.from(map.values());
  }, [novels]);

  // Selected Creator Name
  const [selectedCreator, setSelectedCreator] = useState<string>(() => {
    if (authorName && authorName.trim()) return authorName.trim();
    if (currentUser?.role === 'author' && currentUser?.displayName) return currentUser.displayName;
    return creatorList?.[0]?.name || 'Phi Thiên Ngư';
  });

  // Filter states
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Update selected creator when prop changes
  React.useEffect(() => {
    if (authorName && authorName.trim()) {
      setSelectedCreator(authorName.trim());
    }
  }, [authorName]);

  if (!isOpen) return null;

  // Filter novels by selected creator (as author OR as editor)
  const creatorNovels = (novels || []).filter((n) => {
    const aMatch = normalizeViText(n.author).toLowerCase() === selectedCreator.toLowerCase();
    const edMatch = normalizeViText(n.editor || n.translator || '').toLowerCase() === selectedCreator.toLowerCase();
    return aMatch || edMatch;
  });

  // Only display real novels created by this creator (no fake mock fallback)
  const displayNovels = creatorNovels || [];

  // Calculate the 4 exact statistics for image 2
  const totalBooks = displayNovels?.length || 0;
  const completedBooks = (displayNovels || []).filter((n) => n.status === 'Hoàn thành')?.length || 0;
  
  // Calculate total monthly views (estimated from dailyViews * 30 or views proportion)
  const totalMonthlyViews = (displayNovels || []).reduce((acc, n) => {
    const monthly = n.dailyViews ? n.dailyViews * 30 : Math.round((n.views || 0) * 0.35);
    return acc + monthly;
  }, 0);

  // Calculate total coin earned from VIP unlocked chapters
  const totalCoinsEarned = (displayNovels || []).reduce((acc, n) => {
    const vipChapters = (Array.isArray(n?.chapters) ? n.chapters : []).filter((c) => c?.isVip);
    const avgEarnedPerNovel = Math.round((vipChapters?.length || 0) * 4.5 * (n.royaltyRate ? n.royaltyRate / 100 : 0.95));
    return acc + (avgEarnedPerNovel || 0);
  }, 0);

  // Filtered novels based on sub-tab and search
  const filteredNovels = (displayNovels || []).filter((n) => {
    if (statusFilter === 'ongoing' && n.status !== 'Đang ra') return false;
    if (statusFilter === 'completed' && n.status !== 'Hoàn thành') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        (n.title || '').toLowerCase().includes(q) ||
        (Array.isArray(n?.categories) ? n.categories : []).some((c) => c.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const canManage = currentUser.role === 'admin' || 
    currentUser.displayName.toLowerCase() === selectedCreator.toLowerCase() ||
    currentUser.email.includes('admin');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 text-[#231c26] dark:text-slate-100 animate-in fade-in duration-200">
      <div className="w-full max-w-6xl max-h-[92vh] bg-[#faf6f0] dark:bg-[#12101e] border border-[#ebdcd5] dark:border-pink-500/25 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative transition-colors">
        
        {/* Header Bar */}
        <div className="px-6 py-4.5 bg-white dark:bg-[#181528] border-b border-[#ebdcd5] dark:border-pink-500/20 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#231c26] dark:text-white">
                  Không Gian Sáng Tác &amp; Quản Lý Truyện
                </h2>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-sky-300 border border-blue-200 dark:border-blue-700/50">
                  Tác Giả &amp; Editor
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bảng thống kê hiệu suất tác phẩm, doanh thu coin VIP và danh mục truyện của tác giả &amp; editor
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          
          {/* Creator Profile Card & Quick Switcher */}
          <div className="bg-white dark:bg-[#19162a] border border-[#ebdcd5] dark:border-pink-500/20 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <img
                  src={`https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80`}
                  alt={selectedCreator}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-pink-400 dark:border-sky-400 shadow-md"
                />
                <span className="absolute -bottom-1 -right-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white p-1 rounded-full text-[10px] shadow">
                  ✍️
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[#231c26] dark:text-white">
                    {selectedCreator}
                  </h3>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 border border-pink-200 dark:border-pink-700/40">
                    {creatorList.find((c) => c.name.toLowerCase() === selectedCreator.toLowerCase())?.type === 'editor' 
                      ? 'Editor / Dịch Giả' 
                      : 'Tác Giả Sáng Tác'}
                  </span>
                  {canManage && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/40 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> Quyền Quản Trị
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                  Nhà sáng tác / Editor nhiều tác phẩm trên nền tảng Đạo Tâm. Hưởng tỷ lệ nhuận bút bản quyền cao nhất (lên đến 98% doanh thu VIP).
                </p>
              </div>
            </div>

            {/* Creator selector dropdown & Post Novel Button */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Chọn tác giả/editor:</span>
                <select
                  value={selectedCreator}
                  onChange={(e) => setSelectedCreator(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-[#12101e] border border-[#ebdcd5] dark:border-slate-700 text-[#231c26] dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                >
                  {(creatorList || []).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type === 'editor' ? 'Editor' : 'Tác giả'}) - {c.count} truyện
                    </option>
                  ))}
                </select>
              </div>

              {canManage && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSubmitNovel();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-md shadow-pink-500/20 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102"
                >
                  <Plus className="w-4 h-4" />
                  Đăng Tác Phẩm Mới
                </button>
              )}
            </div>
          </div>

          {/* =========================================================================
              THE 4 EXACT STATISTIC CARDS MATCHING SCREENSHOT 2 (image_988dc721.png)
              1. Cyan left accent: "Tổng số truyện"
              2. Amber left accent: "Tổng số truyện đã hoàn thành"
              3. Rose left accent: "Tổng lượt xem trong tháng"
              4. Emerald left accent: "Tổng coin được nhận"
             ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            
            {/* CARD 1: Tổng số truyện (Cyan / Sky Blue left border) */}
            <div className="bg-white dark:bg-[#181528] rounded-2xl p-5 shadow-sm dark:shadow-md border border-[#ebdcd5] dark:border-slate-800/80 border-l-4 border-l-[#00b4d8] dark:border-l-cyan-400 flex items-center justify-between transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Tổng số truyện
                </p>
                <p className="text-3xl sm:text-4xl font-bold text-[#00b4d8] dark:text-cyan-400 mt-2 leading-none">
                  {totalBooks}
                </p>
              </div>
              <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-[#00b4d8] to-[#0077b6] flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 flex-shrink-0">
                <Book className="w-6 h-6 stroke-[2.2]" />
              </div>
            </div>

            {/* CARD 2: Tổng số truyện đã hoàn thành (Amber / Orange left border) */}
            <div className="bg-white dark:bg-[#181528] rounded-2xl p-5 shadow-sm dark:shadow-md border border-[#ebdcd5] dark:border-slate-800/80 border-l-4 border-l-[#f59e0b] dark:border-l-amber-400 flex items-center justify-between transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Tổng số truyện đã hoàn thành
                </p>
                <p className="text-3xl sm:text-4xl font-bold text-[#f59e0b] dark:text-amber-400 mt-2 leading-none">
                  {completedBooks}
                </p>
              </div>
              <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-[#f59e0b] to-[#ea580c] flex items-center justify-center text-white shadow-lg shadow-amber-500/30 flex-shrink-0">
                <Book className="w-6 h-6 stroke-[2.2]" />
              </div>
            </div>

            {/* CARD 3: Tổng lượt xem trong tháng (Rose / Red left border) */}
            <div className="bg-white dark:bg-[#181528] rounded-2xl p-5 shadow-sm dark:shadow-md border border-[#ebdcd5] dark:border-slate-800/80 border-l-4 border-l-[#ef4444] dark:border-l-rose-500 flex items-center justify-between transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Tổng lượt xem trong tháng
                </p>
                <p className="text-3xl sm:text-4xl font-bold text-[#ef4444] dark:text-rose-400 mt-2 leading-none">
                  {totalMonthlyViews.toLocaleString()}
                </p>
              </div>
              <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-[#ef4444] to-[#f43f5e] flex items-center justify-center text-white shadow-lg shadow-rose-500/30 flex-shrink-0">
                <Eye className="w-6 h-6 stroke-[2.2]" />
              </div>
            </div>

            {/* CARD 4: Tổng coin được nhận (Emerald / Green left border) */}
            <div className="bg-white dark:bg-[#181528] rounded-2xl p-5 shadow-sm dark:shadow-md border border-[#ebdcd5] dark:border-slate-800/80 border-l-4 border-l-[#10b981] dark:border-l-emerald-400 flex items-center justify-between transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Tổng coin được nhận
                </p>
                <p className="text-3xl sm:text-4xl font-bold text-[#10b981] dark:text-emerald-400 mt-2 leading-none">
                  {totalCoinsEarned.toLocaleString()}
                </p>
              </div>
              <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-[#10b981] to-[#059669] flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 flex-shrink-0">
                <Coins className="w-6 h-6 stroke-[2.2]" />
              </div>
            </div>

          </div>

          {/* Author Withdrawal Payout Banner (Rút Xu Nhuận Bút Tác Giả / Editor) */}
          <div className="bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-sky-500/15 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/30">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-[#231c26] dark:text-white">
                    Rút Xu Nhuận Bút Tác Giả &amp; Editor
                  </h4>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Quy chuẩn: Đủ trên 1000 Xu
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Đầu tháng nhận xu từ các chương VIP. Khi đạt <strong>từ 1000 Xu trở lên</strong>, bạn được quyền gửi yêu cầu rút tiền về STK ngân hàng (tỷ lệ 1 Xu = 1 đồng).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="text-right hidden sm:block">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Số dư khả dụng:</div>
                <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatXu(currentUser.authorEarnedXu || totalCoinsEarned || 0)} Xu
                </div>
              </div>

              {onOpenWithdraw && (
                <button
                  onClick={onOpenWithdraw}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/25 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102 flex-shrink-0"
                >
                  <Coins className="w-4 h-4" />
                  <span>Yêu Cầu Rút Xu</span>
                </button>
              )}
            </div>
          </div>

          {/* Catalog Filter & Search Section */}
          <div className="bg-white dark:bg-[#181528] border border-[#ebdcd5] dark:border-pink-500/20 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#110f1d] rounded-xl border border-slate-200 dark:border-slate-800 w-full sm:w-auto">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Tất cả truyện ({totalBooks})
                </button>
                <button
                  onClick={() => setStatusFilter('ongoing')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'ongoing'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Đang ra ({totalBooks - completedBooks})
                </button>
                <button
                  onClick={() => setStatusFilter('completed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'completed'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Đã hoàn thành ({completedBooks})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm tác phẩm trong bộ sưu tập..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-[#12101e] border border-slate-200 dark:border-slate-700 text-[#231c26] dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* List of Novels by Author/Editor */}
            {(filteredNovels?.length || 0) === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold">Chưa tìm thấy truyện nào khớp với bộ lọc.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {(filteredNovels || []).map((novel) => {
                  const vipCount = (Array.isArray(novel?.chapters) ? novel.chapters : []).filter((c) => c?.isVip)?.length || 0;
                  const estimatedCoin = Math.round(vipCount * 4.5 * (novel.royaltyRate ? novel.royaltyRate / 100 : 0.95));

                  return (
                    <div
                      key={novel.id}
                      className="bg-slate-50 dark:bg-[#12101e] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex gap-4 hover:border-pink-300 dark:hover:border-sky-500/50 transition-all group"
                    >
                      {/* Cover Thumbnail */}
                      <div 
                        onClick={() => {
                          onClose();
                          onSelectNovel(novel);
                        }}
                        className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 shadow-md relative cursor-pointer group-hover:scale-102 transition-transform bg-slate-800"
                      >
                        <img
                          src={novel.coverImage || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=200&q=80'}
                          alt={novel.title}
                          className="w-full h-full object-cover"
                        />
                        <span className={`absolute top-1 left-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded text-white shadow ${
                          novel.status === 'Hoàn thành' ? 'bg-amber-600' : 'bg-emerald-600'
                        }`}>
                          {novel.status}
                        </span>
                      </div>

                      {/* Content & Actions */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                            <span className="font-semibold text-sky-600 dark:text-sky-300">
                              {novel?.categories?.[0] || 'Truyện Chữ'}
                            </span>
                            <span>•</span>
                            <span>{novel.totalChapters} chương</span>
                            <span>•</span>
                            <span>{(novel.views / 1000).toFixed(1)}k view</span>
                          </div>

                          <h4 
                            onClick={() => {
                              onClose();
                              onSelectNovel(novel);
                            }}
                            className="font-serif font-bold text-sm sm:text-base text-[#231c26] dark:text-white line-clamp-1 group-hover:text-pink-600 dark:group-hover:text-sky-300 transition-colors cursor-pointer"
                          >
                            {novel.title}
                          </h4>

                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                            {novel.description}
                          </p>
                        </div>

                        {/* Revenue & Quick Action buttons */}
                        <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            <Coins className="w-3.5 h-3.5" />
                            <span>+{estimatedCoin} Coin VIP</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                onClose();
                                onSelectNovel(novel);
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white dark:bg-blue-900/40 dark:text-sky-300 dark:hover:bg-blue-600 dark:hover:text-white border border-blue-200 dark:border-blue-700/50 transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <BookOpen className="w-3 h-3" />
                              Đọc
                            </button>

                            {canManage && (
                              <button
                                onClick={() => {
                                  onClose();
                                  onOpenEditNovel(novel);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-600 dark:hover:text-white border border-amber-200 dark:border-amber-700/50 transition-colors cursor-pointer flex items-center gap-1"
                                title="Sửa thông tin, sửa từng chương, xóa từng chương hoặc chọn nhiều chương để xóa"
                              >
                                <Edit3 className="w-3 h-3" />
                                Quản lý
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer Bar */}
        <div className="px-6 py-3.5 bg-white dark:bg-[#181528] border-t border-[#ebdcd5] dark:border-pink-500/20 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Nhuận bút tác giả nhận tới 98%, editor nhận 90%, thanh toán minh bạch qua Xu &amp; Ngân hàng MB.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#231c26] dark:text-white transition-colors cursor-pointer"
          >
            Đóng bảng thống kê
          </button>
        </div>

      </div>
    </div>
  );
};
