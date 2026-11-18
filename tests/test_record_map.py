"""F-237: layout of the district / continent record map (pure functions, no files)."""
from __future__ import annotations

import unittest

from scripts.atlas_world_web.record_map import continent_map, district_map


def node(id_, type_="hunting_area", level=(1, 10), portals=None, district="d1", status="canon", name=None):
    return {"id": id_, "name": name or id_, "node_type": type_, "status": status, "level_range": list(level),
            "parent_district_id": district, "portals": portals or {}}


def portal(target, state="open"):
    return {"target_node_id": target, "gate_state": state}


def by_id(m):
    return {n["id"]: n for n in m["nodes"]}


class DistrictMapTests(unittest.TestCase):
    def run_map(self, nodes, outside=(), names=None):
        mine = {n["id"]: n for n in nodes}
        allnodes = {**mine, **{n["id"]: n for n in outside}}
        return district_map(mine, allnodes, names or {"d1": "One", "d2": "Two"})

    def test_directions_land_in_the_right_cells(self):
        m = self.run_map([
            node("t", "town", portals={"North": portal("n"), "South": portal("s"), "East": portal("e"), "West": portal("w")}),
            node("n"), node("s"), node("e"), node("w")])
        pos = {k: (v["x"], v["y"]) for k, v in by_id(m).items()}
        self.assertEqual(pos, {"t": (0, 0), "n": (0, -1), "s": (0, 1), "e": (1, 0), "w": (-1, 0)})

    def test_collision_steps_further_and_nothing_shares_a_cell(self):
        m = self.run_map([
            node("t", "town", portals={"East": portal("a"), "South": portal("b")}),
            node("a", portals={"South": portal("c")}),
            node("b", portals={"East": portal("c2")}), node("c"), node("c2")])
        cells = [(n["x"], n["y"]) for n in m["nodes"]]
        self.assertEqual(len(cells), len(set(cells)))
        # b is walked before a, so c2 takes (1,1) and c, wanting the same cell, steps one further south
        self.assertEqual((by_id(m)["c"]["x"], by_id(m)["c"]["y"]), (1, 2))

    def test_dungeon_goes_diagonal_below(self):
        m = self.run_map([node("t", "town", portals={"Dungeon": portal("d")}), node("d", "dungeon")])
        self.assertEqual((by_id(m)["d"]["x"], by_id(m)["d"]["y"]), (1, 1))

    def test_unreached_node_is_placed_below(self):
        m = self.run_map([node("t", "town", portals={"East": portal("e")}), node("e"), node("lost")])
        lost = by_id(m)["lost"]
        self.assertGreater(lost["y"], max(n["y"] for n in m["nodes"] if n["id"] != "lost"))

    def test_no_portals_single_node(self):
        m = self.run_map([node("t", "town")])
        self.assertEqual(m["nodes"][0]["x"], 0)
        self.assertEqual(m["edges"], [])

    def test_edges_dedupe_and_state(self):
        m = self.run_map([
            node("t", "town", portals={"East": portal("e", "closed")}),
            node("e", portals={"West": portal("t", "open")})])
        self.assertEqual(len(m["edges"]), 1)
        self.assertEqual(m["edges"][0]["state"], "closed")

    def test_kinds_labels_outside_and_mystery(self):
        far = node("far", level=(3, 4), district="d2", name="Far Gate")
        m = self.run_map([node("t", "town", portals={"South": portal("far"), "East": portal("m")}),
                          node("m", status="mystery")], outside=[far])
        n = by_id(m)
        self.assertEqual(n["far"]["kind"], "outside")
        self.assertEqual(n["far"]["label"], "Far Gate (Two)")
        self.assertEqual(n["far"]["record"], "node:far")
        self.assertEqual(n["m"]["kind"], "unbuilt")
        self.assertEqual(n["t"]["kind"], "town")

    def test_danger_boundary_seven_vs_eight(self):
        for gap, expect in ((7, False), (8, True)):
            far = node("far", level=(1 + gap, 20), district="d2")
            m = self.run_map([node("t", "town", level=(1, 5), portals={"South": portal("far")})], outside=[far])
            self.assertEqual(m["edges"][0]["danger"], expect, gap)

    def test_closed_edge_is_never_danger(self):
        far = node("far", level=(30, 40), district="d2")
        m = self.run_map([node("t", "town", level=(1, 5), portals={"South": portal("far", "closed")})], outside=[far])
        self.assertFalse(m["edges"][0]["danger"])

    def test_deterministic(self):
        nodes = [node("t", "town", portals={"East": portal("a"), "West": portal("b")}), node("a"), node("b"), node("x")]
        self.assertEqual(self.run_map(nodes), self.run_map(list(reversed(nodes))))


class ContinentMapTests(unittest.TestCase):
    def test_positions_links_and_missing_data(self):
        districts = [
            {"id": "a", "name": "A", "level_range": [1, 5], "geography": {"map_position": {"x": 10, "y": 20}}},
            {"id": "b", "name": "B", "level_range": [6, 9], "geography": {"map_position": {"x": 50, "y": 60}}}]
        links = [{"a": "a", "b": "b", "priority": "built"}, {"a": "a", "b": "b", "priority": "P1"}]
        m = continent_map(districts, links, {"a": "Town A"})
        self.assertEqual([(n["x"], n["y"], n["kind"]) for n in m["nodes"]], [(10, 20, "district"), (50, 60, "district")])
        self.assertEqual(m["nodes"][0]["label"], "A · Town A")
        self.assertEqual([(e["label"], e["state"]) for e in m["edges"]], [("built", "open"), ("P1", "closed")])
        self.assertIsNone(continent_map([{"id": "a", "name": "A", "geography": {}}], [], {}))


if __name__ == "__main__":
    unittest.main()
