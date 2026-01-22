/**
 * Webhook Workflow Configuration
 *
 * Provides configuration and setup instructions for webhook workflows
 * required for integration testing.
 *
 * These workflows must be created manually in n8n and activated because
 * the n8n API doesn't support workflow activation.
 */

import { Workflow, WorkflowNode } from '../../../../src/types/n8n-api';

export interface WebhookWorkflowConfig {
  name: string;
  description: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  nodes: Array<Partial<WorkflowNode>>;
  connections: Record<string, any>;
}

/**
 * Configuration for required webhook workflows
 */
export const WEBHOOK_WORKFLOW_CONFIGS: Record<string, WebhookWorkflowConfig> = {
  GET: {
    name: '[MCP-TEST] Webhook GET',
    description: 'Pre-activated webhook for GET method testing',
    httpMethod: 'GET',
    path: 'mcp-test-get',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [250, 300],
        parameters: {
          httpMethod: 'GET',
          path: 'mcp-test-get',
          responseMode: 'lastNode',
          options: {}
        }
      },
      {
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [450, 300],
        parameters: {
          options: {}
        }
      }
    ],
    connections: {
      Webhook: {
        main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]]
      }
    }
  },
  POST: {
    name: '[MCP-TEST] Webhook POST',
    description: 'Pre-activated webhook for POST method testing',
    httpMethod: 'POST',
    path: 'mcp-test-post',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [250, 300],
        parameters: {
          httpMethod: 'POST',
          path: 'mcp-test-post',
          responseMode: 'lastNode',
          options: {}
        }
      },
      {
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [450, 300],
        parameters: {
          options: {}
        }
      }
    ],
    connections: {
      Webhook: {
        main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]]
      }
    }
  },
  PUT: {
    name: '[MCP-TEST] Webhook PUT',
    description: 'Pre-activated webhook for PUT method testing',
    httpMethod: 'PUT',
    path: 'mcp-test-put',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [250, 300],
        parameters: {
          httpMethod: 'PUT',
          path: 'mcp-test-put',
          responseMode: 'lastNode',
          options: {}
        }
      },
      {
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [450, 300],
        parameters: {
          options: {}
        }
      }
    ],
    connections: {
      Webhook: {
        main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]]
      }
    }
  },
  DELETE: {
    name: '[MCP-TEST] Webhook DELETE',
    description: 'Pre-activated webhook for DELETE method testing',
    httpMethod: 'DELETE',
    path: 'mcp-test-delete',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [250, 300],
        parameters: {
          httpMethod: 'DELETE',
          path: 'mcp-test-delete',
          responseMode: 'lastNode',
          options: {}
        }
      },
      {
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [450, 300],
        parameters: {
          options: {}
        }
      }
    ],
    connections: {
      Webhook: {
        main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]]
      }
    }
  }
};

/**
 * Print setup instructions for webhook workflows
 */
export function printSetupInstructions(): void {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  WEBHOOK WORKFLOW SETUP REQUIRED                               ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Integration tests require 4 pre-activated webhook workflows:  ║
║                                                                ║
║  1. Create workflows manually in n8n UI                        ║
║  2. Use the configurations shown below                         ║
║  3. ACTIVATE each workflow in n8n UI                           ║
║  4. Copy workflow IDs to .env file                             ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

Required workflows:
`);

  Object.entries(WEBHOOK_WORKFLOW_CONFIGS).forEach(([method, config]) => {
    console.log(`
${method} Method:
  Name: ${config.name}
  Path: ${config.path}
  .env variable: N8N_TEST_WEBHOOK_${method}_ID

  Workflow Structure:
    1. Webhook node (${method} method, path: ${config.path})
    2. Respond to Webhook node

  After creating:
    1. Save the workflow
    2. ACTIVATE the workflow (toggle in UI)
    3. Copy the workflow ID
    4. Add to .env: N8N_TEST_WEBHOOK_${method}_ID=<workflow-id>
`);
  });

  console.log(`
See docs/local/integration-testing-plan.md for detailed instructions.
`);
}

/**
 * Generate workflow JSON for a webhook workflow
 *
 * @param method - HTTP method
 * @returns Partial workflow ready to create
 */
export function generateWebhookWorkflowJson(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
): Partial<Workflow> {
  const config = WEBHOOK_WORKFLOW_CONFIGS[method];

  return {
    name: config.name,
    nodes: config.nodes as any,
    connections: config.connections,
    active: false, // Will need to be activated manually
    settings: {
      executionOrder: 'v1'
    },
    tags: ['mcp-integration-test', 'webhook-test']
  };
}

/**
 * Export all webhook workflow JSONs
 *
 * Returns an object with all 4 webhook workflow configurations
 * ready to be created in n8n.
 *
 * @returns Object with workflow configurations
 */
export function exportAllWebhookWorkflows(): Record<string, Partial<Workflow>> {
  return {
    GET: generateWebhookWorkflowJson('GET'),
    POST: generateWebhookWorkflowJson('POST'),
    PUT: generateWebhookWorkflowJson('PUT'),
    DELETE: generateWebhookWorkflowJson('DELETE')
  };
}

/**
 * Get webhook URL for a given n8n instance and HTTP method
 *
 * @param n8nUrl - n8n instance URL
 * @param method - HTTP method
 * @returns Webhook URL
 */
export function getWebhookUrl(
  n8nUrl: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
): string {
  const config = WEBHOOK_WORKFLOW_CONFIGS[method];
  const baseUrl = n8nUrl.replace(/\/$/, ''); // Remove trailing slash
  return `${baseUrl}/webhook/${config.path}`;
}

/**
 * Validate webhook workflow structure
 *
 * Checks if a workflow matches the expected webhook workflow structure.
 *
 * @param workflow - Workflow to validate
 * @param method - Expected HTTP method
 * @returns true if valid
 */
export function isValidWebhookWorkflow(
  workflow: Partial<Workflow>,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
): boolean {
  if (!workflow.nodes || workflow.nodes.length < 1) {
    return false;
  }

  const webhookNode = workflow.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
  if (!webhookNode) {
    return false;
  }

  const params = webhookNode.parameters as any;
  return params.httpMethod === method;
}
