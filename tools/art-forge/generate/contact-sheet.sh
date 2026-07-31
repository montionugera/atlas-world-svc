#!/usr/bin/env bash
# QC one race row as a single contact sheet. Reroll only the failing cells.
#
# NOT RUNNABLE IN CI — operates on out/, which is git-ignored and only exists
# after a human has run the generators against the GPU box.
#
# Usage: ./generate/contact-sheet.sh <race>
set -euo pipefail
race="${1:?usage: contact-sheet.sh <race>}"

# Resolve out/ relative to tools/art-forge/ so this works from any cwd.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Only the i2i row (out/<race>-<job>.png). charsheet.mjs writes a `-t2i`
# suffix; those txt2img baselines must not pollute the recipe's QC sheet.
shopt -s nullglob
cells=()
for f in "out/${race}-"*.png; do
  case "$f" in
  *-t2i.png) continue ;;
  esac
  cells+=("$f")
done

if [ ${#cells[@]} -eq 0 ]; then
  echo "no cells found matching out/${race}-*.png — generate the row first" >&2
  exit 1
fi

magick montage "${cells[@]}" -tile 8x8 -geometry +4+4 "out/_sheet-${race}.png"
echo "wrote out/_sheet-${race}.png (${#cells[@]} cells)"
