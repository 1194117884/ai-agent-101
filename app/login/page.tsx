import { getCloudflareUser } from "../auth";
import { redirect } from "next/navigation";
import { Login } from "../Login";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const params = await searchParams;
  const returnTo = params.returnTo?.startsWith("/") && !params.returnTo.startsWith("//") ? params.returnTo : "/";
  if (await getCloudflareUser()) redirect(returnTo);
  return <Login returnTo={returnTo} />;
}
