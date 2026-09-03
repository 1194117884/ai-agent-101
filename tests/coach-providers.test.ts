import assert from "node:assert/strict";
import test from "node:test";
import { configuredProviders, generateCoachReply } from "../lib/coach.ts";
import type { CoachToolRuntime } from "../lib/coach-tools.ts";

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
  const calls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") ?? new Headers(init?.headers).get("x-api-key") ?? "", body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    if (calls.length < 3) return new Response("unavailable", { status: 429 });
    return Response.json({ choices: [{ message: { content: reply } }] });
  };
  const result = await generateCoachReply("问题", 80, {
    AI_PROVIDER_ORDER: "anthropic,deepseek",
    ANTHROPIC_API_KEYS: "a-1,a-2",
    DEEPSEEK_API_KEYS: "d-1",
  }, fetcher);
  assert.equal(result.answer, "回答");
  assert.equal(result.feedback, "回答");
  assert.equal(result.question, "追问");
  assert.deepEqual(result.delivery, { mode: "model", provider: "deepseek" });
  assert.deepEqual(calls.map((call) => call.auth), ["a-1", "a-2", "Bearer d-1"]);
  assert.match(calls[2].url, /deepseek/);
  assert.deepEqual(calls[2].body.thinking, { type: "disabled" });
  assert.deepEqual(calls[2].body.response_format, { type: "json_object" });
});

test("parses the structured teacher diagnosis contract", async () => {
  const structured = JSON.stringify({ diagnosis: "前置概念不清", feedback: "先区分选择与调用", nextTask: "写两个边界案例", question: "什么情况下不应调用？", focus: "工具设计", source: "课程" });
  const result = await generateCoachReply("帮我诊断", null, { OPENAI_API_KEYS: "key", AI_PROVIDER_ORDER: "openai" }, async () => Response.json({ choices: [{ message: { content: structured } }] }));
  assert.equal(result.diagnosis, "前置概念不清");
  assert.equal(result.nextTask, "写两个边界案例");
  assert.equal(result.answer, result.feedback);
  assert.equal(result.followUp, result.question);
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

test("includes bounded task, competency, evidence and conversation context in the model prompt", async () => {
  let prompt = "";
  await generateCoachReply("我下一步怎么办？", 65, { OPENAI_API_KEYS: "key", AI_PROVIDER_ORDER: "openai" }, async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    prompt = body.messages.find((item) => item.role === "user")?.content ?? "";
    return Response.json({ choices: [{ message: { content: reply } }] });
  }, undefined, undefined, {
    goal: "独立完成 Agent 项目",
    currentTask: { title: "工具契约", competencyName: "工具设计", instruction: "写出契约", expectedOutput: "JSON schema", rubric: ["错误可恢复"] },
    competencies: [{ name: "工具设计", mastery: 65, confidence: 50, rationale: "失败返回不足" }],
    recentEvidence: [{ competencyName: "工具设计", type: "quiz", score: 65, feedback: "缺少下一步", content: "只返回 error" }],
    recentConversation: [{ role: "learner", content: "我不懂错误设计" }],
    unresolvedFeedback: [{ reason: "步骤不可执行", answerSummary: "直接运行一个不存在的命令" }],
  });
  assert.match(prompt, /当前任务：工具契约/);
  assert.match(prompt, /掌握度 65%/);
  assert.match(prompt, /缺少下一步/);
  assert.match(prompt, /学生：我不懂错误设计/);
  assert.match(prompt, /学生当前问题：我下一步怎么办/);
  assert.match(prompt, /最近未解决反馈/);
  assert.match(prompt, /步骤不可执行/);
  assert.match(prompt, /不要重复同一种解释或步骤/);
});

test("returns OpenAI-compatible tool results with the original tool call id", async () => {
  const bodies: Record<string, unknown>[] = [];
  const tools: CoachToolRuntime = {
    definitions: [{ name: "get_curriculum_unit", description: "读取课程", inputSchema: { type: "object", properties: { day: { type: "integer" } }, required: ["day"], additionalProperties: false } }],
    execute: async (name, input) => ({ name, day: input.day, title: "工具契约" }),
  };
  const result = await generateCoachReply("Day 3 学什么？", null, { OPENAI_API_KEYS: "key", AI_PROVIDER_ORDER: "openai" }, async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (bodies.length === 1) return Response.json({ choices: [{ message: { content: null, tool_calls: [{ id: "call_exact_123", type: "function", function: { name: "get_curriculum_unit", arguments: "{\"day\":3}" } }] } }] });
    return Response.json({ choices: [{ message: { content: reply } }] });
  }, undefined, undefined, undefined, tools);
  assert.equal(result.delivery?.mode, "model");
  assert.equal(result.runtime?.termination, "model");
  assert.deepEqual(result.runtime?.attempts.map(({ provider, outcome }) => ({ provider, outcome })), [{ provider: "openai", outcome: "success" }]);
  assert.deepEqual(result.runtime?.toolCalls.map(({ id, name, outcome }) => ({ id, name, outcome })), [{ id: "call_exact_123", name: "get_curriculum_unit", outcome: "success" }]);
  const firstTools = bodies[0].tools as { function: { name: string } }[];
  const secondMessages = bodies[1].messages as { role: string; tool_call_id?: string; content?: string | null; tool_calls?: { id: string }[] }[];
  assert.equal(firstTools[0].function.name, "get_curriculum_unit");
  assert.deepEqual(secondMessages.at(-1), { role: "tool", tool_call_id: "call_exact_123", content: JSON.stringify({ name: "get_curriculum_unit", day: 3, title: "工具契约" }) });
  assert.equal(secondMessages.at(-2)?.tool_calls?.[0].id, "call_exact_123");
});

