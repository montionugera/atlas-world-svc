#!/usr/bin/env node
// Regenerates src/data/bestiaryNames.json (mob id -> display name) from the canonical
// content/bestiary/bestiary.json. CRA cannot import files outside src/, so the client
// keeps this small generated copy; mobUtils.test.ts fails if it drifts from the source.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../content/bestiary/bestiary.json');
const out = resolve(here, '../src/data/bestiaryNames.json');
const entries = JSON.parse(readFileSync(src, 'utf8'));
const names = Object.fromEntries(entries.map((e) => [e.id, e.name]).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(out, JSON.stringify(names, null, 2) + '\n');
console.log(`wrote ${Object.keys(names).length} names to ${out}`);
