export interface ImageExportOptions {
  images: string[];
  title?: string;
  format?: 'original' | 'webp' | 'png' | 'jpg';
  archiveType?: 'zip' | 'cbz';
  quality?: number;
  onProgress?: (percent: number, current: number, total: number) => void;
}

// Convert image buffer / blob to target format (WebP, PNG, JPG) using browser canvas
async function convertImageFormat(blob: Blob, targetFormat: 'webp' | 'png' | 'jpg', quality = 0.92): Promise<Blob> {
  if (typeof window === 'undefined') return blob;
  
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(blob);
        return;
      }
      
      // If JPG, fill white background for transparent PNGs
      if (targetFormat === 'jpg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, 0, 0);
      
      const mimeType = targetFormat === 'webp' ? 'image/webp' : targetFormat === 'png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob((convertedBlob) => {
        resolve(convertedBlob || blob);
      }, mimeType, quality);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    
    img.src = url;
  });
}

// Fetch single image through proxy
async function fetchImageBlob(imgUrl: string): Promise<{ blob: Blob; ext: string } | null> {
  const cleanUrl = imgUrl.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  const fetchUrl = cleanUrl.startsWith('/api/proxy-image')
    ? cleanUrl
    : (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))
      ? `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`
      : cleanUrl;

  try {
    const res = await fetch(fetchUrl);
    if (res.ok) {
      const blob = await res.blob();
      // Ensure we received an actual image binary, not an error HTML page
      if (blob.size > 200 && !blob.type.includes('html') && !blob.type.includes('text')) {
        const ext = inferExtension(blob.type, cleanUrl);
        return { blob, ext };
      }
    }

    // Direct fallback if original was full URL
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      const direct = await fetch(cleanUrl);
      if (direct.ok) {
        const b = await direct.blob();
        if (b.size > 200 && !b.type.includes('html') && !b.type.includes('text')) {
          const ext = inferExtension(b.type, cleanUrl);
          return { blob: b, ext };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function inferExtension(mimeType: string, url: string): string {
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('avif')) return 'avif';
  
  const match = url.match(/\.(webp|png|jpe?g|gif|avif)/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadSingleImage(imgUrl: string, filename?: string): Promise<boolean> {
  try {
    const res = await fetchImageBlob(imgUrl);
    if (!res) return false;
    const finalName = filename || `manga_page_${Date.now()}.${res.ext}`;
    triggerDownload(res.blob, finalName);
    return true;
  } catch (err) {
    console.error('Download single image error:', err);
    return false;
  }
}

/**
 * Package images into a high-speed ZIP or CBZ bundle with optional format conversion (WebP, JPG, PNG)
 */
export async function exportImagesPackage(options: ImageExportOptions): Promise<boolean> {
  const {
    images,
    title = 'Liquid_Images',
    format = 'original',
    archiveType = 'zip',
    quality = 0.92,
    onProgress
  } = options;

  if (!images || images.length === 0) {
    throw new Error('No images to export');
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const total = images.length;
  let completed = 0;

  // Process in batches of 4 for maximum browser throughput without network saturation
  const batchSize = 4;
  for (let i = 0; i < images.length; i += batchSize) {
    const chunk = images.slice(i, i + batchSize);
    
    await Promise.all(
      chunk.map(async (imgUrl, chunkIndex) => {
        const globalIndex = i + chunkIndex;
        const result = await fetchImageBlob(imgUrl);
        
        if (result) {
          let finalBlob = result.blob;
          let finalExt = result.ext;
          
          if (format !== 'original') {
            finalBlob = await convertImageFormat(result.blob, format, quality);
            finalExt = format;
          }
          
          const padLength = Math.max(3, String(total).length);
          const filename = `image_${String(globalIndex + 1).padStart(padLength, '0')}.${finalExt}`;
          
          zip.file(filename, finalBlob);
        }
        
        completed++;
        if (onProgress) {
          const percent = Math.round((completed / total) * 100);
          onProgress(percent, completed, total);
        }
      })
    );
  }

  // Generate metadata info file in zip
  zip.file('info.json', JSON.stringify({
    title,
    totalImages: completed,
    exportedAt: new Date().toISOString(),
    generator: 'Liquid Fast Download - Image Engine'
  }, null, 2));

  // Generate archive blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE'
  });

  const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'Images_Package';
  const fileExt = archiveType === 'cbz' ? 'cbz' : 'zip';
  const finalFilename = `${sanitizedTitle}.${fileExt}`;

  triggerDownload(zipBlob, finalFilename);
  return true;
}

/**
 * Requirement 3: CBZ Selección - Export each selected chapter as an individual separate CBZ file.
 * Respects sequential mode (1 by 1) vs simultaneous mode (parallel downloads).
 */
export async function exportSelectedChaptersIndividualCbz(
  trackerTitle: string,
  chapters: Array<{ id?: string | number; name?: string; images?: string[] }>,
  isSequential = false,
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<boolean> {
  const validChapters = chapters.filter(ch => ch.images && ch.images.length > 0);
  if (validChapters.length === 0) {
    throw new Error('No hay capítulos con imágenes disponibles para exportar');
  }

  const { default: JSZip } = await import('jszip');
  const total = validChapters.length;
  let completed = 0;

  const processChapter = async (ch: { id?: string | number; name?: string; images?: string[] }, idx: number) => {
    const zip = new JSZip();
    const images = ch.images || [];
    const chTotal = images.length;
    
    // Batch fetch chapter images
    const batchSize = 6;
    for (let i = 0; i < images.length; i += batchSize) {
      const chunk = images.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (imgUrl, chunkIndex) => {
          const globalIndex = i + chunkIndex;
          const result = await fetchImageBlob(imgUrl);
          if (result) {
            const padLength = Math.max(3, String(chTotal).length);
            const filename = `page_${String(globalIndex + 1).padStart(padLength, '0')}.${result.ext}`;
            zip.file(filename, result.blob);
          }
        })
      );
    }

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const safeTitle = (trackerTitle || 'Manga').replace(/[/\\?%*:|"<>]/g, '_').trim();
    const safeChName = (ch.name || `Capitulo_${idx + 1}`).replace(/[/\\?%*:|"<>]/g, '_').trim();
    const filename = `${safeTitle}_${safeChName}.cbz`;

    triggerDownload(zipBlob, filename);
    completed++;
    if (onProgress) {
      onProgress(Math.round((completed / total) * 100), completed, total);
    }
  };

  if (isSequential) {
    for (let i = 0; i < validChapters.length; i++) {
      await processChapter(validChapters[i], i);
      await new Promise(r => setTimeout(r, 250));
    }
  } else {
    // Mode Simultaneous: parallel workers
    const CONCURRENCY = 3;
    let curIdx = 0;

    const worker = async () => {
      while (curIdx < validChapters.length) {
        const idx = curIdx++;
        if (idx >= validChapters.length) break;
        await processChapter(validChapters[idx], idx);
        await new Promise(r => setTimeout(r, 100));
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, validChapters.length); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);
  }

  return true;
}

