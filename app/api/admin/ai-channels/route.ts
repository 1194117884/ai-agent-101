import { getCloudflareUser } from "../../../auth";
import { deleteAIChannel, listAIChannels, saveAIChannels, type ChannelInput } from "../../../../lib/ai-settings";

async function authorized() {
  const user = await getCloudflareUser();
  if (!user) return false;
  const allowlist = process.env.AI_ADMIN_EMAILS?.toLowerCase().split(/[\s,;]+/).filter(Boolean) ?? [];
  return allowlist.length === 0 || allowlist.includes(user.userId);
}

export async function GET() {
  if (!await authorized()) return Response.json({ error: "无权管理 AI 渠道。" }, { status: 403 });
  return Response.json({ channels: await listAIChannels() });
}

export async function PUT(request: Request) {
  if (!await authorized()) return Response.json({ error: "无权管理 AI 渠道。" }, { status: 403 });
  try {
    const body = await request.json() as { channels?: ChannelInput[] };
    if (!Array.isArray(body.channels)) return Response.json({ error: "渠道配置格式不正确。" }, { status: 400 });
    return Response.json({ channels: await saveAIChannels(body.channels) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败。" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!await authorized()) return Response.json({ error: "无权管理 AI 渠道。" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少渠道 ID。" }, { status: 400 });
  await deleteAIChannel(id);
  return Response.json({ ok: true });
}
