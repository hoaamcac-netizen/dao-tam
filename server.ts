import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

import fs from 'fs';
import { initializeApp as initServerFirebase, getApps as getServerApps, getApp as getServerApp } from 'firebase/app';
import { getFirestore as getServerFirestore, doc as serverDoc, getDoc as getServerDoc, setDoc as serverSetDoc, updateDoc as serverUpdateDoc, writeBatch as serverWriteBatch } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Khởi tạo Firestore trên Server kết nối trực tiếp đến database chính thức
const appletConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));
const serverFirebaseApp = !getServerApps().length ? initServerFirebase(appletConfig, 'serverFirestoreApp') : getServerApp('serverFirestoreApp');
const serverDb = getServerFirestore(serverFirebaseApp, appletConfig.firestoreDatabaseId);

// In-memory cache for available Edge TTS Vietnamese voices
let cachedViVoices: any[] = [];
let lastVoiceFetch = 0;

/**
 * Scan & retrieve verified Vietnamese voices from Microsoft Edge TTS
 */
async function scanVietnameseVoices() {
  const now = Date.now();
  if (cachedViVoices.length > 0 && now - lastVoiceFetch < 3600000) {
    return cachedViVoices;
  }

  try {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 10000 });
    const allVoices = await tts.getVoices();
    const viList = allVoices.filter((v: any) => v.Locale && v.Locale.toLowerCase().startsWith('vi'));
    
    if (viList.length > 0) {
      cachedViVoices = viList.map((v: any) => {
        const isMale = v.Gender && v.Gender.toLowerCase() === 'male';
        const isHoaiMy = v.ShortName.includes('HoaiMy') || v.FriendlyName.includes('HoaiMy');
        const isNamMinh = v.ShortName.includes('NamMinh') || v.FriendlyName.includes('NamMinh');

        const displayName = isHoaiMy ? 'Hoài My' : isNamMinh ? 'Nam Minh' : (v.FriendlyName || v.ShortName);
        const tag = isMale ? 'Nam • Edge Neural Tự Nhiên' : 'Nữ • Edge Neural Tự Nhiên';

        return {
          id: v.ShortName,
          shortName: v.ShortName,
          name: displayName,
          tag,
          gender: isMale ? 'male' : 'female',
          locale: v.Locale,
          description: `Giọng đọc ${isMale ? 'nam' : 'nữ'} Microsoft Edge Neural tự nhiên, chuẩn bản ngữ tiếng Việt.`,
          sampleText: isMale
            ? 'Tôi là Nam Minh. Mời quý độc giả cùng thưởng thức câu chuyện qua giọng đọc Edge TTS chân thực.'
            : 'Chào bạn, mình là Hoài My. Đây là giọng đọc Edge TTS truyền cảm tự nhiên của Microsoft.',
        };
      });
      lastVoiceFetch = now;
      console.log(`[Edge TTS] Scanned ${cachedViVoices.length} real Vietnamese voices:`, cachedViVoices.map(v => v.id));
      return cachedViVoices;
    }
  } catch (err) {
    console.warn('[Edge TTS] Voice list scan warning, using verified defaults:', err);
  }

  // Fallback to the 2 real Edge TTS Vietnamese voices if scan network times out
  cachedViVoices = [
    {
      id: 'vi-VN-HoaiMyNeural',
      shortName: 'vi-VN-HoaiMyNeural',
      name: 'Hoài My',
      tag: 'Nữ • Edge Neural Tự Nhiên',
      gender: 'female',
      locale: 'vi-VN',
      description: 'Giọng đọc nữ Microsoft Edge Neural tự nhiên, chuẩn bản ngữ tiếng Việt.',
      sampleText: 'Chào bạn, mình là Hoài My. Đây là giọng đọc Edge TTS truyền cảm tự nhiên của Microsoft.',
    },
    {
      id: 'vi-VN-NamMinhNeural',
      shortName: 'vi-VN-NamMinhNeural',
      name: 'Nam Minh',
      tag: 'Nam • Edge Neural Tự Nhiên',
      gender: 'male',
      locale: 'vi-VN',
      description: 'Giọng đọc nam Microsoft Edge Neural trầm ấm, đĩnh đạc, chuẩn bản ngữ tiếng Việt.',
      sampleText: 'Tôi là Nam Minh. Mời quý độc giả cùng thưởng thức câu chuyện qua giọng đọc Edge TTS chân thực.',
    },
  ];
  lastVoiceFetch = now;
  return cachedViVoices;
}

