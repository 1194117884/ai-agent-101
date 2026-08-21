export const KEY_FAILURE_THRESHOLD = 3;
export const KEY_COOLDOWN_MS = 5 * 60 * 1000;

export type KeyHealth = { failureCount: number; lastUsedAt: string | null };

export function isKeyCoolingDown(key: KeyHealth, now = Date.now()) {
  if (key.failureCount < KEY_FAILURE_THRESHOLD || !key.lastUsedAt) return false;
  const lastAttempt = Date.parse(key.lastUsedAt);
  return Number.isFinite(lastAttempt) && now - lastAttempt < KEY_COOLDOWN_MS;
}

export function selectRunnableKeys<T extends KeyHealth>(keys: T[], now = Date.now()): T[] {
  const ready = keys.filter((key) => !isKeyCoolingDown(key, now));
  if (ready.length || keys.length === 0) return ready;
  // Keep one probe alive so a fully cooled-down channel can recover automatically.
  return [keys.reduce((oldest, key) => Date.parse(key.lastUsedAt ?? "") < Date.parse(oldest.lastUsedAt ?? "") ? key : oldest)];
}
