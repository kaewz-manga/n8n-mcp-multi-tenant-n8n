#!/usr/bin/env ts-node
/**
 * Phase 3: Real-World Type Structure Validation
 *
 * Tests type structure validation against real workflow templates from n8n.io
 * to ensure production readiness. Validates filter, resourceMapper,
 * assignmentCollection, and resourceLocator types.
 *
 * Usage:
 *   npm run build && node dist/scripts/test-structure-validation.js
 *
 * or with ts-node:
 *   npx ts-node scripts/test-structure-validation.ts
 */

import { createDatabaseAdapter } from '../src/database/database-adapter';
import { EnhancedConfigValidator } from '../src/services/enhanced-config-validator';
import type { NodePropertyTypes } from 'n8n-workflow';
import { gunzipSync } from 'zlib';

interface ValidationResult {
  templateId: number;
  templateName: string;
  templateViews: number;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  propertyName: string;
  propertyType: NodePropertyTypes;
  valid: boolean;
  errors: Array<{ type: string; property?: string; message: string }>;
  warnings: Array<{ type: string; property?: string; message: string }>;
  validationTimeMs: number;
}

interface ValidationStats {
  totalTemplates: number;
  totalNodes: number;
  totalValidations: number;
  passedValidations: number;
  failedValidations: number;
  byType: Record<string, { passed: number; failed: number }>;
  byError: Record<string, number>;
  avgValidationTimeMs: number;
  maxValidationTimeMs: number;
}

// Special types we want to validate
const SPECIAL_TYPES: NodePropertyTypes[] = [
  'filter',
  'resourceMapper',
  'assignmentCollection',
  'resourceLocator',
];

function decompressWorkflow(compressed: string): any {
  try {
    const buffer = Buffer.from(compressed, 'base64');
    const decompressed = gunzipSync(buffer);
    return JSON.parse(decompressed.toString('utf-8'));
  } catch (error: any) {
    throw new Error(`Failed to decompress workflow: ${error.message}`);
  }
}

async function loadTopTemplates(db: any, limit: number = 100) {
  console.log(`📥 Loading top ${limit} templates by popularity...\n`);

  const stmt = db.prepare(`
    SELECT
      id,
      name,
      workflow_json_compressed,
      views
    FROM templates
    WHERE workflow_json_compressed IS NOT NULL
    ORDER BY views DESC
    LIMIT ?
  `);

  const templates = stmt.all(limit);
  console.log(`✓ Loaded ${templates.length} templates\n`);

  return templates;
}

function extractNodesWithSpecialTypes(workflowJson: any): Array<{
  nodeId: string;
  nodeName: string;
  nodeType: string;
  properties: Array<{ name: string; type: NodePropertyTypes; value: any }>;
}> {
  const results: Array<any> = [];

  if (!workflowJson || !workflowJson.nodes || !Array.isArray(workflowJson.nodes)) {
    return results;
  }

  for (const node of workflowJson.nodes) {
    // Check if node has parameters with special types
    if (!node.parameters || typeof node.parameters !== 'object') {
      continue;
    }

    const specialProperties: Array<{ name: string; type: NodePropertyTypes; value: any }> = [];

    // Check each parameter against our special types
    for (const [paramName, paramValue] of Object.entries(node.parameters)) {
      // Try to infer type from structure
      const inferredType = inferPropertyType(paramValue);

      if (inferredType && SPECIAL_TYPES.includes(inferredType)) {
        specialProperties.push({
          name: paramName,
          type: inferredType,
          value: paramValue,
        });
      }
    }

    if (specialProperties.length > 0) {
      results.push({
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        properties: specialProperties,
      });
    }
  }

  return results;
}

function inferPropertyType(value: any): NodePropertyTypes | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  // Filter type: has combinator and conditions
  if (value.combinator && value.conditions) {
    return 'filter';
  }

  // ResourceMapper type: has mappingMode
  if (value.mappingMode) {
    return 'resourceMapper';
  }

  // AssignmentCollection type: has assignments array
  if (value.assignments && Array.isArray(value.assignments)) {
    return 'assignmentCollection';
  }

  // ResourceLocator type: has mode and value
  if (value.mode && value.hasOwnProperty('value')) {
    return 'resourceLocator';
  }

  return null;
}

