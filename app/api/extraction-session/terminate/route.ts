import { NextRequest, NextResponse } from 'next/server';
import { terminateExtractionSession } from '@/lib/extractionSessionStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    const sessionId = (body.sessionId || body.id || '').trim();
    if (sessionId) {
      terminateExtractionSession(sessionId);
    }

    return NextResponse.json({ success: true, terminated: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al terminar sesión';
    return NextResponse.json({ error: 'TERMINATE_FAILED', message: msg }, { status: 500 });
  }
}
