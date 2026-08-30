export type CompetencySnapshot = { competencyId: string; mastery: number; confidence: number; lastAssessedAt?: string | null; reviewDueAt?: string | null; rationale: string };
export type EvidenceSnapshot = { competencyId: string; score?: number | null; createdAt: string };
export type WeaknessAnalysis = { level: "strong" | "watch" | "weak"; evidenceCount: number; recentScores: number[]; reasons: string[]; recommendation: string };

export function nextReviewAt(score: number, now = new Date()) {
  const days = score >= 80 ? 7 : score >= 60 ? 3 : 1;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function analyzeWeakness(state: CompetencySnapshot, evidence: EvidenceSnapshot[], now = new Date()): WeaknessAnalysis {
  const scored = evidence.filter((item) => item.competencyId === state.competencyId && item.score !== null && item.score !== undefined).slice(0, 5);
  const recentScores = scored.map((item) => item.score as number);
  const reasons: string[] = [];
  if (state.mastery < 60) reasons.push(`掌握度仅 ${state.mastery}%`);
  else if (state.mastery < 80) reasons.push(`掌握度 ${state.mastery}%，尚未达到 80% 巩固线`);
  if (state.confidence < 50) reasons.push(`判断置信度仅 ${state.confidence}%，还需要更多有效证据`);
  if (recentScores.length >= 2 && recentScores.slice(0, 2).every((score) => score < 80)) reasons.push(`最近两次评分均低于 80（${recentScores.slice(0, 2).join("、")}）`);
  if (isDue(state.reviewDueAt, now)) reasons.push("已到复习时间，存在遗忘风险");
  else if (isStale(state.lastAssessedAt, now)) reasons.push("超过 14 天没有新的评估证据");
  const level = state.mastery < 60 || reasons.length >= 3 ? "weak" : state.mastery < 80 || reasons.length > 0 ? "watch" : "strong";
  const recommendation = level === "weak" ? "优先完成当前能力的最小练习，并按反馈补齐未通过的 rubric。" : level === "watch" ? "安排一次短测或真实案例复现，确认能力没有退化。" : "当前表现稳定，可进入下一能力并在一周后复习。";
  return { level, evidenceCount: scored.length, recentScores, reasons: reasons.length ? reasons : ["最近证据稳定，暂未发现明显薄弱信号"], recommendation };
}

function isDue(value: string | null | undefined, now: Date) { if (!value) return false; const date = new Date(normalizeDate(value)); return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime(); }
function isStale(value: string | null | undefined, now: Date) { if (!value) return false; const date = new Date(normalizeDate(value)); return !Number.isNaN(date.getTime()) && now.getTime() - date.getTime() >= 14 * 24 * 60 * 60 * 1000; }
function normalizeDate(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }
