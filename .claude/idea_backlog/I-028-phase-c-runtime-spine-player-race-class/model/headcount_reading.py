"""
The headcount table is ambiguous, and the two readings differ by ~10,000x.

HANDOFF says:  "Tier gating = headcount, not power. Group sizes 1/1/1/2/4/8/20/50 for E->SSS"

Reading A: n = number of MOBS in the encounter   (1 player vs n mobs)
Reading B: n = number of PLAYERS required        (n players vs the boss)

Focus-fire, closed form. R = player_EHP / damage_taken_to_clear.
Single mob:  R = (CS_p / CS_m)^2

Reading A -- you kill them one at a time, so incoming DPS decays:
    damage = d*e/D_p * (1 + 2 + ... + n) = d*e/D_p * n(n+1)/2
    R_A = R_single * 2/(n(n+1))          <- Lanchester square law, AGAINST you

Reading B -- n players focus the boss, n times the DPS and n times the HP pool:
    R_B = R_single * n^2                 <- Lanchester square law, FOR you
"""
RANK = {"E": (1.00, 1), "D": (1.15, 1), "C": (1.30, 2 - 1), "B": (1.50, 2),
        "A": (1.80, 4), "S": (2.20, 8), "SS": (2.80, 20), "SSS": (3.50, 50)}


def band(R):
    if R < 1.0: return "LOSS"
    if R < 1.3: return "brutal"
    if R < 2.0: return "HARD"
    if R < 3.5: return "fair"
    if R < 8.0: return "easy"
    return "trivial"


print("=" * 104)
print("A MAX-GRADE, FULLY-ALLOCATED PLAYER AT THE AREA'S LEVEL  (CS_p = reference = 1.0)")
print("=" * 104)
print(f"{'rank':>6}{'mult':>7}{'n':>5}"
      f"{'R single':>11}{'R (A) 1p vs n mobs':>21}{'verdict':>10}"
      f"{'R (B) n players':>18}{'verdict':>10}")
for r, (mult, n) in RANK.items():
    r_single = (1.0 / mult) ** 2
    r_a = r_single * 2 / (n * (n + 1))
    r_b = r_single * n ** 2
    print(f"{r:>6}{mult:>7.2f}{n:>5}{r_single:>11.3f}{r_a:>21.5f}{band(r_a):>10}"
          f"{r_b:>18.2f}{band(r_b):>10}")

print("\n  Reading A at SSS: R = 6.4e-05 -> you would need ~15,600x more power. Not content.")
print("  Reading B at SSS: R = 2,041   -> 50 players faceroll it. Also not content.")
print("  NEITHER works with the current multipliers. The reading decides which way to fix them.\n")

print("=" * 104)
print("WHAT EACH READING REQUIRES  (target: HARD win, R ~ 1.6, for a max-grade group)")
print("=" * 104)
print(f"{'rank':>6}{'n':>5}{'mult for reading A':>22}{'mult for reading B':>22}{'ratio':>12}")
import math
for r, (_, n) in RANK.items():
    # A: R = (1/m)^2 * 2/(n(n+1)) = 1.6  ->  m = sqrt(2/(1.6*n*(n+1)))
    m_a = math.sqrt(2 / (1.6 * n * (n + 1)))
    # B: R = (1/m)^2 * n^2 = 1.6         ->  m = n/sqrt(1.6)
    m_b = n / math.sqrt(1.6)
    print(f"{r:>6}{n:>5}{m_a:>22.3f}{m_b:>22.2f}{m_b/m_a:>12.0f}x")

print("\n  Reading A: mobs get individually WEAKER as rank rises (0.79 -> 0.02). Swarm design.")
print("  Reading B: bosses get individually STRONGER, roughly linear in party size. Raid design.")
