import { requireCloudflareUser } from "../../auth";
import { AISettings } from "./settings";

export const dynamic = "force-dynamic";

export default async function AIAdminPage() {
  const user = await requireCloudflareUser("/admin/ai");
  const allowlist = process.env.AI_ADMIN_EMAILS?.toLowerCase().split(/[\s,;]+/).filter(Boolean) ?? [];
  if (allowlist.length > 0 && !allowlist.includes(user.userId)) return <main className="admin-shell"><h1>无权访问</h1><p>当前账号不在 AI 管理员名单中。</p></main>;
  return <AISettings />;
}
