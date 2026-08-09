# A3 — Town plans

## 0. Spatial review of cluster-1 geography

A **read-only** pass over `content/maps/cluster1-geography.json` (`version: 1`, git blob
`48a0a115d5bd1a12f3cedf5486d11150b51c80a8`, node v26.5.0) against four criteria. Per the F-040
design §9 the geography file is **never written back** — this section *records*, it does not *fix*.
Every number below is reproduced by the command printed beneath it; run each from the repo root.

| # | Criterion | Verdict |
| --- | --- | --- |
| 1 | Roads routed sanely | **PASS with two recorded observations** |
| 2 | Zone polygons tile | **PASS — no interior gaps; 6 overlaps, all accepted** |
| 3 | Every town `at` lies inside its zone | **PASS — 7 of 7** |
| 4 | Coast and river do not self-intersect | **PASS — 0 self-intersections in either** |

Units are **km** throughout (`coordinateSystem.units`); the sheet is 150 km × 190 km, x east, y south.

---

### 0.1 Criterion 1 — roads routed sanely — **PASS (2 observations)**

All 8 roads: **0** duplicate consecutive vertices, **0** vertices off the 150 × 190 sheet, minimum
interior angle **149.0°** (no hairpins or backtracking spikes), detour ratio 1.001–1.068 (drawn
length vs straight line — every road is a nearly-direct route, none wanders).

The ford is coherent: `river.ford.at = [86,118]` is a **river vertex**, is Millcross's own `at`, and
is the shared endpoint of **3** roads (`trade-road-trunk`, `river-road-south`, `terrace-track`).
**0** road segment properly crosses the river anywhere — no road fords the water off-ford.

**Observation 1 — three roads name a non-place in `from`/`to`.** `east-rim-track.to =
"coastal-spur"` (a road id), `terrace-track-north.to = "northern-icefield"` (a zone id),
`cindervast-approach.from = "ashvale-front"` (a zone id). Each carries a `note` explaining the
join, so this reads as deliberate — but a consumer resolving road endpoints to town coordinates
must handle three id namespaces, not one.

**Observation 2 — two roads are *longer* than their `roadKm`.** `distances.drawnRoadsAreCentrelines`
states the drawn centre-line "runs 0–15% short of `roads[].roadKm`". Six roads honour that
(0.3%–14.9% short); `flat-crossing` is **4.6% long** and `terrace-track` is **1.3% long**. The
declared band is narrowly wrong, not the geometry.

Separately, `cindervast-approach` ends **6.00 km** from Cindervast's `at` — but only **2.81 km**
from `towns[cindervast].wallsOnly.gateAt`, i.e. it stops outside the gate of a ruin. Consistent with
A1 §7.1 ("not maintained"), not a defect.

