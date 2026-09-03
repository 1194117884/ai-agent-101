import { assessmentCatalog, type AssessmentDefinition } from "./assessment.ts";
import { getCompetency, getUnitsForCompetency } from "../curriculum/catalog.ts";

export type MasteryState = { competencyId: string; mastery: number; confidence: number };

export type TaskRecommendation = {
  assessment: AssessmentDefinition;
  title: string;
  instruction: string;
  expectedOutput: string;
  sourceUnitId: string | null;
  reason: string;
};

const priorityWeight = { P0: 0, P1: 10, P2: 20 } as const;

export function recommendNextTask(states: MasteryState[]): TaskRecommendation {
  const stateMap = new Map(states.map((state) => [state.competencyId, state]));
  const ranked = assessmentCatalog.map((assessment, order) => {
    const competency = getCompetency(assessment.competencyId);
    const state = stateMap.get(assessment.competencyId);
    const unmetPrerequisites = (competency?.prerequisites ?? []).filter((id) => (stateMap.get(id)?.mastery ?? 0) < 60);
    // An observed gap should be repaired before opening more untouched topics.
    const remediationBoost = state && state.mastery < 80 ? -100 : 0;
    const rank = (state?.mastery ?? 0) + Math.floor((state?.confidence ?? 0) / 10) + priorityWeight[competency?.prio ?? "P1"] + unmetPrerequisites.length * 12 + remediationBoost;
    return { assessment, competency, state, unmetPrerequisites, rank, order };
  }).sort((a, b) => a.rank - b.rank || a.order - b.order)[0];

  const unit = getUnitsForCompetency(ranked.assessment.competencyId)[0];
  const reason = ranked.state
    ? `${ranked.competency?.name ?? ranked.assessment.competencyId} 当前掌握度 ${ranked.state.mastery}%、置信度 ${ranked.state.confidence}%，是现阶段最需要巩固的可评估能力。`
    : `尚无 ${ranked.competency?.name ?? ranked.assessment.competencyId} 的学习证据，优先建立能力基线。`;
  return {
    assessment: ranked.assessment,
    title: ranked.assessment.title,
    instruction: `${ranked.assessment.question}${ranked.unmetPrerequisites.length ? ` 注意同时补充前置能力：${ranked.unmetPrerequisites.join("、")}。` : ""}`,
    expectedOutput: `一份覆盖 ${ranked.assessment.criteria.length} 条验收标准的回答`,
    sourceUnitId: unit?.id ?? null,
    reason,
  };
}
