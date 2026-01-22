#!/usr/bin/env node
import { createDatabaseAdapter } from '../database/database-adapter';
import { logger } from '../utils/logger';
import { TemplateSanitizer } from '../utils/template-sanitizer';
import { gunzipSync, gzipSync } from 'zlib';

async function sanitizeTemplates() {
  console.log('🧹 Sanitizing workflow templates in database...\n');

  const db = await createDatabaseAdapter('./data/nodes.db');
  const sanitizer = new TemplateSanitizer();

  try {
    // Get all templates - check both old and new format
    const templates = db.prepare('SELECT id, name, workflow_json, workflow_json_compressed FROM templates').all() as any[];
    console.log(`Found ${templates.length} templates to check\n`);

    let sanitizedCount = 0;
    const problematicTemplates: any[] = [];

    for (const template of templates) {
      let originalWorkflow: any = null;
      let useCompressed = false;

      // Try compressed format first (newer format)
      if (template.workflow_json_compressed) {
        try {
          const buffer = Buffer.from(template.workflow_json_compressed, 'base64');
          const decompressed = gunzipSync(buffer).toString('utf-8');
          originalWorkflow = JSON.parse(decompressed);
          useCompressed = true;
        } catch (e) {
          console.log(`⚠️ Failed to decompress template ${template.id}, trying uncompressed`);
        }
      }

      // Fall back to uncompressed format (deprecated)
      if (!originalWorkflow && template.workflow_json) {
        try {
          originalWorkflow = JSON.parse(template.workflow_json);
        } catch (e) {
          console.log(`⚠️ Skipping template ${template.id}: Invalid JSON in both formats`);
          continue;
        }
      }

      if (!originalWorkflow) {
        continue; // Skip templates without workflow data
      }

      const { sanitized: sanitizedWorkflow, wasModified } = sanitizer.sanitizeWorkflow(originalWorkflow);

      if (wasModified) {
        // Get detected tokens for reporting
        const detectedTokens = sanitizer.detectTokens(originalWorkflow);

        // Update the template with sanitized version in the same format
        if (useCompressed) {
          const compressed = gzipSync(JSON.stringify(sanitizedWorkflow)).toString('base64');
          const stmt = db.prepare('UPDATE templates SET workflow_json_compressed = ? WHERE id = ?');
          stmt.run(compressed, template.id);
        } else {
          const stmt = db.prepare('UPDATE templates SET workflow_json = ? WHERE id = ?');
          stmt.run(JSON.stringify(sanitizedWorkflow), template.id);
        }

        sanitizedCount++;
        problematicTemplates.push({
          id: template.id,
          name: template.name,
          tokens: detectedTokens
        });

        console.log(`✅ Sanitized template ${template.id}: ${template.name}`);
        detectedTokens.forEach(token => {
          console.log(`   - Found: ${token.substring(0, 20)}...`);
        });
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total templates: ${templates.length}`);
    console.log(`   Sanitized: ${sanitizedCount}`);
    
    if (problematicTemplates.length > 0) {
      console.log(`\n⚠️  Templates that contained API tokens:`);
      problematicTemplates.forEach(t => {
        console.log(`   - ${t.id}: ${t.name}`);
      });
    }
    
    console.log('\n✨ Sanitization complete!');
  } catch (error) {
    console.error('❌ Error sanitizing templates:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  sanitizeTemplates().catch(console.error);
}