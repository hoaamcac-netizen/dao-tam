import React from 'react';
import type { Metadata } from 'next';
import {
  getNovelByIdentifierCached,
  buildSeoDescription,
  resolveAbsoluteImageUrl,
  SITE_URL,
} from '../../../lib/firestoreServerCache';
import NovelDetailClient from './NovelDetailClient';

/**
 * ==============================================================================
 * TRANG CHI TIẾT TRUYỆN - SERVER COMPONENT (/truyen/[novelId])
 * ==============================================================================
 * 1. Tối ưu lượt Read Firebase bằng Next.js ISR:
 *    `export const revalidate = 3600;` -> Cache HTML tĩnh tại Vercel Edge 1 tiếng,
 *    giảm tải 99% lượt đọc trùng lặp vào Firestore.
 * 2. Tối ưu SEO & Open Graph (Dynamic Metadata):
 *    `generateMetadata` tự động gán Title, Description, Ảnh bìa cho Facebook/Zalo.
 * 3. Phần động như Bình luận vẫn giữ Client-side fetching trong NovelDetailClient.
 * ==============================================================================
 */

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ novelId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { novelId } = await params;
  const novel = await getNovelByIdentifierCached(novelId);

  if (!novel) {
    return {
      title: 'Không tìm thấy truyện | Đạo Tâm',
      description: 'Đọc truyện chữ online và nghe Audio AI Neural miễn phí tại Đạo Tâm.',
    };
  }

  const title = `${novel.title} - ${novel.author} | Đạo Tâm`;
  const description = buildSeoDescription(
    novel.description,
    `Đọc truyện ${novel.title} của tác giả ${novel.author} bản đẹp, hỗ trợ nghe Audio AI mượt mà tại Đạo Tâm.`
  );
  const coverUrl = resolveAbsoluteImageUrl(novel.coverImage);
  const cleanIdentifier =
    novel.slug && novel.slug.trim() ? novel.slug.trim() : novel.id || novelId;
  const canonicalUrl = `${SITE_URL}/truyen/${encodeURIComponent(cleanIdentifier)}`;

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
      type: 'book',
      images: [
        {
          url: coverUrl,
          width: 800,
          height: 1066,
          alt: novel.title,
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

export default async function NovelDetailPage({ params }: PageProps) {
  const { novelId } = await params;
  const novel = await getNovelByIdentifierCached(novelId);

  const cleanIdentifier =
    novel?.slug && novel.slug.trim() ? novel.slug.trim() : novel?.id || novelId;
  const canonicalUrl = `${SITE_URL}/truyen/${encodeURIComponent(cleanIdentifier)}`;
  const coverUrl = resolveAbsoluteImageUrl(novel?.coverImage);

  const jsonLd = novel
    ? {
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: novel.title,
        author: {
          '@type': 'Person',
          name: novel.author,
        },
        url: canonicalUrl,
        image: coverUrl,
        description: buildSeoDescription(novel.description),
        inLanguage: 'vi',
        numberOfPages: novel.totalChapters || novel.chapters?.length || 1,
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
      <NovelDetailClient initialNovel={novel} rawIdentifier={novelId} />
    </>
  );
}
