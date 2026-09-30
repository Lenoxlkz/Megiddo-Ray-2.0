import { PlatformDetector } from './types';

function matchesHost(hostname: string, domains: string[]): boolean {
  const host = hostname.toLowerCase();
  return domains.some(d => host === d || host.endsWith(`.${d}`));
}

/**
 * YouTube Detector
 */
export const YouTubeDetector: PlatformDetector = {
  id: 'youtube',
  name: 'YouTube',
  canHandle: (urlObj) => {
    return matchesHost(urlObj.hostname, ['youtube.com', 'youtu.be']);
  },
  detect: (urlObj) => {
    const path = urlObj.pathname.toLowerCase();
    const isShorts = path.includes('/shorts/');
    const isWatch = path.includes('/watch') || urlObj.searchParams.has('v');
    const isYoutuBe = urlObj.hostname.includes('youtu.be');

    return {
      platform: 'youtube',
      platformName: 'YouTube',
      platformNameEn: 'YouTube',
      category: 'video',
      suggestedCategory: 'video',
      confidence: 'high',
      confidenceScore: 0.98,
      needsConfirmation: false,
      reason: isShorts
        ? 'YouTube Shorts detectado con alta certeza'
        : isWatch || isYoutuBe
        ? 'Video de YouTube detectado con alta certeza'
        : 'Enlace de YouTube detectado',
      reasonEn: isShorts
        ? 'YouTube Shorts detected with high certainty'
        : isWatch || isYoutuBe
        ? 'YouTube video detected with high certainty'
        : 'YouTube link detected',
      supportedCategories: ['video'],
      extractorAvailable: true,
    };
  },
};

/**
 * TikTok Detector
 */
export const TikTokDetector: PlatformDetector = {
  id: 'tiktok',
  name: 'TikTok',
  canHandle: (urlObj) => {
    return matchesHost(urlObj.hostname, ['tiktok.com']);
  },
  detect: (urlObj) => {
    const path = urlObj.pathname.toLowerCase();
    const isShort = matchesHost(urlObj.hostname, ['vm.tiktok.com', 'vt.tiktok.com']);
    
    // Explicit photo carousel
    if (path.includes('/photo/')) {
      return {
        platform: 'tiktok',
        platformName: 'TikTok',
        category: 'image',
        suggestedCategory: 'image',
        confidence: 'high',
        confidenceScore: 0.95,
        needsConfirmation: false,
        reason: 'Carrusel de fotos de TikTok identificado en la ruta',
        reasonEn: 'TikTok photo carousel identified in path',
        supportedCategories: ['video', 'image'],
        extractorAvailable: true,
      };
    }

    // Explicit video
    if (path.includes('/video/') || path.includes('/v/')) {
      return {
        platform: 'tiktok',
        platformName: 'TikTok',
        category: 'video',
        suggestedCategory: 'video',
        confidence: 'high',
        confidenceScore: 0.95,
        needsConfirmation: false,
        reason: 'Video de TikTok identificado en la ruta',
        reasonEn: 'TikTok video identified in path',
        supportedCategories: ['video', 'image'],
        extractorAvailable: true,
      };
    }

    // Shortlink or generic profile share
    return {
      platform: 'tiktok',
      platformName: 'TikTok',
      category: 'video',
      suggestedCategory: 'video',
      confidence: 'medium',
      confidenceScore: 0.65,
      needsConfirmation: true,
      reason: isShort
        ? 'Enlace corto de TikTok; puede ser video o galería de fotos'
        : 'Publicación de TikTok que requiere verificar si es video o fotos',
      reasonEn: isShort
        ? 'TikTok short link; could be video or photo gallery'
        : 'TikTok post requiring confirmation of video or photos',
      supportedCategories: ['video', 'image'],
      extractorAvailable: true,
    };
  },
};

/**
 * Instagram Detector
 */
