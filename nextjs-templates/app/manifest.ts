import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Đạo Tâm - Nền Tảng Đọc Truyện Chữ & Audio',
    short_name: 'Đạo Tâm',
    description: 'Đạo Tâm - Nền tảng đọc truyện chữ và audio tự động với Dark/Light mode, mục lục chi tiết, quy chuẩn VIP tự động và đồng bộ tiến trình đọc theo tài khoản.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#fdf2f8',
    theme_color: '#db2777',
    icons: [
      {
        src: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj6ZeTfQWNEEkf4_h5akDb5XGB6m5GGmaH1V4JZZ3PUZOZULVQBYy075SThayXE9GFLTqDkhC7_2MUPsJ8adafttywJnFpJIJrAEJzg-X5Ba5WtR2wmA0ClcJzFy8IJyl86XJZSn5xUs7zrMW6fs-hpPDWxCWCvaeSJyV54qOOMmUIxr0WUMM4msBxaNII/s1254/logo%20DAO%20TAM.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj6ZeTfQWNEEkf4_h5akDb5XGB6m5GGmaH1V4JZZ3PUZOZULVQBYy075SThayXE9GFLTqDkhC7_2MUPsJ8adafttywJnFpJIJrAEJzg-X5Ba5WtR2wmA0ClcJzFy8IJyl86XJZSn5xUs7zrMW6fs-hpPDWxCWCvaeSJyV54qOOMmUIxr0WUMM4msBxaNII/s1254/logo%20DAO%20TAM.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj6ZeTfQWNEEkf4_h5akDb5XGB6m5GGmaH1V4JZZ3PUZOZULVQBYy075SThayXE9GFLTqDkhC7_2MUPsJ8adafttywJnFpJIJrAEJzg-X5Ba5WtR2wmA0ClcJzFy8IJyl86XJZSn5xUs7zrMW6fs-hpPDWxCWCvaeSJyV54qOOMmUIxr0WUMM4msBxaNII/s1254/logo%20DAO%20TAM.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj6ZeTfQWNEEkf4_h5akDb5XGB6m5GGmaH1V4JZZ3PUZOZULVQBYy075SThayXE9GFLTqDkhC7_2MUPsJ8adafttywJnFpJIJrAEJzg-X5Ba5WtR2wmA0ClcJzFy8IJyl86XJZSn5xUs7zrMW6fs-hpPDWxCWCvaeSJyV54qOOMmUIxr0WUMM4msBxaNII/s1254/logo%20DAO%20TAM.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
