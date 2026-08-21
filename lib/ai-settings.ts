import { env } from "cloudflare:workers";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { aiApiKeys, aiChannels } from "../db/schema";

export type ChannelInput = {
  id?: string;
  slug: string;
  displayName: string;
  protocol: "anthropic" | "openai-compatible";
  baseUrl: string;
  model: string;
  priority: number;
  enabled: boolean;
  keys: { id?: string; label: string; value?: string; enabled: boolean }[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encryptionSecret() {
  const secret = env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 24) throw new Error("请先配置至少 24 个字符的 AI_KEY_ENCRYPTION_SECRET。");
  return secret;
}

async function cryptoKey() {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(encryptionSecret()));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), encoder.encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string) {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("Invalid encrypted API key");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await cryptoKey(), fromBase64(payload));
  return decoder.decode(decrypted);
}

function hint(value: string) {
  return value.length <= 8 ? "••••••••" : `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

export async function listAIChannels() {
  const db = getDb();
  const channels = await db.select().from(aiChannels).orderBy(asc(aiChannels.priority));
  const keys = await db.select({ id: aiApiKeys.id, channelId: aiApiKeys.channelId, label: aiApiKeys.label, keyHint: aiApiKeys.keyHint, enabled: aiApiKeys.enabled, failureCount: aiApiKeys.failureCount, lastUsedAt: aiApiKeys.lastUsedAt, lastError: aiApiKeys.lastError }).from(aiApiKeys);
  return channels.map((channel) => ({ ...channel, keys: keys.filter((key) => key.channelId === channel.id) }));
}

export async function saveAIChannels(inputs: ChannelInput[]) {
  const supported = new Set(["anthropic", "openai", "deepseek", "openrouter"]);
  if (inputs.length > supported.size) throw new Error("渠道数量超出支持范围。");
  if (new Set(inputs.map((input) => input.slug)).size !== inputs.length) throw new Error("渠道不能重复。");
  for (const input of inputs) {
    if (!supported.has(input.slug)) throw new Error(`暂不支持渠道 ${input.slug}。`);
    if ((input.slug === "anthropic") !== (input.protocol === "anthropic")) throw new Error("渠道协议与渠道类型不匹配。");
    if (!input.displayName.trim() || !input.model.trim()) throw new Error("显示名称和模型不能为空。");
    if (input.keys.length > 20) throw new Error("每个渠道最多配置 20 个 Key。");
    const url = new URL(input.baseUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("API 地址必须是无账号信息的 HTTPS 地址。");
  }
  const db = getDb();
  for (const input of inputs) {
    const id = input.id ?? crypto.randomUUID();
    const channel = { id, slug: input.slug.trim().toLowerCase(), displayName: input.displayName.trim(), protocol: input.protocol, baseUrl: input.baseUrl.trim(), model: input.model.trim(), priority: Math.max(0, Math.round(input.priority)), enabled: input.enabled, updatedAt: new Date().toISOString() };
    await db.insert(aiChannels).values(channel).onConflictDoUpdate({ target: aiChannels.id, set: channel });
    const existing = await db.select({ id: aiApiKeys.id }).from(aiApiKeys).where(eq(aiApiKeys.channelId, id));
    const retained = new Set(input.keys.flatMap((key) => key.id ? [key.id] : []));
    for (const oldKey of existing) if (!retained.has(oldKey.id)) await db.delete(aiApiKeys).where(eq(aiApiKeys.id, oldKey.id));
    for (const key of input.keys) {
      if (key.id) {
        const update: { label: string; enabled: boolean; updatedAt: string; encryptedKey?: string; keyHint?: string } = { label: key.label.trim(), enabled: key.enabled, updatedAt: new Date().toISOString() };
        if (key.value?.trim()) { update.encryptedKey = await encrypt(key.value.trim()); update.keyHint = hint(key.value.trim()); }
        await db.update(aiApiKeys).set(update).where(eq(aiApiKeys.id, key.id));
      } else if (key.value?.trim()) {
        await db.insert(aiApiKeys).values({ id: crypto.randomUUID(), channelId: id, label: key.label.trim() || "默认 Key", encryptedKey: await encrypt(key.value.trim()), keyHint: hint(key.value.trim()), enabled: key.enabled });
      }
    }
  }
  return listAIChannels();
}

export async function deleteAIChannel(id: string) {
  await getDb().delete(aiChannels).where(eq(aiChannels.id, id));
}

export async function databaseAIEnvironment(): Promise<Record<string, string>> {
  const db = getDb();
  const channels = await db.select().from(aiChannels).where(eq(aiChannels.enabled, true)).orderBy(asc(aiChannels.priority));
  if (!channels.length) return {};
  const output: Record<string, string> = { AI_PROVIDER_ORDER: channels.map((channel) => channel.slug).join(",") };
  for (const channel of channels) {
    const rows = await db.select().from(aiApiKeys).where(eq(aiApiKeys.channelId, channel.id));
    const prefix = channel.slug.toUpperCase();
    const keys = await Promise.all(rows.filter((row) => row.enabled).map((row) => decrypt(row.encryptedKey)));
    output[`${prefix}_API_KEYS`] = JSON.stringify(keys);
    if (!keys.length) continue;
    output[`${prefix}_MODEL`] = channel.model;
    output[`${prefix}_BASE_URL`] = channel.baseUrl;
  }
  return output;
}