```
node -e '
const g = require("./content/maps/cluster1-geography.json");
const P = {}; for (const t of g.towns) P[t.id] = t.at; for (const c of g.camps) P[c.id] = c.at;
const len = p => p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const X = (a, b, c, d) => { const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)); };
const R = g.river.points; let dup = 0, oob = 0, cross = 0;
for (const r of g.roads) {
  const s = r.points[0], e = r.points[r.points.length - 1];
  const dA = P[r.from] ? Math.hypot(s[0] - P[r.from][0], s[1] - P[r.from][1]) : null;
  const dB = P[r.to] ? Math.hypot(e[0] - P[r.to][0], e[1] - P[r.to][1]) : null;
  let sharp = 180;
  for (let i = 1; i < r.points.length - 1; i++) {
    const u = [r.points[i][0] - r.points[i - 1][0], r.points[i][1] - r.points[i - 1][1]];
    const v = [r.points[i + 1][0] - r.points[i][0], r.points[i + 1][1] - r.points[i][1]];
    sharp = Math.min(sharp, 180 - Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI);
  }
  for (let i = 1; i < r.points.length; i++) if (r.points[i][0] === r.points[i - 1][0] && r.points[i][1] === r.points[i - 1][1]) dup++;
  for (const p of r.points) if (p[0] < 0 || p[0] > 150 || p[1] < 0 || p[1] > 190) oob++;
  for (let i = 0; i < r.points.length - 1; i++) for (let j = 0; j < R.length - 1; j++) if (X(r.points[i], r.points[i + 1], R[j], R[j + 1])) cross++;
  const d = len(r.points);
  console.log(r.id.padEnd(22), "endGapFrom=" + (dA === null ? "n/a(" + r.from + ")" : dA.toFixed(2)),
    "endGapTo=" + (dB === null ? "n/a(" + r.to + ")" : dB.toFixed(2)),
    "drawnKm=" + d.toFixed(1), "roadKm=" + r.roadKm,
    "shortBy=" + (r.roadKm == null ? "n/a" : (100 * (r.roadKm - d) / r.roadKm).toFixed(1) + "%"),
    "detour=" + (d / Math.hypot(e[0] - s[0], e[1] - s[1])).toFixed(3),
    "minInteriorAngle=" + sharp.toFixed(1));
}
console.log("TOTALS duplicateVertices=" + dup, "verticesOffSheet=" + oob, "properRoadXriverCrossings=" + cross);
const f = g.river.ford.at;
console.log("ford=" + JSON.stringify(f), "isRiverVertex=" + g.river.points.some(p => p[0] === f[0] && p[1] === f[1]),
  "roadsWithVertexOnFord=" + g.roads.filter(r => r.points.some(p => p[0] === f[0] && p[1] === f[1])).map(r => r.id).join("|"));
'
```

```
trade-road-trunk       endGapFrom=0.00 endGapTo=0.00 drawnKm=49.0 roadKm=55 shortBy=10.9% detour=1.013 minInteriorAngle=159.4
coastal-spur           endGapFrom=0.00 endGapTo=0.00 drawnKm=72.4 roadKm=85 shortBy=14.9% detour=1.017 minInteriorAngle=151.7
east-rim-track         endGapFrom=0.00 endGapTo=n/a(coastal-spur) drawnKm=42.9 roadKm=43 shortBy=0.3% detour=1.019 minInteriorAngle=149.0
flat-crossing          endGapFrom=0.00 endGapTo=0.00 drawnKm=31.4 roadKm=30 shortBy=-4.6% detour=1.046 minInteriorAngle=160.6
river-road-south       endGapFrom=0.00 endGapTo=0.00 drawnKm=59.8 roadKm=60 shortBy=0.3% detour=1.068 minInteriorAngle=156.6
terrace-track          endGapFrom=0.00 endGapTo=0.00 drawnKm=17.2 roadKm=17 shortBy=-1.3% detour=1.001 minInteriorAngle=175.0
terrace-track-north    endGapFrom=0.00 endGapTo=n/a(northern-icefield) drawnKm=71.5 roadKm=null shortBy=n/a detour=1.037 minInteriorAngle=160.9
cindervast-approach    endGapFrom=n/a(ashvale-front) endGapTo=6.00 drawnKm=73.7 roadKm=null shortBy=n/a detour=1.012 minInteriorAngle=166.3
TOTALS duplicateVertices=0 verticesOffSheet=0 properRoadXriverCrossings=0
ford=[86,118] isRiverVertex=true roadsWithVertexOnFord=trade-road-trunk|river-road-south|terrace-track
```

### 0.2 Criterion 2 — zone polygons tile — **PASS, all 6 overlaps accepted**

All 10 zone polygons are **simple and convex** (6–8 vertices each), so exact pairwise intersection
area is computed by Sutherland–Hodgman clipping. Sum of zone areas **12 335.5 km²**.

**Gaps: none.** A 0.5 km sampling grid over the whole sheet finds **11 113.3 km²** covered by
exactly one zone, **612.0 km²** by two or more, and **16 774.8 km²** uncovered — of which
**100%** is reachable from the sheet edge by flood fill, i.e. it is open sea and unzoned margin.
**Interior gaps: 0.0 km².** No hole is enclosed by zones. *Caveat of the method:* an unzoned notch
that touches the sheet edge is indistinguishable from open sea, so this proves no **enclosed** gap.

