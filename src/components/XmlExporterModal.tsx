import React, { useState, useMemo } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  FileCode2, 
  Settings, 
  BookOpen, 
  HelpCircle, 
  Sparkles,
  ShieldAlert,
  Search,
  ExternalLink
} from 'lucide-react';
import { generateBloggerXml, BloggerXmlOptions } from '../utils/bloggerXmlGenerator';

interface XmlExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const XmlExporterModal: React.FC<XmlExporterModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'guide' | 'posting' | 'config'>('code');
  const [copied, setCopied] = useState(false);
  const [xmlSearch, setXmlSearch] = useState('');
  
  // Customizable options
  const [blogName, setBlogName] = useState('Đạo Tâm');
  const [firebaseApiKey, setFirebaseApiKey] = useState('AIzaSyDemoKeyBloggerThemeDaoTam123');
  const [firebaseProjectId, setFirebaseProjectId] = useState('dao-tam');

  const xmlContent = useMemo(() => {
    return generateBloggerXml({
      blogName,
      firebaseApiKey,
      firebaseProjectId,
      firebaseAuthDomain: `${firebaseProjectId}.firebaseapp.com`,
      firebaseStorageBucket: `${firebaseProjectId}.appspot.com`,
    });
  }, [blogName, firebaseApiKey, firebaseProjectId]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(xmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theme-dam-mong-cac-blogger.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalLines = xmlContent ? (xmlContent.split('\n')?.length || 0) : 0;
  const fileSizeKb = (new Blob([xmlContent || '']).size / 1024).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-5xl bg-[#121319] border border-amber-500/40 rounded-2xl shadow-2xl shadow-black/90 flex flex-col h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="px-6 py-4 bg-[#171822] border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 shadow-md">
              <div className="w-full h-full bg-[#12131a] rounded-[10px] flex items-center justify-center text-amber-400">
                <FileCode2 className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-amber-300 flex items-center gap-2">
                Mã Nguồn Theme Blogger XML Nguyên Khối
                <span className="text-xs font-sans font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  100% Hoàn Thiện
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                {blogName} • Đọc truyện chữ &amp; Audio • Không đề xuất truyện • Lưu tiến trình đọc tài khoản
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleCopy}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-lg transition-all cursor-pointer ${
                copied
                  ? 'bg-emerald-500 text-stone-950 shadow-emerald-500/30'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 shadow-amber-500/20 hover:scale-102'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Đã Sao Chép Toàn Bộ!' : 'Sao Chép Toàn Bộ XML'}
            </button>

            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-xl bg-[#222430] hover:bg-[#2c2e3e] text-neutral-200 hover:text-amber-300 border border-neutral-700 hover:border-amber-500/40 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-amber-400" />
              Tải File .XML ({fileSizeKb} KB)
            </button>

            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 bg-[#151620] border-b border-neutral-800 text-xs sm:text-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('code')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'code'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FileCode2 className="w-4 h-4" />
            Xem Mã Nguồn XML ({totalLines} dòng)
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'guide'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Hướng Dẫn Cài Đặt (3 Bước)
          </button>
          <button
            onClick={() => setActiveTab('posting')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'posting'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Quy Cách Đăng Bài &amp; Audio
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'config'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            Tùy Chỉnh Tên &amp; Firebase
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0e0f14]">
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs text-neutral-400">
                  Tệp XML hoàn chỉnh từ thẻ <code className="text-amber-400">&lt;?xml ...&gt;</code> đến <code className="text-amber-400">&lt;/html&gt;</code>. Không cần chắp vá thêm bất kỳ file CSS hay JS ngoài nào!
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={xmlSearch}
                    onChange={(e) => setXmlSearch(e.target.value)}
                    placeholder="Tìm từ khóa trong code..."
                    className="bg-[#191a24] border border-neutral-800 text-xs text-neutral-200 rounded-lg py-1.5 pl-3 pr-8 w-56 focus:outline-none focus:border-amber-500"
                  />
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Code viewer box */}
              <div className="relative rounded-xl border border-neutral-800 bg-[#0a0b0f] p-4 font-mono text-xs text-neutral-300 overflow-x-auto max-h-[56vh] select-all leading-relaxed scrollbar-thin">
                <pre className="whitespace-pre">
                  {xmlContent}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="max-w-3xl mx-auto space-y-6 text-sm text-neutral-300">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <h4 className="font-bold text-emerald-300 text-sm">
                    100% Miễn Phí Trên Google Blogger ($0 Chi Phí) — Tuyệt Đối Không Cần WordPress Tốn Tiền!
                  </h4>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Theme được kiến trúc độc lập, tối ưu hóa riêng cho <strong>Google Blogger (Blogspot)</strong>. Bạn <strong>không cần tốn tiền thuê hosting, mua VPS hay trả phí plugin WordPress hàng tháng</strong>. Mọi tính năng từ đọc truyện chữ, audio đa giọng đọc, mục lục chi tiết, bảo mật DRM đến quy chuẩn VIP đều vận hành trơn tru $0.
                  </p>
                  <div className="pt-1.5 flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40">
                      ✍️ Tác giả: 98%
                    </span>
                    <span className="bg-sky-950/80 text-sky-300 px-2 py-0.5 rounded border border-sky-500/40">
                      ⭐ Độc quyền: 95%
                    </span>
                    <span className="bg-indigo-950/80 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/40">
                      ✂️ Editor: 90%
                    </span>
                    <span className="bg-neutral-800 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                      Tiết kiệm 100% tiền Host WordPress
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-xl bg-[#171822] border border-neutral-800">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold flex items-center justify-center text-sm">
                      1
                    </span>
                    <h3 className="font-bold text-neutral-100 text-base">
                      Đăng nhập Blogger &amp; Vào trang quản trị
                    </h3>
                  </div>
                  <p className="text-neutral-400 text-xs sm:text-sm pl-10">
                    Truy cập vào <a href="https://www.blogger.com" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">Blogger.com</a> và chọn Blog <strong className="text-white">{blogName}</strong> của bạn.
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-[#171822] border border-neutral-800">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold flex items-center justify-center text-sm">
                      2
                    </span>
                    <h3 className="font-bold text-neutral-100 text-base">
                      Mở giao diện Chỉnh sửa HTML (Edit HTML)
                    </h3>
                  </div>
                  <p className="text-neutral-400 text-xs sm:text-sm pl-10 mb-2">
                    Ở thanh menu bên trái, nhấp vào <strong>Chủ đề (Theme)</strong>. Nhấp vào biểu tượng mũi tên xổ xuống cạnh nút <strong>Tùy chỉnh (Customize)</strong>, chọn <strong>Chỉnh sửa HTML (Edit HTML)</strong>.
                  </p>
                  <div className="pl-10 text-xs text-amber-400/90 italic">
                    *Mẹo: Bạn có thể chọn "Sao lưu" (Backup) theme cũ trước khi thay thế nếu muốn lưu trữ lại.
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-[#171822] border border-neutral-800">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold flex items-center justify-center text-sm">
                      3
                    </span>
                    <h3 className="font-bold text-neutral-100 text-base">
                      Dán toàn bộ mã XML và Bấm Lưu
                    </h3>
                  </div>
                  <p className="text-neutral-400 text-xs sm:text-sm pl-10 mb-2">
                    Nhấn tổ hợp phím <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-amber-300">Ctrl + A</kbd> (trên Mac: <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-amber-300">Cmd + A</kbd>) để bôi đen toàn bộ mã cũ, bấm <strong>Delete</strong> để xóa hết.
                  </p>
                  <p className="text-neutral-400 text-xs sm:text-sm pl-10 mb-3">
                    Bấm nút <strong>"Sao Chép Toàn Bộ XML"</strong> ở góc trên màn hình này, rồi bấm <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-amber-300">Ctrl + V</kbd> dán vào. Sau đó bấm nút biểu tượng đĩa mềm <strong>Lưu (Save)</strong> ở góc trên bên phải Blogger.
                  </p>
                  <div className="pl-10 text-xs text-emerald-400 font-semibold">
                    ✓ Hoàn tất! Trang web Đạo Tâm của bạn đã chạy ngay lập tức.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'posting' && (
            <div className="max-w-3xl mx-auto space-y-5 text-sm text-neutral-300">
              <h3 className="font-serif text-lg font-bold text-amber-300">
                Cách Đăng Bài Chuẩn Để Theme Tự Động Nhận Diện
              </h3>

              <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wide">
                  1. Cách Chèn Audio Truyện (MP3 / Audio Book)
                </h4>
                <p className="text-xs text-neutral-400">
                  Để phát file âm thanh của truyện, trong bài viết bạn chỉ cần chèn 1 thẻ audio hoặc liên kết file mp3:
                </p>
                <div className="bg-[#0b0c10] p-3 rounded-lg font-mono text-xs text-amber-300 select-all">
                  &lt;audio src="https://link-am-thanh-cua-ban.mp3"&gt;&lt;/audio&gt;
                </div>
                <p className="text-xs text-neutral-400">
                  Nếu không chèn file MP3, hệ thống sẽ <strong>tự động chuyển sang Giọng Đọc AI Tiếng Việt</strong> (Web Speech Synthesis) để độc giả bấm "Nghe Audio" vẫn nghe đọc thành tiếng bình thường!
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wide">
                  2. Cách Tạo Mục Lục Chương Chi Tiết Tự Động
                </h4>
                <p className="text-xs text-neutral-400">
                  Mục lục chương chi tiết của theme được tự động trích xuất từ các thẻ tiêu đề trong bài viết:
                </p>
                <div className="bg-[#0b0c10] p-3 rounded-lg font-mono text-xs text-amber-300 select-all">
                  &lt;h2&gt;Chương 1: Khởi đầu thế giới mới&lt;/h2&gt;
                  &lt;p&gt;Nội dung chương 1...&lt;/p&gt;

                  &lt;h2&gt;Chương 2: Cuộc hội ngộ định mệnh&lt;/h2&gt;
                  &lt;p&gt;Nội dung chương 2...&lt;/p&gt;
                </div>
                <p className="text-xs text-neutral-400">
                  Thanh tìm kiếm chương và bộ lọc khoảng chương của theme sẽ tự động phân loại để độc giả tìm kiếm cực kỳ nhanh.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#171822] border border-neutral-800 space-y-2">
                <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wide">
                  3. Đảm Bảo Tuyệt Đối Không Có Phần Đề Xuất Truyện
                </h4>
                <p className="text-xs text-neutral-400">
                  Theme này đã được lập trình gỡ bỏ hoàn toàn mọi tiện ích Related Posts, Popular Posts, Độc Giả Đề Cử, hoặc Đề Xuất Truyện theo đúng yêu cầu nghiêm ngặt của bạn.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="max-w-2xl mx-auto space-y-5 text-sm text-neutral-300">
              <h3 className="font-serif text-lg font-bold text-amber-300">
                Tùy Chỉnh Thông Tin Theme &amp; Firebase Đồng Bộ
              </h3>
              <p className="text-xs text-neutral-400">
                Bạn có thể đổi tên trang web hoặc điền thông tin dự án Firebase của bạn vào đây. Mã nguồn XML bên tab "Xem Mã Nguồn" sẽ tự động được cập nhật tương ứng theo thời gian thực!
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Tên Web Truyện:
                  </label>
                  <input
                    type="text"
                    value={blogName}
                    onChange={(e) => setBlogName(e.target.value)}
                    className="w-full bg-[#181924] border border-neutral-800 focus:border-amber-500 rounded-lg p-2.5 text-xs text-neutral-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Firebase API Key (Tùy chọn - Dùng cho đồng bộ đám mây qua tài khoản Google):
                  </label>
                  <input
                    type="text"
                    value={firebaseApiKey}
                    onChange={(e) => setFirebaseApiKey(e.target.value)}
                    className="w-full bg-[#181924] border border-neutral-800 focus:border-amber-500 rounded-lg p-2.5 text-xs text-neutral-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Firebase Project ID:
                  </label>
                  <input
                    type="text"
                    value={firebaseProjectId}
                    onChange={(e) => setFirebaseProjectId(e.target.value)}
                    className="w-full bg-[#181924] border border-neutral-800 focus:border-amber-500 rounded-lg p-2.5 text-xs text-neutral-100 font-mono"
                  />
                </div>

                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-neutral-400">
                  💡 <em>Lưu ý: Nếu bạn không có tài khoản Firebase, theme vẫn tự động lưu tiến trình đọc trên thiết bị (LocalStorage) một cách hoàn hảo và mượt mà!</em>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
