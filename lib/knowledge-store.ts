import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeChunks, knowledgeJobs, knowledgeRetrievalLogs, knowledgeSubmissions, sourceDocuments } from "../db/schema";
import { sha256, splitKnowledgeText, validateKnowledgeDocument, type KnowledgeDocumentInput } from "./knowledge";
import { fetchPublicKnowledgePage } from "./knowledge-import";
import { FREE_VECTOR_CAPACITY, getKnowledgeVectorProvider, KNOWLEDGE_VECTOR_DIMENSIONS } from "./knowledge-vector";
export type { KnowledgeDocumentInput } from "./knowledge";

export async function listKnowledgeDocuments() {
  return getDb().select({ id: sourceDocuments.id, title: sourceDocuments.title, url: sourceDocuments.url, sourceType: sourceDocuments.sourceType, sourceFileName: sourceDocuments.sourceFileName, sourceMimeType: sourceDocuments.sourceMimeType, submittedBy: sourceDocuments.submittedBy, versionLabel: sourceDocuments.versionLabel, publishedAt: sourceDocuments.publishedAt, fetchedAt: sourceDocuments.fetchedAt, reviewedAt: sourceDocuments.reviewedAt, archivedAt: sourceDocuments.archivedAt, trustLevel: sourceDocuments.trustLevel, status: sourceDocuments.status, topicIdsJson: sourceDocuments.topicIdsJson, summary: sourceDocuments.summary, content: sourceDocuments.content, ingestionStatus: sourceDocuments.ingestionStatus, chunkCount: sourceDocuments.chunkCount, lastIndexedAt: sourceDocuments.lastIndexedAt, ingestionError: sourceDocuments.ingestionError, updatedAt: sourceDocuments.updatedAt }).from(sourceDocuments).orderBy(desc(sourceDocuments.updatedAt));
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

export async function listKnowledgeRetrievalLogs(limit = 30) {
  return getDb().select({ id: knowledgeRetrievalLogs.id, query: knowledgeRetrievalLogs.query, retrievalMode: knowledgeRetrievalLogs.retrievalMode, resultCount: knowledgeRetrievalLogs.resultCount, matchesJson: knowledgeRetrievalLogs.matchesJson, durationMs: knowledgeRetrievalLogs.durationMs, vectorError: knowledgeRetrievalLogs.vectorError, createdAt: knowledgeRetrievalLogs.createdAt }).from(knowledgeRetrievalLogs).orderBy(desc(knowledgeRetrievalLogs.createdAt)).limit(Math.min(100, Math.max(1, limit)));
}

export async function listKnowledgeJobs(limit = 100) {
  return getDb().select().from(knowledgeJobs).orderBy(desc(knowledgeJobs.createdAt)).limit(Math.min(200, Math.max(1, limit)));
}

export async function listKnowledgeSubmissions(limit = 100) {
  return getDb().select().from(knowledgeSubmissions).orderBy(desc(knowledgeSubmissions.createdAt)).limit(Math.min(200, Math.max(1, limit)));
}

export async function createKnowledgeIndexJob(documentId: string, requestedBy?: string) {
  const db = getDb();
  const [document] = await db.select({ id: sourceDocuments.id, status: sourceDocuments.status, content: sourceDocuments.content }).from(sourceDocuments).where(eq(sourceDocuments.id, documentId)).limit(1);
  if (!document) throw new Error("资料不存在。");
  if (document.status !== "approved") throw new Error("只有已发布资料可以建立索引。");
  if (!document.content) throw new Error("资料正文为空。");
  const [active] = await db.select({ id: knowledgeJobs.id }).from(knowledgeJobs).where(and(eq(knowledgeJobs.sourceDocumentId, documentId), inArray(knowledgeJobs.status, ["queued", "running"]))).limit(1);
  if (active) return { id: active.id, duplicate: true };
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.insert(knowledgeJobs).values({ id, sourceDocumentId: documentId, type: "index", status: "queued", requestedBy: requestedBy ?? null, updatedAt: now });
  return { id, duplicate: false };
}

async function sendKnowledgeIndexJob(job: { id: string; duplicate: boolean }) {
  if (job.duplicate) return job;
  try { await env.KNOWLEDGE_QUEUE.send({ type: "index", jobId: job.id }); }
  catch (error) {
    const failedAt = new Date().toISOString(); const message = error instanceof Error ? error.message.slice(0, 500) : "索引任务排队失败";
    await getDb().update(knowledgeJobs).set({ status: "failed", finishedAt: failedAt, error: message, updatedAt: failedAt }).where(eq(knowledgeJobs.id, job.id));
    throw error;
  }
  return job;
}

export async function enqueueKnowledgeIndexJob(documentId: string, requestedBy?: string) {
  return sendKnowledgeIndexJob(await createKnowledgeIndexJob(documentId, requestedBy));
}

export async function runKnowledgeIndexJob(jobId: string) {
  const db = getDb(); const startedAt = new Date().toISOString();
  const [job] = await db.select().from(knowledgeJobs).where(eq(knowledgeJobs.id, jobId)).limit(1);
  if (!job || !["queued", "failed"].includes(job.status)) return null;
  await db.update(knowledgeJobs).set({ status: "running", attempt: job.attempt + 1, startedAt, finishedAt: null, error: null, updatedAt: startedAt }).where(eq(knowledgeJobs.id, jobId));
  try {
    const result = await indexKnowledgeDocument(job.sourceDocumentId); const finishedAt = new Date().toISOString();
    await db.update(knowledgeJobs).set({ status: "completed", finishedAt, error: null, updatedAt: finishedAt }).where(eq(knowledgeJobs.id, jobId));
    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString(); const message = error instanceof Error ? error.message.slice(0, 500) : "未知任务错误";
    await db.update(knowledgeJobs).set({ status: "failed", finishedAt, error: message, updatedAt: finishedAt }).where(eq(knowledgeJobs.id, jobId));
    throw error;
  }
}

export async function retryKnowledgeIndexJob(jobId: string, requestedBy?: string) {
  const db = getDb();
  const [job] = await db.select().from(knowledgeJobs).where(eq(knowledgeJobs.id, jobId)).limit(1);
  if (!job || job.status !== "failed") throw new Error("只有失败任务可以重试。");
  return createKnowledgeIndexJob(job.sourceDocumentId, requestedBy);
}

export async function enqueueKnowledgeIndexRetry(jobId: string, requestedBy?: string) {
  return sendKnowledgeIndexJob(await retryKnowledgeIndexJob(jobId, requestedBy));
}

export async function bulkSetKnowledgeStatus(ids: string[], status: "draft" | "approved" | "archived") {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const db = getDb();
  if (status === "draft") {
    const result = await db.update(sourceDocuments).set({ status, reviewedAt: null, archivedAt: null, ingestionStatus: "pending", chunkCount: 0, lastIndexedAt: null, ingestionError: null, updatedAt: now }).where(and(inArray(sourceDocuments.id, ids), eq(sourceDocuments.status, "archived")));
    return result.meta.changes ?? 0;
  }
  if (status === "approved") {
    const result = await db.update(sourceDocuments).set({ status, reviewedAt: now, archivedAt: null, updatedAt: now }).where(and(inArray(sourceDocuments.id, ids), inArray(sourceDocuments.status, ["draft", "archived"])));
    return result.meta.changes ?? 0;
  }
  let changed = 0;
  for (const id of ids) changed += await archiveKnowledgeDocument(id);
  return changed;
}

export async function archiveKnowledgeDocument(id: string) {
  const db = getDb();
  const vectors = await db.select({ vectorId: knowledgeChunks.vectorId }).from(knowledgeChunks).where(eq(knowledgeChunks.sourceDocumentId, id));
  if (vectors.length) {
    try { await getKnowledgeVectorProvider().delete(vectors.map((item) => item.vectorId)); }
    catch { /* Archived documents are excluded by D1 even if remote cleanup is delayed. */ }
  }
  const now = new Date().toISOString();
  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceDocumentId, id));
  const result = await db.update(sourceDocuments).set({ status: "archived", archivedAt: now, ingestionStatus: "pending", chunkCount: 0, lastIndexedAt: null, ingestionError: null, updatedAt: now }).where(eq(sourceDocuments.id, id));
  return result.meta.changes ?? 0;
}

