// Plan D — the relation layer: the n-ary claims the prose makes, turned into
// arithmetic over the resolved world.
//
// WHY THIS EXISTS. Slot addresses and role ranks are UNARY — they name one
// place. Every load-bearing coherence claim in the authored prose is N-ARY:
// 194 network-topology tokens, 185 superlative/uniqueness, 32 bearings, 11
// distances, 7 co-locations, 6 betweenness claims across the 8 story files.
// A record can rebind perfectly and still make its own prose false. This
// module is what notices.
//
// NEVER THROWS. Every failure is `{ ok: false, message }`, in-band, exactly
// like scripts/lib/spine.mjs's gate helpers — an uncaught throw inside
// check_content.mjs skips finish() and silently drops every FAIL recorded
// before it.
//
// NEVER WRITES A COMMITTED BYTE. Math.atan2 is used here and nowhere the
// generator can reach; relations.test.mjs pins that invariant.

export const RELATION_KINDS = Object.freeze([
  "bearing", "betweenness", "distance", "adjacency",
  "connected_by_road", "not_connected_by_road", "colocated_with", "unique_in_scope",
]);

// 16-point names so a 22.5-degree miss reads as a miss, not as a rounding.
const ROSE = Object.freeze([
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]);
export const COMPASS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const DIR_DEG = Object.freeze({ N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 });

// x increases EAST, y increases SOUTH. North is SMALLER y, so the northward
// component is -dy and atan2's first argument is dx.
export function bearingDeg({ from, to }) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function compassOf({ deg }) {
  const i = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return ROSE[i];
}

export function angDiff({ a, b }) {
  return ((a - b + 540) % 360) - 180;
}

// Math.hypot is BANNED repo-wide (determinism); sqrt of the sum is not.
const dist = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
};
const round2 = (v) => Math.round(v * 100) / 100;

// One id namespace across every resolved family. Zones answer with labelAt
// because a region's "position" for a bearing claim is where its name sits.
export function pointOf({ resolved, id }) {
  for (const t of resolved.towns ?? []) if (t.id === id) return t.at;
  for (const l of resolved.landmarks ?? []) if (l.id === id) return l.at;
  for (const d of resolved.dungeons ?? []) if (d.at) { if (d.id === id) return d.at; }
  for (const c of resolved.camps ?? []) if (c.id === id) return c.at;
  for (const z of resolved.zones ?? []) if (z.id === id) return z.labelAt;
  return null;
}

function recordOf({ resolved, id }) {
  for (const key of ["towns", "landmarks", "dungeons", "camps", "zones"])
    for (const r of resolved[key] ?? []) if (r.id === id) return r;
  return null;
}

export function roadGraph({ resolved }) {
  const g = new Map();
  const link = (a, b) => {
    if (!g.has(a)) g.set(a, new Set());
    g.get(a).add(b);
  };
  for (const r of resolved.roads ?? []) {
    link(r.from, r.to);
    link(r.to, r.from);
  }
  return g;
}

function connected({ resolved, a, b }) {
  const g = roadGraph({ resolved });
  if (!g.has(a)) return false;
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === b) return true;
    for (const next of g.get(cur) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return false;
}

// `road:<id>` names a road, not a place: the claim is membership, not reach.
function roadMembers({ resolved, roadId }) {
  const road = (resolved.roads ?? []).find((r) => r.id === roadId);
  if (!road) return null;
  return new Set([road.from, road.to, ...(road.throughRoute ? [road.throughRoute] : [])]);
}

function inScope({ record, scope, resolved }) {
  if (scope === "world") return true;
  if (scope.startsWith("continent:")) return resolved.continent === scope.slice("continent:".length);
  if (scope.startsWith("coast:")) return (record.coasts ?? []).includes(scope.slice("coast:".length));
  if (scope.startsWith("region:")) return record.region === scope.slice("region:".length);
  return false;
}

const miss = (got, message) => ({ ok: false, got, message });
const hit = (got) => ({ ok: true, got, message: null });

