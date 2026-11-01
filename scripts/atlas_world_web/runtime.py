"""Read-only release mode: the flag, the version it reports, and the write refusal.

The env is read on every call so tests and a restarted pod never see a cached answer.
"""

from __future__ import annotations

import hashlib
import json
import os

READ_ONLY_MESSAGE = "This is a read-only release page. Edit on atlas-edit.joymify.local.com."
MISSING_THUMB_SVG = (
    b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    b'<rect width="64" height="64" fill="#2a2d34"/>'
    b'<path d="M20 20l24 24M44 20L20 44" stroke="#6b7280" stroke-width="3"/></svg>'
)


def read_only() -> bool:
    return os.environ.get("ATLAS_READ_ONLY") == "1"


def payload() -> dict:
    if not read_only():
        return {"readOnly": False, "release": None, "commit": None}
    return {
        "readOnly": True,
        "release": os.environ.get("ATLAS_RELEASE") or None,
        "commit": os.environ.get("ATLAS_COMMIT") or None,
    }


def refuse_write(handler) -> bool:
    """Answer 403 and return True while read-only. Call first in do_POST and do_DELETE."""
    if not read_only():
        return False
    raw = json.dumps(
        {"ok": False, "error": {"code": "read_only", "message": READ_ONLY_MESSAGE}}
    ).encode("utf-8")
    # The request body stays unread, so this connection can't carry another request.
    handler.close_connection = True
    handler.send_response(403)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Connection", "close")
    handler.end_headers()
    handler.wfile.write(raw)
    return True


def send_missing_thumb(handler) -> bool:
    """While read-only, a thumb with no file gets a plain placeholder, not another asset's art."""
    if not read_only():
        return False
    handler.send_response(200)
    handler.send_header("Content-Type", "image/svg+xml")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("X-Thumb-Missing", "1")
    handler.send_header("Content-Length", str(len(MISSING_THUMB_SVG)))
    handler.end_headers()
    handler.wfile.write(MISSING_THUMB_SVG)
    return True


def mark_body(html: str) -> str:
    """Server-set so no write control flashes before the first script runs."""
    if not read_only():
        return html
    return html.replace("<body>", '<body data-read-only="1">', 1)


def send_cacheable(handler, raw: bytes, content_type: str, host_cache_control: str) -> None:
    """Keep the host's long cache; while read-only, revalidate so old art can't outlive a release."""
    if not read_only():
        handler.send_response(200)
        handler.send_header("Content-Type", content_type)
        handler.send_header("Cache-Control", host_cache_control)
        handler.send_header("Content-Length", str(len(raw)))
        handler.end_headers()
        handler.wfile.write(raw)
        return
    etag = '"' + hashlib.md5(raw, usedforsecurity=False).hexdigest() + '"'
    if handler.headers.get("If-None-Match") == etag:
        handler.send_response(304)
        handler.send_header("ETag", etag)
        handler.end_headers()
        return
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("ETag", etag)
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)
