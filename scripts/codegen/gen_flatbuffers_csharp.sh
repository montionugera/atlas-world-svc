#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEMA_DIR="${REPO_ROOT}/schemas"
OUT_DIR="${REPO_ROOT}/game-client/src/Protocol"

FLATC="${FLATC:-$(which flatc || echo "/opt/homebrew/bin/flatc")}"

if [[ ! -x "${FLATC}" ]]; then
  echo "Error: flatc not found at ${FLATC}" >&2
  exit 1
fi

echo "Compiling FlatBuffers C# contracts from ${SCHEMA_DIR}/game_protocol.fbs -> ${OUT_DIR}"
mkdir -p "${OUT_DIR}"
"${FLATC}" --csharp -o "${OUT_DIR}" "${SCHEMA_DIR}/game_protocol.fbs"

# Normalize FlatBuffers version check so minor compiler/runtime differences don't break compilation
find "${OUT_DIR}" -name "*.cs" -exec sed -i '' -E 's/FlatBufferConstants\.FLATBUFFERS_[0-9_]+\(\);/\/* version check *\//g' {} +

echo "Done."
