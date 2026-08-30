export type KnowledgeSource = { documentId: string; title: string; url: string | null; versionLabel: string | null; trustLevel: string };
export type KnowledgeConflict = { key: string; title: string; versions: string[]; documentIds: string[]; preferredDocumentId: string | null; preferredVersion: string | null; preferenceReason: "authority" | "newer_version" | "uncertain" };

const TRUST_BOOST: Record<string, number> = { primary: 0.08, trusted: 0.04, reference: 0 };
const TRUST_RANK: Record<string, number> = { primary: 3, trusted: 2, reference: 1 };

export function knowledgeRankingScore(vectorScore: number, lexicalScore: number, trustLevel: string) {
  return vectorScore * 4 + lexicalScore + (TRUST_BOOST[trustLevel] ?? 0);
}

function sourceIdentity(source: KnowledgeSource) {
  if (source.url && /^https?:\/\//i.test(source.url)) {
    try { const url = new URL(source.url); url.hash = ""; return `url:${url.toString().replace(/\/$/, "").toLowerCase()}`; }
    catch { /* Fall back to the title when a legacy URL is malformed. */ }
  }
  return `title:${source.title.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function versionParts(label: string | null) {
  if (!label) return null;
  const parts = label.match(/\d+/g)?.map(Number) ?? [];
  return parts.length ? parts : null;
}

function compareVersions(a: string | null, b: string | null) {
  const left = versionParts(a); const right = versionParts(b);
  if (!left || !right) return 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function preferredSource(group: KnowledgeSource[]) {
  const authority = Math.max(...group.map((source) => TRUST_RANK[source.trustLevel] ?? 0));
  const trusted = group.filter((source) => (TRUST_RANK[source.trustLevel] ?? 0) === authority);
  if (trusted.length === 1) return { source: trusted[0], reason: "authority" as const };
  const ordered = [...trusted].sort((a, b) => compareVersions(b.versionLabel, a.versionLabel));
  if (ordered.length > 1 && compareVersions(ordered[0].versionLabel, ordered[1].versionLabel) > 0) return { source: ordered[0], reason: "newer_version" as const };
  return { source: null, reason: "uncertain" as const };
}

export function detectKnowledgeConflicts(sources: KnowledgeSource[]): KnowledgeConflict[] {
  const groups = new Map<string, KnowledgeSource[]>();
  for (const source of sources) {
    const key = sourceIdentity(source);
    const group = groups.get(key) ?? [];
    if (!group.some((item) => item.documentId === source.documentId)) group.push(source);
    groups.set(key, group);
  }
  return [...groups.entries()].flatMap(([key, group]) => {
    const versions = [...new Set(group.map((item) => item.versionLabel?.trim()).filter((value): value is string => !!value))];
    if (group.length <= 1 || versions.length <= 1) return [];
    const preferred = preferredSource(group);
    return [{ key, title: group[0].title, versions, documentIds: group.map((item) => item.documentId), preferredDocumentId: preferred.source?.documentId ?? null, preferredVersion: preferred.source?.versionLabel ?? null, preferenceReason: preferred.reason }];
  });
}
