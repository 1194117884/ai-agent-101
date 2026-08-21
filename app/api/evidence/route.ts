import { and, eq } from "drizzle-orm";
import { getCloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { competencies, competencyStates, evidence, learnerProfiles, learningTasks } from "../../../db/schema";
import { apiError, databaseError } from "../../../lib/api-response";
import { getAssessmentDefinition, gradeAssessment } from "../../../lib/assessment";

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
    const assessment = gradeAssessment("design-tool-contract", content);
    const [state] = await db.select({ id: competencyStates.id }).from(competencyStates).where(and(eq(competencyStates.learnerId, user.userId), eq(competencyStates.competencyId, "tools"))).limit(1);
    const stateValues = { mastery: assessment.score, confidence: Math.min(80, assessment.score), rationale: assessment.feedback, lastAssessedAt: new Date().toISOString() };
    const nextTask = assessment.score < 80
      ? { title: "补强工具契约", instruction: "补齐本次反馈中缺失的项目，并解释每个字段怎样减少 Agent 误用。" }
      : { title: "设计工具选择 Eval", instruction: "为 search 工具写 5 个应调用与 5 个不应调用的场景，并定义判分规则。" };
    const stateWrite = state
      ? db.update(competencyStates).set(stateValues).where(eq(competencyStates.id, state.id))
      : db.insert(competencyStates).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: "tools", ...stateValues });

    await db.batch([
      db.insert(competencies).values({ id: "tools", name: "Tool Design / Function Calling", description: "为 Agent 设计清晰、可恢复的工具接口。", priority: "P0", prerequisitesJson: "[\"agent-loop\"]" }).onConflictDoNothing(),
      db.insert(learnerProfiles).values({ id: user.userId, displayName: user.displayName, learningGoal: "掌握 Agent Engineering", weeklyHours: 8, timezone: "Asia/Shanghai" }).onConflictDoNothing(),
      db.insert(evidence).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: "tools", type: "submission", content, score: assessment.score, feedback: assessment.feedback }),
      stateWrite,
      db.update(learningTasks).set({ status: "superseded" }).where(and(eq(learningTasks.learnerId, user.userId), eq(learningTasks.status, "active"))),
      db.insert(learningTasks).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: "tools", title: nextTask.title, instruction: nextTask.instruction, expectedOutput: assessment.score < 80 ? "修订后的工具契约与解释" : "10 个工具选择场景与判分规则", rubricJson: JSON.stringify(getAssessmentDefinition(assessment.score < 80 ? "design-tool-contract" : "acceptance-agent-project")?.criteria ?? []), status: "active", sourceUnitId: "day-4" }),
    ]);
    return Response.json({ ok: true, assessment, nextTask });
  } catch (error) {
    return databaseError(error);
  }
}
