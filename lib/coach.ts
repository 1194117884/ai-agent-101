export type CoachReply = {
  answer: string;
  followUp: string;
  focus: string;
  source: string;
  delivery?: { mode: "model" | "fallback"; provider?: ProviderName; reason?: "not_configured" | "provider_error" };
  retrievedSources?: { title: string; url: string | null; versionLabel: string | null; trustLevel: string }[];
};
type KnowledgeConflict = { title: string; versions: string[]; preferredVersion?: string | null; preferenceReason?: "authority" | "newer_version" | "uncertain" };
import { curriculumContext } from "./curriculum.ts";

type ProviderName = "anthropic" | "openai" | "deepseek" | "openrouter";
type Environment = Record<string, string | undefined>;
type Provider = { name: ProviderName; keys: string[]; model: string; endpoint: string };
export type CoachAttempt = { provider: ProviderName; key: string; outcome: "success" | "failure"; error?: string };
export type CoachAttemptReporter = (attempt: CoachAttempt) => void | Promise<void>;

const SYSTEM_PROMPT = "你是阿建，一名务实的 Agent Engineering 私教。基于课程与证据答疑；先拆小问题，再给可验收的下一步。只输出 JSON 对象，字段为 answer、followUp、focus、source。";
const DEFAULT_PROVIDER_ORDER: ProviderName[] = ["anthropic", "openai", "deepseek", "openrouter"];
const roundRobinCursor = new Map<ProviderName, number>();

function parseKeys(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).map((key) => key.trim()).filter(Boolean);
    } catch {
      // Fall through to the delimiter format.
    }
  }
  return trimmed.split(/[\s,;]+/).map((key) => key.trim()).filter(Boolean);
}

function providerOrder(value: string | undefined): ProviderName[] {
  if (!value) return DEFAULT_PROVIDER_ORDER;
  const allowed = new Set<ProviderName>(DEFAULT_PROVIDER_ORDER);
  const parsed = value.toLowerCase().split(/[\s,;]+/)
    .filter((name): name is ProviderName => allowed.has(name as ProviderName));
  return parsed.length ? [...new Set(parsed)] : DEFAULT_PROVIDER_ORDER;
}

export function configuredProviders(env: Environment): Provider[] {
  const providers: Record<ProviderName, Provider> = {
    anthropic: { name: "anthropic", keys: parseKeys(env.ANTHROPIC_API_KEYS ?? env.ANTHROPIC_API_KEY), model: env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5", endpoint: env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1/messages" },
    openai: { name: "openai", keys: parseKeys(env.OPENAI_API_KEYS ?? env.OPENAI_API_KEY), model: env.OPENAI_MODEL ?? "gpt-4.1-mini", endpoint: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/chat/completions" },
    deepseek: { name: "deepseek", keys: parseKeys(env.DEEPSEEK_API_KEYS ?? env.DEEPSEEK_API_KEY), model: env.DEEPSEEK_MODEL ?? "deepseek-chat", endpoint: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/chat/completions" },
    openrouter: { name: "openrouter", keys: parseKeys(env.OPENROUTER_API_KEYS ?? env.OPENROUTER_API_KEY), model: env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini", endpoint: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1/chat/completions" },
  };
  return providerOrder(env.AI_PROVIDER_ORDER).map((name) => providers[name]).filter((provider) => provider.keys.length > 0);
}

function rotateKeys(provider: Provider): string[] {
  const cursor = roundRobinCursor.get(provider.name) ?? 0;
  roundRobinCursor.set(provider.name, cursor + 1);
  const start = cursor % provider.keys.length;
  return provider.keys.map((_, index) => provider.keys[(start + index) % provider.keys.length]);
}

function requestFor(provider: Provider, key: string, prompt: string): RequestInit {
  if (provider.name === "anthropic") {
    return { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: provider.model, max_tokens: 700, system: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }] }) };
  }
  return { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model: provider.model, max_tokens: 700, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }] }) };
}

function responseText(provider: Provider, data: unknown): string {
  if (!data || typeof data !== "object") return "";
  if (provider.name === "anthropic") return (data as { content?: { type?: string; text?: string }[] }).content?.find((item) => item.type === "text")?.text ?? "";
  return (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
}

function parseReply(text: string): CoachReply | null {
  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    if (!json.answer || !json.followUp) return null;
    return { answer: String(json.answer), followUp: String(json.followUp), focus: String(json.focus ?? "Agent Engineering"), source: String(json.source ?? "课程知识库") };
  } catch { return null; }
}

