"use client";
import { useEffect, useMemo, useState } from "react";
import type { CurriculumUnit, TeachingPhase } from "../../curriculum/catalog";

type Dashboard = { task: { sourceUnitId?: string | null } | null; competencies: { competencyId: string; mastery: number }[] };

export function CurriculumMap({ phases, units }: { phases: TeachingPhase[]; units: CurriculumUnit[] }) {
  const [dashboard, setDashboard] = useState<Dashboard>();
  useEffect(() => { fetch("/api/dashboard").then((response) => response.json()).then(setDashboard).catch(() => setDashboard({ task: null, competencies: [] })); }, []);
  const mastery = useMemo(() => new Map((dashboard?.competencies ?? []).map((item) => [item.competencyId, item.mastery])), [dashboard]);
  function status(unit: CurriculumUnit) {
    if (dashboard?.task?.sourceUnitId === unit.id) return { key: "active", label: "当前任务" };
    const scores = unit.competencyIds.map((id) => mastery.get(id)).filter((score): score is number => score !== undefined);
    if (scores.length && scores.length === unit.competencyIds.length && scores.every((score) => score >= 80)) return { key: "mastered", label: "已掌握" };
    if (scores.length) return { key: "progress", label: "学习中" };
    return { key: "locked", label: "未开始" };
  }
  return <div className="curriculum-phases">{phases.map((phase) => { const phaseUnits = units.filter((unit) => unit.stageId === phase.id); const mastered = phaseUnits.filter((unit) => status(unit).key === "mastered").length; return <section className="curriculum-phase" key={phase.id}><header style={{ borderColor: phase.color }}><div><span>{phase.id} · Day {phase.days}</span><h2>{phase.name}</h2><p>{phase.desc}</p></div><b>{mastered}/{phaseUnits.length} 已掌握</b></header><div className="curriculum-units">{phaseUnits.map((unit) => { const unitStatus = status(unit); return <details className={`curriculum-unit ${unitStatus.key}`} key={unit.id} open={unitStatus.key === "active"}><summary><span>Day {unit.day}</span><div><strong>{unit.title}</strong><small>{unit.competencyIds.join(" · ")}</small></div><b>{unitStatus.label}</b></summary><div className="curriculum-unit-body"><section><span>学习目标</span><ul>{unit.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></section><section><span>练习</span><p>{unit.practice}</p></section><section><span>验收</span><p>{unit.acceptance}</p></section><footer>资料策略：{unit.sourcePolicy}</footer></div></details>; })}</div></section>; })}</div>;
}
