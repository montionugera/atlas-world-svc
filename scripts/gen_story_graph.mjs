#!/usr/bin/env node
// F-012 Task 5: static story-graph visualizer + drift gate.
// Reads the 7 story files via the SAME loadStory() the content gate uses
// (scripts/lib/story.mjs) and emits a deterministic Mermaid flowchart to
// docs/story/story-graph.md — one node per story node (colored by kind),
// one edge per cross-reference field (labeled by field name).
//
// --write (default): regenerate and overwrite docs/story/story-graph.md.
// --check: regenerate to a string and compare against the committed file;
//   exit 1 with a message on drift, exit 0 when in sync. CI runs --check
//   right after the content gate so a stale artifact fails the build.
//
// CONTENT_ROOT env var overrides the content root (default: `${ROOT}/content`)
// — used by the drift test to prove --check goes red against mutated
// content without touching the real content/ tree. The default path
// behavior (no env var) is unchanged from `${ROOT}/content`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STORY_KINDS, loadStory } from "./lib/story.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(ROOT, "docs/story/story-graph.md");

// Mermaid flowchart ids: node ids like "region-spawn-meadow" already contain
// only [a-z0-9-], which mermaid accepts bare, but we sanitize defensively
// (any non-alphanumeric -> "_") and always prefix "n_" so the sanitized id
// can never collide with a mermaid reserved word (`end`, `graph`, ...) even
// if content ever mints an id like "end" or "graph-foo".
const sanitize = (id) => `n_${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
// Escape characters that would break out of a mermaid `["..."]` label.
const escapeLabel = (s) => s.replace(/"/g, "&quot;");

const CLASS_STYLES = {
  // Acts render as their own Mermaid subgraph (see collectNodes/actOf below),
  // grouping their arcs and quests; this class colors the act node itself.
  act: "fill:#343A40,color:#fff,stroke:#212529,stroke-width:1px",
  region: "fill:#4C6EF5,color:#fff,stroke:#364FC7,stroke-width:1px",
  faction: "fill:#F76707,color:#fff,stroke:#D9480F,stroke-width:1px",
  character: "fill:#12B886,color:#fff,stroke:#087F5B,stroke-width:1px",
  arc: "fill:#BE4BDB,color:#fff,stroke:#862E9C,stroke-width:1px",
  quest: "fill:#FAB005,color:#000,stroke:#E67700,stroke-width:1px",
  event: "fill:#FA5252,color:#fff,stroke:#C92A2A,stroke-width:1px",
  dialogue: "fill:#868E96,color:#fff,stroke:#495057,stroke-width:1px",
  // lore.anchor renders as a regular edge (see collectEdges' `push(l.id,
  // "anchor", l.anchor)` below); this class colors the lore node itself.
  lore: "fill:#66D9E8,color:#000,stroke:#0B7285,stroke-width:1px",
};

// One row per story node, sorted by id — deterministic regardless of the
// order kinds/entries appear in their source files.
function collectNodes(byKind) {
  const list = [];
  for (const kind of STORY_KINDS)
    for (const n of byKind.get(kind) ?? []) list.push({ id: n.id, kind });
  list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return list;
}

// Mirrors the exact edge set resolveStoryRefs() / buildReverseRefIndex()
// walk in check_content.mjs: quest.giver/arcId/unlockedBy[]/faction/region,
// arc.questIds/actId, character.faction/region/diedAt, event.involves/
// triggeredBy/unlockedBy[], dialogue.speaker/context/unlockedBy[],
// faction.relationships[].factionId, lore.anchor. An edge whose target id
// doesn't resolve to any known node is skipped — validating that is the
// content gate's job (it runs before this in CI), not the visualizer's;
// drawing a dangling edge would just add a phantom mermaid node with no
// data behind it.
function collectEdges(nodes, byKind) {
  const edges = [];
  const push = (sourceId, field, targetId) => {
    if (targetId === undefined) return;
    if (!nodes.has(targetId)) return;
    edges.push({ source: sourceId, field, target: targetId });
  };

  for (const q of byKind.get("quest") ?? []) {
    push(q.id, "giver", q.giver);
    push(q.id, "arcId", q.arcId);
    for (const uid of q.unlockedBy ?? []) push(q.id, "unlockedBy", uid);
    push(q.id, "faction", q.faction);
    push(q.id, "region", q.region);
  }
  for (const a of byKind.get("arc") ?? []) {
    for (const qid of a.questIds ?? []) push(a.id, "questIds", qid);
    push(a.id, "actId", a.actId);
  }
  for (const c of byKind.get("character") ?? []) {
    push(c.id, "faction", c.faction);
    push(c.id, "region", c.region);
    push(c.id, "diedAt", c.diedAt);
  }
  for (const e of byKind.get("event") ?? []) {
    for (const iid of e.involves ?? []) push(e.id, "involves", iid);
    push(e.id, "triggeredBy", e.triggeredBy);
    for (const uid of e.unlockedBy ?? []) push(e.id, "unlockedBy", uid);
  }
  for (const d of byKind.get("dialogue") ?? []) {
    push(d.id, "speaker", d.speaker);
    push(d.id, "context", d.context);
    for (const uid of d.unlockedBy ?? []) push(d.id, "unlockedBy", uid);
  }
  for (const f of byKind.get("faction") ?? []) {
    for (const rel of f.relationships ?? []) push(f.id, "relationships", rel.factionId);
  }
  for (const l of byKind.get("lore") ?? []) push(l.id, "anchor", l.anchor);

  // Explicit final sort (source, then field, then target) makes output
  // deterministic independent of the collection order above.
  edges.sort((x, y) => {
    if (x.source !== y.source) return x.source < y.source ? -1 : 1;
    if (x.field !== y.field) return x.field < y.field ? -1 : 1;
    return x.target < y.target ? -1 : x.target > y.target ? 1 : 0;
  });
  return edges;
}

