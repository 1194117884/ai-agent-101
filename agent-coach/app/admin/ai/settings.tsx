"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type KeyItem = { id?: string; label: string; value?: string; keyHint?: string; enabled: boolean; failureCount?: number; lastUsedAt?: string | null; lastError?: string | null };
type Channel = { id?: string; slug: string; displayName: string; protocol: "anthropic" | "openai-compatible"; baseUrl: string; model: string; priority: number; enabled: boolean; keys: KeyItem[] };

const presets: Record<string, Omit<Channel, "keys" | "priority" | "enabled">> = {
  anthropic: { slug: "anthropic", displayName: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1/messages", model: "claude-sonnet-4-5" },
  openai: { slug: "openai", displayName: "OpenAI", protocol: "openai-compatible", baseUrl: "https://api.openai.com/v1/chat/completions", model: "gpt-4.1-mini" },
  deepseek: { slug: "deepseek", displayName: "DeepSeek", protocol: "openai-compatible", baseUrl: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
  openrouter: { slug: "openrouter", displayName: "OpenRouter", protocol: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1/chat/completions", model: "openai/gpt-4.1-mini" },
};

export function AISettings() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => { fetch("/api/admin/ai-channels").then((r) => r.json()).then((data) => { setChannels(data.channels ?? []); setNotice(data.error ?? ""); }).finally(() => setLoading(false)); }, []);
  const update = (index: number, patch: Partial<Channel>) => setChannels((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const addChannel = (slug: string) => { const preset = presets[slug]; if (!preset || channels.some((channel) => channel.slug === slug)) return; setChannels([...channels, { ...preset, priority: (channels.length + 1) * 10, enabled: true, keys: [] }]); };
  const addKey = (index: number) => update(index, { keys: [...channels[index].keys, { label: `Key ${channels[index].keys.length + 1}`, value: "", enabled: true }] });
  const updateKey = (channelIndex: number, keyIndex: number, patch: Partial<KeyItem>) => update(channelIndex, { keys: channels[channelIndex].keys.map((key, index) => index === keyIndex ? { ...key, ...patch } : key) });
  const removeKey = (channelIndex: number, keyIndex: number) => update(channelIndex, { keys: channels[channelIndex].keys.filter((_, index) => index !== keyIndex) });

  async function save() {
    setNotice("保存中…");
    const response = await fetch("/api/admin/ai-channels", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ channels }) });
    const data = await response.json();
    if (response.ok) { setChannels(data.channels); setNotice("配置已保存并立即生效。Key 明文不会再次显示。"); }
    else setNotice(data.error ?? "保存失败。");
  }

  async function removeChannel(index: number) {
    const channel = channels[index];
    if (!window.confirm(`确认删除 ${channel.displayName} 及其全部 Key？`)) return;
    if (channel.id) {
      const response = await fetch(`/api/admin/ai-channels?id=${encodeURIComponent(channel.id)}`, { method: "DELETE" });
      if (!response.ok) { setNotice("删除失败。"); return; }
    }
    setChannels(channels.filter((_, i) => i !== index));
  }

  if (loading) return <main className="admin-shell"><p>正在读取渠道配置…</p></main>;
  const available = Object.keys(presets).filter((slug) => !channels.some((channel) => channel.slug === slug));
  return <main className="admin-shell">
    <header className="admin-header"><div><Link href="/" className="back-link">← 返回学习页</Link><h1>AI 渠道管理</h1><p>统一管理模型渠道、调用优先级与 Key 池。数字越小，渠道越先被调用。</p></div><button className="primary-button" onClick={save}>保存全部配置</button></header>
    <section className="security-note"><strong>安全约定</strong><span>Key 使用 AES-GCM 加密保存；后台仅显示掩码。替换 Key 时输入新值，留空则保持原值。</span></section>
    <div className="channel-list">{channels.map((channel, index) => <section className="channel-card" key={channel.id ?? channel.slug}>
      <div className="channel-title"><div><span className={`status-dot ${channel.enabled ? "active" : ""}`} /><h2>{channel.displayName}</h2><code>{channel.slug}</code></div><label className="switch-label"><input type="checkbox" checked={channel.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} />启用</label></div>
      <div className="field-grid"><label>显示名称<input value={channel.displayName} onChange={(event) => update(index, { displayName: event.target.value })} /></label><label>优先级<input type="number" min="0" value={channel.priority} onChange={(event) => update(index, { priority: Number(event.target.value) })} /></label><label className="wide">API 地址<input value={channel.baseUrl} onChange={(event) => update(index, { baseUrl: event.target.value })} /></label><label className="wide">模型<input value={channel.model} onChange={(event) => update(index, { model: event.target.value })} /></label></div>
      <div className="keys-heading"><div><h3>Key 池</h3><span>{channel.keys.filter((key) => key.enabled).length} 个启用</span></div><button className="secondary-button" onClick={() => addKey(index)}>添加 Key</button></div>
      <div className="key-list">{channel.keys.length === 0 && <p className="empty-copy">暂无 Key，这个渠道不会接收请求。</p>}{channel.keys.map((key, keyIndex) => <div className="key-row" key={key.id ?? keyIndex}><input aria-label="Key 标签" value={key.label} placeholder="用途标签" onChange={(event) => updateKey(index, keyIndex, { label: event.target.value })} /><input aria-label="API Key" type="password" value={key.value ?? ""} placeholder={key.keyHint ?? "输入 API Key"} onChange={(event) => updateKey(index, keyIndex, { value: event.target.value })} /><label><input type="checkbox" checked={key.enabled} onChange={(event) => updateKey(index, keyIndex, { enabled: event.target.checked })} />启用</label><button className="danger-button" onClick={() => removeKey(index, keyIndex)}>移除</button></div>)}</div>
      <footer className="channel-footer"><span>协议：{channel.protocol === "anthropic" ? "Anthropic Messages" : "OpenAI Compatible"}</span><button className="text-danger" onClick={() => removeChannel(index)}>删除渠道</button></footer>
    </section>)}</div>
    {available.length > 0 && <section className="add-channel"><h2>添加渠道</h2><div>{available.map((slug) => <button className="secondary-button" key={slug} onClick={() => addChannel(slug)}>+ {presets[slug].displayName}</button>)}</div></section>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
