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
import { getAdminUser } from "./admin-auth";
import { ProfileSettings } from "./ProfileSettings";
import { NotificationCenter } from "./NotificationCenter";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!await getCloudflareUser()) return <Login />;
  const admin = await getAdminUser();
  return <main className="coach-shell">
    <header className="coach-nav">
      <div className="brand"><span className="brand-mark">A</span><div><strong>阿建私教</strong><small>Agent Engineering Coach</small></div></div>
      <div className="nav-actions"><NotificationCenter /><ProfileSettings />{admin && <details className="admin-menu"><summary>管理后台</summary><div><Link href="/knowledge/upload">上传资料</Link><Link href="/admin/knowledge">知识库</Link><Link href="/admin/ai">AI 渠道</Link></div></details>}<LogoutButton /></div>
    </header>

    <section className="welcome-hero">
      <div className="welcome-copy">
        <span className="eyebrow">你的 Agent Engineering 私教</span>
        <h1>不用规划整门课程。<br/><em>先完成眼前这一小步。</em></h1>
        <p>阿建会根据你的提交判断薄弱项，引用知识库答疑，并自动安排下一项最值得练的能力。</p>
        <a className="start-button" href="#today-focus">开始今天的任务 <span>↓</span></a>
      </div>
      <div className="capability-card"><span>你可以在这里</span><ul><li><b>练</b><div><strong>完成真实任务</strong><small>每次只处理一个明确目标</small></div></li><li><b>问</b><div><strong>随时向老师提问</strong><small>回答会引用你的课程与资料</small></div></li><li><b>看</b><div><strong>理解自己的进步</strong><small>掌握度都有证据和原因</small></div></li></ul></div>
    </section>

    <nav className="learning-path" aria-label="使用步骤"><div className="active"><span>1</span><div><b>看今日任务</b><small>弄清产出与验收标准</small></div></div><i>→</i><div><span>2</span><div><b>提交你的答案</b><small>笔记、代码或方案都可以</small></div></div><i>→</i><div><span>3</span><div><b>获得下一步</b><small>评分后自动调整学习路径</small></div></div></nav>

    <section className="focus-section" id="today-focus">
      <div className="section-intro"><span>今日主线</span><h2>先完成这一件事</h2><p>第一次使用也不需要设置课程。阅读任务，在右侧提交你的回答；系统会告诉你哪里薄弱以及接下来做什么。</p></div>
      <div className="focus-grid"><CurrentTask /><section className="panel evidence-panel"><div className="panel-heading"><div><span className="step-number">02</span><div><h2>提交你的答案</h2><p>可以粘贴思考、代码、笔记或链接。</p></div></div><span className="panel-tag">系统将自动评分</span></div><EvidenceForm /></section></div>
    </section>

    <section className="support-section"><div className="section-intro compact"><span>学习辅助</span><h2>卡住时问老师，完成后看变化</h2><p>这些功能服务于今日任务，不需要逐项完成。</p></div><div className="support-grid"><CoachChat /><LearningState /></div></section>

    <details className="more-tools" id="advanced-tools"><summary><div><span>进阶工具</span><strong>小测与学习记录</strong><small>完成主任务后，再用小测验证掌握情况或回看历史。</small></div><b>展开查看 ＋</b></summary><div className="more-tools-grid"><section className="panel" id="quick-quiz"><div className="panel-heading"><div><span className="step-number">✓</span><div><h2>快速小测</h2><p>用一个问题确认是否真的掌握。</p></div></div><span className="panel-tag">可选</span></div><Quiz /></section><ActivityHistory /></div></details>
  </main>;
}
