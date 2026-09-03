import { eq } from "drizzle-orm";
import { getCloudflareUser } from "../../auth";
import { getDb } from "../../../db";
import { learnerProfiles } from "../../../db/schema";
import { apiError, databaseError } from "../../../lib/api-response";
import { ProfileValidationError, validateProfileSettings } from "../../../lib/profile-settings";

const defaults = { learningGoal: "掌握 Agent Engineering", weeklyHours: 8, timezone: "Asia/Shanghai", currentProject: null, learningPace: "steady" as const };

export async function GET() {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录。", 401, "AUTH_REQUIRED");
  try {
    const [profile] = await getDb().select().from(learnerProfiles).where(eq(learnerProfiles.id, user.userId)).limit(1);
    return Response.json(profile ? { learningGoal: profile.learningGoal, weeklyHours: profile.weeklyHours, timezone: profile.timezone, currentProject: profile.currentProject, learningPace: profile.learningPace } : defaults);
  } catch (error) { return databaseError(error); }
}

export async function PUT(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录。", 401, "AUTH_REQUIRED");
  try {
    const settings = validateProfileSettings(await request.json());
    const now = new Date().toISOString();
    await getDb().insert(learnerProfiles).values({ id: user.userId, displayName: user.displayName, ...settings, updatedAt: now }).onConflictDoUpdate({ target: learnerProfiles.id, set: { ...settings, displayName: user.displayName, updatedAt: now } });
    return Response.json({ profile: settings });
  } catch (error) {
    if (error instanceof ProfileValidationError || error instanceof SyntaxError) return apiError(error instanceof SyntaxError ? "请求格式无效。" : error.message, 400, "INVALID_INPUT");
    return databaseError(error);
  }
}
