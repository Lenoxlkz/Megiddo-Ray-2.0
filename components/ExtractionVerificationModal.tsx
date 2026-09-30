"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  ExternalLink, 
  KeyRound, 
  RotateCw, 
  CheckCircle2, 
  X, 
  Lock, 
  Globe, 
  Check, 
  AlertTriangle,
  Fingerprint,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Compass,
  Shield,
  Sparkles,
  Laptop,
  Radio,
  Copy,
  CheckCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/I18nProvider';

export interface ExtractionVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  provider: string;
  sessionId?: string;
  status: 'idle' | 'creating' | 'pending' | 'verifying' | 'verified' | 'invalid' | 'expired';
  errorMessage?: string;
  useSessionUserAgent: boolean;
  onToggleUserAgent: (val: boolean) => void;
  onConfirmVerification: () => void;
  onRetryVerification: () => void;
}

export function ExtractionVerificationModal({
  isOpen,
  onClose,
  url,
  provider,
  sessionId,
  status,
  errorMessage,
  useSessionUserAgent,
  onToggleUserAgent,
  onConfirmVerification,
  onRetryVerification,
}: ExtractionVerificationModalProps) {
  const { t } = useI18n();
  // Mode: 'overview' (compact panel) or 'subbrowser' (internal in-app browser)
  const [viewMode, setViewMode] = useState<'overview' | 'subbrowser'>('overview');
  // In subbrowser: 'popup' (recommended companion window) vs 'iframe' (embedded frame)
  const [subBrowserTab, setSubBrowserTab] = useState<'popup' | 'iframe'>('popup');
  
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isIframeLoading, setIsIframeLoading] = useState<boolean>(true);
  const [hasOpenedSubBrowser, setHasOpenedSubBrowser] = useState<boolean>(false);
  const [isSubWindowOpen, setIsSubWindowOpen] = useState<boolean>(false);
  const [copiedUa, setCopiedUa] = useState<boolean>(false);
  const detectedUa = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const subWindowRef = useRef<Window | null>(null);

  // Monitor sub-window closure
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSubWindowOpen) {
      interval = setInterval(() => {
        if (subWindowRef.current && subWindowRef.current.closed) {
          setIsSubWindowOpen(false);
          if (interval) clearInterval(interval);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSubWindowOpen]);

  // Reset view state when URL changes (standard React pattern without useEffect cascading renders)
  const [prevUrl, setPrevUrl] = useState<string>(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setViewMode('overview');
    setIsIframeLoading(true);
    setHasOpenedSubBrowser(false);
    setIsSubWindowOpen(false);
  }

  if (!isOpen) return null;

  const isVerifying = status === 'verifying';
  const isVerified = status === 'verified';
  const isInvalid = status === 'invalid' || status === 'expired';

  // Check if provider is known to block iframes via X-Frame-Options / CSP frame-ancestors
  const isIframeRestricted = () => {
    try {
      const lower = url.toLowerCase();
      return (
        lower.includes('youtube.com') ||
        lower.includes('youtu.be') ||
        lower.includes('instagram.com') ||
        lower.includes('facebook.com') ||
        lower.includes('fb.watch') ||
        lower.includes('tiktok.com') ||
        lower.includes('twitter.com') ||
        lower.includes('x.com') ||
        lower.includes('google.com')
      );
    } catch {
      return false;
    }
  };

  const handleOpenSubWindow = () => {
    if (typeof window === 'undefined' || !url) return;
    setHasOpenedSubBrowser(true);
    
    // Calculate centered coordinates for popup window
    const width = 540;
    const height = 750;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`;
    
    const popup = window.open(url, 'MegiddoRayVerificationWindow', features);
    if (popup) {
      popup.focus();
      subWindowRef.current = popup;
      setIsSubWindowOpen(true);
    } else {
      // If popup blocker intervened, fallback to open tab
      window.open(url, '_blank', 'noopener,noreferrer');
      setIsSubWindowOpen(true);
    }
  };

  const handleOpenSubBrowserView = () => {
    setHasOpenedSubBrowser(true);
    setViewMode('subbrowser');
    // If provider restricts iframes (like YouTube), default to popup companion tab
    if (isIframeRestricted()) {
      setSubBrowserTab('popup');
    } else {
      setSubBrowserTab('iframe');
      setIsIframeLoading(true);
      setIframeKey(prev => prev + 1);
    }
  };

  const handleRefreshSubBrowser = () => {
    setIsIframeLoading(true);
    setIframeKey(prev => prev + 1);
  };

  const handleCopyUserAgent = () => {
    if (typeof navigator !== 'undefined' && detectedUa) {
      navigator.clipboard.writeText(detectedUa);
      setCopiedUa(true);
      setTimeout(() => setCopiedUa(false), 2000);
    }
  };

  // Safe display URL for browser address bar
  const formatDisplayUrl = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.length > 25 ? parsed.pathname.slice(0, 25) + '...' : parsed.pathname}`;
    } catch {
      return rawUrl.slice(0, 40) + '...';
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Card Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className={cn(
            "relative w-full rounded-2xl sm:rounded-3xl bg-neutral-950 border border-white/15 shadow-2xl overflow-hidden z-10 flex flex-col transition-all duration-300",
            viewMode === 'subbrowser' 
              ? "max-w-4xl h-[92dvh] sm:h-[86vh]" 
              : "max-w-md max-h-[90dvh] sm:max-h-[82vh]"
          )}
        >
          {/* ========================================================================= */}
          {/* HEADER: Sticky at top, easily reachable close button on mobile             */}
          {/* ========================================================================= */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-white/10 bg-neutral-900/90 backdrop-blur-sm shrink-0 select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                "w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                isVerified 
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : isInvalid
                  ? "bg-rose-500/20 border-rose-400/50 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                  : "bg-amber-500/20 border-amber-400/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
              )}>
                {isVerified ? (
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : isInvalid ? (
                  <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                    {viewMode === 'subbrowser' ? t('subBrowserConnected') : t('accessVerification')}
                  </h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/10 text-neutral-300 border border-white/10 shrink-0">
                    {provider || 'Provider'}
                  </span>
                </div>
                <p className="text-[11px] text-amber-400 font-medium truncate">
                  {isVerified 
                    ? t('sessionValidated') 
                    : isInvalid 
                    ? t('sessionExpiredOrRejected') 
                    : t('requiresManualVerification')}
                </p>
              </div>
            </div>

            {/* Actions on Top Header */}
            <div className="flex items-center gap-1.5 shrink-0">
              {viewMode === 'subbrowser' && (
                <button
                  type="button"
                  onClick={() => setViewMode('overview')}
                  title={t('backToOverview')}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-all"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('panel')}</span>
                </button>
              )}

              {/* Close Button: Prominent, easy-to-tap hit area on mobile */}
              <button
                type="button"
                onClick={onClose}
                aria-label={t('closeModal')}
                className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:scale-90 text-neutral-300 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BODY: Mode A (Sub-Navegador Interno) or Mode B (Overview Panel)            */}
          {/* ========================================================================= */}
          {viewMode === 'subbrowser' ? (
            /* SUB-NAVEGADOR VIEW */
            <div className="flex-1 flex flex-col min-h-0 bg-neutral-950 overflow-hidden">
              {/* Browser Navigation Toolbar */}
              <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-white/10 text-xs shrink-0">
                {/* Mode Selector within Sub-Browser */}
                <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSubBrowserTab('popup')}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5",
                      subBrowserTab === 'popup'
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-neutral-400 hover:text-white"
                    )}
                  >
                    <Radio className="w-3 h-3 text-purple-200" />
                    <span>{t('floatingSubWindow')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubBrowserTab('iframe');
                      setIsIframeLoading(true);
                      setIframeKey(prev => prev + 1);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5",
                      subBrowserTab === 'iframe'
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-neutral-400 hover:text-white"
                    )}
                  >
                    <Globe className="w-3 h-3 text-purple-200" />
                    <span>{t('integratedViewer')}</span>
                  </button>
                </div>

                {/* Reload Button for iframe */}
                {subBrowserTab === 'iframe' && (
                  <button
                    type="button"
                    onClick={handleRefreshSubBrowser}
                    title={t('reloadInternalViewer')}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-colors"
                  >
                    <RotateCw className={cn("w-3.5 h-3.5", isIframeLoading && "animate-spin text-amber-400")} />
                  </button>
                )}

                {/* Address Bar */}
                <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-950 border border-white/10 text-neutral-300 font-mono text-[11px]">
                  <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate select-all">{formatDisplayUrl(url)}</span>
                </div>
              </div>

              {/* User-Agent Sincronizado Banner */}
              <div className="px-3.5 py-2 bg-gradient-to-r from-purple-950/40 via-neutral-900 to-neutral-900 border-b border-purple-500/20 text-[11px] text-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="font-semibold text-purple-300 shrink-0">{t('connectedUserAgent')}</span>
                  <span className="font-mono text-neutral-300 truncate text-[10px] select-all max-w-[280px] sm:max-w-md">
                    {detectedUa || 'Browser UA synced'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleCopyUserAgent}
                    className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 text-neutral-300 text-[10px] flex items-center gap-1 transition-colors"
                  >
                    {copiedUa ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-neutral-400" />}
                    <span>{copiedUa ? t('copied') : t('copyUa')}</span>
                  </button>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono">
                    {t('injectedInServer')}
                  </span>
                </div>
              </div>

              {/* View Content Area: Either Popup Sub-Browser Assistant OR Iframe Sandbox */}
              <div className="relative flex-1 bg-neutral-900/60 min-h-0 overflow-y-auto">
                {subBrowserTab === 'popup' ? (
                  /* SUB-VENTANA FLOTANTE VIEW (Solución definitiva para X-Frame-Options / YouTube / Cloudflare) */
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto space-y-5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600/30 to-amber-500/30 border border-purple-400/40 flex items-center justify-center text-purple-300 shadow-xl">
                      <Laptop className="w-7 h-7" />
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-base font-bold text-white tracking-wide">
                        {t('floatingSubBrowserTitle')}
                      </h4>
                      <p className="text-xs text-neutral-300 leading-relaxed">
                        {t('floatingSubBrowserDesc1')}
                      </p>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        {t('floatingSubBrowserDesc2')}
                      </p>
                    </div>

                    {/* Active Window Tracking Indicator */}
                    {isSubWindowOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                          <div>
                            <div className="font-semibold text-emerald-300">{t('floatingSubWindowActive')}</div>
                            <div className="text-[11px] text-emerald-200/80">{t('floatingSubWindowInstruction')}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenSubWindow}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] shrink-0"
                        >
                          {t('focusWindow')}
                        </button>
                      </motion.div>
                    )}

                    {/* Launch / Re-open Button */}
                    <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleOpenSubWindow}
                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-purple-600 to-cyan-500 hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xl hover:shadow-purple-500/25 transition-all cursor-pointer"
                      >
                        <Compass className="w-4 h-4 text-amber-300" />
                        <span>{isSubWindowOpen ? t('reopenOrFocusWindow') : t('openFloatingSubBrowserRecommended')}</span>
                      </button>

                      {isIframeRestricted() && (
                        <button
                          type="button"
                          onClick={() => {
                            setSubBrowserTab('iframe');
                            setIsIframeLoading(true);
                            setIframeKey(prev => prev + 1);
                          }}
                          className="text-[11px] text-neutral-400 hover:text-neutral-200 underline underline-offset-4 transition-colors"
                        >
                          {t('tryIntegratedViewer')}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* IFRAME EMBEDDED SANDBOX (Para sitios que no envían X-Frame-Options) */
                  <div className="relative w-full h-full">
                    {/* Notice if site is known to restrict iframes */}
                    {isIframeRestricted() && (
                      <div className="absolute top-2 left-2 right-2 z-20 p-2.5 rounded-xl bg-amber-950/90 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-2 shadow-lg backdrop-blur-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-[11px] truncate">
                            {t('youtubeFrameWarning')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSubBrowserTab('popup')}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-[10px] shrink-0"
                        >
                          {t('switchToFloating')}
                        </button>
                      </div>
                    )}

                    {isIframeLoading && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-neutral-950/80 backdrop-blur-sm text-neutral-300">
                        <RotateCw className="w-6 h-6 animate-spin text-amber-400" />
                        <p className="text-xs font-medium">{t('loadingIntegratedViewer')}</p>
                      </div>
                    )}

                    <iframe
                      key={iframeKey}
                      ref={iframeRef}
                      src={url}
                      title={t('integratedVerificationViewer')}
                      onLoad={() => setIsIframeLoading(false)}
                      sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
                      referrerPolicy="no-referrer"
                      className="w-full h-full border-0 bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Sub-Browser Bottom Action Bar */}
              <div className="p-3 sm:p-4 bg-neutral-900 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="text-[11px] text-neutral-400 text-center sm:text-left">
                  <span>{t('onceChallengeSolved')}</span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {!isInvalid ? (
                    <button
                      type="button"
                      onClick={onConfirmVerification}
                      disabled={isVerifying || isVerified}
                      className={cn(
                        "w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer select-none",
                        isVerifying
                          ? "bg-purple-600/50 text-white/70 cursor-wait border border-purple-400/30"
                          : isVerified
                          ? "bg-emerald-600 text-white border border-emerald-400"
                          : "bg-emerald-500 hover:bg-emerald-400 text-neutral-950 hover:shadow-emerald-500/25 border border-emerald-400"
                      )}
                    >
                      {isVerifying ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{t('validatingSessionWithServer')}</span>
                        </>
                      ) : isVerified ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('sessionReadyDownloading')}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>{t('completedVerificationValidate')}</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onRetryVerification}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer select-none"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>{t('verifyAgain')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* OVERVIEW PANEL VIEW: Compact, perfectly proportioned for mobile */
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Explanation Text */}
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 space-y-1.5 text-xs text-neutral-300 leading-relaxed">
                <p className="font-semibold text-neutral-200">
                  {t('providerRequiresCheck')}
                </p>
                <p className="text-neutral-400 text-[11px]">
                  {t('providerRequiresCheckDesc')}
                </p>
              </div>

              {/* Status Feedback Alerts */}
              {isInvalid && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <div className="font-bold">{t('sessionExpiredOrInvalid')}</div>
                    <div className="text-[11px] text-rose-300/80">
                      {errorMessage || t('serverRejectedSession')}
                    </div>
                  </div>
                </motion.div>
              )}

              {isVerified && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5"
                >
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold">{t('sessionVerifiedSuccess')}</div>
                    <div className="text-[11px] text-emerald-300/80">
                      {t('binaryResourceValidated')}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* User-Agent Coherence Option & Preview */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Fingerprint className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">{t('useSessionUserAgent')}</div>
                      <div className="text-[10px] text-neutral-400 truncate">
                        {t('useSessionUserAgentDesc')}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleUserAgent(!useSessionUserAgent)}
                    className={cn(
                      "w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 border shrink-0",
                      useSessionUserAgent
                        ? "bg-purple-600 border-purple-400"
                        : "bg-white/10 border-white/15"
                    )}
                  >
                    <motion.div
                      layout
                      className={cn(
                        "w-3.5 h-3.5 rounded-full bg-white shadow-md",
                        useSessionUserAgent ? "ml-auto" : "mr-auto"
                      )}
                    />
                  </button>
                </div>

                {detectedUa && (
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-[10px] text-neutral-400 flex items-center justify-between gap-2">
                    <span className="truncate">{detectedUa}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      {t('userAgentSynced')}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {/* Step 1: Open Sub-Browser */}
                <button
                  type="button"
                  onClick={handleOpenSubBrowserView}
                  className={cn(
                    "w-full py-3 px-4 rounded-xl border flex items-center justify-between text-xs font-semibold transition-all cursor-pointer shadow-md",
                    hasOpenedSubBrowser
                      ? "bg-white/5 border-white/20 text-neutral-200"
                      : "bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-cyan-500/20 border-amber-400/50 text-white hover:border-amber-400"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Compass className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{t('openVerificationSubBrowser')}</span>
                  </div>
                  <Maximize2 className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {/* Step 2: Confirm Verification */}
                {!isInvalid ? (
                  <button
                    type="button"
                    onClick={onConfirmVerification}
                    disabled={isVerifying || isVerified}
                    className={cn(
                      "w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xl cursor-pointer select-none",
                      isVerifying
                        ? "bg-purple-600/50 text-white/70 cursor-wait border border-purple-400/30"
                        : isVerified
                        ? "bg-emerald-600 text-white border border-emerald-400"
                        : "bg-emerald-500 hover:bg-emerald-400 text-neutral-950 hover:shadow-emerald-500/25 border border-emerald-400"
                    )}
                  >
                    {isVerifying ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{t('validatingBinaryStream')}</span>
                      </>
                    ) : isVerified ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t('sessionReadyDownloading')}</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>{t('verifyAccessCompleted')}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onRetryVerification}
                    className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center gap-2 transition-all shadow-xl cursor-pointer select-none"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{t('verifyAgain')}</span>
                  </button>
                )}
              </div>

              {/* Privacy Footer */}
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-neutral-500 text-center pt-2 border-t border-white/5">
                <Lock className="w-3 h-3 text-neutral-400 shrink-0" />
                <span>{t('privacyNoticeCookies')}</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
