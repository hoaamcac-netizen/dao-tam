import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  getChapterByIdentifiersCached,
  buildSeoDescription,
  resolveAbsoluteImageUrl,
  SITE_URL,
} from '../../../../lib/firestoreServerCache';
import ChapterReaderClient from './ChapterReaderClient';
import LoadingSpinner from '../../../components/LoadingSpinner';

/**
 * ==============================================================================
 * TRANG ĐỌC CHƯƠNG TRUYỆN - SERVER COMPONENT (/truyen/[novelId]/[chapterId])
 * ==============================================================================
 * 1. Tối ưu Lượt Đọc Firebase bằng Next.js ISR:
 *    `export const revalidate = 3600;` -> Vercel cache HTML tĩnh trong 1 tiếng,
 *    giảm tải 99% lượt Read trùng lặp vào Firestore.
 * 2. Tối ưu SEO & Open Graph (Dynamic Metadata):
 *    `generateMetadata` tự động lấy Tên truyện, Tên chương, Tóm tắt và Ảnh bìa.
 * ==============================================================================
 */

export const revalidate = 3600;

interface ChapterPageProps {
  params: Promise<{ novelId: string; chapterId: string }>;
}

export async function generateMetadata({ params }: ChapterPageProps): Promise<Metadata> {
  const { novelId, chapterId } = await params;
  const { novel, chapter } = await getChapterByIdentifiersCached(novelId, chapterId);

  if (!novel) {
    return {
      title: 'Đọc truyện online | Đạo Tâm',
      description: 'Nền tảng đọc truyện chữ và nghe Audio AI Neural mượt mà tại Đạo Tâm.',
    };
  }

  const chapterLabel = chapter?.title
    ? chapter.title.toLowerCase().includes('chương')
      ? chapter.title
      : `Chương ${chapter.number}: ${chapter.title}`
    : `Chương ${chapter?.number ?? 1}`;

  const title = `${chapterLabel} - ${novel.title} | Đạo Tâm`;
  const excerptSource =
    (chapter?.content?.length ?? 0) > 40 ? chapter?.content : novel.description;
  const description = buildSeoDescription(
    excerptSource,
    `Đọc ${chapterLabel} của truyện ${novel.title} (Tác giả: ${novel.author}) kèm Audio AI Neural tại Đạo Tâm.`
  );
  const coverUrl = resolveAbsoluteImageUrl(novel.coverImage);
  const cleanNovelSlug =
    novel.slug && novel.slug.trim() ? novel.slug.trim() : novel.id || novelId;
  const cleanChapterSlug =
    chapter?.slug && chapter.slug.trim()
      ? chapter.slug.trim()
      : `chuong-${chapter?.number ?? 1}`;
  const canonicalUrl = `${SITE_URL}/truyen/${encodeURIComponent(
    cleanNovelSlug
  )}/chuong/${encodeURIComponent(cleanChapterSlug)}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Đạo Tâm',
      locale: 'vi_VN',
      type: 'article',
      images: [
        {
          url: coverUrl,
          width: 800,
          height: 1066,
          alt: `${novel.title} - ${chapterLabel}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [coverUrl],
    },
  };
}

export default async function ChapterPage({ params }: ChapterPageProps) {
  const { novelId, chapterId } = await params;
  const { novel, chapter, chaptersList, needsClientAuthContent } =
    await getChapterByIdentifiersCached(novelId, chapterId);

  const cleanNovelSlug =
    novel?.slug && novel.slug.trim() ? novel.slug.trim() : novel?.id || novelId;
  const cleanChapterSlug =
    chapter?.slug && chapter.slug.trim()
      ? chapter.slug.trim()
      : `chuong-${chapter?.number ?? 1}`;
  const canonicalUrl = `${SITE_URL}/truyen/${encodeURIComponent(
    cleanNovelSlug
  )}/chuong/${encodeURIComponent(cleanChapterSlug)}`;

  const jsonLd = novel
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `${chapter?.title || `Chương ${chapter?.number ?? 1}`} - ${novel.title}`,
        author: {
          '@type': 'Person',
          name: novel.author,
        },
        image: resolveAbsoluteImageUrl(novel.coverImage),
        url: canonicalUrl,
        description: buildSeoDescription(chapter?.content || novel.description),
        inLanguage: 'vi',
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Suspense
        fallback={
          <LoadingSpinner
            message="Đang tải chương truyện..."
            subMessage="Đạo Tâm đang chuẩn bị giao diện đọc mượt mà..."
            fullScreen={true}
          />
        }
      >
        <ChapterReaderClient
          initialNovel={novel}
          initialChapter={chapter}
          initialChaptersList={chaptersList}
          needsClientAuthContent={needsClientAuthContent}
          rawNovelId={novelId}
          rawChapterId={chapterId}
        />
      </Suspense>
    </>
  );
}
