"use client";
import { useEffect, useRef, useState } from "react";

type GoogleCredentialResponse = { credential: string };
type GoogleIdentity = { initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void; renderButton(element: HTMLElement, options: Record<string, string | number>): void; prompt(): void };
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }

export function Login({ returnTo = "/" }: { returnTo?: string }) {
  const button = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const start = (clientId: string) => {
      if (!window.google || !button.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        auto_select: false,
        cancel_on_tap_outside: false,
        callback: async ({ credential }) => {
          setError("");
          try {
            const response = await fetch("/api/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) });
            const data = await response.json();
            if (!response.ok) { setError(data.error ?? "登录失败，请重试。"); return; }
            window.location.assign(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/");
          } catch { setError("登录服务暂时无法连接，请重试。"); }
        },
      });
      button.current.replaceChildren();
      window.google.accounts.id.renderButton(button.current, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 280 });
      window.google.accounts.id.prompt();
    };
    fetch("/api/auth/config").then((response) => response.json()).then(({ clientId }: { clientId?: string }) => {
      if (!clientId) { setError("Google Client ID 尚未配置。"); return; }
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) { if (window.google) start(clientId); else existing.addEventListener("load", () => start(clientId), { once: true }); return; }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => start(clientId);
      script.onerror = () => setError("Google 登录组件加载失败。");
      document.head.appendChild(script);
    }).catch(() => setError("Google 登录配置加载失败。"));
  }, [returnTo]);

  return <main className="login-shell"><section className="login-card"><span className="brand-mark login-mark">A</span><p className="eyebrow">Agent Engineering Coach</p><h1>继续你的 Agent 训练</h1><p>使用 Google 账号登录。我们只读取经过验证的账号标识，不访问你的 Google 数据。</p><div className="google-button" ref={button} />{error && <p className="login-error" role="alert">{error}</p>}<small>登录后会保持 7 天会话，你可以随时退出。</small></section></main>;
}
