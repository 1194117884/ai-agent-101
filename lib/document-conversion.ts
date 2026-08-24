import { env } from "cloudflare:workers";
import { importedTitle } from "./knowledge-import";
import { validateUploadMetadata } from "./document-conversion-core";
export { splitConvertedDocument } from "./document-conversion-core";
export function validateUploadFile(file: File) {
  return validateUploadMetadata(file.name, file.size);
}

export async function convertUploadToMarkdown(file: File) {
  const extension = validateUploadFile(file);
  if (["txt", "md", "markdown"].includes(extension)) return { title: importedTitle(file.name), content: await file.text(), conversion: "plain-text" };
  const result = await env.AI.toMarkdown({ name: file.name, blob: file });
  const item = Array.isArray(result) ? result[0] : result;
  if (!item || item.format === "error" || !("data" in item) || !item.data) throw new Error(item && "error" in item ? String(item.error) : "文档转换没有返回正文。");
  return { title: importedTitle(file.name), content: item.data, conversion: "cloudflare-markdown" };
}
