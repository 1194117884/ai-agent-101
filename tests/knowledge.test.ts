import assert from "node:assert/strict";
import test from "node:test";
import { knowledgeLexicalScore, knowledgeSearchTerms, MAX_DOCUMENT_CHARS, normalizeKnowledgeText, splitKnowledgeText, validateKnowledgeDocument } from "../lib/knowledge.ts";

test("normalizes and splits knowledge with stable overlap", () => {
  const text = `第一段。\r\n\r\n\r\n${"Agent 工具契约需要明确输入输出。".repeat(120)}`;
  const chunks = splitKnowledgeText(text, 240, 30);
  assert.ok(chunks.length > 3);
  assert.equal(chunks[0].ordinal, 0);
  assert.ok(chunks.every((chunk) => chunk.content.length <= 240 && chunk.tokenEstimate > 0));
  assert.doesNotMatch(normalizeKnowledgeText(text), /\n\n\n/);
});

test("scores Chinese and English retrieval terms", () => {
  assert.ok(knowledgeSearchTerms("Agent 工具调用失败如何恢复").includes("agent"));
  assert.ok(knowledgeSearchTerms("Agent 工具调用失败如何恢复").includes("工具"));
  assert.ok(knowledgeLexicalScore("tool schema", "A tool schema defines JSON parameters") > knowledgeLexicalScore("tool schema", "unrelated memory notes"));
});

test("validates review metadata and document size", () => {
  const valid = { title: "Tool Design", sourceType: "manual" as const, trustLevel: "primary" as const, status: "approved" as const, topicIds: ["tools"], content: "这是一份足够长的 Agent 工具设计课程资料，用于验证知识库录入。" };
  assert.doesNotThrow(() => validateKnowledgeDocument(valid));
  assert.throws(() => validateKnowledgeDocument({ ...valid, url: "file:///etc/passwd" }), /HTTP/);
  assert.throws(() => validateKnowledgeDocument({ ...valid, content: "x".repeat(MAX_DOCUMENT_CHARS + 1) }), /不能超过/);
});
