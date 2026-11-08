---
title: "Six-race lineup concept art (12 characters, canon names)"
id: I-262
status: idea (approved by owner 2026-11-07: "go", "1 step a time")
---

# Six-race lineup concept art

Step 1 of the owner's fast track (Art Direction Setup chat): one final picture of all six races, one man and one woman each, side by side at real relative height, before the 3D prototype and the Maro Bell grey box.

## Inputs (owner's preferred prototypes in the Art Direction Setup chat, not locked canon)
- Maro Folk: Human v2 (not v3, "too much"); attractive and adventurous, not sexy fantasy; blue-cream-gold adventurer outfit.
- Ondo Forge: male with the short beard (version B), young-looking, red hair, work goggles, short and sturdy.
- Tava Kin: dog-kin with the ear design the owner already locked.
- Linde Folk, Daro Guard, Silme Seers: latest designs in that chat.
- Canon names from `content/studio/canon/glossary.json`; the chat said "Endo Dwarf", the canon race is Ondo Forge.

## Decisions
- Generated in the owner's Art Direction Setup chat (owner OK'd posting), every message starts `from @claudia`.
- **No text in the image.** Canon names live in the gallery caption; image models garble lettering and the previous lineup's labels did not match canon.
- Prompt is camera-literal (art-prompt-rules.md, lint first): no lore names, no analogy; heights as percent of frame.
- Working heights (Claudia, no height data in the repo; owner may amend), share of frame height ground to crown: Daro Guard M 85 / F 78; Maro Folk, Linde Folk, Silme Seers M 68 / F 63; Tava Kin M 62 / F 58 (ears not counted); Ondo Forge M 46 / F 43.
- Order left to right: Maro Folk, Ondo Forge, Linde Folk, Daro Guard, Tava Kin, Silme Seers; man then woman.

## Acceptance criteria
- [ ] One landscape image, 12 full-body figures, plain light background, a shared ground line, no text.
- [ ] Each figure matches the owner's preferred prototype for its race (checked by eye against the chat).
- [ ] Upscaled per the concept-art recipe; within the gallery gate (<= 2800 px, <= 800 KB, thumb <= 960 px).
- [ ] New `content/concept-art/index.json` item `character-race-lineup-six-races` (category character, tool chatgpt, verdict unreviewed) with a caption naming all six canon races in order; concept-arts tests pass.
- [ ] Visible on the edit host gallery; owner gets a direct link.

## Generation record (2026-11-07)

- Sent in the Art Direction Setup chat; ChatGPT worked 3m 46s; 1672x941 PNG, 12 figures in canon order, no text.
- Measured heights fall short of the brief (tallest about 70 percent of the frame, not 85); the order and ratios between races hold. Accepted as is: the lineup's job is relative height.
- Prompt saved in the gallery item; lint passed.

## Out of scope
Locking any design as canon; renaming the six older single-race images (old race names); the 3D prototype; the Maro Bell grey box (step 2).
