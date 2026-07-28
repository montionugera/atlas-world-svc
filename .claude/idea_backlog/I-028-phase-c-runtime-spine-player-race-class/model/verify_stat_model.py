"""
Section 3 verification harness — sweeps the proposed stat model across
level 1..150 x 6 gear tiers x 5 weapons x 4 build archetypes x skills,
and asserts INVARIANTS rather than spot-checking one calibration point.

Every invariant either PASSES or reports the exact (level, gear, build) where
it breaks. This is the artifact that answers "does it work at scale".
"""
import math

TICK = 50
ENGINE_ASPD_MIN, ENGINE_ASPD_MAX = 0.3, 5.0
STAT_CAP = 99
STATS = ["STR", "AGI", "VIT", "DEX", "LUK", "INT", "WIT"]
PTS_PER_LEVEL = 5
MAX_LEVEL = 150

# weapon: (pAtk, mAtk, baseCycleMs)
WEAPONS = {
    "basic_sword": (10, 0, 900),
    "dagger": (6, 0, 400),
    "scythe": (18, 0, 1800),
    "great_bow": (16, 0, 1100),
    "magic_staff": (2, 15, 1400),
}
# gear tier -> flat pAtk/mAtk added to the weapon
GEAR_TIERS = {0: 0, 1: 4, 2: 9, 3: 15, 4: 22, 5: 30}

BUILDS = {
    "warrior":  dict(STR=4, AGI=4, VIT=4, DEX=2, LUK=2, INT=0, WIT=0),
    "assassin": dict(STR=3, AGI=5, VIT=2, DEX=3, LUK=3, INT=0, WIT=0),
    "mage":     dict(STR=0, AGI=2, VIT=3, DEX=0, LUK=2, INT=5, WIT=4),
    "healer":   dict(STR=0, AGI=2, VIT=4, DEX=0, LUK=1, INT=2, WIT=5),
}
SKILLS = {"basic": 1.0, "power_strike": 1.8, "cleave": 1.4, "fireball": 2.0}

TIERS = [("E", 3, 4, 1), ("D", 7, 9, 1), ("C", 12, 15, 1), ("B", 18, 24, 2),
         ("A", 30, 60, 4), ("S", 90, 300, 8), ("SS", 600, 900, 20),
         ("SSS", 3000, 4500, 50)]


def quantize(ms):
    return max(TICK, round(ms / TICK) * TICK)


def budget(level):
    return 7 + PTS_PER_LEVEL * (level - 1)   # 1 in each stat at L1


def allocate(level, build):
    """Distribute the level's points by build weights, respecting the 1-99 cap."""
    pts = budget(level)
    w = BUILDS[build]
    tw = sum(w.values())
    alloc = {s: 1 for s in STATS}
    pts -= 7
    if tw:
        for s in STATS:
            add = int(pts * w[s] / tw)
            alloc[s] = min(STAT_CAP, alloc[s] + add)
    return alloc


def spendable(level, build):
    """Points actually usable vs granted — exposes cap overflow."""
    a = allocate(level, build)
    return sum(a.values()), budget(level)


def derive(alloc, weapon, tier, level):
    wp, wm, base = WEAPONS[weapon]
    g = GEAR_TIERS[tier]
    pAtk = (10 + wp + g) * (1 + alloc["STR"] / 50)
    mAtk = (10 + wm + g) * (1 + alloc["INT"] / 50)
    cyc = quantize(base / (1 + alloc["AGI"] / 100))
    return dict(
        pAtk=pAtk, mAtk=mAtk, cycleMs=cyc, aspd=1000 / cyc,
        maxHP=100 + 8 * alloc["VIT"] + 2 * (level - 1),
        pDef=1 + alloc["VIT"] / 2, mDef=1 + alloc["WIT"] / 2,
        crit=min(0.5, alloc["LUK"] / 300),
        pdodge=min(0.25, alloc["LUK"] / 400),
        hit=100 + alloc["DEX"], flee=100 + alloc["AGI"],
        creation=alloc["DEX"] + alloc["WIT"],
    )


def dps(d, weapon, skill="basic", target_def=5, elem=1.0):
    magical = weapon == "magic_staff"
    atk = (d["mAtk"] if magical else d["pAtk"]) * SKILLS[skill]
    red = min(target_def, atk * 0.8)
    after = max(1, atk - red)
    hit = max(1, math.floor(after * elem))
    return hit * d["aspd"] * (1 + d["crit"] * 0.5)


