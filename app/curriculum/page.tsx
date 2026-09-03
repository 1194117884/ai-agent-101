import Link from "next/link";
import { requireCloudflareUser } from "../auth";
import { curriculum } from "../../curriculum/catalog";
import { CurriculumMap } from "./CurriculumMap";

export const dynamic = "force-dynamic";

export default async function CurriculumPage() {
  await requireCloudflareUser("/curriculum");
  return <main className="curriculum-shell"><header className="curriculum-header"><div><span>Agent Engineering · 2026.08.21</span><h1>30 天课程地图</h1><p>地图用于理解全局，实际任务仍会根据你的证据和薄弱项动态调整，不强制按日期推进。</p></div><Link href="/">返回今日任务</Link></header><CurriculumMap phases={curriculum.phases} units={curriculum.units} /></main>;
}
