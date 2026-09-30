import path from 'path';
import fs from 'fs';

export interface ExtractedMedia {
  success: boolean;
  chapterName: string;
  seriesTitle?: string;
  mediaType: 'image' | 'video' | 'image_with_audio' | 'audio';
  videoUrl?: string;
  audioUrl?: string;
  videoEmbedUrl?: string;
  hasAudio?: boolean;
  author?: string;
  authorUrl?: string;
  images: string[];
  duration?: number;
  filesize?: number;
  resolution?: string;
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
};

const FB_BOT_HEADERS: Record<string, string> = {
  'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

const TWITTER_BOT_HEADERS: Record<string, string> = {
  'User-Agent': 'Twitterbot/1.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

export function cleanEscapeChars(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/\\\//g, '/')
    .replace(/\\u00252F/gi, '/')
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

let btchInstance: any = null;
async function getBtch() {
  if (!btchInstance) {
    try {
      const mod = await import('btch-downloader');
      btchInstance = mod.default || mod;
    } catch (e) {
      console.warn('Failed to load btch-downloader:', e);
    }
  }
  return btchInstance;
}

export interface YtDlpMetadataResult {
  title?: string;
  url?: string;
  audioUrl?: string;
  thumbnail?: string;
  author?: string;
  duration?: number;
  resolution?: string;
  filesize?: number;
  format?: string;
}

const ytDlpCache = new Map<string, { data: YtDlpMetadataResult; timestamp: number }>();

export function getYtDlpExecutablePath(): string {
  const localBinary = path.join(process.cwd(), 'yt-dlp');
  if (fs.existsSync(localBinary)) {
    try {
      fs.chmodSync(localBinary, 0o755);
    } catch {}
    return localBinary;
  }
  return 'yt-dlp';
}

// Helper to execute yt-dlp safely with timeout and high-speed in-memory caching
export async function runYtDlpMetadata(url: string): Promise<YtDlpMetadataResult> {
  const cached = ytDlpCache.get(url);
  if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
    return cached.data;
  }

  try {
    const { execFile } = await import('child_process');
    const binary = getYtDlpExecutablePath();
    // Ultra-optimized flags: no playlist, skip download, best single mp4 format, avoid subtitle/comment extraction
    const args = [
      '-j',
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      '--no-check-certificates',
      '--prefer-free-formats',
      '-f',
      'b/best[ext=mp4]/best',
      url
    ];

    return new Promise((resolve) => {
      let resolved = false;

      const child = execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (resolved) return;
        clearTimeout(timer);
        resolved = true;
        if (err || !stdout) return resolve({});
        try {
          const rawStr = stdout.toString();
          const jsonStart = rawStr.indexOf('{');
          const jsonEnd = rawStr.lastIndexOf('}');
          if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
            return resolve({});
          }

          const d = JSON.parse(rawStr.substring(jsonStart, jsonEnd + 1));
          const formats: any[] = Array.isArray(d.formats) ? d.formats : [];

          let directUrl = d.url;
          if (!directUrl && formats.length > 0) {
            // Priority 1: MP4 with both audio and video
            const mp4Combined = formats.find((f: any) => f.ext === 'mp4' && f.acodec !== 'none' && f.vcodec !== 'none' && f.url);
            // Priority 2: Any combined video+audio
            const anyCombined = formats.find((f: any) => f.acodec !== 'none' && f.vcodec !== 'none' && f.url);
            // Priority 3: Best MP4 with url
            const mp4Any = formats.filter((f: any) => f.ext === 'mp4' && f.url).pop();
            // Priority 4: Any format with url
            const anyWithUrl = formats.filter((f: any) => f.url).pop();

            directUrl = mp4Combined?.url || anyCombined?.url || mp4Any?.url || anyWithUrl?.url || formats[0]?.url;
          }

          let directAudio = undefined;
          if (formats.length > 0) {
            const audioOnly = formats.find((f: any) => f.vcodec === 'none' && f.acodec !== 'none' && f.url);
            if (audioOnly?.url) directAudio = audioOnly.url;
          }

          const bestFormat = formats.length > 0 ? formats[formats.length - 1] : undefined;

          // Resolve accurate filesize
          let filesize: number | undefined = d.filesize || d.filesize_approx;
          if (!filesize && formats.length > 0) {
            const formatsWithSize = formats.filter((f: any) => f.filesize || f.filesize_approx);
            if (formatsWithSize.length > 0) {
              const bestWithSize = formatsWithSize[formatsWithSize.length - 1];
              filesize = bestWithSize.filesize || bestWithSize.filesize_approx;
            }
          }

          // If still missing, compute heuristic size from duration (~350 KB/s for 720p HD)
          if (!filesize && typeof d.duration === 'number' && d.duration > 0) {
            filesize = Math.round(d.duration * 350 * 1024);
          }

          const resolution = d.resolution || (d.width && d.height ? `${d.width}x${d.height}` : undefined);

          const result: YtDlpMetadataResult = {
            title: d.title,
            url: directUrl,
            audioUrl: directAudio,
            thumbnail: d.thumbnail,
            author: d.uploader || d.channel || d.creator,
            duration: typeof d.duration === 'number' ? d.duration : undefined,
            resolution,
            filesize: typeof filesize === 'number' ? filesize : undefined,
            format: d.ext || 'mp4',
          };

          if (result.title || result.url) {
            ytDlpCache.set(url, { data: result, timestamp: Date.now() });
          }

          resolve(result);
        } catch {
          resolve({});
        }
      });

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            child.kill('SIGKILL');
          } catch (e) {
            // Ignore kill errors
          }
          resolve({});
        }
      }, 10000);
    });
  } catch {
    return {};
  }
}

function parseIsoDuration(isoStr?: string): number | undefined {
  if (!isoStr) return undefined;
  const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return undefined;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Dedicated high-speed YouTube stream resolver via Loader/Savenow network.
 * Bypasses datacenter IP blocks, supports full-length HD MP4 and 320kbps MP3.
 */
async function extractLoaderMediaStream(
  urlOrId: string,
  format: '720' | '1080' | '360' | 'mp3' = '720'
): Promise<{ url?: string; title?: string } | undefined> {
  const cleanUrl = urlOrId.startsWith('http')
    ? urlOrId
    : `https://www.youtube.com/watch?v=${urlOrId}`;

  try {
    const initRes = await fetch(
      `https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(cleanUrl)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!initRes.ok) return undefined;
    const initData = await initRes.json().catch(() => null);
    if (!initData || !initData.id) return undefined;

    const id = initData.id;
    const title = initData.title || undefined;
    const progressUrl = initData.progress_url || `https://loader.to/ajax/progress.php?id=${id}`;

    // Poll for ready state (max 10 iterations * 1.5s = 15s)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const pRes = await fetch(progressUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (pRes.ok) {
          const pData = await pRes.json().catch(() => null);
          if (pData?.success === 1 && pData.download_url && pData.download_url.startsWith('http')) {
            return {
              url: pData.download_url,
              title: title || pData.title,
            };
          }
          if (pData?.success === 0 && pData.text && pData.text.toLowerCase().includes('error')) {
            return undefined;
          }
        }
      } catch {
        // Continue polling
      }
    }
  } catch (err) {
    console.warn('Loader engine error for format', format, err);
  }
  return undefined;
}

