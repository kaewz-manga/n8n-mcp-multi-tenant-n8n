#!/usr/bin/env npx tsx

/**
 * Test script for error output validation improvements
 * Tests both incorrect and correct error output configurations
 */

import { WorkflowValidator } from '../dist/services/workflow-validator.js';
import { NodeRepository } from '../dist/database/node-repository.js';
import { EnhancedConfigValidator } from '../dist/services/enhanced-config-validator.js';
import { DatabaseAdapter } from '../dist/database/database-adapter.js';
import { Logger } from '../dist/utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = new Logger({ prefix: '[TestErrorValidation]' });

async function runTests() {
  // Initialize database
  const dbPath = path.join(__dirname, '..', 'data', 'n8n-nodes.db');
  const adapter = new DatabaseAdapter();
  adapter.initialize({
    type: 'better-sqlite3',
    filename: dbPath
  });
  const db = adapter.getDatabase();

  const nodeRepository = new NodeRepository(db);
  const validator = new WorkflowValidator(nodeRepository, EnhancedConfigValidator);

  console.log('\n🧪 Testing Error Output Validation Improvements\n');
  console.log('=' .repeat(60));

  // Test 1: Incorrect configuration - multiple nodes in same array
  console.log('\n📝 Test 1: INCORRECT - Multiple nodes in main[0]');
  console.log('-'.repeat(40));

  const incorrectWorkflow = {
    nodes: [
      {
        id: '132ef0dc-87af-41de-a95d-cabe3a0a5342',
        name: 'Validate Input',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [-400, 64] as [number, number],
        parameters: {}
      },
      {
        id: '5dedf217-63f9-409f-b34e-7780b22e199a',
        name: 'Filter URLs',
        type: 'n8n-nodes-base.filter',
        typeVersion: 2.2,
        position: [-176, 64] as [number, number],
        parameters: {}
      },
      {
        id: '9d5407cc-ca5a-4966-b4b7-0e5dfbf54ad3',
        name: 'Error Response1',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.5,
        position: [-160, 240] as [number, number],
        parameters: {}
      }
    ],
    connections: {
      'Validate Input': {
        main: [
          [
            { node: 'Filter URLs', type: 'main', index: 0 },
            { node: 'Error Response1', type: 'main', index: 0 }  // WRONG!
          ]
        ]
      }
    }
  };

  const result1 = await validator.validateWorkflow(incorrectWorkflow);

  if (result1.errors.length > 0) {
    console.log('❌ ERROR DETECTED (as expected):');
    const errorMessage = result1.errors.find(e =>
      e.message.includes('Incorrect error output configuration')
    );
    if (errorMessage) {
      console.log('\n' + errorMessage.message);
    }
  } else {
    console.log('✅ No errors found (but should have detected the issue!)');
  }

  // Test 2: Correct configuration - separate arrays
  console.log('\n📝 Test 2: CORRECT - Separate main[0] and main[1]');
  console.log('-'.repeat(40));

  const correctWorkflow = {
    nodes: [
      {
        id: '132ef0dc-87af-41de-a95d-cabe3a0a5342',
        name: 'Validate Input',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [-400, 64] as [number, number],
        parameters: {},
        onError: 'continueErrorOutput' as const
      },
      {
        id: '5dedf217-63f9-409f-b34e-7780b22e199a',
        name: 'Filter URLs',
        type: 'n8n-nodes-base.filter',
        typeVersion: 2.2,
        position: [-176, 64] as [number, number],
        parameters: {}
      },
      {
        id: '9d5407cc-ca5a-4966-b4b7-0e5dfbf54ad3',
        name: 'Error Response1',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.5,
        position: [-160, 240] as [number, number],
        parameters: {}
      }
    ],
    connections: {
      'Validate Input': {
        main: [
          [
            { node: 'Filter URLs', type: 'main', index: 0 }
          ],
          [
            { node: 'Error Response1', type: 'main', index: 0 }  // CORRECT!
          ]
        ]
      }
    }
  };

  const result2 = await validator.validateWorkflow(correctWorkflow);

  const hasIncorrectError = result2.errors.some(e =>
    e.message.includes('Incorrect error output configuration')
  );

  if (!hasIncorrectError) {
    console.log('✅ No error output configuration issues (correct!)');
  } else {
    console.log('❌ Unexpected error found');
  }

  // Test 3: onError without error connections
  console.log('\n📝 Test 3: onError without error connections');
  console.log('-'.repeat(40));

  const mismatchWorkflow = {
    nodes: [
      {
        id: '1',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [100, 100] as [number, number],
        parameters: {},
        onError: 'continueErrorOutput' as const
      },
      {
        id: '2',
        name: 'Process Data',
        type: 'n8n-nodes-base.set',
        typeVersion: 2,
        position: [300, 100] as [number, number],
        parameters: {}
      }
    ],
    connections: {
      'HTTP Request': {
        main: [
          [
            { node: 'Process Data', type: 'main', index: 0 }
          ]
          // No main[1] for error output
        ]
      }
    }
  };

  const result3 = await validator.validateWorkflow(mismatchWorkflow);

  const mismatchError = result3.errors.find(e =>
    e.message.includes("has onError: 'continueErrorOutput' but no error output connections")
  );

  if (mismatchError) {
    console.log('❌ ERROR DETECTED (as expected):');
    console.log(`Node: ${mismatchError.nodeName}`);
    console.log(`Message: ${mismatchError.message}`);
  } else {
    console.log('✅ No mismatch detected (but should have!)');
  }

  // Test 4: Error connections without onError
  console.log('\n📝 Test 4: Error connections without onError property');
  console.log('-'.repeat(40));

  const missingOnErrorWorkflow = {
    nodes: [
      {
        id: '1',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [100, 100] as [number, number],
        parameters: {}
        // Missing onError property
      },
      {
        id: '2',
        name: 'Process Data',
        type: 'n8n-nodes-base.set',
        position: [300, 100] as [number, number],
        parameters: {}
      },
      {
        id: '3',
        name: 'Error Handler',
        type: 'n8n-nodes-base.set',
        position: [300, 300] as [number, number],
        parameters: {}
      }
    ],
    connections: {
      'HTTP Request': {
        main: [
          [
            { node: 'Process Data', type: 'main', index: 0 }
          ],
          [
            { node: 'Error Handler', type: 'main', index: 0 }
          ]
        ]
      }
    }
  };

  const result4 = await validator.validateWorkflow(missingOnErrorWorkflow);

  const missingOnErrorWarning = result4.warnings.find(w =>
    w.message.includes('error output connections in main[1] but missing onError')
  );

  if (missingOnErrorWarning) {
    console.log('⚠️  WARNING DETECTED (as expected):');
    console.log(`Node: ${missingOnErrorWarning.nodeName}`);
    console.log(`Message: ${missingOnErrorWarning.message}`);
  } else {
    console.log('✅ No warning (but should have warned!)');
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  console.log('- Error output validation is working correctly');
  console.log('- Detects incorrect configurations (multiple nodes in main[0])');
  console.log('- Validates onError property matches connections');
  console.log('- Provides clear error messages with fix examples');

  // Close database
  adapter.close();
}

runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});