export type Priority = "P0" | "P1" | "P2";
export const competencies = [
  ["agent-loop", "Agent Loop / Runtime / State", "P0", []], ["tool-design", "Tool Design / Function Calling", "P0", ["agent-loop"]], ["context", "Context Engineering", "P0", ["agent-loop"]], ["evaluation", "Evaluation / Benchmark", "P0", ["agent-loop"]], ["reliability", "Reliability / Recovery", "P0", ["tool-design", "evaluation"]], ["security", "Security / Guardrails / HITL", "P0", ["tool-design"]], ["contracts", "Structured Output / Contracts", "P0", ["tool-design"]], ["skills", "Skills / ACI / Tool UX", "P0", ["tool-design", "context"]]
] as const;
export const teachingStages = [
  ["Day 1–6", "基础与单 Agent", "心智模型、Loop、Tool、Trace 与最小 Eval"], ["Day 7–11", "Context Engineering", "上下文、Skills、MCP、检索与记忆边界"], ["Day 12–17", "Reasoning 与可靠性", "ReAct、规划、恢复与协作取舍"], ["Day 18–24", "Eval 与 Harness", "评估、长运行、部署成本和安全边界"], ["Day 25–30", "Capstone", "同一 Runtime 迁移到真实场景并做 ablation"]
] as const;
export const canonicalCurriculumPolicy = "教学阶段以 agent_30_day_bootcamp_v2.html 为准；基础划分页补充能力定义、练习与验收。";
