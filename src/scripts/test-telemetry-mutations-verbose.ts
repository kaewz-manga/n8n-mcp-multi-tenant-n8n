/**
 * Test telemetry mutations with enhanced logging
 * Verifies that mutations are properly tracked and persisted
 */

import { telemetry } from '../telemetry/telemetry-manager.js';
import { TelemetryConfigManager } from '../telemetry/config-manager.js';
import { logger } from '../utils/logger.js';

async function testMutations() {
  console.log('Starting verbose telemetry mutation test...\n');

  const configManager = TelemetryConfigManager.getInstance();
  console.log('Telemetry config is enabled:', configManager.isEnabled());
  console.log('Telemetry config file:', configManager['configPath']);

  // Test data with valid workflow structure
  const testMutation = {
    sessionId: 'test_session_' + Date.now(),
    toolName: 'n8n_update_partial_workflow',
    userIntent: 'Add a Merge node for data consolidation',
    operations: [
      {
        type: 'addNode',
        nodeId: 'Merge1',
        node: {
          id: 'Merge1',
          type: 'n8n-nodes-base.merge',
          name: 'Merge',
          position: [600, 200],
          parameters: {}
        }
      },
      {
        type: 'addConnection',
        source: 'previous_node',
        target: 'Merge1'
      }
    ],
    workflowBefore: {
      id: 'test-workflow',
      name: 'Test Workflow',
      active: true,
      nodes: [
        {
          id: 'previous_node',
          type: 'n8n-nodes-base.manualTrigger',
          name: 'When called',
          position: [300, 200],
          parameters: {}
        }
      ],
      connections: {},
      nodeIds: []
    },
    workflowAfter: {
      id: 'test-workflow',
      name: 'Test Workflow',
      active: true,
      nodes: [
        {
          id: 'previous_node',
          type: 'n8n-nodes-base.manualTrigger',
          name: 'When called',
          position: [300, 200],
          parameters: {}
        },
        {
          id: 'Merge1',
          type: 'n8n-nodes-base.merge',
          name: 'Merge',
          position: [600, 200],
          parameters: {}
        }
      ],
      connections: {
        'previous_node': [
          {
            node: 'Merge1',
            type: 'main',
            index: 0,
            source: 0,
            destination: 0
          }
        ]
      },
      nodeIds: []
    },
    mutationSuccess: true,
    durationMs: 125
  };

  console.log('\nTest Mutation Data:');
  console.log('==================');
  console.log(JSON.stringify({
    intent: testMutation.userIntent,
    tool: testMutation.toolName,
    operationCount: testMutation.operations.length,
    sessionId: testMutation.sessionId
  }, null, 2));
  console.log('\n');

  // Call trackWorkflowMutation
  console.log('Calling telemetry.trackWorkflowMutation...');
  try {
    await telemetry.trackWorkflowMutation(testMutation);
    console.log('✓ trackWorkflowMutation completed successfully\n');
  } catch (error) {
    console.error('✗ trackWorkflowMutation failed:', error);
    console.error('\n');
  }

  // Check queue size before flush
  const metricsBeforeFlush = telemetry.getMetrics();
  console.log('Metrics before flush:');
  console.log('- mutationQueueSize:', metricsBeforeFlush.tracking.mutationQueueSize);
  console.log('- eventsTracked:', metricsBeforeFlush.processing.eventsTracked);
  console.log('- eventsFailed:', metricsBeforeFlush.processing.eventsFailed);
  console.log('\n');

  // Flush telemetry with 10-second wait for Supabase
  console.log('Flushing telemetry (waiting 10 seconds for Supabase)...');
  try {
    await telemetry.flush();
    console.log('✓ Telemetry flush completed\n');
  } catch (error) {
    console.error('✗ Flush failed:', error);
    console.error('\n');
  }

  // Wait a bit for async operations
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get final metrics
  const metricsAfterFlush = telemetry.getMetrics();
  console.log('Metrics after flush:');
  console.log('- mutationQueueSize:', metricsAfterFlush.tracking.mutationQueueSize);
  console.log('- eventsTracked:', metricsAfterFlush.processing.eventsTracked);
  console.log('- eventsFailed:', metricsAfterFlush.processing.eventsFailed);
  console.log('- batchesSent:', metricsAfterFlush.processing.batchesSent);
  console.log('- batchesFailed:', metricsAfterFlush.processing.batchesFailed);
  console.log('- circuitBreakerState:', metricsAfterFlush.processing.circuitBreakerState);
  console.log('\n');

  console.log('Test completed. Check workflow_mutations table in Supabase.');
}

testMutations().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