**Overlaps: 6 pairs, every one already accepted.** Nothing here is a new finding.

| Pair | Overlap | % of smaller zone | Status |
| --- | --- | --- | --- |
| `hollowmarch × ashvale-front` | 364.90 km² | 38.7% | **Intentional** — `ashvale-front` carries `gradient: true`; A1 §4.3 calls it a gradient, not a band |
| `emberdown × ashvale-front` | 169.56 km² | 17.4% | **Intentional** — same reason |
| `meltwash-terrace × hollowmarch` | 50.18 km² | 7.4% | **Explicitly accepted** (previously filed, not blocking) |
| `millcross-ford × rooktide-reach` | 19.32 km² | 2.9% | **Explicitly accepted** |
| `meltwash-terrace × thornveil` | 6.48 km² | 1.0% | **Explicitly accepted** |
| `meltwash-terrace × millcross-ford` | 3.69 km² | 0.6% | **Explicitly accepted** |

The four "explicitly accepted" rows reproduce the four already-filed figures exactly. They are
recorded here as accepted, **not** re-raised. F-040 decision D2 puts the town plan in its own local
coordinate space anchored to the geography `at` point, so region topology does not reach it.

```
node -e '
const g = require("./content/maps/cluster1-geography.json");
const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(a / 2); };
const clip = (s, c) => { let o = s;
  for (let i = 0; i < c.length && o.length; i++) {
    const A = c[i], B = c[(i + 1) % c.length], side = p => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    const inp = o; o = [];
    for (let j = 0; j < inp.length; j++) { const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
      if (sp >= 0) o.push(P);
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const t = sp / (sp - sq); o.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); } } }
  return o; };
const Z = g.zones;
for (const z of Z) { const p = z.polygon; let pos = 0, neg = 0;
  for (let i = 0; i < p.length; i++) { const c = (p[(i + 1) % p.length][0] - p[i][0]) * (p[(i + 2) % p.length][1] - p[i][1]) - (p[(i + 1) % p.length][1] - p[i][1]) * (p[(i + 2) % p.length][0] - p[i][0]); if (c > 0) pos++; else if (c < 0) neg++; }
  console.log("zone", z.id.padEnd(18), "vertices=" + p.length, "convex=" + (pos === 0 || neg === 0), "areaKm2=" + area(p).toFixed(1)); }
const out = [];
for (let i = 0; i < Z.length; i++) for (let j = i + 1; j < Z.length; j++) {
  const a = clip(Z[i].polygon, Z[j].polygon), ov = a.length > 2 ? area(a) : 0;
  if (ov > 1e-9) out.push([Z[i].id, Z[j].id, ov, 100 * ov / Math.min(area(Z[i].polygon), area(Z[j].polygon))]); }
out.sort((a, b) => b[3] - a[3]);
for (const o of out) console.log("OVERLAP", o[0], "x", o[1], "areaKm2=" + o[2].toFixed(2), "pctOfSmaller=" + o[3].toFixed(1) + "%");
console.log("overlappingPairs=" + out.length, "sumZoneAreaKm2=" + Z.reduce((s, z) => s + area(z.polygon), 0).toFixed(1));
const pip = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const S = 0.5, nx = 150 / S, ny = 190 / S, cov = new Int8Array(nx * ny);
for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) { const p = [(ix + 0.5) * S, (iy + 0.5) * S]; let n = 0; for (const z of Z) if (pip(p, z.polygon)) n++; cov[iy * nx + ix] = Math.min(n, 2); }
let c0 = 0, c1 = 0, c2 = 0; for (const v of cov) { if (v === 0) c0++; else if (v === 1) c1++; else c2++; }
const seen = new Uint8Array(nx * ny), st = [];
for (let ix = 0; ix < nx; ix++) st.push(ix, ix + (ny - 1) * nx);
for (let iy = 0; iy < ny; iy++) st.push(iy * nx, iy * nx + nx - 1);
while (st.length) { const k = st.pop(); if (seen[k] || cov[k] !== 0) continue; seen[k] = 1; const x = k % nx, y = (k - x) / nx;
  if (x > 0) st.push(k - 1); if (x < nx - 1) st.push(k + 1); if (y > 0) st.push(k - nx); if (y < ny - 1) st.push(k + nx); }
let outside = 0; for (let k = 0; k < cov.length; k++) if (cov[k] === 0 && seen[k]) outside++;
const A = S * S;
console.log("grid=" + S + "km  coveredByExactly1=" + (c1 * A).toFixed(1) + "km2", "coveredBy2plus=" + (c2 * A).toFixed(1) + "km2",
  "uncovered=" + (c0 * A).toFixed(1) + "km2", "ofWhichEdgeReachable=" + (outside * A).toFixed(1) + "km2",
  "INTERIOR_GAPS=" + ((c0 - outside) * A).toFixed(1) + "km2");
'
```

