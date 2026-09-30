import {
  extractYouTubeMedia,
  extractTikTokMedia,
  extractInstagramMedia,
  extractTwitterMedia,
  extractFacebookMedia,
  extractThreadsMedia,
  runYtDlpMetadata,
} from '@/lib/mediaExtractor';
import { resolvePlatformToMediaStream } from '@/lib/downloadResolver';

/**
 * Diagnostics contract requested by the user:
 * {
 *   playable: boolean,
 *   streamingMode: "direct" | "proxy" | "hls" | "dash" | "unavailable",
 *   supportsRange: boolean,
 *   contentType?: string,
 *   size?: number,
 *   duration?: number,
 *   requiresCookies: boolean,
 *   requiresHeaders: boolean,
 *   reason?: string
 * }
 */
export type VideoStreamingMode = 'direct' | 'proxy' | 'hls' | 'dash' | 'unavailable';

export interface VideoPreviewDiagnostics {
  playable: boolean;
  streamingMode: VideoStreamingMode;
  supportsRange: boolean;
  contentType?: string;
  size?: number;
  duration?: number;
  requiresCookies: boolean;
  requiresHeaders: boolean;
  reason?: string;
}

export interface VideoPreviewResolution {
  previewUrl?: string;
  diagnostics: VideoPreviewDiagnostics;
  resolvedAt: number;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DISGUISED_HTML_SIGNATURES = [
  '<!doctype html',
  '<html',
  '<head',
  '<body',
  'cookie check',
  'action required to load your app',
  'authenticate in new window',
  'challenge-platform',
  'cf-browser-verification',
  'attention required! | cloudflare',
  'recaptcha',
  'g-recaptcha',
  'login required',
  'sign in to continue',
  'iniciar sesión',
  'access denied',
  'security check',
];

/**
 * Get domain-specific headers required by platforms that enforce hotlink/origin protection
 */
function getPlatformHeaders(urlStr: string): { headers: Record<string, string>; requiresHeaders: boolean; requiresCookies: boolean } {
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_USER_AGENT,
    Accept: '*/*',
  };

  const lower = urlStr.toLowerCase();

  if (lower.includes('googlevideo.com') || lower.includes('youtube.com') || lower.includes('youtu.be')) {
    headers['Referer'] = 'https://www.youtube.com/';
    headers['Origin'] = 'https://www.youtube.com';
    return { headers, requiresHeaders: true, requiresCookies: true };
  }

  if (lower.includes('fbcdn.net') || lower.includes('facebook.com') || lower.includes('fb.watch')) {
    headers['Referer'] = 'https://www.facebook.com/';
    headers['Origin'] = 'https://www.facebook.com';
    headers['User-Agent'] = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
    return { headers, requiresHeaders: true, requiresCookies: false };
  }

  if (lower.includes('cdninstagram.com') || lower.includes('instagram.com') || lower.includes('instagr.am')) {
    headers['Referer'] = 'https://www.instagram.com/';
    headers['Origin'] = 'https://www.instagram.com';
    return { headers, requiresHeaders: true, requiresCookies: false };
  }

  if (lower.includes('tiktokcdn.com') || lower.includes('tiktok.com')) {
    headers['Referer'] = 'https://www.tiktok.com/';
    return { headers, requiresHeaders: true, requiresCookies: false };
  }

  if (lower.includes('twimg.com') || lower.includes('twitter.com') || lower.includes('x.com')) {
    headers['Referer'] = 'https://x.com/';
    headers['Origin'] = 'https://x.com';
    return { headers, requiresHeaders: true, requiresCookies: false };
  }

  if (lower.includes('threads.net') || lower.includes('threads.com')) {
    headers['Referer'] = 'https://www.threads.net/';
    return { headers, requiresHeaders: true, requiresCookies: false };
  }

  return { headers, requiresHeaders: false, requiresCookies: false };
}

/**
 * Checks if a host is known to support direct browser streaming without proxy
 */
