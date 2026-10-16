#!/usr/bin/env bash
# Builds the native macOS arm64 release bundle `build/AtlasObservatory.app`
# using Apple's built-in `swiftc` compiler + SQLite3 + SwiftUI + shared `joy-design` Swift package.
#
# Usage:
#   ./scripts/build_mac_observatory.sh            # Build + run self-test
#   ./scripts/build_mac_observatory.sh --open     # Build + launch native macOS window

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="AtlasObservatory"
APP_BUNDLE="${REPO_ROOT}/build/${APP_NAME}.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
SRC_FILE="${REPO_ROOT}/tools/mac-observatory/AtlasObservatoryApp.swift"

# Prefer the canonical shared `joy-design/packages/swift/Sources/JoyDesign` sources
# when present alongside this repo (or its active _release worktree), falling back
# to the vendored `tools/mac-observatory/JoyDesign.swift` snapshot on standalone runners.
JOY_DESIGN_SOURCES=()
for candidate_dir in \
    "${JOY_DESIGN_SWIFT_DIR:-}" \
    "${REPO_ROOT}/../joy-design/packages/swift/Sources/JoyDesign" \
    "${REPO_ROOT}/../joy-design/.claude/worktrees/_release/packages/swift/Sources/JoyDesign"; do
    if [[ -n "${candidate_dir}" && -f "${candidate_dir}/JoyTokens.g.swift" && -f "${candidate_dir}/JoyComponents.swift" ]]; then
        JOY_DESIGN_SOURCES=("${candidate_dir}/JoyTokens.g.swift" "${candidate_dir}/JoyComponents.swift")
        echo "[build_mac_observatory] Using shared JoyDesign Swift package from ${candidate_dir}"
        break
    fi
done

if [[ ${#JOY_DESIGN_SOURCES[@]} -eq 0 ]]; then
    JOY_DESIGN_SOURCES=("${REPO_ROOT}/tools/mac-observatory/JoyDesign.swift")
    echo "[build_mac_observatory] Using vendored JoyDesign fallback (${JOY_DESIGN_SOURCES[0]})"
fi

echo "[build_mac_observatory] Ensuring build/catalog.sqlite is up to date..."
python3 "${REPO_ROOT}/scripts/build_catalog_db.py"

mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"

cat > "${CONTENTS_DIR}/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.joymify.atlas.observatory</string>
    <key>CFBundleName</key>
    <string>Atlas World Observatory</string>
    <key>CFBundleDisplayName</key>
    <string>Atlas World Observatory</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

echo "[build_mac_observatory] Compiling native arm64 release binary with swiftc -O (JoyDesign + AtlasObservatoryApp)..."
swiftc -O \
    -parse-as-library \
    -framework SwiftUI \
    -framework AppKit \
    -lsqlite3 \
    "${JOY_DESIGN_SOURCES[@]}" \
    "${SRC_FILE}" \
    -o "${MACOS_DIR}/${APP_NAME}"

# Ad-hoc sign so macOS Gatekeeper allows local launch without prompts
codesign --force --deep --sign - "${APP_BUNDLE}" >/dev/null 2>&1 || true

echo "[build_mac_observatory] Running headless self-test..."
ATLAS_REPO_ROOT="${REPO_ROOT}" "${MACOS_DIR}/${APP_NAME}" --self-test

BIN_SIZE="$(du -sh "${MACOS_DIR}/${APP_NAME}" | awk '{print $1}')"
echo "[build_mac_observatory] Built ${APP_BUNDLE} (binary size: ${BIN_SIZE})"

if [[ "${1:-}" == "--open" ]]; then
    echo "[build_mac_observatory] Launching ${APP_BUNDLE}..."
    ATLAS_REPO_ROOT="${REPO_ROOT}" open -a "${APP_BUNDLE}"
fi
