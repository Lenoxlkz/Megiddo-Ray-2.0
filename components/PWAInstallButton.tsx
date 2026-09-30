'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Check, Sparkles, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';
import { useI18n } from './I18nProvider';

const starosSpring = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 30,
};

export function PWAInstallButton() {
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
  const { language } = useI18n();
  const [showIosInfo, setShowIosInfo] = useState(false);

  // If already installed, don't clutter the header
  if (isInstalled) {
    return null;
  }

  const isSpanish = language === 'es';

  const handleClick = async () => {
    if (isInstallable) {
      await promptInstall();
    } else {
      // In iOS Safari or browsers without direct beforeinstallprompt
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;
      if (isIos) {
        setShowIosInfo(true);
      } else {
        // Show info for desktop or Chrome
        await promptInstall();
      }
    }
  };

  return (
    <>
      <motion.button
        id="pwa-install-header-btn"
        type="button"
        onClick={handleClick}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={starosSpring}
        className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold staros-glass-pill border border-emerald-400/40 text-emerald-300 hover:text-white hover:border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)] transition-all cursor-pointer select-none"
        title={isSpanish ? "Instalar aplicación (PWA)" : "Install application (PWA)"}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <Download className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[11px] font-medium tracking-wide">
          {isSpanish ? 'Instalar App' : 'Install App'}
        </span>
      </motion.button>

      {/* iOS or Manual Instruction Modal */}
      <AnimatePresence>
        {showIosInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-sm w-full p-5 rounded-2xl staros-glass-card border border-emerald-400/30 text-white space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold">
                    {isSpanish ? 'Instalar en tu dispositivo' : 'Install on your device'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIosInfo(false)}
                  className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-neutral-300 space-y-2">
                <p>
                  {isSpanish 
                    ? 'Para instalar en Safari iOS: pulsa el botón Compartir y selecciona "Agregar al inicio".' 
                    : 'To install on Safari iOS: tap the Share button and select "Add to Home Screen".'}
                </p>
                <p>
                  {isSpanish 
                    ? 'En Chrome o Edge: pulsa el icono de instalación en la barra de direcciones o menú.' 
                    : 'In Chrome or Edge: click the install icon in the address bar or browser menu.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowIosInfo(false)}
                className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs shadow-lg transition-all"
              >
                {isSpanish ? 'Entendido' : 'Got it'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
