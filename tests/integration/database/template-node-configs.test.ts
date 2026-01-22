import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DatabaseAdapter, createDatabaseAdapter } from '../../../src/database/database-adapter';
import fs from 'fs';
import path from 'path';

/**
 * Integration tests for template_node_configs table
 * Testing database schema, migrations, and data operations
 */

describe('Template Node Configs Database Integration', () => {
  let db: DatabaseAdapter;
  let dbPath: string;

  beforeEach(async () => {
    // Create temporary database
    dbPath = ':memory:';
    db = await createDatabaseAdapter(dbPath);

    // Apply schema
    const schemaPath = path.join(__dirname, '../../../src/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Apply migration
    const migrationPath = path.join(__dirname, '../../../src/database/migrations/add-template-node-configs.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');
    db.exec(migration);

    // Insert test templates with id 1-1000 to satisfy foreign key constraints
    // Tests insert configs with various template_id values, so we pre-create many templates
    const stmt = db.prepare(`
      INSERT INTO templates (
        id, workflow_id, name, description, views,
        nodes_used, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    for (let i = 1; i <= 1000; i++) {
      stmt.run(i, i, `Test Template ${i}`, 'Test template for node configs', 100, '[]');
    }
  });

  afterEach(() => {
    if ('close' in db && typeof db.close === 'function') {
      db.close();
    }
  });

  describe('Schema Validation', () => {
    it('should create template_node_configs table', () => {
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='template_node_configs'
      `).get();

      expect(tableExists).toBeDefined();
      expect(tableExists).toHaveProperty('name', 'template_node_configs');
    });

    it('should have all required columns', () => {
      const columns = db.prepare(`PRAGMA table_info(template_node_configs)`).all() as any[];

      const columnNames = columns.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('node_type');
      expect(columnNames).toContain('template_id');
      expect(columnNames).toContain('template_name');
      expect(columnNames).toContain('template_views');
      expect(columnNames).toContain('node_name');
      expect(columnNames).toContain('parameters_json');
      expect(columnNames).toContain('credentials_json');
      expect(columnNames).toContain('has_credentials');
      expect(columnNames).toContain('has_expressions');
      expect(columnNames).toContain('complexity');
      expect(columnNames).toContain('use_cases');
      expect(columnNames).toContain('rank');
      expect(columnNames).toContain('created_at');
    });

    it('should have correct column types and constraints', () => {
      const columns = db.prepare(`PRAGMA table_info(template_node_configs)`).all() as any[];

      const idColumn = columns.find(col => col.name === 'id');
      expect(idColumn.pk).toBe(1); // Primary key

      const nodeTypeColumn = columns.find(col => col.name === 'node_type');
      expect(nodeTypeColumn.notnull).toBe(1); // NOT NULL

      const parametersJsonColumn = columns.find(col => col.name === 'parameters_json');
      expect(parametersJsonColumn.notnull).toBe(1); // NOT NULL
    });

    it('should have complexity CHECK constraint', () => {
      // Try to insert invalid complexity
      expect(() => {
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json, complexity
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'n8n-nodes-base.test',
          1,
          'Test Template',
          100,
          'Test Node',
          '{}',
          'invalid' // Should fail CHECK constraint
        );
      }).toThrow();
    });

    it('should accept valid complexity values', () => {
      const validComplexities = ['simple', 'medium', 'complex'];

      validComplexities.forEach((complexity, index) => {
        expect(() => {
          db.prepare(`
            INSERT INTO template_node_configs (
              node_type, template_id, template_name, template_views,
              node_name, parameters_json, complexity
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            'n8n-nodes-base.test',
            index + 1,
            'Test Template',
            100,
            'Test Node',
            '{}',
            complexity
          );
        }).not.toThrow();
      });

      const count = db.prepare('SELECT COUNT(*) as count FROM template_node_configs').get() as any;
      expect(count.count).toBe(3);
    });
  });

  describe('Indexes', () => {
    it('should create idx_config_node_type_rank index', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='template_node_configs'
      `).all() as any[];

      const indexNames = indexes.map(idx => idx.name);
      expect(indexNames).toContain('idx_config_node_type_rank');
    });

    it('should create idx_config_complexity index', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='template_node_configs'
      `).all() as any[];

      const indexNames = indexes.map(idx => idx.name);
      expect(indexNames).toContain('idx_config_complexity');
    });

    it('should create idx_config_auth index', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='template_node_configs'
      `).all() as any[];

      const indexNames = indexes.map(idx => idx.name);
      expect(indexNames).toContain('idx_config_auth');
    });
  });

  describe('View: ranked_node_configs', () => {
    it('should create ranked_node_configs view', () => {
      const viewExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='view' AND name='ranked_node_configs'
      `).get();

      expect(viewExists).toBeDefined();
      expect(viewExists).toHaveProperty('name', 'ranked_node_configs');
    });

    it('should return only top 5 ranked configs per node type', () => {
      // Insert 10 configs for same node type with different ranks
      for (let i = 1; i <= 10; i++) {
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json, rank
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'n8n-nodes-base.httpRequest',
          i,
          `Template ${i}`,
          1000 - (i * 50), // Decreasing views
          'HTTP Request',
          '{}',
          i // Rank 1-10
        );
      }

      const rankedConfigs = db.prepare('SELECT * FROM ranked_node_configs').all() as any[];

      // Should only return rank 1-5
      expect(rankedConfigs).toHaveLength(5);
      expect(Math.max(...rankedConfigs.map(c => c.rank))).toBe(5);
      expect(Math.min(...rankedConfigs.map(c => c.rank))).toBe(1);
    });

    it('should order by node_type and rank', () => {
      // Insert configs for multiple node types
      const configs = [
        { nodeType: 'n8n-nodes-base.webhook', rank: 2 },
        { nodeType: 'n8n-nodes-base.webhook', rank: 1 },
        { nodeType: 'n8n-nodes-base.httpRequest', rank: 2 },
        { nodeType: 'n8n-nodes-base.httpRequest', rank: 1 },
      ];

      configs.forEach((config, index) => {
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json, rank
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          config.nodeType,
          index + 1,
          `Template ${index}`,
          100,
          'Node',
          '{}',
          config.rank
        );
      });

      const rankedConfigs = db.prepare('SELECT * FROM ranked_node_configs ORDER BY node_type, rank').all() as any[];

      // First two should be httpRequest rank 1, 2
      expect(rankedConfigs[0].node_type).toBe('n8n-nodes-base.httpRequest');
      expect(rankedConfigs[0].rank).toBe(1);
      expect(rankedConfigs[1].node_type).toBe('n8n-nodes-base.httpRequest');
      expect(rankedConfigs[1].rank).toBe(2);

      // Last two should be webhook rank 1, 2
      expect(rankedConfigs[2].node_type).toBe('n8n-nodes-base.webhook');
      expect(rankedConfigs[2].rank).toBe(1);
      expect(rankedConfigs[3].node_type).toBe('n8n-nodes-base.webhook');
      expect(rankedConfigs[3].rank).toBe(2);
    });
  });

  describe('Foreign Key Constraints', () => {
    beforeEach(() => {
      // Enable foreign keys
      db.exec('PRAGMA foreign_keys = ON');
      // Note: Templates are already created in the main beforeEach
    });

    it('should allow inserting config with valid template_id', () => {
      expect(() => {
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          'n8n-nodes-base.test',
          1, // Valid template_id
          'Test Template',
          100,
          'Test Node',
          '{}'
        );
      }).not.toThrow();
    });

    it('should cascade delete configs when template is deleted', () => {
      // Insert config
      db.prepare(`
        INSERT INTO template_node_configs (
          node_type, template_id, template_name, template_views,
          node_name, parameters_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'n8n-nodes-base.test',
        1,
        'Test Template',
        100,
        'Test Node',
        '{}'
      );

      // Verify config exists
      let configs = db.prepare('SELECT * FROM template_node_configs WHERE template_id = ?').all(1) as any[];
      expect(configs).toHaveLength(1);

      // Delete template
      db.prepare('DELETE FROM templates WHERE id = ?').run(1);

      // Verify config is deleted (CASCADE)
      configs = db.prepare('SELECT * FROM template_node_configs WHERE template_id = ?').all(1) as any[];
      expect(configs).toHaveLength(0);
    });
  });

  describe('Data Operations', () => {
    it('should insert and retrieve config with all fields', () => {
      const testConfig = {
        node_type: 'n8n-nodes-base.webhook',
        template_id: 1,
        template_name: 'Webhook Template',
        template_views: 2000,
        node_name: 'Webhook Trigger',
        parameters_json: JSON.stringify({
          httpMethod: 'POST',
          path: 'webhook-test',
          responseMode: 'lastNode'
        }),
        credentials_json: JSON.stringify({
          webhookAuth: { id: '1', name: 'Webhook Auth' }
        }),
        has_credentials: 1,
        has_expressions: 1,
        complexity: 'medium',
        use_cases: JSON.stringify(['webhook processing', 'automation triggers']),
        rank: 1
      };

      db.prepare(`
        INSERT INTO template_node_configs (
          node_type, template_id, template_name, template_views,
          node_name, parameters_json, credentials_json,
          has_credentials, has_expressions, complexity, use_cases, rank
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...Object.values(testConfig));

      const retrieved = db.prepare('SELECT * FROM template_node_configs WHERE id = 1').get() as any;

      expect(retrieved.node_type).toBe(testConfig.node_type);
      expect(retrieved.template_id).toBe(testConfig.template_id);
      expect(retrieved.template_name).toBe(testConfig.template_name);
      expect(retrieved.template_views).toBe(testConfig.template_views);
      expect(retrieved.node_name).toBe(testConfig.node_name);
      expect(retrieved.parameters_json).toBe(testConfig.parameters_json);
      expect(retrieved.credentials_json).toBe(testConfig.credentials_json);
      expect(retrieved.has_credentials).toBe(testConfig.has_credentials);
      expect(retrieved.has_expressions).toBe(testConfig.has_expressions);
      expect(retrieved.complexity).toBe(testConfig.complexity);
      expect(retrieved.use_cases).toBe(testConfig.use_cases);
      expect(retrieved.rank).toBe(testConfig.rank);
      expect(retrieved.created_at).toBeDefined();
    });

    it('should handle nullable fields correctly', () => {
      db.prepare(`
        INSERT INTO template_node_configs (
          node_type, template_id, template_name, template_views,
          node_name, parameters_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'n8n-nodes-base.test',
        1,
        'Test',
        100,
        'Node',
        '{}'
      );

      const retrieved = db.prepare('SELECT * FROM template_node_configs WHERE id = 1').get() as any;

      expect(retrieved.credentials_json).toBeNull();
      expect(retrieved.has_credentials).toBe(0); // Default value
      expect(retrieved.has_expressions).toBe(0); // Default value
      expect(retrieved.rank).toBe(0); // Default value
    });

    it('should update rank values', () => {
      // Insert multiple configs
      for (let i = 1; i <= 3; i++) {
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json, rank
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'n8n-nodes-base.test',
          i,
          'Template',
          100,
          'Node',
          '{}',
          0 // Initial rank
        );
      }

      // Update ranks
      db.exec(`
        UPDATE template_node_configs
        SET rank = (
          SELECT COUNT(*) + 1
          FROM template_node_configs AS t2
          WHERE t2.node_type = template_node_configs.node_type
            AND t2.template_views > template_node_configs.template_views
        )
      `);

      const configs = db.prepare('SELECT * FROM template_node_configs ORDER BY rank').all() as any[];

      // All should have same rank (same views)
      expect(configs.every(c => c.rank === 1)).toBe(true);
    });

    it('should delete configs with rank > 10', () => {
      // Insert 15 configs with different ranks
      for (let i = 1; i <= 15; i++) {
        db.prepare(`
          INSERT INTO template_node_configs (
            node_type, template_id, template_name, template_views,
            node_name, parameters_json, rank
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'n8n-nodes-base.test',
          i,
          'Template',
          100,
          'Node',
          '{}',
          i // Rank 1-15
        );
      }

      // Delete configs with rank > 10
      db.exec(`
        DELETE FROM template_node_configs
        WHERE id NOT IN (
          SELECT id FROM template_node_configs
          WHERE rank <= 10
          ORDER BY node_type, rank
        )
      `);

      const remaining = db.prepare('SELECT * FROM template_node_configs').all() as any[];

      expect(remaining).toHaveLength(10);
      expect(Math.max(...remaining.map(c => c.rank))).toBe(10);
    });
  });

  describe('Query Performance', () => {
    beforeEach(() => {
      // Insert 1000 configs for performance testing
      const stmt = db.prepare(`
        INSERT INTO template_node_configs (
          node_type, template_id, template_name, template_views,
          node_name, parameters_json, rank
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const nodeTypes = [
        'n8n-nodes-base.httpRequest',
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.slack',
        'n8n-nodes-base.googleSheets',
        'n8n-nodes-base.code'
      ];

      for (let i = 1; i <= 1000; i++) {
        const nodeType = nodeTypes[i % nodeTypes.length];
        stmt.run(
          nodeType,
          i,
          `Template ${i}`,
          Math.floor(Math.random() * 10000),
          'Node',
          '{}',
          (i % 10) + 1 // Rank 1-10
        );
      }
    });

    it('should query by node_type and rank efficiently', () => {
      const start = Date.now();
      const results = db.prepare(`
        SELECT * FROM template_node_configs
        WHERE node_type = ?
        ORDER BY rank
        LIMIT 3
      `).all('n8n-nodes-base.httpRequest') as any[];
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10); // Should be very fast with index
    });

    it('should filter by complexity efficiently', () => {
      // First set some complexity values
      db.exec(`UPDATE template_node_configs SET complexity = 'simple' WHERE id % 3 = 0`);
      db.exec(`UPDATE template_node_configs SET complexity = 'medium' WHERE id % 3 = 1`);
      db.exec(`UPDATE template_node_configs SET complexity = 'complex' WHERE id % 3 = 2`);

      const start = Date.now();
      const results = db.prepare(`
        SELECT * FROM template_node_configs
        WHERE node_type = ? AND complexity = ?
        ORDER BY rank
        LIMIT 5
      `).all('n8n-nodes-base.webhook', 'simple') as any[];
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10); // Should be fast with index
    });
  });

  describe('Migration Idempotency', () => {
    it('should be safe to run migration multiple times', () => {
      const migrationPath = path.join(__dirname, '../../../src/database/migrations/add-template-node-configs.sql');
      const migration = fs.readFileSync(migrationPath, 'utf-8');

      // Run migration again
      expect(() => {
        db.exec(migration);
      }).not.toThrow();

      // Table should still exist
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='template_node_configs'
      `).get();

      expect(tableExists).toBeDefined();
    });
  });
});
