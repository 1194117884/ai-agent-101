"use client";
import { useEffect, useState } from "react";

type Dashboard = { task: { title: string; instruction: string; expectedOutput: string; rubric: string[] } | null; error?: string };
export function CurrentTask() {
  const [data, setData] = useState<Dashboard>();
  useEffect(() => { fetch("/api/dashboard").then((response) => response.json()).then(setData).catch(() => setData({ task: null, error: "任务加载失败" })); }, []);
  const task = data?.task;
  return <aside className="task-card"><div className="card-label"><span>今日任务</span><span className="live-dot">{task ? "进行中" : "待分派"}</span></div><h2>{task?.title ?? "为搜索工具写出 Agent 接口契约"}</h2><p>{task?.instruction ?? "提交一份学习证据后，老师会根据结果分派最合适的下一步。"}</p><ol className="criteria-list">{(task?.rubric.length ? task.rubric : ["动作单一且名称明确", "使用边界清楚", "失败后可以恢复"]).slice(0, 3).map((criterion, index) => <li key={criterion}><span>{index + 1}</span><div><strong>{criterion}</strong><small>{index === 0 ? task?.expectedOutput ?? "提交物清晰可验证" : "作为本次任务的验收依据"}</small></div></li>)}</ol>{data?.error && <p className="task-error">{data.error}</p>}</aside>;
}
