import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getCloudflareUser } from "../../../auth";
import { getDb } from "../../../../db";
import { knowledgeSubmissions } from "../../../../db/schema";
import { apiError, databaseError } from "../../../../lib/api-response";
import { validateUploadFile } from "../../../../lib/document-conversion";

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录后上传资料。", 401, "AUTH_REQUIRED");
  let objectKey: string | null = null; let submissionId: string | null = null; let recordCreated = false;
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return apiError("请选择要上传的文件。", 400, "INVALID_INPUT");
    validateUploadFile(file);
    submissionId = crypto.randomUUID(); objectKey = `submissions/${user.userId}/${submissionId}`; const now = new Date().toISOString();
    await env.KNOWLEDGE_UPLOADS.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { fileName: file.name.slice(0, 240), submissionId } });
    await getDb().insert(knowledgeSubmissions).values({ id: submissionId, submittedBy: user.userId, submitterName: user.displayName.slice(0, 160), fileName: file.name.slice(0, 240), mimeType: (file.type || "application/octet-stream").slice(0, 160), fileSize: file.size, objectKey, status: "queued", updatedAt: now });
    recordCreated = true;
    await env.KNOWLEDGE_QUEUE.send({ type: "convert", submissionId });
    return Response.json({ ok: true, queued: true, submissionId, filename: file.name }, { status: 202 });
  } catch (error) {
    if (recordCreated && submissionId) { const now = new Date().toISOString(); try { await getDb().update(knowledgeSubmissions).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "任务排队失败", updatedAt: now }).where(eq(knowledgeSubmissions.id, submissionId)); } catch { /* Preserve the original error. */ } }
    else if (objectKey) try { await env.KNOWLEDGE_UPLOADS.delete(objectKey); } catch { /* Best-effort cleanup if no task record exists. */ }
    if (error instanceof Error && /暂不支持|文件为空|不能超过|转换|提取/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
