import { getAdminUser } from "../../../../admin-auth";
import { apiError, databaseError } from "../../../../../lib/api-response";
import { deleteKnowledgeEvalCase, listKnowledgeEvalCases, runKnowledgeEvalCases, saveKnowledgeEvalCase, type KnowledgeEvalInput } from "../../../../../lib/knowledge-eval";

export async function GET() {
  if (!await getAdminUser()) return apiError("无权查看知识库评测。", 403, "FORBIDDEN");
  try { return Response.json({ cases: await listKnowledgeEvalCases() }); }
  catch (error) { return databaseError(error); }
}

export async function POST(request: Request) {
  if (!await getAdminUser()) return apiError("无权管理知识库评测。", 403, "FORBIDDEN");
  try { const input = await request.json() as KnowledgeEvalInput; return Response.json({ ok: true, id: await saveKnowledgeEvalCase(input) }, { status: input.id ? 200 : 201 }); }
  catch (error) { if (error instanceof Error && /评测问题|至少设置/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT"); return databaseError(error); }
}

export async function PUT(request: Request) {
  if (!await getAdminUser()) return apiError("无权运行知识库评测。", 403, "FORBIDDEN");
  try {
    const body = await request.json() as { ids?: string[] };
    const ids = body.ids?.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 30);
    const results = await runKnowledgeEvalCases(ids);
    return Response.json({ ok: true, passed: results.filter((item) => item.passed).length, failed: results.filter((item) => !item.passed).length, results });
  } catch (error) { return databaseError(error); }
}

export async function DELETE(request: Request) {
  if (!await getAdminUser()) return apiError("无权删除知识库评测。", 403, "FORBIDDEN");
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError("缺少评测 ID。", 400, "INVALID_INPUT");
  try { await deleteKnowledgeEvalCase(id); return Response.json({ ok: true }); }
  catch (error) { return databaseError(error); }
}
