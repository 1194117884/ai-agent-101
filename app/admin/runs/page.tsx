import { redirect } from "next/navigation";
import { getAdminUser } from "../../admin-auth";
import { RunMonitor } from "./RunMonitor";

export const dynamic = "force-dynamic";

export default async function RunsAdminPage() {
  if (!await getAdminUser()) redirect("/login?returnTo=%2Fadmin%2Fruns");
  return <RunMonitor />;
}
