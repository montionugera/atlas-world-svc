# F-091 Handoff — Native Rust Meta Engine and Trait-Backed Persistence

- **Goal:** Replace the external Go/Goja Nakama + CockroachDB stack with an in-process Rust Meta Engine (`server-rs/src/meta/`) backed by trait-based persistence (`InMemoryMetaStore`, embedded WAL `SqliteMetaStore`, and `PostgresMetaStore`) and a drop-in Nakama `/v2/*` HTTP wire-compatible gateway on `server-rs`.
- **Spec:** `docs/superpowers/specs/2026-10-18-rust-meta-engine-nakama-replacement-design.md`
- **Plan:** `.claude/refined_backlog/F-091-native-rust-meta-engine-and-trait-backed/plan.md`
- **State:** Spec approved at R0 gate; `I-198` refined into `F-091`; `plan.md` written and audited.
- **Next Step:** Claim `F-091` (`psrw claim F-091`), execute Tasks 1–4 in `.claude/worktrees/F-091-native-rust-meta-engine-and-trait-backed`, run Gate 1 (`./scripts/precheck.sh --no-install`), and ship (`psrw ship --no-deploy`).
