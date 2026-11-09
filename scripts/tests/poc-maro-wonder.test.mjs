// F-206: POC-01 Wonder — The Road to the Great Bell (00:00–02:30).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("audio-manifest.json registers the 4 POC-01 environmental audio keys with valid CC0 streams", () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, "game-client/assets/audio-manifest.json"), "utf8"));
  const entries = manifest.entries;
  assert.ok(entries, "manifest entries object exists");

  const requiredKeys = ["sfx:bell_resonance", "sfx:bell_toll", "sfx:wind_ambient", "sfx:footstep"];
  for (const key of requiredKeys) {
    const entry = entries[key];
    assert.ok(entry, `missing audio manifest key: ${key}`);
    assert.equal(entry.license, "CC0", `${key} must have CC0 license`);
    assert.ok(entry.stream.startsWith("res://assets/audio/"), `${key} stream must point to res://assets/audio/`);

    const relPath = entry.stream.replace("res://", "game-client/");
    const absPath = resolve(ROOT, relPath);
    assert.ok(existsSync(absPath), `${key} stream target file exists at ${relPath}`);
  }
});

test("maro-bell.json satisfies all 4 POC-01 reveal composition criteria", () => {
  const doc = JSON.parse(readFileSync(resolve(ROOT, "content/maps/maro-bell.json"), "utf8"));
  const structures = doc.structures;
  const obstacles = doc.staticObstacles || [];

  // 1. Foreground lanterns framing the vista
  const hasLantern01 = structures.some(
    (s) => s.id === "lantern-01" && Math.abs(s.x) <= 5 && s.z >= 50 && s.z <= 65
  );
  const hasLantern02 = structures.some(
    (s) => s.id === "lantern-02" && Math.abs(s.x) <= 5 && s.z >= 45 && s.z <= 60
  );
  assert.ok(hasLantern01 && hasLantern02, "foreground lanterns framing the initial arrival walk");

  // 2. Road corridor clear from arrival gate (0, 71) to (0, 60)
  const roadCorridorBlocked = obstacles.some(
    (obs) => obs.min_x <= 40 && obs.max_x >= 40 && obs.min_y <= 151 && obs.max_y >= 140
  );
  assert.equal(roadCorridorBlocked, false, "arrival road corridor is clear of static obstacles");

  // 3. Great Bell line of sight clear from arrival spawn
  const bell = structures.find((s) => s.id === "great-bell");
  assert.ok(bell, "great-bell structure exists");
  assert.equal(bell.z, -66, "great-bell z is at -66");
  const bellCenterY = (bell.hover || 0) + (bell.size?.y || 0) * 0.5;
  assert.ok(bellCenterY >= 12, `great-bell center Y is elevated above 12m (got ${bellCenterY})`);

  const blockingSightline = structures.filter(
    (s) => s.solid !== false && Math.abs(s.x) <= 2.5 && s.z > -60 && s.z < 71 && ((s.hover || 0) + (s.size?.y || 0) > 8.0)
  );
  assert.equal(blockingSightline.length, 0, "no solid structure blocks sightline along central road");

  // 4. Flanking porcelain ribs
  const flankingRibs = structures.filter(
    (s) => s.id.startsWith("porcelain-rib-") && Math.abs(s.x) >= 30
  );
  assert.ok(flankingRibs.length >= 6, `at least 6 porcelain ribs flank the valley (found ${flankingRibs.length})`);
});

