import { redirect } from "next/navigation";
import { getCloudflareUser } from "../../auth";
import { KnowledgeUploader } from "./KnowledgeUploader";

export const dynamic = "force-dynamic";
export default async function KnowledgeUploadPage() {
  if (!await getCloudflareUser()) redirect("/login?returnTo=%2Fknowledge%2Fupload");
  return <KnowledgeUploader />;
}
