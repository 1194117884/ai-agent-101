import { and, desc, eq } from "drizzle-orm";
import { getCloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { competencyStates, conversations, evidence, learnerProfiles, learningTasks } from "../../../db/schema";
import { databaseAIConfiguration } from "../../../lib/ai-settings";
import { apiError, databaseError } from "../../../lib/api-response";
import { generateCoachReply, type CoachAttemptReporter } from "../../../lib/coach";
import { createCoachTools } from "../../../lib/coach-tools";
import { retrieveKnowledge } from "../../../lib/knowledge-retrieval";
import type { KnowledgeRetrievalMatch } from "../../../lib/knowledge-retrieval";
import { rubricLabels } from "../../../lib/rubric";
import { getCompetency } from "../../../curriculum/catalog";

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
    const [[profile], [task], states, recentEvidence, recentConversation] = await Promise.all([
      db.select().from(learnerProfiles).where(eq(learnerProfiles.id, user.userId)).limit(1),
      db.select().from(learningTasks).where(and(eq(learningTasks.learnerId, user.userId), eq(learningTasks.status, "active"))).orderBy(desc(learningTasks.updatedAt)).limit(1),
      db.select().from(competencyStates).where(eq(competencyStates.learnerId, user.userId)).orderBy(desc(competencyStates.updatedAt)).limit(8),
      db.select().from(evidence).where(eq(evidence.learnerId, user.userId)).orderBy(desc(evidence.createdAt)).limit(5),
      db.select({ role: conversations.role, content: conversations.content, metadataJson: conversations.metadataJson }).from(conversations).where(eq(conversations.learnerId, user.userId)).orderBy(desc(conversations.createdAt)).limit(8),
    ]);
    const last = recentEvidence[0];
    const feedbackReasons: Record<string, string> = { inaccurate: "内容不准确", misunderstood: "没理解问题", unactionable: "步骤不可执行", irrelevant_source: "资料不相关" };
    const unresolvedFeedback = recentConversation.flatMap((item) => {
      if (item.role !== "coach") return [];
      try { const feedback = (JSON.parse(item.metadataJson ?? "{}") as { userFeedback?: { rating?: string; reason?: string } }).userFeedback; return feedback?.rating === "unhelpful" ? [{ reason: feedbackReasons[feedback.reason ?? ""] ?? "未说明", answerSummary: item.content }] : []; }
      catch { return []; }
    }).slice(0, 3);
    const learningContext = {
      goal: profile?.learningGoal ?? "掌握 Agent Engineering",
      currentProject: profile?.currentProject,
      weeklyHours: profile?.weeklyHours,
      learningPace: profile?.learningPace,
      currentTask: task ? { title: task.title, competencyName: getCompetency(task.competencyId)?.name ?? task.competencyId, instruction: task.instruction, expectedOutput: task.expectedOutput, rubric: rubricLabels(task.rubricJson) } : null,
      competencies: states.map((state) => ({ name: getCompetency(state.competencyId)?.name ?? state.competencyId, mastery: state.mastery, confidence: state.confidence, rationale: state.rationale })),
      recentEvidence: recentEvidence.map((item) => ({ competencyName: getCompetency(item.competencyId)?.name ?? item.competencyId, type: item.type, score: item.score, feedback: item.feedback, content: item.content })),
      recentConversation: recentConversation.slice(0, 4).reverse().map(({ role, content }) => ({ role, content })),
      unresolvedFeedback,
    };
    let aiEnvironment: Record<string, string | undefined> = process.env;
    let reportAttempt: CoachAttemptReporter | undefined;
    try {
      const configuration = await databaseAIConfiguration();
      aiEnvironment = { ...process.env, ...configuration.environment };
      reportAttempt = configuration.reportAttempt;
    }
    catch { /* Environment variables remain the fallback until D1 settings are available. */ }
    let knowledge = { context: "", sources: [] as { documentId: string; title: string; url: string | null; versionLabel: string | null; publishedAt?: string | null; fetchedAt?: string | null; trustLevel: string }[], matches: [] as KnowledgeRetrievalMatch[], conflicts: [] as { key: string; title: string; versions: string[]; documentIds: string[]; preferredDocumentId: string | null; preferredVersion: string | null; preferenceReason: "authority" | "newer_version" | "uncertain" }[], retrievalMode: "unavailable" as string };
    try { knowledge = await retrieveKnowledge(message, 5, user.userId); }
    catch { /* The structured curriculum remains available before migrations or during retrieval outages. */ }
    const reply = await generateCoachReply(message, last?.score ?? null, aiEnvironment, fetch, reportAttempt, knowledge, learningContext, createCoachTools(learningContext));
    const { runtime, ...publicReply } = reply;
    const learnerConversationId = crypto.randomUUID();
    const coachConversationId = crypto.randomUUID();
    const sourceByDocument = new Map(knowledge.sources.map((source) => [source.documentId, source]));
    const retrieval = { mode: knowledge.retrievalMode, conflicts: knowledge.conflicts, matches: knowledge.matches.map((match) => ({ ...match, ...sourceByDocument.get(match.documentId) })) };
    await db.batch([
      db.insert(conversations).values({ id: learnerConversationId, learnerId: user.userId, role: "learner", content: message }),
      db.insert(conversations).values({ id: coachConversationId, learnerId: user.userId, role: "coach", content: `${reply.feedback}\n下一步：${reply.nextTask}\n验收问题：${reply.question}`, source: reply.source, metadataJson: JSON.stringify({ retrieval, delivery: reply.delivery, runtime, qualityContext: { unresolvedCount: unresolvedFeedback.length, reasons: unresolvedFeedback.map((item) => item.reason) }, focus: reply.focus, diagnosis: reply.diagnosis, nextTask: reply.nextTask, issueType: reply.issueType, teachingMode: reply.teachingMode }) }),
    ]);
    return Response.json({ ...publicReply, retrieval, conversationId: coachConversationId });
  } catch (error) {
    return databaseError(error);
  }
}
