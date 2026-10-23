"""Route table for the observatory. `ObservatoryHandler` calls `dispatch` first; when it
returns False the handler's original if/else chain runs unchanged.

Handlers here take the live `BaseHTTPRequestHandler` and use only its stdlib surface, so
this module never has to import `catalog_explorer_web`.
"""

from __future__ import annotations

import json
from urllib.parse import urlsplit

from . import map_builder_proxy, review_queue, static_mounts

MAX_BODY_BYTES = 2 * 1024 * 1024


def _send_json(handler, payload: dict, status: int = 200, *, head: bool = False) -> None:
    raw = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    if not head:
        handler.wfile.write(raw)


def _error(handler, status: int, code: str, message: str, *, head: bool = False) -> None:
    _send_json(handler, {"error": {"code": code, "message": message}}, status, head=head)


class _Refused(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code = status, code


def _guard_write(handler) -> None:
    """The server binds 0.0.0.0 with no auth, so a page on another origin must not be able to
    write the queue. `application/json` forces a CORS preflight (which this server never
    answers); a mismatched Origin is refused outright."""
    ctype = (handler.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if ctype != "application/json":
        raise _Refused(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json")
    origin = handler.headers.get("Origin")
    if origin and urlsplit(origin).netloc != (handler.headers.get("Host") or ""):
        raise _Refused(403, "CROSS_ORIGIN", "cross-origin writes are not allowed")


def _read_json(handler):
    """Parsed JSON body, or raises review_queue.QueueError (-> 400)."""
    _guard_write(handler)
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        raise review_queue.QueueError("invalid Content-Length") from None
    if length <= 0:
        raise review_queue.QueueError("empty body")
    if length > MAX_BODY_BYTES:
        raise review_queue.QueueError("body too large")
    try:
        return review_queue.parse_json(handler.rfile.read(length).decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise review_queue.QueueError("body is not valid JSON") from None


def _healthz(handler, path: str, *, head: bool = False) -> None:
    _send_json(handler, {"ok": True}, head=head)


def _static(handler, path: str, *, head: bool = False) -> bool:
    overrides = {"content/review-queue.json": review_queue.queue_path()}
    target = static_mounts.safe_resolve(path, overrides=overrides)
    if target is None:
        return False
    static_mounts.serve(handler, target, head=head)
    return True


def _post_asset_verdicts(handler, path: str) -> None:
    try:
        result = review_queue.apply_asset_verdicts(_read_json(handler))
    except _Refused as exc:
        _error(handler, exc.status, exc.code, str(exc))
        return
    except review_queue.QueueError as exc:
        _error(handler, 400, "BAD_REQUEST", str(exc))
        return
    _send_json(handler, {"ok": True, "queue": result})


def _post_work_orders(handler, path: str) -> None:
    try:
        result = review_queue.append_work_orders(_read_json(handler))
    except _Refused as exc:
        _error(handler, exc.status, exc.code, str(exc))
        return
    except review_queue.QueueError as exc:
        _error(handler, 400, "BAD_REQUEST", str(exc))
        return
    _send_json(handler, result)


def _map_builder(method: str):
    def run(handler, path: str, *, head: bool = False) -> None:
        if method != "GET":
            # Same guard as the other writes: the Node service is loopback-only precisely so a page
            # on another origin cannot publish, and this proxy must not weaken that.
            try:
                _guard_write(handler)
            except _Refused as exc:
                _error(handler, exc.status, exc.code, str(exc))
                return
        map_builder_proxy.handle(handler, path, method, head=head)

    return run


# (exact path | prefix ending in "/") -> handler. Checked in order.
ROUTES = {
    "GET": [
        ("/healthz", _healthz),
        ("/api/map-builder/", _map_builder("GET")),
        ("/api/map-builder-files/", _map_builder("GET")),
    ],
    "POST": [
        ("/api/review-queue/asset-verdicts", _post_asset_verdicts),
        ("/api/review-queue/work-orders", _post_work_orders),
        ("/api/map-builder/", _map_builder("POST")),
    ],
    "DELETE": [("/api/map-builder/", _map_builder("DELETE"))],
}


def _match(table, path: str):
    for pattern, fn in table:
        if path == pattern or (pattern.endswith("/") and path.startswith(pattern)):
            return fn
    return None


def dispatch(handler, method: str) -> bool:
    """Handle the request if a route here owns it; return False to fall through."""
    path = urlsplit(handler.path).path
    head = method == "HEAD"
    lookup = "GET" if head else method
    fn = _match(ROUTES.get(lookup, []), path)
    if fn is not None:
        if head:
            fn(handler, path, head=True)
        else:
            fn(handler, path)
        return True
    if method in ("GET", "HEAD"):
        return _static(handler, path, head=head)
    return False
