# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Real-time multiplayer game. **`server-rs/`** (Rust, `bevy_ecs` + `rapier2d`) is the authoritative simulation and WebSocket gateway; it also hosts the meta/persistence engine (`server-rs/src/meta/`) and the Agones fleet lifecycle (`server-rs/src/fleet/`). `nakama/` holds the TypeScript meta RPCs, `contracts/` the shared TS types/content contracts, `client/react-client/` the web client, `game-client/` the Godot client. **The old Colyseus server (`colyseus-server/`) is gone** — any doc or rule that names `GameRoom`, `BattleModule`, `Planck.js` or `colyseus-server/` is history (see `docs/archive/`).

This is a **pnpm workspace** (`pnpm-workspace.yaml` → `client`, `contracts`, `nakama`) with no root scripts; `client/react-client/` has its own `package-lock.json` and needs a separate `npm ci`. Use pnpm at the root (`npm install` fails on `workspace:*`).

## Commands

**Gate 1 (what `psrw ship` runs):** `./scripts/precheck.sh` (`--no-install` if deps exist). The server-rs section is skipped when no rust-relevant path changed; `PRECHECK_FULL=1` forces everything.

```bash
# server-rs (from server-rs/)
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
# contracts / nakama (from the package dir)
pnpm run build ; pnpm test ; npx tsc --noEmit    # see each package.json
# web client (from client/react-client/)
npm start            # CRA dev server
CI=true npx react-scripts test --watchAll=false
```

Keep cargo light on a laptop: Gate 1 caps workers at `ATLAS_MAX_WORKERS` (default 2).

## Service endpoints (local)

- `ws://localhost:2567` — `server-rs` WebSocket gateway (`PORT` env, default 2567)
- `http://atlas-world.joymify.local.com` — read-only release app (cluster workload `deployment/atlas-world-web`)
- `http://atlas-edit.joymify.local.com` / `http://localhost:8788` — edit host (`python3 scripts/catalog_explorer_web.py --port 8788`)
- `http://localhost:3001` — React client

## Non-obvious invariants

- **Server-authoritative, always.** Clients send input intents only (move vectors, discrete actions), never position/velocity. All HP/combat mutation is server-side.
- **Simulation takes time as an input.** Gate per-tick work on simulated time (`server-rs/src/core/clock.rs`, `SimClock`), not `Instant::now()` / `Date.now()` — real-time clocks lose determinism (F-028). The tick period lives in `server-rs/src/main.rs` (`sim_ticker`); trust the code over README targets.
- **Determinism is a pinned contract.** Node/Rust versions that run map tooling and byte gates are pinned (`.release.json` `nodeMajor`); do not "fix" them casually.
- **Do not read `docs/story/undertow/` (novel, ~350 KB) or `docs/archive/` unless the task needs them.**

## Tests

Rust: `server-rs/tests/` and inline unit tests (`cargo test`). TS: jest in `contracts/` and `nakama/`; CRA tests in `client/react-client/`; `node --test` suites under `atelier/*/tests` and `scripts/tests` (use the glob `tests/*.test.mjs` on Node 24). Cover boundary cases for combat/timing changes and inject time instead of sleeping.

## Conventions

- TypeScript strict mode; no unjustified `any`. Prettier + ESLint must pass.
- Trunk-based: short-lived `feature/`, `fix/`, `docs/` branches off `main`; **squash-merge only**; conventional commit subjects (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`), kept short.
- This repo is opted into **ps-release-workflow** (`.release.json` present) — backlog/feature work routes through `/ps-release-workflow:*` skills and `.claude/idea_backlog/` + `.claude/refined_backlog/`.
- **Every produced artifact (maps, sheets, renders, reports) must be observable in a review surface** — a review surface now means the edit host (`:8788`, `atlas-edit.joymify.local.com`) before shipping and the release app (`atlas-world.joymify.local.com`) after (the asset storybook's panels live there now; the nginx storybook pod and its `atlas-storybook` hostname are retired, the hostname permanently redirects to `/?tab=assets`); wiring new artifact types into it is part of the producing feature's acceptance criteria (owner rule, 2026-08-15). The maps parity gate (`atelier/atlas-world-panels/tests/maps-index.test.mjs`) enforces this for mapforge sheets, and `tests/panel-parity.test.mjs` fails if a storybook tab has no atlas-world panel.

## Further docs

`docs/` holds the authoritative specs — notably `docs/event-flow.spec.md`, `docs/game-server.spec.md`, `docs/companion.spec.md`. `.cursor/rules/*.mdc` contain the full coding-standard set summarized above.

## Agent skills

### Issue tracker

Issues tracked as GitHub issues (`montionugera/atlas-world-svc`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` + `docs/adr/` at repo root). Repo is a monorepo — switch this line to multi-context (`CONTEXT-MAP.md`) if you split docs per package. See `docs/agents/domain.md`.
