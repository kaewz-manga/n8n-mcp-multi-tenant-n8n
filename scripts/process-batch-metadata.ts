#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { createDatabaseAdapter } from '../src/database/database-adapter';

interface BatchResponse {
  id: string;
  custom_id: string;
  response: {
    status_code: number;
    body: {
      choices: Array<{
        message: {
          content: string;
        };
      }>;
    };
  };
  error: any;
}

async function processBatchMetadata(batchFile: string) {
  console.log(`📥 Processing batch file: ${batchFile}`);

  // Read the JSONL file
  const content = fs.readFileSync(batchFile, 'utf-8');
  const lines = content.trim().split('\n');

  console.log(`📊 Found ${lines.length} batch responses`);

  // Initialize database
  const db = await createDatabaseAdapter('./data/nodes.db');

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const line of lines) {
    try {
      const response: BatchResponse = JSON.parse(line);

      // Extract template ID from custom_id (format: "template-9100")
      const templateId = parseInt(response.custom_id.replace('template-', ''));

      // Check for errors
      if (response.error || response.response.status_code !== 200) {
        console.warn(`⚠️  Template ${templateId}: API error`, response.error);
        errors++;
        continue;
      }

      // Extract metadata from response
      const metadataJson = response.response.body.choices[0].message.content;

      // Validate it's valid JSON
      JSON.parse(metadataJson); // Will throw if invalid

      // Update database
      const stmt = db.prepare(`
        UPDATE templates
        SET metadata_json = ?
        WHERE id = ?
      `);

      stmt.run(metadataJson, templateId);
      updated++;

      console.log(`✅ Template ${templateId}: Updated metadata`);

    } catch (error: any) {
      console.error(`❌ Error processing line:`, error.message);
      errors++;
    }
  }

  // Close database
  if ('close' in db && typeof db.close === 'function') {
    db.close();
  }

  console.log(`\n📈 Summary:`);
  console.log(`   - Updated: ${updated}`);
  console.log(`   - Skipped: ${skipped}`);
  console.log(`   - Errors: ${errors}`);
  console.log(`   - Total: ${lines.length}`);
}

// Main
const batchFile = process.argv[2] || '/Users/romualdczlonkowski/Pliki/n8n-mcp/n8n-mcp/docs/batch_68fff7242850819091cfed64f10fb6b4_output.jsonl';

processBatchMetadata(batchFile)
  .then(() => {
    console.log('\n✅ Batch processing complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Batch processing failed:', error);
    process.exit(1);
  });
