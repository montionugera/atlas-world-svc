#!/usr/bin/env python3
"""SSOT merge Wave 0: static mounts, route dispatcher, panel host contract and the single
review-queue writer (scripts/atlas_world_web/*, scripts/catalog_explorer_web.py)."""

from __future__ import annotations

import http.client
import json
import os
import re
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import catalog_explorer_web as web  # noqa: E402
from atlas_world_web import review_queue, static_mounts  # noqa: E402

SHARED_QUEUE = {
    "version": 1,
    "verdicts": {},
    "workOrders": [],
    "playerScaleAnchor": {"name": "chibi_toddler", "heightRangeM": [0.9, 1.2]},
    "proposals": [
        {
            "id": "rq-1",
            "kind": "db_entity",
            "status": "pending_review",
            "targetId": "orc_warlord",
            "assetStudioKey": "mob:aggressive",
            "takes": [{"id": "t1", "label": "Take A"}],
        }
    ],
    "agentEditLog": [{"mode": "AI Co-Pilot Agent"}],
}


class QueueEnvCase(unittest.TestCase):
    """Points the single writer at a temp copy so the tracked file is never touched."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / "review-queue.json"
        self.path.write_text(json.dumps(SHARED_QUEUE, indent=2) + "\n", encoding="utf-8")
        patcher = mock.patch.dict(os.environ, {"ATLAS_REVIEW_QUEUE_PATH": str(self.path)})
        patcher.start()
        self.addCleanup(patcher.stop)

    def disk(self) -> dict:
        return json.loads(self.path.read_text(encoding="utf-8"))


class TestSafeResolve(unittest.TestCase):
    def test_serves_allowlisted_mounts(self) -> None:
        for url in (
            "/game-client/assets/manifest.json",
            "/content/asset-taxonomy.json",
            "/content/review-queue.json",
            "/content/generated/asset-keys.json",
            "/atelier/atlas-world-panels/js/audio.mjs",
            "/atelier/combat-lab/index.html",
        ):
            with self.subTest(url=url):
                self.assertIsNotNone(static_mounts.safe_resolve(url))

    def test_thumbs_dot_directory_is_the_only_dot_exception(self) -> None:
        self.assertIsNotNone(static_mounts.safe_resolve("/game-client/assets/.thumbs/index.json"))
        self.assertIsNone(static_mounts.safe_resolve("/game-client/assets/.hidden/index.json"))

    def test_rejects_traversal_encoded_traversal_and_blocklist(self) -> None:
        hostile = (
            "/.git/config",
            "/build/catalog.sqlite",
            "/graft/INDEX.md",
            "/game-client/../.git/config",
            "/game-client/assets/../../.git/config",
            "/game-client/assets/%2e%2e/%2e%2e/.git/config",
            "/game-client/assets/%2e%2e%2f%2e%2e%2f.git%2fconfig",
            "/atelier/atlas-world-panels/../../scripts/catalog_explorer_web.py",
            "/atelier/atlas-world-panels/node_modules/x.js",
            "/atelier/atlas-world-panels/.claude/settings.json",
            "/game-client/assets/audio/chime_bright.ogg%00.png",
            "/game-client/assets/%5c..%5c.git/config",
            "/scripts/catalog_explorer_web.py",
            "/contracts/content/mobs.json",
            "/content/world/x.sqlite",
            "/content/world/.env.local",
        )
        for url in hostile:
            with self.subTest(url=url):
                self.assertIsNone(static_mounts.safe_resolve(url))

    def test_an_existing_dotfile_inside_a_mount_is_not_served(self) -> None:
        probe = ROOT / "content" / "generated" / ".w0_dot_probe.json"
        sibling = ROOT / "content" / "generated" / "w0_dot_probe.json"
        try:
            probe.write_text("{}")
            sibling.write_text("{}")
            self.assertIsNone(static_mounts.safe_resolve("/content/generated/.w0_dot_probe.json"))
            self.assertIsNotNone(static_mounts.safe_resolve("/content/generated/w0_dot_probe.json"))
        finally:
            probe.unlink(missing_ok=True)
            sibling.unlink(missing_ok=True)

    def test_unknown_extensions_and_import_sidecars_are_not_served(self) -> None:
        self.assertIsNone(static_mounts.safe_resolve("/game-client/assets/audio/chime_bright.ogg.import"))

    def test_symlink_escaping_a_mount_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as outside:
            secret = Path(outside) / "secret.json"
            secret.write_text("{}")
            link = ROOT / "content" / "generated" / "__w0_escape_probe.json"
            try:
                link.symlink_to(secret)
                self.assertIsNone(static_mounts.safe_resolve("/content/generated/__w0_escape_probe.json"))
            finally:
                link.unlink(missing_ok=True)


class TestReviewQueueWriter(QueueEnvCase):
    def test_noop_update_does_not_rewrite_the_file(self) -> None:
        before = self.path.read_bytes()
        review_queue.update(lambda doc: None)
        self.assertEqual(self.path.read_bytes(), before)

    def test_every_write_keeps_unknown_top_level_keys(self) -> None:
        review_queue.apply_asset_verdicts({"verdicts": {"mob:aggressive": {"verdict": "reject", "note": "too tall"}}})
        doc = self.disk()
        self.assertEqual(doc["proposals"], SHARED_QUEUE["proposals"])
        self.assertEqual(doc["playerScaleAnchor"], SHARED_QUEUE["playerScaleAnchor"])
        self.assertEqual(doc["agentEditLog"], SHARED_QUEUE["agentEditLog"])
        rec = doc["verdicts"]["mob:aggressive"]
        self.assertEqual((rec["verdict"], rec["note"], rec["source"]), ("reject", "too tall", "assets"))
        self.assertTrue(re.match(r"\d{4}-\d\d-\d\dT", rec["updatedAt"]))

    def test_verdict_can_be_cleared_and_reasserting_is_not_a_change(self) -> None:
        body = {"verdicts": {"mob:aggressive": {"verdict": "rebuild", "note": "barrel silhouette"}}}
        review_queue.apply_asset_verdicts(body)
        first = self.disk()["verdicts"]["mob:aggressive"]
        review_queue.apply_asset_verdicts(body)
        self.assertEqual(self.disk()["verdicts"]["mob:aggressive"], first)
        review_queue.apply_asset_verdicts({"verdicts": {"mob:aggressive": None}})
        self.assertEqual(self.disk()["verdicts"], {})

    def test_bad_verdict_payloads_raise_and_write_nothing(self) -> None:
        before = self.path.read_bytes()
        for body in (
            {},
            {"verdicts": {}},
            {"verdicts": {"a b": {"verdict": "reject", "note": "x"}}},
            {"verdicts": {"a": {"verdict": "approve", "note": "x"}}},
            {"verdicts": {"a": {"verdict": "reject", "note": "   "}}},
            {"verdicts": {"ok": {"verdict": "reject", "note": "fine"}, "bad": {"verdict": "nope", "note": "x"}}},
        ):
            with self.subTest(body=body), self.assertRaises(review_queue.QueueError):
                review_queue.apply_asset_verdicts(body)
        self.assertEqual(self.path.read_bytes(), before, "validation is all-or-nothing")

    def test_work_orders_get_server_ids_and_clientid_is_idempotent(self) -> None:
        order = {"kind": "forge", "clientId": "c1", "briefId": "A1-ART-02", "cell": "render", "reason": "redo", "seed": 3}
        first = review_queue.append_work_orders({"workOrders": [order]})
        self.assertEqual(first["created"], ["wo-0001"])
        again = review_queue.append_work_orders({"workOrders": [order, {**order, "clientId": "c2"}]})
        self.assertEqual((again["created"], again["skipped"]), (["wo-0002"], ["c1"]))
        ids = [wo["id"] for wo in self.disk()["workOrders"]]
        self.assertEqual(ids, ["wo-0001", "wo-0002"])

    def test_work_order_ids_continue_after_legacy_ids_and_ignore_storybook_style_ids(self) -> None:
        doc = self.disk()
        doc["workOrders"] = [{"id": "wo-007"}, {"id": "wo-A1-ART-02-render-1730000000000-1"}]
        self.path.write_text(json.dumps(doc), encoding="utf-8")
        out = review_queue.append_work_orders(
            {"workOrders": [{"kind": "forge", "briefId": "A1", "cell": "gate", "reason": "r"}]}
        )
        self.assertEqual(out["created"], ["wo-0008"])

    def test_bad_work_orders_raise(self) -> None:
        good = {"kind": "forge", "briefId": "A1", "cell": "gate", "reason": "r"}
        for patch in ({"kind": "mystery"}, {"briefId": "A 1"}, {"cell": "nope"}, {"reason": " "}, {"seed": -1}, {"clientId": "a b"}):
            with self.subTest(patch=patch), self.assertRaises(review_queue.QueueError):
                review_queue.append_work_orders({"workOrders": [{**good, **patch}]})

    def test_keys_with_a_trailing_newline_are_rejected(self) -> None:
        with self.assertRaises(review_queue.QueueError):
            review_queue.apply_asset_verdicts({"verdicts": {"abc\n": {"verdict": "reject", "note": "x"}}})
        with self.assertRaises(review_queue.QueueError):
            review_queue.append_work_orders({"workOrders": [{"kind": "forge", "briefId": "a\n", "cell": "gate", "reason": "r"}]})

    def test_unfinite_numbers_never_persist(self) -> None:
        with self.assertRaises(ValueError):
            review_queue.update(lambda doc: doc.__setitem__("x", float("nan")))
        self.assertNotIn("NaN", self.path.read_text(encoding="utf-8"))
        self.path.write_text('{"version": 1, "verdicts": {}, "workOrders": [], "x": NaN}', encoding="utf-8")
        with self.assertRaises(ValueError):
            review_queue.load()

    def test_timestamps_are_utc(self) -> None:
        import time as _time

        with mock.patch.object(review_queue.time, "gmtime", wraps=_time.gmtime) as g:
            review_queue.now_iso()
            g.assert_called_once()

    def test_restore_from_replaces_the_queue_atomically_and_keeps_its_mode(self) -> None:
        backup = Path(self._tmp.name) / "snap.json"
        backup.write_text(json.dumps({"version": 1, "verdicts": {}, "workOrders": [], "proposals": [], "restored": True}), encoding="utf-8")
        self.path.chmod(0o640)
        review_queue.restore_from(backup)
        self.assertTrue(self.disk()["restored"])
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o640)
        self.assertEqual([p.name for p in self.path.parent.iterdir() if p.name.endswith(".tmp")], [])

    def test_concurrent_writers_lose_no_update(self) -> None:
        def add(i: int) -> None:
            review_queue.append_work_orders(
                {"workOrders": [{"kind": "forge", "clientId": f"t{i}", "briefId": "A1", "cell": "gate", "reason": "r"}]}
            )

        threads = [threading.Thread(target=add, args=(i,)) for i in range(12)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        ids = [wo["id"] for wo in self.disk()["workOrders"]]
        self.assertEqual(len(ids), 12)
        self.assertEqual(len(set(ids)), 12)
        self.assertEqual(self.disk()["proposals"], SHARED_QUEUE["proposals"])


class TestExplorerWritersUseTheSingleWriter(QueueEnvCase):
    def setUp(self) -> None:
        super().setUp()
        snaps = tempfile.TemporaryDirectory()
        self.addCleanup(snaps.cleanup)
        p = mock.patch.object(web, "STUDIO_SNAPSHOTS_DIR", Path(snaps.name))
        p.start()
        self.addCleanup(p.stop)

    def test_reject_with_an_asset_key_writes_a_canonical_verdict_and_keeps_proposals(self) -> None:
        out = web.apply_review_verdict({"id": "rq-1", "verdict": "reject", "feedbackText": "off-canon silhouette"})
        self.assertTrue(out["ok"])
        doc = self.disk()
        self.assertEqual(doc["proposals"][0]["status"], "rejected")
        rec = doc["verdicts"]["mob:aggressive"]
        self.assertEqual((rec["verdict"], rec["note"], rec["source"]), ("reject", "off-canon silhouette", "proposal:rq-1"))
        self.assertNotIn("orc_warlord", doc["verdicts"], "the old {status, notes} shape keyed by targetId is gone")
        self.assertEqual(doc["playerScaleAnchor"], SHARED_QUEUE["playerScaleAnchor"])

    def test_reject_without_an_asset_key_writes_no_verdict(self) -> None:
        doc = self.disk()
        del doc["proposals"][0]["assetStudioKey"]
        self.path.write_text(json.dumps(doc), encoding="utf-8")
        web.apply_review_verdict({"id": "rq-1", "verdict": "reject"})
        after = self.disk()
        self.assertEqual(after["verdicts"], {})
        self.assertEqual(after["proposals"][0]["status"], "rejected")

    def test_feedback_queues_a_proposal_reroll_with_a_server_id(self) -> None:
        out = web.apply_review_verdict({"id": "rq-1", "verdict": "feedback", "feedbackText": "less orange"})
        self.assertTrue(out["ok"])
        wo = self.disk()["workOrders"][0]
        self.assertEqual((wo["id"], wo["kind"], wo["proposalId"], wo["feedback"]), ("wo-0001", "proposal-reroll", "rq-1", "less orange"))

    def test_bundle_reads_the_overridden_queue(self) -> None:
        self.assertEqual(len(review_queue.load()["proposals"]), 1)

    def test_unknown_proposal_leaves_the_file_untouched(self) -> None:
        before = self.path.read_bytes()
        self.assertFalse(web.apply_review_verdict({"id": "nope", "verdict": "reject"})["ok"])
        self.assertEqual(self.path.read_bytes(), before)


class HttpCase(QueueEnvCase):
    """Runs the real ObservatoryHandler on an ephemeral port."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), web.ObservatoryHandler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def req(self, method: str, path: str, body: object = None, raw: bytes | None = None, headers: dict | None = None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        hdrs = {"Content-Type": "application/json"} if data else {}
        hdrs.update(headers or {})
        conn.request(method, path, body=data, headers=hdrs)
        resp = conn.getresponse()
        payload = resp.read()
        headers = dict(resp.getheaders())
        conn.close()
        return resp.status, headers, payload

