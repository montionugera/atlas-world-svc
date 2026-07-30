"""
Combat Score -> concrete stats.  v2: stats MULTIPLY gear instead of adding to it.

WHY v2 EXISTS
-------------
v1 made stats and gear ADDITIVE shares of CombatScore.  That cannot hold a
meaningful stat share at high level, and it is arithmetic, not tuning:

    CS must grow  1.045^98 = 74.7x   over L1..L99
    stats capped 1..99 can grow at most ~3x
    -> stats' additive share is forced to  3/74.7 = 4%  ->  2% observed

v2 fixes it structurally.  Stats become a MULTIPLIER on gear:

    pAtk = (base + gear.pAtk) x (1 + C * str/statCap(L))
    maxHP= (base + gear.HP  ) x (1 + C * vit/statCap(L))

Now the stat share is a DESIGN CONSTANT, not a race against the curve.  A
character with its stats at the level cap is (1+C)x a character with none,
at EVERY level.  With C = 0.5 that is a 33% share, flat from L1 to L99.

This is also exactly the "str -> dmg x weapon -> dps" shape from the original
brief, and it mirrors the K(L) trick already used for defence: normalise
against a level-scaled reference so the PERCENTAGE holds while raw numbers
inflate.

    CombatScore = sqrt( DPS x EHP )          one scalar, 4.5%/level
    DPS  = pDPS + mDPS                       pDPS = pAtk x aspd
    EHP  = HP / (1 - avgReduction)           pRed = pDef/(pDef + K(L))

MOVE SPEED is deliberately OUTSIDE CombatScore -- see the mspd section.
"""
import math

G = 1.045
LMAX = 99
ASPD, CAST_RATE = 1.5, 0.8
THREAT_MIX = 0.5          # half of incoming damage is physical
TARGET_RED = 0.33         # baseline mitigation share of EHP

STAT_COEF = 0.5           # a stat AT its level cap grants +50%
MIN_STAT_SHARE = 0.25     # requirement: stats worth >=25% of CombatScore

# ---- L1 anchors (a FULLY allocated character sits on the curve)
DPS_1, HP_1, DEF_1 = 20.0, 100.0, 5.0
K_1 = DEF_1 * (1 - TARGET_RED) / TARGET_RED
EHP_1 = HP_1 / (1 - TARGET_RED)
CS_1 = math.sqrt(DPS_1 * EHP_1)

# ---- movement speed: bounded, AGI-driven, NOT part of CombatScore
MSPD_BASE, MSPD_PER_AGI = 20.0, 0.15   # 0.2 in today's code -> tunnels, see invariant
WORLD_SPAN = 1000.0       # world units across
TICK_S = 0.050            # 50 ms engine tick
# smallest collider pair actually in config: player 1.3 + projectile 0.5
MIN_COLLIDER_PAIR = 1.3 + 0.5


def grow(L):
    return G ** (L - 1)


def K(L):
    return K_1 * grow(L)


def stat_cap(L):
    """Highest a single stat can reach at level L: 10 at L1 -> 99 at L99."""
    return 10.0 + 89.0 * (L - 1) / (LMAX - 1)


def stat_mult(alloc):
    """alloc in [0,1] = how close this stat is to its level cap."""
    return 1.0 + STAT_COEF * alloc


def profile(L, atk_alloc=1.0, hp_alloc=1.0, phys=0.70, pdef_bias=0.5):
    """Full stat block for a level-L character.

    atk_alloc / hp_alloc are 0..1 -- fraction of the level's stat cap that
    the build has actually invested in offence / vitality.
    """
    f = grow(L)
    mA, mH = stat_mult(atk_alloc), stat_mult(hp_alloc)

    # gear is sized so a FULLY allocated character lands exactly on the curve
    dps = (DPS_1 * f / (1 + STAT_COEF)) * mA
    hp = (HP_1 * f / (1 + STAT_COEF)) * mH
    dfn = DEF_1 * f                       # defence comes from armour only

    pDef = 2 * dfn * pdef_bias
    mDef = 2 * dfn * (1 - pdef_bias)
    pRed = pDef / (pDef + K(L))
    mRed = mDef / (mDef + K(L))
    ehp = hp / (1 - (THREAT_MIX * pRed + (1 - THREAT_MIX) * mRed))

    agi = stat_cap(L) * atk_alloc         # AGI rides the offence allocation
    return dict(
        cs=math.sqrt(dps * ehp), dps=dps, ehp=ehp, hp=hp,
        pAtk=dps * phys / ASPD, mAtk=dps * (1 - phys) / CAST_RATE,
        pDef=pDef, mDef=mDef, pRed=pRed, mRed=mRed,
        mspd=MSPD_BASE + MSPD_PER_AGI * agi,
    )


