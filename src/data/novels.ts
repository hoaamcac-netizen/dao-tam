import { Novel } from '../types';
import { calculateChapterVip } from '../utils/rulesAndVoices';
import { generateRichChapterContent } from '../utils/chapterContentGenerator';

export function generateChapters(
  novelId: string, 
  totalCount: number, 
  customFirstChapter?: string,
  sampleContentGenerator?: (n: number) => string
) {
  const chapters = [];
  const limit = Math.min(totalCount, 500);
  for (let i = 1; i <= limit; i++) {
    const { isVip, priceXu } = calculateChapterVip(i, totalCount);

    const isTstn60 = novelId === 'tstn60' || novelId.includes('trong-sinh-thap-nien-60');
    const isCaDepTrai = novelId === 'ca-dep-trai' || novelId.includes('thi-vuong') || novelId === 'cdtt';

    const defaultTitle = isCaDepTrai
      ? (
        i === 1 ? 'Chương 1: Khởi Đầu Định Mệnh Của Thị Vương'
        : i === 11 ? 'Chương 11: Học Trưởng Cơ Bắp Phát Triển'
        : i === 63 ? 'Chương 63: Hay Là Thối Giúp...'
        : i === 213 ? 'Chương 213: Đại Kết Cục - Hạnh Phúc Trọn Vẹn'
        : `Chương ${i}: Diễn biến cao trào hồi ${i}`
      )
      : isTstn60
      ? (
        i === 1 ? 'Chương 1: Trọng Sinh Thành Cô Ruột'
        : i === 2 ? 'Chương 2: Người Chồng Thợ Săn Ngoài Lạnh Trong Nóng'
        : i === 3 ? 'Chương 3: Không Gian Linh Tuyền Và Bữa Cơm Đạm Bạc'
        : i === 4 ? 'Chương 4: Mẹ Kế Đòi Tiền Cưới Và Sự Phản Kháng'
        : i === 5 ? 'Chương 5: Lên Núi Bắt Gà Rừng Đổi Lương Thực'
        : i === 30 ? 'Chương 30: Đột Phá Điểm Tích Lũy Không Gian'
        : i === 31 ? 'Chương 31: Khởi Sắc Vận Mệnh (Khởi đầu VIP truyện)'
        : i === 51 ? 'Chương 51: Trừng Trị Cực Phẩm Đại Đội Hướng Dương'
        : `Chương ${i}: Vươn Lên Làm Giàu Thập Niên 60 Hồi ${i}`
      )
      : `Chương ${i}: ${
        i === 1 ? 'Khởi đầu định mệnh và sự thức tỉnh'
        : i === 2 ? 'Cái nhà này thật sự quá nghèo'
        : i === 3 ? 'Người một nhà và tính toán tương lai'
        : i === 30 ? 'Bước ngoặt trước ngưỡng cửa số phận'
        : i === 31 ? 'Biến cố kinh hoàng (Khởi đầu VIP truyện ngắn)'
        : i === 50 ? 'Giao tranh quyết liệt tại đỉnh phong'
        : i === 51 ? 'Bí mật kinh thiên động địa (Khởi đầu VIP truyện dài)'
        : `Diễn biến gay cấn hồi mục ${i}`
      }`;

    let content = '';
    if (i === 1 && customFirstChapter) {
      content = customFirstChapter;
    } else if (sampleContentGenerator) {
      content = sampleContentGenerator(i);
    } else {
      content = generateRichChapterContent(novelId, i, defaultTitle);
    }

    chapters.push({
      id: `${novelId}-c${i}`,
      number: i,
      title: defaultTitle,
      slug: `chuong-${i}`,
      wordCount: content.split(/\s+/).filter(Boolean).length || 1800 + ((i * 37) % 600),
      publishedDate: '2026-11-04',
      isVip,
      priceXu,
      content,
    });
  }
  return chapters;
}