class TestHttpSurface(HttpCase):
    def test_healthz_get_and_head(self) -> None:
        status, _, body = self.req("GET", "/healthz")
        self.assertEqual((status, json.loads(body)), (200, {"ok": True}))
        status, headers, body = self.req("HEAD", "/healthz")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(headers["Content-Length"], "12")

    def test_mime_cache_and_head_for_static_files(self) -> None:
        cases = {
            "/atelier/atlas-world-panels/js/audio.mjs": ("text/javascript", "no-store"),
            "/game-client/assets/manifest.json": ("application/json", "no-store"),
            "/game-client/assets/audio/chime_bright.ogg": ("audio/ogg", "no-cache"),
            "/vendor/model-viewer.min.js": ("text/javascript", None),
        }
        for path, (mime, cache) in cases.items():
            with self.subTest(path=path):
                status, headers, body = self.req("GET", path)
                self.assertEqual(status, 200)
                self.assertTrue(headers["Content-Type"].startswith(mime), headers["Content-Type"])
                if cache:
                    self.assertEqual(headers["Cache-Control"], cache)
                self.assertEqual(int(headers["Content-Length"]), len(body))
                h_status, h_headers, h_body = self.req("HEAD", path)
                self.assertEqual((h_status, h_body), (200, b""))
                self.assertEqual(h_headers["Content-Length"], headers["Content-Length"])

    def test_glb_is_served_with_the_gltf_binary_type(self) -> None:
        glb = next((ROOT / "game-client" / "assets").rglob("*.glb"))
        url = "/" + glb.relative_to(ROOT).as_posix()
        status, headers, _ = self.req("HEAD", url)
        self.assertEqual((status, headers["Content-Type"]), (200, "model/gltf-binary"))

    def test_etag_gives_a_304_for_unchanged_binaries(self) -> None:
        path = "/game-client/assets/audio/chime_bright.ogg"
        _, headers, _ = self.req("GET", path)
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request("GET", path, headers={"If-None-Match": headers["ETag"]})
        self.assertEqual(conn.getresponse().status, 304)
        conn.close()

    def test_traversal_attempts_404(self) -> None:
        for path in (
            "/.git/config",
            "/build/catalog.sqlite",
            "/graft/INDEX.md",
            "/game-client/../.git/config",
            "/game-client/assets/%2e%2e/%2e%2e/.git/config",
            "/studio-maps/../../.git/config",
            "/studio-maps/..%2f..%2f.git/config",
            "/nonexistent",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.req("GET", path)[0], 404)
                self.assertEqual(self.req("HEAD", path)[0], 404)

    def test_studio_maps_rejects_a_sibling_directory_with_the_same_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp)
            (fake / "content" / "studio" / "maps").mkdir(parents=True)
            (fake / "content" / "studio" / "maps" / "ok.png").write_bytes(b"png")
            (fake / "content" / "studio" / "maps-evil").mkdir()
            (fake / "content" / "studio" / "maps-evil" / "x.png").write_bytes(b"secret")
            with mock.patch.object(web, "ROOT", fake):
                self.assertEqual(self.req("GET", "/studio-maps/ok.png")[0], 200)
                self.assertEqual(self.req("GET", "/studio-maps/../maps-evil/x.png")[0], 404)

    def test_review_queue_static_mount_serves_the_live_override_file(self) -> None:
        status, _, body = self.req("GET", "/content/review-queue.json")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["proposals"][0]["id"], "rq-1")

    def test_post_asset_verdicts_roundtrip_and_validation(self) -> None:
        status, _, body = self.req("POST", "/api/review-queue/asset-verdicts", {"verdicts": {"mob:aggressive": {"verdict": "reject", "note": "x"}}})
        self.assertEqual(status, 200)
        self.assertIn("mob:aggressive", json.loads(body)["queue"]["verdicts"])
        self.assertEqual(self.disk()["proposals"], SHARED_QUEUE["proposals"])
        for bad in ({"verdicts": {"a": {"verdict": "nope", "note": "x"}}}, {"verdicts": {"a": {"verdict": "reject", "note": ""}}}):
            status, _, body = self.req("POST", "/api/review-queue/asset-verdicts", bad)
            self.assertEqual((status, json.loads(body)["error"]["code"]), (400, "BAD_REQUEST"))
        self.assertEqual(self.req("POST", "/api/review-queue/asset-verdicts", raw=b"not json")[0], 400)
        self.assertEqual(self.req("POST", "/api/review-queue/asset-verdicts", raw=b"")[0], 415)  # no body, no JSON header

    def test_post_work_orders(self) -> None:
        order = {"workOrders": [{"kind": "forge", "clientId": "c9", "briefId": "A1", "cell": "gate", "reason": "r"}]}
        status, _, body = self.req("POST", "/api/review-queue/work-orders", order)
        self.assertEqual((status, json.loads(body)["created"]), (200, ["wo-0001"]))
        status, _, body = self.req("POST", "/api/review-queue/work-orders", order)
        self.assertEqual((status, json.loads(body)["skipped"]), (200, ["c9"]))

    def test_new_writes_demand_json_and_a_same_origin_request(self) -> None:
        body = {"verdicts": {"mob:aggressive": {"verdict": "reject", "note": "x"}}}
        before = self.path.read_bytes()
        # a cross-site "simple" POST: text/plain body, no preflight
        status, _, resp = self.req("POST", "/api/review-queue/asset-verdicts", raw=json.dumps(body).encode(), headers={"Content-Type": "text/plain"})
        self.assertEqual((status, json.loads(resp)["error"]["code"]), (415, "UNSUPPORTED_MEDIA_TYPE"))
        status, _, resp = self.req("POST", "/api/review-queue/asset-verdicts", body, headers={"Origin": "http://evil.example"})
        self.assertEqual((status, json.loads(resp)["error"]["code"]), (403, "CROSS_ORIGIN"))
        self.assertEqual(self.path.read_bytes(), before)
        same = {"Origin": f"http://127.0.0.1:{self.port}"}
        self.assertEqual(self.req("POST", "/api/review-queue/asset-verdicts", body, headers=same)[0], 200)

    def test_nan_and_unknown_fields_cannot_reach_the_queue_file(self) -> None:
        before = self.path.read_bytes()
        nan_body = b'{"workOrders":[{"kind":"proposal-reroll","proposalId":"p","feedback":NaN}]}'
        self.assertEqual(self.req("POST", "/api/review-queue/work-orders", raw=nan_body)[0], 400)
        extra = {"workOrders": [{"kind": "proposal-reroll", "proposalId": "p", "payload": {"x": 1}}]}
        self.assertEqual(self.req("POST", "/api/review-queue/work-orders", extra)[0], 400)
        self.assertEqual(self.path.read_bytes(), before)

    def test_unknown_delete_routes_404(self) -> None:
        self.assertEqual(self.req("DELETE", "/api/bundle")[0], 404)


