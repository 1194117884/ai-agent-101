import { getAdminUser } from "../../admin-auth";
import { redirect } from "next/navigation";
import { KnowledgeManager } from "./KnowledgeManager";

export const dynamic = "force-dynamic";

export default async function KnowledgeAdminPage() {
  if (!await getAdminUser()) redirect("/login?returnTo=%2Fadmin%2Fknowledge");
  return <KnowledgeManager />;
}
