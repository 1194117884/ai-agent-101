# Agent Engineering Coach

个人 Agent Engineering 学习、评估与 AI 教师管理平台，运行于 Cloudflare Workers、D1 和 Access。

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm test
```

## Cloudflare deployment

`wrangler.jsonc` declares the built Worker entry, D1 binding and public Google
OAuth client ID. Production identity uses Google One Tap with a Worker-verified
ID token and signed `HttpOnly` session cookie.

```bash
npx wrangler login
npx wrangler d1 migrations apply agent-engineering-coach --remote
npm run deploy
```

Cloudflare Git Hooks / Workers Builds must also use `npm run deploy` so the
vinext Worker entry is generated before Wrangler uploads it. Do not configure
the hook as `wrangler deploy` by itself. To validate the complete build and
upload bundle without publishing, run `npm run deploy:check`.

Configure `AI_KEY_ENCRYPTION_SECRET` as a Worker secret. A separate
`AUTH_SESSION_SECRET` is recommended; when absent, session signing derives a
purpose-isolated key from the encryption secret. Set `AI_ADMIN_EMAILS` to the
comma-separated Google accounts allowed to manage AI channels.

## AI channels

The management page at `/admin/ai` supports Anthropic, OpenAI, DeepSeek and
OpenRouter. Channel settings and encrypted API keys are stored in D1. Each
channel can contain multiple keys; calls rotate through keys and fail over to
the next configured channel. Environment variables from `.env.example` remain
available as a local fallback.

Never commit real API keys or the encryption secret.