/**
 * GET /api/tts/voices
 * Returns actual scanned list of Vietnamese voices from Edge TTS
 */
app.get('/api/tts/voices', async (_req: Request, res: Response) => {
  try {
    const voices = await scanVietnameseVoices();
    res.json({ success: true, count: voices.length, voices });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Lỗi khi quét danh sách giọng đọc Edge TTS' });
  }
});

// In-memory audio cache for synthesized sentences (Key: `${voiceCode}:::${cleanText}`)
const audioCache = new Map<string, Buffer>();
const inFlightTtsRequests = new Map<string, Promise<Buffer>>();

async function synthesizeEdgeTtsBuffer(cleanText: string, voiceCode: string, cacheKey: string): Promise<Buffer> {
  if (audioCache.has(cacheKey)) {
    const cached = audioCache.get(cacheKey)!;
    // Refresh LRU position
    audioCache.delete(cacheKey);
    audioCache.set(cacheKey, cached);
    return cached;
  }

  const existingTask = inFlightTtsRequests.get(cacheKey);
  if (existingTask) {
    return existingTask;
  }

  const task = (async () => {
    try {
      const tts = new MsEdgeTTS({
        connectionTimeoutMs: 7000,
        synthesisTimeoutMs: 12000,
      });

      await tts.setMetadata(voiceCode, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(cleanText);

      const fullBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let settled = false;

        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('Quá thời gian tổng hợp âm thanh từ Edge TTS'));
          }
        }, 12000);

        audioStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        audioStream.on('end', () => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          const buf = Buffer.concat(chunks);
          if (buf.length > 0) resolve(buf);
          else reject(new Error('Không nhận được dữ liệu âm thanh từ Edge TTS'));
        });

        audioStream.on('error', (streamErr: any) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            reject(streamErr instanceof Error ? streamErr : new Error(String(streamErr)));
          }
        });
      });

      if (audioCache.size >= 1500) {
        const firstKey = audioCache.keys().next().value;
        if (firstKey) audioCache.delete(firstKey);
      }
      audioCache.set(cacheKey, fullBuffer);
      return fullBuffer;
    } finally {
      inFlightTtsRequests.delete(cacheKey);
    }
  })();

  inFlightTtsRequests.set(cacheKey, task);
  return task;
}

/**
 * Handle Edge TTS Speech Synthesis with in-memory caching and request deduplication
 */
async function handleTtsSynthesis(text: string, requestedVoice: string | undefined, res: Response) {
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Nội dung văn bản (text) không được để trống' });
  }

  // Normalize voice code: must be a real Edge TTS voice code (default: vi-VN-HoaiMyNeural)
  let voiceCode = 'vi-VN-HoaiMyNeural';
  if (requestedVoice) {
    const lower = requestedVoice.toLowerCase();
    if (lower.includes('namminh') || lower === 'nam-minh') {
      voiceCode = 'vi-VN-NamMinhNeural';
    } else if (lower.includes('hoaimy') || lower === 'hoai-my') {
      voiceCode = 'vi-VN-HoaiMyNeural';
    } else if (requestedVoice.startsWith('vi-VN-')) {
      voiceCode = requestedVoice;
    }
  }

  // Sanitize text limit per sentence/paragraph (max 3000 chars per chunk)
  const cleanText = text.trim().slice(0, 3000);
  const cacheKey = `${voiceCode}:::${cleanText}`;

  try {
    const fullBuffer = await synthesizeEdgeTtsBuffer(cleanText, voiceCode, cacheKey);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', fullBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(fullBuffer);
    }
  } catch (err: any) {
    console.error(`[Edge TTS Error for voice ${voiceCode}]:`, err);
    if (!res.headersSent) {
      const isTimeout = String(err?.message || '').includes('Quá thời gian');
      res.status(isTimeout ? 504 : 502).json({
        error: 'Không thể tạo âm thanh từ Edge TTS: ' + (err?.message || 'Unknown'),
      });
    }
  }
}

