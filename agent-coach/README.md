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

`wrangler.jsonc` declares the Worker and D1 binding. Production identity comes
from Cloudflare Access through `Cf-Access-Authenticated-User-Email`.

```bash
npx wrangler login
npx wrangler d1 migrations apply agent-engineering-coach --remote
npm run deploy
```

Configure `AI_KEY_ENCRYPTION_SECRET` as a Worker secret. Optionally set
`AI_ADMIN_EMAILS` to a comma-separated allowlist; otherwise every identity
admitted by the Cloudflare Access policy can manage AI channels.

## AI channels

The management page at `/admin/ai` supports Anthropic, OpenAI, DeepSeek and
OpenRouter. Channel settings and encrypted API keys are stored in D1. Each
channel can contain multiple keys; calls rotate through keys and fail over to
the next configured channel. Environment variables from `.env.example` remain
available as a local fallback.

Never commit real API keys or the encryption secret.
