/**
 * Integration Test Credentials Management
 *
 * Provides environment-aware credential loading for integration tests.
 * - Local development: Reads from .env file
 * - CI/GitHub Actions: Uses GitHub secrets from process.env
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env file for local development
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface N8nTestCredentials {
  url: string;
  apiKey: string;
  webhookUrls: {
    get: string;
    post: string;
    put: string;
    delete: string;
  };
  cleanup: {
    enabled: boolean;
    tag: string;
    namePrefix: string;
  };
}

/**
 * Get n8n credentials for integration tests
 *
 * Automatically detects environment (local vs CI) and loads
 * credentials from the appropriate source.
 *
 * @returns N8nTestCredentials
 * @throws Error if required credentials are missing
 */
export function getN8nCredentials(): N8nTestCredentials {
  if (process.env.CI) {
    // CI: Use GitHub secrets - validate required variables first
    const url = process.env.N8N_API_URL;
    const apiKey = process.env.N8N_API_KEY;

    if (!url || !apiKey) {
      throw new Error(
        'Missing required CI credentials:\n' +
        `  N8N_API_URL: ${url ? 'set' : 'MISSING'}\n` +
        `  N8N_API_KEY: ${apiKey ? 'set' : 'MISSING'}\n` +
        'Please configure GitHub secrets for integration tests.'
      );
    }

    return {
      url,
      apiKey,
      webhookUrls: {
        get: process.env.N8N_TEST_WEBHOOK_GET_URL || '',
        post: process.env.N8N_TEST_WEBHOOK_POST_URL || '',
        put: process.env.N8N_TEST_WEBHOOK_PUT_URL || '',
        delete: process.env.N8N_TEST_WEBHOOK_DELETE_URL || ''
      },
      cleanup: {
        enabled: true,
        tag: 'mcp-integration-test',
        namePrefix: '[MCP-TEST]'
      }
    };
  } else {
    // Local: Use .env file - validate required variables first
    const url = process.env.N8N_API_URL;
    const apiKey = process.env.N8N_API_KEY;

    if (!url || !apiKey) {
      throw new Error(
        'Missing required credentials in .env:\n' +
        `  N8N_API_URL: ${url ? 'set' : 'MISSING'}\n` +
        `  N8N_API_KEY: ${apiKey ? 'set' : 'MISSING'}\n\n` +
        'Please add these to your .env file.\n' +
        'See .env.example for configuration details.'
      );
    }

    return {
      url,
      apiKey,
      webhookUrls: {
        get: process.env.N8N_TEST_WEBHOOK_GET_URL || '',
        post: process.env.N8N_TEST_WEBHOOK_POST_URL || '',
        put: process.env.N8N_TEST_WEBHOOK_PUT_URL || '',
        delete: process.env.N8N_TEST_WEBHOOK_DELETE_URL || ''
      },
      cleanup: {
        enabled: process.env.N8N_TEST_CLEANUP_ENABLED !== 'false',
        tag: process.env.N8N_TEST_TAG || 'mcp-integration-test',
        namePrefix: process.env.N8N_TEST_NAME_PREFIX || '[MCP-TEST]'
      }
    };
  }
}

/**
 * Validate that required credentials are present
 *
 * @param creds - Credentials to validate
 * @throws Error if required credentials are missing
 */
export function validateCredentials(creds: N8nTestCredentials): void {
  const missing: string[] = [];

  if (!creds.url) {
    missing.push(process.env.CI ? 'N8N_URL' : 'N8N_API_URL');
  }
  if (!creds.apiKey) {
    missing.push('N8N_API_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required n8n credentials: ${missing.join(', ')}\n\n` +
      `Please set the following environment variables:\n` +
      missing.map(v => `  ${v}`).join('\n') + '\n\n' +
      `See .env.example for configuration details.`
    );
  }
}

/**
 * Validate that webhook URLs are configured
 *
 * @param creds - Credentials to validate
 * @throws Error with setup instructions if webhook URLs are missing
 */
export function validateWebhookUrls(creds: N8nTestCredentials): void {
  const missing: string[] = [];

  if (!creds.webhookUrls.get) missing.push('GET');
  if (!creds.webhookUrls.post) missing.push('POST');
  if (!creds.webhookUrls.put) missing.push('PUT');
  if (!creds.webhookUrls.delete) missing.push('DELETE');

  if (missing.length > 0) {
    const envVars = missing.map(m => `N8N_TEST_WEBHOOK_${m}_URL`);

    throw new Error(
      `Missing webhook URLs for HTTP methods: ${missing.join(', ')}\n\n` +
      `Webhook testing requires pre-activated workflows in n8n.\n` +
      `n8n API doesn't support workflow activation, so these must be created manually.\n\n` +
      `Setup Instructions:\n` +
      `1. Create ${missing.length} workflow(s) in your n8n instance\n` +
      `2. Each workflow should have a single Webhook node\n` +
      `3. Configure webhook paths:\n` +
      missing.map(m => `   - ${m}: mcp-test-${m.toLowerCase()}`).join('\n') + '\n' +
      `4. ACTIVATE each workflow in n8n UI\n` +
      `5. Set the following environment variables with full webhook URLs:\n` +
      envVars.map(v => `   ${v}=<full-webhook-url>`).join('\n') + '\n\n' +
      `Example: N8N_TEST_WEBHOOK_GET_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-get\n\n` +
      `See docs/local/integration-testing-plan.md for detailed instructions.`
    );
  }
}

/**
 * Check if credentials are configured (non-throwing version)
 *
 * @returns true if basic credentials are available
 */
export function hasCredentials(): boolean {
  try {
    const creds = getN8nCredentials();
    return !!(creds.url && creds.apiKey);
  } catch {
    return false;
  }
}

/**
 * Check if webhook URLs are configured (non-throwing version)
 *
 * @returns true if all webhook URLs are available
 */
export function hasWebhookUrls(): boolean {
  try {
    const creds = getN8nCredentials();
    return !!(
      creds.webhookUrls.get &&
      creds.webhookUrls.post &&
      creds.webhookUrls.put &&
      creds.webhookUrls.delete
    );
  } catch {
    return false;
  }
}
