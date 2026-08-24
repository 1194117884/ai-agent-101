import { getCloudflareUser } from "../../../auth";
import { apiError, databaseError } from "../../../../lib/api-response";
import { convertUploadToMarkdown, splitConvertedDocument } from "../../../../lib/document-conversion";
import { saveKnowledgeDocument } from "../../../../lib/knowledge-store";

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录后上传资料。", 401, "AUTH_REQUIRED");
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return apiError("请选择要上传的文件。", 400, "INVALID_INPUT");
    const converted = await convertUploadToMarkdown(file);
    const parts = splitConvertedDocument(converted.content);
    if (!parts.length) return apiError("没有从文件中提取到足够的文字。扫描版文档可尝试上传页面图片。", 422, "INVALID_INPUT");
    const saved = [];
    for (let index = 0; index < parts.length; index += 1) {
      const title = parts.length > 1 ? `${converted.title}（${index + 1}/${parts.length}）` : converted.title;
      saved.push(await saveKnowledgeDocument({ title, sourceType: "upload", sourceFileName: file.name, sourceMimeType: file.type || "application/octet-stream", submittedBy: user.userId, trustLevel: "reference", status: "draft", topicIds: [], summary: `用户 ${user.displayName} 上传；${converted.conversion} 转换。`, content: parts[index] }));
    }
    return Response.json({ ok: true, filename: file.name, parts: saved.length, characters: parts.reduce((sum, part) => sum + part.length, 0), duplicates: saved.filter((item) => item.duplicate).length });
  } catch (error) {
    if (error instanceof Error && /暂不支持|文件为空|不能超过|转换|提取/.test(error.message)) return apiError(error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
