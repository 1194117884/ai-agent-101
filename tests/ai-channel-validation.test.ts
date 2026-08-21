import assert from "node:assert/strict";
import test from "node:test";
import { ChannelValidationError, validateAIChannels, type ChannelInput } from "../lib/ai-channel-validation.ts";

const channel = (patch: Partial<ChannelInput> = {}): ChannelInput => ({
  slug: "openai",
  displayName: "OpenAI",
  protocol: "openai-compatible",
  baseUrl: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4.1-mini",
  priority: 10,
  enabled: true,
  keys: [{ label: "主 Key", value: "secret", enabled: true }],
  ...patch,
});

test("accepts a valid channel and key pool", () => {
  assert.doesNotThrow(() => validateAIChannels([channel()]));
});

test("rejects duplicate channels and reused key identities", () => {
  assert.throws(() => validateAIChannels([channel(), channel()]), ChannelValidationError);
  assert.throws(() => validateAIChannels([
    channel({ id: "c1", keys: [{ id: "same", label: "A", enabled: true }] }),
    channel({ id: "c2", slug: "deepseek", displayName: "DeepSeek", baseUrl: "https://api.deepseek.com/chat/completions", keys: [{ id: "same", label: "B", enabled: true }] }),
  ]), /同一个 Key/);
});

test("rejects unsafe endpoints and incomplete new keys", () => {
  assert.throws(() => validateAIChannels([channel({ baseUrl: "http://api.example.com" })]), /HTTPS/);
  assert.throws(() => validateAIChannels([channel({ keys: [{ label: "空 Key", enabled: true }] })]), /必须填写 API Key/);
});
