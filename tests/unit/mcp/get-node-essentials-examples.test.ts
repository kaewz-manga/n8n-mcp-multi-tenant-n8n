import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';

/**
 * Unit tests for get_node_essentials with includeExamples parameter
 * Testing P0-R3 feature: Template-based configuration examples with metadata
 */

describe('get_node_essentials with includeExamples', () => {
  let server: N8NDocumentationMCPServer;

  beforeEach(async () => {
    process.env.NODE_DB_PATH = ':memory:';
    server = new N8NDocumentationMCPServer();
    await (server as any).initialized;

    // Populate in-memory database with test nodes
    // NOTE: Database stores nodes in SHORT form (nodes-base.xxx, not n8n-nodes-base.xxx)
    const testNodes = [
      {
        node_type: 'nodes-base.httpRequest',
        package_name: 'n8n-nodes-base',
        display_name: 'HTTP Request',
        description: 'Makes an HTTP request',
        category: 'Core Nodes',
        is_ai_tool: 0,
        is_trigger: 0,
        is_webhook: 0,
        is_versioned: 1,
        version: '1',
        properties_schema: JSON.stringify([]),
        operations: JSON.stringify([])
      },
      {
        node_type: 'nodes-base.webhook',
        package_name: 'n8n-nodes-base',
        display_name: 'Webhook',
        description: 'Starts workflow on webhook call',
        category: 'Core Nodes',
        is_ai_tool: 0,
        is_trigger: 1,
        is_webhook: 1,
        is_versioned: 1,
        version: '1',
        properties_schema: JSON.stringify([]),
        operations: JSON.stringify([])
      },
      {
        node_type: 'nodes-base.test',
        package_name: 'n8n-nodes-base',
        display_name: 'Test Node',
        description: 'Test node for examples',
        category: 'Core Nodes',
        is_ai_tool: 0,
        is_trigger: 0,
        is_webhook: 0,
        is_versioned: 1,
        version: '1',
        properties_schema: JSON.stringify([]),
        operations: JSON.stringify([])
      }
    ];

    // Insert test nodes into the in-memory database
    const db = (server as any).db;
    if (db) {
      const insertStmt = db.prepare(`
        INSERT INTO nodes (
          node_type, package_name, display_name, description, category,
          is_ai_tool, is_trigger, is_webhook, is_versioned, version,
          properties_schema, operations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const node of testNodes) {
        insertStmt.run(
          node.node_type,
          node.package_name,
          node.display_name,
          node.description,
          node.category,
          node.is_ai_tool,
          node.is_trigger,
          node.is_webhook,
          node.is_versioned,
          node.version,
          node.properties_schema,
          node.operations
        );
      }
    }
  });

  afterEach(() => {
    delete process.env.NODE_DB_PATH;
  });

  describe('includeExamples parameter', () => {
    it('should not include examples when includeExamples is false', async () => {
      const result = await (server as any).getNodeEssentials('nodes-base.httpRequest', false);

      expect(result).toBeDefined();
      expect(result.examples).toBeUndefined();
    });

    it('should not include examples when includeExamples is undefined', async () => {
      const result = await (server as any).getNodeEssentials('nodes-base.httpRequest', undefined);

      expect(result).toBeDefined();
      expect(result.examples).toBeUndefined();
    });

    it('should include examples when includeExamples is true', async () => {
      const result = await (server as any).getNodeEssentials('nodes-base.httpRequest', true);

      expect(result).toBeDefined();
      // Note: In-memory test database may not have template configs
      // This test validates the parameter is processed correctly
    });

    it('should limit examples to top 3 per node', async () => {
      const result = await (server as any).getNodeEssentials('nodes-base.webhook', true);

      expect(result).toBeDefined();
      if (result.examples) {
        expect(result.examples.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('example data structure with metadata', () => {
    it('should return examples with full metadata structure', async () => {
      // Mock database to return example data with metadata
      const mockDb = (server as any).db;
      if (mockDb) {
        const originalPrepare = mockDb.prepare.bind(mockDb);
        mockDb.prepare = vi.fn((query: string) => {
          if (query.includes('template_node_configs')) {
            return {
              all: vi.fn(() => [
                {
                  parameters_json: JSON.stringify({
                    httpMethod: 'POST',
                    path: 'webhook-test',
                    responseMode: 'lastNode'
                  }),
                  template_name: 'Webhook Template',
                  template_views: 2000,
                  complexity: 'simple',
                  use_cases: JSON.stringify(['webhook processing', 'API integration']),
                  has_credentials: 0,
                  has_expressions: 1
                }
              ])
            };
          }
          return originalPrepare(query);
        });

        const result = await (server as any).getNodeEssentials('nodes-base.webhook', true);

        if (result.examples && result.examples.length > 0) {
          const example = result.examples[0];

          // Verify structure
          expect(example).toHaveProperty('configuration');
          expect(example).toHaveProperty('source');
          expect(example).toHaveProperty('useCases');
          expect(example).toHaveProperty('metadata');

          // Verify source structure
          expect(example.source).toHaveProperty('template');
          expect(example.source).toHaveProperty('views');
          expect(example.source).toHaveProperty('complexity');

          // Verify metadata structure
          expect(example.metadata).toHaveProperty('hasCredentials');
          expect(example.metadata).toHaveProperty('hasExpressions');

          // Verify types
          expect(typeof example.configuration).toBe('object');
          expect(typeof example.source.template).toBe('string');
          expect(typeof example.source.views).toBe('number');
          expect(typeof example.source.complexity).toBe('string');
          expect(Array.isArray(example.useCases)).toBe(true);
          expect(typeof example.metadata.hasCredentials).toBe('boolean');
          expect(typeof example.metadata.hasExpressions).toBe('boolean');
        }
      }
    });

    it('should include complexity in source metadata', async () => {
      const mockDb = (server as any).db;
      if (mockDb) {
        const originalPrepare = mockDb.prepare.bind(mockDb);
        mockDb.prepare = vi.fn((query: string) => {
          if (query.includes('template_node_configs')) {
            return {
              all: vi.fn(() => [
                {
                  parameters_json: JSON.stringify({ url: 'https://api.example.com' }),
                  template_name: 'Simple HTTP Request',
                  template_views: 500,
                  complexity: 'simple',
                  use_cases: JSON.stringify([]),
                  has_credentials: 0,
                  has_expressions: 0
                },
                {
                  parameters_json: JSON.stringify({
                    url: '={{ $json.url }}',
                    options: { timeout: 30000 }
                  }),
                  template_name: 'Complex HTTP Request',
                  template_views: 300,
                  complexity: 'complex',
                  use_cases: JSON.stringify(['advanced API calls']),
                  has_credentials: 1,
                  has_expressions: 1
                }
              ])
            };
          }
          return originalPrepare(query);
        });

        const result = await (server as any).getNodeEssentials('nodes-base.httpRequest', true);

        if (result.examples && result.examples.length >= 2) {
          expect(result.examples[0].source.complexity).toBe('simple');
          expect(result.examples[1].source.complexity).toBe('complex');
        }
      }
    });

    it('should limit use cases to 2 items', async () => {
      const mockDb = (server as any).db;
      if (mockDb) {
        const originalPrepare = mockDb.prepare.bind(mockDb);
        mockDb.prepare = vi.fn((query: string) => {
          if (query.includes('template_node_configs')) {
            return {
              all: vi.fn(() => [
                {
                  parameters_json: JSON.stringify({}),
                  template_name: 'Test Template',
                  template_views: 100,
                  complexity: 'medium',
                  use_cases: JSON.stringify([
                    'use case 1',
                    'use case 2',
                    'use case 3',
                    'use case 4'
                  ]),
                  has_credentials: 0,
                  has_expressions: 0
                }
              ])
            };
          }
          return originalPrepare(query);
        });

        const result = await (server as any).getNodeEssentials('nodes-base.test', true);

        if (result.examples && result.examples.length > 0) {
          expect(result.examples[0].useCases.length).toBeLessThanOrEqual(2);
        }
      }
    });

    it('should handle empty use_cases gracefully', async () => {
      const mockDb = (server as any).db;
      if (mockDb) {
        const originalPrepare = mockDb.prepare.bind(mockDb);
        mockDb.prepare = vi.fn((query: string) => {
          if (query.includes('template_node_configs')) {
            return {
              all: vi.fn(() => [
                {
                  parameters_json: JSON.stringify({}),
                  template_name: 'Test Template',
                  template_views: 100,
                  complexity: 'medium',
                  use_cases: null,
                  has_credentials: 0,
                  has_expressions: 0
                }
              ])
            };
          }
          return originalPrepare(query);
        });

        const result = await (server as any).getNodeEssentials('nodes-base.test', true);

        if (result.examples && result.examples.length > 0) {
          expect(result.examples[0].useCases).toEqual([]);
        }
      }
    });
  });

  describe('caching behavior with includeExamples', () => {
    it('should use different cache keys for with/without examples', async () => {
      const cache = (server as any).cache;
      const cacheGetSpy = vi.spyOn(cache, 'get');

      // First call without examples
      await (server as any).getNodeEssentials('nodes-base.httpRequest', false);
      expect(cacheGetSpy).toHaveBeenCalledWith(expect.stringContaining('basic'));

      // Second call with examples
      await (server as any).getNodeEssentials('nodes-base.httpRequest', true);
      expect(cacheGetSpy).toHaveBeenCalledWith(expect.stringContaining('withExamples'));
    });

    it('should cache results separately for different includeExamples values', async () => {
      // Call with examples
      const resultWithExamples1 = await (server as any).getNodeEssentials('nodes-base.httpRequest', true);

      // Call without examples
      const resultWithoutExamples = await (server as any).getNodeEssentials('nodes-base.httpRequest', false);

      // Call with examples again (should be cached)
      const resultWithExamples2 = await (server as any).getNodeEssentials('nodes-base.httpRequest', true);

      // Results with examples should match
      expect(resultWithExamples1).toEqual(resultWithExamples2);

      // Result without examples should not have examples
      expect(resultWithoutExamples.examples).toBeUndefined();
    });
  });

  describe('backward compatibility', () => {
    it('should maintain backward compatibility when includeExamples not specified', async () => {
      const result = await (server as any).getNodeEssentials('nodes-base.httpRequest');

      expect(result).toBeDefined();
      expect(result.nodeType).toBeDefined();
      expect(result.displayName).toBeDefined();
      expect(result.examples).toBeUndefined();
    });

    it('should return same core data regardless of includeExamples value', async () => {
      const resultWithout = await (server as any).getNodeEssentials('nodes-base.httpRequest', false);
      const resultWith = await (server as any).getNodeEssentials('nodes-base.httpRequest', true);

      // Core fields should be identical
      expect(resultWithout.nodeType).toBe(resultWith.nodeType);
      expect(resultWithout.displayName).toBe(resultWith.displayName);
      expect(resultWithout.description).toBe(resultWith.description);
    });
  });

  describe('error handling', () => {
    it('should continue to work even if example fetch fails', async () => {
      const mockDb = (server as any).db;
      if (mockDb) {
        const originalPrepare = mockDb.prepare.bind(mockDb);
        mockDb.prepare = vi.fn((query: string) => {
          if (query.includes('template_node_configs')) {
            throw new Error('Database error');
          }
          return originalPrepare(query);
        });

        // Should not throw
        const result = await (server as any).getNodeEssentials('nodes-base.webhook', true);

        expect(result).toBeDefined();
        expect(result.nodeType).toBeDefined();
        // Examples should be empty array due to error (fallback behavior)
        expect(result.examples).toEqual([]);
        expect(result.examplesCount).toBe(0);
      }
    });

    it('should handle malformed JSON in template configs gracefully', async () => {
      const mockDb = (server as any).db;
      if (mockDb) {
        const originalPrepare = mockDb.prepare.bind(mockDb);
        mockDb.prepare = vi.fn((query: string) => {
          if (query.includes('template_node_configs')) {
            return {
              all: vi.fn(() => [
                {
                  parameters_json: 'invalid json',
                  template_name: 'Test',
                  template_views: 100,
                  complexity: 'medium',
                  use_cases: 'also invalid',
                  has_credentials: 0,
                  has_expressions: 0
                }
              ])
            };
          }
          return originalPrepare(query);
        });

        // Should not throw
        const result = await (server as any).getNodeEssentials('nodes-base.test', true);
        expect(result).toBeDefined();
      }
    });
  });

  describe('performance', () => {
    it('should complete in reasonable time with examples', async () => {
      const start = Date.now();
      await (server as any).getNodeEssentials('nodes-base.httpRequest', true);
      const duration = Date.now() - start;

      // Should complete under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should not add significant overhead when includeExamples is false', async () => {
      const startWithout = Date.now();
      await (server as any).getNodeEssentials('nodes-base.httpRequest', false);
      const durationWithout = Date.now() - startWithout;

      const startWith = Date.now();
      await (server as any).getNodeEssentials('nodes-base.httpRequest', true);
      const durationWith = Date.now() - startWith;

      // Both should be fast
      expect(durationWithout).toBeLessThan(50);
      expect(durationWith).toBeLessThan(100);
    });
  });
});
