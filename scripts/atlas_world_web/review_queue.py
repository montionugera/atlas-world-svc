"""Single writer for `content/review-queue.json`.

Every mutation is one locked read-modify-write: a process-wide `threading.Lock` (the
server is a `ThreadingHTTPServer`) plus an `fcntl.flock` on a sidecar file (a second
process, e.g. the Mac app's own server), then a temp file in the same directory and
`os.replace`. Unknown top-level keys (`proposals`, `playerScaleAnchor`, `agentEditLog`,
anything added later) are never dropped because the whole parsed document round-trips.

Canonical shape (version stays 1; schema: content/schemas/review-queue.schema.json):

    verdicts[<assetKey>] = {verdict: reject|rebuild, note, updatedAt, source}
    workOrders[]         = {id: "wo-0001", kind: forge|proposal-reroll, createdAt, clientId?, ...}

Transactions must not be nested: the thread lock is not re-entrant.
"""

from __future__ import annotations

import contextlib
import copy
import fcntl
import json
import os
import re
import shutil
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PATH = ROOT / "content" / "review-queue.json"
DEFAULT_LOCK_PATH = ROOT / "build" / ".review-queue.lock"

VERDICTS = frozenset({"reject", "rebuild"})
WORK_ORDER_CELLS = frozenset({"blockin", "render", "gate", "intake"})
WORK_ORDER_KINDS = frozenset({"forge", "proposal-reroll"})
FORGE_FIELDS = frozenset({"kind", "clientId", "briefId", "cell", "reason", "seed"})
REROLL_FIELDS = frozenset({"kind", "clientId", "proposalId", "targetId", "feedback"})

# fullmatch, not `$`: `$` also matches before a trailing newline.
_ASSET_KEY_RE = re.compile(r"\S{1,200}")
_BRIEF_ID_RE = re.compile(r"[A-Za-z0-9-]+")
_CLIENT_ID_RE = re.compile(r"[A-Za-z0-9._:-]{1,120}")
_WO_ID_RE = re.compile(r"wo-(\d+)")

_THREAD_LOCK = threading.Lock()


class QueueError(ValueError):
    """Bad client input; the HTTP layer maps it to a 400."""


def queue_path() -> Path:
    """The live queue file. `ATLAS_REVIEW_QUEUE_PATH` lets tests point at a temp copy."""
    raw = os.environ.get("ATLAS_REVIEW_QUEUE_PATH")
    return Path(raw) if raw else DEFAULT_PATH


def _lock_path(path: Path) -> Path:
    if path == DEFAULT_PATH:
        return DEFAULT_LOCK_PATH
    return path.with_name(f".{path.name}.lock")


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _reject_constant(name: str):
    raise ValueError(f"non-finite number {name} is not valid JSON")


def parse_json(text: str):
    """json.loads that refuses NaN/Infinity: a bare NaN in the queue file breaks every
    browser `res.json()` that reads it (the whole observatory bundle embeds the queue)."""
    return json.loads(text, parse_constant=_reject_constant)


def _normalise(doc: object) -> dict:
    out = doc if isinstance(doc, dict) else {}
    out.setdefault("version", 1)
    if not isinstance(out.get("verdicts"), dict):
        out["verdicts"] = {}
    if not isinstance(out.get("workOrders"), list):
        out["workOrders"] = []
    if not isinstance(out.get("proposals"), list):
        out["proposals"] = []
    return out


def load() -> dict:
    """Read-only snapshot (no lock needed: writes replace the file atomically)."""
    path = queue_path()
    try:
        return _normalise(parse_json(path.read_text(encoding="utf-8")))
    except FileNotFoundError:
        return _normalise({})


