"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type DocumentItem = { id: string; title: string; url: string; sourceType: "manual" | "web" | "note"; versionLabel?: string | null; trustLevel: "primary" | "trusted" | "reference"; status: "draft" | "approved" | "archived"; topicIdsJson: string; summary?: string | null; content?: string | null; ingestionStatus: string; chunkCount: number; lastIndexedAt?: string | null; ingestionError?: string | null; updatedAt: string };
type KnowledgeStats = { documentCount: number; chunkCount: number; vectorDimensions: number; freeVectorCapacity: number; capacityPercent: number; provider: string };
type RetrievalLog = { id: string; query: string; retrievalMode: string; resultCount: number; matchesJson: string; durationMs: number; vectorError?: string | null; createdAt: string };
type EvalCase = { id: string; question: string; expectedDocumentId?: string | null; expectedTermsJson: string; lastRunAt?: string | null; lastMode?: string | null; lastPassed?: boolean | null; lastMatchesJson?: string | null; lastError?: string | null };
type FormState = { id?: string; title: string; url: string; sourceType: "manual" | "web" | "note"; versionLabel: string; trustLevel: "primary" | "trusted" | "reference"; status: "draft" | "approved" | "archived"; topics: string; summary: string; content: string };
const emptyForm: FormState = { title: "", url: "", sourceType: "manual", versionLabel: "", trustLevel: "trusted", status: "draft", topics: "", summary: "", content: "" };
function parseMatches(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as { title: string; vectorScore: number; lexicalScore: number }[] : []; } catch { return []; } }
function parseTerms(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((term): term is string => typeof term === "string") : []; } catch { return []; } }