async function reportAttempt(reporter: CoachAttemptReporter | undefined, attempt: CoachAttempt) {
  try { await reporter?.(attempt); }
  catch { /* Telemetry must never interrupt provider failover or the learner response. */ }
}

export async function generateCoachReply(message: string, priorScore: number | null, env: Environment = process.env, fetcher: typeof fetch = fetch, reporter?: CoachAttemptReporter, knowledge?: { context: string; sources: CoachReply["retrievedSources"]; conflicts?: KnowledgeConflict[] }): Promise<CoachReply> {
  const course = curriculumContext(message);
  const retrieved = knowledge?.context ? `\n\n已发布知识库片段：\n${knowledge.context}` : "";
  const conflictInstruction = knowledge?.conflicts?.length ? `\n检测到同一资料的多个版本：${knowledge.conflicts.map((item) => `${item.title}（${item.versions.join(" / ")}；${item.preferredVersion ? `系统建议 ${item.preferredVersion}，依据：${item.preferenceReason === "authority" ? "可信等级" : "较新版本"}` : "系统无法可靠判断优先版本"}）`).join("；")}。回答必须明确指出版本差异；可以采用系统建议，但不得隐瞒冲突；无法判断时并列说明，不得混合成单一断言。` : "";
  const prompt = `课程版本：2026.08.21。最近评分：${priorScore ?? "无"}。\n相关课程：\n${course.context}${retrieved}${conflictInstruction}\n\n学生：${message}\n回答必须基于上述课程和知识库片段；不得声称使用未提供的资料。source 填写最主要的课程或资料标题。`;
  const providers = configuredProviders(env);
  for (const provider of providers) {
    for (const key of rotateKeys(provider)) {
      try {
        const response = await fetcher(provider.endpoint, requestFor(provider, key, prompt));
        if (!response.ok) {
          await reportAttempt(reporter, { provider: provider.name, key, outcome: "failure", error: `HTTP ${response.status}` });
          continue;
        }
        const reply = parseReply(responseText(provider, await response.json()));
        if (reply) {
          await reportAttempt(reporter, { provider: provider.name, key, outcome: "success" });
          return { ...reply, retrievedSources: knowledge?.sources ?? [], delivery: { mode: "model", provider: provider.name } };
        }
        await reportAttempt(reporter, { provider: provider.name, key, outcome: "failure", error: "INVALID_RESPONSE" });
      } catch {
        await reportAttempt(reporter, { provider: provider.name, key, outcome: "failure", error: "NETWORK_ERROR" });
        // Try the next key, then the next configured provider.
      }
    }
  }
  return { ...coach(message, priorScore), retrievedSources: knowledge?.sources ?? [], delivery: { mode: "fallback", reason: providers.length ? "provider_error" : "not_configured" } };
}

export function coach(message: string, priorScore: number | null): CoachReply {
  const text = message.toLowerCase(); const weak = priorScore !== null && priorScore < 100;
  if (/不会|不懂|什么是|区别/.test(message)) return { answer: "先不要急着记概念。工具设计的核心不是把 API 包起来，而是让 Agent 在正确时机选到一个动作，并在失败时知道下一步。", followUp: "请用一句话分别说明：工具的 description 回答什么问题？错误返回又回答什么问题？", focus: "Tool Design / Function Calling", source: "基础能力划分 · Tool Design / Function Calling" };
  if (/schema|参数|json/.test(text)) return { answer: "把 schema 当作 Agent 的操作边界：字段少、含义唯一、约束明确。description 负责选择，schema 负责正确调用，错误返回负责恢复。", followUp: "把你当前的 schema 贴出来，并标出一个你认为最容易误用的字段。", focus: "Structured Output / Contracts", source: "基础能力划分 · Structured Output / Contracts" };
  return { answer: weak ? "你上一份工具契约还有未覆盖的验收点。先补齐这些，再扩展到更多工具。" : "你的提交已覆盖基础验收点，可以开始把能力迁移到工具选择评估。", followUp: weak ? "请补写一个失败返回：它必须说明失败原因和可执行的下一步。" : "写 2 个应调用 search 的场景，和 2 个不应调用它的场景。", focus: weak ? "Tool Design / Function Calling" : "Evaluation / Benchmark", source: "修订教学大纲 · 阶段 1 与阶段 4" };
}
