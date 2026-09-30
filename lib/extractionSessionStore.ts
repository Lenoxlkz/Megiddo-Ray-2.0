import { v4 as uuidv4 } from 'uuid';

export type ExtractionSessionStatus = 'pending_verification' | 'verified' | 'invalid' | 'expired';

export interface ExtractionSession {
  id: string;
  provider: string;
  status: ExtractionSessionStatus;
  createdAt: number;
  expiresAt: number;
  userAgent: string;
  // SENSITIVE DATA: STRICT SERVER-ONLY. NEVER RETURN TO FRONTEND, NEVER LOG, NEVER STORE IN BROWSER
  cookies?: string;
  requiredHeaders?: Record<string, string>;
  authenticationState?: 'unauthenticated' | 'authenticated' | 'challenge_passed';
  sourceContext?: {
    originalUrl: string;
    resourceType?: string;
  };
  resourceContext?: {
    candidateUrl?: string;
    resolvedStreamUrl?: string;
    lastTestedAt?: number;
  };
}

export interface SanitizedExtractionSession {
  sessionId: string;
  provider: string;
  status: ExtractionSessionStatus;
  expiresAt: number;
  createdAt: number;
  verificationUrl?: string;
  requiresSessionNote?: string;
}

// In-memory temporal storage with TTL
const sessionsMap = new Map<string, ExtractionSession>();

/**
 * Periodically purge expired sessions and enforce memory bounds
 */
function pruneExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessionsMap.entries()) {
    if (now > session.expiresAt) {
      // Clean up sensitive fields before deletion
      session.cookies = undefined;
      session.requiredHeaders = undefined;
      sessionsMap.delete(id);
    }
  }

  // Cap memory size to max 500 active sessions
  if (sessionsMap.size > 500) {
    const oldestKey = sessionsMap.keys().next().value;
    if (oldestKey) {
      const old = sessionsMap.get(oldestKey);
      if (old) {
        old.cookies = undefined;
        old.requiredHeaders = undefined;
      }
      sessionsMap.delete(oldestKey);
    }
  }
}

/**
 * Detect provider name from URL
 */
export function detectProviderFromUrl(urlStr: string): string {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'X (Twitter)';
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'Facebook';
    if (host.includes('threads.net')) return 'Threads';
    if (host.includes('cloudflare') || host.includes('challenges')) return 'Cloudflare Protection';
    return host.replace('www.', '');
  } catch {
    return 'Proveedor Web';
  }
}

/**
 * Creates a new temporal ExtractionSession
 * Default TTL: 15 minutes (900,000 ms)
 */
export function createExtractionSession(params: {
  url: string;
  provider?: string;
  userAgent?: string;
  resourceType?: string;
  ttlMinutes?: number;
}): SanitizedExtractionSession {
  pruneExpiredSessions();

  const id = `xsess_${uuidv4().replace(/-/g, '')}`;
  const now = Date.now();
  const ttlMs = (params.ttlMinutes || 15) * 60 * 1000;
  const expiresAt = now + ttlMs;
  const provider = params.provider || detectProviderFromUrl(params.url);

  const session: ExtractionSession = {
    id,
    provider,
    status: 'pending_verification',
    createdAt: now,
    expiresAt,
    userAgent:
      params.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    authenticationState: 'unauthenticated',
    sourceContext: {
      originalUrl: params.url,
      resourceType: params.resourceType || 'video',
    },
    resourceContext: {},
  };

  sessionsMap.set(id, session);

  return sanitizeSession(session);
}

/**
 * Internal: retrieve full session including sensitive auth data for server-side probing
 * NEVER expose this to API routes that send responses directly to clients!
 */
export function getInternalExtractionSession(sessionId: string): ExtractionSession | undefined {
  pruneExpiredSessions();
  const session = sessionsMap.get(sessionId);
  if (!session) return undefined;

  if (Date.now() > session.expiresAt) {
    session.status = 'expired';
    session.cookies = undefined;
    session.requiredHeaders = undefined;
    sessionsMap.delete(sessionId);
    return undefined;
  }

  return session;
}

/**
 * Strips all sensitive tokens, cookies, and internal context.
 * Safe to send in JSON responses to client browsers.
 */
export function sanitizeSession(session: ExtractionSession): SanitizedExtractionSession {
  return {
    sessionId: session.id,
    provider: session.provider,
    status: session.status,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    verificationUrl: session.sourceContext?.originalUrl,
    requiresSessionNote:
      session.status === 'pending_verification'
        ? `Se requiere completar la verificación de acceso en ${session.provider} para descargar el recurso binario auténtico.`
        : session.status === 'invalid'
        ? 'La sesión de verificación expiró o ya no es válida por rechazo del servidor remoto.'
        : undefined,
  };
}

/**
 * Public lookup: returns sanitized session state
 */
export function getSanitizedExtractionSession(sessionId: string): SanitizedExtractionSession | undefined {
  const internal = getInternalExtractionSession(sessionId);
  if (!internal) return undefined;
  return sanitizeSession(internal);
}

/**
 * Records verification completion securely on the server
 */
export function recordSessionVerification(params: {
  sessionId: string;
  cookies?: string;
  headers?: Record<string, string>;
  userAgent?: string;
  resolvedStreamUrl?: string;
}): boolean {
  const session = getInternalExtractionSession(params.sessionId);
  if (!session) return false;

  session.status = 'verified';
  session.authenticationState = 'challenge_passed';
  if (params.cookies) session.cookies = params.cookies;
  if (params.headers) session.requiredHeaders = params.headers;
  if (params.userAgent) session.userAgent = params.userAgent;
  if (params.resolvedStreamUrl && session.resourceContext) {
    session.resourceContext.resolvedStreamUrl = params.resolvedStreamUrl;
  }
  session.resourceContext = {
    ...session.resourceContext,
    lastTestedAt: Date.now(),
  };

  return true;
}

/**
 * Invalidate session (e.g. if provider returns 401/403 or cookies are stale)
 */
export function invalidateExtractionSession(sessionId: string): void {
  const session = sessionsMap.get(sessionId);
  if (session) {
    session.status = 'invalid';
    session.cookies = undefined;
    session.requiredHeaders = undefined;
    session.authenticationState = 'unauthenticated';
  }
}

/**
 * Immediately wipes and deletes an extraction session (e.g. upon download completion)
 */
export function terminateExtractionSession(sessionId: string): void {
  const session = sessionsMap.get(sessionId);
  if (session) {
    session.cookies = undefined;
    session.requiredHeaders = undefined;
    sessionsMap.delete(sessionId);
  }
}
