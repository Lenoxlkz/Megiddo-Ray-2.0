'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import { AlertItem, AlertLevel } from '@/lib/alerts';

interface AlertsContextType {
  alerts: AlertItem[];
  systemState: AlertLevel;
  addAlert: (alert: Omit<AlertItem, 'id' | 'timestamp'>) => string;
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
  isPanelOpen: boolean;
  setIsPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  unreadCount: number;
}

const AlertsContext = createContext<AlertsContextType | undefined>(undefined);

const DEFAULT_INIT_ALERT: AlertItem = {
  id: 'init-sys-ready',
  timestamp: '--:--',
  type: 'info',
  level: 'stable',
  title: 'Sistema en línea',
  titleEn: 'System online',
  userMessage: 'Motor de detección, extracción y descarga iniciado en estado óptimo.',
  userMessageEn: 'Detection, extraction and download engine initialized in optimal state.',
  technicalDetails: 'Detectores registrados: YouTube, TikTok, Instagram, Facebook, X, Threads, Olympus, ManhwaWeb.',
  technicalDetailsEn: 'Registered detectors: YouTube, TikTok, Instagram, Facebook, X, Threads, Olympus, ManhwaWeb.',
};

const SERVER_ALERTS: AlertItem[] = [DEFAULT_INIT_ALERT];
let memoryAlerts: AlertItem[] = [DEFAULT_INIT_ALERT];
let isAlertsInitialized = false;
const alertListeners = new Set<() => void>();

function getAlertsSnapshot(): AlertItem[] {
  if (typeof window === 'undefined') return SERVER_ALERTS;
  if (!isAlertsInitialized) {
    isAlertsInitialized = true;
    try {
      const saved = sessionStorage.getItem('liquid_alerts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryAlerts = parsed;
          return memoryAlerts;
        }
      }
    } catch {}
    memoryAlerts = [
      {
        ...DEFAULT_INIT_ALERT,
        timestamp: new Date().toLocaleTimeString(),
      },
    ];
  }
  return memoryAlerts;
}

function getAlertsServerSnapshot(): AlertItem[] {
  return SERVER_ALERTS;
}

function subscribeAlerts(callback: () => void) {
  alertListeners.add(callback);
  return () => {
    alertListeners.delete(callback);
  };
}

function updateAlertsGlobal(updater: AlertItem[] | ((prev: AlertItem[]) => AlertItem[])) {
  const next = typeof updater === 'function' ? updater(memoryAlerts) : updater;
  memoryAlerts = next;
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('liquid_alerts', JSON.stringify(next.slice(0, 50)));
    }
  } catch {}
  alertListeners.forEach((fn) => fn());
}

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const alerts = useSyncExternalStore(
    subscribeAlerts,
    getAlertsSnapshot,
    getAlertsServerSnapshot
  );
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Compute overall system health / light state
  const systemState: AlertLevel = useMemo(() => {
    const active = alerts.filter(a => !a.dismissed);
    if (active.some(a => a.level === 'critical')) return 'critical';
    if (active.some(a => a.level === 'warning')) return 'warning';
    return 'stable';
  }, [alerts]);

  const unreadCount = useMemo(() => {
    return alerts.filter(a => !a.dismissed && a.level !== 'stable').length;
  }, [alerts]);

  const addAlert = useCallback((newAlertData: Omit<AlertItem, 'id' | 'timestamp'>) => {
    const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newAlert: AlertItem = {
      ...newAlertData,
      id,
      timestamp: new Date().toLocaleTimeString(),
    };

    updateAlertsGlobal((prev) => [newAlert, ...prev.slice(0, 49)]);
    return id;
  }, []);

  const clearAlerts = useCallback(() => {
    updateAlertsGlobal([
      {
        id: `clear-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        level: 'stable',
        title: 'Registro restablecido',
        titleEn: 'Log reset',
        userMessage: 'Se limpió el historial de alertas del sistema.',
        userMessageEn: 'System alert history was cleared.',
      },
    ]);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    updateAlertsGlobal((prev) =>
      prev.map((item) => (item.id === id ? { ...item, dismissed: true } : item))
    );
  }, []);

  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  return (
    <AlertsContext.Provider
      value={{
        alerts,
        systemState,
        addAlert,
        clearAlerts,
        dismissAlert,
        isPanelOpen,
        setIsPanelOpen,
        togglePanel,
        unreadCount,
      }}
    >
      {children}
    </AlertsContext.Provider>
  );
}

export function useAlerts(): AlertsContextType {
  const context = useContext(AlertsContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertsProvider');
  }
  return context;
}
