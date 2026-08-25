import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { knowledgeJobs, knowledgeSubmissions } from "../../../../../db/schema";
import { apiError } from "../../../../../lib/api-response";
import { processKnowledgeSubmission } from "../../../../../lib/knowledge-submission";
import { runKnowledgeIndexJob } from "../../../../../lib/knowledge-store";

export async function POST(request: Request) {
  const secret = env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || request.headers.get("x-internal-queue-secret") !== secret) return apiError("无权处理内部队列任务。", 403, "FORBIDDEN");
  let body: { type?: string; submissionId?: string; jobId?: string } | null = null;
  try {
    body = await request.json() as { type?: string; submissionId?: string; jobId?: string };
    if (body.type === "convert" && body.submissionId && /^[0-9a-f-]{36}$/i.test(body.submissionId)) return Response.json({ ok: true, result: await processKnowledgeSubmission(body.submissionId) });
    if (body.type === "index" && body.jobId && /^[0-9a-f-]{36}$/i.test(body.jobId)) return Response.json({ ok: true, result: await runKnowledgeIndexJob(body.jobId) });
    return apiError("队列消息无效。", 400, "INVALID_INPUT");
  } catch (error) {
    const attempt = Number(request.headers.get("x-queue-attempt") || "1");
    if (body && attempt <= 3) {
      const retryAt = new Date().toISOString(); const message = `自动重试中：${error instanceof Error ? error.message : "队列任务失败"}`.slice(0, 500);
      if (body.type === "convert" && body.submissionId) await getDb().update(knowledgeSubmissions).set({ status: "queued", error: message, updatedAt: retryAt }).where(eq(knowledgeSubmissions.id, body.submissionId));
      if (body.type === "index" && body.jobId) await getDb().update(knowledgeJobs).set({ status: "queued", finishedAt: null, error: message, updatedAt: retryAt }).where(eq(knowledgeJobs.id, body.jobId));
    }
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "队列任务失败" }, { status: 500 });
  }
}
