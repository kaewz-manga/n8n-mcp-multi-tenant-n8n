/**
 * Node Repository Utility for Integration Tests
 *
 * Provides a singleton NodeRepository instance for integration tests
 * that require validation or autofix functionality.
 */

import path from 'path';
import { createDatabaseAdapter, DatabaseAdapter } from '../../../../src/database/database-adapter';
import { NodeRepository } from '../../../../src/database/node-repository';

let repositoryInstance: NodeRepository | null = null;
let dbInstance: DatabaseAdapter | null = null;

/**
 * Get or create NodeRepository instance
 *
 * Uses the production nodes.db database (data/nodes.db).
 *
 * @returns Singleton NodeRepository instance
 * @throws {Error} If database file cannot be found or opened
 *
 * @example
 * const repository = await getNodeRepository();
 * const nodeInfo = await repository.getNodeByType('n8n-nodes-base.webhook');
 */
export async function getNodeRepository(): Promise<NodeRepository> {
  if (repositoryInstance) {
    return repositoryInstance;
  }

  const dbPath = path.join(process.cwd(), 'data/nodes.db');
  dbInstance = await createDatabaseAdapter(dbPath);
  repositoryInstance = new NodeRepository(dbInstance);

  return repositoryInstance;
}

/**
 * Close database and reset repository instance
 *
 * Should be called in test cleanup (afterAll) to prevent resource leaks.
 * Properly closes the database connection and resets the singleton.
 *
 * @example
 * afterAll(async () => {
 *   await closeNodeRepository();
 * });
 */
export async function closeNodeRepository(): Promise<void> {
  if (dbInstance && typeof dbInstance.close === 'function') {
    await dbInstance.close();
  }
  dbInstance = null;
  repositoryInstance = null;
}

/**
 * Reset repository instance (useful for test cleanup)
 *
 * @deprecated Use closeNodeRepository() instead to properly close database connections
 */
export function resetNodeRepository(): void {
  repositoryInstance = null;
}