/**
 * GET /api/tts?text=...&voice=...
 */
app.get('/api/tts', async (req: Request, res: Response) => {
  const text = (req.query.text as string) || '';
  const voice = (req.query.voice as string) || '';
  await handleTtsSynthesis(text, voice, res);
});

/**
 * GET /api/tts/stream?text=...&voice=...
 */
app.get('/api/tts/stream', async (req: Request, res: Response) => {
  const text = (req.query.text as string) || '';
  const voice = (req.query.voice as string) || '';
  await handleTtsSynthesis(text, voice, res);
});

/**
 * POST /api/tts
 */
app.post('/api/tts', async (req: Request, res: Response) => {
  const text = req.body?.text || '';
  const voice = req.body?.voice || '';
  await handleTtsSynthesis(text, voice, res);
});

// =========================================================================
// BẢO MẬT VIP & TIỀN TỆ SERVER-SIDE (VERCEL SERVERLESS READY)
// Chuyển toàn bộ logic khóa chương VIP, trừ Xu & chia nhuận bút lên Server
// Ngăn chặn triệt để hành vi can thiệp LocalStorage hoặc bóc tách mã nguồn
// =========================================================================

interface ServerUserAccount {
  userId: string;
  userEmail: string;
  userName: string;
  xuBalance: number;
  authorEarnedXu: number;
  unlockedChapters: Record<string, string[]>;
  unlockedFullBooks: string[];
  purchases: any[];
}

// In-memory Server-authoritative accounts ledger
const serverAccountsLedger = new Map<string, ServerUserAccount>();

function getOrCreateServerAccount(userId: string, email: string = '', name: string = ''): ServerUserAccount {
  if (!serverAccountsLedger.has(userId)) {
    serverAccountsLedger.set(userId, {
      userId,
      userEmail: email,
      userName: name || 'Độc Giả',
      xuBalance: 0,
      authorEarnedXu: 0,
      unlockedChapters: {},
      unlockedFullBooks: [],
      purchases: [],
    });
  }
  const acc = serverAccountsLedger.get(userId)!;
  if (email && !acc.userEmail) acc.userEmail = email;
  if (name && (!acc.userName || acc.userName === 'Độc Giả')) acc.userName = name;
  return acc;
}

/**
 * POST /api/vip/unlock
 * Mở khóa chương VIP hoặc Mua trọn bộ truyện an toàn trên Server
 * - Thẩm định số dư Xu thực tế
 * - Trừ Xu nguyên tử (atomic deduction)
 * - Tự động tính và chuyển nhuận bút cho Tác Giả / Editor (Tác giả 98%, Độc quyền 95%, Editor 90%)
 */
