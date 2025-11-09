#!/bin/bash

# Plan Cleanup Script
# Interactive script to review and delete finished plans

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLANS_DIR="$SCRIPT_DIR/../plans"
VALIDATE_SCRIPT="$SCRIPT_DIR/validate-plans.js"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧹 Plan Cleanup Script${NC}"
echo ""

# Check if validate script exists
if [ ! -f "$VALIDATE_SCRIPT" ]; then
    echo -e "${RED}❌ Validation script not found: $VALIDATE_SCRIPT${NC}"
    exit 1
fi

# Check if plans directory exists
if [ ! -d "$PLANS_DIR" ]; then
    echo -e "${RED}❌ Plans directory not found: $PLANS_DIR${NC}"
    exit 1
fi

# Run validation
echo -e "${YELLOW}Running plan validation...${NC}"
echo ""
node "$VALIDATE_SCRIPT" > /tmp/plan-validation.txt 2>&1
cat /tmp/plan-validation.txt

# Extract finished plans from validation output (look for plans under "Potentially Finished Plans" section)
FINISHED_PLANS=$(awk '/Potentially Finished Plans/,/Plans Needing Manual Review/ {if (/📄/) {gsub(/^[[:space:]]*📄[[:space:]]*/, ""); print}}' /tmp/plan-validation.txt | grep -v "^$" || true)

if [ -z "$FINISHED_PLANS" ]; then
    echo ""
    echo -e "${GREEN}✅ No finished plans found. Nothing to clean up.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}⚠️  Found potentially finished plans.${NC}"
echo ""
echo "Please review each plan carefully before deletion:"
echo ""

# Count plans
PLAN_COUNT=$(echo "$FINISHED_PLANS" | grep -c . || echo "0")
echo -e "${BLUE}Found $PLAN_COUNT plan(s) to review:${NC}"
echo ""

# List plans
IFS=$'\n'
for plan in $FINISHED_PLANS; do
    echo -e "  ${YELLOW}📄 $plan${NC}"
    PLAN_PATH="$PLANS_DIR/$plan"
    
    # Check if it's a file or directory
    if [ -f "$PLAN_PATH" ]; then
        echo -e "     Type: File"
        echo -e "     Size: $(du -h "$PLAN_PATH" | cut -f1)"
    elif [ -d "$PLAN_PATH" ]; then
        echo -e "     Type: Directory"
        FILE_COUNT=$(find "$PLAN_PATH" -type f | wc -l | tr -d ' ')
        echo -e "     Files: $FILE_COUNT"
        echo -e "     Size: $(du -sh "$PLAN_PATH" | cut -f1)"
    fi
    echo ""
done

# Ask for confirmation
echo -e "${RED}⚠️  WARNING: This will permanently delete the plans listed above.${NC}"
echo ""
read -p "Do you want to proceed with deletion? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}❌ Cleanup cancelled.${NC}"
    exit 0
fi

# Delete plans
DELETED=0
FAILED=0

echo ""
echo -e "${BLUE}Deleting plans...${NC}"
echo ""

for plan in $FINISHED_PLANS; do
    PLAN_PATH="$PLANS_DIR/$plan"
    
    if [ -e "$PLAN_PATH" ]; then
        if rm -rf "$PLAN_PATH"; then
            echo -e "${GREEN}✅ Deleted: $plan${NC}"
            DELETED=$((DELETED + 1))
        else
            echo -e "${RED}❌ Failed to delete: $plan${NC}"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${YELLOW}⚠️  Not found: $plan${NC}"
    fi
done

echo ""
echo -e "${BLUE}📊 Cleanup Summary:${NC}"
echo -e "   Deleted: ${GREEN}$DELETED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "   Failed: ${RED}$FAILED${NC}"
fi

# Cleanup temp file
rm -f /tmp/plan-validation.txt

echo ""
echo -e "${GREEN}✅ Cleanup complete!${NC}"

