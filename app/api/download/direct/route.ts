import { NextRequest, NextResponse } from 'next/server';
import { resolvePlatformToMediaStream, inspectBinaryMagicBytes } from '@/lib/downloadResolver';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow long transfers for large files

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Encoding': 'identity',
};

const ALLOWED_CDN_DOMAINS = [
  'googlevideo.com',
  'youtube.com',
  'youtu.be',
  'ytimg.com',
  'fbcdn.net',
  'facebook.com',
  'cdninstagram.com',
  'instagram.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktok.com',
  'twimg.com',
  'twitter.com',
  'x.com',
  'threads.net',
  'threads.com',
  'olympusxyz.com',
  'olympusbiblioteca.com',
  'imagesolymp.xyz',
  'manhwaweb.com',
  'railway.app',
  'cloudinary.com',
  'savenow.to',
  'loader.to',
  'affadaffa.com',
  'savefrom.net',
];

function isAllowedDomainOrMedia(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const isDomainAllowed = ALLOWED_CDN_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
    if (isDomainAllowed) return true;

    // Direct binary media extension
    const path = parsed.pathname.toLowerCase();
    if (/\.(mp4|webm|mkv|mov|mp3|m4a|aac|wav|ogg|jpg|jpeg|png|webp|gif|pdf)$/i.test(path)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// High-speed stream cache (prevents re-extracting URLs during multi-part or resumed downloads)
const resolvedStreamsCache = new Map<string, { streamUrl: string; timestamp: number }>();

function getCachedStream(url: string): string | undefined {
  const item = resolvedStreamsCache.get(url);
  if (item && Date.now() - item.timestamp < 30 * 60 * 1000) {
    return item.streamUrl;
  }
  return undefined;
}

function setCachedStream(url: string, streamUrl: string) {
  resolvedStreamsCache.set(url, { streamUrl, timestamp: Date.now() });
  // Prune cache if too big
  if (resolvedStreamsCache.size > 200) {
    const oldestKey = resolvedStreamsCache.keys().next().value;
    if (oldestKey) resolvedStreamsCache.delete(oldestKey);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, Origin, Cache-Control, User-Agent',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Disposition',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function HEAD(req: NextRequest) {
  return handleDirectDownload(req, true);
}

export async function GET(req: NextRequest) {
  return handleDirectDownload(req, false);
}

/**
 * Creates a stream that skips `skipBytes` bytes and optionally limits to `maxBytes`.
 */
function createRangeSliceStream(
  sourceStream: ReadableStream<any>,
  skipBytes: number,
  maxBytes?: number
): ReadableStream<any> {
  let bytesSkipped = 0;
  let bytesEmitted = 0;
  const reader = sourceStream.getReader();

  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          if (!value || value.length === 0) continue;

          if (bytesSkipped < skipBytes) {
            const neededToSkip = skipBytes - bytesSkipped;
            if (value.length <= neededToSkip) {
              bytesSkipped += value.length;
              continue;
            } else {
              const remaining = value.subarray(neededToSkip);
              bytesSkipped = skipBytes;

              let toEmit = remaining;
              if (maxBytes !== undefined) {
                const allowed = maxBytes - bytesEmitted;
                if (toEmit.length > allowed) {
                  toEmit = toEmit.subarray(0, allowed);
                }
              }
              bytesEmitted += toEmit.length;
              controller.enqueue(toEmit);

              if (maxBytes !== undefined && bytesEmitted >= maxBytes) {
                reader.cancel().catch(() => {});
                controller.close();
                return;
              }
              return;
            }
          }

          let toEmit = value;
          if (maxBytes !== undefined) {
            const allowed = maxBytes - bytesEmitted;
            if (toEmit.length > allowed) {
              toEmit = toEmit.subarray(0, allowed);
            }
          }
          bytesEmitted += toEmit.length;
          controller.enqueue(toEmit);

          if (maxBytes !== undefined && bytesEmitted >= maxBytes) {
            reader.cancel().catch(() => {});
            controller.close();
            return;
          }
          return;
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
}

async function handleDirectDownload(req: NextRequest, isHeadOnly = false) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');
  let filename = (searchParams.get('filename') || 'descarga_megiddo_ray.mp4').trim();
  const isAudioOnly = searchParams.get('audio') === 'true' || filename.endsWith('.mp3');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Falta parámetro url' }, { status: 400 });
  }

  // Prevent open proxy abuse
  if (!isAllowedDomainOrMedia(targetUrl)) {
    return NextResponse.json(
      { error: 'DOMAIN_NOT_ALLOWED', message: 'El dominio especificado no está autorizado para descarga directa.' },
      { status: 403 }
    );
  }

  try {
    let cleanUrl = targetUrl
      .replace(/&amp;/g, '&')
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .trim();

    // Check cached stream URL first
    let streamUrl = getCachedStream(cleanUrl) || cleanUrl;

    const isWebPage =
      cleanUrl.includes('youtube.com') ||
      cleanUrl.includes('youtu.be') ||
      cleanUrl.includes('tiktok.com') ||
      cleanUrl.includes('instagram.com') ||
      cleanUrl.includes('facebook.com') ||
      cleanUrl.includes('fb.watch') ||
      cleanUrl.includes('threads.net') ||
      cleanUrl.includes('twitter.com') ||
      cleanUrl.includes('x.com');

    const isDirectBinary =
      cleanUrl.includes('.mp4') ||
      cleanUrl.includes('.webm') ||
      cleanUrl.includes('.mp3') ||
      cleanUrl.includes('.m4a') ||
      cleanUrl.includes('googlevideo.com') ||
      cleanUrl.includes('fbcdn.net') ||
      cleanUrl.includes('cdninstagram.com') ||
      cleanUrl.includes('tiktokcdn.com') ||
      cleanUrl.includes('twimg.com');

    if (streamUrl === cleanUrl && isWebPage && !isDirectBinary) {
      try {
        const platStream = await resolvePlatformToMediaStream(cleanUrl, isAudioOnly ? 'audio' : 'video');
        if (platStream.streamUrl && platStream.streamUrl.startsWith('http') && !platStream.streamUrl.includes('youtube.com/watch') && !platStream.streamUrl.includes('youtu.be/')) {
          streamUrl = platStream.streamUrl;
          setCachedStream(cleanUrl, streamUrl);
        }
      } catch {
        // Fallback to cleanUrl
      }
    }

    const stillWebPage =
      streamUrl.includes('youtube.com/watch') ||
      streamUrl.includes('youtu.be/') ||
      streamUrl.includes('instagram.com/reel/') ||
      streamUrl.includes('instagram.com/p/') ||
      streamUrl.includes('tiktok.com/@');

    if (stillWebPage) {
      return NextResponse.json(
        {
          error: 'UPSTREAM_NOT_RESOLVED',
          message: 'No se pudo resolver un enlace de descarga binaria directa para este contenido.',
          details: 'Por favor, utiliza la opción de procesamiento interno para generar el archivo multimedia.',
        },
        { status: 422 }
      );
    }

    const headers: Record<string, string> = { ...BROWSER_HEADERS };

    if (streamUrl.includes('tiktokcdn') || streamUrl.includes('tiktok.com')) {
      headers['Referer'] = 'https://www.tiktok.com/';
    } else if (streamUrl.includes('cdninstagram') || streamUrl.includes('instagram.com')) {
      headers['Referer'] = 'https://www.instagram.com/';
    } else if (streamUrl.includes('fbcdn.net') || streamUrl.includes('facebook.com')) {
      headers['Referer'] = 'https://www.facebook.com/';
      headers['User-Agent'] = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
    } else if (streamUrl.includes('twimg.com') || streamUrl.includes('twitter.com') || streamUrl.includes('x.com')) {
      headers['Referer'] = 'https://twitter.com/';
    } else if (streamUrl.includes('googlevideo.com') || streamUrl.includes('youtube.com')) {
      headers['Referer'] = 'https://www.youtube.com/';
    } else if (streamUrl.includes('savenow.to') || streamUrl.includes('loader.to') || streamUrl.includes('affadaffa.com')) {
      headers['Referer'] = 'https://loader.to/';
    }

    // Pass Range header if client requested it
    const clientRange = req.headers.get('range');
    let requestedStart: number | undefined;
    let requestedEnd: number | undefined;

    if (clientRange) {
      const match = clientRange.match(/bytes=(\d+)-(\d+)?/i);
      if (match) {
        requestedStart = parseInt(match[1], 10);
        if (match[2]) {
          requestedEnd = parseInt(match[2], 10);
        }
        headers['Range'] = clientRange;
      }
    }

    let remoteRes = await fetch(streamUrl, {
      method: isHeadOnly ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
    });

    // Check if remote returned HTML error page instead of binary media
    let remoteContentType = remoteRes.headers.get('content-type') || '';
    if (remoteContentType.includes('text/html') || remoteContentType.includes('application/xhtml+xml') || remoteContentType.includes('application/json')) {
      // Re-resolve stream dynamically
      try {
        const fallbackResolved = await resolvePlatformToMediaStream(cleanUrl, isAudioOnly ? 'audio' : 'video');
        if (fallbackResolved.streamUrl && fallbackResolved.streamUrl !== streamUrl) {
          streamUrl = fallbackResolved.streamUrl;
          setCachedStream(cleanUrl, streamUrl);
          remoteRes = await fetch(streamUrl, {
            method: isHeadOnly ? 'HEAD' : 'GET',
            headers,
            redirect: 'follow',
          });
          remoteContentType = remoteRes.headers.get('content-type') || '';
        }
      } catch {}

      if (remoteContentType.includes('text/html') || remoteContentType.includes('application/xhtml+xml') || remoteContentType.includes('application/json')) {
        return NextResponse.json(
          {
            error: 'UPSTREAM_RETURNED_HTML',
            message: 'La URL proporcionada devolvió una página HTML en lugar del archivo multimedia.',
            details: 'Para descargar este contenido, intenta nuevamente o usa el procesamiento interno.',
          },
          { status: 422 }
        );
      }
    }

    if (!remoteRes.ok && remoteRes.status !== 206) {
      // If 403 / 410 (link expired), invalidate cache and retry once
      if (remoteRes.status === 403 || remoteRes.status === 410) {
        resolvedStreamsCache.delete(cleanUrl);
        try {
          const freshResolved = await resolvePlatformToMediaStream(cleanUrl, isAudioOnly ? 'audio' : 'video');
          if (freshResolved.streamUrl && freshResolved.streamUrl.startsWith('http')) {
            streamUrl = freshResolved.streamUrl;
            setCachedStream(cleanUrl, streamUrl);
            remoteRes = await fetch(streamUrl, {
              method: isHeadOnly ? 'HEAD' : 'GET',
              headers,
              redirect: 'follow',
            });
            remoteContentType = remoteRes.headers.get('content-type') || '';
          }
        } catch {}
      }

      if (!remoteRes.ok && remoteRes.status !== 206) {
        return NextResponse.json(
          {
            error: 'UPSTREAM_ERROR',
            message: `Servidor remoto respondió con código de error ${remoteRes.status}`,
          },
          { status: 422 }
        );
      }
    }

    if (isHeadOnly) {
      const finalContentType = remoteContentType || (filename.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4');
      const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
      const encodedFilename = encodeURIComponent(filename);

      const outHeaders = new Headers();
      outHeaders.set('Content-Type', finalContentType);
      outHeaders.set('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
      return new Response(null, { status: remoteRes.status === 206 ? 206 : 200, headers: outHeaders });
    }

    // STRICT PAYLOAD INSPECTION: Read the first chunk to verify genuine binary media
    const rawReader = remoteRes.body?.getReader();
    if (!rawReader) {
      return NextResponse.json({ error: 'EMPTY_BODY', message: 'Cuerpo de respuesta vacío' }, { status: 422 });
    }

    const firstRead = await rawReader.read();
    if (firstRead.done || !firstRead.value || firstRead.value.length === 0) {
      return NextResponse.json({ error: 'EMPTY_STREAM', message: 'Flujo de datos vacío' }, { status: 422 });
    }

    const firstChunk = firstRead.value;
    const magic = inspectBinaryMagicBytes(firstChunk, isAudioOnly ? 'audio' : 'video');

    if (magic.isHtml || magic.isJson || !magic.isBinary) {
      rawReader.cancel().catch(() => {});
      return NextResponse.json(
        {
          error: 'UPSTREAM_RETURNED_HTML',
          message: 'El servidor de medios devolvió una página HTML en lugar de un archivo multimedia binario.',
          details: 'Se rechazó la descarga para evitar guardar archivos HTML corruptos como video o audio.'
        },
        { status: 422 }
      );
    }

    const finalContentType = remoteContentType || (filename.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4');
    let remoteContentLength = remoteRes.headers.get('content-length');
    let remoteContentRange = remoteRes.headers.get('content-range');

    // Ensure correct extension on filename
    if (!filename.includes('.')) {
      if (finalContentType.includes('video/mp4')) filename += '.mp4';
      else if (finalContentType.includes('audio/mpeg') || finalContentType.includes('audio/mp3')) filename += '.mp3';
      else if (finalContentType.includes('image/jpeg')) filename += '.jpg';
      else if (finalContentType.includes('image/png')) filename += '.png';
      else if (finalContentType.includes('image/webp')) filename += '.webp';
    }

    // RFC 6266 + RFC 5987 standard Content-Disposition encoding
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    const encodedFilename = encodeURIComponent(filename);

    const outHeaders = new Headers();
    outHeaders.set('Content-Type', finalContentType);
    outHeaders.set(
      'Content-Disposition',
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    outHeaders.set('Cache-Control', 'public, max-age=86400, no-transform');
    outHeaders.set('Accept-Ranges', 'bytes');
    outHeaders.set('Access-Control-Allow-Origin', '*');
    outHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    outHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Origin, Cache-Control, User-Agent');
    outHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Disposition');

    let is206Response = remoteRes.status === 206;

    // Reconstruct readable stream starting with validated first chunk
    let replayedFirst = false;
    let streamSource = new ReadableStream({
      async pull(controller) {
        if (!replayedFirst) {
          replayedFirst = true;
          controller.enqueue(firstChunk);
          return;
        }
        try {
          const { done, value } = await rawReader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (err) {
          controller.error(err);
        }
      },
      cancel(reason) {
        return rawReader.cancel(reason);
      }
    });

    if (requestedStart !== undefined && requestedStart > 0) {
      if (is206Response && remoteContentRange) {
        outHeaders.set('Content-Range', remoteContentRange);
        if (remoteContentLength) outHeaders.set('Content-Length', remoteContentLength);
      } else if (remoteRes.status === 200) {
        const totalSize = remoteContentLength ? parseInt(remoteContentLength, 10) : undefined;
        const endByte = requestedEnd !== undefined ? requestedEnd : (totalSize ? totalSize - 1 : undefined);
        const maxBytesToEmit = endByte !== undefined ? (endByte - requestedStart + 1) : undefined;

        streamSource = createRangeSliceStream(streamSource, requestedStart, maxBytesToEmit);
        is206Response = true;

        if (totalSize) {
          const actualEnd = endByte !== undefined ? endByte : totalSize - 1;
          outHeaders.set('Content-Range', `bytes ${requestedStart}-${actualEnd}/${totalSize}`);
          outHeaders.set('Content-Length', String(actualEnd - requestedStart + 1));
        } else {
          outHeaders.set('Content-Range', `bytes ${requestedStart}-*/*`);
        }
      }
    } else {
      if (remoteContentLength) outHeaders.set('Content-Length', remoteContentLength);
      if (remoteContentRange) outHeaders.set('Content-Range', remoteContentRange);
    }

    return new Response(streamSource, {
      status: is206Response ? 206 : 200,
      headers: outHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Fallo en la descarga directa al dispositivo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
