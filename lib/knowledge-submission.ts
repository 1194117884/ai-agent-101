import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeSubmissions } from "../db/schema";
import { convertUploadToMarkdown, splitConvertedDocument } from "./document-conversion";
import { saveKnowledgeDocument } from "./knowledge-store";

export async function processKnowledgeSubmission(submissionId: string) {
  const db = getDb();
  const [submission] = await db.select().from(knowledgeSubmissions).where(eq(knowledgeSubmissions.id, submissionId)).limit(1);
  if (!submission) throw new Error("上传任务不存在。");
  if (submission.status === "completed") return { duplicateDelivery: true };
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
      saved.push(await saveKnowledgeDocument({ title, sourceType: "upload", sourceFileName: submission.fileName, sourceMimeType: submission.mimeType, submittedBy: submission.submittedBy, submissionId, trustLevel: "reference", status: "draft", topicIds: [], summary: `用户 ${submission.submitterName || "学习者"} 上传；${converted.conversion} 转换。`, content: parts[index] }));
    }
    const characterCount = parts.reduce((sum, part) => sum + part.length, 0); const duplicateCount = saved.filter((item) => item.duplicate).length; const finishedAt = new Date().toISOString();
    await db.update(knowledgeSubmissions).set({ status: "completed", conversion: converted.conversion, characterCount, partCount: saved.length, duplicateCount, error: null, updatedAt: finishedAt }).where(eq(knowledgeSubmissions.id, submissionId));
    await env.KNOWLEDGE_UPLOADS.delete(submission.objectKey);
    return { characterCount, partCount: saved.length, duplicateCount };
  } catch (error) {
    const failedAt = new Date().toISOString(); const message = error instanceof Error ? error.message.slice(0, 500) : "文档转换失败";
    await db.update(knowledgeSubmissions).set({ status: "failed", error: message, updatedAt: failedAt }).where(eq(knowledgeSubmissions.id, submissionId));
    throw error;
  }
}
