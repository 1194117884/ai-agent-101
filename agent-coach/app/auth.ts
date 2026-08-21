import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type CloudflareUser = { userId: string; displayName: string; email: string };

export async function getCloudflareUser(): Promise<CloudflareUser | null> {
  const requestHeaders = await headers();
  const email = requestHeaders.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return null;
  return { userId: email, displayName: email, email };
}

export async function requireCloudflareUser(returnTo: string): Promise<CloudflareUser> {
  const user = await getCloudflareUser();
  if (user) return user;
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  redirect(`/cdn-cgi/access/login?redirect_url=${encodeURIComponent(safeReturnTo)}`);
}