```
zone meltwash-terrace   vertices=7 convex=true areaKm2=676.0
zone millcross-ford     vertices=6 convex=true areaKm2=664.0
zone rooktide-reach     vertices=8 convex=true areaKm2=1240.0
zone thornveil          vertices=7 convex=true areaKm2=1662.0
zone emberdown          vertices=7 convex=true areaKm2=974.0
zone gildmark-head      vertices=6 convex=true areaKm2=898.0
zone hollowmarch        vertices=7 convex=true areaKm2=944.0
zone ashvale-front      vertices=8 convex=true areaKm2=1628.0
zone northern-icefield  vertices=8 convex=true areaKm2=2654.5
zone cindervast         vertices=7 convex=true areaKm2=995.0
OVERLAP hollowmarch x ashvale-front areaKm2=364.90 pctOfSmaller=38.7%
OVERLAP emberdown x ashvale-front areaKm2=169.56 pctOfSmaller=17.4%
OVERLAP meltwash-terrace x hollowmarch areaKm2=50.18 pctOfSmaller=7.4%
OVERLAP millcross-ford x rooktide-reach areaKm2=19.32 pctOfSmaller=2.9%
OVERLAP meltwash-terrace x thornveil areaKm2=6.48 pctOfSmaller=1.0%
OVERLAP meltwash-terrace x millcross-ford areaKm2=3.69 pctOfSmaller=0.6%
overlappingPairs=6 sumZoneAreaKm2=12335.5
grid=0.5km  coveredByExactly1=11113.3km2 coveredBy2plus=612.0km2 uncovered=16774.8km2 ofWhichEdgeReachable=16774.8km2 INTERIOR_GAPS=0.0km2
```

### 0.3 Criterion 3 — every town `at` lies inside its zone — **PASS, 7 of 7**

All **6 towns and 1 camp** resolve to a zone that exists, and every `at` is strictly inside that
zone's polygon by ray casting. The tightest is the expedition camp at **4.99 km** from the
`meltwash-terrace` edge; Millcross itself sits **10.41 km** inside `millcross-ford`. Nothing is
near enough to an edge to be sensitive to rounding — which matters for F-040, since
`anchor.geographyAt: [86, 118]` inherits Millcross's `at` verbatim.

```
node -e '
const g = require("./content/maps/cluster1-geography.json");
const pip = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const seg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy))); return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy)); };
const Z = Object.fromEntries(g.zones.map(z => [z.id, z.polygon]));
let bad = 0;
for (const e of [...g.towns.map(t => [t.id, t.at, t.zone, "town"]), ...g.camps.map(c => [c.id, c.at, c.zone, "camp"])]) {
  const poly = Z[e[2]];
  if (!poly) { bad++; console.log(e[3], e[0].padEnd(16), "zone=" + e[2], "NO SUCH ZONE"); continue; }
  const inside = pip(e[1], poly);
  let m = Infinity; for (let i = 0; i < poly.length; i++) m = Math.min(m, seg(e[1], poly[i], poly[(i + 1) % poly.length]));
  if (!inside) bad++;
  console.log(e[3], e[0].padEnd(16), "at=" + JSON.stringify(e[1]), "zone=" + e[2].padEnd(18), inside ? "INSIDE" : "OUTSIDE", "clearanceToEdgeKm=" + m.toFixed(2));
}
console.log("placesOutsideTheirZone=" + bad, "of", g.towns.length + g.camps.length);
'
```