/**
 * 1. YOUTUBE EXTRACTOR (Videos, Shorts, Live, Audio)
 */
export async function extractYouTubeMedia(targetUrl: string): Promise<ExtractedMedia> {
  const ytVideoIdMatch = targetUrl.match(/(?:v=|shorts\/|youtu\.be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/i);
  const videoId = ytVideoIdMatch ? ytVideoIdMatch[1] : '';
  const isShort = targetUrl.includes('/shorts/');
  const cleanWatchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : targetUrl;

  let chapterName = isShort ? `YouTube Short (${videoId})` : `YouTube Video (${videoId})`;
  let videoUrl = '';
  let audioUrl = '';
  let videoEmbedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : '';
  let author = '';
  const images: string[] = [];
  let duration: number | undefined = undefined;
  let filesize: number | undefined = undefined;
  let resolution: string | undefined = undefined;

  if (videoId) {
    images.push(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
    images.push(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);
    images.push(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
  }

  // Fetch oEmbed for accurate Title & Author
  if (videoId) {
    try {
      const oeRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
        headers: BROWSER_HEADERS,
        next: { revalidate: 3600 }
      });
      if (oeRes.ok) {
        const oeData = await oeRes.json();
        if (oeData.title) chapterName = oeData.title;
        if (oeData.author_name) author = oeData.author_name;
      }
    } catch {
      // Ignore oEmbed failure
    }
  }

  // Fetch Watch Page HTML for accurate duration
  if (videoId) {
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(2500)
      });
      if (pageRes.ok) {
        const pageHtml = await pageRes.text();
        const durMatch =
          pageHtml.match(/itemprop="duration"\s+content="([^"]+)"/i) ||
          pageHtml.match(/"approxDurationMs":"(\d+)"/i);
        if (durMatch) {
          if (durMatch[1].startsWith('PT')) {
            duration = parseIsoDuration(durMatch[1]);
          } else if (!isNaN(Number(durMatch[1]))) {
            duration = Math.round(Number(durMatch[1]) / 1000);
          }
        }
        if (!chapterName || chapterName.startsWith('YouTube Video (')) {
          const titleMatch = pageHtml.match(/<title>([\s\S]*?) - YouTube<\/title>/i) || pageHtml.match(/<title>([\s\S]*?)<\/title>/i);
          if (titleMatch) chapterName = titleMatch[1].trim();
        }
      }
    } catch {
      // Ignore
    }
  }

  // Tier 1: Dedicated High-Speed Stream Resolver (Loader & Savenow Engine)
  // Extracts full-length, unthrottled 720p/1080p MP4 & 320kbps MP3 streams
  try {
    const [streamVideo, streamAudio] = await Promise.all([
      extractLoaderMediaStream(cleanWatchUrl, '720'),
      extractLoaderMediaStream(cleanWatchUrl, 'mp3')
    ]);

    if (streamVideo?.url) {
      videoUrl = streamVideo.url;
      resolution = '1280x720';
      if (streamVideo.title && (!chapterName || chapterName.startsWith('YouTube Video ('))) {
        chapterName = streamVideo.title;
      }
    }

    if (streamAudio?.url) {
      audioUrl = streamAudio.url;
    }
  } catch (loaderErr) {
    console.warn('Loader engine extraction warning:', loaderErr);
  }

  if (duration && duration > 0) {
    filesize = Math.round(duration * 175 * 1024);
  } else if (videoUrl) {
    filesize = 35 * 1024 * 1024;
  }

  // Tier 1: Try btch-downloader for direct MP4 & MP3 links
  try {
    const btch = await getBtch();
    if (btch && typeof btch.youtube === 'function') {
      const ytResult = await Promise.race([
        btch.youtube(cleanWatchUrl).catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve({ _timeout: true }), 6000))
      ]);
      if (ytResult && typeof ytResult === 'object' && !('_timeout' in ytResult)) {
        if (ytResult.title && !chapterName.includes(ytResult.title)) chapterName = ytResult.title;
        if (ytResult.author && !author) author = ytResult.author;
        if (ytResult.thumbnail && !images.includes(ytResult.thumbnail)) images.unshift(ytResult.thumbnail);
        if (ytResult.mp4 && typeof ytResult.mp4 === 'string' && ytResult.mp4.startsWith('http') && !videoUrl) {
          videoUrl = ytResult.mp4;
        }
        if (ytResult.mp3 && typeof ytResult.mp3 === 'string' && ytResult.mp3.startsWith('http') && !audioUrl) {
          audioUrl = ytResult.mp3;
        }
      }
    }
  } catch (btchErr: any) {
    console.warn('btch.youtube extraction warning:', btchErr?.message || String(btchErr));
  }

  // Tier 2: Try yt-dlp CLI runner
  try {
    const ytdlpData = await runYtDlpMetadata(cleanWatchUrl);
    if (ytdlpData.title && (!chapterName || chapterName.startsWith('YouTube'))) chapterName = ytdlpData.title;
    if (ytdlpData.author && !author) author = ytdlpData.author;
    if (ytdlpData.thumbnail && !images.includes(ytdlpData.thumbnail)) {
      if (ytdlpData.thumbnail.includes('maxresdefault')) {
        images.push(ytdlpData.thumbnail);
      } else {
        images.unshift(ytdlpData.thumbnail);
      }
    }
    if (ytdlpData.url && !videoUrl) videoUrl = ytdlpData.url;
    if (ytdlpData.audioUrl && !audioUrl) audioUrl = ytdlpData.audioUrl;
    if (ytdlpData.duration) duration = ytdlpData.duration;
    if (ytdlpData.filesize) filesize = ytdlpData.filesize;
    if (ytdlpData.resolution) resolution = ytdlpData.resolution;
  } catch {
    // Ignore yt-dlp error
  }

  // Tier 3: Invidious API instance fallback
  if ((!videoUrl || !audioUrl) && videoId) {
    const invidiousInstances = [
      'https://inv.nadeko.net',
      'https://invidious.nerdvpn.de',
      'https://invidious.private.coffee',
      'https://invidious.jing.rocks'
    ];

    for (const inst of invidiousInstances) {
      try {
        const invRes = await fetch(`${inst}/api/v1/videos/${videoId}`, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(3500)
        });
        if (invRes.ok) {
          const invData = await invRes.json();
          if (invData.title && (!chapterName || chapterName.startsWith('YouTube'))) {
            chapterName = invData.title;
          }
          if (invData.author && !author) author = invData.author;

          // Find best MP4 stream
          if (!videoUrl && Array.isArray(invData.formatStreams)) {
            const mp4Streams = invData.formatStreams.filter((f: any) => f.container === 'mp4' || f.type?.includes('mp4'));
            if (mp4Streams.length > 0) {
              const bestMp4 = mp4Streams.find((f: any) => f.qualityLabel === '720p') || mp4Streams[0];
              if (bestMp4?.url) {
                videoUrl = bestMp4.url.startsWith('http') ? bestMp4.url : `${inst}${bestMp4.url}`;
              }
            }
          }

          // Find best Audio stream
          if (!audioUrl && Array.isArray(invData.adaptiveFormats)) {
            const audioStreams = invData.adaptiveFormats.filter((f: any) => f.type?.includes('audio'));
            if (audioStreams.length > 0) {
              const bestAudio = audioStreams[0];
              if (bestAudio?.url) {
                audioUrl = bestAudio.url.startsWith('http') ? bestAudio.url : `${inst}${bestAudio.url}`;
              }
            }
          }

          if (videoUrl) break;
        }
      } catch {
        // Try next instance
      }
    }
  }

  return {
    success: true,
    chapterName: chapterName || `YouTube ${videoId}`,
    seriesTitle: author ? `${author} (YouTube)` : 'YouTube',
    mediaType: 'video',
    videoUrl: videoUrl || undefined,
    audioUrl: audioUrl || undefined,
    videoEmbedUrl,
    author,
    authorUrl: author ? `https://www.youtube.com/@${author.replace(/\s+/g, '')}` : undefined,
    images: images.filter(Boolean),
    duration,
    filesize,
    resolution,
  };
}

