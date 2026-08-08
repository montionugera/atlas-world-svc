---
title: "Story and novel reading in the asset storybook"
id: I-082
status: spec-approved
---

# Story and novel reading in the asset storybook

## Problem

The narrative work has three finished reading surfaces, and none of them is
reachable from the page the team actually opens.

| Surface | Where it lives | Reachable from the storybook |
|---|---|---|
| Reader mode (typography-first light novel) | `tools/story-explorer/reader.html` | **no** |
| Narrative graph (9 kind columns, SVG edges) | `tools/story-explorer/index.html` | **no** |
| Undertow novelization (illustrated edition) | `docs/story/undertow/novel-illustrated-edition.html` | **no** |

`tools/asset-storybook` is where the team already looks — that reasoning is
already written into the codebase. `js/state.mjs:52-55` justifies embedding the
combat balance lab exactly that way:

> synthetic class for the embedded combat balance lab (tools/combat-lab). Not an
> asset — it has no manifest entry, no health, no renderer. It is here because
> the storybook is where the team already looks.

The same argument applies to story, and the same mechanism is already proven in
`js/combat-lab.mjs`. Today, reading the story instead means knowing that a
second static server has to be started against the repo root
(`tools/story-explorer/README.md`: `python3 -m http.server 7788`) and that a
third file has to be opened straight off disk.

Two of those surfaces are also invisible to the deployed storybook entirely: the
k8s image ships only `game-client/assets`, `asset-keys.json`, `tools/combat-lab`
and `tools/asset-storybook` (`tools/asset-storybook/Dockerfile`), so no amount of
in-page linking would reach the story content from the cluster.

## Why now

The three surfaces already exist, are already tested (`node --test
tools/story-explorer/tests/*.test.mjs`, `ci.yml:111`), and are already gated
(`node scripts/gen_story_graph.mjs --check`, `ci.yml:103`). Nothing needs to be
built — only wired. The added payload is ~560 KB against an image whose asset
layer is ~261 MB.

Waiting costs more than doing it: the Undertow novel is one epic out of a planned
multi-epic saga, and `docs/story/undertow/` already holds two further unlinked
documents (`core-story.md`, `glossary-th.md`). Every additional surface added
before this lands is another orphan.

## Goals

1. Story is reachable from the asset storybook as a **single** sidebar entry with
   three views: Reader, Graph, Novel.
2. Adding a fourth view later is a **data edit**, not a code edit.
3. Story survives a manifest fetch failure, exactly as the combat lab does.
4. The deployed (k8s/nginx) storybook serves the story content, not an empty
   section.

## Non-goals

- No changes to `reader.html`, `story-explorer/index.html`, `graph.mjs`, or the
  novel HTML. They stay standalone and independently servable.
- No unified cross-story search or in-storybook re-rendering of the narrative.
  Forking `reader.html`'s logic would split it from `graph.mjs`, which
  `scripts/check_content.mjs` depends on. This repo already maintains one
  byte-for-byte mirror (`resolveRender`, guarded by
  `scripts/tests/resolve_render_mirror.test.mjs`); a second is not worth it.
- `core-story.md` and `glossary-th.md` stay unlinked. They are markdown, not
  pages. Adding them later is a registry row plus a markdown renderer — which is
  the point of the registry.

## Design

### Registry

New file `tools/asset-storybook/story-views.json`:

```json
[
  { "id": "reader", "label": "Reader",   "src": "../story-explorer/reader.html" },
  { "id": "graph",  "label": "Graph",    "src": "../story-explorer/index.html" },
  { "id": "novel",  "label": "Undertow", "src": "../../docs/story/undertow/novel-illustrated-edition.html" }
]
```

`src` is relative to `tools/asset-storybook/index.html`, matching how every other
path in `js/state.mjs` is expressed.

This mirrors `art-groups.json`, including its degradation contract: `main.mjs`
fetches the registry inside a `try`, and on failure logs a warning and falls back
to a hardcoded list "so the page degrades instead of breaking"
(`js/main.mjs:95-106`).

### Modules

**New — `tools/asset-storybook/js/story.mjs`.** Exports `mountStoryNav(sidebarNav)`
and `mountStory(main)`. Mount shape copied from `js/combat-lab.mjs`; the tab layer
copied from `js/art-tabs.mjs`. Renders one tab per registry view plus a single
`loading="lazy"` iframe whose `src` swaps on tab click.

**Edited — `js/state.mjs`.** Add three constants only: `STORY_CLASS = "story"`,
`STORY_VIEWS_URL`, `STORY_VIEWS_FALLBACK`.

