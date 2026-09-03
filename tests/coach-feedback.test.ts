import assert from "node:assert/strict";
import test from "node:test";
import { unresolvedCoachFeedback } from "../lib/coach-feedback.ts";

const item = (rating?: string, reason?: string, content = "回答") => ({ role: "coach", content, metadataJson: JSON.stringify({ userFeedback: rating ? { rating, reason } : undefined }) });

test("collects bounded unresolved feedback with readable reasons", () => {
  const result = unresolvedCoachFeedback([item("unhelpful", "unactionable", "步骤一"), item("unhelpful", "inaccurate", "步骤二"), item("unhelpful", "misunderstood", "步骤三"), item("unhelpful", "irrelevant_source", "步骤四")]);
  assert.deepEqual(result, [{ reason: "步骤不可执行", answerSummary: "步骤一" }, { reason: "内容不准确", answerSummary: "步骤二" }, { reason: "没理解问题", answerSummary: "步骤三" }]);
});

test("a newer helpful answer closes older negative feedback", () => {
  assert.deepEqual(unresolvedCoachFeedback([item("helpful"), item("unhelpful", "inaccurate")]), []);
});

test("only negatives newer than the last helpful answer remain open", () => {
  assert.deepEqual(unresolvedCoachFeedback([item("unhelpful", "irrelevant_source", "最新失败"), item("helpful"), item("unhelpful", "inaccurate", "已关闭")]), [{ reason: "资料不相关", answerSummary: "最新失败" }]);
});