/**
 * 2. FACEBOOK EXTRACTOR (Videos, Reels, Posts, Photos)
 */
export async function extractFacebookMedia(targetUrl: string): Promise<ExtractedMedia> {
  const isFbVideo = targetUrl.includes('/video') || targetUrl.includes('/reel') || targetUrl.includes('fb.watch') || targetUrl.includes('/share/r/') || targetUrl.includes('/share/v/');
  let canonicalUrl = targetUrl;
  let fbVideoUrl = '';
  let fbTitle = '';
  let fbImages: string[] = [];
  let author = '';

  try {
    const fbRes = await fetch(targetUrl, {
      headers: FB_BOT_HEADERS,
      redirect: 'follow',
      next: { revalidate: 0 }
    });

    if (fbRes.ok) {
      let fbHtml = await fbRes.text();
      const finalUrl = fbRes.url;

      // Handle login/redirects
      const nextMatch = finalUrl.match(/[?&]next=([^&]+)/i) || fbHtml.match(/login\/\?next=([^"'\s&]+)/i);
      if (nextMatch) {
        const decodedNext = decodeURIComponent(nextMatch[1]);
        const storyMatch = decodedNext.match(/story_fbid=([^&]+)/i) || decodedNext.match(/\/posts\/([^/?#]+)/i);
        const idMatch = decodedNext.match(/[?&]id=([^&]+)/i) || decodedNext.match(/facebook\.com\/([0-9]+)/i);

        if (storyMatch && idMatch) {
          canonicalUrl = `https://www.facebook.com/${idMatch[1]}/posts/${storyMatch[1]}`;
        }
      }

      // Fetch with Twitterbot on the canonical URL (returns high-res direct scontent URLs)
      try {
        const twRes = await fetch(canonicalUrl, {
          headers: TWITTER_BOT_HEADERS,
          redirect: 'follow'
        });
        if (twRes.ok) {
          const twHtml = await twRes.text();
          if (twHtml && twHtml.length > 500) {
            fbHtml = twHtml + '\n' + fbHtml;
          }
        }
      } catch {
        // Continue with initial HTML
      }

      // Title & Author extraction
      const ogTitle = fbHtml.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i);
      if (ogTitle) {
        const t = cleanEscapeChars(ogTitle[1]).trim();
        if (t && !t.toLowerCase().includes('log in') && !t.toLowerCase().includes('iniciar sesión')) {
          fbTitle = t;
        }
      }

      const ogUrl = fbHtml.match(/<meta[^>]+(?:property|name)=["']og:url["'][^>]+content=["']([^"']+)["']/i);
      if (ogUrl) {
        canonicalUrl = cleanEscapeChars(ogUrl[1]);
      }

      // 1. Video extraction from OpenGraph & JSON properties (Excluding lookaside URLs which are not video streams)
      const ogVideo = fbHtml.match(/<meta[^>]+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/i);
      if (ogVideo) {
        const rawVid = cleanEscapeChars(ogVideo[1]);
        if (rawVid.startsWith('http') && !rawVid.includes('lookaside.fbsbx.com')) {
          fbVideoUrl = rawVid;
        }
      }

      if (!fbVideoUrl) {
        const streamMatches = [
          fbHtml.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/i),
          fbHtml.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/i),
          fbHtml.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/i),
          fbHtml.match(/"playable_url"\s*:\s*"([^"]+)"/i),
          fbHtml.match(/"hd_src"\s*:\s*"([^"]+)"/i),
          fbHtml.match(/"sd_src"\s*:\s*"([^"]+)"/i)
        ];
        for (const m of streamMatches) {
          if (m && m[1]) {
            const v = cleanEscapeChars(m[1]);
            if (v.startsWith('http') && !v.includes('lookaside.fbsbx.com')) {
              fbVideoUrl = v;
              break;
            }
          }
        }
      }

      // 2. High Resolution Photo Extraction (Complete query parameters preserved)
      const fbcdnMatches = fbHtml.match(/https:\\\/\\\/scontent[^"'\s<>\\]+/g) || fbHtml.match(/https:\/\/scontent[^"'\s<>]+/g) || [];
      if (fbcdnMatches) {
        for (const raw of fbcdnMatches) {
          const src = cleanEscapeChars(raw);
          if (
            src.startsWith('http') &&
            !src.includes('p50x50') &&
            !src.includes('s50x50') &&
            !src.includes('p100x100') &&
            !src.includes('p160x160') &&
            !src.includes('p200x200') &&
            !src.includes('rsrc.php') &&
            !src.includes('emoji.php') &&
            !src.includes('safe_image.php') &&
            !src.includes('fb_icon') &&
            (src.includes('.jpg') || src.includes('.png') || src.includes('.webp') || src.includes('dst-jpg') || src.includes('oh='))
          ) {
            const urlWithoutParams = src.split('?')[0];
            const alreadyExists = fbImages.some(existing => existing.split('?')[0] === urlWithoutParams);
            if (!alreadyExists) {
              fbImages.push(src);
            }
          }
        }
      }

      // OpenGraph images fallback
      const ogImageMatches = fbHtml.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi);
      for (const m of ogImageMatches) {
        const src = cleanEscapeChars(m[1]);
        if (src.startsWith('http') && !src.includes('safe_image.php') && !src.includes('rsrc.php') && !src.includes('fb_icon')) {
          const urlWithoutParams = src.split('?')[0];
          if (!fbImages.some(existing => existing.split('?')[0] === urlWithoutParams)) {
            fbImages.push(src);
          }
        }
      }

      // Plugin embed fallback for video
      if ((isFbVideo || targetUrl.includes('/reel') || targetUrl.includes('watch')) && !fbVideoUrl) {
        try {
          const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonicalUrl)}`;
          const embedRes = await fetch(embedUrl, {
            headers: BROWSER_HEADERS,
            next: { revalidate: 0 }
          });
          if (embedRes.ok) {
            const embedHtml = await embedRes.text();
            const hdMatch = embedHtml.match(/"hd_src"\s*:\s*"([^"]+)"/i);
            const sdMatch = embedHtml.match(/"sd_src"\s*:\s*"([^"]+)"/i);
            const hd = hdMatch ? cleanEscapeChars(hdMatch[1]) : null;
            const sd = sdMatch ? cleanEscapeChars(sdMatch[1]) : null;
            if (hd && !hd.includes('lookaside')) fbVideoUrl = hd;
            else if (sd && !sd.includes('lookaside')) fbVideoUrl = sd;
          }
        } catch (embedErr) {
          console.warn('Facebook plugin embed download error:', embedErr);
        }
      }
    }
  } catch (fbErr) {
    console.warn('Facebook scraping error:', fbErr);
  }

  // Tier 2: Try yt-dlp CLI for Facebook videos / reels
  if (!fbVideoUrl && isFbVideo) {
    try {
      const ytdlpFb = await runYtDlpMetadata(canonicalUrl);
      if (ytdlpFb.url && !ytdlpFb.url.includes('lookaside')) {
        fbVideoUrl = ytdlpFb.url;
      }
      if (ytdlpFb.title && (!fbTitle || fbTitle.includes('Facebook'))) {
        fbTitle = ytdlpFb.title;
      }
      if (ytdlpFb.author && !author) {
        author = ytdlpFb.author;
      }
      if (ytdlpFb.thumbnail && !fbImages.includes(ytdlpFb.thumbnail)) {
        fbImages.unshift(ytdlpFb.thumbnail);
      }
    } catch {
      // Ignore yt-dlp error
    }
  }

  // Tier 3: Try btch-downloader for Facebook videos if not found
  if (!fbVideoUrl && isFbVideo) {
    try {
      const btch = await getBtch();
      if (btch && typeof btch.fbdown === 'function') {
        const fbResult = await Promise.race([
          btch.fbdown(canonicalUrl).catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve({ _timeout: true }), 5000))
        ]);
        if (fbResult && typeof fbResult === 'object' && !('_timeout' in fbResult)) {
          const hd = fbResult.HD || fbResult.hd || fbResult.video_hd;
          const sd = fbResult.Normal_video || fbResult.sd || fbResult.video_sd || fbResult.result;
          if (hd && typeof hd === 'string' && hd.startsWith('http') && !hd.includes('lookaside')) {
            fbVideoUrl = hd;
          } else if (sd && typeof sd === 'string' && sd.startsWith('http') && !sd.includes('lookaside')) {
            fbVideoUrl = sd;
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  const detectedMediaType = (isFbVideo || fbVideoUrl) ? 'video' : 'image';

  return {
    success: true,
    chapterName: fbTitle || (detectedMediaType === 'video' ? 'Video de Facebook' : 'Publicación de Facebook'),
    seriesTitle: 'Facebook',
    mediaType: detectedMediaType,
    videoUrl: fbVideoUrl,
    author,
    images: fbImages
  };
}

/**
 * 3. INSTAGRAM EXTRACTOR (Reels, Posts, Carousels, Stories, Audio & Image with Audio)
 */
export async function extractInstagramMedia(targetUrl: string): Promise<ExtractedMedia> {
  const shortcodeMatch = targetUrl.match(/\/(?:p|reel|tv|reels)\/([a-zA-Z0-9_-]+)/i);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';
  const isReelUrl = targetUrl.includes('/reel/') || targetUrl.includes('/reels/') || targetUrl.includes('/tv/');
  let isDetectedVideo = isReelUrl;
  let videoUrl = '';
  let audioUrl = '';
  let chapterName = '';
  let author = '';
  const images: string[] = [];
  const carouselItems: { url: string; isVideo: boolean; videoUrl?: string }[] = [];

  const cleanLookupUrl = shortcode ? (isReelUrl ? `https://www.instagram.com/reel/${shortcode}/` : `https://www.instagram.com/p/${shortcode}/`) : targetUrl;

  // Tier 0: Check yt-dlp metadata for video/audio streams if it's a video or reel
  if (isReelUrl || targetUrl.includes('instagram.com/')) {
    try {
      const ytdl = await runYtDlpMetadata(cleanLookupUrl);
      if (ytdl) {
        if (ytdl.title && !chapterName) chapterName = ytdl.title;
        if (ytdl.author && !author) author = `@${ytdl.author.replace('@', '')}`;
        if (ytdl.url) {
          videoUrl = ytdl.url;
          isDetectedVideo = true;
        }
        if (ytdl.audioUrl) {
          audioUrl = ytdl.audioUrl;
        }
        if (ytdl.thumbnail && !images.includes(ytdl.thumbnail)) {
          images.push(ytdl.thumbnail);
        }
      }
    } catch {
      // Ignore
    }
  }

  // Tier 1: Dedicated Instagram Downloader (Fast, High-Def, extracts direct CDN URLs)
  try {
    const btch = await import('btch-downloader');
    if (btch.igdl || btch.default?.igdl) {
      const igdlFn = btch.igdl || btch.default?.igdl;
      const igRes: any = await Promise.race([
        igdlFn(cleanLookupUrl).catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve({ _timeout: true }), 9000))
      ]);

      if (igRes && typeof igRes === 'object' && !('_timeout' in igRes) && igRes.result && Array.isArray(igRes.result)) {
        for (const item of igRes.result) {
          let itemUrl = item.url || '';
          let itemThumb = item.thumbnail || '';

          // Decode JWT if rapidcdn token is provided to get the unblocked direct CDN URL
          if (itemUrl.includes('token=')) {
            try {
              const token = itemUrl.split('token=')[1]?.split('&')[0];
              const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
              if (payload.url && typeof payload.url === 'string' && payload.url.startsWith('http')) {
                itemUrl = payload.url;
              }
            } catch {
              // Ignore JWT decode fallback
            }
          }
          if (itemThumb.includes('token=')) {
            try {
              const token = itemThumb.split('token=')[1]?.split('&')[0];
              const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
              if (payload.url && typeof payload.url === 'string' && payload.url.startsWith('http')) {
                itemThumb = payload.url;
              }
            } catch {
              // Ignore
            }
          }

          const isItemVideo = itemUrl.includes('.mp4') || itemUrl.includes('video') || isDetectedVideo || item.filename?.includes('.mp4');
          if (isItemVideo) {
            if (!videoUrl) videoUrl = itemUrl;
            if (!audioUrl) audioUrl = itemUrl;
            isDetectedVideo = true;
          }
          if (itemThumb && !images.includes(itemThumb)) {
            images.push(itemThumb);
          }
          if (!isItemVideo && itemUrl && !images.includes(itemUrl)) {
            images.push(itemUrl);
          }
          carouselItems.push({
            url: isItemVideo ? (itemThumb || itemUrl) : itemUrl,
            isVideo: isItemVideo,
            videoUrl: isItemVideo ? itemUrl : undefined
          });
        }
      }
    }
  } catch (btchErr) {
    console.warn('Instagram btch-downloader error:', btchErr);
  }

  // Tier 2: Fetch Crawler / OpenGraph / Application JSON
  try {
    const botRes = await fetch(cleanLookupUrl, {
      headers: FB_BOT_HEADERS,
      next: { revalidate: 0 }
    });

    if (botRes.ok) {
      const botHtml = await botRes.text();
      const ogVideo = botHtml.match(/<meta[^>]+property=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/i);
      const ogImage = botHtml.match(/<meta[^>]+property=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/i);
      const ogTitle = botHtml.match(/<meta[^>]+property=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i);
      const ogType = botHtml.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i);
      const authorMatch = botHtml.match(/content=["']([^"':]+) on Instagram:/i) || botHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"':]+) on Instagram/i);
      
      if (authorMatch && !author) author = `@${authorMatch[1].trim()}`;
      if (ogTitle && !chapterName) {
        const t = ogTitle[1].replace(/&amp;/g, '&').trim();
        if (!t.toLowerCase().includes('instagram') && !t.toLowerCase().includes('login') && !t.toLowerCase().includes('iniciar sesión')) {
          chapterName = t;
        }
      }

      if (ogType && (ogType[1].includes('video') || ogType[1].includes('player'))) {
        isDetectedVideo = true;
      }

      if (ogVideo && !videoUrl) {
        videoUrl = cleanEscapeChars(ogVideo[1]);
        isDetectedVideo = true;
      }

      if (ogImage) {
        const img = cleanEscapeChars(ogImage[1]);
        if (img.startsWith('http') && !images.includes(img)) {
          images.push(img);
        }
      }

      // Extract high-res carousel / photo images from JSON payloads
      const scriptRegex = /<script type="application\/json" [^>]*>([\s\S]*?)<\/script>/gi;
      let scriptMatch;
      while ((scriptMatch = scriptRegex.exec(botHtml)) !== null) {
        const jsonStr = scriptMatch[1];
        if (
          jsonStr.includes('carousel_media') ||
          jsonStr.includes('edge_sidecar_to_children') ||
          jsonStr.includes('xdt_shortcode_media') ||
          jsonStr.includes('image_versions2') ||
          jsonStr.includes('music_metadata') ||
          jsonStr.includes('audio_src')
        ) {
          try {
            const parsed = JSON.parse(jsonStr);
            const searchCarousel = (obj: any) => {
              if (!obj) return;
              if (Array.isArray(obj)) {
                obj.forEach(searchCarousel);
                return;
              }
              if (typeof obj === 'object') {
                if (obj.audio_src && typeof obj.audio_src === 'string' && obj.audio_src.startsWith('http')) {
                  audioUrl = obj.audio_src;
                }
                if (obj.progressive_download_url && typeof obj.progressive_download_url === 'string' && obj.progressive_download_url.startsWith('http')) {
                  audioUrl = obj.progressive_download_url;
                }
                if (obj.music_asset_info?.progressive_download_url && typeof obj.music_asset_info.progressive_download_url === 'string') {
                  audioUrl = obj.music_asset_info.progressive_download_url;
                }
                if (obj.music_info?.music_asset_info?.progressive_download_url && typeof obj.music_info.music_asset_info.progressive_download_url === 'string') {
                  audioUrl = obj.music_info.music_asset_info.progressive_download_url;
                }
                if (obj.clips_metadata?.music_info?.music_asset_info?.progressive_download_url && typeof obj.clips_metadata.music_info.music_asset_info.progressive_download_url === 'string') {
                  audioUrl = obj.clips_metadata.music_info.music_asset_info.progressive_download_url;
                }
                if (obj.audio_ranking_info?.audio_asset_url && typeof obj.audio_ranking_info.audio_asset_url === 'string') {
                  audioUrl = obj.audio_ranking_info.audio_asset_url;
                }
                if (obj.audio_url && typeof obj.audio_url === 'string' && obj.audio_url.startsWith('http')) {
                  audioUrl = obj.audio_url;
                }
                if (Array.isArray(obj.carousel_media) && obj.carousel_media.length > 0) {
                  obj.carousel_media.forEach((item: any) => {
                    const candidate = item.image_versions2?.candidates?.[0]?.url || item.display_url;
                    const videoCand = item.video_versions?.[0]?.url || item.video_url;
                    if (candidate || videoCand) {
                      const url = candidate || videoCand;
                      if (url && !carouselItems.some(c => c.url === url)) {
                        carouselItems.push({
                          url,
                          isVideo: !!videoCand && !candidate,
                          videoUrl: videoCand
                        });
                      }
                    }
                  });
                }
                if (obj.edge_sidecar_to_children?.edges && Array.isArray(obj.edge_sidecar_to_children.edges)) {
                  obj.edge_sidecar_to_children.edges.forEach((edge: any) => {
                    const node = edge.node || edge;
                    const cand = node.display_url || node.display_resources?.[node.display_resources.length - 1]?.src;
                    const vid = node.video_url;
                    if (cand || vid) {
                      const url = cand || vid;
                      if (url && !carouselItems.some(c => c.url === url)) {
                        carouselItems.push({
                          url,
                          isVideo: !!node.is_video || !!vid,
                          videoUrl: vid
                        });
                      }
                    }
                  });
                }
                for (const k in obj) {
                  searchCarousel(obj[k]);
                }
              }
            };
            searchCarousel(parsed);
          } catch {
            // Ignore JSON parse err
          }
        }
      }

      if (carouselItems.length > 0) {
        images.push(...carouselItems.map(c => c.url));
      }
    }
  } catch (igErr) {
    console.warn('Instagram bot scraping error:', igErr);
  }

  // Tier 3: oEmbed fallback if title or author missing
  if (!chapterName || !author) {
    try {
      const oeRes = await fetch(`https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(cleanLookupUrl)}`, {
        headers: BROWSER_HEADERS,
        next: { revalidate: 3600 }
      });
      if (oeRes.ok) {
        const oeData = await oeRes.json();
        if (oeData.title && !chapterName) chapterName = oeData.title;
        if (oeData.author_name && !author) author = `@${oeData.author_name}`;
        if (oeData.thumbnail_url && !images.includes(oeData.thumbnail_url)) {
          images.unshift(oeData.thumbnail_url);
        }
      }
    } catch {
      // Ignore
    }
  }

  // Tier 4: Caption embed fallback for video source
  if (!videoUrl && isDetectedVideo && shortcode) {
    try {
      const embedRes = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
        headers: BROWSER_HEADERS,
        next: { revalidate: 0 }
      });
      if (embedRes.ok) {
        const embedHtml = await embedRes.text();
        const vMatch = embedHtml.match(/<video[^>]+src=["']([^"']+)["']/i) || embedHtml.match(/"video_url":"([^"]+)"/i);
        if (vMatch) {
          videoUrl = cleanEscapeChars(vMatch[1]);
          isDetectedVideo = true;
        }
        const imgMatches = embedHtml.match(/<img[^>]+class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]+src=["']([^"']+)["']/i);
        if (imgMatches && !images.includes(imgMatches[1])) {
          images.unshift(cleanEscapeChars(imgMatches[1]));
        }
      }
    } catch (embedErr) {
      console.warn('Instagram embed scraping warning:', embedErr);
    }
  }

  // If videoUrl is available, audio can be extracted from video stream
  if (videoUrl && !audioUrl) {
    audioUrl = videoUrl;
  }

  let finalMediaType: 'image' | 'video' | 'image_with_audio' = (isDetectedVideo || videoUrl) ? 'video' : 'image';
  if (finalMediaType === 'image' && (audioUrl || targetUrl.includes('igsh=') || targetUrl.includes('igsi='))) {
    // If it's a single image post with audio or potential audio track
    finalMediaType = 'image_with_audio';
  }

  // Workaround for Instagram API blocking audio tracks on image posts:
  // Since we cannot fetch the direct audio URL without an authenticated session,
  // we clear the `hasAudio` flag and downgrade it if it strictly doesn't have an audioUrl.
  // This explicitly prevents the app from generating muted video or throwing generic MP3 errors.
  let hasAudio = !!(audioUrl || videoUrl);
  
  if (finalMediaType === 'image_with_audio' && !audioUrl) {
    // We detected it MIGHT have audio (via URL igsh param), but we couldn't extract the direct audio stream.
    // We must signal to the caller that the audio is missing or blocked, or fallback gracefully.
    // Instead of forcing 'image_with_audio' which causes muted exports, we revert to 'image'.
    // The user will see it purely as an Image, which is factually what we could extract.
    finalMediaType = 'image';
    hasAudio = false;
  }

  const cleanImages = [...new Set(images.filter(Boolean))];

  return {
    success: true,
    chapterName: chapterName || (author ? `${author} - ${finalMediaType === 'video' ? 'Video' : 'Post'}` : (shortcode ? `Instagram ${shortcode}` : 'Instagram Post')),
    seriesTitle: author ? `Instagram de ${author}` : 'Instagram',
    mediaType: finalMediaType,
    videoUrl,
    audioUrl: audioUrl || (videoUrl ? videoUrl : undefined),
    hasAudio,
    author,
    authorUrl: author ? `https://www.instagram.com/${author.replace('@', '')}` : undefined,
    images: cleanImages
  };
}

