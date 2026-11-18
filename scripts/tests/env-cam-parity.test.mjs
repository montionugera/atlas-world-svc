import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MARO_VERIFY_CS = path.join(REPO_ROOT, 'game-client/src/World/MaroBellVerify.cs');

const VEC3_SRC = String.raw`new\s+Vector3\(\s*([+-]?\d+(?:\.\d+)?)\s*f?\s*,\s*([+-]?\d+(?:\.\d+)?)\s*f?\s*,\s*([+-]?\d+(?:\.\d+)?)\s*f?\s*\)`;
const CAM_CONST_RE = new RegExp(
  String.raw`readonly\s+\(\s*Vector3\s+Pos\s*,\s*Vector3\s+LookAt\s*\)\s+([A-Za-z0-9_]+)\s*=\s*\(\s*${VEC3_SRC}\s*,\s*${VEC3_SRC}\s*\)\s*;`,
  'g',
);
const AABB_DECL_RE = new RegExp(
  String.raw`(?:var|Aabb)\s+([A-Za-z0-9_]+)\s*=\s*new(?:\s+Aabb)?\(\s*${VEC3_SRC}\s*,\s*${VEC3_SRC}\s*\)\s*;`,
  'g',
);
const CAM_CHECK_ENTRY_RE = /\(\s*"([^"]+)"\s*,\s*([A-Za-z0-9_]+)\.Pos\s*,\s*([A-Za-z0-9_]+)\s*,/g;
const SAVE_CALL_RE = /Save\(\s*\w+\s*,\s*"([^"]+\.png)"\s*\)/;

/**
 * Verify that TargetAabb's centre lies in front of the camera and within its 3D perspective frustum.
 */
export function targetInCameraFrustum(origin, lookAt, boxPos, boxSize, fovDeg = 54.0, aspect = 4.0 / 3.0) {
  const fx = lookAt[0] - origin[0];
  const fy = lookAt[1] - origin[1];
  const fz = lookAt[2] - origin[2];
  const fnorm = Math.hypot(fx, fy, fz);
  if (fnorm < 1e-6) return false;
  const fwd = [fx / fnorm, fy / fnorm, fz / fnorm];

  const cx = boxPos[0] + 0.5 * boxSize[0] - origin[0];
  const cy = boxPos[1] + 0.5 * boxSize[1] - origin[1];
  const cz = boxPos[2] + 0.5 * boxSize[2] - origin[2];
  const depth = cx * fwd[0] + cy * fwd[1] + cz * fwd[2];
  if (depth <= 0.1) return false;

  const rx = -fwd[2];
  const ry = 0.0;
  const rz = fwd[0];
  const rnorm = Math.hypot(rx, ry, rz);
  const right = rnorm < 1e-6 ? [1.0, 0.0, 0.0] : [rx / rnorm, ry / rnorm, rz / rnorm];
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];

  const xCam = Math.abs(cx * right[0] + cy * right[1] + cz * right[2]);
  const yCam = Math.abs(cx * up[0] + cy * up[1] + cz * up[2]);
  const halfV = Math.tan(((fovDeg * 0.5) * Math.PI) / 180.0) * depth;
  const halfH = halfV * aspect;
  const halfBox = 0.5 * Math.max(...boxSize);
  return yCam <= halfV + halfBox && xCam <= halfH + halfBox;
}

/**
 * Audit a Godot C# verify probe for camera parity between rendered perspective views and EnvRenderPreGate sightline gates.
 */
