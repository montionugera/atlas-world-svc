# API Routes Refactor Plan

## Current Structure Analysis

### File: `colyseus-server/src/api/routes.ts` (246 lines)

**Components:**
1. **Room Registry** (lines 12-29)
   - `roomRegistry` Map
   - `registerRoom()` function
   - `unregisterRoom()` function

2. **Serializers** (lines 31-57)
   - `serializeMobData()` function
   - `serializePlayerData()` function

3. **Route Handlers** (lines 65-238)
   - Mob routes (2 endpoints)
   - Player routes (2 endpoints)
   - Repetitive error handling pattern

4. **Router Setup** (lines 59-241)
   - `createApiRouter()` function
   - Route registration

## Refactoring Strategy

### Step 1: Extract Registry (`api/registry.ts`)
```typescript
// Room registry management
export const roomRegistry = new Map<string, GameRoom>()
export function registerRoom(room: GameRoom): void
export function unregisterRoom(roomId: string): void
export function getRoom(roomId: string): GameRoom | undefined
```

### Step 2: Extract Serializers (`api/serializers.ts`)
```typescript
// Data serialization utilities
export function serializeMobData(mob: Mob): any
export function serializePlayerData(player: Player): any
// Future: serializeProjectileData, serializeRoomData, etc.
```

### Step 3: Extract Handlers (`api/handlers/`)

#### `mobHandlers.ts`
```typescript
// Mob-related route handlers
export async function getMobs(req: Request, res: Response): Promise<void>
export async function getMobById(req: Request, res: Response): Promise<void>
```

#### `playerHandlers.ts`
```typescript
// Player-related route handlers
export async function getPlayers(req: Request, res: Response): Promise<void>
export async function getPlayerById(req: Request, res: Response): Promise<void>
```

### Step 4: Extract Middleware (`api/middleware/`)

#### `errorHandler.ts`
```typescript
// Centralized error handling
export function handleError(error: Error, req: Request, res: Response): void
```

#### `roomValidator.ts`
```typescript
// Room validation middleware
export function validateRoom(req: Request, res: Response, next: NextFunction): void
```

### Step 5: Refactor Main Router (`api/index.ts`)
```typescript
// Clean route registration
export function createApiRouter(gameServer: Server): Router {
  const router = Router()
  
  // Mob routes
  router.get('/rooms/:roomId/mobs', mobHandlers.getMobs)
  router.get('/rooms/:roomId/mobs/:mobId', mobHandlers.getMobById)
  
  // Player routes
  router.get('/rooms/:roomId/players', playerHandlers.getPlayers)
  router.get('/rooms/:roomId/players/:playerId', playerHandlers.getPlayerById)
  
  return router
}
```

## Migration Steps

### Phase 1: Extract Utilities (No Breaking Changes)
1. Create `api/registry.ts` - Move registry code
2. Create `api/serializers.ts` - Move serialization code
3. Update `routes.ts` imports
4. Test: All endpoints still work

### Phase 2: Extract Handlers (No Breaking Changes)
1. Create `api/handlers/mobHandlers.ts`
2. Create `api/handlers/playerHandlers.ts`
3. Update `routes.ts` to use handlers
4. Test: All endpoints still work

### Phase 3: Add Middleware (No Breaking Changes)
1. Create `api/middleware/errorHandler.ts`
2. Create `api/middleware/roomValidator.ts`
3. Apply middleware to routes
4. Test: All endpoints still work

### Phase 4: Cleanup (No Breaking Changes)
1. Rename `routes.ts` to `index.ts`
2. Simplify to route registration only
3. Update exports
4. Test: All endpoints still work

## File Size Targets

| File | Current | Target | Purpose |
|------|---------|--------|---------|
| `routes.ts` | 246 lines | <50 lines | Route registration only |
| `registry.ts` | - | ~30 lines | Room registry |
| `serializers.ts` | - | ~40 lines | Data serialization |
| `handlers/mobHandlers.ts` | - | ~60 lines | Mob endpoints |
| `handlers/playerHandlers.ts` | - | ~80 lines | Player endpoints |
| `middleware/errorHandler.ts` | - | ~30 lines | Error handling |
| `middleware/roomValidator.ts` | - | ~25 lines | Room validation |

## Testing Strategy

### Unit Tests
- `registry.test.ts` - Test room registration/unregistration
- `serializers.test.ts` - Test data serialization
- `handlers/mobHandlers.test.ts` - Test mob endpoints
- `handlers/playerHandlers.test.ts` - Test player endpoints
- `middleware/errorHandler.test.ts` - Test error handling

### Integration Tests
- `api.test.ts` - Test full API routes end-to-end
- Verify backward compatibility
- Verify error responses

## Benefits

1. **Maintainability**: Each file has single responsibility
2. **Testability**: Can test components independently
3. **Scalability**: Easy to add new endpoints
4. **Reusability**: Shared utilities across handlers
5. **Readability**: Smaller, focused files

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes | Incremental refactor, test after each step |
| Import issues | Update all imports, use barrel exports |
| Performance | No performance impact (same code, different structure) |

