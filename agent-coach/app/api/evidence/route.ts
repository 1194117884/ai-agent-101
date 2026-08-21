import { and, eq } from "drizzle-orm";
import { getCloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { competencies, competencyStates, evidence, learnerProfiles, learningTasks } from "../../../db/schema";

function assessToolDesign(content: string) {
  const hasName = /name|名称|search|查询|查找/i.test(content);
  const hasSchema = /schema|json|参数|properties|input/i.test(content);
  const hasFailure = /error|错误|失败|not found|无结果/i.test(content);
  const score = Math.round(([hasName, hasSchema, hasFailure].filter(Boolean).length / 3) * 100);
  const missing = [!hasName && "工具名称与单一动作", !hasSchema && "输入 schema / 参数约束", !hasFailure && "失败返回与下一步建议"].filter(Boolean);
  return { score, feedback: score === 100 ? "三个验收点都覆盖了。下一步请补一条“什么时候不该调用该工具”的说明。" : `已覆盖 ${3 - missing.length}/3 个验收点。优先补：${missing.join("、")}。` };
}

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return Response.json({ error: "请先登录后再提交学习证据。" }, { status: 401 });
  const body = await request.json() as { content?: string };
  const content = body.content?.trim();
  if (!content) return Response.json({ error: "请填写学习证据。" }, { status: 400 });
  const db = getDb();
  await db.insert(competencies).values({ id: "tool-design", name: "Tool Design / Function Calling", description: "为 Agent 设计清晰、可恢复的工具接口。", priority: "P0", prerequisitesJson: "[\"agent-loop\"]" }).onConflictDoNothing();
  const existing = await db.select({ id: learnerProfiles.id }).from(learnerProfiles).where(eq(learnerProfiles.id, user.userId)).limit(1);
  if (!existing.length) await db.insert(learnerProfiles).values({ id: user.userId, displayName: user.displayName, learningGoal: "掌握 Agent Engineering", weeklyHours: 8, timezone: "Asia/Shanghai" });
  const assessment = assessToolDesign(content);
  await db.insert(evidence).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: "tool-design", type: "submission", content, score: assessment.score, feedback: assessment.feedback });
  const state = await db.select({ id: competencyStates.id }).from(competencyStates).where(and(eq(competencyStates.learnerId, user.userId), eq(competencyStates.competencyId, "tool-design"))).limit(1);
  const values = { mastery: assessment.score, confidence: Math.min(80, assessment.score), rationale: assessment.feedback, lastAssessedAt: new Date().toISOString() };
  if (state.length) await db.update(competencyStates).set(values).where(eq(competencyStates.id, state[0].id));
  else await db.insert(competencyStates).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: "tool-design", ...values });
  const nextTask = assessment.score < 100
    ? { title: "补强工具契约", instruction: "补齐本次反馈中缺失的项目，并解释每个字段怎样减少 Agent 误用。" }
    : { title: "设计工具选择 Eval", instruction: "为 search 工具写 5 个应调用与 5 个不应调用的场景，并定义判分规则。" };
  await db.update(learningTasks).set({ status: "superseded" }).where(and(eq(learningTasks.learnerId, user.userId), eq(learningTasks.status, "active")));
  await db.insert(learningTasks).values({ id: crypto.randomUUID(), learnerId: user.userId, competencyId: "tool-design", title: nextTask.title, instruction: nextTask.instruction, expectedOutput: assessment.score < 100 ? "修订后的工具契约与解释" : "10 个工具选择场景与判分规则", rubricJson: "[\"具体\",\"可验证\",\"与当前薄弱项相关\"]", status: "active", sourceUnitId: "foundation-tool-design" });
  return Response.json({ ok: true, assessment, nextTask });
}