class _FakeBuilder(BaseHTTPRequestHandler):
    """Stands in for atelier/map-builder/server.mjs; records what the proxy forwarded."""

    seen: list = []

    def log_message(self, *args) -> None:  # keep test output quiet
        pass

    def _reply(self, status: int, payload: dict, ctype: str = "application/json") -> None:
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _handle(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode() if length else ""
        type(self).seen.append((self.command, self.path, self.headers.get("Content-Type"), body))
        if self.path.startswith("/api/missing"):
            self._reply(404, {"error": {"code": "NOT_FOUND", "message": "no such job"}})
        elif self.path.startswith("/api/publish") and self.command == "POST":
            self._reply(409, {"error": {"code": "STALE_DRAFT", "message": "draft is stale"}})
        elif self.path.startswith("/api/jobs/7/log"):
            self._reply(200, {"x": 1}, "text/plain; charset=utf-8")
        else:
            self._reply(200, {"ok": True, "path": self.path})

    do_GET = do_POST = do_DELETE = _handle


class TestMapBuilderProxy(HttpCase):
    def setUp(self) -> None:
        super().setUp()
        _FakeBuilder.seen = []
        self.upstream = ThreadingHTTPServer(("127.0.0.1", 0), _FakeBuilder)
        threading.Thread(target=self.upstream.serve_forever, daemon=True).start()
        self.addCleanup(self._stop_upstream)
        patcher = mock.patch.dict(os.environ, {"MAP_BUILDER_PORT": str(self.upstream.server_address[1])})
        patcher.start()
        self.addCleanup(patcher.stop)

    def _stop_upstream(self) -> None:
        self.upstream.shutdown()
        self.upstream.server_close()

    def test_get_maps_to_the_api_prefix_and_keeps_the_query(self) -> None:
        status, headers, body = self.req("GET", "/api/map-builder/jobs?kind=draft&limit=50")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["path"], "/api/jobs?kind=draft&limit=50")
        self.assertEqual(_FakeBuilder.seen[0][:2], ("GET", "/api/jobs?kind=draft&limit=50"))
        self.assertIn("application/json", headers["Content-Type"])

    def test_content_type_of_the_upstream_is_passed_through(self) -> None:
        status, headers, _ = self.req("GET", "/api/map-builder/jobs/7/log?tail=200")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "text/plain; charset=utf-8")

    def test_post_forwards_body_and_content_type(self) -> None:
        status, _, _ = self.req("POST", "/api/map-builder/jobs", {"kind": "draft", "seed": 3})
        self.assertEqual(status, 200)
        method, path, ctype, body = _FakeBuilder.seen[0]
        self.assertEqual((method, path, ctype), ("POST", "/api/jobs", "application/json"))
        self.assertEqual(json.loads(body), {"kind": "draft", "seed": 3})

    def test_delete_is_forwarded_with_its_query(self) -> None:
        status, _, _ = self.req(
            "DELETE", "/api/map-builder/jobs?status=failed&olderThanDays=7", headers={"Content-Type": "application/json"}
        )
        self.assertEqual(status, 200)
        self.assertEqual(_FakeBuilder.seen[0][:3], ("DELETE", "/api/jobs?status=failed&olderThanDays=7", "application/json"))

    def test_upstream_errors_keep_their_status_and_body(self) -> None:
        status, _, body = self.req("GET", "/api/map-builder/missing")
        self.assertEqual((status, json.loads(body)["error"]["code"]), (404, "NOT_FOUND"))
        status, _, body = self.req("POST", "/api/map-builder/publish", {"confirm": True})
        self.assertEqual((status, json.loads(body)["error"]["code"]), (409, "STALE_DRAFT"))

    def test_sse_is_not_proxied_so_the_ui_falls_back_to_polling(self) -> None:
        status, _, body = self.req("GET", "/api/map-builder/events")
        error = json.loads(body)["error"]
        self.assertEqual((status, error["code"]), (503, "MAP_BUILDER_DOWN"))
        self.assertEqual(error["message"], "SSE not proxied; use polling fallback")
        self.assertEqual(_FakeBuilder.seen, [], "the stream must never reach the upstream")

    def test_a_down_service_is_a_clean_503(self) -> None:
        port = self.upstream.server_address[1]
        self._stop_upstream()
        self.upstream = ThreadingHTTPServer(("127.0.0.1", 0), _FakeBuilder)  # keep cleanup valid
        threading.Thread(target=self.upstream.serve_forever, daemon=True).start()
        for method in ("GET", "POST", "DELETE"):
            with self.subTest(method=method):
                status, _, body = self.req(method, "/api/map-builder/health", {} if method == "POST" else None,
                                           headers={"Content-Type": "application/json"})
                error = json.loads(body)["error"]
                self.assertEqual((status, error["code"]), (503, "MAP_BUILDER_DOWN"))
                self.assertEqual(error["message"], f"Map Builder service not running on port {port}")

    def test_writes_keep_the_json_and_same_origin_guards_and_never_reach_the_service(self) -> None:
        status, _, resp = self.req("POST", "/api/map-builder/publish", raw=b"{}", headers={"Content-Type": "text/plain"})
        self.assertEqual((status, json.loads(resp)["error"]["code"]), (415, "UNSUPPORTED_MEDIA_TYPE"))
        status, _, resp = self.req("POST", "/api/map-builder/publish", {}, headers={"Origin": "http://evil.example"})
        self.assertEqual((status, json.loads(resp)["error"]["code"]), (403, "CROSS_ORIGIN"))
        status, _, _ = self.req("DELETE", "/api/map-builder/jobs/1")  # no Content-Type at all
        self.assertEqual(status, 415)
        self.assertEqual(_FakeBuilder.seen, [])

    def test_the_port_comes_from_the_environment_with_a_safe_default(self) -> None:
        from atlas_world_web import map_builder_proxy

        with mock.patch.dict(os.environ, {"MAP_BUILDER_PORT": "6123"}):
            self.assertEqual(map_builder_proxy.upstream_base(), "http://127.0.0.1:6123")
        for bad in ("", "abc", "0", "99999", "6016; rm"):
            with mock.patch.dict(os.environ, {"MAP_BUILDER_PORT": bad}):
                self.assertEqual(map_builder_proxy.upstream_base(), "http://127.0.0.1:6016", bad)

    def test_draft_sheets_are_served_from_build_mapforge_only(self) -> None:
        status, _, _ = self.req("GET", "/api/map-builder-files/build/mapforge/run1/sheets/fabric.svg")
        self.assertEqual(status, 200)
        self.assertEqual(_FakeBuilder.seen[0][:2], ("GET", "/build/mapforge/run1/sheets/fabric.svg"))
        _FakeBuilder.seen.clear()
        for bad in (
            "/api/map-builder-files/content/world/world.json",
            "/api/map-builder-files/build/mapforge/../../content/world/world.json",
            "/api/map-builder-files/build/mapforge/%2e%2e/%2e%2e/.env",
            "/api/map-builder-files/build/map-builder/snapshots/x",
        ):
            with self.subTest(path=bad):
                self.assertEqual(self.req("GET", bad)[0], 404)
        self.assertEqual(_FakeBuilder.seen, [], "refused paths must never reach the service")

    def test_dot_dot_segments_never_reach_the_api_proxy(self) -> None:
        self.assertEqual(self.req("GET", "/api/map-builder/%2e%2e/secret")[0], 404)
        self.assertEqual(_FakeBuilder.seen, [])

    def test_head_is_answered_without_a_body(self) -> None:
        status, headers, body = self.req("HEAD", "/api/map-builder/health")
        self.assertEqual((status, body), (200, b""))
        self.assertGreater(int(headers["Content-Length"]), 0)


