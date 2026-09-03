export type LearningNotification = { id: string; type: "review" | "stalled" | "weekly_plan"; priority: "high" | "normal"; title: string; message: string; actionLabel: string; actionHref: string };
export type NotificationState = { competencyId: string; name: string; mastery: number; confidence: number; reviewDueAt?: string | null };
export type NotificationTask = { id: string; title: string; competencyId: string; createdAt: string };

export function buildLearningNotifications(states: NotificationState[], task: NotificationTask | null, weeklyHours: number, now = new Date()): LearningNotification[] {
  const notifications: LearningNotification[] = [];
  if (task && ageInDays(task.createdAt, now) >= 3) notifications.push({ id: `stalled:${task.id}`, type: "stalled", priority: "high", title: "当前任务可能卡住了", message: `「${task.title}」已连续 3 天以上未完成。可以先问老师缩小任务，或提交当前进度获得反馈。`, actionLabel: "回到任务", actionHref: "#today-focus" });
  states.filter((state) => isDue(state.reviewDueAt, now)).sort((a, b) => dateValue(a.reviewDueAt) - dateValue(b.reviewDueAt)).slice(0, 3).forEach((state) => notifications.push({ id: `review:${state.competencyId}:${state.reviewDueAt}`, type: "review", priority: "high", title: `该复习「${state.name}」了`, message: `上次掌握度 ${state.mastery}%、置信度 ${state.confidence}%。完成一次短测，确认能力没有退化。`, actionLabel: "去做小测", actionHref: "#quick-quiz" }));
  const priority = [...states].sort((a, b) => a.mastery - b.mastery || a.confidence - b.confidence)[0];
  notifications.push({ id: weeklyId(now), type: "weekly_plan", priority: "normal", title: "本周学习建议", message: priority ? `本周可投入 ${weeklyHours} 小时。优先巩固「${priority.name}」，其余时间完成当前任务并复盘反馈。` : `本周可投入 ${weeklyHours} 小时。先完成当前任务，建立第一份能力基线。`, actionLabel: "查看今日任务", actionHref: "#today-focus" });
  return notifications;
}

function normalize(value: string) { return value.includes("T") ? value : `${value.replace(" ", "T")}Z`; }
function dateValue(value?: string | null) { if (!value) return Number.POSITIVE_INFINITY; const date = new Date(normalize(value)); return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime(); }
function isDue(value: string | null | undefined, now: Date) { return dateValue(value) <= now.getTime(); }
function ageInDays(value: string, now: Date) { const timestamp = dateValue(value); return Number.isFinite(timestamp) ? Math.floor((now.getTime() - timestamp) / 86_400_000) : 0; }
function weeklyId(now: Date) { const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); return `weekly:${monday.toISOString().slice(0, 10)}`; }
