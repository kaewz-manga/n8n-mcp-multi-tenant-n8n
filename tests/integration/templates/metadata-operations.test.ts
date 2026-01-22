import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TemplateService } from '../../../src/templates/template-service';
import { TemplateRepository } from '../../../src/templates/template-repository';
import { MetadataGenerator } from '../../../src/templates/metadata-generator';
import { BatchProcessor } from '../../../src/templates/batch-processor';
import { DatabaseAdapter, createDatabaseAdapter } from '../../../src/database/database-adapter';
import { tmpdir } from 'os';
import * as path from 'path';
import { unlinkSync, existsSync, readFileSync } from 'fs';

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock template sanitizer
vi.mock('../../../src/utils/template-sanitizer', () => {
  class MockTemplateSanitizer {
    sanitizeWorkflow = vi.fn((workflow) => ({ sanitized: workflow, wasModified: false }));
    detectTokens = vi.fn(() => []);
  }
  
  return {
    TemplateSanitizer: MockTemplateSanitizer
  };
});

// Mock OpenAI for MetadataGenerator and BatchProcessor
vi.mock('openai', () => {
  const mockClient = {
    chat: {
      completions: {
        create: vi.fn()
      }
    },
    files: {
      create: vi.fn(),
      content: vi.fn(),
      del: vi.fn()
    },
    batches: {
      create: vi.fn(),
      retrieve: vi.fn()
    }
  };

  return {
    default: vi.fn().mockImplementation(() => mockClient)
  };
});

