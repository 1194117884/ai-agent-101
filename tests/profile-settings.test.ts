import assert from "node:assert/strict";
import test from "node:test";
import { ProfileValidationError, validateProfileSettings } from "../lib/profile-settings.ts";

test("normalizes valid learner settings", () => {
  assert.deepEqual(validateProfileSettings({ learningGoal: " 完成客服 Agent ", weeklyHours: "10", timezone: "Asia/Shanghai", currentProject: " ", learningPace: "intensive" }), { learningGoal: "完成客服 Agent", weeklyHours: 10, timezone: "Asia/Shanghai", currentProject: null, learningPace: "intensive" });
});

test("rejects invalid hours, timezones and pace", () => {
  assert.throws(() => validateProfileSettings({ learningGoal: "完成项目", weeklyHours: 0, timezone: "Asia/Shanghai", learningPace: "steady" }), ProfileValidationError);
  assert.throws(() => validateProfileSettings({ learningGoal: "完成项目", weeklyHours: 8, timezone: "Mars/Base", learningPace: "steady" }), /时区/);
  assert.throws(() => validateProfileSettings({ learningGoal: "完成项目", weeklyHours: 8, timezone: "Asia/Shanghai", learningPace: "fast" }), /节奏/);
});
