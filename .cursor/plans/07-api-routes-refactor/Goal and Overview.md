# API Routes Refactor - 🚧 In Progress

## 🎯 Goal
Refactor `colyseus-server/src/api/routes.ts` into a modular, maintainable structure by splitting into smaller, focused modules.

## 📋 Overview

### Current State
- Single file: `routes.ts` (246 lines)
- Contains: room registry, serialization, route handlers, error handling
- Repetitive error handling code
- Hard to test individual components
- Growing complexity as more endpoints are added

### Target Structure
```
colyseus-server/src/api/
├── index.ts                 # Main router export
├── registry.ts              # Room registry management
├── serializers.ts           # Data serialization functions
├── middleware/
│   └── errorHandler.ts      # Error handling middleware
├── handlers/
│   ├── mobHandlers.ts       # Mob-related endpoints
│   ├── playerHandlers.ts   # Player-related endpoints
│   └── roomHandlers.ts     # Room-related endpoints (future)
└── types.ts                 # Shared TypeScript types
```

## 📋 Checklist

### Phase 1: Extract Core Utilities ⏳
- [ ] Create `api/registry.ts` - Move room registry functions
- [ ] Create `api/serializers.ts` - Move serialization functions
- [ ] Create `api/types.ts` - Define shared types/interfaces
- [ ] Update imports in `routes.ts`

### Phase 2: Extract Route Handlers ⏳
- [ ] Create `api/handlers/mobHandlers.ts` - Mob endpoints
- [ ] Create `api/handlers/playerHandlers.ts` - Player endpoints
- [ ] Extract common error handling patterns
- [ ] Update `routes.ts` to use handlers

### Phase 3: Add Middleware ⏳
- [ ] Create `api/middleware/errorHandler.ts` - Centralized error handling
- [ ] Create `api/middleware/roomValidator.ts` - Room validation middleware
- [ ] Apply middleware to routes

### Phase 4: Refactor Main Router ⏳
- [ ] Simplify `routes.ts` to just route registration
- [ ] Rename to `api/index.ts` for clarity
- [ ] Add route grouping/organization
- [ ] Update exports

### Phase 5: Testing & Documentation ⏳
- [ ] Add unit tests for handlers
- [ ] Add unit tests for serializers
- [ ] Update API documentation
- [ ] Verify all endpoints still work

## 🎯 Success Criteria
- [ ] Routes file reduced to <50 lines
- [ ] Each module has single responsibility
- [ ] No code duplication
- [ ] All tests pass
- [ ] API endpoints unchanged (backward compatible)
- [ ] Better testability and maintainability

## 📝 Implementation Notes

### Benefits
- **Maintainability**: Easier to find and modify specific endpoints
- **Testability**: Can test handlers, serializers, middleware independently
- **Scalability**: Easy to add new endpoints without bloating single file
- **Reusability**: Shared utilities can be reused across handlers

### Design Principles
- Single Responsibility Principle
- DRY (Don't Repeat Yourself)
- Separation of Concerns
- Dependency Injection for testability

