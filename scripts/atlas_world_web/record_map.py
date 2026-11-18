"""F-237: the `map` block of a district or continent record, computed from studio data.

Pure functions: dicts in, `{"nodes": [...], "edges": [...]}` out. The frontend only draws it.
District nodes sit on integer grid cells (x east, y south); continent nodes use their 0-100 map_position.
"""
from __future__ import annotations

from collections import deque

STEP = {"North": (0, -1), "South": (0, 1), "East": (1, 0), "West": (-1, 0)}
DIRECTIONS = ("North", "South", "East", "West", "Dungeon", "Exit")
KIND = {"town": "town", "hunting_area": "hunting", "dungeon": "dungeon"}
DANGER_GAP = 8


def _level(n: dict):
    lv = n.get("level_range")
    return list(lv) if isinstance(lv, list) and len(lv) == 2 else None


def _place(src, direction, taken):
    x, y = src
    if direction in STEP:
        dx, dy = STEP[direction]
        x, y = x + dx, y + dy
        while (x, y) in taken:  # step further the same way until a free cell
            x, y = x + dx, y + dy
        return x, y
    d = 1  # Dungeon / Exit: nearest free diagonal below the source
    while True:
        for cell in ((src[0] + d, src[1] + d), (src[0] - d, src[1] + d)):
            if cell not in taken:
                return cell
        d += 1


def district_map(nodes: dict, all_nodes: dict, district_names: dict) -> dict | None:
    """nodes: this district's nodes by id. all_nodes: every node by id, for portal targets elsewhere."""
    if not nodes:
        return None
    ids = sorted(nodes)
    start = next((i for i in ids if nodes[i].get("is_starter_town")), None) or \
        next((i for i in ids if nodes[i].get("node_type") == "town"), ids[0])
    pos = {start: (0, 0)}
    taken = {(0, 0)}
    edges: dict[frozenset, dict] = {}
    queue = deque([start])
    while queue:
        cur = queue.popleft()
        portals = nodes[cur].get("portals") or {}
        for direction in sorted(portals, key=lambda d: DIRECTIONS.index(d) if d in DIRECTIONS else len(DIRECTIONS)):
            p = portals[direction]
            tgt = (p or {}).get("target_node_id")
            if tgt not in all_nodes or tgt == cur:
                continue
            if tgt not in pos:
                pos[tgt] = _place(pos[cur], direction, taken)
                taken.add(pos[tgt])
                if tgt in nodes:
                    queue.append(tgt)
            e = edges.setdefault(frozenset((cur, tgt)), {"a": cur, "b": tgt, "open": True})
            e["open"] = e["open"] and p.get("gate_state") == "open"
    # shortcut: unreached nodes go in a row below and their own portals are not drawn; upgrade if a district needs it
    row = max(y for _, y in pos.values()) + 1
    for x, i in enumerate(i for i in ids if i not in pos):
        pos[i] = (x, row)
    out_nodes = []
    for i, (x, y) in sorted(pos.items(), key=lambda kv: (kv[1][1], kv[1][0], kv[0])):
        n = all_nodes[i]
        outside = i not in nodes
        label = n.get("name") or i
        if outside:
            label = f"{label} ({district_names.get(n.get('parent_district_id'), n.get('parent_district_id'))})"
            kind = "outside"
        else:
            kind = "unbuilt" if n.get("status") == "mystery" else KIND.get(n.get("node_type"), "hunting")
        out_nodes.append({"id": i, "label": label, "kind": kind, "level": _level(n), "x": x, "y": y, "record": f"node:{i}"})
    out_edges = []
    for e in sorted(edges.values(), key=lambda e: (e["a"], e["b"])):
        a, b = all_nodes[e["a"]], all_nodes[e["b"]]
        la, lb = _level(a), _level(b)
        crosses = (e["a"] in nodes) != (e["b"] in nodes)
        danger = bool(e["open"] and crosses and la and lb and abs(la[0] - lb[0]) >= DANGER_GAP)
        out_edges.append({"a": e["a"], "b": e["b"], "state": "open" if e["open"] else "closed", "danger": danger, "label": ""})
    return {"nodes": out_nodes, "edges": out_edges}


def continent_map(districts: list, links: list, town_names: dict) -> dict | None:
    nodes = []
    for d in sorted(districts, key=lambda d: d["id"]):
        p = (d.get("geography") or {}).get("map_position")
        if not isinstance(p, dict) or "x" not in p or "y" not in p:
            continue
        town = town_names.get(d["id"])
        nodes.append({"id": d["id"], "label": f"{d['name']} · {town}" if town else d["name"], "kind": "district",
                      "level": _level(d), "x": p["x"], "y": p["y"], "record": f"district:{d['id']}"})
    if not nodes:
        return None
    have = {n["id"] for n in nodes}
    edges = [{"a": l["a"], "b": l["b"], "state": "open" if l.get("priority") == "built" else "closed",
              "danger": False, "label": l.get("priority") or ""}
             for l in links if l.get("a") in have and l.get("b") in have]
    return {"nodes": nodes, "edges": edges}
