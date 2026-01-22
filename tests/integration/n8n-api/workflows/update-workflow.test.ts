/**
 * Integration Tests: handleUpdateWorkflow
 *
 * Tests full workflow updates against a real n8n instance.
 * Covers various update scenarios including nodes, connections, settings, and tags.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { createTestContext, TestContext, createTestWorkflowName } from '../utils/test-context';
import { getTestN8nClient } from '../utils/n8n-client';
import { N8nApiClient } from '../../../../src/services/n8n-api-client';
import { SIMPLE_WEBHOOK_WORKFLOW, SIMPLE_HTTP_WORKFLOW } from '../utils/fixtures';
import { cleanupOrphanedWorkflows } from '../utils/cleanup-helpers';
import { createMcpContext, getMcpRepository } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { NodeRepository } from '../../../../src/database/node-repository';
import { handleUpdateWorkflow } from '../../../../src/mcp/handlers-n8n-manager';

describe('Integration: handleUpdateWorkflow', () => {
  let context: TestContext;
  let client: N8nApiClient;
  let mcpContext: InstanceContext;
  let repository: NodeRepository;

  beforeEach(async () => {
    context = createTestContext();
    client = getTestN8nClient();
    mcpContext = createMcpContext();
    repository = await getMcpRepository();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  afterAll(async () => {
    if (!process.env.CI) {
      await cleanupOrphanedWorkflows();
    }
  });

  // ======================================================================
  // Full Workflow Replacement
  // ======================================================================

  describe('Full Workflow Replacement', () => {
    it('should replace entire workflow with new nodes and connections', async () => {
      // Create initial simple workflow
      const initialWorkflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Full Replacement'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(initialWorkflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Replace with HTTP workflow (completely different structure)
      const replacement = {
        ...SIMPLE_HTTP_WORKFLOW,
        name: createTestWorkflowName('Update - Full Replacement (Updated)')
      };

      // Update using MCP handler
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          name: replacement.name,
          nodes: replacement.nodes,
          connections: replacement.connections
        },
        repository,
        mcpContext
      );

      // Verify MCP response - now returns minimal data
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      const updated = response.data as any;
      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe(replacement.name);
      expect(updated.nodeCount).toBe(2); // HTTP workflow has 2 nodes

      // Fetch actual workflow to verify
      const actual = await client.getWorkflow(created.id);
      expect(actual.nodes).toHaveLength(2);
    });
  });

  // ======================================================================
  // Update Nodes
  // ======================================================================

  describe('Update Nodes', () => {
    it('should update workflow nodes while preserving other properties', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Nodes Only'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Update nodes - add a second node
      const updatedNodes = [
        ...workflow.nodes!,
        {
          id: 'set-1',
          name: 'Set',
          type: 'n8n-nodes-base.set',
          typeVersion: 3.4,
          position: [450, 300] as [number, number],
          parameters: {
            assignments: {
              assignments: [
                {
                  id: 'assign-1',
                  name: 'test',
                  value: 'value',
                  type: 'string'
                }
              ]
            }
          }
        }
      ];

      const updatedConnections = {
        Webhook: {
          main: [[{ node: 'Set', type: 'main' as const, index: 0 }]]
        }
      };

      // Update using MCP handler (n8n API requires name, nodes, connections)
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          name: workflow.name,  // Required by n8n API
          nodes: updatedNodes,
          connections: updatedConnections
        },
        repository,
        mcpContext
      );

      expect(response.success).toBe(true);
      // Response now returns minimal data
      const updated = response.data as any;
      expect(updated.nodeCount).toBe(2);

      // Fetch actual workflow to verify
      const actual = await client.getWorkflow(created.id);
      expect(actual.nodes).toHaveLength(2);
      expect(actual.nodes.find((n: any) => n.name === 'Set')).toBeDefined();
    });
  });

  // ======================================================================
  // Update Settings
  // ======================================================================
  // Note: "Update Connections" test removed - empty connections invalid for multi-node workflows
  // Connection modifications are tested in update-partial-workflow.test.ts

  describe('Update Settings', () => {
    it('should update workflow settings without affecting nodes', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Settings'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Fetch current workflow (n8n API requires name, nodes, connections)
      const current = await client.getWorkflow(created.id);

      // Update settings
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          name: current.name,        // Required by n8n API
          nodes: current.nodes,      // Required by n8n API
          connections: current.connections,  // Required by n8n API
          settings: {
            executionOrder: 'v1' as const,
            timezone: 'Europe/London'
          }
        },
        repository,
        mcpContext
      );

      expect(response.success).toBe(true);
      // Response now returns minimal data
      const updated = response.data as any;
      expect(updated.nodeCount).toBe(1); // Nodes unchanged

      // Fetch actual workflow to verify
      const actual = await client.getWorkflow(created.id);
      expect(actual.nodes).toHaveLength(1);
    });
  });


  // ======================================================================
  // Validation Errors
  // ======================================================================

  describe('Validation Errors', () => {
    it('should return error for invalid node types', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Invalid Node Type'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      // Try to update with invalid node type
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          nodes: [
            {
              id: 'invalid-1',
              name: 'Invalid',
              type: 'invalid-node-type',
              typeVersion: 1,
              position: [250, 300],
              parameters: {}
            }
          ],
          connections: {}
        },
        repository,
        mcpContext
      );

      // Validation should fail
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should return error for non-existent workflow ID', async () => {
      const response = await handleUpdateWorkflow(
        {
          id: '99999999',
          name: 'Should Fail'
        },
        repository,
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  // ======================================================================
  // Update Name Only
  // ======================================================================

  describe('Update Name', () => {
    it('should update workflow name without affecting structure', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Name Original'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      const newName = createTestWorkflowName('Update - Name Modified');

      // Fetch current workflow to get required fields
      const current = await client.getWorkflow(created.id);

      // Update name (n8n API requires nodes and connections too)
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          name: newName,
          nodes: current.nodes,         // Required by n8n API
          connections: current.connections  // Required by n8n API
        },
        repository,
        mcpContext
      );

      expect(response.success).toBe(true);
      // Response now returns minimal data
      const updated = response.data as any;
      expect(updated.name).toBe(newName);
      expect(updated.nodeCount).toBe(1); // Structure unchanged

      // Fetch actual workflow to verify
      const actual = await client.getWorkflow(created.id);
      expect(actual.nodes).toHaveLength(1);
    });
  });

  // ======================================================================
  // Multiple Properties Update
  // ======================================================================

  describe('Multiple Properties', () => {
    it('should update name and settings together', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Update - Multiple Props'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');
      context.trackWorkflow(created.id);

      const newName = createTestWorkflowName('Update - Multiple Props (Modified)');

      // Fetch current workflow (n8n API requires nodes and connections)
      const current = await client.getWorkflow(created.id);

      // Update multiple properties
      const response = await handleUpdateWorkflow(
        {
          id: created.id,
          name: newName,
          nodes: current.nodes,             // Required by n8n API
          connections: current.connections, // Required by n8n API
          settings: {
            executionOrder: 'v1' as const,
            timezone: 'America/New_York'
          }
        },
        repository,
        mcpContext
      );

      expect(response.success).toBe(true);
      // Response now returns minimal data
      const updated = response.data as any;
      expect(updated.name).toBe(newName);

      // Fetch actual workflow to verify settings
      const actual = await client.getWorkflow(created.id);
      expect(actual.settings?.timezone).toBe('America/New_York');
    });
  });
});
