import { eq } from "drizzle-orm";
import { getCloudflareUser } from "../../../auth";
import { getDb } from "../../../../db";
import { knowledgeSubmissions } from "../../../../db/schema";
import { apiError, databaseError } from "../../../../lib/api-response";
import { convertUploadToMarkdown, splitConvertedDocument } from "../../../../lib/document-conversion";
import { saveKnowledgeDocument } from "../../../../lib/knowledge-store";

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录后上传资料。", 401, "AUTH_REQUIRED");
  let submissionId: string | null = null;
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return apiError("请选择要上传的文件。", 400, "INVALID_INPUT");
    submissionId = crypto.randomUUID(); const db = getDb();
    await db.insert(knowledgeSubmissions).values({ id: submissionId, submittedBy: user.userId, fileName: file.name.slice(0, 240), mimeType: (file.type || "application/octet-stream").slice(0, 160), fileSize: file.size, status: "processing" });
    const converted = await convertUploadToMarkdown(file);
    const parts = splitConvertedDocument(converted.content);
    if (!parts.length) throw new Error("没有从文件中提取到足够的文字。扫描版文档可尝试上传页面图片。");
    const saved = [];
    for (let index = 0; index < parts.length; index += 1) {
      const title = parts.length > 1 ? `${converted.title}（${index + 1}/${parts.length}）` : converted.title;
      saved.push(await saveKnowledgeDocument({ title, sourceType: "upload", sourceFileName: file.name, sourceMimeType: file.type || "application/octet-stream", submittedBy: user.userId, submissionId, trustLevel: "reference", status: "draft", topicIds: [], summary: `用户 ${user.displayName} 上传；${converted.conversion} 转换。`, content: parts[index] }));
    }
    const characters = parts.reduce((sum, part) => sum + part.length, 0); const duplicates = saved.filter((item) => item.duplicate).length; const now = new Date().toISOString();
    await db.update(knowledgeSubmissions).set({ status: "completed", conversion: converted.conversion, characterCount: characters, partCount: saved.length, duplicateCount: duplicates, updatedAt: now }).where(eq(knowledgeSubmissions.id, submissionId));
    return Response.json({ ok: true, submissionId, filename: file.name, parts: saved.length, characters, duplicates });
  } catch (error) {
    if (submissionId) { const now = new Date().toISOString(); try { await getDb().update(knowledgeSubmissions).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "上传处理失败", updatedAt: now }).where(eq(knowledgeSubmissions.id, submissionId)); } catch { /* Preserve the original upload error. */ } }
    if (error instanceof Error && /暂不支持|文件为空|不能超过|转换|提取/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
