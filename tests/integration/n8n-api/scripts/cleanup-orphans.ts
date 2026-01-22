#!/usr/bin/env tsx
/**
 * Cleanup Orphaned Test Resources
 *
 * Standalone script to clean up orphaned workflows and executions
 * from failed test runs. Run this periodically in CI or manually
 * to maintain a clean test environment.
 *
 * Usage:
 *   npm run test:cleanup:orphans
 *   tsx tests/integration/n8n-api/scripts/cleanup-orphans.ts
 */

import { cleanupAllTestResources } from '../utils/cleanup-helpers';
import { getN8nCredentials, validateCredentials } from '../utils/credentials';

async function main() {
  console.log('Starting cleanup of orphaned test resources...\n');

  try {
    // Validate credentials
    const creds = getN8nCredentials();
    validateCredentials(creds);

    console.log(`n8n Instance: ${creds.url}`);
    console.log(`Cleanup Tag: ${creds.cleanup.tag}`);
    console.log(`Cleanup Prefix: ${creds.cleanup.namePrefix}\n`);

    // Run cleanup
    const result = await cleanupAllTestResources();

    console.log('\n✅ Cleanup complete!');
    console.log(`   Workflows deleted: ${result.workflows}`);
    console.log(`   Executions deleted: ${result.executions}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  }
}

main();
