'use client';

import React, { useState, useCallback, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useI18n, Language } from '@/components/I18nProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useAlerts } from '@/components/AlertsProvider';
import { Globe, Sparkles, Check, Sun, Moon, ChevronRight, ChevronLeft, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Ripple {
  id: number;
  x: number;
  y: number;
}

const capsuleListeners = new Set<() => void>();

function getCapsuleCollapsedSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem('liquid_lang_capsule_collapsed');
    return saved === 'true';
  } catch {
    return false;
  }
}

function getCapsuleCollapsedServerSnapshot(): boolean {
  return false;
}

function subscribeCapsuleCollapsed(callback: () => void) {
  capsuleListeners.add(callback);
  return () => {
    capsuleListeners.delete(callback);
  };
}

function setCapsuleCollapsed(collapsed: boolean) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('liquid_lang_capsule_collapsed', String(collapsed));
    }
  } catch {}
  capsuleListeners.forEach((fn) => fn());
}

export function LanguageCapsule() {
  const { language, setLanguage, toggleLanguage, t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { systemState, togglePanel, unreadCount } = useAlerts();
  const isLight = theme === 'light';

  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [isWaving, setIsWaving] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isCollapsed = useSyncExternalStore(
    subscribeCapsuleCollapsed,
    getCapsuleCollapsedSnapshot,
    getCapsuleCollapsedServerSnapshot
  );

  const handleToggleCollapse = (collapsed: boolean) => {
    setCapsuleCollapsed(collapsed);
  };

  const triggerWaterWave = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    // Generate ripple at click coordinate or center of button
    const rect = e?.currentTarget?.getBoundingClientRect();
    const x = rect && e ? e.clientX - rect.left : 40;
    const y = rect && e ? e.clientY - rect.top : 80;

    const newRipple: Ripple = {
      id: Date.now() + Math.random(),
      x,
      y
    };

    setRipples((prev) => [...prev.slice(-2), newRipple]);
    setIsWaving(true);

    // Auto clear ripple after animation
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 700);

    setTimeout(() => {
      setIsWaving(false);
    }, 900);
  }, []);

  const handleSelectLanguage = (targetLang: Language, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (language !== targetLang) {
      triggerWaterWave(e);
      setLanguage(targetLang);
    } else {
      triggerWaterWave(e);
    }
  };

  return (
    <aside 
      id="language-capsule-container"
      aria-label="Language and theme preferences"
      className="fixed right-2.5 sm:right-4 top-1/2 -translate-y-1/2 z-50 select-none pointer-events-auto"
    >
      {/* Dynamic Concentric Water Wave Rings */}
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.div
            key={ripple.id}
            initial={{ scale: 0.2, opacity: 0.8, borderWidth: '2px' }}
            animate={{ scale: 2.2, opacity: 0, borderWidth: '1px' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="absolute rounded-full border border-cyan-400/70 bg-cyan-400/10 pointer-events-none -z-10 shadow-[0_0_20px_rgba(6,182,212,0.35)]"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: 100,
              height: 100,
              marginLeft: -50,
              marginTop: -50,
            }}
          />
        ))}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* 1. MODO DISMINUIDO (COLAPSADO / MINIMIZADO): No interrumpe la vista */}
        {isCollapsed ? (
          <motion.div
            key="capsule-collapsed"
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="relative"
          >
            <motion.button
              id="expand-language-capsule-btn"
              type="button"
              onClick={() => handleToggleCollapse(false)}
              whileHover={{ scale: 1.05, x: -2 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex flex-col items-center gap-2 py-2.5 px-2 rounded-2xl border transition-all duration-300 shadow-2xl backdrop-blur-xl cursor-pointer group select-none",
                isLight
                  ? "bg-white/95 border-emerald-600/30 text-emerald-900 shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:border-emerald-500"
                  : "staros-glass border-cyan-400/40 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:border-cyan-400/80 hover:shadow-[0_0_25px_rgba(6,182,212,0.45)]"
              )}
              title={language === 'es' ? 'Desplegar panel de idioma y tema' : 'Expand language & theme panel'}
              aria-label="Expand language and theme panel"
            >
              {/* Botón de Desplegar */}
              <div className={cn(
                "p-1 rounded-full transition-transform group-hover:scale-110",
                isLight ? "bg-emerald-500/20 text-emerald-800" : "bg-cyan-400/15 text-cyan-300"
              )}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </div>

              {/* Icono de Globo */}
              <Globe className="w-3.5 h-3.5 opacity-80" />

              {/* Indicador de Idioma Actual */}
              <span className={cn(
                "text-[10px] font-black tracking-wider font-mono px-1 py-0.5 rounded",
                isLight ? "bg-emerald-100 text-emerald-950" : "bg-white/10 text-white"
              )}>
                {language.toUpperCase()}
              </span>

              {/* Indicador de Tema Actual */}
              <div className="opacity-90">
                {theme === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-amber-300" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-emerald-700" />
                )}
              </div>

              {/* Baliza Viva de Alertas en modo colapsado */}
              <div
                className="relative flex items-center justify-center p-1 cursor-pointer my-0.5 hover:scale-125 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePanel();
                }}
                title={
                  systemState === 'critical'
                    ? (language === 'es' ? 'Falla Crítica detectada (Clic para ver)' : 'Critical failure detected (Click to view)')
                    : systemState === 'warning'
                    ? (language === 'es' ? 'Inferencia u Obstrucción activa (Clic para ver)' : 'Inference / Obstruction active (Click to view)')
                    : (language === 'es' ? 'Sistema Estable (Clic para ver alertas)' : 'System Stable (Click to view alerts)')
                }
              >
                {systemState === 'critical' && (
                  <>
                    <span className="absolute inline-flex h-3 w-3 rounded-full bg-rose-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)]" />
                  </>
                )}
                {systemState === 'warning' && (
                  <>
                    <span className="absolute inline-flex h-3 w-3 rounded-full bg-amber-400 opacity-75 animate-pulse" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                  </>
                )}
                {systemState === 'stable' && (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" />
                )}
              </div>

              {/* Texto Vertical Sutil "Desplegar" */}
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-wider py-1 opacity-70 group-hover:opacity-100 [writing-mode:vertical-lr] rotate-180",
                isLight ? "text-neutral-700" : "text-cyan-200"
              )}>
                {language === 'es' ? 'Desplegar' : 'Expand'}
              </span>
            </motion.button>
          </motion.div>
        ) : (
          /* 2. MODO DESPLEGADO VERTICAL: Panel Completo en el Lateral Derecho Medio */
          <motion.div
            key="capsule-expanded"
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={cn(
              "relative flex flex-col items-center gap-2 p-2 rounded-2xl border transition-all duration-300 shadow-2xl backdrop-blur-xl select-none w-[76px]",
              isLight
                ? "bg-white/95 border-emerald-600/30 shadow-[0_12px_32px_rgba(0,0,0,0.15)] text-neutral-900"
                : "staros-glass border-white/20 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.25),0_12px_30px_rgba(0,0,0,0.45)] text-neutral-100",
              isWaving && "border-cyan-400/80 shadow-[0_0_25px_rgba(6,182,212,0.4)] ring-2 ring-cyan-400/30"
            )}
          >
            {/* Header: Botón de Disminuir (Minimizar) con Icono ChevronRight */}
            <div className="w-full flex items-center justify-between pb-1.5 border-b border-white/10 dark:border-white/10 light:border-black/10">
              <div className="flex items-center gap-1 pl-0.5">
                <motion.div
                  animate={isWaving ? { rotate: [0, -15, 15, -10, 10, 0], scale: [1, 1.2, 1] } : { rotate: 0, scale: 1 }}
                  transition={{ duration: 0.6 }}
                  className="relative cursor-pointer"
                  onClick={() => toggleLanguage()}
                  title={language === 'es' ? 'Alternar Idioma' : 'Toggle Language'}
                >
                  <Globe className={cn(
                    "w-3.5 h-3.5",
                    isLight ? "text-emerald-700" : "text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.7)]"
                  )} />
                  {isWaving && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1.4, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute -top-1 -right-1"
                    >
                      <Sparkles className="w-2 h-2 text-emerald-300 animate-spin" />
                    </motion.div>
                  )}
                </motion.div>
              </div>

              {/* Botón de Disminuir */}
              <button
                id="collapse-language-capsule-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCollapse(true);
                }}
                className={cn(
                  "p-1 rounded-lg transition-all cursor-pointer flex items-center justify-center",
                  isLight
                    ? "bg-black/5 hover:bg-black/10 text-neutral-700 hover:text-neutral-950"
                    : "bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white"
                )}
                title={language === 'es' ? 'Disminuir para no interrumpir la vista' : 'Minimize to avoid blocking the view'}
                aria-label="Collapse panel"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Opciones de Idioma en Columna Vertical: ES & EN */}
            <div className={cn(
              "flex flex-col items-center gap-1 w-full p-1 rounded-xl border relative z-10",
              isLight ? "bg-black/[0.04] border-black/10" : "bg-white/[0.04] border-white/10"
            )}>
              {/* Opción Español */}
              <button
                id="lang-es-btn"
                type="button"
                onClick={(e) => handleSelectLanguage('es', e)}
                className={cn(
                  "relative w-full py-1.5 px-1 rounded-lg text-[11px] font-bold tracking-wider transition-all duration-200 flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none",
                  language === 'es' 
                    ? (isLight ? "text-emerald-950 font-black" : "text-white") 
                    : (isLight ? "text-neutral-600 hover:text-neutral-950" : "text-neutral-400 hover:text-white")
                )}
                title={t('spanish')}
              >
                {language === 'es' && (
                  <motion.div
                    layoutId="active-language-fluid-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    className={cn(
                      "absolute inset-0 rounded-lg -z-10 shadow-sm border",
                      isLight 
                        ? "bg-emerald-500/25 border-emerald-600/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]"
                        : "bg-gradient-to-b from-emerald-500/90 to-cyan-500/90 shadow-[0_0_12px_rgba(16,185,129,0.4)] border-white/25"
                    )}
                  />
                )}
                <span>ES</span>
                {language === 'es' && (
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                )}
              </button>

              {/* Opción Inglés */}
              <button
                id="lang-en-btn"
                type="button"
                onClick={(e) => handleSelectLanguage('en', e)}
                className={cn(
                  "relative w-full py-1.5 px-1 rounded-lg text-[11px] font-bold tracking-wider transition-all duration-200 flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none",
                  language === 'en' 
                    ? (isLight ? "text-cyan-950 font-black" : "text-white") 
                    : (isLight ? "text-neutral-600 hover:text-neutral-950" : "text-neutral-400 hover:text-white")
                )}
                title={t('english')}
              >
                {language === 'en' && (
                  <motion.div
                    layoutId="active-language-fluid-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    className={cn(
                      "absolute inset-0 rounded-lg -z-10 shadow-sm border",
                      isLight 
                        ? "bg-cyan-500/25 border-cyan-600/40 shadow-[0_0_8px_rgba(6,182,212,0.25)]"
                        : "bg-gradient-to-b from-cyan-500/90 to-blue-500/90 shadow-[0_0_12px_rgba(6,182,212,0.4)] border-white/25"
                    )}
                  />
                )}
                <span>EN</span>
                {language === 'en' && (
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                )}
              </button>
            </div>

            {/* Separador Horizontal Sutil */}
            <div className={cn(
              "w-6 h-px my-0.5 shrink-0",
              isLight ? "bg-black/15" : "bg-white/20"
            )} />

            {/* Botón de Modos Claro y Oscuro */}
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerWaterWave(e);
                toggleTheme();
              }}
              className={cn(
                "relative w-full py-2 px-1 rounded-xl transition-all duration-300 flex items-center justify-center cursor-pointer border shrink-0",
                theme === 'dark'
                  ? "text-amber-300 hover:text-amber-200 bg-amber-400/15 hover:bg-amber-400/25 border-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                  : "text-emerald-800 hover:text-emerald-950 bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-600/35 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
              )}
              title={
                theme === 'dark'
                  ? (language === 'es' ? 'Modo Oscuro (Clic para Claro)' : 'Dark Mode (Click for Light)')
                  : (language === 'es' ? 'Modo Claro (Clic para Oscuro)' : 'Light Mode (Click for Dark)')
              }
              aria-label="Toggle theme mode"
            >
              <AnimatePresence mode="wait">
                {theme === 'dark' ? (
                  <motion.div
                    key="moon-icon"
                    initial={{ rotate: -70, scale: 0.6, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    exit={{ rotate: 70, scale: 0.6, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Moon className="w-4 h-4 stroke-[2.5]" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="sun-icon"
                    initial={{ rotate: 70, scale: 0.6, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    exit={{ rotate: -70, scale: 0.6, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Sun className="w-4 h-4 stroke-[2.5]" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>

            {/* Separador Horizontal Sutil */}
            <div className={cn(
              "w-6 h-px my-0.5 shrink-0",
              isLight ? "bg-black/15" : "bg-white/20"
            )} />

            {/* Botón de Alertas y Telemetría con Baliza en Vivo */}
            <button
              id="alerts-toggle-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePanel();
              }}
              className={cn(
                "relative w-full py-2 px-1 rounded-xl transition-all duration-300 flex flex-col items-center justify-center gap-1 cursor-pointer border shrink-0",
                systemState === 'critical'
                  ? "bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]"
                  : systemState === 'warning'
                  ? "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
                  : isLight
                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-600/30 text-emerald-800"
                  : "bg-white/10 hover:bg-white/15 border-white/15 text-neutral-200"
              )}
              title={language === 'es' ? 'Supervisión de Alertas y Estado' : 'Alerts & Health Center'}
              aria-label="Toggle alerts panel"
            >
              <div className="relative flex items-center justify-center">
                <Bell className="w-3.5 h-3.5" />
                {/* Live animated status point */}
                {systemState === 'critical' && (
                  <>
                    <span className="absolute -top-1 -right-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-rose-400 opacity-75 animate-ping" />
                    <span className="absolute -top-1 -right-1.5 inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)]" />
                  </>
                )}
                {systemState === 'warning' && (
                  <>
                    <span className="absolute -top-1 -right-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 opacity-75 animate-pulse" />
                    <span className="absolute -top-1 -right-1.5 inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                  </>
                )}
                {systemState === 'stable' && (
                  <span className="absolute -top-1 -right-1.5 inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" />
                )}
              </div>
              <span className="text-[9px] font-mono font-bold leading-none">
                {systemState === 'critical'
                  ? (language === 'es' ? 'Falla' : 'Alert')
                  : systemState === 'warning'
                  ? (language === 'es' ? 'Aviso' : 'Warn')
                  : (language === 'es' ? 'OK' : 'OK')}
              </span>
            </button>

            {/* Tooltip Contextual Flotante hacia la Izquierda */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, x: 8, scale: 0.94 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 8, scale: 0.94 }}
                  className={cn(
                    "absolute right-full top-1/2 -translate-y-1/2 mr-2.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium shadow-xl backdrop-blur-md whitespace-nowrap pointer-events-none border",
                    isLight
                      ? "bg-white/95 border-emerald-500/30 text-emerald-950 shadow-md"
                      : "bg-neutral-900/95 border-cyan-400/40 text-cyan-200 shadow-xl"
                  )}
                >
                  <div className="flex flex-col gap-0.5 text-center">
                    <span className="font-bold">
                      {language === 'es' ? 'Español' : 'English'} • {theme === 'dark' ? (language === 'es' ? 'Modo Oscuro' : 'Dark Mode') : (language === 'es' ? 'Modo Claro' : 'Light Mode')}
                    </span>
                    <span className="text-[10px] opacity-75">
                      {language === 'es' ? 'Clic en ❯ para disminuir' : 'Click ❯ to minimize'}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

