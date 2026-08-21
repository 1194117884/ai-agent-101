import { getAdminUser } from "../../../admin-auth";
import { deleteAIChannel, listAIChannels, saveAIChannels, type ChannelInput } from "../../../../lib/ai-settings";
import { ChannelValidationError } from "../../../../lib/ai-channel-validation";
import { apiError, databaseError } from "../../../../lib/api-response";

async function authorized() {
  return Boolean(await getAdminUser());
}

export async function GET() {
  if (!await authorized()) return apiError("无权管理 AI 渠道。", 403, "FORBIDDEN");
  try { return Response.json({ channels: await listAIChannels() }); }
  catch (error) { return databaseError(error); }
}

export async function PUT(request: Request) {
  if (!await authorized()) return apiError("无权管理 AI 渠道。", 403, "FORBIDDEN");
  try {
    const body = await request.json() as { channels?: ChannelInput[] };
    if (!Array.isArray(body.channels)) return apiError("渠道配置格式不正确。", 400, "INVALID_INPUT");
    return Response.json({ channels: await saveAIChannels(body.channels) });
  } catch (error) {
    if (error instanceof ChannelValidationError || error instanceof SyntaxError) return apiError(error instanceof Error ? error.message : "渠道配置格式不正确。", 400, "INVALID_INPUT");
    return databaseError(error);
  }
}

export async function DELETE(request: Request) {
  if (!await authorized()) return apiError("无权管理 AI 渠道。", 403, "FORBIDDEN");
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError("缺少渠道 ID。", 400, "INVALID_INPUT");
  try { await deleteAIChannel(id); return Response.json({ ok: true }); }
  catch (error) { return databaseError(error); }
}
