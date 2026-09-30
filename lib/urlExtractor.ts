/**
 * Robust URL Extractor and Normalizer for Web Share Target and Direct Inputs
 * 
 * Complies with Android Share Sheet variations:
 * 1. Checks 'url'.
 * 2. If absent/empty, checks 'text'.
 * 3. If 'text' contains a URL, extracts the first valid HTTP/HTTPS URL.
 * 4. Checks 'title' as secondary fallback.
 * 5. Normalizes the URL (stripping tracking parameters, cleaning protocol, trailing punctuation).
 * 6. Validates against arbitrary text or malformed non-HTTP schemes.
 */

// Tracking and junk query parameters to strip across social platforms
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'igsh',
  'igshid',
  'si',
  's',
  'feature',
  'ref',
  'ref_src',
  'ref_url',
  '_hsenc',
  '_hsmi',
  'mc_cid',
  'mc_eid',
  'gclid',
  'dclid',
  'zanpid',
  'mbid'
]);

// URL search pattern for finding links embedded in shared text
const EMBEDDED_URL_REGEX = /(?:https?:\/\/|www\.)[^\s"'<>()\[\]{}]+/i;

export interface ExtractedUrlResult {
  isValid: boolean;
  rawFound: string | null;
  normalizedUrl: string | null;
  error?: string;
  sourceField?: 'url' | 'text' | 'title';
}

/**
 * Strips tracking parameters from a URL object while preserving platform-essential parameters
 */
export function sanitizeUrlParams(urlObj: URL): void {
  const paramsToDelete: string[] = [];
  
  urlObj.searchParams.forEach((_, key) => {
    const lowerKey = key.toLowerCase();
    if (TRACKING_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
      paramsToDelete.push(key);
    }
  });

  paramsToDelete.forEach(param => urlObj.searchParams.delete(param));
}

/**
 * Cleans punctuation commonly attached to URLs at the end of shared text sentences
 */
function cleanTrailingPunctuation(str: string): string {
  return str.replace(/[.,;:!?)\]'"]+$/, '');
}

/**
 * Extracts and strictly validates a URL from Web Share Target inputs or direct strings
 */
export function extractSharedUrl(input: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): ExtractedUrlResult {
  let candidate: string | null = null;
  let sourceField: 'url' | 'text' | 'title' | undefined = undefined;

  // 1. Check 'url' parameter first
  if (input.url && typeof input.url === 'string' && input.url.trim().length > 0) {
    candidate = input.url.trim();
    sourceField = 'url';
  }

  // 2. If not found or empty, inspect 'text'
  if (!candidate && input.text && typeof input.text === 'string' && input.text.trim().length > 0) {
    const textTrimmed = input.text.trim();
    // Check if the whole text is a URL or contains an embedded link
    const match = textTrimmed.match(EMBEDDED_URL_REGEX);
    if (match) {
      candidate = match[0];
      sourceField = 'text';
    } else if (textTrimmed.startsWith('http://') || textTrimmed.startsWith('https://')) {
      candidate = textTrimmed;
      sourceField = 'text';
    }
  }

  // 3. Fallback: inspect 'title' (some apps put the link in title)
  if (!candidate && input.title && typeof input.title === 'string' && input.title.trim().length > 0) {
    const titleTrimmed = input.title.trim();
    const match = titleTrimmed.match(EMBEDDED_URL_REGEX);
    if (match) {
      candidate = match[0];
      sourceField = 'title';
    }
  }

  if (!candidate) {
    return {
      isValid: false,
      rawFound: null,
      normalizedUrl: null,
      error: 'No se encontró ninguna URL válida en los datos compartidos.'
    };
  }

  // Clean trailing punctuation attached from sentences
  candidate = cleanTrailingPunctuation(candidate.trim());

  // Ensure protocol is present
  if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
    if (candidate.startsWith('//')) {
      candidate = `https:${candidate}`;
    } else {
      candidate = `https://${candidate}`;
    }
  }

  // Parse and validate with URL constructor
  try {
    const parsed = new URL(candidate);

    // Validate protocol
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        isValid: false,
        rawFound: candidate,
        normalizedUrl: null,
        error: `Protocolo no permitido: "${parsed.protocol}". Solo se admiten enlaces HTTP y HTTPS.`
      };
    }

    // Validate hostname
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname.length < 3 || !hostname.includes('.')) {
      return {
        isValid: false,
        rawFound: candidate,
        normalizedUrl: null,
        error: 'El nombre de dominio es inválido o no existe.'
      };
    }

    // Disallow local/loopback/private IP addresses for security
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return {
        isValid: false,
        rawFound: candidate,
        normalizedUrl: null,
        error: 'No se permiten direcciones locales ni de red privada.'
      };
    }

    // Normalize protocol to https when applicable (keep http if explicitly port specified)
    if (parsed.protocol === 'http:' && !parsed.port) {
      parsed.protocol = 'https:';
    }

    // Strip tracking parameters
    sanitizeUrlParams(parsed);

    // Remove redundant trailing slash for cleaner matching (except for root path)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    const normalized = parsed.toString();

    return {
      isValid: true,
      rawFound: candidate,
      normalizedUrl: normalized,
      sourceField
    };
  } catch (err) {
    return {
      isValid: false,
      rawFound: candidate,
      normalizedUrl: null,
      error: `La URL extraída está malformada: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
