"use client";
import { useState } from "react";

export function CoachChat() {
  const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState(""); const [asking, setAsking] = useState(false);
  async function ask() { setAsking(true); try { const response = await fetch("/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: question }) }); const data = await response.json(); setAnswer(data.error ?? `${data.answer}\n\n追问：${data.followUp}\n依据：${data.source}`); } catch { setAnswer("老师暂时无法连接，请稍后重试。"); } finally { setAsking(false); } }
  return <section className="panel side-panel coach-chat"><div className="side-title"><span className="coach-avatar">建</span><div><h2>问老师</h2><p>基于你的学习记录回答</p></div><span className="online-dot" /></div><textarea className="coach-textarea compact-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：description 和 schema 的边界是什么？"/><button className="action-button full-button" onClick={ask} disabled={asking || !question.trim()}>{asking ? "思考中…" : "发送问题"}<span>→</span></button>{answer && <p className="answer-box">{answer}</p>}</section>;
}
