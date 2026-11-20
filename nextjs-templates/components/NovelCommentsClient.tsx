'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { MessageSquare, Send, Clock, User as UserIcon, CornerDownRight, X } from 'lucide-react';

export interface CommentItem {
  id: string;
  novelId: string;
  novelTitle?: string;
  chapterId?: string;
  chapterNumber?: number;
  parentId?: string | null;
  userId?: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: number;
  likes: number;
}

interface NovelCommentsClientProps {
  novelId: string;
  novelTitle?: string;
  chapterId?: string;
  chapterNumber?: number;
}

/**
 * ==============================================================================
 * BÌNH LUẬN ĐỘNG CLIENT-SIDE (DÙNG TRÊN CÁC TRANG ISR)
 * ==============================================================================
 * Nội dung truyện & chương được Vercel cache ISR 1 tiếng (revalidate: 3600).
 * Riêng phần bình luận luôn được fetch trực tiếp từ Client-side để độc giả
 * nhìn thấy bình luận mới nhất theo thời gian thực mà không làm hỏng cache HTML.
 * Hỗ trợ đầy đủ trả lời bình luận (parentId) & neo #comments responsive Mobile/PC.
 * ==============================================================================
 */
export function NovelCommentsClient({
  novelId,
  novelTitle,
  chapterId,
  chapterNumber,
}: NovelCommentsClientProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [newComment, setNewComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<string>('');
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
    });
    return () => unsub();
  }, []);

  // Tự động cuộn xuống #comments khi mở link từ Admin (#comments)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#comments') {
      const timer = setTimeout(() => {
        const el = document.getElementById('comments');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!novelId) return;
    let isMounted = true;
    setIsLoading(true);

    async function loadComments() {
      const mapDocToComment = (d: { id: string; data: () => Record<string, any> }): CommentItem => {
        const data = d.data();
        return {
          id: d.id,
          novelId: String(data.novelId || novelId),
          novelTitle: data.novelTitle ? String(data.novelTitle) : undefined,
          chapterId: data.chapterId ? String(data.chapterId) : undefined,
          chapterNumber:
            typeof data.chapterNumber === 'number' ? data.chapterNumber : undefined,
          parentId: data.parentId ? String(data.parentId) : null,
          userId: data.userId,
          userName: String(data.userName || 'Độc giả Đạo Tâm'),
          userAvatar: data.userAvatar,
          content: String(data.content || ''),
          createdAt: Number(data.createdAt || Date.now()),
          likes: Number(data.likes || 0),
        };
      };

      try {
        const q = query(
          collection(db, 'comments'),
          where('novelId', '==', novelId),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        if (!isMounted) return;
        setComments((snap?.docs || []).map(mapDocToComment));
      } catch {
        // Fallback nếu chưa tạo composite index novelId + createdAt
        try {
          const fallbackQ = query(
            collection(db, 'comments'),
            where('novelId', '==', novelId),
            limit(50)
          );
          const snap = await getDocs(fallbackQ);
          if (!isMounted) return;
          const list = (snap?.docs || [])
            .map(mapDocToComment)
            .sort((a, b) => b.createdAt - a.createdAt);
          setComments(list);
        } catch (err) {
          console.warn('Không thể tải bình luận client-side:', err);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadComments();
    return () => {
      isMounted = false;
    };
  }, [novelId]);

  const { topLevelComments, repliesByRootId } = useMemo(() => {
    const safeComments = Array.isArray(comments) ? comments : [];
    const byId = new Map<string, CommentItem>();
    safeComments.forEach((c) => byId.set(c.id, c));

    const resolveRootId = (item: CommentItem): string | null => {
      let curr: CommentItem | undefined = item;
      const visited = new Set<string>();
      while (curr?.parentId) {
        if (visited.has(curr.id)) break;
        visited.add(curr.id);
        const parent = byId.get(curr.parentId);
        if (!parent) return curr.parentId;
        if (!parent.parentId) return parent.id;
        curr = parent;
      }
      return null;
    };

    const roots: CommentItem[] = [];
    const replyMap = new Map<string, CommentItem[]>();

    for (const c of safeComments) {
      if (!c.parentId) {
        roots.push(c);
      } else {
        const rootId = resolveRootId(c) || c.parentId;
        const bucket = replyMap.get(rootId) || [];
        bucket.push(c);
        replyMap.set(rootId, bucket);
      }
    }

    // Sắp xếp câu trả lời cũ trước -> mới sau để đọc hội thoại tự nhiên
    replyMap.forEach((arr, key) => {
      replyMap.set(
        key,
        [...arr].sort((a, b) => a.createdAt - b.createdAt)
      );
    });

    return { topLevelComments: roots, repliesByRootId: replyMap };
  }, [comments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    const resolvedChapterId =
      chapterId || (typeof chapterNumber === 'number' ? `chuong-${chapterNumber}` : undefined);

    try {
      const payload = {
        novelId,
        novelTitle: novelTitle || '',
        chapterId: resolvedChapterId ?? null,
        chapterNumber: chapterNumber ?? null,
        parentId: null,
        userId: currentUser?.uid || 'guest',
        userName: currentUser?.displayName || 'Độc giả Đạo Tâm',
        userAvatar: currentUser?.photoURL || '',
        content: trimmed,
        createdAt: Date.now(),
        likes: 0,
      };
      const docRef = await addDoc(collection(db, 'comments'), payload);
      setComments((prev) => [
        {
          id: docRef.id,
          novelId,
          novelTitle: payload.novelTitle,
          chapterId: resolvedChapterId,
          chapterNumber,
          parentId: null,
          userId: payload.userId,
          userName: payload.userName,
          userAvatar: payload.userAvatar,
          content: payload.content,
          createdAt: payload.createdAt,
          likes: 0,
        },
        ...prev,
      ]);
      setNewComment('');
      setFeedback('Đã gửi bình luận!');
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback('Vui lòng đăng nhập để bình luận.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent, parentComment: CommentItem) => {
    e.preventDefault();
    const trimmed = replyContent.trim();
    if (!trimmed || isSubmittingReply) return;

    setIsSubmittingReply(true);
    setFeedback(null);

    const resolvedChapterId =
      chapterId || (typeof chapterNumber === 'number' ? `chuong-${chapterNumber}` : undefined);

    try {
      const payload = {
        novelId,
        novelTitle: novelTitle || '',
        chapterId: resolvedChapterId ?? null,
        chapterNumber: chapterNumber ?? null,
        parentId: parentComment.id,
        userId: currentUser?.uid || 'guest',
        userName: currentUser?.displayName || 'Độc giả Đạo Tâm',
        userAvatar: currentUser?.photoURL || '',
        content: trimmed,
        createdAt: Date.now(),
        likes: 0,
      };
      const docRef = await addDoc(collection(db, 'comments'), payload);
      setComments((prev) => [
        ...prev,
        {
          id: docRef.id,
          novelId,
          novelTitle: payload.novelTitle,
          chapterId: resolvedChapterId,
          chapterNumber,
          parentId: parentComment.id,
          userId: payload.userId,
          userName: payload.userName,
          userAvatar: payload.userAvatar,
          content: payload.content,
          createdAt: payload.createdAt,
          likes: 0,
        },
      ]);
      setReplyContent('');
      setReplyingTo(null);
      setFeedback('Đã gửi trả lời!');
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback('Vui lòng đăng nhập để trả lời bình luận.');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const renderReplyBox = (comment: CommentItem) => {
    if (replyingTo !== comment.id) return null;

    return (
      <form
        onSubmit={(e) => handleSubmitReply(e, comment)}
        className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-700/70 space-y-2.5"
      >
        <textarea
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder={`Trả lời bình luận của ${comment.userName}...`}
          autoFocus
          className="w-full p-3 sm:p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-y"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setReplyingTo(null);
              setReplyContent('');
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition cursor-pointer inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Hủy</span>
          </button>
          <button
            type="submit"
            disabled={isSubmittingReply || !replyContent.trim()}
            className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmittingReply ? 'Đang gửi...' : 'Gửi'}</span>
          </button>
        </div>
      </form>
    );
  };

  return (
    <section
      id="comments"
      className="scroll-mt-20 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 mt-8"
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-pink-600" />
          <span>Bình luận độc giả ({comments?.length || 0})</span>
        </h2>
        <span className="text-[11px] text-slate-400">Cập nhật trực tiếp</span>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Chia sẻ cảm nhận của bạn về bộ truyện hoặc chương này..."
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-pink-600 dark:text-pink-400 font-medium">
            {feedback || ''}
          </span>
          <button
            type="submit"
            disabled={isSubmitting || !newComment.trim()}
            className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Đang gửi...' : 'Gửi bình luận'}</span>
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Đang tải bình luận mới nhất...
        </div>
      ) : (topLevelComments?.length || 0) === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Chưa có bình luận nào. Hãy là người đầu tiên để lại cảm nhận!
        </div>
      ) : (
        <div className="space-y-3.5">
          {(topLevelComments || []).map((comment) => {
            const childReplies = repliesByRootId.get(comment.id) || [];

            return (
              <div
                key={comment.id}
                className="p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 flex items-center justify-center overflow-hidden shrink-0">
                      {comment.userAvatar ? (
                        <img
                          src={comment.userAvatar}
                          alt={comment.userName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UserIcon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {comment.userName}
                    </span>
                    {typeof comment.chapterNumber === 'number' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950/70 text-pink-600 dark:text-pink-300 font-semibold shrink-0">
                        Chương {comment.chapterNumber}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(comment.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line break-words">
                  {comment.content}
                </p>

                <div className="mt-2.5 flex items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(comment.id);
                      setReplyContent('');
                    }}
                    className="inline-flex items-center gap-1.5 py-1 px-2 -ml-2 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-950/40 hover:text-pink-600 dark:hover:text-pink-400 transition-colors cursor-pointer"
                  >
                    <CornerDownRight className="w-3.5 h-3.5" />
                    <span>Trả lời</span>
                  </button>
                </div>

                {renderReplyBox(comment)}

                {(childReplies?.length || 0) > 0 && (
                  <div className="mt-3 pl-3 sm:pl-4 border-l-2 border-pink-200 dark:border-pink-900/70 space-y-2.5">
                    {(childReplies || []).map((reply) => (
                      <div
                        key={reply.id}
                        className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 flex items-center justify-center overflow-hidden shrink-0">
                              {reply.userAvatar ? (
                                <img
                                  src={reply.userAvatar}
                                  alt={reply.userName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <UserIcon className="w-3 h-3" />
                              )}
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {reply.userName}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(reply.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line break-words">
                          {reply.content}
                        </p>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo(reply.id);
                              setReplyContent(`@${reply.userName} `);
                            }}
                            className="inline-flex items-center gap-1 py-1 px-2 -ml-2 rounded-lg text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-pink-50 dark:hover:bg-pink-950/40 hover:text-pink-600 dark:hover:text-pink-400 transition-colors cursor-pointer"
                          >
                            <CornerDownRight className="w-3 h-3" />
                            <span>Trả lời</span>
                          </button>
                        </div>
                        {renderReplyBox(reply)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

