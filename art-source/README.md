# art-source/

Raw, un-baked asset originals as delivered/downloaded (AI, marketplace, commissioned).
**Binaries here are Git LFS-tracked** (see repo-root `.gitattributes`). The game repo commits
only *baked* `res://` assets under `game-client/assets/`.

**Prerequisite:** `brew install git-lfs && git lfs install` (once per machine) before adding binaries.

## Layout
```
art-source/
  seed/        # CC0 seed originals (Quaternius, Kenney) — Stage 0.5
  characters/  # commissioned/AI character sources
  props/  vfx/  audio/
  LICENSES.md  # provenance + license ledger (REQUIRED for every asset)
```

## Rule
Every binary added here **must** get a row in `LICENSES.md` at intake time, and be conformed into
`game-client/assets/` per `docs/asset-intake.md`. No asset enters the game tree without a license row.
