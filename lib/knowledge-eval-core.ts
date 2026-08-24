export function parseExpectedTerms(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((term): term is string => typeof term === "string" && !!term.trim()) : []; }
  catch { return []; }
}

export function evaluateRetrievedKnowledge(expectedDocumentId: string | null, expectedTerms: string[], context: string, sources: { documentId: string }[]) {
  const normalized = context.toLowerCase();
  const missingTerms = expectedTerms.filter((term) => !normalized.includes(term.toLowerCase()));
  const documentPassed = !expectedDocumentId || sources.some((source) => source.documentId === expectedDocumentId);
  return { passed: documentPassed && missingTerms.length === 0, documentPassed, missingTerms };
}
