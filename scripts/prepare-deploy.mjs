import { readFile, writeFile } from "node:fs/promises";

const configUrl = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));

// The Cloudflare Vite plugin currently emits this removed Wrangler option.
// Removing it preserves the same modern per-environment behavior.
delete config.legacy_env;

await writeFile(configUrl, `${JSON.stringify(config)}\n`);
