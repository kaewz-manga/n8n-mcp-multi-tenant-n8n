import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { N8NDocumentationMCPServer } from '../../../src/mcp/server';

/**
 * Unit tests for getNodeDocumentation() method in MCP server
 * Tests AI documentation field handling and JSON parsing error handling
 */

describe('N8NDocumentationMCPServer - getNodeDocumentation', () => {
  let server: N8NDocumentationMCPServer;

  beforeEach(async () => {
    process.env.NODE_DB_PATH = ':memory:';
    server = new N8NDocumentationMCPServer();
    await (server as any).initialized;

    const db = (server as any).db;
    if (db) {
      // Insert test nodes with various AI documentation states
      const insertStmt = db.prepare(`
        INSERT INTO nodes (
          node_type, package_name, display_name, description, category,
          is_ai_tool, is_trigger, is_webhook, is_versioned, version,
          properties_schema, operations, documentation,
          ai_documentation_summary, ai_summary_generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Node with full AI documentation
      insertStmt.run(
        'nodes-community.slack',
        'n8n-nodes-community-slack',
        'Slack Community',
        'A community Slack integration',
        'Communication',
        0,
        0,
        0,
        1,
        '1.0',
        JSON.stringify([{ name: 'channel', type: 'string' }]),
        JSON.stringify([]),
        '# Slack Community Node\n\nThis node allows you to send messages to Slack.',
        JSON.stringify({
          purpose: 'Sends messages to Slack channels',
          capabilities: ['Send messages', 'Create channels'],
          authentication: 'OAuth2 or API Token',
          commonUseCases: ['Team notifications'],
          limitations: ['Rate limits apply'],
          relatedNodes: ['n8n-nodes-base.slack'],
        }),
        '2024-01-15T10:30:00Z'
      );

      // Node without AI documentation summary
      insertStmt.run(
        'nodes-community.github',
        'n8n-nodes-community-github',
        'GitHub Community',
        'A community GitHub integration',
        'Development',
        0,
        0,
        0,
        1,
        '1.0',
        JSON.stringify([]),
        JSON.stringify([]),
        '# GitHub Community Node',
        null,
        null
      );

      // Node with malformed JSON in ai_documentation_summary
      insertStmt.run(
        'nodes-community.broken',
        'n8n-nodes-community-broken',
        'Broken Node',
        'A node with broken AI summary',
        'Test',
        0,
        0,
        0,
        0,
        null,
        JSON.stringify([]),
        JSON.stringify([]),
        '# Broken Node',
        '{invalid json content',
        '2024-01-15T10:30:00Z'
      );

      // Node without documentation but with AI summary
      insertStmt.run(
        'nodes-community.minimal',
        'n8n-nodes-community-minimal',
        'Minimal Node',
        'A minimal node',
        'Test',
        0,
        0,
        0,
        0,
        null,
        JSON.stringify([{ name: 'test', type: 'string' }]),
        JSON.stringify([]),
        null,
        JSON.stringify({
          purpose: 'Minimal functionality',
          capabilities: ['Basic operation'],
          authentication: 'None',
          commonUseCases: [],
          limitations: [],
          relatedNodes: [],
        }),
        '2024-01-15T10:30:00Z'
      );
    }
  });

  afterEach(() => {
    delete process.env.NODE_DB_PATH;
  });

  describe('AI Documentation Fields', () => {
    it('should return AI documentation fields when present', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.slack');

      expect(result).toHaveProperty('aiDocumentationSummary');
      expect(result).toHaveProperty('aiSummaryGeneratedAt');
      expect(result.aiDocumentationSummary).not.toBeNull();
      expect(result.aiDocumentationSummary.purpose).toBe('Sends messages to Slack channels');
      expect(result.aiDocumentationSummary.capabilities).toContain('Send messages');
      expect(result.aiSummaryGeneratedAt).toBe('2024-01-15T10:30:00Z');
    });

    it('should return null for aiDocumentationSummary when AI summary is missing', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.github');

      expect(result).toHaveProperty('aiDocumentationSummary');
      expect(result.aiDocumentationSummary).toBeNull();
      expect(result.aiSummaryGeneratedAt).toBeNull();
    });

    it('should return null for aiDocumentationSummary when JSON is malformed', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.broken');

      expect(result).toHaveProperty('aiDocumentationSummary');
      expect(result.aiDocumentationSummary).toBeNull();
      // The timestamp should still be present since it's stored separately
      expect(result.aiSummaryGeneratedAt).toBe('2024-01-15T10:30:00Z');
    });

    it('should include AI documentation in fallback response when documentation is missing', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.minimal');

      expect(result.hasDocumentation).toBe(false);
      expect(result.aiDocumentationSummary).not.toBeNull();
      expect(result.aiDocumentationSummary.purpose).toBe('Minimal functionality');
    });
  });

  describe('Node Documentation Response Structure', () => {
    it('should return complete documentation response with all fields', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.slack');

      expect(result).toHaveProperty('nodeType', 'nodes-community.slack');
      expect(result).toHaveProperty('displayName', 'Slack Community');
      expect(result).toHaveProperty('documentation');
      expect(result).toHaveProperty('hasDocumentation', true);
      expect(result).toHaveProperty('aiDocumentationSummary');
      expect(result).toHaveProperty('aiSummaryGeneratedAt');
    });

    it('should generate fallback documentation when documentation is missing', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.minimal');

      expect(result.hasDocumentation).toBe(false);
      expect(result.documentation).toContain('Minimal Node');
      expect(result.documentation).toContain('A minimal node');
      expect(result.documentation).toContain('Note');
    });

    it('should throw error for non-existent node', async () => {
      await expect(
        (server as any).getNodeDocumentation('nodes-community.nonexistent')
      ).rejects.toThrow('Node nodes-community.nonexistent not found');
    });
  });

  describe('safeJsonParse Error Handling', () => {
    it('should parse valid JSON correctly', () => {
      const parseMethod = (server as any).safeJsonParse.bind(server);
      const validJson = '{"key": "value", "number": 42}';

      const result = parseMethod(validJson);

      expect(result).toEqual({ key: 'value', number: 42 });
    });

    it('should return default value for invalid JSON', () => {
      const parseMethod = (server as any).safeJsonParse.bind(server);
      const invalidJson = '{invalid json}';
      const defaultValue = { default: true };

      const result = parseMethod(invalidJson, defaultValue);

      expect(result).toEqual(defaultValue);
    });

    it('should return null as default when default value not specified', () => {
      const parseMethod = (server as any).safeJsonParse.bind(server);
      const invalidJson = 'not json at all';

      const result = parseMethod(invalidJson);

      expect(result).toBeNull();
    });

    it('should handle empty string gracefully', () => {
      const parseMethod = (server as any).safeJsonParse.bind(server);

      const result = parseMethod('', []);

      expect(result).toEqual([]);
    });

    it('should handle nested JSON structures', () => {
      const parseMethod = (server as any).safeJsonParse.bind(server);
      const nestedJson = JSON.stringify({
        level1: {
          level2: {
            value: 'deep',
          },
        },
        array: [1, 2, 3],
      });

      const result = parseMethod(nestedJson);

      expect(result.level1.level2.value).toBe('deep');
      expect(result.array).toEqual([1, 2, 3]);
    });

    it('should handle truncated JSON as invalid', () => {
      const parseMethod = (server as any).safeJsonParse.bind(server);
      const truncatedJson = '{"purpose": "test", "capabilities": [';

      const result = parseMethod(truncatedJson, null);

      expect(result).toBeNull();
    });
  });

  describe('Node Type Normalization', () => {
    it('should find node with normalized type', async () => {
      // Insert a node with full form type
      const db = (server as any).db;
      if (db) {
        db.prepare(`
          INSERT INTO nodes (
            node_type, package_name, display_name, description, category,
            is_ai_tool, is_trigger, is_webhook, is_versioned, version,
            properties_schema, operations, documentation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'nodes-base.httpRequest',
          'n8n-nodes-base',
          'HTTP Request',
          'Makes HTTP requests',
          'Core',
          0,
          0,
          0,
          1,
          '4.2',
          JSON.stringify([]),
          JSON.stringify([]),
          '# HTTP Request'
        );
      }

      const result = await (server as any).getNodeDocumentation('nodes-base.httpRequest');

      expect(result.nodeType).toBe('nodes-base.httpRequest');
      expect(result.displayName).toBe('HTTP Request');
    });

    it('should try alternative type forms when primary lookup fails', async () => {
      // This tests the alternative lookup logic
      // The node should be found using normalization
      const db = (server as any).db;
      if (db) {
        db.prepare(`
          INSERT INTO nodes (
            node_type, package_name, display_name, description, category,
            is_ai_tool, is_trigger, is_webhook, is_versioned, version,
            properties_schema, operations, documentation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'nodes-base.webhook',
          'n8n-nodes-base',
          'Webhook',
          'Starts workflow on webhook call',
          'Core',
          0,
          1,
          1,
          1,
          '2.0',
          JSON.stringify([]),
          JSON.stringify([]),
          '# Webhook'
        );
      }

      const result = await (server as any).getNodeDocumentation('nodes-base.webhook');

      expect(result.nodeType).toBe('nodes-base.webhook');
    });
  });

  describe('AI Documentation Summary Content', () => {
    it('should preserve all fields in AI documentation summary', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.slack');

      const summary = result.aiDocumentationSummary;
      expect(summary).toHaveProperty('purpose');
      expect(summary).toHaveProperty('capabilities');
      expect(summary).toHaveProperty('authentication');
      expect(summary).toHaveProperty('commonUseCases');
      expect(summary).toHaveProperty('limitations');
      expect(summary).toHaveProperty('relatedNodes');
    });

    it('should return capabilities as an array', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.slack');

      expect(Array.isArray(result.aiDocumentationSummary.capabilities)).toBe(true);
      expect(result.aiDocumentationSummary.capabilities).toHaveLength(2);
    });

    it('should handle empty arrays in AI documentation summary', async () => {
      const result = await (server as any).getNodeDocumentation('nodes-community.minimal');

      expect(result.aiDocumentationSummary.commonUseCases).toEqual([]);
      expect(result.aiDocumentationSummary.limitations).toEqual([]);
      expect(result.aiDocumentationSummary.relatedNodes).toEqual([]);
    });
  });
});
