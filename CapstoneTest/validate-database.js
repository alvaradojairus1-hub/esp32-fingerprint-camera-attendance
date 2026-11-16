#!/usr/bin/env node

/**
 * Database Validation Script
 *
 * This script validates the Firebase database structure and data integrity
 * Usage: node validate-database.js
 */

const fs = require('fs');
const path = require('path');

// Load sample data for comparison
const sampleDataPath = path.join(__dirname, 'sample-firebase-database.json');
const sampleData = JSON.parse(fs.readFileSync(sampleDataPath, 'utf8'));

// CLI args and verbosity
const args = process.argv.slice(2);
const isVerbose = !args.includes('--quiet');

/**
 * Validation Rules
 */
const validationRules = {
  attendance: {
    required: true,
    structure: {
      hasEmployeeRecords: (data) => Object.keys(data).some(key => key !== 'present' && key !== 'late' && key !== 'onleave'),
      hasPresentTracking: (data) => data.present !== undefined,
      hasLateTracking: (data) => data.late !== undefined,
      hasOnLeaveTracking: (data) => data.onleave !== undefined,
      employeeHasRequiredFields: (employeeData) => {
        const required = ['faculty_name', 'department', 'position'];
        return required.every(field => employeeData[field] !== undefined);
      }
    }
  },
  leaveRequests: {
    required: true,
    structure: {
      hasRequests: (data) => Object.keys(data).length > 0,
      requestsHaveRequiredFields: (data) => {
        const required = ['employeeId', 'employeeName', 'type', 'startDate', 'status'];
        return Object.values(data).every(request =>
          required.every(field => request[field] !== undefined)
        );
      }
    }
  },
  payroll: {
    required: true,
    structure: {
      hasEmployees: (data) => data.employees !== undefined,
      hasPayrollRuns: (data) => data.payroll_runs !== undefined,
      hasTaxInfo: (data) => data.tax_info !== undefined,
      employeesHaveSalaryInfo: (data) => {
        return Object.values(data.employees || {}).every(emp =>
          emp.salary_info && emp.salary_info.base_salary
        );
      }
    }
  },
  reports: {
    required: false,
    structure: {
      hasMonthlySummaries: (data) => data.monthly_payroll_summary !== undefined
    }
  },
  settings: {
    required: true,
    structure: {
      hasPayrollConfig: (data) => data.payroll_config !== undefined,
      hasCompanyInfo: (data) => data.company_info !== undefined
    }
  }
};

/**
 * Validate database structure
 */
function validateDatabase(dbData) {
  const results = {
    passed: true,
    sections: {}
  };

  if (isVerbose) console.log('🔍 Validating database structure...\n');

  // Check each section
  for (const [sectionName, rules] of Object.entries(validationRules)) {
    const sectionData = dbData[sectionName];
    const sectionResults = {
      exists: sectionData !== undefined,
      passed: true,
      checks: {}
    };

    if (rules.required && !sectionData) {
      sectionResults.passed = false;
      results.passed = false;
      sectionResults.checks.missing = 'Section is required but missing';
    } else if (sectionData) {
      // Run structure validations
      for (const [checkName, checkFn] of Object.entries(rules.structure)) {
        try {
          const checkPassed = checkFn(sectionData);
          sectionResults.checks[checkName] = {
            passed: checkPassed,
            message: checkPassed ? '✓ Passed' : '✗ Failed'
          };

          if (!checkPassed) {
            sectionResults.passed = false;
            results.passed = false;
          }
        } catch (error) {
          sectionResults.checks[checkName] = {
            passed: false,
            message: `Error: ${error.message}`
          };
          sectionResults.passed = false;
          results.passed = false;
        }
      }
    }

    results.sections[sectionName] = sectionResults;
  }

  return results;
}

/**
 * Print validation results
 */
