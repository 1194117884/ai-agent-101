"use client";
import { useEffect, useState } from "react";

type QuizData = { id?: string; question?: string; error?: string };
export function Quiz() {
  const [quiz, setQuiz] = useState<QuizData>(); const [answer, setAnswer] = useState(""); const [result, setResult] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/quiz").then((response) => response.json()).then(setQuiz).catch(() => setQuiz({ error: "小测加载失败。" })); }, []);
  async function submit() { setSaving(true); try { const response = await fetch("/api/quiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: quiz?.id, answer }) }); const data = await response.json(); setResult(data.error ?? `得分 ${data.score}/100：${data.feedback}`); } catch { setResult("评分服务暂时不可用，请稍后重试。当前答案和已有学习记录不会丢失。"); } finally { setSaving(false); } }
  if (!quiz) return <div className="skeleton-line">正在准备小测…</div>;
  if (quiz.error) return <p className="empty-state">{quiz.error}</p>;
  return <div className="quiz-body"><p className="quiz-question">{quiz.question}</p><textarea className="coach-textarea quiz-input" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="用自己的话回答，不必追求标准答案…"/><div className="form-actions"><span>建议 80–200 字</span><button className="action-button" onClick={submit} disabled={saving || !answer.trim()}>{saving ? "评分中…" : "提交答案"}<span>↗</span></button></div>{result && <p className="result-message">{result}</p>}</div>;
}
