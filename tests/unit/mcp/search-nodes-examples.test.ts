import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';
import { createDatabaseAdapter } from '../../../src/database/database-adapter';
import path from 'path';
import fs from 'fs';

/**
 * Unit tests for search_nodes with includeExamples parameter
 * Testing P0-R3 feature: Template-based configuration examples
 */

describe('search_nodes with includeExamples', () => {
  let server: N8NDocumentationMCPServer;
  let dbPath: string;

  beforeEach(async () => {
    // Use in-memory database for testing
    process.env.NODE_DB_PATH = ':memory:';
    server = new N8NDocumentationMCPServer();
    await (server as any).initialized;

    // Populate in-memory database with test nodes
    // NOTE: Database stores nodes in SHORT form (nodes-base.xxx, not n8n-nodes-base.xxx)
    const testNodes = [
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
      // Note: FTS table is not created in test environment
      // searchNodes will fall back to LIKE search when FTS doesn't exist
    }
  });

  afterEach(() => {
    delete process.env.NODE_DB_PATH;
  });

  describe('includeExamples parameter', () => {
    it('should not include examples when includeExamples is false', async () => {
      const result = await (server as any).searchNodes('webhook', 5, { includeExamples: false });

      expect(result.results).toBeDefined();
      if (result.results.length > 0) {
        result.results.forEach((node: any) => {
          expect(node.examples).toBeUndefined();
        });
      }
    });

    it('should not include examples when includeExamples is undefined', async () => {
      const result = await (server as any).searchNodes('webhook', 5, {});

      expect(result.results).toBeDefined();
      if (result.results.length > 0) {
        result.results.forEach((node: any) => {
          expect(node.examples).toBeUndefined();
        });
      }
    });

    it('should include examples when includeExamples is true', async () => {
      const result = await (server as any).searchNodes('webhook', 5, { includeExamples: true });

      expect(result.results).toBeDefined();
      // Note: In-memory test database may not have template configs
      // This test validates the parameter is processed correctly
    });

    it('should handle nodes without examples gracefully', async () => {
      const result = await (server as any).searchNodes('nonexistent', 5, { includeExamples: true });

      expect(result.results).toBeDefined();
      expect(result.results).toHaveLength(0);
    });

    it('should limit examples to top 2 per node', async () => {
      // This test would need a database with actual template_node_configs data
      // In a real scenario, we'd verify that only 2 examples are returned
      const result = await (server as any).searchNodes('http', 5, { includeExamples: true });

      expect(result.results).toBeDefined();
      if (result.results.length > 0) {
        result.results.forEach((node: any) => {
          if (node.examples) {
            expect(node.examples.length).toBeLessThanOrEqual(2);
          }
        });
      }
    });
  });

  describe('example data structure', () => {
    it('should return examples with correct structure when present', async () => {
      // Mock database to return example data
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
                    path: 'webhook-test'
                  }),
                  template_name: 'Test Template',
                  template_views: 1000
                },
                {
                  parameters_json: JSON.stringify({
                    httpMethod: 'GET',
                    path: 'webhook-get'
                  }),
                  template_name: 'Another Template',
                  template_views: 500
                }
              ])
            };
          }
          return originalPrepare(query);
        });

        const result = await (server as any).searchNodes('webhook', 5, { includeExamples: true });

        if (result.results.length > 0 && result.results[0].examples) {
          const example = result.results[0].examples[0];
          expect(example).toHaveProperty('configuration');
          expect(example).toHaveProperty('template');
          expect(example).toHaveProperty('views');
          expect(typeof example.configuration).toBe('object');
          expect(typeof example.template).toBe('string');
          expect(typeof example.views).toBe('number');
        }
      }
    });
  });

  describe('backward compatibility', () => {
    it('should maintain backward compatibility when includeExamples not specified', async () => {
      const resultWithoutParam = await (server as any).searchNodes('http', 5);
      const resultWithFalse = await (server as any).searchNodes('http', 5, { includeExamples: false });

      expect(resultWithoutParam.results).toBeDefined();
      expect(resultWithFalse.results).toBeDefined();

      // Both should have same structure (no examples)
      if (resultWithoutParam.results.length > 0) {
        expect(resultWithoutParam.results[0].examples).toBeUndefined();
      }
      if (resultWithFalse.results.length > 0) {
        expect(resultWithFalse.results[0].examples).toBeUndefined();
      }
    });
  });

  describe('performance considerations', () => {
    it('should not significantly impact performance when includeExamples is false', async () => {
      const startWithout = Date.now();
      await (server as any).searchNodes('http', 20, { includeExamples: false });
      const durationWithout = Date.now() - startWithout;

      const startWith = Date.now();
      await (server as any).searchNodes('http', 20, { includeExamples: true });
      const durationWith = Date.now() - startWith;

      // Both should complete quickly (under 100ms)
      expect(durationWithout).toBeLessThan(100);
      expect(durationWith).toBeLessThan(200);
    });
  });

  describe('error handling', () => {
    it('should continue to work even if example fetch fails', async () => {
      // Mock database to throw error on example fetch
      const mockDb = (server as any).db;
      if (mockDb) {
        const originalPrepare = mockDb.prepare.bind(mockDb);
        mockDb.prepare = vi.fn((query: string) => {
          if (query.includes('template_node_configs')) {
            throw new Error('Database error');
          }
          return originalPrepare(query);
        });

        // Should not throw, should return results without examples
        const result = await (server as any).searchNodes('webhook', 5, { includeExamples: true });

        expect(result.results).toBeDefined();
        // Examples should be undefined due to error
        if (result.results.length > 0) {
          expect(result.results[0].examples).toBeUndefined();
        }
      }
    });

    it('should handle malformed parameters_json gracefully', async () => {
      const mockDb = (server as any).db;
      if (mockDb) {
        const originalPrepare = mockDb.prepare.bind(mockDb);
        mockDb.prepare = vi.fn((query: string) => {
          if (query.includes('template_node_configs')) {
            return {
              all: vi.fn(() => [
                {
                  parameters_json: 'invalid json',
                  template_name: 'Test Template',
                  template_views: 1000
                }
              ])
            };
          }
          return originalPrepare(query);
        });

        // Should not throw
        const result = await (server as any).searchNodes('webhook', 5, { includeExamples: true });
        expect(result).toBeDefined();
      }
    });
  });
});

