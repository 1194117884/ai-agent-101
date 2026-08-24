import { getAdminUser } from "../../../../../admin-auth";
import { apiError, databaseError } from "../../../../../../lib/api-response";
import { refreshKnowledgeDocument } from "../../../../../../lib/knowledge-store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getAdminUser()) return apiError("无权刷新知识资料。", 403, "FORBIDDEN");
  try { return Response.json({ ok: true, ...await refreshKnowledgeDocument((await params).id) }); }
  catch (error) {
    if (error instanceof Error && /不存在|只有网页/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
