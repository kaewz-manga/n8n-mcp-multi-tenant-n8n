/**
 * Pre-configured n8n API Client for Integration Tests
 *
 * Provides a singleton API client instance configured with test credentials.
 * Automatically loads credentials from .env (local) or GitHub secrets (CI).
 */

import { N8nApiClient } from '../../../../src/services/n8n-api-client';
import { getN8nCredentials, validateCredentials } from './credentials';

let client: N8nApiClient | null = null;

/**
 * Get or create the test n8n API client
 *
 * Creates a singleton instance configured with credentials from
 * the environment. Validates that required credentials are present.
 *
 * @returns Configured N8nApiClient instance
 * @throws Error if credentials are missing or invalid
 *
 * @example
 * const client = getTestN8nClient();
 * const workflow = await client.createWorkflow({ ... });
 */
export function getTestN8nClient(): N8nApiClient {
  if (!client) {
    const creds = getN8nCredentials();
    validateCredentials(creds);
    client = new N8nApiClient({
      baseUrl: creds.url,
      apiKey: creds.apiKey,
      timeout: 30000,
      maxRetries: 3
    });
  }
  return client;
}

/**
 * Reset the test client instance
 *
 * Forces recreation of the client on next call to getTestN8nClient().
 * Useful for testing or when credentials change.
 */
export function resetTestN8nClient(): void {
  client = null;
}

/**
 * Check if the n8n API is accessible
 *
 * Performs a health check to verify API connectivity.
 *
 * @returns true if API is accessible, false otherwise
 */
export async function isN8nApiAccessible(): Promise<boolean> {
  try {
    const client = getTestN8nClient();
    await client.healthCheck();
    return true;
  } catch {
    return false;
  }
}
