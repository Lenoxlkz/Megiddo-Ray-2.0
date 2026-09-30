'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useI18n } from './I18nProvider';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';

export function TerminalTitle() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const text = t('appTitle');
  const [displayedLength, setDisplayedLength] = useState(text.length);

  useEffect(() => {
    let current = 0;
    const timer = setInterval(() => {
      current++;
      setDisplayedLength(current);
      if (current >= text.length) {
        clearInterval(timer);
      }
    }, 50);

    return () => {
      clearInterval(timer);
    };
  }, [text]);

  const displayedText = text.slice(0, displayedLength);

  return (
    <div className={cn(
      "flex items-center justify-center text-center whitespace-nowrap text-xl sm:text-2xl md:text-3xl font-bold font-mono tracking-tight mb-2 select-none transition-colors duration-300",
      isLight ? "text-neutral-950" : "text-white"
    )}>
      <span className="text-emerald-500 mr-2 sm:mr-2.5 shrink-0">~</span>
      <span className="text-emerald-400 mr-1.5 sm:mr-2 shrink-0">/</span>
      <span className={cn(
        "bg-clip-text text-transparent truncate",
        isLight 
          ? "bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-800"
          : "bg-gradient-to-r from-white via-white/95 to-white/70"
      )}>
        {displayedText}
      </span>
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        className="inline-block w-2 sm:w-2.5 h-5 sm:h-7 bg-emerald-500 ml-1.5 translate-y-0.5 shrink-0"
      />
    </div>
  );
}
