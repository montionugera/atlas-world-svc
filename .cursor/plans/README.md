# Plan Management

This directory contains implementation plans for the Atlas World project. Plans document features, systems, and improvements being developed or planned.

## Plan Lifecycle

### 1. Active
- Plan is being worked on or contains pending tasks
- Status indicators show work in progress
- Regular updates as implementation progresses

### 2. Review
- Plan appears finished but needs verification
- All checkboxes may be checked
- Contains completion markers
- Requires manual review and code verification

### 3. Finished
- All completion criteria met:
  - All checkboxes checked `[x]`
  - Contains completion markers
  - Code validation confirms implementation
  - Manual review confirms no remaining work
- Ready for deletion

### 4. Deleted
- Removed after confirmation
- No archiving needed (plans are documentation, not code)

## Status Indicators

Use consistent status indicators across all plans:

- **✅ Done** - Task/phase completed
- **🚧 In Progress** - Currently being worked on  
- **⏳ Pending** - Not yet started
- **❌ Failed** - Task failed or cancelled

## Plan Structure

### Directory Structure
```
.cursor/plans/
├── {number}-{short-desc}/     # Feature/system plans
│   ├── Goal and Overview.md   # Scope, objectives, key notes
│   └── {EpicKey}-{EpicDesc}.md # Epic plans with checklists
└── {feature-name}.md           # Simple single-file plans
```

### Plan File Template

```markdown
# {Feature Name} - {Status}

## 🎯 Goal
Brief description of the goal.

## 📋 Overview
- Scope and key components
- Architecture approach
- Success criteria

## 📋 Checklist

### Phase 1: {Phase Name} {Status}
- [ ] Task 1
- [x] Task 2 ✅
- [ ] Task 3

### Phase 2: {Phase Name} ⏳
- [ ] Task 1
- [ ] Task 2

## 🎯 Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## Completion Criteria

A plan is considered "finished" when:

1. **All checkboxes checked** - Every `[ ]` is `[x]`
2. **Completion markers present** - Contains "✅ COMPLETED", "ACHIEVED", "Ready for Production"
3. **Code validation** - Related features exist in codebase
4. **Manual review** - No remaining work confirmed

## Plan Cleanup

### Automated Validation
Run the validation script to identify finished plans:
```bash
node .cursor/scripts/validate-plans.js
```

### Interactive Cleanup
Review and delete finished plans:
```bash
.cursor/scripts/cleanup-plans.sh
```

### Manual Process
1. Review plan files for completion indicators
2. Verify features are implemented in codebase
3. Confirm no remaining work
4. Delete plan directory/file

## Best Practices

### When Creating Plans
- Use descriptive names: `{number}-{short-desc}`
- Include goal and overview
- Break down into phases with checklists
- Use status indicators consistently
- Link to related code/features

### When Updating Plans
- Mark completed tasks with `[x]`
- Update status indicators
- Add implementation notes if needed
- Document deviations from plan
- Keep plans current with implementation

### When Reviewing Plans
- Check all checkboxes are accurate
- Verify completion markers match reality
- Validate code implementation exists
- Confirm no remaining work
- Delete promptly when finished

## Related Documentation

- **Workflow Rules**: `.cursor/rules/01-development-workflow.mdc`
- **Cursor Command**: `.cursor/commands/improve-rules.md`
- **Validation Script**: `.cursor/scripts/validate-plans.js`
- **Cleanup Script**: `.cursor/scripts/cleanup-plans.sh`

## Examples

### Completed Plan
See: `03-migrate-colyseus/Goal and Overview.md`
- All phases marked ✅
- All checkboxes checked
- Contains "COMPLETED" marker
- Ready for deletion

### Active Plan
See: `03-death-respawn-system/`
- Some tasks completed
- Some tasks pending
- Status indicators show progress
- Regular updates needed

