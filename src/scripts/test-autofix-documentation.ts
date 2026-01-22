#!/usr/bin/env npx tsx

/**
 * Test script to verify n8n_autofix_workflow documentation is properly integrated
 */

import { toolsDocumentation } from '../mcp/tool-docs';
import { getToolDocumentation } from '../mcp/tools-documentation';
import { Logger } from '../utils/logger';

const logger = new Logger({ prefix: '[AutofixDoc Test]' });

async function testAutofixDocumentation() {
  logger.info('Testing n8n_autofix_workflow documentation...\n');

  // Test 1: Check if documentation exists in the registry
  logger.info('Test 1: Checking documentation registry');
  const hasDoc = 'n8n_autofix_workflow' in toolsDocumentation;
  if (hasDoc) {
    logger.info('✅ Documentation found in registry');
  } else {
    logger.error('❌ Documentation NOT found in registry');
    logger.info('Available tools:', Object.keys(toolsDocumentation).filter(k => k.includes('autofix')));
  }

  // Test 2: Check documentation structure
  if (hasDoc) {
    logger.info('\nTest 2: Checking documentation structure');
    const doc = toolsDocumentation['n8n_autofix_workflow'];

    const hasEssentials = doc.essentials &&
                         doc.essentials.description &&
                         doc.essentials.keyParameters &&
                         doc.essentials.example;

    const hasFull = doc.full &&
                   doc.full.description &&
                   doc.full.parameters &&
                   doc.full.examples;

    if (hasEssentials) {
      logger.info('✅ Essentials documentation complete');
      logger.info(`  Description: ${doc.essentials.description.substring(0, 80)}...`);
      logger.info(`  Key params: ${doc.essentials.keyParameters.join(', ')}`);
    } else {
      logger.error('❌ Essentials documentation incomplete');
    }

    if (hasFull) {
      logger.info('✅ Full documentation complete');
      logger.info(`  Parameters: ${Object.keys(doc.full.parameters).join(', ')}`);
      logger.info(`  Examples: ${doc.full.examples.length} provided`);
    } else {
      logger.error('❌ Full documentation incomplete');
    }
  }

  // Test 3: Test getToolDocumentation function
  logger.info('\nTest 3: Testing getToolDocumentation function');

  try {
    const essentialsDoc = getToolDocumentation('n8n_autofix_workflow', 'essentials');
    if (essentialsDoc.includes("Tool 'n8n_autofix_workflow' not found")) {
      logger.error('❌ Essentials documentation retrieval failed');
    } else {
      logger.info('✅ Essentials documentation retrieved');
      const lines = essentialsDoc.split('\n').slice(0, 3);
      lines.forEach(line => logger.info(`  ${line}`));
    }
  } catch (error) {
    logger.error('❌ Error retrieving essentials documentation:', error);
  }

  try {
    const fullDoc = getToolDocumentation('n8n_autofix_workflow', 'full');
    if (fullDoc.includes("Tool 'n8n_autofix_workflow' not found")) {
      logger.error('❌ Full documentation retrieval failed');
    } else {
      logger.info('✅ Full documentation retrieved');
      const lines = fullDoc.split('\n').slice(0, 3);
      lines.forEach(line => logger.info(`  ${line}`));
    }
  } catch (error) {
    logger.error('❌ Error retrieving full documentation:', error);
  }

  // Test 4: Check if tool is listed in workflow management tools
  logger.info('\nTest 4: Checking workflow management tools listing');
  const workflowTools = Object.keys(toolsDocumentation).filter(k => k.startsWith('n8n_'));
  const hasAutofix = workflowTools.includes('n8n_autofix_workflow');

  if (hasAutofix) {
    logger.info('✅ n8n_autofix_workflow is listed in workflow management tools');
    logger.info(`  Total workflow tools: ${workflowTools.length}`);

    // Show related tools
    const relatedTools = workflowTools.filter(t =>
      t.includes('validate') || t.includes('update') || t.includes('fix')
    );
    logger.info(`  Related tools: ${relatedTools.join(', ')}`);
  } else {
    logger.error('❌ n8n_autofix_workflow NOT listed in workflow management tools');
  }

  // Summary
  logger.info('\n' + '='.repeat(60));
  logger.info('Summary:');

  if (hasDoc && hasAutofix) {
    logger.info('✨ Documentation integration successful!');
    logger.info('The n8n_autofix_workflow tool documentation is properly integrated.');
    logger.info('\nTo use in MCP:');
    logger.info('  - Essentials: tools_documentation({topic: "n8n_autofix_workflow"})');
    logger.info('  - Full: tools_documentation({topic: "n8n_autofix_workflow", depth: "full"})');
  } else {
    logger.error('⚠️ Documentation integration incomplete');
    logger.info('Please check the implementation and rebuild the project.');
  }
}

testAutofixDocumentation().catch(console.error);