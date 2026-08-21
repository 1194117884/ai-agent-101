import { env } from "cloudflare:workers";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { aiApiKeys, aiChannels } from "../db/schema";
import { ChannelValidationError, validateAIChannels, type ChannelInput } from "./ai-channel-validation";
import { selectRunnableKeys } from "./ai-key-health";
export type { ChannelInput } from "./ai-channel-validation";

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
  validateAIChannels(inputs);
  const db = getDb();
  const [storedChannels, storedKeys] = await Promise.all([
    db.select({ id: aiChannels.id, slug: aiChannels.slug }).from(aiChannels),
    db.select({ id: aiApiKeys.id, channelId: aiApiKeys.channelId }).from(aiApiKeys),
  ]);
  const channelsById = new Map(storedChannels.map((channel) => [channel.id, channel]));
  const keysById = new Map(storedKeys.map((key) => [key.id, key]));
  for (const input of inputs) {
    if (input.id && (!channelsById.has(input.id) || channelsById.get(input.id)?.slug !== input.slug.trim().toLowerCase())) throw new ChannelValidationError("渠道标识无效，请刷新后重试。");
    for (const key of input.keys) if (key.id && keysById.get(key.id)?.channelId !== input.id) throw new ChannelValidationError("Key 不属于当前渠道，请刷新后重试。");
  }

  const writes = [];
  for (const input of inputs) {
    const id = input.id ?? crypto.randomUUID();
    const channel = { id, slug: input.slug.trim().toLowerCase(), displayName: input.displayName.trim(), protocol: input.protocol, baseUrl: input.baseUrl.trim(), model: input.model.trim(), priority: Math.round(input.priority), enabled: input.enabled, updatedAt: new Date().toISOString() };
    writes.push(db.insert(aiChannels).values(channel).onConflictDoUpdate({ target: aiChannels.id, set: channel }));
    const existing = storedKeys.filter((key) => key.channelId === id);
    const retained = new Set(input.keys.flatMap((key) => key.id ? [key.id] : []));
    for (const oldKey of existing) if (!retained.has(oldKey.id)) writes.push(db.delete(aiApiKeys).where(eq(aiApiKeys.id, oldKey.id)));
    for (const key of input.keys) {
      if (key.id) {
        const update: { label: string; enabled: boolean; updatedAt: string; encryptedKey?: string; keyHint?: string } = { label: key.label.trim(), enabled: key.enabled, updatedAt: new Date().toISOString() };
        if (key.value?.trim()) { update.encryptedKey = await encrypt(key.value.trim()); update.keyHint = hint(key.value.trim()); }
        writes.push(db.update(aiApiKeys).set(update).where(eq(aiApiKeys.id, key.id)));
      } else if (key.value?.trim()) {
        writes.push(db.insert(aiApiKeys).values({ id: crypto.randomUUID(), channelId: id, label: key.label.trim(), encryptedKey: await encrypt(key.value.trim()), keyHint: hint(key.value.trim()), enabled: key.enabled }));
      }
    }
  }
  if (writes.length) await db.batch(writes as [typeof writes[number], ...typeof writes[number][]]);
  return listAIChannels();
}

export async function deleteAIChannel(id: string) {
  await getDb().delete(aiChannels).where(eq(aiChannels.id, id));
}

export async function databaseAIEnvironment(): Promise<Record<string, string>> {
  return (await databaseAIConfiguration()).environment;
}

export async function databaseAIConfiguration() {
  const db = getDb();
  const channels = await db.select().from(aiChannels).where(eq(aiChannels.enabled, true)).orderBy(asc(aiChannels.priority));
  if (!channels.length) return { environment: {} as Record<string, string>, reportAttempt: async () => {} };
  const output: Record<string, string> = { AI_PROVIDER_ORDER: channels.map((channel) => channel.slug).join(",") };
  const keyIds = new Map<string, string>();
  for (const channel of channels) {
    const rows = await db.select().from(aiApiKeys).where(eq(aiApiKeys.channelId, channel.id)).orderBy(asc(aiApiKeys.createdAt));
    const prefix = channel.slug.toUpperCase();
    const runnableRows = selectRunnableKeys(rows.filter((row) => row.enabled));
    const keys = await Promise.all(runnableRows.map((row) => decrypt(row.encryptedKey)));
    keys.forEach((key, index) => keyIds.set(`${channel.slug}\u0000${key}`, runnableRows[index].id));
    output[`${prefix}_API_KEYS`] = JSON.stringify(keys);
    if (!keys.length) continue;
    output[`${prefix}_MODEL`] = channel.model;
    output[`${prefix}_BASE_URL`] = channel.baseUrl;
  }
  return {
    environment: output,
    reportAttempt: async ({ provider, key, outcome, error }: { provider: string; key: string; outcome: "success" | "failure"; error?: string }) => {
      const id = keyIds.get(`${provider}\u0000${key}`);
      if (!id) return;
      const timestamp = new Date().toISOString();
      if (outcome === "success") {
        await db.update(aiApiKeys).set({ lastUsedAt: timestamp, failureCount: 0, lastError: null, updatedAt: timestamp }).where(eq(aiApiKeys.id, id));
      } else {
        await db.update(aiApiKeys).set({ lastUsedAt: timestamp, failureCount: sql`${aiApiKeys.failureCount} + 1`, lastError: error?.slice(0, 80) ?? "UNKNOWN_ERROR", updatedAt: timestamp }).where(eq(aiApiKeys.id, id));
      }
    },
  };
}
