import assert from "node:assert/strict";
import test from "node:test";
import { gradeAssessment } from "../lib/assessment.ts";
import { buildLearningNotifications } from "../lib/learning-notifications.ts";
import { buildStageReport } from "../lib/stage-report.ts";
import { recommendNextTask } from "../lib/task-recommendation.ts";
import { analyzeWeakness, nextReviewAt } from "../lib/weakness-analysis.ts";

test("scored evidence drives mastery, remediation, stage report and review reminder", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const assessment = gradeAssessment("design-tool-contract", "search_items 用于查询；schema properties required 参数；不应调用它保存数据");
  assert.equal(assessment.score, 70);
  const state = { competencyId: assessment.competencyId, mastery: assessment.score, confidence: assessment.score, rationale: assessment.feedback, lastAssessedAt: now.toISOString(), reviewDueAt: nextReviewAt(assessment.score, now) };
  const evidence = [{ id: "evidence-1", competencyId: "tools", type: "submission", score: assessment.score, feedback: assessment.feedback, content: "工具契约提交", createdAt: now.toISOString() }];
  const next = recommendNextTask([state]);
  assert.equal(next.assessment.competencyId, "tools");
  assert.match(next.reason, /70%/);
  const weakness = analyzeWeakness(state, evidence, now);
  const report = buildStageReport([{ ...state, name: "Tool Design / Function Calling", weakness }], evidence);
  assert.equal(report.consolidating.length, 1);
  assert.equal(report.consolidating[0].evidence[0].id, "evidence-1");
  assert.match(report.nextStageAdvice, /Tool Design/);
  const afterReviewDue = new Date(state.reviewDueAt);
  afterReviewDue.setMinutes(afterReviewDue.getMinutes() + 1);
  const notifications = buildLearningNotifications([{ ...state, name: "Tool Design / Function Calling" }], null, 8, afterReviewDue);
  assert.equal(notifications[0].type, "review");
});
