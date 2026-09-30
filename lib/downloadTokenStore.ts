import { v4 as uuidv4 } from 'uuid';

export type ResourceKind = 'webpage' | 'video' | 'audio' | 'image' | 'document';

export interface DownloadTokenData {
  token: string;
  targetUrl: string;
  filename: string;
  contentType: string;
  size?: number;
  headers?: Record<string, string>;
  createdAt: number;
  expiresAt: number;
  maxUses: number;
  useCount: number;
  resourceKind: ResourceKind;
  sessionId?: string;
}

// In-memory token store for secure, temporary downloads
const tokenStore = new Map<string, DownloadTokenData>();

// Prune expired tokens periodically
function pruneExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of tokenStore.entries()) {
    if (now > data.expiresAt) {
      tokenStore.delete(token);
    }
  }
  // Enforce memory cap (max 1000 tokens)
  if (tokenStore.size > 1000) {
    const oldestKey = tokenStore.keys().next().value;
    if (oldestKey) tokenStore.delete(oldestKey);
  }
}

/**
 * Creates and registers a temporary, single-resource download token
 */
export function createDownloadToken(
  params: Omit<DownloadTokenData, 'token' | 'createdAt' | 'useCount'>
): string {
  pruneExpiredTokens();

  const token = `mray_dl_${uuidv4().replace(/-/g, '')}`;
  const now = Date.now();

  const tokenData: DownloadTokenData = {
    ...params,
    token,
    createdAt: now,
    expiresAt: params.expiresAt || (now + 30 * 60 * 1000), // Default: 30 minutes
    maxUses: params.maxUses !== undefined ? params.maxUses : 60, // Allow multiple range chunks
    useCount: 0,
  };

  tokenStore.set(token, tokenData);
  return token;
}

/**
 * Retrieves valid token data without incrementing use count (e.g. for HEAD requests)
 */
export function getDownloadToken(token: string): DownloadTokenData | undefined {
  pruneExpiredTokens();
  const data = tokenStore.get(token);
  if (!data) return undefined;
  if (Date.now() > data.expiresAt) {
    tokenStore.delete(token);
    return undefined;
  }
  return data;
}

/**
 * Retrieves and increments usage for GET streaming download
 */
export function consumeDownloadToken(token: string): DownloadTokenData | undefined {
  const data = getDownloadToken(token);
  if (!data) return undefined;

  data.useCount++;
  if (data.useCount >= data.maxUses) {
    // Keep it alive briefly for parallel range chunks, then prune
    setTimeout(() => {
      tokenStore.delete(token);
    }, 60 * 1000);
  }

  return data;
}

/**
 * Explicitly revokes a download token
 */
export function revokeDownloadToken(token: string): void {
  tokenStore.delete(token);
}
