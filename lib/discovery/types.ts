/**
 * Discovery and Metadata contracts for Megiddo Ray
 */

import { ResolvedDownload } from '@/lib/downloadResolver';
import { VideoPreviewResolution, VideoPreviewDiagnostics } from '@/lib/videoPreviewResolver';

export interface DiscoveredChapterItem {
  id: string | number;
  chapterNumber?: string | number;
  title: string;
  name?: string; // alias for title
  url: string;
  thumbnailUrl?: string;
  pageCount?: number;
  pages?: string[]; // Array of remote image references (NOT downloaded yet)
  estimatedSizeBytes?: number;
  estimatedSizeFormatted?: string;
  releaseDate?: string;
  scanlationGroup?: string;
}

export interface DiscoveredContent {
  id: string;
  originalUrl: string;
  cleanUrl: string;
  url: string; // alias for originalUrl
  platform: string;
  platformName: string;
  category: 'manga' | 'video' | 'image';
  type?: 'manga' | 'video' | 'image'; // Alias for category
  title: string;
  author?: string;
  authorUrl?: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailSource: 'platform' | 'oembed' | 'metadata' | 'range_probe' | 'fallback';
  
  // Media details
  duration?: number; // seconds
  durationFormatted?: string;
  resolution?: string;
  width?: number;
  height?: number;
  format?: string; // mp4, webp, jpeg, cbz, etc.
  
  // Size metrics
  estimatedSizeBytes?: number;
  estimatedSizeFormatted?: string;
  exactSizeKnown: boolean;
  
  // For collections & manga
  totalItems?: number;
  totalPages?: number;
  items?: DiscoveredChapterItem[];
  
  // Direct resource reference (for Local device download)
  directResourceUrl?: string;
  audioUrl?: string;
  videoEmbedUrl?: string;

  // Video Preview Resolution & Diagnostics
  previewUrl?: string;
  videoPreview?: VideoPreviewResolution;
  videoPreviewDiagnostics?: VideoPreviewDiagnostics;
  
  // Resolved Download Capability
  resolvedDownload?: ResolvedDownload;
  requiresSession?: boolean;
  sessionId?: string;
  canVerify?: boolean;

  // Capabilities & Guardian
  downloadCapabilities: {
    internal: boolean;
    local: boolean;
  };
  recommendedMode: 'internal' | 'local';
  recommendationReason: string;
  guardianStatus: {
    isSafeForInternal: boolean;
    isOverLimit: boolean;
    warningMessage?: string;
    serverFreeMemMB: number;
    activeInternalJobs: number;
    safeLimitMB: number;
  };
  safetyEvaluation?: {
    isSafe: boolean;
    reason?: string;
  };
  
  // Raw platform metadata if needed
  extra?: Record<string, any>;
}
