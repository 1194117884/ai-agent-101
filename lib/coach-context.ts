export type CoachLearningContext = {
  goal: string;
  currentProject?: string | null;
  learningPace?: string;
  weeklyHours?: number;
  currentTask?: { title: string; competencyName: string; instruction: string; expectedOutput: string; rubric: string[] } | null;
  competencies: { name: string; mastery: number; confidence: number; rationale: string }[];
  recentEvidence: { competencyName: string; type: string; score: number | null; feedback: string | null; content: string }[];
  recentConversation: { role: string; content: string }[];
};

export function formatCoachLearningContext(context?: CoachLearningContext) {
  if (!context) return "";
  const task = context.currentTask
    ? `当前任务：${context.currentTask.title}（${context.currentTask.competencyName}）\n任务要求：${context.currentTask.instruction}\n预期产出：${context.currentTask.expectedOutput}\n验收标准：${context.currentTask.rubric.join("；") || "未设置"}`
    : "当前任务：暂无";
  const competencies = context.competencies.length
    ? context.competencies.map((item) => `- ${item.name}：掌握度 ${item.mastery}%，置信度 ${item.confidence}%；${item.rationale}`).join("\n")
    : "- 暂无能力评估";
  const evidence = context.recentEvidence.length
    ? context.recentEvidence.map((item) => `- ${item.competencyName} / ${item.type} / ${item.score === null ? "未评分" : `${item.score} 分`}：${item.feedback || "暂无反馈"}；提交摘要：${clip(item.content, 240)}`).join("\n")
    : "- 暂无学习证据";
  const conversation = context.recentConversation.length
    ? context.recentConversation.map((item) => `- ${item.role === "coach" ? "老师" : "学生"}：${clip(item.content, 180)}`).join("\n")
    : "- 暂无历史对话";
  return `\n\n学习者上下文：\n学习目标：${context.goal}${context.currentProject ? `\n当前项目：${context.currentProject}` : ""}${context.weeklyHours ? `\n每周投入：${context.weeklyHours} 小时` : ""}${context.learningPace ? `\n学习节奏：${context.learningPace}` : ""}\n${task}\n能力画像：\n${competencies}\n最近证据：\n${evidence}\n最近对话：\n${conversation}`;
}

function clip(value: string, limit: number) { return value.length > limit ? `${value.slice(0, limit)}…` : value; }
