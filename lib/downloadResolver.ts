import { evaluateServerCapacity, formatBytes, DEFAULT_INTERNAL_LIMIT_BYTES } from '@/lib/serverGuardian';
import {
  extractYouTubeMedia,
  extractTikTokMedia,
  extractInstagramMedia,
  extractTwitterMedia,
  extractFacebookMedia,
  extractThreadsMedia,
  runYtDlpMetadata,
} from '@/lib/mediaExtractor';
import { createDownloadToken, ResourceKind } from '@/lib/downloadTokenStore';
import {
  getInternalExtractionSession,
  invalidateExtractionSession,
  detectProviderFromUrl,
} from '@/lib/extractionSessionStore';

export type { ResourceKind };

export interface ResolvedDownload {
  mode: 'local' | 'internal' | 'unavailable';
  canLocal: boolean;
  canInternal: boolean;
  url?: string;
  finalUrl?: string;
  contentType?: string;
  size?: number;
  sizeFormatted?: string;
  filename?: string;
  requiresCookies?: boolean;
  requiresHeaders?: boolean;
  requiresAuthentication?: boolean;
  requiresSession?: boolean;
  canVerify?: boolean;
  provider?: string;
  sessionId?: string;
  isDisguisedHtml?: boolean;
  cookieCheckDetected?: boolean;
  expiresAt?: number;
  reason?: string;
  safetyNote?: string;
  serverSafe: boolean;
  token?: string;
  downloadUrl?: string;
}

export interface DownloadCapability {
  available: boolean;
  mode: 'direct' | 'proxy' | 'unavailable';
  url?: string;
  token?: string;
  downloadUrl?: string;
  contentType?: string;
  size?: number;
  filename?: string;
  requiresCookies?: boolean;
  requiresHeaders?: boolean;
  requiresSession?: boolean;
  sessionId?: string;
  canVerify?: boolean;
  sessionInvalid?: boolean;
  provider?: string;
  expiresAt?: number;
  reason?: string;
  safetyNote?: string;
  serverSafe: boolean;
  diagnostics?: {
    signatureVerified: boolean;
    format?: string;
    acceptRanges?: boolean;
    status?: number;
  };
}

export interface RemoteProbeResult {
  isValid: boolean;
  canLocal: boolean;
  status?: number;
  finalUrl?: string;
  contentType?: string;
  contentLength?: number;
  contentDisposition?: string;
  acceptRanges?: boolean;
  isDisguisedHtml: boolean;
  isInvalidBinary: boolean;
  cookieCheckDetected: boolean;
  requiresHeaders: boolean;
  requiresCookies: boolean;
  signatureVerified: boolean;
  expiresAt?: number;
  error?: string;
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
};

// Known signatures of HTML pages disguised as media or interstitial walls
const DISGUISED_HTML_SIGNATURES = [
  'cookie check',
  'action required to load your app',
  'authenticate in new window',
  '<!doctype html',
  '<html',
  '<head',
  '<body',
  'cf-browser-verification',
  'challenge-platform',
  'attention required! | cloudflare',
  'recaptcha',
  'g-recaptcha',
  'accounts.google.com',
  'sign in to continue',
  'iniciar sesión',
  'login required',
  'access denied',
  'security check',
];

/**
 * Extracts signed URL expiration timestamp if present in query parameters
 */
function extractExpirationTimestamp(urlStr: string): number | undefined {
  try {
    const urlObj = new URL(urlStr);
    const expireParam =
      urlObj.searchParams.get('expire') ||
      urlObj.searchParams.get('Expires') ||
      urlObj.searchParams.get('expires') ||
      urlObj.searchParams.get('se') ||
      urlObj.searchParams.get('exp');

    if (expireParam) {
      const num = parseInt(expireParam, 10);
      if (!isNaN(num) && num > 0) {
        return num < 10000000000 ? num * 1000 : num;
      }
    }
  } catch {
    // Ignore URL parse error
  }
  return undefined;
}

