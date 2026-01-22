/**
 * Test script for n8n_autofix_workflow functionality
 *
 * Tests the automatic fixing of common workflow validation errors:
 * 1. Expression format errors (missing = prefix)
 * 2. TypeVersion corrections
 * 3. Error output configuration issues
 */

import { WorkflowAutoFixer } from '../services/workflow-auto-fixer';
import { WorkflowValidator } from '../services/workflow-validator';
import { EnhancedConfigValidator } from '../services/enhanced-config-validator';
import { ExpressionFormatValidator } from '../services/expression-format-validator';
import { NodeRepository } from '../database/node-repository';
import { Logger } from '../utils/logger';
import { createDatabaseAdapter } from '../database/database-adapter';
import * as path from 'path';

const logger = new Logger({ prefix: '[TestAutofix]' });

async function testAutofix() {
  // Initialize database and repository
  const dbPath = path.join(__dirname, '../../data/nodes.db');
  const dbAdapter = await createDatabaseAdapter(dbPath);
  const repository = new NodeRepository(dbAdapter);

  // Test workflow with various issues
  const testWorkflow = {
    id: 'test_workflow_1',
    name: 'Test Workflow for Autofix',
    nodes: [
      {
        id: 'webhook_1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1.1,
        position: [250, 300],
        parameters: {
          httpMethod: 'GET',
          path: 'test-webhook',
          responseMode: 'onReceived',
          responseData: 'firstEntryJson'
        }
      },
      {
        id: 'http_1',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 5.0, // Invalid - max is 4.2
        position: [450, 300],
        parameters: {
          method: 'GET',
          url: '{{ $json.webhookUrl }}', // Missing = prefix
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: 'Authorization',
                value: '{{ $json.token }}' // Missing = prefix
              }
            ]
          }
        },
        onError: 'continueErrorOutput' // Has onError but no error connections
      },
      {
        id: 'set_1',
        name: 'Set',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.5, // Invalid version
        position: [650, 300],
        parameters: {
          mode: 'manual',
          duplicateItem: false,
          values: {
            values: [
              {
                name: 'status',
                value: '{{ $json.success }}' // Missing = prefix
              }
            ]
          }
        }
      }
    ],
    connections: {
      'Webhook': {
        main: [
          [
            {
              node: 'HTTP Request',
              type: 'main',
              index: 0
            }
          ]
        ]
      },
      'HTTP Request': {
        main: [
          [
            {
              node: 'Set',
              type: 'main',
              index: 0
            }
          ]
          // Missing error output connection for onError: 'continueErrorOutput'
        ]
      }
    }
  };

  logger.info('=== Testing Workflow Auto-Fixer ===\n');

  // Step 1: Validate the workflow to identify issues
  logger.info('Step 1: Validating workflow to identify issues...');
  const validator = new WorkflowValidator(repository, EnhancedConfigValidator);
  const validationResult = await validator.validateWorkflow(testWorkflow as any, {
    validateNodes: true,
    validateConnections: true,
    validateExpressions: true,
    profile: 'ai-friendly'
  });

  logger.info(`Found ${validationResult.errors.length} errors and ${validationResult.warnings.length} warnings`);

  // Step 2: Check for expression format issues
  logger.info('\nStep 2: Checking for expression format issues...');
  const allFormatIssues: any[] = [];
  for (const node of testWorkflow.nodes) {
    const formatContext = {
      nodeType: node.type,
      nodeName: node.name,
      nodeId: node.id
    };

    const nodeFormatIssues = ExpressionFormatValidator.validateNodeParameters(
      node.parameters,
      formatContext
    );

    // Add node information to each format issue
    const enrichedIssues = nodeFormatIssues.map(issue => ({
      ...issue,
      nodeName: node.name,
      nodeId: node.id
    }));

    allFormatIssues.push(...enrichedIssues);
  }

  logger.info(`Found ${allFormatIssues.length} expression format issues`);

  // Debug: Show the actual format issues
  if (allFormatIssues.length > 0) {
    logger.info('\nExpression format issues found:');
    for (const issue of allFormatIssues) {
      logger.info(`  - ${issue.fieldPath}: ${issue.issueType} (${issue.severity})`);
      logger.info(`    Current: ${JSON.stringify(issue.currentValue)}`);
      logger.info(`    Fixed: ${JSON.stringify(issue.correctedValue)}`);
    }
  }

  // Step 3: Generate fixes in preview mode
  logger.info('\nStep 3: Generating fixes (preview mode)...');
  const autoFixer = new WorkflowAutoFixer();
  const previewResult = await autoFixer.generateFixes(
    testWorkflow as any,
    validationResult,
    allFormatIssues,
    {
      applyFixes: false, // Preview mode
      confidenceThreshold: 'medium'
    }
  );

  logger.info(`\nGenerated ${previewResult.fixes.length} fixes:`);
  logger.info(`Summary: ${previewResult.summary}`);
  logger.info('\nFixes by type:');
  for (const [type, count] of Object.entries(previewResult.stats.byType)) {
    if (count > 0) {
      logger.info(`  - ${type}: ${count}`);
    }
  }

  logger.info('\nFixes by confidence:');
  for (const [confidence, count] of Object.entries(previewResult.stats.byConfidence)) {
    if (count > 0) {
      logger.info(`  - ${confidence}: ${count}`);
    }
  }

  // Step 4: Display individual fixes
  logger.info('\nDetailed fixes:');
  for (const fix of previewResult.fixes) {
    logger.info(`\n[${fix.confidence.toUpperCase()}] ${fix.node}.${fix.field} (${fix.type})`);
    logger.info(`  Before: ${JSON.stringify(fix.before)}`);
    logger.info(`  After:  ${JSON.stringify(fix.after)}`);
    logger.info(`  Description: ${fix.description}`);
  }

  // Step 5: Display generated operations
  logger.info('\n\nGenerated diff operations:');
  for (const op of previewResult.operations) {
    logger.info(`\nOperation: ${op.type}`);
    logger.info(`  Details: ${JSON.stringify(op, null, 2)}`);
  }

  // Step 6: Test with different confidence thresholds
  logger.info('\n\n=== Testing Different Confidence Thresholds ===');

  for (const threshold of ['high', 'medium', 'low'] as const) {
    const result = await autoFixer.generateFixes(
      testWorkflow as any,
      validationResult,
      allFormatIssues,
      {
        applyFixes: false,
        confidenceThreshold: threshold
      }
    );
    logger.info(`\nThreshold "${threshold}": ${result.fixes.length} fixes`);
  }

  // Step 7: Test with specific fix types
  logger.info('\n\n=== Testing Specific Fix Types ===');

  const fixTypes = ['expression-format', 'typeversion-correction', 'error-output-config'] as const;
  for (const fixType of fixTypes) {
    const result = await autoFixer.generateFixes(
      testWorkflow as any,
      validationResult,
      allFormatIssues,
      {
        applyFixes: false,
        fixTypes: [fixType]
      }
    );
    logger.info(`\nFix type "${fixType}": ${result.fixes.length} fixes`);
  }

  logger.info('\n\n✅ Autofix test completed successfully!');

  await dbAdapter.close();
}

// Run the test
testAutofix().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});