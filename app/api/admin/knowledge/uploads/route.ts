import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getAdminUser } from "../../../../admin-auth";
import { getDb } from "../../../../../db";
import { knowledgeSubmissions } from "../../../../../db/schema";
import { apiError, databaseError } from "../../../../../lib/api-response";

export async function POST(request: Request) {
  if (!await getAdminUser()) return apiError("无权重试上传任务。", 403, "FORBIDDEN");
  try {
    const body = await request.json() as { submissionId?: string };
    if (!body.submissionId || !/^[0-9a-f-]{36}$/i.test(body.submissionId)) return apiError("提交 ID 无效。", 400, "INVALID_INPUT");
    const db = getDb();
    const [submission] = await db.select().from(knowledgeSubmissions).where(eq(knowledgeSubmissions.id, body.submissionId)).limit(1);
    if (!submission || submission.status !== "failed" || !submission.objectKey) return apiError("只有保留了原始文件的失败任务可以重试。", 400, "INVALID_INPUT");
    if (!await env.KNOWLEDGE_UPLOADS.head(submission.objectKey)) return apiError("原始文件已清理，请让用户重新上传。", 410, "INVALID_INPUT");
    const now = new Date().toISOString();
    await db.update(knowledgeSubmissions).set({ status: "queued", error: null, updatedAt: now }).where(eq(knowledgeSubmissions.id, submission.id));
    try { await env.KNOWLEDGE_QUEUE.send({ type: "convert", submissionId: submission.id }); }
    catch (error) {
      await db.update(knowledgeSubmissions).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "任务排队失败", updatedAt: new Date().toISOString() }).where(eq(knowledgeSubmissions.id, submission.id));
      throw error;
    }
    return Response.json({ ok: true, queued: true }, { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("请求格式无效。", 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