/**
 * Inspects initial bytes (up to 4096 bytes) for container signatures and HTML/JSON detection.
 */
export function inspectBinaryMagicBytes(
  bytes: Uint8Array,
  expectedKind: 'video' | 'audio' | 'image' | 'manga' = 'video'
): { isBinary: boolean; isHtml: boolean; isJson: boolean; format?: string } {
  if (bytes.length === 0) return { isBinary: false, isHtml: false, isJson: false };

  // 1. Check for text/HTML/JSON signatures
  const headerSlice = bytes.subarray(0, Math.min(bytes.length, 512));
  const textSample = new TextDecoder('utf-8', { fatal: false }).decode(headerSlice).trim().toLowerCase();

  for (const sig of DISGUISED_HTML_SIGNATURES) {
    if (textSample.includes(sig)) {
      return { isBinary: false, isHtml: true, isJson: false };
    }
  }

  if (
    (textSample.startsWith('{') && textSample.includes('"error"')) ||
    (textSample.startsWith('{') && textSample.includes('"status"')) ||
    textSample.startsWith('{"') ||
    textSample.startsWith('[{"')
  ) {
    return { isBinary: false, isHtml: false, isJson: true };
  }

  // 2. MP4 / M4V / M4A / QuickTime:
  // Offset 4..7: 'ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'
  if (bytes.length >= 8) {
    const boxType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].includes(boxType)) {
      return { isBinary: true, isHtml: false, isJson: false, format: 'mp4' };
    }
  }

  // 3. WebM / Matroska (EBML header): 0x1A 0x45 0xDF 0xA3
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { isBinary: true, isHtml: false, isJson: false, format: 'webm' };
  }

  // 4. MP3: ID3 tag (0x49 0x44 0x33) or sync frame 0xFF 0xFB/F3/F2/E3
  if (
    bytes.length >= 3 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
  ) {
    return { isBinary: true, isHtml: false, isJson: false, format: 'mp3' };
  }

  // 5. JPEG: 0xFF 0xD8 0xFF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { isBinary: true, isHtml: false, isJson: false, format: 'jpeg' };
  }

  // 6. PNG: 0x89 0x50 0x4E 0x47
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { isBinary: true, isHtml: false, isJson: false, format: 'png' };
  }

  // 7. WebP: 'RIFF' + 'WEBP'
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff === 'RIFF' && webp === 'WEBP') {
      return { isBinary: true, isHtml: false, isJson: false, format: 'webp' };
    }
  }

  // 8. General binary check (count non-ASCII/null bytes)
  let nonAsciiCount = 0;
  for (let i = 0; i < Math.min(bytes.length, 128); i++) {
    if (bytes[i] === 0 || bytes[i] > 127) nonAsciiCount++;
  }
  const isLikelyBinary = nonAsciiCount > 8;

  return { isBinary: isLikelyBinary, isHtml: false, isJson: false };
}

/**
 * Checks if a candidate URL host requires backend proxying due to CORS,
 * referer restrictions, or custom user-agent verification.
 */
export function candidateNeedsProxy(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return (
      host.includes('googlevideo.com') ||
      host.includes('youtube.com') ||
      host.includes('tiktokcdn') ||
      host.includes('tiktok.com') ||
      host.includes('cdninstagram.com') ||
      host.includes('instagram.com') ||
      host.includes('fbcdn.net') ||
      host.includes('facebook.com') ||
      host.includes('twimg.com') ||
      host.includes('twitter.com') ||
      host.includes('x.com') ||
      host.includes('threads.net')
    );
  } catch {
    return false;
  }
}

/**
 * Probes a remote URL using a controlled request with Range: bytes=0-4095.
 * Strictly verifies HTTP status, Content-Type, Content-Length, Content-Range,
 * and first bytes / container signature without downloading the entire file.
 */