class Transaction:
    def __init__(self, path: Path, doc: dict) -> None:
        self.path = path
        self.doc = doc
        self._baseline = copy.deepcopy(doc)

    def save(self) -> bool:
        """Atomically persist `doc`. A no-op (doc unchanged) never touches the file."""
        if self.doc == self._baseline:
            return False
        payload = json.dumps(self.doc, indent=2, allow_nan=False) + "\n"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=self.path.parent, prefix=f".{self.path.name}.", suffix=".tmp")
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(payload)
                fh.flush()
                os.fsync(fh.fileno())
            if self.path.exists():
                shutil.copymode(self.path, tmp)
            else:
                tmp.chmod(0o644)
            os.replace(tmp, self.path)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        self._baseline = copy.deepcopy(self.doc)
        return True


@contextlib.contextmanager
def _locked():
    """Both locks, no parsing: yields the queue path."""
    path = queue_path()
    lock_file = _lock_path(path)
    lock_file.parent.mkdir(parents=True, exist_ok=True)
    with _THREAD_LOCK:
        with open(lock_file, "a") as lock_fh:
            fcntl.flock(lock_fh, fcntl.LOCK_EX)
            try:
                yield path
            finally:
                fcntl.flock(lock_fh, fcntl.LOCK_UN)


@contextlib.contextmanager
def transaction():
    """Hold both locks, yield a Transaction over the freshly-read queue."""
    with _locked() as path:
        try:
            doc = _normalise(parse_json(path.read_text(encoding="utf-8")))
        except FileNotFoundError:
            doc = _normalise({})
        yield Transaction(path, doc)


def restore_from(backup: Path) -> None:
    """Undo support: put a snapshot copy back as the queue — under the lock, atomically."""
    # Lock only — never parse: undo must be able to recover a malformed or hand-edited queue.
    with _locked() as path:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
        os.close(fd)
        tmp = Path(tmp_name)
        try:
            shutil.copyfile(backup, tmp)
            shutil.copymode(path, tmp) if path.exists() else tmp.chmod(0o644)
            os.replace(tmp, path)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise


def update(fn) -> dict:
    """`fn(doc)` mutates the queue in place; the result is written atomically."""
    with transaction() as tx:
        fn(tx.doc)
        tx.save()
        return copy.deepcopy(tx.doc)


def next_work_order_id(doc: dict) -> str:
    """`wo-%04d`: max existing numeric id + 1 (legacy `wo-001` parses as 1; storybook-era
    ids like `wo-<brief>-<cell>-...` don't match and are ignored)."""
    top = 0
    for wo in doc.get("workOrders") or []:
        m = _WO_ID_RE.fullmatch(str((wo or {}).get("id") or ""))
        if m:
            top = max(top, int(m.group(1)))
    return f"wo-{top + 1:04d}"


def append_work_order(doc: dict, fields: dict) -> dict:
    """Append one server-id'd work order to an already-open queue doc."""
    wo = {"id": next_work_order_id(doc), "createdAt": now_iso(), **fields}
    doc["workOrders"].append(wo)
    return wo


# ---------- request validation (rules reused from js/review/store.mjs) ----------


def _validate_verdicts(payload: object) -> dict[str, dict | None]:
    verdicts = payload.get("verdicts") if isinstance(payload, dict) else None
    if not isinstance(verdicts, dict) or not verdicts:
        raise QueueError("body must be {verdicts: {<assetKey>: {verdict, note} | null}}")
    clean: dict[str, dict | None] = {}
    for key, rec in verdicts.items():
        if not isinstance(key, str) or not _ASSET_KEY_RE.fullmatch(key):
            raise QueueError(f"invalid asset key: {key!r}")
        if rec is None:
            clean[key] = None
            continue
        if not isinstance(rec, dict):
            raise QueueError(f"{key}: verdict must be an object or null")
        verdict = rec.get("verdict")
        if verdict not in VERDICTS:
            raise QueueError(f'{key}: unknown verdict "{verdict}" — must be one of {sorted(VERDICTS)}')
        note = rec.get("note")
        note = note.strip() if isinstance(note, str) else ""
        if not note:
            raise QueueError(f"{key}: a verdict needs a note — it is the instruction whoever rebuilds the asset will act on")
        clean[key] = {"verdict": verdict, "note": note}
    return clean


