"""
Outcome matrix: player build x mob rank, same level.

Win metric:
    TTK_kill  = mob_EHP    / player_DPS
    TTK_death = player_EHP / mob_DPS
    R = TTK_death / TTK_kill = (CS_p / CS_m)^2       <- CS is the sufficient statistic
    HP left at victory = 1 - 1/R

Groups use a time-stepped focus-fire sim, NOT the closed form: you kill mobs one at
a time, so incoming DPS decays. Closed form would overstate the group's threat.
"""
import math

G, LMAX = 1.045, 99
STAT_COEF = 0.5
THREAT_MIX, TARGET_RED = 0.5, 0.33
DPS_1, HP_1, DEF_1 = 20.0, 100.0, 5.0
K_1 = DEF_1 * (1 - TARGET_RED) / TARGET_RED

grow = lambda L: G ** (L - 1)
K = lambda L: K_1 * grow(L)
stat_cap = lambda L: 10.0 + 89.0 * (L - 1) / (LMAX - 1)


def profile(L, atk_alloc=1.0, hp_alloc=1.0, gear_scale=1.0):
    f = grow(L)
    dps = (DPS_1 * f / (1 + STAT_COEF)) * (1 + STAT_COEF * atk_alloc) * gear_scale
    hp = (HP_1 * f / (1 + STAT_COEF)) * (1 + STAT_COEF * hp_alloc) * gear_scale
    dfn = DEF_1 * f * gear_scale
    red = dfn / (dfn + K(L))
    ehp = hp / (1 - red)
    return dict(dps=dps, ehp=ehp, cs=math.sqrt(dps * ehp))


# ---- rank table as currently modelled (cs_decomposition.py RANK)
RANK = {"E": (1.0, 1), "D": (1.15, 1), "C": (1.3, 1), "B": (1.5, 2),
        "A": (1.8, 4), "S": (2.2, 8), "SS": (2.8, 20), "SSS": (3.5, 50)}

# ---- "jobs" — NOTE: real jobs do not exist yet (open question in the handoff).
# These are ALLOCATION ARCHETYPES standing in for them: (atk_alloc, hp_alloc).
JOBS = {
    "berserker  (all atk)": (1.0, 0.0),
    "warrior    (balanced)": (0.7, 0.7),
    "paladin    (all vit)": (0.0, 1.0),
    "mage       (atk-lean)": (0.9, 0.3),
    "ranger     (atk-lean)": (0.85, 0.45),
    "fully-alloc(cap all)": (1.0, 1.0),
}

# ---- player grades: how good is this player, as a fraction of best-in-slot
GRADES = {"max": 1.00, "median": 0.85, "min": 0.70}   # gear_scale


def classify(R):
    if R < 1.0: return "LOSS"
    if R < 1.3: return "brutal"
    if R < 2.0: return "HARD"
    if R < 3.5: return "fair"
    if R < 8.0: return "easy"
    return "trivial"


def duel_group(p_dps, p_ehp, m_dps, m_ehp, n):
    """Time-stepped focus fire. Returns R = (time to die) / (time to clear)."""
    t_clear, alive, dmg_taken = 0.0, n, 0.0
    for _ in range(n):
        t_kill = m_ehp / p_dps          # time to drop the next mob
        dmg_taken += alive * m_dps * t_kill
        t_clear += t_kill
        alive -= 1
    if dmg_taken <= 0: return float("inf")
    t_death = t_clear * (p_ehp / dmg_taken)   # scale to when player HP would run out
    return t_death / t_clear


def run(L):
    ref = profile(L)                     # fully-allocated, best gear = the curve
    print(f"\n{'='*104}\nLEVEL {L}   (reference CS {ref['cs']:.0f})   "
          f"cell = R  /  HP% left  /  verdict\n{'='*104}")
    ranks = ["E", "D", "C", "B", "A", "S"]
    for grade, gs in GRADES.items():
        print(f"\n--- player grade: {grade}  (gear x{gs:.2f}) ---")
        print(f"{'job':<24}" + "".join(f"{r:>16}" for r in ranks))
        for jname, (a, h) in JOBS.items():
            p = profile(L, a, h, gear_scale=gs)
            row = f"{jname:<24}"
            for r in ranks:
                mult, n = RANK[r]
                m_cs = ref["cs"] * mult
                # mob keeps the reference dps/ehp split, scaled to its CS, split over the group
                m_dps = ref["dps"] * mult / n
                m_ehp = ref["ehp"] * mult / n
                R = duel_group(p["dps"], p["ehp"], m_dps, m_ehp, n)
                hp = (1 - 1 / R) * 100 if R > 1 else 0
                row += f"{R:>6.2f}{hp:>4.0f}%{classify(R):>7}"
            print(row)


for L in (20, 60, 99):
    run(L)

# ---- check the stated requirements
print("\n" + "=" * 104)
print("REQUIREMENTS STATED BY THE USER")
print("=" * 104)
L = 60
ref = profile(L)


def R_vs(rank, atk, hp, gs):
    mult, n = RANK[rank]
    p = profile(L, atk, hp, gear_scale=gs)
    return duel_group(p["dps"], p["ehp"], ref["dps"] * mult / n, ref["ehp"] * mult / n, n)


reqs = [
    ("max player CANNOT 1v1 same-level S", R_vs("S", 1.0, 1.0, 1.00), lambda r: r < 1.0),
    ("max player cannot EASILY win vs A", R_vs("A", 1.0, 1.0, 1.00), lambda r: r < 3.5),
    ("median player CAN win vs C (fair)", R_vs("C", 0.7, 0.7, 0.85), lambda r: 2.0 <= r < 3.5),
    ("max player wins C easily", R_vs("C", 1.0, 1.0, 1.00), lambda r: 3.5 <= r < 8.0),
]
allok = True
for name, R, test in reqs:
    good = test(R)
    allok &= good
    print(f"[{'PASS' if good else 'FAIL'}] {name:<40} R={R:6.2f}  ({classify(R)})")
print("\n" + ("ALL REQUIREMENTS MET" if allok else "REQUIREMENTS NOT MET — rank multipliers disagree with the win bands"))

# ---- solve for multipliers that DO satisfy the bands
print("\n" + "=" * 104)
print("SOLVED RANK MULTIPLIERS (single mob, R = (q/mult)^2 -> mult = q/sqrt(R))")
print("=" * 104)
TARGET = {"E": ("trivial", 10.0), "D": ("easy", 5.0), "C": ("fair", 2.6),
          "B": ("fair-hard", 1.8), "A": ("HARD", 1.45), "S": ("LOSS", 0.85)}
print(f"{'rank':>6}{'intent':>12}{'target R (median player)':>26}{'implied mult':>15}{'current':>10}")
for r, (intent, Rt) in TARGET.items():
    q = 0.85 * (1 + STAT_COEF * 0.7) / (1 + STAT_COEF)   # median player quality vs reference
    mult = q / math.sqrt(Rt)
    print(f"{r:>6}{intent:>12}{Rt:>26.2f}{mult:>15.2f}{RANK[r][0]:>10.2f}")