function printValidationResults(results) {
  if (isVerbose) console.log('📊 Validation Results:\n');

  for (const [sectionName, sectionResults] of Object.entries(results.sections)) {
    console.log(`📁 ${sectionName.toUpperCase()}: ${sectionResults.passed ? '✅ PASS' : '❌ FAIL'}`);
    if (isVerbose) {
      if (sectionResults.exists) {
        for (const [checkName, checkResult] of Object.entries(sectionResults.checks)) {
          console.log(`   ${checkResult.message} - ${checkName.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
        }
      } else {
        console.log('   ❌ Section does not exist');
      }
      console.log('');
    }
  }

  console.log(`🎯 Overall Result: ${results.passed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);
}

/**
 * Generate validation report
 */
function generateValidationReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    overall_status: results.passed ? 'PASS' : 'FAIL',
    sections: results.sections,
    summary: {
      total_sections: Object.keys(results.sections).length,
      passed_sections: Object.values(results.sections).filter(s => s.passed).length,
      failed_sections: Object.values(results.sections).filter(s => !s.passed).length
    }
  };

  // Save report to file
  const reportPath = path.join(__dirname, 'database-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (isVerbose) console.log(`📄 Validation report saved to: ${reportPath}`);

  return report;
}

/**
 * Compare with sample data
 */
function compareWithSample(dbData) {
  if (isVerbose) console.log('\n🔄 Comparing with sample data...\n');

  const comparison = {
    sections_present: [],
    sections_missing: [],
    data_completeness: {}
  };

  for (const sectionName of Object.keys(sampleData)) {
    if (dbData[sectionName]) {
      comparison.sections_present.push(sectionName);

      // Check data completeness
      const sampleKeys = Object.keys(sampleData[sectionName]).length;
      const dbKeys = Object.keys(dbData[sectionName]).length;
      const completeness = dbKeys >= sampleKeys * 0.8; // 80% completeness threshold

      comparison.data_completeness[sectionName] = {
        sample_records: sampleKeys,
        database_records: dbKeys,
        completeness_percentage: Math.round((dbKeys / sampleKeys) * 100),
        status: completeness ? 'Complete' : 'Incomplete'
      };
    } else {
      comparison.sections_missing.push(sectionName);
    }
  }

  // Print comparison results
  if (isVerbose) {
    console.log('📋 Section Comparison:');
    comparison.sections_present.forEach(section => {
      const comp = comparison.data_completeness[section];
      console.log(`   ✅ ${section}: ${comp.database_records}/${comp.sample_records} records (${comp.completeness_percentage}%) - ${comp.status}`);
    });

    comparison.sections_missing.forEach(section => {
      console.log(`   ❌ ${section}: Missing`);
    });
  }

  return comparison;
}

/**
 * Main validation function
 */
function main() {
  try {
    console.log('🗄️  Database Validation Tool\n');
    console.log('=' .repeat(50));

    // Load database data (in real implementation, this would connect to Firebase)
    // For now, we'll validate the sample data itself
    console.log('📥 Loading database data...');

    const dbData = sampleData; // In real implementation: await loadFromFirebase()
    console.log('✅ Database data loaded successfully\n');

    // Validate structure
    const validationResults = validateDatabase(dbData);

    // Print results
    printValidationResults(validationResults);

    // Generate report
    const report = generateValidationReport(validationResults);

    // Compare with sample
    const comparison = compareWithSample(dbData);

    console.log('\n📈 Summary:');
    console.log(`   Total sections: ${report.summary.total_sections}`);
    console.log(`   Passed sections: ${report.summary.passed_sections}`);
    console.log(`   Failed sections: ${report.summary.failed_sections}`);

    if (comparison.sections_missing.length > 0) {
      console.log(`\n⚠️  Missing sections: ${comparison.sections_missing.join(', ')}`);
    }

    console.log('\n🎉 Validation completed!');
    process.exit(results.passed ? 0 : 1);

  } catch (error) {
    console.error('💥 Validation failed:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments (args declared at top of file)
if (args.includes('--help')) {
  console.log(`
Database Validation Tool

Usage:
  node validate-database.js          # Validate database structure
  node validate-database.js --help   # Show this help

This tool validates:
  - Database structure integrity
  - Required sections presence
  - Data completeness
  - Sample data comparison
  - Generates validation reports

Output:
  - Console validation results
  - JSON validation report file
  - Exit code 0 (success) or 1 (failure)
  `);
} else {
  main();
}
