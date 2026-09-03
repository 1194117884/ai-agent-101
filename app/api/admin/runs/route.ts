import { desc, eq } from "drizzle-orm";
import { getAdminUser } from "../../../admin-auth";
import { getDb } from "../../../../db";
import { conversations, learnerProfiles } from "../../../../db/schema";
import { apiError, databaseError } from "../../../../lib/api-response";

export async function GET() {
  if (!await getAdminUser()) return apiError("无权查看运行记录。", 403, "FORBIDDEN");
  try {
    const runs = await getDb().select({ id: conversations.id, learnerId: conversations.learnerId, learnerName: learnerProfiles.displayName, content: conversations.content, source: conversations.source, metadataJson: conversations.metadataJson, createdAt: conversations.createdAt })
      .from(conversations).leftJoin(learnerProfiles, eq(conversations.learnerId, learnerProfiles.id))
      .where(eq(conversations.role, "coach")).orderBy(desc(conversations.createdAt)).limit(100);
    return Response.json({ runs });
  } catch (error) { return databaseError(error); }
}