describe('Template Metadata Operations - Integration Tests', () => {
  let adapter: DatabaseAdapter;
  let repository: TemplateRepository;
  let service: TemplateService;
  let dbPath: string;

  beforeEach(async () => {
    // Create temporary database
    dbPath = path.join(tmpdir(), `test-metadata-${Date.now()}.db`);
    adapter = await createDatabaseAdapter(dbPath);
    
    // Initialize database schema
    const schemaPath = path.join(__dirname, '../../../src/database/schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    adapter.exec(schema);
    
    // Initialize repository and service
    repository = new TemplateRepository(adapter);
    service = new TemplateService(adapter);

    // Create test templates
    await createTestTemplates();
  });

  afterEach(() => {
    if (adapter) {
      adapter.close();
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    vi.clearAllMocks();
  });

  async function createTestTemplates() {
    // Create test templates with metadata
    const templates = [
      {
        workflow: {
          id: 1,
          name: 'Simple Webhook Slack',
          description: 'Basic webhook to Slack automation',
          user: { id: 1, name: 'Test User', username: 'test', verified: true },
          nodes: [
            { id: 1, name: 'n8n-nodes-base.webhook', icon: 'fa:webhook' },
            { id: 2, name: 'n8n-nodes-base.slack', icon: 'fa:slack' }
          ],
          totalViews: 150,
          createdAt: '2024-01-01T00:00:00Z'
        },
        detail: {
          id: 1,
          name: 'Simple Webhook Slack',
          description: 'Basic webhook to Slack automation',
          views: 150,
          createdAt: '2024-01-01T00:00:00Z',
          workflow: {
            nodes: [
              { type: 'n8n-nodes-base.webhook', name: 'Webhook', id: '1', position: [0, 0], parameters: {}, typeVersion: 1 },
              { type: 'n8n-nodes-base.slack', name: 'Slack', id: '2', position: [100, 0], parameters: {}, typeVersion: 1 }
            ],
            connections: { '1': { main: [[{ node: '2', type: 'main', index: 0 }]] } },
            settings: {}
          }
        },
        categories: ['automation', 'communication'],
        metadata: {
          categories: ['automation', 'communication'],
          complexity: 'simple' as const,
          use_cases: ['Webhook processing', 'Slack notifications'],
          estimated_setup_minutes: 15,
          required_services: ['Slack API'],
          key_features: ['Real-time notifications', 'Easy setup'],
          target_audience: ['developers', 'marketers']
        }
      },
      {
        workflow: {
          id: 2,
          name: 'Complex AI Data Pipeline',
          description: 'Advanced data processing with AI analysis',
          user: { id: 2, name: 'AI Expert', username: 'aiexpert', verified: true },
          nodes: [
            { id: 1, name: 'n8n-nodes-base.webhook', icon: 'fa:webhook' },
            { id: 2, name: '@n8n/n8n-nodes-langchain.openAi', icon: 'fa:brain' },
            { id: 3, name: 'n8n-nodes-base.postgres', icon: 'fa:database' },
            { id: 4, name: 'n8n-nodes-base.googleSheets', icon: 'fa:sheet' }
          ],
          totalViews: 450,
          createdAt: '2024-01-15T00:00:00Z'
        },
        detail: {
          id: 2,
          name: 'Complex AI Data Pipeline',
          description: 'Advanced data processing with AI analysis',
          views: 450,
          createdAt: '2024-01-15T00:00:00Z',
          workflow: {
            nodes: [
              { type: 'n8n-nodes-base.webhook', name: 'Webhook', id: '1', position: [0, 0], parameters: {}, typeVersion: 1 },
              { type: '@n8n/n8n-nodes-langchain.openAi', name: 'OpenAI', id: '2', position: [100, 0], parameters: {}, typeVersion: 1 },
              { type: 'n8n-nodes-base.postgres', name: 'Postgres', id: '3', position: [200, 0], parameters: {}, typeVersion: 1 },
              { type: 'n8n-nodes-base.googleSheets', name: 'Google Sheets', id: '4', position: [300, 0], parameters: {}, typeVersion: 1 }
            ],
            connections: {
              '1': { main: [[{ node: '2', type: 'main', index: 0 }]] },
              '2': { main: [[{ node: '3', type: 'main', index: 0 }]] },
              '3': { main: [[{ node: '4', type: 'main', index: 0 }]] }
            },
            settings: {}
          }
        },
        categories: ['ai', 'data_processing'],
        metadata: {
          categories: ['ai', 'data_processing', 'automation'],
          complexity: 'complex' as const,
          use_cases: ['Data analysis', 'AI processing', 'Report generation'],
          estimated_setup_minutes: 120,
          required_services: ['OpenAI API', 'PostgreSQL', 'Google Sheets API'],
          key_features: ['AI analysis', 'Database integration', 'Automated reports'],
          target_audience: ['developers', 'analysts']
        }
      },
      {
        workflow: {
          id: 3,
          name: 'Medium Email Automation',
          description: 'Email automation with moderate complexity',
          user: { id: 3, name: 'Marketing User', username: 'marketing', verified: false },
          nodes: [
            { id: 1, name: 'n8n-nodes-base.cron', icon: 'fa:clock' },
            { id: 2, name: 'n8n-nodes-base.gmail', icon: 'fa:mail' },
            { id: 3, name: 'n8n-nodes-base.googleSheets', icon: 'fa:sheet' }
          ],
          totalViews: 200,
          createdAt: '2024-02-01T00:00:00Z'
        },
        detail: {
          id: 3,
          name: 'Medium Email Automation',
          description: 'Email automation with moderate complexity',
          views: 200,
          createdAt: '2024-02-01T00:00:00Z',
          workflow: {
            nodes: [
              { type: 'n8n-nodes-base.cron', name: 'Cron', id: '1', position: [0, 0], parameters: {}, typeVersion: 1 },
              { type: 'n8n-nodes-base.gmail', name: 'Gmail', id: '2', position: [100, 0], parameters: {}, typeVersion: 1 },
              { type: 'n8n-nodes-base.googleSheets', name: 'Google Sheets', id: '3', position: [200, 0], parameters: {}, typeVersion: 1 }
            ],
            connections: {
              '1': { main: [[{ node: '2', type: 'main', index: 0 }]] },
              '2': { main: [[{ node: '3', type: 'main', index: 0 }]] }
            },
            settings: {}
          }
        },
        categories: ['email_automation', 'scheduling'],
        metadata: {
          categories: ['email_automation', 'scheduling'],
          complexity: 'medium' as const,
          use_cases: ['Email campaigns', 'Scheduled reports'],
          estimated_setup_minutes: 45,
          required_services: ['Gmail API', 'Google Sheets API'],
          key_features: ['Scheduled execution', 'Email automation'],
          target_audience: ['marketers']
        }
      }
    ];

    // Save templates
    for (const template of templates) {
      repository.saveTemplate(template.workflow, template.detail, template.categories);
      repository.updateTemplateMetadata(template.workflow.id, template.metadata);
    }
  }

  describe('Repository Metadata Operations', () => {
    it('should update template metadata successfully', () => {
      const newMetadata = {
        categories: ['test', 'updated'],
        complexity: 'simple' as const,
        use_cases: ['Testing'],
        estimated_setup_minutes: 10,
        required_services: [],
        key_features: ['Test feature'],
        target_audience: ['testers']
      };

      repository.updateTemplateMetadata(1, newMetadata);

      // Verify metadata was updated
      const templates = repository.searchTemplatesByMetadata({
        category: 'test'}, 10, 0);

      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe(1);
    });

    it('should batch update metadata for multiple templates', () => {
      const metadataMap = new Map([
        [1, {
          categories: ['batch_test'],
          complexity: 'simple' as const,
          use_cases: ['Batch testing'],
          estimated_setup_minutes: 20,
          required_services: [],
          key_features: ['Batch update'],
          target_audience: ['developers']
        }],
        [2, {
          categories: ['batch_test'],
          complexity: 'complex' as const,
          use_cases: ['Complex batch testing'],
          estimated_setup_minutes: 60,
          required_services: ['OpenAI'],
          key_features: ['Advanced batch'],
          target_audience: ['developers']
        }]
      ]);

      repository.batchUpdateMetadata(metadataMap);

      // Verify both templates were updated
      const templates = repository.searchTemplatesByMetadata({
        category: 'batch_test'}, 10, 0);

      expect(templates).toHaveLength(2);
      expect(templates.map(t => t.id).sort()).toEqual([1, 2]);
    });

    it('should search templates by category', () => {
      const templates = repository.searchTemplatesByMetadata({
        category: 'automation'}, 10, 0);

      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0]).toHaveProperty('id');
      expect(templates[0]).toHaveProperty('name');
    });

    it('should search templates by complexity', () => {
      const simpleTemplates = repository.searchTemplatesByMetadata({
        complexity: 'simple'}, 10, 0);

      const complexTemplates = repository.searchTemplatesByMetadata({
        complexity: 'complex'}, 10, 0);

      expect(simpleTemplates).toHaveLength(1);
      expect(complexTemplates).toHaveLength(1);
      expect(simpleTemplates[0].id).toBe(1);
      expect(complexTemplates[0].id).toBe(2);
    });

    it('should search templates by setup time', () => {
      const quickTemplates = repository.searchTemplatesByMetadata({
        maxSetupMinutes: 30}, 10, 0);

      const longTemplates = repository.searchTemplatesByMetadata({
        minSetupMinutes: 60}, 10, 0);

      expect(quickTemplates).toHaveLength(1); // Only 15 min template (45 min > 30)
      expect(longTemplates).toHaveLength(1); // 120 min template
    });

    it('should search templates by required service', () => {
      const slackTemplates = repository.searchTemplatesByMetadata({
        requiredService: 'slack'}, 10, 0);

      const openaiTemplates = repository.searchTemplatesByMetadata({
        requiredService: 'OpenAI'}, 10, 0);

      expect(slackTemplates).toHaveLength(1);
      expect(openaiTemplates).toHaveLength(1);
    });

    it('should search templates by target audience', () => {
      const developerTemplates = repository.searchTemplatesByMetadata({
        targetAudience: 'developers'}, 10, 0);

      const marketerTemplates = repository.searchTemplatesByMetadata({
        targetAudience: 'marketers'}, 10, 0);

      expect(developerTemplates).toHaveLength(2);
      expect(marketerTemplates).toHaveLength(2);
    });

    it('should handle combined filters correctly', () => {
      const filteredTemplates = repository.searchTemplatesByMetadata({
        complexity: 'medium',
        targetAudience: 'marketers',
        maxSetupMinutes: 60}, 10, 0);

      expect(filteredTemplates).toHaveLength(1);
      expect(filteredTemplates[0].id).toBe(3);
    });

    it('should return correct counts for metadata searches', () => {
      const automationCount = repository.getSearchTemplatesByMetadataCount({
        category: 'automation'
      });

      const complexCount = repository.getSearchTemplatesByMetadataCount({
        complexity: 'complex'
      });

      expect(automationCount).toBeGreaterThan(0);
      expect(complexCount).toBe(1);
    });

    it('should get unique categories', () => {
      const categories = repository.getUniqueCategories();
      
      expect(categories).toContain('automation');
      expect(categories).toContain('communication');
      expect(categories).toContain('ai');
      expect(categories).toContain('data_processing');
      expect(categories).toContain('email_automation');
      expect(categories).toContain('scheduling');
    });

    it('should get unique target audiences', () => {
      const audiences = repository.getUniqueTargetAudiences();
      
      expect(audiences).toContain('developers');
      expect(audiences).toContain('marketers');
      expect(audiences).toContain('analysts');
    });

    it('should get templates by category', () => {
      const aiTemplates = repository.getTemplatesByCategory('ai');
      // Both template 2 has 'ai', and template 1 has 'automation' which contains 'ai' as substring
      // due to LIKE '%ai%' matching
      expect(aiTemplates).toHaveLength(2);
      // Template 2 should be first due to higher view count (450 vs 150)
      expect(aiTemplates[0].id).toBe(2);
    });

    it('should get templates by complexity', () => {
      const simpleTemplates = repository.getTemplatesByComplexity('simple');
      expect(simpleTemplates).toHaveLength(1);
      expect(simpleTemplates[0].id).toBe(1);
    });

    it('should get templates without metadata', () => {
      // Create a template without metadata
      const workflow = {
        id: 999,
        name: 'No Metadata Template',
        description: 'Template without metadata',
        user: { id: 999, name: 'Test', username: 'test', verified: true },
        nodes: [{ id: 1, name: 'n8n-nodes-base.webhook', icon: 'fa:webhook' }],
        totalViews: 50, // Must be > 10 to not be filtered out
        createdAt: '2024-03-01T00:00:00Z'
      };

      const detail = {
        id: 999,
        name: 'No Metadata Template',
        description: 'Template without metadata',
        views: 50, // Must be > 10 to not be filtered out
        createdAt: '2024-03-01T00:00:00Z',
        workflow: {
          nodes: [{ type: 'n8n-nodes-base.webhook', name: 'Webhook', id: '1', position: [0, 0], parameters: {}, typeVersion: 1 }],
          connections: {},
          settings: {}
        }
      };

      repository.saveTemplate(workflow, detail, []);
      // Don't update metadata for this template, so it remains without metadata

      const templatesWithoutMetadata = repository.getTemplatesWithoutMetadata();
      expect(templatesWithoutMetadata.some(t => t.workflow_id === 999)).toBe(true);
    });

    it('should get outdated metadata templates', () => {
      // This test would require manipulating timestamps, 
      // for now just verify the method doesn't throw
      const outdatedTemplates = repository.getTemplatesWithOutdatedMetadata(30);
      expect(Array.isArray(outdatedTemplates)).toBe(true);
    });

    it('should get metadata statistics', () => {
      const stats = repository.getMetadataStats();
      
      expect(stats).toHaveProperty('withMetadata');
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('withoutMetadata');
      expect(stats).toHaveProperty('outdated');

      expect(stats.withMetadata).toBeGreaterThan(0);
      expect(stats.total).toBeGreaterThan(0);
    });
  });

  describe('Service Layer Integration', () => {
    it('should search templates with metadata through service', async () => {
      const results = await service.searchTemplatesByMetadata({
        complexity: 'simple'}, 10, 0);

      expect(results).toHaveProperty('items');
      expect(results).toHaveProperty('total');
      expect(results).toHaveProperty('hasMore');
      expect(results.items.length).toBeGreaterThan(0);
      expect(results.items[0]).toHaveProperty('metadata');
    });

    it('should handle pagination correctly in metadata search', async () => {
      const page1 = await service.searchTemplatesByMetadata(
        {}, // empty filters
        1,  // limit
        0   // offset
      );

      const page2 = await service.searchTemplatesByMetadata(
        {}, // empty filters
        1,  // limit
        1   // offset
      );

      expect(page1.items).toHaveLength(1);
      expect(page2.items).toHaveLength(1);
      expect(page1.items[0].id).not.toBe(page2.items[0].id);
    });

    it('should return templates with metadata information', async () => {
      const results = await service.searchTemplatesByMetadata({
        category: 'automation'}, 10, 0);

      expect(results.items.length).toBeGreaterThan(0);
      
      const template = results.items[0];
      expect(template).toHaveProperty('metadata');
      expect(template.metadata).toHaveProperty('categories');
      expect(template.metadata).toHaveProperty('complexity');
      expect(template.metadata).toHaveProperty('estimated_setup_minutes');
    });
  });

  describe('Security and Error Handling', () => {
    it('should handle malicious input safely in metadata search', () => {
      const maliciousInputs = [
        { category: "'; DROP TABLE templates; --" },
        { requiredService: "'; UNION SELECT * FROM sqlite_master; --" },
        { targetAudience: "administrators'; DELETE FROM templates WHERE '1'='1" }
      ];

      maliciousInputs.forEach(input => {
        expect(() => {
          repository.searchTemplatesByMetadata({
            ...input}, 10, 0);
        }).not.toThrow();
      });
    });

    it('should handle invalid metadata gracefully', () => {
      const invalidMetadata = {
        categories: null,
        complexity: 'invalid_complexity',
        use_cases: 'not_an_array',
        estimated_setup_minutes: 'not_a_number',
        required_services: undefined,
        key_features: {},
        target_audience: 42
      };

      expect(() => {
        repository.updateTemplateMetadata(1, invalidMetadata);
      }).not.toThrow();
    });

    it('should handle empty search results gracefully', () => {
      const results = repository.searchTemplatesByMetadata({
        category: 'nonexistent_category'}, 10, 0);

      expect(results).toHaveLength(0);
    });

    it('should handle edge case parameters', () => {
      // Test extreme values
      const results = repository.searchTemplatesByMetadata({
        maxSetupMinutes: 0,
        minSetupMinutes: 999999
      }, 0, -1); // offset -1 to test edge case

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large result sets efficiently', () => {
      // Test with maximum limit
      const startTime = Date.now();
      const results = repository.searchTemplatesByMetadata({}, 100, 0);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle concurrent metadata updates', () => {
      const updates: any[] = [];
      
      for (let i = 0; i < 10; i++) {
        updates.push(() => {
          repository.updateTemplateMetadata(1, {
            categories: [`concurrent_test_${i}`],
            complexity: 'simple' as const,
            use_cases: ['Testing'],
            estimated_setup_minutes: 10,
            required_services: [],
            key_features: ['Concurrent'],
            target_audience: ['developers']
          });
        });
      }

      // Execute all updates
      expect(() => {
        updates.forEach(update => update());
      }).not.toThrow();
    });
  });
});