export function deriveRelation({ relation, resolved, fabric }) {
  const R = relation;
  if (!RELATION_KINDS.includes(R.rel))
    return miss(null, `unknown relation "${R.rel}" — the vocabulary is ${RELATION_KINDS.join(", ")}`);

  const need = (id) => {
    const p = pointOf({ resolved, id });
    return p ? { p } : { err: `"${id}" does not resolve in the resolved world` };
  };

  if (R.rel === "bearing") {
    const a = need(R.from), b = need(R.to);
    if (a.err || b.err) return miss(null, a.err ?? b.err);
    const deg = bearingDeg({ from: a.p, to: b.p });
    const rose = compassOf({ deg });
    const off = Math.abs(angDiff({ a: deg, b: DIR_DEG[R.dir] }));
    if (off <= R.toleranceDeg) return hit(rose);
    return miss(rose, `declared ${R.dir} +/-${R.toleranceDeg} deg, resolved ${rose} (${Math.round(deg)} deg)`);
  }

  if (R.rel === "distance") {
    const a = need(R.a), b = need(R.b);
    if (a.err || b.err) return miss(null, a.err ?? b.err);
    const km = round2(dist(a.p, b.p));
    const slack = (R.km * R.tolerancePct) / 100;
    if (Math.abs(km - R.km) <= slack) return hit(km);
    return miss(km, `declared ${R.km} km +/-${R.tolerancePct}%, resolved ${km.toFixed(2)} km`);
  }

  if (R.rel === "adjacency") {
    const regions = new Map();
    for (const f of Object.values(fabric ?? {}))
      for (const r of f.regions ?? []) regions.set(r.id, r);
    const ra = regions.get(R.a), rb = regions.get(R.b);
    if (!ra || !rb) return miss(null, `"${ra ? R.b : R.a}" is not a region in any fabric file`);
    const both = (ra.adjacent ?? []).includes(R.b) && (rb.adjacent ?? []).includes(R.a);
    if (both) return hit(true);
    return miss(false, `${R.a} and ${R.b} are not adjacent in the fabric (adjacency must hold in BOTH directions)`);
  }

  if (R.rel === "connected_by_road" || R.rel === "not_connected_by_road") {
    const want = R.rel === "connected_by_road";
    const roadOperand = [R.a, R.b].find((x) => typeof x === "string" && x.startsWith("road:"));
    let got;
    if (roadOperand) {
      const roadId = roadOperand.slice("road:".length);
      const members = roadMembers({ resolved, roadId });
      if (!members) return miss(null, `road "${roadId}" does not resolve in the resolved world`);
      const other = R.a === roadOperand ? R.b : R.a;
      got = members.has(other);
      if (got === want) return hit(got);
      return miss(got, got
        ? `${other} is on road "${roadId}" but the prose says it is not`
        : `${other} is not on road "${roadId}" but the prose says it is`);
    }
    got = connected({ resolved, a: R.a, b: R.b });
    if (got === want) return hit(got);
    return miss(got, got
      ? `${R.a} and ${R.b} ARE joined by road, but the prose says they are not`
      : `${R.a} and ${R.b} are NOT joined by road`);
  }

  if (R.rel === "betweenness") {
    const g = roadGraph({ resolved });
    const degree = (g.get(R.hub) ?? new Set()).size;
    if (degree >= R.minDegree) return hit(degree);
    return miss(degree, `${R.hub} has road degree ${degree}, needs >= ${R.minDegree}`);
  }

  if (R.rel === "colocated_with") {
    const a = need(R.subject), b = need(R.host);
    if (a.err || b.err) return miss(null, a.err ?? b.err);
    const km = round2(dist(a.p, b.p));
    const within = R.withinKm ?? 1.0;
    if (km <= within) return hit(km);
    return miss(km, `${R.subject} is ${km.toFixed(2)} km from ${R.host}, co-location allows ${within} km`);
  }

  // unique_in_scope — a GLOBAL NEGATIVE over everything in scope.
  const subject = recordOf({ resolved, id: R.subject });
  if (!subject) return miss(null, `"${R.subject}" does not resolve in the resolved world`);
  const holders = [];
  for (const key of ["towns", "landmarks", "dungeons"])
    for (const rec of resolved[key] ?? [])
      if ((rec.properties ?? []).includes(R.property) && inScope({ record: rec, scope: R.scope, resolved }))
        holders.push(rec.id);
  if (holders.length === 1 && holders[0] === R.subject) return hit(holders);
  if (!holders.includes(R.subject))
    return miss(holders, `${R.subject} does not hold "${R.property}" in scope ${R.scope} at all`);
  const rivals = holders.filter((h) => h !== R.subject).sort();
  return miss(holders, `"${R.property}" in scope ${R.scope} is also held by ${rivals.join(", ")}`);
}

const declaredOf = (R) => R.dir ?? R.km ?? R.minDegree ?? R.property ?? true;

export function checkRelations({ relations, resolved, fabric }) {
  const drifts = [];
  for (const R of relations ?? []) {
    const r = deriveRelation({ relation: R, resolved, fabric });
    if (r.ok) continue;
    drifts.push({ rel: R.rel, cite: R.cite, declared: declaredOf(R), resolved: r.got, message: r.message });
  }
  return { drifts };
}
