import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("maro-bell.json adheres to metres-v1 unit contract and 80x160 dimensions with South Gate spawn", () => {
  const mapPath = resolve(ROOT, "content/maps/maro-bell.json");
  assert.ok(existsSync(mapPath), "maro-bell.json must exist");
  const doc = JSON.parse(readFileSync(mapPath, "utf8"));
  assert.equal(doc.unitContract, "metres-v1");
  assert.equal(doc.width, 80);
  assert.equal(doc.height, 160);
  assert.deepEqual(doc.playerSpawn, { x: 40, y: 151 });
});

test("server-rs world_regions embeds maro-bell.json and resolves maro-bell room id directly", () => {
  const worldRegionsPath = resolve(ROOT, "server-rs/src/content/world_regions.rs");
  const content = readFileSync(worldRegionsPath, "utf8");
  assert.match(content, /MARO_BELL_JSON:\s*&str\s*=\s*include_str!\("\.\.\/\.\.\/\.\.\/content\/maps\/maro-bell\.json"\);/);
  assert.match(content, /"maro-bell"\s*=>\s*Some\(MARO_BELL_JSON\)/);
  assert.match(content, /if\s+requested\s*==\s*"maro-bell"\s*\{\s*return\s*"maro-bell";\s*\}/);
});

test("server-rs meta engine exposes poc_maro_10m RPCs and isolated collection", () => {
  const enginePath = resolve(ROOT, "server-rs/src/meta/engine.rs");
  const content = readFileSync(enginePath, "utf8");
  assert.match(content, /COLLECTION_POC_MARO_10M:\s*&str\s*=\s*"poc_maro_10m";/);
  assert.match(content, /KEY_POC_SESSION_STATE:\s*&str\s*=\s*"session_state";/);
  assert.match(content, /"reset_poc_maro_10m"/);
  assert.match(content, /"get_poc_maro_10m_state"/);
  assert.match(content, /"update_poc_maro_10m_state"/);
  assert.match(content, /pub struct PocMaro10mState/);
});

test("game-client defines ResolveServerRsEndpointForMap and MaroBellPocDiagnosticsHud", () => {
  const configPath = resolve(ROOT, "game-client/src/Core/Config.cs");
  const configContent = readFileSync(configPath, "utf8");
  assert.match(
    configContent,
    /public\s+static\s+string\s+ResolveServerRsEndpointForMap\s*\(\s*string\s+endpoint\s*,\s*string\s+mapId\s*\)/
  );

  const hudPath = resolve(ROOT, "game-client/src/UI/Widgets/MaroBellPocDiagnosticsHud.cs");
  assert.ok(existsSync(hudPath), "MaroBellPocDiagnosticsHud.cs must exist");
  const hudContent = readFileSync(hudPath, "utf8");
  assert.match(hudContent, /public\s+sealed\s+partial\s+class\s+MaroBellPocDiagnosticsHud\s*:\s*CanvasLayer/);
  assert.match(hudContent, /public\s+string\s+MapId/);
  assert.match(hudContent, /public\s+string\s+ActiveBeat/);
  assert.match(hudContent, /public\s+Vector3\s+WorldPosition/);
  assert.match(hudContent, /public\s+Vector2\s+ServerPosition/);
  assert.match(hudContent, /public\s+bool\s+IsServerConnected/);
  assert.match(hudContent, /public\s+float\s+FrameTimeMs/);
  assert.match(hudContent, /public\s+static\s+string\s+FormatDiagnosticsSummary/);
  assert.match(hudContent, /1u=1m\s*\|\s*20Hz\s*\|\s*35°/);
});