export function auditCsharpCameraParity(source, milestonePrefixes = ['m5_view', 'm6_view', 'm7_view']) {
  const errors = [];

  const camConsts = new Map();
  for (const m of source.matchAll(CAM_CONST_RE)) {
    camConsts.set(m[1], {
      pos: [Number(m[2]), Number(m[3]), Number(m[4])],
      look: [Number(m[5]), Number(m[6]), Number(m[7])],
    });
  }

  const aabbs = new Map();
  for (const m of source.matchAll(AABB_DECL_RE)) {
    aabbs.set(m[1], {
      pos: [Number(m[2]), Number(m[3]), Number(m[4])],
      size: [Number(m[5]), Number(m[6]), Number(m[7])],
    });
  }

  const checkedConsts = new Map();
  for (const m of source.matchAll(CAM_CHECK_ENTRY_RE)) {
    const [, viewId, constName, aabbName] = m;
    if (!checkedConsts.has(constName)) checkedConsts.set(constName, []);
    checkedConsts.get(constName).push({ viewId, aabbName });
  }

  let currentProj = 'Perspective';
  let lastFov = 54.0;
  let lastPosExpr = '';
  let lastLookExpr = '';
  const constFovs = new Map();

  for (const rawLine of source.split(/\r?\n/)) {
    const s = rawLine.trim();
    if (s.includes('Camera3D.ProjectionType.Orthogonal')) {
      currentProj = 'Orthogonal';
      lastPosExpr = '';
      lastLookExpr = '';
    } else if (s.includes('Camera3D.ProjectionType.Perspective')) {
      currentProj = 'Perspective';
      lastPosExpr = '';
      lastLookExpr = '';
    }

    const mFov = s.match(/\.Fov\s*=\s*([+-]?\d+(?:\.\d+)?)\s*f?\s*;/);
    if (mFov && (s.includes('Cam.Fov') || s.includes('cam.Fov'))) {
      lastFov = Number(mFov[1]);
      lastPosExpr = '';
      lastLookExpr = '';
    }

    const mPos = s.match(/\.Position\s*=\s*([^;]+);/);
    if (mPos && (s.includes('Cam.Position') || s.includes('cam.Position'))) {
      lastPosExpr = mPos[1].trim();
    }
    const mLook = s.match(/\.LookAt\(\s*([^,]+),/);
    if (mLook && (s.includes('Cam.LookAt') || s.includes('cam.LookAt'))) {
      lastLookExpr = mLook[1].trim();
    }

    const mSave = s.match(SAVE_CALL_RE);
    if (!mSave || currentProj !== 'Perspective') continue;
    const fname = mSave[1];
    const low = fname.toLowerCase();
    if (['ortho', 'nav_qa', 'nav_debug', 'collision', 'frametime'].some((sk) => low.includes(sk))) continue;
    if (milestonePrefixes.some((pre) => low.startsWith(pre))) {
      if (!lastPosExpr || lastPosExpr.includes('new Vector3') || !lastPosExpr.endsWith('.Pos')) {
        errors.push(`Inline or missing camera Position before '${fname}': got \`${lastPosExpr}\` instead of \`*CamView*.Pos\``);
      }
      if (!lastLookExpr || lastLookExpr.includes('new Vector3') || !lastLookExpr.endsWith('.LookAt')) {
        errors.push(`Inline or missing camera LookAt before '${fname}': got \`${lastLookExpr}\` instead of \`*CamView*.LookAt\``);
      }
      if (lastPosExpr.endsWith('.Pos') && lastLookExpr.endsWith('.LookAt')) {
        const pBase = lastPosExpr.slice(0, -4);
        const lBase = lastLookExpr.slice(0, -7);
        if (pBase !== lBase) {
          errors.push(`Mismatched camera constant before '${fname}': Position uses \`${pBase}\` while LookAt uses \`${lBase}\``);
        } else {
          constFovs.set(pBase, lastFov);
        }
      }
    }
  }

  for (const [cname, { pos, look }] of camConsts.entries()) {
    const checks = checkedConsts.get(cname);
    if (!checks || checks.length === 0) {
      errors.push(`Camera constant '${cname}' is declared for rendering but missing from EnvRenderPreGate camChecks`);
      continue;
    }
    const fov = constFovs.get(cname) ?? 54.0;
    for (const { viewId, aabbName } of checks) {
      const box = aabbs.get(aabbName);
      if (!box) {
        errors.push(`TargetAabb '${aabbName}' for '${viewId}' (${cname}) could not be resolved (fail closed)`);
        continue;
      }
      if (!targetInCameraFrustum(pos, look, box.pos, box.size, fov)) {
        errors.push(
          `Camera look-target frustum mismatch on '${viewId}' (${cname}, fov=${fov} deg): LookAt [${look}] from [${pos}] leaves TargetAabb '${aabbName}' outside frustum`,
        );
      }
    }
  }

  return errors;
}

test('live MaroBellVerify.cs passes milestone camera parity & frustum target checks', () => {
  const src = fs.readFileSync(MARO_VERIFY_CS, 'utf8');
  const errors = auditCsharpCameraParity(src);
  assert.deepEqual(errors, []);
});

test('auditCsharpCameraParity catches inline Vector3 drift, missing camChecks, mismatched constants, unresolved Aabb, and mis-aimed LookAt', () => {
  const goodFixture = `
    private static readonly (Vector3 Pos, Vector3 LookAt) M5CamView3 = (new Vector3(0.0f, 27.0f, 58.0f), new Vector3(0.0f, 39.0f, -82.0f));
    async Task Render() {
      m1Cam.Projection = Camera3D.ProjectionType.Perspective;
      m1Cam.Fov = 50f;
      m1Cam.Position = M5CamView3.Pos;
      m1Cam.LookAt(M5CamView3.LookAt, Vector3.Up);
      await Save(outDir, "m5_view3_south_boulevard_hero_shot2_raw.png");
    }
    void VerifyM5EnvRenderPreGate() {
      Aabb sanctuaryArchTarget = new(new Vector3(-12.0f, 46.0f, -111.0f), new Vector3(24.0f, 36.0f, 10.0f));
      var camChecks = new (string ViewId, Vector3 CamPos, Aabb TargetAabb, string[] Subject)[] {
        ("M5_View3", M5CamView3.Pos, sanctuaryArchTarget, archSubject),
      };
    }
  `;
  assert.deepEqual(auditCsharpCameraParity(goodFixture), []);

  // 1. Inline Vector3 drift before Save()
  const drifted = goodFixture.replace('m1Cam.Position = M5CamView3.Pos;', 'm1Cam.Position = new Vector3(1.0f, 2.0f, 3.0f);');
  assert.match(auditCsharpCameraParity(drifted)[0], /Inline or missing camera Position/i);

  // 2. Declared CamView constant omitted from camChecks
  const ungated = goodFixture.replace('("M5_View3", M5CamView3.Pos, sanctuaryArchTarget, archSubject),', '');
  assert.match(auditCsharpCameraParity(ungated)[0], /missing from EnvRenderPreGate camChecks/);

  // 3. Mismatched Pos vs LookAt constants
  const mismatched = goodFixture.replace('m1Cam.LookAt(M5CamView3.LookAt,', 'm1Cam.LookAt(M5CamView4.LookAt,');
  assert.match(auditCsharpCameraParity(mismatched)[0], /Mismatched camera constant/);

  // 4. Unknown/unparsed TargetAabb fails closed
  const unresolved = goodFixture.replace('sanctuaryArchTarget,', 'unknownTarget,');
  assert.match(auditCsharpCameraParity(unresolved)[0], /could not be resolved/);

  // 5. LookAt points completely away from TargetAabb
  const misaimed = goodFixture.replace('new Vector3(0.0f, 39.0f, -82.0f)', 'new Vector3(250.0f, 39.0f, 250.0f)');
  assert.match(auditCsharpCameraParity(misaimed)[0], /frustum mismatch/);
});
