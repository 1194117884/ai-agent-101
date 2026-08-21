import assert from "node:assert/strict";
import test from "node:test";
import { curriculum, getCurriculumUnit, getPrerequisiteChain, getUnitsForCompetency } from "../curriculum/catalog.ts";
import { retrieveCurriculum } from "../lib/curriculum.ts";

test("catalog contains the canonical 18 competencies and 30-day path", () => {
  assert.equal(curriculum.competencies.length, 18);
  assert.equal(curriculum.units.length, 30);
  assert.deepEqual(curriculum.units.map((unit) => unit.day), Array.from({ length: 30 }, (_, index) => index + 1));
});

test("teacher retrieval maps learner questions to relevant units", () => {
  assert.equal(retrieveCurriculum("我不理解 tool description 和 JSON schema")[0]?.day, 4);
  assert.equal(retrieveCurriculum("怎样设计长运行 checkpoint 和跨 session 恢复")[0]?.day, 23);
  assert.equal(retrieveCurriculum("MCP 的 tools resources prompts 有什么区别")[0]?.day, 8);
});

test("every unit has goals, practice, acceptance and valid references", () => {
  const competencyIds = new Set(curriculum.competencies.map((item) => item.id));
  const phaseIds = new Set(curriculum.phases.map((item) => item.id));
  for (const unit of curriculum.units) {
    assert.ok(phaseIds.has(unit.stageId), `${unit.id} has an unknown phase`);
    assert.ok(unit.objectives.length > 0, `${unit.id} has no objectives`);
    assert.ok(unit.readings.length > 0, `${unit.id} has no readings`);
    assert.ok(unit.practice.length > 20, `${unit.id} has no meaningful practice`);
    assert.ok(unit.acceptance.length > 20, `${unit.id} has no meaningful acceptance`);
    unit.competencyIds.forEach((id) => assert.ok(competencyIds.has(id), `${unit.id} references unknown competency ${id}`));
  }
});

test("competencies support reverse lookup and prerequisite traversal", () => {
  assert.ok(getUnitsForCompetency("eval").length >= 8);
  assert.equal(getCurriculumUnit(4)?.title, "Tool Design：工具不是 API 包装器");
  assert.deepEqual(getPrerequisiteChain("multi").map((item) => item.id), ["loop", "tools", "orchestrate", "context"]);
});