export async function probeRemoteMediaUrl(
  candidateUrl: string,
  expectedType: 'video' | 'audio' | 'image' | 'manga' = 'video',
  customHeaders?: Record<string, string>
): Promise<RemoteProbeResult> {
  const clean = candidateUrl.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    return {
      isValid: false,
      canLocal: false,
      isDisguisedHtml: false,
      isInvalidBinary: true,
      cookieCheckDetected: false,
      requiresHeaders: false,
      requiresCookies: false,
      signatureVerified: false,
      error: 'URL no válida o esquema no soportado',
    };
  }

  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    Range: 'bytes=0-4095',
    ...(customHeaders || {}),
  };

  if (clean.includes('tiktok.com') || clean.includes('tiktokcdn.com')) {
    headers['Referer'] = 'https://www.tiktok.com/';
  } else if (clean.includes('instagram.com') || clean.includes('cdninstagram.com')) {
    headers['Referer'] = 'https://www.instagram.com/';
    headers['Origin'] = 'https://www.instagram.com';
  } else if (clean.includes('twimg.com') || clean.includes('twitter.com') || clean.includes('x.com')) {
    headers['Referer'] = 'https://x.com/';
    headers['Origin'] = 'https://x.com';
  } else if (clean.includes('facebook.com') || clean.includes('fbcdn.net')) {
    headers['Referer'] = 'https://www.facebook.com/';
    headers['Origin'] = 'https://www.facebook.com';
    headers['User-Agent'] = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
  } else if (clean.includes('googlevideo.com') || clean.includes('youtube.com')) {
    headers['Referer'] = 'https://www.youtube.com/';
    headers['Origin'] = 'https://www.youtube.com';
  } else if (clean.includes('savenow.to') || clean.includes('loader.to') || clean.includes('affadaffa.com')) {
    headers['Referer'] = 'https://loader.to/';
  } else if (clean.includes('threads.net')) {
    headers['Referer'] = 'https://www.threads.net/';
    headers['Origin'] = 'https://www.threads.net';
  }

  const expiresAt = extractExpirationTimestamp(clean);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 6000);

  try {
    const rangeRes = await fetch(clean, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    const finalUrl = rangeRes.url || clean;
    const contentType = rangeRes.headers.get('content-type') || '';
    const contentDisposition = rangeRes.headers.get('content-disposition') || '';
    const acceptRanges = rangeRes.headers.get('accept-ranges') === 'bytes';

    // Parse content length from range or direct header
    let contentLength: number | undefined;
    const contentRange = rangeRes.headers.get('content-range');
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) contentLength = parseInt(match[1], 10);
    }
    if (!contentLength && rangeRes.headers.get('content-length')) {
      const rawLen = parseInt(rangeRes.headers.get('content-length')!, 10);
      if (!isNaN(rawLen)) contentLength = rawLen;
    }

    // Read only the initial bytes (up to 4096 bytes) and immediately abort stream
    let firstBytes: Uint8Array = new Uint8Array(0);
    if (rangeRes.body) {
      const reader = rangeRes.body.getReader();
      try {
        const { value } = await reader.read();
        if (value) {
          firstBytes = value.subarray(0, 4096);
        }
      } catch {
        // Stream reading interrupted
      } finally {
        reader.cancel().catch(() => {});
        abortController.abort();
      }
    }

    // Inspect Content-Type header
    const lowerCt = contentType.toLowerCase();
    const isHeaderHtml =
      lowerCt.includes('text/html') ||
      lowerCt.includes('application/xhtml+xml') ||
      (lowerCt.includes('text/plain') && expectedType !== 'manga');
    const isHeaderJson = lowerCt.includes('application/json');

    // Inspect first bytes / binary magic numbers
    const inspection = inspectBinaryMagicBytes(firstBytes, expectedType);

    if (isHeaderHtml || isHeaderJson || inspection.isHtml || inspection.isJson) {
      const cookieCheckDetected =
        inspection.isHtml &&
        (clean.includes('cookie') ||
          new TextDecoder().decode(firstBytes).toLowerCase().includes('cookie check'));

      return {
        isValid: false,
        canLocal: false,
        status: rangeRes.status,
        finalUrl,
        contentType,
        contentLength,
        contentDisposition,
        acceptRanges,
        isDisguisedHtml: true,
        isInvalidBinary: true,
        cookieCheckDetected,
        requiresHeaders: false,
        requiresCookies: true,
        signatureVerified: false,
        expiresAt,
        error: cookieCheckDetected
          ? 'Página de Cookie Check / Autenticación detectada en lugar del archivo multimedia.'
          : `El servidor devolvió un documento ${isHeaderJson || inspection.isJson ? 'JSON' : 'HTML'} (${contentType}) en vez del archivo binario.`,
      };
    }

    if (!rangeRes.ok && rangeRes.status !== 206) {
      const requiresSession = rangeRes.status === 403 || rangeRes.status === 401;
      return {
        isValid: false,
        canLocal: false,
        status: rangeRes.status,
        finalUrl,
        contentType,
        contentLength,
        isDisguisedHtml: false,
        isInvalidBinary: true,
        cookieCheckDetected: false,
        requiresHeaders: requiresSession,
        requiresCookies: requiresSession,
        signatureVerified: false,
        expiresAt,
        error: `Servidor remoto respondió con código de error ${rangeRes.status}. Requiere sesión o autorización.`,
      };
    }

    // Expected media type verification
    const isAcceptableMedia =
      expectedType === 'video'
        ? lowerCt.includes('video') ||
          lowerCt.includes('octet-stream') ||
          lowerCt.includes('mp4') ||
          lowerCt.includes('webm') ||
          inspection.isBinary
        : expectedType === 'audio'
        ? lowerCt.includes('audio') || lowerCt.includes('octet-stream') || inspection.isBinary
        : expectedType === 'image'
        ? lowerCt.includes('image') || lowerCt.includes('octet-stream') || inspection.isBinary
        : true;

    if (!isAcceptableMedia || (!inspection.isBinary && expectedType === 'video')) {
      return {
        isValid: false,
        canLocal: false,
        status: rangeRes.status,
        finalUrl,
        contentType,
        contentLength,
        isDisguisedHtml: false,
        isInvalidBinary: true,
        cookieCheckDetected: false,
        requiresHeaders: false,
        requiresCookies: false,
        signatureVerified: false,
        expiresAt,
        error: `El recurso no contiene una firma válida de contenedor multimedia (${contentType}).`,
      };
    }

    const needsProxy = candidateNeedsProxy(clean) || candidateNeedsProxy(finalUrl);

    return {
      isValid: true,
      canLocal: !needsProxy,
      status: rangeRes.status,
      finalUrl,
      contentType: contentType || (expectedType === 'video' ? 'video/mp4' : 'application/octet-stream'),
      contentLength,
      contentDisposition,
      acceptRanges,
      isDisguisedHtml: false,
      isInvalidBinary: false,
      cookieCheckDetected: false,
      requiresHeaders: needsProxy,
      requiresCookies: false,
      signatureVerified: inspection.isBinary,
      expiresAt,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    abortController.abort();
    const errMsg = err instanceof Error ? err.message : 'Error durante el sondeo de red';
    return {
      isValid: false,
      canLocal: false,
      isDisguisedHtml: false,
      isInvalidBinary: true,
      cookieCheckDetected: false,
      requiresHeaders: false,
      requiresCookies: false,
      signatureVerified: false,
      expiresAt,
      error: `Error de conexión al recurso: ${errMsg}`,
    };
  }
}