async function validateTemplate(
  templateId: number,
  templateName: string,
  templateViews: number,
  workflowJson: any
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Extract nodes with special types
  const nodesWithSpecialTypes = extractNodesWithSpecialTypes(workflowJson);

  for (const node of nodesWithSpecialTypes) {
    for (const prop of node.properties) {
      const startTime = Date.now();

      // Create property definition for validation
      const properties = [
        {
          name: prop.name,
          type: prop.type,
          required: true,
          displayName: prop.name,
          default: {},
        },
      ];

      // Create config with just this property
      const config = {
        [prop.name]: prop.value,
      };

      try {
        // Run validation
        const validationResult = EnhancedConfigValidator.validateWithMode(
          node.nodeType,
          config,
          properties,
          'operation',
          'ai-friendly'
        );

        const validationTimeMs = Date.now() - startTime;

        results.push({
          templateId,
          templateName,
          templateViews,
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          propertyName: prop.name,
          propertyType: prop.type,
          valid: validationResult.valid,
          errors: validationResult.errors || [],
          warnings: validationResult.warnings || [],
          validationTimeMs,
        });
      } catch (error: any) {
        const validationTimeMs = Date.now() - startTime;

        results.push({
          templateId,
          templateName,
          templateViews,
          nodeId: node.nodeId,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          propertyName: prop.name,
          propertyType: prop.type,
          valid: false,
          errors: [
            {
              type: 'exception',
              property: prop.name,
              message: `Validation threw exception: ${error.message}`,
            },
          ],
          warnings: [],
          validationTimeMs,
        });
      }
    }
  }

  return results;
}

function calculateStats(results: ValidationResult[]): ValidationStats {
  const stats: ValidationStats = {
    totalTemplates: new Set(results.map(r => r.templateId)).size,
    totalNodes: new Set(results.map(r => `${r.templateId}-${r.nodeId}`)).size,
    totalValidations: results.length,
    passedValidations: results.filter(r => r.valid).length,
    failedValidations: results.filter(r => !r.valid).length,
    byType: {},
    byError: {},
    avgValidationTimeMs: 0,
    maxValidationTimeMs: 0,
  };

  // Stats by type
  for (const type of SPECIAL_TYPES) {
    const typeResults = results.filter(r => r.propertyType === type);
    stats.byType[type] = {
      passed: typeResults.filter(r => r.valid).length,
      failed: typeResults.filter(r => !r.valid).length,
    };
  }

  // Error frequency
  for (const result of results.filter(r => !r.valid)) {
    for (const error of result.errors) {
      const key = `${error.type}: ${error.message}`;
      stats.byError[key] = (stats.byError[key] || 0) + 1;
    }
  }

  // Performance stats
  if (results.length > 0) {
    stats.avgValidationTimeMs =
      results.reduce((sum, r) => sum + r.validationTimeMs, 0) / results.length;
    stats.maxValidationTimeMs = Math.max(...results.map(r => r.validationTimeMs));
  }

  return stats;
}

function printStats(stats: ValidationStats) {
  console.log('\n' + '='.repeat(80));
  console.log('VALIDATION STATISTICS');
  console.log('='.repeat(80) + '\n');

  console.log(`📊 Total Templates Tested: ${stats.totalTemplates}`);
  console.log(`📊 Total Nodes with Special Types: ${stats.totalNodes}`);
  console.log(`📊 Total Property Validations: ${stats.totalValidations}\n`);

  const passRate = (stats.passedValidations / stats.totalValidations * 100).toFixed(2);
  const failRate = (stats.failedValidations / stats.totalValidations * 100).toFixed(2);

  console.log(`✅ Passed: ${stats.passedValidations} (${passRate}%)`);
  console.log(`❌ Failed: ${stats.failedValidations} (${failRate}%)\n`);

  console.log('By Property Type:');
  console.log('-'.repeat(80));
  for (const [type, counts] of Object.entries(stats.byType)) {
    const total = counts.passed + counts.failed;
    if (total === 0) {
      console.log(`  ${type}: No occurrences found`);
    } else {
      const typePassRate = (counts.passed / total * 100).toFixed(2);
      console.log(`  ${type}: ${counts.passed}/${total} passed (${typePassRate}%)`);
    }
  }

  console.log('\n⚡ Performance:');
  console.log('-'.repeat(80));
  console.log(`  Average validation time: ${stats.avgValidationTimeMs.toFixed(2)}ms`);
  console.log(`  Maximum validation time: ${stats.maxValidationTimeMs.toFixed(2)}ms`);

  const meetsTarget = stats.avgValidationTimeMs < 50;
  console.log(`  Target (<50ms): ${meetsTarget ? '✅ MET' : '❌ NOT MET'}\n`);

  if (Object.keys(stats.byError).length > 0) {
    console.log('🔍 Most Common Errors:');
    console.log('-'.repeat(80));

    const sortedErrors = Object.entries(stats.byError)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [error, count] of sortedErrors) {
      console.log(`  ${count}x: ${error}`);
    }
  }
}

