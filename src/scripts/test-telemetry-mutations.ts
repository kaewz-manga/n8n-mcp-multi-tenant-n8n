/**
 * Test telemetry mutations
 * Verifies that mutations are properly tracked and persisted
 */

import { telemetry } from '../telemetry/telemetry-manager.js';
import { TelemetryConfigManager } from '../telemetry/config-manager.js';

async function testMutations() {
  console.log('Starting telemetry mutation test...\n');

  const configManager = TelemetryConfigManager.getInstance();

  console.log('Telemetry Status:');
  console.log('================');
  console.log(configManager.getStatus());
  console.log('\n');

  // Get initial metrics
  const metricsAfterInit = telemetry.getMetrics();
  console.log('Telemetry Metrics (After Init):');
  console.log('================================');
  console.log(JSON.stringify(metricsAfterInit, null, 2));
  console.log('\n');

  // Test data mimicking actual mutation with valid workflow structure
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

  console.log('Test Mutation Data:');
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

  // Flush telemetry
  console.log('Flushing telemetry...');
  try {
    await telemetry.flush();
    console.log('✓ Telemetry flushed successfully\n');
  } catch (error) {
    console.error('✗ Flush failed:', error);
    console.error('\n');
  }

  // Get final metrics
  const metricsAfterFlush = telemetry.getMetrics();
  console.log('Telemetry Metrics (After Flush):');
  console.log('==================================');
  console.log(JSON.stringify(metricsAfterFlush, null, 2));
  console.log('\n');

  console.log('Test completed. Check workflow_mutations table in Supabase.');
}

testMutations().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
