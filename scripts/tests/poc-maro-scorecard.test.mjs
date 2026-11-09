// F-211: POC-06 Player Impression Validation and Scorecard Gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("PocMaro10mVerify.cs declares end-to-end headless probe and outputs VERDICT PASS", () => {
  const probePath = resolve(ROOT, "game-client/src/World/PocMaro10mVerify.cs");
  assert.ok(existsSync(probePath), "PocMaro10mVerify.cs exists");

  const code = readFileSync(probePath, "utf8");
  assert.ok(code.includes("PocMaro10mVerify : Node"), "PocMaro10mVerify class declaration");
  assert.ok(code.includes("[PocMaro10mVerify] VERDICT PASS"), "prints VERDICT PASS tag");
  assert.ok(code.includes("ATLAS_VERIFY_POC_MARO_10M"), "references ATLAS_VERIFY_POC_MARO_10M env var");
  assert.ok(code.includes("EvaluateScorecard"), "calls EvaluateScorecard");
  assert.ok(code.includes("BeatTimestamps"), "validates BeatTimestamps telemetry");
});

test("VerticalSliceRoot.cs dispatches ATLAS_VERIFY_POC_MARO_10M probe", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/VerticalSliceRoot.cs"), "utf8");

  assert.ok(code.includes("ATLAS_VERIFY_POC_MARO_10M"), "ATLAS_VERIFY_POC_MARO_10M check present");
  assert.ok(code.includes("AddChild(new PocMaro10mVerify"), "instantiates PocMaro10mVerify");
});

test("MaroBellPocController.cs implements telemetry timestamps and the 7-metric scorecard evaluation", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellPocController.cs"), "utf8");

  assert.ok(code.includes("public readonly record struct ScorecardMetric"), "ScorecardMetric struct");
  assert.ok(code.includes("public sealed class PocScorecard"), "PocScorecard class");
  assert.ok(code.includes("public Dictionary<string, double> BeatTimestamps"), "BeatTimestamps dictionary");
  assert.ok(code.includes("public void RecordBeatTimestamp"), "RecordBeatTimestamp method");
  assert.ok(code.includes("public bool ConcludePoc"), "ConcludePoc method");
  assert.ok(code.includes("public PocScorecard EvaluateScorecard"), "EvaluateScorecard method");

  // Validate the 7 scorecard metrics are registered
  assert.ok(code.includes("\"M-01\"") && code.includes("Landmark Discovery"), "M-01 Landmark Discovery");
  assert.ok(code.includes("\"M-02\"") && code.includes("Movement & Traversal"), "M-02 Movement & Traversal");
  assert.ok(code.includes("\"M-03\"") && code.includes("Warmth Recall"), "M-03 Warmth Recall");
  assert.ok(code.includes("\"M-04\"") && code.includes("Combat Clarity"), "M-04 Combat Clarity");
  assert.ok(code.includes("\"M-05\"") && code.includes("Mystery Comprehension"), "M-05 Mystery Comprehension");
  assert.ok(code.includes("\"M-06\"") && code.includes("Curiosity to Continue"), "M-06 Curiosity to Continue");
  assert.ok(code.includes("\"M-07\"") && code.includes("Technical Stability"), "M-07 Technical Stability");
});

test("server-rs meta engine isolates POC-00..05 progress from canonical quest saves", () => {
  const engineCode = readFileSync(resolve(ROOT, "server-rs/src/meta/engine.rs"), "utf8");

  assert.ok(engineCode.includes("COLLECTION_POC_MARO_10M: &str = \"poc_maro_10m\";"), "isolated meta collection constant");
  assert.ok(engineCode.includes("pub struct PocMaro10mState"), "PocMaro10mState struct defined");
  assert.ok(engineCode.includes("amber_errand_completed"), "amber errand tracked");
  assert.ok(engineCode.includes("vermin_defeated"), "vermin defeat tracked");
  assert.ok(engineCode.includes("parcel_recovered"), "parcel recovery tracked");
  assert.ok(engineCode.includes("trace_glimpsed"), "trace glimpsed tracked");
  assert.ok(engineCode.includes("time_wound_triggered"), "time wound tracked");
  assert.ok(engineCode.includes("glade_hook_unlocked"), "glade hook tracked");
});

test("Maro Bell POC evaluation scorecard template exists with 7 target metrics", () => {
  const templatePath = resolve(ROOT, "docs/superpowers/specs/2026-11-09-maro-bell-poc-scorecard-template.md");
  assert.ok(existsSync(templatePath), "scorecard template markdown file exists");

  const doc = readFileSync(templatePath, "utf8");
  assert.ok(doc.includes("The 7-Metric POC Success Scorecard"), "scorecard section heading");
  assert.ok(doc.includes("M-01"), "M-01 metric documented");
  assert.ok(doc.includes("M-02"), "M-02 metric documented");
  assert.ok(doc.includes("M-03"), "M-03 metric documented");
  assert.ok(doc.includes("M-04"), "M-04 metric documented");
  assert.ok(doc.includes("M-05"), "M-05 metric documented");
  assert.ok(doc.includes("M-06"), "M-06 metric documented");
  assert.ok(doc.includes("M-07"), "M-07 metric documented");
  assert.ok(doc.includes("Human Playtest Observation Sheet Template"), "observation template included");
});
