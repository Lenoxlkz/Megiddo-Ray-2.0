import { NextRequest, NextResponse } from 'next/server';
import { resolveVideoPreview } from '@/lib/videoPreviewResolver';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  const candidateUrl = searchParams.get('candidateUrl') || undefined;
  const durationStr = searchParams.get('duration');
  const sizeStr = searchParams.get('size');
  const title = searchParams.get('title') || undefined;

  if (!url) {
    return NextResponse.json({ error: 'Falta el parámetro de URL' }, { status: 400 });
  }

  try {
    const duration = durationStr ? parseFloat(durationStr) : undefined;
    const estimatedSize = sizeStr ? parseInt(sizeStr, 10) : undefined;

    const resolution = await resolveVideoPreview(url, {
      candidateUrl,
      duration: !isNaN(duration || NaN) ? duration : undefined,
      estimatedSize: !isNaN(estimatedSize || NaN) ? estimatedSize : undefined,
      title,
    });

    return NextResponse.json(
      {
        ...resolution.diagnostics,
        previewUrl: resolution.previewUrl,
        diagnostics: resolution.diagnostics,
        resolvedAt: resolution.resolvedAt,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resolviendo preview de video';
    return NextResponse.json(
      {
        playable: false,
        streamingMode: 'unavailable',
        supportsRange: false,
        requiresCookies: false,
        requiresHeaders: false,
        reason: msg,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, candidateUrl, duration, estimatedSize, title } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'Falta el parámetro de URL en el cuerpo' }, { status: 400 });
    }

    const resolution = await resolveVideoPreview(url, {
      candidateUrl,
      duration: typeof duration === 'number' ? duration : undefined,
      estimatedSize: typeof estimatedSize === 'number' ? estimatedSize : undefined,
      title: typeof title === 'string' ? title : undefined,
    });

    return NextResponse.json(
      {
        ...resolution.diagnostics,
        previewUrl: resolution.previewUrl,
        diagnostics: resolution.diagnostics,
        resolvedAt: resolution.resolvedAt,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resolviendo preview de video';
    return NextResponse.json(
      {
        playable: false,
        streamingMode: 'unavailable',
        supportsRange: false,
        requiresCookies: false,
        requiresHeaders: false,
        reason: msg,
      },
      { status: 500 }
    );
  }
}
