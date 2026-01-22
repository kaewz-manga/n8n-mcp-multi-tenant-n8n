import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeRepository } from '../../../src/database/node-repository';
import { DatabaseAdapter, PreparedStatement, RunResult } from '../../../src/database/database-adapter';

/**
 * Unit tests for parseNodeRow() in NodeRepository
 * Tests proper parsing of AI documentation fields:
 * - npmReadme
 * - aiDocumentationSummary
 * - aiSummaryGeneratedAt
 */

// Create a complete mock for DatabaseAdapter
class MockDatabaseAdapter implements DatabaseAdapter {
  private statements = new Map<string, MockPreparedStatement>();
  private mockData = new Map<string, any>();

  prepare = vi.fn((sql: string) => {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, new MockPreparedStatement(sql, this.mockData));
    }
    return this.statements.get(sql)!;
  });

  exec = vi.fn();
  close = vi.fn();
  pragma = vi.fn();
  transaction = vi.fn((fn: () => any) => fn());
  checkFTS5Support = vi.fn(() => true);
  inTransaction = false;

  // Test helper to set mock data
  _setMockData(key: string, value: any) {
    this.mockData.set(key, value);
  }

  // Test helper to get statement by SQL
  _getStatement(sql: string) {
    return this.statements.get(sql);
  }
}

class MockPreparedStatement implements PreparedStatement {
  run = vi.fn((...params: any[]): RunResult => ({ changes: 1, lastInsertRowid: 1 }));
  get = vi.fn();
  all = vi.fn(() => []);
  iterate = vi.fn();
  pluck = vi.fn(() => this);
  expand = vi.fn(() => this);
  raw = vi.fn(() => this);
  columns = vi.fn(() => []);
  bind = vi.fn(() => this);

  constructor(private sql: string, private mockData: Map<string, any>) {
    // Configure get() based on SQL pattern
    if (sql.includes('SELECT * FROM nodes WHERE node_type = ?')) {
      this.get = vi.fn((nodeType: string) => this.mockData.get(`node:${nodeType}`));
    }
  }
}

