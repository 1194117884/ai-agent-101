export const MAX_DOCUMENT_CHARS = 200_000;
export const DEFAULT_CHUNK_CHARS = 1_200;
export const DEFAULT_CHUNK_OVERLAP = 160;

export type KnowledgeChunkInput = { ordinal: number; content: string; tokenEstimate: number };
export type KnowledgeDocumentInput = { id?: string; title: string; url?: string; sourceType: "manual" | "web" | "note" | "upload"; sourceFileName?: string; sourceMimeType?: string; submittedBy?: string; submissionId?: string; versionLabel?: string; trustLevel: "primary" | "trusted" | "reference"; status: "draft" | "approved" | "archived"; topicIds: string[]; summary?: string; content: string };

export function normalizeKnowledgeText(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function splitKnowledgeText(value: string, maxChars = DEFAULT_CHUNK_CHARS, overlap = DEFAULT_CHUNK_OVERLAP): KnowledgeChunkInput[] {
  const text = normalizeKnowledgeText(value);
  if (!text) return [];
  const chunks: KnowledgeChunkInput[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const window = text.slice(start + Math.floor(maxChars * 0.55), end);
      const boundary = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("。"), window.lastIndexOf("！"), window.lastIndexOf("？"), window.lastIndexOf(". "));
      if (boundary >= 0) end = start + Math.floor(maxChars * 0.55) + boundary + 1;
    }
    const content = text.slice(start, end).trim();
    if (content) chunks.push({ ordinal: chunks.length, content, tokenEstimate: Math.max(1, Math.ceil(content.length / 2)) });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateKnowledgeDocument(input: KnowledgeDocumentInput) {
  if (!input.title?.trim()) throw new Error("资料标题不能为空。");
  const content = normalizeKnowledgeText(input.content ?? "");
  if (content.length < 20) throw new Error("资料正文至少需要 20 个字符。");
  if (content.length > MAX_DOCUMENT_CHARS) throw new Error(`单份资料不能超过 ${MAX_DOCUMENT_CHARS} 个字符。`);
  if (!(["manual", "web", "note", "upload"] as const).includes(input.sourceType)) throw new Error("资料类型无效。");
  if (!(["primary", "trusted", "reference"] as const).includes(input.trustLevel)) throw new Error("可信级别无效。");
  if (!(["draft", "approved", "archived"] as const).includes(input.status)) throw new Error("资料状态无效。");
  if (input.url?.trim()) {
    const url = new URL(input.url.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("资料 URL 必须是无账号信息的 HTTP(S) 地址。");
  }
  return content;
}

export function knowledgeSearchTerms(query: string) {
  const normalized = query.toLowerCase();
  const words = normalized.match(/[a-z0-9][a-z0-9_-]{1,}|[\u3400-\u9fff]{2,}/g) ?? [];
  const terms = new Set<string>();
  for (const word of words) {
    terms.add(word);
    if (/^[\u3400-\u9fff]+$/.test(word) && word.length > 2) for (let index = 0; index < word.length - 1; index += 1) terms.add(word.slice(index, index + 2));
  }
  return [...terms].slice(0, 30);
}

export function knowledgeLexicalScore(query: string, content: string) {
  const haystack = content.toLowerCase();
  return knowledgeSearchTerms(query).reduce((score, term) => score + (haystack.includes(term) ? Math.min(3, term.length / 2) : 0), 0);
}
