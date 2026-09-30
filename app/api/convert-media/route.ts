import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  extractInstagramMedia,
  extractTikTokMedia,
  extractTwitterMedia,
  extractYouTubeMedia,
  extractFacebookMedia,
  extractThreadsMedia,
  runYtDlpMetadata,
} from '@/lib/mediaExtractor';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
};

let ffmpegAvailableCache: boolean | null = null;

async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailableCache !== null) return ffmpegAvailableCache;
  try {
    const { execFile } = await import('child_process');
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-version'], { timeout: 2000 }, (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
    ffmpegAvailableCache = true;
    return true;
  } catch {
    ffmpegAvailableCache = false;
    return false;
  }
}

async function downloadFileToTemp(fileUrl: string, prefix: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `${prefix}_${uuidv4()}.tmp`);

  if (fileUrl.startsWith('data:')) {
    const commaIdx = fileUrl.indexOf(',');
    const base64Data = commaIdx !== -1 ? fileUrl.slice(commaIdx + 1) : fileUrl;
    await fs.promises.writeFile(tempPath, Buffer.from(base64Data, 'base64'));
    return tempPath;
  }

  const headers: Record<string, string> = { ...BROWSER_HEADERS };
  if (fileUrl.includes('instagram.com') || fileUrl.includes('cdninstagram.com')) {
    headers['Referer'] = 'https://www.instagram.com/';
  } else if (fileUrl.includes('tiktok.com') || fileUrl.includes('tiktokcdn.com')) {
    headers['Referer'] = 'https://www.tiktok.com/';
  } else if (fileUrl.includes('facebook.com') || fileUrl.includes('fbcdn.net')) {
    headers['Referer'] = 'https://www.facebook.com/';
  } else if (fileUrl.includes('youtube.com') || fileUrl.includes('googlevideo.com')) {
    headers['Referer'] = 'https://www.youtube.com/';
  } else if (fileUrl.includes('savenow.to') || fileUrl.includes('loader.to') || fileUrl.includes('affadaffa.com')) {
    headers['Referer'] = 'https://loader.to/';
  }

  const res = await fetch(fileUrl, { headers, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to fetch media from ${fileUrl}: ${res.status}`);
  }

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml') || ct.includes('application/json')) {
    throw new Error(`Upstream returned HTML/JSON (${ct}) instead of binary media`);
  }

  if (res.body) {
    const fileStream = fs.createWriteStream(tempPath);
    await pipeline(Readable.fromWeb(res.body as any), fileStream);
  } else {
    throw new Error(`Empty response body from ${fileUrl}`);
  }

  // Inspect the first bytes of the saved temp file to prevent disguised HTML walls
  try {
    const fd = await fs.promises.open(tempPath, 'r');
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fd.read(buf, 0, 512, 0);
    await fd.close();

    if (bytesRead > 0) {
      const textSample = buf.toString('utf-8', 0, bytesRead).toLowerCase();
      if (
        textSample.includes('<!doctype html') ||
        textSample.includes('<html') ||
        textSample.includes('<head') ||
        textSample.includes('403. that’s an error') ||
        textSample.includes('403 forbidden') ||
        textSample.includes('access denied') ||
        textSample.includes('"error"')
      ) {
        await fs.promises.unlink(tempPath).catch(() => {});
        throw new Error('UPSTREAM_RETURNED_HTML: El servidor remoto devolvió una página HTML en lugar del medio.');
      }
    }
  } catch (inspectErr) {
    if (inspectErr instanceof Error && inspectErr.message.includes('UPSTREAM_RETURNED_HTML')) {
      throw inspectErr;
    }
  }

  return tempPath;
}

/**
 * Universal media stream resolver that unifies extraction across YouTube, TikTok,
 * Instagram, Facebook, X (Twitter), Threads, and generic web/video platforms.
 */
async function resolveAnyMedia(url: string): Promise<{
  videoUrl?: string;
  audioUrl?: string;
  images: string[];
  title?: string;
}> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) return { images: [] };

  // Direct media URLs
  if (/\.(mp4|webm|mkv|mov|m3u8)(\?|$)/i.test(cleanUrl)) {
    return { videoUrl: cleanUrl, images: [] };
  }
  if (/\.(mp3|m4a|aac|wav|ogg|opus)(\?|$)/i.test(cleanUrl)) {
    return { audioUrl: cleanUrl, images: [] };
  }
  if (/\.(jpeg|jpg|png|webp|gif|avif)(\?|$)/i.test(cleanUrl)) {
    return { images: [cleanUrl] };
  }

  // Social platforms
  try {
    if (cleanUrl.includes('instagram.com') || cleanUrl.includes('instagr.am')) {
      const ig = await extractInstagramMedia(cleanUrl);
      if (ig.videoUrl || ig.audioUrl || ig.images.length > 0) {
        return {
          videoUrl: ig.videoUrl,
          audioUrl: ig.audioUrl,
          images: ig.images || [],
          title: ig.chapterName,
        };
      }
    } else if (cleanUrl.includes('tiktok.com')) {
      const tk = await extractTikTokMedia(cleanUrl);
      if (tk.videoUrl || tk.audioUrl || tk.images.length > 0) {
        return {
          videoUrl: tk.videoUrl,
          audioUrl: tk.audioUrl,
          images: tk.images || [],
          title: tk.chapterName,
        };
      }
    } else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
      const yt = await extractYouTubeMedia(cleanUrl);
      if (yt.videoUrl || yt.audioUrl) {
        return {
          videoUrl: yt.videoUrl,
          audioUrl: yt.audioUrl,
          images: yt.images || [],
          title: yt.chapterName,
        };
      }
    } else if (cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch')) {
      const fb = await extractFacebookMedia(cleanUrl);
      if (fb.videoUrl || fb.audioUrl || fb.images.length > 0) {
        return {
          videoUrl: fb.videoUrl,
          audioUrl: fb.audioUrl,
          images: fb.images || [],
          title: fb.chapterName,
        };
      }
    } else if (cleanUrl.includes('x.com') || cleanUrl.includes('twitter.com')) {
      const tw = await extractTwitterMedia(cleanUrl);
      if (tw.videoUrl || tw.audioUrl || tw.images.length > 0) {
        return {
          videoUrl: tw.videoUrl,
          audioUrl: tw.audioUrl,
          images: tw.images || [],
          title: tw.chapterName,
        };
      }
    } else if (cleanUrl.includes('threads.com') || cleanUrl.includes('threads.net')) {
      const th = await extractThreadsMedia(cleanUrl);
      if (th.videoUrl || th.audioUrl || th.images.length > 0) {
        return {
          videoUrl: th.videoUrl,
          audioUrl: th.audioUrl,
          images: th.images || [],
          title: th.chapterName,
        };
      }
    }
  } catch (extractErr) {
    console.warn('Dedicated extractor warning, falling back to yt-dlp:', extractErr);
  }

  // yt-dlp fallback for generic/all web sources
  try {
    const ytdlp = await runYtDlpMetadata(cleanUrl);
    if (ytdlp.url || ytdlp.audioUrl) {
      return {
        videoUrl: ytdlp.url,
        audioUrl: ytdlp.audioUrl,
        images: ytdlp.thumbnail ? [ytdlp.thumbnail] : [],
        title: ytdlp.title,
      };
    }
  } catch {
    // ignore
  }

  return { videoUrl: cleanUrl, images: [] };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawType = (searchParams.get('type') || 'mp3').toLowerCase();
  const type = rawType === 'video' || rawType === 'mp4' ? 'mp4' : rawType;
  let targetUrl = searchParams.get('url') || '';
  let imageUrl = searchParams.get('imageUrl') || '';
  let audioUrl = searchParams.get('audioUrl') || '';
  const filename = searchParams.get('filename') || (type === 'mp3' ? 'audio.mp3' : 'video.mp4');

  return handleMediaConversion({ type, targetUrl, imageUrl, audioUrl, filename });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawType = (body.type || 'mp3').toLowerCase();
    const type = rawType === 'video' || rawType === 'mp4' ? 'mp4' : rawType;
    const targetUrl = body.url || body.targetUrl || '';
    const imageUrl = body.imageUrl || '';
    const audioUrl = body.audioUrl || '';
    const filename = body.filename || (type === 'mp3' ? 'audio.mp3' : 'video.mp4');

    return handleMediaConversion({ type, targetUrl, imageUrl, audioUrl, filename });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

async function handleMediaConversion(params: {
  type: string;
  targetUrl: string;
  imageUrl: string;
  audioUrl: string;
  filename: string;
}) {
  const { type, filename } = params;
  let { targetUrl, imageUrl, audioUrl } = params;
  const tempFilesToClean: string[] = [];

  const cleanup = async () => {
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) await fs.promises.unlink(f);
      } catch {
        // Ignore unlink error
      }
    }
  };

  const hasFfmpeg = await isFfmpegAvailable();

  try {
    // =========================================================================
    // 1. MP3 AUDIO EXPORT (High-Quality 320kbps MP3 Container)
    // =========================================================================
    if (type === 'mp3' || type === 'audio') {
      let resolvedAudioSource = audioUrl;
      let resolvedVideoSource = targetUrl;

      // If we don't have direct audio, resolve through multi-platform extractors
      if (!resolvedAudioSource && targetUrl) {
        const resolved = await resolveAnyMedia(targetUrl);
        if (resolved.audioUrl) resolvedAudioSource = resolved.audioUrl;
        if (resolved.videoUrl) resolvedVideoSource = resolved.videoUrl;
        if (!imageUrl && resolved.images.length > 0) imageUrl = resolved.images[0];
      }

      const mediaSource = resolvedAudioSource || resolvedVideoSource;

      // If FFmpeg is NOT available (e.g. Vercel serverless), stream direct audio source directly!
      if (!hasFfmpeg) {
        if (mediaSource && (mediaSource.startsWith('http://') || mediaSource.startsWith('https://'))) {
          const directStreamRes = await fetch(mediaSource, { headers: BROWSER_HEADERS, redirect: 'follow' });
          if (directStreamRes.ok && directStreamRes.body) {
            const outHeaders = new Headers();
            outHeaders.set('Content-Type', 'audio/mpeg');
            outHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename.endsWith('.mp3') ? filename : `${filename}.mp3`)}"`);
            outHeaders.set('Access-Control-Allow-Origin', '*');
            outHeaders.set('Cache-Control', 'public, max-age=3600');
            return new Response(directStreamRes.body, { headers: outHeaders });
          }
        }
        return NextResponse.json(
          {
            error: 'FFMPEG_UNAVAILABLE',
            message: 'FFmpeg no está instalado en este servidor para transcodificar audio MP3. Utiliza la descarga directa.',
          },
          { status: 503 }
        );
      }

      let ffmpegArgs: string[] = [];

      if (mediaSource && (mediaSource.startsWith('http') || mediaSource.startsWith('data:'))) {
        try {
          const inputTemp = await downloadFileToTemp(mediaSource, 'audio_src');
          tempFilesToClean.push(inputTemp);

          ffmpegArgs = [
            '-threads', '2',
            '-i', inputTemp,
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '320k',
            '-ar', '44100',
            '-f', 'mp3',
            'pipe:1',
          ];
        } catch (downloadErr) {
          console.warn('Failed to download audio file to temp:', downloadErr);
        }
      }

      if (ffmpegArgs.length === 0) {
        await cleanup();
        return NextResponse.json(
          {
            error: 'AUDIO_STREAM_UNAVAILABLE',
            message: 'No se pudo obtener la pista de audio completa para transcodificar a MP3. Por favor, intenta la descarga directa.',
          },
          { status: 422 }
        );
      }

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      const nodeStream = Readable.from(ffmpeg.stdout);
      ffmpeg.on('close', cleanup);
      ffmpeg.on('error', cleanup);

      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk) => controller.enqueue(chunk));
          nodeStream.on('end', () => controller.close());
          nodeStream.on('error', (err) => controller.error(err));
        },
      });

      return new Response(webStream, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename.endsWith('.mp3') ? filename : `${filename}.mp3`)}"`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // =========================================================================
    // 2. MP4 VIDEO EXPORT (H.264 + AAC, faststart, full multi-source compatibility)
    // =========================================================================
    if (type === 'mp4' || type === 'video' || type === 'video_from_image' || type === 'image_with_audio') {
      let finalVideoUrl = targetUrl;
      let finalAudioUrl = audioUrl;
      let finalImageUrl = imageUrl;

      // Extract sources if target is a web URL
      if (targetUrl && (targetUrl.includes('://') || targetUrl.startsWith('www.'))) {
        const resolved = await resolveAnyMedia(targetUrl);
        if (resolved.videoUrl) finalVideoUrl = resolved.videoUrl;
        if (resolved.audioUrl && !finalAudioUrl) finalAudioUrl = resolved.audioUrl;
        if (resolved.images.length > 0 && !finalImageUrl) finalImageUrl = resolved.images[0];
      }

      // If FFmpeg is NOT available (e.g. Vercel serverless), stream direct video source directly!
      if (!hasFfmpeg) {
        if (finalVideoUrl && (finalVideoUrl.startsWith('http://') || finalVideoUrl.startsWith('https://'))) {
          const directStreamRes = await fetch(finalVideoUrl, { headers: BROWSER_HEADERS, redirect: 'follow' });
          if (directStreamRes.ok && directStreamRes.body) {
            const outHeaders = new Headers();
            outHeaders.set('Content-Type', 'video/mp4');
            outHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename.endsWith('.mp4') ? filename : `${filename}.mp4`)}"`);
            outHeaders.set('Access-Control-Allow-Origin', '*');
            outHeaders.set('Cache-Control', 'public, max-age=3600');
            return new Response(directStreamRes.body, { headers: outHeaders });
          }
        }
        return NextResponse.json(
          {
            error: 'FFMPEG_UNAVAILABLE',
            message: 'FFmpeg no está instalado en este servidor para transcodificar video MP4. Utiliza la descarga directa.',
          },
          { status: 503 }
        );
      }

      let ffmpegArgs: string[] = [];

      // A. Video stream available (with or without separate audio)
      const isDirectVideo = finalVideoUrl && !/\.(jpeg|jpg|png|webp|gif|avif)(\?|$)/i.test(finalVideoUrl);

      if (isDirectVideo) {
        try {
          const videoTemp = await downloadFileToTemp(finalVideoUrl, 'video_src');
          tempFilesToClean.push(videoTemp);

          if (finalAudioUrl && (finalAudioUrl.startsWith('http') || finalAudioUrl.startsWith('data:'))) {
            // Mux separate video and audio streams
            try {
              const audioTemp = await downloadFileToTemp(finalAudioUrl, 'audio_src');
              tempFilesToClean.push(audioTemp);

              ffmpegArgs = [
                '-threads', '2',
                '-i', videoTemp,
                '-i', audioTemp,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                '-f', 'mp4',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                'pipe:1',
              ];
            } catch {
              // Audio download failed, proceed with video stream only
            }
          }

          if (ffmpegArgs.length === 0) {
            // Single video stream transcoding/remuxing into pristine MP4
            ffmpegArgs = [
              '-threads', '2',
              '-i', videoTemp,
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-f', 'mp4',
              '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
              'pipe:1',
            ];
          }
        } catch (vidErr) {
          console.warn('Video download to temp failed, falling back to image/synthesis:', vidErr);
        }
      }

      // B. Image source (or manga/comic/photo carousel) synthesis into MP4 video (ONLY for explicit image-to-video mode)
      const isExplicitImageMode = type === 'video_from_image' || type === 'image_with_audio';
      if (ffmpegArgs.length === 0 && isExplicitImageMode && (finalImageUrl || finalVideoUrl)) {
        const imgSource = finalImageUrl || finalVideoUrl;
        try {
          const imgTemp = await downloadFileToTemp(imgSource, 'img_src');
          tempFilesToClean.push(imgTemp);

          if (finalAudioUrl && (finalAudioUrl.startsWith('http') || finalAudioUrl.startsWith('data:'))) {
            try {
              const audTemp = await downloadFileToTemp(finalAudioUrl, 'aud_src');
              tempFilesToClean.push(audTemp);

              ffmpegArgs = [
                '-threads', '2',
                '-framerate', '2',
                '-loop', '1',
                '-i', imgTemp,
                '-i', audTemp,
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'stillimage',
                '-r', '2',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-pix_fmt', 'yuv420p',
                '-shortest',
                '-f', 'mp4',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                'pipe:1',
              ];
            } catch {
              // Proceed with silent audio track
            }
          }

          if (ffmpegArgs.length === 0) {
            // Synthesize still image with silent audio track into 5s MP4 video
            ffmpegArgs = [
              '-threads', '2',
              '-framerate', '2',
              '-loop', '1',
              '-i', imgTemp,
              '-f', 'lavfi',
              '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
              '-t', '5',
              '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-tune', 'stillimage',
              '-r', '2',
              '-c:a', 'aac',
              '-b:a', '128k',
              '-pix_fmt', 'yuv420p',
              '-shortest',
              '-f', 'mp4',
              '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
              'pipe:1',
            ];
          }
        } catch (imgErr) {
          console.warn('Image to video synthesis warning:', imgErr);
        }
      }

      if (ffmpegArgs.length === 0) {
        await cleanup();
        return NextResponse.json(
          {
            error: 'VIDEO_STREAM_UNAVAILABLE',
            message: 'No se pudo obtener el flujo de video completo para empaquetar en MP4. Por favor, intenta la descarga directa.',
          },
          { status: 422 }
        );
      }

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      const nodeStream = Readable.from(ffmpeg.stdout);
      ffmpeg.on('close', cleanup);
      ffmpeg.on('error', cleanup);

      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk) => controller.enqueue(chunk));
          nodeStream.on('end', () => controller.close());
          nodeStream.on('error', (err) => controller.error(err));
        },
      });

      return new Response(webStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename.endsWith('.mp4') ? filename : `${filename}.mp4`)}"`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    await cleanup();
    return NextResponse.json({ error: `Tipo de conversión no soportado: ${type}` }, { status: 400 });
  } catch (err: unknown) {
    await cleanup();
    const msg = err instanceof Error ? err.message : 'Media conversion failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
