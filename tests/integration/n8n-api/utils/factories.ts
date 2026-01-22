/**
 * Test Data Factories
 *
 * Provides factory functions for generating test data dynamically.
 * Useful for creating variations of workflows, nodes, and parameters.
 */

import { Workflow, WorkflowNode } from '../../../../src/types/n8n-api';
import { createTestWorkflowName } from './test-context';

/**
 * Create a webhook node with custom parameters
 *
 * @param options - Node options
 * @returns WorkflowNode
 */
export function createWebhookNode(options: {
  id?: string;
  name?: string;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path?: string;
  position?: [number, number];
  responseMode?: 'onReceived' | 'lastNode';
}): WorkflowNode {
  return {
    id: options.id || `webhook-${Date.now()}`,
    name: options.name || 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: options.position || [250, 300],
    parameters: {
      httpMethod: options.httpMethod || 'GET',
      path: options.path || `test-${Date.now()}`,
      responseMode: options.responseMode || 'lastNode'
    }
  };
}

/**
 * Create an HTTP Request node with custom parameters
 *
 * @param options - Node options
 * @returns WorkflowNode
 */
export function createHttpRequestNode(options: {
  id?: string;
  name?: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  position?: [number, number];
  authentication?: string;
}): WorkflowNode {
  return {
    id: options.id || `http-${Date.now()}`,
    name: options.name || 'HTTP Request',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: options.position || [450, 300],
    parameters: {
      url: options.url || 'https://httpbin.org/get',
      method: options.method || 'GET',
      authentication: options.authentication || 'none'
    }
  };
}

/**
 * Create a Set node with custom assignments
 *
 * @param options - Node options
 * @returns WorkflowNode
 */
export function createSetNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
  assignments?: Array<{
    name: string;
    value: any;
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  }>;
}): WorkflowNode {
  const assignments = options.assignments || [
    { name: 'key', value: 'value', type: 'string' as const }
  ];

  return {
    id: options.id || `set-${Date.now()}`,
    name: options.name || 'Set',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: options.position || [450, 300],
    parameters: {
      assignments: {
        assignments: assignments.map((a, idx) => ({
          id: `assign-${idx}`,
          name: a.name,
          value: a.value,
          type: a.type || 'string'
        }))
      },
      options: {}
    }
  };
}

/**
 * Create a Manual Trigger node
 *
 * @param options - Node options
 * @returns WorkflowNode
 */
export function createManualTriggerNode(options: {
  id?: string;
  name?: string;
  position?: [number, number];
} = {}): WorkflowNode {
  return {
    id: options.id || `manual-${Date.now()}`,
    name: options.name || 'When clicking "Test workflow"',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: options.position || [250, 300],
    parameters: {}
  };
}

/**
 * Create a simple connection between two nodes
 *
 * @param from - Source node name
 * @param to - Target node name
 * @param options - Connection options
 * @returns Connection object
 */
export function createConnection(
  from: string,
  to: string,
  options: {
    sourceOutput?: string;
    targetInput?: string;
    sourceIndex?: number;
    targetIndex?: number;
  } = {}
): Record<string, any> {
  const sourceOutput = options.sourceOutput || 'main';
  const targetInput = options.targetInput || 'main';
  const sourceIndex = options.sourceIndex || 0;
  const targetIndex = options.targetIndex || 0;

  return {
    [from]: {
      [sourceOutput]: [
        [
          {
            node: to,
            type: targetInput,
            index: targetIndex
          }
        ]
      ]
    }
  };
}

/**
 * Create a workflow from nodes with automatic connections
 *
 * Connects nodes in sequence: node1 -> node2 -> node3, etc.
 *
 * @param name - Workflow name
 * @param nodes - Array of nodes
 * @returns Partial workflow
 */
export function createSequentialWorkflow(
  name: string,
  nodes: WorkflowNode[]
): Partial<Workflow> {
  const connections: Record<string, any> = {};

  // Create connections between sequential nodes
  for (let i = 0; i < nodes.length - 1; i++) {
    const currentNode = nodes[i];
    const nextNode = nodes[i + 1];

    connections[currentNode.name] = {
      main: [[{ node: nextNode.name, type: 'main', index: 0 }]]
    };
  }

  return {
    name: createTestWorkflowName(name),
    nodes,
    connections,
    settings: {
      executionOrder: 'v1'
    }
  };
}

/**
 * Create a workflow with parallel branches
 *
 * Creates a workflow with one trigger node that splits into multiple
 * parallel execution paths.
 *
 * @param name - Workflow name
 * @param trigger - Trigger node
 * @param branches - Array of branch nodes
 * @returns Partial workflow
 */
export function createParallelWorkflow(
  name: string,
  trigger: WorkflowNode,
  branches: WorkflowNode[]
): Partial<Workflow> {
  const connections: Record<string, any> = {
    [trigger.name]: {
      main: [branches.map(node => ({ node: node.name, type: 'main', index: 0 }))]
    }
  };

  return {
    name: createTestWorkflowName(name),
    nodes: [trigger, ...branches],
    connections,
    settings: {
      executionOrder: 'v1'
    }
  };
}

/**
 * Generate a random string for test data
 *
 * @param length - String length (default: 8)
 * @returns Random string
 */
export function randomString(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique ID for testing
 *
 * @param prefix - Optional prefix
 * @returns Unique ID
 */
export function uniqueId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${randomString(4)}`;
}

/**
 * Create a workflow with error handling
 *
 * @param name - Workflow name
 * @param mainNode - Main processing node
 * @param errorNode - Error handling node
 * @returns Partial workflow with error handling configured
 */
export function createErrorHandlingWorkflow(
  name: string,
  mainNode: WorkflowNode,
  errorNode: WorkflowNode
): Partial<Workflow> {
  const trigger = createWebhookNode({
    name: 'Trigger',
    position: [250, 300]
  });

  // Configure main node for error handling
  const mainNodeWithError = {
    ...mainNode,
    continueOnFail: true,
    onError: 'continueErrorOutput' as const
  };

  const connections: Record<string, any> = {
    [trigger.name]: {
      main: [[{ node: mainNode.name, type: 'main', index: 0 }]]
    },
    [mainNode.name]: {
      error: [[{ node: errorNode.name, type: 'main', index: 0 }]]
    }
  };

  return {
    name: createTestWorkflowName(name),
    nodes: [trigger, mainNodeWithError, errorNode],
    connections,
    settings: {
      executionOrder: 'v1'
    }
  };
}

/**
 * Create test workflow tags
 *
 * @param additional - Additional tags to include
 * @returns Array of tags for test workflows
 */
export function createTestTags(additional: string[] = []): string[] {
  return ['mcp-integration-test', ...additional];
}

/**
 * Create workflow settings with common test configurations
 *
 * @param overrides - Settings to override
 * @returns Workflow settings object
 */
export function createWorkflowSettings(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    executionOrder: 'v1',
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'all',
    saveManualExecutions: true,
    ...overrides
  };
}
