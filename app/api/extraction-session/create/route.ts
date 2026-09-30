import { NextRequest, NextResponse } from 'next/server';
import { createExtractionSession } from '@/lib/extractionSessionStore';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Cuerpo JSON inválido' }, { status: 400 });
    }

    const rawUrl = (body.url || '').trim();
    if (!rawUrl) {
      return NextResponse.json({ error: 'MISSING_URL', message: 'Se requiere el parámetro url' }, { status: 400 });
    }

    const userAgent = req.headers.get('user-agent') || body.userAgent || undefined;
    const sanitized = createExtractionSession({
      url: rawUrl,
      provider: body.provider,
      userAgent,
      resourceType: body.resourceType || 'video',
      ttlMinutes: 15,
    });

    return NextResponse.json(sanitized, {
      status: 201,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creando ExtractionSession';
    return NextResponse.json({ error: 'SESSION_CREATE_FAILED', message: msg }, { status: 500 });
  }
}
