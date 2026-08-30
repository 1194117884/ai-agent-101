export type KnowledgeSource = { documentId: string; title: string; url: string | null; versionLabel: string | null; trustLevel: string };
export type KnowledgeConflict = { key: string; title: string; versions: string[]; documentIds: string[] };

function sourceIdentity(source: KnowledgeSource) {
  if (source.url && /^https?:\/\//i.test(source.url)) {
    try { const url = new URL(source.url); url.hash = ""; return `url:${url.toString().replace(/\/$/, "").toLowerCase()}`; }
    catch { /* Fall back to the title when a legacy URL is malformed. */ }
  }
  return `title:${source.title.trim().toLowerCase().replace(/\s+/g, " ")}`;
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
    return group.length > 1 && versions.length > 1 ? [{ key, title: group[0].title, versions, documentIds: group.map((item) => item.documentId) }] : [];
  });
}
