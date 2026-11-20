import React, { useState, useEffect, useMemo } from 'react';
import { Comment, UserProfile } from '../types';
import { 
  MessageSquare, 
  Heart, 
  Send, 
  CornerDownRight, 
  Trash2, 
  ShieldCheck, 
  AlertCircle,
  Sparkles,
  X
} from 'lucide-react';
import { 
  fetchNovelCommentsFromFirestore, 
  addNovelCommentToFirestore, 
  deleteNovelCommentFromFirestore 
} from '../firebase/services';
import { safeSetItem } from '../utils/safeStorage';

interface CommentsSectionProps {
  novelId: string;
  chapterId?: string;
  chapterNumber?: number;
  user: UserProfile;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  novelId,
  chapterId,
  chapterNumber,
  user,
}) => {
  const [commentList, setCommentList] = useState<Comment[]>(() => {
    // Chỉ lấy từ cache bình luận thật, không dùng bình luận ảo mẫu
    const saved = localStorage.getItem(`dao_tam_real_comments_${novelId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  });

  const [isLoading, setIsLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [displayCount, setDisplayCount] = useState<number>(20);

  const { topLevelComments, repliesByRootId } = useMemo(() => {
    const safeList = Array.isArray(commentList) ? commentList : [];
    const byId = new Map<string, Comment>();
    safeList.forEach((c) => byId.set(c.id, c));

    const resolveRootId = (item: Comment): string | null => {
      let curr: Comment | undefined = item;
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

    const roots: Comment[] = [];
    const replyMap = new Map<string, Comment[]>();

    for (const item of safeList) {
      if (!item.parentId) {
        roots.push(item);
      } else {
        const rootId = resolveRootId(item) || item.parentId;
        const bucket = replyMap.get(rootId) || [];
        bucket.push(item);
        replyMap.set(rootId, bucket);
      }
    }

    replyMap.forEach((arr, key) => {
      replyMap.set(
        key,
        [...arr].sort((a, b) => a.createdAt - b.createdAt)
      );
    });

    return { topLevelComments: roots, repliesByRootId: replyMap };
  }, [commentList]);

  const visibleComments = React.useMemo(() => {
    return (topLevelComments || []).slice(0, displayCount);
  }, [topLevelComments, displayCount]);

  // Cuộn mượt xuống khu vực #comments khi URL có hash #comments
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
  }, [isLoading, novelId, chapterNumber]);

  // Tải bình luận thật từ Firestore
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetchNovelCommentsFromFirestore(novelId)
      .then((comments) => {
        if (isMounted) {
          setCommentList(comments);
          safeSetItem(`dao_tam_real_comments_${novelId}`, JSON.stringify(comments));
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Lỗi tải bình luận từ Firestore:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [novelId]);

  // Gửi bình luận thật mới
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newContent.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    const resolvedChapterId =
      chapterId || (typeof chapterNumber === 'number' ? `chuong-${chapterNumber}` : undefined);

    const commentPayload: Omit<Comment, 'id'> = {
      novelId,
      chapterId: resolvedChapterId,
      chapterNumber,
      parentId: null,
      userId: user.id || 'guest',
      userName: user.displayName || 'Độc giả Đạo Tâm',
      userAvatar: user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      content: trimmed,
      createdAt: Date.now(),
      likes: 0,
    };

    try {
      const created = await addNovelCommentToFirestore(commentPayload);
      const updated = [created, ...(commentList || []).filter((c) => c.id !== created.id)];
      setCommentList(updated);
      safeSetItem(`dao_tam_real_comments_${novelId}`, JSON.stringify(updated));
      setNewContent('');
      setNotification({ text: 'Bình luận của bạn đã được đăng thành công!', type: 'success' });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      console.error('Lỗi đăng bình luận:', err);
      const fallbackComment: Comment = {
        ...commentPayload,
        id: `cm-${Date.now()}`,
      };
      const updated = [fallbackComment, ...(commentList || [])];
      setCommentList(updated);
      safeSetItem(`dao_tam_real_comments_${novelId}`, JSON.stringify(updated));
      setNewContent('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Gửi câu trả lời (reply) với parentId: comment.id
  const handleSubmitReply = async (e: React.FormEvent, parentComment: Comment) => {
    e.preventDefault();
    const trimmed = replyContent.trim();
    if (!trimmed || isSubmittingReply) return;

    setIsSubmittingReply(true);
    const resolvedChapterId =
      chapterId || (typeof chapterNumber === 'number' ? `chuong-${chapterNumber}` : undefined);

    const replyPayload: Omit<Comment, 'id'> = {
      novelId,
      chapterId: resolvedChapterId,
      chapterNumber,
      parentId: parentComment.id,
      userId: user.id || 'guest',
      userName: user.displayName || 'Độc giả Đạo Tâm',
      userAvatar: user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      content: trimmed,
      createdAt: Date.now(),
      likes: 0,
    };

    try {
      const created = await addNovelCommentToFirestore(replyPayload);
      const updated = [...(commentList || []).filter((c) => c.id !== created.id), created];
      setCommentList(updated);
      safeSetItem(`dao_tam_real_comments_${novelId}`, JSON.stringify(updated));
      setReplyContent('');
      setReplyingTo(null);
      setNotification({ text: 'Đã gửi phản hồi bình luận thành công!', type: 'success' });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      console.error('Lỗi gửi trả lời bình luận:', err);
      const fallbackReply: Comment = {
        ...replyPayload,
        id: `cm-reply-${Date.now()}`,
      };
      const updated = [...(commentList || []), fallbackReply];
      setCommentList(updated);
      safeSetItem(`dao_tam_real_comments_${novelId}`, JSON.stringify(updated));
      setReplyContent('');
      setReplyingTo(null);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Quản Trị Viên (Admin) hoặc chính người đăng xóa bình luận
  const handleDeleteComment = async (commentId: string, commenterName: string) => {
    const promptMsg = user.role === 'admin'
      ? `[BQT Đạo Tâm] Bạn có chắc chắn muốn xóa bình luận của "${commenterName}" không? Thao tác này sẽ gỡ bỏ bình luận ngay lập tức.`
      : `Bạn có chắc muốn xóa bình luận của mình không?`;

    if (!window.confirm(promptMsg)) return;

    try {
      await deleteNovelCommentFromFirestore(commentId);
      const updated = (commentList || []).filter((c) => c.id !== commentId && c.parentId !== commentId);
      setCommentList(updated);
      safeSetItem(`dao_tam_real_comments_${novelId}`, JSON.stringify(updated));
      setNotification({ 
        text: user.role === 'admin' ? 'Admin đã xóa bình luận không thích hợp thành công.' : 'Đã xóa bình luận.',
        type: 'info' 
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      console.error('Lỗi khi xóa bình luận:', err);
      setNotification({ text: 'Không thể xóa bình luận vào lúc này, vui lòng thử lại.', type: 'error' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleLike = (commentId: string) => {
    setCommentList((prev) => {
      const updated = (prev || []).map((c) => {
        if (c.id === commentId) {
          const isLiked = c.isLiked;
          return {
            ...c,
            likes: isLiked ? Math.max(0, c.likes - 1) : c.likes + 1,
            isLiked: !isLiked,
          };
        }
        return c;
      });
      safeSetItem(`dao_tam_real_comments_${novelId}`, JSON.stringify(updated));
      return updated;
    });
  };

  const renderReplyForm = (comment: Comment) => {
    if (replyingTo !== comment.id) return null;

    return (
      <form
        onSubmit={(e) => handleSubmitReply(e, comment)}
        className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2.5"
      >
        <textarea
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          rows={3}
          placeholder={`Trả lời ${comment.userName}...`}
          autoFocus
          className="w-full p-3 sm:p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-100 dark:focus:ring-pink-900 focus:outline-none transition-all"
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
            disabled={!replyContent.trim() || isSubmittingReply}
            className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
      className="scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-7 shadow-xs mt-8 transition-colors"
    >
      {/* Title Header */}
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800 flex items-center justify-center text-pink-600 shadow-xs">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                Bình Luận &amp; Cảm Nhận Thật
              </h3>
              <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                100% Bình luận thật
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              {commentList?.length || 0} lượt đàm luận từ độc giả thực tế
            </p>
          </div>
        </div>

        {user.role === 'admin' && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[11px] font-bold text-rose-700 dark:text-rose-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Quyền Admin: Được phép xóa bình luận vi phạm</span>
          </div>
        )}
      </div>

      {notification && (
        <div className={`p-3 rounded-2xl mb-4 text-xs font-semibold flex items-center gap-2 ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : notification.type === 'error'
            ? 'bg-rose-50 text-rose-800 border border-rose-200'
            : 'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{notification.text}</span>
        </div>
      )}

      {/* Post comment input form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-3 sm:gap-3.5">
          <img
            src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
            alt={user.displayName}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-pink-300 dark:border-pink-700 flex-shrink-0 shadow-xs"
          />
          <div className="flex-1 min-w-0">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={`Viết bình luận của bạn${chapterNumber ? ` về Chương ${chapterNumber}` : ''}...`}
              rows={3}
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-pink-500 focus:ring-2 focus:ring-pink-100 dark:focus:ring-pink-900 rounded-2xl p-3 sm:p-3.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 focus:outline-none transition-all shadow-xs"
            />
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-2.5">
              <span className="text-[11px] sm:text-[11.5px] text-slate-500 dark:text-slate-400 font-medium">
                Văn minh, tôn trọng tác giả và tác phẩm. BQT có quyền xóa bình luận không phù hợp.
              </span>
              <button
                type="submit"
                disabled={!newContent.trim() || isSubmitting}
                className="self-end sm:self-auto px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Đang gửi...' : 'Gửi bình luận'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Comment list */}
      {isLoading ? (
        <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
          <div className="animate-spin w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full" />
          <span>Đang tải bình luận thật từ độc giả...</span>
        </div>
      ) : (topLevelComments?.length || 0) === 0 ? (
        <div className="py-10 px-4 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700">
          <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Chưa có bình luận nào cho tác phẩm này
          </h4>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
            Hệ thống chỉ lưu trữ và hiển thị 100% bình luận thật từ độc giả. Hãy là người đầu tiên chia sẻ cảm nhận của bạn!
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {(visibleComments || []).map((comment) => {
            const timeAgo = formatTimeAgo(comment.createdAt);
            const canDelete = user.role === 'admin' || (user.id && user.id !== 'guest' && comment.userId === user.id);
            const childReplies = repliesByRootId.get(comment.id) || [];

            return (
              <div
                key={comment.id}
                className="p-3.5 sm:p-4.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700 flex gap-3 sm:gap-3.5 transition-colors shadow-2xs"
              >
                <img
                  src={comment.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                  alt={comment.userName}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
                  loading="lazy"
                  decoding="async"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        {comment.userName}
                      </span>
                      {comment.chapterNumber && (
                        <span className="bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 text-[10.5px] px-2 py-0.5 rounded-full font-bold shrink-0">
                          Chương {comment.chapterNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium shrink-0">{timeAgo}</span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-2 leading-relaxed font-normal whitespace-pre-line break-words">
                    {comment.content}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400 font-semibold">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => handleLike(comment.id)}
                        className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                          comment.isLiked ? 'text-pink-600 font-bold' : 'hover:text-pink-600 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${comment.isLiked ? 'fill-pink-600 text-pink-600' : 'text-slate-500'}`} />
                        <span>{comment.likes}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(comment.id);
                          setReplyContent('');
                        }}
                        className="flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-950/40 hover:text-pink-600 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
                      >
                        <CornerDownRight className="w-3.5 h-3.5 text-slate-500" />
                        <span>Trả lời</span>
                      </button>
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id, comment.userName)}
                        className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 px-2 py-0.5 rounded-lg border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer"
                        title={user.role === 'admin' ? 'Admin: Xóa bình luận không thích hợp' : 'Xóa bình luận của bạn'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa{user.role === 'admin' ? ' (Admin)' : ''}</span>
                      </button>
                    )}
                  </div>

                  {renderReplyForm(comment)}

                  {(childReplies?.length || 0) > 0 && (
                    <div className="mt-3 pl-3 sm:pl-4 border-l-2 border-pink-200 dark:border-pink-900/70 space-y-2.5">
                      {(childReplies || []).map((reply) => {
                        const canDeleteReply = user.role === 'admin' || (user.id && user.id !== 'guest' && reply.userId === user.id);
                        return (
                          <div
                            key={reply.id}
                            className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80 flex gap-2.5"
                          >
                            <img
                              src={reply.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
                              alt={reply.userName}
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
                              loading="lazy"
                              decoding="async"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                  {reply.userName}
                                </span>
                                <span className="text-[10.5px] text-slate-400 shrink-0">
                                  {formatTimeAgo(reply.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1.5 leading-relaxed whitespace-pre-line break-words">
                                {reply.content}
                              </p>
                              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleLike(reply.id)}
                                    className={`flex items-center gap-1 transition-colors cursor-pointer ${
                                      reply.isLiked ? 'text-pink-600 font-bold' : 'hover:text-pink-600'
                                    }`}
                                  >
                                    <Heart className={`w-3 h-3 ${reply.isLiked ? 'fill-pink-600 text-pink-600' : ''}`} />
                                    <span>{reply.likes}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyingTo(reply.id);
                                      setReplyContent(`@${reply.userName} `);
                                    }}
                                    className="flex items-center gap-1 py-0.5 px-1.5 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-950/40 hover:text-pink-600 transition-colors cursor-pointer"
                                  >
                                    <CornerDownRight className="w-3 h-3" />
                                    <span>Trả lời</span>
                                  </button>
                                </div>
                                {canDeleteReply && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(reply.id, reply.userName)}
                                    className="text-rose-600 hover:text-rose-700 font-bold cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Xóa</span>
                                  </button>
                                )}
                              </div>
                              {renderReplyForm(reply)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {(topLevelComments?.length || 0) > displayCount && (
            <button
              type="button"
              onClick={() => setDisplayCount((prev) => prev + 20)}
              className="w-full mt-2 py-3 rounded-2xl bg-pink-50 dark:bg-pink-950/60 hover:bg-pink-100 dark:hover:bg-pink-900/60 text-pink-600 dark:text-pink-300 text-xs font-bold transition cursor-pointer border border-pink-200 dark:border-pink-900 text-center"
            >
              Tải thêm bình luận (còn {(topLevelComments?.length || 0) - displayCount} bình luận)
            </button>
          )}
        </div>
      )}
    </section>
  );
};

function formatTimeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}
