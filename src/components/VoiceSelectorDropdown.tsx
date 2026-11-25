import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Smartphone, UserRound } from 'lucide-react';
import {
  VOICE_SELECTOR_OPTIONS,
  getVoiceDisplayMeta,
  isDeviceFallbackVoice,
  normalizeEdgeVoiceId,
} from '../utils/rulesAndVoices';

interface VoiceSelectorDropdownProps {
  selectedVoiceId: string;
  onSelectVoice: (voiceId: string) => void;
  availableVoiceIds?: string[];
  direction?: 'up' | 'down';
  variant?: 'floatingBar' | 'readerHeader';
}

export const VoiceSelectorDropdown: React.FC<VoiceSelectorDropdownProps> = ({
  selectedVoiceId,
  onSelectVoice,
  availableVoiceIds,
  direction = 'up',
  variant = 'floatingBar',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleOptions = (VOICE_SELECTOR_OPTIONS || []).filter((opt) => {
    if (!Array.isArray(availableVoiceIds) || availableVoiceIds.length === 0) return true;
    return availableVoiceIds.includes(opt.id) || isDeviceFallbackVoice(opt.id);
  });

  const rawNormalized = normalizeEdgeVoiceId(selectedVoiceId);
  const normalizedSelected = visibleOptions.some((o) => o.id === rawNormalized)
    ? rawNormalized
    : visibleOptions[0]?.id || 'device-fallback';
  const activeMeta = getVoiceDisplayMeta(normalizedSelected);
  const isFallbackActive = isDeviceFallbackVoice(normalizedSelected);
  const isFemaleActive = normalizedSelected === 'vi-VN-HoaiMyNeural';

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleChoose = (voiceId: string) => {
    setIsOpen(false);
    onSelectVoice(voiceId);
  };

  const triggerClasses =
    variant === 'readerHeader'
      ? `min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap border ${
          isFallbackActive
            ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            : isFemaleActive
            ? 'bg-pink-50 dark:bg-pink-950/50 border-pink-200 dark:border-pink-800 text-pink-700 dark:text-pink-200'
            : 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-200'
        }`
      : `w-full min-h-[44px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-1.5 transition-all cursor-pointer border ${
          isFallbackActive
            ? 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            : isFemaleActive
            ? 'bg-pink-50/80 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800 text-pink-900 dark:text-pink-100 hover:bg-pink-100/80 dark:hover:bg-pink-950/60'
            : 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-100 hover:bg-sky-100/80 dark:hover:bg-sky-950/60'
        }`;

  const menuPositionClasses =
    direction === 'up'
      ? 'absolute bottom-full left-0 w-[min(calc(100vw-24px),18rem)] mb-2'
      : 'fixed left-3 right-3 top-[54px] max-w-[calc(100vw-24px)] mx-auto sm:mx-0 sm:absolute sm:top-full sm:right-0 sm:left-auto sm:w-72 sm:mt-2';

  const renderVoiceIcon = (id: string, sizeClass = 'w-3.5 h-3.5') => {
    if (isDeviceFallbackVoice(id)) {
      return <Smartphone className={`${sizeClass} text-amber-600 dark:text-amber-400 shrink-0`} />;
    }
    const isFemale = id === 'vi-VN-HoaiMyNeural';
    return (
      <UserRound
        className={`${sizeClass} shrink-0 ${
          isFemale ? 'text-pink-600 dark:text-pink-400' : 'text-sky-600 dark:text-sky-400'
        }`}
      />
    );
  };

  return (
    <div ref={containerRef} className={`relative ${variant === 'floatingBar' ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={triggerClasses}
        title={`Giọng đọc hiện tại: ${activeMeta.label}`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {renderVoiceIcon(normalizedSelected)}
          <span className="truncate">{activeMeta.shortLabel}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Chọn giọng đọc"
          className={`${menuPositionClasses} z-50 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150`}
        >
          {(visibleOptions || []).map((opt) => {
            const isSelected = opt.id === normalizedSelected;
            const isDevice = isDeviceFallbackVoice(opt.id);
            const isFemale = opt.id === 'vi-VN-HoaiMyNeural';

            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleChoose(opt.id)}
                className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                  isSelected
                    ? isDevice
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-950 dark:text-amber-100 border border-amber-200 dark:border-amber-800'
                      : isFemale
                      ? 'bg-pink-50 dark:bg-pink-950/50 text-pink-950 dark:text-pink-100 border border-pink-200 dark:border-pink-800'
                      : 'bg-sky-50 dark:bg-sky-950/50 text-sky-950 dark:text-sky-100 border border-sky-200 dark:border-sky-800'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isDevice
                        ? 'bg-amber-100 dark:bg-amber-900/60'
                        : isFemale
                        ? 'bg-pink-100 dark:bg-pink-900/60'
                        : 'bg-sky-100 dark:bg-sky-900/60'
                    }`}
                  >
                    {renderVoiceIcon(opt.id, 'w-4 h-4')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold leading-snug break-words">{opt.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 break-words">
                      {opt.subtitle}
                    </div>
                  </div>
                </span>
                {isSelected && (
                  <Check
                    className={`w-4 h-4 shrink-0 ${
                      isDevice
                        ? 'text-amber-600 dark:text-amber-400'
                        : isFemale
                        ? 'text-pink-600 dark:text-pink-400'
                        : 'text-sky-600 dark:text-sky-400'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
