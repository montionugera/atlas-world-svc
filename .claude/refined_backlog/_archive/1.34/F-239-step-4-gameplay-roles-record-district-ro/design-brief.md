# F-239 design brief: gameplay roles on the record map

**Reader.** The game's owner, on a phone or iPad, who finds text pages hard to follow. They want to see the plan, not read about it.

**Question the screen must answer.** For one district: which place is a story dungeon, which is optional, which is just an open activity, and would its level change? For the continent: which district is where players gather to form parties?

**Decisions.**
- Say it on the map, in the box the owner already taps. A dungeon box replaces the word "Dungeon" with its verdict ("Story dungeon / Ch 2", "Optional instance", "Open activity"), then the level line: "Lv 14-15 -> 28-32 proposed" only when the proposal differs from the current band.
- The district page gets one plain block under the map, "Gameplay (proposed)", four labelled lines (New players / Veterans return for / Party content / Why races meet here). The word "proposed" is in the heading because nothing here is applied.
- The continent map gets one extra line under a district name ("Find a party", "Learn party play", "Crossroads", "Coordinated combat"). Same box, no new colours, no new icons.
- A one-line legend note explains the three verdicts and the arrow. Shown only when the map has a dungeon with a verdict.

**Constraints.** 390 px wide with no sideways page scroll; district boxes stay narrow (100 px in the drawing), so verdict text is wrapped at 14 characters and the box grows taller when needed. Colours stay on the existing tokens. Text is escaped as before.

**Not doing.** No per-verdict colours or icons (the existing purple dungeon colour is enough; verdict is text), no tooltip-only information, no editing UI.