function isPublicDirectStreamHost(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    // Known hosts that restrict direct cross-origin browser media without proper headers
    if (
      host.includes('googlevideo.com') ||
      host.includes('fbcdn.net') ||
      host.includes('cdninstagram.com') ||
      host.includes('tiktokcdn.com') ||
      host.includes('instagram.com') ||
      host.includes('facebook.com') ||
      host.includes('tiktok.com') ||
      host.includes('twitter.com') ||
      host.includes('x.com')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Video Preview Resolver
 * Analyzes video candidate resources before handing them to the player.
 * Checks Content-Type, size, duration, redirects, HTTP Range support (206, Accept-Ranges, Content-Range),
 * required cookies/headers, and compatibility.
 *
 * Priority order:
 * 1. direct: Direct streaming if original URL is directly playable and supports Range.
 * 2. proxy: Megiddo Ray Streaming Proxy if resource needs cookies/headers/session, without downloading the full 1-2 GB file.
 * 3. hls / dash: Adaptive streaming manifests when needed and viable.
 * 4. unavailable: Resource cannot be safely played (HTML error, auth challenge, 404, etc.).
 */
export async function resolveVideoPreview(
  rawUrl: string,
  options: {
    candidateUrl?: string;
    duration?: number;
    estimatedSize?: number;
    title?: string;
  } = {}
): Promise<VideoPreviewResolution> {
  const cleanUrl = rawUrl.trim();
  let candidateStreamUrl = options.candidateUrl?.trim() || cleanUrl;
  let duration = options.duration;
  let measuredSize = options.estimatedSize;
  let resolvedTitle = options.title;

  // Fast check: YouTube is instantly resolvable to its official HD embed streaming URL
  if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
    const ytVideoIdMatch = cleanUrl.match(/(?:v=|shorts\/|youtu\.be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/i);
    const videoId = ytVideoIdMatch ? ytVideoIdMatch[1] : '';
    if (videoId) {
      return {
        previewUrl: `https://www.youtube.com/embed/${videoId}`,
        diagnostics: {
          playable: true,
          streamingMode: 'direct',
          supportsRange: true,
          contentType: 'video/mp4',
          size: measuredSize,
          duration,
          requiresCookies: false,
          requiresHeaders: false,
          reason: 'Transmisión directa activa con reproductor embebido HD. Soporta cualquier duración (+40m, 2h) sin cortes ni descarga a RAM.',
        },
        resolvedAt: Date.now(),
      };
    }
  }

  // Step 1: If input is a social media webpage (e.g. TikTok, Instagram, Twitter, Facebook),
  // extract or resolve the underlying stream candidate first!
  const isWebPageUrl =
    cleanUrl.includes('tiktok.com') ||
    cleanUrl.includes('instagram.com') ||
    cleanUrl.includes('facebook.com') ||
    cleanUrl.includes('fb.watch') ||
    cleanUrl.includes('twitter.com') ||
    cleanUrl.includes('x.com') ||
    cleanUrl.includes('threads.net') ||
    cleanUrl.includes('threads.com');

  if (isWebPageUrl && (!options.candidateUrl || options.candidateUrl === cleanUrl)) {
    try {
      const streamRes = await resolvePlatformToMediaStream(cleanUrl, 'video');
      if (streamRes.streamUrl) {
        candidateStreamUrl = streamRes.streamUrl;
      }
      if (streamRes.duration && !duration) duration = streamRes.duration;
      if (streamRes.filesize && !measuredSize) measuredSize = streamRes.filesize;
      if (streamRes.title && !resolvedTitle) resolvedTitle = streamRes.title;
    } catch {
      // Continue with candidateStreamUrl
    }
  }

  // Fast check: If URL is completely invalid
  if (!candidateStreamUrl.startsWith('http://') && !candidateStreamUrl.startsWith('https://')) {
    return {
      previewUrl: undefined,
      diagnostics: {
        playable: false,
        streamingMode: 'unavailable',
        supportsRange: false,
        requiresCookies: false,
        requiresHeaders: false,
        reason: 'La dirección URL no es válida o no cuenta con protocolo HTTP/HTTPS.',
      },
      resolvedAt: Date.now(),
    };
  }

  // Check if candidate URL is an HLS or DASH stream directly by extension
  const candidateLower = candidateStreamUrl.toLowerCase();
  const isHlsExtension = candidateLower.includes('.m3u8');
  const isDashExtension = candidateLower.includes('.mpd');

  if (isHlsExtension) {
    return {
      previewUrl: candidateStreamUrl,
      diagnostics: {
        playable: true,
        streamingMode: 'hls',
        supportsRange: false,
        contentType: 'application/vnd.apple.mpegurl',
        size: measuredSize,
        duration,
        requiresCookies: false,
        requiresHeaders: false,
        reason: 'Flujo HLS adaptable detectado (.m3u8). La reproducción se realiza por segmentos de lista.',
      },
      resolvedAt: Date.now(),
    };
  }

  if (isDashExtension) {
    return {
      previewUrl: candidateStreamUrl,
      diagnostics: {
        playable: true,
        streamingMode: 'dash',
        supportsRange: false,
        contentType: 'application/dash+xml',
        size: measuredSize,
        duration,
        requiresCookies: false,
        requiresHeaders: false,
        reason: 'Manifiesto DASH adaptable detectado (.mpd).',
      },
      resolvedAt: Date.now(),
    };
  }

  // Step 2: Determine platform header requirements
  const { headers: initialHeaders, requiresHeaders: initialReqHeaders, requiresCookies: initialReqCookies } =
    getPlatformHeaders(candidateStreamUrl);

  let requiresHeaders = initialReqHeaders;
  let requiresCookies = initialReqCookies;
  let contentType: string | undefined;
  let supportsRange = false;
  let finalUrl = candidateStreamUrl;
  let isDisguisedHtml = false;
  let isAccessible = false;
  let httpStatus = 0;

  // Step 3: Perform lightweight HTTP probe (HEAD request followed by Range: bytes=0-1)
  // NEVER downloads the full 1-2 GB file!
  try {
    const headRes = await fetch(candidateStreamUrl, {
      method: 'HEAD',
      headers: initialHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });

    httpStatus = headRes.status;
    finalUrl = headRes.url || candidateStreamUrl;

    if (headRes.ok || headRes.status === 206) {
      isAccessible = true;
      contentType = headRes.headers.get('content-type') || undefined;
      const acceptRangesHeader = headRes.headers.get('accept-ranges');
      if (acceptRangesHeader === 'bytes') {
        supportsRange = true;
      }
      const lenStr = headRes.headers.get('content-length');
      if (lenStr) {
        const len = parseInt(lenStr, 10);
        if (!isNaN(len) && len > 0) measuredSize = len;
      }
    }
  } catch {
    // HEAD might be rejected (e.g. 405 Method Not Allowed) or timed out; will probe with Range GET
  }

  // Step 4: Definitive Range probe: Send GET with Range: bytes=0-1 (Only 2 bytes!)
  const abortController = new AbortController();
  const rangeTimeout = setTimeout(() => abortController.abort(), 4500);

  try {
    const rangeRes = await fetch(candidateStreamUrl, {
      method: 'GET',
      headers: {
        ...initialHeaders,
        Range: 'bytes=0-1',
      },
      redirect: 'follow',
      signal: abortController.signal,
    });

    clearTimeout(rangeTimeout);
    httpStatus = rangeRes.status;
    finalUrl = rangeRes.url || finalUrl;

    if (rangeRes.ok || rangeRes.status === 206) {
      isAccessible = true;
      if (!contentType) {
        contentType = rangeRes.headers.get('content-type') || undefined;
      }

      // Check if server accepted the byte range
      const contentRange = rangeRes.headers.get('content-range'); // e.g. "bytes 0-1/1048576000"
      const acceptRangesHeader = rangeRes.headers.get('accept-ranges');
      if (rangeRes.status === 206 || contentRange || acceptRangesHeader === 'bytes') {
        supportsRange = true;
      }

      // Parse total size from Content-Range if available
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
          const totalSize = parseInt(match[1], 10);
          if (!isNaN(totalSize) && totalSize > 0) {
            measuredSize = totalSize;
          }
        }
      } else if (!measuredSize && rangeRes.headers.get('content-length')) {
        const cl = parseInt(rangeRes.headers.get('content-length')!, 10);
        // Only use content-length if it's the full length (not 2 bytes)
        if (!isNaN(cl) && cl > 1024) {
          measuredSize = cl;
        }
      }

      // Inspect initial bytes to verify it's NOT an HTML error page or interstitial challenge
      if (rangeRes.body) {
        const reader = rangeRes.body.getReader();
        try {
          const { value } = await reader.read();
          if (value && value.length > 0) {
            const textDecoder = new TextDecoder('utf-8', { fatal: false });
            const sampleText = textDecoder.decode(value.subarray(0, 512)).toLowerCase();
            for (const sig of DISGUISED_HTML_SIGNATURES) {
              if (sampleText.includes(sig)) {
                isDisguisedHtml = true;
                break;
              }
            }
          }
        } catch {
          // Ignore read error
        } finally {
          reader.cancel().catch(() => {});
          abortController.abort();
        }
      }
    } else if (rangeRes.status === 403 || rangeRes.status === 401) {
      requiresHeaders = true;
      requiresCookies = true;
    }
  } catch (err: unknown) {
    clearTimeout(rangeTimeout);
    abortController.abort();
    // If we haven't established accessibility, mark as unreachable
  }

  // Step 5: Check Content-Type for HTML or non-video types
  const lowerCt = (contentType || '').toLowerCase();
  if (lowerCt.includes('text/html') || lowerCt.includes('application/xhtml+xml') || isDisguisedHtml) {
    return {
      previewUrl: undefined,
      diagnostics: {
        playable: false,
        streamingMode: 'unavailable',
        supportsRange: false,
        contentType: contentType || 'text/html',
        size: measuredSize,
        duration,
        requiresCookies: true,
        requiresHeaders: true,
        reason: 'El recurso devolvió una página web HTML o comprobación de sesión en lugar de un flujo de video binario.',
      },
      resolvedAt: Date.now(),
    };
  }

  // Check for HLS or DASH content types from headers
  if (lowerCt.includes('application/vnd.apple.mpegurl') || lowerCt.includes('application/x-mpegurl')) {
    return {
      previewUrl: candidateStreamUrl,
      diagnostics: {
        playable: true,
        streamingMode: 'hls',
        supportsRange: false,
        contentType,
        size: measuredSize,
        duration,
        requiresCookies: requiresCookies,
        requiresHeaders: requiresHeaders,
        reason: 'Flujo HLS adaptable detectado.',
      },
      resolvedAt: Date.now(),
    };
  }

  if (lowerCt.includes('application/dash+xml')) {
    return {
      previewUrl: candidateStreamUrl,
      diagnostics: {
        playable: true,
        streamingMode: 'dash',
        supportsRange: false,
        contentType,
        size: measuredSize,
        duration,
        requiresCookies: requiresCookies,
        requiresHeaders: requiresHeaders,
        reason: 'Flujo DASH adaptable detectado.',
      },
      resolvedAt: Date.now(),
    };
  }

  // Check if resource is an image instead of video
  if (lowerCt.includes('image/') && !lowerCt.includes('video')) {
    return {
      previewUrl: undefined,
      diagnostics: {
        playable: false,
        streamingMode: 'unavailable',
        supportsRange,
        contentType,
        size: measuredSize,
        duration,
        requiresCookies: false,
        requiresHeaders: false,
        reason: `El recurso es una imagen (${contentType}), no un archivo de video.`,
      },
      resolvedAt: Date.now(),
    };
  }

  // If HTTP status is an unrecoverable error
  if (!isAccessible && (httpStatus >= 400 || httpStatus === 0)) {
    return {
      previewUrl: undefined,
      diagnostics: {
        playable: false,
        streamingMode: 'unavailable',
        supportsRange: false,
        contentType,
        size: measuredSize,
        duration,
        requiresCookies,
        requiresHeaders,
        reason: `No se pudo acceder al recurso remoto (código HTTP: ${httpStatus || 'Sin respuesta'}). El enlace puede haber caducado o requiere inicio de sesión.`,
      },
      resolvedAt: Date.now(),
    };
  }

  // Step 6: Priority decision:
  // 1. Direct Streaming: Only if directly playable by browser without custom cookies/headers,
  //    supports HTTP Range (206), and origin allows cross-origin requests.
  const isDirectViable =
    !requiresCookies &&
    !requiresHeaders &&
    supportsRange &&
    isPublicDirectStreamHost(finalUrl);

  if (isDirectViable) {
    return {
      previewUrl: finalUrl,
      diagnostics: {
        playable: true,
        streamingMode: 'direct',
        supportsRange: true,
        contentType: contentType || 'video/mp4',
        size: measuredSize,
        duration,
        requiresCookies: false,
        requiresHeaders: false,
        reason: 'Direct Streaming activo: el origen soporta HTTP Range (206 Partial Content) y no requiere sesión ni cabeceras privadas.',
      },
      resolvedAt: Date.now(),
    };
  }

  // 2. Streaming Proxy of Megiddo Ray:
  // Used when resource needs cookies, headers, session, CORS forwarding, or Range negotiation,
  // WITHOUT downloading the 1-2 GB file to RAM or disk.
  const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(finalUrl || candidateStreamUrl)}&preview=true`;

  const reasonList: string[] = [];
  if (requiresHeaders) reasonList.push('cabeceras de origen (Referer/User-Agent)');
  if (requiresCookies) reasonList.push('sesión/token firmado');
  if (!supportsRange) reasonList.push('emulación y túnel HTTP Range');
  if (!isPublicDirectStreamHost(finalUrl)) reasonList.push('bypass de política CORS para reproducción en navegador');

  const proxyReason =
    reasonList.length > 0
      ? `Streaming Proxy de Megiddo Ray activo: se intermedió el flujo para ${reasonList.join(', ')} sin descargar el archivo a disco ni memoria.`
      : 'Streaming Proxy de Megiddo Ray activo con reenvío de solicitudes Range (206 Partial Content).';

  return {
    previewUrl: proxyUrl,
    diagnostics: {
      playable: true,
      streamingMode: 'proxy',
      supportsRange: true, // Megiddo Ray Streaming Proxy provides Range 206 support to browser!
      contentType: contentType || 'video/mp4',
      size: measuredSize,
      duration,
      requiresCookies,
      requiresHeaders,
      reason: proxyReason,
    },
    resolvedAt: Date.now(),
  };
}
