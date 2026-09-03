"use client";
import { useEffect, useState } from "react";
import { LEARNING_STATE_UPDATED } from "./learning-events";

type Settings = { learningGoal: string; weeklyHours: number; timezone: string; currentProject: string | null; learningPace: "relaxed" | "steady" | "intensive" };
const defaults: Settings = { learningGoal: "掌握 Agent Engineering", weeklyHours: 8, timezone: "Asia/Shanghai", currentProject: null, learningPace: "steady" };
const timezones = ["Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo", "America/Los_Angeles", "America/New_York", "Europe/London"];

export function ProfileSettings() {
  const [settings, setSettings] = useState(defaults);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/profile").then((response) => response.ok ? response.json() : Promise.reject()).then(setSettings).catch(() => setStatus("设置加载失败，请稍后重试。")); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setStatus("");
    try {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json() as { profile?: Settings; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "保存失败。");
      setSettings(data.profile); setStatus("已保存，老师会从下一次答疑开始使用这些设置。"); window.dispatchEvent(new Event(LEARNING_STATE_UPDATED));
    } catch (error) { setStatus(error instanceof Error ? error.message : "保存失败。"); }
    finally { setSaving(false); }
  }
  return <details className="profile-settings"><summary>学习设置</summary><form onSubmit={save}><div><h2>学习设置</h2><p>用于调整老师的建议、任务强度和学习报告。</p></div><label>学习目标<input value={settings.learningGoal} maxLength={120} onChange={(event) => setSettings({ ...settings, learningGoal: event.target.value })} /></label><label>当前项目<input value={settings.currentProject ?? ""} maxLength={120} placeholder="例如：客服 Agent" onChange={(event) => setSettings({ ...settings, currentProject: event.target.value })} /></label><div className="profile-setting-row"><label>每周投入<input type="number" min={1} max={80} value={settings.weeklyHours} onChange={(event) => setSettings({ ...settings, weeklyHours: Number(event.target.value) })} /></label><label>学习节奏<select value={settings.learningPace} onChange={(event) => setSettings({ ...settings, learningPace: event.target.value as Settings["learningPace"] })}><option value="relaxed">轻松</option><option value="steady">稳定</option><option value="intensive">密集</option></select></label></div><label>时区<select value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}>{timezones.map((timezone) => <option key={timezone}>{timezone}</option>)}</select></label>{status && <p className="profile-setting-status">{status}</p>}<button className="action-button full-button" disabled={saving}>{saving ? "保存中…" : "保存设置"}</button></form></details>;
}
