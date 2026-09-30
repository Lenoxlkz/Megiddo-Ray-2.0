import { NextRequest, NextResponse } from 'next/server';
import {
  extractYouTubeMedia,
  extractFacebookMedia,
  extractInstagramMedia,
  extractTikTokMedia,
  extractTwitterMedia,
  extractThreadsMedia,
} from '@/lib/mediaExtractor';
import { inspectBinaryMagicBytes } from '@/lib/downloadResolver';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, Origin, User-Agent, Cache-Control',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function HEAD(req: NextRequest) {
  return handleProxyRequest(req, true);
}

export async function GET(req: NextRequest) {
  return handleProxyRequest(req, false);
}

/**
 * Creates a stream that skips `skipBytes` bytes and optionally limits to `maxBytes`.
 * Zero-RAM chunk slicing for Range support when origin ignores range.
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
              const sliced = value.subarray(neededToSkip);
              bytesSkipped = skipBytes;
              let toEmit = sliced;
              if (maxBytes !== undefined) {
                const remainingToEmit = maxBytes - bytesEmitted;
                if (sliced.length > remainingToEmit) {
                  toEmit = sliced.subarray(0, remainingToEmit);
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
            const remainingToEmit = maxBytes - bytesEmitted;
            if (value.length > remainingToEmit) {
              toEmit = value.subarray(0, remainingToEmit);
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
    },
  });
}

async function handleProxyRequest(req: NextRequest, isHeadOnly = false) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');
  const filename = searchParams.get('filename') || 'video.mp4';
  const isPreview = searchParams.get('preview') === 'true' || searchParams.get('preview') === '1';
  const isAudioOnly = !isPreview && (searchParams.get('audio') === 'true' || filename.endsWith('.mp3'));

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    let cleanUrl = targetUrl
      .replace(/&amp;/g, '&')
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/');

    // Check cached stream URL to prevent repeated resolution on every Range seek
    let streamUrl = getCachedStream(cleanUrl) || cleanUrl;

    if (streamUrl === cleanUrl) {
      if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
        const ytData = await extractYouTubeMedia(cleanUrl);
        if (isAudioOnly && ytData.audioUrl && ytData.audioUrl.startsWith('http')) {
          streamUrl = ytData.audioUrl;
          setCachedStream(cleanUrl, streamUrl);
        } else if (ytData.videoUrl && ytData.videoUrl.startsWith('http')) {
          streamUrl = ytData.videoUrl;
          setCachedStream(cleanUrl, streamUrl);
        }
      } else if (
        (cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch')) &&
        !cleanUrl.includes('fbcdn.net') &&
        !cleanUrl.includes('.mp4')
      ) {
        const fbData = await extractFacebookMedia(cleanUrl);
        if (fbData.videoUrl && fbData.videoUrl.startsWith('http')) {
          streamUrl = fbData.videoUrl;
          setCachedStream(cleanUrl, streamUrl);
        }
      } else if (
        (cleanUrl.includes('instagram.com') || cleanUrl.includes('instagr.am')) &&
        !cleanUrl.includes('cdninstagram.com') &&
        !cleanUrl.includes('.mp4') &&
        !cleanUrl.includes('rapidcdn.app')
      ) {
        const igData = await extractInstagramMedia(cleanUrl);
        if (igData.videoUrl && igData.videoUrl.startsWith('http')) {
          streamUrl = igData.videoUrl;
          setCachedStream(cleanUrl, streamUrl);
        }
      } else if (
        (cleanUrl.includes('threads.com') || cleanUrl.includes('threads.net')) &&
        !cleanUrl.includes('cdninstagram.com') &&
        !cleanUrl.includes('fbcdn.net') &&
        !cleanUrl.includes('.mp4')
      ) {
        const thData = await extractThreadsMedia(cleanUrl);
        if (thData.videoUrl && thData.videoUrl.startsWith('http')) {
          streamUrl = thData.videoUrl;
          setCachedStream(cleanUrl, streamUrl);
        }
      } else if (
        cleanUrl.includes('tiktok.com') &&
        !cleanUrl.includes('tiktokcdn.com') &&
        !cleanUrl.includes('.mp4')
      ) {
        const tkData = await extractTikTokMedia(cleanUrl);
        if (isAudioOnly && tkData.audioUrl && tkData.audioUrl.startsWith('http')) {
          streamUrl = tkData.audioUrl;
          setCachedStream(cleanUrl, streamUrl);
        } else if (tkData.videoUrl && tkData.videoUrl.startsWith('http')) {
          streamUrl = tkData.videoUrl;
          setCachedStream(cleanUrl, streamUrl);
        }
      } else if (
        (cleanUrl.includes('x.com') ||
          cleanUrl.includes('twitter.com') ||
          cleanUrl.includes('fxtwitter.com') ||
          cleanUrl.includes('vxtwitter.com') ||
          cleanUrl.includes('fixupx.com')) &&
        !cleanUrl.includes('twimg.com') &&
        !cleanUrl.includes('.mp4')
      ) {
        const twData = await extractTwitterMedia(cleanUrl);
        if (isAudioOnly && twData.audioUrl && twData.audioUrl.startsWith('http')) {
          streamUrl = twData.audioUrl;
          setCachedStream(cleanUrl, streamUrl);
        } else if (twData.videoUrl && twData.videoUrl.startsWith('http')) {
          streamUrl = twData.videoUrl;
          setCachedStream(cleanUrl, streamUrl);
        }
      }
    }

    const parsedUrl = new URL(streamUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
    }

    const headers: Record<string, string> = {
      'User-Agent':
        streamUrl.includes('fbcdn.net') || streamUrl.includes('facebook.com') || streamUrl.includes('cdninstagram.com')
          ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Encoding': 'identity',
    };

    if (streamUrl.includes('fbcdn.net') || streamUrl.includes('facebook.com')) {
      headers['Referer'] = 'https://www.facebook.com/';
      headers['Origin'] = 'https://www.facebook.com';
    } else if (streamUrl.includes('cdninstagram.com') || streamUrl.includes('instagram.com')) {
      headers['Referer'] = 'https://www.instagram.com/';
      headers['Origin'] = 'https://www.instagram.com';
    } else if (streamUrl.includes('tiktokcdn.com') || streamUrl.includes('tiktok.com')) {
      headers['Referer'] = 'https://www.tiktok.com/';
    } else if (streamUrl.includes('googlevideo.com') || streamUrl.includes('youtube.com')) {
      headers['Referer'] = 'https://www.youtube.com/';
      headers['Origin'] = 'https://www.youtube.com';
    } else if (streamUrl.includes('savenow.to') || streamUrl.includes('loader.to') || streamUrl.includes('affadaffa.com')) {
      headers['Referer'] = 'https://loader.to/';
    } else if (streamUrl.includes('twimg.com') || streamUrl.includes('twitter.com') || streamUrl.includes('x.com')) {
      headers['Referer'] = 'https://x.com/';
      headers['Origin'] = 'https://x.com';
    } else if (streamUrl.includes('threads.net') || streamUrl.includes('threads.com')) {
      headers['Referer'] = 'https://www.threads.net/';
      headers['Origin'] = 'https://www.threads.net';
    }

    const rangeHeader = req.headers.get('range');
    let requestedStart: number | undefined;
    let requestedEnd: number | undefined;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/i);
      if (match) {
        requestedStart = parseInt(match[1], 10);
        if (match[2]) requestedEnd = parseInt(match[2], 10);
        headers['Range'] = rangeHeader;
      }
    }

    let res = await fetch(streamUrl, {
      method: isHeadOnly ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
    });

    if (!res.ok && (streamUrl.includes('fbcdn.net') || streamUrl.includes('cdninstagram.com'))) {
      res = await fetch(streamUrl, {
        method: isHeadOnly ? 'HEAD' : 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 294.0.0.27.110',
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        },
        redirect: 'follow',
      });
    }

    // If stream URL was invalidated or returned 403, retry with fresh resolution
    if (!res.ok && res.status !== 206 && (res.status === 403 || res.status === 410)) {
      resolvedStreamsCache.delete(cleanUrl);
      if (cleanUrl !== streamUrl) {
        if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
          const fresh = await extractYouTubeMedia(cleanUrl);
          if (fresh.videoUrl) {
            streamUrl = fresh.videoUrl;
            setCachedStream(cleanUrl, streamUrl);
            res = await fetch(streamUrl, {
              method: isHeadOnly ? 'HEAD' : 'GET',
              headers,
              redirect: 'follow',
            });
          }
        }
      }
    }

    if (!res.ok && res.status !== 206) {
      return NextResponse.json(
        { error: `Remote video server responded with status ${res.status}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get('content-type') || '';

    // Validate that the remote response is not an error HTML webpage
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      return NextResponse.json(
        {
          error: 'The source URL returned a web page instead of a direct binary video stream.',
          contentType,
        },
        { status: 422 }
      );
    }

    const outContentType = contentType || (isAudioOnly ? 'audio/mpeg' : 'video/mp4');
    let finalFilename = filename;
    if (isAudioOnly && !finalFilename.endsWith('.mp3')) {
      finalFilename = finalFilename.replace(/\.[^/.]+$/, '') + '.mp3';
    }

    const asciiFilename = finalFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    const encodedFilename = encodeURIComponent(finalFilename);

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', outContentType);
    responseHeaders.set(
      'Content-Disposition',
      isPreview ? 'inline' : `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Origin, User-Agent, Cache-Control');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=86400, no-transform');

    const remoteContentRange = res.headers.get('content-range');
    const remoteContentLength = res.headers.get('content-length');

    let is206 = res.status === 206;

    if (isHeadOnly) {
      if (remoteContentLength) responseHeaders.set('Content-Length', remoteContentLength);
      if (remoteContentRange) responseHeaders.set('Content-Range', remoteContentRange);
      return new Response(null, {
        status: is206 ? 206 : 200,
        headers: responseHeaders,
      });
    }

    // Inspect first chunk to ensure not an HTML error wall
    const rawReader = res.body?.getReader();
    if (!rawReader) {
      return NextResponse.json({ error: 'EMPTY_PROXY_BODY', message: 'Flujo de proxy vacío' }, { status: 422 });
    }

    const firstRead = await rawReader.read();
    if (firstRead.done || !firstRead.value || firstRead.value.length === 0) {
      return NextResponse.json({ error: 'EMPTY_PROXY_STREAM', message: 'Flujo de proxy sin datos' }, { status: 422 });
    }

    const firstChunk = firstRead.value;
    const magic = inspectBinaryMagicBytes(firstChunk, isAudioOnly ? 'audio' : 'video');
    if (magic.isHtml || magic.isJson || !magic.isBinary) {
      rawReader.cancel().catch(() => {});
      return NextResponse.json(
        {
          error: 'UPSTREAM_RETURNED_HTML',
          message: 'El servidor de medios devolvió una página web o error en lugar de un flujo binario.',
        },
        { status: 422 }
      );
    }

    let replayedFirst = false;
    let bodyStream: ReadableStream<any> = new ReadableStream({
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
      },
    });

    if (requestedStart !== undefined && requestedStart > 0) {
      if (is206 && remoteContentRange) {
        responseHeaders.set('Content-Range', remoteContentRange);
        if (remoteContentLength) responseHeaders.set('Content-Length', remoteContentLength);
      } else if (res.status === 200) {
        const totalSize = remoteContentLength ? parseInt(remoteContentLength, 10) : undefined;
        const endByte = requestedEnd !== undefined ? requestedEnd : (totalSize ? totalSize - 1 : undefined);
        const maxBytesToEmit = endByte !== undefined ? (endByte - requestedStart + 1) : undefined;

        bodyStream = createRangeSliceStream(bodyStream, requestedStart, maxBytesToEmit);
        is206 = true;

        if (totalSize) {
          const actualEnd = endByte !== undefined ? endByte : totalSize - 1;
          responseHeaders.set('Content-Range', `bytes ${requestedStart}-${actualEnd}/${totalSize}`);
          responseHeaders.set('Content-Length', String(actualEnd - requestedStart + 1));
        } else {
          responseHeaders.set('Content-Range', `bytes ${requestedStart}-*/*`);
        }
      }
    } else {
      if (remoteContentLength) responseHeaders.set('Content-Length', remoteContentLength);
      if (remoteContentRange) responseHeaders.set('Content-Range', remoteContentRange);
    }

    return new Response(bodyStream, {
      status: is206 ? 206 : 200,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy fetch failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
