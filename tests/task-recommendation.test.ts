import assert from "node:assert/strict";
import test from "node:test";
import { recommendNextTask } from "../lib/task-recommendation.ts";
import { rubricAssessmentId, rubricLabels } from "../lib/rubric.ts";

test("starts with a P0 assessment that can establish a baseline", () => {
  const task = recommendNextTask([]);
  assert.equal(task.assessment.id, "concept-tool-contract");
  assert.match(task.reason, /尚无/);
});

test("moves to an unassessed supported competency after tools are mastered", () => {
  const task = recommendNextTask([{ competencyId: "tools", mastery: 100, confidence: 80 }]);
  assert.equal(task.assessment.competencyId, "reliability");
  assert.match(task.instruction, /ToolExecutor/);
});

test("keeps a weak competency active until its rubric is covered", () => {
  const task = recommendNextTask([{ competencyId: "tools", mastery: 30, confidence: 30 }]);
  assert.equal(task.assessment.competencyId, "tools");
  assert.match(task.reason, /30%/);
});

test("consolidates a partially passed competency before opening a new topic", () => {
  const task = recommendNextTask([{ competencyId: "tools", mastery: 70, confidence: 70 }]);
  assert.equal(task.assessment.competencyId, "tools");
  assert.match(task.reason, /70%/);
});

test("reads versioned rubric envelopes while preserving legacy arrays", () => {
  const envelope = JSON.stringify({ assessmentId: "trace-failure-analysis", criteria: [{ label: "定位根因" }] });
  assert.equal(rubricAssessmentId(envelope), "trace-failure-analysis");
  assert.deepEqual(rubricLabels(envelope), ["定位根因"]);
  assert.deepEqual(rubricLabels(JSON.stringify(["旧规则"])), ["旧规则"]);
});
