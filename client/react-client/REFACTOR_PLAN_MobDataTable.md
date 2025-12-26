# MobDataTable Refactor Plan

## Current State
- **File**: `client/react-client/src/components/MobDataTable.tsx`
- **Lines**: 354
- **Issues**: 
  - Too many responsibilities in one component
  - Hard to test individual parts
  - Difficult to maintain and extend
  - Large render method with nested JSX

## Refactoring Goals
1. **Separation of Concerns**: Split into focused, single-responsibility modules
2. **Reusability**: Extract reusable hooks and components
3. **Testability**: Make each piece independently testable
4. **Maintainability**: Reduce cognitive load per file
5. **Performance**: Optimize re-renders with proper component splitting

## Proposed Structure

```
client/react-client/src/components/MobDataTable/
├── index.tsx                          # Main component (orchestrator)
├── MobDataTable.tsx                   # Main component (if keeping flat structure)
├── hooks/
│   ├── useMobMetadata.ts             # Metadata fetching logic
│   ├── useMobDataMerging.ts          # Data merging logic
│   └── useEffectiveRoomId.ts         # Room ID resolution
├── components/
│   ├── MobTableHeader.tsx            # Header with title, refresh button, badges
│   ├── MobTableRow.tsx               # Single mob row component
│   ├── MobTableBody.tsx              # Table body with rows
│   ├── MobDetailsPanel.tsx           # Selected mob details panel
│   ├── MobTableEmpty.tsx             # Empty state component
│   └── MobTableError.tsx             # Error display component
├── utils/
│   ├── mobDataConverter.ts           # mobFromGameState utility
│   └── mobDataMerger.ts              # Data merging utilities
└── types.ts                          # Shared types/interfaces
```

## Detailed Breakdown

### 1. Extract Custom Hooks

#### `hooks/useMobMetadata.ts` (~80 lines)
**Purpose**: Handle metadata fetching and state management
**Responsibilities**:
- Fetch metadata from REST API
- Track metadata map state
- Handle loading/error states
- Manage polling intervals
- Detect new mobs and fetch their metadata

**API**:
```typescript
interface UseMobMetadataReturn {
  mobsMetadata: Map<string, MobInstance>
  loading: boolean
  error: string | null
  fetchMobsMetadata: (mobIds?: string[]) => Promise<void>
  refreshMetadata: () => void
}
```

#### `hooks/useMobDataMerging.ts` (~50 lines)
**Purpose**: Merge gameState real-time data with metadata
**Responsibilities**:
- Combine gameState mobs with metadata
- Handle missing metadata gracefully
- Optimize re-renders with proper memoization

**API**:
```typescript
interface UseMobDataMergingReturn {
  mergedMobs: MobInstance[]
}
```

#### `hooks/useEffectiveRoomId.ts` (~20 lines)
**Purpose**: Resolve roomId from props, context, or gameState
**Responsibilities**:
- Determine effective roomId from multiple sources
- Provide fallback logic

**API**:
```typescript
interface UseEffectiveRoomIdReturn {
  effectiveRoomId: string | null
}
```

### 2. Extract Utility Functions

#### `utils/mobDataConverter.ts` (~50 lines)
**Purpose**: Convert gameState mobs to MobInstance format
**Exports**:
- `mobFromGameState(mob: any): MobInstance`
- `extractMobData(mob: any): any` (helper for Colyseus schema handling)

#### `utils/mobDataMerger.ts` (~40 lines)
**Purpose**: Merge metadata with real-time gameState data
**Exports**:
- `mergeMobData(metadata: MobInstance, gameMob: any): MobInstance`
- `createMergedMobs(gameStateMobs: Map, metadataMap: Map): MobInstance[]`

### 3. Extract Sub-Components

#### `components/MobTableHeader.tsx` (~40 lines)
**Purpose**: Display header with title, refresh button, and status badges
**Props**:
```typescript
interface MobTableHeaderProps {
  mobCount: number
  loading: boolean
  hasGameState: boolean
  refreshInterval: number
  onRefresh: () => void
}
```

#### `components/MobTableRow.tsx` (~60 lines)
**Purpose**: Render a single mob row
**Props**:
```typescript
interface MobTableRowProps {
  mob: MobInstance
  isSelected: boolean
  onSelect: (mobId: string) => void
}
```

#### `components/MobTableBody.tsx` (~30 lines)
**Purpose**: Render table body with all mob rows
**Props**:
```typescript
interface MobTableBodyProps {
  mobs: MobInstance[]
  selectedMobId: string | null
  onSelectMob: (mobId: string) => void
}
```

#### `components/MobDetailsPanel.tsx` (~80 lines)
**Purpose**: Display detailed information about selected mob
**Props**:
```typescript
interface MobDetailsPanelProps {
  mob: MobInstance
  onClose: () => void
}
```

#### `components/MobTableEmpty.tsx` (~20 lines)
**Purpose**: Display empty state message
**Props**:
```typescript
interface MobTableEmptyProps {
  message: string
  debugInfo?: string
}
```

#### `components/MobTableError.tsx` (~20 lines)
**Purpose**: Display error messages
**Props**:
```typescript
interface MobTableErrorProps {
  error: string
  roomId?: string | null
}
```

### 4. Extract Types

#### `types.ts` (~30 lines)
**Purpose**: Shared type definitions
**Exports**:
- `MobDataTableProps`
- `MobTableHeaderProps`
- `MobTableRowProps`
- `MobTableBodyProps`
- `MobDetailsPanelProps`
- `MobTableEmptyProps`
- `MobTableErrorProps`
- All hook return types

