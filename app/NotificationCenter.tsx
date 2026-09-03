"use client";
import { useEffect, useMemo, useState } from "react";
import { LEARNING_STATE_UPDATED } from "./learning-events";

type Notification = { id: string; type: "review" | "stalled" | "weekly_plan"; priority: "high" | "normal"; title: string; message: string; actionLabel: string; actionHref: string };

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => { queueMicrotask(() => { try { setDismissed(JSON.parse(localStorage.getItem("learning-notifications-dismissed") || "[]")); } catch { /* Ignore invalid browser storage. */ } }); }, []);
  useEffect(() => { const load = () => fetch("/api/dashboard").then((response) => response.json()).then((data) => setNotifications(data.notifications ?? [])).catch(() => setNotifications([])); load(); window.addEventListener(LEARNING_STATE_UPDATED, load); return () => window.removeEventListener(LEARNING_STATE_UPDATED, load); }, []);
  const visible = useMemo(() => notifications.filter((item) => !dismissed.includes(item.id)), [notifications, dismissed]);
  function dismiss(id: string) { const next = [...dismissed, id].slice(-50); setDismissed(next); localStorage.setItem("learning-notifications-dismissed", JSON.stringify(next)); }
  function follow(item: Notification) { if (item.type === "review") { const tools = document.querySelector<HTMLDetailsElement>("#advanced-tools"); if (tools) tools.open = true; } }
  return <details className="notification-center"><summary aria-label={`${visible.length} 条学习提醒`}><span>提醒</span>{visible.length > 0 && <b>{visible.length}</b>}</summary><div className="notification-popover"><header><div><h2>学习提醒</h2><p>根据任务与学习证据实时生成</p></div><span>{visible.length} 条</span></header>{visible.length === 0 ? <p className="notification-empty">目前没有新的提醒。</p> : <div className="notification-list">{visible.map((item) => <article key={item.id} className={item.priority}><div><span>{item.type === "review" ? "复习" : item.type === "stalled" ? "停滞" : "本周"}</span><strong>{item.title}</strong><p>{item.message}</p><a href={item.actionHref} onClick={() => follow(item)}>{item.actionLabel} →</a></div><button aria-label={`忽略${item.title}`} onClick={() => dismiss(item.id)}>×</button></article>)}</div>}</div></details>;
}