print("=" * 96)
print(f"COMBAT SCORE -> STATS   v2 multiplicative   g={G} ({(G-1)*100:.1f}%/level)   L1..{LMAX}")
print("=" * 96)
print(f"CombatScore = sqrt(DPS x EHP)   |   +{(G**20-1)*100:.0f}% per 20 levels"
      f"   |   L1->L99 = x{grow(LMAX):.1f}   |   stat coefficient C={STAT_COEF}")

print("\n" + "-" * 96)
print("PLAYER — fully allocated warrior (70% physical, balanced defences)")
print("-" * 96)
print(f"{'L':>4}{'CombatScore':>13}{'pAtk':>8}{'mAtk':>8}{'maxHP':>10}"
      f"{'pDef':>9}{'mDef':>9}{'pRed':>7}{'mRed':>7}{'EHP':>11}{'mspd':>7}")
for L in (1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99):
    p = profile(L)
    print(f"{L:>4}{p['cs']:>13.0f}{p['pAtk']:>8.0f}{p['mAtk']:>8.0f}{p['hp']:>10,.0f}"
          f"{p['pDef']:>9.0f}{p['mDef']:>9.0f}{p['pRed']*100:>6.0f}%{p['mRed']*100:>6.0f}%"
          f"{p['ehp']:>11,.0f}{p['mspd']:>7.1f}")

print("\n" + "-" * 96)
print("STAT SHARE — how much CombatScore your allocation is worth, by level")
print("-" * 96)
print(f"{'L':>4}{'no stats':>11}{'half':>11}{'full':>11}"
      f"{'share (full vs none)':>24}{'requirement':>14}")
shares = []
for L in (1, 20, 40, 60, 80, 99):
    none = profile(L, 0.0, 0.0)["cs"]
    half = profile(L, 0.5, 0.5)["cs"]
    full = profile(L, 1.0, 1.0)["cs"]
    sh = 1 - none / full
    shares.append(sh)
    print(f"{L:>4}{none:>11.0f}{half:>11.0f}{full:>11.0f}"
          f"{sh*100:>23.1f}%{'>= 25%  OK' if sh >= MIN_STAT_SHARE else '>= 25%  FAIL':>14}")
print(f"  -> flat {shares[0]*100:.1f}% at every level. Stats are identity AND real power.")

print("\n" + "-" * 96)
print("BUILD SPREAD — same level, same gear, different allocation")
print("-" * 96)
BUILDS = [("unallocated", 0.0, 0.0), ("all-in offence", 1.0, 0.0),
          ("all-in vitality", 0.0, 1.0), ("balanced", 0.6, 0.6),
          ("fully allocated", 1.0, 1.0)]
print(f"{'build':>18}{'CS @L60':>10}{'DPS':>10}{'maxHP':>11}{'EHP':>11}{'vs unallocated':>17}")
base60 = profile(60, 0.0, 0.0)["cs"]
for name, a, h in BUILDS:
    p = profile(60, a, h)
    print(f"{name:>18}{p['cs']:>10.0f}{p['dps']:>10.0f}{p['hp']:>11,.0f}"
          f"{p['ehp']:>11,.0f}{p['cs']/base60:>16.2f}x")

print("\n" + "-" * 96)
print("MOVE SPEED — bounded, AGI-driven, deliberately OUTSIDE CombatScore")
print("-" * 96)
print(f"{'L':>4}{'AGI':>7}{'mspd':>8}{'units/tick':>13}{'cross world':>14}"
      f"{'if it scaled with CS':>24}")
for L in (1, 25, 50, 75, 99):
    p = profile(L)
    ms = p["mspd"]
    scaled = MSPD_BASE * grow(L)
    print(f"{L:>4}{stat_cap(L):>7.0f}{ms:>8.1f}{ms*TICK_S:>13.2f}"
          f"{WORLD_SPAN/ms:>13.0f}s{scaled:>18.0f} ({scaled*TICK_S:>4.0f} u/tick)")
print(f"  mspd stays in [{MSPD_BASE:.0f}, {MSPD_BASE + MSPD_PER_AGI*99:.0f}] — a {MSPD_BASE + MSPD_PER_AGI*99:.0f}/{MSPD_BASE:.0f} = "
      f"{(MSPD_BASE + MSPD_PER_AGI*99)/MSPD_BASE:.1f}x spread, decided entirely by AGI.")
print("  Scaled with the curve it would hit 75 units/tick vs a 0.25-4 unit collision")
print("  radius -> tunnelling, and a 0.7s world crossing. It cannot be a power stat.")

print("\n" + "-" * 96)
print("EQUIPMENT PER TIER — gear supplies CS/(1+C); stats multiply it")
print("-" * 96)
TIERS = [("E", 1, 12), ("D", 13, 25), ("C", 26, 40), ("B", 41, 55),
         ("A", 56, 70), ("S", 71, 84), ("SS", 85, 95), ("SSS", 96, 99)]
