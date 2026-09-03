"use client";
import { useEffect, useState } from "react";
import { LEARNING_STATE_UPDATED } from "./learning-events";

type Weakness = { level: "strong" | "watch" | "weak"; evidenceCount: number; reasons: string[]; recommendation: string };
type ReportItem = { competencyId: string; name: string; mastery: number; confidence: number; reason: string; evidence: { id: string; type: string; score: number | null; feedback: string | null; createdAt: string }[] };
type StageReport = { summary: string; mastered: ReportItem[]; consolidating: ReportItem[]; weak: ReportItem[]; nextStageAdvice: string };
type Dashboard = { profile: { learningGoal: string; weeklyHours: number }; competencies: { id: string; name: string; mastery: number; confidence: number; rationale: string; weakness: Weakness }[]; stageReport?: StageReport; error?: string };
export function LearningState() {
  const [data, setData] = useState<Dashboard>();
  useEffect(() => { const load = () => { fetch("/api/dashboard").then((response) => response.json()).then(setData).catch(() => setData({ profile: { learningGoal: "掌握 Agent Engineering", weeklyHours: 8 }, competencies: [], error: "状态加载失败。" })); }; load(); window.addEventListener(LEARNING_STATE_UPDATED, load); return () => window.removeEventListener(LEARNING_STATE_UPDATED, load); }, []);
  return <section className="panel side-panel state-panel"><div className="side-title"><div><h2>阶段学习报告</h2><p>{data?.profile ? `${data.profile.learningGoal} · 每周 ${data.profile.weeklyHours} 小时` : "根据最近证据动态更新"}</p></div><span className="panel-tag">Live</span></div>{!data ? <div className="skeleton-line">正在生成阶段报告…</div> : data.error ? <p className="empty-state">{data.error}</p> : data.competencies.length === 0 ? <p className="empty-state">提交第一条学习证据后，这里会形成阶段报告。</p> : <><StageSummary report={data.stageReport} /><details className="competency-breakdown"><summary>查看全部能力明细</summary><div className="competency-list">{data.competencies.map((state) => <article key={state.id}><div className="progress-head"><strong>{state.name}</strong><span>{state.mastery}%</span></div><div className="progress-track"><span style={{ width: `${state.mastery}%` }}/></div><div className="competency-detail"><span>置信度 {state.confidence}% · {state.weakness.evidenceCount} 条评分证据</span><p>{state.rationale}</p><details className={`weakness-detail ${state.weakness.level}`} open={state.weakness.level === "weak"}><summary>{state.weakness.level === "weak" ? "薄弱" : state.weakness.level === "watch" ? "待巩固" : "稳定"} · 查看判断依据</summary><ul>{state.weakness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><b>{state.weakness.recommendation}</b></details></div></article>)}</div></details></>}</section>;
}

function StageSummary({ report }: { report?: StageReport }) {
  if (!report) return null;
  const groups: [string, string, ReportItem[]][] = [["已掌握", "strong", report.mastered], ["待巩固", "watch", report.consolidating], ["薄弱项", "weak", report.weak]];
  return <div className="stage-report"><p className="report-summary">{report.summary}</p><div className="report-groups">{groups.map(([label, level, items]) => <section key={level} className={`report-group ${level}`}><header><b>{label}</b><span>{items.length}</span></header>{items.length ? items.map((item) => <details key={item.competencyId}><summary><strong>{item.name}</strong><span>{item.mastery}%</span></summary><p>{item.reason}</p><ul>{item.evidence.length ? item.evidence.map((entry) => <li key={entry.id}><b>{entry.score === null ? "未评分" : `${entry.score} 分`}</b> · {entry.type}{entry.feedback ? ` · ${entry.feedback}` : ""}</li>) : <li>暂无可展示的近期证据</li>}</ul></details>) : <p className="report-empty">暂无</p>}</section>)}</div><div className="next-stage-advice"><span>下一阶段</span><b>{report.nextStageAdvice}</b></div></div>;
}