function renderMermaid(nodes, edges, storyNodes) {
  const lines = ["flowchart LR"];
  for (const kind of STORY_KINDS) lines.push(`  classDef ${kind} ${CLASS_STYLES[kind]}`);
  lines.push("");

  // Acts are rendered as Mermaid subgraphs: each act contains itself, its
  // arcs (arc.actId), and their quests (quest.arcId -> arc.actId). Every
  // other kind — and any arc/quest whose act chain doesn't resolve — renders
  // in the shared (act-less) lane. Deterministic: acts by order, members
  // keep collectNodes' id-sorted order.
  const actOf = (n) => {
    const node = storyNodes.get(n.id);
    if (node.kind === "act") return node.id;
    if (node.kind === "arc") return storyNodes.get(node.actId)?.kind === "act" ? node.actId : null;
    if (node.kind === "quest") {
      const arc = storyNodes.get(node.arcId);
      if (!arc || arc.kind !== "arc") return null;
      return storyNodes.get(arc.actId)?.kind === "act" ? arc.actId : null;
    }
    return null;
  };
  const acts = [...storyNodes.values()].filter((n) => n.kind === "act").sort((a, b) => a.order - b.order);
  const grouped = new Map(acts.map((a) => [a.id, []]));
  const shared = [];
  for (const n of nodes) {
    const actId = actOf(n);
    if (actId !== null && grouped.has(actId)) grouped.get(actId).push(n);
    else shared.push(n);
  }

  const nodeLine = (n) => `${sanitize(n.id)}["${escapeLabel(n.id)}"]:::${n.kind}`;
  for (const act of acts) {
    lines.push(`  subgraph sg_${sanitize(act.id)}["${escapeLabel(`Act ${act.order} — ${act.title}`)}"]`);
    for (const n of grouped.get(act.id)) lines.push(`    ${nodeLine(n)}`);
    lines.push("  end");
  }
  for (const n of shared) lines.push(`  ${nodeLine(n)}`);
  lines.push("");
  for (const e of edges) lines.push(`  ${sanitize(e.source)} -->|${e.field}| ${sanitize(e.target)}`);
  return `${lines.join("\n")}\n`;
}

function renderMarkdown(mermaid) {
  return `# Story Graph

Generated by \`scripts/gen_story_graph.mjs\` — do not hand-edit. Regenerate with
\`node scripts/gen_story_graph.mjs --write\`; CI runs
\`node scripts/gen_story_graph.mjs --check\` right after the content gate and
fails the build if this file is stale.

Nodes are colored by kind (act / region / faction / character / arc /
quest / event / dialogue / lore). Acts are rendered as subgraphs
containing their arcs (arc.actId) and those arcs' quests (quest.arcId);
every other node renders in the shared (act-less) lane. Edges are
labeled by the source field: quest.giver / arcId / unlockedBy / faction /
region, arc.questIds / actId, character.faction / region / diedAt,
event.involves / triggeredBy / unlockedBy, dialogue.speaker / context /
unlockedBy, faction.relationships, lore.anchor.

\`\`\`mermaid
${mermaid}\`\`\`
`;
}

function parseArgs(argv) {
  let check = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") check = true;
    else if (a === "--write") check = false;
    else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return { check };
}

function main() {
  const { check } = parseArgs(process.argv);

  const contentRoot = process.env.CONTENT_ROOT ? resolve(process.env.CONTENT_ROOT) : join(ROOT, "content");

  const failures = [];
  const fail = (m) => failures.push(m);
  const story = loadStory(contentRoot, fail);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL  ${f}`);
    console.error("gen_story_graph: story content failed to load — fix content-gate failures first");
    process.exitCode = 1;
    return;
  }

  const nodes = collectNodes(story.byKind);
  const edges = collectEdges(story.nodes, story.byKind);
  const markdown = renderMarkdown(renderMermaid(nodes, edges, story.nodes));

  if (check) {
    let existing;
    try { existing = readFileSync(OUT_PATH, "utf8"); }
    catch (e) { console.error(`gen_story_graph --check: cannot read ${OUT_PATH}: ${e.message}`); process.exitCode = 1; return; }
    if (existing !== markdown) {
      console.error(`gen_story_graph --check: docs/story/story-graph.md is out of date — run "node scripts/gen_story_graph.mjs --write" and commit the result`);
      process.exitCode = 1;
      return;
    }
    console.log(`gen_story_graph --check: docs/story/story-graph.md is in sync (${nodes.length} nodes, ${edges.length} edges)`);
    return;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, markdown);
  console.log(`gen_story_graph: wrote ${OUT_PATH} (${nodes.length} nodes, ${edges.length} edges)`);
}

main();
