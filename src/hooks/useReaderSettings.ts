import { useState, useEffect, useCallback } from 'react';
import { ReaderSettings } from '../types';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

/**
 * ==============================================================================
 * HOOK QUẢN LÝ TÙY CHỈNH ĐỌC TRUYỆN CỤC BỘ (LOCAL STORAGE ONLY)
 * ==============================================================================
 * - Lưu Cỡ chữ, Font chữ, Dãn dòng và Màu nền hoàn toàn dưới `localStorage`.
 * - TUYỆT ĐỐI KHÔNG ghi lên Firestore để tiết kiệm 100% lượt Write.
 * ==============================================================================
 */

export const READER_SETTINGS_KEY = 'daotam_reader_settings';

export const DEFAULT_LOCAL_READER_SETTINGS: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.85,
  fontFamily: 'vietnam',
  theme: 'dark',
  autoScroll: false,
  autoNextChapter: true,
  voiceSpeed: 1.0,
  selectedVoiceId: 'vi-VN-NamMinhNeural',
  autoHighlight: true,
  audioEngine: 'native',
};

export const FONT_FAMILY_OPTIONS: Array<{
  id: ReaderSettings['fontFamily'];
  label: string;
  cssFamily: string;
}> = [
  {
    id: 'vietnam',
    label: 'Be Vietnam Pro',
    cssFamily: "'Be Vietnam Pro', 'Inter', system-ui, sans-serif",
  },
  {
    id: 'lora',
    label: 'Lora (Có chân)',
    cssFamily: "'Lora', Georgia, serif",
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    cssFamily: "'Merriweather', Georgia, serif",
  },
  {
    id: 'sans',
    label: 'Hệ thống',
    cssFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
];

export function resolveReaderFontCss(fontFamily?: ReaderSettings['fontFamily']): string {
  const match = FONT_FAMILY_OPTIONS.find((f) => f.id === fontFamily);
  return match ? match.cssFamily : FONT_FAMILY_OPTIONS[0].cssFamily;
}

export function loadLocalReaderSettings(): ReaderSettings {
  try {
    const raw = safeGetItem(READER_SETTINGS_KEY);
    if (!raw) return DEFAULT_LOCAL_READER_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_LOCAL_READER_SETTINGS;
    return {
      ...DEFAULT_LOCAL_READER_SETTINGS,
      ...parsed,
      fontSize: Math.min(28, Math.max(14, Number(parsed.fontSize) || 19)),
      lineHeight: Math.min(2.4, Math.max(1.4, Number(parsed.lineHeight) || 1.85)),
    };
  } catch {
    return DEFAULT_LOCAL_READER_SETTINGS;
  }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_LOCAL_READER_SETTINGS);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setSettings(loadLocalReaderSettings());
    setIsMounted(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === READER_SETTINGS_KEY) {
        setSettings(loadLocalReaderSettings());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const updateSettings = useCallback(
    (updater: Partial<ReaderSettings> | ((prev: ReaderSettings) => ReaderSettings)) => {
      setSettings((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        safeSetItem(READER_SETTINGS_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  return {
    settings,
    isMounted,
    fontFamilyCss: resolveReaderFontCss(settings.fontFamily),
    updateSettings,
  };
}
