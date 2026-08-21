import { env } from "cloudflare:workers";
import { getCloudflareUser } from "./auth";

export async function getAdminUser() {
  const user = await getCloudflareUser();
  if (!user) return null;
  const allowlist = env.AI_ADMIN_EMAILS?.toLowerCase().split(/[\s,;]+/).filter(Boolean) ?? [];
  return allowlist.length === 0 || allowlist.includes(user.email) ? user : null;
}
