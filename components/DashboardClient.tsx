"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Trash2, 
  Plus, 
  ArrowDownToLine, 
  Zap, 
  List, 
  RotateCw, 
  FileText,
  Layers,
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Check,
  DownloadCloud,
  Download,
  SlidersHorizontal,
  FolderDown,
  X,
  Clipboard,
  Archive,
  Copy,
  CheckCheck,
  Video as VideoIcon,
  Image as ImageIcon,
  Music,
  ExternalLink,
  RotateCcw,
  Clock,
  AlertTriangle,
  AlertCircle,
  Timer,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Lock,
  Share2,
  HardDrive,
  Server,
  Radio,
  FileCheck,
  Activity,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tracker, TrackingMode, ChapterInfo, SearchCategory, DownloadMode } from '@/types';
import { DiscoveredContent } from '@/lib/discovery/types';
import { VideoPreviewDiagnostics } from '@/lib/videoPreviewResolver';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { useI18n } from '@/components/I18nProvider';
import { useAlerts } from '@/components/AlertsProvider';
import { detectUrl, DetectionResult } from '@/lib/detector';
import { extractSharedUrl } from '@/lib/urlExtractor';
import { TerminalTitle } from '@/components/TerminalTitle';
import { LanguageCapsule } from '@/components/LanguageCapsule';
import { PWAInstallButton } from '@/components/PWAInstallButton';
import { 
  exportWithPdfLib, 
  exportWithImg2Pdf, 
  exportCombinedPdfWithFallback, 
  exportSelectedChaptersAsZipPdfs, 
  exportSelectedChaptersIndividualPdfs 
} from '@/lib/pdfExporter';
import { 
  exportImagesPackage, 
  downloadSingleImage, 
  exportSelectedChaptersIndividualCbz 
} from '@/lib/imageExporter';
import { exportVideo, exportAudioMp3, exportImageWithAudioAsVideo } from '@/lib/videoExporter';
import { ExtractionVerificationModal } from '@/components/ExtractionVerificationModal';
import { useTheme } from '@/components/ThemeProvider';
import { 
  StarOSAtmosphereBackground, 
  StarOSToggle, 
  StarOSPillButton, 
  StarOSSelectorPanel, 
  starosSpring, 
  starosBouncySpring 
} from '@/components/StarOSControls';

const getProxiedImageUrl = (url: string) => {
  if (!url) return '';
  const clean = url.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/').trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) return clean;
  if (clean.startsWith('/api/proxy-image')) return clean;
  return `/api/proxy-image?url=${encodeURIComponent(clean)}`;
};

/**
 * Returns the proper streaming URL for inline video playback.
 * Ensures protected or range-sensitive resources (YouTube, Instagram, Facebook, TikTok, Twitter)
 * stream through Megiddo Ray's Streaming Proxy with HTTP Range (206) support,
 * allowing 1-2 GB videos to start playing immediately without downloading the whole file.
 */
const getVideoPreviewStreamUrl = (rawUrl?: string, previewUrl?: string) => {
  if (previewUrl && previewUrl.trim() && !previewUrl.includes('/embed/')) return previewUrl.trim();
  if (!rawUrl) return '';
  const clean = rawUrl.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/').trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) return clean;
  if (clean.startsWith('/api/proxy-video')) return clean;

  const lower = clean.toLowerCase();
  if (
    lower.includes('fbcdn.net') ||
    lower.includes('facebook.com') ||
    lower.includes('cdninstagram.com') ||
    lower.includes('instagram.com') ||
    lower.includes('tiktokcdn.com') ||
    lower.includes('tiktok.com') ||
    lower.includes('googlevideo.com') ||
    lower.includes('youtube.com') ||
    lower.includes('threads.net') ||
    lower.includes('twimg.com')
  ) {
    return `/api/proxy-video?url=${encodeURIComponent(clean)}&preview=true`;
  }
  return clean;
};

// Adaptive chapter downloader with exponential backoff & jitter for slow/unstable manga servers
async function downloadChapterWithAdaptiveRetry(
  chapterUrl: string,
  slowServer: boolean,
  onAttempt?: (attempt: number, maxAttempts: number, statusText: string) => void,
  labels?: { retrying?: string; waiting?: string }
): Promise<{ success: boolean; images: string[]; chapterName?: string; videoUrl?: string; mediaType?: 'image' | 'video'; author?: string }> {
  const maxAttempts = slowServer ? 4 : 2;
  const baseDelayMs = slowServer ? 1800 : 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (onAttempt && attempt > 1) {
        onAttempt(attempt, maxAttempts, `${labels?.retrying || 'Retrying'} (${attempt}/${maxAttempts})...`);
      }

      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: chapterUrl, mode: 'single', slowServerMode: slowServer })
      });

      if (res.ok) {
        const data = await res.json();
        const imgs = data.images || [];
        if (imgs.length > 0 || data.videoUrl) {
          return {
            success: true,
            images: imgs,
            chapterName: data.chapterName,
            videoUrl: data.videoUrl,
            mediaType: data.mediaType,
            author: data.author
          };
        }
      }
    } catch (e) {
      console.warn(`Retry attempt ${attempt} error for ${chapterUrl}:`, e);
    }

    if (attempt < maxAttempts) {
      const waitMs = baseDelayMs * Math.pow(1.5, attempt - 1) + Math.random() * 500;
      if (onAttempt) {
        onAttempt(attempt, maxAttempts, `${labels?.waiting || 'Waiting for server'} (${Math.round(waitMs / 1000)}s)...`);
      }
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  return { success: false, images: [] };
}

interface TaskControl {
  isPaused: boolean;
  isStopped: boolean;
  resumeResolver?: () => void;
}

const EMPTY_TRACKERS: Tracker[] = [];
let memoryTrackers: Tracker[] = EMPTY_TRACKERS;
let isTrackersInitialized = false;
const trackerListeners = new Set<() => void>();

function getStoredTrackers(): Tracker[] {
  if (typeof window === 'undefined') return EMPTY_TRACKERS;
  if (!isTrackersInitialized) {
    isTrackersInitialized = true;
    try {
      const saved = localStorage.getItem('liquid_trackers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          memoryTrackers = parsed.map((item: any) => {
            const tracker: Tracker = {
              id: typeof item.id === 'string' ? item.id : uuidv4(),
              url: typeof item.url === 'string' ? item.url : '',
              title: typeof item.title === 'string' ? item.title : undefined,
              category: (item.category === 'manga' || item.category === 'video' || item.category === 'image' || item.category === 'nsfw') ? item.category : 'manga',
              mode: (item.mode === 'single' || item.mode === 'sequential' || item.mode === 'continuous') ? item.mode : 'single',
              status: (item.status === 'idle' || item.status === 'running' || item.status === 'paused' || item.status === 'completed' || item.status === 'error' || item.status === 'stopped') ? item.status : 'idle',
              progress: typeof item.progress === 'number' ? item.progress : 0,
              downloadSpeed: typeof item.downloadSpeed === 'string' ? item.downloadSpeed : '0 B/s',
              imageCount: typeof item.imageCount === 'number' ? item.imageCount : 0,
              totalImages: typeof item.totalImages === 'number' ? item.totalImages : undefined,
              images: Array.isArray(item.images) ? item.images : [],
              dateAdded: typeof item.dateAdded === 'string' ? item.dateAdded : new Date().toISOString(),
              totalChapters: typeof item.totalChapters === 'number' ? item.totalChapters : undefined,
              completedChapters: typeof item.completedChapters === 'number' ? item.completedChapters : undefined,
              currentChapter: typeof item.currentChapter === 'string' ? item.currentChapter : undefined,
              chapters: Array.isArray(item.chapters) ? item.chapters : [],
              mediaType: (item.mediaType === 'image' || item.mediaType === 'video' || item.mediaType === 'image_with_audio' || item.mediaType === 'audio') ? item.mediaType : undefined,
              videoUrl: typeof item.videoUrl === 'string' ? item.videoUrl : undefined,
              audioUrl: typeof item.audioUrl === 'string' ? item.audioUrl : undefined,
              hasAudio: typeof item.hasAudio === 'boolean' ? item.hasAudio : undefined,
              videoEmbedUrl: typeof item.videoEmbedUrl === 'string' ? item.videoEmbedUrl : undefined,
              author: typeof item.author === 'string' ? item.author : undefined,
              authorUrl: typeof item.authorUrl === 'string' ? item.authorUrl : undefined,
              slowServerMode: typeof item.slowServerMode === 'boolean' ? item.slowServerMode : true,
            };
            return tracker;
          });
        }
      }
    } catch {
      memoryTrackers = EMPTY_TRACKERS;
    }
  }
  return memoryTrackers;
}

function getServerTrackers(): Tracker[] {
  return EMPTY_TRACKERS;
}

function subscribeTrackers(callback: () => void) {
  trackerListeners.add(callback);
  return () => trackerListeners.delete(callback);
}

function updateTrackersGlobal(updater: Tracker[] | ((prev: Tracker[]) => Tracker[])) {
  const next = typeof updater === 'function' ? updater(memoryTrackers) : updater;
  memoryTrackers = next;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('liquid_trackers', JSON.stringify(next));
    }
  } catch (e) {
    console.error('Failed to save trackers', e);
  }
  trackerListeners.forEach(fn => fn());
}

