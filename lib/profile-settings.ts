export const learningPaces = ["relaxed", "steady", "intensive"] as const;
export type LearningPace = typeof learningPaces[number];
export type ProfileSettingsInput = { learningGoal?: unknown; weeklyHours?: unknown; timezone?: unknown; currentProject?: unknown; learningPace?: unknown };
export type ProfileSettings = { learningGoal: string; weeklyHours: number; timezone: string; currentProject: string | null; learningPace: LearningPace };

export class ProfileValidationError extends Error {}

export function validateProfileSettings(input: ProfileSettingsInput): ProfileSettings {
  const learningGoal = String(input.learningGoal ?? "").trim();
  const weeklyHours = Number(input.weeklyHours);
  const timezone = String(input.timezone ?? "").trim();
  const currentProject = String(input.currentProject ?? "").trim();
  const learningPace = String(input.learningPace ?? "steady") as LearningPace;
  if (learningGoal.length < 4 || learningGoal.length > 120) throw new ProfileValidationError("学习目标需要填写 4–120 个字符。");
  if (!Number.isInteger(weeklyHours) || weeklyHours < 1 || weeklyHours > 80) throw new ProfileValidationError("每周学习时间需要是 1–80 小时的整数。");
  if (currentProject.length > 120) throw new ProfileValidationError("当前项目不能超过 120 个字符。");
  if (!learningPaces.includes(learningPace)) throw new ProfileValidationError("学习节奏无效。");
  try { new Intl.DateTimeFormat("zh-CN", { timeZone: timezone }).format(); }
  catch { throw new ProfileValidationError("请选择有效的时区。"); }
  return { learningGoal, weeklyHours, timezone, currentProject: currentProject || null, learningPace };
}