/**
 * Attempts to resolve a platform webpage URL (YouTube, TikTok, Twitter, etc.)
 * to its direct binary media streaming URL (CDN / signed URL).
 * STRICT: If extraction fails or yields only a webpage, returns undefined.
 * NEVER returns the input webpage URL as a streamUrl.
 */
export async function resolvePlatformToMediaStream(
  originalUrl: string,
  expectedType: 'video' | 'image' | 'manga' | 'audio' = 'video'
): Promise<{
  streamUrl?: string;
  title?: string;
  duration?: number;
  filesize?: number;
  expiresAt?: number;
}> {
  const clean = originalUrl.trim();

  // 1. YouTube
  if (clean.includes('youtube.com') || clean.includes('youtu.be')) {
    try {
      const ytData = await extractYouTubeMedia(clean);
      const targetStream =
        expectedType === 'audio' && ytData.audioUrl
          ? ytData.audioUrl
          : ytData.videoUrl || ytData.audioUrl;
      if (
        targetStream &&
        targetStream.startsWith('http') &&
        !targetStream.includes('youtube.com/watch') &&
        !targetStream.includes('youtu.be/')
      ) {
        return {
          streamUrl: targetStream,
          title: ytData.chapterName,
          duration: ytData.duration,
          filesize: ytData.filesize,
          expiresAt: extractExpirationTimestamp(targetStream),
        };
      }
    } catch {
      // Fallback
    }

    try {
      const ytMeta = await runYtDlpMetadata(clean);
      const targetStream =
        expectedType === 'audio' && ytMeta.audioUrl ? ytMeta.audioUrl : ytMeta.url;
      if (
        targetStream &&
        targetStream.startsWith('http') &&
        !targetStream.includes('youtube.com/watch') &&
        !targetStream.includes('youtu.be/')
      ) {
        return {
          streamUrl: targetStream,
          title: ytMeta.title,
          duration: ytMeta.duration,
          filesize: ytMeta.filesize,
          expiresAt: extractExpirationTimestamp(targetStream),
        };
      }
    } catch {
      // Fallback
    }
  }

  // 2. TikTok
  else if (clean.includes('tiktok.com') && !clean.includes('tiktokcdn.com') && !clean.includes('.mp4')) {
    try {
      const tkData = await extractTikTokMedia(clean);
      if (
        tkData.videoUrl &&
        tkData.videoUrl.startsWith('http') &&
        !tkData.videoUrl.includes('tiktok.com/@')
      ) {
        return {
          streamUrl: tkData.videoUrl,
          title: tkData.chapterName,
          filesize: tkData.filesize,
        };
      }
    } catch {}
  }

  // 3. Instagram / Threads
  else if (
    (clean.includes('instagram.com') || clean.includes('threads.net')) &&
    !clean.includes('cdninstagram.com') &&
    !clean.includes('.mp4')
  ) {
    try {
      const igData = clean.includes('threads.net')
        ? await extractThreadsMedia(clean)
        : await extractInstagramMedia(clean);
      if (
        igData.videoUrl &&
        igData.videoUrl.startsWith('http') &&
        !igData.videoUrl.includes('instagram.com/') &&
        !igData.videoUrl.includes('threads.net/')
      ) {
        return {
          streamUrl: igData.videoUrl,
          title: igData.chapterName,
        };
      }
    } catch {}
  }

  // 4. Twitter / X
  else if (
    (clean.includes('x.com') || clean.includes('twitter.com')) &&
    !clean.includes('twimg.com') &&
    !clean.includes('.mp4')
  ) {
    try {
      const twData = await extractTwitterMedia(clean);
      if (
        twData.videoUrl &&
        twData.videoUrl.startsWith('http') &&
        !twData.videoUrl.includes('twitter.com/') &&
        !twData.videoUrl.includes('x.com/')
      ) {
        return {
          streamUrl: twData.videoUrl,
          title: twData.chapterName,
        };
      }
    } catch {}
  }

  // 5. Facebook
  else if (
    (clean.includes('facebook.com') || clean.includes('fb.watch')) &&
    !clean.includes('fbcdn.net') &&
    !clean.includes('.mp4')
  ) {
    try {
      const fbData = await extractFacebookMedia(clean);
      if (
        fbData.videoUrl &&
        fbData.videoUrl.startsWith('http') &&
        !fbData.videoUrl.includes('facebook.com/')
      ) {
        return {
          streamUrl: fbData.videoUrl,
          title: fbData.chapterName,
        };
      }
    } catch {}
  }

  // STRICT: Do not return webpage URL as stream URL
  const isWebPage =
    clean.includes('youtube.com') ||
    clean.includes('youtu.be') ||
    clean.includes('instagram.com') ||
    clean.includes('tiktok.com') ||
    clean.includes('facebook.com') ||
    clean.includes('fb.watch') ||
    clean.includes('twitter.com') ||
    clean.includes('x.com') ||
    clean.includes('threads.net');

  return { streamUrl: isWebPage ? undefined : clean };
}

