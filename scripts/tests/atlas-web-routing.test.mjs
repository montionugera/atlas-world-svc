// scripts/tests/atlas-web-routing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ingress = readFileSync(path.join(ROOT, 'k8s/local/ingress.yaml'), 'utf8');
const web = readFileSync(path.join(ROOT, 'k8s/local/atlas-world-web.yaml'), 'utf8');

const backendOf = (host) => {
  const at = ingress.indexOf(`host: ${host}\n`); // the newline stops .local matching .local.com
  assert.ok(at > 0, host);
  return ingress.slice(at).match(/service:\s*\n\s*name: (\S+)/)[1];
};

test('release hostnames reach the cluster app', () => {
  for (const h of ['atlas-world.joymify.local.com', 'atlas.joymify.local.com', 'atlas-world.joymify.local']) {
    assert.equal(backendOf(h), 'atlas-world-web', h);
  }
});

test('edit hostname and the redirect stay on the host process', () => {
  assert.equal(backendOf('atlas-edit.joymify.local.com'), 'atlas-world-studio-host');
  assert.equal(backendOf('atlas-storybook.joymify.local.com'), 'atlas-world-studio-host');
});

test('deployment is one local replica behind a readiness probe', () => {
  assert.match(web, /replicas: 1/);
  assert.match(web, /image: atlas-world-web:local/);
  assert.match(web, /imagePullPolicy: Never/);
  assert.match(web, /readinessProbe:[\s\S]*path: \/healthz/);
});
