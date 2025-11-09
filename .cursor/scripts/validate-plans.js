#!/usr/bin/env node

/**
 * Plan Validation Script
 * 
 * Code-first approach to validate plan completion status.
 * Checks for completion indicators and flags plans for manual review.
 */

const fs = require('fs');
const path = require('path');

const PLANS_DIR = path.join(__dirname, '..', 'plans');
const COMPLETION_MARKERS = [
  '✅ COMPLETED',
  'COMPLETED',
  'ACHIEVED',
  'Ready for Production',
  'READY FOR PRODUCTION',
  'MIGRATION SUCCESS',
  'SUCCESS SUMMARY'
];

/**
 * Check if a file contains completion markers
 */
function hasCompletionMarkers(content) {
  const upperContent = content.toUpperCase();
  return COMPLETION_MARKERS.some(marker => 
    upperContent.includes(marker.toUpperCase())
  );
}

/**
 * Count checkboxes in content
 */
function countCheckboxes(content) {
  const checked = (content.match(/\[x\]/gi) || []).length;
  const unchecked = (content.match(/\[ \]/g) || []).length;
  return { checked, unchecked, total: checked + unchecked };
}

/**
 * Check if all checkboxes are checked
 */
function allCheckboxesChecked(content) {
  const { checked, unchecked, total } = countCheckboxes(content);
  if (total === 0) return null; // No checkboxes found
  return unchecked === 0 && checked > 0;
}

/**
 * Analyze a plan file
 */
function analyzePlanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const hasMarkers = hasCompletionMarkers(content);
  const allChecked = allCheckboxesChecked(content);
  const checkboxCount = countCheckboxes(content);
  
  return {
    path: filePath,
    hasCompletionMarkers: hasMarkers,
    allCheckboxesChecked: allChecked,
    checkboxCount,
    size: content.length,
    lines: content.split('\n').length
  };
}

/**
 * Analyze a plan directory
 */
function analyzePlanDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results = {
    directory: dirPath,
    files: [],
    summary: {
      totalFiles: 0,
      filesWithMarkers: 0,
      filesAllChecked: 0,
      filesNeedingReview: 0
    }
  };
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const analysis = analyzePlanFile(fullPath);
      results.files.push(analysis);
      results.summary.totalFiles++;
      
      if (analysis.hasCompletionMarkers) {
        results.summary.filesWithMarkers++;
      }
      
      if (analysis.allCheckboxesChecked === true) {
        results.summary.filesAllChecked++;
      }
      
      // Flag for review if has markers OR all checkboxes checked
      if (analysis.hasCompletionMarkers || analysis.allCheckboxesChecked === true) {
        results.summary.filesNeedingReview++;
      }
    } else if (entry.isDirectory()) {
      // Recursively analyze subdirectories
      const subResults = analyzePlanDirectory(fullPath);
      results.files.push(...subResults.files);
      results.summary.totalFiles += subResults.summary.totalFiles;
      results.summary.filesWithMarkers += subResults.summary.filesWithMarkers;
      results.summary.filesAllChecked += subResults.summary.filesAllChecked;
      results.summary.filesNeedingReview += subResults.summary.filesNeedingReview;
    }
  }
  
  return results;
}

/**
 * Get relative path from plans directory
 */
function getRelativePath(fullPath) {
  const plansPath = path.resolve(PLANS_DIR);
  return path.relative(plansPath, fullPath);
}

/**
 * Main validation function
 */
function validatePlans() {
  console.log('🔍 Validating plans...\n');
  
  if (!fs.existsSync(PLANS_DIR)) {
    console.error(`❌ Plans directory not found: ${PLANS_DIR}`);
    process.exit(1);
  }
  
  const results = analyzePlanDirectory(PLANS_DIR);
  
  // Find potentially finished plans
  const finishedPlans = [];
  const needsReview = [];
  
  for (const file of results.files) {
    const relativePath = getRelativePath(file.path);
    const isFinished = file.hasCompletionMarkers && 
                      (file.allCheckboxesChecked === true || file.allCheckboxesChecked === null);
    
    if (isFinished) {
      finishedPlans.push({
        path: relativePath,
        fullPath: file.path,
        hasCompletionMarkers: file.hasCompletionMarkers,
        allCheckboxesChecked: file.allCheckboxesChecked,
        checkboxCount: file.checkboxCount
      });
    } else if (file.hasCompletionMarkers || file.allCheckboxesChecked === true) {
      needsReview.push({
        path: relativePath,
        fullPath: file.path,
        hasCompletionMarkers: file.hasCompletionMarkers,
        allCheckboxesChecked: file.allCheckboxesChecked,
        checkboxCount: file.checkboxCount
      });
    }
  }
  
  // Print summary
  console.log('📊 Summary:');
  console.log(`   Total plan files: ${results.summary.totalFiles}`);
  console.log(`   Files with completion markers: ${results.summary.filesWithMarkers}`);
  console.log(`   Files with all checkboxes checked: ${results.summary.filesAllChecked}`);
  console.log(`   Files needing review: ${results.summary.filesNeedingReview}`);
  console.log('');
  
  // Print potentially finished plans
  if (finishedPlans.length > 0) {
    console.log('✅ Potentially Finished Plans (candidates for deletion):');
    console.log('');
    finishedPlans.forEach(plan => {
      console.log(`   📄 ${plan.path}`);
      if (plan.hasCompletionMarkers) {
        console.log(`      ✓ Has completion markers`);
      }
      if (plan.allCheckboxesChecked === true) {
        console.log(`      ✓ All checkboxes checked (${plan.checkboxCount.checked} total)`);
      }
      console.log('');
    });
  } else {
    console.log('ℹ️  No obviously finished plans found.');
    console.log('');
  }
  
  // Print plans needing review
  if (needsReview.length > 0) {
    console.log('⚠️  Plans Needing Manual Review:');
    console.log('');
    needsReview.forEach(plan => {
      console.log(`   📄 ${plan.path}`);
      if (plan.hasCompletionMarkers) {
        console.log(`      ⚠ Has completion markers`);
      }
      if (plan.allCheckboxesChecked === true) {
        console.log(`      ⚠ All checkboxes checked`);
      } else if (plan.checkboxCount.total > 0) {
        console.log(`      ⚠ Checkboxes: ${plan.checkboxCount.checked}/${plan.checkboxCount.total} checked`);
      }
      console.log('');
    });
  }
  
  // Exit code
  if (finishedPlans.length > 0) {
    console.log('💡 Run cleanup script to review and delete finished plans:');
    console.log('   .cursor/scripts/cleanup-plans.sh\n');
    process.exit(0);
  } else {
    process.exit(0);
  }
}

// Run validation
if (require.main === module) {
  validatePlans();
}

module.exports = { validatePlans, analyzePlanFile, analyzePlanDirectory };

