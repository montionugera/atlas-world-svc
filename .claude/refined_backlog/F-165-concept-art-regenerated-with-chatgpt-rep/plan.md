
# F-165 plan

Goal: all 24 images in `content/concept-art/` come from ChatGPT and match the owner's target, shipped whole through `release/1.18`.

1. Finish generation in `~/asset-studio-private/atlas-3d-plan/art-tools-v9/gpt/`. Verify: 24 files; the implementer opens every one against its prompt; retry serious misses and anything with visible text.
2. Compare the batch boss sheet with the owner's six-legged design. Verify: the sheet shows the insect abdomen, six legs and a small human for scale.
3. Upscale with 4x-UltraSharp on mont-pc port 8188, fit longest side to 2800 px, webp q90, 960 px thumbs q84. Verify: gate limits in `concept-arts-model.mjs` hold for all 24, and every file's name still matches its picture.
4. Replace images, thumbs and prompt strings in `index.json` and `art-briefs.json`; add ChatGPT to the tool enum if the gate requires it. Verify: `art_prompt_lint.py` reports 0 problems; the two JSON files agree.
5. Tests. Verify: `cd scripts && npm test` and `node --test atelier/atlas-world-panels/tests/*.test.mjs` pass.
6. Independent review, then `psrw ship`. Verify: Gate 1 green, merged into `release/1.18`.
7. After promote, check `http://localhost:8788/?tab=concept-arts` in Chrome and republish the hosted gallery.