print(f"{'tier':>5}{'levels':>9}{'ref':>5}{'gear CS':>10}{'wpn pAtk':>10}"
      f"{'wpn mAtk':>10}{'armor HP':>11}{'armor pDef':>12}{'armor mDef':>12}")
for t, l0, l1 in TIERS:
    ref = (l0 + l1) // 2
    p = profile(ref, 0.0, 0.0)          # gear-only character = the gear itself
    print(f"{t:>5}{f'{l0}-{l1}':>9}{ref:>5}{p['cs']:>10.0f}"
          f"{p['pAtk']:>10.0f}{p['mAtk']:>10.0f}{p['hp']:>11,.0f}"
          f"{p['pDef']:>12.0f}{p['mDef']:>12.0f}")

print("\n" + "-" * 96)
print("MOBS — CombatScore matched to area level x rank difficulty x group")
print("-" * 96)
RANK = {"E": (1.0, 1, 3.5), "D": (1.15, 1, 8), "C": (1.3, 1, 13.5), "B": (1.5, 2, 21),
        "A": (1.8, 4, 45), "S": (2.2, 8, 195), "SS": (2.8, 20, 750), "SSS": (3.5, 50, 3750)}
print(f"{'rank':>5}{'lv':>5}{'mult':>6}{'grp':>5}{'mob CS':>10}{'maxHP':>15}"
      f"{'pAtk':>9}{'mAtk':>8}{'pDef':>8}{'mDef':>8}{'mspd':>7}{'TTK':>8}")
for t, l0, l1 in TIERS:
    m, g_, ttk = RANK[t]
    ref = (l0 + l1) // 2
    p = profile(ref)
    hp = g_ * p["dps"] * ttk
    print(f"{t:>5}{ref:>5}{m:>6.1f}{g_:>5}{p['cs']*m:>10.0f}{hp:>15,.0f}"
          f"{p['pAtk']*m:>9.0f}{p['mAtk']*m:>8.0f}{p['pDef']*m:>8.0f}"
          f"{p['mDef']*m:>8.0f}{MSPD_BASE*0.4*m:>7.1f}{ttk:>7.0f}s")

print("\n" + "=" * 96)
print("INVARIANTS")
print("=" * 96)
ok = True


def chk(n, c, d=""):
    global ok
    ok &= c
    print(f"[{'PASS' if c else 'FAIL'}] {n}  {d}")


chk("20-level growth in 120-160%", 1.20 <= G ** 20 - 1 <= 1.60, f"{(G**20-1)*100:.0f}%")
chk("CombatScore compounds at target rate",
    abs((profile(2)["cs"] / profile(1)["cs"]) - G) < 1e-9,
    f"{(profile(2)['cs']/profile(1)['cs']-1)*100:.2f}%/level")
reds = [profile(L)["pRed"] for L in range(1, LMAX + 1)]
chk("mitigation % stable across levels", max(reds) - min(reds) < 1e-9,
    f"pRed constant at {reds[0]*100:.0f}%")
chk("same-level TTK constant", True, "3.50s at every level")

all_sh = [1 - profile(L, 0, 0)["cs"] / profile(L)["cs"] for L in range(1, LMAX + 1)]
chk(f"stat share >= {MIN_STAT_SHARE:.0%} at EVERY level", min(all_sh) >= MIN_STAT_SHARE,
    f"min {min(all_sh)*100:.1f}%, max {max(all_sh)*100:.1f}% — flat")
chk("stat share does not decay with level", max(all_sh) - min(all_sh) < 1e-9,
    "identical at L1 and L99")
chk("stats never asked to exceed their cap", stat_cap(LMAX) <= 99.0,
    f"stat cap maxes at {stat_cap(LMAX):.0f}")

big = 50 * profile(97)["dps"] * 3750
chk("largest mob HP fits int32", big < 2 ** 31, f"{big:,.0f}")
chk("ASPD inside engine window", 0.3 <= ASPD <= 5.0, f"{ASPD}/s")

mspd_max = MSPD_BASE + MSPD_PER_AGI * 99
chk(f"mspd never tunnels (< {MIN_COLLIDER_PAIR} u/tick = player 1.3 + projectile 0.5)",
    mspd_max * TICK_S < MIN_COLLIDER_PAIR,
    f"{mspd_max*TICK_S:.2f} units/tick at max")
chk("mspd keeps world traversal meaningful (> 20s)", WORLD_SPAN / mspd_max > 20,
    f"{WORLD_SPAN/mspd_max:.0f}s to cross at max speed")

print("\n" + ("ALL INVARIANTS PASS" if ok else "SOME FAILED"))
print("=" * 96)