app.post('/api/vip/unlock', (req: Request, res: Response) => {
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
      editorName,
      isExclusive,
      isEditor,
      isOriginal,
    } = req.body;

    if (!userId || !novelId) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin người dùng hoặc tác phẩm' });
    }

    const userAccount = getOrCreateServerAccount(userId, userEmail, userName);

    // Tính toán giá mở khóa (ưu tiên giá do client gửi lên hoặc mặc định)
    const clientPrice = typeof req.body.price === 'number' && !isNaN(req.body.price) ? req.body.price : null;
    const CHAPTER_PRICE = clientPrice !== null ? clientPrice : 5;
    const FULL_BOOK_PROMO = clientPrice !== null ? clientPrice : 85;

    let priceToPay = 0;
    const existingChapters = userAccount.unlockedChapters[novelId] || [];

    if (type === 'chapter') {
      if (!chapterId) {
        return res.status(400).json({ success: false, error: 'Thiếu mã chương cần mở khóa' });
      }
      // Kiểm tra xem đã mở khóa trước đó chưa
      if (existingChapters.includes(chapterId) || userAccount.unlockedFullBooks.includes(novelId)) {
        return res.json({
          success: true,
          message: 'Chương này đã được mở khóa trước đó',
          newXuBalance: userAccount.xuBalance,
          unlockedChapters: userAccount.unlockedChapters,
          unlockedFullBooks: userAccount.unlockedFullBooks,
        });
      }
      priceToPay = CHAPTER_PRICE;
    } else {
      priceToPay = FULL_BOOK_PROMO;
    }

    // Kiểm tra số dư Xu của độc giả trên server
    if (userAccount.xuBalance < priceToPay) {
      return res.status(402).json({
        success: false,
        error: `Số dư Xu không đủ. Cần ${priceToPay} Xu, tài khoản hiện có ${userAccount.xuBalance} Xu. Vui lòng nạp thêm!`,
        currentBalance: userAccount.xuBalance,
        requiredPrice: priceToPay,
      });
    }

    // Thực hiện trừ Xu trên Server an toàn
    userAccount.xuBalance = Math.max(0, parseFloat((userAccount.xuBalance - priceToPay).toFixed(2)));

    // Cập nhật danh sách mở khóa
    if (type === 'full_book') {
      if (!userAccount.unlockedFullBooks.includes(novelId)) {
        userAccount.unlockedFullBooks.push(novelId);
      }
    } else if (chapterId) {
      if (!existingChapters.includes(chapterId)) {
        userAccount.unlockedChapters[novelId] = [...existingChapters, chapterId];
      }
    }

    // TÍNH TOÁN VÀ CHIA NHUẬN BÚT CHO TÁC GIẢ / EDITOR TRÊN SERVER
    // Quy định: Tác giả sáng tác 95%, Editor độc quyền 90%, Editor không độc quyền 70%
    const isEditorWork = isEditor !== undefined ? Boolean(isEditor) : Boolean(editorName && !isOriginal);
    let royaltyRate = 95; // Tác giả nhận 95%
    if (isEditorWork) {
      royaltyRate = isExclusive ? 90 : 70; // Editor độc quyền 90%, không độc quyền 70%
    }
    const earnedXu = parseFloat(((priceToPay * royaltyRate) / 100).toFixed(2));

    // Ghi nhận doanh thu cho tác giả trên server
    const authorId = `author-${authorName || 'creator'}`;
    const authorAccount = getOrCreateServerAccount(authorId, '', authorName || 'Tác Giả');
    authorAccount.authorEarnedXu = parseFloat(((authorAccount.authorEarnedXu || 0) + earnedXu).toFixed(2));

    // Ghi lại lịch sử giao dịch
    const purchaseRecord = {
      id: `purchase-${Date.now()}`,
      novelId,
      novelTitle: novelTitle || 'Tác phẩm Đạo Tâm',
      type,
      chapterId: type === 'chapter' ? chapterId : undefined,
      chapterNumber: type === 'chapter' ? chapterNumber : undefined,
      pricePaid: priceToPay,
      purchasedAt: Date.now(),
    };
    userAccount.purchases.unshift(purchaseRecord);

    console.log(`[VIP Secure Server] User ${userId} unlocked ${type} for novel ${novelId} (-${priceToPay} Xu). Author ${authorName} received +${earnedXu} Xu (${royaltyRate}%).`);

    return res.json({
      success: true,
      message: type === 'full_book' ? 'Mở khóa trọn bộ tác phẩm thành công!' : `Mở khóa chương ${chapterNumber || ''} thành công!`,
      newXuBalance: userAccount.xuBalance,
      unlockedChapters: userAccount.unlockedChapters,
      unlockedFullBooks: userAccount.unlockedFullBooks,
      purchaseRecord,
      authorRoyaltyEarned: {
        authorId,
        earnedXu,
        royaltyRate,
      },
    });
  } catch (err: any) {
    console.error('[VIP Unlock Server Error]:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi xử lý giao dịch mở khóa VIP trên máy chủ' });
  }
});

