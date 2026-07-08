#!/usr/bin/env bash
# Assert the drift-sentinel fields/classes are present in the generated C#.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
R="$ROOT/generated/csharp/Runtime"
fail=0
check() { grep -q "$2" "$R/$1" || { echo "❌ $1 missing $2"; fail=1; }; }
check GameState.cs npcs
check GameState.cs zoneEffects
check WorldLife.cs teamId
check WorldLife.cs resistances
check WorldLife.cs battleStatuses
for c in NPC ZoneEffect BattleStatus; do [ -f "$R/$c.cs" ] || { echo "❌ $c.cs absent"; fail=1; }; done
[ $fail -eq 0 ] && echo "✅ smoke: sentinel fields present"
exit $fail
