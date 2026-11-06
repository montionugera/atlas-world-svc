# F-174 design brief: "Game Systems" chapter in the World Bible (lore panel)

Task 0 of the F-174 plan. Written by the controller with `impeccable shape`, 2026-11-06. Task 10 builds against this brief, and its `critique.md` is checked against it.

**Discovery note.** The owner-approved plan (Task 0 and Task 10) already answers the shape interview: audience, placement, blocks, tokens, phone, error state and accessibility. Under the standing "decide, don't ask" rule, there was no interview round. The repo has no PRODUCT.md. This surface extends an existing panel whose system lives in `atelier/atlas-world-panels/css/panels.css`, so that file is the design source of truth. No image probes: this is an addition to an existing panel, not a new visual lane.

## Audience and scene

A player, or the owner reading as a player, who wants to know how a fighter looks and behaves in each combat state. They come from the World Bible, often by a deep link the owner sends, and read on an iPad or phone in the evening as well as on a desktop. The panel is already dark (`--bg #0b0d12`), so this chapter stays dark. The reader is curious, not rushed: one page, read top to bottom, with the picture doing most of the work.

## Placement

- The new **last** chapter in `CHAPTERS`: `{ id: "systems", label: "Game Systems", icon: "🛡️", anchor: "lore-chapter-systems" }`. It sits after Open Mysteries, because the story chapters come first and mechanics come last.
- Deep link: `?tab=lore&chapter=systems&ref=system-combat-stances`. The card carries `id="lore-ref-system-combat-stances"`, so `navigateToRef` scrolls to it and highlights it like every other ref.
- Add a stat chip `systemCount` "Game Systems" next to the existing chips.

## Structure (top to bottom)

1. **Chapter header**, built like the other seven chapters (the plan's sample code skipped this; use the full header):
   - `div.lore-chapter-header` > `span.lore-chapter-eyebrow` "How the World Works" > `h2.lore-chapter-title` "🛡️ Game Systems" > `p.lore-chapter-desc` with one sentence, for example "How fighters move, guard, strike and fall, and what you will see in the client."
   - The eyebrow is the panel's existing per-chapter pattern, so we keep it for consistency. It is not a new decoration.
2. **One `article.lore-card` per system.** F-174 ships one card, "Combat stances and weapon swap":
   - `h3.lore-card-title`: the title.
   - `p.lore-card-body`: a one-line summary in plain player words.
   - **The strip figure** comes right after the summary. The picture is the point, so it goes above the prose.
   - **3-4 short sections**, each `h4.lore-card-subtitle` plus one `p` of 2-4 sentences: *Moving* (idle, walk, run), *Fighting stance* (guard comes up when you have a target and drops when combat ends), *Attack, block, hit* (one-shots, then back to the stance; a hit flinch shows only for blows you deal), *Swapping weapons* (the same body takes a different weapon at runtime; the spear-to-axe swap shown in the last frame).
   - **Known limits.** Use `h4.lore-card-subtitle` "Known limits" plus a plain `ul`, inside the same card.
     - **Do not** nest `aside.lore-card lore-card--highlight` inside the card as the plan's sample does. A card inside a card is a banned pattern, and the subtitle already sets the block apart.
     - Limits to state: the server does not yet send attack or block (I-255), so those play only in the preview and render; the guard pose holds the shield high and hides most of the body; only the watch sergeant uses this rig today.
   - Show `featureId` as an existing `lore-badge` ("F-174") in the card header, not in the prose.

## The strip figure (the only new CSS: `.lore-strip`, `.lore-strip-caps`)

- The source is 2880×480: nine 320×480 cells on a #292b33 stage. Show it at **half scale**, 240 px tall and 160 px per cell, so the whole strip is 1440 px wide.
- `figure.lore-strip`: `overflow-x: auto`, `border: 1px solid var(--border)`, `border-radius: 8px`, margin on the panel's rhythm (0.75rem). Inside, the `img` (`display:block; height:240px; width:auto; max-width:none`) and `figcaption.lore-strip-caps` sit in **one scrolling box**, so the captions stay aligned with their cells.
- Caption row: `grid-template-columns: repeat(9, 160px)`, 12 px, `color: var(--text-dim)`, centred. That is #9aa1b2 on `--bg-card` #171b26, about 6.8:1, which passes AA. **Not** `--text-faint`, which is too low for 12 px text.
- Caption words, real text in this order: Idle · Walk · Run · Guard · Attack · Block · Hit · Fallen · Attack (axe). Write "Guard", not "combat_idle". The data file keeps the player words, and the code uses no internal state names.
- **Phone (390 px).** The frame fits the card width. About two and a half cells show, and the cut-off third cell is the cue that the strip scrolls. The page itself must never scroll sideways: the frame's `overflow-x: auto` contains it, and nothing else in the card may exceed 100% width.
- **Desktop (1280 px).** The card is wider than 1440 px only on very wide screens. Otherwise the same frame scrolls. Do not stretch the image above half scale, since upscaling soft renders looks worse.
- No new colours, shadows, gradients or side-stripe borders. Tokens only: `--border`, `--text-dim`, `--accent` (the focus ring).

## Empty, error and missing-picture states

- **Archive fetch fails**, meaning `game-systems.json` is missing or bad: the chapter still renders its header plus `p.lore-chapter-desc` "Game systems archive unavailable — the rest of the World Bible is unaffected." The other chapters load as before. This file's fetch is separate from the world-history fetch and never sends the panel to the panel-wide error banner.
- **No systems in the file:** "No game systems are documented yet."
- **Picture absent.** This is the normal case on the release app, because the strip is a private, pull-only render that is never in the image. On the image's `error` event, replace the whole figure (picture and captions) with `p.lore-chapter-desc` holding the fallback text and the edit-host deep link. Never leave a broken-image icon or an orphaned caption row.

## Accessibility

- `img.alt` is the full sentence from the data file (nine poses named, axe in the last one).
- Captions are real text in the DOM, not baked into the picture.
- **The scroll frame is reachable by keyboard:** `tabindex="0"`, `role="region"` and `aria-label="Combat stance frames, scrolls sideways"` on `figure.lore-strip`. A scrollable area that can't take focus can't be scrolled with the keyboard (axe `scrollable-region-focusable`). Keyboard focus shows `outline: 2px solid var(--accent)`.
- Heading order follows h2 chapter > h3 card > h4 sections, with no skipped levels.
- No motion is added, so there is nothing to handle for reduced motion.

## Copy rules

Plain player words, short sentences. No F-numbers, file paths, clip names or engine terms in body text, except the badge and the fallback link. Present tense, and say what the reader will see ("The shield comes up…").

## Anti-goals

- Not a dev-tools page. No tables of clip names or blend times.
- No new design language. It must look like it was always the eighth chapter.
- No nested cards, side-stripe callouts or decorative chrome around the strip.

## Done looks like (critique checklist for Task 10)

1. The header matches the other chapters.
2. The strip sits directly under the summary.
3. The nine captions line up under their cells at every scroll position.
4. At 390×844 there is no horizontal page scroll and the strip scrolls inside its frame.
5. At 1280×800 the chapter is readable without zooming.
6. On the release app, the fallback line shows and there is no broken picture.
7. The keyboard can reach the frame and scroll it.
8. Known limits appear as a subtitle plus a list, not a nested card.
