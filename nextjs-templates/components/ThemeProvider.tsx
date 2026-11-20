'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type AppTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: AppTheme;
  isMounted: boolean;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  isMounted: false,
  setTheme: () => {},
  toggleTheme: () => {},
});

const THEME_STORAGE_KEYS = ['daotam_theme', 'theme'] as const;

function applyThemeToDocument(nextTheme: AppTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (nextTheme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Luôn khởi tạo 'light' để khớp 100% với SSR HTML (<html className="light">)
  const [theme, setThemeState] = useState<AppTheme>('light');
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // CHỈ đọc localStorage & window sau khi component đã mount trên Client
  useEffect(() => {
    let resolved: AppTheme = 'light';
    try {
      for (const key of THEME_STORAGE_KEYS) {
        const stored = window.localStorage.getItem(key);
        if (stored === 'dark' || stored === 'light') {
          resolved = stored;
          break;
        }
      }
    } catch {
      resolved = 'light';
    }

    setThemeState(resolved);
    applyThemeToDocument(resolved);
    setIsMounted(true);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'daotam_theme' || e.key === 'theme') {
        const next: AppTheme = e.newValue === 'dark' ? 'dark' : 'light';
        setThemeState(next);
        applyThemeToDocument(next);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    applyThemeToDocument(nextTheme);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('daotam_theme', nextTheme);
        window.localStorage.setItem('theme', nextTheme);
      } catch {
        // Bỏ qua nếu trình duyệt chặn storage hoặc đầy quota
      }
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: AppTheme = prev === 'dark' ? 'light' : 'dark';
      applyThemeToDocument(next);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('daotam_theme', next);
          window.localStorage.setItem('theme', next);
        } catch {}
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, isMounted, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
