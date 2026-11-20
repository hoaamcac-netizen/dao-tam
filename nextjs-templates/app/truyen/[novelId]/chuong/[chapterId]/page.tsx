import ChapterPage, { generateMetadata } from '../../[chapterId]/page';

/**
 * ==============================================================================
 * TRANG ĐỌC CHƯƠNG CHUẨN SEO (/truyen/[novelId]/chuong/[chapterId])
 * ==============================================================================
 * - Bắt buộc cấu hình ISR `export const revalidate = 3600;` (Cache 1 tiếng)
 * - Tái sử dụng `generateMetadata` động cho SEO, Open Graph & Twitter Card
 * ==============================================================================
 */

export const revalidate = 3600;
export { generateMetadata };

export default ChapterPage;
