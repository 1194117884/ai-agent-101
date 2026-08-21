import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeChunks, sourceDocuments } from "../db/schema";
import { sha256, splitKnowledgeText, validateKnowledgeDocument, type KnowledgeDocumentInput } from "./knowledge";
export type { KnowledgeDocumentInput } from "./knowledge";

export async function listKnowledgeDocuments() {
  return getDb().select({ id: sourceDocuments.id, title: sourceDocuments.title, url: sourceDocuments.url, sourceType: sourceDocuments.sourceType, versionLabel: sourceDocuments.versionLabel, trustLevel: sourceDocuments.trustLevel, status: sourceDocuments.status, topicIdsJson: sourceDocuments.topicIdsJson, summary: sourceDocuments.summary, content: sourceDocuments.content, ingestionStatus: sourceDocuments.ingestionStatus, chunkCount: sourceDocuments.chunkCount, lastIndexedAt: sourceDocuments.lastIndexedAt, ingestionError: sourceDocuments.ingestionError, updatedAt: sourceDocuments.updatedAt }).from(sourceDocuments).orderBy(desc(sourceDocuments.updatedAt));
}

export async function saveKnowledgeDocument(input: KnowledgeDocumentInput) {
  const content = validateKnowledgeDocument(input);
  const db = getDb();
  const id = input.id ?? crypto.randomUUID();
  if (input.id) {
    const [existing] = await db.select({ id: sourceDocuments.id }).from(sourceDocuments).where(eq(sourceDocuments.id, input.id)).limit(1);
    if (!existing) throw new Error("资料不存在，请刷新后重试。");
  }
  const contentHash = await sha256(content);
  const values = { title: input.title.trim(), url: input.url?.trim() || `manual://${id}`, sourceType: input.sourceType, versionLabel: input.versionLabel?.trim() || null, trustLevel: input.trustLevel, status: input.status, topicIdsJson: JSON.stringify([...new Set(input.topicIds.map((item) => item.trim()).filter(Boolean))]), summary: input.summary?.trim() || null, content, contentHash, ingestionStatus: "pending", chunkCount: 0, lastIndexedAt: null, ingestionError: null, updatedAt: new Date().toISOString() };
  if (input.id) await db.update(sourceDocuments).set(values).where(eq(sourceDocuments.id, id));
  else await db.insert(sourceDocuments).values({ id, reviewedAt: input.status === "approved" ? new Date().toISOString() : null, ...values });
  return id;
}

export async function deleteKnowledgeDocument(id: string) {
  const db = getDb();
  const vectors = await db.select({ vectorId: knowledgeChunks.vectorId }).from(knowledgeChunks).where(eq(knowledgeChunks.sourceDocumentId, id));
  if (vectors.length) await env.VECTORIZE.deleteByIds(vectors.map((item) => item.vectorId));
  await db.delete(sourceDocuments).where(eq(sourceDocuments.id, id));
}

export async function indexKnowledgeDocument(id: string) {
  const db = getDb();
  const [document] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, id)).limit(1);
  if (!document) throw new Error("资料不存在。");
  if (document.status !== "approved") throw new Error("只有已审核资料可以建立索引。");
  if (!document.content) throw new Error("资料正文为空。");
  await db.update(sourceDocuments).set({ ingestionStatus: "indexing", ingestionError: null, updatedAt: new Date().toISOString() }).where(eq(sourceDocuments.id, id));
  try {
    const chunks = splitKnowledgeText(document.content);
    if (!chunks.length) throw new Error("资料无法切分。");
    const model = env.KNOWLEDGE_EMBEDDING_MODEL ?? "@cf/baai/bge-m3";
    const result = await env.AI.run(model, { text: chunks.map((chunk) => chunk.content), truncate_inputs: true }) as { data?: number[][] };
    if (!result.data || result.data.length !== chunks.length) throw new Error("Embedding 返回数量与切片不一致。");
    const timestamp = new Date().toISOString();
    const rows = await Promise.all(chunks.map(async (chunk) => ({ id: crypto.randomUUID(), sourceDocumentId: id, ordinal: chunk.ordinal, content: chunk.content, contentHash: await sha256(chunk.content), tokenEstimate: chunk.tokenEstimate, vectorId: `${id}:${chunk.ordinal}`, status: "indexed", indexedAt: timestamp })));
    const oldVectors = await db.select({ vectorId: knowledgeChunks.vectorId }).from(knowledgeChunks).where(eq(knowledgeChunks.sourceDocumentId, id));
    await env.VECTORIZE.upsert(rows.map((row, index) => ({ id: row.vectorId, values: result.data![index], namespace: "knowledge", metadata: { documentId: id, ordinal: row.ordinal, status: "approved" } })));
    const retained = new Set(rows.map((row) => row.vectorId));
    const obsolete = oldVectors.filter((item) => !retained.has(item.vectorId)).map((item) => item.vectorId);
    if (obsolete.length) await env.VECTORIZE.deleteByIds(obsolete);
    await db.batch([
      db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceDocumentId, id)),
      db.insert(knowledgeChunks).values(rows),
      db.update(sourceDocuments).set({ ingestionStatus: "indexed", chunkCount: rows.length, lastIndexedAt: timestamp, ingestionError: null, reviewedAt: document.reviewedAt ?? timestamp, updatedAt: timestamp }).where(eq(sourceDocuments.id, id)),
    ]);
    return { chunkCount: rows.length, model };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "未知索引错误";
    await db.update(sourceDocuments).set({ ingestionStatus: "failed", ingestionError: message, updatedAt: new Date().toISOString() }).where(eq(sourceDocuments.id, id));
    throw error;
  }
}