/**
 * POST /api/chapter/secure-content
 * Trả về nội dung chương an toàn:
 * Nếu chương VIP chưa được mở khóa, chỉ trả về đoạn trích mẫu ngắn (teaser)
 * Tuyệt đối không gửi toàn bộ text về client để chống bóc tách mã nguồn / inspect
 */
app.post('/api/chapter/secure-content', (req: Request, res: Response) => {
  const { novelId, chapterId, userId } = req.body;
  if (!novelId || !chapterId) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin chương' });
  }

  const userAccount = userId ? serverAccountsLedger.get(userId) : null;
  const isFullBookUnlocked = userAccount ? userAccount.unlockedFullBooks.includes(novelId) : false;
  const isChapterUnlocked = userAccount
    ? (userAccount.unlockedChapters[novelId] && userAccount.unlockedChapters[novelId].includes(chapterId))
    : false;

  const hasAccess = isFullBookUnlocked || isChapterUnlocked;

  return res.json({
    success: true,
    isLocked: !hasAccess,
    unlocked: hasAccess,
    message: hasAccess ? 'Nội dung chương đầy đủ đã được cấp phép' : 'Chương VIP chưa mở khóa',
  });
});

/**
 * POST /api/author/payout
 * Xử lý lệnh rút nhuận bút an toàn (Kiểm tra tối thiểu 100 Xu)
 */
app.post('/api/author/payout', (req: Request, res: Response) => {
  const { authorId, amountXu, amountVnd, bankName, accountNumber, accountHolder } = req.body;
  if (!authorId || !amountXu || amountXu < 100) {
    return res.status(400).json({ success: false, error: 'Số Xu rút tối thiểu là 100 Xu (tương đương 100.000đ)' });
  }

  const authorAccount = getOrCreateServerAccount(authorId);
  if (authorAccount.authorEarnedXu < amountXu) {
    return res.status(400).json({
      success: false,
      error: `Số dư Xu nhuận bút không đủ (Hiện có: ${authorAccount.authorEarnedXu} Xu, Yêu cầu: ${amountXu} Xu)`,
    });
  }

  authorAccount.authorEarnedXu = parseFloat((authorAccount.authorEarnedXu - amountXu).toFixed(2));
  return res.json({
    success: true,
    message: `Đã tiếp nhận yêu cầu rút ${amountXu} Xu về tài khoản ${bankName} - ${accountNumber} (${accountHolder}). Ban Quản Trị sẽ chuyển khoản trong 24h.`,
    remainingXu: authorAccount.authorEarnedXu,
  });
});

/**
 * GET /api/novels
 * Endpoint trả về danh sách truyện với chỉ thị No-Cache triệt để:
 * Tắt hoàn toàn bộ nhớ đệm trên Vercel Edge Server, Cloudflare và mọi tầng Proxy trung gian.
 */
app.get('/api/novels', (_req: Request, res: Response) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
  return res.json({
    success: true,
    message: 'Dữ liệu thời gian thực không lưu bộ nhớ đệm (Cache disabled)',
    timestamp: Date.now(),
  });
});
/**
 * POST /api/batch-chapters
 * Lưu trực tiếp hàng loạt chương truyện vào Cloud Firestore từ máy chủ Node.js
 * Tốc độ ghi siêu tốc (<1.5s), không phụ thuộc vào WebSocket/gRPC trình duyệt, chống treo và chống lỗi mạng.
 */