export const CHAPTER_1_TSTN60_FULL = `Cô trọng sinh rồi.

Lý Mạt có chút không dám tin, trừng lớn hai mắt nghiêng đầu nhìn bức tường đất màu vàng sậm cách mình chưa tới mười phân, tầm mắt cô dời lên trên là những lớp ngói xám đen được xếp ngay ngắn.

Chiếc giường ván gỗ dưới lưng cô, chiếu cói, chiếc màn màu xám khói lộn xộn vá chằng vá đụp không biết bao nhiêu lỗ hổng, chiếc chăn lông rách nát... một căn nhà nghèo rớt mồng tơi.

Kiểu dáng bài trí này rõ ràng là gian nhà đất của đại đội Hướng Dương vào thập niên sáu mươi thế kỷ trước.

Cơn đau nhức nhối trên thái dương truyền đến khiến Lý Mạt khẽ hít một ngụm khí lạnh. Cô đưa bàn tay gầy gò, nổi đầy vết chai sạn lên xoa xoa trán, xúc cảm chân thật đến mức khiến tim cô đập thình thịch liên hồi.

Cô thực sự đã trở về rồi! Trở về năm 1968, năm cô mười tám tuổi, vừa mới bị mẹ kế và cha ruột bức ép gả thay em gái cho Cố Dã — chàng cựu quân nhân bị thương ở chân giải ngũ về làng làm thợ săn!

Kiếp trước, cô oán hận hôn sự này, nghe lời xúi giục của gã thanh niên trí thức dẻo miệng mà gom hết lương thực trong nhà bỏ trốn, kết quả bị lừa bán vào lò gạch đen, chịu đựng trăm bề tra tấn, cuối cùng chết thảm trong bão tuyết lạnh giá. Còn Cố Dã, vì đi tìm cô giữa đêm đông mà bị trượt chân rơi xuống vực sâu...

Nghĩ đến bóng lưng cao lớn thầm lặng che chở cho mình kiếp trước, khóe mắt Lý Mạt đỏ hoe, từng giọt nước mắt lăn dài trên gò má gầy guộc.

"Kiếp này, Cố Dã, em tuyệt đối sẽ không bỏ rơi anh nữa! Những kẻ đã từng hãm hại chúng ta, từng người một đều phải trả giá đắt!"

Đúng lúc này, trong đầu Lý Mạt vang lên một tiếng ngân trong trẻo. Một luồng ánh sáng mờ ảo hiện ra trong tâm thức, dẫn lối cô tiến vào một không gian rộng lớn bạt ngàn. Nơi đó có suối linh tuyền róc rách chảy, có mảnh đất màu mỡ tỏa ra hơi thở tràn đầy sinh cơ, cùng vô số gian phòng chứa đầy vật tư nhu yếu phẩm vô tận!

Không gian tùy thân kiếp trước cô tích lũy được nay cũng đã theo linh hồn cô trở về trọn vẹn!

Bên ngoài cửa ván gỗ đột nhiên vang lên tiếng bước chân tập tễnh nặng nề, kèm theo tiếng ho khẽ quen thuộc.

Két một tiếng, cánh cửa gỗ cũ kỹ được đẩy ra.

Một bóng người cao lớn, vạm vỡ bước vào. Người đàn ông mặc chiếc áo trấn thủ màu xám tro bạc màu, trên vai vác một bó củi khô cùng một con gà rừng vừa săn được trên núi tuyết về, lông vũ còn vương vài giọt sương mai đọng lại. Gương mặt anh góc cạnh, đôi mày kiếm rậm rạp, sống mũi cao thẳng, trong ánh mắt lộ ra vẻ thâm trầm từng trải của một người lính đã từng vào sinh ra tử trên chiến trường.

Nhìn thấy Lý Mạt đã tỉnh lại và đang ngồi tựa vào đầu giường nhìn mình trân trân, ánh mắt Cố Dã thoáng qua một tia kinh ngạc, nhưng rất nhanh sau đó lại trở về vẻ lạnh lùng xa cách thường ngày.

Anh khập khiễng bước đến bên bàn gỗ, đặt con gà rừng xuống, giọng nói trầm thấp vang lên phá tan bầu không khí tĩnh mịch:

"Tỉnh rồi à? Còn thấy chóng mặt không?"

Lý Mạt nhìn bờ vai vững chãi của người đàn ông trước mặt, cổ họng nghẹn đắng. Kiếp trước, chính người đàn ông thô kệch, kiệm lời này đã từng bất chấp tính mạng lội tuyết suốt ba ngày ba đêm tìm cô, để rồi bỏ mình nơi vực thẳm hoang vu. Vậy mà cô lại ngu muội nghe lời xúi bẩy của gã thanh niên trí thức dối trá, chê anh nghèo, chê anh què chân...

"Em... em không sao." Lý Mạt nghẹn ngào đáp, khóe môi khẽ run rẩy.

Cố Dã thấy hai mắt cô đỏ hoe, ngỡ rằng cô vẫn còn đang uất ức vì bị ép gả cho một người tàn tật như mình. Anh khẽ thở dài, từ trong túi áo lấy ra một củ khoai lang nướng vẫn còn âm ấm bọc trong mảnh lá chuối khô, bước lại gần mép giường đưa cho cô:

"Ăn đi cho ấm bụng. Mẹ kế cô lấy hết ba mươi đồng tiền sính lễ rồi, nhưng cô yên tâm, tôi Cố Dã đã cưới cô về thì sẽ không để cô phải nhịn đói. Nếu cô thực sự không muốn ở lại căn nhà đất rách nát này... đợi qua mùa đông tuyết tan, gom đủ tiền lộ phí, tôi sẽ làm giấy chứng nhận để cô rời đi."

Lời nói của Cố Dã vừa dứt, Lý Mạt đột nhiên vươn tay nắm chặt lấy bàn tay thô ráp đầy vết sẹo của anh.

Bàn tay cô nhỏ bé, mềm mại nhưng lại siết rất chặt, khiến thân hình cao lớn của Cố Dã bỗng chốc cứng đờ, đôi mắt đen sâu thẳm nhìn cô đầy kinh ngạc.

"Cố Dã, em không đi đâu hết!" Ánh mắt Lý Mạt kiên định chưa từng thấy, giọng nói trong trẻo nhưng rành rọt từng chữ: "Em là vợ của anh, được danh chính ngôn thuận rước về nhà họ Cố. Cả đời này em ở đây cùng anh, cùng anh gầy dựng cuộc sống, ai cũng đừng hòng chia cắt chúng ta!"

Nhìn ánh mắt rực sáng đầy chân thành của cô gái nhỏ, trái tim vốn đã nguội lạnh của Cố Dã dường như có một làn gió ấm áp thổi qua. Anh khẽ siết nhẹ bàn tay cô, khóe môi khẽ nhếch lên một nụ cười hiếm hoi:

"Được, đã là vợ của Cố Dã tôi, tôi tuyệt đối sẽ không để em phải chịu nửa phần ủy khuất."

Ngay khoảnh khắc hai bàn tay chạm nhau, Lý Mạt cảm nhận được dòng suối linh tuyền trong không gian của mình khẽ dao động, từng giọt linh dịch trong vắt tỏa ra sinh cơ dồi dào. Cô thầm hạ quyết tâm: với không gian vật tư vô tận và dòng linh tuyền thần kỳ này, cô không chỉ chữa khỏi đôi chân cho Cố Dã, mà còn cùng anh làm giàu, trừng trị những kẻ lòng lang dạ sói, viết nên một cuộc đời hạnh phúc rực rỡ nhất giữa thập niên sáu mươi gian khó này!`;

