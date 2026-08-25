import { readFile, writeFile } from "node:fs/promises";

const configUrl = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));

// The Cloudflare Vite plugin currently emits this removed Wrangler option.
// Removing it preserves the same modern per-environment behavior.
delete config.legacy_env;
config.main = "worker-entry.js";

const workerEntryUrl = new URL("../dist/server/worker-entry.js", import.meta.url);
const workerEntry = `import app from "./index.js";

export default {
  fetch(request, env, ctx) { return app.fetch(request, env, ctx); },
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        const response = await app.fetch(new Request("https://internal.invalid/api/internal/knowledge/queue", {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-queue-secret": env.AI_KEY_ENCRYPTION_SECRET || "", "x-queue-attempt": String(message.attempts || 1) },
          body: JSON.stringify(message.body),
        }), env, ctx);
        if (response.ok) message.ack();
        else message.retry({ delaySeconds: Math.min(300, 15 * message.attempts) });
      } catch {
        message.retry({ delaySeconds: Math.min(300, 15 * message.attempts) });
      }
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(app.fetch(new Request("https://internal.invalid/api/internal/knowledge/cleanup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-queue-secret": env.AI_KEY_ENCRYPTION_SECRET || "" },
      body: JSON.stringify({ cron: controller.cron }),
    }), env, ctx));
  },
};
`;

await Promise.all([writeFile(configUrl, `${JSON.stringify(config)}\n`), writeFile(workerEntryUrl, workerEntry)]);
