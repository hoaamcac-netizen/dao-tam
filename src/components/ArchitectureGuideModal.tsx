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
                      Kiến Trúc Máy Chủ Hiện Đại — Tối Ưu Chi Phí $0 Vận Hành
                    </h4>
                    <p className="text-xs text-neutral-300">
                      Hệ thống vận hành trên nền tảng <strong>Máy chủ Đám mây + Hệ thống Đọc Audio Tốc độ Cao</strong>. Toàn bộ logic khóa VIP, trừ Xu và chia nhuận bút được bảo mật trên máy chủ an toàn, cho phép chi trả tỷ lệ doanh thu kỷ lục cho nhà sáng tạo: <strong>Tác giả 98%</strong>, <strong>Độc quyền 95%</strong>, <strong>Editor 90%</strong>!
                    </p>
                  </div>
                </div>
              </div>

              {/* Stack items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Cpu className="w-4 h-4" /> Giao Diện Web Tốc Độ Cao
                  </div>
                  <p className="text-xs text-neutral-400">
                    Ứng dụng web đơn trang (SPA) hiển thị tức thì, hỗ trợ mượt mà trên iPhone, iPad và điện thoại Android. Không cần bảo trì máy chủ thủ công.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Sparkles className="w-4 h-4" /> Trình Đọc Audio &amp; Kho Âm Thanh MP3
                  </div>
                  <p className="text-xs text-neutral-400">
                    Kết hợp máy chủ âm thanh giọng đọc tự nhiên cùng kho âm thanh MP3 phát nền ổn định, tối ưu trải nghiệm nghe xuyên suốt kể cả khi tắt màn hình điện thoại.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Database className="w-4 h-4" /> Cơ Sở Dữ Liệu &amp; Xác Thực Đám Mây
                  </div>
                  <p className="text-xs text-neutral-400">
                    Lưu trữ dữ liệu theo thời gian thực với khả năng đồng bộ ví Xu, chương đã mua và tiến trình đọc giữa điện thoại và máy tính hoàn toàn tự động.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <Rocket className="w-4 h-4" /> Hạ Tầng Máy Chủ Triển Khai Toàn Cầu
                  </div>
                  <p className="text-xs text-neutral-400">
                    Băng thông rộng, chứng chỉ bảo mật SSL (https://) miễn phí vĩnh viễn, tự động chịu tải khi có hàng nghìn người cùng đọc và nghe truyện.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'deployment' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div>
                <h3 className="font-serif text-lg font-bold text-amber-300">
                  Hướng Dẫn Xuất Mã Nguồn &amp; Triển Khai Lên Máy Chủ Đám Mây
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
                    Tải (Export) toàn bộ mã nguồn về máy tính
                  </h4>
                </div>
                <div className="text-neutral-400 text-xs pl-10 space-y-1.5">
                  <p>
                    • Tải gói mã nguồn dạng ZIP từ bảng quản trị dự án về máy tính của bạn.
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
                    Đưa mã nguồn lên kho lưu trữ trực tuyến
                  </h4>
                </div>
                <div className="text-neutral-400 text-xs pl-10 space-y-1.5">
                  <p>
                    • Tạo một kho lưu trữ mã nguồn trực tuyến (chế độ <em>Private</em> hoặc <em>Public</em>).
                  </p>
                  <p>
                    • Tải toàn bộ thư mục mã nguồn vừa giải nén lên kho lưu trữ để sẵn sàng đồng bộ tự động mỗi khi cập nhật.
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
                    Kết nối với máy chủ triển khai để chạy website online
                  </h4>
                </div>
                <div className="text-neutral-400 text-xs pl-10 space-y-1.5">
                  <p>
                    • Kết nối kho mã nguồn với nhà cung cấp máy chủ web tĩnh/đám mây và chọn <strong>Import</strong>.
                  </p>
                  <p>
                    • Thiết lập lệnh dựng là <code>npm run build</code> và thư mục xuất là <code>dist</code>, sau đó bấm <strong>Deploy</strong>.
                  </p>
                  <p>
                    • Sau khoảng 1 phút, máy chủ sẽ cung cấp địa chỉ truy cập trực tuyến có sẵn HTTPS.
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
                    Cấp phép tên miền trong bảng điều khiển xác thực hệ thống
                  </h4>
                </div>
                <div className="text-neutral-400 text-xs pl-10 space-y-1.5">
                  <p>
                    • Mở mục <strong>Xác thực (Authentication) &rarr; Cài đặt &rarr; Tên miền được cấp phép</strong> trong trang quản trị hệ thống.
                  </p>
                  <p>
                    • Thêm tên miền trang web của bạn vào danh sách cho phép và bấm <strong>Lưu</strong>.
                  </p>
                  <p className="text-emerald-400 font-semibold pt-1">
                    🎉 Hoàn tất! Giờ đây bất kỳ độc giả nào cũng có thể truy cập website, đăng nhập bằng Google, mua chương VIP và Quản trị viên có thể toàn quyền quản trị!
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
                Quy Tắc An Ninh Cơ Sở Dữ Liệu
              </h3>
              <p className="text-xs text-neutral-400">
                Dưới đây là tóm tắt các nguyên tắc phân quyền bảo mật cơ sở dữ liệu nhằm đảm bảo người dùng không thể tự thay đổi số dư Xu hay truy cập trái phép chương VIP từ API.
              </p>

              <div className="relative p-4 rounded-xl bg-[#090a0f] border border-neutral-800 font-mono text-xs text-neutral-300">
                <button
                  onClick={() =>
                    handleCopyText(
                      `// Quy tắc phân quyền truy cập cơ sở dữ liệu
match /users/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow update: if false; // Chỉ Quản trị viên / Hệ thống mới được cập nhật số dư Xu
}
match /novels/{novelId}/chapters/{chapterId} {
  allow read: if resource.data.isVip == false ||
    (request.auth != null && isChapterUnlocked(request.auth.uid, chapterId));
}`,
                      'rules'
                    )
                  }
                  className="absolute top-3 right-3 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs flex items-center gap-1 cursor-pointer"
                >
                  {copiedSection === 'rules' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Sao chép
                </button>
                <pre>{`// Quy tắc phân quyền truy cập cơ sở dữ liệu
match /users/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow update: if false; // Chỉ Quản trị viên / Hệ thống mới được cập nhật số dư Xu
}
match /novels/{novelId}/chapters/{chapterId} {
  allow read: if resource.data.isVip == false ||
    (request.auth != null && isChapterUnlocked(request.auth.uid, chapterId));
}`}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
