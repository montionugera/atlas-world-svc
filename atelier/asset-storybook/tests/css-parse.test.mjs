// F-053 Phase 1 — stylesheet integrity gate (spec §9 Phase 0 "Gates", AC 1).
// C0.1: `.maps-overlay-img {` at index.html:1025 never closed, so Chrome's CSS
// nesting silently scoped the next 91 rules (the detail overlay and every
// Forge style) under it. Releases 1.8 and 1.9 shipped that way because
// nothing parsed the stylesheet. This test walks braces over the single
// <style> block: depth never negative, ends at 0, and no rule opens inside a
// rule (only @media/@supports/@keyframes/@layer/@container may contain rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NESTING_AT_RULE = /^@(media|supports|keyframes|layer|container)\b/;

// Replace every non-newline char of a match with a space, so line numbers survive.
const blank = (m) => m.replace(/[^\n]/g, " ");

function braceProblems(css, lineOffset = 0) {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, blank);
  const problems = [];
  const stack = [];
  let line = 1 + lineOffset;
  let preludeStart = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === "\n") line++;
    if (c === ";") preludeStart = i + 1;
    if (c === "{") {
      const prelude = clean.slice(preludeStart, i).trim().replace(/\s+/g, " ");
      const top = stack[stack.length - 1];
      if (top && top.kind === "rule") {
        problems.push(`line ${line}: "${prelude}" opens inside "${top.prelude}" (opened line ${top.line})`);
      }
      stack.push({ prelude, line, kind: NESTING_AT_RULE.test(prelude) ? "at" : "rule" });
      preludeStart = i + 1;
    }
    if (c === "}") {
      if (stack.length === 0) problems.push(`line ${line}: unmatched "}"`);
      else stack.pop();
      preludeStart = i + 1;
    }
  }
  for (const open of stack) problems.push(`line ${open.line}: "${open.prelude}" never closes`);
  return problems;
}

test("braceProblems flags an unclosed rule and the rule nested under it", () => {
  const problems = braceProblems(".a {\n  color: red;\n.b {\n  color: blue;\n}\n");
  assert.equal(problems.length, 2);
  assert.match(problems[0], /"\.b" opens inside "\.a"/);
  assert.match(problems[1], /"\.a" never closes/);
});

test("braceProblems accepts rules inside @media and @keyframes, and ignores braces in comments and strings", () => {
  const css =
    '/* { */ .a { content: "}"; }\n@media (max-width: 720px) { .a { color: red; } }\n@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n';
  assert.deepEqual(braceProblems(css), []);
});

test("index.html's stylesheet balances and nests no rule outside an at-rule", () => {
  const html = readFileSync(join(HERE, "..", "index.html"), "utf8");
  const blocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  assert.ok(blocks.length >= 1, "no <style> block found in index.html");
  for (const m of blocks) {
    const offset = html.slice(0, m.index + "<style>".length).split("\n").length - 1;
    assert.deepEqual(braceProblems(m[1], offset), []);
  }
});
