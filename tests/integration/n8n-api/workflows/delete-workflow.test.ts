/**
 * Integration Tests: handleDeleteWorkflow
 *
 * Tests workflow deletion against a real n8n instance.
 * Covers successful deletion, error handling, and cleanup verification.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { createTestContext, TestContext, createTestWorkflowName } from '../utils/test-context';
import { getTestN8nClient } from '../utils/n8n-client';
import { N8nApiClient } from '../../../../src/services/n8n-api-client';
import { SIMPLE_WEBHOOK_WORKFLOW } from '../utils/fixtures';
import { cleanupOrphanedWorkflows } from '../utils/cleanup-helpers';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { handleDeleteWorkflow } from '../../../../src/mcp/handlers-n8n-manager';

describe('Integration: handleDeleteWorkflow', () => {
  let context: TestContext;
  let client: N8nApiClient;
  let mcpContext: InstanceContext;

  beforeEach(() => {
    context = createTestContext();
    client = getTestN8nClient();
    mcpContext = createMcpContext();
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
  // Successful Deletion
  // ======================================================================

  describe('Successful Deletion', () => {
    it('should delete an existing workflow', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Delete - Success'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');

      // Do NOT track workflow since we're testing deletion
      // context.trackWorkflow(created.id);

      // Delete using MCP handler
      const response = await handleDeleteWorkflow(
        { id: created.id },
        mcpContext
      );

      // Verify MCP response
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      // Verify workflow is actually deleted
      await expect(async () => {
        await client.getWorkflow(created.id!);
      }).rejects.toThrow();
    });
  });

  // ======================================================================
  // Error Handling
  // ======================================================================

  describe('Error Handling', () => {
    it('should return error for non-existent workflow ID', async () => {
      const response = await handleDeleteWorkflow(
        { id: '99999999' },
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  // ======================================================================
  // Cleanup Verification
  // ======================================================================

  describe('Cleanup Verification', () => {
    it('should verify workflow is actually deleted from n8n', async () => {
      // Create workflow
      const workflow = {
        ...SIMPLE_WEBHOOK_WORKFLOW,
        name: createTestWorkflowName('Delete - Cleanup Check'),
        tags: ['mcp-integration-test']
      };

      const created = await client.createWorkflow(workflow);
      expect(created.id).toBeTruthy();
      if (!created.id) throw new Error('Workflow ID is missing');

      // Verify workflow exists
      const beforeDelete = await client.getWorkflow(created.id);
      expect(beforeDelete.id).toBe(created.id);

      // Delete workflow
      const deleteResponse = await handleDeleteWorkflow(
        { id: created.id },
        mcpContext
      );

      expect(deleteResponse.success).toBe(true);

      // Verify workflow no longer exists
      try {
        await client.getWorkflow(created.id);
        // If we reach here, workflow wasn't deleted
        throw new Error('Workflow should have been deleted but still exists');
      } catch (error: any) {
        // Expected: workflow should not be found
        expect(error.message).toMatch(/not found|404/i);
      }
    });
  });
});
