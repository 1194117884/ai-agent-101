"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Attempt = { provider: string; outcome: "success" | "failure"; error?: string };
type ToolCall = { id: string; name: string; outcome: "success" | "failure"; durationMs: number };
type Match = { rank?: number; title?: string; relativeRelevance?: number; combinedScore?: number };
type Metadata = { delivery?: { mode?: string; provider?: string; reason?: string }; runtime?: { durationMs?: number; attempts?: Attempt[]; toolCalls?: ToolCall[]; termination?: string }; retrieval?: { mode?: string; matches?: Match[]; conflicts?: unknown[] }; userFeedback?: { rating?: "helpful" | "unhelpful"; createdAt?: string } };
type Run = { id: string; learnerId: string; learnerName: string | null; content: string; source: string | null; metadataJson: string | null; createdAt: string };

function metadata(value: string | null): Metadata { try { return JSON.parse(value ?? "{}") as Metadata; } catch { return {}; } }

export function RunMonitor() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/admin/runs").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "加载失败"); setRuns(body.runs ?? []); }).catch((reason) => setError(reason.message)); }, []);
  const parsed = useMemo(() => runs.map((run) => ({ run, meta: metadata(run.metadataJson) })), [runs]);
  const observed = parsed.filter((item) => item.meta.runtime);
  const fallbackCount = parsed.filter((item) => item.meta.delivery?.mode === "fallback").length;
  const helpfulCount = parsed.filter((item) => item.meta.userFeedback?.rating === "helpful").length;
  const unhelpfulCount = parsed.filter((item) => item.meta.userFeedback?.rating === "unhelpful").length;
  const failedAttempts = parsed.reduce((total, item) => total + (item.meta.runtime?.attempts?.filter((attempt) => attempt.outcome === "failure").length ?? 0), 0);
  const averageMs = observed.length ? Math.round(observed.reduce((total, item) => total + (item.meta.runtime?.durationMs ?? 0), 0) / observed.length) : 0;
  return <main className="admin-shell run-monitor"><header className="admin-header"><div><Link className="back-link" href="/">← 返回学习页</Link><h1>教师运行记录</h1><p>定位每次回答使用了哪个渠道、调用了什么工具、召回了哪些资料以及在哪里失败。</p></div><button className="secondary-button" onClick={() => location.reload()}>刷新</button></header>
    <section className="run-stats"><div><strong>{runs.length}</strong><span>最近回答</span></div><div><strong>{averageMs || "—"}</strong><span>平均耗时{averageMs ? " ms" : ""}</span></div><div><strong>{fallbackCount}</strong><span>本地降级</span></div><div><strong>{failedAttempts}</strong><span>失败尝试</span></div><div><strong>{helpfulCount}</strong><span>有帮助</span></div><div><strong>{unhelpfulCount}</strong><span>没解决</span></div></section>
    {error ? <p className="empty-copy">{error}</p> : runs.length === 0 ? <p className="empty-copy">暂无运行记录。用户向老师提问后会出现在这里。</p> : <section className="run-list">{parsed.map(({ run, meta }) => { const runtime = meta.runtime; const matches = meta.retrieval?.matches ?? []; return <article key={run.id} className={[meta.delivery?.mode === "fallback" ? "fallback" : "", meta.userFeedback?.rating === "unhelpful" ? "unhelpful" : ""].filter(Boolean).join(" ")}><header><div><strong>{run.learnerName || run.learnerId}</strong><time>{new Date(run.createdAt).toLocaleString("zh-CN")}</time></div><div className="run-badges"><span>{meta.delivery?.mode === "fallback" ? "本地降级" : meta.delivery?.provider || "历史记录"}</span>{runtime?.durationMs !== undefined && <span>{runtime.durationMs} ms</span>}<span>{meta.retrieval?.mode || "无召回"}</span>{meta.userFeedback?.rating && <span className={meta.userFeedback.rating}>{meta.userFeedback.rating === "helpful" ? "✓ 有帮助" : "✕ 没解决"}</span>}</div></header><p>{run.content}</p><details><summary>查看运行详情</summary><div className="run-detail"><section><b>渠道尝试</b>{runtime?.attempts?.length ? runtime.attempts.map((attempt, index) => <p key={`${attempt.provider}-${index}`} className={attempt.outcome}><span>{index + 1}. {attempt.provider}</span><small>{attempt.outcome === "success" ? "成功" : attempt.error || "失败"}</small></p>) : <em>旧记录没有渠道明细</em>}</section><section><b>工具调用</b>{runtime?.toolCalls?.length ? runtime.toolCalls.map((tool) => <p key={tool.id} className={tool.outcome}><span>{tool.name}</span><small>{tool.outcome} · {tool.durationMs} ms · {tool.id}</small></p>) : <em>本次未调用工具</em>}</section><section><b>知识召回</b>{matches.length ? matches.map((match) => <p key={`${match.rank}-${match.title}`}><span>#{match.rank} {match.title}</span><small>相关性 {match.relativeRelevance ?? "—"}% · 综合 {match.combinedScore ?? "—"}</small></p>) : <em>本次没有召回资料</em>}</section></div></details></article>; })}</section>}
  </main>;
}
