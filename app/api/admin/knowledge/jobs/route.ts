import { after } from "next/server";
import { getAdminUser } from "../../../../admin-auth";
import { apiError, databaseError } from "../../../../../lib/api-response";
import { retryKnowledgeIndexJob, runKnowledgeIndexJob } from "../../../../../lib/knowledge-store";

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return apiError("无权重试知识任务。", 403, "FORBIDDEN");
  try {
    const body = await request.json() as { jobId?: string };
    if (!body.jobId || !/^[0-9a-f-]{36}$/i.test(body.jobId)) return apiError("任务 ID 无效。", 400, "INVALID_INPUT");
    const job = await retryKnowledgeIndexJob(body.jobId, user.userId);
    if (!job.duplicate) after(() => runKnowledgeIndexJob(job.id));
    return Response.json({ ok: true, queued: true, jobId: job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("请求格式无效。", 400, "INVALID_INPUT");
    if (error instanceof Error && /只有失败任务|不存在|只有已审核|为空/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
