import assert from "node:assert/strict";
import test from "node:test";
import { knowledgeLexicalScore, knowledgeSearchTerms, MAX_DOCUMENT_CHARS, normalizeKnowledgeText, splitKnowledgeText, validateKnowledgeDocument } from "../lib/knowledge.ts";
import { assertImportContent, htmlToKnowledgeText, importedTitle, pageTitle, validateImportUrl } from "../lib/knowledge-import.ts";
import { evaluateRetrievedKnowledge, parseExpectedTerms } from "../lib/knowledge-eval-core.ts";

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

test("sanitizes imported HTML and derives useful metadata", () => {
  const html = "<html><head><title>Tool &amp; Agent Guide</title><style>.x{}</style></head><body><nav>菜单</nav><main><h1>工具设计</h1><p>description 决定何时调用。</p><script>alert(1)</script></main></body></html>";
  const text = htmlToKnowledgeText(html);
  assert.match(text, /工具设计/);
  assert.match(text, /description 决定何时调用/);
  assert.doesNotMatch(text, /alert|菜单|\.x/);
  assert.equal(pageTitle(html, new URL("https://example.com/guide")), "Tool & Agent Guide");
  assert.equal(importedTitle("notes/tool-contract.md"), "tool-contract");
  assert.equal(assertImportContent(text), text);
});

test("blocks private import targets and unsafe URL forms", () => {
  assert.equal(validateImportUrl("https://example.com/guide").hostname, "example.com");
  for (const value of ["http://127.0.0.1", "http://10.0.0.8", "http://192.168.1.1", "http://[::1]", "http://metadata.google.internal", "https://user:pass@example.com"]) assert.throws(() => validateImportUrl(value), /不允许|只允许/);
});

test("evaluates expected RAG document and terms", () => {
  assert.deepEqual(parseExpectedTerms('["schema","参数",3]'), ["schema", "参数"]);
  assert.equal(evaluateRetrievedKnowledge("doc-1", ["schema", "参数"], "JSON schema 定义参数类型", [{ documentId: "doc-1" }]).passed, true);
  const failed = evaluateRetrievedKnowledge("doc-2", ["schema", "恢复"], "schema 参数", [{ documentId: "doc-1" }]);
  assert.equal(failed.documentPassed, false);
  assert.deepEqual(failed.missingTerms, ["恢复"]);
});
