'use client';

import React from 'react';
import {
  LocalReaderSettings,
  READER_FONT_OPTIONS,
  READER_LINE_HEIGHT_PRESETS,
  ReaderFontFamily,
  ReaderTheme,
} from '../hooks/useReaderSettings';
import { Type, AlignJustify, Palette, RotateCcw, X, HardDrive, Minus, Plus } from 'lucide-react';

interface ReaderSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LocalReaderSettings;
  onUpdateSettings: (partial: Partial<LocalReaderSettings>) => void;
  onResetSettings: () => void;
}

export function ReaderSettingsPanel({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
}: ReaderSettingsPanelProps) {
  if (!isOpen) return null;

  const themes: Array<{ id: ReaderTheme; label: string; sampleClass: string }> = [
    { id: 'light', label: 'Nền Sáng', sampleClass: 'bg-white text-slate-900 border-slate-200' },
    { id: 'sepia', label: 'Giấy Ấm', sampleClass: 'bg-[#f8f3e6] text-[#3a2c1a] border-amber-300/80' },
    { id: 'dark', label: 'Ban Đêm', sampleClass: 'bg-slate-900 text-slate-100 border-slate-700' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="relative z-10 w-full sm:max-w-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-pink-100 dark:border-pink-950/60 p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pink-100 dark:border-slate-800 pb-3.5">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Type className="w-4 h-4 text-pink-600" />
              <span>Tùy Chỉnh Giao Diện Đọc</span>
            </h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
              <HardDrive className="w-3 h-3" />
              <span>Lưu trực tiếp trên trình duyệt (localStorage)</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label="Đóng cài đặt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Cỡ chữ */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-pink-500" />
              Cỡ chữ
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/70 text-pink-600 dark:text-pink-300 font-extrabold">
              {settings.fontSize}px
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })}
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-pink-100 dark:hover:bg-pink-950/60 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold cursor-pointer transition"
              title="Giảm cỡ chữ"
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={14}
              max={28}
              step={1}
              value={settings.fontSize}
              onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
              className="flex-1 accent-pink-600 cursor-pointer"
            />
            <button
              type="button"
              onClick={() => onUpdateSettings({ fontSize: Math.min(28, settings.fontSize + 1) })}
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-pink-100 dark:hover:bg-pink-950/60 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold cursor-pointer transition"
              title="Tăng cỡ chữ"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Font chữ */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Font chữ đọc truyện</div>
          <div className="grid grid-cols-2 gap-2">
            {(READER_FONT_OPTIONS || []).map((font) => {
              const isSelected = settings.fontFamily === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => onUpdateSettings({ fontFamily: font.id as ReaderFontFamily })}
                  style={{ fontFamily: font.cssFamily }}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    isSelected
                      ? 'border-pink-600 bg-pink-50/80 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300 ring-1 ring-pink-500'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-pink-300'
                  }`}
                >
                  <div className="text-xs font-bold truncate">{font.label}</div>
                  <div className="text-[11px] opacity-75 truncate">{font.preview}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Dãn dòng */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <AlignJustify className="w-3.5 h-3.5 text-pink-500" />
              Dãn dòng
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/70 text-pink-600 dark:text-pink-300 font-extrabold">
              {settings.lineHeight}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {(READER_LINE_HEIGHT_PRESETS || []).map((preset) => {
              const active = Math.abs(settings.lineHeight - preset.value) < 0.05;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onUpdateSettings({ lineHeight: preset.value })}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    active
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <input
            type="range"
            min={1.4}
            max={2.4}
            step={0.05}
            value={settings.lineHeight}
            onChange={(e) => onUpdateSettings({ lineHeight: Number(e.target.value) })}
            className="w-full accent-pink-600 cursor-pointer"
          />
        </div>

        {/* 4. Màu nền đọc */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-pink-500" />
            Màu nền trang đọc
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(themes || []).map((th) => {
              const active = settings.theme === th.id;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => onUpdateSettings({ theme: th.id })}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${th.sampleClass} ${
                    active ? 'ring-2 ring-pink-600' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  {th.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onResetSettings}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold shadow-md shadow-pink-500/20 transition cursor-pointer"
          >
            Áp dụng &amp; Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
