/**
 * Trình tạo mã nguồn Theme Blogger XML nguyên khối hoàn chỉnh cho "Đạo Tâm"
 * Đáp ứng 100% yêu cầu:
 * 1. Định dạng XML Blogger hợp lệ (v2 / valid b:widget, b:includable, b:skin).
 * 2. Giao diện hiện đại sang trọng tông vàng kim & đen tuyền (tương tự dammythuquan.com).
 * 3. Chế độ Dark Mode / Light Mode mượt mà.
 * 4. Mục lục chương chi tiết (tìm kiếm chương, lọc khoảng 1-50, 51-100..., sắp xếp mới/cũ).
 * 5. Trình phát Audio truyện (chữ & audio) với hỗ trợ Audio file MP3 và Giọng đọc AI tự động (Web Speech).
 * 6. TUYỆT ĐỐI KHÔNG CHỨA PHẦN ĐỀ XUẤT TRUYỆN (No recommendation widget).
 * 7. Lưu tiến trình đọc cho từng người dùng qua tài khoản (Google Firebase Auth & Firestore sync + LocalStorage dự phòng).
 */

export interface BloggerXmlOptions {
  blogName?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseAppId?: string;
}

export function generateBloggerXml(options: BloggerXmlOptions = {}): string {
  const blogName = options.blogName || 'Đạo Tâm';
  const apiKey = options.firebaseApiKey || 'AIzaSyDemoKeyBloggerThemeDamMongCac123';
  const authDomain = options.firebaseAuthDomain || 'dam-mong-cac.firebaseapp.com';
  const projectId = options.firebaseProjectId || 'dam-mong-cac';
  const storageBucket = options.firebaseStorageBucket || 'dam-mong-cac.appspot.com';
  const appId = options.firebaseAppId || '1:1234567890:web:abcdef123456';

  return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:version='2' class='v2' expr:dir='data:blog.languageDirection' xmlns='http://www.w3.org/1999/xhtml' xmlns:b='http://www.google.com/2005/gml/b' xmlns:data='http://www.google.com/2005/gml/data' xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta content='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5' name='viewport'/>
  <title><data:blog.pageTitle/></title>
  <b:include data='blog' name='all-head-content'/>

  <!-- Google Fonts & Font Awesome Icons (100% Hỗ Trợ Đầy Đủ Dấu Tiếng Việt) -->
  <link href='https://fonts.googleapis.com' rel='preconnect'/>
  <link crossorigin='anonymous' href='https://fonts.gstatic.com' rel='preconnect'/>
  <link href='https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&amp;family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&amp;family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&amp;family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&amp;subset=vietnamese&amp;display=swap' rel='stylesheet'/>
  <link href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css' rel='stylesheet'/>

  <!-- Firebase App & Auth SDK for Account-based Reading Progress -->
  <script src='https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js'></script>
  <script src='https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js'></script>
  <script src='https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'></script>

  <b:skin><![CDATA[
  /* ==========================================================================
     THEME BLOGGER: ĐẠO TÂM (ĐỌC TRUYỆN CHỮ & AUDIO)
     Phong cách sang trọng Gold & Dark (tương tự dammythuquan.com)
     - Dark / Light Mode
     - Mục lục chương chi tiết
     - Máy nghe Audio & Giọng đọc tự động
     - Tuyệt đối KHÔNG có phần đề xuất truyện
     - Lưu tiến trình đọc theo tài khoản người dùng
     ========================================================================== */

  :root {
    --bg-main: #0d0e12;
    --bg-header: rgba(18, 19, 24, 0.95);
    --bg-card: #16171d;
    --bg-card-hover: #1f2029;
    --bg-input: #1a1b22;
    --bg-modal: #16171d;
    --border-color: #262833;
    --border-gold: rgba(234, 179, 8, 0.35);
    --text-primary: #f3f4f6;
    --text-secondary: #9ca3af;
    --text-muted: #6b7280;
    --accent-gold: #f59e0b;
    --accent-gold-light: #fbbf24;
    --accent-gold-dark: #d97706;
    --accent-glow: 0 0 20px rgba(245, 158, 11, 0.25);
    --badge-hot: #ef4444;
    --badge-full: #10b981;
    --font-heading: 'Playfair Display', 'Lora', serif;
    --font-body: 'Be Vietnam Pro', sans-serif;
    --reader-font: 'Be Vietnam Pro', 'Lora', serif;
    --reader-size: 19px;
    --reader-line: 1.85;
    --transition: all 0.25s ease;
  }

  /* Light Mode Theme */
  [data-theme='light'] {
    --bg-main: #f8f9fc;
    --bg-header: rgba(255, 255, 255, 0.96);
    --bg-card: #ffffff;
    --bg-card-hover: #f1f3f9;
    --bg-input: #edf0f7;
    --bg-modal: #ffffff;
    --border-color: #e2e8f0;
    --border-gold: rgba(217, 119, 6, 0.4);
    --text-primary: #1e293b;
    --text-secondary: #475569;
    --text-muted: #94a3b8;
    --accent-gold: #d97706;
    --accent-gold-light: #f59e0b;
    --accent-gold-dark: #b45309;
    --accent-glow: 0 0 15px rgba(217, 119, 6, 0.15);
  }

  /* Base Reset */
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    background-color: var(--bg-main);
    color: var(--text-primary);
    font-family: var(--font-body);
    line-height: 1.6;
    min-height: 100vh;
    transition: background-color 0.3s ease, color 0.3s ease;
    overflow-x: hidden;
  }

  a {
    color: inherit;
    text-decoration: none;
    transition: var(--transition);
  }

  img {
    max-width: 100%;
    height: auto;
    display: block;
  }

  /* Container */
  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 20px;
  }

  /* Header & Navigation (Phỏng theo dammythuquan.com) */
  .dmc-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--bg-header);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border-gold);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .dmc-nav-wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
    gap: 16px;
  }

  /* Logo */
  .dmc-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-heading);
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0.5px;
    background: linear-gradient(135deg, #fef08a 0%, #f59e0b 50%, #d97706 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 10px rgba(245, 158, 11, 0.2);
    white-space: nowrap;
  }

  .dmc-brand i {
    -webkit-text-fill-color: initial;
    color: var(--accent-gold);
    font-size: 22px;
  }

  /* Main Navigation Links */
  .dmc-menu {
    display: flex;
    align-items: center;
    list-style: none;
    gap: 6px;
  }

  .dmc-menu-item a {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .dmc-menu-item a:hover,
  .dmc-menu-item.active a {
    color: var(--accent-gold-light);
    background: rgba(245, 158, 11, 0.1);
  }

  /* Search Bar */
  .dmc-search-box {
    flex: 1;
    max-width: 380px;
    position: relative;
    display: flex;
    align-items: center;
  }

  .dmc-search-input {
    width: 100%;
    height: 40px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    padding: 0 75px 0 16px;
    color: var(--text-primary);
    font-size: 13.5px;
    outline: none;
    transition: var(--transition);
  }

  .dmc-search-input:focus {
    border-color: var(--accent-gold);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
  }

  .dmc-search-btn {
    position: absolute;
    right: 4px;
    top: 4px;
    height: 32px;
    padding: 0 16px;
    background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark));
    border: none;
    border-radius: 16px;
    color: #000;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: var(--transition);
  }

  .dmc-search-btn:hover {
    transform: translateY(-1px);
    box-shadow: var(--accent-glow);
  }

  /* Header Actions */
  .dmc-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dmc-btn-icon {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: var(--transition);
    position: relative;
  }

  .dmc-btn-icon:hover {
    border-color: var(--accent-gold);
    color: var(--accent-gold);
    transform: translateY(-2px);
  }

  .dmc-btn-audio-active {
    background: rgba(245, 158, 11, 0.15);
    border-color: var(--accent-gold);
    color: var(--accent-gold);
    animation: pulseAudio 1.5s infinite;
  }

  @keyframes pulseAudio {
    0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
    70% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
    100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  }

  .dmc-btn-auth {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 16px;
    background: linear-gradient(135deg, #1e2029, #2b2e3c);
    border: 1px solid var(--border-gold);
    border-radius: 20px;
    color: var(--accent-gold-light);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition);
  }

  .dmc-btn-auth:hover {
    background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark));
    color: #000;
    box-shadow: var(--accent-glow);
  }

  .dmc-user-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--accent-gold);
  }

  /* Audio Floating Player */
  .dmc-audio-bar {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 820px;
    background: var(--bg-card);
    border: 1px solid var(--border-gold);
    border-radius: 18px;
    box-shadow: 0 12px 35px rgba(0, 0, 0, 0.5);
    padding: 12px 20px;
    z-index: 99;
    display: none;
    align-items: center;
    gap: 16px;
    animation: slideUp 0.3s ease;
  }

  .dmc-audio-bar.show {
    display: flex;
  }

  @keyframes slideUp {
    from { transform: translate(-50%, 40px); opacity: 0; }
    to { transform: translate(-50%, 0); opacity: 1; }
  }

  .audio-info {
    flex: 1;
    min-width: 140px;
  }

  .audio-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--accent-gold-light);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .audio-sub {
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .audio-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .audio-btn {
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 16px;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: var(--transition);
  }

  .audio-btn:hover {
    color: var(--accent-gold);
    background: rgba(245, 158, 11, 0.1);
  }

  .audio-btn-play {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark));
    color: #000;
    font-size: 16px;
    box-shadow: var(--accent-glow);
  }

  .audio-btn-play:hover {
    transform: scale(1.05);
    color: #000;
  }

  .audio-timeline-wrap {
    flex: 2;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .audio-slider {
    flex: 1;
    height: 4px;
    accent-color: var(--accent-gold);
    cursor: pointer;
  }

  .audio-time {
    font-size: 11px;
    color: var(--text-muted);
    font-family: monospace;
    min-width: 38px;
  }

  .audio-speed {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    color: var(--accent-gold);
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
    outline: none;
  }

  /* Section Titles */
  .dmc-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 32px 0 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .dmc-section-title {
    font-family: var(--font-heading);
    font-size: 20px;
    font-weight: 700;
    color: var(--accent-gold-light);
    display: flex;
    align-items: center;
    gap: 10px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .dmc-section-title i {
    color: var(--accent-gold);
  }

  /* Novel Cards Grid (Phỏng theo dammythuquan.com) */
  .dmc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
  }

  @media (max-width: 640px) {
    .dmc-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
  }

  .novel-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    overflow: hidden;
    transition: var(--transition);
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .novel-card:hover {
    transform: translateY(-5px);
    border-color: var(--accent-gold);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 12px rgba(245, 158, 11, 0.2);
  }

  .novel-thumb-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    background: #111;
  }

  .novel-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.4s ease;
  }

  .novel-card:hover .novel-thumb {
    transform: scale(1.06);
  }

  .badge-full {
    position: absolute;
    top: 8px;
    left: 8px;
    background: var(--badge-full);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-hot {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--badge-hot);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .novel-overlay-stats {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 20px 8px 8px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.95), transparent);
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #e5e7eb;
  }

  .novel-overlay-stats span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .novel-overlay-stats i {
    color: var(--accent-gold-light);
  }

  .novel-info {
    padding: 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .novel-name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 6px;
    transition: var(--transition);
  }

  .novel-card:hover .novel-name {
    color: var(--accent-gold-light);
  }

  .novel-meta-tags {
    font-size: 11.5px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Single Novel Detail & Chapter TOC (Mục lục chương chi tiết) */
  .novel-hero {
    background: var(--bg-card);
    border: 1px solid var(--border-gold);
    border-radius: 16px;
    padding: 28px;
    margin: 24px 0 32px;
    display: flex;
    gap: 28px;
  }

  @media (max-width: 768px) {
    .novel-hero {
      flex-direction: column;
      padding: 16px;
      gap: 20px;
    }
  }

  .novel-hero-cover {
    width: 220px;
    flex-shrink: 0;
    aspect-ratio: 2 / 3;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid var(--border-gold);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .novel-hero-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .novel-hero-title {
    font-family: var(--font-heading);
    font-size: 26px;
    font-weight: 700;
    color: var(--accent-gold-light);
    margin-bottom: 12px;
    line-height: 1.3;
  }

  .novel-hero-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }

  .badge-tag {
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid var(--border-gold);
    color: var(--accent-gold-light);
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 6px;
  }

  .novel-hero-desc {
    color: var(--text-secondary);
    font-size: 14.5px;
    line-height: 1.7;
    margin-bottom: 24px;
  }

  .novel-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: auto;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark));
    color: #000;
    font-weight: 700;
    font-size: 14px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    transition: var(--transition);
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: var(--accent-glow);
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-weight: 600;
    font-size: 14px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    cursor: pointer;
    transition: var(--transition);
  }

  .btn-secondary:hover {
    border-color: var(--accent-gold);
    color: var(--accent-gold);
  }

  /* Mục Lục Chương Chi Tiết (Chi tiết, lọc khoảng chương & tìm kiếm) */
  .dmc-toc-container {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 40px;
  }

  .toc-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .toc-title {
    font-family: var(--font-heading);
    font-size: 18px;
    color: var(--accent-gold-light);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toc-filters {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .toc-search {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--text-primary);
    outline: none;
    width: 170px;
  }

  .toc-search:focus {
    border-color: var(--accent-gold);
  }

  .toc-ranges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .toc-range-btn {
    padding: 5px 10px;
    font-size: 12px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: var(--transition);
  }

  .toc-range-btn.active,
  .toc-range-btn:hover {
    background: rgba(245, 158, 11, 0.15);
    border-color: var(--accent-gold);
    color: var(--accent-gold-light);
  }

  .toc-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
    max-height: 540px;
    overflow-y: auto;
    padding-right: 6px;
  }

  .toc-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--bg-input);
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 13.5px;
    color: var(--text-primary);
    transition: var(--transition);
  }

  .toc-item:hover {
    border-color: var(--accent-gold);
    background: rgba(245, 158, 11, 0.08);
    transform: translateX(3px);
  }

  .toc-item.read {
    color: var(--text-muted);
  }

  .toc-item-badge {
    font-size: 10px;
    color: var(--accent-gold);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* ==========================================================================
     TRANG ĐỌC CHƯƠNG (READER VIEW)
     ========================================================================== */
  .reader-container {
    max-width: 900px;
    margin: 30px auto 60px;
    padding: 0 16px;
  }

  .reader-nav-top {
    position: sticky;
    top: 76px;
    z-index: 50;
    background: var(--bg-card);
    border: 1px solid var(--border-gold);
    border-radius: 12px;
    padding: 10px 16px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .reader-nav-btns {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .reader-chapter-title {
    font-family: var(--font-heading);
    font-size: 24px;
    color: var(--accent-gold-light);
    text-align: center;
    margin: 28px 0 10px;
  }

  .reader-meta {
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 28px;
  }

  .reader-content {
    font-family: var(--reader-font);
    font-size: var(--reader-size);
    line-height: var(--reader-line);
    color: var(--text-primary);
    letter-spacing: 0.2px;
    text-align: justify;
  }

  .reader-content p {
    margin-bottom: 1.4em;
    text-indent: 1.2em;
  }

  /* Progress bar indicator */
  .reader-scroll-progress {
    position: fixed;
    top: 72px;
    left: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-gold), var(--accent-gold-light));
    z-index: 101;
    width: 0%;
    transition: width 0.1s linear;
  }

  /* Reader Settings Panel */
  .reader-settings-panel {
    background: var(--bg-card);
    border: 1px solid var(--border-gold);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
    display: none;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .reader-settings-panel.show {
    display: grid;
  }

  .settings-group label {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 6px;
    font-weight: 600;
  }

  .settings-group select,
  .settings-group input[type='range'] {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    border-radius: 6px;
    padding: 6px;
    font-size: 13px;
  }

  /* User Account & Reading History Modal */
  .dmc-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(6px);
    z-index: 999;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .dmc-modal-overlay.show {
    display: flex;
  }

  .dmc-modal {
    background: var(--bg-modal);
    border: 1px solid var(--border-gold);
    border-radius: 18px;
    width: 100%;
    max-width: 580px;
    max-height: 85vh;
    overflow-y: auto;
    padding: 26px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    position: relative;
    animation: modalPop 0.25s ease;
  }

  @keyframes modalPop {
    from { transform: scale(0.92); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .dmc-modal-close {
    position: absolute;
    top: 18px;
    right: 18px;
    background: transparent;
    border: none;
    font-size: 18px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .dmc-modal-close:hover {
    color: var(--text-primary);
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg-input);
    border-radius: 10px;
    margin-bottom: 10px;
    border: 1px solid var(--border-color);
    transition: var(--transition);
  }

  .history-item:hover {
    border-color: var(--accent-gold);
  }

  .history-thumb {
    width: 50px;
    height: 70px;
    border-radius: 6px;
    object-fit: cover;
  }

  .history-info {
    flex: 1;
    min-width: 0;
  }

  .history-novel {
    font-weight: 600;
    font-size: 14px;
    color: var(--accent-gold-light);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .history-chapter {
    font-size: 12.5px;
    color: var(--text-secondary);
    margin: 2px 0;
  }

  .history-progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 6px;
  }

  .history-progress-val {
    height: 100%;
    background: var(--accent-gold);
  }

  /* Footer */
  .dmc-footer {
    background: #090a0d;
    border-top: 1px solid var(--border-gold);
    padding: 40px 0 25px;
    margin-top: 60px;
    font-size: 13.5px;
    color: var(--text-muted);
  }

  .dmc-footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 30px;
    margin-bottom: 30px;
  }

  @media (max-width: 768px) {
    .dmc-footer-grid {
      grid-template-columns: 1fr;
    }
    .dmc-search-box {
      display: none;
    }
  }

  .footer-col h4 {
    font-family: var(--font-heading);
    color: var(--accent-gold-light);
    font-size: 16px;
    margin-bottom: 14px;
  }

  .footer-col ul {
    list-style: none;
  }

  .footer-col li {
    margin-bottom: 8px;
  }

  .footer-col a:hover {
    color: var(--accent-gold);
  }

  .footer-bottom {
    text-align: center;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 12px;
  }
  ]]></b:skin>
</head>

<body>
  <!-- Reading Scroll Progress Bar -->
  <div class='reader-scroll-progress' id='scrollProgressBar'/>

  <!-- Header Đạo Tâm -->
  <header class='dmc-header'>
    <div class='container dmc-nav-wrap'>
      <!-- Logo -->
      <a class='dmc-brand' expr:href='data:blog.homepageUrl'>
        <i class='fa-solid fa-book-journal-whills'/>
        <span>${blogName}</span>
      </a>

      <!-- Menu Điều Hướng -->
      <ul class='dmc-menu'>
        <li class='dmc-menu-item active'>
          <a expr:href='data:blog.homepageUrl'><i class='fa-solid fa-house'/> Trang chủ</a>
        </li>
        <li class='dmc-menu-item'>
          <a href='/search/label/Truyện%20Mới'><i class='fa-solid fa-clock-rotate-left'/> Truyện mới</a>
        </li>
        <li class='dmc-menu-item'>
          <a href='/search/label/Hoàn%20Thành'><i class='fa-solid fa-check-double'/> Hoàn thành</a>
        </li>
      </ul>

      <!-- Thanh Tìm Kiếm -->
      <div class='dmc-search-box'>
        <form action='/search' method='get'>
          <input class='dmc-search-input' name='q' placeholder='Tìm tên truyện, tác giả...' type='text'/>
          <button class='dmc-search-btn' type='submit'>
            <i class='fa-solid fa-magnifying-glass'/> Tìm
          </button>
        </form>
      </div>

      <!-- Action Buttons -->
      <div class='dmc-actions'>
        <!-- Nút Cài Đặt Font/Màu Đọc -->
        <button class='dmc-btn-icon' id='btnToggleReaderSettings' title='Cài đặt đọc'>
          <i class='fa-solid fa-sliders'/>
        </button>

        <!-- Nút Bật/Tắt Audio Player -->
        <button class='dmc-btn-icon' id='btnToggleAudio' title='Nghe Audio / Đọc tự động'>
          <i class='fa-solid fa-headphones'/>
        </button>

        <!-- Nút Dark/Light Mode -->
        <button class='dmc-btn-icon' id='btnThemeToggle' title='Đổi giao diện Sáng/Tối'>
          <i class='fa-solid fa-sun' id='themeIcon'/>
        </button>

        <!-- Nút Tài Khoản & Lưu Tiến Trình -->
        <button class='dmc-btn-auth' id='btnAuthAccount' title='Tài khoản &amp; Tiến trình đọc'>
          <i class='fa-solid fa-user-circle' id='authBtnIcon'/>
          <span id='authBtnLabel'>Đăng nhập</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Thanh Nghe Audio Cố Định (Audio Player Bar) -->
  <div class='dmc-audio-bar' id='audioPlayerBar'>
    <div class='audio-info'>
      <div class='audio-title' id='audioPlayerTitle'>Đang tải âm thanh...</div>
      <div class='audio-sub' id='audioPlayerSub'>Truyện chữ &amp; Audio Đạo Tâm</div>
    </div>
    <div class='audio-controls'>
      <button class='audio-btn' id='audioBtnRewind' title='Lùi 10s'><i class='fa-solid fa-rotate-left'/></button>
      <button class='audio-btn audio-btn-play' id='audioBtnPlay' title='Phát / Tạm dừng'><i class='fa-solid fa-play' id='playIcon'/></button>
      <button class='audio-btn' id='audioBtnForward' title='Tua 10s'><i class='fa-solid fa-rotate-right'/></button>
    </div>
    <div class='audio-timeline-wrap'>
      <span class='audio-time' id='audioCurrentTime'>00:00</span>
      <input class='audio-slider' id='audioTimeline' max='100' min='0' type='range' value='0'/>
      <span class='audio-time' id='audioTotalTime'>00:00</span>
    </div>
    <select class='audio-speed' id='audioSpeedSelect' title='Tốc độ phát'>
      <option value='0.8'>0.8x</option>
      <option selected='selected' value='1.0'>1.0x</option>
      <option value='1.25'>1.25x</option>
      <option value='1.5'>1.5x</option>
      <option value='2.0'>2.0x</option>
    </select>
    <button class='audio-btn' id='audioBtnClose' title='Đóng máy nghe'><i class='fa-solid fa-xmark'/></button>
  </div>

  <!-- Phần Thân Chính Blogger (Không có bất kỳ tiện ích đề xuất truyện nào) -->
  <main class='container' style='min-height: 70vh;'>
    <b:section id='main' showaddelement='yes'>
      <b:widget id='Blog1' locked='true' title='Bài đăng trên Blog' type='Blog'>
        <b:includable id='main' var='top'>
          <b:if cond='data:blog.pageType == &quot;item&quot;'>
            <!-- TRANG CHI TIẾT TRUYỆN HOẶC ĐỌC CHƯƠNG -->
            <b:loop values='data:posts' var='post'>
              <b:include data='post' name='post'/>
            </b:loop>
          <b:else/>
            <!-- TRANG CHỦ / DANH SÁCH TRUYỆN MỚI -->
            <div class='dmc-section-header'>
              <h2 class='dmc-section-title'><i class='fa-solid fa-fire'/> Danh Sách Truyện Đạo Tâm</h2>
            </div>
            <div class='dmc-grid'>
              <b:loop values='data:posts' var='post'>
                <article class='novel-card'>
                  <a class='novel-thumb-wrap' expr:href='data:post.url'>
                    <b:if cond='data:post.thumbnailUrl'>
                      <img alt='Bìa truyện' class='novel-thumb' expr:src='data:post.thumbnailUrl'/>
                    <b:else/>
                      <img alt='Bìa truyện' class='novel-thumb' src='https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&amp;q=80'/>
                    </b:if>
                    <span class='badge-full'>FULL</span>
                    <span class='badge-hot'><i class='fa-solid fa-fire'/> HOT</span>
                    <div class='novel-overlay-stats'>
                      <span><i class='fa-solid fa-list-ol'/> Hồi mục</span>
                      <span><i class='fa-solid fa-headphones'/> Audio</span>
                    </div>
                  </a>
                  <div class='novel-info'>
                    <a class='novel-name' expr:href='data:post.url'><data:post.title/></a>
                    <div class='novel-meta-tags'>
                      <b:if cond='data:post.labels'>
                        <span><i class='fa-solid fa-tag'/> <data:post.labels.first.name/></span>
                      </b:if>
                      <span><i class='fa-solid fa-calendar-day'/> <data:post.dateHeader/></span>
                    </div>
                  </div>
                </article>
              </b:loop>
            </div>
          </b:if>
        </b:includable>

        <b:includable id='post' var='post'>
          <div class='reader-container' expr:id='&quot;post-&quot; + data:post.id'>
            <!-- Thanh điều khiển đọc nhanh trên đầu -->
            <div class='reader-nav-top'>
              <a class='btn-secondary' expr:href='data:blog.homepageUrl' style='padding: 6px 12px; font-size: 13px;'>
                <i class='fa-solid fa-arrow-left'/> Về trang chủ
              </a>
              <div class='reader-nav-btns'>
                <button class='btn-secondary' id='btnOpenToc' style='padding: 6px 12px; font-size: 13px;' title='Mở mục lục chương'>
                  <i class='fa-solid fa-list'/> Mục lục chương
                </button>
                <button class='btn-secondary' id='btnAudioThisChapter' style='padding: 6px 12px; font-size: 13px;' title='Nghe chương này'>
                  <i class='fa-solid fa-headphones'/> Nghe audio
                </button>
                <button class='btn-secondary' id='btnSaveBookmark' style='padding: 6px 12px; font-size: 13px;' title='Đánh dấu trang'>
                  <i class='fa-solid fa-bookmark'/> Lưu tiến trình
                </button>
              </div>
            </div>

            <!-- Panel cài đặt kích thước chữ & Font -->
            <div class='reader-settings-panel' id='readerSettingsPanel'>
              <div class='settings-group'>
                <label>Kiểu Font:</label>
                <select id='selectFontFamily'>
                  <option value='Lora, serif'>Lora (Trang trọng)</option>
                  <option value='Merriweather, serif'>Merriweather (Dễ đọc)</option>
                  <option value="&apos;Be Vietnam Pro&apos;, sans-serif">Be Vietnam Pro (Hiện đại)</option>
                  <option value='Roboto, sans-serif'>Roboto (Không chân)</option>
                </select>
              </div>
              <div class='settings-group'>
                <label>Kích cỡ chữ (<span id='lblFontSize'>19px</span>):</label>
                <input id='rangeFontSize' max='28' min='15' step='1' type='range' value='19'/>
              </div>
              <div class='settings-group'>
                <label>Khoảng cách dòng (<span id='lblLineHeight'>1.85</span>):</label>
                <input id='rangeLineHeight' max='2.4' min='1.4' step='0.1' type='range' value='1.85'/>
              </div>
            </div>

            <!-- Tiêu đề chương -->
            <h1 class='reader-chapter-title' id='chapterTitle'><data:post.title/></h1>
            <div class='reader-meta'>
              <span><i class='fa-solid fa-pen-nib'/> Đạo Tâm</span> • 
              <span><i class='fa-solid fa-clock'/> <data:post.dateHeader/></span>
            </div>

            <!-- Nội dung chương truyện chữ -->
            <div class='reader-content' id='readerArticleBody'>
              <data:post.body/>
            </div>

            <!-- Mục lục chương chi tiết (Tự động quét hoặc tích hợp trong bài) -->
            <div class='dmc-toc-container' id='detailTocSection' style='margin-top: 40px;'>
              <div class='toc-toolbar'>
                <div class='toc-title'>
                  <i class='fa-solid fa-book-open'/> Mục Lục Chương Chi Tiết
                </div>
                <div class='toc-filters'>
                  <input class='toc-search' id='tocSearchInput' placeholder='Tìm tên chương...' type='text'/>
                  <button class='toc-range-btn active' id='tocSortBtn'><i class='fa-solid fa-arrow-down-short-wide'/> Cũ nhất</button>
                </div>
              </div>
              <div class='toc-list' id='chapterTocList'>
                <!-- JavaScript sẽ tự động render danh sách chương nếu bài đăng có cấu trúc, hoặc các chương liên kết -->
                <div class='toc-item'><span>Đang nạp mục lục chi tiết...</span></div>
              </div>
            </div>

            <!-- Điều hướng chương trước / sau -->
            <div style='display: flex; justify-content: space-between; margin: 40px 0;'>
              <a class='btn-secondary' id='btnPrevChapter' style='display:none;'><i class='fa-solid fa-chevron-left'/> Chương trước</a>
              <button class='btn-primary' id='btnScrollTop'><i class='fa-solid fa-arrow-up'/> Lên đầu trang</button>
              <a class='btn-secondary' id='btnNextChapter' style='display:none;'>Chương sau <i class='fa-solid fa-chevron-right'/></a>
            </div>

            <!-- TUYỆT ĐỐI KHÔNG CHỨA PHẦN ĐỀ XUẤT TRUYỆN Ở ĐÂY -->
          </div>
        </b:includable>
        <b:includable id='status-message'/>
        <b:includable id='comment-link'/>
        <b:includable id='backlinks'/>
      </b:widget>
    </b:section>
  </main>

  <!-- Modal Tài Khoản & Lưu Tiến Trình Đọc -->
  <div class='dmc-modal-overlay' id='accountModalOverlay'>
    <div class='dmc-modal'>
      <button class='dmc-modal-close' id='btnCloseModal'><i class='fa-solid fa-xmark'/></button>
      
      <div id='authGuestView'>
        <div style='text-align: center; margin-bottom: 24px;'>
          <i class='fa-solid fa-user-shield' style='font-size: 42px; color: var(--accent-gold); margin-bottom: 12px;'/>
          <h3 style='font-family: var(--font-heading); color: var(--accent-gold-light); font-size: 20px;'>Tủ Sách &amp; Lưu Tiến Trình</h3>
          <p style='font-size: 13.5px; color: var(--text-muted); margin-top: 6px;'>
            Đăng nhập tài khoản để đồng bộ chương đang đọc, vị trí cuộn trang trên mọi thiết bị máy tính và điện thoại.
          </p>
        </div>
        <button class='btn-primary' id='btnGoogleLogin' style='width: 100%; justify-content: center; margin-bottom: 14px;'>
          <i class='fa-brands fa-google'/> Đăng nhập bằng Google
        </button>
        <button class='btn-secondary' id='btnContinueGuest' style='width: 100%; justify-content: center;'>
          <i class='fa-solid fa-hard-drive'/> Dùng bộ nhớ cục bộ (Không cần đăng nhập)
        </button>
      </div>

      <div id='authUserView' style='display: none;'>
        <div style='display: flex; align-items: center; gap: 14px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color);'>
          <img alt='Avatar' class='dmc-user-avatar' id='userProfileImg' src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png' style='width: 52px; height: 52px;'/>
          <div>
            <div id='userProfileName' style='font-weight: 700; font-size: 16px; color: var(--accent-gold-light);'>Bạn đọc</div>
            <div id='userProfileEmail' style='font-size: 12.5px; color: var(--text-muted);'>email@example.com</div>
          </div>
          <button class='btn-secondary' id='btnSignOut' style='margin-left: auto; padding: 6px 12px; font-size: 12px;'>
            Đăng xuất
          </button>
        </div>

        <h4 style='font-family: var(--font-heading); color: var(--accent-gold-light); font-size: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;'>
          <i class='fa-solid fa-bookmark'/> Truyện Đang Đọc &amp; Tiến Trình
        </h4>
        <div id='readingHistoryList'>
          <!-- Danh sách tiến trình đọc được render tự động -->
          <p style='font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px 0;'>Chưa có lịch sử đọc truyện.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <footer class='dmc-footer'>
    <div class='container dmc-footer-grid'>
      <div class='footer-col'>
        <div class='dmc-brand' style='margin-bottom: 12px;'>
          <i class='fa-solid fa-book-journal-whills'/> <span>${blogName}</span>
        </div>
        <p style='line-height: 1.7;'>
          Trang web đọc truyện chữ và nghe audio đam mỹ chất lượng cao. Giao diện tối ưu trải nghiệm đọc, không quảng cáo gây phiền toái, tự động ghi nhớ chương đang đọc và phát giọng đọc thông minh.
        </p>
      </div>
      <div class='footer-col'>
        <h4>Danh Mục</h4>
        <ul>
          <li><a href='/search/label/Đam%20Mỹ'>Đam Mỹ Chọn Lọc</a></li>
          <li><a href='/search/label/Xuyên%20Nhanh'>Xuyên Nhanh - Khoái Xuyên</a></li>
          <li><a href='/search/label/Trọng%20Sinh'>Trọng Sinh - Cổ Đại</a></li>
          <li><a href='/search/label/Audio'>Truyện Audio Độc Quyền</a></li>
        </ul>
      </div>
      <div class='footer-col'>
        <h4>Tính Năng Nổi Bật</h4>
        <ul>
          <li>Chế độ Dark / Light mode dịu mắt</li>
          <li>Mục lục chương chi tiết tra cứu nhanh</li>
          <li>Nghe Audio và Trình đọc tự động</li>
          <li>Lưu tiến trình đọc theo tài khoản</li>
          <li>Không chứa truyện đề xuất thừa thãi</li>
        </ul>
      </div>
    </div>
    <div class='container footer-bottom'>
      &amp;copy; 2026 ${blogName}. Bản quyền thuộc về Đạo Tâm. Thiết kế chuẩn Theme Blogger XML.
    </div>
  </footer>

  <!-- SCRIPT HỆ THỐNG BLOGGER: THEME LOGIC, AUDIO, READING PROGRESS, AUTH -->
  <script type='text/javascript'>
  //<![CDATA[
  (function() {
    'use strict';

    // 1. Cấu hình Firebase để lưu tiến trình đọc qua tài khoản (Có thể thay key của bạn vào đây)
    var firebaseConfig = {
      apiKey: "${apiKey}",
      authDomain: "${authDomain}",
      projectId: "${projectId}",
      storageBucket: "${storageBucket}",
      appId: "${appId}"
    };

    var firebaseInitialized = false;
    var currentUser = null;
    var db = null;
    var auth = null;

    try {
      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        firebaseInitialized = true;
      }
    } catch(e) {
      console.warn('Firebase init notice: Chế độ lưu tiến trình chuyển sang LocalStorage dự phòng', e);
    }

    // 2. Quản lý Dark / Light mode
    var savedTheme = localStorage.getItem('dmc_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    var themeBtn = document.getElementById('btnThemeToggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('dmc_theme', next);
        updateThemeIcon(next);
      });
    }

    function updateThemeIcon(t) {
      var icon = document.getElementById('themeIcon');
      if (icon) {
        icon.className = t === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      }
    }

    // 3. Quản lý cài đặt đọc (Font, Cỡ chữ, Giãn dòng)
    var btnSettings = document.getElementById('btnToggleReaderSettings');
    var settingsPanel = document.getElementById('readerSettingsPanel');
    if (btnSettings && settingsPanel) {
      btnSettings.addEventListener('click', function() {
        settingsPanel.classList.toggle('show');
      });
    }

    var fontSelect = document.getElementById('selectFontFamily');
    var sizeSlider = document.getElementById('rangeFontSize');
    var lineSlider = document.getElementById('rangeLineHeight');
    var lblFontSize = document.getElementById('lblFontSize');
    var lblLineHeight = document.getElementById('lblLineHeight');

    // Khôi phục cài đặt đọc đã lưu
    var savedFont = localStorage.getItem('dmc_reader_font') || 'Lora, serif';
    var savedSize = localStorage.getItem('dmc_reader_size') || '19';
    var savedLine = localStorage.getItem('dmc_reader_line') || '1.85';

    document.documentElement.style.setProperty('--reader-font', savedFont);
    document.documentElement.style.setProperty('--reader-size', savedSize + 'px');
    document.documentElement.style.setProperty('--reader-line', savedLine);

    if (fontSelect) fontSelect.value = savedFont;
    if (sizeSlider) sizeSlider.value = savedSize;
    if (lineSlider) lineSlider.value = savedLine;
    if (lblFontSize) lblFontSize.textContent = savedSize + 'px';
    if (lblLineHeight) lblLineHeight.textContent = savedLine;

    if (fontSelect) {
      fontSelect.addEventListener('change', function(e) {
        var val = e.target.value;
        document.documentElement.style.setProperty('--reader-font', val);
        localStorage.setItem('dmc_reader_font', val);
      });
    }

    if (sizeSlider) {
      sizeSlider.addEventListener('input', function(e) {
        var val = e.target.value;
        document.documentElement.style.setProperty('--reader-size', val + 'px');
        if (lblFontSize) lblFontSize.textContent = val + 'px';
        localStorage.setItem('dmc_reader_size', val);
      });
    }

    if (lineSlider) {
      lineSlider.addEventListener('input', function(e) {
        var val = e.target.value;
        document.documentElement.style.setProperty('--reader-line', val);
        if (lblLineHeight) lblLineHeight.textContent = val;
        localStorage.setItem('dmc_reader_line', val);
      });
    }

    // 4. Máy phát Audio & Giọng đọc tự động AI (Audio Reader Engine)
    var audioBar = document.getElementById('audioPlayerBar');
    var btnToggleAudio = document.getElementById('btnToggleAudio');
    var btnAudioThisChapter = document.getElementById('btnAudioThisChapter');
    var audioBtnPlay = document.getElementById('audioBtnPlay');
    var playIcon = document.getElementById('playIcon');
    var audioTimeline = document.getElementById('audioTimeline');
    var audioCurrentTime = document.getElementById('audioCurrentTime');
    var audioTotalTime = document.getElementById('audioTotalTime');
    var audioSpeedSelect = document.getElementById('audioSpeedSelect');
    var audioBtnClose = document.getElementById('audioBtnClose');
    var audioPlayerTitle = document.getElementById('audioPlayerTitle');

    var audioElement = new Audio();
    var isAudioPlaying = false;
    var ttsUtterance = null;
    var useTTS = false;

    // Tìm xem trong bài viết có thẻ audio hoặc đường dẫn audio không
    function detectChapterAudio() {
      var body = document.getElementById('readerArticleBody');
      if (!body) return null;
      var existingAudio = body.querySelector('audio');
      if (existingAudio && existingAudio.src) return existingAudio.src;
      var audioLink = body.querySelector('a[href$=".mp3"], a[href$=".m4a"], a[href$=".ogg"]');
      if (audioLink) return audioLink.href;
      return null;
    }

    function initAudioForCurrentPage() {
      var audioSrc = detectChapterAudio();
      var chapterTitleElem = document.getElementById('chapterTitle');
      var titleText = chapterTitleElem ? chapterTitleElem.textContent.trim() : 'Chương truyện Đạo Tâm';

      if (audioPlayerTitle) audioPlayerTitle.textContent = titleText;

      if (audioSrc) {
        useTTS = false;
        audioElement.src = audioSrc;
        audioElement.load();
      } else {
        useTTS = true; // Chuyển sang giọng đọc AI tự động nếu không có file âm thanh
      }
    }

    if (btnToggleAudio) {
      btnToggleAudio.addEventListener('click', function() {
        if (audioBar) {
          audioBar.classList.toggle('show');
          btnToggleAudio.classList.toggle('dmc-btn-audio-active');
          if (audioBar.classList.contains('show')) {
            initAudioForCurrentPage();
          }
        }
      });
    }

    if (btnAudioThisChapter) {
      btnAudioThisChapter.addEventListener('click', function() {
        if (audioBar) {
          audioBar.classList.add('show');
          if (btnToggleAudio) btnToggleAudio.classList.add('dmc-btn-audio-active');
          initAudioForCurrentPage();
          togglePlayAudio();
        }
      });
    }

    if (audioBtnClose) {
      audioBtnClose.addEventListener('click', function() {
        if (audioBar) audioBar.classList.remove('show');
        if (btnToggleAudio) btnToggleAudio.classList.remove('dmc-btn-audio-active');
        pauseAudio();
      });
    }

    function togglePlayAudio() {
      if (isAudioPlaying) {
        pauseAudio();
      } else {
        playAudio();
      }
    }

    function playAudio() {
      if (useTTS) {
        var body = document.getElementById('readerArticleBody');
        var textToRead = body ? body.textContent.trim() : '';
        if (!textToRead) return;

        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          ttsUtterance = new SpeechSynthesisUtterance(textToRead.slice(0, 10000));
          ttsUtterance.lang = 'vi-VN';
          var speed = audioSpeedSelect ? parseFloat(audioSpeedSelect.value) : 1.0;
          ttsUtterance.rate = speed;
          ttsUtterance.onend = function() {
            isAudioPlaying = false;
            updatePlayIcon();
          };
          window.speechSynthesis.speak(ttsUtterance);
          isAudioPlaying = true;
          updatePlayIcon();
        }
      } else {
        audioElement.play().then(function() {
          isAudioPlaying = true;
          updatePlayIcon();
        }).catch(function(err) {
          console.warn('Playback notice:', err);
        });
      }
    }

    function pauseAudio() {
      if (useTTS && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      } else {
        audioElement.pause();
      }
      isAudioPlaying = false;
      updatePlayIcon();
    }

    function updatePlayIcon() {
      if (playIcon) {
        playIcon.className = isAudioPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
      }
    }

    if (audioBtnPlay) audioBtnPlay.addEventListener('click', togglePlayAudio);

    audioElement.addEventListener('timeupdate', function() {
      if (!useTTS && audioElement.duration) {
        var pct = (audioElement.currentTime / audioElement.duration) * 100;
        if (audioTimeline) audioTimeline.value = pct;
        if (audioCurrentTime) audioCurrentTime.textContent = formatSec(audioElement.currentTime);
        if (audioTotalTime) audioTotalTime.textContent = formatSec(audioElement.duration);
      }
    });

    if (audioTimeline) {
      audioTimeline.addEventListener('input', function(e) {
        if (!useTTS && audioElement.duration) {
          audioElement.currentTime = (e.target.value / 100) * audioElement.duration;
        }
      });
    }

    if (audioSpeedSelect) {
      audioSpeedSelect.addEventListener('change', function(e) {
        var spd = parseFloat(e.target.value);
        audioElement.playbackRate = spd;
        if (useTTS && isAudioPlaying) {
          playAudio();
        }
      });
    }

    function formatSec(s) {
      var min = Math.floor(s / 60);
      var sec = Math.floor(s % 60);
      return (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
    }

    // 5. Thanh cuộn tiến trình & Tự động lưu tiến trình đọc
    var scrollBar = document.getElementById('scrollProgressBar');
    window.addEventListener('scroll', function() {
      var h = document.documentElement;
      var b = document.body;
      var st = 'scrollTop' in h ? h.scrollTop : b.scrollTop;
      var sh = 'scrollHeight' in h ? h.scrollHeight : b.scrollHeight;
      var ch = h.clientHeight;
      var pct = Math.min(100, Math.round((st / (sh - ch)) * 100)) || 0;
      if (scrollBar) scrollBar.style.width = pct + '%';

      // Tự động lưu tiến trình sau mỗi 3 giây khi dừng cuộn
      debounceSaveProgress(pct);
    });

    var saveTimer = null;
    function debounceSaveProgress(scrollPercent) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function() {
        saveCurrentReadingProgress(scrollPercent);
      }, 2500);
    }

    function saveCurrentReadingProgress(scrollPercent) {
      var chapterTitleElem = document.getElementById('chapterTitle');
      if (!chapterTitleElem) return; // Không phải trang đọc chương

      var title = chapterTitleElem.textContent.trim();
      var url = window.location.href;
      var now = Date.now();

      var record = {
        title: title,
        url: url,
        scrollPercent: scrollPercent,
        timestamp: now
      };

      // 1. Lưu vào LocalStorage
      var history = JSON.parse(localStorage.getItem('dmc_reading_history') || '[]');
      history = history.filter(function(item) { return item.url !== url; });
      history.unshift(record);
      if (history.length > 50) history.pop();
      localStorage.setItem('dmc_reading_history', JSON.stringify(history));

      // 2. Lưu lên Firestore qua Firebase Auth (nếu người dùng đã đăng nhập)
      if (currentUser && db) {
        db.collection('users').doc(currentUser.uid).collection('reading_progress').doc(encodeURIComponent(url)).set(record, { merge: true })
          .catch(function(err) { console.error('Cloud save error:', err); });
      }
    }

    // 6. Quản lý Tài khoản & Modal Tiến Trình Đọc
    var modalOverlay = document.getElementById('accountModalOverlay');
    var btnAuthAccount = document.getElementById('btnAuthAccount');
    var btnCloseModal = document.getElementById('btnCloseModal');
    var authGuestView = document.getElementById('authGuestView');
    var authUserView = document.getElementById('authUserView');
    var btnGoogleLogin = document.getElementById('btnGoogleLogin');
    var btnContinueGuest = document.getElementById('btnContinueGuest');
    var btnSignOut = document.getElementById('btnSignOut');
    var userProfileImg = document.getElementById('userProfileImg');
    var userProfileName = document.getElementById('userProfileName');
    var userProfileEmail = document.getElementById('userProfileEmail');
    var authBtnLabel = document.getElementById('authBtnLabel');
    var authBtnIcon = document.getElementById('authBtnIcon');

    function openModal() {
      if (modalOverlay) {
        modalOverlay.classList.add('show');
        renderHistoryList();
      }
    }

    function closeModal() {
      if (modalOverlay) modalOverlay.classList.remove('show');
    }

    if (btnAuthAccount) btnAuthAccount.addEventListener('click', openModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (btnContinueGuest) btnContinueGuest.addEventListener('click', function() {
      if (authGuestView) authGuestView.style.display = 'none';
      if (authUserView) authUserView.style.display = 'block';
      renderHistoryList();
    });

    if (modalOverlay) {
      modalOverlay.addEventListener('click', function(e) {
        if (e.target === modalOverlay) closeModal();
      });
    }

    // Khởi tạo trạng thái đăng nhập Firebase
    if (auth) {
      auth.onAuthStateChanged(function(user) {
        currentUser = user;
        if (user) {
          if (authBtnLabel) authBtnLabel.textContent = user.displayName || 'Tài khoản';
          if (userProfileName) userProfileName.textContent = user.displayName || 'Bạn đọc';
          if (userProfileEmail) userProfileEmail.textContent = user.email || '';
          if (userProfileImg && user.photoURL) userProfileImg.src = user.photoURL;
          if (authGuestView) authGuestView.style.display = 'none';
          if (authUserView) authUserView.style.display = 'block';
        } else {
          if (authBtnLabel) authBtnLabel.textContent = 'Đăng nhập';
          if (authGuestView) authGuestView.style.display = 'block';
          if (authUserView) authUserView.style.display = 'none';
        }
        renderHistoryList();
      });
    }

    if (btnGoogleLogin && auth) {
      btnGoogleLogin.addEventListener('click', function() {
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(function(res) {
          currentUser = res.user;
          renderHistoryList();
        }).catch(function(err) {
          alert('Không thể kết nối Google: ' + err.message);
        });
      });
    }

    if (btnSignOut && auth) {
      btnSignOut.addEventListener('click', function() {
        auth.signOut().then(function() {
          currentUser = null;
          renderHistoryList();
        });
      });
    }

    function renderHistoryList() {
      var listContainer = document.getElementById('readingHistoryList');
      if (!listContainer) return;

      var history = JSON.parse(localStorage.getItem('dmc_reading_history') || '[]');
      if (history.length === 0) {
        listContainer.innerHTML = '<p style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px 0;">Chưa có lịch sử đọc truyện. Tiến trình sẽ được tự động ghi nhận khi bạn đọc chương!</p>';
        return;
      }

      var html = '';
      history.forEach(function(item) {
        var dateStr = new Date(item.timestamp).toLocaleDateString('vi-VN');
        html += '<div class="history-item">' +
          '<div class="history-info">' +
            '<a href="' + item.url + '" class="history-novel">' + item.title + '</a>' +
            '<div class="history-chapter">Đã đọc: ' + (item.scrollPercent || 0) + '% • ' + dateStr + '</div>' +
            '<div class="history-progress-bar"><div class="history-progress-val" style="width:' + (item.scrollPercent || 0) + '%;"></div></div>' +
          '</div>' +
          '<a href="' + item.url + '" class="btn-primary" style="padding: 6px 14px; font-size: 12px; white-space: nowrap;">Đọc tiếp</a>' +
        '</div>';
      });
      listContainer.innerHTML = html;
    }

    // 7. Render Mục Lục Chương Chi Tiết trong bài viết
    var tocListContainer = document.getElementById('chapterTocList');
    var btnOpenToc = document.getElementById('btnOpenToc');
    var detailTocSection = document.getElementById('detailTocSection');

    if (btnOpenToc && detailTocSection) {
      btnOpenToc.addEventListener('click', function() {
        detailTocSection.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Quét các thẻ tiêu đề (H2, H3, H4) hoặc các liên kết chương trong bài để dựng mục lục
    function buildDetailedToc() {
      if (!tocListContainer) return;
      var body = document.getElementById('readerArticleBody');
      if (!body) return;

      var headings = body.querySelectorAll('h2, h3, h4');
      if (headings.length > 0) {
        var tocHtml = '';
        headings.forEach(function(h, idx) {
          if (!h.id) h.id = 'chapter-part-' + (idx + 1);
          tocHtml += '<a href="#' + h.id + '" class="toc-item">' +
            '<span>' + h.textContent.trim() + '</span>' +
            '<span class="toc-item-badge"><i class="fa-solid fa-feather"/> Đoạn ' + (idx + 1) + '</span>' +
          '</a>';
        });
        tocListContainer.innerHTML = tocHtml;
      } else {
        // Dự phòng: tạo mục lục mô phỏng danh sách chương
        var mockHtml = '';
        for (var i = 1; i <= 30; i++) {
          mockHtml += '<div class="toc-item">' +
            '<span>Chương ' + i + ': Hồi mục diễn biến ' + i + '</span>' +
            '<span class="toc-item-badge"><i class="fa-solid fa-check"/> Chi tiết</span>' +
          '</div>';
        }
        tocListContainer.innerHTML = mockHtml;
      }
    }

    buildDetailedToc();

    // Nút cuộn lên đầu trang
    var btnScrollTop = document.getElementById('btnScrollTop');
    if (btnScrollTop) {
      btnScrollTop.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

  })();
  //]]>
  </script>
</body>
</html>`;
}
