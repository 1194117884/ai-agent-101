export function rubricLabels(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    const items = Array.isArray(parsed) ? parsed : isRubricEnvelope(parsed) ? parsed.criteria : [];
    return items.map((item) => typeof item === "string" ? item : isLabelled(item) ? item.label : "").filter(Boolean);
  } catch { return []; }
}

export function rubricAssessmentId(value: string): string | null {
  try { const parsed: unknown = JSON.parse(value); return isRubricEnvelope(parsed) && typeof parsed.assessmentId === "string" ? parsed.assessmentId : null; }
  catch { return null; }
}

function isRubricEnvelope(value: unknown): value is { assessmentId?: string; criteria: unknown[] } {
  return typeof value === "object" && value !== null && "criteria" in value && Array.isArray(value.criteria);
}

function isLabelled(value: unknown): value is { label: string } {
  return typeof value === "object" && value !== null && "label" in value && typeof value.label === "string";
}
