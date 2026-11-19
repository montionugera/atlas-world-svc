# Handoff: F-223 Material-Aware Footstep SFX

- **Goal:** Deliver material-aware footstep SFX across `Stone`, `Dirt`, `Grass`, `Water`, and `Glass` surfaces with a hybrid ground/pad surface resolver, 4 walkable test pads in `PlaytestSandboxRoot`, single-strike ElevenLabs `.ogg` variants per material, and automated verification in `AudioVerify` and `PlaytestSandboxVerify`.
- **Spec:** `docs/superpowers/specs/2026-11-15-i307-material-aware-footstep-sfx-design.md`
- **Plan:** `.claude/refined_backlog/F-223-material-aware-footstep-sfx-by-ground-su/plan.md`
- **Current State:** `I-307` promoted to `F-223`; `spec.md` and `plan.md` written on `_release` (`release/1.34`).
- **Next Step:** Run `self-grill-audit` on `plan.md`, commit `spec.md` + `plan.md` on `_release`, claim `F-223` (`psrw claim F-223`), and execute the plan in the `F-223` worktree.
