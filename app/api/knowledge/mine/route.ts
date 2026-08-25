import { desc, eq } from "drizzle-orm";
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
    const current = submissions.map((submission) => { const parts = bySubmission.get(submission.id) ?? []; const summary = summarizeParts(parts); const overallStage = submission.status === "failed" ? "failed" : parts.length === 0 && submission.duplicateCount > 0 ? "duplicate" : summary.overallStage; return { ...submission, overallStage, stageCounts: summary.stageCounts, parts }; });
    const legacyGroups = new Map<string, typeof documents>();
    for (const document of documents) if (!document.submissionId) { const key = document.sourceFileName || document.id; legacyGroups.set(key, [...(legacyGroups.get(key) ?? []), document]); }
    const legacy = [...legacyGroups.entries()].map(([fileName, parts]) => { const summary = summarizeParts(parts); const createdAt = parts.map((part) => part.createdAt).sort()[0]; return { id: `legacy-${parts[0].id}`, submittedBy: user.userId, fileName, mimeType: parts[0].sourceMimeType ?? "application/octet-stream", fileSize: 0, status: "completed", conversion: "legacy", characterCount: 0, partCount: parts.length, duplicateCount: 0, error: null, createdAt, updatedAt: createdAt, ...summary, parts }; });
    return Response.json({ submissions: [...current, ...legacy].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100) });
  } catch (error) { return databaseError(error); }
}
