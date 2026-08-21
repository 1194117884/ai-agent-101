import Link from "next/link";
import { CoachChat } from "./CoachChat";
import { EvidenceForm } from "./EvidenceForm";
import { LearningState } from "./LearningState";
import { Quiz } from "./Quiz";
import { CurrentTask } from "./CurrentTask";
import { ActivityHistory } from "./ActivityHistory";
import { getCloudflareUser } from "./auth";
import { Login } from "./Login";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!await getCloudflareUser()) return <Login />;
  return <main className="coach-shell">
    <header className="coach-nav">
      <div className="brand"><span className="brand-mark">A</span><div><strong>阿建私教</strong><small>Agent Engineering Coach</small></div></div>
      <div className="nav-actions"><Link href="/admin/ai" className="admin-link">AI 渠道管理 <span>→</span></Link><LogoutButton /></div>
    </header>

    <section className="hero-grid">
      <div className="hero-copy">
        <span className="eyebrow">今日训练 · Tool Design</span>
        <h1>把 API，设计成<br/><em>Agent 真正会用</em>的工具</h1>
        <p>今天不追求多写一个接口。我们只解决一个问题：如何让 Agent 在正确的时机调用，并在失败后知道下一步。</p>
        <div className="hero-meta"><span><b>01</b> 个核心任务</span><span><b>03</b> 条验收标准</span><span><b>~35</b> 分钟</span></div>
      </div>
      <CurrentTask />
    </section>

    <section className="workspace-grid">
      <div className="workspace-main">
        <section className="panel evidence-panel"><div className="panel-heading"><div><span className="step-number">01</span><div><h2>提交学习证据</h2><p>贴上你的思考、代码或工具契约，老师会据此评分。</p></div></div><span className="panel-tag">Evidence</span></div><EvidenceForm /></section>
        <section className="panel"><div className="panel-heading"><div><span className="step-number">02</span><div><h2>快速小测</h2><p>用一个问题确认你是否真的掌握。</p></div></div><span className="panel-tag">Check</span></div><Quiz /></section>
        <ActivityHistory />
      </div>
      <aside className="workspace-side">
        <LearningState />
        <CoachChat />
      </aside>
    </section>
  </main>;
}
