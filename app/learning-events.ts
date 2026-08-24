export const LEARNING_STATE_UPDATED = "agent-coach:learning-state-updated";
export function notifyLearningStateUpdated() { window.dispatchEvent(new Event(LEARNING_STATE_UPDATED)); }
