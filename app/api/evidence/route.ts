import { and, eq } from "drizzle-orm";
import { getCloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { competencies, competencyStates, evidence, learnerProfiles, learningTasks } from "../../../db/schema";
import { apiError, databaseError } from "../../../lib/api-response";
import { getAssessmentDefinition, gradeAssessment } from "../../../lib/assessment";
import { rubricAssessmentId } from "../../../lib/rubric";
import { recommendNextTask } from "../../../lib/task-recommendation";
import { getCompetency } from "../../../curriculum/catalog";

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录后再提交学习证据。", 401, "AUTH_REQUIRED");
  let body: { content?: string };
  try { body = await request.json() as { content?: string }; }
  catch { return apiError("请求格式无效。", 400, "INVALID_INPUT"); }
  const content = body.content?.trim();
  if (!content) return apiError("请填写学习证据。", 400, "INVALID_INPUT");

  try {
    const db = getDb();
    const [activeTask] = await db.select().from(learningTasks).where(and(eq(learningTasks.learnerId, user.userId), eq(learningTasks.status, "active"))).limit(1);
    const assessmentId = activeTask ? rubricAssessmentId(activeTask.rubricJson) ?? "design-tool-contract" : "design-tool-contract";
    const assessment = gradeAssessment(assessmentId, content);
    const [state] = await db.select({ id: competencyStates.id }).from(competencyStates).where(and(eq(competencyStates.learnerId, user.userId), eq(competencyStates.competencyId, assessment.competencyId))).limit(1);
    const stateValues = { mastery: assessment.score, confidence: Math.min(80, assessment.score), rationale: assessment.feedback, lastAssessedAt: new Date().toISOString() };
    const previousStates = await db.select({ competencyId: competencyStates.competencyId, mastery: competencyStates.mastery, confidence: competencyStates.confidence }).from(competencyStates).where(eq(competencyStates.learnerId, user.userId));
    const nextTask = recommendNextTask([...previousStates.filter((item) => item.competencyId !== assessment.competencyId), { competencyId: assessment.competencyId, mastery: stateValues.mastery, confidence: stateValues.confidence }]);
    const competency = getCompetency(assessment.competencyId);
    const nextCompetency = getCompetency(nextTask.assessment.competencyId);
    const stateWrite = state
      ? db.update(competencyStates).set(stateValues).where(eq(competencyStates.id, state.id))
      : db.insert(competencyStates).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: assessment.competencyId, ...stateValues });

    await db.batch([
      db.insert(competencies).values({ id: assessment.competencyId, name: competency?.name ?? assessment.competencyId, description: getAssessmentDefinition(assessmentId)?.title ?? "学习评估", priority: competency?.prio ?? "P1", prerequisitesJson: JSON.stringify(competency?.prerequisites ?? []) }).onConflictDoNothing(),
      db.insert(competencies).values({ id: nextTask.assessment.competencyId, name: nextCompetency?.name ?? nextTask.assessment.competencyId, description: nextTask.assessment.title, priority: nextCompetency?.prio ?? "P1", prerequisitesJson: JSON.stringify(nextCompetency?.prerequisites ?? []) }).onConflictDoNothing(),
      db.insert(learnerProfiles).values({ id: user.userId, displayName: user.displayName, learningGoal: "掌握 Agent Engineering", weeklyHours: 8, timezone: "Asia/Shanghai" }).onConflictDoNothing(),
      db.insert(evidence).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: assessment.competencyId, taskId: activeTask?.id, type: "submission", content, score: assessment.score, feedback: assessment.feedback }),
      stateWrite,
      db.update(learningTasks).set({ status: "superseded" }).where(and(eq(learningTasks.learnerId, user.userId), eq(learningTasks.status, "active"))),
      db.insert(learningTasks).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: nextTask.assessment.competencyId, title: nextTask.title, instruction: nextTask.instruction, expectedOutput: nextTask.expectedOutput, rubricJson: JSON.stringify({ assessmentId: nextTask.assessment.id, criteria: nextTask.assessment.criteria }), status: "active", sourceUnitId: nextTask.sourceUnitId }),
    ]);
    return Response.json({ ok: true, assessment, nextTask });
  } catch (error) {
    return databaseError(error);
  }
}
