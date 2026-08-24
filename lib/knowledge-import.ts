import { MAX_DOCUMENT_CHARS, normalizeKnowledgeText } from "./knowledge.ts";

export const MAX_IMPORT_ITEMS = 20;
export const MAX_IMPORT_BYTES = 1_000_000;

export function validateImportUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("只允许无账号信息的 HTTP(S) 网页地址。");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("网页地址只能使用 80 或 443 端口。");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.includes(":")) throw new Error("不允许导入本地或内网地址。");
  const ipv4 = hostname.split(".").map(Number);
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    if (ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168) || ipv4[0] >= 224) throw new Error("不允许导入本地或内网地址。");
  }
  return url;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function htmlToKnowledgeText(html: string) {
  return normalizeKnowledgeText(html
    .replace(/<(script|style|noscript|svg|nav|footer|form)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(p|div|section|article|main|h[1-6]|li|ul|ol|pre|blockquote|br|tr|table)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
      if (entity[0] === "#") { const radix = entity[1]?.toLowerCase() === "x" ? 16 : 10; const value = Number.parseInt(entity.slice(radix === 16 ? 2 : 1), radix); return Number.isFinite(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : " "; }
      return entities[entity.toLowerCase()] ?? " ";
    }));
}

export function importedTitle(filename: string, fallback = "导入资料") {
  return filename.replace(/^.*[\\/]/, "").replace(/\.(md|markdown|txt)$/i, "").trim() || fallback;
}

export function assertImportContent(content: string) {
  const normalized = normalizeKnowledgeText(content);
  if (normalized.length < 20) throw new Error("正文至少需要 20 个字符。");
  if (normalized.length > MAX_DOCUMENT_CHARS) throw new Error(`正文不能超过 ${MAX_DOCUMENT_CHARS} 个字符。`);
  return normalized;
}

export function pageTitle(html: string, url: URL) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const normalized = title ? htmlToKnowledgeText(title) : "";
  return normalized.slice(0, 180) || url.hostname;
}

export async function readLimitedText(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_IMPORT_BYTES) throw new Error("网页内容超过 1 MB 限制。");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IMPORT_BYTES) { await reader.cancel(); throw new Error("网页内容超过 1 MB 限制。"); }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}