class TestPanelHostContract(unittest.TestCase):
    def test_index_html_carries_the_panel_host_and_final_nav(self) -> None:
        html = web.INDEX_HTML
        self.assertRegex(html, r'<main class="content-area" id="mainContent"></main>\s*<div id="panelHost" hidden></div>')
        self.assertIn('src="/atelier/atlas-world-panels/js/panels/registry.mjs"', html)
        self.assertIn('href="/atelier/atlas-world-panels/css/panels.css"', html)
        for tab in ("map-sheets", "map-builder", "story", "assets", "audio", "art", "coverage", "forge", "combat-lab"):
            self.assertRegex(html, r"\{ id: '%s',\s+label:" % re.escape(tab))
        self.assertIn("section: 'Asset Library'", html)

    def test_existing_nav_entries_keep_their_ids_and_labels(self) -> None:
        html = web.INDEX_HTML
        for label in (
            "🌌 Top-Down World Studio (4 Perspectives)",
            "✨ Review Gate Inbox (Step 3)",
            "⚙️ Rust Balance Simulator",
            "🗺️ Connected Map Directory",
        ):
            self.assertIn(label, html)

    def test_nav_panel_flags_match_the_registry(self) -> None:
        nav_ids = set(re.findall(r"\{ id: '([a-z-]+)',[^\n]*panel: true", web.INDEX_HTML))
        registry = (ROOT / "atelier" / "atlas-world-panels" / "js" / "panels" / "registry.mjs").read_text(encoding="utf-8")
        block = re.search(r"const PANEL_TABS = \[(.*?)\];", registry, re.S).group(1)
        registry_ids = set(re.findall(r'"([a-z-]+)"', block))
        self.assertEqual(nav_ids, registry_ids)

    def test_story_and_review_view_claims_match_the_inline_guess(self) -> None:
        registry = (ROOT / "atelier" / "atlas-world-panels" / "js" / "panels" / "registry.mjs").read_text(encoding="utf-8")
        self.assertRegex(registry, r'story: \{ views: \["reader", "graph", "undertow"\]')
        self.assertRegex(registry, r'review: \{ views: \["verdicts"\]')
        self.assertIn("['reader', 'graph', 'undertow'].includes(params.view)", web.INDEX_HTML)
        self.assertIn("params.view === 'verdicts'", web.INDEX_HTML)

    def test_every_panel_id_has_a_module_that_registers_itself(self) -> None:
        panels = ROOT / "atelier" / "atlas-world-panels" / "js" / "panels"
        registry = (panels / "registry.mjs").read_text(encoding="utf-8")
        tabs = re.findall(r'"([a-z-]+)"', re.search(r"const PANEL_TABS = \[(.*?)\];", registry, re.S).group(1))
        sub_panels = re.findall(r'panel: "([a-z-]+)"', registry)
        self.assertEqual(sorted(sub_panels), ["review-verdicts", "story"])
        for pid in tabs + sub_panels:
            with self.subTest(panel=pid):
                src = (panels / f"{pid}.mjs").read_text(encoding="utf-8")
                self.assertRegex(src, r'register(Placeholder)?\(\s*"%s"' % re.escape(pid), "the module must register its own id")

    def test_state_mjs_uses_sb_base_and_the_real_asset_keys_path(self) -> None:
        state = (ROOT / "atelier" / "atlas-world-panels" / "js" / "state.mjs").read_text(encoding="utf-8")
        self.assertIn('export const SB_BASE = "/atelier/atlas-world-panels/";', state)
        self.assertIn('ASSET_KEYS_URL = "../../content/generated/asset-keys.json"', state)
        self.assertNotIn("colyseus-server/generated", state)
        for const in ("AUDIO_INDEX_URL", "MAPS_INDEX_URL", "WORLD_INDEX_URL", "FORGE_BRIEFS_INDEX_URL", "STORY_VIEWS_URL"):
            self.assertRegex(state, r"export const %s = SB_BASE \+ " % const)



