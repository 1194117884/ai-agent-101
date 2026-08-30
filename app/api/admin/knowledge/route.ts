import { getAdminUser } from "../../../admin-auth";
import { apiError, databaseError } from "../../../../lib/api-response";
import { deleteKnowledgeDocument, enqueueKnowledgeIndexJob, getKnowledgeStats, listKnowledgeDocuments, listKnowledgeJobs, listKnowledgeRetrievalLogs, listKnowledgeSubmissions, saveKnowledgeDocument, type KnowledgeDocumentInput } from "../../../../lib/knowledge-store";

export async function GET() {
  if (!await getAdminUser()) return apiError("无权管理知识库。", 403, "FORBIDDEN");
  try {
    const [documents, stats, retrievalLogs, jobs, submissions] = await Promise.all([listKnowledgeDocuments(), getKnowledgeStats(), listKnowledgeRetrievalLogs(), listKnowledgeJobs(), listKnowledgeSubmissions()]);
    return Response.json({ documents, stats, retrievalLogs, jobs, submissions });
  }
  catch (error) { return databaseError(error); }
}

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return apiError("无权管理知识库。", 403, "FORBIDDEN");
  try {
    const input = await request.json() as KnowledgeDocumentInput;
    if (input.status !== "archived") input.status = "approved";
    const saved = await saveKnowledgeDocument(input);
    const job = input.status === "approved" && saved.needsIndex ? await enqueueKnowledgeIndexJob(saved.id, user.userId) : null;
    return Response.json({ ok: true, ...saved, job }, { status: input.id || saved.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("资料格式不正确。", 400, "INVALID_INPUT");
    if (error instanceof Error && /不能为空|至少|不能超过|无效|URL|不存在/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}

export async function DELETE(request: Request) {
  if (!await getAdminUser()) return apiError("无权管理知识库。", 403, "FORBIDDEN");
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError("缺少资料 ID。", 400, "INVALID_INPUT");
  try { await deleteKnowledgeDocument(id); return Response.json({ ok: true }); }
  catch (error) { return databaseError(error); }
}
