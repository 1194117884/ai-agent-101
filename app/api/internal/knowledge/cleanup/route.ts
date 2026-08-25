import { env } from "cloudflare:workers";
import { apiError } from "../../../../../lib/api-response";
import { cleanupExpiredKnowledgeUploads } from "../../../../../lib/knowledge-submission";

export async function POST(request: Request) {
  const secret = env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || request.headers.get("x-internal-queue-secret") !== secret) return apiError("无权执行内部清理任务。", 403, "FORBIDDEN");
  try { return Response.json({ ok: true, ...await cleanupExpiredKnowledgeUploads(7) }); }
  catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "清理任务失败" }, { status: 500 }); }
}
