import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeChunks, sourceDocuments } from "../db/schema";
import { knowledgeLexicalScore } from "./knowledge";
import { getKnowledgeVectorProvider } from "./knowledge-vector";

type Candidate = { vectorId: string; content: string; title: string; url: string; versionLabel: string | null; trustLevel: string; vectorScore: number; lexicalScore: number };

export async function retrieveKnowledge(query: string, limit = 5) {
  const db = getDb();
  let vectorScores = new Map<string, number>();
  try {
    vectorScores = await getKnowledgeVectorProvider().query(query, 10);
  } catch { /* Lexical retrieval remains available if embeddings or Vectorize fail. */ }

  const baseQuery = () => db.select({ vectorId: knowledgeChunks.vectorId, content: knowledgeChunks.content, title: sourceDocuments.title, url: sourceDocuments.url, versionLabel: sourceDocuments.versionLabel, trustLevel: sourceDocuments.trustLevel }).from(knowledgeChunks).innerJoin(sourceDocuments, eq(knowledgeChunks.sourceDocumentId, sourceDocuments.id));
  const approved = and(eq(sourceDocuments.status, "approved"), or(eq(sourceDocuments.ingestionStatus, "indexed"), eq(sourceDocuments.ingestionStatus, "lexical")), or(eq(knowledgeChunks.status, "indexed"), eq(knowledgeChunks.status, "lexical")));
  const [semanticRows, lexicalRows] = await Promise.all([
    vectorScores.size ? baseQuery().where(and(approved, inArray(knowledgeChunks.vectorId, [...vectorScores.keys()]))) : Promise.resolve([]),
    baseQuery().where(approved).orderBy(desc(sourceDocuments.updatedAt)).limit(160),
  ]);
  const candidates = new Map<string, Candidate>();
  for (const row of [...lexicalRows, ...semanticRows]) candidates.set(row.vectorId, { ...row, vectorScore: vectorScores.get(row.vectorId) ?? 0, lexicalScore: knowledgeLexicalScore(query, `${row.title}\n${row.content}`) });
  const ranked = [...candidates.values()].filter((item) => item.vectorScore > 0 || item.lexicalScore > 0).sort((a, b) => (b.vectorScore * 4 + b.lexicalScore) - (a.vectorScore * 4 + a.lexicalScore)).slice(0, limit);
  return {
    context: ranked.map((item, index) => `[资料 ${index + 1}] ${item.title}${item.versionLabel ? `（${item.versionLabel}）` : ""}\n${item.content}`).join("\n\n"),
    sources: ranked.map((item) => ({ title: item.title, url: item.url.startsWith("manual://") ? null : item.url, versionLabel: item.versionLabel, trustLevel: item.trustLevel })),
  };
}
