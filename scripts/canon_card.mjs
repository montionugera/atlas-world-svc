import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const table = (head, rows) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

export function renderCanonCard(g) {
  return [
    "# Atlas: The Cala Knight - Canon Card",
    `<!-- generated from content/studio/canon/glossary.json by scripts/canon_card.mjs; do not edit -->`,
    `## Premise\n\n**${g.premise.canon}**\n\n${g.premise.opening.map((l) => `> ${l}`).join("\n")}`,
    `## Naming rule\n\n${g.naming_rule.map((r) => `- ${r}`).join("\n")}`,
    `## Races and home towns\n\n${table(["Race", "Home town", "Root", "Theme"], g.races.map((r) => [r.name, r.home_town, r.root, r.theme]))}`,
    `## Gods and kilns\n\n${table(["God", "Domain", "Kiln", "Region"], g.gods.map((x) => [`${x.name}, ${x.title}`, x.domain, x.kiln, x.kiln_region]))}\n\nArchitect: ${g.architect.name}, ${g.architect.title} (${g.architect.alt_title}).`,
    `## Regions\n\n${g.regions.map((r) => `- ${r.name}${r.status === "proposed" ? " (proposed)" : ""}`).join("\n")}`,
    `## Titles\n\n${g.titles.map((t) => `- **${t.name}**: ${t.meaning}`).join("\n")}\n- **The Last Cala Knight**: ${g.last_cala_knight.player_facing}`,
    `## Economy\n\n${table(["New", "Meaning"], g.economy.map((e) => [e.new, e.meaning]))}`,
    `## Travellers\n\n${g.npcs.model}\n\n${table(["Name", "Gender / age", "Race", "Home town"], g.npcs.travellers.map((t) => [t.name, `${t.gender} ${t.age}`, t.race, t.home_town]))}`,
    `## Maro Bell cast (prototype)\n\n${table(["Name", "Thai", "Role", "Age", "Want", "Secret", "Voice"], g.npcs.town.maro_bell.map((n) => [n.name, n.thai, n.role, String(n.age), n.want, n.secret, n.voice]))}`,
    `## Scar renames\n\n${table(["Town", "Role", "Retired", "New name", "Thai", "Root"], g.npcs.scar_renames.map((r) => [r.town, r.role, r.retired, r.name, r.thai, r.root]))}`,
    `## Landmarks\n\n${Object.values(g.landmarks).map((l) => `- **${l.name}** (${l.thai}): ${l.description} Composition: ${l.composition}`).join("\n")}`,
    `## Maro Bell prologue quests\n\n${table(["ID", "Name / giver", "Lv", "Objective", "Beat", "Reward", "Flag"], g.prologues.maro_bell.quests.map((q) => [q.id, `${q.name} / ${q.giver}`, String(q.lv), q.objective, q.beat, q.reward, q.flag ?? ""]))}`,
    `## Lantern Vermin\n\n${table(["Mob", "Thai", "Lv", "Behaviour"], g.mob_families.lantern_vermin.mobs.map((m) => [m.name, m.thai, String(m.lv), m.behaviour]))}`,
    `## Kilnwatch Wardens\n\nJoining quest: ${g.wardens.joining_quest.id} "${g.wardens.joining_quest.name}" (Lv ${g.wardens.joining_quest.lv}): ${g.wardens.joining_quest.objective}. ${g.wardens.joining_quest.rule}\n\n${table(["Rank", "Thai", "Requirement", "Unlocks"], g.wardens.ranks.map((r) => [r.name, r.thai, r.requirement, r.unlocks]))}\n\nNever gated: ${g.wardens.never_gated.join(", ")}\n\nLeave / return: ${g.wardens.leave_return}\n\nLegend link: ${g.wardens.legend_link}`,
    `## Chapters\n\n${table(["Ch", "Title", "Region / Kiln", "Lv", "Shared event", "Personal outcome", "Boss"], g.chapters.map((c) => [c.ch, c.title, c.region, c.lv, c.shared_event, c.personal_outcome, c.boss]))}`,
    `## Never use (retired names)\n\n${g.retired_names.join(", ")}`,
  ].join("\n\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const g = JSON.parse(readFileSync(join(root, "content/studio/canon/glossary.json"), "utf8"));
  writeFileSync(join(root, "content/studio/canon/canon-card.md"), renderCanonCard(g));
}