function printFailures(results: ValidationResult[], maxFailures: number = 20) {
  const failures = results.filter(r => !r.valid);

  if (failures.length === 0) {
    console.log('\n✨ No failures! All validations passed.\n');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log(`VALIDATION FAILURES (showing first ${Math.min(maxFailures, failures.length)})` );
  console.log('='.repeat(80) + '\n');

  for (let i = 0; i < Math.min(maxFailures, failures.length); i++) {
    const failure = failures[i];

    console.log(`Failure ${i + 1}/${failures.length}:`);
    console.log(`  Template: ${failure.templateName} (ID: ${failure.templateId}, Views: ${failure.templateViews})`);
    console.log(`  Node: ${failure.nodeName} (${failure.nodeType})`);
    console.log(`  Property: ${failure.propertyName} (type: ${failure.propertyType})`);
    console.log(`  Errors:`);

    for (const error of failure.errors) {
      console.log(`    - [${error.type}] ${error.property}: ${error.message}`);
    }

    if (failure.warnings.length > 0) {
      console.log(`  Warnings:`);
      for (const warning of failure.warnings) {
        console.log(`    - [${warning.type}] ${warning.property}: ${warning.message}`);
      }
    }

    console.log('');
  }

  if (failures.length > maxFailures) {
    console.log(`... and ${failures.length - maxFailures} more failures\n`);
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('PHASE 3: REAL-WORLD TYPE STRUCTURE VALIDATION');
  console.log('='.repeat(80) + '\n');

  // Initialize database
  console.log('🔌 Connecting to database...');
  const db = await createDatabaseAdapter('./data/nodes.db');
  console.log('✓ Database connected\n');

  // Load templates
  const templates = await loadTopTemplates(db, 100);

  // Validate each template
  console.log('🔍 Validating templates...\n');

  const allResults: ValidationResult[] = [];
  let processedCount = 0;
  let nodesFound = 0;

  for (const template of templates) {
    processedCount++;

    let workflowJson;
    try {
      workflowJson = decompressWorkflow(template.workflow_json_compressed);
    } catch (error) {
      console.warn(`⚠️  Template ${template.id}: Decompression failed, skipping`);
      continue;
    }

    const results = await validateTemplate(
      template.id,
      template.name,
      template.views,
      workflowJson
    );

    if (results.length > 0) {
      nodesFound += new Set(results.map(r => r.nodeId)).size;
      allResults.push(...results);

      const passedCount = results.filter(r => r.valid).length;
      const status = passedCount === results.length ? '✓' : '✗';
      console.log(
        `${status} Template ${processedCount}/${templates.length}: ` +
        `"${template.name}" (${results.length} validations, ${passedCount} passed)`
      );
    }
  }

  console.log(`\n✓ Processed ${processedCount} templates`);
  console.log(`✓ Found ${nodesFound} nodes with special types\n`);

  // Calculate and print statistics
  const stats = calculateStats(allResults);
  printStats(stats);

  // Print detailed failures
  printFailures(allResults);

  // Success criteria check
  console.log('='.repeat(80));
  console.log('SUCCESS CRITERIA CHECK');
  console.log('='.repeat(80) + '\n');

  const passRate = (stats.passedValidations / stats.totalValidations * 100);
  const falsePositiveRate = (stats.failedValidations / stats.totalValidations * 100);
  const avgTime = stats.avgValidationTimeMs;

  console.log(`Pass Rate: ${passRate.toFixed(2)}% (target: >95%) ${passRate > 95 ? '✅' : '❌'}`);
  console.log(`False Positive Rate: ${falsePositiveRate.toFixed(2)}% (target: <5%) ${falsePositiveRate < 5 ? '✅' : '❌'}`);
  console.log(`Avg Validation Time: ${avgTime.toFixed(2)}ms (target: <50ms) ${avgTime < 50 ? '✅' : '❌'}\n`);

  const allCriteriaMet = passRate > 95 && falsePositiveRate < 5 && avgTime < 50;

  if (allCriteriaMet) {
    console.log('🎉 ALL SUCCESS CRITERIA MET! Phase 3 validation complete.\n');
  } else {
    console.log('⚠️  Some success criteria not met. Iteration required.\n');
  }

  // Close database
  db.close();

  process.exit(allCriteriaMet ? 0 : 1);
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
