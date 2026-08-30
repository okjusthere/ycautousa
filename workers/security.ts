import type { Env } from "./env";
import { isProductionOrigin } from "../lib/utils";

const ACCESS_CLOCK_SKEW_SECONDS = 60;
const ACCESS_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const ACCESS_JWKS_TIMEOUT_MS = 3_000;

type AccessJwtHeader = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
};

type AccessJwtPayload = Record<string, unknown> & {
  aud?: unknown;
  email?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  nbf?: unknown;
  sub?: unknown;
};

type AccessJwk = JsonWebKey & {
  alg?: string;
  kid?: string;
  kty?: string;
  use?: string;
};

type CachedAccessJwks = {
  expiresAt: number;
  inFlight?: Promise<AccessJwk[]>;
  keys: AccessJwk[];
};

const accessJwksCache = new Map<string, CachedAccessJwks>();

export function configuredAdminEmails(env: Env): string[] {
  return String(env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
}

function base64UrlBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJwtJson<T>(value: string): T | null {
  const bytes = base64UrlBytes(value);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function configuredAccessTeamDomain(env: Env): string | null {
  const configured = env.ACCESS_TEAM_DOMAIN?.trim();
  if (!configured) return null;
  try {
    const url = new URL(
      configured.startsWith("https://") ? configured : `https://${configured}`,
    );
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function fetchAccessJwks(
  issuer: string,
  fetchImpl: typeof fetch,
): Promise<AccessJwk[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACCESS_JWKS_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${issuer}/cdn-cgi/access/certs`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Access JWKS request failed");
    const body = (await response.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys)) throw new Error("Access JWKS is malformed");
    const keys = body.keys.filter(
      (key): key is AccessJwk =>
        !!key &&
        typeof key === "object" &&
        (key as AccessJwk).kty === "RSA" &&
        typeof (key as AccessJwk).kid === "string" &&
        typeof (key as AccessJwk).n === "string" &&
        typeof (key as AccessJwk).e === "string" &&
        (!(key as AccessJwk).alg || (key as AccessJwk).alg === "RS256") &&
        (!(key as AccessJwk).use || (key as AccessJwk).use === "sig"),
    );
    if (!keys.length) throw new Error("Access JWKS has no usable keys");
    return keys;
  } finally {
    clearTimeout(timeout);
  }
}

async function accessJwks(
  issuer: string,
  fetchImpl: typeof fetch,
  forceRefresh = false,
): Promise<AccessJwk[]> {
  const current = accessJwksCache.get(issuer);
  const now = Date.now();
  if (!forceRefresh && current && current.expiresAt > now) return current.keys;
  if (current?.inFlight) return current.inFlight;

  const inFlight = fetchAccessJwks(issuer, fetchImpl);
  accessJwksCache.set(issuer, {
    keys: current?.keys ?? [],
    expiresAt: 0,
    inFlight,
  });
  try {
    const keys = await inFlight;
    accessJwksCache.set(issuer, {
      keys,
      expiresAt: Date.now() + ACCESS_JWKS_CACHE_TTL_MS,
    });
    return keys;
  } catch (error) {
    if (accessJwksCache.get(issuer)?.inFlight === inFlight)
      accessJwksCache.delete(issuer);
    throw error;
  }
}

function accessAudienceMatches(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value === expected;
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string") &&
    value.includes(expected)
  );
}

async function verifyAccessSignature(
  signingInput: string,
  signature: Uint8Array,
  jwk: AccessJwk,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      signature as unknown as BufferSource,
      new TextEncoder().encode(signingInput),
    );
  } catch {
    return false;
  }
}

/**
 * Verify the Access application JWT using the pinned team-domain JWKS and AUD.
 * The token payload is never trusted until the RS256 signature and claims pass.
 */
export async function verifyAccessJwt(
  assertion: string | null,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const issuer = configuredAccessTeamDomain(env);
  const audience = env.ACCESS_AUD_TAG?.trim();
  if (!assertion || !issuer || !audience) return null;

  const parts = assertion.split(".");
  if (parts.length !== 3) return null;
  const header = decodeJwtJson<AccessJwtHeader>(parts[0]);
  const payload = decodeJwtJson<AccessJwtPayload>(parts[1]);
  const signature = base64UrlBytes(parts[2]);
  if (
    !header ||
    !payload ||
    !signature ||
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    payload.iss !== issuer ||
    !accessAudienceMatches(payload.aud, audience) ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp)
  )
    return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now - ACCESS_CLOCK_SKEW_SECONDS) return null;
  if (
    (typeof payload.nbf === "number" &&
      payload.nbf > now + ACCESS_CLOCK_SKEW_SECONDS) ||
    (typeof payload.iat === "number" &&
      payload.iat > now + ACCESS_CLOCK_SKEW_SECONDS)
  )
    return null;

  try {
    let keys = await accessJwks(issuer, fetchImpl);
    let jwk = keys.find((key) => key.kid === header.kid);
    // Access rotates signing keys. Refresh once when a new key id appears.
    if (!jwk) {
      keys = await accessJwks(issuer, fetchImpl, true);
      jwk = keys.find((key) => key.kid === header.kid);
    }
    if (
      !jwk ||
      !(await verifyAccessSignature(`${parts[0]}.${parts[1]}`, signature, jwk))
    )
      return null;
    const identity = payload.email ?? payload.sub;
    if (typeof identity !== "string" || !identity.trim()) return null;
    return identity.trim().toLowerCase();
  } catch {
    return null;
  }
}

/** Development-only identity header. Production uses the verified JWT below. */
export function accessIdentity(request: Request): string | null {
  const direct =
    request.headers.get("CF-Access-Authenticated-User-Email") ??
    request.headers.get("cf-access-authenticated-user-email");
  if (direct?.trim()) return direct.trim().toLowerCase();
  return null;
}

export async function isAdminRequest(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; message: string }
> {
  const production = isProductionOrigin(env.APP_ORIGIN ?? "");
  let email: string | null;
  if (production) {
    const requestHost = new URL(request.url).hostname.toLowerCase();
    const canonical = (env.CANONICAL_HOST ?? "").toLowerCase();
    if (!canonical || requestHost !== canonical)
      return {
        ok: false,
        status: 403,
        message: "Administrator access required",
      };
    if (!request.headers.get("CF-Access-Jwt-Assertion"))
      return { ok: false, status: 401, message: "Authentication required" };
    if (!configuredAccessTeamDomain(env) || !env.ACCESS_AUD_TAG?.trim())
      return {
        ok: false,
        status: 403,
        message: "Administrator authentication is not configured",
      };
    email = await verifyAccessJwt(
      request.headers.get("CF-Access-Jwt-Assertion"),
      env,
      fetchImpl,
    );
    if (!email)
      return {
        ok: false,
        status: 403,
        message: "Administrator access required",
      };
  } else {
    email = accessIdentity(request);
  }
  const allowlist = configuredAdminEmails(env);
  const localIdentity =
    !production && (env.DEV_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const effective = email ?? (localIdentity || null);
  if (!effective)
    return { ok: false, status: 401, message: "Authentication required" };
  if (allowlist.length > 0 && !allowlist.includes(effective))
    return { ok: false, status: 403, message: "Administrator access required" };
  if (allowlist.length === 0 && isProductionOrigin(env.APP_ORIGIN ?? ""))
    return {
      ok: false,
      status: 403,
      message: "Administrator allowlist is not configured",
    };
  return { ok: true, email: effective };
}

export function sameOrigin(request: Request, env: Env): boolean {
  const configuredOrigin = env.APP_ORIGIN ?? request.url;
  const matchesLocalAlias = (left: string, right: string): boolean => {
    try {
      const a = new URL(left);
      const b = new URL(right);
      const localHost = (host: string) =>
        host === "localhost" || host === "127.0.0.1" || host === "[::1]";
      return (
        !isProductionOrigin(configuredOrigin) &&
        localHost(a.hostname) &&
        localHost(b.hostname) &&
        a.port === b.port
      );
    } catch {
      return false;
    }
  };
  const origin = request.headers.get("Origin");
  if (!origin) {
    const referer = request.headers.get("Referer");
    if (!referer) return false;
    try {
      return (
        new URL(referer).origin === new URL(configuredOrigin).origin ||
        matchesLocalAlias(referer, configuredOrigin)
      );
    } catch {
      return false;
    }
  }
  try {
    return (
      new URL(origin).origin === new URL(configuredOrigin).origin ||
      matchesLocalAlias(origin, configuredOrigin)
    );
  } catch {
    return false;
  }
}

export function securityHeaders(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "connect-src 'self' https://challenges.cloudflare.com",
      "font-src 'self' data:",
    ].join("; "),
  );
  if (isProductionOrigin(env.APP_ORIGIN ?? ""))
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function hashIp(
  ip: string | null,
  salt: string | undefined,
): Promise<string | null> {
  if (!ip || !salt) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${ip}`),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function bodyWithinLimit(request: Request, maxBytes: number): boolean {
  const length = request.headers.get("Content-Length");
  if (!length) return true;
  const parsed = Number(length);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maxBytes;
}

export function rateLimitKey(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous"
  );
}
