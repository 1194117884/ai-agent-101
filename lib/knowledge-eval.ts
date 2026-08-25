import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeEvalCases } from "../db/schema";
import { retrieveKnowledge } from "./knowledge-retrieval";
import { evaluateRetrievedKnowledge, parseExpectedTerms } from "./knowledge-eval-core";

export type KnowledgeEvalInput = { id?: string; question: string; expectedDocumentId?: string | null; expectedTerms: string[] };

export async function listKnowledgeEvalCases() { return getDb().select().from(knowledgeEvalCases).orderBy(desc(knowledgeEvalCases.updatedAt)); }

export async function saveKnowledgeEvalCase(input: KnowledgeEvalInput) {
  const question = input.question?.trim();
  if (!question || question.length < 4 || question.length > 1000) throw new Error("评测问题需要 4–1000 个字符。");
  const expectedTerms = [...new Set((input.expectedTerms ?? []).map((term) => term.trim()).filter(Boolean))].slice(0, 20);
  if (!input.expectedDocumentId && !expectedTerms.length) throw new Error("至少设置期望资料或一个期望关键词。");
  const id = input.id ?? crypto.randomUUID(); const now = new Date().toISOString();
  const values = { question, expectedDocumentId: input.expectedDocumentId || null, expectedTermsJson: JSON.stringify(expectedTerms), status: "active", lastRunAt: null, lastMode: null, lastPassed: null, lastMatchesJson: null, lastError: null, updatedAt: now };
  if (input.id) await getDb().update(knowledgeEvalCases).set(values).where(eq(knowledgeEvalCases.id, id));
  else await getDb().insert(knowledgeEvalCases).values({ id, ...values });
  return id;
}

export async function deleteKnowledgeEvalCase(id: string) { await getDb().delete(knowledgeEvalCases).where(eq(knowledgeEvalCases.id, id)); }

export async function runKnowledgeEvalCases(ids?: string[]) {
  const db = getDb();
  const cases = ids?.length ? await db.select().from(knowledgeEvalCases).where(inArray(knowledgeEvalCases.id, ids)) : await db.select().from(knowledgeEvalCases).where(eq(knowledgeEvalCases.status, "active"));
  const results: { id: string; passed: boolean; mode?: string; error?: string }[] = [];
  for (const item of cases.slice(0, 30)) {
    const now = new Date().toISOString();
    try {
      const retrieval = await retrieveKnowledge(item.question, 5);
      const evaluation = evaluateRetrievedKnowledge(item.expectedDocumentId, parseExpectedTerms(item.expectedTermsJson), retrieval.context, retrieval.sources);
      const passed = evaluation.passed;
      const expectedRank = item.expectedDocumentId ? retrieval.matches.find((match) => match.documentId === item.expectedDocumentId)?.rank ?? null : null;
      const report = { matches: retrieval.matches, evaluation: { documentPassed: evaluation.documentPassed, expectedRank, missingTerms: evaluation.missingTerms, reason: passed ? `期望资料与关键词均命中${expectedRank ? `，资料排名第 ${expectedRank}` : ""}` : [evaluation.documentPassed ? null : "期望资料未进入 Top 5", evaluation.missingTerms.length ? `缺少关键词：${evaluation.missingTerms.join("、")}` : null].filter(Boolean).join("；") } };
      await db.update(knowledgeEvalCases).set({ lastRunAt: now, lastMode: retrieval.retrievalMode, lastPassed: passed, lastMatchesJson: JSON.stringify(report), lastError: null, updatedAt: now }).where(eq(knowledgeEvalCases.id, item.id));
      results.push({ id: item.id, passed, mode: retrieval.retrievalMode });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : "评测运行失败";
      await db.update(knowledgeEvalCases).set({ lastRunAt: now, lastPassed: false, lastError: message, updatedAt: now }).where(eq(knowledgeEvalCases.id, item.id));
      results.push({ id: item.id, passed: false, error: message });
    }
  }
  return results;
}
