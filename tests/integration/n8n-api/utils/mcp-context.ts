import { InstanceContext } from '../../../../src/types/instance-context';
import { getN8nCredentials } from './credentials';
import { NodeRepository } from '../../../../src/database/node-repository';
import { createDatabaseAdapter } from '../../../../src/database/database-adapter';
import * as path from 'path';

// Singleton repository instance for tests
let repositoryInstance: NodeRepository | null = null;

/**
 * Creates MCP context for testing MCP handlers against real n8n instance
 * This is what gets passed to MCP handlers (handleCreateWorkflow, etc.)
 */
export function createMcpContext(): InstanceContext {
  const creds = getN8nCredentials();
  return {
    n8nApiUrl: creds.url,
    n8nApiKey: creds.apiKey
  };
}

/**
 * Gets or creates a NodeRepository instance for integration tests
 * Uses the project's main database
 */
export async function getMcpRepository(): Promise<NodeRepository> {
  if (repositoryInstance) {
    return repositoryInstance;
  }

  // Use the main project database
  const dbPath = path.join(process.cwd(), 'data', 'nodes.db');
  const db = await createDatabaseAdapter(dbPath);
  repositoryInstance = new NodeRepository(db);

  return repositoryInstance;
}

/**
 * Reset the repository instance (useful for test cleanup)
 */
export function resetMcpRepository(): void {
  repositoryInstance = null;
}