describe('NodeRepository - AI Documentation Fields', () => {
  let repository: NodeRepository;
  let mockAdapter: MockDatabaseAdapter;

  beforeEach(() => {
    mockAdapter = new MockDatabaseAdapter();
    repository = new NodeRepository(mockAdapter);
  });

  describe('parseNodeRow - AI Documentation Fields', () => {
    it('should parse npmReadme field correctly', () => {
      const mockRow = createBaseNodeRow({
        npm_readme: '# Community Node README\n\nThis is a detailed README.',
      });

      mockAdapter._setMockData('node:nodes-community.slack', mockRow);

      const result = repository.getNode('nodes-community.slack');

      expect(result).toHaveProperty('npmReadme');
      expect(result.npmReadme).toBe('# Community Node README\n\nThis is a detailed README.');
    });

    it('should return null for npmReadme when not present', () => {
      const mockRow = createBaseNodeRow({
        npm_readme: null,
      });

      mockAdapter._setMockData('node:nodes-community.slack', mockRow);

      const result = repository.getNode('nodes-community.slack');

      expect(result).toHaveProperty('npmReadme');
      expect(result.npmReadme).toBeNull();
    });

    it('should return null for npmReadme when empty string', () => {
      const mockRow = createBaseNodeRow({
        npm_readme: '',
      });

      mockAdapter._setMockData('node:nodes-community.slack', mockRow);

      const result = repository.getNode('nodes-community.slack');

      expect(result.npmReadme).toBeNull();
    });

    it('should parse aiDocumentationSummary as JSON object', () => {
      const aiSummary = {
        purpose: 'Sends messages to Slack channels',
        capabilities: ['Send messages', 'Create channels', 'Upload files'],
        authentication: 'OAuth2 or API Token',
        commonUseCases: ['Team notifications', 'Alert systems'],
        limitations: ['Rate limits apply'],
        relatedNodes: ['n8n-nodes-base.slack'],
      };

      const mockRow = createBaseNodeRow({
        ai_documentation_summary: JSON.stringify(aiSummary),
      });

      mockAdapter._setMockData('node:nodes-community.slack', mockRow);

      const result = repository.getNode('nodes-community.slack');

      expect(result).toHaveProperty('aiDocumentationSummary');
      expect(result.aiDocumentationSummary).not.toBeNull();
      expect(result.aiDocumentationSummary.purpose).toBe('Sends messages to Slack channels');
      expect(result.aiDocumentationSummary.capabilities).toHaveLength(3);
      expect(result.aiDocumentationSummary.authentication).toBe('OAuth2 or API Token');
    });

    it('should return null for aiDocumentationSummary when malformed JSON', () => {
      const mockRow = createBaseNodeRow({
        ai_documentation_summary: '{invalid json content',
      });

      mockAdapter._setMockData('node:nodes-community.broken', mockRow);

      const result = repository.getNode('nodes-community.broken');

      expect(result).toHaveProperty('aiDocumentationSummary');
      expect(result.aiDocumentationSummary).toBeNull();
    });

    it('should return null for aiDocumentationSummary when null', () => {
      const mockRow = createBaseNodeRow({
        ai_documentation_summary: null,
      });

      mockAdapter._setMockData('node:nodes-community.github', mockRow);

      const result = repository.getNode('nodes-community.github');

      expect(result).toHaveProperty('aiDocumentationSummary');
      expect(result.aiDocumentationSummary).toBeNull();
    });

    it('should return null for aiDocumentationSummary when empty string', () => {
      const mockRow = createBaseNodeRow({
        ai_documentation_summary: '',
      });

      mockAdapter._setMockData('node:nodes-community.empty', mockRow);

      const result = repository.getNode('nodes-community.empty');

      expect(result).toHaveProperty('aiDocumentationSummary');
      // Empty string is falsy, so it returns null
      expect(result.aiDocumentationSummary).toBeNull();
    });

    it('should parse aiSummaryGeneratedAt correctly', () => {
      const mockRow = createBaseNodeRow({
        ai_summary_generated_at: '2024-01-15T10:30:00Z',
      });

      mockAdapter._setMockData('node:nodes-community.slack', mockRow);

      const result = repository.getNode('nodes-community.slack');

      expect(result).toHaveProperty('aiSummaryGeneratedAt');
      expect(result.aiSummaryGeneratedAt).toBe('2024-01-15T10:30:00Z');
    });

    it('should return null for aiSummaryGeneratedAt when not present', () => {
      const mockRow = createBaseNodeRow({
        ai_summary_generated_at: null,
      });

      mockAdapter._setMockData('node:nodes-community.slack', mockRow);

      const result = repository.getNode('nodes-community.slack');

      expect(result.aiSummaryGeneratedAt).toBeNull();
    });

    it('should parse all AI documentation fields together', () => {
      const aiSummary = {
        purpose: 'Complete documentation test',
        capabilities: ['Feature 1', 'Feature 2'],
        authentication: 'API Key',
        commonUseCases: ['Use case 1'],
        limitations: [],
        relatedNodes: [],
      };

      const mockRow = createBaseNodeRow({
        npm_readme: '# Complete Test README',
        ai_documentation_summary: JSON.stringify(aiSummary),
        ai_summary_generated_at: '2024-02-20T14:00:00Z',
      });

      mockAdapter._setMockData('node:nodes-community.complete', mockRow);

      const result = repository.getNode('nodes-community.complete');

      expect(result.npmReadme).toBe('# Complete Test README');
      expect(result.aiDocumentationSummary).not.toBeNull();
      expect(result.aiDocumentationSummary.purpose).toBe('Complete documentation test');
      expect(result.aiSummaryGeneratedAt).toBe('2024-02-20T14:00:00Z');
    });
  });

  describe('parseNodeRow - Malformed JSON Edge Cases', () => {
    it('should handle truncated JSON gracefully', () => {
      const mockRow = createBaseNodeRow({
        ai_documentation_summary: '{"purpose": "test", "capabilities": [',
      });

      mockAdapter._setMockData('node:nodes-community.truncated', mockRow);

      const result = repository.getNode('nodes-community.truncated');

      expect(result.aiDocumentationSummary).toBeNull();
    });

    it('should handle JSON with extra closing brackets gracefully', () => {
      const mockRow = createBaseNodeRow({
        ai_documentation_summary: '{"purpose": "test"}}',
      });

      mockAdapter._setMockData('node:nodes-community.extra', mockRow);

      const result = repository.getNode('nodes-community.extra');

      expect(result.aiDocumentationSummary).toBeNull();
    });

    it('should handle plain text instead of JSON gracefully', () => {
      const mockRow = createBaseNodeRow({
        ai_documentation_summary: 'This is plain text, not JSON',
      });

      mockAdapter._setMockData('node:nodes-community.plaintext', mockRow);

      const result = repository.getNode('nodes-community.plaintext');

      expect(result.aiDocumentationSummary).toBeNull();
    });

    it('should handle JSON array instead of object gracefully', () => {
      const mockRow = createBaseNodeRow({
        ai_documentation_summary: '["item1", "item2", "item3"]',
      });

      mockAdapter._setMockData('node:nodes-community.array', mockRow);

      const result = repository.getNode('nodes-community.array');

      // JSON.parse will successfully parse an array, so this returns the array
      expect(result.aiDocumentationSummary).toEqual(['item1', 'item2', 'item3']);
    });

    it('should handle unicode in JSON gracefully', () => {
      const aiSummary = {
        purpose: 'Node with unicode: emoji, Chinese: 中文, Arabic: العربية',
        capabilities: [],
        authentication: 'None',
        commonUseCases: [],
        limitations: [],
        relatedNodes: [],
      };

      const mockRow = createBaseNodeRow({
        ai_documentation_summary: JSON.stringify(aiSummary),
      });

      mockAdapter._setMockData('node:nodes-community.unicode', mockRow);

      const result = repository.getNode('nodes-community.unicode');

      expect(result.aiDocumentationSummary.purpose).toContain('中文');
      expect(result.aiDocumentationSummary.purpose).toContain('العربية');
    });
  });

  describe('parseNodeRow - Preserves Other Fields', () => {
    it('should preserve all standard node fields alongside AI documentation', () => {
      const aiSummary = {
        purpose: 'Test purpose',
        capabilities: [],
        authentication: 'None',
        commonUseCases: [],
        limitations: [],
        relatedNodes: [],
      };

      const mockRow = createFullNodeRow({
        npm_readme: '# README',
        ai_documentation_summary: JSON.stringify(aiSummary),
        ai_summary_generated_at: '2024-01-15T10:30:00Z',
      });

      mockAdapter._setMockData('node:nodes-community.full', mockRow);

      const result = repository.getNode('nodes-community.full');

      // Verify standard fields are preserved
      expect(result.nodeType).toBe('nodes-community.full');
      expect(result.displayName).toBe('Full Test Node');
      expect(result.description).toBe('A fully featured test node');
      expect(result.category).toBe('Test');
      expect(result.package).toBe('n8n-nodes-community');
      expect(result.isCommunity).toBe(true);
      expect(result.isVerified).toBe(true);

      // Verify AI documentation fields
      expect(result.npmReadme).toBe('# README');
      expect(result.aiDocumentationSummary).not.toBeNull();
      expect(result.aiSummaryGeneratedAt).toBe('2024-01-15T10:30:00Z');
    });
  });
});

