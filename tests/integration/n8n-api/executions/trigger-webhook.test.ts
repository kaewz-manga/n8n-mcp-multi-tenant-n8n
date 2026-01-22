/**
 * Integration Tests: handleTriggerWebhookWorkflow
 *
 * Tests webhook triggering against a real n8n instance.
 * Covers all HTTP methods, request data, headers, and error handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';
import { handleTriggerWebhookWorkflow } from '../../../../src/mcp/handlers-n8n-manager';
import { getN8nCredentials } from '../utils/credentials';

describe('Integration: handleTriggerWebhookWorkflow', () => {
  let mcpContext: InstanceContext;
  let webhookUrls: {
    get: string;
    post: string;
    put: string;
    delete: string;
  };

  beforeEach(() => {
    mcpContext = createMcpContext();
    const creds = getN8nCredentials();
    webhookUrls = creds.webhookUrls;
  });

  // ======================================================================
  // GET Method Tests
  // ======================================================================

  describe('GET Method', () => {
    it('should trigger GET webhook without data', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.get,
          httpMethod: 'GET'
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.message).toContain('Webhook triggered successfully');
    });

    it('should trigger GET webhook with query parameters', async () => {
      // GET method uses query parameters in URL
      const urlWithParams = `${webhookUrls.get}?testParam=value&number=42`;

      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: urlWithParams,
          httpMethod: 'GET'
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger GET webhook with custom headers', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.get,
          httpMethod: 'GET',
          headers: {
            'X-Custom-Header': 'test-value',
            'X-Request-Id': '12345'
          }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger GET webhook and wait for response', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.get,
          httpMethod: 'GET',
          waitForResponse: true
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      // Response should contain workflow execution data
    });
  });

  // ======================================================================
  // POST Method Tests
  // ======================================================================

  describe('POST Method', () => {
    it('should trigger POST webhook with JSON data', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.post,
          httpMethod: 'POST',
          data: {
            message: 'Test webhook trigger',
            timestamp: Date.now(),
            nested: {
              value: 'nested data'
            }
          }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger POST webhook without data', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.post,
          httpMethod: 'POST'
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger POST webhook with custom headers', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.post,
          httpMethod: 'POST',
          data: { test: 'data' },
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'test-key'
          }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger POST webhook without waiting for response', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.post,
          httpMethod: 'POST',
          data: { async: true },
          waitForResponse: false
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      // With waitForResponse: false, may return immediately
    });
  });

  // ======================================================================
  // PUT Method Tests
  // ======================================================================

  describe('PUT Method', () => {
    it('should trigger PUT webhook with update data', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.put,
          httpMethod: 'PUT',
          data: {
            id: '123',
            updatedField: 'new value',
            timestamp: Date.now()
          }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger PUT webhook with custom headers', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.put,
          httpMethod: 'PUT',
          data: { update: true },
          headers: {
            'X-Update-Operation': 'modify',
            'If-Match': 'etag-value'
          }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger PUT webhook without data', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.put,
          httpMethod: 'PUT'
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });
  });

  // ======================================================================
  // DELETE Method Tests
  // ======================================================================

  describe('DELETE Method', () => {
    it('should trigger DELETE webhook with query parameters', async () => {
      const urlWithParams = `${webhookUrls.delete}?id=123&reason=test`;

      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: urlWithParams,
          httpMethod: 'DELETE'
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger DELETE webhook with custom headers', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.delete,
          httpMethod: 'DELETE',
          headers: {
            'X-Delete-Reason': 'cleanup',
            'Authorization': 'Bearer token'
          }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should trigger DELETE webhook without parameters', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.delete,
          httpMethod: 'DELETE'
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });
  });

  // ======================================================================
  // Error Handling
  // ======================================================================

  describe('Error Handling', () => {
    it('should handle invalid webhook URL', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: 'https://invalid-url.example.com/webhook/nonexistent',
          httpMethod: 'GET'
        },
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle malformed webhook URL', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: 'not-a-valid-url',
          httpMethod: 'GET'
        },
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle missing webhook URL', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          httpMethod: 'GET'
        } as any,
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle invalid HTTP method', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.get,
          httpMethod: 'INVALID' as any
        },
        mcpContext
      );

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  // ======================================================================
  // Default Method (POST)
  // ======================================================================

  describe('Default Method Behavior', () => {
    it('should default to POST method when not specified', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.post,
          data: { defaultMethod: true }
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });
  });

  // ======================================================================
  // Response Format Verification
  // ======================================================================

  describe('Response Format', () => {
    it('should return complete webhook response structure', async () => {
      const response = await handleTriggerWebhookWorkflow(
        {
          webhookUrl: webhookUrls.get,
          httpMethod: 'GET',
          waitForResponse: true
        },
        mcpContext
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.message).toContain('Webhook triggered successfully');

      // Response data should be defined (either workflow output or execution info)
      expect(typeof response.data).not.toBe('undefined');
    });
  });
});