export function KnowledgeManager() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [retrievalLogs, setRetrievalLogs] = useState<RetrievalLog[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importUrls, setImportUrls] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [indexFilter, setIndexFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [evalCases, setEvalCases] = useState<EvalCase[]>([]);
  const [evalQuestion, setEvalQuestion] = useState("");
  const [evalDocumentId, setEvalDocumentId] = useState("");
  const [evalTerms, setEvalTerms] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const filteredDocuments = useMemo(() => { const term = search.trim().toLowerCase(); return documents.filter((document) => (!term || `${document.title} ${document.summary ?? ""} ${document.content ?? ""}`.toLowerCase().includes(term)) && (statusFilter === "all" || document.status === statusFilter) && (indexFilter === "all" || document.ingestionStatus === indexFilter)); }, [documents, search, statusFilter, indexFilter]);
  const load = useCallback(async () => { const response = await fetch("/api/admin/knowledge"); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "加载失败"); setDocuments(data.documents); setStats(data.stats); setRetrievalLogs(data.retrievalLogs ?? []); }, []);
  const loadEvals = useCallback(async () => { const response = await fetch("/api/admin/knowledge/evals"); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "评测集加载失败"); setEvalCases(data.cases ?? []); }, []);
  useEffect(() => { Promise.all([fetch("/api/admin/knowledge").then((response) => response.json().then((data) => ({ response, data }))), fetch("/api/admin/knowledge/evals").then((response) => response.json().then((data) => ({ response, data })))]).then(([knowledge, evals]) => { if (!knowledge.response.ok) throw new Error(knowledge.data.error ?? "加载失败"); setDocuments(knowledge.data.documents); setStats(knowledge.data.stats); setRetrievalLogs(knowledge.data.retrievalLogs ?? []); if (evals.response.ok) setEvalCases(evals.data.cases ?? []); }).catch((error) => setNotice(error.message)).finally(() => setLoading(false)); }, []);
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
  async function batchImport() {
    const urls = importUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (importFiles.length + urls.length === 0) return setNotice("请选择 Markdown/TXT 文件或填写网页地址。");
    if (importFiles.length + urls.length > 20) return setNotice("每批最多导入 20 份资料。");
    setWorking("import"); setNotice("正在批量导入资料…");
    try {
      const files = await Promise.all(importFiles.map(async (file) => ({ filename: file.name, content: await file.text() })));
      const response = await fetch("/api/admin/knowledge/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files, urls }) });
      const data = await response.json();
      if (!response.ok && !data.results) throw new Error(data.error ?? "批量导入失败");
      setImportFiles([]); setImportUrls(""); await load();
      const failures = (data.results ?? []).filter((item: { ok: boolean }) => !item.ok).map((item: { source: string; error?: string }) => `${item.source}: ${item.error}`).slice(0, 3);
      setNotice(`导入完成：成功 ${data.imported ?? 0}，失败 ${data.failed ?? 0}${failures.length ? `。${failures.join("；")}` : ""}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "批量导入失败"); }
    finally { setWorking(""); }
  }
  async function indexDocument(document: DocumentItem) {
    setWorking(document.id); setNotice("正在切片并生成向量…");
    try { const response = await fetch(`/api/admin/knowledge/${document.id}/index`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "索引失败"); await load(); setNotice(data.mode === "lexical" ? `已保存 ${data.chunkCount} 个切片；向量服务暂不可用，已自动使用关键词召回。` : `向量索引完成：${data.chunkCount} 个切片。`); }
    catch (error) { await load(); setNotice(error instanceof Error ? error.message : "索引失败"); }
    finally { setWorking(""); }
  }
  async function bulkAction(action: "approve" | "archive" | "index") {
    const ids = [...selected];
    if (!ids.length) return setNotice("请先选择资料。");
    if (action === "index" && ids.length > 10) return setNotice("为保护免费额度，每批最多建立 10 份索引。");
    setWorking(`bulk-${action}`); setNotice("正在执行批量操作…");
    try {
      const response = await fetch("/api/admin/knowledge/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ids }) });
      const data = await response.json(); if (!response.ok && !data.results) throw new Error(data.error ?? "批量操作失败");
      setSelected(new Set()); await load();
      setNotice(action === "index" ? `批量索引完成：成功 ${data.completed ?? 0}，失败 ${data.failed ?? 0}。` : `已更新 ${data.changed ?? 0} 份资料。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "批量操作失败"); }
    finally { setWorking(""); }
  }
  function toggleSelected(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleVisible(checked: boolean) { setSelected((current) => { const next = new Set(current); for (const document of filteredDocuments) { if (checked) next.add(document.id); else next.delete(document.id); } return next; }); }
  async function saveEvalCase() {
    setWorking("eval-save");
    try { const response = await fetch("/api/admin/knowledge/evals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: evalQuestion, expectedDocumentId: evalDocumentId || null, expectedTerms: evalTerms.split(/[,，;\n]+/).map((term) => term.trim()).filter(Boolean) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "评测保存失败"); setEvalQuestion(""); setEvalDocumentId(""); setEvalTerms(""); await loadEvals(); setNotice("评测问题已保存。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "评测保存失败"); } finally { setWorking(""); }
  }
  async function runEvals() {
    setWorking("eval-run"); setNotice("正在运行知识库召回评测…");
    try { const response = await fetch("/api/admin/knowledge/evals", { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "评测运行失败"); await loadEvals(); setNotice(`评测完成：通过 ${data.passed}，失败 ${data.failed}。`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "评测运行失败"); } finally { setWorking(""); }
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
    <section className="knowledge-import channel-card"><div className="knowledge-form-title"><div><h2>批量导入</h2><p>支持 Markdown/TXT 文件和公开网页；导入后默认为草稿，需要审核再建立索引。</p></div></div><div className="import-grid"><label>本地文件（最多 20 份）<input key={importFiles.length ? "selected" : "empty"} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" multiple onChange={(event) => setImportFiles(Array.from(event.target.files ?? []))} /><span>{importFiles.length ? `已选择 ${importFiles.length} 份：${importFiles.map((file) => file.name).join("、")}` : "单份正文上限 200,000 字符"}</span></label><label>网页 URL（每行一个）<textarea value={importUrls} onChange={(event) => setImportUrls(event.target.value)} placeholder={"https://example.com/guide\nhttps://example.com/reference"} /></label></div><div className="form-actions"><span>整批最多 20 份；网页仅允许公开 HTTP(S) 地址</span><button className="primary-button" disabled={working === "import" || (!importFiles.length && !importUrls.trim())} onClick={batchImport}>{working === "import" ? "导入中…" : "开始导入"}</button></div></section>
    <section className="knowledge-form channel-card"><div className="knowledge-form-title"><div><h2>{form.id ? "编辑资料" : "录入资料"}</h2><p>只有“已审核”资料可以进入召回索引。</p></div>{form.id && <button className="secondary-button" onClick={() => setForm(emptyForm)}>取消编辑</button>}</div>
      <div className="field-grid"><label>标题<input value={form.title} onChange={(event) => update("title", event.target.value)} /></label><label>版本<input value={form.versionLabel} placeholder="例如 2026-08" onChange={(event) => update("versionLabel", event.target.value)} /></label><label className="wide">来源 URL（可选）<input value={form.url} placeholder="https://…" onChange={(event) => update("url", event.target.value)} /></label><label>资料类型<select value={form.sourceType} onChange={(event) => update("sourceType", event.target.value as FormState["sourceType"])}><option value="manual">手工资料</option><option value="web">网页</option><option value="note">笔记</option></select></label><label>可信级别<select value={form.trustLevel} onChange={(event) => update("trustLevel", event.target.value as FormState["trustLevel"])}><option value="primary">官方/一手</option><option value="trusted">可信资料</option><option value="reference">一般参考</option></select></label><label>审核状态<select value={form.status} onChange={(event) => update("status", event.target.value as FormState["status"])}><option value="draft">草稿</option><option value="approved">已审核</option><option value="archived">已归档</option></select></label><label>能力标签<input value={form.topics} placeholder="tools, eval, memory" onChange={(event) => update("topics", event.target.value)} /></label><label className="wide">摘要<input value={form.summary} onChange={(event) => update("summary", event.target.value)} /></label></div>
      <label className="knowledge-content-label">资料正文<textarea value={form.content} onChange={(event) => update("content", event.target.value)} placeholder="粘贴 Markdown、课程正文或整理后的网页内容…" /></label><div className="form-actions"><span>{form.content.length.toLocaleString()} / 200,000 字符</span><button className="primary-button" disabled={working === "save" || !form.title.trim() || form.content.trim().length < 20} onClick={save}>{working === "save" ? "保存中…" : "保存资料"}</button></div></section>
    {notice && <div className="toast knowledge-toast" role="status">{notice}</div>}
    <section className="knowledge-list">
      <div className="knowledge-list-heading"><h2>资料列表</h2><span>显示 {filteredDocuments.length} / {documents.length} 份</span></div>
      <div className="knowledge-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、摘要或正文…" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">全部审核状态</option><option value="draft">草稿</option><option value="approved">已审核</option><option value="archived">已归档</option></select><select value={indexFilter} onChange={(event) => setIndexFilter(event.target.value)}><option value="all">全部索引状态</option><option value="pending">待索引</option><option value="indexed">已向量化</option><option value="lexical">关键词召回</option><option value="failed">索引失败</option></select></div>
      <div className="bulk-actions"><label><input type="checkbox" checked={filteredDocuments.length > 0 && filteredDocuments.every((document) => selected.has(document.id))} onChange={(event) => toggleVisible(event.target.checked)} />选择当前结果</label><span>已选择 {selected.size} 份</span><button className="secondary-button" disabled={!selected.size || !!working} onClick={() => bulkAction("approve")}>批量审核</button><button className="secondary-button" disabled={!selected.size || !!working} onClick={() => bulkAction("archive")}>批量归档</button><button className="primary-button" disabled={!selected.size || selected.size > 10 || !!working} onClick={() => bulkAction("index")}>批量索引/重试</button></div>
      {loading ? <p className="empty-copy">正在读取…</p> : documents.length === 0 ? <p className="empty-copy">还没有资料，请先录入第一份。</p> : filteredDocuments.length === 0 ? <p className="empty-copy">没有符合筛选条件的资料。</p> : filteredDocuments.map((document) => <article className="knowledge-item" key={document.id}><input className="knowledge-select" type="checkbox" checked={selected.has(document.id)} onChange={() => toggleSelected(document.id)} aria-label={`选择 ${document.title}`} /><div className="knowledge-item-main"><div className="knowledge-badges"><span>{document.status === "approved" ? "已审核" : document.status === "archived" ? "已归档" : "草稿"}</span><span className={document.ingestionStatus === "failed" ? "failed" : ""}>{document.ingestionStatus === "lexical" ? "关键词召回" : document.ingestionStatus}</span><span>{document.chunkCount} chunks</span></div><h3>{document.title}</h3><p>{document.summary || document.content?.slice(0, 150)}</p><small>{document.versionLabel || "无版本"} · {document.trustLevel} · 更新于 {new Date(document.updatedAt).toLocaleString("zh-CN")}</small>{document.ingestionError && <em>{document.ingestionError}</em>}</div><div className="knowledge-actions"><button className="secondary-button" onClick={() => edit(document)}>编辑</button><button className="primary-button" disabled={document.status !== "approved" || working === document.id} onClick={() => indexDocument(document)}>{working === document.id ? "处理中…" : document.ingestionStatus === "indexed" ? "重建索引" : "建立索引"}</button><button className="danger-button" disabled={working === document.id} onClick={() => remove(document)}>删除</button></div></article>)}
    </section>
    <section className="knowledge-evals channel-card"><div className="knowledge-list-heading"><div><h2>RAG 召回评测集</h2><p>固定问题、期望资料和关键词，用于防止切片或模型调整造成质量退化。</p></div><button className="primary-button" disabled={!evalCases.length || working === "eval-run"} onClick={runEvals}>{working === "eval-run" ? "运行中…" : "运行全部评测"}</button></div><div className="eval-form"><label>测试问题<input value={evalQuestion} onChange={(event) => setEvalQuestion(event.target.value)} placeholder="例如：工具 schema 负责解决什么问题？" /></label><label>期望命中资料<select value={evalDocumentId} onChange={(event) => setEvalDocumentId(event.target.value)}><option value="">不限定资料</option>{documents.filter((document) => document.status === "approved").map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label><label>期望关键词<input value={evalTerms} onChange={(event) => setEvalTerms(event.target.value)} placeholder="schema, 参数, 类型" /></label><button className="secondary-button" disabled={working === "eval-save" || evalQuestion.trim().length < 4 || (!evalDocumentId && !evalTerms.trim())} onClick={saveEvalCase}>添加评测</button></div>{evalCases.length === 0 ? <p className="empty-copy">暂无评测问题。资料建立索引后，添加第一条真实用户问题。</p> : <div className="eval-list">{evalCases.map((item) => { const expected = documents.find((document) => document.id === item.expectedDocumentId)?.title; const matches = parseMatches(item.lastMatchesJson ?? "[]"); return <article key={item.id}><div><strong>{item.question}</strong><p>期望：{expected || "任意资料"} · {parseTerms(item.expectedTermsJson).join("、") || "无关键词"}</p>{item.lastRunAt && <small>{item.lastPassed ? "通过" : "失败"} · {item.lastMode || "unknown"} · 命中 {matches.map((match) => match.title).join("、") || "无"}</small>}{item.lastError && <em>{item.lastError}</em>}</div><span className={item.lastPassed ? "eval-pass" : item.lastRunAt ? "eval-fail" : ""}>{item.lastRunAt ? item.lastPassed ? "PASS" : "FAIL" : "未运行"}</span></article>; })}</div>}</section>
    <section className="retrieval-log"><div className="knowledge-list-heading"><div><h2>召回记录</h2><p>最近 30 次前台问题，用于判断检索质量与免费降级状态。</p></div><span>{retrievalLogs.length} 条</span></div>{retrievalLogs.length === 0 ? <p className="empty-copy">暂无召回记录。用户向 Coach 提问后会自动记录。</p> : retrievalLogs.map((log) => { const matches = parseMatches(log.matchesJson); return <article key={log.id}><div className="retrieval-log-head"><strong>{log.query}</strong><span>{log.retrievalMode} · {log.durationMs}ms · {log.resultCount} 条</span></div>{matches.length > 0 && <p>{matches.map((match) => `${match.title}（向量 ${match.vectorScore} / 关键词 ${match.lexicalScore}）`).join("；")}</p>}{log.vectorError && <em>已降级：{log.vectorError}</em>}<small>{new Date(log.createdAt).toLocaleString("zh-CN")}</small></article>; })}</section>
  </main>;
}
