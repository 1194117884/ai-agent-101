import { env } from "cloudflare:workers";
import { apiError } from "../../../../../lib/api-response";
import { processKnowledgeSubmission } from "../../../../../lib/knowledge-submission";

export async function POST(request: Request) {
  const secret = env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || request.headers.get("x-internal-queue-secret") !== secret) return apiError("无权处理内部队列任务。", 403, "FORBIDDEN");
  try {
    const body = await request.json() as { type?: string; submissionId?: string };
    if (body.type !== "convert" || !body.submissionId || !/^[0-9a-f-]{36}$/i.test(body.submissionId)) return apiError("队列消息无效。", 400, "INVALID_INPUT");
    return Response.json({ ok: true, result: await processKnowledgeSubmission(body.submissionId) });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "队列任务失败" }, { status: 500 });
  }
}
