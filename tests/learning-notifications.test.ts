import assert from "node:assert/strict";
import test from "node:test";
import { buildLearningNotifications } from "../lib/learning-notifications.ts";

const now = new Date("2026-09-02T12:00:00Z");

test("builds review, stalled and evidence-driven weekly reminders", () => {
  const result = buildLearningNotifications([
    { competencyId: "tools", name: "工具设计", mastery: 55, confidence: 40, reviewDueAt: "2026-09-01T12:00:00Z" },
    { competencyId: "eval", name: "评测", mastery: 80, confidence: 70, reviewDueAt: "2026-09-09T12:00:00Z" },
  ], { id: "task-1", title: "工具契约", competencyId: "tools", createdAt: "2026-08-29T12:00:00Z" }, 10, now);
  assert.deepEqual(result.map((item) => item.type), ["stalled", "review", "weekly_plan"]);
  assert.match(result[1].message, /55%/);
  assert.match(result[2].message, /10 小时.*工具设计/);
});

test("always offers a baseline weekly plan without competency evidence", () => {
  const result = buildLearningNotifications([], null, 6, now);
  assert.equal(result.length, 1);
  assert.match(result[0].message, /第一份能力基线/);
});