/**
 * 4. TIKTOK EXTRACTOR (Videos, Photos, Audio)
 */
export async function extractTikTokMedia(targetUrl: string): Promise<ExtractedMedia> {
  let author = '';
  let chapterName = '';
  let videoUrl = '';
  let audioUrl = '';
  const images: string[] = [];
  let mediaType: 'image' | 'video' = 'video';

  try {
    const tkRes = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(targetUrl)}&hd=1`,
      next: { revalidate: 0 }
    });
    if (tkRes.ok) {
      const tkJson = await tkRes.json();
      if (tkJson.code === 0 && tkJson.data) {
        const d = tkJson.data;
        author = d.author?.unique_id ? `@${d.author.unique_id}` : (d.author?.nickname || '');
        chapterName = d.title || `TikTok post ${author ? `de ${author}` : ''}`;
        if (d.images && Array.isArray(d.images) && d.images.length > 0) {
          mediaType = 'image';
          images.push(...d.images);
        } else if (d.play || d.hdplay || d.wmplay) {
          mediaType = 'video';
          videoUrl = d.play || d.hdplay || d.wmplay;
          if (d.music) audioUrl = d.music;
          if (d.cover) images.push(d.cover);
        }
      }
    }
  } catch (tkErr) {
    console.warn('TikTok extractor error:', tkErr);
  }

  return {
    success: true,
    chapterName: chapterName || 'TikTok Video',
    seriesTitle: author ? `TikTok de ${author}` : 'TikTok',
    mediaType,
    videoUrl,
    audioUrl,
    author,
    authorUrl: author ? `https://www.tiktok.com/${author}` : undefined,
    images
  };
}

