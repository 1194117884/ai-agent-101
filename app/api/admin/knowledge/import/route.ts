import { getAdminUser } from "../../../../admin-auth";
import { apiError, databaseError } from "../../../../../lib/api-response";
import { assertImportContent, fetchPublicKnowledgePage, importedTitle, MAX_IMPORT_ITEMS } from "../../../../../lib/knowledge-import";
import { enqueueKnowledgeIndexJob, saveKnowledgeDocument } from "../../../../../lib/knowledge-store";

type FileItem = { filename?: string; content?: string };
type ImportRequest = { files?: FileItem[]; urls?: string[] };

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return apiError("无权导入知识资料。", 403, "FORBIDDEN");
  try {
    const body = await request.json() as ImportRequest;
    const files = Array.isArray(body.files) ? body.files : [];
    const urls = Array.isArray(body.urls) ? body.urls : [];
    if (files.length + urls.length === 0) return apiError("请选择文件或填写网页地址。", 400, "INVALID_INPUT");
    if (files.length + urls.length > MAX_IMPORT_ITEMS) return apiError(`每批最多导入 ${MAX_IMPORT_ITEMS} 份资料。`, 400, "INVALID_INPUT");
    const results: { source: string; ok: boolean; id?: string; title?: string; duplicate?: boolean; error?: string }[] = [];
    for (const file of files) {
      const source = file.filename?.slice(0, 200) || "未命名文件";
      try {
        const title = importedTitle(source);
        const content = assertImportContent(file.content ?? "");
        const saved = await saveKnowledgeDocument({ title, sourceType: "manual", trustLevel: "trusted", status: "approved", topicIds: [], content });
        if (saved.needsIndex) await enqueueKnowledgeIndexJob(saved.id, user.userId);
        results.push({ source, ok: true, id: saved.id, title, duplicate: saved.duplicate });
      } catch (error) { results.push({ source, ok: false, error: error instanceof Error ? error.message : "文件导入失败" }); }
    }
    for (const value of urls) {
      const source = value.slice(0, 500);
      try {
        const page = await fetchPublicKnowledgePage(source);
        const saved = await saveKnowledgeDocument({ title: page.title, url: page.url, sourceType: "web", trustLevel: "reference", status: "approved", topicIds: [], content: page.content });
        if (saved.needsIndex) await enqueueKnowledgeIndexJob(saved.id, user.userId);
        results.push({ source, ok: true, id: saved.id, title: page.title, duplicate: saved.duplicate });
      } catch (error) { results.push({ source, ok: false, error: error instanceof Error ? error.message : "网页导入失败" }); }
    }
    const imported = results.filter((item) => item.ok && !item.duplicate).length;
    const duplicates = results.filter((item) => item.duplicate).length;
    const failed = results.filter((item) => !item.ok).length;
    return Response.json({ ok: imported + duplicates > 0, imported, duplicates, failed, results }, { status: imported + duplicates > 0 ? 200 : 422 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("导入请求格式无效。", 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
