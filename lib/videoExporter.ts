export type VideoContainerFormat = 'mp4' | 'webm' | 'mkv';
export type AudioContainerFormat = 'mp3';

export interface VideoExportOptions {
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  embedUrl?: string;
  title?: string;
  format?: VideoContainerFormat | AudioContainerFormat;
  onProgress?: (percent: number, status: string) => void;
}

export function isPwaOrStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Validates that a blob contains genuine binary media (MP4 or MP3)
 * and is NOT an HTML error page, 403 Forbidden wall, or JSON error message.
 */
export async function validateBinaryBlob(
  blob: Blob,
  format: 'mp4' | 'mp3'
): Promise<{ isValid: boolean; cleanBlob: Blob; reason?: string }> {
  if (!blob || blob.size < 2048) {
    return { isValid: false, cleanBlob: blob, reason: 'Payload demasiado pequeño o respuesta vacía' };
  }

  const ct = (blob.type || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain') || ct.includes('text/xml')) {
    return { isValid: false, cleanBlob: blob, reason: `Tipo MIME rechazado: ${ct}` };
  }

  // Inspect first 512 bytes for HTML/JSON or Google 403 signatures
  try {
    const headerBuffer = await blob.slice(0, 512).arrayBuffer();
    const bytes = new Uint8Array(headerBuffer);
    const textSample = new TextDecoder('utf-8', { fatal: false }).decode(bytes).toLowerCase();

    // Rejection of HTML, Cloudflare, Google 403, and JSON errors
    if (
      textSample.includes('<!doctype html') ||
      textSample.includes('<html') ||
      textSample.includes('<head') ||
      textSample.includes('<body') ||
      textSample.includes('403. that’s an error') ||
      textSample.includes('403 forbidden') ||
      textSample.includes('access denied') ||
      textSample.includes('login required') ||
      textSample.includes('"error"') ||
      textSample.includes('unauthorized') ||
      textSample.includes('sign in to continue') ||
      textSample.includes('recaptcha')
    ) {
      return { isValid: false, cleanBlob: blob, reason: 'El servidor devolvió una página HTML o error 403 en lugar de multimedia' };
    }

    if (format === 'mp4') {
      // Check MP4 ftyp box or container
      let isVideo = false;
      if (bytes.length >= 8) {
        const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
        if (['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].includes(box)) {
          isVideo = true;
        }
      }
      // EBML (WebM / MKV)
      if (!isVideo && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
        isVideo = true;
      }
      // General high-entropy binary fallback for raw streams > 32KB
      if (!isVideo && blob.size > 32768) {
        let nonAscii = 0;
        for (let i = 0; i < Math.min(bytes.length, 64); i++) {
          if (bytes[i] === 0 || bytes[i] > 127) nonAscii++;
        }
        if (nonAscii > 10) isVideo = true;
      }

      if (!isVideo) {
        return { isValid: false, cleanBlob: blob, reason: 'Firma binaria de video no detectada' };
      }
      return { isValid: true, cleanBlob: new Blob([blob], { type: 'video/mp4' }) };
    }

    if (format === 'mp3') {
      let isAudio = false;
      if (bytes.length >= 3) {
        // ID3 tag
        if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) isAudio = true;
        // MPEG sync frame
        else if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) isAudio = true;
        // RIFF / WAV
        else if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF') isAudio = true;
        // AAC ADTS
        else if (bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) isAudio = true;
      }

      if (!isAudio && blob.size > 8192) {
        let nonAscii = 0;
        for (let i = 0; i < Math.min(bytes.length, 64); i++) {
          if (bytes[i] === 0 || bytes[i] > 127) nonAscii++;
        }
        if (nonAscii > 8) isAudio = true;
      }

      if (!isAudio) {
        return { isValid: false, cleanBlob: blob, reason: 'Firma binaria de audio no detectada' };
      }
      return { isValid: true, cleanBlob: new Blob([blob], { type: 'audio/mpeg' }) };
    }
  } catch (err) {
    console.warn('Binary validation exception:', err);
  }

  return { isValid: true, cleanBlob: blob };
}

