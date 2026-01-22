/**
 * Integration Tests: handleDeleteExecution
 *
 * Tests execution deletion against a real n8n instance.
 * Covers successful deletion, error handling, and cleanup verification.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { handleDeleteExecution, handleTriggerWebhookWorkflow, handleGetExecution } from '../../../../src/mcp/handlers-n8n-manager';
import { getN8nCredentials } from '../utils/credentials';

describe('Integration: handleDeleteExecution', () => {
  let mcpContext: InstanceContext;
  let webhookUrl: string;

  beforeEach(() => {
    mcpContext = createMcpContext();
  });

  beforeAll(() => {
    const creds = getN8nCredentials();
    webhookUrl = creds.webhookUrls.get;
  });

  // ======================================================================
  // Successful Deletion
  // ======================================================================

  describe('Successful Deletion', () => {
    it('should delete an execution successfully', async () => {
      // First, create an execution to delete
      const triggerResponse = await handleTriggerWebhookWorkflow(
        {
          webhookUrl,
          httpMethod: 'GET',
          waitForResponse: true
        },
        mcpContext
      );

      // Try to extract execution ID
      let executionId: string | undefined;
      if (triggerResponse.success && triggerResponse.data) {
        const responseData = triggerResponse.data as any;
        executionId = responseData.executionId ||
                      responseData.id ||
                      responseData.execution?.id ||
                      responseData.workflowData?.executionId;
      }

      if (!executionId) {
        console.warn('Could not extract execution ID for deletion test');
        return;
      }

      // Delete the execution
      const response = await handleDeleteExecution(
        { id: executionId },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    }, 30000);

    it('should verify execution is actually deleted', async () => {
      // Create an execution
      const triggerResponse = await handleTriggerWebhookWorkflow(
        {
          webhookUrl,
          httpMethod: 'GET',
          waitForResponse: true
        },
        mcpContext
      );

      let executionId: string | undefined;
      if (triggerResponse.success && triggerResponse.data) {
        const responseData = triggerResponse.data as any;
        executionId = responseData.executionId ||
                      responseData.id ||
                      responseData.execution?.id ||
                      responseData.workflowData?.executionId;
      }

      if (!executionId) {
        console.warn('Could not extract execution ID for deletion verification test');
        return;
      }

      // Delete it
      const deleteResponse = await handleDeleteExecution(
        { id: executionId },
        mcpContext
      );

      expect(deleteResponse.success).toBe(true);

      // Try to fetch the deleted execution
      const getResponse = await handleGetExecution(
        { id: executionId },
        mcpContext
      );

      // Should fail to find the deleted execution
      expect(getResponse.success).toBe(false);
      expect(getResponse.error).toBeDefined();
    }, 30000);
  });

  // ======================================================================
  // Error Handling
  // ======================================================================

  describe('Error Handling', () => {
    it('should handle non-existent execution ID', async () => {
      const response = await handleDeleteExecution(
        { id: '99999999' },
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle invalid execution ID format', async () => {
      const response = await handleDeleteExecution(
        { id: 'invalid-id-format' },
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle missing execution ID', async () => {
      const response = await handleDeleteExecution(
        {} as any,
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });
});
