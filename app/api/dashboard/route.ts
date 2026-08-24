import { and, desc, eq, inArray } from "drizzle-orm";
import { getCloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { competencies, competencyStates, conversations, evidence, learnerProfiles, learningTasks } from "../../../db/schema";
import { rubricLabels } from "../../../lib/rubric";

export async function GET() {
  const user = await getCloudflareUser();
  if (!user) return Response.json({ error: "请先使用 Google 账号登录。" }, { status: 401 });
  const db = getDb();
  const [[profile], [task], states, recentEvidence, recentConversations] = await Promise.all([
    db.select().from(learnerProfiles).where(eq(learnerProfiles.id, user.userId)).limit(1),
    db.select().from(learningTasks).where(and(eq(learningTasks.learnerId, user.userId), eq(learningTasks.status, "active"))).orderBy(desc(learningTasks.updatedAt)).limit(1),
    db.select().from(competencyStates).where(eq(competencyStates.learnerId, user.userId)).orderBy(desc(competencyStates.updatedAt)),
    db.select().from(evidence).where(eq(evidence.learnerId, user.userId)).orderBy(desc(evidence.createdAt)).limit(8),
    db.select().from(conversations).where(eq(conversations.learnerId, user.userId)).orderBy(desc(conversations.createdAt)).limit(12),
  ]);
  const competencyIds = [...new Set([...states.map((state) => state.competencyId), ...recentEvidence.map((item) => item.competencyId)])];
  const names = competencyIds.length ? await db.select({ id: competencies.id, name: competencies.name }).from(competencies).where(inArray(competencies.id, competencyIds)) : [];
  const nameMap = Object.fromEntries(names.map((item) => [item.id, item.name]));
  return Response.json({
    profile: profile ?? { displayName: user.displayName, learningGoal: "掌握 Agent Engineering", weeklyHours: 8 },
    task: task ? { ...task, rubric: rubricLabels(task.rubricJson) } : null,
    competencies: states.map((state) => ({ ...state, name: nameMap[state.competencyId] ?? state.competencyId })),
    evidence: recentEvidence.map((item) => ({ ...item, competencyName: nameMap[item.competencyId] ?? item.competencyId })),
    conversations: recentConversations.reverse(),
  });
}
