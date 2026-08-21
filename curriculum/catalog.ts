import rawCatalog from "./catalog.generated.json" with { type: "json" };

export type Priority = "P0" | "P1" | "P2";
export type Competency = { id: string; name: string; score: number; prio: Priority; prerequisites: string[] };
export type CurriculumUnit = { id: string; day: number; stageId: string; title: string; priority: Priority; projectTracks: string[]; competencyIds: string[]; prerequisites: string[]; objectives: string[]; readings: string[]; practice: string; acceptance: string; sourcePolicy: string };
export type CurriculumSource = { id: string; title: string; type: string; note: string; url: string; status: "reviewed" | "pending"; trustLevel: "primary" | "reference" };
export type TeachingPhase = { id: string; days: string; name: string; desc: string; color: string };

export const curriculum = rawCatalog as {
  version: string;
  policy: string;
  generatedFrom: string[];
  phases: TeachingPhase[];
  competencies: Competency[];
  units: CurriculumUnit[];
  sources: CurriculumSource[];
};

export const competencies = curriculum.competencies;
export const teachingStages = curriculum.phases;
export const curriculumUnits = curriculum.units;
export const curriculumSources = curriculum.sources;
export const canonicalCurriculumPolicy = curriculum.policy;

export function getCompetency(id: string) { return competencies.find((item) => item.id === id) ?? null; }
export function getCurriculumUnit(day: number) { return curriculumUnits.find((item) => item.day === day) ?? null; }
export function getUnitsForCompetency(id: string) { return curriculumUnits.filter((item) => item.competencyIds.includes(id)); }
export function getPrerequisiteChain(id: string, seen = new Set<string>()): Competency[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const competency = getCompetency(id);
  if (!competency) return [];
  return competency.prerequisites.flatMap((prerequisite) => { const item = getCompetency(prerequisite); return item ? [...getPrerequisiteChain(prerequisite, seen), item] : []; }).filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
}
