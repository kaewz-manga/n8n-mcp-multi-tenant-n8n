#!/usr/bin/env tsx

/**
 * Export Webhook Workflow JSONs
 *
 * Generates the 4 webhook workflow JSON files needed for integration testing.
 * These workflows must be imported into n8n and activated manually.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { exportAllWebhookWorkflows } from '../tests/integration/n8n-api/utils/webhook-workflows';

const OUTPUT_DIR = join(process.cwd(), 'workflows-for-import');

// Create output directory
mkdirSync(OUTPUT_DIR, { recursive: true });

// Generate all workflow JSONs
const workflows = exportAllWebhookWorkflows();

// Write each workflow to a separate file
Object.entries(workflows).forEach(([method, workflow]) => {
  const filename = `webhook-${method.toLowerCase()}.json`;
  const filepath = join(OUTPUT_DIR, filename);

  writeFileSync(filepath, JSON.stringify(workflow, null, 2), 'utf-8');

  console.log(`✓ Generated: ${filename}`);
});

console.log(`\n✓ All workflow JSONs written to: ${OUTPUT_DIR}`);
console.log('\nNext steps:');
console.log('1. Import each JSON file into your n8n instance');
console.log('2. Activate each workflow in the n8n UI');
console.log('3. Copy the webhook URLs from each workflow (open workflow → Webhook node → copy URL)');
console.log('4. Add them to your .env file:');
console.log('   N8N_TEST_WEBHOOK_GET_URL=https://your-n8n.com/webhook/mcp-test-get');
console.log('   N8N_TEST_WEBHOOK_POST_URL=https://your-n8n.com/webhook/mcp-test-post');
console.log('   N8N_TEST_WEBHOOK_PUT_URL=https://your-n8n.com/webhook/mcp-test-put');
console.log('   N8N_TEST_WEBHOOK_DELETE_URL=https://your-n8n.com/webhook/mcp-test-delete');
