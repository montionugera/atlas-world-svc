---
name: gr-iteration-loop
description: "Autonomous Graded Review & Guardrail Multi-Iteration Loop. Evaluates implementations across N orthogonal dimensions with normalized scoring ([s1, s2, s3, ...]), enforces anti-look-off and anti-exploit guardrails, analyzes low-score areas (< 0.99), plans surgical improvements, and iterates until all dimensions reach >= 0.99."
---

# Graded Review & Guardrail Multi-Iteration Loop (`gr-iteration-loop`)

Use this skill whenever building, auditing, or refining complex features, game systems, or UI surfaces where loose requirements, regressions, or visual anomalies ("things looking off") must be systematically eliminated through closed-loop scoring and multi-iteration convergence.

---

## 1. The Core Iteration Equation

```text
┌─────────────────┐       ┌────────────────────────┐       ┌─────────────────────────┐
│                 │       │    GR Evaluator        │       │ Check Score Target      │
│ 1. Implement    │ ────> │ Compute Score Vector   │ ────> │ All Dimensions >= 0.99? │
│    or Refine    │       │ Score [s1, s2, ..., sN]│       │ (Max 1.0)               │
└─────────────────┘       └────────────────────────┘       └────────────┬────────────┘
        ▲                                                               │
        │               No (Any s_k < 0.99)                             │ Yes
        │                                                               ▼
┌───────┴───────────────┐       ┌────────────────────────┐      ┌─────────────────────────┐
│ 4. Auto-Remediate &   │ <──── │ 3. Deep Research &     │      │ 5. Verified & Shippable │
│    Surgical Execution │       │    Targeted Plan       │      │    (Pass Quality Gate)  │
└───────────────────────┘       └────────────────────────┘      └─────────────────────────┘
```

The loop repeats until **every dimension** achieves **$\ge 0.99$** out of `1.00`. Zero hand-waving or premature "done" claims.

---

## 2. The 4 Standard Evaluation Dimensions & Guardrails

For each evaluation pass, score the system across these 4 standard dimensions:

### D1: Domain Logic & Functional Invariants (`s_domain`)
- **Focus**: Game rules, math formulas, state transitions, event emissions, catalog referential integrity.
- **Guardrail**: No missing branches. Healer/support classes must have equal progression agency; calculations must floor gracefully with no negative ratios or overflow.

### D2: Authority & Anti-Exploit Security (`s_authority`)
- **Focus**: Server authoritativeness, input validation, death/wipe penalties, transaction atomicity.
- **Guardrail**: **Zero client trust**. Prevent infinite boss corpse-running, uninterruptible casting during damage, inventory duplication, or Agones pod resource leakage.

### D3: Visual & Aesthetic Coherence — "Anti-Look-Off" Guardrail (`s_visual`)
- **Focus**: UI layout, typography, proportions, chibi character scale, color contrast, responsive overlays.
- **Guardrail**: **Prevent things looking off**:
  - No clipped text or unpadded borders.
  - No overlapping floating modals or misaligned canvas HUDs.
  - Dark-theme visual harmony matching the `@joymify/tokens` canonical palette.
  - Chibi scale law: 1.05m player scale, foliage/props accurately proportioned.

### D4: Test & Pipeline Verification Fidelity (`s_test`)
- **Focus**: Unit tests, integration tests, E2E simulated scale runs, database migrations, CI scripts.
- **Guardrail**: Mock runner $\ne$ Target runtime. Actual `cargo test`, `npm test`, and HTTP endpoint curl responses must execute with clean zero-exit codes and verified assertions.

---

## 3. Step-by-Step Execution Protocol

### Step 1: Baseline Assessment & GR Feedback Generation
Run an adversarial inspection or test suite. Report the raw evaluation vector:
```markdown
### Graded Review (GR) — Iteration [N]
- Dimension 1 (Domain Logic):           Score: 0.XX — [Status & Defect Summary]
- Dimension 2 (Authority & Exploits):   Score: 0.XX — [Status & Defect Summary]
- Dimension 3 (Visual Coherence):       Score: 0.XX — [Status & Defect Summary]
- Dimension 4 (Verification Fidelity):  Score: 0.XX — [Status & Defect Summary]
- **Current Vector**: `Score [s1, s2, s3, s4]` (Target: all >= 0.99)
```

### Step 2: Low-Score Area Root-Cause Analysis (< 0.99)
For each dimension scoring `< 0.99`:
1. Identify the exact file, line number, or visual component causing the low score.
2. Isolate the failure mechanism (e.g. omitted formula term, missing state transition, unhandled exception).
3. Specify the expected target behavior according to canonical lore and architecture.

### Step 3: Targeted Improvement Plan
Draft a surgical, numbered task list addressing only the defects identified in Step 2:
- Task 1: [Specific domain or authority fix]
- Task 2: [Specific visual or UI alignment fix]
- Task 3: [Automated regression test asserting the fix]

### Step 4: Implement & Verify
Execute the plan without scope drift. Run live compiler, test runners, and visual builds.

### Step 5: Convergence Check & Re-Score
Re-evaluate all 4 dimensions. If any $s_k < 0.99$, immediately chain into the next iteration with targeted root-cause analysis. Once all $s_i \ge 0.99$, proceed to commit and document.