export async function bulkIndexKnowledgeDocuments(ids: string[]) {
  const results: { id: string; ok: boolean; chunkCount?: number; mode?: string; error?: string }[] = [];
  for (const id of ids) {
    try { results.push({ id, ok: true, ...await indexKnowledgeDocument(id) }); }
    catch (error) { results.push({ id, ok: false, error: error instanceof Error ? error.message : "索引失败" }); }
  }
  return results;
}

export async function saveKnowledgeDocument(input: KnowledgeDocumentInput) {
  const content = validateKnowledgeDocument(input);
  const db = getDb();
  const id = input.id ?? crypto.randomUUID();
  let existingMetadata: { sourceFileName: string | null; sourceMimeType: string | null; submittedBy: string | null; submissionId: string | null; fetchedAt: string | null } | undefined;
  if (input.id) {
    const [existing] = await db.select({ id: sourceDocuments.id, sourceFileName: sourceDocuments.sourceFileName, sourceMimeType: sourceDocuments.sourceMimeType, submittedBy: sourceDocuments.submittedBy, submissionId: sourceDocuments.submissionId, fetchedAt: sourceDocuments.fetchedAt }).from(sourceDocuments).where(eq(sourceDocuments.id, input.id)).limit(1);
    if (!existing) throw new Error("资料不存在，请刷新后重试。");
    existingMetadata = existing;
  }
  const contentHash = await sha256(content);
  if (!input.id) {
    const [duplicate] = await db.select({ id: sourceDocuments.id, ingestionStatus: sourceDocuments.ingestionStatus }).from(sourceDocuments).where(eq(sourceDocuments.contentHash, contentHash)).limit(1);
    if (duplicate) return { id: duplicate.id, duplicate: true, needsIndex: !["indexed", "lexical"].includes(duplicate.ingestionStatus) };
  }
  const now = new Date().toISOString();
  const values = { title: input.title.trim(), url: input.url?.trim() || `${input.sourceType === "upload" ? "upload" : "manual"}://${id}`, sourceType: input.sourceType, sourceFileName: input.sourceFileName?.slice(0, 240) || existingMetadata?.sourceFileName || null, sourceMimeType: input.sourceMimeType?.slice(0, 160) || existingMetadata?.sourceMimeType || null, submittedBy: input.submittedBy?.slice(0, 200) || existingMetadata?.submittedBy || null, submissionId: input.submissionId || existingMetadata?.submissionId || null, versionLabel: input.versionLabel?.trim() || null, publishedAt: input.publishedAt ? new Date(input.publishedAt).toISOString() : null, fetchedAt: input.fetchedAt ? new Date(input.fetchedAt).toISOString() : existingMetadata?.fetchedAt ?? now, trustLevel: input.trustLevel, status: input.status, topicIdsJson: JSON.stringify([...new Set(input.topicIds.map((item) => item.trim()).filter(Boolean))]), summary: input.summary?.trim() || null, content, contentHash, ingestionStatus: "pending", chunkCount: 0, lastIndexedAt: null, ingestionError: null, updatedAt: now };
  if (input.id) await db.update(sourceDocuments).set(values).where(eq(sourceDocuments.id, id));
  else await db.insert(sourceDocuments).values({ id, reviewedAt: input.status === "approved" ? new Date().toISOString() : null, ...values });
  return { id, duplicate: false, needsIndex: input.status === "approved" };
}

