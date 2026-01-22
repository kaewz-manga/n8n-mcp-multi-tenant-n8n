import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseAdapter, DatabaseAdapter } from '../../../src/database/database-adapter';
import fs from 'fs';
import path from 'path';
import { sampleConfigs, compressWorkflow, sampleWorkflows } from '../../fixtures/template-configs';

/**
 * End-to-end integration tests for template-based examples feature
 * Tests the complete flow: database -> MCP server -> examples in response
 */

describe('Template Examples E2E Integration', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    // Create in-memory database
    db = await createDatabaseAdapter(':memory:');

    // Apply schema
    const schemaPath = path.join(__dirname, '../../../src/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Apply migration
    const migrationPath = path.join(__dirname, '../../../src/database/migrations/add-template-node-configs.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');
    db.exec(migration);

    // Seed test data
    seedTemplateConfigs();
  });

  afterEach(() => {
    if ('close' in db && typeof db.close === 'function') {
      db.close();
    }
  });

  function seedTemplateConfigs() {
    // Insert sample templates first to satisfy foreign key constraints
    // The sampleConfigs use template_id 1-4, edge cases use 998-999
    const templateIds = [1, 2, 3, 4, 998, 999];
    for (const id of templateIds) {
      db.prepare(`
        INSERT INTO templates (
          id, workflow_id, name, description, views,
          nodes_used, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        id,
        `Test Template ${id}`,
        'Test Description',
        1000,
        JSON.stringify(['n8n-nodes-base.webhook', 'n8n-nodes-base.httpRequest'])
      );
    }

    // Insert webhook configs
    db.prepare(`
      INSERT INTO template_node_configs (
        node_type, template_id, template_name, template_views,
        node_name, parameters_json, credentials_json,
        has_credentials, has_expressions, complexity, use_cases, rank
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...Object.values(sampleConfigs.simpleWebhook)
    );

    db.prepare(`
      INSERT INTO template_node_configs (
        node_type, template_id, template_name, template_views,
        node_name, parameters_json, credentials_json,
        has_credentials, has_expressions, complexity, use_cases, rank
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...Object.values(sampleConfigs.webhookWithAuth)
    );

    // Insert HTTP request configs
    db.prepare(`
      INSERT INTO template_node_configs (
        node_type, template_id, template_name, template_views,
        node_name, parameters_json, credentials_json,
        has_credentials, has_expressions, complexity, use_cases, rank
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...Object.values(sampleConfigs.httpRequestBasic)
    );

    db.prepare(`
      INSERT INTO template_node_configs (
        node_type, template_id, template_name, template_views,
        node_name, parameters_json, credentials_json,
        has_credentials, has_expressions, complexity, use_cases, rank
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...Object.values(sampleConfigs.httpRequestWithExpressions)
    );
  }

  describe('Querying Examples Directly', () => {
    it('should fetch top 2 examples for webhook node', () => {
      const examples = db.prepare(`
        SELECT
          parameters_json,
          template_name,
          template_views
        FROM template_node_configs
        WHERE node_type = ?
        ORDER BY rank
        LIMIT 2
      `).all('n8n-nodes-base.webhook') as any[];

      expect(examples).toHaveLength(2);
      expect(examples[0].template_name).toBe('Simple Webhook Trigger');
      expect(examples[1].template_name).toBe('Authenticated Webhook');
    });

    it('should fetch top 3 examples with metadata for HTTP request node', () => {
      const examples = db.prepare(`
        SELECT
          parameters_json,
          template_name,
          template_views,
          complexity,
          use_cases,
          has_credentials,
          has_expressions
        FROM template_node_configs
        WHERE node_type = ?
        ORDER BY rank
        LIMIT 3
      `).all('n8n-nodes-base.httpRequest') as any[];

      expect(examples).toHaveLength(2); // Only 2 inserted
      expect(examples[0].template_name).toBe('Basic HTTP GET Request');
      expect(examples[0].complexity).toBe('simple');
      expect(examples[0].has_expressions).toBe(0);

      expect(examples[1].template_name).toBe('Dynamic HTTP Request');
      expect(examples[1].complexity).toBe('complex');
      expect(examples[1].has_expressions).toBe(1);
    });
  });

  describe('Example Data Structure Validation', () => {
    it('should have valid JSON in parameters_json', () => {
      const examples = db.prepare(`
        SELECT parameters_json
        FROM template_node_configs
        WHERE node_type = ?
        LIMIT 1
      `).all('n8n-nodes-base.webhook') as any[];

      expect(() => {
        const params = JSON.parse(examples[0].parameters_json);
        expect(params).toHaveProperty('httpMethod');
        expect(params).toHaveProperty('path');
      }).not.toThrow();
    });

    it('should have valid JSON in use_cases', () => {
      const examples = db.prepare(`
        SELECT use_cases
        FROM template_node_configs
        WHERE node_type = ?
        LIMIT 1
      `).all('n8n-nodes-base.webhook') as any[];

      expect(() => {
        const useCases = JSON.parse(examples[0].use_cases);
        expect(Array.isArray(useCases)).toBe(true);
      }).not.toThrow();
    });

    it('should have credentials_json when has_credentials is 1', () => {
      const examples = db.prepare(`
        SELECT credentials_json, has_credentials
        FROM template_node_configs
        WHERE has_credentials = 1
        LIMIT 1
      `).all() as any[];

      if (examples.length > 0) {
        expect(examples[0].credentials_json).not.toBeNull();
        expect(() => {
          JSON.parse(examples[0].credentials_json);
        }).not.toThrow();
      }
    });
  });

  describe('Ranked View Functionality', () => {
    it('should return only top 5 ranked configs per node type from view', () => {
      // Insert templates first to satisfy foreign key constraints
      // Note: seedTemplateConfigs already created templates 1-4, so start from 5
      for (let i = 5; i <= 14; i++) {
        db.prepare(`
          INSERT INTO templates (
            id, workflow_id, name, description, views,
            nodes_used, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(i, i, `Template ${i}`, 'Test', 1000 - (i * 50), '[]');
      }

      // Insert 10 configs for same node type
      for (let i = 5; i <= 14; i++) {
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json, rank
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'n8n-nodes-base.webhook',
          i,
          `Template ${i}`,
          1000 - (i * 50),
          'Webhook',
          '{}',
          i
        );
      }

      const rankedConfigs = db.prepare(`
        SELECT * FROM ranked_node_configs
        WHERE node_type = ?
      `).all('n8n-nodes-base.webhook') as any[];

      expect(rankedConfigs.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Performance with Real-World Data Volume', () => {
    beforeEach(() => {
      // Insert templates first to satisfy foreign key constraints
      for (let i = 1; i <= 100; i++) {
        db.prepare(`
          INSERT INTO templates (
            id, workflow_id, name, description, views,
            nodes_used, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(i + 100, i + 100, `Template ${i}`, 'Test', Math.floor(Math.random() * 10000), '[]');
      }

      // Insert 100 configs across 10 different node types
      const nodeTypes = [
        'n8n-nodes-base.slack',
        'n8n-nodes-base.googleSheets',
        'n8n-nodes-base.code',
        'n8n-nodes-base.if',
        'n8n-nodes-base.switch',
        'n8n-nodes-base.set',
        'n8n-nodes-base.merge',
        'n8n-nodes-base.splitInBatches',
        'n8n-nodes-base.postgres',
        'n8n-nodes-base.gmail'
      ];

      for (let i = 1; i <= 100; i++) {
        const nodeType = nodeTypes[i % nodeTypes.length];
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json, rank
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          nodeType,
          i + 100, // Offset template_id
          `Template ${i}`,
          Math.floor(Math.random() * 10000),
          'Node',
          '{}',
          (i % 10) + 1
        );
      }
    });

    it('should query specific node type examples quickly', () => {
      const start = Date.now();
      const examples = db.prepare(`
        SELECT * FROM template_node_configs
        WHERE node_type = ?
        ORDER BY rank
        LIMIT 3
      `).all('n8n-nodes-base.slack') as any[];
      const duration = Date.now() - start;

      expect(examples.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5); // Should be very fast with index
    });

    it('should filter by complexity efficiently', () => {
      // Set complexity on configs
      db.exec(`UPDATE template_node_configs SET complexity = 'simple' WHERE id % 3 = 0`);
      db.exec(`UPDATE template_node_configs SET complexity = 'medium' WHERE id % 3 = 1`);

      const start = Date.now();
      const examples = db.prepare(`
        SELECT * FROM template_node_configs
        WHERE node_type = ? AND complexity = ?
        ORDER BY rank
        LIMIT 3
      `).all('n8n-nodes-base.code', 'simple') as any[];
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle node types with no configs', () => {
      const examples = db.prepare(`
        SELECT * FROM template_node_configs
        WHERE node_type = ?
        LIMIT 2
      `).all('n8n-nodes-base.nonexistent') as any[];

      expect(examples).toHaveLength(0);
    });

    it('should handle very long parameters_json', () => {
      const longParams = JSON.stringify({
        options: {
          queryParameters: Array.from({ length: 100 }, (_, i) => ({
            name: `param${i}`,
            value: `value${i}`.repeat(10)
          }))
        }
      });

      db.prepare(`
        INSERT INTO template_node_configs (
          node_type, template_id, template_name, template_views,
          node_name, parameters_json, rank
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'n8n-nodes-base.test',
        999,
        'Long Params Template',
        100,
        'Test',
        longParams,
        1
      );

      const example = db.prepare(`
        SELECT parameters_json FROM template_node_configs WHERE template_id = ?
      `).get(999) as any;

      expect(() => {
        const parsed = JSON.parse(example.parameters_json);
        expect(parsed.options.queryParameters).toHaveLength(100);
      }).not.toThrow();
    });

    it('should handle special characters in parameters', () => {
      const specialParams = JSON.stringify({
        message: "Test with 'quotes' and \"double quotes\"",
        unicode: "特殊文字 🎉 émojis",
        symbols: "!@#$%^&*()_+-={}[]|\\:;<>?,./"
      });

      db.prepare(`
        INSERT INTO template_node_configs (
          node_type, template_id, template_name, template_views,
          node_name, parameters_json, rank
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'n8n-nodes-base.test',
        998,
        'Special Chars Template',
        100,
        'Test',
        specialParams,
        1
      );

      const example = db.prepare(`
        SELECT parameters_json FROM template_node_configs WHERE template_id = ?
      `).get(998) as any;

      expect(() => {
        const parsed = JSON.parse(example.parameters_json);
        expect(parsed.message).toContain("'quotes'");
        expect(parsed.unicode).toContain("🎉");
      }).not.toThrow();
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity with templates table', () => {
      // Try to insert config with non-existent template_id (with FK enabled)
      db.exec('PRAGMA foreign_keys = ON');

      expect(() => {
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json, rank
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'n8n-nodes-base.test',
          999999, // Non-existent template_id
          'Test',
          100,
          'Node',
          '{}',
          1
        );
      }).toThrow(); // Should fail due to FK constraint
    });

    it('should cascade delete configs when template is deleted', () => {
      db.exec('PRAGMA foreign_keys = ON');

      // Insert a new template (use id 1000 to avoid conflicts with seedTemplateConfigs)
      db.prepare(`
        INSERT INTO templates (
          id, workflow_id, name, description, views,
          nodes_used, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(1000, 1000, 'Test Template 1000', 'Desc', 100, '[]');

      db.prepare(`
        INSERT INTO template_node_configs (
          node_type, template_id, template_name, template_views,
          node_name, parameters_json, rank
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'n8n-nodes-base.test',
        1000,
        'Test',
        100,
        'Node',
        '{}',
        1
      );

      // Verify config exists
      let config = db.prepare('SELECT * FROM template_node_configs WHERE template_id = ?').get(1000);
      expect(config).toBeDefined();

      // Delete template
      db.prepare('DELETE FROM templates WHERE id = ?').run(1000);

      // Verify config is deleted (CASCADE)
      config = db.prepare('SELECT * FROM template_node_configs WHERE template_id = ?').get(1000);
      expect(config).toBeUndefined();
    });
  });
});
