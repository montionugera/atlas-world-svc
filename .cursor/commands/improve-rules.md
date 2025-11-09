# Improve Cursor Rules

## Overview
Guidelines for enhancing and maintaining cursor rules to ensure code quality, consistency, and up-to-date development standards.

## Process

### 1. Review Existing Rules
- Assess current rules in `.cursor/rules/` for relevance and effectiveness
- Identify rules that are outdated or no longer applicable
- Check for conflicts or contradictions between rules
- Verify rules align with current project architecture and patterns

### 2. Identify Redundant or Obsolete Rules
- Remove rules that are no longer applicable
- Consolidate duplicate or overlapping rules
- Update rules that reference deprecated patterns or technologies
- Ensure rules reflect current codebase structure

### 3. Incorporate New Best Practices
- Add rules reflecting latest coding standards and practices
- Document patterns that have proven effective in the project
- Include lessons learned from recent implementations
- Reference successful architectural decisions

### 4. Validate Against Codebase
- Check that rules match actual implementation patterns
- Verify examples in rules are accurate and current
- Ensure rules don't conflict with existing code
- Test rule applicability with recent code changes

### 5. Document Changes
- Clearly document any modifications for team awareness
- Update rule README if structure changes significantly
- Note breaking changes or major updates
- Link related rules for better discoverability

## Plan Cleanup Integration

When improving rules, also review and clean up plans:

1. **Run Plan Validation**: Use `.cursor/scripts/validate-plans.js` to identify finished plans
2. **Review Flagged Plans**: Manually verify completion status
3. **Code Verification**: Check if plan features are actually implemented in codebase
4. **Clean Up**: Delete confirmed finished plans using `.cursor/scripts/cleanup-plans.sh`

## Rule Categories

### Development Workflow
- Branch strategy, commit policy, PR requirements
- File: `01-development-workflow.mdc`

### Code Standards
- Coding conventions, naming, structure
- Files: `02-coding-standards.mdc`, `03-project-structure.mdc`

### Technical Standards
- TypeScript, APIs, testing, accuracy
- Files: `typescript.mdc`, `01-apis-and-constructors.mdc`, `testing.mdc`

### Domain-Specific
- Colyseus, React client, Docker, entity lifecycle
- Files: `colyseus-server.mdc`, `react-client.mdc`, `docker-compose.mdc`, `05-entity-lifecycle.mdc`

## Best Practices

- **Keep rules concise**: Focus on actionable guidelines
- **Use examples**: Show correct patterns, not just describe them
- **Stay current**: Update rules when architecture changes
- **Be specific**: Avoid vague or ambiguous language
- **Link related rules**: Cross-reference for better navigation
- **Test applicability**: Ensure rules work with actual codebase

## Review Schedule

- **Weekly**: Quick scan for obvious issues
- **Monthly**: Comprehensive review of all rules
- **After major changes**: Update rules when architecture shifts
- **Before releases**: Final validation of rule accuracy

## Related Commands

- `/validate-plans` - Check plan completion status
- `/cleanup-plans` - Remove finished plans

