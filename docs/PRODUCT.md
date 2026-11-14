# PRODUCT — Atlas World explorer (edit host and release app)

Design context for the web explorer served by `scripts/catalog_explorer_web.py`
(`atlas-edit.joymify.local.com`, `atlas-world.joymify.local.com`). Written from the F-216 spec
("Users and jobs") and the code, not from an interview; correct it when it is wrong.

## Register

Product. The design serves the tool: an internal reference and review surface for the game's content.

## Users

One user, the owner (game director and sole developer). On a Mac at a desk most of the time, on an
iPad or a phone when reviewing remotely, often arriving from a deep link an agent sent.

## Purpose

Find any game record (continent, district, town or hunting area, map, monster, item, quest, canon
term, concept art), see what it relates to, and trust that it shows the current studio world.

## Personality

A working atlas: dense, calm, exact. Names and numbers first, decoration last.

## Anti-references

- A marketing landing page (hero, big numbers, card grids).
- A database admin console that shows table names and step numbers to the reader.
- A game HUD skin. The game has its own art direction; this tool does not wear it.

## Design principles

1. One way to find a thing: the search box in the top bar, from every tab.
2. Reuse the Joy design tokens and components already in `frontend/01_shell_and_styles.html`
   (`joy-badge`, `joy-button`, `--joy-*` tokens). No new colour literals.
3. The phone is a first-class reader: 390 px wide, 44 px touch targets, no sideways scrolling to
   reach a primary control.
4. Every state is designed: empty, loading, error and stale data say what happened in plain words.
5. Light and dark both come from the tokens; never set a colour that only works in one.

## Accessibility

WCAG 2.2 AA: 4.5:1 body text, visible focus ring (`--joy-focus-ring`), full keyboard path, and
`prefers-reduced-motion` respected.