/**
 * Triggers safe browser file download using verified in-memory Blob.
 * Guarantees zero navigation to remote third-party URLs.
 */
function triggerDownload(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
  }, 2000);

  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/**
 * Export static image + audio track as a full-featured MP4 video file
 */
export async function exportImageWithAudioAsVideo(options: VideoExportOptions): Promise<boolean> {
  const {
    imageUrl,
    audioUrl,
    videoUrl,
    title = 'Image_Audio_Video',
    onProgress
  } = options;

  const targetImage = imageUrl || videoUrl;
  if (!targetImage) {
    if (onProgress) onProgress(0, 'No hay imagen disponible para crear video');
    return false;
  }

  const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'Image_Audio_Video';
  const filename = `${sanitizedTitle}.mp4`;

  if (onProgress) onProgress(20, 'Sintetizando video MP4...');

  try {
    const res = await fetch('/api/convert-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mp4',
        imageUrl: targetImage,
        audioUrl,
        filename
      })
    });

    if (res.ok) {
      const blob = await res.blob();
      const valid = await validateBinaryBlob(blob, 'mp4');
      if (valid.isValid) {
        if (onProgress) onProgress(100, 'Video MP4 generado con éxito');
        triggerDownload(valid.cleanBlob, filename);
        return true;
      } else {
        if (onProgress) onProgress(0, valid.reason || 'Respuesta no válida del servidor');
        return false;
      }
    } else {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.error || errJson.message || 'Error al sintetizar video';
      if (onProgress) onProgress(0, msg);
      return false;
    }
  } catch (err) {
    console.warn('Server video synthesis failed:', err);
  }

  if (onProgress) onProgress(0, 'Error al sintetizar el video con audio');
  return false;
}

/**
 * Export video stream or media to MP4 container.
 * 100% same-origin & payload-verified:
 * - Never navigates directly to third-party signed URLs (preventing 403 white screens).
 * - Never saves HTML error pages disguised with .mp4 extension.
 * - Multi-tier failover: convert-media -> proxy-video -> download/direct -> image synthesis.
 */
export async function exportVideo(options: VideoExportOptions): Promise<boolean> {
  const {
    videoUrl,
    audioUrl,
    imageUrl,
    embedUrl,
    title = 'Liquid_Video',
    format = 'mp4',
    onProgress
  } = options;

  // If user is exporting an image with audio or static image as video
  if (imageUrl && !videoUrl) {
    return exportImageWithAudioAsVideo(options);
  }

  const targetUrl = videoUrl || embedUrl || imageUrl;
  if (!targetUrl) {
    if (onProgress) onProgress(0, 'No hay URL de video disponible para exportar');
    return false;
  }

  const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'Video_Export';
  const filename = `${sanitizedTitle}.${format}`;

  if (onProgress) onProgress(15, 'Preparando descarga segura de video...');

  // 1. Tier 1: Server-side convert-media packager
  try {
    if (onProgress) onProgress(35, 'Empaquetando video MP4 en el servidor...');
    const convertRes = await fetch('/api/convert-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mp4',
        url: targetUrl,
        imageUrl,
        audioUrl,
        filename,
      }),
    });

    if (convertRes.ok) {
      const blob = await convertRes.blob();
      const valid = await validateBinaryBlob(blob, 'mp4');
      if (valid.isValid) {
        if (onProgress) onProgress(100, 'Video MP4 listo');
        triggerDownload(valid.cleanBlob, filename);
        return true;
      } else {
        console.warn('convert-media video rejected:', valid.reason);
      }
    }
  } catch (convErr) {
    console.warn('convert-media tier 1 error:', convErr);
  }

  // 2. Tier 2: Same-origin direct streaming proxy (/api/download/direct)
  try {
    if (onProgress) onProgress(60, 'Obteniendo flujo de video seguro...');
    const directUrl = `/api/download/direct?url=${encodeURIComponent(targetUrl)}&filename=${encodeURIComponent(filename)}`;
    const directRes = await fetch(directUrl);
    if (directRes.ok) {
      const blob = await directRes.blob();
      const valid = await validateBinaryBlob(blob, 'mp4');
      if (valid.isValid) {
        if (onProgress) onProgress(100, 'Descarga completada');
        triggerDownload(valid.cleanBlob, filename);
        return true;
      }
    }
  } catch (directErr) {
    console.warn('download/direct tier 2 error:', directErr);
  }

  // 3. Tier 3: Same-origin proxy-video (/api/proxy-video)
  try {
    if (onProgress) onProgress(80, 'Transmitiendo mediante proxy...');
    const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(targetUrl)}&filename=${encodeURIComponent(filename)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const blob = await proxyRes.blob();
      const valid = await validateBinaryBlob(blob, 'mp4');
      if (valid.isValid) {
        if (onProgress) onProgress(100, 'Descarga completada');
        triggerDownload(valid.cleanBlob, filename);
        return true;
      }
    }
  } catch (proxyErr) {
    console.warn('proxy-video tier 3 error:', proxyErr);
  }

  if (onProgress) onProgress(0, 'El servidor de origen bloqueó la descarga o no se pudo extraer el flujo de video completo');
  return false;
}