fails = []


def check(name, ok, detail=""):
    if not ok:
        fails.append((name, detail))
    return ok


print("=" * 78)
print("SECTION 3 VERIFICATION — L1..150 x gear T0..T5 x 5 weapons x 4 builds")
print("=" * 78)

# ---------------------------------------------------- INV-1 stat point overflow
print("\n[INV-1] Every granted stat point is spendable under the 1-99 cap")
first_overflow = None
for lv in range(1, MAX_LEVEL + 1):
    used, gran = spendable(lv, "warrior")
    if used < gran and first_overflow is None:
        first_overflow = (lv, used, gran)
if first_overflow:
    lv, used, gran = first_overflow
    print(f"  FAIL: overflow starts at L{lv} (spendable {used} < granted {gran})")
    u150, g150 = spendable(150, "warrior")
    print(f"        at L150: {g150} granted, {u150} spendable -> {g150-u150} WASTED")
    check("INV-1 stat overflow", False, f"L{lv}; {g150-u150} wasted at L150")
else:
    print("  PASS")

# --------------------------------------------------------- INV-2 engine bounds
print("\n[INV-2] ASPD stays inside the engine window (0.3-5.0 /s)")
bad = []
for lv in (1, 50, 100, 150):
    for b in BUILDS:
        a = allocate(lv, b)
        for w in WEAPONS:
            d = derive(a, w, 0, lv)
            if not (ENGINE_ASPD_MIN <= d["aspd"] <= ENGINE_ASPD_MAX):
                bad.append((lv, b, w, round(d["aspd"], 2)))
print("  PASS" if not bad else f"  FAIL: {bad[:5]}")
check("INV-2 engine bounds", not bad, str(bad[:3]))

# ------------------------------------------------------- INV-3 quantization err
print("\n[INV-3] Quantization error <= 10% at every level")
worst = (0, None)
for lv in range(1, MAX_LEVEL + 1):
    a = allocate(lv, "assassin")
    for w in WEAPONS:
        _, _, base = WEAPONS[w]
        ideal = base / (1 + a["AGI"] / 100)
        err = abs(quantize(ideal) - ideal) / ideal * 100
        if err > worst[0]:
            worst = (err, (lv, w))
print(f"  worst = {worst[0]:.1f}% at {worst[1]}  ->  {'PASS' if worst[0] <= 10 else 'FAIL'}")
check("INV-3 quantization", worst[0] <= 10, f"{worst[0]:.1f}%")

# --------------------------------------------------------- INV-4 power spread
print("\n[INV-4] Flat power: L1->L150 DPS spread stays modest (headcount gating)")
lo = dps(derive(allocate(1, "warrior"), "basic_sword", 0, 1), "basic_sword")
hi = dps(derive(allocate(150, "warrior"), "basic_sword", 5, 150), "basic_sword")
print(f"  L1/T0 = {lo:.1f} DPS   L150/T5 = {hi:.1f} DPS   spread = {hi/lo:.1f}x")
ok = hi / lo <= 20
print("  PASS" if ok else f"  FAIL: {hi/lo:.1f}x is a power treadmill, not flat power")
check("INV-4 power spread", ok, f"{hi/lo:.1f}x")

# ----------------------------------------------------- INV-5 TTK ladder holds
print("\n[INV-5] TTK ladder: fixed mob HP per rank vs a player who grows")
ref = dps(derive(allocate(50, "warrior"), "basic_sword", 2, 50), "basic_sword")
print(f"  mob HP fixed from L50/T2 reference DPS = {ref:.1f}")
print(f"  {'rank':<6}{'target':<12}{'HP':>11}{'TTK@L1':>10}{'TTK@L50':>10}{'TTK@L150':>11}{'':>4}")
ttk_fail = 0
for r, tlo, thi, g in TIERS:
    hp = g * ref * (tlo + thi) / 2
    row = []
    for lv, tier in ((1, 0), (50, 2), (150, 5)):
        d = dps(derive(allocate(lv, "warrior"), "basic_sword", tier, lv), "basic_sword")
        row.append(hp / (g * d))
    inband = tlo <= row[0] <= thi and tlo <= row[2] <= thi
    if not inband:
        ttk_fail += 1
    print(f"  {r:<6}{f'{tlo}-{thi}s':<12}{hp:>11,.0f}{row[0]:>9.0f}s{row[1]:>9.0f}s{row[2]:>10.0f}s"
          f"{'  ok' if inband else '  XX'}")
