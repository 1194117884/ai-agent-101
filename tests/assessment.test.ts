import assert from "node:assert/strict";
import test from "node:test";
import { assessmentCatalog, gradeAssessment } from "../lib/assessment.ts";

const completeAnswers: Record<string, string> = {
  "concept-tool-contract": "description 说明何时选择和调用工具；schema 定义参数字段类型；失败返回给出错误原因和恢复的下一步。三者分别负责选择、正确调用和恢复，共同形成边界。",
  "design-tool-contract": "名称 search_items，只用于查询。JSON schema 包含 properties、required 和参数类型。错误 error：参数无效请修正；not found：无结果请换关键词。不应该用于直接保存数据。",
  "review-tool-executor": "自动重试会造成重复副作用，需要 idempotency 幂等键。加入 timeout 和 abort 取消；错误分类为可恢复与致命错误；用 trace/span 日志记录每次尝试。",
  "trace-failure-analysis": "首个根因在 span-2 的工具超时，后续空结果只是症状，因此形成因果链。引用 trace event 时间和步骤。做对照实验：增加超时后重跑，并以成功率指标验证。",
  "acceptance-agent-project": "以最终状态和成功率作为 outcome；每个 case 重复多次计算 pass^k 可靠性；记录 token 成本和延迟；安全权限必须受控，失败用 trace 回放复现。",
};

test("defines all five required assessment types", () => {
  assert.deepEqual(assessmentCatalog.map((item) => item.kind), ["concept", "design", "code_review", "trace_analysis", "project_acceptance"]);
  for (const item of assessmentCatalog) assert.equal(item.criteria.reduce((sum, criterion) => sum + criterion.weight, 0), 100);
});

test("complete answers receive full criterion-level credit", () => {
  for (const definition of assessmentCatalog) {
    const result = gradeAssessment(definition.id, completeAnswers[definition.id]);
    assert.equal(result.score, 100, definition.id);
    assert.equal(result.errorCategory, null);
    assert.ok(result.breakdown.every((item) => item.passed));
  }
});

test("incomplete answers expose missing criteria and error category", () => {
  const concept = gradeAssessment("concept-tool-contract", "schema 用来约束参数字段");
  assert.equal(concept.score, 25);
  assert.equal(concept.errorCategory, "concept");
  assert.equal(concept.breakdown.filter((item) => !item.passed).length, 3);
  const trace = gradeAssessment("trace-failure-analysis", "我觉得运行失败了");
  assert.equal(trace.errorCategory, "debugging");
});

test("unknown rubric versions are rejected", () => {
  assert.throws(() => gradeAssessment("missing", "answer"), /Unknown assessment/);
});
