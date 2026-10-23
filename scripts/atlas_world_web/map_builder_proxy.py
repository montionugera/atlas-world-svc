"""Proxy from the observatory to the loopback Map Builder service (atelier/map-builder).

`/api/map-builder/<rest>` -> `http://127.0.0.1:${MAP_BUILDER_PORT:-6016}/api/<rest>`.

The Node service stays the only writer of `content/world/**`: it binds loopback and carries
its own Host/Origin + `Content-Type: application/json` guards, so the proxy forwards the
request as-is and never grows publish logic of its own. When the service is not running the
panel must show a clean "Builder service not running" state, so every connection failure maps
to `503 MAP_BUILDER_DOWN`.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from urllib.parse import quote, unquote, urlsplit

PREFIX = "/api/map-builder/"
# Draft sheets are written under build/mapforge/, which the observatory never mounts statically
# (`build` is a blocked segment). The review screen's <img> tags reach them through here instead.
FILES_PREFIX = "/api/map-builder-files/"
FILES_ALLOWED = ("build/mapforge/",)
DEFAULT_PORT = 6016
TIMEOUT_S = 30
MAX_BODY_BYTES = 2 * 1024 * 1024

DOWN_CODE = "MAP_BUILDER_DOWN"


def upstream_base() -> str:
    raw = os.environ.get("MAP_BUILDER_PORT", "").strip()
    port = int(raw) if raw.isdigit() and 0 < int(raw) < 65536 else DEFAULT_PORT
    return f"http://127.0.0.1:{port}"


def _port_label() -> str:
    return upstream_base().rsplit(":", 1)[1]


def upstream_url(path: str, query: str) -> str:
    """`/api/map-builder/jobs/7/log` + `tail=200` -> `<base>/api/jobs/7/log?tail=200`."""
    rest = path[len(PREFIX):]
    url = f"{upstream_base()}/api/{rest}"
    return f"{url}?{query}" if query else url


def _json_payload(status: int, code: str, message: str) -> tuple[int, str, bytes]:
    body = json.dumps({"error": {"code": code, "message": message}}).encode("utf-8")
    return status, "application/json; charset=utf-8", body


def _is_events(path: str) -> bool:
    return path[len(PREFIX):].split("/", 1)[0] == "events"


def forward(method: str, path: str, query: str, body: bytes | None, content_type: str | None):
    """Returns (status, content_type, body). Never raises for an upstream failure."""
    if _is_events(path):
        # A long-lived SSE stream cannot pass through a buffered urllib proxy. A non-200 makes
        # the browser's EventSource give up, and map-builder.mjs then polls /jobs every 2s.
        return _json_payload(503, DOWN_CODE, "SSE not proxied; use polling fallback")
    if ".." in unquote(path[len(PREFIX):]).split("/"):
        return _json_payload(404, "NOT_FOUND", "no such Map Builder route")
    headers = {"Accept": "application/json, text/plain, */*"}
    if body is not None or method != "GET":
        # The service demands application/json on every write, bodiless DELETE included.
        headers["Content-Type"] = content_type or "application/json"
    req = urllib.request.Request(
        upstream_url(path, query), data=body, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return resp.status, resp.headers.get("Content-Type") or "application/octet-stream", resp.read()
    except urllib.error.HTTPError as exc:
        # The service answered: pass its status and error body through unchanged.
        return exc.code, exc.headers.get("Content-Type") or "application/octet-stream", exc.read()
    except (urllib.error.URLError, ConnectionError, TimeoutError, OSError):
        return _json_payload(
            503, DOWN_CODE, f"Map Builder service not running on port {_port_label()}"
        )


def forward_file(path: str):
    """GET one draft artifact from the service's repo-root static handler (which does the containment check)."""
    rel = unquote(path[len(FILES_PREFIX):])
    if ".." in rel.split("/") or "\\" in rel or "\x00" in rel or not rel.startswith(FILES_ALLOWED):
        return _json_payload(404, "NOT_FOUND", "not a Map Builder file")
    req = urllib.request.Request(f"{upstream_base()}/{quote(rel)}", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return resp.status, resp.headers.get("Content-Type") or "application/octet-stream", resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Content-Type") or "application/octet-stream", exc.read()
    except (urllib.error.URLError, ConnectionError, TimeoutError, OSError):
        return _json_payload(
            503, DOWN_CODE, f"Map Builder service not running on port {_port_label()}"
        )


def _read_body(handler) -> bytes | None:
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        raise ValueError("invalid Content-Length") from None
    if length <= 0:
        return None
    if length > MAX_BODY_BYTES:
        raise ValueError("body too large")
    return handler.rfile.read(length)


def _write(handler, status: int, content_type: str, raw: bytes, *, head: bool) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(raw)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    if not head:
        handler.wfile.write(raw)


def handle(handler, path: str, method: str, *, head: bool = False) -> None:
    """Proxy one request. `path` is the already-split URL path; the query comes off the handler."""
    split = urlsplit(handler.path)
    if path.startswith(FILES_PREFIX):
        status, ctype, raw = forward_file(path)
        _write(handler, status, ctype, raw, head=head)
        return
    body = None
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        try:
            body = _read_body(handler)
        except ValueError as exc:
            status, ctype, raw = _json_payload(400, "BAD_REQUEST", str(exc))
            _write(handler, status, ctype, raw, head=head)
            return
    status, ctype, raw = forward(
        method, path, split.query, body, handler.headers.get("Content-Type")
    )
    _write(handler, status, ctype, raw, head=head)
