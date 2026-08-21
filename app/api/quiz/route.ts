import { and, count, desc, eq } from "drizzle-orm";
import { getCloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { assessments, competencies, competencyStates, learnerProfiles } from "../../../db/schema";
import { assessmentCatalog, getAssessmentDefinition, gradeAssessment } from "../../../lib/assessment";
import { getCompetency } from "../../../curriculum/catalog";

async function learner() {
  const user = await getCloudflareUser(); if (!user) return null; const db = getDb();
  await db.insert(learnerProfiles).values({ id: user.userId, displayName: user.displayName, learningGoal: "掌握 Agent Engineering", weeklyHours: 8, timezone: "Asia/Shanghai" }).onConflictDoNothing();
  return { user, db };
}

export async function GET() {
  const ctx = await learner(); if (!ctx) return Response.json({ error: "请先登录。" }, { status: 401 });
  const [open] = await ctx.db.select().from(assessments).where(and(eq(assessments.learnerId, ctx.user.userId), eq(assessments.status, "open"))).orderBy(desc(assessments.createdAt)).limit(1);
  if (open) return Response.json({ ...open, assessmentId: rubricId(open.rubricJson) });
  const [total] = await ctx.db.select({ value: count() }).from(assessments).where(eq(assessments.learnerId, ctx.user.userId));
  const definition = assessmentCatalog[total.value % assessmentCatalog.length]; const competency = getCompetency(definition.competencyId);
  await ctx.db.insert(competencies).values({ id: definition.competencyId, name: competency?.name ?? definition.competencyId, description: definition.title, priority: competency?.prio ?? "P1", prerequisitesJson: JSON.stringify(competency?.prerequisites ?? []) }).onConflictDoNothing();
  const item = { id: crypto.randomUUID(), learnerId: ctx.user.userId, competencyId: definition.competencyId, question: definition.question, rubricJson: JSON.stringify({ assessmentId: definition.id, kind: definition.kind, criteria: definition.criteria }), status: "open" };
  await ctx.db.insert(assessments).values(item); return Response.json({ ...item, assessmentId: definition.id });
}

export async function POST(request: Request) {
  const ctx = await learner(); if (!ctx) return Response.json({ error: "请先登录。" }, { status: 401 });
  const { id, answer } = await request.json() as { id?: string; answer?: string }; if (!id || !answer?.trim()) return Response.json({ error: "请完成回答。" }, { status: 400 });
  const [item] = await ctx.db.select().from(assessments).where(and(eq(assessments.id, id), eq(assessments.learnerId, ctx.user.userId))).limit(1);
  if (!item || item.status !== "open") return Response.json({ error: "小测不存在或已经评分。" }, { status: 404 });
  const assessmentId = rubricId(item.rubricJson); if (!getAssessmentDefinition(assessmentId)) return Response.json({ error: "评分规则版本无法识别。" }, { status: 409 });
  const result = gradeAssessment(assessmentId, answer.trim());
  await ctx.db.update(assessments).set({ answer: answer.trim(), score: result.score, feedback: result.feedback, status: "graded" }).where(eq(assessments.id, id));
  const state = { mastery: result.score, confidence: Math.min(85, result.score), rationale: `${result.errorCategory ? `错误类型：${result.errorCategory}。` : ""}${result.feedback}`, lastAssessedAt: new Date().toISOString() };
  const [existing] = await ctx.db.select({ id: competencyStates.id }).from(competencyStates).where(and(eq(competencyStates.learnerId, ctx.user.userId), eq(competencyStates.competencyId, result.competencyId))).limit(1);
  if (existing) await ctx.db.update(competencyStates).set(state).where(eq(competencyStates.id, existing.id)); else await ctx.db.insert(competencyStates).values({ id: crypto.randomUUID(), learnerId: ctx.user.userId, competencyId: result.competencyId, ...state });
  return Response.json({ ok: true, ...result });
}

function rubricId(value: string) { try { const parsed = JSON.parse(value); return typeof parsed.assessmentId === "string" ? parsed.assessmentId : "concept-tool-contract"; } catch { return "concept-tool-contract"; } }
