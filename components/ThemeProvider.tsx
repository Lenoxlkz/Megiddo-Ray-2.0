'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore } from 'react';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
});

let memoryTheme: ThemeMode = 'dark';
const themeListeners: Array<() => void> = [];

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem('liquid_theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) {
    // ignore
  }
  return 'dark';
}

function subscribeTheme(callback: () => void) {
  themeListeners.push(callback);
  return () => {
    const idx = themeListeners.indexOf(callback);
    if (idx !== -1) themeListeners.splice(idx, 1);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const currentTheme = useSyncExternalStore(
    subscribeTheme,
    getStoredTheme,
    () => 'dark' as ThemeMode
  );

  const applyThemeToDOM = useCallback((mode: ThemeMode) => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', mode);
    document.body.setAttribute('data-theme', mode);
    if (mode === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    }
  }, []);

  useEffect(() => {
    applyThemeToDOM(currentTheme);
  }, [currentTheme, applyThemeToDOM]);

  const setTheme = useCallback((mode: ThemeMode) => {
    try {
      localStorage.setItem('liquid_theme', mode);
    } catch (e) {
      console.error(e);
    }
    applyThemeToDOM(mode);
    themeListeners.forEach((fn) => fn());
  }, [applyThemeToDOM]);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [currentTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
