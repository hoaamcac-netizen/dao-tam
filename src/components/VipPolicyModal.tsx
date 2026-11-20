import React from 'react';
import { 
  X, 
  ShieldCheck, 
  Sparkles, 
  Coins, 
  BookOpen, 
  CheckCircle2, 
  AlertTriangle, 
  Percent, 
  Calendar, 
  Scale, 
  FileCheck,
  Award
} from 'lucide-react';
import { DaoTamLogo } from './DaoTamLogo';

interface VipPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VipPolicyModal: React.FC<VipPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-4xl bg-[#0b0f19] border border-blue-500/40 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200 text-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#0e1424] border-b border-blue-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DaoTamLogo size="sm" showText={false} />
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Chính Sách Đăng Truyện &amp; Quy Chuẩn VIP Đạo Tâm
              </h2>
              <p className="text-xs text-sky-400/90 font-medium">
                Quy chuẩn bản quyền, thuật toán Set VIP tự động và cơ chế nhuận bút theo tiêu chuẩn nền tảng truyện Việt Nam
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs leading-relaxed bg-[#07090e]">
          {/* Quick Notice Banner */}
          <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-500/40 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-sky-300 mb-1">
                Nguyên tắc cốt lõi: Tự động hóa - Công bằng cho Độc Giả - Minh bạch cho Tác Giả &amp; Editor
              </h4>
              <p className="text-slate-300 text-xs">
                Hệ thống <strong>Đạo Tâm</strong> tự động tính toán ngưỡng VIP cho từng tác phẩm theo cấu trúc chương. Tác giả/Editor không cần chỉnh sửa từng chương lẻ. Độc giả được hưởng trọn cơ chế khấu trừ chiết khấu thông minh khi mua combo.
              </p>
            </div>
          </div>

          {/* Grid 4 Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#0e1424] border border-blue-900/60 flex flex-col justify-between">
              <div className="text-sky-400 font-bold mb-1 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-sky-400" />
                <span>Truyện Dài (&ge; 200 c)</span>
              </div>
              <div className="text-xl font-black text-white my-1 font-serif">VIP từ c51</div>
              <div className="text-[11px] text-slate-400">50 chương đầu miễn phí tuyệt đối để gây dựng lượng độc giả trung thành.</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0e1424] border border-blue-900/60 flex flex-col justify-between">
              <div className="text-sky-400 font-bold mb-1 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-sky-400" />
                <span>Truyện Ngắn (&lt; 200 c)</span>
              </div>
              <div className="text-xl font-black text-white my-1 font-serif">VIP từ c31</div>
              <div className="text-[11px] text-slate-400">30 chương đầu miễn phí tiếp cận, bắt đầu thu phí từ chương 31 trở đi.</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0e1424] border border-blue-900/60 flex flex-col justify-between">
              <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1.5">
                <Percent className="w-4 h-4 text-emerald-400" />
                <span>Nhuận Bút Tác Giả &amp; Editor</span>
              </div>
              <div className="text-lg font-black text-emerald-300 my-1 font-serif">
                TG 95% • ĐQ 90% • Edit 70%
              </div>
              <div className="text-[11px] text-slate-400">
                Tỷ lệ chia sẻ tối đa cho người viết/dịch; nền tảng chỉ giữ 5% - 30% để duy trì hệ thống và quảng bá truyện.
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0e1424] border border-blue-900/60 flex flex-col justify-between">
              <div className="text-cyan-400 font-bold mb-1 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-cyan-400" />
                <span>Khấu Trừ Thông Minh</span>
              </div>
              <div className="text-xl font-black text-cyan-300 my-1 font-serif">-100% Xu Đã Mua</div>
              <div className="text-[11px] text-slate-400">Mua Combo trọn bộ tự động trừ toàn bộ Xu các chương lẻ bạn đọc đã mở trước.</div>
            </div>
          </div>

          {/* Section 1: Tiêu Chuẩn Phân Loại & Đặt VIP */}
          <div className="p-5 rounded-xl bg-[#0d1220] border border-slate-800 space-y-3">
            <h3 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <BookOpen className="w-4 h-4 text-sky-400" />
              1. Quy Chuẩn Đặt Chương VIP Tự Động (Auto-VIP Thresholds)
            </h3>
            <div className="space-y-2 text-slate-300 text-xs">
              <p>
                Tham chiếu theo quy chế chuẩn của các cổng truyện uy tín hàng đầu Việt Nam (Truyện Full, Mê Truyện Chữ, Bạch Ngọc Sách, Tàng Thư Viện):
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                <li>
                  <strong className="text-white">Truyện Dài (Tổng số chương từ 200 chương trở lên):</strong> Bắt buộc miễn phí hoàn toàn <strong>50 chương đầu tiên</strong> để độc giả làm quen văn phong và bối cảnh truyện. Hệ thống sẽ tự động thiết lập VIP từ <strong>Chương 51</strong> trở đi với mức giá niêm yết 5 Xu/chương.
                </li>
                <li>
                  <strong className="text-white">Truyện Ngắn (Tổng số chương dưới 200 chương):</strong> Miễn phí <strong>30 chương đầu tiên</strong>. Hệ thống tự động thiết lập VIP từ <strong>Chương 31</strong> trở đi với mức giá niêm yết 5 Xu/chương.
                </li>
                <li>
                  <strong className="text-white">Cơ chế tự động:</strong> Tác giả và Editor không phải tự gắn thẻ VIP cho từng chương. Chỉ cần thiết lập tổng số chương dự kiến, máy chủ sẽ tự động áp dụng công thức để bảo đảm quyền lợi bình đẳng giữa các tác phẩm.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 2: Tiêu Chuẩn Độ Dài & Chống Cắt Vụn Chương */}
          <div className="p-5 rounded-xl bg-[#0d1220] border border-slate-800 space-y-3">
            <h3 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <FileCheck className="w-4 h-4 text-sky-400" />
              2. Tiêu Chuẩn Chất Lượng &amp; Độ Dài Tối Thiểu Chương VIP
            </h3>
            <div className="space-y-2 text-slate-300 text-xs">
              <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                <li>
                  <strong className="text-white">Định mức độ dài:</strong> Mỗi chương thu phí VIP phải đạt tối thiểu từ <strong>2.000 đến 3.500 từ</strong> (đối với truyện chữ). Chương văn phong mượt mà, định dạng ngắt đoạn chuẩn theo tiếng Việt.
                </li>
                <li>
                  <strong className="text-white">Nghiêm cấm xé vụn chương:</strong> Tuyệt đối cấm hành vi chia nhỏ 1 chương gốc thành nhiều đoạn dưới 1.000 từ để vòi thêm Xu từ độc giả. Các tác phẩm bị phát hiện cố tình cắt vụn chương sẽ bị đình chỉ tư cách thu phí VIP.
                </li>
                <li>
                  <strong className="text-white">Bảo đảm thuần phong mỹ tục &amp; Bản quyền:</strong> Không vi phạm pháp luật hiện hành, cấm chèn liên kết độc hại, quảng cáo rác hay ký tự làm loãng nội dung.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 3: Nền Kinh Tế & Khấu Trừ Combo Trọn Bộ */}
          <div className="p-5 rounded-xl bg-[#0d1220] border border-slate-800 space-y-3">
            <h3 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <Coins className="w-4 h-4 text-sky-400" />
              3. Cơ Chế Khấu Trừ Xu Khi Mua Combo Trọn Bộ (Smart Pricing)
            </h3>
            <div className="space-y-2 text-slate-300 text-xs">
              <p>
                Để tôn trọng quyền lợi độc giả và kích cầu đọc truyện, Đạo Tâm áp dụng thuật toán mua Combo tối ưu:
              </p>
              <div className="p-3 bg-[#131b2e] rounded-xl border border-blue-500/30 text-sky-200">
                <span className="font-bold">Công thức tính giá Combo:</span>
                <div className="font-mono text-xs text-white mt-1 bg-black/40 p-2 rounded-lg">
                  Giá_Thanh_Toán = MAX(0, Giá_Combo_Ưu_Đãi - Tổng_Xu_Các_Chương_Lẻ_Đã_Mua_Trước_Đó)
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Ví dụ: Truyện có giá mua trọn bộ là 85 Xu (tiết kiệm 30% so với mua lẻ). Nếu độc giả đã mở 5 chương lẻ (mỗi chương 5 Xu = 25 Xu), khi bấm &quot;Mua Trọn Bộ&quot; hệ thống chỉ thu <strong>60 Xu</strong> (85 - 25), mở khóa vĩnh viễn toàn bộ các chương còn lại!
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Nhuận Bút & Rút Tiền Cho Tác Giả/Editor */}
          <div className="p-5 rounded-xl bg-[#0d1220] border border-slate-800 space-y-3">
            <h3 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <Award className="w-4 h-4 text-emerald-400" />
              4. Nhuận Bút Tác Giả, Editor &amp; Tỷ Lệ Chia Sẻ Doanh Thu (Tối Ưu Blogger $0)
            </h3>
            <div className="space-y-2 text-slate-300 text-xs">
              <p className="text-slate-400 italic">
                * Nhờ hệ thống vận hành hoàn toàn trên nền tảng <strong>Google Blogger (Blogspot)</strong> miễn phí $0 tiền hosting/VPS (không dùng WordPress đắt đỏ tốn kém), Đạo Tâm cam kết chi trả tỷ lệ doanh thu cao nhất cho đội ngũ sáng tác và biên dịch:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-slate-300">
                <li>
                  <strong className="text-emerald-300 text-sm">Tác giả sáng tác chính chủ:</strong> Hưởng <strong className="text-white text-sm bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">95%</strong> tổng doanh thu mở khóa chương VIP từ bạn đọc. Nền tảng chỉ giữ <strong>5%</strong> để duy trì vận hành kỹ thuật.
                </li>
                <li>
                  <strong className="text-sky-300 text-sm">Editor đăng truyện độc quyền:</strong> Tác phẩm cam kết phát hành độc quyền tại Đạo Tâm được hưởng <strong className="text-white text-sm bg-sky-950/80 px-2 py-0.5 rounded border border-sky-500/40">90%</strong> tổng doanh thu mở khóa chương VIP (nền tảng giữ <strong>10%</strong>).
                </li>
                <li>
                  <strong className="text-indigo-300 text-sm">Editor đăng truyện không độc quyền:</strong> Hưởng <strong className="text-white text-sm bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-500/40">70%</strong> tổng doanh thu mở khóa chương VIP (nền tảng giữ <strong>30%</strong>).
                </li>
                <li>
                  <strong className="text-white">Không tốn chi phí rườm rà:</strong> Khác với WordPress đòi hỏi thuê máy chủ hosting tiền triệu mỗi tháng, chủ trang Blogger không tốn bất kỳ chi phí duy trì nào nên toàn bộ tiền bán chương VIP đều được chuyển trực tiếp vào túi tác giả và editor.
                </li>
                <li>
                  <strong className="text-white">Chu kỳ quyết toán &amp; Rút tiền:</strong> Nhuận bút được tổng kết tự động vào cuối tháng và chi trả từ <strong>ngày 1 đến ngày 5 hàng tháng</strong> trực tiếp qua STK Ngân Hàng hoặc Ví MoMo khi số dư đạt tối thiểu 200.000 VNĐ.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 5: Thẩm Định 5 Chương & Chống Bỏ Hố */}
          <div className="p-5 rounded-xl bg-[#0d1220] border border-slate-800 space-y-3">
            <h3 className="font-serif text-sm sm:text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              5. Quy Trình Thẩm Định 5 Chương &amp; Cam Kết Tiến Độ Ra Chương
            </h3>
            <div className="space-y-2 text-slate-300 text-xs">
              <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
                <li>
                  <strong className="text-white">Thẩm định 5 chương đầu:</strong> Tác giả/Editor bắt buộc gửi bản thảo gồm 5 chương hoàn chỉnh để Ban Biên Tập kiểm duyệt trước khi được duyệt đăng. Quá trình kiểm duyệt diễn ra trong vòng 24 giờ.
                </li>
                <li>
                  <strong className="text-white">Duy trì tiến độ:</strong> Tác phẩm đã mở thu phí VIP bắt buộc phải duy trì tối thiểu <strong>3 đến 7 chương mới mỗi tuần</strong>.
                </li>
                <li>
                  <strong className="text-white">Quy chế chống bỏ dở (Drop/Hiatus):</strong> Nghiêm cấm tác giả đột ngột dừng ra chương quá 30 ngày mà không có lý do chính đáng thông báo trước. Nếu truyện bị bỏ rơi khi đang thu phí VIP, Ban Quản Trị có quyền mở khóa đọc miễn phí toàn bộ hoặc hoàn lại Xu cho độc giả.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#0e1424] border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Tiêu chuẩn áp dụng toàn diện trên hệ thống Đạo Tâm</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md shadow-blue-600/30 cursor-pointer"
          >
            Đã Hiểu &amp; Đồng Ý
          </button>
        </div>
      </div>
    </div>
  );
};
