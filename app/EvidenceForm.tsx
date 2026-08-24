"use client";
import { useState } from "react";
import { notifyLearningStateUpdated } from "./learning-events";

export function EvidenceForm() {
  const [content, setContent] = useState(""); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  async function submit() { setSaving(true); setMessage(""); try { const response = await fetch("/api/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) }); const data = await response.json(); setMessage(response.ok ? `评分 ${data.assessment.score}/100：${data.assessment.feedback}\n下一任务：${data.nextTask.title}——${data.nextTask.instruction}` : data.error); if (response.ok) { setContent(""); notifyLearningStateUpdated(); } } catch { setMessage("提交失败，请稍后重试。"); } finally { setSaving(false); } }
  return <div className="form-stack"><textarea className="coach-textarea evidence-input" aria-label="学习证据" value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴笔记、代码片段、链接，或直接回答老师的问题…"/><div className="form-actions"><span>{content.length} 字</span><button className="action-button" type="button" disabled={saving || !content.trim()} onClick={submit}>{saving ? "正在评估…" : "提交给老师"}<span>↗</span></button></div>{message && <p className="result-message">{message}</p>}</div>;
}