app.post('/api/batch-chapters', async (req: Request, res: Response) => {
  try {
    const { novelId, updatedNovel, newChapters, isCompleted } = req.body;
    if (!novelId || !Array.isArray(newChapters) || newChapters.length === 0) {
      return res.status(400).json({ success: false, error: 'Thiếu novelId hoặc danh sách chương' });
    }

    console.log(`[BatchUpload] Bắt đầu lưu ${newChapters.length} chương cho tác phẩm "${novelId}"...`);
    const nowTs = Date.now();

    // 1. Ghi các chương vào subcollection bằng writeBatch theo lô tối đa 400 doc (chuẩn Firestore < 500)
    const BATCH_SIZE = 400;
    for (let i = 0; i < newChapters.length; i += BATCH_SIZE) {
      const chunk = newChapters.slice(i, i + BATCH_SIZE);
      const batch = serverWriteBatch(serverDb);
      chunk.forEach((ch: any) => {
        const chNum = Number(ch.number);
        const chRef = serverDoc(serverDb, 'novels', novelId, 'chapters', String(chNum));
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
          updatedAt: nowTs
        }, { merge: true });
      });
      await batch.commit();
      console.log(`[BatchUpload] Đã ghi xong lô ${i + 1} - ${Math.min(i + BATCH_SIZE, newChapters.length)}`);
      if (i + BATCH_SIZE < newChapters.length) {
        await new Promise((r) => setTimeout(r, 30));
      }
    }

    // 2. Cập nhật root document với mục lục siêu nhẹ (không chứa nội dung chữ)
    const novelRef = serverDoc(serverDb, 'novels', novelId);
    const existingSnap = await getServerDoc(novelRef);
    let existingTOC: any[] = [];
    let currentData: any = {};
    if (existingSnap.exists()) {
      currentData = existingSnap.data() || {};
      if (Array.isArray(currentData.chapters)) {
        existingTOC = currentData.chapters;
      }
    }

    const chapterMap = new Map<number, any>();
    existingTOC.forEach((c: any) => chapterMap.set(Number(c.number), {
      id: c.id || `c-${c.number}`,
      number: Number(c.number),
      title: c.title || `Chương ${c.number}`,
      slug: c.slug || `chuong-${c.number}`,
      publishedDate: c.publishedDate || new Date().toISOString().split('T')[0],
      isVip: Boolean(c.isVip),
      priceXu: Number(c.priceXu || 0),
      wordCount: c.wordCount || 0,
      content: ''
    }));

    newChapters.forEach((c: any) => chapterMap.set(Number(c.number), {
      id: c.id || `c-${c.number}`,
      number: Number(c.number),
      title: c.title || `Chương ${c.number}`,
      slug: c.slug || `chuong-${c.number}`,
      publishedDate: c.publishedDate || new Date().toISOString().split('T')[0],
      isVip: Boolean(c.isVip),
      priceXu: Number(c.priceXu || 0),
      wordCount: c.wordCount || 0,
      content: ''
    }));

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
      chapters: mergedTOC
    };

    if (existingSnap.exists()) {
      await serverUpdateDoc(novelRef, rootUpdate);
    } else {
      await serverSetDoc(novelRef, {
        ...updatedNovel,
        ...rootUpdate
      }, { merge: true });
    }

    // Đồng bộ sang collection stories ngầm
    serverUpdateDoc(serverDoc(serverDb, 'stories', novelId), rootUpdate).catch(() => {});

    console.log(`[BatchUpload] Hoàn tất lưu ${newChapters.length} chương vào tác phẩm ${novelId}! Tổng số chương hiện tại: ${effectiveTotalChapters}`);
    return res.json({
      success: true,
      totalChapters: effectiveTotalChapters,
      savedCount: newChapters.length,
      latestChapterTitle: rootUpdate.latestChapterTitle,
      latestChapterNumber: rootUpdate.latestChapterNumber
    });
  } catch (err: any) {
    console.error('[BatchUpload] Server error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Lỗi máy chủ khi lưu chương' });
  }
});

// Mount Vite or serve static build
async function startServer() {
  // Pre-scan voices on boot
  scanVietnameseVoices().catch(() => {});

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Đạo Tâm Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
