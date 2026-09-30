import { NextRequest, NextResponse } from 'next/server';
import {
  getInternalExtractionSession,
  recordSessionVerification,
  invalidateExtractionSession,
  sanitizeSession,
} from '@/lib/extractionSessionStore';
import { probeRemoteMediaUrl, resolvePlatformToMediaStream } from '@/lib/downloadResolver';

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

    const sessionId = (body.sessionId || body.id || '').trim();
    if (!sessionId) {
      return NextResponse.json({ error: 'MISSING_SESSION_ID', message: 'Se requiere sessionId' }, { status: 400 });
    }

    const session = getInternalExtractionSession(sessionId);
    if (!session) {
      return NextResponse.json(
        {
          error: 'SESSION_NOT_FOUND',
          status: 'expired',
          message: 'La sesión no existe o ha expirado.',
        },
        { status: 404 }
      );
    }

    // Keep user agent from client if provided
    const userAgent = body.userAgent || req.headers.get('user-agent') || session.userAgent;
    const cookies = body.cookies || session.cookies;
    const headers = body.headers || session.requiredHeaders;

    // Record verification
    recordSessionVerification({
      sessionId,
      cookies,
      headers,
      userAgent,
    });

    // Test session against provider
    const targetUrl = session.sourceContext?.originalUrl;
    let streamUrlCandidate = session.resourceContext?.candidateUrl;

    if (!streamUrlCandidate && targetUrl) {
      const resolved = await resolvePlatformToMediaStream(
        targetUrl,
        (session.sourceContext?.resourceType as any) || 'video'
      );
      if (resolved.streamUrl) {
        streamUrlCandidate = resolved.streamUrl;
      }
    }

    let isValidBinary = false;
    if (streamUrlCandidate) {
      const probeHeaders: Record<string, string> = {
        'User-Agent': userAgent,
        ...(headers || {}),
      };
      if (cookies) {
        probeHeaders['Cookie'] = cookies;
      }

      const probe = await probeRemoteMediaUrl(
        streamUrlCandidate,
        (session.sourceContext?.resourceType as any) || 'video',
        probeHeaders
      );

      if (probe.isValid && !probe.isDisguisedHtml && !probe.isInvalidBinary) {
        isValidBinary = true;
        session.resourceContext = {
          ...session.resourceContext,
          candidateUrl: streamUrlCandidate,
          resolvedStreamUrl: probe.finalUrl || streamUrlCandidate,
          lastTestedAt: Date.now(),
        };
      }
    }

    // If candidate stream validated or verification marked valid
    if (isValidBinary || body.forceVerified) {
      session.status = 'verified';
      return NextResponse.json(sanitizeSession(session), { status: 200 });
    } else if (streamUrlCandidate) {
      // The session cookies/auth were rejected by the provider!
      invalidateExtractionSession(sessionId);
      const sanitized = sanitizeSession(session);
      sanitized.status = 'invalid';
      return NextResponse.json(sanitized, { status: 200 });
    }

    // Otherwise mark as verified for download resolver to use
    session.status = 'verified';
    return NextResponse.json(sanitizeSession(session), { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al verificar sesión';
    return NextResponse.json({ error: 'VERIFICATION_FAILED', message: msg }, { status: 500 });
  }
}
