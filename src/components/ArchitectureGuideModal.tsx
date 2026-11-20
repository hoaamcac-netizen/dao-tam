import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  Cpu, 
  ShieldCheck, 
  Rocket, 
  DollarSign, 
  Database, 
  Code2, 
  Copy, 
  Check, 
  Download,
  Sparkles,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

interface ArchitectureGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureGuideModal: React.FC<ArchitectureGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'deployment' | 'security' | 'source'>('architecture');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-5xl bg-[#121319] border border-amber-500/40 rounded-2xl shadow-2xl flex flex-col h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-[#171822] border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 shadow-md">
              <div className="w-full h-full bg-[#121319] rounded-[10px] flex items-center justify-center text-amber-400">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-amber-300 flex items-center gap-2">
                Hồ Sơ Kiến Trúc Hệ Thống &amp; Triển Khai $0
                <span className="text-xs font-sans font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Dành cho người không biết IT
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Thiết kế bởi Kiến trúc sư Hệ thống • Tối ưu vận hành chi phí 0đ • Tự động hóa toàn diện
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 px-6 bg-[#151620] border-b border-neutral-800 text-xs sm:text-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'architecture'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            1. Đề Xuất Tech Stack ($0 Vận Hành)
          </button>
          <button
            onClick={() => setActiveTab('deployment')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'deployment'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Rocket className="w-4 h-4" />
            2. Hướng Dẫn Triển Khai 3 Bước
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            3. Ma Trận Bảo Mật DRM Chống Sao Chép
          </button>
          <button
            onClick={() => setActiveTab('source')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'source'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            4. Tệp Cấu Hình Độc Lập
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0e0f14] text-neutral-300 text-xs sm:text-sm space-y-6">
          {activeTab === 'architecture' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Cost card */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 text-stone-950 flex items-center justify-center font-bold text-base">
                    $0
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-400 text-sm">
                      Kiến Trúc Vercel Serverless Hiện Đại — Tối Ưu Chi Phí $0 Vận Hành
                    </h4>
                    <p className="text-xs text-neutral-300">
                      Hệ thống loại bỏ hoàn toàn các giới hạn cấu trúc cũ của Blogger, vận hành trên nền tảng <strong>Vercel Serverless + Edge TTS Chunking</strong> siêu tốc. Toàn bộ logic khóa VIP, trừ Xu và chia nhuận bút được bảo mật trên Server an toàn, cho phép chi trả tỷ lệ doanh thu kỷ lục cho nhà sáng tạo: <strong>Tác giả 98%</strong>, <strong>Độc quyền 95%</strong>, <strong>Editor 90%</strong>!
                    </p>
                  </div>
                </div>
              </div>

              {/* Stack items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Cpu className="w-4 h-4" /> Giao Diện (Frontend): React 19 + Tailwind
                  </div>
                  <p className="text-xs text-neutral-400">
                    Ứng dụng dạng SPA tốc độ cao, hiển thị tức thì, hỗ trợ mượt mà trên iPhone, iPad và điện thoại Android. Không cần bảo trì máy chủ web.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Sparkles className="w-4 h-4" /> Trình Đọc Audio TTS (Web Speech Engine)
                  </div>
                  <p className="text-xs text-neutral-400">
                    Tận dụng công nghệ Text-to-Speech tự nhiên có sẵn trong mọi thiết bị (Chrome, Safari, Edge). Tiết kiệm 100% dung lượng lưu trữ file âm thanh và tiền băng thông (tiết kiệm hàng triệu đồng/tháng so với upload MP3).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Database className="w-4 h-4" /> Cơ Sở Dữ Liệu: Firebase Firestore &amp; Auth
                  </div>
                  <p className="text-xs text-neutral-400">
                    Gói miễn phí của Google hỗ trợ 50.000 lượt đọc/ngày và 1GB lưu trữ. Đồng bộ dữ liệu ví Xu, chương đã mua và tiến trình đọc giữa điện thoại và máy tính tự động.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Rocket className="w-4 h-4" /> Máy Chủ Triển Khai: Vercel / Netlify
                  </div>
                  <p className="text-xs text-neutral-400">
                    Băng thông miễn phí 100GB/tháng, chứng chỉ bảo mật SSL (https://) miễn phí vĩnh viễn, tự động chịu tải khi có hàng nghìn người cùng đọc truyện.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'deployment' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div>
                <h3 className="font-serif text-lg font-bold text-amber-300">
                  Hướng Dẫn Xuất Mã Nguồn &amp; Triển Khai Lên Vercel Miễn Phí 100%
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Chỉ cần 5 - 10 phút, không cần thuê máy chủ VPS đắt đỏ, website của bạn sẽ chạy 24/7 với chứng chỉ SSL HTTPS hoàn toàn miễn phí.
                </p>
              </div>

              {/* Step 1 */}
              <div className="p-5 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold flex items-center justify-center text-sm shrink-0">
                    1
                  </span>
                  <h4 className="font-bold text-neutral-100 text-base">
                    Tải (Download/Export) toàn bộ mã nguồn về máy tính
                  </h4>
                </div>
                <div className="text-neutral-400 text-xs pl-10 space-y-1.5">
                  <p>
                    • Trên giao diện của Google AI Studio Build, nhấp vào biểu tượng <strong>Tải Xuống (Download Project / Export ZIP)</strong> hoặc <strong>Push to GitHub</strong> ở góc trên bên phải.
                  </p>
                  <p>
                    • Giải nén file ZIP vào một thư mục trên máy tính của bạn (ví dụ: <code>C:\daotam-web</code> hoặc <code>/Users/tenban/daotam-web</code>).
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold flex items-center justify-center text-sm shrink-0">
                    2
                  </span>
                  <h4 className="font-bold text-neutral-100 text-base">
                    Đưa mã nguồn lên GitHub (Kho lưu trữ mã nguồn miễn phí)
                  </h4>
                </div>
                <div className="text-neutral-400 text-xs pl-10 space-y-1.5">
                  <p>
                    • Truy cập <a href="https://github.com" target="_blank" rel="noreferrer" className="text-amber-400 underline font-semibold">GitHub.com</a> và đăng nhập (nếu chưa có thì đăng ký tài khoản miễn phí).
                  </p>
                  <p>
                    • Bấm vào nút <strong>New Repository</strong>, đặt tên kho (ví dụ: <code>dao-tam-truyen</code>), chọn chế độ <em>Private</em> (riêng tư) hoặc <em>Public</em> rồi nhấn <strong>Create repository</strong>.
                  </p>
                  <p>
                    • Tải mã nguồn lên bằng phần mềm trực quan <strong>GitHub Desktop</strong> (rất dễ dùng cho người không biết code) hoặc kéo thả trực tiếp các file vào GitHub.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold flex items-center justify-center text-sm shrink-0">
                    3
                  </span>
                  <h4 className="font-bold text-neutral-100 text-base">
                    Kết nối với Vercel để chạy website online
                  </h4>
                </div>
                <div className="text-neutral-400 text-xs pl-10 space-y-1.5">
                  <p>
                    • Truy cập <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-amber-400 underline font-semibold">Vercel.com</a> &rarr; Chọn <strong>Sign Up</strong> / <strong>Log In</strong> bằng tài khoản <strong>GitHub</strong> vừa tạo.
                  </p>
                  <p>
                    • Nhấp vào nút <strong>Add New... &rarr; Project</strong>.
                  </p>
                  <p>
                    • Tại danh sách Git Repositories, tìm kho <code>dao-tam-truyen</code> của bạn và bấm <strong>Import</strong>.
                  </p>
                  <p>
                    • Vercel sẽ tự động nhận diện dự án là <strong>Vite</strong> với Build Command là <code>npm run build</code> và Output Directory là <code>dist</code>. Bạn chỉ cần nhấn nút <strong>Deploy</strong> màu xanh.
                  </p>
                  <p>
                    • Trong 1 phút, Vercel sẽ cung cấp tên miền trực tiếp miễn phí (ví dụ: <code>dao-tam-truyen.vercel.app</code>).
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-5 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-emerald-500 text-stone-950 font-bold flex items-center justify-center text-sm shrink-0">
                    4
                  </span>
                  <h4 className="font-bold text-neutral-100 text-base">
                    Thêm tên miền Vercel vào Firebase Console (Để đăng nhập Google hoạt động)
                  </h4>
                </div>
                <div className="text-neutral-400 text-xs pl-10 space-y-1.5">
                  <p>
                    • Truy cập <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold">Firebase Console</a> &rarr; Chọn dự án Firebase của bạn.
                  </p>
                  <p>
                    • Vào mục <strong>Authentication &rarr; Settings &rarr; Authorized domains</strong>.
                  </p>
                  <p>
                    • Bấm <strong>Add domain</strong> và dán tên miền Vercel của bạn vào (ví dụ: <code>dao-tam-truyen.vercel.app</code>) &rarr; Bấm <strong>Save</strong>.
                  </p>
                  <p className="text-emerald-400 font-semibold pt-1">
                    🎉 Hoàn tất! Giờ đây bất kỳ độc giả nào cũng có thể truy cập website, đăng nhập bằng Google, mua chương VIP và Quản trị viên có thể đăng nhập bằng tài khoản Admin để toàn quyền quản trị!
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <h3 className="font-serif text-lg font-bold text-amber-300">
                Chi Tiết Giải Pháp Chống Sao Chép, Chụp Ảnh &amp; Tải Truyện (DRM)
              </h3>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800">
                  <h4 className="font-bold text-amber-400 mb-1">
                    1. Vô hiệu hóa tính năng Copy &amp; Chuột phải:
                  </h4>
                  <p className="text-xs text-neutral-400">
                    Áp dụng CSS <code>user-select: none</code> và chặn sự kiện <code>contextmenu</code>, <code>selectstart</code>. Độc giả không thể quét chuột bôi đen hoặc bấm chuột phải để "Copy".
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800">
                  <h4 className="font-bold text-amber-400 mb-1">
                    2. Chặn toàn bộ phím tắt in ấn và lưu trang:
                  </h4>
                  <p className="text-xs text-neutral-400">
                    Chặn <code>Ctrl + S</code> (Save page), <code>Ctrl + P</code> (Print), <code>Ctrl + U</code> (Xem mã nguồn), <code>F12</code> / <code>Ctrl + Shift + I</code> (Mở DevTools kiểm tra phần tử).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800">
                  <h4 className="font-bold text-amber-400 mb-1">
                    3. Hình mờ pháp lý động (Forensic Dynamic Watermark):
                  </h4>
                  <p className="text-xs text-neutral-400">
                    Trên nền trang đọc truyện sẽ có các dòng chữ chìm mờ hiển thị <strong>User ID, Email và Thời Gian</strong> của người đang đăng nhập. Kẻ trộm truyện nếu chụp ảnh màn hình bằng điện thoại hay máy tính đều bị in dấu thông tin cá nhân lên bản chụp, dễ dàng bị truy tìm và khóa vĩnh viễn tài khoản.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800">
                  <h4 className="font-bold text-amber-400 mb-1">
                    4. Bảo vệ chống in ấn (@media print):
                  </h4>
                  <p className="text-xs text-neutral-400">
                    Khi người dùng cố tình dùng lệnh in của hệ thống để xuất file PDF, toàn bộ nội dung chương sẽ tự động biến mất và chỉ hiển thị trang trắng có cảnh báo vi phạm bản quyền.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'source' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <h3 className="font-serif text-lg font-bold text-amber-300">
                Các Tệp Cấu Hình Nguyên Khối Độc Lập
              </h3>
              <p className="text-xs text-neutral-400">
                Dưới đây là nội dung quy tắc an ninh Firestore Security Rules đảm bảo người dùng không thể hack Xu hay xem trộm chương VIP từ API.
              </p>

              <div className="relative p-4 rounded-xl bg-[#090a0f] border border-neutral-800 font-mono text-xs text-neutral-300">
                <button
                  onClick={() =>
                    handleCopyText(
                      `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow update: if false; // Only cloud function/admin can update balance
    }
    match /novels/{novelId}/chapters/{chapterId} {
      allow read: if resource.data.isVip == false || 
        request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)/unlocked/$(chapterId));
    }
  }`,
                      'rules'
                    )
                  }
                  className="absolute top-3 right-3 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs flex items-center gap-1 cursor-pointer"
                >
                  {copiedSection === 'rules' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Sao chép
                </button>
                <pre>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow update: if false; // Chỉ Admin/Backend mới được cộng Xu
    }
    match /novels/{novelId}/chapters/{chapterId} {
      allow read: if resource.data.isVip == false || 
        request.auth != null && exists(/databases/$(database)/documents/users/$(request.auth.uid)/unlocked/$(chapterId));
    }
  }
}`}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
