import { getAdminUser } from "../../../../admin-auth";
import { apiError, databaseError } from "../../../../../lib/api-response";
import { assertImportContent, htmlToKnowledgeText, importedTitle, MAX_IMPORT_ITEMS, pageTitle, readLimitedText, validateImportUrl } from "../../../../../lib/knowledge-import";
import { saveKnowledgeDocument } from "../../../../../lib/knowledge-store";

type FileItem = { filename?: string; content?: string };
type ImportRequest = { files?: FileItem[]; urls?: string[] };

async function fetchPublicPage(value: string) {
  let url = validateImportUrl(value);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, { redirect: "manual", headers: { accept: "text/html,text/plain,text/markdown", "user-agent": "AgentCoachKnowledgeImporter/1.0" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("网页重定向次数过多。");
      url = validateImportUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`网页返回 HTTP ${response.status}。`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("text/markdown") && !contentType.includes("application/xhtml")) throw new Error("网页不是可导入的文本格式。");
    const raw = await readLimitedText(response);
    const content = assertImportContent(contentType.includes("html") || contentType.includes("xhtml") ? htmlToKnowledgeText(raw) : raw);
    return { title: pageTitle(raw, url), url: url.toString(), content };
  }
  throw new Error("网页抓取失败。");
}

export async function POST(request: Request) {
  if (!await getAdminUser()) return apiError("无权导入知识资料。", 403, "FORBIDDEN");
  try {
    const body = await request.json() as ImportRequest;
    const files = Array.isArray(body.files) ? body.files : [];
    const urls = Array.isArray(body.urls) ? body.urls : [];
    if (files.length + urls.length === 0) return apiError("请选择文件或填写网页地址。", 400, "INVALID_INPUT");
    if (files.length + urls.length > MAX_IMPORT_ITEMS) return apiError(`每批最多导入 ${MAX_IMPORT_ITEMS} 份资料。`, 400, "INVALID_INPUT");
    const results: { source: string; ok: boolean; id?: string; title?: string; error?: string }[] = [];
    for (const file of files) {
      const source = file.filename?.slice(0, 200) || "未命名文件";
      try {
        const title = importedTitle(source);
        const content = assertImportContent(file.content ?? "");
        const id = await saveKnowledgeDocument({ title, sourceType: "manual", trustLevel: "trusted", status: "draft", topicIds: [], content });
        results.push({ source, ok: true, id, title });
      } catch (error) { results.push({ source, ok: false, error: error instanceof Error ? error.message : "文件导入失败" }); }
    }
    for (const value of urls) {
      const source = value.slice(0, 500);
      try {
        const page = await fetchPublicPage(source);
        const id = await saveKnowledgeDocument({ title: page.title, url: page.url, sourceType: "web", trustLevel: "reference", status: "draft", topicIds: [], content: page.content });
        results.push({ source, ok: true, id, title: page.title });
      } catch (error) { results.push({ source, ok: false, error: error instanceof Error ? error.message : "网页导入失败" }); }
    }
    const imported = results.filter((item) => item.ok).length;
    return Response.json({ ok: imported > 0, imported, failed: results.length - imported, results }, { status: imported > 0 ? 200 : 422 });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("导入请求格式无效。", 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
