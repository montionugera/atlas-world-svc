import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

test('server and client share one walkable slope limit', () => {
  const rs = Number(read('server-rs/src/content/map.rs').match(/MAX_WALKABLE_SLOPE_DEG: f32 = ([\d.]+);/)[1]);
  const cs = Number(read('game-client/src/World/TerrainElevation.cs').match(/MaxWalkableSlopeDeg = ([\d.]+)f;/)[1]);
  assert.equal(rs, cs, `server ${rs} deg vs client ${cs} deg`);
});