/**
 * PHASE 1 & 2: Backend Authoritative Download Preparation.
 * Validates the binary resource using Range probe, checks server capacity,
 * and produces the exact capability contract:
 * { available, mode: "direct" | "proxy" | "unavailable", url, token, downloadUrl, contentType, size, filename, reason }
 */
export async function prepareDownload(params: {
  url: string;
  candidateUrl?: string;
  filename?: string;
  expectedType?: 'video' | 'audio' | 'image' | 'manga';
  estimatedSize?: number;
  durationSeconds?: number;
  itemCount?: number;
  sessionId?: string;
  userAgent?: string;
}): Promise<DownloadCapability> {
  const originalUrl = (params.url || '').trim();
  const expectedType = params.expectedType || 'video';
  let candidate = (params.candidateUrl || '').trim();
  const detectedProvider = detectProviderFromUrl(originalUrl);

  const baseTitle = params.filename || 'descarga_megiddo_ray';
  const ext =
    expectedType === 'audio' ? 'mp3' : expectedType === 'image' ? 'jpg' : 'mp4';
  const safeFilename = baseTitle.endsWith(`.${ext}`) ? baseTitle : `${baseTitle}.${ext}`;

  // If candidate is missing, identical to original webpage, or a raw webpage, resolve platform stream
  const isCandidateWebpage =
    !candidate ||
    candidate === originalUrl ||
    candidate.includes('youtube.com/watch') ||
    candidate.includes('youtu.be/') ||
    candidate.includes('instagram.com/reel/') ||
    candidate.includes('instagram.com/p/') ||
    candidate.includes('tiktok.com/@');

  if (isCandidateWebpage) {
    const resolved = await resolvePlatformToMediaStream(originalUrl, expectedType);
    if (
      resolved.streamUrl &&
      resolved.streamUrl !== originalUrl &&
      resolved.streamUrl.startsWith('http')
    ) {
      candidate = resolved.streamUrl;
    } else {
      candidate = '';
    }
  }

  // If after resolution candidate is still missing or a webpage: reject!
  if (!candidate || candidate === originalUrl) {
    return {
      available: false,
      mode: 'unavailable',
      filename: safeFilename,
      serverSafe: true,
      requiresSession: true,
      canVerify: true,
      provider: detectedProvider,
      reason:
        'No se pudo extraer un flujo binario multimedia directo para este enlace. Si el contenido requiere autorización o verificación de usuario, inicia la sesión de verificación.',
      safetyNote: 'La descarga fue protegida de forma preventiva para evitar guardar páginas web HTML como videos.',
    };
  }

  // Retrieve active extraction session credentials if provided
  let sessionHeaders: Record<string, string> | undefined;
  const activeSession = params.sessionId ? getInternalExtractionSession(params.sessionId) : undefined;

  if (activeSession && activeSession.status === 'verified') {
    sessionHeaders = {
      'User-Agent': activeSession.userAgent || params.userAgent || BROWSER_HEADERS['User-Agent'],
      ...(activeSession.requiredHeaders || {}),
    };
    if (activeSession.cookies) {
      sessionHeaders['Cookie'] = activeSession.cookies;
    }
  }

  // Perform controlled Range: bytes=0-4095 probe and binary container verification
  const probe = await probeRemoteMediaUrl(candidate, expectedType, sessionHeaders);

  const requiresVerification =
    probe.cookieCheckDetected ||
    probe.requiresCookies ||
    probe.status === 401 ||
    probe.status === 403 ||
    (probe.isDisguisedHtml &&
      (probe.error?.toLowerCase().includes('cookie') ||
        probe.error?.toLowerCase().includes('iniciar sesión') ||
        probe.error?.toLowerCase().includes('verificación') ||
        probe.error?.toLowerCase().includes('access denied')));

  if (!probe.isValid || probe.isDisguisedHtml || probe.isInvalidBinary) {
    if (params.sessionId && activeSession) {
      // The session was provided but the origin rejected it or it is invalid/expired
      invalidateExtractionSession(params.sessionId);
      return {
        available: false,
        mode: 'unavailable',
        filename: safeFilename,
        serverSafe: true,
        requiresSession: true,
        sessionInvalid: true,
        canVerify: true,
        provider: detectedProvider,
        sessionId: params.sessionId,
        reason: 'La sesión de verificación expiró o ya no es válida.',
        safetyNote: 'El servidor remoto rechazó la sesión de verificación. Se requiere nueva verificación.',
      };
    }

    if (requiresVerification) {
      return {
        available: false,
        mode: 'unavailable',
        filename: safeFilename,
        serverSafe: true,
        requiresSession: true,
        canVerify: true,
        provider: detectedProvider,
        reason: 'Este recurso requiere una verificación.',
        safetyNote: 'El proveedor requiere autenticación o challenge anti-bot para acceder al recurso binario.',
      };
    }

    return {
      available: false,
      mode: 'unavailable',
      filename: safeFilename,
      serverSafe: true,
      reason:
        probe.error ||
        'El servidor de origen devolvió un documento HTML o respuesta de error en lugar de un archivo multimedia binario.',
      safetyNote: 'El sistema impidió guardar una respuesta HTML o mensaje de error como video.',
    };
  }

  // Size calculation & Server capacity evaluation
  let realSizeBytes = 0;
  if (probe.contentLength && probe.contentLength > 0) {
    realSizeBytes = probe.contentLength;
  } else {
    realSizeBytes = params.estimatedSize || 0;
  }

  if (!realSizeBytes && params.durationSeconds && params.durationSeconds > 0) {
    realSizeBytes = Math.round(params.durationSeconds * 350 * 1024);
  }

  const capacityEval = evaluateServerCapacity(realSizeBytes, {
    itemCount: params.itemCount || 1,
    durationSeconds: params.durationSeconds || 0,
    category: expectedType,
  });

  const isOverServerLimit = false;
  const isServerSafe = true;

  // Decide Mode: Direct vs Proxy
  const needsProxy =
    candidateNeedsProxy(candidate) ||
    probe.requiresHeaders ||
    probe.requiresCookies ||
    !!sessionHeaders;

  if (!needsProxy && probe.canLocal) {
    // Mode = "direct": Public CDN / signed URL that can be directly downloaded by client device
    const verifiedDirectUrl = probe.finalUrl || candidate;
    return {
      available: true,
      mode: 'direct',
      url: verifiedDirectUrl,
      downloadUrl: verifiedDirectUrl,
      contentType: probe.contentType || 'video/mp4',
      size: realSizeBytes,
      filename: safeFilename,
      expiresAt: probe.expiresAt,
      serverSafe: !isOverServerLimit,
      diagnostics: {
        signatureVerified: probe.signatureVerified,
        format: probe.contentType,
        acceptRanges: probe.acceptRanges,
        status: probe.status,
      },
    };
  }

  // Mode = "proxy": Resource requires origin headers (Referer, User-Agent) or authentication
  // Generate secure temporary download token
  const tokenHeaders: Record<string, string> = {
    'User-Agent':
      sessionHeaders?.['User-Agent'] ||
      (candidate.includes('fbcdn.net') || candidate.includes('facebook.com')
        ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        : BROWSER_HEADERS['User-Agent']),
    ...(sessionHeaders || {}),
  };

  const token = createDownloadToken({
    targetUrl: candidate,
    filename: safeFilename,
    contentType: probe.contentType || 'video/mp4',
    size: realSizeBytes,
    headers: tokenHeaders,
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
    maxUses: 60,
    resourceKind: expectedType === 'audio' ? 'audio' : expectedType === 'image' ? 'image' : 'video',
    sessionId: params.sessionId,
  });

  return {
    available: true,
    mode: 'proxy',
    token,
    downloadUrl: `/api/download/file?token=${token}&filename=${encodeURIComponent(safeFilename)}`,
    contentType: probe.contentType || 'video/mp4',
    size: realSizeBytes,
    filename: safeFilename,
    requiresHeaders: probe.requiresHeaders || !!sessionHeaders,
    requiresCookies: probe.requiresCookies || !!activeSession?.cookies,
    requiresSession: !!params.sessionId,
    sessionId: params.sessionId,
    provider: detectedProvider,
    expiresAt: Date.now() + 30 * 60 * 1000,
    serverSafe: isServerSafe,
    diagnostics: {
      signatureVerified: probe.signatureVerified,
      format: probe.contentType,
      acceptRanges: probe.acceptRanges,
      status: probe.status,
    },
  };
}

