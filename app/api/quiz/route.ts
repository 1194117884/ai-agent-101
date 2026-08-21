import { and, count, desc, eq } from "drizzle-orm";
import { getCloudflareUser, type CloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { assessments, competencies, competencyStates, learnerProfiles } from "../../../db/schema";
import { assessmentCatalog, getAssessmentDefinition, gradeAssessment } from "../../../lib/assessment";
import { apiError, databaseError } from "../../../lib/api-response";
import { getCompetency } from "../../../curriculum/catalog";

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
    const [total] = await ctx.db.select({ value: count() }).from(assessments).where(eq(assessments.learnerId, ctx.user.userId));
    const definition = assessmentCatalog[total.value % assessmentCatalog.length]; const competency = getCompetency(definition.competencyId);
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
    const state = { mastery: result.score, confidence: Math.min(85, result.score), rationale: `${result.errorCategory ? `错误类型：${result.errorCategory}。` : ""}${result.feedback}`, lastAssessedAt: new Date().toISOString() };
    const [existing] = await ctx.db.select({ id: competencyStates.id }).from(competencyStates).where(and(eq(competencyStates.learnerId, ctx.user.userId), eq(competencyStates.competencyId, result.competencyId))).limit(1);
    const stateWrite = existing
      ? ctx.db.update(competencyStates).set(state).where(eq(competencyStates.id, existing.id))
      : ctx.db.insert(competencyStates).values({ id: crypto.randomUUID(), learnerId: ctx.user.userId, competencyId: result.competencyId, ...state });
    await ctx.db.batch([
      ctx.db.update(assessments).set({ answer, score: result.score, feedback: result.feedback, status: "graded" }).where(eq(assessments.id, input.id)),
      stateWrite,
    ]);
    return Response.json({ ok: true, ...result });
  } catch (error) { return databaseError(error); }
}

function rubricId(value: string) { try { const parsed = JSON.parse(value); return typeof parsed.assessmentId === "string" ? parsed.assessmentId : "concept-tool-contract"; } catch { return "concept-tool-contract"; } }