export async function refreshKnowledgeDocument(id: string) {
  const db = getDb();
  const [document] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, id)).limit(1);
  if (!document) throw new Error("资料不存在。");
  if (document.sourceType !== "web" || document.url.startsWith("manual://")) throw new Error("只有网页资料可以重新抓取。");
  const page = await fetchPublicKnowledgePage(document.url);
  const contentHash = await sha256(page.content);
  if (contentHash === document.contentHash) {
    const fetchedAt = new Date().toISOString();
    await db.update(sourceDocuments).set({ fetchedAt, updatedAt: fetchedAt }).where(eq(sourceDocuments.id, id));
    return { changed: false, id, title: document.title };
  }
  const saved = await saveKnowledgeDocument({ id, title: document.title, url: page.url, sourceType: "web", versionLabel: document.versionLabel ?? undefined, publishedAt: document.publishedAt ?? undefined, fetchedAt: new Date().toISOString(), trustLevel: document.trustLevel as KnowledgeDocumentInput["trustLevel"], status: document.status as KnowledgeDocumentInput["status"], topicIds: safeStringArray(document.topicIdsJson), summary: document.summary ?? undefined, content: page.content });
  return { changed: true, id: saved.id, title: document.title };
}

function safeStringArray(value: string) { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }

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
  if (document.status !== "approved") throw new Error("只有已发布资料可以建立索引。");
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
    // Keep every INSERT below D1's bound-variable limit for long documents.
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceDocumentId, id));
    const insertBatchSize = 8;
    for (let offset = 0; offset < rows.length; offset += insertBatchSize) {
      await db.insert(knowledgeChunks).values(rows.slice(offset, offset + insertBatchSize));
    }
    await db.update(sourceDocuments).set({ ingestionStatus: mode, chunkCount: rows.length, lastIndexedAt: timestamp, ingestionError, reviewedAt: document.reviewedAt ?? timestamp, updatedAt: timestamp }).where(eq(sourceDocuments.id, id));
    return { chunkCount: rows.length, mode, provider: providerName, warning: ingestionError };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "未知索引错误";
    await db.update(sourceDocuments).set({ ingestionStatus: "failed", ingestionError: message, updatedAt: new Date().toISOString() }).where(eq(sourceDocuments.id, id));
    throw error;
  }
}
