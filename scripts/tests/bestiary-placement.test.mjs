import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function compile() {
  const schema = JSON.parse(
    readFileSync(join(ROOT, "content/schemas/bestiary-placement.schema.json"), "utf8"));
  return new Ajv({ allErrors: true }).compile(schema);
}

test("the committed Thornveil placement file validates against the schema", () => {
  const validate = compile();
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content/bestiary/placement-thornveil.json"), "utf8"));
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema rejects an unknown top-level property", () => {
  const validate = compile();
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content/bestiary/placement-thornveil.json"), "utf8"));
  assert.equal(validate({ ...doc, surprise: true }), false);
});

test("schema rejects a placement missing its locale", () => {
  const validate = compile();
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content/bestiary/placement-thornveil.json"), "utf8"));
  const broken = { ...doc, placements: [{ design: "mob-veil-cub", tier: "verge" }] };
  assert.equal(validate(broken), false);
});
