import { describe, it, expect } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';

describe('Basic MCP Connection', () => {
  it('should initialize MCP server', async () => {
    const server = new N8NDocumentationMCPServer();

    // Test executeTool directly - tools_documentation returns a string
    const result = await server.executeTool('tools_documentation', {});
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result).toContain('n8n MCP');

    await server.shutdown();
  });

  it('should execute search_nodes tool', async () => {
    const server = new N8NDocumentationMCPServer();

    try {
      // Search for a common node to verify database has content
      const result = await server.executeTool('search_nodes', { query: 'http', limit: 5 });
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);

      if (result.totalCount > 0) {
        // If database has nodes, we should get results
        expect(result.results.length).toBeLessThanOrEqual(5);
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0]).toHaveProperty('nodeType');
        expect(result.results[0]).toHaveProperty('displayName');
      }
    } catch (error: any) {
      // In test environment with empty database, expect appropriate error
      expect(error.message).toContain('Database is empty');
    }

    await server.shutdown();
  });

  it('should search nodes by keyword', async () => {
    const server = new N8NDocumentationMCPServer();

    try {
      // Search to check if database has nodes
      const searchResult = await server.executeTool('search_nodes', { query: 'set', limit: 1 });
      const hasNodes = searchResult.totalCount > 0;

      const result = await server.executeTool('search_nodes', { query: 'webhook' });
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);

      // Only expect results if the database has nodes
      if (hasNodes) {
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.totalCount).toBeGreaterThan(0);

        // Should find webhook node
        const webhookNode = result.results.find((n: any) => n.nodeType === 'nodes-base.webhook');
        expect(webhookNode).toBeDefined();
        expect(webhookNode.displayName).toContain('Webhook');
      }
    } catch (error: any) {
      // In test environment with empty database, expect appropriate error
      expect(error.message).toContain('Database is empty');
    }

    await server.shutdown();
  });
});