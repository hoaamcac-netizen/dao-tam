export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { novelId, chapterId, userId } = req.body || {};
  if (!novelId || !chapterId) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin chương' });
  }

  // Serverless access check: free chapters (<= 30 or <= 50) are free by default
  const chapterNumMatch = String(chapterId).match(/c(\d+)/);
  const chapterNum = chapterNumMatch ? parseInt(chapterNumMatch[1], 10) : 1;
  const isFreeChapter = chapterNum <= 30;

  return res.status(200).json({
    success: true,
    isLocked: !isFreeChapter,
    unlocked: isFreeChapter,
    message: isFreeChapter ? 'Chương miễn phí' : 'Chương VIP được mã hóa trên máy chủ Đạo Tâm',
  });
}