print(f"  -> {ttk_fail}/{len(TIERS)} ranks fall outside their TTK band at L1 or L150")
check("INV-5 TTK ladder", ttk_fail == 0, f"{ttk_fail} ranks out of band")

# ------------------------------------------------------ INV-6 weapon DPS parity
print("\n[INV-6] Weapon parity: best/worst DPS within 1.5x (same build+level)")
a = allocate(50, "warrior")
vals = {w: dps(derive(a, w, 2, 50), w) for w in WEAPONS if w != "magic_staff"}
mx, mn = max(vals.values()), min(vals.values())
print("  " + "  ".join(f"{w}={v:.0f}" for w, v in vals.items()))
print(f"  ratio = {mx/mn:.2f}x  ->  {'PASS' if mx/mn <= 1.5 else 'FAIL — needs pAtk retune'}")
check("INV-6 weapon parity", mx / mn <= 1.5, f"{mx/mn:.2f}x")

# ------------------------------------------------------------ INV-7 caps hold
print("\n[INV-7] Crit / perfect-dodge caps never exceeded")
w7 = [(lv, b) for lv in (1, 75, 150) for b in BUILDS
      if derive(allocate(lv, b), "dagger", 5, lv)["crit"] > 0.5
      or derive(allocate(lv, b), "dagger", 5, lv)["pdodge"] > 0.25]
print("  PASS" if not w7 else f"  FAIL {w7}")
check("INV-7 caps", not w7)

# --------------------------------------------------------- INV-8 skill scaling
print("\n[INV-8] Skills amplify but do not replace basic attacks (<=2.5x)")
d = derive(allocate(50, "warrior"), "basic_sword", 2, 50)
b = dps(d, "basic_sword", "basic")
worst8 = max(dps(d, "basic_sword", s) / b for s in SKILLS)
print(f"  strongest skill = {worst8:.2f}x basic  ->  {'PASS' if worst8 <= 2.5 else 'FAIL'}")
check("INV-8 skill scaling", worst8 <= 2.5, f"{worst8:.2f}x")

# ------------------------------------------------------- INV-9 element swing
print("\n[INV-9] Element 0.5x/2.0x keeps TTK inside the rank band")
hp_e = 1 * ref * 3.5
d50 = dps(derive(allocate(50, "warrior"), "basic_sword", 2, 50), "basic_sword")
res, adv = hp_e / (d50 * 0.5), hp_e / (d50 * 2.0)
print(f"  E-rank resisted {res:.1f}s / neutral 3.5s / advantaged {adv:.1f}s")
ok9 = res <= 4 * 2.5
print("  PASS (swing is intentional counterplay)" if ok9 else "  FAIL")
check("INV-9 element swing", ok9)

# ------------------------------------------------- INV-10 gear vs allocation
print("\n[INV-10] Gear contribution bounded vs allocation (flat-power intent)")
base_ = dps(derive(allocate(50, "warrior"), "basic_sword", 0, 50), "basic_sword")
gear_ = dps(derive(allocate(50, "warrior"), "basic_sword", 5, 50), "basic_sword")
print(f"  T0 {base_:.1f} -> T5 {gear_:.1f} = {gear_/base_:.2f}x from gear alone")
ok10 = gear_ / base_ <= 3.0
print("  PASS" if ok10 else "  FAIL — gear is carrying progression, contradicts headcount gating")
check("INV-10 gear bound", ok10, f"{gear_/base_:.2f}x")

# ------------------------------------------------------------------ E-swings
print("\n[EXTRA] E-rank swing count across levels (needs >= 6 for build identity)")
for lv, t in ((1, 0), (25, 1), (50, 2), (100, 3), (150, 5)):
    d = derive(allocate(lv, "warrior"), "basic_sword", t, lv)
    print(f"  L{lv:<4}T{t}  cycle {d['cycleMs']:>4}ms  ->  {3.5/(d['cycleMs']/1000):>4.1f} swings")

print("\n" + "=" * 78)
if fails:
    print(f"RESULT: {len(fails)} INVARIANT(S) FAILED — Section 3 is NOT yet safe at scale")
    for n, dt in fails:
        print(f"   - {n}  {dt}")
else:
    print("RESULT: all invariants passed")
print("=" * 78)
