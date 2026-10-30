"""Read-only static mounts: repo paths served at their own URL path.

Every storybook module fetches `../../<repo path>` relative to
`/atelier/atlas-world-panels/index.html`; from the explorer page at `/` those URLs clamp to
`/<repo path>`, so mounting a repo path at the same URL path needs no module change.

`safe_resolve` is the only door: it decodes, rejects dot segments and blocklisted
segments, matches an allowlisted mount, then checks containment with
`Path.resolve()` + `is_relative_to` (never a string prefix compare).
"""

from __future__ import annotations

import shutil
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]

# Directory mounts (URL prefix == repo-relative directory).
MOUNT_DIRS: tuple[str, ...] = (
    "game-client/assets",
    "content/generated",
    "content/world",
    "content/story",
    "content/studio",
    "content/concept-art",
    "atelier/atlas-world-panels",
    "atelier/mapforge/lib",
    "atelier/art-forge/runs",
    "atelier/art-forge/briefs",
    "atelier/art-forge/out",
    "atelier/story-explorer",
    "docs/story/undertow",
    "atelier/combat-lab",
)

# Single-file mounts.
MOUNT_FILES: tuple[str, ...] = (
    "content/asset-taxonomy.json",
    "content/review-queue.json",
)

# The only dot-directory that may be served.
DOT_ALLOWED_PREFIX = ("game-client", "assets", ".thumbs")

# Path segments that are never served, wherever they appear.
BLOCKED_SEGMENTS = frozenset({".git", "build", "graft", "node_modules", ".claude"})

MIME: dict[str, str] = {
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".bin": "application/octet-stream",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}

NO_STORE_EXTS = frozenset({".json", ".mjs", ".html"})


def _segments(url_path: str) -> list[str] | None:
    """Decode once and split into path segments, or None for a hostile path."""
    decoded = unquote(url_path)
    if "\x00" in decoded or "\\" in decoded:
        return None
    return [s for s in decoded.split("/") if s]


def _segment_ok(segments: list[str]) -> bool:
    if tuple(segments[:3]) == DOT_ALLOWED_PREFIX:
        rest = segments[3:]
    else:
        rest = segments
    for seg in rest:
        if seg.startswith("."):
            return False
    for seg in segments:
        low = seg.lower()
        if low in BLOCKED_SEGMENTS or low.endswith(".sqlite") or low.startswith(".env"):
            return False
    return True


def _mount_for(segments: list[str]) -> str | None:
    rel = "/".join(segments)
    for f in MOUNT_FILES:
        if rel == f:
            return f
    for d in MOUNT_DIRS:
        if rel == d or rel.startswith(d + "/"):
            return d
    return None


def safe_resolve(url_path: str, *, overrides: dict[str, Path] | None = None) -> Path | None:
    """Map a URL path to a servable file under an allowlisted mount, or None.

    `overrides` maps an exact repo-relative file mount to the file actually served
    (used so `/content/review-queue.json` shows what the writer writes when
    `ATLAS_REVIEW_QUEUE_PATH` points elsewhere).
    """
    segments = _segments(url_path)
    if not segments or not _segment_ok(segments):
        return None
    mount = _mount_for(segments)
    if mount is None:
        return None
    rel = "/".join(segments)
    if overrides and rel in overrides and rel in MOUNT_FILES:
        candidate = overrides[rel]
        mount_root = candidate.resolve()
    else:
        candidate = ROOT.joinpath(*segments)
        mount_root = (ROOT / mount).resolve()
    try:
        resolved = candidate.resolve()
    except (OSError, RuntimeError):
        return None
    if not resolved.is_relative_to(mount_root):
        return None
    if resolved.is_dir() and url_path.endswith("/"):
        resolved = resolved / "index.html"
    if not resolved.is_file():
        return None
    if resolved.suffix.lower() not in MIME:
        return None
    return resolved


def serve(handler, path: Path, *, head: bool = False) -> None:
    """Stream `path` with MIME, ETag and the right Cache-Control."""
    ext = path.suffix.lower()
    st = path.stat()
    etag = f'"{st.st_mtime_ns:x}-{st.st_size:x}"'
    if handler.headers.get("If-None-Match") == etag and ext not in NO_STORE_EXTS:
        handler.send_response(304)
        handler.send_header("ETag", etag)
        handler.end_headers()
        return
    handler.send_response(200)
    handler.send_header("Content-Type", MIME[ext])
    handler.send_header("Content-Length", str(st.st_size))
    if ext in NO_STORE_EXTS:
        handler.send_header("Cache-Control", "no-store")
    else:
        handler.send_header("Cache-Control", "no-cache")
        handler.send_header("ETag", etag)
    handler.end_headers()
    if head:
        return
    try:
        with open(path, "rb") as fh:
            shutil.copyfileobj(fh, handler.wfile, 64 * 1024)
    except (BrokenPipeError, ConnectionResetError):
        # Clients drop mid-stream all the time (hover audio, scrolled-past thumbs).
        pass

