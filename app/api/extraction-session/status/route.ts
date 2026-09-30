import { NextRequest, NextResponse } from 'next/server';
import { getSanitizedExtractionSession } from '@/lib/extractionSessionStore';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') || searchParams.get('id');

  if (!sessionId) {
    return NextResponse.json({ error: 'MISSING_SESSION_ID', message: 'Se requiere el parámetro sessionId' }, { status: 400 });
  }

  const session = getSanitizedExtractionSession(sessionId);

  if (!session) {
    return NextResponse.json(
      {
        status: 'expired',
        sessionId,
        reason: 'La sesión de extracción no existe o ha expirado.',
      },
      { status: 404 }
    );
  }

  // STRICT REQUIREMENT 2 & 6:
  // NEVER send cookies, tokens, or private headers to frontend!
  return NextResponse.json(session, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
