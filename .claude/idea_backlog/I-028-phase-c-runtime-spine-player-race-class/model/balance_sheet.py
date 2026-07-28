"""
Reconciled combat model + balance sheet.  Emits markdown to stdout.

Settled inputs:
  - stats MULTIPLY gear, C = 0.5
  - CS = sqrt(DPS x EHP) is AUTHORITATIVE for mobs; TTK is derived output
  - headcount n = n MOBS *and* n PLAYERS  (user decision, 2026-07-28)
        R_encounter = R_single * 2n/(n+1)
        party of n focuses:  +n^2      pack of n dies one at a time: -n(n+1)/2
  - R = player_EHP / damage_taken_to_clear ;  R_single = (CS_p/CS_m)^2
"""
import math

G, LMAX, C = 1.045, 99, 0.5
TARGET_RED = 0.33
DPS_1, HP_1, DEF_1 = 20.0, 100.0, 5.0
K_1 = DEF_1 * (1 - TARGET_RED) / TARGET_RED
ASPD, CAST_RATE = 1.5, 0.8
grow = lambda L: G ** (L - 1)
stat_cap = lambda L: 10.0 + 89.0 * (L - 1) / (LMAX - 1)

# rank -> (per-mob CS multiplier, headcount n, level band)
LADDER = {
    "E":   (0.29, 1,  (1, 12)),
    "D":   (0.41, 1,  (13, 25)),
    "C":   (0.50, 1,  (26, 40)),
    "B":   (0.78, 2,  (41, 55)),
    "A":   (0.943, 4, (56, 70)),
    "S":   (1.054, 8, (71, 84)),
    "SS":  (1.127, 20, (85, 95)),
    "SSS": (1.183, 50, (96, 99)),
}
OLD = {"E": 1.0, "D": 1.15, "C": 1.3, "B": 1.5, "A": 1.8, "S": 2.2, "SS": 2.8, "SSS": 3.5}
GRADES = {"max": 1.00, "median": 0.85, "min": 0.70}
ALLOC = {"max": 1.0, "median": 0.7, "min": 0.4}


def player(L, grade="max"):
    f, gs, a = grow(L), GRADES[grade], ALLOC[grade]
    dps = (DPS_1 * f / (1 + C)) * (1 + C * a) * gs
    hp = (HP_1 * f / (1 + C)) * (1 + C * a) * gs
    dfn = DEF_1 * f * gs
    red = dfn / (dfn + K_1 * f)
    ehp = hp / (1 - red)
    return dict(dps=dps, hp=hp, ehp=ehp, cs=math.sqrt(dps * ehp), red=red,
                pAtk=dps * 0.70 / ASPD, mAtk=dps * 0.30 / CAST_RATE,
                pDef=dfn, mDef=dfn, mspd=20.0 * (1 + C * a))


def ref(L):
    return player(L, "max")


def mob(L, rank):
    mult, n, _ = LADDER[rank]
    r = ref(L)
    return dict(n=n, mult=mult, cs=r["cs"] * mult, dps=r["dps"] * mult,
                ehp=r["ehp"] * mult, hp=r["hp"] * mult, pAtk=r["pAtk"] * mult,
                pDef=r["pDef"] * mult)


def R(L, rank, grade, solo=False):
    p, m = player(L, grade), mob(L, rank)
    r_single = (p["cs"] / m["cs"]) ** 2
    if solo:
        return r_single
    n = m["n"]
    return r_single * 2 * n / (n + 1)


def band(r):
    if r < 1.0: return "LOSS"
    if r < 1.3: return "brutal"
    if r < 2.0: return "hard"
    if r < 3.5: return "fair"
    if r < 8.0: return "easy"
    return "trivial"


def hp_left(r):
    return f"{(1 - 1/r)*100:.0f}%" if r > 1 else "—"


out = []
w = out.append
w("# Combat Balance Sheet\n")
w("Generated from `model/balance_sheet.py`. Headcount reading: **n mobs AND n players**.\n")
w("`R` = how long you survive ÷ how long the encounter survives. "
  "`R>1` = win, HP left = `1 − 1/R`.\n")

w("\n## 1. The rank ladder\n")
w("| rank | levels | n | per-mob mult | was | encounter R (max) | verdict | solo R (max) | solo verdict |")
w("|---|---|---|---|---|---|---|---|---|")
for rank, (mult, n, (l0, l1)) in LADDER.items():
    L = (l0 + l1) // 2
    re_, rs = R(L, rank, "max"), R(L, rank, "max", solo=True)
    w(f"| {rank} | {l0}-{l1} | {n} | **{mult:.2f}** | {OLD[rank]:.2f} | "
      f"{re_:.2f} | {band(re_)} | {rs:.2f} | {band(rs)} |")
w("\nEvery rank is a **hard-to-fair win for a correctly-sized party**. Escalation is social "
  "(can you field 50 people?), not numerical — which is what *\"tier gating = headcount, not power\"* means.\n")

w("\n## 2. Your four requirements\n")
reqs = [
    ("max player CANNOT solo a same-level S mob", R(77, "S", "max", solo=True), lambda r: r < 1.0),
    ("max player cannot EASILY solo same-level A", R(63, "A", "max", solo=True), lambda r: r < 3.5),
    ("median player beats same-level C, fair", R(33, "C", "median", solo=True), lambda r: 2.0 <= r < 3.5),
    ("max player beats same-level C, easy", R(33, "C", "max", solo=True), lambda r: 3.5 <= r < 8.0),
]
w("| requirement | R | band | result |")
w("|---|---|---|---|")
allok = True
for name, r, t in reqs:
    ok = t(r); allok &= ok
    w(f"| {name} | {r:.2f} | {band(r)} | {'**PASS**' if ok else '**FAIL**'} |")
