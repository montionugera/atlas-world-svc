/**
 * prompt-lint.mjs — a POSITIVE prompt may not contain negation.
 *
 * Pure module. No filesystem, no network, no config reads: the caller owns
 * the vocabulary and passes it in, so the forbidden-subject list stays in
 * config (prompts/style-laws.json, forge.config.json `styleGuard`) where it
 * belongs and this file stays testable in isolation.
 *
 * WHY THIS EXISTS
 * ---------------
 * A diffusion text encoder attends to tokens. It has no operator for "no".
 * Writing "no cars, no power lines, no modern city skyline" into a POSITIVE
 * prompt therefore hands the model `cars`, `power lines`, `modern city
 * skyline` as subjects to attend to — the guard summons exactly what it
 * forbids. This was measured, not theorised:
 *
 *  - docs/worldbuilding/ABP-controlnet-replication.md records lattice pylons
 *    in 5 of 16 cells and modern vehicles/skylines "despite 'no modern
 *    vehicles'/'no modern city skyline' already being in this list".
 *  - 2026-08-08, Millcross at ControlNet strengths 0.00/0.30/0.45/0.60:
 *    pylons and painted road markings appeared in EVERY cell, including with
 *    the control signal fully off — so the contamination was coming from the
 *    prompt, not from the control image.
 *  - The same subject re-run with a positive-only prompt (asserting what IS
 *    present) came back clean: river, ford, cart queue, a real water-wheel;
 *    no pylons, no road markings, no vehicles.
 *
 * The fix is to assert what IS present. This module is the gate that keeps
 * the fix from rotting back: `assertPositivePromptClean` throws at prompt
 * COMPOSITION time, before a job is queued, which is worth ~218 s of GPU per
 * bad cell.
 *
 * The KSampler *negative* conditioning node is a different thing and is not
 * this module's business — it may keep receiving the real negative word list
 * (inert at cfg 1, correct if cfg is ever raised). What must never happen is
 * negation text entering the POSITIVE string.
 */

/** Rule ids — exported so callers and tests reference them symbolically. */
export const RULE_NEGATION = "R1-negation";
export const RULE_FORBIDDEN_TOKEN = "R2-forbidden-token";

/**
 * The negation constructions R1 rejects.
 *
 * Word-boundaried and case-insensitive. The boundaries are the whole design:
 * "north", "nothing", "notable", "none", "cannot", "snow", "canopy",
 * "nomad", "innocent" and "unnoticed" are all legitimate art prose that
 * contain one of these words as a SUBSTRING, and a guard that fires on them
 * is a guard authors delete. tests/prompt-lint.test.mjs pins every one of
 * those as ACCEPTED.
 *
 * The optional trailing group is not part of the trigger — it only widens
 * the reported `match` to include the word being negated ("no cars" rather
 * than a bare "no"), because that word is the token the model actually
 * receives and the author needs to see it named.
 */
const NEGATION_RE = /\b(?:no|not|without|never|avoid|exclude)\b(?:[\s-]+[\w'’-]+)?/gi;

/** Escape a config-supplied token for literal use inside a RegExp. */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a forbidden token as a whole word/phrase. Lookarounds rather than
 * `\b` so a token that begins or ends with a non-word character still
 * behaves: "car" must not fire on "caravan" or "cart", but "3D render" must
 * still match.
 */
function tokenRegExp(token) {
  return new RegExp(`(?<![\\w])${escapeRegExp(token)}(?![\\w])`, "gi");
}

/**
 * Lint one composed POSITIVE prompt.
 *
 * @param {string} text  the fully composed positive prompt
 * @param {{ forbiddenTokens?: string[] }} [options]
 *        `forbiddenTokens` — subjects that must not be NAMED at all,
 *        regardless of any surrounding negation, because naming them biases
 *        the render toward them. Supplied by the caller from config; there
 *        is deliberately no built-in list.
 * @returns {Array<{ rule: string, match: string, index: number }>}
 *          violations ordered by position in `text`; empty when clean.
 */
export function lintPositivePrompt(text, { forbiddenTokens = [] } = {}) {
  if (typeof text !== "string") {
    throw new TypeError(`lintPositivePrompt expects a string, got ${typeof text}`);
  }
  const violations = [];

  for (const m of text.matchAll(NEGATION_RE)) {
    violations.push({ rule: RULE_NEGATION, match: m[0], index: m.index });
  }

  for (const token of forbiddenTokens) {
    if (typeof token !== "string" || token.trim() === "") continue;
    for (const m of text.matchAll(tokenRegExp(token))) {
      violations.push({ rule: RULE_FORBIDDEN_TOKEN, match: m[0], index: m.index });
    }
  }

  return violations.sort((a, b) => a.index - b.index);
}

/**
 * Throw unless `text` is a clean positive prompt. The message names the rule
 * and the offending substring for every violation, so the author can see
 * exactly which words the model would have received.
 *
 * @returns {string} `text` unchanged, so it can be used inline.
 */
export function assertPositivePromptClean(text, options) {
  const violations = lintPositivePrompt(text, options);
  if (violations.length === 0) return text;
  const detail = violations
    .map((v) => `  [${v.rule}] "${v.match}" at index ${v.index}`)
    .join("\n");
  throw new Error(
    `positive prompt rejected — ${violations.length} violation(s):\n${detail}\n` +
      "A diffusion text encoder attends to tokens; it has no operator for negation, " +
      "so every word above is handed to the model as a subject to render. " +
      "Assert what IS present instead (see generate/prompt-lint.mjs).\n" +
      `prompt was: ${text}`,
  );
}
