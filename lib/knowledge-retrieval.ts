import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeChunks, knowledgeRetrievalLogs, sourceDocuments } from "../db/schema";
import { knowledgeLexicalScore } from "./knowledge";
import { detectKnowledgeConflicts, knowledgeRankingScore, type KnowledgeSource } from "./knowledge-conflicts";
import { getKnowledgeVectorProvider } from "./knowledge-vector";

type Candidate = { vectorId: string; documentId: string; content: string; title: string; url: string; versionLabel: string | null; trustLevel: string; vectorScore: number; lexicalScore: number };
export type KnowledgeRetrievalMatch = { rank: number; vectorId: string; documentId: string; title: string; excerpt: string; vectorScore: number; lexicalScore: number; authorityBoost: number; combinedScore: number; relativeRelevance: number };
export async function retrieveKnowledge(query: string, limit = 5, learnerId?: string) {
  const startedAt = Date.now();
  const db = getDb();
  let vectorScores = new Map<string, number>();
  let vectorError: string | null = null;
  try {
    vectorScores = await getKnowledgeVectorProvider().query(query, 10);
  } catch (error) { vectorError = error instanceof Error ? error.message.slice(0, 240) : "未知向量错误"; }

  const baseQuery = () => db.select({ vectorId: knowledgeChunks.vectorId, documentId: sourceDocuments.id, content: knowledgeChunks.content, title: sourceDocuments.title, url: sourceDocuments.url, versionLabel: sourceDocuments.versionLabel, trustLevel: sourceDocuments.trustLevel }).from(knowledgeChunks).innerJoin(sourceDocuments, eq(knowledgeChunks.sourceDocumentId, sourceDocuments.id));
  const approved = and(eq(sourceDocuments.status, "approved"), or(eq(sourceDocuments.ingestionStatus, "indexed"), eq(sourceDocuments.ingestionStatus, "lexical")), or(eq(knowledgeChunks.status, "indexed"), eq(knowledgeChunks.status, "lexical")));
  const [semanticRows, lexicalRows] = await Promise.all([
    vectorScores.size ? baseQuery().where(and(approved, inArray(knowledgeChunks.vectorId, [...vectorScores.keys()]))) : Promise.resolve([]),
    baseQuery().where(approved).orderBy(desc(sourceDocuments.updatedAt)).limit(160),
  ]);
  const candidates = new Map<string, Candidate>();
  for (const row of [...lexicalRows, ...semanticRows]) candidates.set(row.vectorId, { ...row, vectorScore: vectorScores.get(row.vectorId) ?? 0, lexicalScore: knowledgeLexicalScore(query, `${row.title}\n${row.content}`) });
  const ranked = [...candidates.values()].filter((item) => item.vectorScore > 0 || item.lexicalScore > 0).sort((a, b) => knowledgeRankingScore(b.vectorScore, b.lexicalScore, b.trustLevel) - knowledgeRankingScore(a.vectorScore, a.lexicalScore, a.trustLevel)).slice(0, limit);
  const topScore = ranked.length ? knowledgeRankingScore(ranked[0].vectorScore, ranked[0].lexicalScore, ranked[0].trustLevel) : 0;
  const matches: KnowledgeRetrievalMatch[] = ranked.map((item, index) => {
    const relevanceScore = item.vectorScore * 4 + item.lexicalScore;
    const combinedScore = knowledgeRankingScore(item.vectorScore, item.lexicalScore, item.trustLevel);
    return { rank: index + 1, vectorId: item.vectorId, documentId: item.documentId, title: item.title, excerpt: item.content.slice(0, 600), vectorScore: Number(item.vectorScore.toFixed(4)), lexicalScore: Number(item.lexicalScore.toFixed(2)), authorityBoost: Number((combinedScore - relevanceScore).toFixed(2)), combinedScore: Number(combinedScore.toFixed(4)), relativeRelevance: topScore > 0 ? Math.round((combinedScore / topScore) * 100) : 0 };
  });
  const retrievalMode = vectorScores.size ? (ranked.some((item) => item.lexicalScore > 0) ? "hybrid" : "vector") : "lexical";
  try {
    await db.insert(knowledgeRetrievalLogs).values({
      id: crypto.randomUUID(), learnerId: learnerId ?? null, query: query.slice(0, 2000), retrievalMode,
      resultCount: ranked.length, durationMs: Date.now() - startedAt, vectorError,
      matchesJson: JSON.stringify(matches),
    });
  } catch { /* Observability must never block the learner response. */ }
  const sources: KnowledgeSource[] = ranked.map((item) => ({ documentId: item.documentId, title: item.title, url: item.url.startsWith("manual://") ? null : item.url, versionLabel: item.versionLabel, trustLevel: item.trustLevel }));
  return {
    context: ranked.map((item, index) => `[资料 ${index + 1}] ${item.title}${item.versionLabel ? `（${item.versionLabel}）` : ""}\n${item.content}`).join("\n\n"),
    sources,
    conflicts: detectKnowledgeConflicts(sources),
    matches,
    retrievalMode,
  };
}
