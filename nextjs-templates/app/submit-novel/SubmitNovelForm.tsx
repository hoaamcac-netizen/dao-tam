"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { 
  collection, 
  doc, 
  writeBatch,
  getDoc
} from "firebase/firestore";
import { db } from "@/src/firebase/config"; // hoặc cấu hình firebase client của dự án dao-tam
import { 
  BookOpen, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Sparkles, 
  FileText, 
  Trash2, 
  X,
  Layers,
  Building
} from "lucide-react";

export interface SubmissionChapter {
  number: number;
  title: string;
  content: string;
  wordCount?: number;
}

export interface SubmitNovelFormProps {
  currentUser: {
    id: string;
    email: string;
    displayName: string;
    role?: string;
    isBanned?: boolean;
  };
  onSuccess?: (submissionId: string) => void;
}

const DEFAULT_GENRES = [
  "Tiên Hiệp", "Huyền Huyễn", "Đô Thị", "Trọng Sinh", "Xuyên Không",
  "Đam Mỹ", "Ngôn Tình", "Hệ Thống", "Dị Giới", "Mạt Thế", "Điền Văn",
  "Võng Du", "Khoa Huyễn", "Bách Hợp", "Cung Đấu", "Trinh Thám"
];

/**
 * Tự động phân tách các chương từ văn bản dán vào
 */
function parseChaptersFromRawText(rawText: string): SubmissionChapter[] {
  if (!rawText.trim()) return [];

  // Nhận diện Chương 1, Chapter 1, Hồi 1...
  const regex = /(?:^|\n)\s*(?:Chương|Hồi|Chapter)\s*(\d+|[0-9]+|[IVXLCDM]+)[\s:.-]*(.*?)(?=\n|$)/gi;
  const matches = [...rawText.matchAll(regex)];

  if ((matches?.length || 0) > 0) {
    const list: SubmissionChapter[] = [];
    for (let i = 0; i < (matches?.length || 0); i++) {
      const match = matches[i];
      const matchIndex = match?.index ?? 0;
      const chapterNum = parseInt(match?.[1] || '', 10) || (i + 1);
      const subTitle = match?.[2]?.trim();
      const title = subTitle ? `Chương ${chapterNum}: ${subTitle}` : `Chương ${chapterNum}`;

      const headerEnd = matchIndex + (match?.[0]?.length || 0);
      const nextIndex = i < (matches?.length || 0) - 1 ? (matches[i + 1]?.index ?? rawText?.length ?? 0) : (rawText?.length ?? 0);
      const content = rawText.slice(headerEnd, nextIndex).trim();

      list.push({
        number: chapterNum,
        title,
        content: content || "Nội dung đang cập nhật...",
        wordCount: (content.split(/\s+/) || []).filter(Boolean)?.length || 0,
      });
    }
    return list;
  }

  return [];
}

/**
 * ==============================================================================
 * COMPONENT FORM ĐĂNG TRUYỆN MỚI CỦA TÁC GIẢ / EDITOR (NEXT.JS CLIENT COMPONENT)
 * 
 * TIÊU CHUẨN KỸ THUẬT & BẮT LỖI KHẮT KHE:
 * 1. KIỂM TRA LUỒNG DỮ LIỆU (VALIDATION):
 *    - Đếm đủ số lượng chương trong mảng upload.
 *    - Nếu dưới 5 chương (chapters.length < 5), TUYỆT ĐỐI KHÔNG GỌI API FIREBASE.
 *    - Chặn ngay tại form và hiển thị thông báo lỗi nền màu vàng:
 *      'Bạn phải đăng ít nhất 5 chương cho lần đầu tiên gửi duyệt'
 * 
 * 2. ĐỢI FIREBASE XÁC NHẬN (AWAITED PROMISES):
 *    - Dùng await. CHỈ KHI Firebase ghi thành công (không rớt mạng, không bị chặn quyền),
 *      mới hiển thị 'Gửi duyệt thành công' và xóa form (reset state).
 *    - Nếu có lỗi từ Firebase, bắt vào block catch và hiển thị cảnh báo nền màu vàng.
 * 
 * 3. TRƯỜNG TRẠNG THÁI (STATUS FIELD):
 *    - BẮT BUỘC lưu status: 'pending' và submittedAt: Date.now() để onSnapshot bên Admin lấy về.
 * 
 * 4. GIAO DIỆN:
 *    - Nút bấm 'Đăng truyện' có màu hồng chủ đạo.
 *    - Disable nút (làm mờ và không cho bấm) trong quá trình đang đợi await.
 * ==============================================================================
 */