export default function DashboardClient() {
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const trackers = useSyncExternalStore(
    subscribeTrackers,
    getStoredTrackers,
    getServerTrackers
  );

  const setTrackers = useCallback((updater: Tracker[] | ((prev: Tracker[]) => Tracker[])) => {
    updateTrackersGlobal(updater);
  }, []);

  const [showNewModal, setShowNewModal] = useState(false);
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState<SearchCategory>('manga');
  const [newMode, setNewMode] = useState<TrackingMode>('single');
  const [newSlowServerMode, setNewSlowServerMode] = useState<boolean>(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [expandedMangaExport, setExpandedMangaExport] = useState<Record<string, boolean>>({});
  const [openCustomPanels, setOpenCustomPanels] = useState<Record<string, boolean>>({});
  const [selectedChapters, setSelectedChapters] = useState<Record<string, Record<string | number, boolean>>>({});
  const [customQty, setCustomQty] = useState<Record<string, string>>({});
  const [customDir, setCustomDir] = useState<Record<string, 'first' | 'last'>>({});
  const [isBatchDownloading, setIsBatchDownloading] = useState<Record<string, boolean>>({});
  const [generatingPdf, setGeneratingPdf] = useState<{ id: string; chapterId?: string | number; engine: 'pdflib' | 'img2pdf' } | null>(null);
  const [generatingExport, setGeneratingExport] = useState<{ id: string; chapterId?: string | number; type: string } | null>(null);
  const [downloadingSinglePage, setDownloadingSinglePage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Centralized Telemetry and Alerts Hook
  const { addAlert } = useAlerts();

  // URL Detection & Validation State
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  const [userConfirmedCategory, setUserConfirmedCategory] = useState(false);
  const detectionDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Architectural Pipeline: Discovery, Metadata & Preparation State
  const [discoveredData, setDiscoveredData] = useState<DiscoveredContent | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveredSelectedChapters, setDiscoveredSelectedChapters] = useState<Record<string | number, boolean>>({});
  const [serverCapacityStatus, setServerCapacityStatus] = useState<{
    isSafe: boolean;
    totalMemoryMB: number;
    freeMemoryMB: number;
    activeInternalJobs: number;
    reason?: string;
  } | null>(null);

  // Video Preview Resolver & Streaming State
  const [discoveryVideoPreviewPlaying, setDiscoveryVideoPreviewPlaying] = useState<boolean>(false);
  const [showVideoDiagnosticsModal, setShowVideoDiagnosticsModal] = useState<boolean>(false);

  // ExtractionSession Verification Flow State
  const [verificationModal, setVerificationModal] = useState<{
    isOpen: boolean;
    url: string;
    provider: string;
    sessionId?: string;
    status: 'idle' | 'creating' | 'pending' | 'verifying' | 'verified' | 'invalid' | 'expired';
    errorMessage?: string;
    useSessionUserAgent: boolean;
  }>({
    isOpen: false,
    url: '',
    provider: '',
    status: 'idle',
    useSessionUserAgent: true,
  });

  // Active tracking controllers for pausing / stopping / resuming
  const controlsRef = useRef<Record<string, TaskControl>>({});

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  const cleanInputUrl = useCallback((input: string) => {
    let cleaned = input.trim();
    // Strip any leading https://, http://, //, https:/, http:/
    cleaned = cleaned.replace(/^(?:https?:\/\/|\/\/|https?:\/|https?:)+/i, '');
    return cleaned;
  }, []);

  // Centralized URL Analysis Function
  const analyzeUrlInput = useCallback(async (rawString: string) => {
    const trimmed = rawString.trim();
    if (!trimmed) {
      setDetectionResult(null);
      setIsAnalyzingUrl(false);
      setUserConfirmedCategory(false);
      return;
    }

    setIsAnalyzingUrl(true);

    try {
      // 1. Instant Client-side Detection
      const localResult = detectUrl(trimmed);
      setDetectionResult(localResult);

      if (localResult.normalizedUrl) {
        if (localResult.confidence === 'high' && !localResult.needsConfirmation) {
          if (localResult.category !== 'unknown') {
            setNewCategory(localResult.category);
          }
          setUserConfirmedCategory(true);
        } else if (localResult.needsConfirmation) {
          if (localResult.suggestedCategory !== 'unknown') {
            setNewCategory(localResult.suggestedCategory);
          }
          setUserConfirmedCategory(false);
          addAlert({
            type: 'special_handling',
            level: 'warning',
            title: `Confirmación requerida (${localResult.platformName})`,
            titleEn: `Confirmation required (${localResult.platformNameEn || localResult.platformName})`,
            userMessage: `${localResult.reason}. Confirma o cambia la categoría antes de continuar.`,
            userMessageEn: `${localResult.reasonEn || localResult.reason}. Please confirm or change the category before continuing.`,
            url: localResult.normalizedUrl,
          });
        } else {
          setUserConfirmedCategory(false);
          addAlert({
            type: 'unknown_platform',
            level: 'warning',
            title: 'Plataforma no reconocida',
            titleEn: 'Unrecognized platform',
            userMessage: localResult.reason,
            userMessageEn: localResult.reasonEn || localResult.reason,
            url: localResult.normalizedUrl,
          });
        }

        // 2. Authoritative Validation with Backend Route
        try {
          const res = await fetch('/api/detect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: localResult.normalizedUrl,
              requestedCategory: localResult.category,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.isValid && data.detection) {
              setDetectionResult(data.detection);
            }
          }
        } catch {
          // Keep local detection result if backend is unreachable
        }
      } else {
        setUserConfirmedCategory(false);
        addAlert({
          type: 'url_invalid',
          level: 'warning',
          title: 'URL Inválida',
          titleEn: 'Invalid URL',
          userMessage: localResult.reason,
          userMessageEn: localResult.reasonEn || localResult.reason,
          url: trimmed,
        });
      }
    } finally {
      setIsAnalyzingUrl(false);
    }
  }, [addAlert]);

  // Web Share Target API: Catch URL shared from Android Share Menu
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const sharedUrl = searchParams.get('url');
      const sharedText = searchParams.get('text');
      const sharedTitle = searchParams.get('title');

      if (sharedUrl || sharedText || sharedTitle) {
        // Clean the address bar in history without reloading
        const cleanHref = window.location.pathname;
        window.history.replaceState({}, document.title, cleanHref);

        // Robust extraction from title, text, or url fields
        const extracted = extractSharedUrl({
          url: sharedUrl,
          text: sharedText,
          title: sharedTitle,
        });

        // Defer state updates to next microtask/tick to prevent synchronous cascading renders
        setTimeout(() => {
          if (extracted.isValid && extracted.normalizedUrl) {
            setShowNewModal(true);
            const sanitized = cleanInputUrl(extracted.normalizedUrl);
            setNewUrl(sanitized);
            analyzeUrlInput(extracted.normalizedUrl);
            showToast(t('shareReceived'));
          } else {
            setShowNewModal(true);
            addAlert({
              type: 'url_invalid',
              level: 'warning',
              title: 'Recepción Compartir Android',
              userMessage: extracted.error || 'No se pudo obtener una URL válida desde el contenido compartido.',
              url: sharedUrl || sharedText || undefined,
            });
            showToast(t('contentReceivedVerify'));
          }
        }, 0);
      }
    } catch (err) {
      console.error('Error handling Web Share Target:', err);
    }
  }, [cleanInputUrl, analyzeUrlInput, addAlert, showToast, t]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = cleanInputUrl(e.target.value);
    setNewUrl(sanitized);
    setUserConfirmedCategory(false);

    if (detectionDebounceTimer.current) {
      clearTimeout(detectionDebounceTimer.current);
    }

    if (!sanitized.trim()) {
      setDetectionResult(null);
      setIsAnalyzingUrl(false);
      return;
    }

    detectionDebounceTimer.current = setTimeout(() => {
      analyzeUrlInput(sanitized);
    }, 300);
  };

  const handlePasteUrl = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const extracted = extractSharedUrl({ text });
          const target = extracted.isValid && extracted.normalizedUrl ? extracted.normalizedUrl : text;
          const sanitized = cleanInputUrl(target);
          setNewUrl(sanitized);
          analyzeUrlInput(target);
          inputRef.current?.focus();
        }
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
    }
  };

  const handleClearUrl = () => {
    setNewUrl('');
    setDetectionResult(null);
    setIsAnalyzingUrl(false);
    setUserConfirmedCategory(false);
    inputRef.current?.focus();
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast(`${label} ${t('copiedToClipboard')}`);
      }
    } catch (err) {
      console.warn('Copy error:', err);
    }
  };

  const openNewTaskModal = () => {
    setNewUrl('');
    setShowNewModal(true);
    setIsTypeSelectorOpen(false);
    setDiscoveredData(null);
    setIsDiscovering(false);
    setDiscoveryError(null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  };

  const closeNewTaskSettings = () => {
    setShowNewModal(false);
    setNewUrl('');
    setIsTypeSelectorOpen(false);
    setDiscoveredData(null);
    setIsDiscovering(false);
    setDiscoveryError(null);
  };

  const toggleCustomPanel = (trackerId: string) => {
    setOpenCustomPanels(prev => ({
      ...prev,
      [trackerId]: !prev[trackerId]
    }));
  };

  const toggleMangaExport = (trackerId: string) => {
    setExpandedMangaExport(prev => ({
      ...prev,
      [trackerId]: !prev[trackerId]
    }));
  };

  // Checkbox & Custom Selection Logic
  const toggleChapterSelect = (trackerId: string, chapterId: string | number) => {
    setSelectedChapters(prev => {
      const trackerSel = prev[trackerId] || {};
      const currentVal = !!trackerSel[chapterId];
      return {
        ...prev,
        [trackerId]: {
          ...trackerSel,
          [chapterId]: !currentVal
        }
      };
    });
  };

  const selectFirstNChapters = (tracker: Tracker, count: number) => {
    if (!tracker.chapters) return;
    const newSel: Record<string | number, boolean> = {};
    const limit = Math.min(count, tracker.chapters.length);
    for (let i = 0; i < tracker.chapters.length; i++) {
      const chId = tracker.chapters[i].id;
      newSel[chId] = i < limit;
    }
    setSelectedChapters(prev => ({
      ...prev,
      [tracker.id]: newSel
    }));
    showToast(`${t('selectedFirstN')} ${limit} ${t('chapters')}`);
  };

  const selectLastNChapters = (tracker: Tracker, count: number) => {
    if (!tracker.chapters) return;
    const newSel: Record<string | number, boolean> = {};
    const total = tracker.chapters.length;
    const startIdx = Math.max(0, total - count);
    let selectedCount = 0;
    for (let i = 0; i < total; i++) {
      const chId = tracker.chapters[i].id;
      const isSel = i >= startIdx;
      newSel[chId] = isSel;
      if (isSel) selectedCount++;
    }
    setSelectedChapters(prev => ({
      ...prev,
      [tracker.id]: newSel
    }));
    showToast(`${t('selectedLastN')} ${selectedCount} ${t('chapters')}`);
  };

  const selectAllInTracker = (tracker: Tracker) => {
    if (!tracker.chapters) return;
    const newSel: Record<string | number, boolean> = {};
    tracker.chapters.forEach(ch => {
      newSel[ch.id] = true;
    });
    setSelectedChapters(prev => ({
      ...prev,
      [tracker.id]: newSel
    }));
    showToast(`${t('selectAll')} (${tracker.chapters.length})`);
  };

  const deselectAllInTracker = (tracker: Tracker) => {
    setSelectedChapters(prev => ({
      ...prev,
      [tracker.id]: {}
    }));
    showToast(t('deselectAll'));
  };

  const invertSelectionInTracker = (tracker: Tracker) => {
    if (!tracker.chapters) return;
    setSelectedChapters(prev => {
      const currentSel = prev[tracker.id] || {};
      const newSel: Record<string | number, boolean> = {};
      tracker.chapters?.forEach(ch => {
        newSel[ch.id] = !currentSel[ch.id];
      });
      return {
        ...prev,
        [tracker.id]: newSel
      };
    });
    showToast(t('invertSelection'));
  };

  // Toggle Slow Server / Wait Mode on a tracker
  const toggleSlowServerMode = (trackerId: string) => {
    setTrackers(prev => prev.map(item => {
      if (item.id === trackerId) {
        const nextVal = !(item.slowServerMode ?? true);
        showToast(nextVal ? `${t('smartWaitMode')}: ON` : `${t('smartWaitMode')}: OFF`);
        return {
          ...item,
          slowServerMode: nextVal
        };
      }
      return item;
    }));
  };

  // Download specific selected chapters (batch / custom) with adaptive pacing and retries
  const handleDownloadSelectedChapters = async (tracker: Tracker) => {
    const trackerSel = selectedChapters[tracker.id] || {};
    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
    if (selectedChapterList.length === 0) return;

    const isSlow = tracker.slowServerMode ?? true;
    const isSequential = tracker.mode === 'sequential';
    setIsBatchDownloading(prev => ({ ...prev, [tracker.id]: true }));
    showToast(`${t('startingDownloadOf')} ${selectedChapterList.length} ${t('chaptersWord')} (${isSequential ? t('modeSequential') : t('modeContinuous')}${isSlow ? ' + ' + t('waitModeLabel') : ''})...`);
    
    // Concurrency: 1 if sequential (one by one), 2 if slow server, 4 if simultaneous
    const CONCURRENCY = isSequential ? 1 : (isSlow ? 2 : 4);
    let curIdx = 0;
    const updatedChapters = [...(tracker.chapters || [])];

    const worker = async () => {
      while (curIdx < selectedChapterList.length) {
        const targetCh = selectedChapterList[curIdx++];
        if (!targetCh) break;

        const chIdx = updatedChapters.findIndex(c => c.id === targetCh.id);
        if (chIdx === -1) continue;

        updatedChapters[chIdx] = { 
          ...updatedChapters[chIdx], 
          status: 'downloading',
          errorMsg: undefined
        };
        setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));

        try {
          const res = await downloadChapterWithAdaptiveRetry(targetCh.url, isSlow, (attempt, max, text) => {
            updatedChapters[chIdx] = { ...updatedChapters[chIdx], errorMsg: text };
            setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));
          }, { retrying: t('retryingWaitModePrefix'), waiting: t('waitingForServer') });

          updatedChapters[chIdx] = {
            ...updatedChapters[chIdx],
            status: res.success ? 'completed' : 'error',
            images: res.images,
            imageCount: res.images.length,
            videoUrl: res.videoUrl || updatedChapters[chIdx].videoUrl,
            mediaType: res.mediaType || updatedChapters[chIdx].mediaType,
            author: res.author || updatedChapters[chIdx].author,
            errorMsg: res.success ? undefined : t('serverDidNotRespond')
          };
        } catch (e) {
          console.error("Error downloading chapter:", e);
          updatedChapters[chIdx] = { ...updatedChapters[chIdx], status: 'error', errorMsg: 'Error de red' };
        }

        setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));

        // Intelligent pacing delay between chapter requests
        if (isSequential) {
          await new Promise(r => setTimeout(r, isSlow ? 600 : 250));
        } else if (isSlow) {
          await new Promise(r => setTimeout(r, 450));
        }
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, selectedChapterList.length); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    // Re-aggregate ordered images
    const finalImgs: string[] = [];
    updatedChapters.forEach(c => {
      if (c.images) finalImgs.push(...c.images);
    });

    const failedCount = updatedChapters.filter(c => c.status === 'error').length;

    setTrackers(prev => prev.map(item => item.id === tracker.id ? {
      ...item,
      chapters: updatedChapters,
      images: finalImgs,
      imageCount: finalImgs.length,
      status: updatedChapters.every(c => c.status === 'completed') ? 'completed' : item.status
    } : item));

    setIsBatchDownloading(prev => ({ ...prev, [tracker.id]: false }));
    if (failedCount === 0) {
      showToast(`${t('chapterDownloadSuccess')} (${finalImgs.length} ${t('pages')})`);
    } else {
      showToast(t('chapterRequiresRetry'));
    }
  };

  // Helper to ensure target chapters are downloaded into memory before packaging
  const ensureChaptersDownloaded = async (tracker: Tracker, targetChapters: ChapterInfo[]): Promise<ChapterInfo[]> => {
    const missing = targetChapters.filter(c => !c.images || c.images.length === 0);
    if (missing.length === 0) {
      return targetChapters;
    }

    const isSlow = tracker.slowServerMode ?? true;
    const isSequential = tracker.mode === 'sequential';
    const CONCURRENCY = isSequential ? 1 : (isSlow ? 2 : 4);

    setIsBatchDownloading(prev => ({ ...prev, [tracker.id]: true }));
    showToast(`${t('downloadingChaptersWord')} ${missing.length} ${t('requiredChapters')} (${isSequential ? t('sequentialWord') : t('simultaneousWord')})...`);

    let curIdx = 0;
    const updatedChapters = [...(tracker.chapters || [])];

    const worker = async () => {
      while (curIdx < missing.length) {
        const targetCh = missing[curIdx++];
        if (!targetCh) break;

        const chIdx = updatedChapters.findIndex(c => c.id === targetCh.id);
        if (chIdx === -1) continue;

        updatedChapters[chIdx] = { 
          ...updatedChapters[chIdx], 
          status: 'downloading',
          errorMsg: undefined
        };
        setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));

        try {
          const res = await downloadChapterWithAdaptiveRetry(targetCh.url, isSlow, (attempt, max, text) => {
            updatedChapters[chIdx] = { ...updatedChapters[chIdx], errorMsg: text };
            setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));
          }, { retrying: t('retryingWaitModePrefix'), waiting: t('waitingForServer') });

          updatedChapters[chIdx] = {
            ...updatedChapters[chIdx],
            status: res.success ? 'completed' : 'error',
            images: res.images,
            imageCount: res.images.length,
            videoUrl: res.videoUrl || updatedChapters[chIdx].videoUrl,
            mediaType: res.mediaType || updatedChapters[chIdx].mediaType,
            author: res.author || updatedChapters[chIdx].author,
            errorMsg: res.success ? undefined : t('serverDidNotRespond')
          };
        } catch (e) {
          console.error("Error downloading chapter:", e);
          updatedChapters[chIdx] = { ...updatedChapters[chIdx], status: 'error', errorMsg: 'Error de red' };
        }

        setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));

        if (isSequential) {
          await new Promise(r => setTimeout(r, isSlow ? 600 : 250));
        } else if (isSlow) {
          await new Promise(r => setTimeout(r, 450));
        }
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, missing.length); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const finalImgs: string[] = [];
    updatedChapters.forEach(c => {
      if (c.images) finalImgs.push(...c.images);
    });

    setTrackers(prev => prev.map(item => item.id === tracker.id ? {
      ...item,
      chapters: updatedChapters,
      images: finalImgs,
      imageCount: finalImgs.length,
      status: updatedChapters.every(c => c.status === 'completed') ? 'completed' : item.status
    } : item));

    setIsBatchDownloading(prev => ({ ...prev, [tracker.id]: false }));
    return targetChapters.map(ch => updatedChapters.find(u => u.id === ch.id) || ch);
  };

  // Dedicated one-click recovery for all failed / broken chapters with Mode Espera
  const handleRetryFailedChapters = async (tracker: Tracker) => {
    const failedList = (tracker.chapters || []).filter(c => 
      c.status === 'error' || 
      (c.status !== 'pending' && (!c.images || c.images.length === 0) && !c.videoUrl)
    );

    if (failedList.length === 0) {
      showToast(t('noFailedChaptersToRetry'));
      return;
    }

    setIsBatchDownloading(prev => ({ ...prev, [tracker.id]: true }));
    showToast(t('startingWaitModeRetry'));

    // Ensure slow server mode is active for this recovery
    setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, slowServerMode: true } : item));

    const CONCURRENCY = 2; // Strict 2 workers to avoid rate-limiting or 503s
    let curIdx = 0;
    const updatedChapters = [...(tracker.chapters || [])];

    const worker = async () => {
      while (curIdx < failedList.length) {
        const targetCh = failedList[curIdx++];
        if (!targetCh) break;

        const chIdx = updatedChapters.findIndex(c => c.id === targetCh.id);
        if (chIdx === -1) continue;

        updatedChapters[chIdx] = { 
          ...updatedChapters[chIdx], 
          status: 'downloading', 
          errorMsg: t('connectingWaitMode') 
        };
        setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));

        try {
          const res = await downloadChapterWithAdaptiveRetry(targetCh.url, true, (attempt, max, text) => {
            updatedChapters[chIdx] = { ...updatedChapters[chIdx], errorMsg: text };
            setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));
          }, { retrying: t('retryingWaitModePrefix'), waiting: t('waitingForServer') });

          updatedChapters[chIdx] = {
            ...updatedChapters[chIdx],
            status: res.success ? 'completed' : 'error',
            images: res.images,
            imageCount: res.images.length,
            videoUrl: res.videoUrl || updatedChapters[chIdx].videoUrl,
            mediaType: res.mediaType || updatedChapters[chIdx].mediaType,
            author: res.author || updatedChapters[chIdx].author,
            errorMsg: res.success ? undefined : t('serverDidNotRespond')
          };
        } catch (e) {
          console.error("Error retrying chapter:", e);
          updatedChapters[chIdx] = { ...updatedChapters[chIdx], status: 'error', errorMsg: t('connectionFailed') };
        }

        setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));
        // Generous pacing between retried chapters
        await new Promise(r => setTimeout(r, 750));
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, failedList.length); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const finalImgs: string[] = [];
    updatedChapters.forEach(c => {
      if (c.images) finalImgs.push(...c.images);
    });

    const remainingFails = updatedChapters.filter(c => c.status === 'error').length;
    setTrackers(prev => prev.map(item => item.id === tracker.id ? {
      ...item,
      chapters: updatedChapters,
      images: finalImgs,
      imageCount: finalImgs.length,
      status: updatedChapters.every(c => c.status === 'completed') ? 'completed' : item.status
    } : item));

    setIsBatchDownloading(prev => ({ ...prev, [tracker.id]: false }));
    if (remainingFails === 0) {
      showToast(`${t('recoveryCompletedAllDownloaded')} (${finalImgs.length} ${t('pages')})`);
    } else {
      showToast(`${t('recoveryProgress')} ${remainingFails}`);
    }
  };

  // Re-download a single specific chapter in Wait Mode
  const handleRetrySingleChapter = async (tracker: Tracker, chapterId: string | number) => {
    const chIdx = (tracker.chapters || []).findIndex(c => c.id === chapterId);
    if (chIdx === -1) return;
    const targetCh = tracker.chapters![chIdx];

    showToast(`${t('retryingWaitModePrefix')} "${targetCh.name}" ${t('inWaitMode')}`);

    const updatedChapters = [...(tracker.chapters || [])];
    updatedChapters[chIdx] = { 
      ...updatedChapters[chIdx], 
      status: 'downloading', 
      errorMsg: t('connectingToServer') 
    };
    setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));

    const res = await downloadChapterWithAdaptiveRetry(targetCh.url, true, (attempt, max, text) => {
      updatedChapters[chIdx] = { ...updatedChapters[chIdx], errorMsg: text };
      setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));
    });

    updatedChapters[chIdx] = {
      ...updatedChapters[chIdx],
      status: res.success ? 'completed' : 'error',
      images: res.images,
      imageCount: res.images.length,
      videoUrl: res.videoUrl || updatedChapters[chIdx].videoUrl,
      mediaType: res.mediaType || updatedChapters[chIdx].mediaType,
      author: res.author || updatedChapters[chIdx].author,
      errorMsg: res.success ? undefined : t('serverDidNotRespond')
    };

    const finalImgs: string[] = [];
    updatedChapters.forEach(c => {
      if (c.images) finalImgs.push(...c.images);
    });

    setTrackers(prev => prev.map(item => item.id === tracker.id ? {
      ...item,
      chapters: updatedChapters,
      images: finalImgs,
      imageCount: finalImgs.length,
      status: updatedChapters.every(c => c.status === 'completed') ? 'completed' : item.status
    } : item));

    if (res.success) {
      showToast(`"${targetCh.name}" ${t('downloadedSuccess')} (${res.images.length} ${t('pagesWord')})`);
    } else {
      showToast(`${t('serverFor')} "${targetCh.name}" ${t('didNotRespondInTime')}`);
    }
  };

  // 1. Download & Export Batch Chapters into a Single PDF (pdf-lib primary, img2pdf fallback)
  const handleDownloadBatchToSinglePdf = async (tracker: Tracker, qty?: number, direction?: 'first' | 'last') => {
    if (!tracker.chapters || tracker.chapters.length === 0) {
      showToast(t('noChaptersInManga'));
      return;
    }

    let targetChapters: ChapterInfo[] = [];
    if (direction === 'first' && qty) {
      selectFirstNChapters(tracker, qty);
      targetChapters = tracker.chapters.slice(0, Math.min(qty, tracker.chapters.length));
    } else if (direction === 'last' && qty) {
      selectLastNChapters(tracker, qty);
      const start = Math.max(0, tracker.chapters.length - qty);
      targetChapters = tracker.chapters.slice(start);
    } else {
      const trackerSel = selectedChapters[tracker.id] || {};
      targetChapters = tracker.chapters.filter(ch => trackerSel[ch.id]);
      if (targetChapters.length === 0) {
        showToast(t('selectAtLeastOneChapter'));
        return;
      }
    }

    // Step 1: Ensure all targeted chapters are fully downloaded into memory
    const downloadedChapters = await ensureChaptersDownloaded(tracker, targetChapters);
    
    // Step 2: Combine all chapter images in strict sequential order
    const combinedImages: string[] = [];
    downloadedChapters.forEach(ch => {
      if (ch.images && ch.images.length > 0) {
        combinedImages.push(...ch.images);
      }
    });

    if (combinedImages.length === 0) {
      showToast(t('failedToGetChapterImages'));
      return;
    }

    // Step 3: Execute high-performance unified PDF generation (pdf-lib with img2pdf fallback)
    const isSequential = tracker.mode === 'sequential';
    setGeneratingPdf({ id: tracker.id, engine: 'pdflib' });
    const title = `${tracker.title || 'manga'}_${targetChapters.length}_capitulos_unificado`;
    showToast(`⚡ ${t('creatingSinglePdf')} (${combinedImages.length} ${t('pagesWord')})... ${t('trackingMode')}: ${isSequential ? t('sequentialWord') : t('simultaneousWord')}`);

    try {
      await exportCombinedPdfWithFallback(tracker, combinedImages, title, (pct, cur, tot, msg) => {
        if (pct % 25 === 0 || pct === 100) {
          showToast(msg || `Compilando PDF: ${pct}%`);
        }
      });
      showToast(`${t('singlePdfSuccess')} (${combinedImages.length} ${t('pages')})`);
    } catch (err) {
      console.error('Error generating combined PDF:', err);
      showToast(t('pdfCompileError'));
    } finally {
      setGeneratingPdf(null);
    }
  };

  // 2. Export Selected Chapters into 1 Combined PDF (pdf-lib ➜ img2pdf fallback)
  const handleExportSelectedCombined = async (tracker: Tracker, engine?: 'pdflib' | 'img2pdf') => {
    const trackerSel = selectedChapters[tracker.id] || {};
    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
    if (selectedChapterList.length === 0) {
      showToast(t('selectAtLeastOneChapter'));
      return;
    }

    const downloadedChapters = await ensureChaptersDownloaded(tracker, selectedChapterList);
    const combinedImages: string[] = [];
    downloadedChapters.forEach(ch => {
      if (ch.images && ch.images.length > 0) {
        combinedImages.push(...ch.images);
      }
    });

    if (combinedImages.length === 0) {
      showToast(t('selectedNoDownloadedPages'));
      return;
    }

    const title = `${tracker.title || 'manga'}_${selectedChapterList.length}_capitulos_unificado`;
    setGeneratingPdf({ id: tracker.id, engine: engine || 'pdflib' });
    showToast(`${t('generatingSinglePdf')} (${combinedImages.length} ${t('pages')})`);

    try {
      if (engine === 'pdflib') {
        await exportWithPdfLib(tracker, combinedImages, title);
      } else if (engine === 'img2pdf') {
        await exportWithImg2Pdf(tracker, combinedImages, title);
      } else {
        await exportCombinedPdfWithFallback(tracker, combinedImages, title);
      }
      showToast(t('singlePdfCompleted'));
    } catch (err) {
      console.error('Export selected combined error:', err);
      showToast(t('pdfCompileError'));
    } finally {
      setGeneratingPdf(null);
    }
  };

  // 3. ZIP-Selección: Cada capítulo seleccionado como PDF dentro de un archivo ZIP
  const handleExportSelectedZipPdfs = async (tracker: Tracker) => {
    const trackerSel = selectedChapters[tracker.id] || {};
    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
    if (selectedChapterList.length === 0) {
      showToast(t('selectAtLeastOneChapter'));
      return;
    }

    const downloadedChapters = await ensureChaptersDownloaded(tracker, selectedChapterList);
    const validChapters = downloadedChapters.filter(ch => ch.images && ch.images.length > 0);
    if (validChapters.length === 0) {
      showToast(t('noSelectedChaptersDownloaded'));
      return;
    }

    const isSequential = tracker.mode === 'sequential';
    setGeneratingExport({ id: tracker.id, type: 'zip_pdfs' });
    showToast(t('packagingZipPdfs'));

    try {
      await exportSelectedChaptersAsZipPdfs(tracker, validChapters, isSequential, (pct, cur, tot) => {
        if (pct % 25 === 0 || pct === 100) {
          showToast(`ZIP: ${cur}/${tot} PDFs generados (${pct}%)`);
        }
      });
      showToast(t('zipPdfsSuccess'));
    } catch (e) {
      console.error('Error exporting ZIP with PDFs:', e);
      showToast(t('zipPdfsError'));
    } finally {
      setGeneratingExport(null);
    }
  };

  // 4. CBZ-Selección: Descarga de capítulos seleccionados en archivos .cbz individuales
  const handleExportSelectedIndividualCbz = async (tracker: Tracker) => {
    const trackerSel = selectedChapters[tracker.id] || {};
    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
    if (selectedChapterList.length === 0) {
      showToast(t('selectAtLeastOneChapter'));
      return;
    }

    const downloadedChapters = await ensureChaptersDownloaded(tracker, selectedChapterList);
    const validChapters = downloadedChapters.filter(ch => ch.images && ch.images.length > 0);
    if (validChapters.length === 0) {
      showToast(t('noSelectedChaptersDownloaded'));
      return;
    }

    const isSequential = tracker.mode === 'sequential';
    setGeneratingExport({ id: tracker.id, type: 'cbz_individual' });
    showToast(`${t('downloadingIndividualCbz')} ${validChapters.length} (${isSequential ? t('sequentialWord') : t('simultaneousWord')})...`);

    try {
      await exportSelectedChaptersIndividualCbz(tracker.title || 'manga', validChapters, isSequential, (pct, cur, tot) => {
        if (pct % 25 === 0 || pct === 100) {
          showToast(`CBZ: ${cur}/${tot} (${pct}%)`);
        }
      });
      showToast(t('cbzExportSuccess'));
    } catch (e) {
      console.error('Error exporting CBZ individual files:', e);
      showToast(t('cbzExportError'));
    } finally {
      setGeneratingExport(null);
    }
  };

  // 5. Individual Separate Chapter PDFs
  const handleExportSelectedIndividual = async (tracker: Tracker, engine?: 'pdflib' | 'img2pdf') => {
    const trackerSel = selectedChapters[tracker.id] || {};
    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
    if (selectedChapterList.length === 0) {
      showToast(t('noChaptersSelected'));
      return;
    }

    const downloadedChapters = await ensureChaptersDownloaded(tracker, selectedChapterList);
    const validChapters = downloadedChapters.filter(ch => ch.images && ch.images.length > 0);
    if (validChapters.length === 0) {
      showToast(t('noChaptersWithImages'));
      return;
    }

    const isSequential = tracker.mode === 'sequential';
    setGeneratingPdf({ id: tracker.id, engine: engine || 'pdflib' });
    showToast(`${t('exportingIndividualPdfs')} ${validChapters.length} (${isSequential ? t('sequentialWord') : t('simultaneousWord')})...`);

    try {
      await exportSelectedChaptersIndividualPdfs(tracker, validChapters, isSequential, (pct, cur, tot) => {
        if (pct % 25 === 0 || pct === 100) {
          showToast(`PDFs: ${cur}/${tot} (${pct}%)`);
        }
      });
      showToast(t('individualPdfsSuccess'));
    } catch (e) {
      console.error('Error exporting individual PDFs:', e);
      showToast(t('individualPdfsError'));
    } finally {
      setGeneratingPdf(null);
    }
  };

  // Helper to extract all ordered deduplicated images from a tracker
  const getTrackerImages = (tracker: Tracker): string[] => {
    const list: string[] = [];
    const seenUrls = new Set<string>();

    const addImg = (img: string | undefined | null) => {
      if (!img || typeof img !== 'string') return;
      const clean = img.trim().replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
      if (!clean) return;

      if (!seenUrls.has(clean)) {
        seenUrls.add(clean);
        list.push(clean);
      }
    };

    if (tracker.images && Array.isArray(tracker.images)) {
      tracker.images.forEach(addImg);
    }
    if (tracker.chapters && Array.isArray(tracker.chapters)) {
      tracker.chapters.forEach(ch => {
        if (ch.images && Array.isArray(ch.images)) {
          ch.images.forEach(addImg);
        }
      });
    }
    return list;
  };

  const getTrackerImageCount = (tracker: Tracker): number => {
    const imgs = getTrackerImages(tracker);
    if (imgs.length > 0) return imgs.length;
    if (tracker.chapters && tracker.chapters.length > 0) {
      return tracker.chapters.reduce((acc, c) => acc + (c.imageCount || c.images?.length || 0), 0);
    }
    return tracker.imageCount || tracker.images?.length || 0;
  };

  const handleExportPdf = async (
    tracker: Tracker, 
    engine: 'pdflib' | 'img2pdf', 
    customImages?: string[], 
    customTitle?: string,
    chapterId?: string | number
  ) => {
    const effectiveImgs = getTrackerImages(tracker);
    const imagesToExport = customImages && customImages.length > 0 ? customImages : effectiveImgs;
    if (!imagesToExport || imagesToExport.length === 0) {
      showToast(t('noPagesToExport'));
      return;
    }
    setGeneratingPdf({ id: tracker.id, chapterId, engine });

    try {
      if (engine === 'pdflib') {
        await exportWithPdfLib(tracker, imagesToExport, customTitle);
      } else {
        await exportWithImg2Pdf(tracker, imagesToExport, customTitle);
      }
      showToast(t('pdfReadyDownload'));
    } catch (err) {
      console.error(`Export failed with engine ${engine}:`, err);
      showToast(t('pdfCompileError'));
    } finally {
      setGeneratingPdf(null);
    }
  };

  // Dedicated Exporter for Manga Image Package (ZIP / CBZ)
  const handleExportImagePackage = async (
    tracker: Tracker,
    format: 'original' | 'webp' | 'png' | 'jpg' = 'original',
    archiveType: 'zip' | 'cbz' = 'zip',
    customImages?: string[],
    customTitle?: string,
    chapterId?: string | number
  ) => {
    const effectiveImgs = getTrackerImages(tracker);
    const imagesToExport = customImages && customImages.length > 0 ? customImages : effectiveImgs;
    if (!imagesToExport || imagesToExport.length === 0) {
      showToast(t('noPagesToExport'));
      return;
    }
    const typeKey = `${archiveType}_${format}`;
    setGeneratingExport({ id: tracker.id, chapterId, type: typeKey });
    showToast(`${t('packagingArchive')} (${imagesToExport.length} ${t('pages')})`);

    try {
      const defaultTitle = tracker.title || 'Manga_Export';
      const title = customTitle || defaultTitle;
      await exportImagesPackage({
        images: imagesToExport,
        title,
        format,
        archiveType
      });
      showToast(t('archiveDownloadComplete'));
    } catch (err) {
      console.error('Image export failed:', err);
      showToast(t('archivePackagingError'));
    } finally {
      setGeneratingExport(null);
    }
  };

  const handleExportVideo = async (
    tracker: Tracker,
    format: 'mp4' | 'mp3' = 'mp4',
    customUrl?: string,
    customTitle?: string,
    chapterId?: string | number
  ) => {
    const activeChapter = chapterId ? tracker.chapters?.find(c => c.id === chapterId) : tracker.chapters?.[0];
    const targetUrl = customUrl || activeChapter?.videoUrl || activeChapter?.audioUrl || activeChapter?.url || tracker.videoUrl || tracker.audioUrl || tracker.url;
    const targetAudioUrl = activeChapter?.audioUrl || tracker.audioUrl;
    const targetImageUrl = activeChapter?.images?.[0] || tracker.images?.[0];
    const isImageWithAudio = tracker.mediaType === 'image_with_audio' || activeChapter?.mediaType === 'image_with_audio' || (targetImageUrl && targetAudioUrl);

    setGeneratingExport({ id: tracker.id, chapterId, type: format });
    const defaultTitle = activeChapter?.name || tracker.title || (format === 'mp3' ? 'Audio_Export' : 'Video_Export');
    const title = customTitle || defaultTitle;

    try {
      if (format === 'mp3') {
        showToast(t('exportingAudio'));
        const success = await exportAudioMp3({
          videoUrl: targetUrl,
          audioUrl: targetAudioUrl,
          imageUrl: targetImageUrl,
          title,
          onProgress: (pct, msg) => {
            if (pct === 100) showToast(t('audioMp3Ready'));
          }
        });
        if (success) {
          showToast(t('mp3DownloadComplete'));
        } else {
          showToast(t('mp3ExtractionError'));
        }
      } else {
        if (isImageWithAudio && targetImageUrl) {
          showToast(t('synthesizingVideo'));
          const success = await exportImageWithAudioAsVideo({
            imageUrl: targetImageUrl,
            audioUrl: targetAudioUrl,
            title,
            onProgress: (pct, msg) => {
              if (pct === 100) showToast(t('videoMp4Ready'));
            }
          });
          if (success) {
            showToast(t('videoMp4DownloadComplete'));
          } else {
            showToast(t('videoSynthesisError'));
          }
        } else {
          showToast(t('exportingVideo'));
          const success = await exportVideo({
            videoUrl: targetUrl,
            imageUrl: targetImageUrl,
            audioUrl: targetAudioUrl,
            title,
            format: 'mp4',
            onProgress: (pct, msg) => {
              if (pct === 100) showToast(t('videoDownloadComplete'));
            }
          });
          if (success) {
            showToast(t('videoDownloadComplete'));
          } else {
            showToast(t('videoDownloadError'));
          }
        }
      }
    } catch (err) {
      console.error('Video/Audio export error:', err);
      showToast(t('mediaExportError'));
    } finally {
      setGeneratingExport(null);
    }
  };

  // Single page direct download handler without external redirection
  const handleDownloadSinglePage = async (imgUrl: string, pageNumber: number, chapterName?: string) => {
    const key = `${imgUrl}_${pageNumber}`;
    setDownloadingSinglePage(key);
    showToast(`${t('downloadingPage')} ${pageNumber}...`);
    try {
      const sanitizedCh = (chapterName || 'Capitulo').replace(/[/\\?%*:|"<>]/g, '_');
      const filename = `${sanitizedCh}_Pagina_${String(pageNumber).padStart(3, '0')}`;
      const success = await downloadSingleImage(imgUrl, filename);
      if (success) {
        showToast(`${t('pageDownloaded')} ${pageNumber}`);
      } else {
        showToast(`${t('pageDownloadError')} ${pageNumber}`);
      }
    } catch (err) {
      console.error('Download single page error:', err);
      showToast(t('pageDownloadFailed'));
    } finally {
      setDownloadingSinglePage(null);
    }
  };

  // Helper to wait while paused
  const checkPauseOrStop = async (trackerId: string): Promise<boolean> => {
    const ctrl = controlsRef.current[trackerId];
    if (!ctrl) return false;
    if (ctrl.isStopped) return false;

    if (ctrl.isPaused) {
      await new Promise<void>((resolve) => {
        ctrl.resumeResolver = resolve;
      });
      if (ctrl.isStopped) return false;
    }
    return true;
  };

  // Core execution routine for a Tracker
  const executeTracker = useCallback(async (trackerId: string, url: string, mode: TrackingMode, category: SearchCategory = 'manga') => {
    controlsRef.current[trackerId] = { isPaused: false, isStopped: false };

    // Update status to running
    setTrackers(prev => prev.map(item => {
      if (item.id === trackerId) {
        return {
          ...item,
          status: 'running',
          progress: 5,
          downloadSpeed: t('calculating'),
          currentChapter: mode === 'single' ? undefined : t('discoveringChapters')
        };
      }
      return item;
    }));

    const startTime = Date.now();
    let totalBytesEstimated = 0;

    // 1. Single Chapter / Media Mode
    if (mode === 'single') {
      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, mode: 'single' })
        });

        if (!res.ok) throw new Error('Download failed');
        const data = await res.json();
        const images: string[] = data.images || [];
        const detectedMediaType: 'image' | 'video' = data.mediaType || (category === 'video' ? 'video' : 'image');

        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.5);
        totalBytesEstimated = images.length * 180 * 1024; // ~180KB per webp
        const speedMb = ((totalBytesEstimated / (1024 * 1024)) / elapsedSec).toFixed(1);

        const singleChapterName = data.chapterName || (detectedMediaType === 'video' ? 'Video 1' : (t('chapter') + ' 1'));
        const singleChapter: ChapterInfo = {
          id: 1,
          name: singleChapterName,
          url,
          images,
          imageCount: images.length,
          status: 'completed',
          mediaType: detectedMediaType,
          videoUrl: data.videoUrl,
          videoEmbedUrl: data.videoEmbedUrl,
          author: data.author,
          authorUrl: data.authorUrl
        };

        setTrackers(prev => prev.map(item => {
          if (item.id === trackerId) {
            const updatedTitle = data.seriesTitle 
              ? (data.chapterName ? `${data.seriesTitle} - ${data.chapterName}` : data.seriesTitle)
              : (data.chapterName || item.title);
            return {
              ...item,
              title: updatedTitle,
              category: item.category || category,
              status: 'completed',
              progress: 100,
              imageCount: images.length,
              images,
              chapters: [singleChapter],
              downloadSpeed: `${speedMb} MB/s`,
              totalChapters: 1,
              completedChapters: 1,
              mediaType: detectedMediaType,
              videoUrl: data.videoUrl,
              videoEmbedUrl: data.videoEmbedUrl,
              author: data.author || item.author,
              authorUrl: data.authorUrl || item.authorUrl
            };
          }
          return item;
        }));
      } catch (err) {
        console.error('Single media scraping failed:', err);
        setTrackers(prev => prev.map(item => item.id === trackerId ? { ...item, status: 'error', downloadSpeed: '0 MB/s' } : item));
      }
      return;
    }

    // 2. Sequential & Continuous: First discover all chapters / tracks
    let chapters: ChapterInfo[] = [];
    let seriesTitle = '';
    let discoveredCategory: SearchCategory | undefined = undefined;

    try {
      const chapterRes = await fetch('/api/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (chapterRes.ok) {
        const chData = await chapterRes.json();
        chapters = chData.chapters || [];
        seriesTitle = chData.seriesTitle || '';
        if (chData.category === 'video' || chData.category === 'image' || chData.category === 'manga') {
          discoveredCategory = chData.category;
        } else if (chData.mediaType === 'video') {
          discoveredCategory = 'video';
        } else if (chData.mediaType === 'image') {
          discoveredCategory = 'image';
        }
      }
    } catch (chErr) {
      console.warn('Chapters discovery failed, will fallback to single URL:', chErr);
    }

    if (!chapters || chapters.length === 0) {
      chapters = [{ id: 1, name: `${t('defaultChapterName')} 1`, url }];
    }

    const initialChapters: ChapterInfo[] = chapters.map((c, idx) => ({
      id: c.id || (idx + 1),
      name: c.name || `${t('chapter')} ${idx + 1}`,
      url: c.url,
      status: (c.images && c.images.length > 0) ? 'completed' : 'pending',
      images: c.images || [],
      imageCount: c.images?.length || 0,
      mediaType: c.mediaType || (category === 'video' ? 'video' : 'image'),
      videoUrl: c.videoUrl,
      videoEmbedUrl: c.videoEmbedUrl,
      author: c.author,
      authorUrl: c.authorUrl
    }));

    const initialImages: string[] = [];
    chapters.forEach(c => {
      if (c.images && c.images.length > 0) {
        initialImages.push(...c.images);
      }
    });

    const isAlreadyFullyDiscovered = initialChapters.length > 0 && initialChapters.every(c => c.status === 'completed' && ((c.images && c.images.length > 0) || c.videoUrl));
    if (isAlreadyFullyDiscovered) {
      setTrackers(prev => prev.map(item => {
        if (item.id === trackerId) {
          return {
            ...item,
            title: seriesTitle || item.title,
            category: discoveredCategory || item.category || category,
            mediaType: initialChapters[0]?.mediaType || (category === 'video' ? 'video' : 'image'),
            videoUrl: initialChapters[0]?.videoUrl || item.videoUrl,
            author: initialChapters[0]?.author || item.author,
            totalChapters: chapters.length,
            completedChapters: chapters.length,
            progress: 100,
            status: 'completed',
            imageCount: initialImages.length,
            images: initialImages,
            chapters: [...initialChapters],
            downloadSpeed: '0 MB/s',
            currentChapter: `${chapters.length} / ${chapters.length} ${t('chapters')}`
          };
        }
        return item;
      }));
      return;
    }

    const currentChaptersState: ChapterInfo[] = [...initialChapters];

    setTrackers(prev => prev.map(item => {
      if (item.id === trackerId) {
        return {
          ...item,
          title: seriesTitle || item.title,
          category: item.category || category,
          mediaType: initialChapters[0]?.mediaType || (category === 'video' ? 'video' : 'image'),
          videoUrl: initialChapters[0]?.videoUrl || item.videoUrl,
          author: initialChapters[0]?.author || item.author,
          totalChapters: chapters.length,
          completedChapters: 0,
          progress: 8,
          chapters: [...currentChaptersState],
          currentChapter: `0 / ${chapters.length} ${t('chapters')}`
        };
      }
      return item;
    }));

    const isSlowServer = memoryTrackers.find(t => t.id === trackerId)?.slowServerMode ?? true;

    // 2A. SEQUENTIAL MODE (Track one chapter after another in order)
    if (mode === 'sequential') {
      const allImages: string[] = [];
      let completedCount = 0;

      for (let i = 0; i < chapters.length; i++) {
        const canContinue = await checkPauseOrStop(trackerId);
        if (!canContinue) return;

        const chapter = currentChaptersState[i];
        currentChaptersState[i] = {
          ...currentChaptersState[i],
          status: 'downloading',
          errorMsg: undefined
        };

        setTrackers(prev => prev.map(item => {
          if (item.id === trackerId) {
            return {
              ...item,
              currentChapter: `${chapter.name} (${i + 1}/${chapters.length})`,
              chapters: [...currentChaptersState]
            };
          }
          return item;
        }));

        let chImages: string[] = [];
        let chVideoUrl = currentChaptersState[i].videoUrl;
        let chMediaType = currentChaptersState[i].mediaType;
        let chAuthor = currentChaptersState[i].author;

        try {
          const res = await downloadChapterWithAdaptiveRetry(chapter.url, isSlowServer, (attempt, max, text) => {
            currentChaptersState[i] = { ...currentChaptersState[i], errorMsg: text };
            setTrackers(prev => prev.map(item => item.id === trackerId ? { ...item, chapters: [...currentChaptersState] } : item));
          });

          if (res.success) {
            chImages = res.images || [];
            if (res.videoUrl) chVideoUrl = res.videoUrl;
            if (res.mediaType) chMediaType = res.mediaType;
            if (res.author) chAuthor = res.author;
            allImages.push(...chImages);
            completedCount++;
            totalBytesEstimated += chImages.length * 180 * 1024;
          }
        } catch (e) {
          console.warn(`Error on chapter ${chapter.name}:`, e);
        }

        currentChaptersState[i] = {
          ...currentChaptersState[i],
          status: (chImages.length > 0 || chVideoUrl) ? 'completed' : 'error',
          images: chImages,
          imageCount: chImages.length,
          videoUrl: chVideoUrl,
          mediaType: chMediaType,
          author: chAuthor,
          errorMsg: (chImages.length > 0 || chVideoUrl) ? undefined : t('serverDidNotRespond')
        };

        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 1);
        const speedMb = ((totalBytesEstimated / (1024 * 1024)) / elapsedSec).toFixed(1);
        const progressPct = Math.min(Math.round(((i + 1) / chapters.length) * 100), 99);

        setTrackers(prev => prev.map(item => {
          if (item.id === trackerId) {
            return {
              ...item,
              progress: progressPct,
              imageCount: allImages.length,
              images: [...allImages],
              chapters: [...currentChaptersState],
              completedChapters: completedCount,
              downloadSpeed: `${speedMb} MB/s`,
              videoUrl: chVideoUrl || item.videoUrl,
              mediaType: chMediaType || item.mediaType,
              author: chAuthor || item.author
            };
          }
          return item;
        }));

        if (isSlowServer) {
          await new Promise(r => setTimeout(r, 600));
        }
      }

      setTrackers(prev => prev.map(item => {
        if (item.id === trackerId) {
          return {
            ...item,
            status: 'completed',
            progress: 100,
            imageCount: allImages.length,
            images: allImages,
            chapters: [...currentChaptersState],
            completedChapters: completedCount,
            currentChapter: `${completedCount} / ${chapters.length} ${t('chapters')}`,
            downloadSpeed: '0 MB/s',
            videoUrl: currentChaptersState[0]?.videoUrl || item.videoUrl,
            mediaType: currentChaptersState[0]?.mediaType || item.mediaType,
            author: currentChaptersState[0]?.author || item.author
          };
        }
        return item;
      }));
      return;
    }

    // 2B. CONTINUOUS MODE (Simultaneous parallel streams with controlled rate)
    if (mode === 'continuous') {
      let completedCount = 0;
      const CONCURRENCY = isSlowServer ? 2 : 4;
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < chapters.length) {
          const idx = currentIndex++;
          if (idx >= chapters.length) break;

          const canContinue = await checkPauseOrStop(trackerId);
          if (!canContinue) break;

          currentChaptersState[idx] = {
            ...currentChaptersState[idx],
            status: 'downloading',
            errorMsg: undefined
          };

          setTrackers(prev => prev.map(item => {
            if (item.id === trackerId) {
              return {
                ...item,
                chapters: [...currentChaptersState]
              };
            }
            return item;
          }));

          let chImages: string[] = [];
          let chVideoUrl = currentChaptersState[idx].videoUrl;
          let chMediaType = currentChaptersState[idx].mediaType;
          let chAuthor = currentChaptersState[idx].author;

          try {
            const res = await downloadChapterWithAdaptiveRetry(currentChaptersState[idx].url, isSlowServer, (attempt, max, text) => {
              currentChaptersState[idx] = { ...currentChaptersState[idx], errorMsg: text };
              setTrackers(prev => prev.map(item => item.id === trackerId ? { ...item, chapters: [...currentChaptersState] } : item));
            });

            if (res.success) {
              chImages = res.images || [];
              if (res.videoUrl) chVideoUrl = res.videoUrl;
              if (res.mediaType) chMediaType = res.mediaType;
              if (res.author) chAuthor = res.author;
              totalBytesEstimated += chImages.length * 180 * 1024;
            }
          } catch (e) {
            console.warn(`Parallel worker error on chapter ${idx}:`, e);
          }

          currentChaptersState[idx] = {
            ...currentChaptersState[idx],
            status: (chImages.length > 0 || chVideoUrl) ? 'completed' : 'error',
            images: chImages,
            imageCount: chImages.length,
            videoUrl: chVideoUrl,
            mediaType: chMediaType,
            author: chAuthor,
            errorMsg: (chImages.length > 0 || chVideoUrl) ? undefined : t('serverDidNotRespond')
          };

          completedCount++;
          const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.8);
          const speedMb = ((totalBytesEstimated / (1024 * 1024)) / elapsedSec).toFixed(1);
          const progressPct = Math.min(Math.round((completedCount / chapters.length) * 100), 99);

          const currentOrderedImages: string[] = [];
          for (let k = 0; k < currentChaptersState.length; k++) {
            if (currentChaptersState[k].images && currentChaptersState[k].images!.length > 0) {
              currentOrderedImages.push(...currentChaptersState[k].images!);
            }
          }

          setTrackers(prev => prev.map(item => {
            if (item.id === trackerId) {
              return {
                ...item,
                progress: progressPct,
                completedChapters: completedCount,
                imageCount: currentOrderedImages.length,
                images: currentOrderedImages,
                chapters: [...currentChaptersState],
                downloadSpeed: `${speedMb} MB/s`,
                currentChapter: `${completedCount} / ${chapters.length} ${t('chapters')}`,
                videoUrl: chVideoUrl || item.videoUrl,
                mediaType: chMediaType || item.mediaType,
                author: chAuthor || item.author
              };
            }
            return item;
          }));

          if (isSlowServer) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      };

      const workers = [];
      for (let w = 0; w < Math.min(CONCURRENCY, chapters.length); w++) {
        workers.push(worker());
      }

      await Promise.all(workers);

      const finalOrderedImages: string[] = [];
      for (let k = 0; k < currentChaptersState.length; k++) {
        if (currentChaptersState[k].images && currentChaptersState[k].images!.length > 0) {
          finalOrderedImages.push(...currentChaptersState[k].images!);
        }
      }

      setTrackers(prev => prev.map(item => {
        if (item.id === trackerId) {
          return {
            ...item,
            status: 'completed',
            progress: 100,
            imageCount: finalOrderedImages.length,
            images: finalOrderedImages,
            chapters: [...currentChaptersState],
            completedChapters: completedCount,
            currentChapter: `${completedCount} / ${chapters.length} ${t('chapters')}`,
            downloadSpeed: '0 MB/s',
            videoUrl: currentChaptersState[0]?.videoUrl || item.videoUrl,
            mediaType: currentChaptersState[0]?.mediaType || item.mediaType,
            author: currentChaptersState[0]?.author || item.author
          };
        }
        return item;
      }));
      return;
    }
  }, [t, setTrackers]);

  // -------------------------------------------------------------
  // Architectural Pipeline: Discovery, Metadata Inspection & Preparation
  // -------------------------------------------------------------
  const handlePrepareDownload = async (urlOverride?: string) => {
    const rawTarget = urlOverride || newUrl;
    const cleanUrl = cleanInputUrl(rawTarget);
    if (!cleanUrl) {
      showToast(language === 'es' ? 'Introduce una URL para analizar' : 'Enter a URL to analyze');
      return;
    }

    const fullUrl = `https://${cleanUrl}`;
    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveredData(null);
    setDiscoveryVideoPreviewPlaying(false);
    setShowVideoDiagnosticsModal(false);

    try {
      // 1. Evaluate Server Capacity in parallel
      try {
        const capRes = await fetch('/api/server-capacity');
        if (capRes.ok) {
          const capData = await capRes.json();
          setServerCapacityStatus(capData);
        }
      } catch {
        // Soft fallback if capacity check is non-fatal
      }

      // 2. Probing Discovery Endpoint (HEAD requests, platform thumbnails, metadata without body download)
      const res = await fetch('/api/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: fullUrl,
          category: newCategory
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error ${res.status}: ${res.statusText}`);
      }

      const data: DiscoveredContent = await res.json();
      setDiscoveredData(data);

      // Initialize selected chapters for manga or collection items
      if (data.items && data.items.length > 0) {
        const initSel: Record<string | number, boolean> = {};
        data.items.forEach(it => {
          initSel[it.id] = true;
        });
        setDiscoveredSelectedChapters(initSel);
      }

      // Sync category if discovered
      if (data.type === 'video') setNewCategory('video');
      else if (data.type === 'image') setNewCategory('image');
      else if (data.type === 'manga') setNewCategory('manga');

      showToast(`${t('contentFound')}: ${data.title || data.platform}`);
    } catch (err: any) {
      console.error('Discovery error:', err);
      setDiscoveryError(err.message || 'Error al analizar el enlace');
      showToast(err.message || 'Error al analizar metadatos');
    } finally {
      setIsDiscovering(false);
    }
  };

  const toggleDiscoveredChapter = (id: string | number) => {
    setDiscoveredSelectedChapters(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const selectAllDiscovered = () => {
    if (!discoveredData?.items) return;
    const sel: Record<string | number, boolean> = {};
    discoveredData.items.forEach(it => {
      sel[it.id] = true;
    });
    setDiscoveredSelectedChapters(sel);
    showToast(`${t('selectAll')} (${discoveredData.items.length})`);
  };

  const deselectAllDiscovered = () => {
    setDiscoveredSelectedChapters({});
    showToast(t('deselectAll'));
  };

  const getDiscoveredBatchMetrics = () => {
    if (!discoveredData) {
      return {
        selectedCount: 0,
        totalPages: 0,
        totalSizeBytes: 0,
        totalSizeFormatted: '0 MB',
        isExceedingSafetyLimit: false,
        recommendLocal: false
      };
    }

    if (!discoveredData.items || discoveredData.items.length === 0) {
      const bytes = discoveredData.estimatedSizeBytes || 0;
      const isOver = false;
      const res = discoveredData.resolvedDownload;
      const canLocal = res ? res.canLocal : (discoveredData.downloadCapabilities?.local ?? true);
      const canInternal = true; // Unrestricted internal server downloads

      return {
        selectedCount: discoveredData.totalItems || 1,
        totalPages: discoveredData.totalPages || 1,
        totalSizeBytes: bytes,
        totalSizeFormatted: (discoveredData.estimatedSizeFormatted && discoveredData.estimatedSizeFormatted !== 'Desconocido')
          ? discoveredData.estimatedSizeFormatted
          : (bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '~25 MB'),
        isExceedingSafetyLimit: false,
        recommendLocal: (res?.mode === 'local') || (discoveredData.recommendedMode === 'local'),
        canLocal,
        canInternal,
        mode: res?.mode || (canLocal ? 'local' : (canInternal ? 'internal' : 'unavailable')),
        reason: res?.reason || discoveredData.recommendationReason,
        requiresSession: res?.requiresSession || discoveredData.requiresSession || false,
        canVerify: res?.canVerify || discoveredData.canVerify || false,
        provider: res?.provider || discoveredData.platformName || discoveredData.platform || 'Proveedor',
        sessionId: res?.sessionId || discoveredData.sessionId,
      };
    }

    const selectedList = discoveredData.items.filter(it => discoveredSelectedChapters[it.id]);
    const selectedCount = selectedList.length;
    const totalPages = selectedList.reduce((acc, it) => acc + (it.pageCount || 18), 0);
    const totalSizeBytes = selectedList.reduce((acc, it) => acc + (it.estimatedSizeBytes || (it.pageCount || 18) * 180 * 1024), 0);

    const mb = totalSizeBytes / (1024 * 1024);
    const totalSizeFormatted = mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
    const isExceedingSafetyLimit = false;
    const recommendLocal = (serverCapacityStatus ? !serverCapacityStatus.isSafe : false);
    const res = discoveredData.resolvedDownload;
    const canLocal = res ? res.canLocal : (discoveredData.downloadCapabilities?.local ?? true);
    const canInternal = true; // Unrestricted internal server downloads

    return {
      selectedCount,
      totalPages,
      totalSizeBytes,
      totalSizeFormatted,
      isExceedingSafetyLimit,
      recommendLocal,
      canLocal,
      canInternal,
      mode: res?.mode || (canLocal ? 'local' : (canInternal ? 'internal' : 'unavailable')),
      reason: res?.reason || discoveredData.recommendationReason,
      requiresSession: res?.requiresSession || discoveredData.requiresSession || false,
      canVerify: res?.canVerify || discoveredData.canVerify || false,
      provider: res?.provider || discoveredData.platformName || discoveredData.platform || 'Proveedor',
      sessionId: res?.sessionId || discoveredData.sessionId,
    };
  };

  // ExtractionSession: Verification flow handlers
  const handleStartVerificationFlow = async (url: string, providerName?: string, existingSessionId?: string) => {
    let activeSessionId = existingSessionId;

    if (!activeSessionId) {
      try {
        const res = await fetch('/api/extraction-session/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            provider: providerName,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          }),
        });
        if (res.ok) {
          const sess = await res.json();
          activeSessionId = sess.sessionId;
        }
      } catch (err) {
        console.warn('Error creating extraction session:', err);
      }
    }

    setVerificationModal({
      isOpen: true,
      url,
      provider: providerName || 'Proveedor Web',
      sessionId: activeSessionId,
      status: 'pending',
      useSessionUserAgent: true,
      errorMessage: undefined,
    });
  };

  const handleConfirmVerification = async () => {
    if (!verificationModal.sessionId) {
      showToast(t('noActiveVerificationSession'));
      return;
    }

    setVerificationModal(prev => ({ ...prev, status: 'verifying', errorMessage: undefined }));

    try {
      const res = await fetch('/api/extraction-session/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: verificationModal.sessionId,
          userAgent: verificationModal.useSessionUserAgent && typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          forceVerified: true,
        }),
      });

      const data = await res.json();

      if (data.status === 'verified') {
        setVerificationModal(prev => ({ ...prev, status: 'verified' }));
        showToast(t('sessionVerifiedPreparing'));
        setTimeout(() => {
          setVerificationModal(prev => ({ ...prev, isOpen: false }));
          handleExecuteLocalDownload(verificationModal.sessionId);
        }, 800);
      } else {
        setVerificationModal(prev => ({
          ...prev,
          status: 'invalid',
          errorMessage: t('verificationSessionExpired'),
        }));
        showToast(t('sessionExpiredOrInvalidToast'));
      }
    } catch {
      setVerificationModal(prev => ({
        ...prev,
        status: 'invalid',
        errorMessage: t('communicationErrorVerification'),
      }));
    }
  };

  const handleCloseVerificationModal = () => {
    if (verificationModal.sessionId && verificationModal.status !== 'verified') {
      fetch('/api/extraction-session/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: verificationModal.sessionId }),
      }).catch(() => {});
    }
    setVerificationModal(prev => ({ ...prev, isOpen: false, status: 'idle' }));
  };

  // User Chooses: Direct Local Download to Device (Backend-Authoritative)
  const handleExecuteLocalDownload = async (verifiedSessionId?: string) => {
    if (!discoveredData) return;

    const title = discoveredData.title || 'descarga_megiddo_ray';
    const ext = discoveredData.type === 'video' ? 'mp4' : discoveredData.type === 'image' ? 'jpg' : 'zip';
    const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
    const rawTargetUrl = discoveredData.url || discoveredData.cleanUrl || discoveredData.originalUrl || newUrl;

    // 1. For video or image media: Validate & resolve using backend prepare phase
    if (discoveredData.type === 'video' || discoveredData.type === 'image') {
      showToast(t('verifyingMediaStream'));

      try {
        const prepRes = await fetch('/api/download/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: rawTargetUrl,
            candidateUrl: discoveredData.directResourceUrl || discoveredData.resolvedDownload?.url,
            filename: safeFilename,
            expectedType: discoveredData.type,
            estimatedSize: discoveredData.estimatedSizeBytes,
            duration: discoveredData.duration,
            sessionId: verifiedSessionId || discoveredData.sessionId,
          }),
        });

        if (!prepRes.ok) {
          const errData = await prepRes.json().catch(() => ({}));
          if (errData.requiresSession || errData.canVerify) {
            showToast(t('resourceRequiresVerificationToast'));
            handleStartVerificationFlow(rawTargetUrl, errData.provider || discoveredData.platform, errData.sessionId);
            return;
          }
          showToast(errData.reason || errData.message || t('localDownloadUnavailableInternalFallback'));
          handleExecuteInternalDownload();
          return;
        }

        const capability = await prepRes.json();

        if (capability.requiresSession || capability.canVerify) {
          showToast(t('resourceRequiresVerificationToast'));
          handleStartVerificationFlow(rawTargetUrl, capability.provider || discoveredData.platform, capability.sessionId);
          return;
        }

        if (capability.sessionInvalid) {
          showToast(t('sessionExpiredOrInvalidToast'));
          handleStartVerificationFlow(rawTargetUrl, capability.provider || discoveredData.platform);
          return;
        }

        if (!capability.available || capability.mode === 'unavailable') {
          showToast(capability.reason || t('localDirectUnavailableUsingInternal'));
          handleExecuteInternalDownload();
          return;
        }

        // Backend authoritative routing: always wrap external URLs into same-origin proxy
        let downloadUrl = '';
        if (capability.mode === 'direct' && capability.url) {
          const isRemote = capability.url.startsWith('http://') || capability.url.startsWith('https://');
          if (isRemote && !capability.url.startsWith(window.location.origin)) {
            downloadUrl = `/api/download/direct?url=${encodeURIComponent(capability.url)}&filename=${encodeURIComponent(capability.filename || safeFilename)}`;
          } else {
            downloadUrl = capability.url;
          }
        } else if (capability.mode === 'proxy' && (capability.downloadUrl || capability.token)) {
          downloadUrl = capability.downloadUrl || `/api/download/file?token=${capability.token}&filename=${encodeURIComponent(capability.filename || safeFilename)}`;
        }

        if (!downloadUrl) {
          showToast(t('couldNotGenerateSecureUrl'));
          handleExecuteInternalDownload();
          return;
        }

        // Trigger verified same-origin browser native download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = capability.filename || safeFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(t('downloadingDirectlyToDevice'));
      } catch (prepErr) {
        console.warn('Download preparation error:', prepErr);
        showToast(t('downloadPrepCommunicationError'));
        handleExecuteInternalDownload();
        return;
      }
    } else if (discoveredData.type === 'manga' && discoveredData.items && discoveredData.items.length > 0) {
      // For manga or batch collection in local mode:
      const selected = discoveredData.items.filter(it => discoveredSelectedChapters[it.id]);
      const manifestData = {
        title: discoveredData.title,
        platform: discoveredData.platform,
        url: discoveredData.url,
        chapters: selected.map(it => ({ id: it.id, name: it.name, url: it.url, pages: it.pageCount }))
      };
      const blob = new Blob([JSON.stringify(manifestData, null, 2)], { type: 'application/json' });
      const manifestUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = manifestUrl;
      link.download = `${title}_enlaces_directos.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(manifestUrl);
    }

    // 2. Register Tracker in local mode so user can see it in dashboard
    const embedUrl = discoveredData.videoEmbedUrl || (discoveredData.previewUrl?.includes('embed') ? discoveredData.previewUrl : undefined);
    const resolvedPreview = discoveredData.previewUrl || discoveredData.videoPreview?.previewUrl;

    const newTracker: Tracker = {
      id: uuidv4(),
      url: discoveredData.url || discoveredData.originalUrl || newUrl || '',
      title: discoveredData.title,
      author: discoveredData.author,
      authorUrl: discoveredData.authorUrl,
      category: discoveredData.type === 'video' ? 'video' : discoveredData.type === 'image' ? 'image' : 'manga',
      mode: newMode,
      status: 'completed',
      progress: 100,
      downloadSpeed: 'Local (Directo al dispositivo)',
      downloadMode: 'local',
      imageCount: discoveredData.totalPages || 1,
      images: discoveredData.thumbnailUrl ? [discoveredData.thumbnailUrl] : [],
      mediaType: discoveredData.type === 'video' ? 'video' : 'image',
      dateAdded: new Date().toISOString(),
      thumbnailUrl: discoveredData.thumbnailUrl,
      estimatedSizeBytes: discoveredData.estimatedSizeBytes,
      estimatedSizeFormatted: discoveredData.estimatedSizeFormatted,
      videoUrl: discoveredData.directResourceUrl,
      videoEmbedUrl: embedUrl,
      previewUrl: resolvedPreview,
      previewDiagnostics: discoveredData.videoPreviewDiagnostics,
      isDirectLocalAvailable: true,
      totalChapters: discoveredData.totalItems || 1,
      completedChapters: discoveredData.totalItems || 1
    };

    setTrackers(prev => [newTracker, ...prev]);
    setShowNewModal(false);
    setDiscoveredData(null);
    setNewUrl('');
    showToast(t('localDownloadSent'));
  };

  // User Chooses: Internal Server Processing & Packaging
  const handleExecuteInternalDownload = () => {
    if (!discoveredData) return;

    const metrics = getDiscoveredBatchMetrics();
    const chosenCategory: SearchCategory = discoveredData.type === 'video' ? 'video' : discoveredData.type === 'image' ? 'image' : 'manga';

    // Map discovered items to initial ChapterInfo list if available
    let initialChapters: ChapterInfo[] | undefined = undefined;
    if (discoveredData.items && discoveredData.items.length > 0) {
      const selected = discoveredData.items.filter(it => discoveredSelectedChapters[it.id]);
      if (selected.length === 0) {
        showToast(t('selectAtLeastOneChapter'));
        return;
      }
      initialChapters = selected.map(it => ({
        id: it.id,
        name: it.name || it.title || `${t('defaultChapterName')} ${it.id}`,
        url: it.url,
        imageCount: it.pageCount || 0,
        status: 'pending',
        estimatedSizeBytes: it.estimatedSizeBytes,
        estimatedSizeFormatted: it.estimatedSizeFormatted
      }));
    }

    const embedUrl = discoveredData.videoEmbedUrl || (discoveredData.previewUrl?.includes('embed') ? discoveredData.previewUrl : undefined);
    const resolvedPreview = discoveredData.previewUrl || discoveredData.videoPreview?.previewUrl;

    const newTracker: Tracker = {
      id: uuidv4(),
      url: discoveredData.url || discoveredData.originalUrl || newUrl || '',
      title: discoveredData.title,
      author: discoveredData.author,
      authorUrl: discoveredData.authorUrl,
      category: chosenCategory,
      mode: newMode,
      slowServerMode: newSlowServerMode,
      status: 'running',
      progress: 10,
      downloadSpeed: t('calculating'),
      downloadMode: 'internal',
      imageCount: 0,
      images: discoveredData.thumbnailUrl ? [discoveredData.thumbnailUrl] : [],
      mediaType: chosenCategory === 'video' ? 'video' : 'image',
      dateAdded: new Date().toISOString(),
      thumbnailUrl: discoveredData.thumbnailUrl,
      estimatedSizeBytes: metrics.totalSizeBytes || discoveredData.estimatedSizeBytes,
      estimatedSizeFormatted: metrics.totalSizeFormatted || discoveredData.estimatedSizeFormatted,
      totalChapters: initialChapters ? initialChapters.length : (discoveredData.totalItems || 1),
      completedChapters: 0,
      chapters: initialChapters,
      videoUrl: discoveredData.directResourceUrl,
      videoEmbedUrl: embedUrl,
      previewUrl: resolvedPreview,
      previewDiagnostics: discoveredData.videoPreviewDiagnostics,
      isDirectLocalAvailable: !!discoveredData.directResourceUrl
    };

    setTrackers(prev => [newTracker, ...prev]);
    setShowNewModal(false);
    setDiscoveredData(null);
    setNewUrl('');
    showToast(`${t('startingInternalProcessing')} (${metrics.totalSizeFormatted})`);

    // Run execution pipeline
    executeTracker(newTracker.id, newTracker.url, newTracker.mode, chosenCategory);
  };

  const addTracker = async (categoryOverride?: SearchCategory) => {
    const chosenCategory = categoryOverride || newCategory;
    const cleanUrl = cleanInputUrl(newUrl);
    if (!cleanUrl) return;
    
    // If confirmation is required and user hasn't explicitly confirmed or selected a pill
    if (detectionResult?.needsConfirmation && !userConfirmedCategory && !categoryOverride) {
      showToast(t('confirmCategoryBeforeStarting'));
      return;
    }
    
    const fullUrl = `https://${cleanUrl}`;
    
    const newTracker: Tracker = {
      id: uuidv4(),
      url: fullUrl,
      category: chosenCategory,
      mode: newMode,
      slowServerMode: newSlowServerMode,
      status: 'running',
      progress: 5,
      downloadSpeed: t('calculating'),
      imageCount: 0,
      images: [],
      mediaType: chosenCategory === 'video' ? 'video' : 'image',
      dateAdded: new Date().toISOString()
    };
    
    setTrackers(prev => [newTracker, ...prev]);
    setShowNewModal(false);
    setNewUrl('');
    setDetectionResult(null);
    setUserConfirmedCategory(false);
    showToast(`${chosenCategory === 'video' ? 'Video' : chosenCategory === 'image' ? (language === 'es' ? 'Imagen' : 'Image') : 'Manga'} ${t('addedCorrectly')}`);

    // Trigger execution
    executeTracker(newTracker.id, newTracker.url, newTracker.mode, chosenCategory);
  };

  const pauseTracker = (id: string) => {
    if (controlsRef.current[id]) {
      controlsRef.current[id].isPaused = true;
    }
    setTrackers(prev => prev.map(item => item.id === id ? { ...item, status: 'paused', downloadSpeed: '0 MB/s' } : item));
    showToast(t('trackingPaused'));
  };

  const resumeTracker = (id: string) => {
    const ctrl = controlsRef.current[id];
    if (ctrl) {
      ctrl.isPaused = false;
      if (ctrl.resumeResolver) {
        ctrl.resumeResolver();
        ctrl.resumeResolver = undefined;
      }
    } else {
      const tr = trackers.find(item => item.id === id);
      if (tr) {
        executeTracker(tr.id, tr.url, tr.mode, tr.category || 'manga');
        return;
      }
    }
    setTrackers(prev => prev.map(item => item.id === id ? { ...item, status: 'running' } : item));
    showToast(t('trackingResumed'));
  };

  const stopTracker = (id: string) => {
    if (controlsRef.current[id]) {
      controlsRef.current[id].isStopped = true;
      if (controlsRef.current[id].resumeResolver) {
        controlsRef.current[id].resumeResolver!();
      }
    }
    setTrackers(prev => prev.map(item => item.id === id ? { ...item, status: 'stopped', downloadSpeed: '0 MB/s' } : item));
    showToast(t('trackingStopped'));
  };

  const restartTracker = (id: string) => {
    const tr = trackers.find(item => item.id === id);
    if (!tr) return;
    stopTracker(id);
    setTrackers(prev => prev.map(item => item.id === id ? { 
      ...item, 
      status: 'running', 
      progress: 5, 
      imageCount: 0, 
      images: [], 
      completedChapters: 0 
    } : item));
    setTimeout(() => {
      executeTracker(id, tr.url, tr.mode, tr.category || 'manga');
    }, 150);
    showToast(t('trackingRestarted'));
  };

  const removeTracker = (id: string) => {
    stopTracker(id);
    delete controlsRef.current[id];
    setTrackers(current => current.filter(tItem => tItem.id !== id));
    showToast(t('taskDeleted'));
  };

  const getModeIcon = (mode: TrackingMode) => {
    switch (mode) {
      case 'single': return <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />;
      case 'sequential': return <List className="w-3.5 h-3.5 text-blue-400" />;
      case 'continuous': return <Zap className="w-3.5 h-3.5 text-amber-400" />;
    }
  };
  
  const getModeLabel = (mode: TrackingMode) => {
    switch (mode) {
      case 'single': return t('modeSingle');
      case 'sequential': return t('modeSequential');
      case 'continuous': return t('modeContinuous');
    }
  };

  const getStatusLabel = (status: Tracker['status']) => {
    switch (status) {
      case 'running': return t('running');
      case 'completed': return t('completed');
      case 'error': return t('error');
      case 'paused': return t('paused');
      case 'stopped': return t('stopped');
      default: return t('idle');
    }
  };

  return (
    <div className={cn(
      "min-h-screen p-4 sm:p-8 font-sans selection:bg-emerald-500/30 relative overflow-x-hidden transition-colors duration-300",
      isLight ? "text-neutral-900 selection:text-neutral-950" : "text-neutral-200 selection:text-white"
    )}>
      
      {/* StarOS Atmospheric Nature & Bokeh Ambient Background Layer */}
      <StarOSAtmosphereBackground />

      {/* Global In-App Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={starosBouncySpring}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full staros-glass-pill border border-emerald-400/50 text-emerald-300 text-xs font-semibold shadow-[0_0_30px_rgba(16,185,129,0.35)] backdrop-blur-2xl flex items-center gap-2"
          >
            <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        
        {/* StarOS Frosted Header: Morphs into Inline Settings when Creating a Task */}
        <header className="relative w-full pb-6 border-b border-white/10">
          <AnimatePresence mode="wait">
            {!showNewModal ? (
              <motion.div
                key="default-header"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={starosSpring}
                className="flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="w-full flex justify-center">
                  <TerminalTitle />
                </div>

                <p className="text-xs sm:text-sm text-neutral-300/80 max-w-xl mx-auto px-4 -mt-1 leading-relaxed">
                  {t('tagline')}
                </p>
                
                <div className="pt-2">
                  <motion.button 
                    id="new-task-button"
                    onClick={openNewTaskModal}
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.94 }}
                    transition={starosBouncySpring}
                    className="relative inline-flex items-center gap-2.5 px-7 py-3 rounded-full text-neutral-950 font-bold text-sm cursor-pointer shadow-[0_0_30px_rgba(16,185,129,0.5)] border border-emerald-400 bg-emerald-400 hover:bg-emerald-300 transition-all overflow-hidden select-none"
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/70" />
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>{t('newTask')}</span>
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="inline-settings-header"
                initial={{ opacity: 0, y: -15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.98 }}
                transition={starosSpring}
                className="w-full staros-glass rounded-3xl p-5 sm:p-7 border border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.7),inset_0_1px_2px_rgba(255,255,255,0.25)] space-y-6 text-left"
              >
                {/* 1. Header Bar with Title & Close/Cancel Button */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.35)] shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                          {t('newTask')}
                        </h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono staros-glass-pill text-emerald-300 border border-emerald-400/40">
                          {newCategory.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300/80">
                        {t('createTaskSubtitle')}
                      </p>
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    onClick={closeNewTaskSettings}
                    whileHover={{ scale: 1.08, rotate: 90 }}
                    whileTap={{ scale: 0.92 }}
                    transition={starosSpring}
                    className="p-2 rounded-full staros-glass-pill text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title={t('cancel')}
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>

                {/* 2. BARRA DE URL PRIMERAMENTE ARRIBA */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-200 tracking-wide flex items-center gap-2">
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{newCategory === 'video' ? t('videoUrlLabel') : newCategory === 'image' ? t('imageUrlLabel') : t('mangaUrl')}</span>
                    </label>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {newCategory === 'video' ? 'YouTube, Vimeo, MP4...' : newCategory === 'image' ? 'Reddit, Imgur, WebP...' : 'TMO, MangaDex, InManga...'}
                    </span>
                  </div>

                  <div className="relative flex items-center w-full rounded-2xl bg-white/[0.06] border border-white/15 focus-within:border-emerald-400/80 focus-within:shadow-[0_0_25px_rgba(16,185,129,0.3)] transition-all overflow-hidden group shadow-inner">
                    <div className="flex items-center pl-3.5 pr-2.5 py-3 text-emerald-400 font-mono text-sm font-semibold select-none shrink-0 bg-white/[0.04] border-r border-white/10">
                      <span className="opacity-70 text-neutral-400 mr-0.5">https://</span>
                    </div>

                    <input
                      ref={inputRef}
                      type="text"
                      value={newUrl}
                      onChange={handleUrlChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newUrl.trim()) {
                          handlePrepareDownload();
                        }
                      }}
                      placeholder={newCategory === 'video' ? 'threads.com/share/..., youtube.com/watch... o url de video' : newCategory === 'image' ? 'threads.com/share/..., reddit.com... o imagen' : 'tumangaonline.com/manga/... o lector'}
                      className="w-full bg-transparent px-3.5 py-3 text-sm text-white placeholder-neutral-500 font-mono focus:outline-none"
                    />

                    {/* Quick Paste or Clear Buttons */}
                    <div className="flex items-center pr-2 shrink-0 gap-1.5">
                      <AnimatePresence mode="wait">
                        {!newUrl ? (
                          <motion.button
                            key="paste-btn"
                            type="button"
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            transition={starosSpring}
                            onClick={handlePasteUrl}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-white border border-emerald-400/40 text-xs font-medium cursor-pointer transition-all shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                            title={t('paste')}
                          >
                            <Clipboard className="w-3.5 h-3.5" />
                            <span>{t('paste')}</span>
                          </motion.button>
                        ) : (
                          <motion.button
                            key="clear-btn"
                            type="button"
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            transition={starosSpring}
                            onClick={handleClearUrl}
                            className="p-1.5 rounded-full bg-white/10 hover:bg-red-500/25 text-neutral-300 hover:text-red-300 border border-white/10 hover:border-red-500/40 text-xs transition-all cursor-pointer shadow-sm"
                            title={t('clear')}
                          >
                            <X className="w-4 h-4" />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* BANNER DINÁMICO DE DETECCIÓN, CONFIRMACIÓN Y CORRECCIÓN MANUAL */}
                  <AnimatePresence mode="wait">
                    {isAnalyzingUrl && (
                      <motion.div
                        key="analyzing-banner"
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        className="mt-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300 shadow-sm"
                      >
                        <RotateCw className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
                        <span className="font-mono text-[11px] sm:text-xs">
                          {language === 'es' ? 'Analizando enlace y resolviendo plataforma...' : 'Analyzing link and resolving platform...'}
                        </span>
                      </motion.div>
                    )}

                    {!isAnalyzingUrl && detectionResult && !detectionResult.normalizedUrl && (
                      <motion.div
                        key="invalid-url-banner"
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        className="mt-2 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 shadow-sm flex items-start gap-2.5"
                      >
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="font-bold text-rose-300">
                            {language === 'es' ? 'Enlace inválido o no soportado' : 'Invalid or unsupported link'}
                          </div>
                          <div className="text-[11px] text-rose-200/90 font-mono">
                            {language === 'en' && detectionResult.reasonEn ? detectionResult.reasonEn : detectionResult.reason}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {!isAnalyzingUrl && detectionResult && detectionResult.normalizedUrl && detectionResult.confidence === 'high' && !detectionResult.needsConfirmation && (
                      <motion.div
                        key="high-confidence-banner"
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        className="mt-2 p-2.5 sm:p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs text-emerald-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-lg bg-emerald-500/25 border border-emerald-400/40 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white text-xs">
                                {language === 'en' && detectionResult.platformNameEn ? detectionResult.platformNameEn : detectionResult.platformName}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 uppercase">
                                {detectionResult.category === 'manga' ? (language === 'es' ? 'Manga / Cómic' : 'Manga / Comic') : detectionResult.category === 'video' ? 'Video' : (language === 'es' ? 'Imagen' : 'Image')}
                              </span>
                              <span className="text-[10px] text-emerald-400/80 font-mono">
                                • {language === 'es' ? 'Alta Certeza' : 'High Certainty'}
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-300 truncate">
                              {language === 'en'
                                ? (detectionResult.reasonEn ||
                                    (detectionResult.reason.includes('YouTube') && detectionResult.reason.includes('certeza')
                                      ? 'YouTube video detected with high certainty'
                                      : detectionResult.reason.includes('Shorts')
                                      ? 'YouTube Shorts detected with high certainty'
                                      : detectionResult.reason))
                                : detectionResult.reason}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                          <span className="text-[10px] text-neutral-400 font-mono hidden md:inline">
                            {language === 'es' ? '¿Quieres cambiarlo?' : 'Want to override?'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setUserConfirmedCategory(false);
                              showToast(language === 'es' ? 'Selecciona una categoría abajo' : 'Select a category below');
                            }}
                            className="text-[10px] font-medium text-emerald-300 hover:text-white underline cursor-pointer px-1 py-0.5"
                          >
                            {language === 'es' ? 'Cambiar' : 'Change'}
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* CASO AMBIGÜEDAD / CONFIRMACIÓN REQUERIDA (Instagram / TikTok / Threads / etc.) */}
                    {!isAnalyzingUrl && detectionResult && detectionResult.normalizedUrl && detectionResult.needsConfirmation && (
                      <motion.div
                        key="needs-confirmation-banner"
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        className="mt-2 p-3 rounded-2xl bg-amber-500/15 border-2 border-amber-400/60 shadow-[0_0_20px_rgba(251,191,36,0.15)] text-xs text-amber-100 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,1)]" />
                            </span>
                            <div className="font-bold text-amber-200 text-xs sm:text-sm">
                              {language === 'es' 
                                ? `Detectamos: ${detectionResult.platformName} • Categoría sugerida: ${detectionResult.suggestedCategory.toUpperCase()}` 
                                : `Detected: ${detectionResult.platformNameEn || detectionResult.platformName} • Suggested: ${detectionResult.suggestedCategory.toUpperCase()}`}
                            </div>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/40 shrink-0 font-bold">
                            {language === 'es' ? 'Confirmación Requerida' : 'Confirmation Required'}
                          </span>
                        </div>

                        <p className="text-[11px] text-amber-200/90 leading-relaxed">
                          {language === 'en'
                            ? (detectionResult.reasonEn ||
                                (detectionResult.reason.includes('YouTube') && detectionResult.reason.includes('certeza')
                                  ? 'YouTube video detected with high certainty'
                                  : detectionResult.reason.includes('Shorts')
                                  ? 'YouTube Shorts detected with high certainty'
                                  : detectionResult.reason))
                            : detectionResult.reason}
                        </p>

                        <div className="pt-1 border-t border-amber-400/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-amber-300">
                            {language === 'es' ? 'Elige el formato deseado para extraer:' : 'Choose desired format to extract:'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setNewCategory('video');
                                setUserConfirmedCategory(true);
                                showToast(t('videoConfirmed'));
                              }}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border",
                                newCategory === 'video' && userConfirmedCategory
                                  ? "bg-amber-400 text-neutral-950 border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                                  : "bg-white/10 hover:bg-amber-400/20 text-amber-200 border-amber-400/30"
                              )}
                            >
                              <VideoIcon className="w-3 h-3" />
                              <span>{language === 'es' ? 'Vídeo' : 'Video'}</span>
                              {newCategory === 'video' && userConfirmedCategory && <Check className="w-3 h-3 ml-0.5" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setNewCategory('image');
                                setUserConfirmedCategory(true);
                                showToast(t('imageConfirmed'));
                              }}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border",
                                newCategory === 'image' && userConfirmedCategory
                                  ? "bg-amber-400 text-neutral-950 border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                                  : "bg-white/10 hover:bg-amber-400/20 text-amber-200 border-amber-400/30"
                              )}
                            >
                              <ImageIcon className="w-3 h-3" />
                              <span>{language === 'es' ? 'Imagen' : 'Image'}</span>
                              {newCategory === 'image' && userConfirmedCategory && <Check className="w-3 h-3 ml-0.5" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setNewCategory('manga');
                                setUserConfirmedCategory(true);
                                showToast(t('mangaConfirmed'));
                              }}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border",
                                newCategory === 'manga' && userConfirmedCategory
                                  ? "bg-amber-400 text-neutral-950 border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                                  : "bg-white/10 hover:bg-amber-400/20 text-amber-200 border-amber-400/30"
                              )}
                            >
                              <BookOpen className="w-3 h-3" />
                              <span>Manga</span>
                              {newCategory === 'manga' && userConfirmedCategory && <Check className="w-3 h-3 ml-0.5" />}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* CASO PLATAFORMA DESCONOCIDA / GENÉRICA */}
                    {!isAnalyzingUrl && detectionResult && detectionResult.normalizedUrl && (detectionResult.platform === 'unknown' || !detectionResult.extractorAvailable) && (
                      <motion.div
                        key="unknown-platform-banner"
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        className="mt-2 p-3 rounded-2xl bg-white/5 border border-white/15 text-xs text-neutral-200 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <div className="font-bold text-white text-xs">
                            {language === 'es' ? 'Plataforma no reconocida automáticamente' : 'Unrecognized Platform'}
                          </div>
                        </div>
                        <p className="text-[11px] text-neutral-300 leading-relaxed">
                          {language === 'es'
                            ? 'No se identificó un extractor especializado para este dominio. Elige el tipo de contenido que deseas intentar extraer con el motor genérico:'
                            : 'No specialized extractor was matched. Select the content category you wish to extract via the generic engine:'}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setNewCategory('video');
                              setUserConfirmedCategory(true);
                              showToast(t('genericVideoMode'));
                            }}
                            className={cn(
                              "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              newCategory === 'video' && userConfirmedCategory
                                ? "bg-emerald-500/30 border-emerald-400 text-white"
                                : "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300"
                            )}
                          >
                            <VideoIcon className="w-3 h-3 text-red-400" />
                            <span>{t('webVideo')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCategory('image');
                              setUserConfirmedCategory(true);
                              showToast(t('genericImageMode'));
                            }}
                            className={cn(
                              "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              newCategory === 'image' && userConfirmedCategory
                                ? "bg-emerald-500/30 border-emerald-400 text-white"
                                : "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300"
                            )}
                          >
                            <ImageIcon className="w-3 h-3 text-blue-400" />
                            <span>{t('webImages')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCategory('manga');
                              setUserConfirmedCategory(true);
                              showToast(t('genericMangaMode'));
                            }}
                            className={cn(
                              "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              newCategory === 'manga' && userConfirmedCategory
                                ? "bg-emerald-500/30 border-emerald-400 text-white"
                                : "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300"
                            )}
                          >
                            <BookOpen className="w-3 h-3 text-emerald-400" />
                            <span>Lector Manga</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ERROR DE DESCUBRIMIENTO O ANÁLISIS DE METADATOS */}
                {discoveryError && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start justify-between gap-3 shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-rose-300">
                          {language === 'es' ? 'Error al analizar metadatos' : 'Metadata analysis error'}
                        </div>
                        <div className="text-[11px] text-rose-200/90 font-mono mt-0.5">{discoveryError}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePrepareDownload()}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-100 text-[11px] font-semibold border border-rose-500/40 transition-colors cursor-pointer shrink-0"
                    >
                      {language === 'es' ? 'Reintentar' : 'Retry'}
                    </button>
                  </div>
                )}

                {/* VISTA 1: ESCANEO Y ANÁLISIS EN CURSO (HEAD REQUEST, THUMBNAIL, SERVER CAPACITY) */}
                {isDiscovering && (
                  <div className="p-6 rounded-3xl staros-glass-card border border-emerald-400/40 text-center space-y-4 shadow-xl">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.35)]">
                      <RotateCw className="w-7 h-7 animate-spin text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-white tracking-tight">
                        {t('analyzingContent')}
                      </h3>
                      <p className="text-xs text-neutral-300 font-mono truncate max-w-md mx-auto">
                        {newUrl}
                      </p>
                    </div>
                    <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-lg mx-auto text-left">
                      <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                        <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
                        <span className="text-[10px] text-neutral-300">Cabeceras HEAD</span>
                      </div>
                      <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-[10px] text-neutral-300">{language === 'es' ? 'Portada Remota' : 'Remote Cover'}</span>
                      </div>
                      <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-[10px] text-neutral-300">{t('rangeAndSize')}</span>
                      </div>
                      <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="text-[10px] text-neutral-300">{t('serverGuardianShort')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* VISTA 2: CONTENIDO ENCONTRADO - VISTA PREVIA Y DECISIÓN DE DESCARGA */}
                {discoveredData && !isDiscovering && (() => {
                  const batchMetrics = getDiscoveredBatchMetrics();
                  return (
                    <div className="p-5 sm:p-6 rounded-3xl staros-glass-card border-2 border-emerald-400/50 shadow-2xl space-y-5">
                      {/* Header: Platform & Discovered Title */}
                      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 shrink-0">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 uppercase">
                                {discoveredData.platform}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-neutral-300 border border-white/15 uppercase">
                                {discoveredData.type}
                              </span>
                              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                {t('contentFound')}
                              </span>
                            </div>
                            <h3 className="text-base sm:text-lg font-bold text-white truncate mt-0.5" title={discoveredData.title}>
                              {discoveredData.title}
                            </h3>
                            {discoveredData.author && (
                              <div className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                                <span>{t('authorBy')}</span>
                                <span className="text-emerald-300 font-medium">{discoveredData.author}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setDiscoveredData(null)}
                          className="text-[11px] font-medium text-neutral-400 hover:text-white underline cursor-pointer shrink-0"
                        >
                          {t('analyzeAnotherLink')}
                        </button>
                      </div>

                      {/* Main preview body: Thumbnail + Specs */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                        {/* Thumbnail / Video Preview */}
                        <div className="sm:col-span-4 flex flex-col items-center gap-2">
                          <div className="w-full aspect-video sm:aspect-square rounded-2xl overflow-hidden bg-black/40 border border-white/15 relative shadow-inner flex items-center justify-center group">
                            {discoveredData.type === 'video' && discoveryVideoPreviewPlaying ? (
                              <div className="w-full h-full relative bg-black flex flex-col items-center justify-center">
                                {discoveredData.videoEmbedUrl || (discoveredData.previewUrl && (discoveredData.previewUrl.includes('embed') || discoveredData.previewUrl.includes('youtube.com'))) ? (
                                  <iframe
                                    src={`${(discoveredData.videoEmbedUrl || discoveredData.previewUrl || '').includes('?') ? (discoveredData.videoEmbedUrl || discoveredData.previewUrl) + '&autoplay=1&playsinline=1' : (discoveredData.videoEmbedUrl || discoveredData.previewUrl) + '?autoplay=1&playsinline=1'}`}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="w-full h-full border-0 rounded-2xl"
                                  />
                                ) : (
                                  <video
                                    controls
                                    autoPlay
                                    playsInline
                                    preload="metadata"
                                    poster={discoveredData.thumbnailUrl ? getProxiedImageUrl(discoveredData.thumbnailUrl) : undefined}
                                    src={getVideoPreviewStreamUrl(
                                      discoveredData.directResourceUrl || discoveredData.cleanUrl || discoveredData.originalUrl,
                                      discoveredData.previewUrl || discoveredData.videoPreview?.previewUrl
                                    )}
                                    className="w-full h-full object-contain bg-black"
                                    onError={(e) => {
                                      // Remove poster if image failed so broken image icon is never shown
                                      (e.target as HTMLVideoElement).removeAttribute('poster');
                                    }}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => setDiscoveryVideoPreviewPlaying(false)}
                                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-white/80 hover:text-white backdrop-blur-md border border-white/20 transition-all cursor-pointer z-10"
                                  title={t('closePlayer')}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                {discoveredData.thumbnailUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={getProxiedImageUrl(discoveredData.thumbnailUrl)}
                                    alt={discoveredData.title}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="flex flex-col items-center text-neutral-500 gap-2">
                                    <ImageIcon className="w-10 h-10 stroke-1" />
                                    <span className="text-[10px]">{t('noThumbnail')}</span>
                                  </div>
                                )}

                                {discoveredData.type === 'video' && (
                                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 transition-opacity group-hover:bg-black/30">
                                    {discoveredData.videoPreviewDiagnostics?.playable === false ? (
                                      <div className="px-3 py-1.5 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-[11px] font-semibold flex items-center gap-1.5 backdrop-blur-md">
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                        <span>{t('previewUnplayable')}</span>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setDiscoveryVideoPreviewPlaying(true)}
                                        className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
                                      >
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span>{t('playPreview')}</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Video Diagnostics Capsule & Action */}
                          {discoveredData.type === 'video' && (
                            <div className="w-full flex flex-col gap-1.5 mt-1">
                              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-[10px] font-mono">
                                <span className="text-neutral-400 flex items-center gap-1">
                                  <Activity className="w-3 h-3 text-emerald-400" />
                                  Modo:
                                </span>
                                <span className={cn(
                                  "font-bold uppercase",
                                  discoveredData.videoPreviewDiagnostics?.streamingMode === 'direct' ? "text-emerald-400" :
                                  discoveredData.videoPreviewDiagnostics?.streamingMode === 'proxy' ? "text-sky-400" :
                                  discoveredData.videoPreviewDiagnostics?.streamingMode === 'hls' || discoveredData.videoPreviewDiagnostics?.streamingMode === 'dash' ? "text-indigo-400" :
                                  "text-red-400"
                                )}>
                                  {discoveredData.videoPreviewDiagnostics?.streamingMode || (discoveredData.downloadCapabilities?.local ? 'direct' : 'proxy')}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setShowVideoDiagnosticsModal(prev => !prev)}
                                className="w-full flex items-center justify-center gap-1 py-1 rounded-lg bg-neutral-900/60 hover:bg-neutral-800 border border-white/10 text-[10px] text-neutral-300 hover:text-white transition-all cursor-pointer"
                              >
                                <Info className="w-3 h-3 text-amber-400" />
                                <span>{showVideoDiagnosticsModal ? t('hideDiagnostics') : t('showDiagnostics')}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Specs Grid */}
                        <div className="sm:col-span-8 grid grid-cols-2 gap-2.5">
                          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                            <div className="text-[10px] font-mono text-neutral-400 uppercase">{t('estimatedSizeLabel')}</div>
                            <div className="text-base font-bold text-emerald-400 font-mono">
                              {batchMetrics.totalSizeFormatted}
                            </div>
                          </div>

                          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                            <div className="text-[10px] font-mono text-neutral-400 uppercase">{t('formatLabel')}</div>
                            <div className="text-base font-bold text-white font-mono uppercase">
                              {discoveredData.format || (discoveredData.type === 'video' ? 'MP4' : discoveredData.type === 'image' ? 'JPG/WebP' : 'PDF/CBZ')}
                            </div>
                          </div>

                          {discoveredData.type === 'video' && (
                            <>
                              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                                <div className="text-[10px] font-mono text-neutral-400 uppercase">{t('durationLabel')}</div>
                                <div className="text-sm font-semibold text-white font-mono">
                                  {discoveredData.durationFormatted || 'Variable (Directo)'}
                                </div>
                              </div>
                              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                                <div className="text-[10px] font-mono text-neutral-400 uppercase">{t('resolutionLabel')}</div>
                                <div className="text-sm font-semibold text-white font-mono">
                                  {discoveredData.resolution || 'Directo (HD)'}
                                </div>
                              </div>
                            </>
                          )}

                          {discoveredData.type === 'manga' && (
                            <>
                              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                                <div className="text-[10px] font-mono text-neutral-400 uppercase">{t('chaptersFoundLabel')}</div>
                                <div className="text-sm font-semibold text-white font-mono">
                                  {discoveredData.totalItems || 1}
                                </div>
                              </div>
                              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                                <div className="text-[10px] font-mono text-neutral-400 uppercase">{t('pagesFoundLabel')}</div>
                                <div className="text-sm font-semibold text-white font-mono">
                                  ≈ {batchMetrics.totalPages}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Video Diagnostics Panel */}
                      {showVideoDiagnosticsModal && (discoveredData.videoPreviewDiagnostics || discoveredData.type === 'video') && (
                        <div className="p-4 rounded-2xl bg-neutral-900/90 border border-sky-500/30 space-y-3 shadow-2xl backdrop-blur-md">
                          <div className="flex items-center justify-between text-xs font-bold text-sky-300 border-b border-white/10 pb-2">
                            <span className="flex items-center gap-1.5 font-mono">
                              <Activity className="w-3.5 h-3.5 text-sky-400" />
                              {t('diagnosticsTitle')}
                            </span>
                            <span className={cn(
                              "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase",
                              discoveredData.videoPreviewDiagnostics?.playable !== false ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"
                            )}>
                              {discoveredData.videoPreviewDiagnostics?.playable !== false ? t('streamingReady') : t('streamingUnavailable')}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider">{t('streamingModeLabel')}</div>
                              <div className="text-white font-bold capitalize">
                                {discoveredData.videoPreviewDiagnostics?.streamingMode || (discoveredData.downloadCapabilities?.local ? 'direct' : 'proxy')}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider">{t('supportsRangeLabel')}</div>
                              <div className={cn("font-bold", discoveredData.videoPreviewDiagnostics?.supportsRange !== false ? "text-emerald-400" : "text-amber-400")}>
                                {discoveredData.videoPreviewDiagnostics?.supportsRange !== false ? t('rangeCompatible') : t('rangeNotDetected')}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider">{t('contentTypeLabel')}</div>
                              <div className="text-neutral-200 truncate">
                                {discoveredData.videoPreviewDiagnostics?.contentType || 'video/mp4'}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider">{t('estimatedSizeLabel')}</div>
                              <div className="text-emerald-400 font-bold">
                                {discoveredData.estimatedSizeFormatted || batchMetrics.totalSizeFormatted}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider">{t('originHeadersLabel')}</div>
                              <div className="text-neutral-200">
                                {discoveredData.videoPreviewDiagnostics?.requiresHeaders ? t('requiresHeaders') : t('publicStandard')}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider">{t('sessionAuthLabel')}</div>
                              <div className="text-neutral-200">
                                {discoveredData.videoPreviewDiagnostics?.requiresCookies ? t('requiresSession') : t('notRequired')}
                              </div>
                            </div>
                          </div>

                          {discoveredData.videoPreviewDiagnostics?.reason && (
                            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-[11px] text-neutral-300">
                              <span className="text-sky-400 font-semibold font-mono">Info: </span>
                              {discoveredData.videoPreviewDiagnostics.reason}
                            </div>
                          )}

                          <div className="text-[10px] text-emerald-400/90 font-mono text-center pt-1 border-t border-white/5">
                            ⚡ {t('streamingHttpRange')} • {t('streamingNoFullRam')}
                          </div>
                        </div>
                      )}

                      {/* Interactive Chapter Selection for Manga / Collections */}
                      {discoveredData.items && discoveredData.items.length > 1 && (
                        <div className="space-y-3 pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold text-white flex items-center gap-2">
                              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{t('detectedChaptersItems')}</span>
                              <span className="text-[11px] font-mono text-neutral-400">
                                ({batchMetrics.selectedCount} / {discoveredData.items.length})
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={selectAllDiscovered}
                                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                              >
                                {t('selectAll')}
                              </button>
                              <span className="text-neutral-600">•</span>
                              <button
                                type="button"
                                onClick={deselectAllDiscovered}
                                className="text-[11px] font-semibold text-neutral-400 hover:text-white cursor-pointer"
                              >
                                {t('deselectAll')}
                              </button>
                            </div>
                          </div>

                          {/* Scrollable list with checkboxes */}
                          <div className="max-h-48 overflow-y-auto space-y-1 rounded-2xl bg-black/20 border border-white/10 p-2 staros-scrollbar">
                            {discoveredData.items.map((it) => {
                              const isSel = !!discoveredSelectedChapters[it.id];
                              return (
                                <div
                                  key={it.id}
                                  onClick={() => toggleDiscoveredChapter(it.id)}
                                  className={cn(
                                    "flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer select-none transition-colors",
                                    isSel ? "bg-emerald-500/15 border border-emerald-500/30 text-white" : "hover:bg-white/5 border border-transparent text-neutral-400"
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={cn(
                                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                                      isSel ? "bg-emerald-500 border-emerald-400 text-neutral-950" : "border-white/30 bg-white/5"
                                    )}>
                                      {isSel && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                    <span className="truncate font-medium">{it.name}</span>
                                  </div>

                                  <div className="flex items-center gap-2 font-mono text-[10px] text-neutral-400 shrink-0 ml-2">
                                    {it.pageCount && <span>{it.pageCount} {t('pagesShort')}</span>}
                                    {it.estimatedSizeFormatted && <span>≈ {it.estimatedSizeFormatted}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Batch Calculation Pill */}
                          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between text-xs font-mono">
                            <span className="text-neutral-400">{t('batchCalculationTitle')}:</span>
                            <span className="text-emerald-300 font-semibold">
                              {batchMetrics.selectedCount} {t('chaptersShort')} · {batchMetrics.totalPages} {t('pagesShort')} · ≈ {batchMetrics.totalSizeFormatted}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Capacity Protection & Download Resolver Notice */}
                      {!batchMetrics.canLocal && !batchMetrics.canInternal ? (
                        <div className="p-4 rounded-2xl bg-rose-500/15 border-2 border-rose-500/40 text-rose-200 space-y-1.5">
                          <div className="flex items-center gap-2 font-bold text-sm text-rose-300">
                            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                            <span>{t('downloadNotAvailable')}</span>
                          </div>
                          <p className="text-xs text-rose-200/90 leading-relaxed">
                            {batchMetrics.reason || t('serverSlowResponse')}
                          </p>
                        </div>
                      ) : batchMetrics.requiresSession ? (
                        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-400/50 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-lg">
                          <div className="flex items-center gap-2.5">
                            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                            <div>
                              <div className="font-bold text-white text-sm">{t('resourceRequiresVerification')}</div>
                              <div className="text-[11px] text-amber-300/85 mt-0.5">
                                {t('providerRequestsCheck')} ({batchMetrics.provider || 'Provider'})
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const rawTargetUrl = discoveredData?.url || discoveredData?.cleanUrl || newUrl;
                              handleStartVerificationFlow(rawTargetUrl, batchMetrics.provider);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs shrink-0 flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>{t('verifyAccess')}</span>
                          </button>
                        </div>
                      ) : !batchMetrics.canLocal ? (
                        <div className="p-3.5 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 space-y-1">
                          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-cyan-300">
                            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                            <span>{t('localDownloadUnavailable')}</span>
                          </div>
                          <p className="text-[11px] text-cyan-200/85 leading-relaxed">
                            {batchMetrics.reason || t('sessionRequiredInternal')}
                          </p>
                        </div>
                      ) : batchMetrics.recommendLocal ? (
                        <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-400/50 shadow-lg text-amber-200 space-y-1.5">
                          <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
                            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                            <span>{t('recommendedLocalTitle')} ({batchMetrics.totalSizeFormatted})</span>
                          </div>
                          <p className="text-xs text-amber-200/90 leading-relaxed">
                            {t('recommendedLocalBanner')}
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>{t('serverSafeNotice')} ({batchMetrics.totalSizeFormatted !== 'Desconocido' ? batchMetrics.totalSizeFormatted : 'OK'})</span>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                            {t('safeCapacity')}
                          </span>
                        </div>
                      )}

                      {/* Decision Action Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
                        {/* 1. Local Download Button */}
                        <motion.button
                          id="btn-download-local"
                          type="button"
                          onClick={() => {
                            if (batchMetrics.requiresSession && !batchMetrics.canLocal) {
                              const rawTargetUrl = discoveredData?.url || discoveredData?.cleanUrl || newUrl;
                              handleStartVerificationFlow(rawTargetUrl, batchMetrics.provider);
                            } else {
                              handleExecuteLocalDownload();
                            }
                          }}
                          disabled={!batchMetrics.canLocal && !batchMetrics.requiresSession}
                          whileHover={batchMetrics.canLocal || batchMetrics.requiresSession ? { scale: 1.02 } : {}}
                          whileTap={batchMetrics.canLocal || batchMetrics.requiresSession ? { scale: 0.98 } : {}}
                          transition={starosSpring}
                          className={cn(
                            "p-3.5 rounded-2xl border flex flex-col text-left transition-all select-none",
                            !batchMetrics.canLocal && !batchMetrics.requiresSession
                              ? "bg-white/5 opacity-40 border-white/5 text-neutral-500 cursor-not-allowed"
                              : batchMetrics.requiresSession && !batchMetrics.canLocal
                              ? "bg-amber-500/20 border-amber-400/60 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)] ring-1 ring-amber-400/50 cursor-pointer"
                              : batchMetrics.recommendLocal
                              ? "bg-purple-500/30 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] ring-1 ring-purple-400 cursor-pointer"
                              : "bg-white/5 hover:bg-white/10 border-white/15 text-neutral-200 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                            <HardDrive className={cn("w-4 h-4 shrink-0", batchMetrics.canLocal ? "text-purple-400" : batchMetrics.requiresSession ? "text-amber-400" : "text-neutral-500")} />
                            <span>{t('downloadLocally')}</span>
                            {batchMetrics.requiresSession && !batchMetrics.canLocal ? (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                {t('requiresSession')}
                              </span>
                            ) : !batchMetrics.canLocal ? (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                {t('streamingUnavailable')}
                              </span>
                            ) : batchMetrics.recommendLocal && (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-purple-400/30 text-purple-200 border border-purple-400/50 uppercase font-bold">
                                {t('recommendedBadge')}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-1 leading-tight">
                            {batchMetrics.requiresSession && !batchMetrics.canLocal
                              ? t('requiresManualVerification')
                              : !batchMetrics.canLocal
                              ? t('sessionRequiredInternal')
                              : t('downloadLocallySub')}
                          </div>
                        </motion.button>

                        {/* 2. Internal Download Button (Unrestricted - No 280MB limit) */}
                        <motion.button
                          id="btn-download-internal"
                          type="button"
                          onClick={handleExecuteInternalDownload}
                          disabled={!batchMetrics.canInternal}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={starosSpring}
                          className={cn(
                            "p-3.5 rounded-2xl border flex flex-col text-left transition-all select-none",
                            !batchMetrics.canInternal
                              ? "bg-white/5 opacity-40 border-white/5 text-neutral-500 cursor-not-allowed"
                              : (!batchMetrics.canLocal || !batchMetrics.recommendLocal)
                              ? "bg-emerald-500/25 border-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.35)] ring-1 ring-emerald-400 cursor-pointer"
                              : "bg-white/5 opacity-80 border-white/10 text-neutral-300 hover:opacity-100 hover:bg-white/10 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                            <Server className={cn("w-4 h-4 shrink-0", batchMetrics.canInternal ? "text-emerald-400" : "text-neutral-500")} />
                            <span>{t('downloadInternally')}</span>
                            {!batchMetrics.canLocal ? (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-400/30 text-emerald-200 border border-emerald-400/50 uppercase font-bold">
                                {t('recommendedBadge')}
                              </span>
                            ) : batchMetrics.recommendLocal ? (
                              <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {t('highDemand')}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-1 leading-tight">
                            {t('downloadInternallySub')}
                          </div>
                        </motion.button>
                      </div>
                    </div>
                  );
                })()}

                {/* OPCIONES INICIALES DE BÚSQUEDA Y CATEGORÍAS (Visibles antes del descubrimiento) */}
                {!discoveredData && !isDiscovering && (
                  <>

                {/* 3. CATEGORÍAS EN FILA: PÍLDORAS HORIZONTALES DELGADAS */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-200 tracking-wide flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('searchCategory')}</span>
                    </label>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {newCategory === 'manga' ? t('categoryMangaPill') : newCategory === 'video' ? t('categoryVideoPill') : t('categoryImagePill')}
                    </span>
                  </div>

                  {/* Fila de píldoras horizontales delgadas para las categorías */}
                  <div className="flex items-center gap-2">
                    {/* Manga Pill */}
                    <motion.button
                      id="category-manga-pill"
                      type="button"
                      onClick={() => {
                        setNewCategory('manga');
                        showToast(`${t('searchCategory')}: ${t('categoryManga')}`);
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      transition={starosSpring}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer select-none border",
                        newCategory === 'manga'
                          ? (isLight 
                              ? "bg-emerald-500/20 border-emerald-600 text-emerald-900 shadow-sm ring-1 ring-emerald-500/30" 
                              : "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]")
                          : (isLight 
                              ? "bg-black/[0.04] border-black/10 text-neutral-600 hover:text-neutral-900 hover:border-black/20" 
                              : "staros-glass-pill border-white/10 text-neutral-400 hover:text-white hover:border-white/20")
                      )}
                    >
                      <BookOpen className={cn("w-3.5 h-3.5 shrink-0", newCategory === 'manga' ? (isLight ? "text-emerald-700" : "text-emerald-400") : "text-neutral-400")} />
                      <span className="truncate">Manga</span>
                      <span className={cn(
                        "text-[10px] font-mono px-1.5 py-0.2 rounded-full border shrink-0 hidden sm:inline",
                        newCategory === 'manga'
                          ? (isLight ? "bg-emerald-500/30 border-emerald-600/40 text-emerald-950" : "bg-emerald-500/30 border-emerald-400/40 text-emerald-200")
                          : (isLight ? "bg-black/5 border-black/10 text-neutral-500" : "bg-white/5 border-white/10 text-neutral-500")
                      )}>
                        PDF
                      </span>
                    </motion.button>

                    {/* Video Pill */}
                    <motion.button
                      id="category-video-pill"
                      type="button"
                      onClick={() => {
                        setNewCategory('video');
                        showToast(`${t('searchCategory')}: ${t('categoryVideo')}`);
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      transition={starosSpring}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer select-none border",
                        newCategory === 'video'
                          ? (isLight 
                              ? "bg-red-500/20 border-red-600 text-red-900 shadow-sm ring-1 ring-red-500/30" 
                              : "bg-red-500/20 border-red-400 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.3)]")
                          : (isLight 
                              ? "bg-black/[0.04] border-black/10 text-neutral-600 hover:text-neutral-900 hover:border-black/20" 
                              : "staros-glass-pill border-white/10 text-neutral-400 hover:text-white hover:border-white/20")
                      )}
                    >
                      <VideoIcon className={cn("w-3.5 h-3.5 shrink-0", newCategory === 'video' ? (isLight ? "text-red-700" : "text-red-400") : "text-neutral-400")} />
                      <span className="truncate">Video</span>
                      <span className={cn(
                        "text-[10px] font-mono px-1.5 py-0.2 rounded-full border shrink-0 hidden sm:inline",
                        newCategory === 'video'
                          ? (isLight ? "bg-red-500/30 border-red-600/40 text-red-950" : "bg-red-500/30 border-red-400/40 text-red-200")
                          : (isLight ? "bg-black/5 border-black/10 text-neutral-500" : "bg-white/5 border-white/10 text-neutral-500")
                      )}>
                        MP4
                      </span>
                    </motion.button>

                    {/* Imagen Pill */}
                    <motion.button
                      id="category-image-pill"
                      type="button"
                      onClick={() => {
                        setNewCategory('image');
                        showToast(`${t('searchCategory')}: ${t('categoryImage')}`);
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      transition={starosSpring}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer select-none border",
                        newCategory === 'image'
                          ? (isLight 
                              ? "bg-blue-500/20 border-blue-600 text-blue-900 shadow-sm ring-1 ring-blue-500/30" 
                              : "bg-blue-500/20 border-blue-400 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.3)]")
                          : (isLight 
                              ? "bg-black/[0.04] border-black/10 text-neutral-600 hover:text-neutral-900 hover:border-black/20" 
                              : "staros-glass-pill border-white/10 text-neutral-400 hover:text-white hover:border-white/20")
                      )}
                    >
                      <ImageIcon className={cn("w-3.5 h-3.5 shrink-0", newCategory === 'image' ? (isLight ? "text-blue-700" : "text-blue-400") : "text-neutral-400")} />
                      <span className="truncate">Imagen</span>
                      <span className={cn(
                        "text-[10px] font-mono px-1.5 py-0.2 rounded-full border shrink-0 hidden sm:inline",
                        newCategory === 'image'
                          ? (isLight ? "bg-blue-500/30 border-blue-600/40 text-blue-950" : "bg-blue-500/30 border-blue-400/40 text-blue-200")
                          : (isLight ? "bg-black/5 border-black/10 text-neutral-500" : "bg-white/5 border-white/10 text-neutral-500")
                      )}>
                        ZIP
                      </span>
                    </motion.button>
                  </div>

                  {/* Detalle contextual compacto de la categoría */}
                  {newCategory === 'manga' && (
                    <div className="p-3 rounded-2xl staros-glass-card border border-emerald-500/25 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-white flex items-center gap-2">
                            <span>{t('smartWaitMode')}</span>
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {t('antiCrash')}
                            </span>
                          </div>
                          <div className="text-[11px] text-neutral-400 leading-tight">
                            {t('smartWaitModeDesc')}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setNewSlowServerMode(prev => !prev)}
                        className={cn(
                          "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          newSlowServerMode ? "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-white/20"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out",
                            newSlowServerMode ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>
                  )}

                  {newCategory === 'video' && (
                    <div className="p-2.5 rounded-2xl staros-glass-card border border-red-500/25 flex items-center gap-2.5 text-xs text-neutral-300">
                      <div className="p-1.5 rounded-lg bg-red-500/20 text-red-400 shrink-0">
                        <VideoIcon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-white text-xs">Video & Audio MP4/MP3</div>
                        <div className="text-[11px] text-neutral-400 leading-tight">{t('videoPillSubtitle')}</div>
                      </div>
                    </div>
                  )}

                  {newCategory === 'image' && (
                    <div className="p-2.5 rounded-2xl staros-glass-card border border-blue-500/25 flex items-center gap-2.5 text-xs text-neutral-300">
                      <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                        <ImageIcon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-white text-xs">{t('galleriesAndImagesWebpZip')}</div>
                        <div className="text-[11px] text-neutral-400 leading-tight">{t('galleriesAndImagesSubtitle')}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. MODO DE RASTREO EN DISPOSICIÓN VERTICAL: ÚNICA, SECUENCIAL Y CONTINUA */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-200 tracking-wide flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('trackingMode')}</span>
                    </label>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {newMode === 'single' ? t('trackOnlyOneSpecified') : newMode === 'sequential' ? t('trackAllOneAfterAnother') : t('trackAllSimultaneously')}
                    </span>
                  </div>

                  {/* Lista vertical de cápsulas delgadas */}
                  <div className="flex flex-col gap-1.5">
                    {/* 1. Modo Única */}
                    <motion.button 
                      id="mode-single-pill"
                      type="button"
                      onClick={() => setNewMode('single')}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      transition={starosSpring}
                      className={cn(
                        "w-full flex items-center justify-between py-2 px-3.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none border",
                        newMode === 'single' 
                          ? (isLight
                              ? "bg-emerald-500/20 border-emerald-600 text-emerald-950 shadow-sm ring-1 ring-emerald-500/30"
                              : "bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]")
                          : (isLight
                              ? "bg-black/[0.04] border-black/10 text-neutral-700 hover:text-neutral-950 hover:border-black/20"
                              : "staros-glass-pill border-white/10 text-neutral-400 hover:text-white hover:border-white/20")
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ArrowDownToLine className={cn("w-3.5 h-3.5 shrink-0", newMode === 'single' ? (isLight ? "text-emerald-700" : "text-emerald-400") : "text-neutral-400")} />
                        <span className="truncate">{t('modeSingle')}</span>
                        <span className={cn(
                          "text-[10px] font-normal opacity-75 hidden sm:inline truncate",
                          newMode === 'single' ? (isLight ? "text-emerald-900" : "text-emerald-300") : "text-neutral-500"
                        )}>
                          • {t('trackOnlyOneSpecified')}
                        </span>
                      </div>
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0 ml-2",
                        newMode === 'single' 
                          ? (isLight ? "bg-emerald-600 ring-2 ring-emerald-500/30" : "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]") 
                          : (isLight ? "bg-neutral-300" : "bg-white/20")
                      )} />
                    </motion.button>

                    {/* 2. Modo Secuencial */}
                    <motion.button 
                      id="mode-sequential-pill"
                      type="button"
                      onClick={() => setNewMode('sequential')}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      transition={starosSpring}
                      className={cn(
                        "w-full flex items-center justify-between py-2 px-3.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none border",
                        newMode === 'sequential' 
                          ? (isLight
                              ? "bg-blue-500/20 border-blue-600 text-blue-950 shadow-sm ring-1 ring-blue-500/30"
                              : "bg-blue-500/20 border-blue-400 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.3)]")
                          : (isLight
                              ? "bg-black/[0.04] border-black/10 text-neutral-700 hover:text-neutral-950 hover:border-black/20"
                              : "staros-glass-pill border-white/10 text-neutral-400 hover:text-white hover:border-white/20")
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <List className={cn("w-3.5 h-3.5 shrink-0", newMode === 'sequential' ? (isLight ? "text-blue-700" : "text-blue-400") : "text-neutral-400")} />
                        <span className="truncate">{t('modeSequential')}</span>
                        <span className={cn(
                          "text-[10px] font-normal opacity-75 hidden sm:inline truncate",
                          newMode === 'sequential' ? (isLight ? "text-blue-900" : "text-blue-300") : "text-neutral-500"
                        )}>
                          • {t('trackAllOneAfterAnother')}
                        </span>
                      </div>
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0 ml-2",
                        newMode === 'sequential' 
                          ? (isLight ? "bg-blue-600 ring-2 ring-blue-500/30" : "bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.9)]") 
                          : (isLight ? "bg-neutral-300" : "bg-white/20")
                      )} />
                    </motion.button>

                    {/* 3. Modo Continua */}
                    <motion.button 
                      id="mode-continuous-pill"
                      type="button"
                      onClick={() => setNewMode('continuous')}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      transition={starosSpring}
                      className={cn(
                        "w-full flex items-center justify-between py-2 px-3.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none border",
                        newMode === 'continuous' 
                          ? (isLight
                              ? "bg-amber-500/20 border-amber-600 text-amber-950 shadow-sm ring-1 ring-amber-500/30"
                              : "bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]")
                          : (isLight
                              ? "bg-black/[0.04] border-black/10 text-neutral-700 hover:text-neutral-950 hover:border-black/20"
                              : "staros-glass-pill border-white/10 text-neutral-400 hover:text-white hover:border-white/20")
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Zap className={cn("w-3.5 h-3.5 shrink-0", newMode === 'continuous' ? (isLight ? "text-amber-700" : "text-amber-400") : "text-neutral-400")} />
                        <span className="truncate">{t('modeContinuous')}</span>
                        <span className={cn(
                          "text-[10px] font-normal opacity-75 hidden sm:inline truncate",
                          newMode === 'continuous' ? (isLight ? "text-amber-900" : "text-amber-300") : "text-neutral-500"
                        )}>
                          • {t('trackAllSimultaneously')}
                        </span>
                      </div>
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0 ml-2",
                        newMode === 'continuous' 
                          ? (isLight ? "bg-amber-600 ring-2 ring-amber-500/30" : "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]") 
                          : (isLight ? "bg-neutral-300" : "bg-white/20")
                      )} />
                    </motion.button>
                  </div>
                </div>

                    {/* 5. Bottom Action Controls */}
                    <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => addTracker()}
                        disabled={!newUrl.trim()}
                        className="text-xs text-neutral-400 hover:text-white underline cursor-pointer px-2 py-1 transition-colors"
                        title={t('addDirectlyWithoutAnalysis')}
                      >
                        {t('addDirectWithoutPreanalysis')}
                      </button>

                      <div className="flex items-center gap-3">
                        <motion.button 
                          type="button"
                          onClick={closeNewTaskSettings}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.95 }}
                          transition={starosSpring}
                          className="px-5 py-2.5 rounded-full staros-glass-pill text-neutral-300 hover:text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer select-none"
                        >
                          {t('cancel')}
                        </motion.button>
                        <motion.button 
                          id="submit-prepare-download-btn"
                          type="button"
                          onClick={() => handlePrepareDownload()}
                          disabled={!newUrl.trim()}
                          whileHover={!newUrl.trim() ? {} : { scale: 1.04 }}
                          whileTap={!newUrl.trim() ? {} : { scale: 0.96 }}
                          transition={starosSpring}
                          className={cn(
                            "px-6 py-2.5 rounded-full font-bold text-xs sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 select-none border transition-all",
                            detectionResult?.needsConfirmation && !userConfirmedCategory
                              ? "bg-amber-400 hover:bg-amber-300 text-neutral-950 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.5)]"
                              : "bg-emerald-400 hover:bg-emerald-300 text-neutral-950 border-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.5)]"
                          )}
                        >
                          {detectionResult?.needsConfirmation && !userConfirmedCategory ? (
                            <>
                              <AlertTriangle className="w-4 h-4 text-neutral-950" />
                              <span>{language === 'es' ? 'Confirma Categoría' : 'Confirm Category'}</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 text-neutral-950" />
                              <span>{t('prepareDownload')}</span>
                            </>
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Tracker List */}
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {trackers.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={starosSpring}
                className="staros-glass-card rounded-3xl p-10 sm:p-14 text-center border-white/[0.18] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.25),0_20px_50px_rgba(0,0,0,0.5)]"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-white tracking-tight mb-2">
                  {t('noActiveTasks')}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-300/80 max-w-md mx-auto leading-relaxed">
                  {t('emptyState')}
                </p>
              </motion.div>
            ) : (
              trackers.map((tracker) => (
                <motion.div
                  key={tracker.id}
                  id={`tracker-${tracker.id}`}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, height: 0 }}
                  transition={starosSpring}
                  className="staros-glass-card rounded-3xl flex flex-col relative overflow-hidden group shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.25),0_20px_50px_rgba(0,0,0,0.45)] border border-white/[0.18]"
                >
                  <div className="p-4 sm:p-6 flex flex-col gap-6 relative z-10">
                    {/* Dynamic progress bar underneath */}
                    <div 
                      className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-500 ease-out z-0 pointer-events-none opacity-20",
                        tracker.status === 'completed' ? "bg-emerald-500" :
                        tracker.status === 'error' ? "bg-red-500" :
                        tracker.status === 'paused' ? "bg-amber-500" :
                        "bg-emerald-400"
                      )}
                      style={{ width: `${tracker.progress}%` }}
                    />
                    
                    <div className="relative z-10 flex-1 flex flex-col justify-between">
                      {/* Top Bar: Mode, Title, URL and Status Badge */}
                      <div className="flex items-start justify-between gap-4">
                        {/* Tracker Remote Thumbnail if available */}
                        {tracker.thumbnailUrl && (
                          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden shrink-0 border border-white/20 shadow-md bg-black/40">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={getProxiedImageUrl(tracker.thumbnailUrl)} 
                              alt={tracker.title || 'Preview'} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap text-xs font-semibold tracking-wider uppercase text-neutral-400">
                            {/* Dynamic Category Badge */}
                            {tracker.category === 'video' || tracker.mediaType === 'video' ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider uppercase border inline-flex items-center gap-1 bg-red-500/15 text-red-300 border-red-500/30">
                                <VideoIcon className="w-3 h-3 text-red-400" />
                                <span>{t('categoryVideo')}</span>
                              </span>
                            ) : tracker.category === 'image' ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider uppercase border inline-flex items-center gap-1 bg-blue-500/15 text-blue-300 border-blue-500/30">
                                <ImageIcon className="w-3 h-3 text-blue-400" />
                                <span>{t('categoryImage')}</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider uppercase border inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                <BookOpen className="w-3 h-3 text-emerald-400" />
                                <span>{t('categoryManga')}</span>
                              </span>
                            )}

                            <span className="flex items-center gap-1.5">
                              {getModeIcon(tracker.mode)}
                              <span>{getModeLabel(tracker.mode)}</span>
                            </span>

                            {/* Download Mode Badge (Local / Interno) */}
                            {tracker.downloadMode && (
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider border inline-flex items-center gap-1",
                                tracker.downloadMode === 'local' 
                                  ? "bg-purple-500/20 text-purple-300 border-purple-400/40"
                                  : "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
                              )}>
                                {tracker.downloadMode === 'local' ? (
                                  <>
                                    <HardDrive className="w-3 h-3 text-purple-400" />
                                    <span>Local</span>
                                  </>
                                ) : (
                                  <>
                                    <Server className="w-3 h-3 text-emerald-400" />
                                    <span>Interno</span>
                                  </>
                                )}
                              </span>
                            )}

                            {/* Estimated Size Badge if known */}
                            {tracker.estimatedSizeFormatted && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/10 text-neutral-300 border border-white/10">
                                ≈ {tracker.estimatedSizeFormatted}
                              </span>
                            )}

                            {tracker.totalChapters && tracker.totalChapters > 1 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-neutral-300 font-mono text-[10px]">
                                {tracker.category === 'video' ? (
                                  <VideoIcon className="w-3 h-3 text-red-400" />
                                ) : tracker.category === 'image' ? (
                                  <ImageIcon className="w-3 h-3 text-blue-400" />
                                ) : (
                                  <BookOpen className="w-3 h-3 text-emerald-400" />
                                )}
                                {tracker.completedChapters || 0} / {tracker.totalChapters}
                              </span>
                            )}
                          </div>
                          
                          {tracker.title && (
                            <div className="text-sm font-semibold text-emerald-400 truncate">
                              {tracker.title}
                            </div>
                          )}

                          {/* Safe Copyable Author without external app redirection */}
                          {tracker.author && (
                            <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                              <span className="text-neutral-500">{t('authorBy')}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(tracker.author || '', t('authorCopyToast'))}
                                className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 transition-colors cursor-pointer"
                                title={t('copyAuthor')}
                              >
                                <span>{tracker.author}</span>
                                <Copy className="w-2.5 h-2.5 opacity-70" />
                              </button>
                            </div>
                          )}

                          {/* URL with clean copy action without opening external app */}
                          <div className="flex items-center gap-2 max-w-full">
                            <h3 
                              className="text-sm sm:text-base font-medium text-white/90 truncate font-mono select-all" 
                              title={tracker.url}
                            >
                              {tracker.url}
                            </h3>
                            <button
                              type="button"
                              onClick={() => handleCopyText(tracker.url, t('linkCopyToast'))}
                              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                              title={t('copyDirectLink')}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>

                          {tracker.currentChapter && (
                            <div className="text-xs text-neutral-400 font-mono">
                              {tracker.currentChapter}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold tracking-wide border backdrop-blur-md",
                            tracker.status === 'running' ? "bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse" :
                            tracker.status === 'completed' ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]" :
                            tracker.status === 'error' ? "bg-red-500/20 text-red-300 border-red-500/30" :
                            tracker.status === 'paused' ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                            "bg-white/10 text-neutral-300 border-white/10"
                          )}>
                            {getStatusLabel(tracker.status)}
                          </span>
                        </div>
                      </div>

                      {/* Stats & Interactive Controls Grid */}
                      <div className="mt-6 flex flex-wrap items-end gap-6 justify-between border-t border-white/5 pt-4">
                        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">{t('progress')}</div>
                            <div className="text-xl sm:text-2xl font-light text-white font-mono">{Math.round(tracker.progress)}%</div>
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                              {t('imagesFound')}
                            </div>
                            <div className="text-xl sm:text-2xl font-light text-white font-mono">{getTrackerImageCount(tracker)}</div>
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">{t('speed')}</div>
                            <div className="text-xl sm:text-2xl font-light text-white font-mono">{tracker.downloadSpeed}</div>
                          </div>
                          <div className="space-y-0.5 hidden sm:block">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">{t('date')}</div>
                            <div className="text-xs font-mono text-neutral-400 mt-1">
                              {new Date(tracker.dateAdded).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
                            </div>
                          </div>
                        </div>

                        {/* Category-Specific Exporters & View Controls */}
                        {(() => {
                          const isVideo = tracker.category === 'video' || tracker.mediaType === 'video' || tracker.mediaType === 'image_with_audio' || (tracker.chapters && tracker.chapters.some(c => c.mediaType === 'image_with_audio' || c.mediaType === 'video')) || !!tracker.videoUrl;
                          const isImage = (tracker.category === 'image' || tracker.mediaType === 'image') && !isVideo;
                          const isManga = !isVideo && !isImage && (!tracker.category || tracker.category === 'manga');
                          const trackerImgs = getTrackerImages(tracker);
                          const totalImgsCount = getTrackerImageCount(tracker);
                          const hasImages = trackerImgs.length > 0 || totalImgsCount > 0;
                          const failedChaptersCount = (tracker.chapters || []).filter(c => c.status === 'error' || ((!c.images || c.images.length === 0) && c.status !== 'downloading' && c.status !== 'pending' && tracker.status === 'completed')).length;

                          return (
                            <div className="flex flex-wrap items-center gap-3 ml-auto">
                              {/* RECOVERY BUTTON FOR FAILED CHAPTERS */}
                              {isManga && failedChaptersCount > 0 && (
                                <motion.button
                                  type="button"
                                  onClick={() => handleRetryFailedChapters(tracker)}
                                  disabled={isBatchDownloading[tracker.id]}
                                  whileHover={{ scale: 1.04 }}
                                  whileTap={{ scale: 0.94 }}
                                  transition={starosSpring}
                                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 shadow-[0_0_15px_rgba(245,158,11,0.25)] transition-all cursor-pointer animate-pulse"
                                  title={t('waitModeTitle')}
                                >
                                  <RotateCw className="w-3.5 h-3.5" />
                                  <span>{t('retryBrokenWaitModePrefix')} {failedChaptersCount} {t('brokenSuffix')} ({t('waitModeLabel')})</span>
                                </motion.button>
                              )}

                              {/* SLOW SERVER MODE TOGGLE BUTTON */}
                              {isManga && (
                                <motion.button
                                  type="button"
                                  onClick={() => toggleSlowServerMode(tracker.id)}
                                  whileHover={{ scale: 1.04 }}
                                  whileTap={{ scale: 0.94 }}
                                  transition={starosSpring}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer staros-glass-pill",
                                    tracker.slowServerMode ?? true
                                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                                      : "bg-white/5 text-neutral-400 border-white/10 hover:text-white"
                                  )}
                                  title={t('waitModeTitle')}
                                >
                                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="hidden sm:inline">{t('waitModeLabel')}:</span>
                                  <span className={cn("font-bold font-mono text-[11px]", (tracker.slowServerMode ?? true) ? "text-emerald-400" : "text-neutral-400")}>
                                    {(tracker.slowServerMode ?? true) ? (language === 'es' ? 'ACTIVO' : 'ACTIVE') : 'OFF'}
                                  </span>
                                </motion.button>
                              )}

                              {/* 1. MANGA EXPORTERS: CÁPSULA ÚNICA LARGA Y DELGADA CON ICONO DE DESPLEGAR Y MINIMIZAR INTEGRADO */}
                              {isManga && (hasImages || tracker.status === 'completed') && (
                                <div className={cn(
                                  "w-full sm:w-auto inline-flex items-center justify-between gap-2 py-1 px-3.5 rounded-full text-xs font-semibold transition-all select-none border min-h-[34px]",
                                  expandedMangaExport[tracker.id]
                                    ? (isLight
                                        ? "bg-emerald-500/20 border-emerald-600/40 text-emerald-950 shadow-inner"
                                        : "bg-emerald-500/20 border-emerald-400/50 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]")
                                    : (isLight
                                        ? "bg-emerald-500/10 border-emerald-600/25 text-emerald-900 hover:bg-emerald-500/15 shadow-sm"
                                        : "staros-glass-pill border-emerald-500/30 text-emerald-300 hover:border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]")
                                )}>
                                  {/* Left: Indicator & Quick Info */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span className="text-[11px] font-bold tracking-wide">
                                      {generatingPdf?.id === tracker.id
                                        ? (generatingPdf.engine === 'pdflib' ? 'Compilando pdf-lib...' : 'Compilando img2pdf...')
                                        : generatingExport?.id === tracker.id
                                        ? 'Generando Archivo...'
                                        : 'Exportar Manga'}
                                    </span>
                                  </div>

                                  {/* Middle: Expanded Export Options (pdf-lib, img2pdf, ZIP, CBZ) */}
                                  {expandedMangaExport[tracker.id] && (
                                    <div className="flex items-center gap-1.5 pl-2 border-l border-emerald-500/30">
                                      {/* Modo 1: pdf-lib */}
                                      <motion.button
                                        id={`export-pdflib-${tracker.id}`}
                                        onClick={() => handleExportPdf(tracker, 'pdflib')}
                                        disabled={generatingPdf?.id === tracker.id}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.94 }}
                                        transition={starosSpring}
                                        className={cn(
                                          "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer select-none",
                                          generatingPdf?.id === tracker.id && generatingPdf.engine === 'pdflib'
                                            ? "bg-emerald-400 text-neutral-950 font-bold shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse"
                                            : "text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                        )}
                                        title={t('pdfLibDescription')}
                                      >
                                        <span>pdf-lib</span>
                                      </motion.button>

                                      <div className="w-px h-3 bg-white/15" />

                                      {/* Modo 2: img2pdf */}
                                      <motion.button
                                        id={`export-img2pdf-${tracker.id}`}
                                        onClick={() => handleExportPdf(tracker, 'img2pdf')}
                                        disabled={generatingPdf?.id === tracker.id}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.94 }}
                                        transition={starosSpring}
                                        className={cn(
                                          "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer select-none",
                                          generatingPdf?.id === tracker.id && generatingPdf.engine === 'img2pdf'
                                            ? "bg-emerald-400 text-neutral-950 font-bold shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse"
                                            : "text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                        )}
                                        title={t('img2PdfDescription')}
                                      >
                                        <span>img2pdf</span>
                                      </motion.button>

                                      <div className="w-px h-3 bg-white/15" />

                                      {/* ZIP */}
                                      <motion.button
                                        id={`export-zip-${tracker.id}`}
                                        onClick={() => handleExportImagePackage(tracker, 'original', 'zip')}
                                        disabled={generatingExport?.id === tracker.id}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.94 }}
                                        transition={starosSpring}
                                        className={cn(
                                          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer select-none",
                                          generatingExport?.id === tracker.id && generatingExport.type === 'zip_original'
                                            ? "bg-emerald-400 text-neutral-950 font-bold shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse"
                                            : "text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                        )}
                                        title={t('exportImageZip')}
                                      >
                                        <span>ZIP</span>
                                      </motion.button>

                                      <div className="w-px h-3 bg-white/15" />

                                      {/* CBZ */}
                                      <motion.button
                                        id={`export-cbz-${tracker.id}`}
                                        onClick={() => handleExportImagePackage(tracker, 'original', 'cbz')}
                                        disabled={generatingExport?.id === tracker.id}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.94 }}
                                        transition={starosSpring}
                                        className={cn(
                                          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer select-none",
                                          generatingExport?.id === tracker.id && generatingExport.type === 'cbz_original'
                                            ? "bg-emerald-400 text-neutral-950 font-bold shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse"
                                            : "text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                        )}
                                        title={t('exportImageCbz')}
                                      >
                                        <span>CBZ</span>
                                      </motion.button>
                                    </div>
                                  )}

                                  {/* Right: Desplegar y Minimizar Icon Button */}
                                  <button
                                    type="button"
                                    onClick={() => toggleMangaExport(tracker.id)}
                                    className="flex items-center gap-1 text-[11px] font-medium pl-1.5 border-l border-emerald-500/25 hover:text-white text-emerald-300 transition-colors cursor-pointer ml-auto shrink-0"
                                    title={expandedMangaExport[tracker.id] ? t('collapse') : t('expand')}
                                  >
                                    <span className="hidden sm:inline">
                                      {expandedMangaExport[tracker.id] ? t('collapse') : t('expand')}
                                    </span>
                                    {expandedMangaExport[tracker.id] ? (
                                      <ChevronUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    )}
                                  </button>
                                </div>
                              )}

                              {/* 2. VIDEO EXPORTERS (MP4, MP3) */}
                              {(isVideo || tracker.url?.includes('instagram.com') || tracker.url?.includes('instagr.am') || tracker.url?.includes('threads.com') || tracker.url?.includes('threads.net') || tracker.audioUrl) && (
                                <div className="relative inline-flex items-center rounded-full staros-glass-pill p-1 border border-red-400/30 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_8px_20px_rgba(0,0,0,0.35)]">
                                  <motion.button
                                    id={`export-video-mp4-${tracker.id}`}
                                    onClick={() => handleExportVideo(tracker, 'mp4')}
                                    disabled={generatingExport?.id === tracker.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.94 }}
                                    transition={starosSpring}
                                    className={cn(
                                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer select-none",
                                      generatingExport?.id === tracker.id && generatingExport.type === 'mp4'
                                        ? "bg-red-500 text-white font-bold shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse"
                                        : "text-red-300 hover:bg-red-500/20 hover:text-white"
                                    )}
                                    title={t('exportVideoMp4')}
                                  >
                                    <VideoIcon className="w-3.5 h-3.5 text-red-400" />
                                    <span>MP4 Video</span>
                                  </motion.button>

                                  <div className="w-px h-4 bg-white/15 mx-0.5" />

                                  <motion.button
                                    id={`export-audio-mp3-${tracker.id}`}
                                    onClick={() => handleExportVideo(tracker, 'mp3')}
                                    disabled={generatingExport?.id === tracker.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.94 }}
                                    transition={starosSpring}
                                    className={cn(
                                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer select-none",
                                      generatingExport?.id === tracker.id && generatingExport.type === 'mp3'
                                        ? "bg-red-400 text-neutral-950 font-bold shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse"
                                        : "text-red-300 hover:bg-red-500/20 hover:text-white"
                                    )}
                                    title={t('exportAudioMp3')}
                                  >
                                    <Music className="w-3.5 h-3.5 text-red-400" />
                                    <span>MP3 Audio</span>
                                  </motion.button>
                                </div>
                              )}

                              {/* 3. IMAGE EXPORTERS (ZIP, WebP, PNG, JPG) */}
                              {isImage && (hasImages || tracker.status === 'completed') && (
                                <div className="relative inline-flex items-center rounded-full staros-glass-pill p-1 border border-blue-400/30 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_8px_20px_rgba(0,0,0,0.35)]">
                                  <motion.button
                                    id={`export-img-zip-${tracker.id}`}
                                    onClick={() => handleExportImagePackage(tracker, 'original', 'zip')}
                                    disabled={generatingExport?.id === tracker.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.94 }}
                                    transition={starosSpring}
                                    className={cn(
                                       "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer select-none",
                                       generatingExport?.id === tracker.id && generatingExport.type === 'zip_original'
                                         ? "bg-blue-500 text-white font-bold shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse"
                                         : "text-blue-300 hover:bg-blue-500/20 hover:text-white"
                                     )}
                                    title={t('exportImageZip')}
                                  >
                                    <Archive className="w-3.5 h-3.5 text-blue-400" />
                                    <span>ZIP HD</span>
                                  </motion.button>

                                  <div className="w-px h-4 bg-white/15 mx-0.5" />

                                  <motion.button
                                    id={`export-img-webp-${tracker.id}`}
                                    onClick={() => handleExportImagePackage(tracker, 'webp', 'zip')}
                                    disabled={generatingExport?.id === tracker.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.94 }}
                                    transition={starosSpring}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-blue-300 hover:bg-blue-500/20 hover:text-white transition-all cursor-pointer select-none"
                                    title="WebP Package"
                                  >
                                    <span>WebP</span>
                                  </motion.button>
                                </div>
                              )}

                              {/* Standard Controls: Custom Batch Panel (Manga only) / Play / Pause / Restart / Stop / Delete */}
                              <div className="flex items-center gap-1.5 staros-glass-pill p-1 rounded-full border border-white/20 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_6px_20px_rgba(0,0,0,0.35)]">
                                {/* Custom Download & Selection Sub-Panel Toggle Button ONLY for Manga */}
                                {isManga && (
                                  <motion.button 
                                    onClick={() => toggleCustomPanel(tracker.id)} 
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.88 }}
                                    transition={starosSpring}
                                    className={cn(
                                      "p-1.5 rounded-full transition-all cursor-pointer relative select-none",
                                      openCustomPanels[tracker.id]
                                        ? "bg-emerald-400 text-neutral-950 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                                        : Object.values(selectedChapters[tracker.id] || {}).some(Boolean)
                                        ? "bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/50 hover:bg-emerald-500/35 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                                        : "hover:bg-white/15 text-neutral-300 hover:text-white"
                                    )}
                                    title={t('manageSelectionAndDownload')}
                                  >
                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                    {Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length > 0 && (
                                      <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-emerald-400 text-black text-[9px] font-bold flex items-center justify-center font-mono shadow">
                                        {Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length}
                                      </span>
                                    )}
                                  </motion.button>
                                )}

                                {tracker.status === 'completed' && (
                                  <motion.button 
                                    onClick={() => restartTracker(tracker.id)} 
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.88 }}
                                    transition={starosSpring}
                                    className="p-1.5 rounded-full hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer select-none" 
                                    title={t('restart')}
                                  >
                                    <RotateCw className="w-3.5 h-3.5" />
                                  </motion.button>
                                )}
                                {tracker.status !== 'running' && tracker.status !== 'completed' && (
                                  <motion.button 
                                    onClick={() => resumeTracker(tracker.id)} 
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.88 }}
                                    transition={starosSpring}
                                    className="p-1.5 rounded-full hover:bg-emerald-500/20 text-emerald-400 transition-colors cursor-pointer select-none"
                                    title={t('resume')}
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                  </motion.button>
                                )}
                                {tracker.status === 'running' && (
                                  <motion.button 
                                    onClick={() => pauseTracker(tracker.id)} 
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.88 }}
                                    transition={starosSpring}
                                    className="p-1.5 rounded-full hover:bg-amber-500/20 text-amber-400 transition-colors cursor-pointer select-none"
                                    title={t('pause')}
                                  >
                                    <Pause className="w-3.5 h-3.5 fill-current" />
                                  </motion.button>
                                )}
                                {(tracker.status === 'running' || tracker.status === 'paused') && (
                                  <motion.button 
                                    onClick={() => stopTracker(tracker.id)} 
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.88 }}
                                    transition={starosSpring}
                                    className="p-1.5 rounded-full hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer select-none"
                                    title={t('stop')}
                                  >
                                    <Square className="w-3.5 h-3.5 fill-current" />
                                  </motion.button>
                                )}
                                <motion.button 
                                  onClick={() => removeTracker(tracker.id)} 
                                  whileHover={{ scale: 1.15 }}
                                  whileTap={{ scale: 0.88 }}
                                  transition={starosSpring}
                                  className="p-1.5 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer select-none"
                                  title={t('delete')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </motion.button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* SUB-PANEL INTERMEDIO: ADMINISTRADOR DE DESCARGA Y SELECCIÓN PARA MANGA SOLAMENTE */}
                  <AnimatePresence>
                    {(!tracker.category || tracker.category === 'manga') && openCustomPanels[tracker.id] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={starosSpring}
                        className="border-t border-white/10 staros-glass overflow-hidden shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.15)]"
                      >
                        <div className="p-4 sm:p-5 space-y-4">
                          {/* Sub-Panel Header */}
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                                <SlidersHorizontal className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-white tracking-wide">
                                    {t('customDownload')} (Manga)
                                  </h4>
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono staros-glass-pill text-emerald-300 border border-emerald-400/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                    {Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length} / {tracker.chapters?.length || 1} {t('selectedCount')}
                                  </span>
                                </div>
                                <p className="text-[11px] text-neutral-400">
                                  {t('batchDownloadDescription')}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Bulk selection shortcuts */}
                              <div className="flex items-center gap-1.5 staros-glass-pill p-1 rounded-full border border-white/15">
                                <motion.button
                                  type="button"
                                  onClick={() => selectAllInTracker(tracker)}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.94 }}
                                  transition={starosSpring}
                                  className="px-3 py-1 rounded-full text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/15 transition-all cursor-pointer select-none"
                                >
                                  {t('selectAll')}
                                </motion.button>
                                <motion.button
                                  type="button"
                                  onClick={() => deselectAllInTracker(tracker)}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.94 }}
                                  transition={starosSpring}
                                  className="px-3 py-1 rounded-full text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/15 transition-all cursor-pointer select-none"
                                >
                                  {t('deselectAll')}
                                </motion.button>
                                <motion.button
                                  type="button"
                                  onClick={() => invertSelectionInTracker(tracker)}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.94 }}
                                  transition={starosSpring}
                                  className="px-3 py-1 rounded-full text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/15 transition-all cursor-pointer select-none"
                                >
                                  {t('invertSelection')}
                                </motion.button>
                              </div>

                              <motion.button
                                type="button"
                                onClick={() => toggleCustomPanel(tracker.id)}
                                whileHover={{ scale: 1.12 }}
                                whileTap={{ scale: 0.9 }}
                                transition={starosSpring}
                                className="p-1.5 rounded-full staros-glass-pill text-neutral-400 hover:text-white hover:bg-white/15 transition-colors cursor-pointer ml-1 select-none"
                                title={t('closeSelectionPanel')}
                              >
                                <X className="w-4 h-4" />
                              </motion.button>
                            </div>
                          </div>

                          {/* Presets Grid for Manga Chapters */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* Primeros a la vez */}
                            <div className="p-3.5 rounded-2xl staros-glass-card space-y-2">
                              <div className="text-[11px] font-medium text-neutral-400 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                  <span>{t('firstN')} {t('atOnce')}:</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {[10, 20, 30, 40, 50].map((qty) => (
                                  <motion.button
                                    key={`first-${qty}`}
                                    type="button"
                                    onClick={() => selectFirstNChapters(tracker, qty)}
                                    whileHover={{ scale: 1.08 }}
                                    whileTap={{ scale: 0.92 }}
                                    transition={starosSpring}
                                    className="px-2.5 py-1 rounded-full text-xs font-mono staros-glass-pill text-neutral-300 hover:text-emerald-300 hover:border-emerald-400/50 transition-all cursor-pointer select-none"
                                    title={`${t('selectFirstQty')} ${qty} ${t('chaptersWord')}`}
                                  >
                                    {qty}
                                  </motion.button>
                                ))}
                              </div>
                              <div className="pt-1">
                                <motion.button
                                  type="button"
                                  onClick={() => {
                                    const selCount = Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length;
                                    const qty = selCount > 0 ? selCount : 10;
                                    handleDownloadBatchToSinglePdf(tracker, qty, 'first');
                                  }}
                                  disabled={isBatchDownloading[tracker.id] || generatingPdf?.id === tracker.id}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.96 }}
                                  transition={starosSpring}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.2)] transition-all cursor-pointer select-none"
                                  title={t('downloadFirstQtyPdfTitle')}
                                >
                                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>⚡ {t('downloadSinglePdfFirst')}</span>
                                </motion.button>
                              </div>
                            </div>

                            {/* Últimos a la vez */}
                            <div className="p-3.5 rounded-2xl staros-glass-card space-y-2">
                              <div className="text-[11px] font-medium text-neutral-400 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                                  <span>{t('lastN')} {t('atOnce')}:</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {[10, 20, 30, 40, 50].map((qty) => (
                                  <motion.button
                                    key={`last-${qty}`}
                                    type="button"
                                    onClick={() => selectLastNChapters(tracker, qty)}
                                    whileHover={{ scale: 1.08 }}
                                    whileTap={{ scale: 0.92 }}
                                    transition={starosSpring}
                                    className="px-2.5 py-1 rounded-full text-xs font-mono staros-glass-pill text-neutral-300 hover:text-blue-300 hover:border-blue-400/50 transition-all cursor-pointer select-none"
                                    title={`${t('selectLastQty')} ${qty} ${t('chaptersWord')}`}
                                  >
                                    {qty}
                                  </motion.button>
                                ))}
                              </div>
                              <div className="pt-1">
                                <motion.button
                                  type="button"
                                  onClick={() => {
                                    const selCount = Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length;
                                    const qty = selCount > 0 ? selCount : 10;
                                    handleDownloadBatchToSinglePdf(tracker, qty, 'last');
                                  }}
                                  disabled={isBatchDownloading[tracker.id] || generatingPdf?.id === tracker.id}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.96 }}
                                  transition={starosSpring}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/40 shadow-[0_0_12px_rgba(59,130,246,0.2)] transition-all cursor-pointer select-none"
                                  title={t('downloadLastQtyPdfTitle')}
                                >
                                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                                  <span>⚡ {t('downloadSinglePdfLast')}</span>
                                </motion.button>
                              </div>
                            </div>

                            {/* Cantidad Personalizada */}
                            <div className="p-3.5 rounded-2xl staros-glass-card space-y-2">
                              <div className="text-[11px] font-medium text-neutral-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block shadow-[0_0_6px_rgba(192,132,252,0.8)]" />
                                <span>{t('enterQuantity')}:</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={tracker.chapters?.length || 100}
                                  value={customQty[tracker.id] ?? '15'}
                                  onChange={(e) => setCustomQty(prev => ({ ...prev, [tracker.id]: e.target.value }))}
                                  placeholder="15"
                                  className="w-16 bg-white/10 border border-white/15 rounded-xl px-2.5 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-emerald-400 shadow-inner"
                                />
                                <div className="flex rounded-full overflow-hidden border border-white/15 staros-glass-pill p-0.5">
                                  <motion.button
                                    type="button"
                                    onClick={() => setCustomDir(prev => ({ ...prev, [tracker.id]: 'first' }))}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    transition={starosSpring}
                                    className={cn(
                                      "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer select-none",
                                      (customDir[tracker.id] ?? 'first') === 'first'
                                        ? "bg-emerald-500/30 text-emerald-300 font-bold shadow-sm"
                                        : "text-neutral-400 hover:text-white"
                                    )}
                                  >
                                    {t('firstN')}
                                  </motion.button>
                                  <motion.button
                                    type="button"
                                    onClick={() => setCustomDir(prev => ({ ...prev, [tracker.id]: 'last' }))}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    transition={starosSpring}
                                    className={cn(
                                      "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer select-none",
                                      customDir[tracker.id] === 'last'
                                        ? "bg-blue-500/30 text-blue-300 font-bold shadow-sm"
                                        : "text-neutral-400 hover:text-white"
                                    )}
                                  >
                                    {t('lastN')}
                                  </motion.button>
                                </div>
                                <motion.button
                                  type="button"
                                  onClick={() => {
                                    const qty = parseInt(customQty[tracker.id] ?? '15', 10) || 10;
                                    if ((customDir[tracker.id] ?? 'first') === 'first') {
                                      selectFirstNChapters(tracker, qty);
                                    } else {
                                      selectLastNChapters(tracker, qty);
                                    }
                                  }}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  transition={starosSpring}
                                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.25)] transition-all cursor-pointer ml-auto select-none"
                                >
                                  {t('apply')}
                                </motion.button>
                              </div>
                              <div className="pt-1">
                                <motion.button
                                  type="button"
                                  onClick={() => {
                                    const qty = parseInt(customQty[tracker.id] ?? '15', 10) || 15;
                                    const dir = customDir[tracker.id] ?? 'first';
                                    handleDownloadBatchToSinglePdf(tracker, qty, dir);
                                  }}
                                  disabled={isBatchDownloading[tracker.id] || generatingPdf?.id === tracker.id}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.96 }}
                                  transition={starosSpring}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-400/40 shadow-[0_0_12px_rgba(192,132,252,0.2)] transition-all cursor-pointer select-none"
                                  title={t('downloadQtyPdfTitle')}
                                >
                                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                                  <span>⚡ {t('downloadQtyToSinglePdf')}</span>
                                </motion.button>
                              </div>
                            </div>
                          </div>

                          {/* Action Executions for Selected Manga Chapters */}
                          <div className="pt-2 flex flex-wrap items-center gap-2.5 border-t border-white/10">
                            {/* 1. Download Selected Chapters */}
                            <motion.button
                              type="button"
                              onClick={() => handleDownloadSelectedChapters(tracker)}
                              disabled={isBatchDownloading[tracker.id] || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                              whileHover={!Object.values(selectedChapters[tracker.id] || {}).some(Boolean) ? {} : { scale: 1.04 }}
                              whileTap={!Object.values(selectedChapters[tracker.id] || {}).some(Boolean) ? {} : { scale: 0.95 }}
                              transition={starosSpring}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer border shadow-lg select-none",
                                !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)
                                  ? "bg-white/5 text-neutral-500 border-white/5 cursor-not-allowed"
                                  : isBatchDownloading[tracker.id]
                                  ? "bg-emerald-400 text-neutral-950 border-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.5)] animate-pulse"
                                  : "bg-emerald-400 text-neutral-950 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:brightness-110"
                              )}
                            >
                              <DownloadCloud className={cn("w-4 h-4", isBatchDownloading[tracker.id] && "animate-bounce")} />
                              <span>
                                {isBatchDownloading[tracker.id]
                                  ? t('downloading')
                                  : `${t('downloadSelected')} (${Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length})`}
                              </span>
                            </motion.button>

                            {/* 2. Combined Volume PDF (pdf-lib ➜ img2pdf fallback) */}
                            <motion.button
                              type="button"
                              onClick={() => handleExportSelectedCombined(tracker)}
                              disabled={generatingPdf?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.95 }}
                              transition={starosSpring}
                              className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold staros-glass-pill bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 hover:bg-emerald-500/30 hover:text-white shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none"
                              title={t('compileSelectedPdfTitle')}
                            >
                              <FileText className="w-4 h-4 text-emerald-400" />
                              <span>{t('singlePdfButton')}</span>
                            </motion.button>

                            {/* 3. Export Selected as ZIP Bundle with individual chapter PDFs */}
                            <motion.button
                              type="button"
                              onClick={() => handleExportSelectedZipPdfs(tracker)}
                              disabled={generatingExport?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.95 }}
                              transition={starosSpring}
                              className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold staros-glass-pill text-white border border-white/15 hover:border-emerald-400/40 hover:text-emerald-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none"
                              title={t('downloadSelectedZipTitle')}
                            >
                              <Archive className="w-4 h-4 text-emerald-400" />
                              <span>{t('zipSelectionPdfs')}</span>
                            </motion.button>

                            {/* 4. Export Selected as individual CBZ comic files */}
                            <motion.button
                              type="button"
                              onClick={() => handleExportSelectedIndividualCbz(tracker)}
                              disabled={generatingExport?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.95 }}
                              transition={starosSpring}
                              className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold staros-glass-pill text-white border border-white/15 hover:border-emerald-400/40 hover:text-emerald-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none"
                              title={t('downloadSelectedCbzTitle')}
                            >
                              <BookOpen className="w-4 h-4 text-emerald-400" />
                              <span>{t('cbzSelectionIndividual')}</span>
                            </motion.button>

                            {/* 5. Individual Separate Chapter PDFs */}
                            <motion.button
                              type="button"
                              onClick={() => handleExportSelectedIndividual(tracker, 'img2pdf')}
                              disabled={generatingPdf?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.95 }}
                              transition={starosSpring}
                              className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold staros-glass-pill text-neutral-300 border border-white/15 hover:border-emerald-400/40 hover:text-emerald-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none"
                              title={t('exportIndividualPdfs')}
                            >
                              <FolderDown className="w-4 h-4 text-emerald-400" />
                              <span>{t('exportIndividualPdfs')}</span>
                            </motion.button>

                            {/* 6. Reintentar Rotos en Sub-panel */}
                            {((tracker.chapters || []).some(c => c.status === 'error' || ((!c.images || c.images.length === 0) && c.status !== 'downloading' && c.status !== 'pending' && tracker.status === 'completed'))) && (
                              <motion.button
                                type="button"
                                onClick={() => handleRetryFailedChapters(tracker)}
                                disabled={isBatchDownloading[tracker.id]}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.95 }}
                                transition={starosSpring}
                                className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 transition-all cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.25)] sm:ml-auto select-none"
                              >
                                <RotateCw className="w-4 h-4" />
                                <span>{t('retryFailedChaptersWaitMode')}</span>
                              </motion.button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Subtle bottom padding */}
        <div className="h-8" aria-hidden="true" />
      </div>

      {/* Fixed Floating Lateral Language & Theme Capsule */}
      <LanguageCapsule />

      {/* Inline task settings are integrated directly into the header layout */}


      {/* ExtractionSession Verification Modal for Protected / Challenge Media */}
      <ExtractionVerificationModal
        isOpen={verificationModal.isOpen}
        onClose={handleCloseVerificationModal}
        url={verificationModal.url}
        provider={verificationModal.provider}
        sessionId={verificationModal.sessionId}
        status={verificationModal.status}
        errorMessage={verificationModal.errorMessage}
        useSessionUserAgent={verificationModal.useSessionUserAgent}
        onToggleUserAgent={(val) => setVerificationModal(prev => ({ ...prev, useSessionUserAgent: val }))}
        onConfirmVerification={handleConfirmVerification}
        onRetryVerification={() => {
          setVerificationModal(prev => ({ ...prev, status: 'pending', errorMessage: undefined }));
        }}
      />
    </div>
  );
}
