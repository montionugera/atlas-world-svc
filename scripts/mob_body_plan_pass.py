#!/usr/bin/env python3
"""F-167 pass: repair filler boss names and tag "upright monster" rows.

Reads a picks file (row key -> new name / race / body kin) and applies it to the
atlas. Only `name`, `race_key`, `race_badge`, `body_plan`, `body_kin` on dungeon
spawn rows, and strings that hold an old name, are ever changed. Idempotent.

    python3 scripts/mob_body_plan_pass.py [--atlas PATH] [--picks PATH]
                                          [--targets PATH] [--check]

Exit 0 on success; exit 1 with one line per problem on stderr. --check runs every
validation on the simulated result and writes nothing; an un-applied atlas with
valid picks exits 0.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ATLAS = "content/studio/t_shaped_world_atlas.json"
DEFAULT_PICKS = "content/studio/mob_body_plan_picks.json"

# Pinned in F-167 Task 1 Step 1 (59 / 61 / 60 per tier). Task 2 copies this unchanged.
FILLER_RE_SOURCE = (
    r"^(?:\[Mini-Boss\] )?(?:B\d+|\d+F) .+ Overseer$"
    r"|^(?:\[Raid Boss\] )?(?:.+ )?Seal Warden$"
    r"|^(?:\[MVP\] )?(?:.+ Apostle Sovereign|Apostle Vanguard Manifestation)$"
    r"|^Mini-Boss · (?:B\d+|\d+F) (?:Keeper|Overseer)$"
)
FILLER_RE = re.compile(FILLER_RE_SOURCE)

# Global Constraints of the F-167 plan: target and gate range per tier.
DEFAULT_TARGETS = {
    "Monster": {"target": 10, "min": 8, "max": 12},
    "Mini-Boss": {"target": 20, "min": 18, "max": 22},
    "Raid": {"target": 26, "min": 24, "max": 28},
    "MVP": {"target": 33, "min": 31, "max": 35},
}
TIERS = list(DEFAULT_TARGETS)
TIER_LABEL = {"Monster": "Normal", "Mini-Boss": "Mini-Boss", "Raid": "Raid", "MVP": "MVP"}

PLAYABLE_RACES = {"human_demi_human", "lunar", "ogre_orc", "dwarf", "dark_lunar", "furral"}
BODY_KIN_RACE = {
    "scale_kin": "beast_animal_brute",
    "hound_kin": "beast_animal_brute",
    "boar_kin": "beast_animal_brute",
    "mantis_kin": "insect_arachnia",
    "beetle_kin": "insect_arachnia",
    "tide_kin": "fish",
    "bark_kin": "plant",
    "bone_kin": "undead",
}
RACE_LABEL = {
    "beast_animal_brute": "Beast",
    "insect_arachnia": "Insect",
    "fish": "Fish",
    "plant": "Plant",
    "undead": "Undead",
    "robotic": "Robotic",
}
NPC_FROZEN = 29001
PREFIX_RE = re.compile(r"^\[[^\]]+\] ")
TAIL_RE = re.compile(r" \([^()]*\)$")


def highlight_splits(s: str) -> list[tuple[str, str, str]]:
    """Every (head, name, tail) reading of a floor highlight "head · name (Tier)".

    A boss name may itself hold " · ", so each " · " is tried as the head/name cut.
    """
    t = TAIL_RE.search(s)
    tail = t.group(0) if t else ""
    body = s[: t.start()] if t else s
    cuts = [0] + [m.end() for m in re.finditer(re.escape(" · "), body)]
    return [(body[:c], body[c:], tail) for c in cuts if body[c:]]


def tier_of(row: dict) -> str | None:
    et = row.get("entity_type")
    if et == "RaidBoss":
        return "Raid"
    return et if et in TIER_LABEL else None


def strip_prefix(name: str) -> str:
    return PREFIX_RE.sub("", name, count=1)


def race_label(race_key: str) -> str:
    return RACE_LABEL.get(race_key) or race_key.replace("_", " ").title()


def derive_badge(race_key: str, tier: str | None) -> str:
    return f"{race_label(race_key)} · {TIER_LABEL.get(tier or '', tier or '')}"


def is_filler(s: str) -> bool:
    """The string itself, or for floor highlights the boss name inside it."""
    return bool(FILLER_RE.search(s)) or any(
        name != s and FILLER_RE.search(name) for _, name, _ in highlight_splits(s)
    )


def walk_strings(node: Any, path: str = ""):
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from walk_strings(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk_strings(v, f"{path}[{i}]")


def steppe_dungeon_ids(atlas: dict, errors: list[str]) -> set[str]:
    steppe = {
        c.get("continent_id")
        for c in atlas.get("t_breadth_continents") or []
        if str(c.get("name", "")).startswith("The Clockwork Steppe")
    }
    zone_continent: dict[str, str] = {}
    for group in (atlas.get("t_breadth_zone_directory") or {}).values():
        if isinstance(group, list):
            for z in group:
                if isinstance(z, dict) and z.get("zone_id"):
                    zone_continent[z["zone_id"]] = z.get("continent_id")
    out: set[str] = set()
    for d in atlas.get("multi_floor_dungeons") or []:
        did = d.get("dungeon_id")
        if did not in zone_continent:
            errors.append(f"dungeon {did}: not found in t_breadth_zone_directory, cannot place it on a continent")
        elif zone_continent[did] in steppe:
            out.add(did)
    return out


def replace_in_highlight(s: str, pairs: list[tuple[str, str]]) -> str:
    for head, name, tail in highlight_splits(s):
        for old, new in pairs:
            if name == old:
                return head + new + tail
    return s


def load_json(path: Path, what: str, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"{what} file not found: {path}")
    except (OSError, ValueError) as e:
        errors.append(f"{what} file unreadable ({path}): {e}")
    return None


def dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def run(atlas_path: Path, picks_path: Path, targets: dict, check: bool) -> list[str]:
    errors: list[str] = []
    try:
        raw = atlas_path.read_text(encoding="utf-8")
        atlas = json.loads(raw)
    except FileNotFoundError:
        return [f"atlas file not found: {atlas_path}"]
    except (OSError, ValueError) as e:
        return [f"atlas file unreadable ({atlas_path}): {e}"]
    picks = load_json(picks_path, "picks", errors)
    if picks is None:
        return errors
    if not isinstance(picks, dict) or not isinstance(picks.get("entries", []), list):
        return [f"picks file {picks_path}: expected an object with an 'entries' list"]

    out = copy.deepcopy(atlas)
    steppe = steppe_dungeon_ids(out, errors)

    rows: dict[str, dict] = {}
    floors: dict[str, dict] = {}
    row_floor: dict[str, str] = {}
    row_dungeon: dict[str, str] = {}
    for d in out.get("multi_floor_dungeons") or []:
        for f in d.get("floors") or []:
            fkey = f"{d.get('dungeon_id')}/{f.get('floor_id')}"
            floors[fkey] = f
            for i, s in enumerate(f.get("spawns") or []):
                k = f"{fkey}/{i}"
                rows[k] = s
                row_floor[k] = fkey
                row_dungeon[k] = d.get("dungeon_id")

    keep_robotic = picks.get("keep_robotic") or []
    for k in keep_robotic:
        if k not in rows:
            errors.append(f"keep_robotic: unknown row {k}")

    # 1. Validate entries.
    entries: dict[str, dict] = {}
    for n, e in enumerate(picks.get("entries") or []):
        k = e.get("row") if isinstance(e, dict) else None
        if not isinstance(k, str):
            errors.append(f"entries[{n}]: missing 'row'")
            continue
        if k in entries:
            errors.append(f"{k}: duplicate picks entry")
            continue
        if k not in rows:
            errors.append(f"{k}: unknown row in picks")
            continue
        row = rows[k]
        if row.get("npc_id") == NPC_FROZEN or e.get("npc_id") == NPC_FROZEN:
            errors.append(f"{k}: npc_id {NPC_FROZEN} must stay exactly as it is, no picks entry allowed")
            continue
        race = e.get("race_key")
        if not isinstance(race, str) or not race:
            errors.append(f"{k}: entry needs a race_key")
            continue
        kin = e.get("body_kin")
        if kin is not None:
            if race in PLAYABLE_RACES or race == "robotic":
                errors.append(f"{k}: race_key {race} cannot carry body_kin {kin}")
                continue
            if kin not in BODY_KIN_RACE:
                errors.append(f"{k}: unknown body_kin {kin}")
                continue
            if BODY_KIN_RACE[kin] != race:
                errors.append(f"{k}: body_kin {kin} needs race_key {BODY_KIN_RACE[kin]}, got {race}")
                continue
            if k in keep_robotic:
                errors.append(f"{k}: keep_robotic row cannot carry body_kin")
                continue
        if kin is not None and row_dungeon[k] in steppe:
            errors.append(f"{k}: Steppe rows keep robotic and may not carry body_kin")
            continue
        new_name = e.get("new_name")
        if new_name is not None and (not isinstance(new_name, str) or not new_name.strip()):
            errors.append(f"{k}: new_name must be a non-empty string")
            continue
        if isinstance(new_name, str) and is_filler(new_name):
            errors.append(f"{k}: new_name {new_name!r} still looks like filler")
            continue
        old_name = e.get("old_name")
        if isinstance(new_name, str) and not (isinstance(old_name, str) and old_name):
            errors.append(f"{k}: entry with new_name needs old_name, the row's current name")
            continue
        if isinstance(old_name, str) and old_name:
            current = row.get("name")
            if old_name != current and current != new_name:
                errors.append(f"{k}: old_name {old_name!r} does not match the row's current name {current!r}")
                continue
        entries[k] = e

    if errors:
        return errors

    # 2. Snapshot filler state before any change, then apply entries.
    was_filler = {k: bool(FILLER_RE.search(r.get("name", ""))) for k, r in rows.items()}
    renames: dict[str, list[tuple[str, str]]] = {}  # floor key -> [(old, new)] full and stripped
    radar_renames: list[tuple[str, str, str, str]] = []  # dungeon, floor, old, new
    old_names_all: list[str] = []

    for k, e in entries.items():
        row = rows[k]
        old = row.get("name", "")
        new = e.get("new_name") or old
        if new != old:
            fk = row_floor[k]
            renames.setdefault(fk, []).append((old, new))
            so, sn = strip_prefix(old), strip_prefix(new)
            if so != old or sn != new:
                renames[fk].append((so, sn))
            did, fid = fk.split("/", 1)
            radar_renames.append((did, fid, old, new))
            old_names_all.append(old)
            row["name"] = new
        if isinstance(e.get("old_name"), str) and e["old_name"]:
            old_names_all.append(e["old_name"])

    for k, row in rows.items():
        e = entries.get(k)
        tier = tier_of(row)
        race_before = row.get("race_key")
        if e:
            row["race_key"] = e["race_key"]
        if (
            row.get("race_key") != race_before
            or was_filler[k]
            or FILLER_RE.search(row.get("race_badge", ""))
        ):
            row["race_badge"] = derive_badge(row.get("race_key", ""), tier)
        kin = e.get("body_kin") if e else None
        # rebuild the key order: tags sit right after race_badge
        items = [(a, b) for a, b in row.items() if a not in ("body_plan", "body_kin")]
        row.clear()
        for a, b in items:
            row[a] = b
            if a == "race_badge" and kin:
                row["body_plan"] = "upright_monster"
                row["body_kin"] = kin
        if kin and "body_plan" not in row:
            row["body_plan"] = "upright_monster"
            row["body_kin"] = kin

    # 3. Reference strings per floor and in the radar.
    for fk, pairs in renames.items():
        f = floors[fk]
        for room in f.get("rooms") or []:
            km = room.get("key_mobs")
            if isinstance(km, list):
                room["key_mobs"] = [
                    next((new for old, new in pairs if x == old), x) if isinstance(x, str) else x for x in km
                ]
        hl = f.get("boss_tier_highlight")
        if isinstance(hl, str):
            f["boss_tier_highlight"] = replace_in_highlight(hl, pairs)
    for b in out.get("world_boss_spawn_radar") or []:
        for did, fid, old, new in radar_renames:
            if b.get("dungeon_id") == did and b.get("floor_id") == fid and b.get("boss_name") == old:
                b["boss_name"] = new

    # 4. Pools and tier counts (R1, R2).
    tagged = {t: 0 for t in TIERS}
    pool = {t: 0 for t in TIERS}
    for k, row in rows.items():
        t = tier_of(row)
        if t is None:
            continue
        if row.get("body_kin"):
            tagged[t] += 1
            if row_dungeon[k] in steppe:
                errors.append(f"{k}: Steppe row is tagged, Steppe rows keep robotic")
        race = row.get("race_key")
        if (
            row_dungeon[k] not in steppe
            and row.get("npc_id") != NPC_FROZEN
            and k not in keep_robotic
            and race not in PLAYABLE_RACES
            and race != "robotic"
        ):
            pool[t] += 1
    for t in TIERS:
        lo, hi = targets[t]["min"], targets[t]["max"]
        if pool[t] < lo:
            errors.append(f"{t}: eligible pool {pool[t]} is below the range minimum {lo}")
        if not lo <= tagged[t] <= hi:
            errors.append(f"{t}: {tagged[t]} tagged rows, range is {lo}-{hi}")

    # 5. Filler left anywhere (R6), including radar names.
    for path, s in walk_strings(out.get("multi_floor_dungeons") or [], "multi_floor_dungeons"):
        if is_filler(s):
            errors.append(f"{path}: filler name remains: {s}")
    for i, b in enumerate(out.get("world_boss_spawn_radar") or []):
        s = b.get("boss_name")
        if isinstance(s, str) and is_filler(s):
            errors.append(f"world_boss_spawn_radar[{i}].boss_name: filler name remains: {s}")

    # 5b. Old filler names must not survive as a substring, in any string shape.
    scan = [("multi_floor_dungeons." + p, t) for p, t in walk_strings(out.get("multi_floor_dungeons") or [])]
    scan += [
        (f"world_boss_spawn_radar[{i}].boss_name", b["boss_name"])
        for i, b in enumerate(out.get("world_boss_spawn_radar") or [])
        if isinstance(b.get("boss_name"), str)
    ]
    for old in dict.fromkeys(old_names_all):
        for cand in dict.fromkeys([old, strip_prefix(old)]):
            if not cand:
                continue
            for path, text in scan:
                if cand in text:
                    errors.append(f"{path}: still holds renamed old name {cand!r}: {text}")

    # 6. Chains must not hold a renamed old name.
    chain_text = [s for _, s in walk_strings(out.get("boss_hierarchy_chains") or [])]
    for old in old_names_all:
        for cand in {old, strip_prefix(old)}:
            if any(cand in s for s in chain_text):
                errors.append(f"boss_hierarchy_chains: holds renamed old name {cand!r}")
                break

    if errors or check:
        return errors
    new_raw = dump(out)
    if new_raw != raw:
        mode = stat.S_IMODE(os.stat(atlas_path).st_mode)
        fd, tmp = tempfile.mkstemp(dir=str(atlas_path.parent), prefix=".mob-pass-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(new_raw)
            os.chmod(tmp, mode)
            os.replace(tmp, atlas_path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
    return errors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--atlas", default=str(REPO_ROOT / DEFAULT_ATLAS))
    ap.add_argument("--picks", default=str(REPO_ROOT / DEFAULT_PICKS))
    ap.add_argument("--targets", default=None, help="JSON {tier:{target,min,max}}; default is the F-167 table")
    ap.add_argument("--check", action="store_true", help="validate only, write nothing")
    args = ap.parse_args(argv)

    targets = DEFAULT_TARGETS
    if args.targets:
        errs: list[str] = []
        loaded = load_json(Path(args.targets), "targets", errs)
        if errs:
            print("\n".join(errs), file=sys.stderr)
            return 1
        try:
            targets = {t: {k: int(loaded[t][k]) for k in ("target", "min", "max")} for t in TIERS}
        except (KeyError, TypeError, ValueError):
            print("targets file: need target/min/max for Monster, Mini-Boss, Raid, MVP", file=sys.stderr)
            return 1

    errors = run(Path(args.atlas), Path(args.picks), targets, args.check)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
