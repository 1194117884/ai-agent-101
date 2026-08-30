import { and, desc, eq } from "drizzle-orm";
import { getCloudflareUser, type CloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { assessments, competencies, competencyStates, evidence, learnerProfiles, learningTasks } from "../../../db/schema";
import { getAssessmentDefinition, gradeAssessment } from "../../../lib/assessment";
import { apiError, databaseError } from "../../../lib/api-response";
import { getCompetency } from "../../../curriculum/catalog";
import { nextReviewAt } from "../../../lib/weakness-analysis";
import { recommendNextTask } from "../../../lib/task-recommendation";

async function learner(user: CloudflareUser) {
  const db = getDb();
  await db.insert(learnerProfiles).values({ id: user.userId, displayName: user.displayName, learningGoal: "掌握 Agent Engineering", weeklyHours: 8, timezone: "Asia/Shanghai" }).onConflictDoNothing();
  return { user, db };
}

export async function GET() {
  try {
    const user = await getCloudflareUser(); if (!user) return apiError("请先登录。", 401, "AUTH_REQUIRED");
    const ctx = await learner(user);
    const [open] = await ctx.db.select().from(assessments).where(and(eq(assessments.learnerId, ctx.user.userId), eq(assessments.status, "open"))).orderBy(desc(assessments.createdAt)).limit(1);
    if (open) return Response.json({ ...open, assessmentId: rubricId(open.rubricJson) });
    const states = await ctx.db.select({ competencyId: competencyStates.competencyId, mastery: competencyStates.mastery, confidence: competencyStates.confidence }).from(competencyStates).where(eq(competencyStates.learnerId, ctx.user.userId));
    const definition = recommendNextTask(states).assessment; const competency = getCompetency(definition.competencyId);
    const item = { id: crypto.randomUUID(), learnerId: ctx.user.userId, competencyId: definition.competencyId, question: definition.question, rubricJson: JSON.stringify({ assessmentId: definition.id, kind: definition.kind, criteria: definition.criteria }), status: "open" };
    await ctx.db.batch([
      ctx.db.insert(competencies).values({ id: definition.competencyId, name: competency?.name ?? definition.competencyId, description: definition.title, priority: competency?.prio ?? "P1", prerequisitesJson: JSON.stringify(competency?.prerequisites ?? []) }).onConflictDoNothing(),
      ctx.db.insert(assessments).values(item),
    ]);
    return Response.json({ ...item, assessmentId: definition.id });
  } catch (error) { return databaseError(error); }
}

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录。", 401, "AUTH_REQUIRED");
  let input: { id?: string; answer?: string };
  try { input = await request.json() as { id?: string; answer?: string }; }
  catch { return apiError("请求格式无效。", 400, "INVALID_INPUT"); }
  if (!input.id || !input.answer?.trim()) return apiError("请完成回答。", 400, "INVALID_INPUT");
  try {
    const ctx = await learner(user);
    const [item] = await ctx.db.select().from(assessments).where(and(eq(assessments.id, input.id), eq(assessments.learnerId, ctx.user.userId))).limit(1);
    if (!item || item.status !== "open") return apiError("小测不存在或已经评分。", 404, "NOT_FOUND");
    const assessmentId = rubricId(item.rubricJson); if (!getAssessmentDefinition(assessmentId)) return apiError("评分规则版本无法识别。", 409, "CONFLICT");
    const answer = input.answer.trim();
    const result = gradeAssessment(assessmentId, answer);
    const assessedAt = new Date();
    const state = { mastery: result.score, confidence: Math.min(85, result.score), rationale: `${result.errorCategory ? `错误类型：${result.errorCategory}。` : ""}${result.feedback}`, lastAssessedAt: assessedAt.toISOString(), reviewDueAt: nextReviewAt(result.score, assessedAt) };
    const previousStates = await ctx.db.select({ competencyId: competencyStates.competencyId, mastery: competencyStates.mastery, confidence: competencyStates.confidence }).from(competencyStates).where(eq(competencyStates.learnerId, ctx.user.userId));
    const nextTask = recommendNextTask([...previousStates.filter((entry) => entry.competencyId !== result.competencyId), { competencyId: result.competencyId, mastery: state.mastery, confidence: state.confidence }]);
    const nextCompetency = getCompetency(nextTask.assessment.competencyId);
    const [activeTask] = await ctx.db.select({ id: learningTasks.id, competencyId: learningTasks.competencyId }).from(learningTasks).where(and(eq(learningTasks.learnerId, ctx.user.userId), eq(learningTasks.status, "active"))).limit(1);
    const [existing] = await ctx.db.select({ id: competencyStates.id }).from(competencyStates).where(and(eq(competencyStates.learnerId, ctx.user.userId), eq(competencyStates.competencyId, result.competencyId))).limit(1);
    const stateWrite = existing
      ? ctx.db.update(competencyStates).set(state).where(eq(competencyStates.id, existing.id))
      : ctx.db.insert(competencyStates).values({ id: crypto.randomUUID(), learnerId: ctx.user.userId, competencyId: result.competencyId, ...state });
    await ctx.db.batch([
      ctx.db.insert(competencies).values({ id: nextTask.assessment.competencyId, name: nextCompetency?.name ?? nextTask.assessment.competencyId, description: nextTask.assessment.title, priority: nextCompetency?.prio ?? "P1", prerequisitesJson: JSON.stringify(nextCompetency?.prerequisites ?? []) }).onConflictDoNothing(),
      ctx.db.update(assessments).set({ answer, score: result.score, feedback: result.feedback, status: "graded" }).where(eq(assessments.id, input.id)),
      ctx.db.insert(evidence).values({ id: crypto.randomUUID(), learnerId: ctx.user.userId, competencyId: result.competencyId, taskId: activeTask?.competencyId === result.competencyId ? activeTask.id : null, type: "quiz", content: answer, score: result.score, feedback: result.feedback }),
      stateWrite,
      ctx.db.update(learningTasks).set({ status: "superseded" }).where(and(eq(learningTasks.learnerId, ctx.user.userId), eq(learningTasks.status, "active"))),
      ctx.db.insert(learningTasks).values({ id: crypto.randomUUID(), learnerId: ctx.user.userId, competencyId: nextTask.assessment.competencyId, title: nextTask.title, instruction: nextTask.instruction, expectedOutput: nextTask.expectedOutput, rubricJson: JSON.stringify({ assessmentId: nextTask.assessment.id, criteria: nextTask.assessment.criteria }), status: "active", sourceUnitId: nextTask.sourceUnitId }),
    ]);
    return Response.json({ ok: true, ...result, nextTask });
  } catch (error) { return databaseError(error); }
}

function rubricId(value: string) { try { const parsed = JSON.parse(value); return typeof parsed.assessmentId === "string" ? parsed.assessmentId : "concept-tool-contract"; } catch { return "concept-tool-contract"; } }
