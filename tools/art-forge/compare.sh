#!/usr/bin/env bash
# Side-by-side QC: freshly generated cell vs. the committed reference art.
#
# NOT RUNNABLE IN CI — operates on out/, which is git-ignored and only exists
# after a human has run the generators against the GPU box.
#
# Usage: ./compare.sh <race> <job>
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: compare.sh <race> <job>" >&2
  exit 1
fi
race="$1"
job="$2"

# Resolve paths relative to this script's own directory (tools/art-forge/) so
# this works from any cwd.
cd "$(dirname "${BASH_SOURCE[0]}")"

generated="out/${race}-${job}.png"
if [ ! -f "$generated" ]; then
  echo "no generated cell at ${generated} — run generate/i2i.mjs --race ${race} --job ${job} first" >&2
  exit 1
fi

manifest="../../game-client/assets/art/art-manifest.json"
if [ ! -f "$manifest" ]; then
  echo "art manifest not found at ${manifest}" >&2
  exit 1
fi

key="art:class-${race}-${job}"
# The `file` path in the manifest is relative to game-client/assets/art/ — read
# it from the manifest itself rather than hardcoding the classes/ layout.
rel_file="$(jq -r --arg key "$key" '.entries[$key].file // empty' "$manifest")"
if [ -z "$rel_file" ]; then
  echo "no manifest entry for \"${key}\" in ${manifest}" >&2
  exit 1
fi

reference="../../game-client/assets/art/${rel_file}"
if [ ! -f "$reference" ]; then
  echo "manifest entry \"${key}\" points at ${reference}, which does not exist" >&2
  exit 1
fi

out="out/_compare-${race}-${job}.png"
magick montage "$generated" "$reference" -tile 2x1 -geometry +4+4 -label "%f" "$out"
echo "wrote ${out} (generated vs. committed reference: ${rel_file})"