def apply_asset_verdicts(payload: object) -> dict:
    """Merge/delete asset-key verdicts. All-or-nothing; returns the new queue."""
    clean = _validate_verdicts(payload)

    def mutate(doc: dict) -> None:
        stamp = now_iso()
        for key, rec in clean.items():
            if rec is None:
                doc["verdicts"].pop(key, None)
                continue
            prior = doc["verdicts"].get(key)
            if isinstance(prior, dict) and prior.get("verdict") == rec["verdict"] and prior.get("note") == rec["note"]:
                continue  # re-asserting what is committed is not a change
            doc["verdicts"][key] = {**rec, "updatedAt": stamp, "source": "assets"}

    return update(mutate)


def _validate_work_order(raw: object, idx: int) -> dict:
    if not isinstance(raw, dict):
        raise QueueError(f"workOrders[{idx}] must be an object")
    kind = raw.get("kind")
    if kind not in WORK_ORDER_KINDS:
        raise QueueError(f"workOrders[{idx}]: kind must be one of {sorted(WORK_ORDER_KINDS)}")
    allowed = FORGE_FIELDS if kind == "forge" else REROLL_FIELDS
    unknown = sorted(set(raw) - allowed - {"id", "createdAt"})
    if unknown:
        raise QueueError(f"workOrders[{idx}]: unknown field(s) {unknown} for kind {kind!r}")
    fields = {k: v for k, v in raw.items() if k in allowed}
    client_id = fields.get("clientId")
    if client_id is not None and (not isinstance(client_id, str) or not _CLIENT_ID_RE.fullmatch(client_id)):
        raise QueueError(f"workOrders[{idx}]: invalid clientId")
    if kind == "forge":
        brief = fields.get("briefId")
        if not isinstance(brief, str) or not _BRIEF_ID_RE.fullmatch(brief):
            raise QueueError(f"workOrders[{idx}]: briefId must match /^[A-Za-z0-9-]+$/")
        if fields.get("cell") not in WORK_ORDER_CELLS:
            raise QueueError(f"workOrders[{idx}]: cell must be one of {sorted(WORK_ORDER_CELLS)}")
        reason = fields.get("reason")
        reason = reason.strip() if isinstance(reason, str) else ""
        if not reason:
            raise QueueError(f"workOrders[{idx}]: a work order needs a reason")
        fields["reason"] = reason
        seed = fields.get("seed")
        if seed is not None and (isinstance(seed, bool) or not isinstance(seed, int) or seed < 0):
            raise QueueError(f"workOrders[{idx}]: seed must be a non-negative integer")
    else:
        if not isinstance(fields.get("proposalId"), str) or not fields["proposalId"]:
            raise QueueError(f"workOrders[{idx}]: proposal-reroll needs a proposalId")
        for key in ("targetId", "feedback"):
            if fields.get(key) is not None and not isinstance(fields[key], str):
                raise QueueError(f"workOrders[{idx}]: {key} must be a string")
    return fields


def append_work_orders(payload: object) -> dict:
    """Append work orders; the server assigns ids; a repeated clientId is a no-op."""
    raw = payload.get("workOrders") if isinstance(payload, dict) else None
    if not isinstance(raw, list) or not raw:
        raise QueueError("body must be {workOrders: [{kind, clientId, ...}]}")
    cleaned = [_validate_work_order(item, i) for i, item in enumerate(raw)]
    created: list[str] = []
    skipped: list[str] = []

    def mutate(doc: dict) -> None:
        seen = {wo.get("clientId") for wo in doc["workOrders"] if isinstance(wo, dict) and wo.get("clientId")}
        for fields in cleaned:
            cid = fields.get("clientId")
            if cid and cid in seen:
                skipped.append(cid)
                continue
            wo = append_work_order(doc, fields)
            created.append(wo["id"])
            if cid:
                seen.add(cid)

    queue = update(mutate)
    return {"ok": True, "created": created, "skipped": skipped, "queue": queue}
