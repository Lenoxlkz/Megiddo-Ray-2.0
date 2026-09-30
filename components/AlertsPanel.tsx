'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAlerts } from './AlertsProvider';
import { useI18n } from './I18nProvider';
import { useTheme } from './ThemeProvider';
import {
  X,
  Copy,
  Check,
  AlertTriangle,
  AlertOctagon,
  Info,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ALERT_TYPE_LABELS, AlertItem } from '@/lib/alerts';

export function AlertsPanel() {
  const { alerts, systemState, isPanelOpen, setIsPanelOpen, clearAlerts } = useAlerts();
  const { language } = useI18n();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyAll = async () => {
    try {
      const exportText = alerts
        .map(
          (a) =>
            `[${a.timestamp}] [${a.level.toUpperCase()}] ${a.title} (${a.type})\n${a.userMessage}\n${
              a.url ? `URL: ${a.url}\n` : ''
            }${a.technicalDetails ? `${language === 'es' ? 'Técnico: ' : 'Technical: '}${language === 'en' && a.technicalDetailsEn ? a.technicalDetailsEn : a.technicalDetails}\n` : ''}`
        )
        .join('\n---\n');

      await navigator.clipboard.writeText(exportText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopySingle = async (item: AlertItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const displayTitle = language === 'en' && item.titleEn ? item.titleEn : item.title;
      const displayMessage = language === 'en' && item.userMessageEn ? item.userMessageEn : item.userMessage;
      const displayTechnical = language === 'en' && item.technicalDetailsEn ? item.technicalDetailsEn : item.technicalDetails;
      const text = `[${item.timestamp}] [${item.level.toUpperCase()}] ${displayTitle}\n${displayMessage}${
        displayTechnical ? `\n${language === 'es' ? 'Detalles: ' : 'Details: '}${displayTechnical}` : ''
      }`;
      await navigator.clipboard.writeText(text);
      setCopiedItemId(item.id);
      setTimeout(() => setCopiedItemId(null), 2000);
    } catch {
      // ignore
    }
  };

  if (!isPanelOpen) return null;

  return (
    <AnimatePresence>
      <div
        id="alerts-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={() => setIsPanelOpen(false)}
      >
        <motion.div
          id="alerts-panel-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alerts-panel-title"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'relative w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden',
            // Height at exactly half the screen with vertical scrolling
            'h-[50vh] max-h-[50vh]',
            isLight
              ? 'bg-neutral-50/95 border-neutral-300 text-neutral-900'
              : 'bg-neutral-950/95 border-white/15 text-neutral-100 shadow-[0_0_40px_rgba(0,0,0,0.8)]'
          )}
        >
          {/* Header */}
          <div
            className={cn(
              'px-4 py-3 border-b flex items-center justify-between shrink-0 select-none backdrop-blur-md',
              isLight ? 'bg-white/80 border-neutral-200' : 'bg-neutral-900/80 border-white/10'
            )}
          >
            <div className="flex items-center gap-2.5">
              {/* Live Animated Status Indicator */}
              <div className="relative flex items-center justify-center w-3.5 h-3.5">
                {systemState === 'critical' && (
                  <>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,1)]" />
                  </>
                )}
                {systemState === 'warning' && (
                  <>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-pulse" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]" />
                  </>
                )}
                {systemState === 'stable' && (
                  <>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40 animate-pulse" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  </>
                )}
              </div>

              <div>
                <h2 id="alerts-panel-title" className="text-xs font-bold uppercase tracking-wider font-mono">
                  {language === 'es' ? 'Supervisión de Alertas y Telemetría' : 'Alert Center & Telemetry'}
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                  <span>
                    {systemState === 'critical'
                      ? (language === 'es' ? 'Falla crítica detectada' : 'Critical issue active')
                      : systemState === 'warning'
                      ? (language === 'es' ? 'Inferencia u obstrucción detectada' : 'Inference / Obstruction')
                      : (language === 'es' ? 'Estado estable' : 'System nominal')}
                  </span>
                  <span>•</span>
                  <span>{alerts.length} {language === 'es' ? 'registros' : 'events'}</span>
                </div>
              </div>
            </div>

            {/* Header Action Icons: Copy All, Clear, Close (X) */}
            <div className="flex items-center gap-1">
              <button
                id="copy-all-alerts-btn"
                type="button"
                onClick={handleCopyAll}
                className={cn(
                  'px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border',
                  isLight
                    ? 'bg-neutral-200/70 hover:bg-neutral-300 border-neutral-300 text-neutral-800'
                    : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                )}
                title={language === 'es' ? 'Copiar todo el registro' : 'Copy all alerts'}
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] font-mono text-emerald-400">
                      {language === 'es' ? 'Copiado' : 'Copied'}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-mono">
                      {language === 'es' ? 'Copiar' : 'Copy'}
                    </span>
                  </>
                )}
              </button>

              <button
                id="clear-alerts-btn"
                type="button"
                onClick={clearAlerts}
                className={cn(
                  'p-1.5 rounded-lg text-xs transition-colors cursor-pointer border',
                  isLight
                    ? 'bg-neutral-200/70 hover:bg-neutral-300 border-neutral-300 text-neutral-600 hover:text-neutral-900'
                    : 'bg-white/10 hover:bg-white/20 border-white/10 text-neutral-400 hover:text-white'
                )}
                title={language === 'es' ? 'Limpiar historial' : 'Clear history'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                id="close-alerts-panel-btn"
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className={cn(
                  'p-1.5 rounded-lg text-xs transition-colors cursor-pointer border ml-1',
                  isLight
                    ? 'bg-neutral-200 hover:bg-neutral-300 border-neutral-300 text-neutral-800'
                    : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                )}
                title={language === 'es' ? 'Cerrar panel' : 'Close panel'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Alerts List: Exactly vertical scroll up and down */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y divide-white/5 scroll-smooth">
            {alerts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                <ShieldCheck className="w-8 h-8 text-emerald-400 mb-2 opacity-80" />
                <p className="text-xs font-semibold">
                  {language === 'es' ? 'Sin incidencias registradas' : 'No alerts recorded'}
                </p>
                <p className="text-[11px] text-neutral-500 mt-1">
                  {language === 'es'
                    ? 'El sistema está operando en estado nominal.'
                    : 'All subsystems running smoothly.'}
                </p>
              </div>
            ) : (
              alerts.map((item) => {
                const label = ALERT_TYPE_LABELS[item.type]
                  ? (language === 'es' ? ALERT_TYPE_LABELS[item.type].es : ALERT_TYPE_LABELS[item.type].en)
                  : item.type;
                const isExpanded = expandedDetails[item.id] || false;
                const isCopied = copiedItemId === item.id;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'p-2.5 rounded-xl border transition-all text-left flex flex-col gap-1.5 relative',
                      item.level === 'critical'
                        ? (isLight
                            ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                            : 'bg-rose-950/30 border-rose-500/30 text-rose-100')
                        : item.level === 'warning'
                        ? (isLight
                            ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                            : 'bg-amber-950/30 border-amber-500/30 text-amber-100')
                        : (isLight
                            ? 'bg-white border-neutral-200 text-neutral-900'
                            : 'bg-white/[0.03] border-white/10 text-neutral-200')
                    )}
                  >
                    {/* Top Row: Level icon, Type badge, Timestamp, Copy button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.level === 'critical' ? (
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : item.level === 'warning' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <span
                          className={cn(
                            'text-[9px] font-bold uppercase tracking-wider font-mono px-1.5 py-0.5 rounded',
                            item.level === 'critical'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : item.level === 'warning'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          )}
                        >
                          {label}
                        </span>
                        <span className="text-[10px] font-bold">
                          {language === 'en' && item.titleEn ? item.titleEn : item.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] font-mono opacity-60">{item.timestamp}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopySingle(item, e)}
                          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-70 hover:opacity-100 cursor-pointer"
                          title={language === 'es' ? 'Copiar esta alerta' : 'Copy this alert'}
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Friendly Message */}
                    <p className="text-xs leading-relaxed opacity-90">
                      {language === 'en' && item.userMessageEn ? item.userMessageEn : item.userMessage}
                    </p>

                    {/* Target URL if present */}
                    {item.url && (
                      <div className="flex items-center gap-1 text-[10px] font-mono opacity-70 truncate">
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{item.url}</span>
                      </div>
                    )}

                    {/* Collapsible Technical Details for Debugging */}
                    {item.technicalDetails && (
                      <div className="mt-1 pt-1 border-t border-black/5 dark:border-white/10">
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          className="flex items-center gap-1 text-[10px] font-mono opacity-75 hover:opacity-100 cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              <span>{language === 'es' ? 'Ocultar detalles técnicos' : 'Hide technical details'}</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              <span>{language === 'es' ? 'Ver detalles técnicos' : 'View technical details'}</span>
                            </>
                          )}
                        </button>

                        {isExpanded && (
                          <div
                            className={cn(
                              'mt-1.5 p-2 rounded-lg text-[10px] font-mono break-all whitespace-pre-wrap select-text border',
                              isLight ? 'bg-neutral-100 border-neutral-300 text-neutral-800' : 'bg-black/60 border-white/10 text-neutral-300'
                            )}
                          >
                            {language === 'en' && item.technicalDetailsEn ? item.technicalDetailsEn : item.technicalDetails}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
