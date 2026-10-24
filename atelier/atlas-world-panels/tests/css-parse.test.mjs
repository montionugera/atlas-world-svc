// F-053 Phase 1 — stylesheet integrity gate (spec §9 Phase 0 "Gates", AC 1).
// C0.1: `.maps-overlay-img {` at index.html:1025 never closed, so Chrome's CSS
// nesting silently scoped the next 91 rules (the detail overlay and every
// Forge style) under it. Releases 1.8 and 1.9 shipped that way because
// nothing parsed the stylesheet.
//
// SSOT merge W0-3: the stylesheet now lives in css/panels.css, wrapped in ONE
// top-level `.atlas-panel { … }` rule (native CSS nesting) so it can mount inside
// the observatory. The walker therefore allows exactly one level of nesting —
// style rules directly inside the wrapper — and still flags any deeper nesting,
// an unclosed brace, an unmatched `}`, and an @keyframes/@media placed inside
// the wrapper (browsers drop @keyframes there).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NESTING_AT_RULE = /^@(media|supports|keyframes|layer|container)\b/;

// Replace every non-newline char of a match with a space, so line numbers survive.
const blank = (m) => m.replace(/[^\n]/g, " ");

const WRAPPER = ".atlas-panel";

// `wrapper` (optional) names a top-level rule that MAY contain style rules —
// the CSS-nesting scope. Everything else follows the original contract.
function braceProblems(css, lineOffset = 0, { wrapper = null } = {}) {
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
      const isAtRule = NESTING_AT_RULE.test(prelude);
      const kind = isAtRule
        ? "at"
        : stack.length === 0 && prelude === wrapper
          ? "wrapper"
          : "rule";
      if (top && top.kind === "rule") {
        problems.push(
          `line ${line}: "${prelude}" opens inside "${top.prelude}" (opened line ${top.line})`,
        );
      } else if (
        top &&
        top.kind === "wrapper" &&
        isAtRule &&
        /^@keyframes\b/.test(prelude)
      ) {
        problems.push(
          `line ${line}: "${prelude}" inside the "${top.prelude}" wrapper is dropped by browsers — keep @keyframes at top level`,
        );
      }
      stack.push({ prelude, line, kind });
      preludeStart = i + 1;
    }
    if (c === "}") {
      if (stack.length === 0) problems.push(`line ${line}: unmatched "}"`);
      else stack.pop();
      preludeStart = i + 1;
    }
  }
  for (const open of stack)
    problems.push(`line ${open.line}: "${open.prelude}" never closes`);
  return problems;
}

test("braceProblems flags an unclosed rule and the rule nested under it", () => {
  const problems = braceProblems(
    ".a {\n  color: red;\n.b {\n  color: blue;\n}\n",
  );
  assert.equal(problems.length, 2);
  assert.match(problems[0], /"\.b" opens inside "\.a"/);
  assert.match(problems[1], /"\.a" never closes/);
});

test("braceProblems accepts rules inside @media and @keyframes, and ignores braces in comments and strings", () => {
  const css =
    '/* { */ .a { content: "}"; }\n@media (max-width: 720px) { .a { color: red; } }\n@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n';
  assert.deepEqual(braceProblems(css), []);
});

test("braceProblems allows one level of nesting under the wrapper, and no deeper", () => {
  const ok =
    ".atlas-panel {\n  & .a { color: red; }\n  & .b { color: blue; }\n}\n@keyframes k { from { opacity: 0; } }\n";
  assert.deepEqual(braceProblems(ok, 0, { wrapper: WRAPPER }), []);
  // the same file without a declared wrapper is the old C0.1 failure shape
  assert.ok(braceProblems(ok).length >= 2);
  const deeper = ".atlas-panel {\n  & .a {\n    & .b { color: red; }\n  }\n}\n";
  const problems = braceProblems(deeper, 0, { wrapper: WRAPPER });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"& \.b" opens inside "& \.a"/);
});

test("braceProblems flags a missing close brace under the wrapper (mutation: delete one })", () => {
  const css =
    ".atlas-panel {\n  & .a { color: red;\n  & .b { color: blue; }\n}\n";
  const problems = braceProblems(css, 0, { wrapper: WRAPPER });
  assert.ok(
    problems.length >= 1,
    "an unclosed rule inside the wrapper must be reported",
  );
});

test("braceProblems flags @keyframes placed inside the wrapper", () => {
  const css = ".atlas-panel {\n  @keyframes k { from { opacity: 0; } }\n}\n";
  const problems = braceProblems(css, 0, { wrapper: WRAPPER });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /dropped by browsers/);
});

test("css/panels.css balances, is wrapped in .atlas-panel, and keeps @keyframes at top level", () => {
  const css = readFileSync(join(HERE, "..", "css", "panels.css"), "utf8");
  assert.deepEqual(braceProblems(css, 0, { wrapper: WRAPPER }), []);
  assert.match(
    css,
    /^\.atlas-panel \{/m,
    "the single .atlas-panel wrapper rule is missing",
  );
  assert.equal([...css.matchAll(/^\.atlas-panel \{/gm)].length, 1);
  assert.match(
    css,
    /^@keyframes eq \{/m,
    "@keyframes eq must stay at top level",
  );
});

test("index.html is only a redirect stub into atlas-world (no inline <style>, no shell)", () => {
  const html = readFileSync(join(HERE, "..", "index.html"), "utf8");
  assert.match(html, /<meta http-equiv="refresh" content="0;url=\/\?tab=assets"/);
  assert.match(html, /<a href="\/\?tab=assets">/, "the stub needs a clickable fallback link");
  assert.equal([...html.matchAll(/<style>/g)].length, 0, "index.html must not carry an inline <style>");
  assert.equal([...html.matchAll(/<script/g)].length, 0, "the redirect stub must not load scripts");
});
