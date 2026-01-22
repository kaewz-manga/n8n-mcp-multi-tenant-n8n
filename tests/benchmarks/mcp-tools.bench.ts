import { bench, describe } from 'vitest';
import { NodeRepository } from '../../src/database/node-repository';
import { createDatabaseAdapter } from '../../src/database/database-adapter';
import { EnhancedConfigValidator } from '../../src/services/enhanced-config-validator';
import { PropertyFilter } from '../../src/services/property-filter';
import path from 'path';

/**
 * MCP Tool Performance Benchmarks
 *
 * These benchmarks measure end-to-end performance of actual MCP tool operations
 * using the REAL production database (data/nodes.db with 525+ nodes).
 *
 * Unlike database-queries.bench.ts which uses mock data, these benchmarks
 * reflect what AI assistants actually experience when calling MCP tools,
 * making this the most meaningful performance metric for the system.
 */
describe('MCP Tool Performance (Production Database)', () => {
  let repository: NodeRepository;

  beforeAll(async () => {
    // Use REAL production database
    const dbPath = path.join(__dirname, '../../data/nodes.db');
    const db = await createDatabaseAdapter(dbPath);
    repository = new NodeRepository(db);
    // Initialize similarity services for validation
    EnhancedConfigValidator.initializeSimilarityServices(repository);
  });

  /**
   * search_nodes - Most frequently used tool for node discovery
   *
   * This measures:
   * - Database FTS5 full-text search
   * - Result filtering and ranking
   * - Response serialization
   *
   * Target: <20ms for common queries
   */
  bench('search_nodes - common query (http)', async () => {
    await repository.searchNodes('http', 'OR', 20);
  }, {
    iterations: 100,
    warmupIterations: 10,
    warmupTime: 500,
    time: 3000
  });

  bench('search_nodes - AI agent query (slack message)', async () => {
    await repository.searchNodes('slack send message', 'AND', 10);
  }, {
    iterations: 100,
    warmupIterations: 10,
    warmupTime: 500,
    time: 3000
  });

  /**
   * get_node_essentials - Fast retrieval of node configuration
   *
   * This measures:
   * - Database node lookup
   * - Property filtering (essentials only)
   * - Response formatting
   *
   * Target: <10ms for most nodes
   */
  bench('get_node_essentials - HTTP Request node', async () => {
    const node = await repository.getNodeByType('n8n-nodes-base.httpRequest');
    if (node && node.properties) {
      PropertyFilter.getEssentials(node.properties, node.nodeType);
    }
  }, {
    iterations: 200,
    warmupIterations: 20,
    warmupTime: 500,
    time: 3000
  });

  bench('get_node_essentials - Slack node', async () => {
    const node = await repository.getNodeByType('n8n-nodes-base.slack');
    if (node && node.properties) {
      PropertyFilter.getEssentials(node.properties, node.nodeType);
    }
  }, {
    iterations: 200,
    warmupIterations: 20,
    warmupTime: 500,
    time: 3000
  });

  /**
   * list_nodes - Initial exploration/listing
   *
   * This measures:
   * - Database query with pagination
   * - Result serialization
   * - Category filtering
   *
   * Target: <15ms for first page
   */
  bench('list_nodes - first 50 nodes', async () => {
    await repository.getAllNodes(50);
  }, {
    iterations: 100,
    warmupIterations: 10,
    warmupTime: 500,
    time: 3000
  });

  bench('list_nodes - AI tools only', async () => {
    await repository.getAIToolNodes();
  }, {
    iterations: 100,
    warmupIterations: 10,
    warmupTime: 500,
    time: 3000
  });

  /**
   * validate_node_operation - Configuration validation
   *
   * This measures:
   * - Schema lookup
   * - Validation logic execution
   * - Error message formatting
   *
   * Target: <15ms for simple validations
   */
  bench('validate_node_operation - HTTP Request (minimal)', async () => {
    const node = await repository.getNodeByType('n8n-nodes-base.httpRequest');
    if (node && node.properties) {
      EnhancedConfigValidator.validateWithMode(
        'n8n-nodes-base.httpRequest',
        {},
        node.properties,
        'operation',
        'ai-friendly'
      );
    }
  }, {
    iterations: 100,
    warmupIterations: 10,
    warmupTime: 500,
    time: 3000
  });

  bench('validate_node_operation - HTTP Request (with params)', async () => {
    const node = await repository.getNodeByType('n8n-nodes-base.httpRequest');
    if (node && node.properties) {
      EnhancedConfigValidator.validateWithMode(
        'n8n-nodes-base.httpRequest',
        {
          requestMethod: 'GET',
          url: 'https://api.example.com',
          authentication: 'none'
        },
        node.properties,
        'operation',
        'ai-friendly'
      );
    }
  }, {
    iterations: 100,
    warmupIterations: 10,
    warmupTime: 500,
    time: 3000
  });
});
