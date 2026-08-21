export type AuthenticatedUser = { userId: string; displayName: string; email: string };

type GoogleClaims = {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  exp?: number;
};

const encoder = new TextEncoder();
const SESSION_SECONDS = 7 * 24 * 60 * 60;
let cachedKeys: { expiresAt: number; keys: JsonWebKey[] } | undefined;

function base64UrlEncode(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function jsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as T;
}

async function googleKeys(fetcher: typeof fetch) {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  const response = await fetcher("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("Google signing keys are unavailable");
  const data = await response.json() as { keys?: JsonWebKey[] };
  if (!data.keys?.length) throw new Error("Google signing keys are invalid");
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  cachedKeys = { keys: data.keys, expiresAt: Date.now() + Math.max(60, maxAge) * 1000 };
  return data.keys;
}

export async function verifyGoogleCredential(credential: string, clientId: string, fetcher: typeof fetch = fetch): Promise<AuthenticatedUser> {
  const [encodedHeader, encodedClaims, encodedSignature] = credential.split(".");
  if (!encodedHeader || !encodedClaims || !encodedSignature) throw new Error("Invalid Google credential");
  const header = jsonPart<{ alg?: string; kid?: string }>(encodedHeader);
  const claims = jsonPart<GoogleClaims>(encodedClaims);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Google credential");
  const jwk = (await googleKeys(fetcher)).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Unknown Google signing key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlDecode(encodedSignature), encoder.encode(`${encodedHeader}.${encodedClaims}`));
  const now = Math.floor(Date.now() / 1000);
  if (!valid || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss ?? "") || claims.aud !== clientId || !claims.exp || claims.exp <= now || !claims.email_verified || !claims.sub || !claims.email) throw new Error("Google credential verification failed");
  const email = claims.email.trim().toLowerCase();
  return { userId: email, email, displayName: claims.name?.trim() || email };
}

async function sessionKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(`agent-coach-session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSession(user: AuthenticatedUser, secret: string, now = Date.now()) {
  const payload = base64UrlEncode(JSON.stringify({ ...user, exp: Math.floor(now / 1000) + SESSION_SECONDS }));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(secret), encoder.encode(payload)));
  return `${payload}.${base64UrlEncode(signature)}`;
}

export async function verifySession(value: string, secret: string, now = Date.now()): Promise<AuthenticatedUser | null> {
  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const valid = await crypto.subtle.verify("HMAC", await sessionKey(secret), base64UrlDecode(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = jsonPart<AuthenticatedUser & { exp?: number }>(payload);
    if (!data.exp || data.exp <= Math.floor(now / 1000) || !data.userId || !data.email) return null;
    return { userId: data.userId, displayName: data.displayName, email: data.email };
  } catch { return null; }
}

export const sessionCookie = (value: string) => `agent_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
export const expiredSessionCookie = "agent_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
