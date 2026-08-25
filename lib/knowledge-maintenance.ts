import { env } from "cloudflare:workers";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "../db";
import { knowledgeJobs, knowledgeSubmissions } from "../db/schema";

export async function recoverStaleKnowledgeTasks(staleMinutes = 30) {
  const cutoff = new Date(Date.now() - Math.max(5, staleMinutes) * 60_000).toISOString();
  const db = getDb();
  const [jobs, submissions] = await Promise.all([
    db.select({ id: knowledgeJobs.id }).from(knowledgeJobs).where(and(inArray(knowledgeJobs.status, ["queued", "running"]), lt(knowledgeJobs.updatedAt, cutoff))).limit(50),
    db.select({ id: knowledgeSubmissions.id }).from(knowledgeSubmissions).where(and(inArray(knowledgeSubmissions.status, ["queued", "processing"]), lt(knowledgeSubmissions.updatedAt, cutoff))).limit(50),
  ]);
  let recoveredJobs = 0; let recoveredSubmissions = 0;
  for (const job of jobs) {
    const now = new Date().toISOString();
    const result = await db.update(knowledgeJobs).set({ status: "queued", error: "检测到任务超时，已自动重新排队。", finishedAt: null, updatedAt: now }).where(and(eq(knowledgeJobs.id, job.id), inArray(knowledgeJobs.status, ["queued", "running"]), lt(knowledgeJobs.updatedAt, cutoff)));
    if (!result.meta.changes) continue;
    try { await env.KNOWLEDGE_QUEUE.send({ type: "index", jobId: job.id }); recoveredJobs += 1; }
    catch (error) { await db.update(knowledgeJobs).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "自动重新排队失败", finishedAt: now, updatedAt: now }).where(and(eq(knowledgeJobs.id, job.id), eq(knowledgeJobs.status, "queued"))); }
  }
  for (const submission of submissions) {
    const now = new Date().toISOString();
    const result = await db.update(knowledgeSubmissions).set({ status: "queued", error: "检测到任务超时，已自动重新排队。", updatedAt: now }).where(and(eq(knowledgeSubmissions.id, submission.id), inArray(knowledgeSubmissions.status, ["queued", "processing"]), lt(knowledgeSubmissions.updatedAt, cutoff)));
    if (!result.meta.changes) continue;
    try { await env.KNOWLEDGE_QUEUE.send({ type: "convert", submissionId: submission.id }); recoveredSubmissions += 1; }
    catch (error) { await db.update(knowledgeSubmissions).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "自动重新排队失败", updatedAt: now }).where(and(eq(knowledgeSubmissions.id, submission.id), eq(knowledgeSubmissions.status, "queued"))); }
  }
  return { recoveredJobs, recoveredSubmissions, cutoff, remaining: jobs.length === 50 || submissions.length === 50 };
}
