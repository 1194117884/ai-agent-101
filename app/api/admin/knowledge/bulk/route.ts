import { getAdminUser } from "../../../../admin-auth";
import { apiError, databaseError } from "../../../../../lib/api-response";
import { bulkIndexKnowledgeDocuments, bulkSetKnowledgeStatus } from "../../../../../lib/knowledge-store";

type BulkRequest = { action?: "approve" | "archive" | "index"; ids?: string[] };

export async function POST(request: Request) {
  if (!await getAdminUser()) return apiError("无权批量管理知识资料。", 403, "FORBIDDEN");
  try {
    const body = await request.json() as BulkRequest;
    const ids = [...new Set((body.ids ?? []).filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))];
    if (!body.action || !["approve", "archive", "index"].includes(body.action)) return apiError("批量操作无效。", 400, "INVALID_INPUT");
    if (!ids.length || ids.length > 50) return apiError("请选择 1–50 份有效资料。", 400, "INVALID_INPUT");
    if (body.action === "index") {
      if (ids.length > 10) return apiError("为保护免费额度，每批最多建立 10 份索引。", 400, "INVALID_INPUT");
      const results = await bulkIndexKnowledgeDocuments(ids);
      const completed = results.filter((result) => result.ok).length;
      return Response.json({ ok: completed > 0, completed, failed: results.length - completed, results }, { status: completed > 0 ? 200 : 422 });
    }
    const changed = await bulkSetKnowledgeStatus(ids, body.action === "approve" ? "approved" : "archived");
    return Response.json({ ok: true, changed });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("批量请求格式无效。", 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