/**
 * 5. X / TWITTER EXTRACTOR (Videos, Photos, GIFs, Threads)
 */
export async function extractTwitterMedia(targetUrl: string): Promise<ExtractedMedia> {
  const tweetMatch = targetUrl.match(/(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/i) ||
                     targetUrl.match(/status\/(\d+)/i);
  const username = tweetMatch && tweetMatch[1] && tweetMatch[1] !== 'status' ? tweetMatch[1] : 'user';
  const tweetId = tweetMatch ? (tweetMatch[2] || tweetMatch[1]) : '';

  let chapterName = '';
  let seriesTitle = username !== 'user' ? `X (@${username})` : 'X (Twitter)';
  let mediaType: 'image' | 'video' = 'image';
  let videoUrl = '';
  let audioUrl = '';
  let author = username !== 'user' ? `@${username}` : 'X User';
  let authorUrl = username !== 'user' ? `https://x.com/${username}` : undefined;
  const images: string[] = [];

  if (!tweetId) {
    // If no specific tweet id matched, fallback to general yt-dlp or direct URL
    try {
      const ytdl = await runYtDlpMetadata(targetUrl);
      if (ytdl.url) {
        return {
          success: true,
          chapterName: ytdl.title || 'Video de X',
          seriesTitle: ytdl.author ? `X (@${ytdl.author})` : 'X (Twitter)',
          mediaType: 'video',
          videoUrl: ytdl.url,
          audioUrl: ytdl.audioUrl,
          author: ytdl.author,
          images: ytdl.thumbnail ? [ytdl.thumbnail] : []
        };
      }
    } catch {
      // ignore
    }
    return {
      success: false,
      chapterName: 'Post de X',
      seriesTitle: 'X (Twitter)',
      mediaType: 'image',
      images: []
    };
  }

  // Strategy 1: FxTwitter API (Primary, highly reliable and fast JSON endpoint)
  try {
    const fxRes = await fetch(`https://api.fxtwitter.com/${username}/status/${tweetId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (fxRes.ok) {
      const fxJson = await fxRes.json();
      if (fxJson?.tweet) {
        const tw = fxJson.tweet;
        if (tw.text) {
          chapterName = tw.text.trim().slice(0, 120);
        }
        if (tw.author?.name) {
          author = `${tw.author.name} (@${tw.author.screen_name || username})`;
          authorUrl = tw.author.url || `https://x.com/${tw.author.screen_name || username}`;
          seriesTitle = `${tw.author.name} en X`;
        }

        // Check for direct Video streams
        const videos = tw.media?.videos || [];
        if (Array.isArray(videos) && videos.length > 0) {
          mediaType = 'video';
          const v = videos[0];
          if (v.variants && Array.isArray(v.variants) && v.variants.length > 0) {
            const mp4Variants = v.variants.filter((item: any) => 
              item.content_type === 'video/mp4' || 
              item.container === 'mp4' || 
              (typeof item.url === 'string' && item.url.includes('.mp4'))
            );
            if (mp4Variants.length > 0) {
              mp4Variants.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
              videoUrl = mp4Variants[0].url;
            } else {
              videoUrl = v.url || v.variants[0].url;
            }
          } else {
            videoUrl = v.url || '';
          }

          if (v.thumbnail_url && !images.includes(v.thumbnail_url)) {
            images.push(v.thumbnail_url);
          }
        } else if (tw.media?.all && Array.isArray(tw.media.all)) {
          for (const m of tw.media.all) {
            if (m.type === 'video' || m.type === 'gif') {
              mediaType = 'video';
              if (m.variants && Array.isArray(m.variants) && m.variants.length > 0) {
                const mp4Variants = m.variants.filter((item: any) => 
                  item.content_type === 'video/mp4' || 
                  (typeof item.url === 'string' && item.url.includes('.mp4'))
                );
                if (mp4Variants.length > 0) {
                  mp4Variants.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                  videoUrl = mp4Variants[0].url;
                }
              }
              if (!videoUrl && m.url) videoUrl = m.url;
              if (m.thumbnail_url && !images.includes(m.thumbnail_url)) images.push(m.thumbnail_url);
            }
          }
        }

        // Check for Photos / Images (only if not a video)
        if (mediaType !== 'video') {
          const photos = tw.media?.photos || [];
          if (Array.isArray(photos) && photos.length > 0) {
            for (const p of photos) {
              let pUrl = p.url || '';
              if (pUrl) {
                if (pUrl.includes('pbs.twimg.com/media/')) {
                  const baseWithoutName = pUrl.replace(/([?&])name=[a-zA-Z0-9_]+/g, '');
                  pUrl = baseWithoutName + (baseWithoutName.includes('?') ? '&name=orig' : '?name=orig');
                }
                if (!images.includes(pUrl)) images.push(pUrl);
              }
            }
          } else if (tw.media?.all && Array.isArray(tw.media.all)) {
            for (const m of tw.media.all) {
              if (m.type === 'photo' && m.url) {
                let pUrl = m.url;
                if (pUrl.includes('pbs.twimg.com/media/')) {
                  const baseWithoutName = pUrl.replace(/([?&])name=[a-zA-Z0-9_]+/g, '');
                  pUrl = baseWithoutName + (baseWithoutName.includes('?') ? '&name=orig' : '?name=orig');
                }
                if (!images.includes(pUrl)) images.push(pUrl);
              }
            }
          }
        }
      }
    }
  } catch (fxErr) {
    console.warn('FxTwitter extraction error:', fxErr);
  }

  // Strategy 2: VxTwitter API Fallback
  if (!videoUrl && images.length === 0) {
    try {
      const vxRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000)
      });
      if (vxRes.ok) {
        const vxJson = await vxRes.json();
        if (vxJson) {
          if (vxJson.text && !chapterName) chapterName = vxJson.text.trim().slice(0, 120);
          if (vxJson.user_name) author = `${vxJson.user_name} (@${vxJson.user_screen_name || username})`;
          if (vxJson.media_extended && Array.isArray(vxJson.media_extended)) {
            for (const m of vxJson.media_extended) {
              if (m.type === 'video' || m.type === 'gif') {
                mediaType = 'video';
                if (!videoUrl && m.url) videoUrl = m.url;
                if (m.thumbnail_url && !images.includes(m.thumbnail_url)) images.push(m.thumbnail_url);
              } else if (m.type === 'image' && m.url) {
                let pUrl = m.url;
                if (pUrl.includes('pbs.twimg.com/media/')) {
                  const baseWithoutName = pUrl.replace(/([?&])name=[a-zA-Z0-9_]+/g, '');
                  pUrl = baseWithoutName + (baseWithoutName.includes('?') ? '&name=orig' : '?name=orig');
                }
                if (!images.includes(pUrl)) images.push(pUrl);
              }
            }
          } else if (vxJson.mediaURLs && Array.isArray(vxJson.mediaURLs)) {
            for (const u of vxJson.mediaURLs) {
              if (u.includes('.mp4')) {
                mediaType = 'video';
                if (!videoUrl) videoUrl = u;
              } else {
                let pUrl = u;
                if (pUrl.includes('pbs.twimg.com/media/')) {
                  const baseWithoutName = pUrl.replace(/([?&])name=[a-zA-Z0-9_]+/g, '');
                  pUrl = baseWithoutName + (baseWithoutName.includes('?') ? '&name=orig' : '?name=orig');
                }
                if (!images.includes(pUrl)) images.push(pUrl);
              }
            }
          }
        }
      }
    } catch (vxErr) {
      console.warn('VxTwitter fallback error:', vxErr);
    }
  }

  // Strategy 3: yt-dlp Metadata Fallback
  if (!videoUrl && images.length === 0) {
    try {
      const canonicalTweetUrl = `https://twitter.com/${username}/status/${tweetId}`;
      const ytdl = await runYtDlpMetadata(canonicalTweetUrl);
      if (ytdl.url) {
        mediaType = 'video';
        videoUrl = ytdl.url;
        audioUrl = ytdl.audioUrl || '';
        if (ytdl.title && !chapterName) chapterName = ytdl.title;
        if (ytdl.author) author = `@${ytdl.author}`;
        if (ytdl.thumbnail && !images.includes(ytdl.thumbnail)) images.push(ytdl.thumbnail);
      }
    } catch (ytdlErr) {
      console.warn('yt-dlp twitter fallback error:', ytdlErr);
    }
  }

  // Strategy 4: Twitter Syndication API Fallback (twimg)
  if (!videoUrl && images.length === 0) {
    try {
      const synRes = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=es`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (synRes.ok) {
        const synJson = await synRes.json();
        if (synJson) {
          if (synJson.text && !chapterName) chapterName = synJson.text.slice(0, 120);
          if (synJson.user?.name) author = `${synJson.user.name} (@${synJson.user.screen_name || username})`;
          if (synJson.mediaDetails && Array.isArray(synJson.mediaDetails)) {
            for (const item of synJson.mediaDetails) {
              if (item.type === 'video' && item.video_info?.variants) {
                mediaType = 'video';
                const vars = item.video_info.variants.filter((v: any) => v.content_type === 'video/mp4');
                vars.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                if (vars.length > 0 && !videoUrl) videoUrl = vars[0].url;
                if (item.media_url_https && !images.includes(item.media_url_https)) images.push(item.media_url_https);
              } else if (item.type === 'photo' && item.media_url_https) {
                let pUrl = item.media_url_https;
                if (pUrl.includes('pbs.twimg.com/media/')) {
                  const baseWithoutName = pUrl.replace(/([?&])name=[a-zA-Z0-9_]+/g, '');
                  pUrl = baseWithoutName + (baseWithoutName.includes('?') ? '&name=orig' : '?name=orig');
                }
                if (!images.includes(pUrl)) images.push(pUrl);
              }
            }
          }
        }
      }
    } catch (synErr) {
      console.warn('Syndication extraction error:', synErr);
    }
  }

  // Strategy 5: Twitter oEmbed for title & author
  if (!chapterName || author === 'X User') {
    try {
      const oembedRes = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/${username}/status/${tweetId}`)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4000)
      });
      if (oembedRes.ok) {
        const oeJson = await oembedRes.json();
        if (oeJson.author_name && author === 'X User') {
          author = `${oeJson.author_name} (@${username})`;
          seriesTitle = `${oeJson.author_name} en X`;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!chapterName) {
    chapterName = mediaType === 'video' ? `Video de ${author}` : `Publicación de ${author}`;
  }

  return {
    success: true,
    chapterName,
    seriesTitle,
    mediaType,
    videoUrl: videoUrl || undefined,
    audioUrl: audioUrl || undefined,
    author,
    authorUrl,
    images
  };
}

