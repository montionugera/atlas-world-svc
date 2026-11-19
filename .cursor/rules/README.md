# Atlas World — Cursor Rules

This directory contains development rules for `atlas-world-svc`: authoritative Rust game server (`server-rs/`), Godot 4.7 C# client (`game-client/`), shared TypeScript contracts (`contracts/`), React web client (`client/react-client/`), and content/atelier pipelines (`content/`, `atelier/`, `scripts/`).

## Rule Files

### Workflow and standards
- **atlas-world-project.mdc** — Stack overview, architecture invariants, unit contract (`1 unit = 1 metre`), verification commands
- **01-development-workflow.mdc** — Branch strategy (`ps-release-workflow`), commits, PRs, docs/plans (`docs/superpowers/`, `.claude/refined_backlog/`)
- **02-coding-standards.mdc** — Rust & TypeScript standards, naming, error handling, performance
- **03-project-structure.mdc** — Root layout, `server-rs/`, `game-client/`, `contracts/`, `client/react-client/`, `content/`, `atelier/`
- **01-apis-and-constructors.mdc** — Single-path APIs, options objects, no overloads (globs: `*.ts`)
- **02-accuracy-correctness.mdc** — Timing (`SimClock`), rendering scale, heading, authority, event bus, tests
- **05-entity-lifecycle.mdc** — Transition methods and active vs total counts (globs: `*.ts`)
- **graft.mdc** — Using the `graft/` repo context graph

### Server, client, and tooling
- **04-csharp-client.mdc** — Godot 4.7 C# NativeAOT client (`game-client/`)
- **react-client.mdc** — React web client (`client/react-client/**/*.ts(x)`)
- **typescript.mdc** — TypeScript rules for `contracts/` and `client/react-client/`
- **docker-compose.mdc** — `server-rs/Dockerfile`, local ports, and `k8s/local/` manifests

### Testing and QA
- **testing.mdc** — `fastcheck.sh`, `precheck.sh`, `cargo test`, `pnpm test`, `node --test` suites
- **04-testing-qa.mdc** — Coverage targets, chaos, monitoring

### Docs
- Project docs: **docs/README.md** (gameplay specs, `docs/unit-contract.md`, `docs/asset-delivery-spec.md`, `docs/game-server.spec.md`, `docs/superpowers/`)

## Quick Reference

```bash
# Fast mid-iteration check (<15s)
./scripts/fastcheck.sh

# Full Gate 1 pre-ship check
./scripts/precheck.sh --no-install

# Rust server (ws://localhost:2567)
cd server-rs && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test

# Contracts (pnpm workspace)
cd contracts && pnpm run build && pnpm test && npx tsc --noEmit

# Content & script tests
node scripts/check_content.mjs
node --test scripts/tests/*.test.mjs

# Local observatory edit host (http://localhost:8788)
python3 scripts/catalog_explorer_web.py --port 8788
```

## Maintaining Rules
- Keep rules aligned with `CLAUDE.md`, `docs/unit-contract.md`, and the active stack (`server-rs/` + `game-client/`).
- After architecture changes, update `03-project-structure.mdc` and the relevant domain rule.
