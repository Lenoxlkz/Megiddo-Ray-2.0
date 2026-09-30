import { extractSharedUrl } from '../urlExtractor';
import {
  Category,
  ConfidenceLevel,
  DetectionResult,
  Platform,
  PlatformDetector,
} from './types';
import {
  YouTubeDetector,
  TikTokDetector,
  InstagramDetector,
  FacebookDetector,
  XDetector,
  ThreadsDetector,
  OlympusScanDetector,
  ManhwaWebDetector,
  DirectImageDetector,
  GenericMangaDetector,
} from './detectors';

export * from './types';
export * from './detectors';

// Ordered registry of detectors. Evaluated in sequence.
const DETECTOR_REGISTRY: PlatformDetector[] = [
  YouTubeDetector,
  TikTokDetector,
  InstagramDetector,
  FacebookDetector,
  XDetector,
  ThreadsDetector,
  OlympusScanDetector,
  ManhwaWebDetector,
  DirectImageDetector,
  GenericMangaDetector,
];

/**
 * Register a new detector dynamically to extend the platform
 */
export function registerPlatformDetector(detector: PlatformDetector, prepend = false) {
  if (prepend) {
    DETECTOR_REGISTRY.unshift(detector);
  } else {
    DETECTOR_REGISTRY.push(detector);
  }
}

/**
 * Central detection function.
 * Normalizes the input, extracts valid URL from shared sheet or string,
 * evaluates against the detector registry, and produces a structured DetectionResult.
 */
export function detectUrl(input: string | {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): DetectionResult {
  const inputObj = typeof input === 'string'
    ? { url: input }
    : input;

  const originalInputStr = inputObj.url || inputObj.text || inputObj.title || '';
  const extracted = extractSharedUrl(inputObj);

  if (!extracted.isValid || !extracted.normalizedUrl) {
    return {
      platform: 'unknown',
      platformName: 'URL no válida',
      platformNameEn: 'Invalid URL',
      category: 'unknown',
      suggestedCategory: 'unknown',
      confidence: 'unknown',
      confidenceScore: 0,
      needsConfirmation: true,
      reason: extracted.error || 'No se pudo obtener una dirección web válida',
      reasonEn: extracted.error || 'Could not obtain a valid web URL',
      normalizedUrl: '',
      originalInput: originalInputStr,
      supportedCategories: [],
      extractorAvailable: false,
    };
  }

  const normalizedUrl = extracted.normalizedUrl;

  try {
    const urlObj = new URL(normalizedUrl);

    for (const detector of DETECTOR_REGISTRY) {
      if (detector.canHandle(urlObj, normalizedUrl)) {
        const detection = detector.detect(urlObj, normalizedUrl);
        return {
          ...detection,
          normalizedUrl,
          originalInput: originalInputStr,
        };
      }
    }

    // Default fallback for unrecognized web providers
    return {
      platform: 'unknown',
      platformName: 'Plataforma No Soportada',
      platformNameEn: 'Unsupported Platform',
      category: 'unknown',
      suggestedCategory: 'unknown',
      confidence: 'unknown',
      confidenceScore: 0.1,
      needsConfirmation: true,
      reason: 'No se identificó un extractor compatible para este dominio web',
      reasonEn: 'No specialized extractor matched for this web domain',
      normalizedUrl,
      originalInput: originalInputStr,
      supportedCategories: ['video', 'image', 'manga'],
      extractorAvailable: false,
    };
  } catch (err) {
    return {
      platform: 'unknown',
      platformName: 'Error de análisis',
      platformNameEn: 'Analysis Error',
      category: 'unknown',
      suggestedCategory: 'unknown',
      confidence: 'unknown',
      confidenceScore: 0,
      needsConfirmation: true,
      reason: `Error al procesar el enlace: ${err instanceof Error ? err.message : String(err)}`,
      reasonEn: `Error processing link: ${err instanceof Error ? err.message : String(err)}`,
      normalizedUrl,
      originalInput: originalInputStr,
      supportedCategories: [],
      extractorAvailable: false,
    };
  }
}
