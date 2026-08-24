"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DocumentItem = { id: string; title: string; url: string; sourceType: "manual" | "web" | "note"; versionLabel?: string | null; trustLevel: "primary" | "trusted" | "reference"; status: "draft" | "approved" | "archived"; topicIdsJson: string; summary?: string | null; content?: string | null; ingestionStatus: string; chunkCount: number; lastIndexedAt?: string | null; ingestionError?: string | null; updatedAt: string };
type KnowledgeStats = { documentCount: number; chunkCount: number; vectorDimensions: number; freeVectorCapacity: number; capacityPercent: number; provider: string };
type RetrievalLog = { id: string; query: string; retrievalMode: string; resultCount: number; matchesJson: string; durationMs: number; vectorError?: string | null; createdAt: string };
type FormState = { id?: string; title: string; url: string; sourceType: "manual" | "web" | "note"; versionLabel: string; trustLevel: "primary" | "trusted" | "reference"; status: "draft" | "approved" | "archived"; topics: string; summary: string; content: string };
const emptyForm: FormState = { title: "", url: "", sourceType: "manual", versionLabel: "", trustLevel: "trusted", status: "draft", topics: "", summary: "", content: "" };
function parseMatches(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as { title: string; vectorScore: number; lexicalScore: number }[] : []; } catch { return []; } }

