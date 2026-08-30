import { env } from "cloudflare:workers";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeSubmissions } from "../db/schema";
import { convertUploadToMarkdown, splitConvertedDocument } from "./document-conversion";
import { enqueueKnowledgeIndexJob, saveKnowledgeDocument } from "./knowledge-store";

export async function processKnowledgeSubmission(submissionId: string) {
  const db = getDb();
  const [submission] = await db.select().from(knowledgeSubmissions).where(eq(knowledgeSubmissions.id, submissionId)).limit(1);
  if (!submission) throw new Error("上传任务不存在。");
  if (["completed", "withdrawn"].includes(submission.status)) return { duplicateDelivery: true };
  if (!submission.objectKey) throw new Error("上传任务缺少 R2 文件。");
  const startedAt = new Date().toISOString();
  await db.update(knowledgeSubmissions).set({ status: "processing", attempt: submission.attempt + 1, error: null, updatedAt: startedAt }).where(eq(knowledgeSubmissions.id, submissionId));
  try {
    const object = await env.KNOWLEDGE_UPLOADS.get(submission.objectKey);
    if (!object || !("body" in object)) throw new Error("R2 原始文件不存在。");
    const file = new File([await object.blob()], submission.fileName, { type: submission.mimeType });
    const converted = await convertUploadToMarkdown(file); const parts = splitConvertedDocument(converted.content);
    if (!parts.length) throw new Error("没有从文件中提取到足够的文字。扫描版文档可尝试上传页面图片。");
    const saved = [];
    for (let index = 0; index < parts.length; index += 1) {
      const title = parts.length > 1 ? `${converted.title}（${index + 1}/${parts.length}）` : converted.title;
      saved.push(await saveKnowledgeDocument({ title, sourceType: "upload", sourceFileName: submission.fileName, sourceMimeType: submission.mimeType, submittedBy: submission.submittedBy, submissionId, trustLevel: "reference", status: "approved", topicIds: [], summary: `管理员上传；${converted.conversion} 转换。`, content: parts[index] }));
    }
    for (const document of saved) if (document.needsIndex) await enqueueKnowledgeIndexJob(document.id, submission.submittedBy);
    const characterCount = parts.reduce((sum, part) => sum + part.length, 0); const duplicateCount = saved.filter((item) => item.duplicate).length; const finishedAt = new Date().toISOString();
    await env.KNOWLEDGE_UPLOADS.delete(submission.objectKey);
    await db.update(knowledgeSubmissions).set({ status: "completed", objectKey: null, conversion: converted.conversion, characterCount, partCount: saved.length, duplicateCount, error: null, updatedAt: finishedAt }).where(eq(knowledgeSubmissions.id, submissionId));
    return { characterCount, partCount: saved.length, duplicateCount };
  } catch (error) {
    const failedAt = new Date().toISOString(); const message = error instanceof Error ? error.message.slice(0, 500) : "文档转换失败";
    await db.update(knowledgeSubmissions).set({ status: "failed", error: message, updatedAt: failedAt }).where(eq(knowledgeSubmissions.id, submissionId));
    throw error;
  }
}

export async function discardKnowledgeSubmissionUpload(submissionId: string) {
  const db = getDb();
  const [submission] = await db.select().from(knowledgeSubmissions).where(eq(knowledgeSubmissions.id, submissionId)).limit(1);
  if (!submission) throw new Error("上传任务不存在。");
  if (["queued", "processing"].includes(submission.status)) throw new Error("正在处理的任务不能清理原文件。");
  if (submission.objectKey) await env.KNOWLEDGE_UPLOADS.delete(submission.objectKey);
  await db.update(knowledgeSubmissions).set({ objectKey: null, updatedAt: new Date().toISOString() }).where(eq(knowledgeSubmissions.id, submissionId));
  return { discarded: Boolean(submission.objectKey) };
}

export async function cleanupExpiredKnowledgeUploads(retentionDays = 7) {
  const cutoff = new Date(Date.now() - Math.max(1, retentionDays) * 86_400_000).toISOString();
  const db = getDb();
  const expired = await db.select({ id: knowledgeSubmissions.id, objectKey: knowledgeSubmissions.objectKey }).from(knowledgeSubmissions).where(and(eq(knowledgeSubmissions.status, "failed"), isNotNull(knowledgeSubmissions.objectKey), lt(knowledgeSubmissions.updatedAt, cutoff))).limit(100);
  let cleaned = 0;
  for (const submission of expired) {
    if (submission.objectKey) await env.KNOWLEDGE_UPLOADS.delete(submission.objectKey);
    await db.update(knowledgeSubmissions).set({ objectKey: null, updatedAt: new Date().toISOString() }).where(eq(knowledgeSubmissions.id, submission.id));
    cleaned += 1;
  }
  return { cleaned, cutoff, remaining: expired.length === 100 };
}
