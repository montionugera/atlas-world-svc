#!/usr/bin/env node
// check-system-deps.mjs — verifies (and, with --install, installs) the
// system-level binaries declared in scripts/system-deps.json.
//
// WHY THIS EXISTS: CI failed on `spawnSync magick` -> ENOENT because
// ImageMagick was never declared as a dependency anywhere, so nobody could
// discover the gap short of watching a job go red. scripts/system-deps.json
// is now the single declared source of truth; this script is what actually
// READS it, so the manifest cannot rot into decoration. Two modes:
//
//   node scripts/check-system-deps.mjs             check-only (Gate 1, local dev)
//   node scripts/check-system-deps.mjs --install    install missing REQUIRED
//                                                    binaries (Linux/macOS),
//                                                    then check
//
// Exit code: 0 only if every REQUIRED binary is present at the end of the
// run; 1 otherwise. Binaries marked required:false never fail the run — they
// print an informational note instead (see system-deps.json's requiredNote).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(REPO_ROOT, "scripts", "system-deps.json");

const args = process.argv.slice(2);
const DO_INSTALL = args.includes("--install");
for (const a of args) {
  if (a !== "--install") {
    console.error(`check-system-deps: unknown flag "${a}"`);
    process.exit(2);
  }
}

function loadManifest() {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.binaries) || parsed.binaries.length === 0) {
    throw new Error(`${MANIFEST_PATH} has no "binaries" array`);
  }
  return parsed.binaries;
}

function isPresent(name) {
  const result = spawnSync("command", ["-v", name], {
    shell: true,
    stdio: "pipe",
  });
  return result.status === 0;
}

function platformKey() {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "debian";
  return null;
}

function installCommandFor(bin) {
  const key = platformKey();
  if (!key || !bin[key]) return null;
  return bin[key].install;
}

/** Best-effort install for one REQUIRED, currently-missing binary. Never
 * throws — installation failures are surfaced by the presence check that
 * follows, same as any other missing binary. */
function attemptInstall(bin) {
  const key = platformKey();
  const cmd = installCommandFor(bin);
  if (!cmd) {
    console.log(
      `  (no ${key ?? process.platform} install command declared for "${bin.name}" — skipping install, will still verify)`,
    );
    return;
  }
  console.log(`  installing: ${cmd}`);
  const result = spawnSync(cmd, { shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    console.log(`  install command exited ${result.status} — will re-check anyway`);
  }
  if (!isPresent(bin.name) && key === "debian" && bin.debian?.fallbackShim) {
    const shimSrc = join(REPO_ROOT, bin.debian.fallbackShim);
    if (!existsSync(shimSrc)) {
      console.log(`  fallbackShim declared (${bin.debian.fallbackShim}) but the file is missing — cannot apply it`);
      return;
    }
    const shimDest = `/usr/local/bin/${bin.name}`;
    console.log(
      `  "${bin.name}" still absent after the apt install (expected — see system-deps.json's note); installing declared shim ${bin.debian.fallbackShim} -> ${shimDest}`,
    );
    // /usr/local/bin is root-owned on a stock runner — `sudo install` (not a
    // plain fs copy) is what actually lands this without an EACCES.
    const shimResult = spawnSync(`sudo install -m 0755 "${shimSrc}" "${shimDest}"`, {
      shell: true,
      stdio: "inherit",
    });
    if (shimResult.status !== 0) {
      console.log(`  could not install fallback shim (sudo install exited ${shimResult.status}) — will still verify`);
    }
  }
}

function main() {
  const binaries = loadManifest();
  let anyRequiredMissing = false;

  for (const bin of binaries) {
    if (DO_INSTALL && bin.required && !isPresent(bin.name)) {
      console.log(`\n▶ ${bin.name}: not present, required, --install given`);
      attemptInstall(bin);
    }

    const present = isPresent(bin.name);
    if (present) {
      console.log(`✅ ${bin.name} — present (${bin.package})`);
      continue;
    }

    if (!bin.required) {
      console.log(`ℹ️  ${bin.name} — absent, OPTIONAL (${bin.package})`);
      if (bin.requiredNote) console.log(`   ${bin.requiredNote}`);
      continue;
    }

    anyRequiredMissing = true;
    const key = platformKey();
    const installCmd = key ? installCommandFor(bin) : null;
    console.log(`❌ ${bin.name} — MISSING, required by:`);
    for (const u of bin.usedBy ?? []) console.log(`     ${u}`);
    if (installCmd) {
      console.log(`   install (${key}): ${installCmd}`);
    } else {
      console.log(`   no install command declared for this platform (${process.platform}) in ${MANIFEST_PATH}`);
    }
    if (bin.debian?.note && key === "debian") console.log(`   note: ${bin.debian.note}`);
    if (bin.warning) console.log(`   warning: ${bin.warning}`);
  }

  console.log("");
  if (anyRequiredMissing) {
    console.log("RESULT: one or more required system binaries are missing — see install commands above.");
    process.exit(1);
  }
  console.log("RESULT: all required system binaries are present.");
  process.exit(0);
}

main();