test("returns Anthropic tool results with the original tool_use id", async () => {
  const bodies: Record<string, unknown>[] = [];
  const tools: CoachToolRuntime = {
    definitions: [{ name: "get_learning_context", description: "读取学习状态", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } }],
    execute: async () => ({ mastery: 65 }),
  };
  await generateCoachReply("我哪里薄弱？", null, { ANTHROPIC_API_KEYS: "key", AI_PROVIDER_ORDER: "anthropic" }, async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (bodies.length === 1) return Response.json({ content: [{ type: "tool_use", id: "toolu_exact_456", name: "get_learning_context", input: {} }] });
    return Response.json({ content: [{ type: "text", text: reply }] });
  }, undefined, undefined, undefined, tools);
  const firstTools = bodies[0].tools as { name: string }[];
  const secondMessages = bodies[1].messages as { content: { type: string; id?: string; tool_use_id?: string; content?: string }[] }[];
  assert.equal(firstTools[0].name, "get_learning_context");
  assert.deepEqual(secondMessages.at(-1)?.content[0], { type: "tool_result", tool_use_id: "toolu_exact_456", content: JSON.stringify({ mastery: 65 }) });
  assert.equal(secondMessages.at(-2)?.content[0].id, "toolu_exact_456");
});

test("supports bounded sequential tool rounds while retaining prior ids", async () => {
  const bodies: Record<string, unknown>[] = [];
  const tools: CoachToolRuntime = {
    definitions: [{ name: "lookup", description: "查询", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } }],
    execute: async (_name, input) => input,
  };
  await generateCoachReply("连续查询", null, { OPENAI_API_KEYS: "key", AI_PROVIDER_ORDER: "openai" }, async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (bodies.length < 3) return Response.json({ choices: [{ message: { content: null, tool_calls: [{ id: `call_${bodies.length}`, type: "function", function: { name: "lookup", arguments: JSON.stringify({ round: bodies.length }) } }] } }] });
    return Response.json({ choices: [{ message: { content: reply } }] });
  }, undefined, undefined, undefined, tools);
  const finalMessages = bodies[2].messages as { role: string; tool_call_id?: string }[];
  assert.deepEqual(finalMessages.filter((message) => message.role === "tool").map((message) => message.tool_call_id), ["call_1", "call_2"]);
});
