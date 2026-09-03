import { and, eq } from "drizzle-orm";
import { getCloudflareUser } from "../../../auth";
import { getDb } from "../../../../db";
import { conversations } from "../../../../db/schema";
import { apiError, databaseError } from "../../../../lib/api-response";

export async function POST(request: Request) {
  const user = await getCloudflareUser();
  if (!user) return apiError("请先登录。", 401, "AUTH_REQUIRED");
  let body: { conversationId?: string; rating?: string };
  try { body = await request.json() as typeof body; }
  catch { return apiError("请求格式无效。", 400, "INVALID_INPUT"); }
  if (!body.conversationId || !["helpful", "unhelpful"].includes(body.rating ?? "")) return apiError("反馈参数无效。", 400, "INVALID_INPUT");
  try {
    const db = getDb();
    const [conversation] = await db.select({ id: conversations.id, metadataJson: conversations.metadataJson }).from(conversations)
      .where(and(eq(conversations.id, body.conversationId), eq(conversations.learnerId, user.userId), eq(conversations.role, "coach"))).limit(1);
    if (!conversation) return apiError("回答记录不存在。", 404, "NOT_FOUND");
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(conversation.metadataJson ?? "{}") as Record<string, unknown>; } catch { /* Preserve a usable metadata object. */ }
    metadata.userFeedback = { rating: body.rating, createdAt: new Date().toISOString() };
    await db.update(conversations).set({ metadataJson: JSON.stringify(metadata), updatedAt: new Date().toISOString() }).where(eq(conversations.id, conversation.id));
    return Response.json({ ok: true, rating: body.rating });
  } catch (error) { return databaseError(error); }
}
