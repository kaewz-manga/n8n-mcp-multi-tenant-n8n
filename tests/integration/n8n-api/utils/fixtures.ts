/**
 * Workflow Fixtures for Integration Tests
 *
 * Provides reusable workflow templates for testing.
 * All fixtures use FULL node type format (n8n-nodes-base.*)
 * as required by the n8n API.
 */

import { Workflow, WorkflowNode } from '../../../../src/types/n8n-api';

/**
 * Simple webhook workflow with a single Webhook node
 *
 * Use this for basic workflow creation tests.
 */
export const SIMPLE_WEBHOOK_WORKFLOW: Partial<Workflow> = {
  nodes: [
    {
      id: 'webhook-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: 'GET',
        path: 'test-webhook'
      }
    }
  ],
  connections: {},
  settings: {
    executionOrder: 'v1'
  }
};

/**
 * Simple HTTP request workflow
 *
 * Contains a Webhook trigger and an HTTP Request node.
 * Tests basic workflow connections.
 */
export const SIMPLE_HTTP_WORKFLOW: Partial<Workflow> = {
  nodes: [
    {
      id: 'webhook-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: 'GET',
        path: 'trigger'
      }
    },
    {
      id: 'http-1',
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [450, 300],
      parameters: {
        url: 'https://httpbin.org/get',
        method: 'GET'
      }
    }
  ],
  connections: {
    Webhook: {
      main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

/**
 * Multi-node workflow with branching
 *
 * Tests complex connections and multiple execution paths.
 */
export const MULTI_NODE_WORKFLOW: Partial<Workflow> = {
  nodes: [
    {
      id: 'webhook-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: 'POST',
        path: 'multi-node'
      }
    },
    {
      id: 'set-1',
      name: 'Set 1',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [450, 200],
      parameters: {
        assignments: {
          assignments: [
            {
              id: 'assign-1',
              name: 'branch',
              value: 'top',
              type: 'string'
            }
          ]
        },
        options: {}
      }
    },
    {
      id: 'set-2',
      name: 'Set 2',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [450, 400],
      parameters: {
        assignments: {
          assignments: [
            {
              id: 'assign-2',
              name: 'branch',
              value: 'bottom',
              type: 'string'
            }
          ]
        },
        options: {}
      }
    },
    {
      id: 'merge-1',
      name: 'Merge',
      type: 'n8n-nodes-base.merge',
      typeVersion: 3,
      position: [650, 300],
      parameters: {
        mode: 'append',
        options: {}
      }
    }
  ],
  connections: {
    Webhook: {
      main: [
        [
          { node: 'Set 1', type: 'main', index: 0 },
          { node: 'Set 2', type: 'main', index: 0 }
        ]
      ]
    },
    'Set 1': {
      main: [[{ node: 'Merge', type: 'main', index: 0 }]]
    },
    'Set 2': {
      main: [[{ node: 'Merge', type: 'main', index: 1 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

/**
 * Workflow with error handling
 *
 * Tests error output configuration and error workflows.
 */
export const ERROR_HANDLING_WORKFLOW: Partial<Workflow> = {
  nodes: [
    {
      id: 'webhook-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: 'GET',
        path: 'error-test'
      }
    },
    {
      id: 'http-1',
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [450, 300],
      parameters: {
        url: 'https://httpbin.org/status/500',
        method: 'GET'
      },
      continueOnFail: true,
      onError: 'continueErrorOutput'
    },
    {
      id: 'set-error',
      name: 'Handle Error',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [650, 400],
      parameters: {
        assignments: {
          assignments: [
            {
              id: 'error-assign',
              name: 'error_handled',
              value: 'true',
              type: 'boolean'
            }
          ]
        },
        options: {}
      }
    }
  ],
  connections: {
    Webhook: {
      main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
    },
    'HTTP Request': {
      main: [[{ node: 'Handle Error', type: 'main', index: 0 }]],
      error: [[{ node: 'Handle Error', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

/**
 * AI Agent workflow (langchain nodes)
 *
 * Tests langchain node support.
 */
export const AI_AGENT_WORKFLOW: Partial<Workflow> = {
  nodes: [
    {
      id: 'manual-1',
      name: 'When clicking "Test workflow"',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {}
    },
    {
      id: 'agent-1',
      name: 'AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 1.7,
      position: [450, 300],
      parameters: {
        promptType: 'define',
        text: '={{ $json.input }}',
        options: {}
      }
    }
  ],
  connections: {
    'When clicking "Test workflow"': {
      main: [[{ node: 'AI Agent', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

/**
 * Workflow with n8n expressions
 *
 * Tests expression validation.
 */
export const EXPRESSION_WORKFLOW: Partial<Workflow> = {
  nodes: [
    {
      id: 'manual-1',
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {}
    },
    {
      id: 'set-1',
      name: 'Set Variables',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [450, 300],
      parameters: {
        assignments: {
          assignments: [
            {
              id: 'expr-1',
              name: 'timestamp',
              value: '={{ $now }}',
              type: 'string'
            },
            {
              id: 'expr-2',
              name: 'item_count',
              value: '={{ $json.items.length }}',
              type: 'number'
            },
            {
              id: 'expr-3',
              name: 'first_item',
              value: '={{ $node["Manual Trigger"].json }}',
              type: 'object'
            }
          ]
        },
        options: {}
      }
    }
  ],
  connections: {
    'Manual Trigger': {
      main: [[{ node: 'Set Variables', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

/**
 * Get a fixture by name
 *
 * @param name - Fixture name
 * @returns Workflow fixture
 */
export function getFixture(
  name:
    | 'simple-webhook'
    | 'simple-http'
    | 'multi-node'
    | 'error-handling'
    | 'ai-agent'
    | 'expression'
): Partial<Workflow> {
  const fixtures = {
    'simple-webhook': SIMPLE_WEBHOOK_WORKFLOW,
    'simple-http': SIMPLE_HTTP_WORKFLOW,
    'multi-node': MULTI_NODE_WORKFLOW,
    'error-handling': ERROR_HANDLING_WORKFLOW,
    'ai-agent': AI_AGENT_WORKFLOW,
    expression: EXPRESSION_WORKFLOW
  };

  return JSON.parse(JSON.stringify(fixtures[name])); // Deep clone
}

/**
 * Create a minimal workflow with custom nodes
 *
 * @param nodes - Array of workflow nodes
 * @param connections - Optional connections object
 * @returns Workflow fixture
 */
export function createCustomWorkflow(
  nodes: WorkflowNode[],
  connections: Record<string, any> = {}
): Partial<Workflow> {
  return {
    nodes,
    connections,
    settings: {
      executionOrder: 'v1'
    }
  };
}
