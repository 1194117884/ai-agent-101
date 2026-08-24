import { normalizeKnowledgeText } from "./knowledge.ts";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const CONVERTED_PART_CHARS = 160_000;
export const SUPPORTED_UPLOAD_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "svg", "gif", "bmp", "html", "htm", "xml", "xlsx", "xlsm", "xlsb", "xls", "et", "docx", "ods", "odt", "csv", "numbers", "txt", "md", "markdown"];
export function uploadExtension(filename: string) { return filename.split(".").pop()?.toLowerCase() ?? ""; }
export function validateUploadMetadata(name: string, size: number) {
  const extension = uploadExtension(name);
  if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(extension)) throw new Error(`暂不支持 .${extension || "未知"} 文件。`);
  if (!size) throw new Error("文件为空。");
  if (size > MAX_UPLOAD_BYTES) throw new Error("单个文件不能超过 20 MB。");
  return extension;
}
export function splitConvertedDocument(value: string, maxChars = CONVERTED_PART_CHARS) {
  const content = normalizeKnowledgeText(value); if (!content) return [];
  const parts: string[] = []; let start = 0;
  while (start < content.length) { let end = Math.min(content.length, start + maxChars); if (end < content.length) { const boundary = Math.max(content.lastIndexOf("\n\n", end), content.lastIndexOf("。", end), content.lastIndexOf(". ", end)); if (boundary > start + Math.floor(maxChars * 0.6)) end = boundary + 1; } parts.push(content.slice(start, end).trim()); start = end; }
  return parts.filter((part) => part.length >= 20);
}
