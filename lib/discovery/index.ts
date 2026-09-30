import { DiscoveredContent, DiscoveredChapterItem } from './types';
import { detectUrl } from '@/lib/detector';
import { evaluateServerCapacity, formatBytes } from '@/lib/serverGuardian';
import { resolveDownloadCapability } from '@/lib/downloadResolver';
import { resolveVideoPreview, VideoPreviewResolution } from '@/lib/videoPreviewResolver';
import {
  extractYouTubeMedia,
  extractTikTokMedia,
  extractInstagramMedia,
  extractTwitterMedia,
  extractFacebookMedia,
  extractThreadsMedia,
  runYtDlpMetadata,
} from '@/lib/mediaExtractor';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': '*/*',
};

// Ultra-fast in-memory discovery cache (instant 0ms response on repeat queries)
const discoveryCache = new Map<string, { data: DiscoveredContent; timestamp: number }>();

/**
 * Format seconds to hh:mm:ss or mm:ss
 */
function formatDuration(seconds?: number): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function parseIsoDuration(isoStr?: string): number | undefined {
  if (!isoStr) return undefined;
  const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return undefined;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : undefined;
}

/**
 * Probe a remote URL with HTTP HEAD request to discover Content-Length and Content-Type
 * without downloading body bytes. Falls back to lightweight Range request if needed.
 */