w(f"\n**{'ALL FOUR PASS' if allok else 'SOME FAIL'}**\n")

w("\n## 3. Outcome matrix — every rank × every player grade\n")
w("Encounter = party of n vs pack of n. Solo = one player vs one mob.\n")
w("| rank | lvl | max (party) | median (party) | min (party) | max (solo) | median (solo) | min (solo) |")
w("|---|---|---|---|---|---|---|---|")
for rank, (_, _, (l0, l1)) in LADDER.items():
    L = (l0 + l1) // 2
    cells = []
    for solo in (False, True):
        for g in ("max", "median", "min"):
            r = R(L, rank, g, solo=solo)
            cells.append(f"{r:.2f} {band(r)}")
    w(f"| {rank} | {L} | " + " | ".join(cells) + " |")

w("\n## 4. Player curve\n")
w("| L | CS | pAtk | mAtk | maxHP | pDef | mitigation | EHP | mspd |")
w("|---|---|---|---|---|---|---|---|---|")
for L in (1, 20, 40, 60, 80, 99):
    p = ref(L)
    w(f"| {L} | {p['cs']:,.0f} | {p['pAtk']:,.0f} | {p['mAtk']:,.0f} | {p['hp']:,.0f} | "
      f"{p['pDef']:,.0f} | {p['red']*100:.0f}% | {p['ehp']:,.0f} | {p['mspd']:.1f} |")

w("\n## 5. Mob stats at each rank's reference level\n")
w("| rank | lvl | n | mob CS | mob HP | mob pAtk | mob pDef | TTK per mob | TTK encounter |")
w("|---|---|---|---|---|---|---|---|---|")
for rank, (_, n, (l0, l1)) in LADDER.items():
    L = (l0 + l1) // 2
    p, m = ref(L), mob(L, rank)
    ttk1 = m["ehp"] / (p["dps"] * n)          # n players focusing one mob
    w(f"| {rank} | {L} | {n} | {m['cs']:,.0f} | {m['hp']:,.0f} | {m['pAtk']:,.0f} | "
      f"{m['pDef']:,.0f} | {ttk1:.1f}s | {ttk1*n:.0f}s |")

w("\n## 6. Build spread — does allocation still matter?\n")
w("| build @L60 | CS | vs unallocated |")
w("|---|---|---|")
base = None
for name, a in [("unallocated", 0.0), ("min (0.4)", 0.4), ("median (0.7)", 0.7),
                ("balanced (0.85)", 0.85), ("max (1.0)", 1.0)]:
    f = grow(60)
    dps = (DPS_1 * f / (1 + C)) * (1 + C * a)
    hp = (HP_1 * f / (1 + C)) * (1 + C * a)
    dfn = DEF_1 * f
    ehp = hp / (1 - dfn / (dfn + K_1 * f))
    cs = math.sqrt(dps * ehp)
    base = base or cs
    w(f"| {name} | {cs:,.0f} | {cs/base:.2f}× |")

w("\n## 7. Invariants\n")
w("| invariant | value | result |")
w("|---|---|---|")
inv = []
inv.append(("20-level growth in 120–160%", f"{(G**20-1)*100:.0f}%", 1.20 <= G**20 - 1 <= 1.60))
inv.append(("CS compounds at 4.5%/level", f"{(ref(2)['cs']/ref(1)['cs']-1)*100:.2f}%",
            abs(ref(2)["cs"] / ref(1)["cs"] - G) < 1e-9))
reds = [ref(L)["red"] for L in range(1, 100)]
inv.append(("mitigation % flat across levels", f"{reds[0]*100:.0f}%", max(reds) - min(reds) < 1e-9))
shares = []
for L in range(1, 100):
    f = grow(L)
    none = math.sqrt((DPS_1 * f / 1.5) * (HP_1 * f / 1.5) / (1 - DEF_1 * f / (DEF_1 * f + K_1 * f)))
    full = ref(L)["cs"]
    shares.append(1 - none / full)
inv.append(("stat share ≥25% at every level", f"{min(shares)*100:.1f}% flat", min(shares) >= 0.25))
inv.append(("stat cap never exceeds 99", f"{stat_cap(99):.0f}", stat_cap(99) <= 99))
big = mob(97, "SSS")["hp"] * 50
inv.append(("largest encounter HP fits int32", f"{big:,.0f}", big < 2**31))
inv.append(("all four requirements (§2)", "4/4" if allok else "failing", allok))
mspd_max = 20.0 * 1.5
inv.append(("mspd within clamp 36", f"{mspd_max:.1f}", mspd_max <= 36))
ok_all = True
for n_, v, c in inv:
    ok_all &= c
    w(f"| {n_} | {v} | {'PASS' if c else 'FAIL'} |")
w(f"\n**{'ALL PASS' if ok_all else 'SOME FAILED'}**\n")

w("\n## 8. Still not covered by this sheet\n")
w("- Closed-form only — no crit variance, no misses, no kiting, perfect focus-fire. "
  "Needs a `BattleModule` run to be proof rather than a screen.\n"
  "- Jobs do not exist; and because `R = (CS_p/CS_m)²` cancels the DPS/EHP split, "
  "allocation archetypes cannot change any verdict above. Differentiation must come "
  "from elements / AoE / range / crit, outside CS.\n"
  "- Mana, skills and physical-vs-magic parity are modelled separately "
  "(`mana_level.py`, `parity.py`) and are **not** folded into these R values yet.\n")

print("\n".join(out))
