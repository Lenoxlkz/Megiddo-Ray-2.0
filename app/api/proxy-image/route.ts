import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Robust target URL extraction that preserves all query tokens (&oh=..., &_nc_sid=..., etc.)
  const rawUrl = req.url;
  const idx = rawUrl.indexOf('url=');
  let targetUrl = '';
  
  if (idx !== -1) {
    targetUrl = rawUrl.substring(idx + 4);
    // If it was percent-encoded, decode it safely
    try {
      if (targetUrl.includes('%3A%2F%2F') || targetUrl.includes('%2F') || targetUrl.includes('%26')) {
        targetUrl = decodeURIComponent(targetUrl);
      }
    } catch {
      // ignore
    }
  } else {
    const { searchParams } = new URL(req.url);
    targetUrl = searchParams.get('url') || '';
  }

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const cleanUrl = targetUrl
      .replace(/&amp;/g, '&')
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/');

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 });
    }

    const parsedUrl = new URL(cleanUrl);

    // Header strategy determination
    const isMetaUrl = cleanUrl.includes('fbsbx.com') || 
                      cleanUrl.includes('fbcdn.net') || 
                      cleanUrl.includes('facebook.com') || 
                      cleanUrl.includes('cdninstagram.com') || 
                      cleanUrl.includes('instagram.com');

    const headers: Record<string, string> = isMetaUrl ? {
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Accept': '*/*',
      'Referer': (cleanUrl.includes('instagram') || cleanUrl.includes('cdninstagram')) ? 'https://www.instagram.com/' : 'https://www.facebook.com/',
    } : {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    if (!isMetaUrl) {
      if (cleanUrl.includes('manhwaweb') || cleanUrl.includes('olympus')) {
        headers['Referer'] = parsedUrl.origin + '/';
      } else if (cleanUrl.includes('twimg.com') || cleanUrl.includes('x.com')) {
        headers['Referer'] = 'https://x.com/';
      } else if (cleanUrl.includes('pinterest.com') || cleanUrl.includes('pinimg.com')) {
        headers['Referer'] = 'https://www.pinterest.com/';
      }
    }

    let res = await fetch(cleanUrl, {
      headers,
      redirect: 'follow',
      next: { revalidate: 3600 }
    });

    let contentType = res.headers.get('content-type') || '';

    // Specific YouTube fallback to guaranteed hqdefault (prevents broken image in video player)
    if (!res.ok && (cleanUrl.includes('ytimg.com') || cleanUrl.includes('img.youtube.com') || cleanUrl.includes('youtube.com'))) {
      const videoIdMatch = cleanUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//) || cleanUrl.match(/(?:v=|vi\/)([a-zA-Z0-9_-]{11})/);
      if (videoIdMatch) {
        const vId = videoIdMatch[1];
        const hqUrl = `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
        const hqRes = await fetch(hqUrl, { headers, redirect: 'follow' });
        if (hqRes.ok) {
          res = hqRes;
          contentType = hqRes.headers.get('content-type') || 'image/jpeg';
        }
      }
    }

    // If initial response returned HTML error or failed, retry with Twitterbot / WhatsApp fallback
    if (!res.ok || contentType.includes('text/html')) {
      res = await fetch(cleanUrl, {
        headers: {
          'User-Agent': 'Twitterbot/1.0',
          'Accept': '*/*',
          'Referer': isMetaUrl ? (cleanUrl.includes('instagram') ? 'https://www.instagram.com/' : 'https://www.facebook.com/') : parsedUrl.origin + '/'
        },
        redirect: 'follow'
      });
      contentType = res.headers.get('content-type') || '';
    }

    // Secondary fallback: WhatsApp bot UA
    if (!res.ok || contentType.includes('text/html')) {
      res = await fetch(cleanUrl, {
        headers: {
          'User-Agent': 'WhatsApp/2.21.4.13 A',
          'Accept': '*/*'
        },
        redirect: 'follow'
      });
      contentType = res.headers.get('content-type') || '';
    }

    // Tertiary fallback: Mobile browser UA
    if (!res.ok || contentType.includes('text/html')) {
      res = await fetch(cleanUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          'Accept': 'image/*,*/*'
        },
        redirect: 'follow'
      });
      contentType = res.headers.get('content-type') || '';
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Remote server responded with ${res.status}` }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    if (buffer.byteLength < 500) {
      const previewText = new TextDecoder().decode(buffer.slice(0, 100));
      if (previewText.includes('<!DOCTYPE') || previewText.includes('<html') || previewText.includes('<script')) {
        return NextResponse.json({ error: 'Source returned HTML instead of image data' }, { status: 422 });
      }
    }

    const finalContentType = (contentType && !contentType.includes('text/html')) ? contentType : 'image/jpeg';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': finalContentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy fetch failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
