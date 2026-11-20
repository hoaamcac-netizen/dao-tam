import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientGlobalShell from '../components/ClientGlobalShell';

export const metadata: Metadata = {
  title: 'Đạo Tâm - Nền Tảng Đọc Truyện Chữ & Audio',
  description:
    'Đạo Tâm - Nền tảng đọc truyện chữ và audio tự động với Dark/Light mode, mục lục chi tiết, quy chuẩn VIP tự động và đồng bộ tiến trình đọc theo tài khoản.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    siteName: 'Đạo Tâm',
    title: 'Đạo Tâm - Nền Tảng Đọc Truyện Chữ & Audio',
    description:
      'Đạo Tâm - Nền tảng đọc truyện chữ và audio tự động với Dark/Light mode, mục lục chi tiết, quy chuẩn VIP tự động.',
    type: 'website',
    images: ['/logo.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#db2777',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans selection:bg-pink-500 selection:text-white"
      >
        <ClientGlobalShell>{children}</ClientGlobalShell>
      </body>
    </html>
  );
}
