import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { TelemetryEventValidator, telemetryEventSchema, workflowTelemetrySchema } from '../../../src/telemetry/event-validator';
import { TelemetryEvent, WorkflowTelemetry } from '../../../src/telemetry/telemetry-types';

// Mock logger to avoid console output in tests
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

describe('TelemetryEventValidator', () => {
  let validator: TelemetryEventValidator;

  beforeEach(() => {
    validator = new TelemetryEventValidator();
    vi.clearAllMocks();
  });

  describe('validateEvent()', () => {
    it('should validate a basic valid event', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'tool_used',
        properties: { tool: 'httpRequest', success: true, duration: 500 }
      };

      const result = validator.validateEvent(event);
      expect(result).toEqual(event);
    });

    it('should validate event with specific schema for tool_used', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'tool_used',
        properties: { tool: 'httpRequest', success: true, duration: 500 }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(result?.properties.tool).toBe('httpRequest');
      expect(result?.properties.success).toBe(true);
      expect(result?.properties.duration).toBe(500);
    });

    it('should validate search_query event with specific schema', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'search_query',
        properties: {
          query: 'test query',
          resultsFound: 5,
          searchType: 'nodes',
          hasResults: true,
          isZeroResults: false
        }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(result?.properties.query).toBe('test query');
      expect(result?.properties.resultsFound).toBe(5);
      expect(result?.properties.hasResults).toBe(true);
    });

    it('should validate performance_metric event with specific schema', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'performance_metric',
        properties: {
          operation: 'database_query',
          duration: 1500,
          isSlow: true,
          isVerySlow: false,
          metadata: { table: 'nodes' }
        }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(result?.properties.operation).toBe('database_query');
      expect(result?.properties.duration).toBe(1500);
      expect(result?.properties.isSlow).toBe(true);
    });

    it('should sanitize sensitive data from properties', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'generic_event',
        properties: {
          description: 'Visit https://example.com/secret and user@example.com with key abcdef123456789012345678901234567890',
          apiKey: 'super-secret-key-12345678901234567890',
          normalProp: 'normal value'
        }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(result?.properties.description).toBe('Visit [URL] and [EMAIL] with key [KEY]');
      expect(result?.properties.normalProp).toBe('normal value');
      expect(result?.properties).not.toHaveProperty('apiKey'); // Should be filtered out
    });

    it('should handle nested object sanitization with depth limit', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'nested_event',
        properties: {
          nested: {
            level1: {
              level2: {
                level3: {
                  level4: 'should be truncated',
                  apiKey: 'secret123',
                  description: 'Visit https://example.com'
                },
                description: 'Visit https://another.com'
              }
            }
          }
        }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(result?.properties.nested.level1.level2.level3).toBe('[NESTED]');
      expect(result?.properties.nested.level1.level2.description).toBe('Visit [URL]');
    });

    it('should handle array sanitization with size limit', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'array_event',
        properties: {
          items: Array.from({ length: 15 }, (_, i) => ({
            id: i,
            description: 'Visit https://example.com',
            value: `item-${i}`
          }))
        }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(Array.isArray(result?.properties.items)).toBe(true);
      expect(result?.properties.items.length).toBe(10); // Should be limited to 10
    });

    it('should reject events with invalid user_id', () => {
      const event: TelemetryEvent = {
        user_id: '', // Empty string
        event: 'test_event',
        properties: {}
      };

      const result = validator.validateEvent(event);
      expect(result).toBeNull();
    });

    it('should reject events with invalid event name', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'invalid-event-name!@#', // Invalid characters
        properties: {}
      };

      const result = validator.validateEvent(event);
      expect(result).toBeNull();
    });

    it('should reject tool_used event with invalid properties', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'tool_used',
        properties: {
          tool: 'test',
          success: 'not-a-boolean', // Should be boolean
          duration: -1 // Should be positive
        }
      };

      const result = validator.validateEvent(event);
      expect(result).toBeNull();
    });

    it('should filter out sensitive keys from properties', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'sensitive_event',
        properties: {
          password: 'secret123',
          token: 'bearer-token',
          apikey: 'api-key-value',
          secret: 'secret-value',
          credential: 'cred-value',
          auth: 'auth-header',
          url: 'https://example.com',
          endpoint: 'api.example.com',
          host: 'localhost',
          database: 'prod-db',
          normalProp: 'safe-value',
          count: 42,
          enabled: true
        }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(result?.properties).not.toHaveProperty('password');
      expect(result?.properties).not.toHaveProperty('token');
      expect(result?.properties).not.toHaveProperty('apikey');
      expect(result?.properties).not.toHaveProperty('secret');
      expect(result?.properties).not.toHaveProperty('credential');
      expect(result?.properties).not.toHaveProperty('auth');
      expect(result?.properties).not.toHaveProperty('url');
      expect(result?.properties).not.toHaveProperty('endpoint');
      expect(result?.properties).not.toHaveProperty('host');
      expect(result?.properties).not.toHaveProperty('database');
      expect(result?.properties.normalProp).toBe('safe-value');
      expect(result?.properties.count).toBe(42);
      expect(result?.properties.enabled).toBe(true);
    });

    it('should handle validation_details event schema', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'validation_details',
        properties: {
          nodeType: 'nodes-base.httpRequest',
          errorType: 'required_field_missing',
          errorCategory: 'validation_error',
          details: { field: 'url' }
        }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(result?.properties.nodeType).toBe('nodes-base.httpRequest');
      expect(result?.properties.errorType).toBe('required_field_missing');
    });

    it('should handle null and undefined values', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'null_event',
        properties: {
          nullValue: null,
          undefinedValue: undefined,
          normalValue: 'test'
        }
      };

      const result = validator.validateEvent(event);
      expect(result).not.toBeNull();
      expect(result?.properties.nullValue).toBeNull();
      expect(result?.properties.undefinedValue).toBeNull();
      expect(result?.properties.normalValue).toBe('test');
    });
  });

  describe('validateWorkflow()', () => {
    it('should validate a valid workflow', () => {
      const workflow: WorkflowTelemetry = {
        user_id: 'user123',
        workflow_hash: 'hash123',
        node_count: 3,
        node_types: ['webhook', 'httpRequest', 'set'],
        has_trigger: true,
        has_webhook: true,
        complexity: 'medium',
        sanitized_workflow: {
          nodes: [
            { id: '1', type: 'webhook' },
            { id: '2', type: 'httpRequest' },
            { id: '3', type: 'set' }
          ],
          connections: { '1': { main: [[{ node: '2', type: 'main', index: 0 }]] } }
        }
      };

      const result = validator.validateWorkflow(workflow);
      expect(result).toEqual(workflow);
    });

    it('should reject workflow with too many nodes', () => {
      const workflow: WorkflowTelemetry = {
        user_id: 'user123',
        workflow_hash: 'hash123',
        node_count: 1001, // Over limit
        node_types: ['webhook'],
        has_trigger: true,
        has_webhook: true,
        complexity: 'complex',
        sanitized_workflow: {
          nodes: [],
          connections: {}
        }
      };

      const result = validator.validateWorkflow(workflow);
      expect(result).toBeNull();
    });

    it('should reject workflow with invalid complexity', () => {
      const workflow = {
        user_id: 'user123',
        workflow_hash: 'hash123',
        node_count: 3,
        node_types: ['webhook'],
        has_trigger: true,
        has_webhook: true,
        complexity: 'invalid' as any, // Invalid complexity
        sanitized_workflow: {
          nodes: [],
          connections: {}
        }
      };

      const result = validator.validateWorkflow(workflow);
      expect(result).toBeNull();
    });

    it('should reject workflow with too many node types', () => {
      const workflow: WorkflowTelemetry = {
        user_id: 'user123',
        workflow_hash: 'hash123',
        node_count: 3,
        node_types: Array.from({ length: 101 }, (_, i) => `node-${i}`), // Over limit
        has_trigger: true,
        has_webhook: true,
        complexity: 'complex',
        sanitized_workflow: {
          nodes: [],
          connections: {}
        }
      };

      const result = validator.validateWorkflow(workflow);
      expect(result).toBeNull();
    });
  });

  describe('getStats()', () => {
    it('should track validation statistics', () => {
      const validEvent: TelemetryEvent = {
        user_id: 'user123',
        event: 'valid_event',
        properties: {}
      };

      const invalidEvent: TelemetryEvent = {
        user_id: '', // Invalid
        event: 'invalid_event',
        properties: {}
      };

      validator.validateEvent(validEvent);
      validator.validateEvent(validEvent);
      validator.validateEvent(invalidEvent);

      const stats = validator.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.errors).toBe(1);
      expect(stats.total).toBe(3);
      expect(stats.errorRate).toBeCloseTo(0.333, 3);
    });

    it('should handle division by zero in error rate', () => {
      const stats = validator.getStats();
      expect(stats.errorRate).toBe(0);
    });
  });

  describe('resetStats()', () => {
    it('should reset validation statistics', () => {
      const validEvent: TelemetryEvent = {
        user_id: 'user123',
        event: 'valid_event',
        properties: {}
      };

      validator.validateEvent(validEvent);
      validator.resetStats();

      const stats = validator.getStats();
      expect(stats.successes).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.errorRate).toBe(0);
    });
  });

  describe('Schema validation', () => {
    describe('telemetryEventSchema', () => {
      it('should validate with created_at timestamp', () => {
        const event = {
          user_id: 'user123',
          event: 'test_event',
          properties: {},
          created_at: '2024-01-01T00:00:00Z'
        };

        const result = telemetryEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      });

      it('should reject invalid datetime format', () => {
        const event = {
          user_id: 'user123',
          event: 'test_event',
          properties: {},
          created_at: 'invalid-date'
        };

        const result = telemetryEventSchema.safeParse(event);
        expect(result.success).toBe(false);
      });

      it('should enforce user_id length limits', () => {
        const longUserId = 'a'.repeat(65);
        const event = {
          user_id: longUserId,
          event: 'test_event',
          properties: {}
        };

        const result = telemetryEventSchema.safeParse(event);
        expect(result.success).toBe(false);
      });

      it('should enforce event name regex pattern', () => {
        const event = {
          user_id: 'user123',
          event: 'invalid event name with spaces!',
          properties: {}
        };

        const result = telemetryEventSchema.safeParse(event);
        expect(result.success).toBe(false);
      });
    });

    describe('workflowTelemetrySchema', () => {
      it('should enforce node array size limits', () => {
        const workflow = {
          user_id: 'user123',
          workflow_hash: 'hash123',
          node_count: 3,
          node_types: ['test'],
          has_trigger: true,
          has_webhook: false,
          complexity: 'simple',
          sanitized_workflow: {
            nodes: Array.from({ length: 1001 }, (_, i) => ({ id: i })), // Over limit
            connections: {}
          }
        };

        const result = workflowTelemetrySchema.safeParse(workflow);
        expect(result.success).toBe(false);
      });

      it('should validate with optional created_at', () => {
        const workflow = {
          user_id: 'user123',
          workflow_hash: 'hash123',
          node_count: 1,
          node_types: ['webhook'],
          has_trigger: true,
          has_webhook: true,
          complexity: 'simple',
          sanitized_workflow: {
            nodes: [{ id: '1' }],
            connections: {}
          },
          created_at: '2024-01-01T00:00:00Z'
        };

        const result = workflowTelemetrySchema.safeParse(workflow);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('String sanitization edge cases', () => {
    it('should handle multiple URLs in same string', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'test_event',
        properties: {
          description: 'Visit https://example.com or http://test.com for more info'
        }
      };

      const result = validator.validateEvent(event);
      expect(result?.properties.description).toBe('Visit [URL] or [URL] for more info');
    });

    it('should handle mixed sensitive content', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'test_event',
        properties: {
          message: 'Contact admin@example.com at https://secure.com with key abc123def456ghi789jkl012mno345pqr'
        }
      };

      const result = validator.validateEvent(event);
      expect(result?.properties.message).toBe('Contact [EMAIL] at [URL] with key [KEY]');
    });

    it('should preserve non-sensitive content', () => {
      const event: TelemetryEvent = {
        user_id: 'user123',
        event: 'test_event',
        properties: {
          status: 'success',
          count: 42,
          enabled: true,
          short_id: 'abc123' // Too short to be considered a key
        }
      };

      const result = validator.validateEvent(event);
      expect(result?.properties.status).toBe('success');
      expect(result?.properties.count).toBe(42);
      expect(result?.properties.enabled).toBe(true);
      expect(result?.properties.short_id).toBe('abc123');
    });
  });

  describe('Error handling', () => {
    it('should handle Zod parsing errors gracefully', () => {
      const invalidEvent = {
        user_id: 123, // Should be string
        event: 'test_event',
        properties: {}
      };

      const result = validator.validateEvent(invalidEvent as any);
      expect(result).toBeNull();
    });

    it('should handle unexpected errors during validation', () => {
      const eventWithCircularRef: any = {
        user_id: 'user123',
        event: 'test_event',
        properties: {}
      };
      // Create circular reference
      eventWithCircularRef.properties.self = eventWithCircularRef;

      const result = validator.validateEvent(eventWithCircularRef);
      // Should handle gracefully and not throw
      expect(result).not.toThrow;
    });
  });
});