The active-tab state stays a **closure local inside `mountStory`** — deliberately
unlike `artTabState`. That export exists because three modules reassign it
(`state.mjs:43-49`), and an ES module cannot reassign another module's `let`
export. Story has no such sharing: the section shows and hides wholesale through
`setActiveClass`'s `data-kind` match (`sidebar.mjs:60-66`), so no other module
ever reads or writes which tab is active. Adding a shared export here would
invent coupling that does not exist.

**Edited — `js/main.mjs`.** Import and call `mountStoryNav` / `mountStory` in
**both** code paths: the manifest-failure path (`main.mjs:66-67`) and the happy
path (`main.mjs:166`, `:252`).

**Edited — `js/sidebar.mjs`.** One line in `classLabel()`:
`if (cls === STORY_CLASS) return "Story"`. Without it the function's default
branch (`sidebar.mjs:52`) pluralises the class name and renders "Storys".

### Data flow and lazy loading

Only the active view's `src` is ever set, so the nine JSON fetches behind
`reader.html` and the 103 KB novel stay off the wire until that tab is selected.
Tab state is pure UI: it toggles `src` and active-tab styling only — it never
re-fetches the registry and never touches `health`, matching the constraint
`state.mjs:38-42` places on the art tabs.

Health follows the combat-lab treatment exactly (`js/combat-lab.mjs:43-51`):
`initHealth(STORY_CLASS, 1)`, then `bumpHealth(STORY_CLASS, { ok: 1 })`, then
`renderSidebarBadge(STORY_CLASS)`. Story is not an asset — no manifest entry, no
per-view health check.

### Packaging

`tools/asset-storybook/Dockerfile` gains three `COPY` lines and
`Dockerfile.dockerignore` gains three matching `!` allowlist lines:

| Path | Size |
|---|---|
| `content/story` | 180 KB |
| `tools/story-explorer` | 40 KB |
| `docs/story/undertow` | 340 KB |

The `COPY` lines go **after** `COPY game-client/assets`, per the layer-ordering
comment in the Dockerfile, so a story edit reuses the ~261 MB cached asset layer.

The dockerignore is a `*`-then-allowlist whose header says to keep it in sync with
the COPY lines. Both halves are required: local dev serves from the repo root and
would work with neither, while the container would silently serve an empty
section.

No nginx config change is needed. The doc root is already the repo root with the
original layout preserved, so `reader.html`'s `../../content/story/*.json` fetches
resolve unchanged, and `.mjs` is already mapped in `mime.types` by the existing
`sed` step.

## Failure handling

| Failure | Result |
|---|---|
| `story-views.json` missing or unreadable | Warning logged; `STORY_VIEWS_FALLBACK` used; section renders |
| One view's page broken or 404 | That iframe fails alone; the storybook page is intact |
| Any asset manifest 404 | Story still mounts — the both-paths rule |
| Novel HTML partially loaded | Not possible; it is self-contained (0 `<img>`, no external CSS/JS) |

## Testing

One new test, `scripts/tests/story_views_packaging.test.mjs`. For every entry in
`story-views.json` it resolves `src` relative to `tools/asset-storybook/` and
asserts that the resulting repo-relative path:

1. exists on disk, and
2. is covered by both a `COPY` line in `tools/asset-storybook/Dockerfile` and a
   `!` allowlist line in `tools/asset-storybook/Dockerfile.dockerignore`.

This closes the precise failure mode the dockerignore header warns about — local
dev works, the container serves an empty section — and it makes the registry
self-enforcing: adding a view without packaging it fails CI.

The test needs no workflow change. `scripts/tests/` is already run in CI by
`npm test --prefix scripts` (`ci.yml:78`), alongside the existing
`resolve_render_mirror.test.mjs`. `tools/story-explorer/tests/*.test.mjs`
(`ci.yml:111`) is untouched.

## Acceptance criteria

1. Serving the repo root and opening `/tools/asset-storybook/index.html` shows a
   single **Story** sidebar entry; clicking it reveals three tabs, and each tab
   renders its page.
2. Only the active view issues network requests; switching tabs does not re-fetch
   the registry.
3. Temporarily renaming `story-views.json` degrades to the three fallback views
   with a console warning, and the page still renders.
4. Breaking the asset manifests still leaves the Story section mounted.
5. `node --test scripts/tests/story_views_packaging.test.mjs` passes, and fails if
   a registry entry is added without its `COPY` + `!` lines.
6. `./scripts/deploy-local.sh` produces an image whose Story tabs render real
   content — verified in the browser at the port-forwarded storybook, not by HTTP
   status alone.

## Rollback

Every change is additive: one new registry file, one new module, one new test,
three COPY lines, three allowlist lines, and small edits to three existing
modules (`state.mjs`, `main.mjs`, `sidebar.mjs`).
Reverting the commit restores the previous storybook exactly. No content, no
schema, and no other tool is modified.
