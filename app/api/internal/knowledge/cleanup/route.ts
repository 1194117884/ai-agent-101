import { env } from "cloudflare:workers";
import { apiError } from "../../../../../lib/api-response";
import { cleanupExpiredKnowledgeUploads } from "../../../../../lib/knowledge-submission";
import { recoverStaleKnowledgeTasks } from "../../../../../lib/knowledge-maintenance";

export async function POST(request: Request) {
  const secret = env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || request.headers.get("x-internal-queue-secret") !== secret) return apiError("无权执行内部清理任务。", 403, "FORBIDDEN");
  try {
    const body = await request.json().catch(() => ({})) as { cron?: string };
    const recovery = await recoverStaleKnowledgeTasks(30);
    const retention = body.cron === "17 3 * * *" ? await cleanupExpiredKnowledgeUploads(7) : null;
    return Response.json({ ok: true, recovery, retention });
  }
  catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "清理任务失败" }, { status: 500 }); }
}
