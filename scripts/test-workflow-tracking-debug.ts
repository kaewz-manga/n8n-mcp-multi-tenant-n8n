#!/usr/bin/env npx tsx
/**
 * Debug workflow tracking in telemetry manager
 */

import { TelemetryManager } from '../src/telemetry/telemetry-manager';

// Get the singleton instance
const telemetry = TelemetryManager.getInstance();

const testWorkflow = {
  nodes: [
    {
      id: 'webhook1',
      type: 'n8n-nodes-base.webhook',
      name: 'Webhook',
      position: [0, 0],
      parameters: { 
        path: '/test-' + Date.now(),
        httpMethod: 'POST'
      }
    },
    {
      id: 'http1',
      type: 'n8n-nodes-base.httpRequest',
      name: 'HTTP Request',
      position: [250, 0],
      parameters: { 
        url: 'https://api.example.com/data',
        method: 'GET'
      }
    },
    {
      id: 'slack1',
      type: 'n8n-nodes-base.slack',
      name: 'Slack',
      position: [500, 0],
      parameters: {
        channel: '#general',
        text: 'Workflow complete!'
      }
    }
  ],
  connections: {
    'webhook1': {
      main: [[{ node: 'http1', type: 'main', index: 0 }]]
    },
    'http1': {
      main: [[{ node: 'slack1', type: 'main', index: 0 }]]
    }
  }
};

console.log('🧪 Testing Workflow Tracking\n');
console.log('Workflow has', testWorkflow.nodes.length, 'nodes');

// Track the workflow
console.log('Calling trackWorkflowCreation...');
telemetry.trackWorkflowCreation(testWorkflow, true);

console.log('Waiting for async processing...');

// Wait for setImmediate to process
setTimeout(async () => {
  console.log('\nForcing flush...');
  await telemetry.flush();
  console.log('✅ Flush complete!');
  
  console.log('\nWorkflow should now be in the telemetry_workflows table.');
  console.log('Check with: SELECT * FROM telemetry_workflows ORDER BY created_at DESC LIMIT 1;');
}, 2000);
