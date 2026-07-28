"""
Reverse-engineered from the player-facing quantity: CASTS PER MINUTE ("mana level").

User's model:
    INT, WIT  -> higher MATK          (each cast hits harder)
              -> higher cost          (a stronger cast costs more)
              -> higher MP pool + regen

The key move is that COST RIDES YOUR OWN POWER. Write it out:

    MATK  = D0 * (1 + C*i)          cost = K0 * (1 + C*i)          <- cost tracks MATK
    MPmax = M0 * (1 + C*i)          regen = R0 * (1 + C*w)

    CPM = (MPmax + regen*60) / cost
        = M0/K0  +  (60*R0/K0) * (1 + C*w)/(1 + C*i)
          ^^^^^                   ^^^^^^^^^^^^^^^^^
          pool term:              regen term:
          INT CANCELS             depends on the WIT/INT RATIO

    DPM = CPM * MATK
        = (M0*D0/K0) * (1 + C*i)  +  (60*R0*D0/K0) * (1 + C*w)

=> Damage per minute is LINEAR AND SEPARABLE in INT and WIT. Each stat carries
   its full +50%, which is exactly what the previous anchors failed to do.
=> And since M0,K0,R0,D0 all ride grow(L), CPM is LEVEL-INVARIANT.
"""
import math

G, LMAX, C = 1.045, 99, 0.5
grow = lambda L: G ** (L - 1)

# L1 anchors for a stat-less caster
M0, K0, R0, D0 = 50.0, 10.0, 2.0, 40.0
COOLDOWN = 3.0                     # hard cap: 60/3 = 20 casts/min
WINDOW = 60.0                      # CPM measured over a 60s engagement from full mana


def caster(L, i=1.0, w=1.0):
    f = grow(L)
    matk = D0 * f * (1 + C * i)
    cost = K0 * f * (1 + C * i)
    mp = M0 * f * (1 + C * i)
    regen = R0 * f * (1 + C * w)
    cpm_mana = (mp + regen * WINDOW) / cost
    cpm = min(cpm_mana, WINDOW / COOLDOWN)
    return dict(matk=matk, cost=cost, mp=mp, regen=regen,
                cpm_mana=cpm_mana, cpm=cpm, dpm=cpm * matk,
                limit="cooldown" if WINDOW / COOLDOWN < cpm_mana else "mana")


print("=" * 100)
print("MANA LEVEL = casts per minute.  Anchors: pool 5 casts flat, regen 12 casts/min at neutral")
print("=" * 100)

print("\n--- 1. CPM is LEVEL-INVARIANT (the headline property) ---")
print(f"{'L':>5}{'MATK':>10}{'cost':>10}{'MP':>10}{'regen/s':>10}{'CPM':>8}{'DPM':>12}{'limit':>11}")
for L in (1, 20, 40, 60, 80, 99):
    c = caster(L)
    print(f"{L:>5}{c['matk']:>10.0f}{c['cost']:>10.0f}{c['mp']:>10.0f}{c['regen']:>10.1f}"
          f"{c['cpm']:>8.1f}{c['dpm']:>12,.0f}{c['limit']:>11}")
c1, c99 = caster(1), caster(99)
print(f"  CPM L1 {c1['cpm']:.2f} -> L99 {c99['cpm']:.2f}  (drift {abs(c99['cpm']/c1['cpm']-1)*100:.4f}%)")
print(f"  DPM grows x{c99['dpm']/c1['dpm']:.1f} = the {(G**98-1)*100:.0f}% curve. Casts stay constant, hits get bigger.")

print("\n--- 2. INT/WIT allocation grid @L60 (CPM / DPM / limiter) ---")
ALLOC = [0.0, 0.5, 1.0]
print(f"{'':>12}" + "".join(f"{f'WIT {w:.1f}':>22}" for w in ALLOC))
for i in ALLOC:
    row = f"{f'INT {i:.1f}':>12}"
    for w in ALLOC:
        c = caster(60, i, w)
        row += f"{c['cpm']:>8.1f}/{c['dpm']:>9,.0f}{'':>4}"
    print(row)
print("  read: more INT = fewer, bigger casts.  more WIT = more, same-size casts.")

print("\n--- 3. Archetypes @L60 ---")
ARCH = {"nuker    (INT max, WIT 0)": (1.0, 0.0),
        "channeler(INT 0, WIT max)": (0.0, 1.0),
        "balanced (both half)":      (0.5, 0.5),
        "fully allocated":           (1.0, 1.0),
        "no stats":                  (0.0, 0.0)}
print(f"{'archetype':<28}{'MATK':>9}{'cost':>8}{'CPM':>8}{'DPM':>11}{'vs no-stats':>13}{'limit':>10}")
base = caster(60, 0, 0)["dpm"]
for n, (i, w) in ARCH.items():
    c = caster(60, i, w)
    print(f"{n:<28}{c['matk']:>9.0f}{c['cost']:>8.0f}{c['cpm']:>8.1f}{c['dpm']:>11,.0f}"
          f"{c['dpm']/base:>12.2f}x{c['limit']:>10}")

print("\n--- 4. INVARIANTS ---")
ok = True
def chk(n, cond, d=""):
    global ok; ok &= cond
    print(f"[{'PASS' if cond else 'FAIL'}] {n}  {d}")

drift = max(abs(caster(L)['cpm'] / caster(1)['cpm'] - 1) for L in range(1, 100))
chk("CPM level-invariant", drift < 1e-9, f"max drift {drift:.2e}")

r = caster(2)["dpm"] / caster(1)["dpm"]
chk("DPM compounds at 4.5%/level", abs(r - G) < 1e-9, f"{(r-1)*100:.2f}%/level")

shares = []
for L in range(1, 100):
    none, full = caster(L, 0, 0)["dpm"], caster(L, 1, 1)["dpm"]
    shares.append(1 - none / full)
chk("mana-stat share >= 25% at every level", min(shares) >= 0.25,
    f"{min(shares)*100:.1f}% flat")

sep_i = caster(60, 1, 0)["dpm"] - caster(60, 0, 0)["dpm"]
sep_w = caster(60, 0, 1)["dpm"] - caster(60, 0, 0)["dpm"]
chk("BOTH INT and WIT move DPM materially", min(sep_i, sep_w) / base > 0.15,
    f"INT +{sep_i/base*100:.0f}%, WIT +{sep_w/base*100:.0f}%")

chk("CPM in a sane design band (8-30/min)", all(8 <= caster(60, i, w)["cpm"] <= 30
    for i in (0, .5, 1) for w in (0, .5, 1)),
    f"{min(caster(60,i,w)['cpm'] for i in (0,.5,1) for w in (0,.5,1)):.1f}"
    f"-{max(caster(60,i,w)['cpm'] for i in (0,.5,1) for w in (0,.5,1)):.1f}/min")

print("\n" + ("ALL PASS" if ok else "SOME FAILED"))
