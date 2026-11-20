'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  doc, 
  getDoc,
  deleteDoc,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { 
  MessageSquare, 
  Search, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  AlertCircle, 
  Heart, 
  BookOpen, 
  X,
} from 'lucide-react';

const ADMIN_EMAILS: string[] = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

export interface AdminCommentItem {
  id: string;
  novelId: string;
  novelTitle?: string;
  novelSlug?: string;
  chapterId?: string;
  chapterNumber?: number;
  parentId?: string | null;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: number;
  likes?: number;
}

export default function CommentManager() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [comments, setComments] = useState<AdminCommentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Cache tra cứu tên truyện theo novelId để tránh query lặp lại
  const novelTitleCache = useRef<Map<string, { title: string; slug?: string }>>(new Map());

  // Kiểm tra phiên đăng nhập
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const isAuthorizedAdmin = Boolean(
    currentUser &&
    currentUser.email &&
    ADMIN_EMAILS.some((adm) => adm.toLowerCase().trim() === currentUser.email?.toLowerCase().trim())
  );

  // Debounce search query 180ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Bổ sung Tên Truyện (Enrichment): Tra cứu tên truyện nếu comment chưa có
  const enrichCommentsWithNovelTitle = useCallback(async (rawComments: AdminCommentItem[]): Promise<AdminCommentItem[]> => {
    const missingNovelIds = Array.from(
      new Set(
        (rawComments || [])
          .filter((c) => !c.novelTitle && c.novelId)
          .map((c) => c.novelId)
      )
    );

    // Truy vấn song song cho các truyện chưa có trong cache
    await Promise.all(
      (missingNovelIds || []).map(async (nId) => {
        if (novelTitleCache.current.has(nId)) return;
        try {
          const docSnap = await getDoc(doc(db, 'novels', nId));
          if (docSnap.exists()) {
            const data = docSnap.data() || {};
            novelTitleCache.current.set(nId, {
              title: data.title || nId,
              slug: data.slug,
            });
          } else {
            // Thử tra cứu từ collection stories
            const sSnap = await getDoc(doc(db, 'stories', nId));
            if (sSnap.exists()) {
              const sData = sSnap.data() || {};
              novelTitleCache.current.set(nId, {
                title: sData.title || nId,
                slug: sData.slug,
              });
            } else {
              novelTitleCache.current.set(nId, { title: nId });
            }
          }
        } catch {
          novelTitleCache.current.set(nId, { title: nId });
        }
      })
    );

    return (rawComments || []).map((c) => {
      if (c.novelTitle) return c;
      const cached = novelTitleCache.current.get(c.novelId);
      return {
        ...c,
        novelTitle: cached?.title || c.novelId,
        novelSlug: cached?.slug || c.novelSlug,
      };
    });
  }, []);

  // Tải danh sách bình luận (Limit 20 theo chuẩn Quota)
  const loadComments = useCallback(async () => {
    setIsLoading(true);
    try {
      const colRef = collection(db, 'comments');
      const q = query(colRef, orderBy('createdAt', 'desc'), limit(20));
      const snap = await getDocs(q);
      const docs = snap?.docs || [];

      const rawItems: AdminCommentItem[] = (docs || []).map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          novelId: data.novelId || '',
          novelTitle: data.novelTitle || '',
          novelSlug: data.novelSlug || '',
          chapterId: data.chapterId || `chuong-${data.chapterNumber || 1}`,
          chapterNumber: typeof data.chapterNumber === 'number' ? data.chapterNumber : undefined,
          parentId: data.parentId || null,
          userId: data.userId || '',
          userName: data.userName || 'Độc giả Đạo Tâm',
          userAvatar: data.userAvatar,
          content: data.content || '',
          createdAt: Number(data.createdAt || Date.now()),
          likes: Number(data.likes || 0),
        };
      });

      const enriched = await enrichCommentsWithNovelTitle(rawItems);
      setComments(enriched);
      setLastVisibleDoc((docs?.length || 0) > 0 ? docs[(docs?.length || 0) - 1] : null);
      setHasMore((docs?.length || 0) === 20);
    } catch (err: any) {
      console.warn('Lỗi tải danh sách bình luận:', err);
      setToastMsg({ text: `Không thể tải bình luận: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [enrichCommentsWithNovelTitle]);

  // Tải thêm trang kế tiếp
  const loadMoreComments = async () => {
    if (!lastVisibleDoc || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const colRef = collection(db, 'comments');
      const q = query(colRef, orderBy('createdAt', 'desc'), startAfter(lastVisibleDoc), limit(20));
      const snap = await getDocs(q);
      const docs = snap?.docs || [];

      const rawItems: AdminCommentItem[] = (docs || []).map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          novelId: data.novelId || '',
          novelTitle: data.novelTitle || '',
          novelSlug: data.novelSlug || '',
          chapterId: data.chapterId || `chuong-${data.chapterNumber || 1}`,
          chapterNumber: typeof data.chapterNumber === 'number' ? data.chapterNumber : undefined,
          parentId: data.parentId || null,
          userId: data.userId || '',
          userName: data.userName || 'Độc giả Đạo Tâm',
          userAvatar: data.userAvatar,
          content: data.content || '',
          createdAt: Number(data.createdAt || Date.now()),
          likes: Number(data.likes || 0),
        };
      });

      const enriched = await enrichCommentsWithNovelTitle(rawItems);
      setComments((prev) => [...(prev || []), ...(enriched || [])]);
      setLastVisibleDoc((docs?.length || 0) > 0 ? docs[(docs?.length || 0) - 1] : null);
      setHasMore((docs?.length || 0) === 20);
    } catch (err: any) {
      console.warn('Lỗi tải thêm bình luận:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (isAuthorizedAdmin) {
      loadComments();
    }
  }, [isAuthorizedAdmin, loadComments]);

  // Xóa bình luận
  const handleDeleteComment = async (commentId: string, commenterName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn bình luận của "${commenterName}" không?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'comments', commentId));
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setToastMsg({ text: 'Đã xóa bình luận thành công!', type: 'success' });
      setTimeout(() => setToastMsg(null), 3000);
    } catch (err: any) {
      console.error('Lỗi khi xóa bình luận:', err);
      setToastMsg({ text: `Không thể xóa bình luận: ${err.message}`, type: 'error' });
    }
  };

  // Lọc theo search
  const filteredComments = useMemo(() => {
    if (!debouncedQuery) return comments;
    return comments.filter((c) => {
      const matchContent = c.content.toLowerCase().includes(debouncedQuery);
      const matchUser = c.userName.toLowerCase().includes(debouncedQuery);
      const matchNovel = (c.novelTitle || '').toLowerCase().includes(debouncedQuery);
      return matchContent || matchUser || matchNovel;
    });
  }, [comments, debouncedQuery]);

  if (isAuthLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-3">
        <div className="w-8 h-8 border-3 border-pink-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Đang xác thực quyền Quản Trị Viên...</p>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Quyền Truy Cập Bị Giới Hạn</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Khu vực quản lý bình luận chỉ dành riêng cho 2 Quản trị viên chính thức:
          <br />
          <strong className="text-pink-600">hoaamcac@gmail.com</strong> hoặc <strong className="text-pink-600">meoyeutien22@gmail.com</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Toast thông báo */}
      {toastMsg && (
        <div className={`p-3.5 rounded-xl text-xs font-bold border flex items-center justify-between ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200'
        }`}>
          <span>{toastMsg.text}</span>
          <button onClick={() => setToastMsg(null)} className="cursor-pointer ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Quản Lý Bình Luận */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-pink-950/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-pink-600" />
            <span>Quản Lý Bình Luận Độc Giả (Kiểm Duyệt Thật)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Hiển thị rõ ràng ngữ cảnh: <strong className="text-pink-600">[Tên Truyện] - Chương</strong> kèm Deep-link dẫn thẳng vào chương đọc.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 py-1.5 rounded-xl bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-900 text-xs font-bold">
            {comments?.length || 0} bình luận đã nạp
          </span>
          <button
            type="button"
            onClick={loadComments}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
            title="Làm mới danh sách"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* Ô tìm kiếm bình luận (Debounced 180ms) */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-pink-950/60 shadow-xs flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm theo nội dung bình luận, tên độc giả hoặc tên truyện..."
          className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Danh Sách Bình Luận */}
      {isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-pink-950/60 space-y-2">
          <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Đang nạp và đối soát tên truyện...</p>
        </div>
      ) : (filteredComments?.length || 0) === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-pink-950/60 space-y-2">
          <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy bình luận nào</h4>
          <p className="text-xs text-slate-400">
            {debouncedQuery ? 'Không có bình luận nào khớp với từ khóa tìm kiếm.' : 'Chưa có bình luận nào được đăng.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(filteredComments || []).map((comment) => {
            const resolvedNovelId = encodeURIComponent(comment.novelId || comment.novelSlug || '');
            const resolvedChapterId = encodeURIComponent(
              comment.chapterId || `chuong-${comment.chapterNumber || 1}`
            );
            // Deep-link chuẩn: /truyen/${comment.novelId}/chuong/${comment.chapterId}#comments
            const deepLinkHref = `/truyen/${resolvedNovelId}/chuong/${resolvedChapterId}#comments`;

            return (
              <div
                key={comment.id}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-pink-950/60 shadow-xs flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition hover:border-pink-300 dark:hover:border-pink-800"
              >
                <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                  {/* Avatar người bình luận */}
                  {comment.userAvatar ? (
                    <img
                      src={comment.userAvatar}
                      alt={comment.userName}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                      {comment.userName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}

                  {/* Thông tin bình luận */}
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{comment.userName}</span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(comment.createdAt).toLocaleString('vi-VN')}
                      </span>

                      {/* Hiển thị tên truyện */}
                      <span className="font-bold text-xs text-pink-700 dark:text-pink-300 truncate max-w-full">
                        [{comment.novelTitle || 'Đang xác định'}]
                      </span>

                      {/* Deep-link thẳng tới chương và cuộn xuống #comments */}
                      {resolvedNovelId && (
                        <Link
                          href={deepLinkHref}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-100 hover:bg-pink-200 dark:bg-pink-950 dark:hover:bg-pink-900 text-pink-700 dark:text-pink-300 text-[11px] font-bold border border-pink-200 dark:border-pink-800 transition cursor-pointer"
                          title="Mở chương này và cuộn tới khu vực bình luận"
                        >
                          <BookOpen className="w-3 h-3 text-pink-600 shrink-0" />
                          <span>
                            Chương {comment.chapterNumber || comment.chapterId?.replace('chuong-', '') || 1}
                          </span>
                          <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-70" />
                        </Link>
                      )}
                    </div>

                    {/* Nội dung bình luận */}
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line break-words bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      {comment.content}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3 text-pink-500 fill-pink-500/20" />
                        {comment.likes || 0} lượt thích
                      </span>
                      <span>•</span>
                      <span className="font-mono text-[10px]">ID: {comment.id}</span>
                    </div>
                  </div>
                </div>

                {/* Nút Xóa bình luận */}
                <div className="flex items-center sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment.id, comment.userName)}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1.5 border border-rose-200 dark:border-rose-900 cursor-pointer transition active:scale-95"
                    title="Xóa vĩnh viễn bình luận này khỏi hệ thống"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Nút Phân Trang Tải Thêm */}
          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={loadMoreComments}
                disabled={isLoadingMore}
                className="px-6 py-2.5 rounded-xl bg-pink-50 dark:bg-pink-950/60 hover:bg-pink-100 dark:hover:bg-pink-900/60 text-pink-700 dark:text-pink-300 text-xs font-bold border border-pink-200 dark:border-pink-900 transition cursor-pointer disabled:opacity-50"
              >
                {isLoadingMore ? 'Đang nạp thêm...' : 'Tải thêm 20 bình luận tiếp theo'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
