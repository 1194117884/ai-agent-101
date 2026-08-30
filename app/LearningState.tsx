"use client";
import { useEffect, useState } from "react";
import { LEARNING_STATE_UPDATED } from "./learning-events";

type Weakness = { level: "strong" | "watch" | "weak"; evidenceCount: number; reasons: string[]; recommendation: string };
type Dashboard = { profile: { learningGoal: string; weeklyHours: number }; competencies: { id: string; name: string; mastery: number; confidence: number; rationale: string; weakness: Weakness }[]; error?: string };
export function LearningState() {
  const [data, setData] = useState<Dashboard>();
  useEffect(() => { const load = () => { fetch("/api/dashboard").then((response) => response.json()).then(setData).catch(() => setData({ profile: { learningGoal: "掌握 Agent Engineering", weeklyHours: 8 }, competencies: [], error: "状态加载失败。" })); }; load(); window.addEventListener(LEARNING_STATE_UPDATED, load); return () => window.removeEventListener(LEARNING_STATE_UPDATED, load); }, []);
  return <section className="panel side-panel state-panel"><div className="side-title"><div><h2>能力画像</h2><p>{data?.profile ? `${data.profile.learningGoal} · 每周 ${data.profile.weeklyHours} 小时` : "根据最近证据动态更新"}</p></div><span className="panel-tag">Live</span></div>{!data ? <div className="skeleton-line">正在读取能力画像…</div> : data.error ? <p className="empty-state">{data.error}</p> : data.competencies.length === 0 ? <p className="empty-state">提交第一条学习证据后，这里会形成能力画像。</p> : <div className="competency-list">{data.competencies.map((state) => <article key={state.id}><div className="progress-head"><strong>{state.name}</strong><span>{state.mastery}%</span></div><div className="progress-track"><span style={{ width: `${state.mastery}%` }}/></div><div className="competency-detail"><span>置信度 {state.confidence}% · {state.weakness.evidenceCount} 条评分证据</span><p>{state.rationale}</p><details className={`weakness-detail ${state.weakness.level}`} open={state.weakness.level === "weak"}><summary>{state.weakness.level === "weak" ? "薄弱" : state.weakness.level === "watch" ? "待巩固" : "稳定"} · 查看判断依据</summary><ul>{state.weakness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><b>{state.weakness.recommendation}</b></details></div></article>)}</div>}</section>;
}
