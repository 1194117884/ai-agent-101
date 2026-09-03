import { getCurriculumUnit } from "../curriculum/catalog.ts";
import type { CoachLearningContext } from "./coach-context.ts";

export type CoachToolDefinition = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
};

export type CoachToolRuntime = {
  definitions: CoachToolDefinition[];
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown>;
};

export function createCoachTools(context: CoachLearningContext): CoachToolRuntime {
  return {
    definitions: [
      {
        name: "get_learning_context",
        description: "读取当前学习者的任务、能力掌握度和近期证据。仅在需要核对学习状态时调用，不修改任何数据。",
        inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
      },
      {
        name: "get_curriculum_unit",
        description: "按 Day 1–30 读取一个课程单元的目标、练习和验收标准。仅在需要精确课程细节时调用。",
        inputSchema: { type: "object", properties: { day: { type: "integer", minimum: 1, maximum: 30, description: "课程天数" } }, required: ["day"], additionalProperties: false },
      },
    ],
    async execute(name, input) {
      if (name === "get_learning_context") return context;
      if (name === "get_curriculum_unit") {
        const day = Number(input.day);
        if (!Number.isInteger(day) || day < 1 || day > 30) return { error: "day 必须是 1–30 的整数", nextStep: "使用有效课程天数重试" };
        const unit = getCurriculumUnit(day);
        return unit ? { day: unit.day, title: unit.title, competencyIds: unit.competencyIds, objectives: unit.objectives, practice: unit.practice, acceptance: unit.acceptance, sourcePolicy: unit.sourcePolicy } : { error: "课程单元不存在", nextStep: "核对 day 后重试" };
      }
      return { error: `未知工具：${name}`, nextStep: "仅使用已提供的工具名称" };
    },
  };
}
