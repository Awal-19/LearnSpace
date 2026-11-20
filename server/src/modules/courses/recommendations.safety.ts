import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Hardcoded deny list of shadow libraries, piracy hubs, torrent sites, file lockers,
 * and aggressive login-walled/spammy document mills.
 * Admins can extend this via AppSettings.recommendationBlockDomainsJson, but cannot
 * remove these hardcoded piracy/safety entries.
 */
export const HARDCODED_DENY_DOMAINS: readonly string[] = [
  'libgen.is',
  'libgen.rs',
  'libgen.st',
  'libgen.li',
  'libgen.gs',
  'gen.lib.rus.ec',
  'z-lib.org',
  'z-lib.gs',
  'z-lib.io',
  'zlibrary.to',
  'singlelogin.re',
  'singlelogin.se',
  'b-ok.cc',
  'b-ok.org',
  '1lib.sk',
  'annas-archive.org',
  'annas-archive.gs',
  'annas-archive.se',
  'sci-hub.se',
  'sci-hub.st',
  'sci-hub.ru',
  'pdfdrive.com',
  'pdfdrive.to',
  'oceanofpdf.com',
  'ebook3000.com',
  'allitebooks.org',
  'it-ebooks.info',
  'thepiratebay.org',
  '1337x.to',
  'torrentz2.nz',
  'nyaa.si',
  'mega.nz',
  'mediafire.com',
  'rapidgator.net',
  'uploaded.net',
  'zippyshare.com',
  '4shared.com',
  'studocu.com',
  'coursehero.com',
  'chegg.com',
  'bartleby.com',
  'tavily.com',
];

/**
 * Default trusted/priority educational domains. Admins can manage/extend this
 * list in AppSettings.recommendationAllowDomainsJson.
 */
export const DEFAULT_PRIORITY_DOMAINS: readonly string[] = [
  'openstax.org',
  'libretexts.org',
  'open.umn.edu',
  'ocw.mit.edu',
  'doabooks.org',
  'books.google.com',
  'archive.org',
  'arxiv.org',
  'khanacademy.org',
  'nptel.ac.in',
  'merlot.org',
  'oercommons.org',
  'core.ac.uk',
  'scholar.google.com',
  'coursera.org',
  'edx.org',
  'youtube.com',
];

const SPAM_URL_PATTERNS = [
  /free-?pdf-?download/i,
  /download-?free-?ebook/i,
  /pirate/i,
  /crack-?download/i,
];

export function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function matchesDomainOrSubdomain(domain: string, pattern: string): boolean {
  const cleanDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  const cleanPattern = pattern
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  if (!cleanDomain || !cleanPattern) return false;
  return cleanDomain === cleanPattern || cleanDomain.endsWith(`.${cleanPattern}`);
}

export function isDomainDenied(
  rawUrlOrDomain: string,
  adminBlockDomains: readonly string[] = [],
): boolean {
  const domain = rawUrlOrDomain.includes('://')
    ? extractDomain(rawUrlOrDomain)
    : rawUrlOrDomain.toLowerCase().replace(/^www\./, '');
  if (!domain) return true;

  if (rawUrlOrDomain.includes('://')) {
    for (const pattern of SPAM_URL_PATTERNS) {
      if (pattern.test(rawUrlOrDomain)) return true;
    }
  }

  for (const denied of HARDCODED_DENY_DOMAINS) {
    if (matchesDomainOrSubdomain(domain, denied)) return true;
  }
  for (const denied of adminBlockDomains) {
    if (matchesDomainOrSubdomain(domain, denied)) return true;
  }
  return false;
}

export function isDomainPrioritized(
  domain: string,
  adminAllowDomains: readonly string[] = [],
): boolean {
  const clean = domain.toLowerCase().replace(/^www\./, '');
  if (!clean) return false;
  if (
    clean.endsWith('.edu') ||
    clean.endsWith('.ac.uk') ||
    clean.endsWith('.edu.gh') ||
    clean.endsWith('.edu.ng') ||
    clean.endsWith('.ac.za')
  ) {
    return true;
  }
  for (const allowed of DEFAULT_PRIORITY_DOMAINS) {
    if (matchesDomainOrSubdomain(clean, allowed)) return true;
  }
  for (const allowed of adminAllowDomains) {
    if (matchesDomainOrSubdomain(clean, allowed)) return true;
  }
  return false;
}

/**
 * Sanitizes untrusted text from web search results before passing it to the LLM,
 * stripping control characters and neutralizing common prompt-injection markers.
 */
