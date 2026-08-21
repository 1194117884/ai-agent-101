import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const sourcePath = new URL("../agent_30_day_bootcamp.html", import.meta.url);
const outputPath = new URL("../curriculum/catalog.generated.json", import.meta.url);
const html = await readFile(sourcePath, "utf8");

function extractArray(name) {
  const marker = `const ${name}=`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${name} in curriculum source`);
  const arrayStart = html.indexOf("[", start + marker.length);
  let depth = 0; let quote = ""; let escaped = false;
  for (let index = arrayStart; index < html.length; index++) {
    const char = html[index];
    if (quote) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = ""; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "[") depth++;
    if (char === "]" && --depth === 0) return vm.runInNewContext(`(${html.slice(arrayStart, index + 1)})`);
  }
  throw new Error(`Unterminated ${name} array`);
}

const prerequisites = {
  loop: [], tools: ["loop"], eval: ["loop"], context: ["loop"], reliability: ["loop", "tools"], security: ["tools", "contracts"], contracts: ["loop"], skills: ["tools", "context"], mcp: ["tools", "contracts"], observe: ["loop"], longrun: ["context", "reliability"], reason: ["loop"], memory: ["context"], orchestrate: ["loop", "tools"], deploy: ["reliability", "observe"], rag: ["context", "tools"], multi: ["orchestrate", "context"], advanced: ["reason", "eval"],
};
const phases = extractArray("phases");
const competencies = extractArray("topics").map((topic) => ({ ...topic, prerequisites: prerequisites[topic.id] ?? [] }));
const units = extractArray("days").map((day) => ({ id: `day-${day.d}`, day: day.d, stageId: day.phase, title: day.title, priority: day.prio, projectTracks: day.projects, competencyIds: day.topics, prerequisites: [...new Set(day.topics.flatMap((id) => prerequisites[id] ?? []))], objectives: day.learn, readings: day.read, practice: day.build, acceptance: day.accept, sourcePolicy: "v2-path+v1-capability" }));
const sources = extractArray("sources").map((source, index) => ({ id: `source-${String(index + 1).padStart(2, "0")}`, title: source.name, type: source.kind, note: source.note, url: source.url, status: "reviewed", trustLevel: /Official|Spec|Anthropic|OpenAI/.test(`${source.kind} ${source.name}`) ? "primary" : "reference" }));

const catalog = { version: "2026.08.21", policy: "教学阶段以修订版 v2 为唯一默认路径；原版提供能力、练习、验收与资料来源。", generatedFrom: ["agent_30_day_bootcamp_v2.html", "agent_30_day_bootcamp.html"], phases, competencies, units, sources };
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Generated ${competencies.length} competencies, ${units.length} units, ${sources.length} sources.`);