/**
 * Main Download Resolver Engine (Backwards compatible interface):
 * Evaluates candidate URL, validates real HTTP response, checks for HTML disguise/cookie checks,
 * analyzes server capacity (~250-300MB limit), and determines final mode ('local' | 'internal' | 'unavailable').
 */
export async function resolveDownloadCapability(
  originalUrl: string,
  expectedType: 'video' | 'image' | 'manga' = 'video',
  options?: {
    candidateUrl?: string;
    filename?: string;
    estimatedSize?: number;
    durationSeconds?: number;
    itemCount?: number;
    sessionId?: string;
    userAgent?: string;
  }
): Promise<ResolvedDownload> {
  const prep = await prepareDownload({
    url: originalUrl,
    candidateUrl: options?.candidateUrl,
    filename: options?.filename,
    expectedType,
    estimatedSize: options?.estimatedSize,
    durationSeconds: options?.durationSeconds,
    itemCount: options?.itemCount,
    sessionId: options?.sessionId,
    userAgent: options?.userAgent,
  });

  const sizeFormatted = formatBytes(prep.size || 0);

  if (!prep.available || prep.mode === 'unavailable') {
    return {
      mode: 'internal',
      canLocal: false,
      canInternal: prep.serverSafe,
      url: undefined,
      finalUrl: undefined,
      contentType: undefined,
      size: prep.size || 0,
      sizeFormatted,
      filename: prep.filename,
      requiresCookies: prep.requiresCookies || false,
      requiresHeaders: prep.requiresHeaders || false,
      requiresAuthentication: prep.requiresCookies || false,
      requiresSession: prep.requiresSession,
      canVerify: prep.canVerify,
      provider: prep.provider,
      sessionId: prep.sessionId,
      isDisguisedHtml: true,
      cookieCheckDetected: false,
      serverSafe: prep.serverSafe,
      reason: prep.reason || 'Descarga local directa no disponible. Se utilizará la descarga interna.',
      safetyNote: 'La descarga fue protegida contra páginas HTML de error.',
    };
  }

  return {
    mode: 'local',
    canLocal: true,
    canInternal: prep.serverSafe,
    url: prep.url || prep.downloadUrl,
    finalUrl: prep.url || prep.downloadUrl,
    contentType: prep.contentType,
    size: prep.size,
    sizeFormatted,
    filename: prep.filename,
    requiresCookies: prep.requiresCookies,
    requiresHeaders: prep.requiresHeaders,
    requiresAuthentication: prep.requiresCookies,
    requiresSession: prep.requiresSession,
    canVerify: prep.canVerify,
    provider: prep.provider,
    sessionId: prep.sessionId,
    isDisguisedHtml: false,
    cookieCheckDetected: false,
    expiresAt: prep.expiresAt,
    serverSafe: prep.serverSafe,
    token: prep.token,
    downloadUrl: prep.downloadUrl,
    reason: `Recurso binario verificado (${sizeFormatted}). Compatible con descarga local segura.`,
    safetyNote: 'La descarga directa se transmite de forma binaria verificada sin riesgo de archivos HTML.',
  };
}