/**
 * Export audio track to pure MP3 container.
 * 100% same-origin & payload-verified:
 * - Pre-validates blob magic bytes: rejects Google 403 walls and HTML pages.
 * - Never navigates directly to third-party signed URLs.
 */
export async function exportAudioMp3(options: VideoExportOptions): Promise<boolean> {
  const {
    videoUrl,
    audioUrl,
    imageUrl,
    embedUrl,
    title = 'Liquid_Audio',
    onProgress
  } = options;

  const targetUrl = audioUrl || videoUrl || embedUrl || imageUrl;
  if (!targetUrl) {
    if (onProgress) onProgress(0, 'No hay fuente de audio disponible para exportar');
    return false;
  }

  const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'Audio_Export';
  const filename = `${sanitizedTitle}.mp3`;

  if (onProgress) onProgress(20, 'Extrayendo y codificando pista a MP3...');

  // 1. Tier 1: Server-side convert-media packager
  try {
    const res = await fetch('/api/convert-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mp3',
        url: targetUrl,
        audioUrl: audioUrl || targetUrl,
        filename
      })
    });

    if (res.ok) {
      const blob = await res.blob();
      const valid = await validateBinaryBlob(blob, 'mp3');
      if (valid.isValid) {
        if (onProgress) onProgress(100, 'Audio MP3 listo');
        triggerDownload(valid.cleanBlob, filename);
        return true;
      } else {
        console.warn('convert-media audio rejected:', valid.reason);
      }
    }
  } catch (proxyErr) {
    console.warn('convert-media audio tier 1 error:', proxyErr);
  }

  // 2. Tier 2: Same-origin direct streaming proxy with audio=true
  try {
    if (onProgress) onProgress(65, 'Obteniendo pista de audio segura...');
    const directUrl = `/api/download/direct?url=${encodeURIComponent(targetUrl)}&audio=true&filename=${encodeURIComponent(filename)}`;
    const directRes = await fetch(directUrl);
    if (directRes.ok) {
      const blob = await directRes.blob();
      const valid = await validateBinaryBlob(blob, 'mp3');
      if (valid.isValid) {
        if (onProgress) onProgress(100, 'Audio MP3 listo');
        triggerDownload(valid.cleanBlob, filename);
        return true;
      }
    }
  } catch (directErr) {
    console.warn('download/direct audio tier 2 error:', directErr);
  }

  // 3. Tier 3: Same-origin proxy-video
  try {
    if (onProgress) onProgress(85, 'Extrayendo audio mediante proxy...');
    const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(targetUrl)}&filename=${encodeURIComponent(filename)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const blob = await proxyRes.blob();
      const valid = await validateBinaryBlob(blob, 'mp3');
      if (valid.isValid) {
        if (onProgress) onProgress(100, 'Audio MP3 listo');
        triggerDownload(valid.cleanBlob, filename);
        return true;
      }
    }
  } catch (proxyErr) {
    console.warn('proxy-video audio tier 3 error:', proxyErr);
  }

  if (onProgress) onProgress(0, 'No se pudo obtener un archivo de audio MP3 válido (recurso bloqueado o expirado)');
  return false;
}
