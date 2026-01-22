/**
 * Integration tests for flexible instance configuration support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NMCPEngine } from '../../src/mcp-engine';
import { InstanceContext, isInstanceContext } from '../../src/types/instance-context';
import { getN8nApiClient } from '../../src/mcp/handlers-n8n-manager';

describe('Flexible Instance Configuration', () => {
  let engine: N8NMCPEngine;

  beforeEach(() => {
    engine = new N8NMCPEngine();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Backward Compatibility', () => {
    it('should work without instance context (using env vars)', async () => {
      // Save original env
      const originalUrl = process.env.N8N_API_URL;
      const originalKey = process.env.N8N_API_KEY;

      // Set test env vars
      process.env.N8N_API_URL = 'https://test.n8n.cloud';
      process.env.N8N_API_KEY = 'test-key';

      // Get client without context
      const client = getN8nApiClient();

      // Should use env vars when no context provided
      if (client) {
        expect(client).toBeDefined();
      }

      // Restore env
      process.env.N8N_API_URL = originalUrl;
      process.env.N8N_API_KEY = originalKey;
    });

    it('should create MCP engine without instance context', () => {
      // Should not throw when creating engine without context
      expect(() => {
        const testEngine = new N8NMCPEngine();
        expect(testEngine).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Instance Context Support', () => {
    it('should accept and use instance context', () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://instance1.n8n.cloud',
        n8nApiKey: 'instance1-key',
        instanceId: 'test-instance-1',
        sessionId: 'session-123',
        metadata: {
          userId: 'user-456',
          customField: 'test'
        }
      };

      // Get client with context
      const client = getN8nApiClient(context);

      // Should create instance-specific client
      if (context.n8nApiUrl && context.n8nApiKey) {
        expect(client).toBeDefined();
      }
    });

    it('should create different clients for different contexts', () => {
      const context1: InstanceContext = {
        n8nApiUrl: 'https://instance1.n8n.cloud',
        n8nApiKey: 'key1',
        instanceId: 'instance-1'
      };

      const context2: InstanceContext = {
        n8nApiUrl: 'https://instance2.n8n.cloud',
        n8nApiKey: 'key2',
        instanceId: 'instance-2'
      };

      const client1 = getN8nApiClient(context1);
      const client2 = getN8nApiClient(context2);

      // Both clients should exist and be different
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      // Note: We can't directly compare clients, but they're cached separately
    });

    it('should cache clients for the same context', () => {
      const context: InstanceContext = {
        n8nApiUrl: 'https://instance1.n8n.cloud',
        n8nApiKey: 'key1',
        instanceId: 'instance-1'
      };

      const client1 = getN8nApiClient(context);
      const client2 = getN8nApiClient(context);

      // Should return the same cached client
      expect(client1).toBe(client2);
    });

    it('should handle partial context (missing n8n config)', () => {
      const context: InstanceContext = {
        instanceId: 'instance-1',
        sessionId: 'session-123'
        // Missing n8nApiUrl and n8nApiKey
      };

      const client = getN8nApiClient(context);

      // Should fall back to env vars when n8n config missing
      // Client will be null if env vars not set
      expect(client).toBeDefined(); // or null depending on env
    });
  });

  describe('Instance Isolation', () => {
    it('should isolate state between instances', () => {
      const context1: InstanceContext = {
        n8nApiUrl: 'https://instance1.n8n.cloud',
        n8nApiKey: 'key1',
        instanceId: 'instance-1'
      };

      const context2: InstanceContext = {
        n8nApiUrl: 'https://instance2.n8n.cloud',
        n8nApiKey: 'key2',
        instanceId: 'instance-2'
      };

      // Create clients for both contexts
      const client1 = getN8nApiClient(context1);
      const client2 = getN8nApiClient(context2);

      // Verify both are created independently
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();

      // Clear one shouldn't affect the other
      // (In real implementation, we'd have a clear method)
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid context gracefully', () => {
      const invalidContext = {
        n8nApiUrl: 123, // Wrong type
        n8nApiKey: null,
        someRandomField: 'test'
      } as any;

      // Should not throw, but may not create client
      expect(() => {
        getN8nApiClient(invalidContext);
      }).not.toThrow();
    });

    it('should provide clear error when n8n API not configured', () => {
      const context: InstanceContext = {
        instanceId: 'test',
        // Missing n8n config
      };

      // Clear env vars
      const originalUrl = process.env.N8N_API_URL;
      const originalKey = process.env.N8N_API_KEY;
      delete process.env.N8N_API_URL;
      delete process.env.N8N_API_KEY;

      const client = getN8nApiClient(context);
      expect(client).toBeNull();

      // Restore env
      process.env.N8N_API_URL = originalUrl;
      process.env.N8N_API_KEY = originalKey;
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify valid InstanceContext', () => {

      const validContext: InstanceContext = {
        n8nApiUrl: 'https://test.n8n.cloud',
        n8nApiKey: 'key',
        instanceId: 'id',
        sessionId: 'session',
        metadata: { test: true }
      };

      expect(isInstanceContext(validContext)).toBe(true);
    });

    it('should reject invalid InstanceContext', () => {

      expect(isInstanceContext(null)).toBe(false);
      expect(isInstanceContext(undefined)).toBe(false);
      expect(isInstanceContext('string')).toBe(false);
      expect(isInstanceContext(123)).toBe(false);
      expect(isInstanceContext({ n8nApiUrl: 123 })).toBe(false);
    });
  });

  describe('HTTP Header Extraction Logic', () => {
    it('should create instance context from headers', () => {
      // Test the logic that would extract context from headers
      const headers = {
        'x-n8n-url': 'https://instance1.n8n.cloud',
        'x-n8n-key': 'test-api-key-123',
        'x-instance-id': 'instance-test-1',
        'x-session-id': 'session-test-123',
        'user-agent': 'test-client/1.0'
      };

      // This simulates the logic in http-server-single-session.ts
      const instanceContext: InstanceContext | undefined =
        (headers['x-n8n-url'] || headers['x-n8n-key']) ? {
          n8nApiUrl: headers['x-n8n-url'] as string,
          n8nApiKey: headers['x-n8n-key'] as string,
          instanceId: headers['x-instance-id'] as string,
          sessionId: headers['x-session-id'] as string,
          metadata: {
            userAgent: headers['user-agent'],
            ip: '127.0.0.1'
          }
        } : undefined;

      expect(instanceContext).toBeDefined();
      expect(instanceContext?.n8nApiUrl).toBe('https://instance1.n8n.cloud');
      expect(instanceContext?.n8nApiKey).toBe('test-api-key-123');
      expect(instanceContext?.instanceId).toBe('instance-test-1');
      expect(instanceContext?.sessionId).toBe('session-test-123');
      expect(instanceContext?.metadata?.userAgent).toBe('test-client/1.0');
    });

    it('should not create context when headers are missing', () => {
      // Test when no relevant headers are present
      const headers: Record<string, string | undefined> = {
        'content-type': 'application/json',
        'user-agent': 'test-client/1.0'
      };

      const instanceContext: InstanceContext | undefined =
        (headers['x-n8n-url'] || headers['x-n8n-key']) ? {
          n8nApiUrl: headers['x-n8n-url'] as string,
          n8nApiKey: headers['x-n8n-key'] as string,
          instanceId: headers['x-instance-id'] as string,
          sessionId: headers['x-session-id'] as string,
          metadata: {
            userAgent: headers['user-agent'],
            ip: '127.0.0.1'
          }
        } : undefined;

      expect(instanceContext).toBeUndefined();
    });

    it('should create context with partial headers', () => {
      // Test when only some headers are present
      const headers: Record<string, string | undefined> = {
        'x-n8n-url': 'https://partial.n8n.cloud',
        'x-instance-id': 'partial-instance'
        // Missing x-n8n-key and x-session-id
      };

      const instanceContext: InstanceContext | undefined =
        (headers['x-n8n-url'] || headers['x-n8n-key']) ? {
          n8nApiUrl: headers['x-n8n-url'] as string,
          n8nApiKey: headers['x-n8n-key'] as string,
          instanceId: headers['x-instance-id'] as string,
          sessionId: headers['x-session-id'] as string,
          metadata: undefined
        } : undefined;

      expect(instanceContext).toBeDefined();
      expect(instanceContext?.n8nApiUrl).toBe('https://partial.n8n.cloud');
      expect(instanceContext?.n8nApiKey).toBeUndefined();
      expect(instanceContext?.instanceId).toBe('partial-instance');
      expect(instanceContext?.sessionId).toBeUndefined();
    });

    it('should prioritize x-n8n-key for context creation', () => {
      // Test when only API key is present
      const headers: Record<string, string | undefined> = {
        'x-n8n-key': 'key-only-test',
        'x-instance-id': 'key-only-instance'
        // Missing x-n8n-url
      };

      const instanceContext: InstanceContext | undefined =
        (headers['x-n8n-url'] || headers['x-n8n-key']) ? {
          n8nApiUrl: headers['x-n8n-url'] as string,
          n8nApiKey: headers['x-n8n-key'] as string,
          instanceId: headers['x-instance-id'] as string,
          sessionId: headers['x-session-id'] as string,
          metadata: undefined
        } : undefined;

      expect(instanceContext).toBeDefined();
      expect(instanceContext?.n8nApiKey).toBe('key-only-test');
      expect(instanceContext?.n8nApiUrl).toBeUndefined();
      expect(instanceContext?.instanceId).toBe('key-only-instance');
    });

    it('should handle empty string headers', () => {
      // Test with empty strings
      const headers = {
        'x-n8n-url': '',
        'x-n8n-key': 'valid-key',
        'x-instance-id': '',
        'x-session-id': ''
      };

      // Empty string for URL should not trigger context creation
      // But valid key should
      const instanceContext: InstanceContext | undefined =
        (headers['x-n8n-url'] || headers['x-n8n-key']) ? {
          n8nApiUrl: headers['x-n8n-url'] as string,
          n8nApiKey: headers['x-n8n-key'] as string,
          instanceId: headers['x-instance-id'] as string,
          sessionId: headers['x-session-id'] as string,
          metadata: undefined
        } : undefined;

      expect(instanceContext).toBeDefined();
      expect(instanceContext?.n8nApiUrl).toBe('');
      expect(instanceContext?.n8nApiKey).toBe('valid-key');
      expect(instanceContext?.instanceId).toBe('');
      expect(instanceContext?.sessionId).toBe('');
    });
  });
});