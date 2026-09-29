// Prints a cloud routine's prompt and config from a crew file, so the main session can update a
// routine without assembling the prompt by hand: body plus the shared protocol for reporters, the
// body alone for the actor (front matter `protocol: none`), with {{OPS_ROOM_URL}} substituted.
//
//   npx tsx scripts/ops/build-routine.ts ops/crew/physio.md https://claude.ai/artifact/<id>
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_URL = "https://github.com/PoojaPS17/sports-stats-site";
/** Routines that call the GitHub API or push need the repository as a source. */
export const NEEDS_REPO = new Set(["physio", "editor", "steward", "groundsman"]);
export const REPORTER_TOOLS = ["ToolSearch", "ArtifactData", "Bash", "Read", "Glob", "Grep", "WebFetch", "WebSearch"];
export const ACTOR_TOOLS = [...REPORTER_TOOLS, "Write", "Edit", "PushNotification"];

export type Routine = {
  id: string;
  name: string;
  cron: string;
  model: string;
  kind: "reporter" | "actor";
  sources: string[];
  allowedTools: string[];
  prompt: string;
};

export function frontMatter(source: string): { fm: Record<string, string>; body: string } {
  const m = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error("no front matter block");
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return { fm, body: source.slice(m[0].length) };
}

export function buildRoutine(file: string, url: string): Routine {
  const { fm, body } = frontMatter(readFileSync(file, "utf8"));
  const kind = fm.kind === "actor" ? "actor" : "reporter";
  const protocol = fm.protocol === "none" ? "" : "\n\n" + readFileSync(join(dirname(file), "_protocol.md"), "utf8");
  const prompt = (body.trim() + protocol).replaceAll("{{OPS_ROOM_URL}}", url).trim() + "\n";
  const id = fm.id ?? basename(file, ".md");
  return {
    id,
    name: `Ops Room: ${fm.name} (${fm.role})`,
    cron: fm.schedule,
    model: fm.model,
    kind,
    sources: NEEDS_REPO.has(id) ? [REPO_URL] : [],
    allowedTools: kind === "actor" ? ACTOR_TOOLS : REPORTER_TOOLS,
    prompt,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [file, url] = process.argv.slice(2);
  if (!file || !url) {
    console.error("usage: build-routine.ts <crew file> <artifact url>");
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(buildRoutine(file, url), null, 2) + "\n");
}
