import assert from "node:assert/strict";
import test from "node:test";
import { isKeyCoolingDown, KEY_COOLDOWN_MS, selectRunnableKeys } from "../lib/ai-key-health.ts";

const now = Date.parse("2026-08-21T12:00:00.000Z");

test("cools down keys after consecutive failures", () => {
  assert.equal(isKeyCoolingDown({ failureCount: 3, lastUsedAt: new Date(now - 1000).toISOString() }, now), true);
  assert.equal(isKeyCoolingDown({ failureCount: 2, lastUsedAt: new Date(now - 1000).toISOString() }, now), false);
  assert.equal(isKeyCoolingDown({ failureCount: 9, lastUsedAt: new Date(now - KEY_COOLDOWN_MS).toISOString() }, now), false);
});

test("routes around cooled keys while preserving healthy pool order", () => {
  const keys = [
    { id: "cooling", failureCount: 3, lastUsedAt: new Date(now - 1000).toISOString() },
    { id: "healthy", failureCount: 0, lastUsedAt: null },
    { id: "recovered", failureCount: 4, lastUsedAt: new Date(now - KEY_COOLDOWN_MS - 1).toISOString() },
  ];
  assert.deepEqual(selectRunnableKeys(keys, now).map((key) => key.id), ["healthy", "recovered"]);
});

test("keeps one oldest probe when every key is cooling down", () => {
  const keys = [
    { id: "recent", failureCount: 4, lastUsedAt: new Date(now - 1000).toISOString() },
    { id: "oldest", failureCount: 3, lastUsedAt: new Date(now - 2000).toISOString() },
  ];
  assert.deepEqual(selectRunnableKeys(keys, now).map((key) => key.id), ["oldest"]);
});
