'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * ==============================================================================
 * HOOK QUẢN LÝ TÙY CHỈNH ĐỌC TRUYỆN CỤC BỘ (LOCAL SETTINGS ONLY)
 * ==============================================================================
 * - Lưu trữ hoàn toàn trong `localStorage` của trình duyệt người dùng.
 * - TUYỆT ĐỐI KHÔNG gửi/ghi dữ liệu cá nhân hóa giao diện lên Firestore
 *   nhằm tiết kiệm 100% lượt Ghi (Writes) cho hệ thống.
 * ==============================================================================
 */

export type ReaderFontFamily = 'be-vietnam' | 'lora' | 'merriweather' | 'system';
export type ReaderTheme = 'light' | 'sepia' | 'dark';

export interface LocalReaderSettings {
  fontSize: number; // 14 - 28px
  fontFamily: ReaderFontFamily;
  lineHeight: number; // 1.4 - 2.4
  theme: ReaderTheme;
}

export const READER_SETTINGS_STORAGE_KEY = 'daotam_reader_settings';

export const DEFAULT_READER_SETTINGS: LocalReaderSettings = {
  fontSize: 18,
  fontFamily: 'be-vietnam',
  lineHeight: 1.85,
  theme: 'light',
};

export const READER_FONT_OPTIONS: Array<{
  id: ReaderFontFamily;
  label: string;
  preview: string;
  cssFamily: string;
}> = [
  {
    id: 'be-vietnam',
    label: 'Be Vietnam Pro',
    preview: 'Hiện đại, rõ nét',
    cssFamily: "'Be Vietnam Pro', 'Inter', system-ui, -apple-system, sans-serif",
  },
  {
    id: 'lora',
    label: 'Lora Serif',
    preview: 'Văn học cổ điển',
    cssFamily: "'Lora', Georgia, Cambria, 'Times New Roman', serif",
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    preview: 'Êm mắt đọc lâu',
    cssFamily: "'Merriweather', Georgia, serif",
  },
  {
    id: 'system',
    label: 'Chữ Hệ Thống',
    preview: 'Nhẹ, mặc định máy',
    cssFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
];

export const READER_LINE_HEIGHT_PRESETS: Array<{ value: number; label: string }> = [
  { value: 1.5, label: 'Gọn (1.5)' },
  { value: 1.75, label: 'Vừa (1.75)' },
  { value: 1.85, label: 'Chuẩn (1.85)' },
  { value: 2.15, label: 'Thoáng (2.15)' },
];

export function getFontFamilyCss(fontFamily: ReaderFontFamily): string {
  const found = READER_FONT_OPTIONS.find((f) => f.id === fontFamily);
  return found ? found.cssFamily : READER_FONT_OPTIONS[0].cssFamily;
}

function clampFontSize(val: unknown): number {
  const num = Number(val);
  if (Number.isNaN(num)) return DEFAULT_READER_SETTINGS.fontSize;
  return Math.min(28, Math.max(14, Math.round(num)));
}

function clampLineHeight(val: unknown): number {
  const num = Number(val);
  if (Number.isNaN(num)) return DEFAULT_READER_SETTINGS.lineHeight;
  return Math.min(2.4, Math.max(1.4, Number(num.toFixed(2))));
}

function normalizeFontFamily(val: unknown): ReaderFontFamily {
  if (val === 'be-vietnam' || val === 'vietnam') return 'be-vietnam';
  if (val === 'lora') return 'lora';
  if (val === 'merriweather') return 'merriweather';
  if (val === 'system' || val === 'sans') return 'system';
  return DEFAULT_READER_SETTINGS.fontFamily;
}

function normalizeTheme(val: unknown): ReaderTheme {
  if (val === 'light' || val === 'sepia' || val === 'dark') return val;
  if (val === 'midnight') return 'dark';
  return DEFAULT_READER_SETTINGS.theme;
}

function readLocalSettings(): LocalReaderSettings {
  if (typeof window === 'undefined') return DEFAULT_READER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(READER_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_READER_SETTINGS;

    return {
      fontSize: clampFontSize(parsed.fontSize),
      fontFamily: normalizeFontFamily(parsed.fontFamily),
      lineHeight: clampLineHeight(parsed.lineHeight),
      theme: normalizeTheme(parsed.theme),
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

function writeLocalSettings(settings: LocalReaderSettings): void {
  if (typeof window === 'undefined') return;
  try {
    // Gộp giữ nguyên các trường audio (selectedVoiceId, voiceSpeed, autoNextChapter) nếu đã có
    const existingRaw = window.localStorage.getItem(READER_SETTINGS_STORAGE_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const merged = {
      ...(existing && typeof existing === 'object' ? existing : {}),
      fontSize: clampFontSize(settings.fontSize),
      fontFamily: settings.fontFamily,
      lineHeight: clampLineHeight(settings.lineHeight),
      theme: settings.theme,
    };
    window.localStorage.setItem(READER_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Bỏ qua lỗi quota hoặc private mode của trình duyệt
  }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<LocalReaderSettings>(DEFAULT_READER_SETTINGS);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // Nạp từ localStorage sau khi mount để tránh Hydration Mismatch giữa SSR và Client
  useEffect(() => {
    setSettings(readLocalSettings());
    setIsHydrated(true);

    // Đồng bộ giữa các tab cùng mở trình duyệt
    const handleStorage = (e: StorageEvent) => {
      if (e.key === READER_SETTINGS_STORAGE_KEY) {
        setSettings(readLocalSettings());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const updateSettings = useCallback(
    (
      updater:
        | Partial<LocalReaderSettings>
        | ((prev: LocalReaderSettings) => LocalReaderSettings)
    ) => {
      setSettings((prev) => {
        const nextRaw = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        const next: LocalReaderSettings = {
          fontSize: clampFontSize(nextRaw.fontSize),
          fontFamily: normalizeFontFamily(nextRaw.fontFamily),
          lineHeight: clampLineHeight(nextRaw.lineHeight),
          theme: normalizeTheme(nextRaw.theme),
        };
        writeLocalSettings(next);
        return next;
      });
    },
    []
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_READER_SETTINGS);
    writeLocalSettings(DEFAULT_READER_SETTINGS);
  }, []);

  return {
    settings,
    isHydrated,
    fontFamilyCss: getFontFamilyCss(settings.fontFamily),
    updateSettings,
    resetSettings,
  };
}
