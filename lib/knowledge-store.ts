import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeChunks, sourceDocuments } from "../db/schema";
import { sha256, splitKnowledgeText, validateKnowledgeDocument, type KnowledgeDocumentInput } from "./knowledge";
import { FREE_VECTOR_CAPACITY, getKnowledgeVectorProvider, KNOWLEDGE_VECTOR_DIMENSIONS } from "./knowledge-vector";
export type { KnowledgeDocumentInput } from "./knowledge";

export async function listKnowledgeDocuments() {
  return getDb().select({ id: sourceDocuments.id, title: sourceDocuments.title, url: sourceDocuments.url, sourceType: sourceDocuments.sourceType, versionLabel: sourceDocuments.versionLabel, trustLevel: sourceDocuments.trustLevel, status: sourceDocuments.status, topicIdsJson: sourceDocuments.topicIdsJson, summary: sourceDocuments.summary, content: sourceDocuments.content, ingestionStatus: sourceDocuments.ingestionStatus, chunkCount: sourceDocuments.chunkCount, lastIndexedAt: sourceDocuments.lastIndexedAt, ingestionError: sourceDocuments.ingestionError, updatedAt: sourceDocuments.updatedAt }).from(sourceDocuments).orderBy(desc(sourceDocuments.updatedAt));
}

export async function getKnowledgeStats() {
  const [stats] = await getDb().select({
    documentCount: sql<number>`count(*)`,
    chunkCount: sql<number>`coalesce(sum(${sourceDocuments.chunkCount}), 0)`,
  }).from(sourceDocuments);
  const chunkCount = Number(stats?.chunkCount ?? 0);
  return {
    documentCount: Number(stats?.documentCount ?? 0),
    chunkCount,
    vectorDimensions: KNOWLEDGE_VECTOR_DIMENSIONS,
    freeVectorCapacity: FREE_VECTOR_CAPACITY,
    capacityPercent: Math.min(100, Number(((chunkCount / FREE_VECTOR_CAPACITY) * 100).toFixed(1))),
    provider: "cloudflare",
  };
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
  if (vectors.length) {
    try { await getKnowledgeVectorProvider().delete(vectors.map((item) => item.vectorId)); }
    catch { /* D1 remains the source of truth; stale vectors cannot pass the join filter. */ }
  }
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
    const timestamp = new Date().toISOString();
    const rows = await Promise.all(chunks.map(async (chunk) => {
      const contentHash = await sha256(chunk.content);
      return { id: crypto.randomUUID(), sourceDocumentId: id, ordinal: chunk.ordinal, content: chunk.content, contentHash, tokenEstimate: chunk.tokenEstimate, vectorId: `${id}:${chunk.ordinal}:${contentHash.slice(0, 8)}`, status: "lexical", indexedAt: timestamp };
    }));
    const oldVectors = await db.select({ vectorId: knowledgeChunks.vectorId }).from(knowledgeChunks).where(eq(knowledgeChunks.sourceDocumentId, id));
    let providerName = "unavailable";
    let mode: "indexed" | "lexical" = "indexed";
    let ingestionError: string | null = null;
    try {
      const provider = getKnowledgeVectorProvider();
      providerName = provider.name;
      const embeddings = await provider.embed(chunks.map((chunk) => chunk.content));
      await provider.upsert(rows.map((row, index) => ({ id: row.vectorId, values: embeddings[index], documentId: id, ordinal: row.ordinal })));
      for (const row of rows) row.status = "indexed";
      const retained = new Set(rows.map((row) => row.vectorId));
      const obsolete = oldVectors.filter((item) => !retained.has(item.vectorId)).map((item) => item.vectorId);
      await provider.delete(obsolete);
    } catch (error) {
      mode = "lexical";
      ingestionError = `向量服务暂不可用，已启用免费关键词召回：${error instanceof Error ? error.message.slice(0, 160) : "未知错误"}`;
    }
    await db.batch([
      db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceDocumentId, id)),
      db.insert(knowledgeChunks).values(rows),
      db.update(sourceDocuments).set({ ingestionStatus: mode, chunkCount: rows.length, lastIndexedAt: timestamp, ingestionError, reviewedAt: document.reviewedAt ?? timestamp, updatedAt: timestamp }).where(eq(sourceDocuments.id, id)),
    ]);
    return { chunkCount: rows.length, mode, provider: providerName, warning: ingestionError };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "未知索引错误";
    await db.update(sourceDocuments).set({ ingestionStatus: "failed", ingestionError: message, updatedAt: new Date().toISOString() }).where(eq(sourceDocuments.id, id));
    throw error;
  }
}