export const SAMPLE_NOVELS: Novel[] = [
  // ==================== CA ĐẸP TRAI THẾ NÀY, AI NGỜ LẠI LÀ THỊ VƯƠNG (FULL 213 CHƯƠNG) ====================
  {
    id: 'ca-dep-trai-the-nay-ai-ngo-lai-la-thi-vuong',
    title: 'Ca Đẹp Trai Thế Này, Ai Ngờ Lại Là Thị Vương',
    slug: 'ca-dep-trai-the-nay-ai-ngo-lai-la-thi-vuong',
    author: 'Thanh Lạc',
    editor: 'Mộng Mộng',
    publisherRoles: ['editor', 'author'],
    coverImage: '/assets/aistudio/ca_dep_trai_cover.png',
    mainCategory: 'dam-my',
    status: 'Hoàn thành', // Trạng thái Full bộ chuẩn xác, hiển thị huy hiệu Full xanh lá cây
    isHot: true,
    totalChapters: 213,   // Đã hoàn thành 213 chương thực tế
    latestChapterTitle: 'Chương 213: Đại Kết Cục - Hạnh Phúc Trọn Vẹn',
    latestChapterNumber: 213,
    views: 18900,
    dailyViews: 4500,
    rating: 5.0,
    categories: ['Đam Mỹ', 'Hiện Đại', 'Hài Hước', 'Ngọt Sủng', 'Trọng Sinh', 'Hào Môn Thế Gia', 'Hoàn Thành'],
    description: `Tác phẩm Đam Mỹ xuất sắc: "Ca Đẹp Trai Thế Này, Ai Ngờ Lại Là Thị Vương".
Trọn bộ 213 chương hoàn chỉnh (FULL) đã được phát hành đầy đủ trên Đạo Tâm với giọng đọc Audio AI chân thực và mục lục chi tiết. Kính mời quý độc giả cùng thưởng thức trọn vẹn câu chuyện!`,
    translator: 'Đạo Tâm Team',
    updatedAt: Date.now() - 5 * 60 * 1000,
    lastUpdated: 'Vừa xong',
    hasAudio: true,
    flowerCount: 3500,
    fullBookPriceXu: 150,
    fullBookDiscountPriceXu: 105,
    chapters: generateChapters('cdtt', 213),
  },

  // ==================== 1. TRỌNG SINH THẬP NIÊN 60 (HÌNH 1, 2 & 3) ====================
  {
    id: 'trong-sinh-thap-nien-60-nang-dau-sieu-du-dan',
    title: 'Trọng Sinh Thập Niên 60: Nàng Dâu Nhà Tôi Siêu Dữ Dằn',
    slug: 'trong-sinh-thap-nien-60-nang-dau-nha-toi-sieu-du-dan',
    author: 'Đang cập nhật',
    editor: 'Mộng Mộng',
    publisherRoles: ['editor', 'author'],
    coverImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nu',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 394,
    views: 0,
    dailyViews: 0,
    rating: 5.0,
    categories: ['Ngôn Tình', 'Hiện Đại', 'HE', 'Điền Văn', 'Ngọt', 'Sủng', 'Gia Đấu', 'Trọng Sinh', 'Niên Đại'],
    description: `Thể loại: Ngôn tình, Hiện đại, HE, Tình cảm, Làm ruộng, Ngọt văn, Trọng sinh, Tùy thân không gian, Làm giàu, Trạch đấu, Sảng văn, Thị giác nữ chủ.

"Giới thiệu nội dung:
Đời trước Lý Mạt chịu đựng đủ mọi đắng cay khổ cực, bị người nhà vắt kiệt sức lực, cuối cùng chết rũ nơi đầu đường xó chợ giữa mùa đông giá rét. 

Mở mắt ra lần nữa, cô phát hiện mình đã trọng sinh trở về thập niên 60 nghèo đói cùng cực. Lúc này cô vừa mới gả cho anh chàng thợ săn què quặt trong làng. Nhìn căn nhà đất lụp xụp nghèo rớt mồng tơi cùng người chồng ngoài lạnh trong nóng, Lý Mạt quyết tâm phát gia trí phú, trừng trị cực phẩm, mang theo không gian linh tuyền dẫn dắt cả nhà một bước lên mây!"`,
    translator: 'Mộng Mộng',
    updatedAt: Date.now() - 5 * 60 * 1000,
    lastUpdated: 'Vừa xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 180,
    fullBookDiscountPriceXu: 120,
    chapters: generateChapters(
      'tstn60',
      394,
      CHAPTER_1_TSTN60_FULL
    ),
  },

  // ==================== 2. MỆNH LỆNH ĐƯỢC ĐƯA RA NHẸ TỰA LÔNG HỒNG ====================
  {
    id: 'menh-lenh-duoc-dua-ra-nhe-tua-long-hong',
    title: 'Mệnh lệnh được đưa ra nhẹ tựa lông hồng',
    slug: 'menh-lenh-duoc-dua-ra-nhe-tua-long-hong',
    author: 'Khuyết danh',
    editor: 'Đạo Tâm Team',
    coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'dam-my',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 150,
    views: 151,
    dailyViews: 12,
    rating: 4.9,
    categories: ['Đam Mỹ', 'Hiện Đại', 'Đô Thị', 'Cường Cường', 'Ngọt Sủng'],
    description: 'Một bản quân lệnh ban xuống nhẹ như lông hồng, nhưng lại khuấy đảo cả một đời phong hoa tuyết nguyệt. Khi hai người đàn ông kiên cường nhất gặp nhau nơi chiến tuyến, tình cảm thầm kín bùng cháy vượt qua mọi rào cản thế tục.',
    translator: 'Đạo Tâm Team',
    updatedAt: Date.now() - 10 * 60 * 1000,
    lastUpdated: 'Vừa duyệt xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 110,
    fullBookDiscountPriceXu: 80,
    chapters: generateChapters('mlddr', 150),
  },

  // ==================== 3. CÔ Ả MỚI KHÔNG MẮC BẪY ĐÂU! ====================
  {
    id: 'co-a-moi-khong-mac-bay-dau',
    title: 'Cô Ả Mới Không Mắc Bẫy Đâu!',
    slug: 'co-a-moi-khong-mac-bay-dau',
    author: 'Khuyết danh',
    editor: 'Mộng Đàm Team',
    coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nu',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 120,
    views: 150,
    dailyViews: 10,
    rating: 4.8,
    categories: ['Truyện Nữ', 'Ngôn Tình', 'Hài Hước', 'Hiện Đại', 'Sủng', 'Thị Giác Nữ Chủ'],
    description: 'Bị kéo vào trò chơi cung đấu hào môn của giới thượng lưu, nữ chính tỉnh táo nhận diện mọi cạm bẫy từ trà xanh lẫn tổng tài bá đạo. Muốn gài bẫy cô? Còn non và xanh lắm!',
    translator: 'Mộng Đàm Team',
    updatedAt: Date.now() - 12 * 60 * 1000,
    lastUpdated: 'Vừa duyệt xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 95,
    fullBookDiscountPriceXu: 70,
    chapters: generateChapters('camkmbd', 120),
  },

  // ==================== 4. SÁU MƯƠI PHÚT NỮA NGÀY TẬN THẾ ====================
  {
    id: 'sau-muoi-phut-nua-ngay-tan-the',
    title: 'Sáu mươi phút nữa ngày tận thế',
    slug: 'sau-muoi-phut-nua-ngay-tan-the',
    author: 'Tận thế',
    editor: 'Chiến Thần Team',
    coverImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nam',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 180,
    views: 150,
    dailyViews: 10,
    rating: 4.9,
    categories: ['Truyện Nam', 'Mạt Thế', 'Hệ Thống', 'Dị Năng', 'Hành Động'],
    description: 'Chỉ còn đúng sáu mươi phút nữa là thảm họa toàn cầu ập đến. Nhân vật chính thức tỉnh hệ thống kiến tạo pháo đài sinh tồn, bắt đầu cuộc đua nghẹt thở từng giây từng phút với tử thần!',
    translator: 'Chiến Thần Team',
    updatedAt: Date.now() - 15 * 60 * 1000,
    lastUpdated: 'Vừa duyệt xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 125,
    fullBookDiscountPriceXu: 90,
    chapters: generateChapters('smpntt', 180),
  },

  // ==================== 5. KẸO MÚT ====================
  {
    id: 'keo-mut',
    title: 'Kẹo Mút',
    slug: 'keo-mut',
    author: 'Kẹo Mút',
    editor: 'Hương Mộng Các',
    coverImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'dam-my',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 95,
    views: 150,
    dailyViews: 10,
    rating: 5.0,
    categories: ['Đam Mỹ', 'Ngọt Sủng', 'Thanh Xuân Vườn Trường', 'Đô Thị', 'Chữa Lành'],
    description: 'Một câu chuyện thanh xuân vườn trường ngọt ngào như viên kẹo mút dâu tây. Tình cảm ấm áp, dịu dàng giữa hai chàng trai cùng nhau vượt qua những năm tháng niên thiếu đẹp đẽ nhất.',
    translator: 'Hương Mộng Các',
    updatedAt: Date.now() - 20 * 60 * 1000,
    lastUpdated: 'Vừa duyệt xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 80,
    fullBookDiscountPriceXu: 60,
    chapters: generateChapters('keomut', 95),
  },

  // ==================== 6. NGHE LÉN TIẾNG LÒNG NÀNG ====================
  {
    id: 'nghe-len-tieng-long-nang-binh-dao',
    title: 'Nghe Lén Tiếng Lòng Nàng, Binh Đao Bất Bại',
    slug: 'nghe-len-tieng-long-nang-binh-dao',
    author: 'Đang cập nhật',
    editor: 'Yên Vũ Các',
    coverImage: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nu',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 279,
    views: 6,
    dailyViews: 2,
    rating: 4.9,
    categories: ['Truyện Nữ', 'Cổ Đại', 'Độc Tâm', 'Cung Đấu', 'Hài Hước', 'Trọng Sinh'],
    description: 'Nữ chính xuyên thành một tiểu phi tần vô danh, mỗi ngày chỉ muốn an phận ăn dưa hóng hớt. Nào ngờ bạo quân lại nghe lén được toàn bộ tiếng lòng của nàng, từ đó triều đình nổi sóng, đánh đâu thắng đó!',
    translator: 'Yên Vũ Các',
    updatedAt: Date.now() - 30 * 60 * 1000,
    lastUpdated: 'Vừa xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 165,
    fullBookDiscountPriceXu: 115,
    chapters: generateChapters('nltln', 279),
  },

  // ==================== 7. GHÂ ====================
  {
    id: 'gha-tieu-thuyet',
    title: 'ghâ',
    slug: 'gha-tieu-thuyet',
    author: 'Huyền Mộng Phong',
    editor: 'Huyền Mộng Phong',
    coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'dam-my',
    status: 'Hoàn thành',
    isHot: false,
    totalChapters: 60,
    views: 3,
    dailyViews: 1,
    rating: 4.8,
    categories: ['Đam Mỹ', 'Huyền Huyễn', 'Tu Tiên', 'Đoản Văn'],
    description: 'Một đoản văn sâu lắng về tình duyên tam sinh tam thế nơi cửu trùng thiên giới. Tình cảm đan xen giữa yêu và hận, kết thúc viên mãn sưởi ấm lòng người.',
    translator: 'Huyền Mộng Phong',
    updatedAt: Date.now() - 40 * 60 * 1000,
    lastUpdated: 'Vừa chỉnh sửa xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 50,
    fullBookDiscountPriceXu: 35,
    chapters: generateChapters('gha', 60),
  },

  // ==================== 8. ĐẠI ĐẾ TINH TẾ 01 ====================
  {
    id: 'dai-de-tinh-te-01',
    title: 'Đại Đế Tinh Tế 01',
    slug: 'dai-de-tinh-te-01',
    author: 'Đại Đế Tinh Tế 01',
    editor: 'Đại Đế Tinh Tế 01',
    coverImage: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nam',
    status: 'Đang ra',
    isHot: false,
    totalChapters: 120,
    views: 1,
    dailyViews: 1,
    rating: 4.9,
    categories: ['Truyện Nam', 'Khoa Huyễn', 'Cơ Giáp', 'Dị Năng', 'Tinh Tế'],
    description: 'Hành trình trỗi dậy của một thiếu niên nghèo nơi hành tinh rác thải, từng bước điều khiển cơ giáp siêu cấp, thống nhất các tinh hệ và trở thành Đại Đế tối cao.',
    translator: 'Đại Đế Tinh Tế 01',
    updatedAt: Date.now() - 45 * 60 * 1000,
    lastUpdated: 'Vừa chỉnh sửa xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 95,
    fullBookDiscountPriceXu: 70,
    chapters: generateChapters('ddtt01', 120),
  },

  // ==================== 9. MÀ CHÍNH CÁI DÁNG VẺ NÀY ====================
  {
    id: 'ma-chinh-cai-dang-ve-nay-cua-co-lai',
    title: 'Mà chính cái dáng vẻ này của cô lại...',
    slug: 'ma-chinh-cai-dang-ve-nay-cua-co-lai',
    author: 'Tiên Mao',
    editor: 'Đạo Tâm Team',
    coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'dam-my',
    status: 'Đang ra',
    isHot: false,
    totalChapters: 140,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Đam Mỹ', 'Hiện Đại', 'Đô Thị', 'Ngọt Sủng', 'Hào Môn Thế Gia'],
    description: 'Chính cái dáng vẻ quật cường không bao giờ chịu khuất phục của cậu lại vô tình khắc sâu vào tâm trí người đàn ông quyền thế nhất thành phố.',
    translator: 'Đạo Tâm Team',
    updatedAt: Date.now() - 60 * 60 * 1000,
    lastUpdated: '1: M... Vừa xong',
    hasAudio: true,
    flowerCount: 0,
    fullBookPriceXu: 105,
    fullBookDiscountPriceXu: 75,
    chapters: generateChapters('mccdv', 140),
  },

  // ==================== 10. TA CÓ MỘT TOÀ NHÀ MA KINH DỊ ====================
  {
    id: 'ta-co-mot-toa-khung-bo-oc',
    title: 'Ta Có Một Toà Nhà Ma Kinh Dị',
    slug: 'ta-co-mot-toa-nha-ma-kinh-di',
    author: 'Hội Thuyết Thoại Đích Trửu Tử',
    coverImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nam',
    status: 'Đang ra',
    isHot: false,
    totalChapters: 195,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Truyện Nam', 'Linh Dị', 'Hệ Thống', 'Hiện Đại'],
    description: 'Trần Ca thừa kế công viên nhà ma sắp phá sản của cha mẹ để lại. Tình cờ phát hiện ra chiếc điện thoại màu đen bí ẩn, mỗi khi hoàn thành nhiệm vụ kinh dị trong thế giới thực, hắn có thể mở rộng nhà ma và thu phục những lệ quỷ rùng rợn nhất.',
    translator: 'Linh Dị Quán',
    updatedAt: Date.now() - 5 * 3600 * 1000,
    lastUpdated: 'Chương 60:... 5 giờ trước',
    hasAudio: true,
    flowerCount: 760,
    fullBookPriceXu: 115,
    fullBookDiscountPriceXu: 85,
    chapters: generateChapters('tcnm', 195),
  },

  // ==================== 11. TOÀN CẦU CAO VÕ ====================
  {
    id: 'toan-cau-cao-vo',
    title: 'Toàn Cầu Cao Võ: Ta Dùng Khí Huyết Chấn Sơn Hà',
    slug: 'toan-cau-cao-vo',
    author: 'Lão Ưng Cật Tiểu Kê',
    coverImage: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nam',
    status: 'Hoàn thành',
    isHot: true,
    totalChapters: 420,
    views: 0,
    dailyViews: 0,
    rating: 4.8,
    categories: ['Truyện Nam', 'Dị Năng', 'Hệ Thống', 'Hiện Đại', 'Trọng Sinh'],
    description: 'Trùng sinh trở lại những năm tháng chuẩn bị thi đại học, Phương Bình vốn tưởng mình có thể dựa vào kiến thức tương lai để làm giàu. Nào ngờ thế giới này không giống như trước: Nơi đây địa quật hoành hành, võ đạo vi tôn!',
    translator: 'Chiến Thần Team',
    updatedAt: Date.now() - 3 * 3600 * 1000,
    lastUpdated: 'Chương 60:... 3 giờ trước',
    hasAudio: true,
    flowerCount: 1180,
    fullBookPriceXu: 190,
    fullBookDiscountPriceXu: 130,
    chapters: generateChapters('tgcv', 420),
  },

  // ==================== 12. TRỞ VỀ THẬP NIÊN 80: NỮ CƯỜNG ====================
  {
    id: 'tro-ve-thap-nien-80-nu-cuong',
    title: 'Trở Về Thập Niên 80: Nữ Cường Làm Giàu Nuôi Ba Con Cưng',
    slug: 'tro-ve-thap-nien-80-nu-cuong-lam-giau',
    author: 'Lục Nguyệt Tuyết',
    coverImage: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nu',
    status: 'Hoàn thành',
    isHot: true,
    totalChapters: 215,
    views: 0,
    dailyViews: 0,
    rating: 4.8,
    categories: ['Truyện Nữ', 'Thập Niên', 'Quân Nhân', 'Nữ Cường', 'Hiện Đại', 'Trọng Sinh', 'Ngôn Tình'],
    description: 'Doanh nhân tỷ phú Thẩm Thanh Đường bất ngờ chết vì làm việc quá sức, mở mắt ra phát hiện mình đã quay trở lại năm 1982 tại một vùng quê nghèo, bên cạnh là người chồng quân nhân lạnh lùng cùng ba đứa con nheo nhóc.',
    translator: 'Đạo Tâm Team',
    updatedAt: Date.now() - 4 * 3600 * 1000,
    lastUpdated: 'Chương 60:... 4 giờ trước',
    hasAudio: true,
    flowerCount: 980,
    fullBookPriceXu: 135,
    fullBookDiscountPriceXu: 95,
    chapters: generateChapters('tn80', 215),
  },

  // ==================== 13. TUYỆT SẮC SÁT THỦ ====================
  {
    id: 'tuyet-sac-sat-thu-xuyen-khong',
    title: 'Tuyệt Sắc Sát Thủ: Khuynh Đảo Hoàng Đình',
    slug: 'tuyet-sac-sat-thu-khuynh-dao-hoang-dinh',
    author: 'Thiên Sơn Trà',
    coverImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nu',
    status: 'Đang ra',
    isHot: false,
    totalChapters: 175,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Truyện Nữ', 'Sát Thủ', 'Xuyên Không', 'Cổ Đại', 'Nữ Cường', 'Hoàng Đế'],
    description: 'Đệ nhất sát thủ thế giới ngầm hy sinh trong lúc làm nhiệm vụ, linh hồn nhập vào vị tiểu thư phế vật bị ruồng bỏ của phủ Thừa tướng. Cầm kiếm đoạt mệnh, nàng từng bước giẫm đạp lên những kẻ phản bội!',
    translator: 'Yên Vũ Các',
    updatedAt: Date.now() - 7 * 3600 * 1000,
    lastUpdated: 'Chương 60:... 7 giờ trước',
    hasAudio: true,
    flowerCount: 840,
    fullBookPriceXu: 110,
    fullBookDiscountPriceXu: 80,
    chapters: generateChapters('stkd', 175),
  },

  // ==================== 14. VƯƠNG GIA RẤT BIẾT DỖ NGƯỜI ====================
  {
    id: 'vuong-gia-rat-biet-do-nguoi',
    title: 'Vương Gia Rất Biết Dỗ Người',
    slug: 'vuong-gia-rat-biet-do-nguoi',
    author: 'Nam Phong Ca',
    coverImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'dam-my',
    isShortStory: true,
    status: 'Hoàn thành',
    isHot: true,
    totalChapters: 239,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Đam Mỹ', 'Cổ Đại', 'Hoàng Đế', 'Trọng Sinh', 'Ngọt Sủng'],
    description: 'Đời trước Lâm Trĩ ngốc nghếch tin lời tra nam, kết cục cả gia tộc bị chém đầu, bản thân chết rũ trong lãnh cung lạnh giá. Sống lại một đời vào đúng ngày kiệu hoa gả vào phủ Ninh Vương — vị chiến thần mặt lạnh tàn tật ai ai cũng khiếp sợ.',
    translator: 'Đạo Tâm Team',
    updatedAt: Date.now() - 2 * 3600 * 1000,
    lastUpdated: 'Chương 60:... 2 giờ trước',
    hasAudio: true,
    flowerCount: 1240,
    fullBookPriceXu: 140,
    fullBookDiscountPriceXu: 95,
    chapters: generateChapters('vgrbd', 239),
  },

  // ==================== 15. XUYÊN NHANH: NAM CHÍNH HẮC HÓA ====================
  {
    id: 'xuyen-nhanh-nam-chinh-hac-hoa',
    title: 'Xuyên Nhanh: Nam Chính Hắc Hóa Lại Muốn Cường Chế Tôi',
    slug: 'xuyen-nhanh-nam-chinh-hac-hoa',
    author: 'Cố Niệm Niệm',
    coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'dam-my',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 182,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Đam Mỹ', 'Xuyên Không', 'Hệ Thống', 'Ngọt Sủng', 'Trọng Sinh'],
    description: 'Bạch Duật là một ký chủ chuyên nghiệp của Cục Quản Lý Thời Không. Nhiệm vụ của cậu là cứu rỗi những nam phụ thê thảm hoặc kéo các nam chính lạc lối trở lại quỹ đạo. Thế nhưng chẳng hiểu sao, mỗi lần hoàn thành nhiệm vụ chuẩn bị rút lui, các nam chính đáng lẽ phải chính trực quang minh lại biến chất.',
    translator: 'Đạo Tâm Team',
    updatedAt: Date.now() - 15 * 60 * 1000,
    lastUpdated: 'Chương ... 15 phút trước',
    hasAudio: true,
    flowerCount: 1540,
    fullBookPriceXu: 120,
    fullBookDiscountPriceXu: 90,
    chapters: generateChapters('xnhh', 182),
  },

  // ==================== 16. XUYÊN THÀNH THÚ NHÂN ====================
  {
    id: 'xuyen-thanh-thu-nhan-sieu-cap',
    title: 'Xuyên Thành Thú Nhân: Được Đại Lão Sủng Lên Trời',
    slug: 'xuyen-thanh-thu-nhan-duoc-dai-lao-sung-len-troi',
    author: 'Miêu Tử Tương',
    coverImage: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'dam-my',
    status: 'Đang ra',
    isHot: false,
    totalChapters: 160,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Đam Mỹ', 'Thú Nhân', 'Sủng Thú', 'Xuyên Không', 'Ngọt Sủng', 'Fanfic'],
    description: 'Bác sĩ thú y Tô Mục vô tình xuyên không đến tinh cầu thú nhân nguyên thủy, bất đắc dĩ hóa thành một bé sóc bay lông xù mềm mại, bị vị vương giả sư tử tuyết hung bạo nhặt về sủng ái.',
    translator: 'Mộng Đàm Team',
    updatedAt: Date.now() - 6 * 3600 * 1000,
    lastUpdated: '6 giờ trước',
    hasAudio: true,
    flowerCount: 910,
    fullBookPriceXu: 110,
    fullBookDiscountPriceXu: 80,
    chapters: generateChapters('tnsl', 160),
  },

  // ==================== 17. HỐC NGUYỆT QUANG CẢM KIẾM NGHỊCH THIÊN ====================
  {
    id: 'hac-nguyet-quang-trong-sinh',
    title: 'Hốc Nguyệt Quang Cảm Kiếm Nghịch Thiên',
    slug: 'hoc-nguyet-quang-cam-kiem-nghich-thien',
    author: 'Cửu Vĩ Linh Hồ',
    publisherRoles: ['author'],
    coverImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-sang-tac',
    isOriginal: true,
    status: 'Hoàn thành',
    isHot: true,
    totalChapters: 120,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Truyện Sáng Tác', 'Dị Năng', 'Huyền Huyễn', 'Nữ Cường'],
    description: 'Tiểu thuyết tự sáng tác đặc sắc. Trải qua kiếp nạn bị tông môn phản bội, nữ chính trùng sinh trở lại với dị năng phong ấn thượng cổ, thề quét sạch mọi ân oán tiền kiếp.',
    translator: 'Tác giả độc quyền',
    updatedAt: Date.now() - 3 * 3600 * 1000,
    lastUpdated: '3 giờ trước',
    hasAudio: true,
    flowerCount: 1120,
    fullBookPriceXu: 95,
    fullBookDiscountPriceXu: 70,
    chapters: generateChapters('hnqcs', 120),
  },

  // ==================== 18. TRONG SINH MẠT THẾ: KHÔNG GIAN TÙY THÂN ====================
  {
    id: 'mat-the-khong-gian-tuy-than',
    title: 'Trong Sinh Mạt Thế: Ta Có Không Gian Tùy Thân Trữ Vạn Tấn Hàng',
    slug: 'trong-sinh-mat-the-ta-co-khong-gian-tuy-than',
    author: 'Phong Hỏa Hí Chư Hầu',
    coverImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nam',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 210,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Truyện Nam', 'Mạt Thế', 'Tận Thế', 'Không Gian Tùy Thân', 'Dị Năng', 'Trọng Sinh'],
    description: 'Trước ngày tận thế một tháng, Lục Trầm sống lại kiếp trước khi thảm họa zombie bùng nổ. Mang theo không gian tùy thân vô hạn dung tích, hắn điên cuồng vơ vét hàng trăm tỷ tiền vật tư, xây dựng pháo đài thép bất khả xâm phạm!',
    translator: 'Chiến Thần Team',
    updatedAt: Date.now() - 2 * 3600 * 1000,
    lastUpdated: '2 giờ trước',
    hasAudio: true,
    flowerCount: 1050,
    fullBookPriceXu: 130,
    fullBookDiscountPriceXu: 90,
    chapters: generateChapters('mtkg', 210),
  },

  // ==================== 19. MỘNG HOA LỤC KÝ ====================
  {
    id: 'mong-hoa-luc-ky-sang-tac',
    title: 'Mộng Hoa Lục Ký: Vạn Dặm Hồng Trần Tìm Ngươi',
    slug: 'mong-hoa-luc-ky-van-dam-hong-tran-tim-nguoi',
    author: 'Bạch Nguyệt Quang',
    editor: 'Mộng Các Chủ',
    publisherRoles: ['author', 'editor'],
    coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-sang-tac',
    isOriginal: true,
    status: 'Đang ra',
    isHot: true,
    totalChapters: 180,
    views: 0,
    dailyViews: 0,
    rating: 5.0,
    categories: ['Truyện Sáng Tác', 'Cổ Đại', 'Tu Tiên', 'Ngọt Sủng', 'Trọng Sinh'],
    description: 'Tác phẩm tự sáng tác chính chủ của tác giả Đạo Tâm. Câu chuyện kể về hành trình nghịch thiên cải mệnh, một đời phong hoa tuyết nguyệt tìm lại người thương nơi biển người mênh mông.',
    translator: 'Chính chủ sáng tác & biên tập',
    updatedAt: Date.now() - 1 * 3600 * 1000,
    lastUpdated: '1 giờ trước',
    hasAudio: true,
    flowerCount: 1680,
    fullBookPriceXu: 125,
    fullBookDiscountPriceXu: 90,
    chapters: generateChapters('mhlk', 180),
  },

  // ==================== 20. SƯ TÔN LUÔN NHỚ THƯƠNG CÁI ĐẦU CỦA TA ====================
  {
    id: 'su-ton-luon-nho-thuong-cai-dau-cua-ta',
    title: 'Sư Tôn Luôn Nhớ Thương Cái Đầu Của Ta',
    slug: 'su-ton-luon-nho-thuong-cai-dau-cua-ta',
    author: 'Nhất Trản Thanh Đăng',
    coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'dam-my',
    status: 'Hoàn thành',
    isHot: true,
    totalChapters: 245,
    views: 0,
    dailyViews: 0,
    rating: 4.8,
    categories: ['Đam Mỹ', 'Tu Tiên', 'Xuyên Không', 'Cổ Đại', 'Huyền Huyễn'],
    description: 'Diệp Lạc xuyên thành đại đồ đệ của Tiêu Dao Tông, phát hiện ra sư tôn cao lãnh chi hoa của mình mắc bệnh sạch sẽ, lại còn có thói quen kiếm khí lạnh buốt muốn gọt bay chiếc đầu lâu trên cổ y!',
    translator: 'Mộng Đàm Team',
    updatedAt: Date.now() - 45 * 60 * 1000,
    lastUpdated: '45 phút trước',
    hasAudio: true,
    flowerCount: 1390,
    fullBookPriceXu: 150,
    fullBookDiscountPriceXu: 105,
    chapters: generateChapters('stdt', 245),
  },

  // ==================== 21. VẠN CỔ THẦN ĐẾ ====================
  {
    id: 'van-co-than-de-nhat-kiem-pha-van-gioi',
    title: 'Vạn Cổ Thần Đế: Nhất Kiếm Phá Vạn Giới',
    slug: 'van-co-than-de-nhat-kiem-pha-van-gioi',
    author: 'Phi Thiên Ngư',
    coverImage: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nam',
    status: 'Đang ra',
    isHot: true,
    totalChapters: 350,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Truyện Nam', 'Tu Tiên', 'Huyền Huyễn', 'Kiếm Hiệp', 'Trọng Sinh'],
    description: 'Tám trăm năm trước, Trương Nhược Trần bị vị hôn thê sát hại. Tám trăm năm sau, hắn tái sinh bước lên con đường nghịch thiên đoạt mệnh!',
    translator: 'Bản dịch chính quy',
    updatedAt: Date.now() - 30 * 60 * 1000,
    lastUpdated: '30 phút trước',
    hasAudio: true,
    flowerCount: 1310,
    fullBookPriceXu: 180,
    fullBookDiscountPriceXu: 120,
    chapters: generateChapters('vctd', 350),
  },

  // ==================== 22. GẢ CHO BẠO QUÂN TÀN TẬT ====================
  {
    id: 'ga-cho-bao-quan-tan-tat-ta-duoc-cung-chieu-tan-troi',
    title: 'Gả Cho Bạo Quân Tàn Tật, Ta Được Cưng Chiều Tận Trời',
    slug: 'ga-cho-bao-quan-tan-tat-ta-duoc-cung-chieu-tan-troi',
    author: 'Thanh Thảo Manh',
    coverImage: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=700&q=80',
    mainCategory: 'truyen-nu',
    status: 'Hoàn thành',
    isHot: true,
    totalChapters: 267,
    views: 0,
    dailyViews: 0,
    rating: 4.9,
    categories: ['Truyện Nữ', 'Cổ Đại', 'Hoàng Đế', 'Ngôn Tình', 'Trọng Sinh', 'Ngọt Sủng', 'Nữ Cường'],
    description: 'Đời trước nàng bị đích muội và mẹ kế hãm hại gả thay vào phủ Nhiếp Chính Vương tàn bạo, ai nấy đều tưởng nàng sẽ chết không toàn thây. Nào ngờ vị Nhiếp Chính Vương ấy lại nâng niu nàng trong lòng bàn tay!',
    translator: 'Đạo Tâm Team',
    updatedAt: Date.now() - 1 * 3600 * 1000,
    lastUpdated: '1 giờ trước',
    hasAudio: true,
    flowerCount: 1470,
    fullBookPriceXu: 160,
    fullBookDiscountPriceXu: 110,
    chapters: generateChapters('gcby', 267),
  },
];