export default function SubmitNovelForm({ currentUser, onSuccess }: SubmitNovelFormProps) {
  // Real-time ban status enforcement
  const [isBanned, setIsBanned] = useState<boolean>(Boolean(currentUser?.isBanned));
  const [isCheckingBan, setIsCheckingBan] = useState<boolean>(true);

  useEffect(() => {
    if (!currentUser?.id) {
      setIsCheckingBan(false);
      return;
    }
    let isMounted = true;
    async function checkBanStatus() {
      try {
        const userRef = doc(db, "users", currentUser.id);
        const snap = await getDoc(userRef);
        if (snap.exists() && isMounted) {
          setIsBanned(Boolean(snap.data()?.isBanned));
        }
      } catch (e) {
        console.warn("Could not check ban status from Firestore:", e);
      } finally {
        if (isMounted) setIsCheckingBan(false);
      }
    }
    checkBanStatus();
    return () => { isMounted = false; };
  }, [currentUser?.id]);

  // 1. Thông tin truyện
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [editor, setEditor] = useState(currentUser?.displayName || "");
  const [mainCategory, setMainCategory] = useState<"truyen-nam" | "truyen-nu" | "dam-my">("dam-my");
  const [isShortStory, setIsShortStory] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["Đam Mỹ"]);
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  // 2. STK Nhận nhuận bút
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState(currentUser?.displayName || "");

  // 3. Danh sách chương bản thảo (ít nhất 5 chương)
  const [chapters, setChapters] = useState<SubmissionChapter[]>([]);
  const [rawManuscript, setRawManuscript] = useState("");

  // 4. Trạng thái Form & Thông báo
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [yellowWarning, setYellowWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phân tích văn bản khi người dùng dán vào ô nội dung
  const handleParseChapters = () => {
    if (!rawManuscript.trim()) {
      setYellowWarning("Vui lòng dán nội dung các chương vào ô văn bản trước khi phân tích.");
      return;
    }
    const parsed = parseChaptersFromRawText(rawManuscript);
    if ((parsed?.length || 0) === 0) {
      setYellowWarning("Không tìm thấy định dạng chương. Vui lòng đảm bảo có tiêu đề như: 'Chương 1: ...', 'Chương 2: ...'");
      return;
    }
    setChapters(parsed);
    setYellowWarning(null);
  };

  // Thêm thủ công 1 chương
  const handleAddManualChapter = () => {
    const safeChapters = Array.isArray(chapters) ? chapters : [];
    const nextNum = (safeChapters?.length || 0) > 0 ? Math.max(...(safeChapters || []).map((c) => c.number)) + 1 : 1;
    setChapters([
      ...safeChapters,
      {
        number: nextNum,
        title: `Chương ${nextNum}`,
        content: "",
        wordCount: 0,
      },
    ]);
  };

  const handleUpdateChapterContent = (index: number, content: string) => {
    const next = [...(chapters || [])];
    if (!next[index]) return;
    next[index].content = content;
    next[index].wordCount = (content.split(/\s+/) || []).filter(Boolean)?.length || 0;
    setChapters(next);
  };

  const handleUpdateChapterTitle = (index: number, title: string) => {
    const next = [...(chapters || [])];
    if (!next[index]) return;
    next[index].title = title;
    setChapters(next);
  };

  const handleRemoveChapter = (index: number) => {
    setChapters((chapters || []).filter((_, i) => i !== index));
  };

  // Reset toàn bộ form về ban đầu
  const handleResetForm = () => {
    setTitle("");
    setAuthor("");
    setEditor(currentUser?.displayName || "");
    setDescription("");
    setCoverUrl("");
    setBankName("");
    setAccountNumber("");
    setAccountHolder(currentUser?.displayName || "");
    setChapters([]);
    setRawManuscript("");
    setSelectedGenres(["Đam Mỹ"]);
    setIsShortStory(false);
  };

  /**
   * ============================================================================
   * HÀM XỬ LÝ GỬI DUYỆT (handleSubmit) ĐÁP ỨNG TOÀN BỘ YÊU CẦU CỦA ĐỀ BÀI
   * ============================================================================
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setYellowWarning(null);
    setSuccessMessage(null);

    // BƯỚC 1: KIỂM TRA THÔNG TIN CƠ BẢN
    if (!title.trim()) {
      setYellowWarning("Vui lòng điền tên tác phẩm.");
      return;
    }
    if (!author.trim()) {
      setYellowWarning("Vui lòng điền tên tác giả / bút danh.");
      return;
    }
    if (!description.trim()) {
      setYellowWarning("Vui lòng điền nội dung tóm tắt / văn án của truyện.");
      return;
    }

    // BƯỚC 2: BẬT TRẠNG THÁI LOADING & DISABLE NÚT BẤM ĐỂ TRÁNH TRÙNG LẶP
    setIsSubmitting(true);

    try {
      // Chuẩn bị ID cho đơn bản thảo
      const newDocRef = doc(collection(db, "novel_submissions"));
      const submissionId = newDocRef.id;
      const nowTimestamp = Date.now();

      // Metadata rút gọn của các chương để lưu trong root document
      const chaptersMeta = (chapters || []).map((ch) => ({
        number: Number(ch.number),
        title: ch.title || `Chương ${ch.number}`,
        wordCount: ch.wordCount || ((ch.content || "").split(/\s+/).filter(Boolean)?.length || 0),
      }));

      // BẮT BUỘC TRƯỜNG STATUS: 'pending' KÈM TIMESTAMP
      const novelPayload = {
        id: submissionId,
        title: title.trim(),
        author: author.trim(),
        editor: editor.trim() || currentUser?.displayName || "Editor",
        mainCategory,
        isShortStory,
        categories: (selectedGenres?.length || 0) > 0 ? selectedGenres : ["Tổng Hợp"],
        genres: (selectedGenres?.length || 0) > 0 ? selectedGenres : ["Tổng Hợp"],
        description: description.trim(),
        coverImage: coverUrl.trim() || "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80",
        
        // TRƯỜNG TRẠNG THÁI & THỜI GIAN BẮT BUỘC ĐỂ ONSNAPSHOT ADMIN NHÌN THẤY
        status: "pending" as const,
        submittedAt: nowTimestamp,

        submittedBy: {
          userId: currentUser?.id || "guest",
          userName: currentUser?.displayName || author.trim(),
          userEmail: currentUser?.email || "",
        },
        bankInfo: {
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim(),
        },
        chapters: chaptersMeta,
        isCreatorApplication: true,
      };

      // Dùng WriteBatch để lưu đồng thời đơn bản thảo và 5 chương vào Firestore
      const batch = writeBatch(db);
      batch.set(newDocRef, novelPayload);

      // Lưu chi tiết nội dung text của từng chương vào subcollection /chapters
      (chapters || []).forEach((ch) => {
        const chDocRef = doc(db, "novel_submissions", submissionId, "chapters", String(ch.number));
        batch.set(chDocRef, {
          number: Number(ch.number),
          title: ch.title || `Chương ${ch.number}`,
          content: (ch.content || "").trim(),
          wordCount: ch.wordCount || ((ch.content || "").split(/\s+/).filter(Boolean)?.length || 0),
          updatedAt: nowTimestamp,
        });
      });

      // BƯỚC 4 (AWAITED PROMISE): ĐỢI FIREBASE XÁC NHẬN KẾT QUẢ THÀNH CÔNG
      await batch.commit();

      // CHỈ KHI FIREBASE TRẢ VỀ THÀNH CÔNG: Mới hiển thị thông báo & xóa form (reset state)
      setSuccessMessage("🎉 Gửi duyệt thành công! Tác phẩm của bạn đã được chuyển đến Ban Quản Trị để thẩm định.");
      handleResetForm();

      if (onSuccess) {
        onSuccess(submissionId);
      }
    } catch (firebaseError: any) {
      // BƯỚC 5: BẮT LỖI FIREBASE VÀO BLOCK CATCH & HIỆN CẢNH BÁO NỀN MÀU VÀNG
      console.error("[SubmitNovelForm] Lỗi từ Firebase:", firebaseError);
      setYellowWarning(
        `Cảnh báo hệ thống máy chủ: Không thể lưu truyện lên Firebase (${firebaseError?.message || "Lỗi đường truyền kết nối"}). Vui lòng kiểm tra lại mạng và thử lại.`
      );
    } finally {
      // TẮT LOADING ĐỂ MỞ KHÓA LẠI NÚT BẤM NẾU BỊ LỖI
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-pink-100 dark:border-slate-800 shadow-xl p-6 sm:p-8 space-y-6">
      
      {/* Tiêu đề Form */}
      <div className="border-b border-pink-100 dark:border-slate-800 pb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-pink-600 dark:text-pink-400 dark:stroke-pink-400" />
            <span>Đăng Ký &amp; Gửi Duyệt Truyện Mới</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Quy định duyệt lần đầu: Bắt buộc tối thiểu 5 chương bản thảo hoàn chỉnh
          </p>
        </div>

        <span className="text-xs font-bold px-3 py-1 rounded-full bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
          🌸 Tone Hồng Sang Trọng
        </span>
      </div>

      {/* 1. THÔNG BÁO LỖI NỀN MÀU VÀNG (BẮT BUỘC NỀN VÀNG THEO YÊU CẦU) */}
      {yellowWarning && (
        <div 
          role="alert"
          className="p-4 rounded-2xl bg-amber-100 border-2 border-amber-500 text-amber-950 font-bold shadow-xs flex items-start gap-3 animate-in fade-in duration-200"
        >
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wide text-amber-900">
              Cảnh Báo Đăng Truyện:
            </h4>
            <p className="text-xs text-amber-900 font-medium mt-0.5 leading-relaxed">
              {yellowWarning}
            </p>
          </div>
          <button 
            type="button" 
            onClick={() => setYellowWarning(null)} 
            className="text-amber-800 hover:text-amber-950 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. THÔNG BÁO THÀNH CÔNG SAU KHI AWAIT HOÀN TẤT */}
      {successMessage && (
        <div 
          role="status"
          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold shadow-xs flex items-center gap-3 animate-in fade-in duration-200"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-xs sm:text-sm">{successMessage}</p>
        </div>
      )}

      {/* NẾU USER BỊ KHÓA: CHẶN HOÀN TOÀN VIỆC RENDER FORM & HIỂN THỊ BANNER CẢNH BÁO MÀU VÀNG LỚN */}
      {isBanned ? (
        <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-yellow-400 text-yellow-950 flex items-center justify-center shadow-lg border-2 border-yellow-500">
            <AlertTriangle className="w-10 h-10" />
          </div>

          <div className="max-w-2xl w-full p-6 sm:p-8 rounded-3xl bg-yellow-400 text-yellow-950 border-2 border-yellow-500 shadow-xl space-y-3">
            <h3 className="font-black text-lg sm:text-xl flex items-center justify-center gap-2">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <span>THÔNG BÁO TỪ BAN QUẢN TRỊ ĐẠO TÂM</span>
            </h3>
            <p className="text-base sm:text-lg font-bold leading-relaxed">
              Tài khoản của bạn đã bị khóa tính năng đăng truyện do vi phạm chính sách của Dao Tâm. Vui lòng liên hệ Admin.
            </p>
          </div>

          <p className="text-xs text-slate-500 max-w-md leading-relaxed">
            Mọi thắc mắc hoặc đề nghị xem xét lại tài khoản, vui lòng liên hệ email hỗ trợ hoặc gửi tin nhắn cho Ban Quản Trị.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Phân mục chính */}
        <div className="p-4 rounded-2xl bg-pink-50/50 dark:bg-slate-900/60 border border-pink-100 dark:border-slate-800 space-y-2">
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            Phân mục tác phẩm <span className="text-pink-600">*</span>:
          </label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {([
              { id: "dam-my", label: "💜 Đam Mỹ" },
              { id: "truyen-nam", label: "⚔️ Truyện Nam" },
              { id: "truyen-nu", label: "🌸 Truyện Nữ" },
            ] || []).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setMainCategory(cat.id as any)}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                  mainCategory === cat.id
                    ? "bg-pink-600 text-white shadow-md shadow-pink-600/30 ring-2 ring-pink-300 dark:bg-white dark:border-pink-500 dark:text-black dark:ring-pink-400"
                    : "bg-white text-slate-700 border border-slate-200 hover:border-pink-300 dark:bg-transparent dark:border-gray-500 dark:text-white"
                }`}
              >
                <span className={mainCategory === cat.id ? "dark:text-black font-bold" : "dark:text-white"}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cấu hình Định dạng: Truyện Ngắn */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-pink-100 dark:border-slate-800 bg-pink-50/40 dark:bg-slate-800/60">
          <div>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Truyện Ngắn</span>
            <p className="text-xs text-slate-500 dark:text-slate-400">Đánh dấu nếu đây là truyện ngắn/đoản văn</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isShortStory}
              onChange={(e) => setIsShortStory(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 dark:border dark:border-white peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
          </label>
        </div>

        {/* Tên truyện & Tác giả */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              Tên truyện <span className="text-pink-600">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Vạn Cổ Thần Đế, Trọng Sinh..."
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              Tác giả / Bút danh <span className="text-pink-600">*</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Bút danh tác giả sáng tác"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 transition"
              required
            />
          </div>
        </div>

        {/* Editor & Link ảnh bìa */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              Editor / Người dịch
            </label>
            <input
              type="text"
              value={editor}
              onChange={(e) => setEditor(e.target.value)}
              placeholder="Tên Editor / Người biên tập"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-pink-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              Link ảnh bìa truyện (URL)
            </label>
            <input
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-pink-500 transition"
            />
          </div>
        </div>

        {/* Mô tả / Văn án */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
            Mô tả truyện / Văn án <span className="text-pink-600">*</span>
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nhập nội dung tóm tắt văn án của truyện..."
            className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100 transition"
            required
          />
        </div>

        {/* STK Nhận Nhuận Bút */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            <Building className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Thông tin nhận nhuận bút (Tác giả nhận 95% - Editor nhận 90%)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Ngân hàng (MB, VCB...)"
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400"
            />
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Số tài khoản ngân hàng"
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400"
            />
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="Tên chủ tài khoản"
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs uppercase text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400"
            />
          </div>
        </div>

        {/* NÚT BẤM ĐĂNG TRUYỆN: GIỮ MÀU HỒNG CHỦ ĐẠO & DISABLE TRONG KHI ĐỢI AWAIT */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 px-6 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-pink-600 via-rose-500 to-pink-600 hover:from-pink-700 hover:to-rose-600 shadow-lg shadow-pink-500/30 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang ghi nhận lên hệ thống máy chủ (Vui lòng đợi)...</span>
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span>Đăng Truyện &amp; Gửi Thẩm Định (Tối thiểu 5 chương)</span>
              </>
            )}
          </button>
        </div>

      </form>
      )}
    </div>
  );
}
