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
  assert.deepEqual(result.delivery, { mode: "model", provider: "deepseek" });
  assert.deepEqual(calls.map((call) => call.auth), ["a-1", "a-2", "Bearer d-1"]);
  assert.match(calls[2].url, /deepseek/);
});

test("reports a safe fallback when all configured model keys fail", async () => {
  const result = await generateCoachReply("schema 应该怎么设计？", 60, {
    OPENAI_API_KEYS: "broken-key",
    AI_PROVIDER_ORDER: "openai",
  }, async () => new Response("unavailable", { status: 503 }));
  assert.equal(result.delivery?.mode, "fallback");
  assert.equal(result.delivery?.reason, "provider_error");
  assert.match(result.answer, /schema/);
});

test("reports when no model channel is configured", async () => {
  const result = await generateCoachReply("什么是工具？", null, {}, async () => {
    throw new Error("fetch should not run");
  });
  assert.deepEqual(result.delivery, { mode: "fallback", reason: "not_configured" });
});

test("reports per-key failures and the eventual success without exposing response bodies", async () => {
  const attempts: { provider: string; outcome: string; error?: string }[] = [];
  let call = 0;
  await generateCoachReply("问题", null, { OPENAI_API_KEYS: "bad,good", AI_PROVIDER_ORDER: "openai" }, async () => {
    call += 1;
    return call === 1 ? new Response("sensitive provider detail", { status: 429 }) : Response.json({ choices: [{ message: { content: reply } }] });
  }, (attempt) => { attempts.push({ provider: attempt.provider, outcome: attempt.outcome, error: attempt.error }); });
  assert.deepEqual(attempts, [
    { provider: "openai", outcome: "failure", error: "HTTP 429" },
    { provider: "openai", outcome: "success", error: undefined },
  ]);
});

test("times out a stalled key and fails over within the total reply budget", async () => {
  const attempts: { outcome: string; error?: string }[] = [];
  let call = 0;
  const result = await generateCoachReply("问题", null, {
    OPENAI_API_KEYS: "stalled,good", AI_PROVIDER_ORDER: "openai",
    COACH_PROVIDER_TIMEOUT_MS: "15", COACH_TOTAL_TIMEOUT_MS: "100",
  }, async (_input, init) => {
    call += 1;
    if (call === 1) return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    return Response.json({ choices: [{ message: { content: reply } }] });
  }, (attempt) => { attempts.push({ outcome: attempt.outcome, error: attempt.error }); });
  assert.equal(result.delivery?.mode, "model");
  assert.deepEqual(attempts, [{ outcome: "failure", error: "TIMEOUT" }, { outcome: "success", error: undefined }]);
});
