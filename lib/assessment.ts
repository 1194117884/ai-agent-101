export type AssessmentKind = "concept" | "scenario_choice" | "design" | "code_review" | "trace_analysis" | "project_acceptance";
export type ErrorCategory = "concept" | "reasoning" | "implementation" | "debugging" | "tradeoff";
export type RubricCriterion = { id: string; label: string; dimension: "correctness" | "explanation" | "tradeoff" | "reproducibility"; weight: number; signals: string[]; guidance: string };
export type AssessmentDefinition = { id: string; kind: AssessmentKind; competencyId: string; title: string; question: string; criteria: RubricCriterion[] };

const criterion = (id: string, label: string, dimension: RubricCriterion["dimension"], weight: number, signals: string[], guidance: string): RubricCriterion => ({ id, label, dimension, weight, signals, guidance });

export const assessmentCatalog: AssessmentDefinition[] = [
  { id: "concept-tool-contract", kind: "concept", competencyId: "tools", title: "工具契约概念口试", question: "一个 Agent 需要查询订单状态。请说明工具 description、schema 和失败返回各自解决什么问题，并说明三者如何配合。", criteria: [criterion("selection", "description 支持正确选择工具", "correctness", 25, ["何时", "选择", "调用", "用途"], "说明 description 是模型选择工具的信号。"), criterion("schema", "schema 约束输入参数", "correctness", 25, ["schema", "参数", "字段", "类型"], "说明字段、类型和约束如何减少误用。"), criterion("recovery", "失败返回支持恢复", "explanation", 25, ["失败", "错误", "恢复", "下一步"], "说明错误应包含原因与可执行的下一步。"), criterion("cooperation", "解释三者协作关系", "explanation", 25, ["配合", "边界", "分别", "共同"], "串联选择、调用和恢复三个阶段。") ] },
  { id: "scenario-support-routing", kind: "scenario_choice", competencyId: "orchestrate", title: "客服 Agent 编排情境选择", question: "客服 Agent 收到三类请求：查询订单、同时核对物流与库存、执行高金额退款。请分别选择单路由、并行工具或人工接管，并说明选择条件、失败边界和一种不采用其他方案的理由。", criteria: [criterion("routing", "为单一查询选择明确路由", "correctness", 25, ["单路由", "路由", "查询订单", "单个工具"], "简单且确定的请求应走最短的单路由。"), criterion("parallel", "只并行执行相互独立的步骤", "correctness", 25, ["并行", "物流", "库存", "独立"], "说明物流与库存查询无依赖时才可并行。"), criterion("handoff", "高风险动作要求人工接管", "reproducibility", 25, ["人工", "接管", "审批", "退款"], "高金额退款必须设置权限和人工确认边界。"), criterion("tradeoff", "解释失败边界与方案权衡", "tradeoff", 25, ["失败", "边界", "权衡", "不采用", "否则"], "说明错误隔离、成本或风险为何支持该选择。") ] },
  { id: "design-tool-contract", kind: "design", competencyId: "tools", title: "工具接口设计", question: "设计一个 search_items 工具契约：给出名称、description、JSON schema、至少两个失败返回，并说明什么时候不该调用。", criteria: [criterion("single-action", "名称指向单一动作", "correctness", 20, ["search_items", "search", "查询", "查找"], "使用清晰、单一且可预测的动作名称。"), criterion("input-contract", "输入 schema 明确且受约束", "correctness", 30, ["schema", "properties", "required", "参数"], "给出字段、类型、必填项和合理约束。"), criterion("failure-contract", "失败返回可诊断、可恢复", "reproducibility", 30, ["error", "错误", "失败", "not found", "下一步"], "至少覆盖无结果或参数错误，并提供恢复动作。"), criterion("negative-boundary", "说明不应调用的边界", "tradeoff", 20, ["不该", "不应", "不要调用", "无需"], "明确哪些需求不属于该工具。") ] },
  { id: "review-tool-executor", kind: "code_review", competencyId: "reliability", title: "ToolExecutor 代码审查", question: "审查一段会自动重试工具调用的 ToolExecutor。请指出重复副作用、超时、错误分类和可观测性方面的风险，并给出修改建议。", criteria: [criterion("idempotency", "识别重复副作用与幂等风险", "correctness", 30, ["幂等", "重复", "副作用", "idempotency"], "指出重试可能重复执行不可逆动作。"), criterion("timeout", "覆盖超时与取消", "reproducibility", 20, ["超时", "timeout", "取消", "abort"], "建议明确的超时和取消传播。"), criterion("error-types", "区分可恢复与致命错误", "explanation", 25, ["可恢复", "致命", "重试", "错误分类"], "不同错误必须采用不同恢复策略。"), criterion("observability", "提出结构化 trace 建议", "reproducibility", 25, ["trace", "span", "日志", "可观测"], "记录 attempt、耗时、结果和 termination reason。") ] },
  { id: "trace-failure-analysis", kind: "trace_analysis", competencyId: "observe", title: "失败 Trace 分析", question: "给定一次失败运行的 trace，请定位首个根因、区分根因与后续症状、引用关键事件，并提出一个可验证的修复实验。", criteria: [criterion("root-cause", "定位首个根因", "correctness", 30, ["根因", "首次", "第一个", "起因"], "定位最早导致状态偏离的事件。"), criterion("causality", "区分根因和后续症状", "explanation", 25, ["症状", "导致", "因此", "因果"], "说明事件间的因果链，而非罗列错误。"), criterion("evidence", "引用 trace 证据", "reproducibility", 20, ["event", "span", "时间", "步骤", "trace"], "引用具体 span、工具结果或状态变化。"), criterion("experiment", "提出可验证的修复实验", "tradeoff", 25, ["实验", "验证", "对照", "重跑", "指标"], "定义改动、对照和成功判据。") ] },
  { id: "acceptance-agent-project", kind: "project_acceptance", competencyId: "eval", title: "Agent 项目验收", question: "为一个可调用工具的 Agent 项目写验收方案，覆盖任务成功率、重复运行可靠性、成本/延迟、安全边界和失败复现。", criteria: [criterion("outcome", "定义最终状态成功标准", "correctness", 25, ["成功率", "最终状态", "outcome", "通过率"], "用外部可验证结果判断成功。"), criterion("reliability", "包含重复试验与可靠性", "reproducibility", 25, ["重复", "多次", "pass", "可靠"], "定义试验次数及 pass@k/pass^k。"), criterion("efficiency", "衡量成本与延迟", "tradeoff", 20, ["成本", "token", "延迟", "耗时"], "报告每个成功任务的资源消耗。"), criterion("safety-replay", "覆盖安全与失败复现", "reproducibility", 30, ["安全", "权限", "trace", "复现", "回放"], "高风险动作必须受控，失败必须能从 trace 重放。") ] },
];

