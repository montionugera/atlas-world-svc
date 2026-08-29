#!/usr/bin/env bash
# magick-shim.sh — a stand-in for the ImageMagick v7 `magick` unified CLI on
# CI runners whose `imagemagick` apt package is still ImageMagick 6.
#
# Verified against ubuntu:24.04 (2026-08-27): `apt-cache policy imagemagick`
# offers only `imagemagick-6.q16*` builds. IM6 ships the classic per-tool
# binaries (convert, identify, mogrify, composite, compare, montage, stream,
# display, animate, import, conjure) but NOT the single `magick` entrypoint
# IM7 introduced. This script reproduces IM7's own dispatch rule exactly:
# if the first argument names a legacy tool, exec that tool with the rest of
# the arguments; otherwise treat the whole invocation as an implicit
# `convert` call. It is installed as /usr/local/bin/magick by
# scripts/check-system-deps.mjs --install, driven by the "fallbackShim"
# field on the `magick` entry in scripts/system-deps.json.
#
# This is a compatibility shim over IM6, not IM7 — it does not add features
# IM6 lacks. In particular it must NEVER be used to rasterize SVG: this repo
# already established (F-040, 2026-08-09) that `magick` silently drops every
# stroke when the librsvg delegate is absent, on real IM7 as much as on this
# shim. SVG rasterization goes through `rsvg-convert`, always — see
# tools/mapforge/lib/raster.mjs.
set -euo pipefail

case "${1:-}" in
  convert | identify | mogrify | composite | compare | montage | stream | display | animate | import | conjure)
    cmd="$1"
    shift
    exec "$cmd" "$@"
    ;;
  *)
    exec convert "$@"
    ;;
esac