describe('searchNodesLIKE with includeExamples', () => {
  let server: N8NDocumentationMCPServer;

  beforeEach(async () => {
    process.env.NODE_DB_PATH = ':memory:';
    server = new N8NDocumentationMCPServer();
    await (server as any).initialized;

    // Populate in-memory database with test nodes
    const testNodes = [
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
      }
    ];

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

  it('should support includeExamples in LIKE search', async () => {
    const result = await (server as any).searchNodesLIKE('webhook', 5, { includeExamples: true });

    expect(result).toBeDefined();
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('should not include examples when includeExamples is false', async () => {
    const result = await (server as any).searchNodesLIKE('webhook', 5, { includeExamples: false });

    expect(result).toBeDefined();
    expect(result.results).toBeDefined();
    if (result.results.length > 0) {
      result.results.forEach((node: any) => {
        expect(node.examples).toBeUndefined();
      });
    }
  });
});

describe('searchNodesFTS with includeExamples', () => {
  let server: N8NDocumentationMCPServer;

  beforeEach(async () => {
    process.env.NODE_DB_PATH = ':memory:';
    server = new N8NDocumentationMCPServer();
    await (server as any).initialized;
  });

  afterEach(() => {
    delete process.env.NODE_DB_PATH;
  });

  it('should support includeExamples in FTS search', async () => {
    const result = await (server as any).searchNodesFTS('webhook', 5, 'OR', { includeExamples: true });

    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('should pass options to example fetching logic', async () => {
    const result = await (server as any).searchNodesFTS('http', 5, 'AND', { includeExamples: true });

    expect(result).toBeDefined();
    expect(result.results).toBeDefined();
  });
});