export const TOOL_QUESTION = assessmentCatalog[0].question;
export const TOOL_RUBRIC = assessmentCatalog[0].criteria.map((item) => item.label);

export function getAssessmentDefinition(id: string) { return assessmentCatalog.find((item) => item.id === id) ?? null; }

export function gradeAssessment(id: string, answer: string) {
  const definition = getAssessmentDefinition(id);
  if (!definition) throw new Error(`Unknown assessment: ${id}`);
  const normalized = answer.toLowerCase();
  const breakdown = definition.criteria.map((item) => { const matchedSignals = item.signals.filter((signal) => normalized.includes(signal.toLowerCase())); const earned = matchedSignals.length ? item.weight : 0; return { id: item.id, label: item.label, dimension: item.dimension, weight: item.weight, earned, passed: earned > 0, guidance: item.guidance }; });
  const score = breakdown.reduce((sum, item) => sum + item.earned, 0);
  const missing = breakdown.filter((item) => !item.passed);
  const errorCategory = categoryFor(definition.kind, missing[0]?.dimension);
  const feedback = missing.length ? `已覆盖 ${breakdown.length - missing.length}/${breakdown.length} 项。优先补充：${missing.map((item) => item.label).join("；")}。下一步：${missing[0].guidance}` : `全部 ${breakdown.length} 项验收标准均已覆盖。下一步可增加反例或真实运行证据，提高结论可信度。`;
  return { assessmentId: id, kind: definition.kind, competencyId: definition.competencyId, score, feedback, errorCategory: missing.length ? errorCategory : null, breakdown };
}

export function grade(answer: string) { return gradeAssessment("concept-tool-contract", answer); }

function categoryFor(kind: AssessmentKind, dimension?: RubricCriterion["dimension"]): ErrorCategory {
  if (kind === "trace_analysis") return "debugging";
  if (kind === "code_review") return dimension === "explanation" ? "reasoning" : "implementation";
  if (kind === "project_acceptance" || dimension === "tradeoff") return "tradeoff";
  return kind === "concept" ? "concept" : "reasoning";
}
