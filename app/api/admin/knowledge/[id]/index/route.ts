import { after } from "next/server";
import { getAdminUser } from "../../../../../admin-auth";
import { apiError, databaseError } from "../../../../../../lib/api-response";
import { createKnowledgeIndexJob, runKnowledgeIndexJob } from "../../../../../../lib/knowledge-store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) return apiError("无权管理知识库。", 403, "FORBIDDEN");
  try {
    const job = await createKnowledgeIndexJob((await params).id, user.userId);
    if (!job.duplicate) after(() => runKnowledgeIndexJob(job.id));
    return Response.json({ ok: true, queued: true, jobId: job.id, duplicate: job.duplicate }, { status: 202 });
  }
  catch (error) {
    if (error instanceof Error && /不存在|只有已审核|为空|无法切分/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
