import { curriculum, type CurriculumUnit } from "../curriculum/catalog.ts";

const aliases: Record<string, string[]> = {
  loop: ["loop", "循环", "runtime", "状态"], tools: ["tool", "工具", "function calling"], eval: ["eval", "评估", "测试", "benchmark"], context: ["context", "上下文", "token"], reliability: ["reliability", "可靠", "恢复", "重试", "幂等"], security: ["security", "安全", "guardrail", "权限", "hitl"], contracts: ["schema", "contract", "结构化", "json"], skills: ["skill", "技能", "aci"], mcp: ["mcp", "protocol"], observe: ["trace", "可观测", "日志"], longrun: ["long-running", "长运行", "checkpoint", "断点"], reason: ["reason", "推理", "react", "规划"], memory: ["memory", "记忆", "遗忘"], orchestrate: ["orchestration", "编排", "routing", "并行"], deploy: ["deploy", "部署", "成本", "模型路由"], rag: ["rag", "检索", "向量"], multi: ["multi-agent", "多智能体", "handoff", "a2a"], advanced: ["tot", "mcts", "高级搜索"],
};

export function retrieveCurriculum(query: string, limit = 3): CurriculumUnit[] {
  const normalized = query.toLowerCase();
  return curriculum.units.map((unit) => ({ unit, score: scoreUnit(unit, normalized) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.unit.day - b.unit.day).slice(0, limit).map((item) => item.unit);
}

function scoreUnit(unit: CurriculumUnit, query: string) {
  let score = unit.title.toLowerCase().split(/[\s：/]+/).filter((term) => term.length > 1 && query.includes(term)).length * 3;
  for (const id of unit.competencyIds) if ((aliases[id] ?? [id]).some((term) => query.includes(term))) score += 5;
  for (const objective of unit.objectives) if (objective.toLowerCase().split(/[\s/：]+/).some((term) => term.length > 2 && query.includes(term))) score += 1;
  return score;
}

export function curriculumContext(query: string) {
  const units = retrieveCurriculum(query);
  if (!units.length) return { context: "课程检索：未命中特定单元，使用基础能力地图。", source: "30 天 Agent Engineering 课程 · 基础能力地图" };
  return {
    context: units.map((unit) => `Day ${unit.day} · ${unit.title}\n目标：${unit.objectives.join("；")}\n练习：${unit.practice}\n验收：${unit.acceptance}\n阅读：${unit.readings.slice(0, 2).join("；")}`).join("\n\n"),
    source: units.map((unit) => `Day ${unit.day} · ${unit.title}`).join("；"),
  };
}
