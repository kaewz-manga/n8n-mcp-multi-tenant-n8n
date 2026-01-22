/**
 * Migration script to add README and AI documentation columns to existing databases.
 *
 * Run with: npx tsx src/scripts/migrate-readme-columns.ts
 *
 * Adds:
 * - npm_readme TEXT - Raw README markdown from npm registry
 * - ai_documentation_summary TEXT - AI-generated structured summary (JSON)
 * - ai_summary_generated_at DATETIME - When the AI summary was generated
 */

import path from 'path';
import { createDatabaseAdapter } from '../database/database-adapter';
import { logger } from '../utils/logger';

async function migrate(): Promise<void> {
  console.log('============================================================');
  console.log('  n8n-mcp Database Migration: README & AI Documentation');
  console.log('============================================================\n');

  const dbPath = process.env.N8N_MCP_DB_PATH || path.join(process.cwd(), 'data', 'nodes.db');
  console.log(`Database: ${dbPath}\n`);

  // Initialize database
  const db = await createDatabaseAdapter(dbPath);

  try {
    // Check if columns already exist
    const tableInfo = db.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    const columnsToAdd = [
      { name: 'npm_readme', type: 'TEXT', description: 'Raw README markdown from npm registry' },
      { name: 'ai_documentation_summary', type: 'TEXT', description: 'AI-generated structured summary (JSON)' },
      { name: 'ai_summary_generated_at', type: 'DATETIME', description: 'When the AI summary was generated' },
    ];

    let addedCount = 0;
    let skippedCount = 0;

    for (const column of columnsToAdd) {
      if (existingColumns.has(column.name)) {
        console.log(`  [SKIP] Column '${column.name}' already exists`);
        skippedCount++;
      } else {
        console.log(`  [ADD]  Column '${column.name}' (${column.type})`);
        db.exec(`ALTER TABLE nodes ADD COLUMN ${column.name} ${column.type}`);
        addedCount++;
      }
    }

    console.log('\n============================================================');
    console.log('  Migration Complete');
    console.log('============================================================');
    console.log(`  Added: ${addedCount} columns`);
    console.log(`  Skipped: ${skippedCount} columns (already exist)`);
    console.log('============================================================\n');

    // Verify the migration
    const verifyInfo = db.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
    const verifyColumns = new Set(verifyInfo.map((col) => col.name));

    const allPresent = columnsToAdd.every((col) => verifyColumns.has(col.name));
    if (allPresent) {
      console.log('Verification: All columns present in database.\n');
    } else {
      console.error('Verification FAILED: Some columns are missing!\n');
      process.exit(1);
    }

  } finally {
    db.close();
  }
}

// Run migration
migrate().catch((error) => {
  logger.error('Migration failed:', error);
  process.exit(1);
});
