import { env } from "cloudflare:workers";
import { apiError } from "../../../../lib/api-response";
import { createSession, sessionCookie, verifyGoogleCredential } from "../../../../lib/auth-session";

export async function POST(request: Request) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const secret = env.AUTH_SESSION_SECRET ?? env.AI_KEY_ENCRYPTION_SECRET;
  if (!clientId || !secret) return apiError("Google 登录尚未完成服务端配置。", 503, "DATABASE_ERROR");
  try {
    const body = await request.json() as { credential?: string };
    if (!body.credential) return apiError("缺少 Google 登录凭证。", 400, "INVALID_INPUT");
    const user = await verifyGoogleCredential(body.credential, clientId);
    const session = await createSession(user, secret);
    return Response.json({ user: { email: user.email, displayName: user.displayName } }, { headers: { "set-cookie": sessionCookie(session) } });
  } catch {
    return apiError("Google 登录验证失败，请重试。", 401, "AUTH_REQUIRED");
  }
}
