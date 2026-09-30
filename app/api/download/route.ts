import { NextRequest, NextResponse } from 'next/server';
import { extractYouTubeMedia, extractTikTokMedia, extractInstagramMedia, extractFacebookMedia, extractTwitterMedia, extractThreadsMedia } from '@/lib/mediaExtractor';
import { detectUrl, Category } from '@/lib/detector';

export const dynamic = 'force-dynamic';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
};

// Robust fetch with exponential backoff, jitter and extended timeout (Modo Espera / Servidor Lento)
async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 2, baseDelayMs = 1200, timeoutMs = 25000) {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // If server responds with 429 (Rate Limit) or 5xx server error, wait and retry
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(1.5, attempt) + Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      return res;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(1.5, attempt) + Math.random() * 600;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error(`Fetch failed after ${maxRetries} retries for ${url}`);
}

export async function POST(req: NextRequest) {
  try {
    let body: { url?: string; mode?: string; slowServerMode?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Valid JSON body is required' }, { status: 400 });
    }

    let rawUrl = (body.url || '').trim();
    if (!rawUrl) {
      return NextResponse.json({
        error: 'URL is required',
        errorCode: 'INVALID_URL',
        details: 'No se suministró ninguna dirección web'
      }, { status: 400 });
    }

    // Backend authoritative validation
    const detection = detectUrl(rawUrl);
    if (!detection.normalizedUrl) {
      return NextResponse.json({
        error: 'URL inválida o no permitida',
        errorCode: 'INVALID_URL',
        details: detection.reason
      }, { status: 400 });
    }

    let targetUrl = detection.normalizedUrl;

    const isSlowServer = Boolean(body.slowServerMode);
    const retryCount = isSlowServer ? 4 : 2;
    const baseDelay = isSlowServer ? 1800 : 1000;

    let images: string[] = [];
    let chapterName = '';
    let mediaType: 'image' | 'video' = 'image';
    let videoUrl = '';
    let audioUrl = '';
    let videoEmbedUrl = '';
    let author = '';

    // 0. Direct Image URL detection
    const isDirectImage = targetUrl.match(/\.(jpeg|jpg|png|webp|gif|avif)($|\?)/i) || targetUrl.includes('tiktokcdn');
    if (isDirectImage) {
      return NextResponse.json({
        success: true,
        chapterName: 'Foto',
        mediaType: 'image',
        images: [targetUrl]
      });
    }

    // 1. YouTube (Videos, Shorts, Audio)
    if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
      const ytData = await extractYouTubeMedia(targetUrl);
      return NextResponse.json({
        success: true,
        chapterName: ytData.chapterName,
        seriesTitle: ytData.seriesTitle,
        mediaType: ytData.mediaType,
        category: 'video',
        videoUrl: ytData.videoUrl,
        audioUrl: ytData.audioUrl,
        videoEmbedUrl: ytData.videoEmbedUrl,
        author: ytData.author,
        authorUrl: ytData.authorUrl,
        images: ytData.images
      });
    }

    // 2. TikTok (Videos, Clips, Photo Carousels)
    if (targetUrl.includes('tiktok.com') || targetUrl.includes('vm.tiktok.com')) {
      const tkData = await extractTikTokMedia(targetUrl);
      return NextResponse.json({
        success: true,
        chapterName: tkData.chapterName,
        seriesTitle: tkData.seriesTitle,
        category: tkData.mediaType,
        mediaType: tkData.mediaType,
        videoUrl: tkData.videoUrl,
        audioUrl: tkData.audioUrl,
        author: tkData.author,
        authorUrl: tkData.authorUrl,
        images: tkData.images
      });
    }

    // 3. Instagram (Posts, Reels, TV, Carousels, Threads)
    if (targetUrl.includes('instagram.com') || targetUrl.includes('instagr.am')) {
      const igData = await extractInstagramMedia(targetUrl);
      return NextResponse.json({
        success: true,
        chapterName: igData.chapterName,
        seriesTitle: igData.seriesTitle,
        category: igData.mediaType,
        mediaType: igData.mediaType,
        videoUrl: igData.videoUrl,
        author: igData.author,
        authorUrl: igData.authorUrl,
        images: igData.images
      });
    }

    // 3.1. Threads (threads.com, threads.net - Posts, Carousels, Videos)
    if (targetUrl.includes('threads.com') || targetUrl.includes('threads.net')) {
      const thData = await extractThreadsMedia(targetUrl);
      return NextResponse.json({
        success: true,
        chapterName: thData.chapterName,
        seriesTitle: thData.seriesTitle,
        category: thData.mediaType,
        mediaType: thData.mediaType,
        videoUrl: thData.videoUrl,
        audioUrl: thData.audioUrl,
        author: thData.author,
        authorUrl: thData.authorUrl,
        images: thData.images
      });
    }

    // 3.5. Facebook (Posts, Videos, Photos, Reels)
    if (targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fb.com')) {
      const fbData = await extractFacebookMedia(targetUrl);
      return NextResponse.json({
        success: true,
        chapterName: fbData.chapterName,
        seriesTitle: fbData.seriesTitle,
        category: fbData.mediaType,
        mediaType: fbData.mediaType,
        videoUrl: fbData.videoUrl,
        author: fbData.author,
        images: fbData.images
      });
    }

    // 3.6. X / Twitter (Posts, Videos, Photos, GIFs)
    if (
      targetUrl.includes('x.com') ||
      targetUrl.includes('twitter.com') ||
      targetUrl.includes('fxtwitter.com') ||
      targetUrl.includes('vxtwitter.com') ||
      targetUrl.includes('fixupx.com')
    ) {
      const twData = await extractTwitterMedia(targetUrl);
      return NextResponse.json({
        success: true,
        chapterName: twData.chapterName,
        seriesTitle: twData.seriesTitle,
        category: twData.mediaType,
        mediaType: twData.mediaType,
        videoUrl: twData.videoUrl,
        audioUrl: twData.audioUrl,
        videoEmbedUrl: twData.videoEmbedUrl,
        author: twData.author,
        authorUrl: twData.authorUrl,
        images: twData.images
      });
    }

    // 4. ManhwaWeb
    if (targetUrl.includes('manhwaweb.com') || targetUrl.includes('manhwawebbackend')) {
      const manhwaLeerMatch = targetUrl.match(/\/leer\/([^/?#]+)/i);
      if (manhwaLeerMatch) {
        const chapterSlug = manhwaLeerMatch[1];
        try {
          const chRes = await fetchWithRetry(`https://manhwawebbackend-production.up.railway.app/chapters/see/${chapterSlug}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://manhwaweb.com/',
              'Origin': 'https://manhwaweb.com'
            }
          }, retryCount, baseDelay);
          if (chRes.ok) {
            const chData = await chRes.json();
            chapterName = chData.name ? (chData.name.toLowerCase().includes('cap') ? chData.name : `Capítulo ${chData.name}`) : `Capítulo ${chapterSlug}`;
            const chImgs = chData.images || chData.pages || chData.chapter_images || [];
            if (Array.isArray(chImgs)) {
              for (const img of chImgs) {
                const src = typeof img === 'string' ? img : (img?.url || img?.src || '');
                if (src && src.startsWith('http')) images.push(src);
              }
            }
            if (images.length > 0) {
              return NextResponse.json({
                success: true,
                chapterName,
                mediaType: 'image',
                images
              });
            }
          }
        } catch (mwErr) {
          console.warn('ManhwaWeb download error:', mwErr);
        }
      }
    }

    // 5. Olympus Scanlation / Olympus Biblioteca (Nuxt 3 SSR + Panel API Fallback)
    if (targetUrl.includes('olympusxyz') || targetUrl.includes('olympusbiblioteca') || targetUrl.includes('imagesolymp')) {
      try {
        const htmlRes = await fetchWithRetry(targetUrl, {
          headers: {
            ...BROWSER_HEADERS,
            'Referer': 'https://olympusxyz.com/'
          }
        }, retryCount, baseDelay, 30000);

        if (htmlRes.ok) {
          const html = await htmlRes.text();

          // Extract Title
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          if (titleMatch) {
            chapterName = titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s*[-|–—|].*Olympus.*$/i, '').trim();
          }

          // Parse Nuxt 3 Data
          const nuxtMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
          if (nuxtMatch) {
            try {
              const nuxtParsed = JSON.parse(nuxtMatch[1]);
              if (Array.isArray(nuxtParsed)) {
                const chMatch = targetUrl.match(/capitulo\/([0-9]+)/i);
                const chId = chMatch ? chMatch[1] : '';

                const candidateImgs: string[] = [];
                for (const item of nuxtParsed) {
                  if (typeof item === 'string' && (item.includes('imagesolymp.xyz') || item.includes('/comics/'))) {
                    // Extract clean URL (strip srcset descriptors like " 768w")
                    let clean = item.split(' ')[0].trim();
                    if (clean.startsWith('//')) clean = `https:${clean}`;
                    if (clean.startsWith('/')) clean = `https://media.imagesolymp.xyz${clean}`;

                    // Filter out UI covers, teams, banners, logos
                    const lower = clean.toLowerCase();
                    const isUI = lower.includes('/covers/') || lower.includes('/teams/') || lower.includes('/banners/') || lower.includes('logo') || lower.endsWith('.svg');
                    
                    if (!isUI && clean.startsWith('http') && !candidateImgs.includes(clean)) {
                      // Prefer images specifically belonging to this chapter if chapter ID is in path
                      if (!chId || clean.includes(`/${chId}/`) || clean.includes(`/${chId}_`) || !clean.includes('/comics/')) {
                        candidateImgs.push(clean);
                      } else if (candidateImgs.length === 0) {
                        candidateImgs.push(clean);
                      }
                    }
                  }
                }

                if (candidateImgs.length > 0) {
                  images = candidateImgs;
                }
              }
            } catch (nuxtErr) {
              console.warn('Olympus Nuxt parsing error:', nuxtErr);
            }
          }

          // Fallback: search raw HTML for media.imagesolymp or manga readers
          if (images.length === 0) {
            const rawRegex = /(https?:\/\/[^"'\s<>]+\.(?:webp|jpg|jpeg|png)(?:\?[^"'\s<>]*)?)/gi;
            let rm;
            const seen = new Set<string>();
            while ((rm = rawRegex.exec(html)) !== null) {
              const src = rm[1];
              const lower = src.toLowerCase();
              if (
                lower.includes('imagesolymp') &&
                !lower.includes('covers') &&
                !lower.includes('logo') &&
                !seen.has(src)
              ) {
                seen.add(src);
                images.push(src);
              }
            }
          }

          if (images.length > 0) {
            return NextResponse.json({
              success: true,
              chapterName: chapterName || 'Capítulo',
              mediaType: 'image',
              images
            });
          }
        }
      } catch (olympErr) {
        console.warn('Olympus Nuxt scraper error, trying panel fallback:', olympErr);
      }

      // Secondary fallback to panel API if HTML was blocked
      const chMatch = targetUrl.match(/capitulo\/([0-9]+)/i);
      if (chMatch) {
        const chId = chMatch[1];
        try {
          const chRes = await fetchWithRetry(`https://panel.olympusxyz.com/api/chapter/${chId}`, {
            headers: {
              ...BROWSER_HEADERS,
              'Referer': 'https://olympusxyz.com/',
              'Origin': 'https://olympusxyz.com'
            }
          }, retryCount, baseDelay, 25000);
          if (chRes.ok) {
            const chJson = await chRes.json();
            const chData = chJson.data || chJson.chapter || chJson;
            chapterName = chData.name ? `Capítulo ${chData.name}` : `Capítulo ${chId}`;
            const rawPages = chData.pages || chData.images || chData.chapter_images || [];
            if (Array.isArray(rawPages)) {
              for (const page of rawPages) {
                const src = typeof page === 'string' ? page : (page?.url || page?.src || page?.page_url || '');
                if (src && src.startsWith('http')) {
                  images.push(src);
                }
              }
            }
            if (images.length > 0) {
              return NextResponse.json({
                success: true,
                chapterName,
                mediaType: 'image',
                images
              });
            }
          }
        } catch (panelErr) {
          console.warn('Olympus panel fallback error:', panelErr);
        }
      }
    }

    // 6. Generic HTML page scraping (Capibara, ImperioManhua, Webtoons, MangaDex, etc.)
    try {
      const htmlRes = await fetchWithRetry(targetUrl, {
        headers: BROWSER_HEADERS
      }, retryCount, baseDelay, 25000);

      if (htmlRes.ok) {
        const html = await htmlRes.text();
        
        // Extract Title / Chapter Heading
        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch) {
          chapterName = titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s*[-|–—].*$/, '');
        }

        // Look for Manga reader image containers (data-src, data-lazy-src, src, srcset)
        const imgTagRegex = /<img[^>]+(?:data-src|data-lazy-src|data-original|data-url|src)=["']([^"'\s>]+)["'][^>]*>/gi;
        let match;
        const seenUrls = new Set<string>();

        while ((match = imgTagRegex.exec(html)) !== null) {
          let src = match[1].trim();
          if (src.startsWith('//')) src = `https:${src}`;
          else if (src.startsWith('/')) {
            const urlObj = new URL(targetUrl);
            src = `${urlObj.origin}${src}`;
          }

          // Filter out tracking pixels, icons, ads, logos
          const lower = src.toLowerCase();
          const isJunk = 
            lower.includes('avatar') || 
            lower.includes('logo') || 
            lower.includes('icon') || 
            lower.includes('banner') || 
            lower.includes('advert') || 
            lower.includes('widget') ||
            lower.includes('emoji') ||
            lower.includes('tracker') ||
            lower.endsWith('.svg') ||
            lower.endsWith('.gif');

          if (src.startsWith('http') && !isJunk && !seenUrls.has(src)) {
            seenUrls.add(src);
            images.push(src);
          }
        }

        // Also check for JSON image arrays in scripts
        const scriptJsonMatches = [...html.matchAll(/(\[[\s\S]*?https?:\/\/[^"'\s\]]+\.(?:webp|jpg|jpeg|png)[\s\S]*?\])/gi)];
        for (const sjm of scriptJsonMatches) {
          try {
            const parsed = JSON.parse(sjm[1]);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                const s = typeof item === 'string' ? item : (item?.src || item?.url || '');
                if (typeof s === 'string' && s.startsWith('http') && !seenUrls.has(s)) {
                  seenUrls.add(s);
                  images.push(s);
                }
              }
            }
          } catch {
            // Not valid JSON array, continue
          }
        }
      }
    } catch (scrapeErr) {
      console.warn('Generic chapter scraper warning:', scrapeErr);
    }

    return NextResponse.json({
      success: true,
      chapterName: chapterName || 'Capítulo',
      mediaType: mediaType || 'image',
      videoUrl,
      videoEmbedUrl,
      author,
      images
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Download API Error:', error);
    return NextResponse.json({ error: 'Failed to process chapter download', details: errorMessage }, { status: 500 });
  }
}
