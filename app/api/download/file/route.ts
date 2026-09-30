import { NextRequest, NextResponse } from 'next/server';
import { consumeDownloadToken, getDownloadToken } from '@/lib/downloadTokenStore';
import { invalidateExtractionSession, terminateExtractionSession } from '@/lib/extractionSessionStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow long transfers for large files

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Encoding': 'identity',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, Origin, Cache-Control, User-Agent',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Disposition, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function HEAD(req: NextRequest) {
  return handleFileStreaming(req, true);
}

export async function GET(req: NextRequest) {
  return handleFileStreaming(req, false);
}

/**
 * Creates a stream that skips `skipBytes` bytes and optionally limits to `maxBytes`.
 * Operates purely on chunks in zero-RAM mode without buffering the file in server memory.
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

          // Skipping initial bytes
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

          // Beyond skip bytes: emit chunk
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

async function handleFileStreaming(req: NextRequest, isHeadOnly = false) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  // STRICT REQUIREMENT 10: Tokens must be used; direct open proxy via ?url= is prohibited
  if (!token) {
    return NextResponse.json(
      {
        error: 'MISSING_TOKEN',
        message: 'Se requiere un token de descarga temporal válido. El acceso directo por URL está deshabilitado.',
      },
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Retrieve token data (for HEAD, inspect without consuming; for GET, consume usage)
  const tokenData = isHeadOnly ? getDownloadToken(token) : consumeDownloadToken(token);

  if (!tokenData) {
    return NextResponse.json(
      {
        error: 'TOKEN_EXPIRED_OR_INVALID',
        message: 'El enlace de descarga ha expirado o no es válido. Por favor, solicita una nueva descarga.',
      },
      {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const { targetUrl, filename, contentType: expectedContentType } = tokenData;

  // Prepare origin request headers
  const originHeaders: Record<string, string> = {
    ...BROWSER_HEADERS,
    ...(tokenData.headers || {}),
  };

  if (targetUrl.includes('tiktok.com') || targetUrl.includes('tiktokcdn.com')) {
    originHeaders['Referer'] = 'https://www.tiktok.com/';
  } else if (targetUrl.includes('instagram.com') || targetUrl.includes('cdninstagram.com')) {
    originHeaders['Referer'] = 'https://www.instagram.com/';
    originHeaders['Origin'] = 'https://www.instagram.com';
  } else if (targetUrl.includes('twimg.com') || targetUrl.includes('twitter.com') || targetUrl.includes('x.com')) {
    originHeaders['Referer'] = 'https://x.com/';
    originHeaders['Origin'] = 'https://x.com';
  } else if (targetUrl.includes('facebook.com') || targetUrl.includes('fbcdn.net')) {
    originHeaders['Referer'] = 'https://www.facebook.com/';
    originHeaders['Origin'] = 'https://www.facebook.com';
    originHeaders['User-Agent'] = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
  } else if (targetUrl.includes('googlevideo.com') || targetUrl.includes('youtube.com')) {
    originHeaders['Referer'] = 'https://www.youtube.com/';
    originHeaders['Origin'] = 'https://www.youtube.com';
  } else if (targetUrl.includes('savenow.to') || targetUrl.includes('loader.to') || targetUrl.includes('affadaffa.com')) {
    originHeaders['Referer'] = 'https://loader.to/';
  } else if (targetUrl.includes('threads.net')) {
    originHeaders['Referer'] = 'https://www.threads.net/';
    originHeaders['Origin'] = 'https://www.threads.net';
  }

  // Parse incoming Range header from browser download manager
  const clientRange = req.headers.get('range');
  let requestedStart: number | undefined;
  let requestedEnd: number | undefined;

  if (clientRange) {
    const match = clientRange.match(/bytes=(\d+)-(\d+)?/i);
    if (match) {
      requestedStart = parseInt(match[1], 10);
      if (match[2]) requestedEnd = parseInt(match[2], 10);
      originHeaders['Range'] = clientRange;
    }
  }

  try {
    const remoteRes = await fetch(targetUrl, {
      method: isHeadOnly ? 'HEAD' : 'GET',
      headers: originHeaders,
      redirect: 'follow',
    });

    const remoteContentType = remoteRes.headers.get('content-type') || '';
    const lowerRemoteCt = remoteContentType.toLowerCase();

    // STRICT REQUIREMENT 5, 6, 11, 18:
    // If upstream returned an HTML page or JSON error, REJECT IMMEDIATELY.
    // NEVER attach Content-Disposition: attachment; filename="video.mp4" to an error!
    if (
      lowerRemoteCt.includes('text/html') ||
      lowerRemoteCt.includes('application/xhtml+xml') ||
      lowerRemoteCt.includes('application/json')
    ) {
      if (tokenData.sessionId) {
        invalidateExtractionSession(tokenData.sessionId);
      }
      console.warn('Download rejected: Upstream returned HTML/JSON instead of binary media', {
        downloadRejected: true,
        reason: 'UPSTREAM_RETURNED_HTML',
        expected: expectedContentType,
        received: remoteContentType,
      });

      return NextResponse.json(
        {
          error: 'MEDIA_RESOURCE_INVALID',
          message: 'The resolved source URL returned an HTML or error document instead of a valid binary media resource.',
        },
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!remoteRes.ok && remoteRes.status !== 206) {
      if (tokenData.sessionId && (remoteRes.status === 401 || remoteRes.status === 403)) {
        invalidateExtractionSession(tokenData.sessionId);
      }
      return NextResponse.json(
        {
          error: 'UPSTREAM_ERROR',
          message: `El servidor de medios respondió con código de error ${remoteRes.status}`,
        },
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Binary media confirmed! Format response headers
    const finalContentType =
      remoteContentType && !lowerRemoteCt.includes('text/')
        ? remoteContentType
        : expectedContentType || 'video/mp4';

    let finalFilename = filename || 'video.mp4';
    if (!finalFilename.includes('.')) {
      if (finalContentType.includes('video/mp4')) finalFilename += '.mp4';
      else if (finalContentType.includes('audio/mpeg') || finalContentType.includes('audio/mp3')) finalFilename += '.mp3';
      else if (finalContentType.includes('image/jpeg')) finalFilename += '.jpg';
      else if (finalContentType.includes('image/png')) finalFilename += '.png';
      else if (finalContentType.includes('image/webp')) finalFilename += '.webp';
    }

    // RFC 6266 + RFC 5987 standard Content-Disposition encoding
    const asciiFilename = finalFilename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    const encodedFilename = encodeURIComponent(finalFilename);

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
    outHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Disposition, Content-Type');

    const remoteContentLength = remoteRes.headers.get('content-length');
    const remoteContentRange = remoteRes.headers.get('content-range');

    let is206Response = remoteRes.status === 206;
    let responseBody = remoteRes.body;

    // Handle range request matching
    if (requestedStart !== undefined && requestedStart > 0) {
      if (is206Response && remoteContentRange) {
        outHeaders.set('Content-Range', remoteContentRange);
        if (remoteContentLength) outHeaders.set('Content-Length', remoteContentLength);
      } else if (remoteRes.status === 200 && responseBody) {
        // Upstream ignored Range header and returned full 200 body:
        // Slice stream chunk-by-chunk in zero-RAM mode and return 206 Partial Content
        const totalSize = remoteContentLength ? parseInt(remoteContentLength, 10) : undefined;
        const endByte = requestedEnd !== undefined ? requestedEnd : (totalSize ? totalSize - 1 : undefined);
        const maxBytesToEmit = endByte !== undefined ? endByte - requestedStart + 1 : undefined;

        responseBody = createRangeSliceStream(responseBody, requestedStart, maxBytesToEmit);
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

    if (isHeadOnly) {
      return new Response(null, {
        status: is206Response ? 206 : 200,
        headers: outHeaders,
      });
    }

    // Zero-RAM streaming: Directly stream to user device without loading into server memory
    return new Response(responseBody, {
      status: is206Response ? 206 : 200,
      headers: outHeaders,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error durante la transmisión binaria';
    console.error('File streaming error:', err);
    return NextResponse.json(
      {
        error: 'STREAMING_FAILED',
        message: msg,
      },
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
