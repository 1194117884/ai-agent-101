import type { WeaknessAnalysis } from "./weakness-analysis.ts";

export type ReportCompetency = { competencyId: string; name: string; mastery: number; confidence: number; weakness: WeaknessAnalysis };
export type ReportEvidence = { id: string; competencyId: string; type: string; score: number | null; feedback: string | null; createdAt: string };
export type ReportItem = { competencyId: string; name: string; mastery: number; confidence: number; reason: string; evidence: Omit<ReportEvidence, "competencyId">[] };
export type StageReport = { summary: string; mastered: ReportItem[]; consolidating: ReportItem[]; weak: ReportItem[]; nextStageAdvice: string };

export function buildStageReport(competencies: ReportCompetency[], evidence: ReportEvidence[]): StageReport {
  const items = competencies.map((state) => ({
    competencyId: state.competencyId,
    name: state.name,
    mastery: state.mastery,
    confidence: state.confidence,
    reason: state.weakness.reasons[0] ?? state.weakness.recommendation,
    evidence: evidence.filter((item) => item.competencyId === state.competencyId).slice(0, 3).map((item) => ({ id: item.id, type: item.type, score: item.score, feedback: item.feedback, createdAt: item.createdAt })),
    level: state.weakness.level,
  }));
  const mastered = items.filter((item) => item.level === "strong").map(withoutLevel);
  const consolidating = items.filter((item) => item.level === "watch").map(withoutLevel);
  const weak = items.filter((item) => item.level === "weak").map(withoutLevel);
  const priority = [...weak, ...consolidating].sort((a, b) => a.mastery - b.mastery || a.confidence - b.confidence)[0];
  const summary = competencies.length ? `已形成 ${competencies.length} 项能力判断：${mastered.length} 项稳定、${consolidating.length} 项待巩固、${weak.length} 项薄弱。` : "还没有足够的评分证据生成阶段报告。";
  const nextStageAdvice = priority ? `下一阶段先集中练习「${priority.name}」，将掌握度提升到 80% 后再扩展新主题。` : mastered.length ? "当前已评估能力表现稳定，可以按今日任务进入下一项能力，并保留周期复习。" : "先完成今日任务或一次小测，系统会据此生成下一阶段建议。";
  return { summary, mastered, consolidating, weak, nextStageAdvice };
}

function withoutLevel(item: ReportItem & { level: WeaknessAnalysis["level"] }): ReportItem {
  return { competencyId: item.competencyId, name: item.name, mastery: item.mastery, confidence: item.confidence, reason: item.reason, evidence: item.evidence };
}
