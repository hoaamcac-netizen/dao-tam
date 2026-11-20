import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, updateDoc, getDoc, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig, 'vercelBatchApp') : getApp('vercelBatchApp');
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const BATCH_LIMIT = 400; // Chunking dưới ngưỡng 500 operations của Firestore

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { novelId, updatedNovel, newChapters, isCompleted } = req.body || {};
    if (!novelId || !Array.isArray(newChapters) || newChapters.length === 0) {
      return res.status(400).json({ success: false, error: 'Thiếu novelId hoặc danh sách newChapters' });
    }

    const nowTs = Date.now();

    // 1. Ghi các chương vào subcollection bằng writeBatch theo chunk <= 400 docs
    for (let i = 0; i < newChapters.length; i += BATCH_LIMIT) {
      const chunk = newChapters.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);

      chunk.forEach((ch: any) => {
        const chNum = Number(ch.number);
        const chRef = doc(db, 'novels', novelId, 'chapters', String(chNum));
        batch.set(chRef, {
          id: ch.id || `c-${novelId}-${chNum}`,
          number: chNum,
          title: ch.title || `Chương ${chNum}`,
          slug: ch.slug || `chuong-${chNum}`,
          content: ch.content || '',
          wordCount: ch.wordCount || (ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0),
          publishedDate: ch.publishedDate || new Date().toISOString().split('T')[0],
          isVip: Boolean(ch.isVip),
          priceXu: Number(ch.priceXu || 0),
          updatedAt: nowTs,
        }, { merge: true });
      });

      await batch.commit();
      if (i + BATCH_LIMIT < newChapters.length) {
        await new Promise((r) => setTimeout(r, 30));
      }
    }

    // 2. Cập nhật root document với mục lục siêu nhẹ (không chứa nội dung chữ)
    const novelRef = doc(db, 'novels', novelId);
    const existingSnap = await getDoc(novelRef).catch(() => null);
    let existingTOC: any[] = [];
    let currentData: any = {};
    if (existingSnap && existingSnap.exists()) {
      currentData = existingSnap.data() || {};
      if (Array.isArray(currentData.chapters)) {
        existingTOC = currentData.chapters;
      }
    }

    const chapterMap = new Map<number, any>();
    existingTOC.forEach((c: any) => {
      chapterMap.set(Number(c.number), {
        id: c.id || `c-${c.number}`,
        number: Number(c.number),
        title: c.title || `Chương ${c.number}`,
        slug: c.slug || `chuong-${c.number}`,
        publishedDate: c.publishedDate || '',
        isVip: Boolean(c.isVip),
        priceXu: Number(c.priceXu || 0),
        wordCount: Number(c.wordCount || 0),
        content: '', // Metadata-only
      });
    });

    newChapters.forEach((c: any) => {
      chapterMap.set(Number(c.number), {
        id: c.id || `c-${c.number}`,
        number: Number(c.number),
        title: c.title || `Chương ${c.number}`,
        slug: c.slug || `chuong-${c.number}`,
        publishedDate: c.publishedDate || '',
        isVip: Boolean(c.isVip),
        priceXu: Number(c.priceXu || 0),
        wordCount: Number(c.wordCount || 0),
        content: '', // Metadata-only
      });
    });

    const mergedTOC = Array.from(chapterMap.values()).sort((a, b) => Number(a.number) - Number(b.number));
    const effectiveTotalChapters = Math.max(
      Number(currentData.totalChapters || 0),
      Number(updatedNovel?.totalChapters || 0),
      mergedTOC.length,
      ...newChapters.map((c: any) => Number(c.number) || 0)
    );
    const topChapter = mergedTOC[mergedTOC.length - 1];

    const rootUpdate: any = {
      status: isCompleted ? 'Hoàn thành' : (updatedNovel?.status || currentData.status || 'Đang ra'),
      totalChapters: effectiveTotalChapters,
      latestChapterTitle: topChapter?.title || `Chương ${effectiveTotalChapters}`,
      latestChapterNumber: topChapter?.number || effectiveTotalChapters,
      lastUpdated: 'Vừa xong',
      updatedAt: nowTs,
      lastChapterUpdatedAt: nowTs,
      chapters: mergedTOC,
    };

    if (existingSnap && existingSnap.exists()) {
      await updateDoc(novelRef, rootUpdate);
    } else {
      await setDoc(novelRef, { ...updatedNovel, ...rootUpdate }, { merge: true });
    }

    // Đồng bộ root doc sang stories
    setDoc(doc(db, 'stories', novelId), rootUpdate, { merge: true }).catch(() => {});

    return res.status(200).json({
      success: true,
      totalChapters: effectiveTotalChapters,
      savedCount: newChapters.length,
      latestChapterTitle: rootUpdate.latestChapterTitle,
      latestChapterNumber: rootUpdate.latestChapterNumber,
    });
  } catch (err: any) {
    console.error('Lỗi API Vercel /api/batch-chapters:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Lỗi xử lý server' });
  }
}