export const InstagramDetector: PlatformDetector = {
  id: 'instagram',
  name: 'Instagram',
  canHandle: (urlObj) => {
    return matchesHost(urlObj.hostname, ['instagram.com', 'instagr.am']);
  },
  detect: (urlObj) => {
    const path = urlObj.pathname.toLowerCase();

    // Reels are definitely videos
    if (path.includes('/reel/') || path.includes('/reels/')) {
      return {
        platform: 'instagram',
        platformName: 'Instagram',
        category: 'video',
        suggestedCategory: 'video',
        confidence: 'high',
        confidenceScore: 0.95,
        needsConfirmation: false,
        reason: 'Reel de Instagram identificado (Video)',
        reasonEn: 'Instagram Reel identified (Video)',
        supportedCategories: ['video', 'image'],
        extractorAvailable: true,
      };
    }

    // IGTV is definitely video
    if (path.includes('/tv/')) {
      return {
        platform: 'instagram',
        platformName: 'Instagram',
        category: 'video',
        suggestedCategory: 'video',
        confidence: 'high',
        confidenceScore: 0.95,
        needsConfirmation: false,
        reason: 'IGTV de Instagram identificado (Video)',
        reasonEn: 'Instagram TV identified (Video)',
        supportedCategories: ['video', 'image'],
        extractorAvailable: true,
      };
    }

    // Standard posts (/p/) can be a photo, a carousel of photos, or a video post
    if (path.includes('/p/')) {
      return {
        platform: 'instagram',
        platformName: 'Instagram',
        category: 'video',
        suggestedCategory: 'video',
        confidence: 'medium',
        confidenceScore: 0.60,
        needsConfirmation: true,
        reason: 'Publicación de Instagram (/p/); puede contener video o carrusel de fotos',
        reasonEn: 'Instagram post (/p/); may contain video or photo carousel',
        supportedCategories: ['video', 'image'],
        extractorAvailable: true,
      };
    }

    return {
      platform: 'instagram',
      platformName: 'Instagram',
      category: 'video',
      suggestedCategory: 'video',
      confidence: 'medium',
      confidenceScore: 0.55,
      needsConfirmation: true,
      reason: 'Enlace de Instagram; confirma si deseas extraer como video o imágenes',
      reasonEn: 'Instagram link; confirm whether to extract as video or images',
      supportedCategories: ['video', 'image'],
      extractorAvailable: true,
    };
  },
};

/**
 * Facebook Detector
 */
export const FacebookDetector: PlatformDetector = {
  id: 'facebook',
  name: 'Facebook',
  canHandle: (urlObj) => {
    return matchesHost(urlObj.hostname, ['facebook.com', 'fb.watch', 'fb.com']);
  },
  detect: (urlObj) => {
    const path = urlObj.pathname.toLowerCase();
    const isWatch = urlObj.hostname.includes('fb.watch') || path.includes('/watch') || path.includes('/videos/') || path.includes('/reel/');

    if (isWatch) {
      return {
        platform: 'facebook',
        platformName: 'Facebook',
        category: 'video',
        suggestedCategory: 'video',
        confidence: 'high',
        confidenceScore: 0.95,
        needsConfirmation: false,
        reason: 'Video o Reel de Facebook identificado',
        reasonEn: 'Facebook video or Reel identified',
        supportedCategories: ['video', 'image'],
        extractorAvailable: true,
      };
    }

    if (path.includes('/photo') || path.includes('/photos/')) {
      return {
        platform: 'facebook',
        platformName: 'Facebook',
        category: 'image',
        suggestedCategory: 'image',
        confidence: 'high',
        confidenceScore: 0.90,
        needsConfirmation: false,
        reason: 'Fotografía de Facebook identificada',
        reasonEn: 'Facebook photo identified',
        supportedCategories: ['image', 'video'],
        extractorAvailable: true,
      };
    }

    return {
      platform: 'facebook',
      platformName: 'Facebook',
      category: 'video',
      suggestedCategory: 'video',
      confidence: 'medium',
      confidenceScore: 0.60,
      needsConfirmation: true,
      reason: 'Publicación de Facebook que puede ser video o fotos',
      reasonEn: 'Facebook post that may be video or photos',
      supportedCategories: ['video', 'image'],
      extractorAvailable: true,
    };
  },
};

/**
 * X / Twitter Detector
 */
export const XDetector: PlatformDetector = {
  id: 'x',
  name: 'X (Twitter)',
  canHandle: (urlObj) => {
    return matchesHost(urlObj.hostname, [
      'twitter.com',
      'x.com',
      'fxtwitter.com',
      'vxtwitter.com',
      'fixupx.com',
    ]);
  },
  detect: (urlObj) => {
    const path = urlObj.pathname.toLowerCase();
    const isStatus = path.includes('/status/');

    if (isStatus) {
      return {
        platform: 'x',
        platformName: 'X (Twitter)',
        category: 'video',
        suggestedCategory: 'video',
        confidence: 'medium',
        confidenceScore: 0.65,
        needsConfirmation: true,
        reason: 'Publicación de X/Twitter; puede contener video, GIF o galería de imágenes',
        reasonEn: 'X/Twitter post; may contain video, GIF or image gallery',
        supportedCategories: ['video', 'image'],
        extractorAvailable: true,
      };
    }

    return {
      platform: 'x',
      platformName: 'X (Twitter)',
      category: 'video',
      suggestedCategory: 'video',
      confidence: 'low',
      confidenceScore: 0.40,
      needsConfirmation: true,
      reason: 'Enlace de X/Twitter no asociado a un tweet directo',
      reasonEn: 'X/Twitter link not associated with a direct tweet',
      supportedCategories: ['video', 'image'],
      extractorAvailable: true,
    };
  },
};

/**
 * Threads Detector
 */
