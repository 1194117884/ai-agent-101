import { redirect } from "next/navigation";
import { getAdminUser } from "../../admin-auth";
import { KnowledgeUploader } from "./KnowledgeUploader";

export const dynamic = "force-dynamic";
export default async function KnowledgeUploadPage() {
  if (!await getAdminUser()) redirect("/");
  return <KnowledgeUploader />;
}
