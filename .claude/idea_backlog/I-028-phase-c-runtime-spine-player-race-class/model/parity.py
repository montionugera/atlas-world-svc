"""
Physical vs Magic parity.

    Physical:  throughput = ASPD x pAtk                 unlimited in time
    Magic:     throughput = (MPcap / cost) x mAtk       BOUNDED by the pool

User's anchor:   P: 60 x 100 = 6000      M: 150/10 x 400 = 6000

The two sides are not the same KIND of quantity:
    physical  = a RATE          (damage per second, forever)
    magic     = a BUDGET        (damage per pool, then you are dry)

So they can only be equal over one specific window. Damage delivered by time T:

    P(T) = aspd * pAtk * T
    M(T) = (MPcap + regen*T)/cost * mAtk
         = [MPcap*mAtk/cost]  +  [regen*mAtk/cost] * T
           ^^^^^^^^^^^^^^^^      ^^^^^^^^^^^^^^^^
           B = burst budget      s = magic SUSTAIN dps

    crossover  T* = B / (aspd*pAtk - s)      <- physical overtakes here
"""
ASPD, PATK = 1.5, 100.0
MPCAP, COST, MATK = 150.0, 10.0, 400.0

p_dps = ASPD * PATK
casts_from_pool = MPCAP / COST
B = casts_from_pool * MATK

print("=" * 92)
print("1. THE ANCHOR — what window makes the two sides equal?")
print("=" * 92)
print(f"  physical: ASPD {ASPD} x pAtk {PATK:.0f} = {p_dps:.0f} dmg/s")
print(f"  magic   : MPcap {MPCAP:.0f} / cost {COST:.0f} = {casts_from_pool:.0f} casts"
      f" x mAtk {MATK:.0f} = {B:.0f} dmg from a full pool")
print(f"\n  {B:.0f} / {p_dps:.0f} = {B/p_dps:.0f}s  <- your '60 attacks' is a {B/p_dps:.0f}s window")
print(f"  ({ASPD} aspd x {B/p_dps:.0f}s = {ASPD*B/p_dps:.0f} attacks x {PATK:.0f} = {B:.0f}. Confirmed.)")
WINDOW = B / p_dps

print("\n" + "=" * 92)
print("2. THE REGEN TRAP — 'make sustain equal too' backfires")
print("=" * 92)
r_parity = COST * p_dps / MATK
print(f"  regen for magic SUSTAIN = physical dps:  {r_parity:.2f} MP/s"
      f"  (refills the pool in {MPCAP/r_parity:.0f}s)")
print(f"\n{'T':>8}{'physical':>12}{'magic':>12}{'M/P':>8}")
for T in (10, 20, 40, 80, 200):
    P = p_dps * T
    M = (MPCAP + r_parity * T) / COST * MATK
    print(f"{T:>7.0f}s{P:>12,.0f}{M:>12,.0f}{M/P:>8.2f}x")
print("  Magic is ahead by a FLAT +6,000 forever. Never overtaken, only approached.")
print("  => magic sustain MUST sit BELOW physical. The pool is what buys it back.")

print("\n" + "=" * 92)
print("3. THE REAL DESIGN TRIPLE: (physical dps, magic sustain, pool burst)")
print("=" * 92)
print("   pick a crossover T*, solve regen:   s = aspd*pAtk - B/T*   ,  regen = s*cost/mAtk\n")
RANKTTK = [("E", 3.5), ("D", 8), ("C", 14), ("B", 21), ("A", 45), ("S", 195)]
print(f"{'T* at rank':>12}{'T*':>8}{'magic sustain':>15}{'as % of phys':>14}{'regen MP/s':>12}"
      f"{'pool refill':>13}")
for rank, ttk in RANKTTK:
    s = p_dps - B / ttk
    if s <= 0:
        print(f"{rank:>12}{ttk:>7.0f}s{'impossible':>15}{'—':>14}{'—':>12}"
              f"{'pool alone already exceeds physical':>13}")
        continue
    regen = s * COST / MATK
    print(f"{rank:>12}{ttk:>7.0f}s{s:>15.0f}{s/p_dps*100:>13.0f}%{regen:>12.2f}"
          f"{MPCAP/regen:>12.0f}s")

print("\n" + "=" * 92)
print("4. WHO WINS WHAT, for a chosen crossover")
print("=" * 92)
for star in (14, 45):
    s = p_dps - B / star
    regen = s * COST / MATK
    print(f"\n  --- crossover T* = {star}s  (magic sustain {s/p_dps*100:.0f}% of physical,"
          f" regen {regen:.2f} MP/s) ---")
    print(f"{'rank':>7}{'TTK':>8}{'physical':>12}{'magic':>12}{'M/P':>8}{'favours':>10}")
    for rank, ttk in RANKTTK:
        P = p_dps * ttk
        M = (MPCAP + regen * ttk) / COST * MATK
        print(f"{rank:>7}{ttk:>7.0f}s{P:>12,.0f}{M:>12,.0f}{M/P:>8.2f}x"
              f"{('magic' if M > P else 'physical'):>10}")