### 5. Main Component Refactor

#### `MobDataTable.tsx` (~100 lines)
**Purpose**: Orchestrate all sub-components and hooks
**Structure**:
```typescript
export const MobDataTable: React.FC<MobDataTableProps> = ({ 
  roomId, 
  gameState,
  refreshInterval 
}) => {
  // Hooks
  const { effectiveRoomId } = useEffectiveRoomId(roomId, gameState)
  const { mobsMetadata, loading, error, fetchMobsMetadata } = useMobMetadata(effectiveRoomId, refreshInterval)
  const { mergedMobs } = useMobDataMerging(gameState, mobsMetadata)
  
  // Local state
  const [selectedMob, setSelectedMob] = useState<string | null>(null)
  
  // Effects for new mob detection
  // ... (minimal logic)
  
  // Render
  return (
    <div className="mob-data-table">
      <MobTableHeader ... />
      <MobTableError ... />
      <MobTableEmpty ... />
      <MobTableBody ... />
      <MobDetailsPanel ... />
    </div>
  )
}
```

## File Size Estimates

| File | Current | After Refactor | Reduction |
|------|---------|----------------|-----------|
| MobDataTable.tsx | 354 | ~100 | -254 |
| useMobMetadata.ts | - | ~80 | +80 |
| useMobDataMerging.ts | - | ~50 | +50 |
| useEffectiveRoomId.ts | - | ~20 | +20 |
| mobDataConverter.ts | - | ~50 | +50 |
| mobDataMerger.ts | - | ~40 | +40 |
| MobTableHeader.tsx | - | ~40 | +40 |
| MobTableRow.tsx | - | ~60 | +60 |
| MobTableBody.tsx | - | ~30 | +30 |
| MobDetailsPanel.tsx | - | ~80 | +80 |
| MobTableEmpty.tsx | - | ~20 | +20 |
| MobTableError.tsx | - | ~20 | +20 |
| types.ts | - | ~30 | +30 |
| **Total** | **354** | **~640** | **+286** |

**Note**: While total lines increase, each file is now focused and maintainable. The main component reduces from 354 to ~100 lines.

## Benefits

1. **Single Responsibility**: Each file has one clear purpose
2. **Reusability**: Hooks and components can be reused elsewhere
3. **Testability**: Each piece can be tested in isolation
4. **Maintainability**: Easier to find and fix bugs
5. **Performance**: Better memoization opportunities
6. **Collaboration**: Multiple developers can work on different parts
7. **Code Review**: Smaller, focused PRs

## Migration Strategy

### Phase 1: Extract Utilities (Low Risk)
1. Create `utils/mobDataConverter.ts`
2. Create `utils/mobDataMerger.ts`
3. Update imports in `MobDataTable.tsx`
4. Test: No functionality changes

### Phase 2: Extract Hooks (Medium Risk)
1. Create `hooks/useEffectiveRoomId.ts`
2. Create `hooks/useMobDataMerging.ts`
3. Create `hooks/useMobMetadata.ts`
4. Update `MobDataTable.tsx` to use hooks
5. Test: Verify all functionality works

### Phase 3: Extract Components (Medium Risk)
1. Create `components/MobTableHeader.tsx`
2. Create `components/MobTableError.tsx`
3. Create `components/MobTableEmpty.tsx`
4. Update `MobDataTable.tsx` to use components
5. Test: Verify UI renders correctly

### Phase 4: Extract Table Components (Higher Risk)
1. Create `components/MobTableRow.tsx`
2. Create `components/MobTableBody.tsx`
3. Create `components/MobDetailsPanel.tsx`
4. Update `MobDataTable.tsx` to use components
5. Test: Verify table interactions work

### Phase 5: Extract Types (Low Risk)
1. Create `types.ts` with all interfaces
2. Update all files to import from `types.ts`
3. Test: Verify TypeScript compilation

### Phase 6: Cleanup & Documentation
1. Update component documentation
2. Add JSDoc comments to all exports
3. Update tests to match new structure
4. Verify all tests pass

## Testing Strategy

1. **Unit Tests**: Test each hook independently
2. **Component Tests**: Test each sub-component in isolation
3. **Integration Tests**: Test the main component with all pieces
4. **E2E Tests**: Test the full user flow

## Risk Mitigation

1. **Incremental Migration**: Refactor in phases, test after each
2. **Keep Tests Passing**: Don't break existing functionality
3. **Feature Flags**: Optionally use feature flags for gradual rollout
4. **Code Review**: Thorough review at each phase
5. **Rollback Plan**: Keep old code commented until verified

## Success Criteria

- [ ] Main component < 120 lines
- [ ] Each file < 100 lines (except main component)
- [ ] All tests passing
- [ ] No functionality regressions
- [ ] Improved code coverage
- [ ] Better performance (fewer re-renders)
- [ ] Easier to add new features

## Estimated Effort

- **Phase 1**: 1-2 hours
- **Phase 2**: 2-3 hours
- **Phase 3**: 1-2 hours
- **Phase 4**: 2-3 hours
- **Phase 5**: 1 hour
- **Phase 6**: 1-2 hours
- **Total**: 8-13 hours

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (utilities extraction)
3. Test thoroughly after each phase
4. Update documentation as we go
5. Refactor tests to match new structure

