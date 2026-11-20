import type { Request, Response } from 'express';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      userId,
      userEmail,
      userName,
      novelId,
      chapterId,
      chapterNumber,
      type,
      novelTitle,
      authorName,
      isExclusive,
    } = req.body || {};

    if (!userId || !novelId) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin người dùng hoặc tác phẩm' });
    }

    const CHAPTER_PRICE = 5;
    const FULL_BOOK_PROMO = 85;

    let priceToPay = type === 'chapter' ? CHAPTER_PRICE : FULL_BOOK_PROMO;
    // Tác giả nhận 95 %, editor độc quyền nhận 90%, không độc quyền thì nhận 70%
    const isEditorWork = req.body?.isEditor !== undefined 
      ? Boolean(req.body.isEditor) 
      : Boolean(req.body?.editorName && !req.body?.isOriginal);
    let royaltyRate = 95; // Tác giả sáng tác nhận 95%
    if (isEditorWork) {
      royaltyRate = isExclusive ? 90 : 70; // Editor độc quyền 90%, không độc quyền 70%
    }
    const earnedXu = parseFloat(((priceToPay * royaltyRate) / 100).toFixed(2));

    const purchaseRecord = {
      id: `p-${Date.now()}`,
      novelId,
      novelTitle: novelTitle || 'Tác phẩm Đạo Tâm',
      type,
      chapterId: type === 'chapter' ? chapterId : undefined,
      chapterNumber: type === 'chapter' ? chapterNumber : undefined,
      pricePaid: priceToPay,
      purchasedAt: Date.now(),
    };

    const userBalance = typeof req.body?.clientBalance === 'number' ? req.body.clientBalance : 0;
    const nextBalance = Math.max(0, parseFloat((userBalance - priceToPay).toFixed(2)));

    return res.status(200).json({
      success: true,
      message: type === 'full_book' ? 'Mở khóa trọn bộ tác phẩm thành công!' : `Mở khóa chương ${chapterNumber || ''} thành công!`,
      newXuBalance: nextBalance,
      unlockedChapters: { [novelId]: [chapterId || 'c-all'] },
      unlockedFullBooks: type === 'full_book' ? [novelId] : [],
      purchaseRecord,
      authorRoyaltyEarned: {
        authorId: `author-${authorName || 'creator'}`,
        earnedXu,
        royaltyRate,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
}
