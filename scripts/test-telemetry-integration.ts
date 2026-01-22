#!/usr/bin/env npx tsx
/**
 * Integration test for the telemetry manager
 */

import { telemetry } from '../src/telemetry/telemetry-manager';

async function testIntegration() {
  console.log('🧪 Testing Telemetry Manager Integration\n');

  // Check status
  console.log('Status:', telemetry.getStatus());

  // Track session start
  console.log('\nTracking session start...');
  telemetry.trackSessionStart();

  // Track tool usage
  console.log('Tracking tool usage...');
  telemetry.trackToolUsage('search_nodes', true, 150);
  telemetry.trackToolUsage('get_node_info', true, 75);
  telemetry.trackToolUsage('validate_workflow', false, 200);

  // Track errors
  console.log('Tracking errors...');
  telemetry.trackError('ValidationError', 'workflow_validation', 'validate_workflow', 'Required field missing: nodes array is empty');

  // Track a test workflow
  console.log('Tracking workflow creation...');
  const testWorkflow = {
    nodes: [
      {
        id: '1',
        type: 'n8n-nodes-base.webhook',
        name: 'Webhook',
        position: [0, 0],
        parameters: {
          path: '/test-webhook',
          httpMethod: 'POST'
        }
      },
      {
        id: '2',
        type: 'n8n-nodes-base.httpRequest',
        name: 'HTTP Request',
        position: [250, 0],
        parameters: {
          url: 'https://api.example.com/endpoint',
          method: 'POST',
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: 'Authorization',
                value: 'Bearer sk-1234567890abcdef'
              }
            ]
          }
        }
      },
      {
        id: '3',
        type: 'n8n-nodes-base.slack',
        name: 'Slack',
        position: [500, 0],
        parameters: {
          channel: '#notifications',
          text: 'Workflow completed!'
        }
      }
    ],
    connections: {
      '1': {
        main: [[{ node: '2', type: 'main', index: 0 }]]
      },
      '2': {
        main: [[{ node: '3', type: 'main', index: 0 }]]
      }
    }
  };

  telemetry.trackWorkflowCreation(testWorkflow, true);

  // Force flush
  console.log('\nFlushing telemetry data...');
  await telemetry.flush();

  console.log('\n✅ Telemetry integration test completed!');
  console.log('Check your Supabase dashboard for the telemetry data.');
}

testIntegration().catch(console.error);
