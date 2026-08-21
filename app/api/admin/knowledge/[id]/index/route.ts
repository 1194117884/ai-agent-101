import { getAdminUser } from "../../../../../admin-auth";
import { apiError, databaseError } from "../../../../../../lib/api-response";
import { indexKnowledgeDocument } from "../../../../../../lib/knowledge-store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getAdminUser()) return apiError("无权管理知识库。", 403, "FORBIDDEN");
  try { return Response.json({ ok: true, ...await indexKnowledgeDocument((await params).id) }); }
  catch (error) {
    if (error instanceof Error && /不存在|只有已审核|为空|无法切分/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
