#!/usr/bin/env node

/**
 * Test script for webhook path autofixer functionality
 */

import { NodeRepository } from '../database/node-repository';
import { createDatabaseAdapter } from '../database/database-adapter';
import { WorkflowAutoFixer } from '../services/workflow-auto-fixer';
import { WorkflowValidator } from '../services/workflow-validator';
import { EnhancedConfigValidator } from '../services/enhanced-config-validator';
import { Workflow } from '../types/n8n-api';
import { Logger } from '../utils/logger';
import { join } from 'path';

const logger = new Logger({ prefix: '[TestWebhookAutofix]' });

// Test workflow with webhook missing path
const testWorkflow: Workflow = {
  id: 'test_webhook_fix',
  name: 'Test Webhook Autofix',
  active: false,
  nodes: [
    {
      id: '1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [250, 300],
      parameters: {}, // Empty parameters - missing path
    },
    {
      id: '2',
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [450, 300],
      parameters: {
        url: 'https://api.example.com/data',
        method: 'GET'
      }
    }
  ],
  connections: {
    'Webhook': {
      main: [[{
        node: 'HTTP Request',
        type: 'main',
        index: 0
      }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  },
  staticData: undefined
};

async function testWebhookAutofix() {
  logger.info('Testing webhook path autofixer...');

  // Initialize database and repository
  const dbPath = join(process.cwd(), 'data', 'nodes.db');
  const adapter = await createDatabaseAdapter(dbPath);
  const repository = new NodeRepository(adapter);

  // Create validators
  const validator = new WorkflowValidator(repository, EnhancedConfigValidator);
  const autoFixer = new WorkflowAutoFixer(repository);

  // Step 1: Validate workflow to identify issues
  logger.info('Step 1: Validating workflow to identify issues...');
  const validationResult = await validator.validateWorkflow(testWorkflow);

  console.log('\n📋 Validation Summary:');
  console.log(`- Valid: ${validationResult.valid}`);
  console.log(`- Errors: ${validationResult.errors.length}`);
  console.log(`- Warnings: ${validationResult.warnings.length}`);

  if (validationResult.errors.length > 0) {
    console.log('\n❌ Errors found:');
    validationResult.errors.forEach(error => {
      console.log(`  - [${error.nodeName || error.nodeId}] ${error.message}`);
    });
  }

  // Step 2: Generate fixes (preview mode)
  logger.info('\nStep 2: Generating fixes in preview mode...');

  const fixResult = await autoFixer.generateFixes(
    testWorkflow,
    validationResult,
    [], // No expression format issues to pass
    {
      applyFixes: false, // Preview mode
      fixTypes: ['webhook-missing-path'] // Only test webhook fixes
    }
  );

  console.log('\n🔧 Fix Results:');
  console.log(`- Summary: ${fixResult.summary}`);
  console.log(`- Total fixes: ${fixResult.stats.total}`);
  console.log(`- Webhook path fixes: ${fixResult.stats.byType['webhook-missing-path']}`);

  if (fixResult.fixes.length > 0) {
    console.log('\n📝 Detailed Fixes:');
    fixResult.fixes.forEach(fix => {
      console.log(`  - Node: ${fix.node}`);
      console.log(`    Field: ${fix.field}`);
      console.log(`    Type: ${fix.type}`);
      console.log(`    Before: ${fix.before || 'undefined'}`);
      console.log(`    After: ${fix.after}`);
      console.log(`    Confidence: ${fix.confidence}`);
      console.log(`    Description: ${fix.description}`);
    });
  }

  if (fixResult.operations.length > 0) {
    console.log('\n🔄 Operations to Apply:');
    fixResult.operations.forEach(op => {
      if (op.type === 'updateNode') {
        console.log(`  - Update Node: ${op.nodeId}`);
        console.log(`    Updates: ${JSON.stringify(op.updates, null, 2)}`);
      }
    });
  }

  // Step 3: Verify UUID format
  if (fixResult.fixes.length > 0) {
    const webhookFix = fixResult.fixes.find(f => f.type === 'webhook-missing-path');
    if (webhookFix) {
      const uuid = webhookFix.after as string;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isValidUUID = uuidRegex.test(uuid);

      console.log('\n✅ UUID Validation:');
      console.log(`  - Generated UUID: ${uuid}`);
      console.log(`  - Valid format: ${isValidUUID ? 'Yes' : 'No'}`);
    }
  }

  logger.info('\n✨ Webhook autofix test completed successfully!');
}

// Run test
testWebhookAutofix().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});