async function probeRemoteUrlHead(url: string): Promise<{
  contentLength?: number;
  contentType?: string;
  acceptRanges?: boolean;
  canProbeRange?: boolean;
}> {
  try {
    const headRes = await fetch(url, {
      method: 'HEAD',
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });

    const lenStr = headRes.headers.get('content-length');
    const typeStr = headRes.headers.get('content-type') || undefined;
    const ranges = headRes.headers.get('accept-ranges') === 'bytes';

    const contentLength = lenStr ? parseInt(lenStr, 10) : undefined;
    if (contentLength && !isNaN(contentLength) && contentLength > 0) {
      return { contentLength, contentType: typeStr, acceptRanges: ranges, canProbeRange: ranges };
    }

    // If HEAD didn't return content-length, attempt a 0-1 byte Range request to inspect headers
    if (ranges || !headRes.ok) {
      const rangeRes = await fetch(url, {
        method: 'GET',
        headers: {
          ...BROWSER_HEADERS,
          'Range': 'bytes=0-1024', // Probe first 1KB only
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(3500),
      });

      const cr = rangeRes.headers.get('content-range'); // e.g. "bytes 0-1024/10485760"
      if (cr) {
        const match = cr.match(/\/(\d+)$/);
        if (match) {
          const totalBytes = parseInt(match[1], 10);
          return {
            contentLength: totalBytes,
            contentType: rangeRes.headers.get('content-type') || typeStr,
            acceptRanges: true,
            canProbeRange: true,
          };
        }
      }
      return {
        contentType: rangeRes.headers.get('content-type') || typeStr,
        acceptRanges: true,
        canProbeRange: true,
      };
    }

    return { contentType: typeStr, acceptRanges: ranges };
  } catch {
    return {};
  }
}

/**
 * Core Discovery & Inspection Engine
 * Analyzes URL, extracts metadata, identifies remote thumbnail references,
 * estimates sizes, and checks server safety capacity WITHOUT downloading full content.
 */
export async function discoverContentMetadata(rawUrl: string): Promise<DiscoveredContent> {
  const cleanUrl = rawUrl.trim();

  // Instant cache retrieval: Returns in 0ms for repeated URL queries
  const cacheKey = cleanUrl.toLowerCase();
  const cachedEntry = discoveryCache.get(cacheKey);
  if (cachedEntry && Date.now() - cachedEntry.timestamp < 10 * 60 * 1000) {
    return cachedEntry.data;
  }

  const detection = detectUrl(cleanUrl);
  const platform = detection.platform;
  const platformName = detection.platformName;
  let category: 'manga' | 'video' | 'image' = detection.category === 'manga' ? 'manga' : (detection.category === 'video' ? 'video' : 'image');

  let title = 'Contenido Detectado';
  let author: string | undefined;
  let authorUrl: string | undefined;
  let description: string | undefined;
  let thumbnailUrl: string | undefined;
  let thumbnailSource: DiscoveredContent['thumbnailSource'] = 'fallback';
  let duration: number | undefined;
  let resolution: string | undefined;
  let format: string | undefined;
  let estimatedSizeBytes: number | undefined;
  let exactSizeKnown = false;
  let directResourceUrl: string | undefined;
  let audioUrl: string | undefined;
  let videoEmbedUrl: string | undefined;
  let items: DiscoveredChapterItem[] | undefined;
  let totalPages: number | undefined;

  // 1. YOUTUBE DISCOVERY (Metadata & Stream links without downloading video body)
  if (platform === 'youtube') {
    category = 'video';
    const ytVideoIdMatch = cleanUrl.match(/(?:v=|shorts\/|youtu\.be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/i);
    const videoId = ytVideoIdMatch ? ytVideoIdMatch[1] : '';

    if (videoId) {
      // Use hqdefault which is guaranteed to exist for all YouTube videos (maxresdefault 404s on non-HD/DMAX videos)
      thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      thumbnailSource = 'platform';
      videoEmbedUrl = `https://www.youtube.com/embed/${videoId}`;
    }

    // Ultra-fast parallel execution:
    // 1. YouTube oEmbed (100-200ms) for verified Title and Author
    // 2. Watch page HTML scrape (150-300ms) for accurate Duration
    // 3. Optional yt-dlp metadata cached or fast race (1500ms)
    const oembedPromise = videoId
      ? fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(1800),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null);

    const watchPagePromise = videoId
      ? fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(1800),
        })
          .then(async (r) => (r.ok ? await r.text() : ''))
          .catch(() => '')
      : Promise.resolve('');

    const fastYtDlpPromise = Promise.race([
      runYtDlpMetadata(cleanUrl),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
    ]).catch(() => null);

    const [oeData, watchHtml, ytMeta] = await Promise.all([
      oembedPromise,
      watchPagePromise,
      fastYtDlpPromise
    ]);

    if (oeData) {
      if (oeData.title) title = oeData.title;
      if (oeData.author_name) author = oeData.author_name;
      if (oeData.author_url) authorUrl = oeData.author_url;
      if (oeData.thumbnail_url && !thumbnailUrl) {
        thumbnailUrl = oeData.thumbnail_url;
        thumbnailSource = 'oembed';
      }
    }

    if (watchHtml) {
      const durMatch =
        watchHtml.match(/itemprop="duration"\s+content="([^"]+)"/i) ||
        watchHtml.match(/"approxDurationMs":"(\d+)"/i);
      if (durMatch) {
        if (durMatch[1].startsWith('PT')) {
          duration = parseIsoDuration(durMatch[1]);
        } else if (!isNaN(Number(durMatch[1]))) {
          duration = Math.round(Number(durMatch[1]) / 1000);
        }
      }
      if (!title || title === 'Contenido Detectado') {
        const titleMatch = watchHtml.match(/<title>([\s\S]*?) - YouTube<\/title>/i) || watchHtml.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleMatch) title = titleMatch[1].trim();
      }
    }

    if (ytMeta) {
      if (ytMeta.title && (!title || title === 'Contenido Detectado')) title = ytMeta.title;
      if (ytMeta.author && !author) author = ytMeta.author;
      if (ytMeta.duration && !duration) duration = ytMeta.duration;
      if (ytMeta.resolution) resolution = ytMeta.resolution;
      if (ytMeta.filesize && ytMeta.filesize > 0) {
        estimatedSizeBytes = ytMeta.filesize;
        exactSizeKnown = true;
      }
      if (ytMeta.url) directResourceUrl = ytMeta.url;
      if (ytMeta.audioUrl) audioUrl = ytMeta.audioUrl;
    }

    if (!directResourceUrl) {
      try {
        const ytData = await extractYouTubeMedia(cleanUrl);
        if (ytData.videoUrl) directResourceUrl = ytData.videoUrl;
        if (ytData.audioUrl) audioUrl = ytData.audioUrl;
        if (ytData.chapterName && (!title || title === 'Contenido Detectado')) title = ytData.chapterName;
        if (ytData.author && !author) author = ytData.author;
        if (ytData.duration && !duration) duration = ytData.duration;
        if (ytData.filesize && ytData.filesize > 0) {
          estimatedSizeBytes = ytData.filesize;
          exactSizeKnown = true;
        }
      } catch {
        // Ignore
      }
    }

    // Size calculation: If not provided directly, calculate realistically from duration or bitrate
    if (!estimatedSizeBytes && duration && duration > 0) {
      // ~350 KB/s for 720p HD stream (~2.8 Mbps)
      estimatedSizeBytes = Math.round(duration * 350 * 1024);
    } else if (!estimatedSizeBytes) {
      // Fallback ~25 MB if completely unmeasured
      estimatedSizeBytes = 25 * 1024 * 1024;
    }
    format = 'mp4';
  }

  // 2. TIKTOK DISCOVERY
  else if (platform === 'tiktok') {
    try {
      const tkData = await extractTikTokMedia(cleanUrl);
      if (tkData.chapterName) title = tkData.chapterName;
      if (tkData.author) author = tkData.author;
      if (tkData.videoUrl) directResourceUrl = tkData.videoUrl;
      if (tkData.audioUrl) audioUrl = tkData.audioUrl;

      if (tkData.images && tkData.images.length > 0) {
        thumbnailUrl = tkData.images[0];
        thumbnailSource = 'platform';
      }

      if (tkData.mediaType === 'image' || (!tkData.videoUrl && tkData.images && tkData.images.length > 1)) {
        category = 'image';
        items = (tkData.images || []).map((img, i) => ({
          id: `img_${i + 1}`,
          title: `Imagen ${i + 1}`,
          url: img,
          thumbnailUrl: img,
          pageCount: 1,
          pages: [img],
          estimatedSizeBytes: 350 * 1024,
          estimatedSizeFormatted: '~350 KB',
        }));
        totalPages = items.length;
        estimatedSizeBytes = items.length * 350 * 1024;
      } else {
        category = 'video';
        format = 'mp4';
        // Check HEAD of direct video link for exact size if available
        if (directResourceUrl) {
          const probe = await probeRemoteUrlHead(directResourceUrl);
          if (probe.contentLength) {
            estimatedSizeBytes = probe.contentLength;
            exactSizeKnown = true;
          }
        }
        if (!estimatedSizeBytes) {
          estimatedSizeBytes = 8 * 1024 * 1024; // Typical TikTok ~8MB
        }
      }
    } catch (tkErr) {
      console.warn('TikTok discovery fallback:', tkErr);
    }
  }

  // 3. TWITTER / X DISCOVERY
  else if (platform === 'x' || (platform as string) === 'twitter') {
    try {
      const twData = await extractTwitterMedia(cleanUrl);
      if (twData.chapterName) title = twData.chapterName;
      if (twData.author) author = twData.author;
      if (twData.authorUrl) authorUrl = twData.authorUrl;
      if (twData.videoUrl) {
        directResourceUrl = twData.videoUrl;
        category = 'video';
        format = 'mp4';
      } else {
        category = 'image';
      }

      if (twData.images && twData.images.length > 0) {
        thumbnailUrl = twData.images[0];
        thumbnailSource = 'platform';
        if (category === 'image') {
          items = twData.images.map((img, i) => ({
            id: `img_${i + 1}`,
            title: `Foto ${i + 1}`,
            url: img,
            thumbnailUrl: img,
            pageCount: 1,
            pages: [img],
            estimatedSizeBytes: 500 * 1024,
            estimatedSizeFormatted: '~500 KB',
          }));
          totalPages = items.length;
          estimatedSizeBytes = items.length * 500 * 1024;
        }
      }

      if (category === 'video' && directResourceUrl) {
        const probe = await probeRemoteUrlHead(directResourceUrl);
        if (probe.contentLength) {
          estimatedSizeBytes = probe.contentLength;
          exactSizeKnown = true;
        } else {
          estimatedSizeBytes = 12 * 1024 * 1024; // ~12MB estimated
        }
      }
    } catch (twErr) {
      console.warn('Twitter discovery fallback:', twErr);
    }
  }

  // 4. INSTAGRAM & THREADS DISCOVERY
  else if (platform === 'instagram' || platform === 'threads') {
    try {
      const igData = platform === 'threads' ? await extractThreadsMedia(cleanUrl) : await extractInstagramMedia(cleanUrl);
      if (igData.chapterName) title = igData.chapterName;
      if (igData.author) author = igData.author;
      if (igData.videoUrl) {
        directResourceUrl = igData.videoUrl;
        category = 'video';
        format = 'mp4';
      } else {
        category = 'image';
      }

      if (igData.images && igData.images.length > 0) {
        thumbnailUrl = igData.images[0];
        thumbnailSource = 'platform';
        if (category === 'image') {
          items = igData.images.map((img, i) => ({
            id: `img_${i + 1}`,
            title: `Imagen ${i + 1}`,
            url: img,
            thumbnailUrl: img,
            pageCount: 1,
            pages: [img],
            estimatedSizeBytes: 400 * 1024,
            estimatedSizeFormatted: '~400 KB',
          }));
          totalPages = items.length;
          estimatedSizeBytes = items.length * 400 * 1024;
        }
      }

      if (category === 'video') {
        estimatedSizeBytes = 15 * 1024 * 1024;
      }
    } catch (igErr) {
      console.warn('Instagram/Threads discovery fallback:', igErr);
    }
  }

  // 5. FACEBOOK DISCOVERY
  else if (platform === 'facebook') {
    try {
      const fbData = await extractFacebookMedia(cleanUrl);
      if (fbData.chapterName) title = fbData.chapterName;
      if (fbData.author) author = fbData.author;
      if (fbData.videoUrl) {
        directResourceUrl = fbData.videoUrl;
        category = 'video';
        format = 'mp4';
      }
      if (fbData.images && fbData.images.length > 0) {
        thumbnailUrl = fbData.images[0];
        thumbnailSource = 'platform';
      }
      estimatedSizeBytes = 25 * 1024 * 1024;
    } catch (fbErr) {
      console.warn('Facebook discovery fallback:', fbErr);
    }
  }

  // 6. MANGA & COMICS DISCOVERY (MangaDex, Olympus, ManhwaWeb, etc.)
  else if (category === 'manga' || platform === 'olympusscan' || platform === 'manhwaweb' || (platform as string) === 'mangadex') {
    category = 'manga';
    format = 'cbz / pdf';

    // Call /api/chapters endpoint to retrieve chapters list & page counts without downloading image files
    try {
      // Fetch chapter listings from the existing backend engine
      const chUrl = new URL('/api/chapters', 'http://localhost:3000');
      const chRes = await fetch(chUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });

      if (chRes.ok) {
        const chData = await chRes.json();
        if (chData.seriesTitle) title = chData.seriesTitle;
        if (chData.author) author = chData.author;
        if (chData.coverUrl || chData.thumbnailUrl) {
          thumbnailUrl = chData.coverUrl || chData.thumbnailUrl;
          thumbnailSource = 'platform';
        }

        const rawChapters: any[] = chData.chapters || [];
        let totalPagesAccum = 0;
        let totalBytesAccum = 0;

        items = rawChapters.map((rc, idx) => {
          const chPages: string[] = rc.images || [];
          const pageCount = chPages.length > 0 ? chPages.length : (rc.imageCount || 30);
          totalPagesAccum += pageCount;

          // Estimate ~850 KB per manga page
          const chEstimatedBytes = pageCount * 850 * 1024;
          totalBytesAccum += chEstimatedBytes;

          return {
            id: rc.id || idx + 1,
            chapterNumber: rc.id || idx + 1,
            title: rc.name || `Capítulo ${idx + 1}`,
            name: rc.name || `Capítulo ${idx + 1}`,
            url: rc.url || cleanUrl,
            thumbnailUrl: chPages[0] || thumbnailUrl,
            pageCount,
            pages: chPages, // Keep remote URLs as references only, do not download!
            estimatedSizeBytes: chEstimatedBytes,
            estimatedSizeFormatted: formatBytes(chEstimatedBytes),
          };
        });

        totalPages = totalPagesAccum;
        estimatedSizeBytes = totalBytesAccum;
        if (items.length > 0 && !thumbnailUrl && items[0].thumbnailUrl) {
          thumbnailUrl = items[0].thumbnailUrl;
          thumbnailSource = 'platform';
        }
      }
    } catch (mangaErr) {
      console.warn('Manga discovery fetch error:', mangaErr);
    }

    if (!items || items.length === 0) {
      // Fallback single chapter representation
      items = [{
        id: 1,
        title: 'Capítulo 1',
        url: cleanUrl,
        pageCount: 35,
        estimatedSizeBytes: 35 * 850 * 1024,
        estimatedSizeFormatted: '~30 MB',
      }];
      totalPages = 35;
      estimatedSizeBytes = 35 * 850 * 1024;
    }
  }

  // 7. DIRECT MEDIA / GENERIC URL PROBE
  else {
    const probe = await probeRemoteUrlHead(cleanUrl);
    if (probe.contentLength) {
      estimatedSizeBytes = probe.contentLength;
      exactSizeKnown = true;
    }

    const cType = probe.contentType?.toLowerCase() || '';
    if (cType.includes('video') || cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov')) {
      category = 'video';
      format = 'mp4';
      directResourceUrl = cleanUrl;
      title = cleanUrl.split('/').pop()?.split('?')[0] || 'Video';
    } else if (cType.includes('image') || cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp')) {
      category = 'image';
      format = 'image';
      directResourceUrl = cleanUrl;
      thumbnailUrl = cleanUrl;
      thumbnailSource = 'platform';
      title = cleanUrl.split('/').pop()?.split('?')[0] || 'Imagen';
    } else {
      title = cleanUrl.replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  // 8. RESOLVE AND VALIDATE DOWNLOAD & PREVIEW CAPABILITIES IN PARALLEL
  // Strictly checks whether the direct resource URL really delivers the media or returns disguised HTML / Cookie Check
  const [resolvedDownload, videoPreview] = await Promise.all([
    resolveDownloadCapability(cleanUrl, category, {
      candidateUrl: directResourceUrl,
      filename: `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format || 'mp4'}`,
      estimatedSize: estimatedSizeBytes,
      durationSeconds: duration,
      itemCount: items?.length || 1,
    }),
    category === 'video'
      ? resolveVideoPreview(cleanUrl, {
          candidateUrl: directResourceUrl,
          duration,
          estimatedSize: estimatedSizeBytes,
          title,
        }).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  if (videoPreview?.diagnostics.size && videoPreview.diagnostics.size > 0 && (!estimatedSizeBytes || !exactSizeKnown)) {
    estimatedSizeBytes = videoPreview.diagnostics.size;
    exactSizeKnown = true;
  }

  // Only expose directResourceUrl for local device download if verified valid by resolver!
  const finalLocalDirectUrl = resolvedDownload.canLocal
    ? (resolvedDownload.finalUrl || resolvedDownload.url || directResourceUrl)
    : undefined;

  if (resolvedDownload.size && resolvedDownload.size > 0 && (!estimatedSizeBytes || !exactSizeKnown)) {
    estimatedSizeBytes = resolvedDownload.size;
  }

  // 9. EVALUATE CAPACITY WITH SERVER GUARDIAN ("SALVAVIDAS")
  const guardianEval = evaluateServerCapacity(estimatedSizeBytes, {
    itemCount: items?.length || 1,
    category,
    durationSeconds: duration,
  });

  const durationFormatted = formatDuration(duration);
  const estimatedSizeFormatted = formatBytes(estimatedSizeBytes);

  const result: DiscoveredContent = {
    id: `disc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    originalUrl: rawUrl,
    cleanUrl,
    url: rawUrl,
    platform,
    platformName,
    category,
    type: category,
    title,
    author,
    authorUrl,
    description,
    thumbnailUrl,
    thumbnailSource,
    duration,
    durationFormatted,
    resolution,
    format,
    estimatedSizeBytes,
    estimatedSizeFormatted,
    exactSizeKnown,
    totalItems: items?.length || 1,
    totalPages,
    items,
    directResourceUrl: finalLocalDirectUrl,
    audioUrl,
    videoEmbedUrl,
    previewUrl: videoPreview?.previewUrl,
    videoPreview,
    videoPreviewDiagnostics: videoPreview?.diagnostics,
    resolvedDownload,
    requiresSession: resolvedDownload.requiresSession,
    sessionId: resolvedDownload.sessionId,
    canVerify: resolvedDownload.canVerify,
    downloadCapabilities: {
      internal: resolvedDownload.canInternal,
      local: resolvedDownload.canLocal,
    },
    recommendedMode: resolvedDownload.mode === 'internal' ? 'internal' : 'local',
    recommendationReason: resolvedDownload.reason || guardianEval.reason,
    guardianStatus: {
      isSafeForInternal: resolvedDownload.canInternal,
      isOverLimit: !resolvedDownload.serverSafe,
      warningMessage: guardianEval.warningMessage,
      serverFreeMemMB: guardianEval.serverMetrics.freeMemMB,
      activeInternalJobs: guardianEval.serverMetrics.activeInternalJobs,
      safeLimitMB: guardianEval.serverMetrics.safeLimitMB,
    },
  };

  discoveryCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
