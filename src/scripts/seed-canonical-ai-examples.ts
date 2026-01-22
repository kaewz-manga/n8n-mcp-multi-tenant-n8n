#!/usr/bin/env node
/**
 * Seed canonical AI tool examples into the database
 *
 * These hand-crafted examples demonstrate best practices for critical AI tools
 * that are missing from the template database.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createDatabaseAdapter } from '../database/database-adapter';
import { logger } from '../utils/logger';

interface CanonicalExample {
  name: string;
  use_case: string;
  complexity: 'simple' | 'medium' | 'complex';
  parameters: Record<string, any>;
  credentials?: Record<string, any>;
  connections?: Record<string, any>;
  notes: string;
}

interface CanonicalToolExamples {
  node_type: string;
  display_name: string;
  examples: CanonicalExample[];
}

interface CanonicalExamplesFile {
  description: string;
  version: string;
  examples: CanonicalToolExamples[];
}

async function seedCanonicalExamples() {
  try {
    // Load canonical examples file
    const examplesPath = path.join(__dirname, '../data/canonical-ai-tool-examples.json');
    const examplesData = fs.readFileSync(examplesPath, 'utf-8');
    const canonicalExamples: CanonicalExamplesFile = JSON.parse(examplesData);

    logger.info('Loading canonical AI tool examples', {
      version: canonicalExamples.version,
      tools: canonicalExamples.examples.length
    });

    // Initialize database
    const db = await createDatabaseAdapter('./data/nodes.db');

    // First, ensure we have placeholder templates for canonical examples
    const templateStmt = db.prepare(`
      INSERT OR IGNORE INTO templates (
        id,
        workflow_id,
        name,
        description,
        views,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    // Create one placeholder template for canonical examples
    const canonicalTemplateId = -1000;
    templateStmt.run(
      canonicalTemplateId,
      canonicalTemplateId, // workflow_id must be unique
      'Canonical AI Tool Examples',
      'Hand-crafted examples demonstrating best practices for AI tools',
      99999 // High view count
    );

    // Prepare insert statement for node configs
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO template_node_configs (
        node_type,
        template_id,
        template_name,
        template_views,
        node_name,
        parameters_json,
        credentials_json,
        has_credentials,
        has_expressions,
        complexity,
        use_cases
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let totalInserted = 0;

    // Seed each tool's examples
    for (const toolExamples of canonicalExamples.examples) {
      const { node_type, display_name, examples } = toolExamples;

      logger.info(`Seeding examples for ${display_name}`, {
        nodeType: node_type,
        exampleCount: examples.length
      });

      for (let i = 0; i < examples.length; i++) {
        const example = examples[i];

        // All canonical examples use the same template ID
        const templateId = canonicalTemplateId;
        const templateName = `Canonical: ${display_name} - ${example.name}`;

        // Check for expressions in parameters
        const paramsStr = JSON.stringify(example.parameters);
        const hasExpressions = paramsStr.includes('={{') || paramsStr.includes('$json') || paramsStr.includes('$node') ? 1 : 0;

        // Insert into database
        stmt.run(
          node_type,
          templateId,
          templateName,
          99999, // High view count for canonical examples
          example.name,
          JSON.stringify(example.parameters),
          example.credentials ? JSON.stringify(example.credentials) : null,
          example.credentials ? 1 : 0,
          hasExpressions,
          example.complexity,
          example.use_case
        );

        totalInserted++;
        logger.info(`  ✓ Seeded: ${example.name}`, {
          complexity: example.complexity,
          hasCredentials: !!example.credentials,
          hasExpressions: hasExpressions === 1
        });
      }
    }

    db.close();

    logger.info('Canonical examples seeding complete', {
      totalExamples: totalInserted,
      tools: canonicalExamples.examples.length
    });

    console.log('\n✅ Successfully seeded', totalInserted, 'canonical AI tool examples');
    console.log('\nExamples are now available via:');
    console.log('  • search_nodes({query: "HTTP Request Tool", includeExamples: true})');
    console.log('  • get_node_essentials({nodeType: "nodes-langchain.toolCode", includeExamples: true})');

  } catch (error) {
    logger.error('Failed to seed canonical examples', { error });
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedCanonicalExamples().catch(console.error);
}

export { seedCanonicalExamples };
