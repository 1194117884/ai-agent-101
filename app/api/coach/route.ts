import { desc, eq } from "drizzle-orm";
import { getCloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { conversations, evidence, learnerProfiles } from "../../../db/schema";
import { databaseAIConfiguration } from "../../../lib/ai-settings";
import { apiError, databaseError } from "../../../lib/api-response";
import { generateCoachReply, type CoachAttemptReporter } from "../../../lib/coach";
import { retrieveKnowledge } from "../../../lib/knowledge-retrieval";
import type { KnowledgeRetrievalMatch } from "../../../lib/knowledge-retrieval";

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录。", 401, "AUTH_REQUIRED");
  let body: { message?: string };
  try { body = await request.json() as { message?: string }; }
  catch { return apiError("请求格式无效。", 400, "INVALID_INPUT"); }
  const message = body.message?.trim();
  if (!message) return apiError("请输入问题。", 400, "INVALID_INPUT");

  try {
    const db = getDb();
    await db.insert(learnerProfiles).values({ id: user.userId, displayName: user.displayName, learningGoal: "掌握 Agent Engineering", weeklyHours: 8, timezone: "Asia/Shanghai" }).onConflictDoNothing();
    const [last] = await db.select({ score: evidence.score, content: evidence.content }).from(evidence).where(eq(evidence.learnerId, user.userId)).orderBy(desc(evidence.createdAt)).limit(1);
    let aiEnvironment: Record<string, string | undefined> = process.env;
    let reportAttempt: CoachAttemptReporter | undefined;
    try {
      const configuration = await databaseAIConfiguration();
      aiEnvironment = { ...process.env, ...configuration.environment };
      reportAttempt = configuration.reportAttempt;
    }
    catch { /* Environment variables remain the fallback until D1 settings are available. */ }
    let knowledge = { context: "", sources: [] as { documentId: string; title: string; url: string | null; versionLabel: string | null; trustLevel: string }[], matches: [] as KnowledgeRetrievalMatch[], retrievalMode: "unavailable" as string };
    try { knowledge = await retrieveKnowledge(message, 5, user.userId); }
    catch { /* The structured curriculum remains available before migrations or during retrieval outages. */ }
    const reply = await generateCoachReply(`${message}\n近期证据：${last?.content ?? "无"}`, last?.score ?? null, aiEnvironment, fetch, reportAttempt, knowledge);
    const sourceByDocument = new Map(knowledge.sources.map((source) => [source.documentId, source]));
    const retrieval = { mode: knowledge.retrievalMode, matches: knowledge.matches.map((match) => ({ ...match, ...sourceByDocument.get(match.documentId) })) };
    await db.batch([
      db.insert(conversations).values({ id: crypto.randomUUID(), learnerId: user.userId, role: "learner", content: message }),
      db.insert(conversations).values({ id: crypto.randomUUID(), learnerId: user.userId, role: "coach", content: `${reply.answer}\n追问：${reply.followUp}`, source: reply.source, metadataJson: JSON.stringify({ retrieval, delivery: reply.delivery, focus: reply.focus }) }),
    ]);
    return Response.json({ ...reply, retrieval });
  } catch (error) {
    return databaseError(error);
  }
}
