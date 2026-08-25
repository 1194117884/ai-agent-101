import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { getCloudflareUser } from "../../../auth";
import { getDb } from "../../../../db";
import { knowledgeSubmissions, sourceDocuments } from "../../../../db/schema";
import { apiError, databaseError } from "../../../../lib/api-response";

function partStage(document: { status: string; ingestionStatus: string }) {
  if (document.status === "archived") return "archived";
  if (document.status === "draft") return "pending_review";
  if (document.ingestionStatus === "failed") return "index_failed";
  if (document.ingestionStatus === "indexed" || document.ingestionStatus === "lexical") return "live";
  return "pending_index";
}
function summarizeParts(parts: { status: string; ingestionStatus: string }[]) {
  const stageCounts: Record<string, number> = {};
  for (const part of parts) { const stage = partStage(part); stageCounts[stage] = (stageCounts[stage] ?? 0) + 1; }
  const overallStage = stageCounts.index_failed ? "index_failed" : stageCounts.pending_review ? "pending_review" : stageCounts.pending_index ? "pending_index" : stageCounts.live ? "live" : stageCounts.archived ? "archived" : "processing";
  return { stageCounts, overallStage };
}

export async function GET() {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录后查看上传记录。", 401, "AUTH_REQUIRED");
  try {
    const db = getDb();
    const [submissions, documents] = await Promise.all([
      db.select().from(knowledgeSubmissions).where(eq(knowledgeSubmissions.submittedBy, user.userId)).orderBy(desc(knowledgeSubmissions.createdAt)).limit(100),
      db.select({ id: sourceDocuments.id, submissionId: sourceDocuments.submissionId, title: sourceDocuments.title, sourceFileName: sourceDocuments.sourceFileName, sourceMimeType: sourceDocuments.sourceMimeType, status: sourceDocuments.status, ingestionStatus: sourceDocuments.ingestionStatus, ingestionError: sourceDocuments.ingestionError, createdAt: sourceDocuments.createdAt }).from(sourceDocuments).where(eq(sourceDocuments.submittedBy, user.userId)),
    ]);
    const bySubmission = new Map<string, typeof documents>();
    for (const document of documents) if (document.submissionId) bySubmission.set(document.submissionId, [...(bySubmission.get(document.submissionId) ?? []), document]);
    const current = submissions.map((submission) => { const parts = bySubmission.get(submission.id) ?? []; const summary = summarizeParts(parts); const overallStage = submission.status === "failed" ? "failed" : submission.status === "queued" ? "queued" : submission.status === "processing" ? "processing" : parts.length === 0 && submission.duplicateCount > 0 ? "duplicate" : summary.overallStage; return { ...submission, overallStage, stageCounts: summary.stageCounts, parts }; });
    const legacyGroups = new Map<string, typeof documents>();
    for (const document of documents) if (!document.submissionId) { const key = document.sourceFileName || document.id; legacyGroups.set(key, [...(legacyGroups.get(key) ?? []), document]); }
    const legacy = [...legacyGroups.entries()].map(([fileName, parts]) => { const summary = summarizeParts(parts); const createdAt = parts.map((part) => part.createdAt).sort()[0]; return { id: `legacy-${parts[0].id}`, submittedBy: user.userId, fileName, mimeType: parts[0].sourceMimeType ?? "application/octet-stream", fileSize: 0, status: "completed", conversion: "legacy", characterCount: 0, partCount: parts.length, duplicateCount: 0, error: null, createdAt, updatedAt: createdAt, ...summary, parts }; });
    return Response.json({ submissions: [...current, ...legacy].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100) });
  } catch (error) { return databaseError(error); }
}

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录后重试上传。", 401, "AUTH_REQUIRED");
  try {
    const body = await request.json() as { submissionId?: string };
    if (!body.submissionId || !/^[0-9a-f-]{36}$/i.test(body.submissionId)) return apiError("提交 ID 无效。", 400, "INVALID_INPUT");
    const db = getDb();
    const [submission] = await db.select().from(knowledgeSubmissions).where(and(eq(knowledgeSubmissions.id, body.submissionId), eq(knowledgeSubmissions.submittedBy, user.userId))).limit(1);
    if (!submission || submission.status !== "failed" || !submission.objectKey) return apiError("只有保留了原始文件的失败任务可以重试。", 400, "INVALID_INPUT");
    const object = await env.KNOWLEDGE_UPLOADS.head(submission.objectKey);
    if (!object) return apiError("原始文件已清理，请重新上传。", 410, "INVALID_INPUT");
    const now = new Date().toISOString(); await db.update(knowledgeSubmissions).set({ status: "queued", error: null, updatedAt: now }).where(eq(knowledgeSubmissions.id, submission.id));
    try { await env.KNOWLEDGE_QUEUE.send({ type: "convert", submissionId: submission.id }); }
    catch (error) { await db.update(knowledgeSubmissions).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "任务排队失败", updatedAt: new Date().toISOString() }).where(eq(knowledgeSubmissions.id, submission.id)); throw error; }
    return Response.json({ ok: true, queued: true }, { status: 202 });
  } catch (error) { if (error instanceof SyntaxError) return apiError("请求格式无效。", 400, "INVALID_INPUT"); return databaseError(error); }
}
