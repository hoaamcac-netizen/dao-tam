import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Volume2, Smartphone } from 'lucide-react';
import {
  VOICE_SELECTOR_OPTIONS,
  getVoiceDisplayMeta,
  isDeviceFallbackVoice,
  normalizeEdgeVoiceId,
} from '../utils/rulesAndVoices';

interface VoiceSelectorDropdownProps {
  selectedVoiceId: string;
  onSelectVoice: (voiceId: string) => void;
  direction?: 'up' | 'down';
  variant?: 'floatingBar' | 'readerHeader';
}

export const VoiceSelectorDropdown: React.FC<VoiceSelectorDropdownProps> = ({
  selectedVoiceId,
  onSelectVoice,
  direction = 'up',
  variant = 'floatingBar',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedSelected = normalizeEdgeVoiceId(selectedVoiceId);
  const activeMeta = getVoiceDisplayMeta(normalizedSelected);
  const isFallbackActive = isDeviceFallbackVoice(normalizedSelected);

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
      ? `px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap border ${
          isFallbackActive
            ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            : 'bg-slate-100 dark:bg-slate-800 border-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
        }`
      : `w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer border ${
          isFallbackActive
            ? 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            : 'bg-pink-50/80 dark:bg-slate-800 border-pink-100 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-pink-100/80 dark:hover:bg-slate-700'
        }`;

  const menuPositionClasses =
    direction === 'up'
      ? 'bottom-full left-0 right-0 sm:left-0 sm:right-auto sm:w-72 mb-2'
      : 'top-full right-0 w-[min(18rem,calc(100vw-1rem))] mt-2';

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
          {isFallbackActive ? (
            <Smartphone className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <Volume2
              className={`w-3.5 h-3.5 shrink-0 ${
                variant === 'readerHeader'
                  ? 'text-blue-600 dark:text-cyan-400'
                  : 'text-pink-600 dark:text-pink-400'
              }`}
            />
          )}
          <span className="truncate max-w-[90px] sm:max-w-none">
            {variant === 'readerHeader' ? activeMeta.shortLabel : `Giọng: ${activeMeta.label}`}
          </span>
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
          className={`absolute ${menuPositionClasses} z-50 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150`}
        >
          {(VOICE_SELECTOR_OPTIONS || []).map((opt) => {
            const isSelected = opt.id === normalizedSelected;
            const isDevice = isDeviceFallbackVoice(opt.id);

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
                      : 'bg-pink-50 dark:bg-pink-950/50 text-pink-950 dark:text-pink-100 border border-pink-200 dark:border-pink-800'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold leading-snug truncate">{opt.label}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                    {opt.subtitle}
                  </div>
                </div>
                {isSelected && (
                  <Check
                    className={`w-4 h-4 shrink-0 ${
                      isDevice
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-pink-600 dark:text-pink-400'
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