```
town millcross        at=[86,118] zone=millcross-ford     INSIDE clearanceToEdgeKm=10.41
town gildmark         at=[11,157] zone=gildmark-head      INSIDE clearanceToEdgeKm=9.00
town embervale        at=[44,94] zone=emberdown          INSIDE clearanceToEdgeKm=10.75
town norhollow        at=[74,94] zone=hollowmarch        INSIDE clearanceToEdgeKm=9.45
town rooktide         at=[84,174] zone=rooktide-reach     INSIDE clearanceToEdgeKm=5.37
town cindervast       at=[46,12] zone=cindervast         INSIDE clearanceToEdgeKm=12.00
camp expedition-camp  at=[96,104] zone=meltwash-terrace   INSIDE clearanceToEdgeKm=4.99
placesOutsideTheirZone=0 of 7
```

### 0.4 Criterion 4 — coast and river do not self-intersect — **PASS**

Both polylines carry 20 points / 19 segments. Testing every **non-adjacent** segment pair for proper
crossing *and* for collinear touching: **0 intersections in the coastline, 0 in the river.** Neither
has a duplicate consecutive point. Minimum interior angle is **152.3°** (coast) and **111.6°**
(river) — no cusp tight enough to read as a drafting error.

```
node -e '
const g = require("./content/maps/cluster1-geography.json");
const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const on = (a, b, p) => Math.min(a[0], b[0]) - 1e-12 <= p[0] && p[0] <= Math.max(a[0], b[0]) + 1e-12 && Math.min(a[1], b[1]) - 1e-12 <= p[1] && p[1] <= Math.max(a[1], b[1]) + 1e-12;
const seg = (a, b, c, d) => { const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return "proper";
  if (d1 === 0 && on(c, d, a)) return "collinear-touch"; if (d2 === 0 && on(c, d, b)) return "collinear-touch";
  if (d3 === 0 && on(a, b, c)) return "collinear-touch"; if (d4 === 0 && on(a, b, d)) return "collinear-touch";
  return null; };
for (const [name, pts] of [["coastline", g.coastline.points], ["river", g.river.points]]) {
  const hits = [];
  for (let i = 0; i < pts.length - 1; i++) for (let j = i + 2; j < pts.length - 1; j++) { const r = seg(pts[i], pts[i + 1], pts[j], pts[j + 1]); if (r) hits.push("seg" + i + "xseg" + j + ":" + r); }
  let dup = 0, spike = 180;
  for (let i = 1; i < pts.length; i++) if (pts[i][0] === pts[i - 1][0] && pts[i][1] === pts[i - 1][1]) dup++;
  for (let i = 1; i < pts.length - 1; i++) { const u = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]], v = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
    spike = Math.min(spike, 180 - Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI); }
  console.log(name.padEnd(10), "points=" + pts.length, "segments=" + (pts.length - 1),
    "nonAdjacentIntersections=" + hits.length, hits.join(",") || "(none)",
    "duplicateConsecutivePoints=" + dup, "minInteriorAngle=" + spike.toFixed(1));
}
'
```

```
coastline  points=20 segments=19 nonAdjacentIntersections=0 (none) duplicateConsecutivePoints=0 minInteriorAngle=152.3
river      points=20 segments=19 nonAdjacentIntersections=0 (none) duplicateConsecutivePoints=0 minInteriorAngle=111.6
```

### 0.5 What this section did not do

Nothing above was written back to `content/maps/cluster1-geography.json`, and the two observations
in §0.1 were **not** repaired. The review was scoped to exactly the four criteria; road–road
junction topology, coast × river interaction, terrain patches, the relay, the sea lane and the
`distances` residuals were not examined.