export function sanitizeUntrustedSearchText(raw: string, maxLen = 400): string {
  const withoutControlChars = Array.from(raw, (ch) => {
    const code = ch.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? ' ' : ch;
  }).join('');
  return withoutControlChars
    .replace(/<\/?[a-zA-Z_][^>]*>/g, ' ')
    .replace(
      /(ignore\s+(all\s+)?previous\s+instructions|system\s*:|assistant\s*:|you\s+are\s+now)/gi,
      '[redacted]',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Checks whether an IPv4 or IPv6 address belongs to a private, loopback,
 * link-local, CGNAT, multicast, or unspecified range.
 */
export function isPrivateOrReservedIp(ipRaw: string): boolean {
  const ip = ipRaw
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!ip) return true;

  // Handle IPv4-mapped IPv6 like ::ffff:127.0.0.1
  if (ip.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(ip.slice('::ffff:'.length));
  }

  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 & TEST-NET-1
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
    if (a === 203 && b === 0) return true;
    if (a >= 224) return true; // multicast & reserved
    return false;
  }

  if (version === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // fc00::/7 ULA
    if (
      ip.startsWith('fe8') ||
      ip.startsWith('fe9') ||
      ip.startsWith('fea') ||
      ip.startsWith('feb')
    ) {
      return true; // fe80::/10 link-local
    }
    if (ip.startsWith('ff')) return true; // multicast
    return false;
  }

  return true;
}

export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string }>>;

const defaultDnsLookup: DnsLookupFn = (hostname) =>
  dns.lookup(hostname, { all: true, verbatim: true });

export async function assertPublicHttpUrl(
  rawUrl: string,
  dnsLookup: DnsLookupFn = defaultDnsLookup,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTP(S) scheme: ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error(`Blocked internal hostname: ${host}`);
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error(`Blocked private/reserved IP: ${host}`);
    }
    return parsed;
  }

  const records = await dnsLookup(host);
  if (!records || records.length === 0) {
    throw new Error(`DNS resolution returned no records for ${host}`);
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error(`Blocked private/reserved resolved IP for ${host}`);
    }
  }
  return parsed;
}

export interface LinkCheckResult {
  ok: boolean;
  finalUrl: string;
  statusCode?: number;
  error?: string;
}

/**
 * Verifies a public HTTP(S) URL is reachable without SSRF risk:
 * - Blocks non-http(s) schemes and private/loopback/link-local IPs
 * - Checks DNS resolution before connecting
 * - Uses redirect: 'manual' and validates every redirect target (up to 3 hops)
 * - Short 5s timeout
 */
export async function verifyPublicHttpUrl(
  rawUrl: string,
  options?: {
    fetchImpl?: typeof fetch;
    dnsLookup?: DnsLookupFn;
    timeoutMs?: number;
    adminBlockDomains?: readonly string[];
  },
): Promise<LinkCheckResult> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const dnsLookup = options?.dnsLookup ?? defaultDnsLookup;
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const adminBlockDomains = options?.adminBlockDomains ?? [];

  let currentUrl = rawUrl;
  for (let hop = 0; hop < 3; hop += 1) {
    let parsed: URL;
    try {
      parsed = await assertPublicHttpUrl(currentUrl, dnsLookup);
    } catch (err) {
      return {
        ok: false,
        finalUrl: currentUrl,
        error: err instanceof Error ? err.message : 'Blocked URL',
      };
    }

    if (isDomainDenied(parsed.toString(), adminBlockDomains)) {
      return { ok: false, finalUrl: parsed.toString(), error: 'Domain is deny-listed' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res = await fetchImpl(parsed.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'LearnSpace-LinkChecker/1.0' },
      });

      if (res.status === 405 || res.status === 501) {
        res = await fetchImpl(parsed.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'LearnSpace-LinkChecker/1.0',
            Range: 'bytes=0-0',
          },
        });
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          return {
            ok: false,
            finalUrl: parsed.toString(),
            statusCode: res.status,
            error: 'Redirect missing Location',
          };
        }
        currentUrl = new URL(location, parsed).toString();
        continue;
      }

      // 2xx or 403/401 (some academic sites block HEAD bots with 403 but are alive for browsers)
      if (res.status >= 200 && res.status < 400) {
        return { ok: true, finalUrl: parsed.toString(), statusCode: res.status };
      }
      if (res.status === 403 || res.status === 401) {
        return { ok: true, finalUrl: parsed.toString(), statusCode: res.status };
      }
      return {
        ok: false,
        finalUrl: parsed.toString(),
        statusCode: res.status,
        error: `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        finalUrl: parsed.toString(),
        error: err instanceof Error ? err.message : 'Network error',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, finalUrl: currentUrl, error: 'Too many redirects' };
}
