import { env } from "cloudflare:workers";
import { count, eq } from "drizzle-orm";
import { getAdminUser } from "../../../admin-auth";
import { getDb } from "../../../../db";
import { aiApiKeys, aiChannels, assessments, competencies, competencyStates, conversations, evidence, learnerProfiles, learningTasks } from "../../../../db/schema";
import { apiError } from "../../../../lib/api-response";
import { isKeyCoolingDown } from "../../../../lib/ai-key-health";

type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string };

async function authorized() {
  return Boolean(await getAdminUser());
}

export async function GET() {
  if (!await authorized()) return apiError("无权查看生产验收状态。", 403, "FORBIDDEN");
  const checks: Check[] = [{ id: "auth", label: "Google 登录", status: "pass", detail: "已识别并验证登录会话。" }];

  checks.push(env.AUTH_SESSION_SECRET || env.AI_KEY_ENCRYPTION_SECRET
    ? { id: "session", label: "会话签名密钥", status: "pass", detail: env.AUTH_SESSION_SECRET ? "AUTH_SESSION_SECRET 已配置。" : "使用用途隔离后的 AI 加密密钥签名会话。" }
    : { id: "session", label: "会话签名密钥", status: "fail", detail: "请配置 AUTH_SESSION_SECRET。" });
  checks.push(env.AI && env.VECTORIZE
    ? { id: "rag", label: "知识库向量服务", status: "pass", detail: "Workers AI 与 Vectorize 绑定均可用。" }
    : { id: "rag", label: "知识库向量服务", status: "fail", detail: "请配置 AI 和 VECTORIZE Worker 绑定。" });

  const secret = env.AI_KEY_ENCRYPTION_SECRET;
  checks.push(secret?.length >= 24
    ? { id: "encryption", label: "Key 加密密钥", status: "pass", detail: "AI_KEY_ENCRYPTION_SECRET 已配置。" }
    : { id: "encryption", label: "Key 加密密钥", status: "fail", detail: "请配置至少 24 个字符的 AI_KEY_ENCRYPTION_SECRET。" });

  try {
    const db = getDb();
    const tables = [learnerProfiles, competencies, competencyStates, learningTasks, evidence, conversations, assessments, aiChannels, aiApiKeys] as const;
    await Promise.all(tables.map((table) => db.select({ value: count() }).from(table)));
    checks.push({ id: "d1", label: "D1 数据结构", status: "pass", detail: `已验证 ${tables.length} 张业务表。` });

    const [channels, keys] = await Promise.all([
      db.select().from(aiChannels).where(eq(aiChannels.enabled, true)),
      db.select().from(aiApiKeys).where(eq(aiApiKeys.enabled, true)),
    ]);
    checks.push(channels.length
      ? { id: "channels", label: "AI 渠道", status: "pass", detail: `${channels.length} 个渠道已启用。` }
      : { id: "channels", label: "AI 渠道", status: "warn", detail: "尚未启用渠道，教师问答会使用本地规则。" });
    const activeChannelIds = new Set(channels.map((channel) => channel.id));
    const activeKeys = keys.filter((key) => activeChannelIds.has(key.channelId));
    const runnableKeys = activeKeys.filter((key) => !isKeyCoolingDown(key));
    checks.push(runnableKeys.length
      ? { id: "keys", label: "可用 Key 池", status: "pass", detail: `${runnableKeys.length}/${activeKeys.length} 个启用 Key 当前可调度。` }
      : { id: "keys", label: "可用 Key 池", status: activeKeys.length ? "warn" : "fail", detail: activeKeys.length ? "全部启用 Key 正在冷却，系统将保留恢复探测。" : "请为启用渠道添加至少一个 Key。" });
  } catch {
    checks.push({ id: "d1", label: "D1 数据结构", status: "fail", detail: "D1 不可访问或迁移未完整应用，请检查绑定和迁移。" });
  }

  return Response.json({ ready: checks.every((check) => check.status !== "fail"), checkedAt: new Date().toISOString(), checks });
}
