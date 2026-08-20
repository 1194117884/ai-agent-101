import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { competencyStates, learningTasks } from "../../../db/schema";
export async function GET() { const user = await getChatGPTUser(); if (!user) return Response.json({ error: "请先登录。" }, { status: 401 }); const db = getDb(); const [task] = await db.select().from(learningTasks).where(and(eq(learningTasks.learnerId,user.userId),eq(learningTasks.status,"active"))).orderBy(desc(learningTasks.createdAt)).limit(1); const states = await db.select().from(competencyStates).where(eq(competencyStates.learnerId,user.userId)); return Response.json({ task: task ?? null, competencies: states }); }
