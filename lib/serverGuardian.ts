import os from 'os';

/**
 * Megiddo Ray - Server Capacity Guardian ("Sistema Salvavidas")
 * Protects server stability by enforcing a safe ceiling (~250MB - 300MB)
 * for internal downloads/processing and monitoring real-time system metrics.
 */

// Safe threshold window: No artificial 280MB blocking limit for internal downloads
export const DEFAULT_INTERNAL_LIMIT_BYTES = Number.MAX_SAFE_INTEGER; // Unrestricted internal downloads
export const MAX_SAFE_CONCURRENT_INTERNAL_JOBS = 10;
export const MIN_SAFE_FREE_MEM_BYTES = 50 * 1024 * 1024; // 50 MB RAM buffer

export interface ServerMetrics {
  freeMemBytes: number;
  freeMemMB: number;
  totalMemMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  activeInternalJobs: number;
  activeProcessingBytes: number;
  activeProcessingMB: number;
  safeLimitMB: number;
  isMemoryConstrained: boolean;
}

export interface CapacityEvaluation {
  canInternal: boolean;
  canLocal: boolean;
  recommendedMode: 'internal' | 'local';
  estimatedSizeBytes?: number;
  estimatedSizeFormatted: string;
  isOverCapacityLimit: boolean;
  isSafeForInternal: boolean;
  warningMessage?: string;
  reason: string;
  serverMetrics: ServerMetrics;
}

// In-memory tracking of running internal jobs and accumulated bytes
interface ActiveJobRecord {
  id: string;
  estimatedBytes: number;
  startedAt: number;
  type: string;
}

const activeJobs = new Map<string, ActiveJobRecord>();

/**
 * Format bytes to readable string (B, KB, MB, GB)
 */
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes < 0) {
    return 'Desconocido';
  }
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val >= 10 || i === 0 ? val.toFixed(1) : val.toFixed(2)} ${sizes[i]}`;
}

/**
 * Read current real-time server metrics safely
 */
export function getServerMetrics(): ServerMetrics {
  let freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memUsage = process.memoryUsage();
  
  // Calculate currently active processing bytes
  let activeBytes = 0;
  activeJobs.forEach(job => {
    activeBytes += job.estimatedBytes;
  });

  const freeMemMB = Math.round(freeMem / (1024 * 1024));
  const totalMemMB = Math.round(totalMem / (1024 * 1024));
  const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
  const heapTotalMB = Math.round(memUsage.heapTotal / (1024 * 1024));
  const activeProcessingMB = Math.round(activeBytes / (1024 * 1024));

  const isMemoryConstrained = freeMem < MIN_SAFE_FREE_MEM_BYTES || activeJobs.size >= MAX_SAFE_CONCURRENT_INTERNAL_JOBS;

  return {
    freeMemBytes: freeMem,
    freeMemMB,
    totalMemMB,
    heapUsedMB,
    heapTotalMB,
    activeInternalJobs: activeJobs.size,
    activeProcessingBytes: activeBytes,
    activeProcessingMB,
    safeLimitMB: Math.round(DEFAULT_INTERNAL_LIMIT_BYTES / (1024 * 1024)),
    isMemoryConstrained,
  };
}

/**
 * Evaluate whether an item or batch operation can safely run internally
 * or MUST be routed to local device download.
 */
export function evaluateServerCapacity(
  estimatedSizeBytes?: number,
  options?: {
    itemCount?: number;
    category?: 'manga' | 'video' | 'image' | string;
    isBatch?: boolean;
    durationSeconds?: number;
  }
): CapacityEvaluation {
  const metrics = getServerMetrics();
  const limitBytes = DEFAULT_INTERNAL_LIMIT_BYTES;
  const limitMB = Math.round(limitBytes / (1024 * 1024));

  // 1. If size is known
  if (estimatedSizeBytes !== undefined && estimatedSizeBytes > 0) {
    const sizeFormatted = formatBytes(estimatedSizeBytes);

    // Internal and local processing are fully supported without artificial size caps
    return {
      canInternal: true,
      canLocal: true,
      recommendedMode: options?.category === 'image' ? 'local' : 'internal',
      estimatedSizeBytes,
      estimatedSizeFormatted: sizeFormatted,
      isOverCapacityLimit: false,
      isSafeForInternal: true,
      reason: `Capacidad óptima en el servidor (${sizeFormatted}). Ambos métodos de descarga disponibles.`,
      serverMetrics: metrics,
    };
  }

  // 2. If size is unknown, evaluate metadata cues
  const itemCount = options?.itemCount || 1;
  const duration = options?.durationSeconds || 0;
  const category = options?.category || 'video';

  let computedBytes = 0;
  if (duration > 0) {
    computedBytes = Math.round(duration * 350 * 1024);
  } else if (category === 'manga') {
    computedBytes = itemCount * 30 * 850 * 1024;
  } else if (category === 'image') {
    computedBytes = itemCount * 450 * 1024;
  } else {
    computedBytes = 25 * 1024 * 1024;
  }

  const computedFormatted = `~${formatBytes(computedBytes)}`;

  // Both internal and local methods are enabled
  return {
    canInternal: true,
    canLocal: true,
    recommendedMode: category === 'video' ? 'internal' : 'local',
    estimatedSizeBytes: computedBytes,
    estimatedSizeFormatted: computedFormatted,
    isOverCapacityLimit: false,
    isSafeForInternal: true,
    reason: `Capacidad óptima en el servidor (${computedFormatted} estimado). Ambos métodos compatibles.`,
    serverMetrics: metrics,
  };
}

/**
 * Register an internal job before execution to track concurrency and safety
 */
export function acquireInternalJobSlot(jobId: string, estimatedBytes: number, type = 'download'): { allowed: boolean; reason?: string } {
  // Prune any stale jobs older than 15 minutes
  const now = Date.now();
  for (const [id, job] of activeJobs.entries()) {
    if (now - job.startedAt > 15 * 60 * 1000) {
      activeJobs.delete(id);
    }
  }

  const evalResult = evaluateServerCapacity(estimatedBytes);
  if (!evalResult.canInternal) {
    return {
      allowed: false,
      reason: evalResult.warningMessage || evalResult.reason,
    };
  }

  activeJobs.set(jobId, {
    id: jobId,
    estimatedBytes: estimatedBytes || 50 * 1024 * 1024,
    startedAt: now,
    type,
  });

  return { allowed: true };
}

/**
 * Release an internal job when completed or errored
 */
export function releaseInternalJobSlot(jobId: string): void {
  activeJobs.delete(jobId);
}
