# Implementation Plan: F-059 (E-001 Slice 5) Platform Decorator Support, Full Client Cutover & Release Promotion

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-059-5`  
**Branch:** `feat/F-059`  
**Epic:** `E-001` (Rust game server migration - high-density ECS and Rapier physics core)  
**Goal:** Implement functional utility function wrappers (`withRetry`, `withCache`, `withCircuitBreaker`, `withRateLimit`, `withDistributedLock`, `withTrace`, `withTracking`) in `node-server-decorator`, cut over the React game client to `server-rs` with FlatBuffers binary streaming, build the containerized deployment for local Agones/k8s, decommission the legacy Colyseus server, verify all quality gates, ship F-059, and promote release 1.10.

---

## Batch 1: Platform Utility Functions Support in `node-server-decorator`
- **Location:** `/Users/pasitnusso/workspace/repos/node-server-decorator`
- **Task 1:**
  - Implement functional wrapper utilities in `node/packages/core/src/utils/functional.ts`:
    - `withRetry<T>(fn: (...args: any[]) => Promise<T> | T, options?: RetryOptions): (...args: any[]) => Promise<T>`
    - `withCache<T>(fn: (...args: any[]) => Promise<T> | T, options: CacheOptions): (...args: any[]) => Promise<T>`
    - `withCircuitBreaker<T>(fn: (...args: any[]) => Promise<T> | T, options: CircuitBreakerOptions): (...args: any[]) => Promise<T>`
    - `withRateLimit<T>(fn: (...args: any[]) => Promise<T> | T, options: RateLimitOptions): (...args: any[]) => Promise<T>`
    - `withDistributedLock<T>(lockKeyOrResolver: string | ((...args: any[]) => string), fn: (...args: any[]) => Promise<T> | T, options?: DistributedLockOptions): (...args: any[]) => Promise<T>`
    - `withTrace<T>(spanName: string, fn: (...args: any[]) => Promise<T> | T, options?: TraceOptions): (...args: any[]) => Promise<T>`
    - `withTracking<T>(eventType: string, fn: (...args: any[]) => Promise<T> | T, options?: any): (...args: any[]) => Promise<T>`
  - Export from `node/packages/core/src/index.ts`.
  - Fix devDependencies / mock for `src/adapters/express.spec.ts`.
  - Author unit tests in `node/packages/core/test/functional.spec.ts`.
  - Verify with `pnpm --filter @montionugera/server-decorator test` and `pnpm test`.

---

## Batch 2: Game Client Cutover in `atlas-world-svc` (`client/react-client`)
- **Location:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-059-5/client/react-client`
- **Task 2:**
  - Author `client/react-client/src/hooks/useServerRsClient.ts`:
    - React hook connecting via WebSocket to `server-rs` gateway (supporting `SERVER_RS_URL` or default `ws://localhost:2567?token=...`).
    - Decodes incoming binary ArrayBuffer frames using `BinaryDeltaDecoder` from `@atlas/contracts`.
    - Dispatches entity updates (`Player`, `Mob`, positions, health, combat state) to React state.
    - Sends FlatBuffers-encoded `ClientInput` frames for player movement and actions at 20 Hz.
  - Update `client/react-client/src/App.tsx` and canvas components to toggle / use `useServerRsClient`.
  - Author unit test `client/react-client/src/hooks/useServerRsClient.test.ts`.
  - Verify `npm test` in `client/react-client` passes 100%.

---

## Batch 3: Containerization & Agones/K8s Local Deployment Parity
- **Location:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-059-5`
- **Task 3:**
  - Create multi-stage production Dockerfile `server-rs/Dockerfile`:
    - Build stage: `rust:1.85-slim-bookworm` with cargo release build.
    - Runtime stage: `debian:bookworm-slim` with ca-certificates and curl, non-root user, port 2567.
  - Create Agones GameServer / Fleet manifest `k8s/local/server-rs-gameserver.yaml`.
  - Update `scripts/deploy-local.sh` to build and deploy `server-rs`.
  - Retire / mark legacy `colyseus-server` in documentation and compose/k8s configs.

---

## Batch 4: Verification, Quality Gates & Release Promotion
- **Location:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-059-5`
- **Task 4:**
  - Run full Gate 1 (`./scripts/precheck.sh --no-install`).
  - Update `README.md` and documentation with the new architecture, endpoints, and deployment instructions.
  - Commit changes to `feat/F-059`.
  - Ship `F-059` to `release/1.10` via `psrw ship --no-deploy`.
  - Verify epic `E-001` completion (5/5 slices shipped).
  - Promote release 1.10 via `psrw promote`.
