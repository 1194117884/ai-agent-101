import assert from "node:assert/strict";
import test from "node:test";
import { analyzeWeakness, nextReviewAt } from "../lib/weakness-analysis.ts";

const now = new Date("2026-08-29T12:00:00Z");
test("explains a repeated low-score weakness with evidence", () => {
  const result = analyzeWeakness({ competencyId: "tools", mastery: 45, confidence: 40, rationale: "缺少失败处理", lastAssessedAt: "2026-08-29T10:00:00Z" }, [{ competencyId: "tools", score: 45, createdAt: "2026-08-29" }, { competencyId: "tools", score: 55, createdAt: "2026-08-28" }], now);
  assert.equal(result.level, "weak"); assert.equal(result.evidenceCount, 2); assert.ok(result.reasons.some((reason) => reason.includes("最近两次")));
});
test("marks overdue review as a forgetting risk", () => {
  const result = analyzeWeakness({ competencyId: "eval", mastery: 88, confidence: 80, rationale: "通过", reviewDueAt: "2026-08-28T12:00:00Z" }, [], now);
  assert.equal(result.level, "watch"); assert.ok(result.reasons.some((reason) => reason.includes("遗忘风险")));
});
test("keeps well-supported mastery stable", () => {
  const result = analyzeWeakness({ competencyId: "observe", mastery: 92, confidence: 85, rationale: "通过", lastAssessedAt: "2026-08-29T10:00:00Z" }, [{ competencyId: "observe", score: 92, createdAt: "2026-08-29" }], now);
  assert.equal(result.level, "strong"); assert.match(result.recommendation, /下一能力/);
});
test("schedules weaker results for earlier review", () => {
  assert.equal(nextReviewAt(40, now), "2026-08-30T12:00:00.000Z");
  assert.equal(nextReviewAt(90, now), "2026-09-05T12:00:00.000Z");
});
test("surfaces missing prerequisites and a stalled active task", () => {
  const result = analyzeWeakness(
    { competencyId: "reliability", mastery: 82, confidence: 75, rationale: "基础通过", lastAssessedAt: "2026-08-28T12:00:00Z" },
    [{ competencyId: "reliability", score: 82, createdAt: "2026-08-28" }], now,
    { unmetPrerequisites: ["Agent Loop / Runtime / State"], activeTaskCreatedAt: "2026-08-25T11:00:00Z" },
  );
  assert.equal(result.level, "watch");
  assert.ok(result.reasons.some((reason) => reason.includes("前置能力")));
  assert.ok(result.reasons.some((reason) => reason.includes("连续 3 天")));
});
