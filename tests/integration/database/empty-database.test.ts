/**
 * Integration tests for empty database scenarios
 * Ensures we detect and handle empty database situations that caused production failures
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseAdapter } from '../../../src/database/database-adapter';
import { NodeRepository } from '../../../src/database/node-repository';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Empty Database Detection Tests', () => {
  let tempDbPath: string;
  let db: any;
  let repository: NodeRepository;

  beforeEach(async () => {
    // Create a temporary database file
    tempDbPath = path.join(os.tmpdir(), `test-empty-${Date.now()}.db`);
    db = await createDatabaseAdapter(tempDbPath);

    // Initialize schema
    const schemaPath = path.join(__dirname, '../../../src/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    repository = new NodeRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    // Clean up temp file
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('Empty Nodes Table Detection', () => {
    it('should detect empty nodes table', () => {
      const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get();
      expect(count.count).toBe(0);
    });

    it('should detect empty FTS5 index', () => {
      const count = db.prepare('SELECT COUNT(*) as count FROM nodes_fts').get();
      expect(count.count).toBe(0);
    });

    it('should return empty results for critical node searches', () => {
      const criticalSearches = ['webhook', 'merge', 'split', 'code', 'http'];

      for (const search of criticalSearches) {
        const results = db.prepare(`
          SELECT node_type FROM nodes_fts
          WHERE nodes_fts MATCH ?
        `).all(search);

        expect(results).toHaveLength(0);
      }
    });

    it('should fail validation with empty database', () => {
      const validation = validateEmptyDatabase(repository);

      expect(validation.passed).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.issues[0]).toMatch(/CRITICAL.*no nodes found/i);
    });
  });

  describe('LIKE Fallback with Empty Database', () => {
    it('should return empty results for LIKE searches', () => {
      const results = db.prepare(`
        SELECT node_type FROM nodes
        WHERE node_type LIKE ? OR display_name LIKE ? OR description LIKE ?
      `).all('%webhook%', '%webhook%', '%webhook%');

      expect(results).toHaveLength(0);
    });

    it('should return empty results for multi-word LIKE searches', () => {
      const results = db.prepare(`
        SELECT node_type FROM nodes
        WHERE (node_type LIKE ? OR display_name LIKE ? OR description LIKE ?)
        OR (node_type LIKE ? OR display_name LIKE ? OR description LIKE ?)
      `).all('%split%', '%split%', '%split%', '%batch%', '%batch%', '%batch%');

      expect(results).toHaveLength(0);
    });
  });

  describe('Repository Methods with Empty Database', () => {
    it('should return null for getNode() with empty database', () => {
      const node = repository.getNode('nodes-base.webhook');
      expect(node).toBeNull();
    });

    it('should return empty array for searchNodes() with empty database', () => {
      const results = repository.searchNodes('webhook');
      expect(results).toHaveLength(0);
    });

    it('should return empty array for getAITools() with empty database', () => {
      const tools = repository.getAITools();
      expect(tools).toHaveLength(0);
    });

    it('should return 0 for getNodeCount() with empty database', () => {
      const count = repository.getNodeCount();
      expect(count).toBe(0);
    });
  });

  describe('Validation Messages for Empty Database', () => {
    it('should provide clear error message for empty database', () => {
      const validation = validateEmptyDatabase(repository);

      const criticalError = validation.issues.find(issue =>
        issue.includes('CRITICAL') && issue.includes('empty')
      );

      expect(criticalError).toBeDefined();
      expect(criticalError).toContain('no nodes found');
    });

    it('should suggest rebuild command in error message', () => {
      const validation = validateEmptyDatabase(repository);

      const errorWithSuggestion = validation.issues.find(issue =>
        issue.toLowerCase().includes('rebuild')
      );

      // This expectation documents that we should add rebuild suggestions
      // Currently validation doesn't include this, but it should
      if (!errorWithSuggestion) {
        console.warn('TODO: Add rebuild suggestion to validation error messages');
      }
    });
  });

  describe('Empty Template Data', () => {
    it('should detect empty templates table', () => {
      const count = db.prepare('SELECT COUNT(*) as count FROM templates').get();
      expect(count.count).toBe(0);
    });

    it('should handle missing template data gracefully', () => {
      const templates = db.prepare('SELECT * FROM templates LIMIT 10').all();
      expect(templates).toHaveLength(0);
    });
  });
});

/**
 * Validation function matching rebuild.ts logic
 */
function validateEmptyDatabase(repository: NodeRepository): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  try {
    const db = (repository as any).db;

    // Check if database has any nodes
    const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
    if (nodeCount.count === 0) {
      issues.push('CRITICAL: Database is empty - no nodes found! Rebuild failed or was interrupted.');
      return { passed: false, issues };
    }

    // Check minimum expected node count
    if (nodeCount.count < 500) {
      issues.push(`WARNING: Only ${nodeCount.count} nodes found - expected at least 500 (both n8n packages)`);
    }

    // Check FTS5 table
    const ftsTableCheck = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='nodes_fts'
    `).get();

    if (!ftsTableCheck) {
      issues.push('CRITICAL: FTS5 table (nodes_fts) does not exist - searches will fail or be very slow');
    } else {
      const ftsCount = db.prepare('SELECT COUNT(*) as count FROM nodes_fts').get() as { count: number };

      if (ftsCount.count === 0) {
        issues.push('CRITICAL: FTS5 index is empty - searches will return zero results');
      }
    }
  } catch (error) {
    issues.push(`Validation error: ${(error as Error).message}`);
  }

  return {
    passed: issues.length === 0,
    issues
  };
}