// Helper function to create a base node row with defaults
function createBaseNodeRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    node_type: 'nodes-community.slack',
    display_name: 'Slack Community',
    description: 'A community Slack integration',
    category: 'Communication',
    development_style: 'declarative',
    package_name: 'n8n-nodes-community',
    is_ai_tool: 0,
    is_trigger: 0,
    is_webhook: 0,
    is_versioned: 1,
    is_tool_variant: 0,
    tool_variant_of: null,
    has_tool_variant: 0,
    version: '1.0',
    properties_schema: JSON.stringify([]),
    operations: JSON.stringify([]),
    credentials_required: JSON.stringify([]),
    documentation: null,
    outputs: null,
    output_names: null,
    is_community: 1,
    is_verified: 0,
    author_name: 'Community Author',
    author_github_url: 'https://github.com/author',
    npm_package_name: '@community/n8n-nodes-slack',
    npm_version: '1.0.0',
    npm_downloads: 1000,
    community_fetched_at: '2024-01-10T00:00:00Z',
    npm_readme: null,
    ai_documentation_summary: null,
    ai_summary_generated_at: null,
    ...overrides,
  };
}

// Helper function to create a full node row with all fields populated
function createFullNodeRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    node_type: 'nodes-community.full',
    display_name: 'Full Test Node',
    description: 'A fully featured test node',
    category: 'Test',
    development_style: 'declarative',
    package_name: 'n8n-nodes-community',
    is_ai_tool: 0,
    is_trigger: 0,
    is_webhook: 0,
    is_versioned: 1,
    is_tool_variant: 0,
    tool_variant_of: null,
    has_tool_variant: 0,
    version: '2.0',
    properties_schema: JSON.stringify([{ name: 'testProp', type: 'string' }]),
    operations: JSON.stringify([{ name: 'testOp', displayName: 'Test Operation' }]),
    credentials_required: JSON.stringify([{ name: 'testCred' }]),
    documentation: '# Full Test Node Documentation',
    outputs: null,
    output_names: null,
    is_community: 1,
    is_verified: 1,
    author_name: 'Test Author',
    author_github_url: 'https://github.com/test-author',
    npm_package_name: '@test/n8n-nodes-full',
    npm_version: '2.0.0',
    npm_downloads: 5000,
    community_fetched_at: '2024-02-15T00:00:00Z',
    ...overrides,
  };
}
