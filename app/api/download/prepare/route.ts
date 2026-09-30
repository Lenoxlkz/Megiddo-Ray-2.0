import { NextRequest, NextResponse } from 'next/server';
import { prepareDownload } from '@/lib/downloadResolver';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Origin',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Se requiere un cuerpo JSON válido' }, { status: 400 });
    }

    const rawUrl = (body.url || '').trim();
    if (!rawUrl) {
      return NextResponse.json({ error: 'MISSING_URL', message: 'El parámetro url es requerido' }, { status: 400 });
    }

    const candidateUrl = (body.candidateUrl || '').trim();
    const filename = (body.filename || '').trim();
    const expectedType = body.expectedType || body.category || 'video';
    const estimatedSize = typeof body.estimatedSize === 'number' ? body.estimatedSize : undefined;
    const durationSeconds = typeof body.duration === 'number' ? body.duration : (typeof body.durationSeconds === 'number' ? body.durationSeconds : undefined);
    const itemCount = typeof body.itemCount === 'number' ? body.itemCount : 1;

    const userAgent = req.headers.get('user-agent') || body.userAgent || undefined;
    const sessionId = (body.sessionId || '').trim() || undefined;

    const capability = await prepareDownload({
      url: rawUrl,
      candidateUrl: candidateUrl || undefined,
      filename: filename || undefined,
      expectedType,
      estimatedSize,
      durationSeconds,
      itemCount,
      sessionId,
      userAgent,
    });

    return NextResponse.json(capability, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al preparar la descarga';
    console.error('Error in /api/download/prepare:', err);
    return NextResponse.json(
      {
        available: false,
        mode: 'unavailable',
        reason: `Error al verificar capacidad de descarga: ${message}`,
        serverSafe: true,
      },
      { status: 500 }
    );
  }
}