test("MaroBellPocController.cs declares required constants, composition record, and NPC lifecycle", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellPocController.cs"), "utf8");

  assert.ok(code.includes("ArrivalSpawnWorld = new(0f, 0f, 71f)"), "ArrivalSpawnWorld constant");
  assert.ok(code.includes("GreatBellWorld = new(0f, 14f, -66f)"), "GreatBellWorld constant");
  assert.ok(code.includes("PipWorldPos = new(-3.0f, 0f, 60.0f)"), "PipWorldPos constant");
  assert.ok(code.includes("ReedWorldPos = new(3.0f, 0f, 62.0f)"), "ReedWorldPos constant");
  assert.ok(code.includes("TovinWorldPos = new(4.5f, 0f, -50.0f)"), "TovinWorldPos constant");
  assert.ok(code.includes("InteractionRadiusMeters = 3.8f"), "InteractionRadiusMeters constant");

  assert.ok(code.includes("record struct RevealCompositionReport"), "RevealCompositionReport record");
  assert.ok(code.includes("EvaluateGreatBellRevealComposition"), "EvaluateGreatBellRevealComposition method");
  assert.ok(code.includes("EntityView? PipView"), "PipView property");
  assert.ok(code.includes("EntityView? ReedView"), "ReedView property");
  assert.ok(code.includes("EntityView? TovinView"), "TovinView property");
  assert.ok(code.includes("public bool PipGreeted"), "PipGreeted property");
  assert.ok(code.includes("public string ObjectiveText"), "ObjectiveText property");
  assert.ok(code.includes("public string LastDialogueLine"), "LastDialogueLine property");
  assert.ok(code.includes("public int EnvironmentalAudioEventsPlayed"), "EnvironmentalAudioEventsPlayed property");

  assert.ok(code.includes("StepPlayer"), "StepPlayer method");
  assert.ok(code.includes("InteractWithPip"), "InteractWithPip method");
  assert.ok(code.includes("TryInteractNearest"), "TryInteractNearest method");
  assert.ok(code.includes("sfx:bell_resonance"), "bell_resonance audio trigger");
  assert.ok(code.includes("sfx:wind_ambient"), "wind_ambient audio trigger");
  assert.ok(code.includes("sfx:footstep"), "footstep audio trigger");
  assert.ok(code.includes("sfx:chime_soft"), "chime_soft audio trigger on Pip greeting");
});

test("MaroBellVerify.cs integrates VerifyPoc01WonderRoadToGreatBell assertions", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellVerify.cs"), "utf8");

  assert.ok(code.includes("VerifyPoc01WonderRoadToGreatBell(doc)"), "VerifyPoc01WonderRoadToGreatBell called in Run()");
  assert.ok(code.includes("EvaluateGreatBellRevealComposition"), "composition evaluated");
  assert.ok(code.includes("poc.PipView != null && poc.ReedView != null && poc.TovinView != null"), "NPC views asserted");
  assert.ok(code.includes("poc.PipView?.Animation.CurrentState == \"idle\""), "Pip idle state asserted");
  assert.ok(code.includes("poc.EnvironmentalAudioEventsPlayed >= 2"), "audio count asserted");
  assert.ok(code.includes("poc.StepPlayer(MaroBellPocController.PipWorldPos"), "StepPlayer to Pip asserted");
  assert.ok(code.includes("poc.PipGreeted"), "PipGreeted asserted");
  assert.ok(code.includes("poc.ActiveBeat == \"POC-01\""), "ActiveBeat POC-01 asserted");
  assert.ok(code.includes("poc.LastDialogueLine.Contains(\"Great Bell\")"), "dialogue line asserted");
  assert.ok(code.includes("poc.ObjectiveText.Contains(\"Amber\")"), "Amber objective asserted");
});

test("VerticalSliceRoot.cs and PlaytestSandboxRoot.cs wire MaroBellPocController and Key.F interaction", () => {
  const vsRoot = readFileSync(resolve(ROOT, "game-client/src/VerticalSliceRoot.cs"), "utf8");
  const psRoot = readFileSync(resolve(ROOT, "game-client/src/World/PlaytestSandboxRoot.cs"), "utf8");

  assert.ok(vsRoot.includes("_maroPoc = new MaroBellPocController"), "vsRoot instantiates MaroBellPocController");
  assert.ok(vsRoot.includes("_maroPoc?.StepPlayer"), "vsRoot steps MaroBellPocController");
  assert.ok(vsRoot.includes("_maroPoc?.TryInteractNearest"), "vsRoot binds Key.F to TryInteractNearest");
  assert.ok(vsRoot.includes("_maroPoc?.ActiveBeat ?? \"POC-00\""), "vsRoot feeds active beat to diagnostics HUD");

  assert.ok(psRoot.includes("_maroPoc = new MaroBellPocController"), "psRoot instantiates MaroBellPocController");
  assert.ok(psRoot.includes("_maroPoc?.StepPlayer"), "psRoot steps MaroBellPocController");
  assert.ok(psRoot.includes("_maroPoc?.TryInteractNearest"), "psRoot binds Key.F to TryInteractNearest");
});