export function KnowledgeManager() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [retrievalLogs, setRetrievalLogs] = useState<RetrievalLog[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/admin/knowledge"); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "加载失败"); setDocuments(data.documents); setStats(data.stats); setRetrievalLogs(data.retrievalLogs ?? []); }, []);
  useEffect(() => { fetch("/api/admin/knowledge").then((response) => response.json().then((data) => ({ response, data }))).then(({ response, data }) => { if (!response.ok) throw new Error(data.error ?? "加载失败"); setDocuments(data.documents); setStats(data.stats); setRetrievalLogs(data.retrievalLogs ?? []); }).catch((error) => setNotice(error.message)).finally(() => setLoading(false)); }, []);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const edit = (document: DocumentItem) => { setForm({ id: document.id, title: document.title, url: document.url.startsWith("manual://") ? "" : document.url, sourceType: document.sourceType, versionLabel: document.versionLabel ?? "", trustLevel: document.trustLevel, status: document.status, topics: JSON.parse(document.topicIdsJson || "[]").join(", "), summary: document.summary ?? "", content: document.content ?? "" }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  async function save() {
    setWorking("save"); setNotice("保存中…");
    try {
      const response = await fetch("/api/admin/knowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, topicIds: form.topics.split(/[,，;\s]+/).filter(Boolean) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "保存失败");
      setForm(emptyForm); await load(); setNotice("资料已保存。已审核资料还需要点击建立索引。 ");
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
    finally { setWorking(""); }
  }
  async function indexDocument(document: DocumentItem) {
    setWorking(document.id); setNotice("正在切片并生成向量…");
    try { const response = await fetch(`/api/admin/knowledge/${document.id}/index`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "索引失败"); await load(); setNotice(data.mode === "lexical" ? `已保存 ${data.chunkCount} 个切片；向量服务暂不可用，已自动使用关键词召回。` : `向量索引完成：${data.chunkCount} 个切片。`); }
    catch (error) { await load(); setNotice(error instanceof Error ? error.message : "索引失败"); }
    finally { setWorking(""); }
  }
  async function remove(document: DocumentItem) {
    if (!confirm(`删除“${document.title}”及其全部向量？`)) return;
    setWorking(document.id);
    try { const response = await fetch(`/api/admin/knowledge?id=${document.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "删除失败"); await load(); setNotice("资料及向量已删除。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "删除失败"); }
    finally { setWorking(""); }
  }

  return <main className="admin-shell knowledge-admin"><header className="admin-header"><div><Link href="/" className="back-link">← 返回学习页</Link><h1>知识库管理</h1><p>录入、审核、切片并向量化 Agent Engineering 资料。</p></div><Link href="/admin/ai" className="secondary-button">AI 渠道</Link></header>
    {stats && <section className="knowledge-stats" aria-label="免费额度概览"><div><small>资料</small><strong>{stats.documentCount}</strong><span>份</span></div><div><small>知识切片</small><strong>{stats.chunkCount.toLocaleString()}</strong><span>个</span></div><div><small>Vectorize 免费容量</small><strong>{stats.capacityPercent}%</strong><span>{stats.chunkCount.toLocaleString()} / 约 {stats.freeVectorCapacity.toLocaleString()}</span></div><div><small>召回保护</small><strong>双轨</strong><span>向量失败自动转关键词</span></div></section>}
    <section className="knowledge-form channel-card"><div className="knowledge-form-title"><div><h2>{form.id ? "编辑资料" : "录入资料"}</h2><p>只有“已审核”资料可以进入召回索引。</p></div>{form.id && <button className="secondary-button" onClick={() => setForm(emptyForm)}>取消编辑</button>}</div>
      <div className="field-grid"><label>标题<input value={form.title} onChange={(event) => update("title", event.target.value)} /></label><label>版本<input value={form.versionLabel} placeholder="例如 2026-08" onChange={(event) => update("versionLabel", event.target.value)} /></label><label className="wide">来源 URL（可选）<input value={form.url} placeholder="https://…" onChange={(event) => update("url", event.target.value)} /></label><label>资料类型<select value={form.sourceType} onChange={(event) => update("sourceType", event.target.value as FormState["sourceType"])}><option value="manual">手工资料</option><option value="web">网页</option><option value="note">笔记</option></select></label><label>可信级别<select value={form.trustLevel} onChange={(event) => update("trustLevel", event.target.value as FormState["trustLevel"])}><option value="primary">官方/一手</option><option value="trusted">可信资料</option><option value="reference">一般参考</option></select></label><label>审核状态<select value={form.status} onChange={(event) => update("status", event.target.value as FormState["status"])}><option value="draft">草稿</option><option value="approved">已审核</option><option value="archived">已归档</option></select></label><label>能力标签<input value={form.topics} placeholder="tools, eval, memory" onChange={(event) => update("topics", event.target.value)} /></label><label className="wide">摘要<input value={form.summary} onChange={(event) => update("summary", event.target.value)} /></label></div>
      <label className="knowledge-content-label">资料正文<textarea value={form.content} onChange={(event) => update("content", event.target.value)} placeholder="粘贴 Markdown、课程正文或整理后的网页内容…" /></label><div className="form-actions"><span>{form.content.length.toLocaleString()} / 200,000 字符</span><button className="primary-button" disabled={working === "save" || !form.title.trim() || form.content.trim().length < 20} onClick={save}>{working === "save" ? "保存中…" : "保存资料"}</button></div></section>
    {notice && <div className="toast knowledge-toast" role="status">{notice}</div>}
    <section className="knowledge-list"><div className="knowledge-list-heading"><h2>资料列表</h2><span>{documents.length} 份</span></div>{loading ? <p className="empty-copy">正在读取…</p> : documents.length === 0 ? <p className="empty-copy">还没有资料，请先录入第一份。</p> : documents.map((document) => <article className="knowledge-item" key={document.id}><div className="knowledge-item-main"><div className="knowledge-badges"><span>{document.status === "approved" ? "已审核" : document.status === "archived" ? "已归档" : "草稿"}</span><span className={document.ingestionStatus === "failed" ? "failed" : ""}>{document.ingestionStatus === "lexical" ? "关键词召回" : document.ingestionStatus}</span><span>{document.chunkCount} chunks</span></div><h3>{document.title}</h3><p>{document.summary || document.content?.slice(0, 150)}</p><small>{document.versionLabel || "无版本"} · {document.trustLevel} · 更新于 {new Date(document.updatedAt).toLocaleString("zh-CN")}</small>{document.ingestionError && <em>{document.ingestionError}</em>}</div><div className="knowledge-actions"><button className="secondary-button" onClick={() => edit(document)}>编辑</button><button className="primary-button" disabled={document.status !== "approved" || working === document.id} onClick={() => indexDocument(document)}>{working === document.id ? "处理中…" : document.ingestionStatus === "indexed" ? "重建索引" : "建立索引"}</button><button className="danger-button" disabled={working === document.id} onClick={() => remove(document)}>删除</button></div></article>)}</section>
    <section className="retrieval-log"><div className="knowledge-list-heading"><div><h2>召回记录</h2><p>最近 30 次前台问题，用于判断检索质量与免费降级状态。</p></div><span>{retrievalLogs.length} 条</span></div>{retrievalLogs.length === 0 ? <p className="empty-copy">暂无召回记录。用户向 Coach 提问后会自动记录。</p> : retrievalLogs.map((log) => { const matches = parseMatches(log.matchesJson); return <article key={log.id}><div className="retrieval-log-head"><strong>{log.query}</strong><span>{log.retrievalMode} · {log.durationMs}ms · {log.resultCount} 条</span></div>{matches.length > 0 && <p>{matches.map((match) => `${match.title}（向量 ${match.vectorScore} / 关键词 ${match.lexicalScore}）`).join("；")}</p>}{log.vectorError && <em>已降级：{log.vectorError}</em>}<small>{new Date(log.createdAt).toLocaleString("zh-CN")}</small></article>; })}</section>
  </main>;
}
