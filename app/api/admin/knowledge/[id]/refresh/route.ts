import { getAdminUser } from "../../../../../admin-auth";
import { apiError, databaseError } from "../../../../../../lib/api-response";
import { enqueueKnowledgeIndexJob, refreshKnowledgeDocument } from "../../../../../../lib/knowledge-store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) return apiError("无权刷新知识资料。", 403, "FORBIDDEN");
  try {
    const result = await refreshKnowledgeDocument((await params).id);
    const job = result.changed ? await enqueueKnowledgeIndexJob(result.id, user.userId) : null;
    return Response.json({ ok: true, ...result, job });
  }
  catch (error) {
    if (error instanceof Error && /不存在|只有网页/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
