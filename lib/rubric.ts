export function rubricLabels(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => typeof item === "string" ? item : isLabelled(item) ? item.label : "").filter(Boolean);
  } catch { return []; }
}

function isLabelled(value: unknown): value is { label: string } {
  return typeof value === "object" && value !== null && "label" in value && typeof value.label === "string";
}
