export type Category = 'manga' | 'video' | 'image' | 'unknown';

export type Platform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'x'
  | 'threads'
  | 'olympusscan'
  | 'manhwaweb'
  | 'direct_image'
  | 'unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface DetectionResult {
  platform: Platform;
  platformName: string;
  platformNameEn?: string;
  category: Category;
  suggestedCategory: Category;
  confidence: ConfidenceLevel;
  confidenceScore: number; // 0.0 to 1.0
  needsConfirmation: boolean;
  reason: string;
  reasonEn?: string;
  normalizedUrl: string;
  originalInput: string;
  supportedCategories: Category[];
  extractorAvailable: boolean;
}

export interface PlatformDetector {
  id: Platform;
  name: string;
  /**
   * Fast check to determine if this detector handles the domain/host
   */
  canHandle: (urlObj: URL, normalizedUrl: string) => boolean;
  /**
   * Performs fine-grained categorization and confidence scoring based on URL path/structure
   */
  detect: (
    urlObj: URL,
    normalizedUrl: string
  ) => Omit<DetectionResult, 'normalizedUrl' | 'originalInput'>;
}