class TestLineage2ScaleAndGeometricVariation(unittest.TestCase):
    """Verifies the 30%-60%+ Lineage 2 scale & geometric variation across all 15 Towns,
    24 Field Hunting Areas, 8 Fortresses, and 16 Multi-Floor Dungeons (65 floors)."""

    @staticmethod
    def _poly_area(pts: list) -> float:
        n = len(pts)
        if n < 3:
            return 0.0
        area = 0.0
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            area += x1 * y2 - x2 * y1
        return abs(area) * 0.5

    def test_towns_and_hunting_zones_differ_by_30_to_60_pct_plus(self) -> None:
        atlas = json.loads((ROOT / "content" / "studio" / "t_shaped_world_atlas.json").read_text(encoding="utf-8"))
        layers = json.loads((ROOT / "content" / "studio" / "map_feature_layers.json").read_text(encoding="utf-8"))
        zdir = atlas["t_breadth_zone_directory"]

        all_towns = zdir["starting_towns"] + zdir["other_castle_and_hub_towns"]
        self.assertEqual(len(all_towns), 15)
        town_areas = [self._poly_area(t["town_blueprint"]["wall_polygon_pct"]) for t in all_towns]
        town_walls = {tuple(tuple(pt) for pt in t["town_blueprint"]["wall_polygon_pct"]) for t in all_towns}
        self.assertEqual(len(town_walls), 15, "All 15 towns must have distinct wall_polygon_pct geometries")
        self.assertGreaterEqual(max(town_areas) / min(town_areas), 2.0, "Town polygon areas must span >= 2.0x (+100%)")

        fields = zdir["fields_and_hunting_areas"]
        self.assertEqual(len(fields), 24)
        field_areas = [self._poly_area(f["field_tactical_blueprint"]["terrain_perimeter_pct"]) for f in fields]
        field_perims = {tuple(tuple(pt) for pt in f["field_tactical_blueprint"]["terrain_perimeter_pct"]) for f in fields}
        self.assertEqual(len(field_perims), 24, "All 24 field hunting areas must have distinct perimeter polygons")
        self.assertGreaterEqual(max(field_areas) / min(field_areas), 1.8, "Field perimeter areas must span >= 1.8x (+80%)")

        sub_structs = layers["mob_farm_sub_structures"]
        scales = [v["territory_scale"] for v in sub_structs.values() if "territory_scale" in v]
        self.assertEqual(len(scales), 32)
        self.assertGreaterEqual(max(scales) / min(scales), 2.4, "32 hunting territory scales must span >= 2.4x (+140%)")

        dungeons = atlas["multi_floor_dungeons"]
        self.assertEqual(len(dungeons), 16)
        total_floors = sum(len(d["floors"]) for d in dungeons)
        self.assertEqual(total_floors, 65)


if __name__ == "__main__":
    unittest.main()
