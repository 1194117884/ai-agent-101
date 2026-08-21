import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "../lib/auth-session";

export type CloudflareUser = { userId: string; displayName: string; email: string };

export async function getCloudflareUser(): Promise<CloudflareUser | null> {
  const requestHeaders = await headers();
  const email = requestHeaders.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (email) return { userId: email, displayName: email, email };
  const secret = env.AUTH_SESSION_SECRET ?? env.AI_KEY_ENCRYPTION_SECRET;
  const value = (await cookies()).get("agent_session")?.value;
  return secret && value ? verifySession(value, secret) : null;
}

export async function requireCloudflareUser(returnTo: string): Promise<CloudflareUser> {
  const user = await getCloudflareUser();
  if (user) return user;
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
}
