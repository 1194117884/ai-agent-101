import assert from "node:assert/strict";
import test from "node:test";
import { classifyCoachQuestion } from "../lib/coach-guidance.ts";

test("classifies learner questions into distinct teaching strategies", () => {
  assert.equal(classifyCoachQuestion("线上报错 500，日志看不懂").issueType, "debugging");
  assert.equal(classifyCoachQuestion("我基础不够，需要先学什么？").issueType, "prerequisite");
  assert.equal(classifyCoachQuestion("这段工具代码怎么实现？").issueType, "implementation");
  assert.equal(classifyCoachQuestion("我想从零完整学习整个 Agent 系统").issueType, "scope");
  assert.equal(classifyCoachQuestion("description 和 schema 有什么区别？").issueType, "concept");
});
