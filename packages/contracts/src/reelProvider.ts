import { z } from 'zod';

/**
 * The complete, fixed set of recognized providers. Adding one is a deliberate, reviewed act — an
 * enum value, a parse pattern, and an embed template together — never a configuration change or
 * a value accepted from a request (openspec/changes/add-reels-curation/design.md - "Provider
 * identity, not URLs").
 */
export const REEL_PROVIDERS = ['instagram', 'tiktok', 'youtube'] as const;

export const reelProviderSchema = z.enum(REEL_PROVIDERS);
export type ReelProvider = z.infer<typeof reelProviderSchema>;

export interface ParsedReelUrl {
  provider: ReelProvider;
  externalId: string;
}

interface ReelProviderConfig {
  provider: ReelProvider;
  /** Exact, lowercase hostnames only — never matched with `endsWith`, which would also accept
   *  `evil-instagram.com` and `instagram.com.attacker.net`
   *  (specs/reels-curation/spec.md - "Provider allowlist" - "Unrecognized host rejected"). */
  hosts: readonly string[];
  /** Anchored to the full pathname so a recognized host with an unexpected path is rejected
   *  rather than partially matched. Capture group 1 is the candidate identifier. */
  pathPattern: RegExp;
  /** The character class the captured identifier must additionally satisfy — cannot express a
   *  scheme, a host, a path separator, or a quoting character
   *  (specs/reels-curation/spec.md - "Only a provider identity is persisted"). */
  idPattern: RegExp;
  embedTemplate: (externalId: string) => string;
}

const REEL_PROVIDER_CONFIGS: readonly ReelProviderConfig[] = [
  {
    provider: 'instagram',
    hosts: ['instagram.com', 'www.instagram.com'],
    pathPattern: /^\/reels?\/([A-Za-z0-9_-]{5,32})\/?$/,
    idPattern: /^[A-Za-z0-9_-]{5,32}$/,
    embedTemplate: (id) => `https://www.instagram.com/reel/${id}/embed`,
  },
  {
    provider: 'tiktok',
    hosts: ['tiktok.com', 'www.tiktok.com'],
    pathPattern: /^\/@[\w.-]{1,64}\/video\/(\d{5,32})\/?$/,
    idPattern: /^\d{5,32}$/,
    embedTemplate: (id) => `https://www.tiktok.com/embed/v2/${id}`,
  },
  {
    provider: 'youtube',
    hosts: ['youtube.com', 'www.youtube.com'],
    pathPattern: /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/,
    idPattern: /^[A-Za-z0-9_-]{11}$/,
    embedTemplate: (id) => `https://www.youtube.com/embed/${id}`,
  },
  {
    provider: 'youtube',
    hosts: ['youtu.be'],
    pathPattern: /^\/([A-Za-z0-9_-]{11})\/?$/,
    idPattern: /^[A-Za-z0-9_-]{11}$/,
    embedTemplate: (id) => `https://www.youtube.com/embed/${id}`,
  },
];

/**
 * Parses a submitted URL into a provider identity, or returns `null` if it matches nothing.
 * Nothing about the input URL survives into the result beyond the matched host and the captured
 * identifier — query parameters, fragments, and any other path segments are discarded, so two
 * submissions of the same video differing only in tracking parameters yield the same identity
 * (specs/reels-curation/spec.md - "Tracking parameters do not survive"). `https:` only,
 * and a URL carrying embedded credentials (`https://user:pass@host/...`) is rejected outright
 * rather than having its credentials silently dropped.
 */
export function parseReelUrl(rawUrl: string): ParsedReelUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '') return null;

  const hostname = parsed.hostname.toLowerCase();
  for (const config of REEL_PROVIDER_CONFIGS) {
    if (!config.hosts.includes(hostname)) continue;
    const match = config.pathPattern.exec(parsed.pathname);
    const externalId = match?.[1];
    if (!externalId || !config.idPattern.test(externalId)) continue;
    return { provider: config.provider, externalId };
  }
  return null;
}

/**
 * Composes an embed reference from a stored `(provider, externalId)` pair. The scheme and host
 * come from a literal in this file, never from data; the identifier is re-validated against its
 * provider's character class before substitution, so no caller-supplied text can reach the
 * result even if a stored row were somehow corrupted
 * (specs/reels-curation/spec.md - "Embed references are composed server-side from the stored
 * identity").
 */
export function buildReelEmbedUrl(provider: ReelProvider, externalId: string): string {
  const config = REEL_PROVIDER_CONFIGS.find((c) => c.provider === provider && c.idPattern.test(externalId));
  if (!config) throw new Error(`Cannot compose an embed URL for ${provider}/${externalId}`);
  return config.embedTemplate(externalId);
}