export const ThreadsDetector: PlatformDetector = {
  id: 'threads',
  name: 'Threads',
  canHandle: (urlObj) => {
    return matchesHost(urlObj.hostname, ['threads.net', 'threads.com']);
  },
  detect: (urlObj) => {
    const path = urlObj.pathname.toLowerCase();
    const isPost = path.includes('/post/');

    return {
      platform: 'threads',
      platformName: 'Threads',
      category: 'video',
      suggestedCategory: 'video',
      confidence: isPost ? 'medium' : 'low',
      confidenceScore: isPost ? 0.65 : 0.40,
      needsConfirmation: true,
      reason: 'Publicación de Threads con posible video o imágenes',
      reasonEn: 'Threads post with possible video or images',
      supportedCategories: ['video', 'image'],
      extractorAvailable: true,
    };
  },
};

/**
 * Olympus Scanlation Detector
 */
export const OlympusScanDetector: PlatformDetector = {
  id: 'olympusscan',
  name: 'Olympus Scan',
  canHandle: (urlObj) => {
    return matchesHost(urlObj.hostname, [
      'olympusxyz.com',
      'olympusbiblioteca.com',
      'imagesolymp.xyz',
      'panel.olympusxyz.com',
    ]);
  },
  detect: () => {
    return {
      platform: 'olympusscan',
      platformName: 'Olympus Scan',
      category: 'manga',
      suggestedCategory: 'manga',
      confidence: 'high',
      confidenceScore: 0.98,
      needsConfirmation: false,
      reason: 'Portal de lectura manga/manhwa Olympus Scan identificado',
      reasonEn: 'Olympus Scan manga/manhwa reader portal identified',
      supportedCategories: ['manga'],
      extractorAvailable: true,
    };
  },
};

/**
 * ManhwaWeb Detector
 */
export const ManhwaWebDetector: PlatformDetector = {
  id: 'manhwaweb',
  name: 'ManhwaWeb',
  canHandle: (urlObj) => {
    return matchesHost(urlObj.hostname, ['manhwaweb.com', 'manhwawebbackend-production.up.railway.app']);
  },
  detect: () => {
    return {
      platform: 'manhwaweb',
      platformName: 'ManhwaWeb',
      category: 'manga',
      suggestedCategory: 'manga',
      confidence: 'high',
      confidenceScore: 0.98,
      needsConfirmation: false,
      reason: 'Portal de lectura ManhwaWeb identificado',
      reasonEn: 'ManhwaWeb reader portal identified',
      supportedCategories: ['manga'],
      extractorAvailable: true,
    };
  },
};

/**
 * Direct Image Detector
 */
export const DirectImageDetector: PlatformDetector = {
  id: 'direct_image',
  name: 'Imagen Directa',
  canHandle: (urlObj) => {
    const path = urlObj.pathname.toLowerCase();
    const hasImageExt = /\.(jpeg|jpg|png|webp|gif|avif)($|\?)/i.test(path);
    const isImageCdn = urlObj.hostname.includes('tiktokcdn') || urlObj.hostname.includes('fbcdn.net');
    return hasImageExt || isImageCdn;
  },
  detect: () => {
    return {
      platform: 'direct_image',
      platformName: 'Imagen Web',
      platformNameEn: 'Web Image',
      category: 'image',
      suggestedCategory: 'image',
      confidence: 'high',
      confidenceScore: 0.99,
      needsConfirmation: false,
      reason: 'Enlace directo a archivo de imagen estática',
      reasonEn: 'Direct link to static image file',
      supportedCategories: ['image'],
      extractorAvailable: true,
    };
  },
};

/**
 * Manga Keywords Reader Detector (Capibara, ImperioManhua, Webtoons, MangaDex, etc.)
 */
export const GenericMangaDetector: PlatformDetector = {
  id: 'unknown',
  name: 'Lector Manga/Webtoon',
  canHandle: (urlObj) => {
    const full = (urlObj.hostname + urlObj.pathname).toLowerCase();
    return (
      full.includes('manga') ||
      full.includes('manhua') ||
      full.includes('manhwa') ||
      full.includes('webtoon') ||
      full.includes('capitulo') ||
      full.includes('chapter') ||
      full.includes('scan') ||
      full.includes('lector')
    );
  },
  detect: () => {
    return {
      platform: 'unknown',
      platformName: 'Lector Manga/Webtoon (Genérico)',
      platformNameEn: 'Manga/Webtoon Reader (Generic)',
      category: 'manga',
      suggestedCategory: 'manga',
      confidence: 'medium',
      confidenceScore: 0.60,
      needsConfirmation: true,
      reason: 'Estructura de enlace compatible con lector de capítulos de manga/webtoon',
      reasonEn: 'Link structure compatible with manga/webtoon reader',
      supportedCategories: ['manga', 'image'],
      extractorAvailable: true,
    };
  },
};