/**
 * Threads (threads.net / threads.com) Media Extractor
 * Supports single images, multi-image carousels, videos, reels, and share links
 */
export async function extractThreadsMedia(targetUrl: string): Promise<ExtractedMedia> {
  let cleanUrl = targetUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  const BOT_HEADERS: Record<string, string> = {
    'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Cache-Control': 'no-cache'
  };

  let author = 'Threads';
  let authorUrl: string | undefined = undefined;
  let caption = '';
  let seriesTitle = 'Threads';
  let chapterName = '';
  let mediaType: 'image' | 'video' | 'image_with_audio' = 'image';
  let videoUrl = '';
  const images: string[] = [];

  const findBarcelonaMedia = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return null;

    if (obj.image_versions2 || obj.video_versions || obj.carousel_media) {
      return obj;
    }
    if (obj.media && (obj.media.image_versions2 || obj.media.video_versions || obj.media.carousel_media)) {
      return obj.media;
    }

    for (const k of Object.keys(obj)) {
      try {
        const found = findBarcelonaMedia(obj[k]);
        if (found) return found;
      } catch {
        // continue
      }
    }
    return null;
  };

  try {
    const res = await fetch(cleanUrl, {
      headers: BOT_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    const finalUrl = res.url;
    const html = await res.text();

    // Strategy 1: Preloaded Relay JSON (BarcelonaPostPageTargetQuery)
    const scriptRegex = /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    let mediaObj: any = null;

    while ((match = scriptRegex.exec(html)) !== null) {
      const scriptContent = match[1];
      if (
        scriptContent.includes('BarcelonaPostPageTargetQuery') ||
        scriptContent.includes('image_versions2') ||
        scriptContent.includes('video_versions') ||
        scriptContent.includes('carousel_media')
      ) {
        try {
          const data = JSON.parse(scriptContent);
          const found = findBarcelonaMedia(data);
          if (found) {
            mediaObj = found;
            break;
          }
        } catch {
          // ignore non-json
        }
      }
    }

    if (mediaObj) {
      caption = cleanEscapeChars(mediaObj.caption?.text || '');
      const username = mediaObj.user?.username;
      const fullName = mediaObj.user?.full_name;
      if (username) {
        author = `@${username}`;
        authorUrl = `https://www.threads.net/@${username}`;
      } else if (fullName) {
        author = fullName;
      }

      // Check carousel media
      if (Array.isArray(mediaObj.carousel_media) && mediaObj.carousel_media.length > 0) {
        for (const item of mediaObj.carousel_media) {
          if (item.video_versions && Array.isArray(item.video_versions) && item.video_versions.length > 0) {
            const v = cleanEscapeChars(item.video_versions[0].url);
            if (v && !videoUrl) {
              videoUrl = v;
              mediaType = 'video';
            }
          }
          if (item.image_versions2?.candidates && Array.isArray(item.image_versions2.candidates) && item.image_versions2.candidates.length > 0) {
            const img = cleanEscapeChars(item.image_versions2.candidates[0].url);
            if (img && !images.includes(img)) {
              images.push(img);
            }
          }
        }
      } else if (mediaObj.video_versions && Array.isArray(mediaObj.video_versions) && mediaObj.video_versions.length > 0) {
        mediaType = 'video';
        videoUrl = cleanEscapeChars(mediaObj.video_versions[0].url);
        if (mediaObj.image_versions2?.candidates && Array.isArray(mediaObj.image_versions2.candidates) && mediaObj.image_versions2.candidates.length > 0) {
          const cover = cleanEscapeChars(mediaObj.image_versions2.candidates[0].url);
          if (cover && !images.includes(cover)) {
            images.push(cover);
          }
        }
      } else if (mediaObj.image_versions2?.candidates && Array.isArray(mediaObj.image_versions2.candidates) && mediaObj.image_versions2.candidates.length > 0) {
        mediaType = 'image';
        const img = cleanEscapeChars(mediaObj.image_versions2.candidates[0].url);
        if (img && !images.includes(img)) {
          images.push(img);
        }
      }
    }

    // Strategy 2: Fallback to OG meta tags if Relay extraction was incomplete
    if (!videoUrl && images.length === 0) {
      const ogTitle = html.match(/<meta\s+property=["\x27]og:title["\x27]\s+content=["\x27]([^"\x27]+)["\x27]/i) ||
                      html.match(/<meta\s+content=["\x27]([^"\x27]+)["\x27]\s+property=["\x27]og:title["\x27]/i);
      const ogDesc = html.match(/<meta\s+property=["\x27]og:description["\x27]\s+content=["\x27]([^"\x27]+)["\x27]/i) ||
                     html.match(/<meta\s+content=["\x27]([^"\x27]+)["\x27]\s+property=["\x27]og:description["\x27]/i);
      const ogImage = html.match(/<meta\s+property=["\x27]og:image["\x27]\s+content=["\x27]([^"\x27]+)["\x27]/i) ||
                      html.match(/<meta\s+content=["\x27]([^"\x27]+)["\x27]\s+property=["\x27]og:image["\x27]/i);
      const ogVideo = html.match(/<meta\s+property=["\x27]og:video(?::secure_url)?["\x27]\s+content=["\x27]([^"\x27]+)["\x27]/i) ||
                      html.match(/<meta\s+content=["\x27]([^"\x27]+)["\x27]\s+property=["\x27]og:video(?::secure_url)?["\x27]/i);

      if (ogTitle && !author) {
        const titleText = cleanEscapeChars(ogTitle[1]);
        const authorMatch = titleText.match(/^(.+?)\s*\(@([^)]+)\)\s*on\s*Threads/i);
        if (authorMatch) {
          author = `@${authorMatch[2]}`;
          authorUrl = `https://www.threads.net/@${authorMatch[2]}`;
        }
      }
      if (ogDesc && !caption) {
        caption = cleanEscapeChars(ogDesc[1]);
      }
      if (ogVideo) {
        videoUrl = cleanEscapeChars(ogVideo[1]);
        mediaType = 'video';
      }
      if (ogImage) {
        const img = cleanEscapeChars(ogImage[1]);
        if (img && !images.includes(img)) {
          images.push(img);
        }
      }

      // Regex scan for direct video streams in HTML if video detected
      if (!videoUrl && (html.includes('.mp4') || html.includes('video_versions'))) {
        const mp4Matches = html.match(/https?:\\\/\\\/[^\s"'\\]+cdninstagram\.com[^\s"'\\]*\.mp4[^\s"'\\]*/gi) ||
                          html.match(/https?:\/\/[^\s"']+cdninstagram\.com[^\s"']*\.mp4[^\s"']*/gi);
        if (mp4Matches && mp4Matches.length > 0) {
          const directStream = cleanEscapeChars(mp4Matches[0]);
          if (directStream.startsWith('http')) {
            videoUrl = directStream;
            mediaType = 'video';
          }
        }
      }
    }

    // Determine final names and series titles
    seriesTitle = author !== 'Threads' ? `${author} en Threads` : 'Threads';
    if (caption) {
      chapterName = caption.length > 60 ? `${caption.slice(0, 57)}...` : caption;
    } else {
      chapterName = mediaType === 'video' ? `Video de ${author}` : `Publicación de ${author}`;
    }
  } catch (err) {
    console.warn('extractThreadsMedia error:', err);
  }

  // Strategy 3: oEmbed fallback if everything else failed
  if (!videoUrl && images.length === 0) {
    try {
      const oeRes = await fetch(`https://www.threads.net/oembed?url=${encodeURIComponent(cleanUrl)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4000)
      });
      if (oeRes.ok) {
        const oe = await oeRes.json();
        if (oe.author_name) {
          author = `@${oe.author_name}`;
          authorUrl = `https://www.threads.net/@${oe.author_name}`;
        }
        if (oe.title) {
          caption = oe.title;
          chapterName = oe.title;
        }
        if (oe.thumbnail_url) {
          images.push(oe.thumbnail_url);
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    success: images.length > 0 || !!videoUrl,
    chapterName: chapterName || (mediaType === 'video' ? 'Video de Threads' : 'Publicación de Threads'),
    seriesTitle: seriesTitle || 'Threads',
    mediaType,
    videoUrl: videoUrl || undefined,
    audioUrl: videoUrl || undefined,
    hasAudio: !!videoUrl,
    author: author || 'Threads',
    authorUrl,
    images
  };
}
