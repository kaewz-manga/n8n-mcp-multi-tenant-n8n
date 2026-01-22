#!/usr/bin/env npx tsx
/**
 * Test workflow sanitizer
 */

import { WorkflowSanitizer } from '../src/telemetry/workflow-sanitizer';

const testWorkflow = {
  nodes: [
    {
      id: 'webhook1',
      type: 'n8n-nodes-base.webhook',
      name: 'Webhook',
      position: [0, 0],
      parameters: { 
        path: '/test-webhook',
        httpMethod: 'POST'
      }
    },
    {
      id: 'http1',
      type: 'n8n-nodes-base.httpRequest',
      name: 'HTTP Request',
      position: [250, 0],
      parameters: { 
        url: 'https://api.example.com/endpoint',
        method: 'GET',
        authentication: 'genericCredentialType',
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
    }
  ],
  connections: {
    'webhook1': {
      main: [[{ node: 'http1', type: 'main', index: 0 }]]
    }
  }
};

console.log('🧪 Testing Workflow Sanitizer\n');
console.log('Original workflow has', testWorkflow.nodes.length, 'nodes');

try {
  const sanitized = WorkflowSanitizer.sanitizeWorkflow(testWorkflow);
  
  console.log('\n✅ Sanitization successful!');
  console.log('\nSanitized output:');
  console.log(JSON.stringify(sanitized, null, 2));
  
  console.log('\n📊 Metrics:');
  console.log('- Workflow Hash:', sanitized.workflowHash);
  console.log('- Node Count:', sanitized.nodeCount);
  console.log('- Node Types:', sanitized.nodeTypes);
  console.log('- Has Trigger:', sanitized.hasTrigger);
  console.log('- Has Webhook:', sanitized.hasWebhook);
  console.log('- Complexity:', sanitized.complexity);
} catch (error) {
  console.error('❌ Sanitization failed:', error);
}
