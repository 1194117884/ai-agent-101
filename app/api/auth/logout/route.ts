import { expiredSessionCookie } from "../../../../lib/auth-session";

export async function POST() {
  return Response.json({ ok: true }, { headers: { "set-cookie": expiredSessionCookie } });
}
