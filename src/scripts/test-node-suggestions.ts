#!/usr/bin/env npx tsx
/**
 * Test script for enhanced node type suggestions
 * Tests the NodeSimilarityService to ensure it provides helpful suggestions
 * for unknown or incorrectly typed nodes in workflows.
 */

import { createDatabaseAdapter } from '../database/database-adapter';
import { NodeRepository } from '../database/node-repository';
import { NodeSimilarityService } from '../services/node-similarity-service';
import { WorkflowValidator } from '../services/workflow-validator';
import { EnhancedConfigValidator } from '../services/enhanced-config-validator';
import { WorkflowAutoFixer } from '../services/workflow-auto-fixer';
import { Logger } from '../utils/logger';
import path from 'path';

const logger = new Logger({ prefix: '[NodeSuggestions Test]' });
const console = {
  log: (msg: string) => logger.info(msg),
  error: (msg: string, err?: any) => logger.error(msg, err)
};

async function testNodeSimilarity() {
  console.log('🔍 Testing Enhanced Node Type Suggestions\n');

  // Initialize database and services
  const dbPath = path.join(process.cwd(), 'data/nodes.db');
  const db = await createDatabaseAdapter(dbPath);
  const repository = new NodeRepository(db);
  const similarityService = new NodeSimilarityService(repository);
  const validator = new WorkflowValidator(repository, EnhancedConfigValidator);

  // Test cases with various invalid node types
  const testCases = [
    // Case variations
    { invalid: 'HttpRequest', expected: 'nodes-base.httpRequest' },
    { invalid: 'HTTPRequest', expected: 'nodes-base.httpRequest' },
    { invalid: 'Webhook', expected: 'nodes-base.webhook' },
    { invalid: 'WebHook', expected: 'nodes-base.webhook' },

    // Missing package prefix
    { invalid: 'slack', expected: 'nodes-base.slack' },
    { invalid: 'googleSheets', expected: 'nodes-base.googleSheets' },
    { invalid: 'telegram', expected: 'nodes-base.telegram' },

    // Common typos
    { invalid: 'htpRequest', expected: 'nodes-base.httpRequest' },
    { invalid: 'webook', expected: 'nodes-base.webhook' },
    { invalid: 'slak', expected: 'nodes-base.slack' },

    // Partial names
    { invalid: 'http', expected: 'nodes-base.httpRequest' },
    { invalid: 'sheet', expected: 'nodes-base.googleSheets' },

    // Wrong package prefix
    { invalid: 'nodes-base.openai', expected: 'nodes-langchain.openAi' },
    { invalid: 'n8n-nodes-base.httpRequest', expected: 'nodes-base.httpRequest' },

    // Complete unknowns
    { invalid: 'foobar', expected: null },
    { invalid: 'xyz123', expected: null },
  ];

  console.log('Testing individual node type suggestions:');
  console.log('=' .repeat(60));

  for (const testCase of testCases) {
    const suggestions = await similarityService.findSimilarNodes(testCase.invalid, 3);

    console.log(`\n❌ Invalid type: "${testCase.invalid}"`);

    if (suggestions.length > 0) {
      console.log('✨ Suggestions:');
      for (const suggestion of suggestions) {
        const confidence = Math.round(suggestion.confidence * 100);
        const marker = suggestion.nodeType === testCase.expected ? '✅' : '  ';
        console.log(
          `${marker} ${suggestion.nodeType} (${confidence}% match) - ${suggestion.reason}`
        );

        if (suggestion.confidence >= 0.9) {
          console.log('   💡 Can be auto-fixed!');
        }
      }

      // Check if expected match was found
      if (testCase.expected) {
        const found = suggestions.some(s => s.nodeType === testCase.expected);
        if (!found) {
          console.log(`   ⚠️  Expected "${testCase.expected}" was not suggested!`);
        }
      }
    } else {
      console.log('   No suggestions found');
      if (testCase.expected) {
        console.log(`   ⚠️  Expected "${testCase.expected}" was not suggested!`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Testing workflow validation with unknown nodes:');
  console.log('='.repeat(60));

  // Test with a sample workflow
  const testWorkflow = {
    id: 'test-workflow',
    name: 'Test Workflow',
    nodes: [
      {
        id: '1',
        name: 'Start',
        type: 'nodes-base.manualTrigger',
        position: [100, 100] as [number, number],
        parameters: {},
        typeVersion: 1
      },
      {
        id: '2',
        name: 'HTTP Request',
        type: 'HTTPRequest', // Wrong capitalization
        position: [300, 100] as [number, number],
        parameters: {},
        typeVersion: 1
      },
      {
        id: '3',
        name: 'Slack',
        type: 'slack', // Missing prefix
        position: [500, 100] as [number, number],
        parameters: {},
        typeVersion: 1
      },
      {
        id: '4',
        name: 'Unknown',
        type: 'foobar', // Completely unknown
        position: [700, 100] as [number, number],
        parameters: {},
        typeVersion: 1
      }
    ],
    connections: {
      'Start': {
        main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
      },
      'HTTP Request': {
        main: [[{ node: 'Slack', type: 'main', index: 0 }]]
      },
      'Slack': {
        main: [[{ node: 'Unknown', type: 'main', index: 0 }]]
      }
    },
    settings: {}
  };

  const validationResult = await validator.validateWorkflow(testWorkflow as any, {
    validateNodes: true,
    validateConnections: false,
    validateExpressions: false,
    profile: 'runtime'
  });

  console.log('\nValidation Results:');
  for (const error of validationResult.errors) {
    if (error.message?.includes('Unknown node type:')) {
      console.log(`\n🔴 ${error.nodeName}: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n🔧 Testing AutoFixer with node type corrections:');
  console.log('='.repeat(60));

  const autoFixer = new WorkflowAutoFixer(repository);
  const fixResult = await autoFixer.generateFixes(
    testWorkflow as any,
    validationResult,
    [],
    {
      applyFixes: false,
      fixTypes: ['node-type-correction'],
      confidenceThreshold: 'high'
    }
  );

  if (fixResult.fixes.length > 0) {
    console.log('\n✅ Auto-fixable issues found:');
    for (const fix of fixResult.fixes) {
      console.log(`   • ${fix.description}`);
    }
    console.log(`\nSummary: ${fixResult.summary}`);
  } else {
    console.log('\n❌ No auto-fixable node type issues found (only high-confidence fixes are applied)');
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✨ Test complete!');
}

// Run the test
testNodeSimilarity().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});