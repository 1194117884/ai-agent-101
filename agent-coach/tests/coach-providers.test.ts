import assert from "node:assert/strict";
import test from "node:test";
import { configuredProviders, generateCoachReply } from "../lib/coach.ts";

const reply = JSON.stringify({ answer: "回答", followUp: "追问", focus: "重点", source: "来源" });

test("parses provider order and multiple key formats", () => {
  const providers = configuredProviders({
    AI_PROVIDER_ORDER: "deepseek,openai",
    DEEPSEEK_API_KEYS: "ds-1, ds-2",
    OPENAI_API_KEYS: '["oa-1", "oa-2"]',
  });
  assert.deepEqual(providers.map((provider) => provider.name), ["deepseek", "openai"]);
  assert.deepEqual(providers[0].keys, ["ds-1", "ds-2"]);
  assert.deepEqual(providers[1].keys, ["oa-1", "oa-2"]);
});

test("rotates keys between requests", async () => {
  const usedKeys: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    usedKeys.push(new Headers(init?.headers).get("authorization") ?? "");
    return Response.json({ choices: [{ message: { content: reply } }] });
  };
  const env = { OPENAI_API_KEYS: "first,second", AI_PROVIDER_ORDER: "openai" };
  await generateCoachReply("问题一", null, env, fetcher);
  await generateCoachReply("问题二", null, env, fetcher);
  assert.deepEqual(usedKeys, ["Bearer first", "Bearer second"]);
});

test("fails over across keys and providers", async () => {
  const calls: { url: string; auth: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") ?? new Headers(init?.headers).get("x-api-key") ?? "" });
    if (calls.length < 3) return new Response("unavailable", { status: 429 });
    return Response.json({ choices: [{ message: { content: reply } }] });
  };
  const result = await generateCoachReply("问题", 80, {
    AI_PROVIDER_ORDER: "anthropic,deepseek",
    ANTHROPIC_API_KEYS: "a-1,a-2",
    DEEPSEEK_API_KEYS: "d-1",
  }, fetcher);
  assert.equal(result.answer, "回答");
  assert.deepEqual(calls.map((call) => call.auth), ["a-1", "a-2", "Bearer d-1"]);
  assert.match(calls[2].url, /deepseek/);
});
