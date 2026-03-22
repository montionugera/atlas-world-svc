---
name: typescript
description: >-
  TypeScript conventions, patterns, and rules specific to the atlas-world-svc repo (Colyseus server + React client).
  Use automatically whenever writing or editing any .ts or .tsx file in this project.
---

# TypeScript — atlas-world-svc

## Project Structure

| Side | Path | Notes |
|---|---|---|
| Server | `colyseus-server/src/` | Node, CommonJS, TS 5.3, `experimentalDecorators` on |
| Client | `react-client/src/` | React 19, ESNext modules, TS 4.9 |
| Shared | pnpm workspaces | No shared `@/` aliases — use relative imports |

---

## Types & Interfaces

**Server — co-locate with domain:**
- Domain types → `src/<domain>/types.ts`
- Pure interface files → `src/<domain>/interfaces/IFoo.ts` (rare; only for polymorphic contracts like `IAgent`)
- Inline event payload interfaces inside the class that emits them (see `EventBus.ts`)

**Client — centralize shared types:**
- Game-state types → `src/types/game.ts` (`Player`, `Mob`, `GameState`, etc.)
- Component-local types → `<ComponentDir>/types.ts` alongside the component

**Naming rules:**
```
PascalCase interfaces/types     AttackDefinition, MobTypeConfig
PascalCase enums                RoomEventType
SCREAMING_SNAKE_CASE values     RoomEventType.PLAYER_JOINED
No I-prefix except IAgent       ✅ AttackStrategy  ❌ IAttackStrategy (unless existing)
as const on config objects      PLAYER_STATS as const
```

---

## Colyseus Schema (server only)

Every network-synced property **must** use `@type()` decorators:

```typescript
import { Schema, type } from '@colyseus/schema'

export class Player extends Schema {
  @type('number') x: number = 0
  @type('number') y: number = 0
  @type('string') id: string = ''
}
```

- Extend `Schema` for all state classes.
- Do NOT use `@type()` on non-synced internal properties.
- Use `MapSchema<T>` / `ArraySchema<T>` for collections.

---

## Error Handling

Use the existing centralized pattern — **no Result/Either types**:

```typescript
// Route handlers
try {
  // ...
} catch (error) {
  handleError(error, req, res)   // server: api/middleware/errorHandler.ts
}

// Guard: always narrow before accessing .message
const msg = error instanceof Error ? error.message : 'Unknown error'

// Hard precondition failures
throw new Error('Physics body not found for entity: ' + id)

// Non-critical / simulation loop
catch (error) { console.error('❌ SIMULATION ERROR:', error) }
```

**Client:** re-throw from `connect`/`joinRoom`; `console.error` for non-critical paths.

---

## Imports

```typescript
// ✅ Correct — relative imports, no aliases
import { AttackStrategy } from '../interfaces/IAgent'
import { PLAYER_STATS } from '../../config/playerConfig'

// ❌ Avoid
import { foo } from '@/config/foo'   // no path aliases in this repo
```

- **Server**: no semicolons at end of lines (match existing style)
- **Client**: semicolons used (React convention)
- Group imports: external libs → internal types → internal utils/hooks

Barrel files (`index.ts`) exist in `src/config/mobs/` — re-export via `export * from './types'`.

---

## Key Patterns

### Singleton (server)
```typescript
class EventBus {
  private static instance: EventBus
  static getInstance(): EventBus { ... }
  static reset(): void { ... }  // test isolation
}
```

### Abstract base with generics (server)
```typescript
abstract class BaseCombatSystem<T extends WorldLife> {
  abstract process(entity: T): void
}
```

### Strategy via interface (server)
```typescript
interface AttackStrategy {
  execute(attacker: WorldLife, target: WorldLife): void
}
// Mobs carry: attackStrategies: AttackStrategy[]
```

### Custom hook (client)
```typescript
interface UseColyseusClientReturn { connect: () => void; ... }

export function useColyseusClient(): UseColyseusClientReturn {
  const clientRef = useRef<Client | null>(null)
  const connect = useCallback(() => { ... }, [])
  return { connect }
}
```

### Avoiding circular imports (server)
Use `require()` inside methods, not at the top level:
```typescript
getAttackImpulse(): number {
  const { calcImpulse } = require('../utils/combat')
  return calcImpulse(this)
}
```

---

## Strict Mode Checklist

Both `tsconfig.json` files have `strict: true`. Always:

- [ ] No implicit `any` — explicitly type all parameters and return values
- [ ] Null-check before access — use optional chaining `?.` or explicit guards
- [ ] `noFallthroughCasesInSwitch` (client) — every `case` must `break` or `return`
- [ ] `error instanceof Error` guard before accessing `.message`
- [ ] No `window as any` except for intentional debug escape hatches

---

## Debug Flags Pattern (client)

```typescript
const ENABLE_STATE_DEBUG_LOG = false  // flip to true locally, never commit as true
if (ENABLE_STATE_DEBUG_LOG) console.log('[state]', state)
```

Never leave debug logs on by default in committed code.
