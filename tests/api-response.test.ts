import assert from "node:assert/strict";
import test from "node:test";
import { apiError } from "../lib/api-response.ts";

test("API errors expose a stable machine code and user-facing message", async () => {
  const response = apiError("请先登录。", 401, "AUTH_REQUIRED");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "请先登录。", code: "AUTH_REQUIRED" });
});
