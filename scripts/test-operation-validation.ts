/**
 * Test script for operation and resource validation with Google Drive example
 */

import { DatabaseAdapter } from '../src/database/database-adapter';
import { NodeRepository } from '../src/database/node-repository';
import { EnhancedConfigValidator } from '../src/services/enhanced-config-validator';
import { WorkflowValidator } from '../src/services/workflow-validator';
import { createDatabaseAdapter } from '../src/database/database-adapter';
import { logger } from '../src/utils/logger';
import chalk from 'chalk';

async function testOperationValidation() {
  console.log(chalk.blue('Testing Operation and Resource Validation'));
  console.log('='.repeat(60));

  // Initialize database
  const dbPath = process.env.NODE_DB_PATH || 'data/nodes.db';
  const db = await createDatabaseAdapter(dbPath);
  const repository = new NodeRepository(db);

  // Initialize similarity services
  EnhancedConfigValidator.initializeSimilarityServices(repository);

  // Test 1: Invalid operation "listFiles"
  console.log(chalk.yellow('\n📝 Test 1: Google Drive with invalid operation "listFiles"'));
  const invalidConfig = {
    resource: 'fileFolder',
    operation: 'listFiles'
  };

  const node = repository.getNode('nodes-base.googleDrive');
  if (!node) {
    console.error(chalk.red('Google Drive node not found in database'));
    process.exit(1);
  }

  const result1 = EnhancedConfigValidator.validateWithMode(
    'nodes-base.googleDrive',
    invalidConfig,
    node.properties,
    'operation',
    'ai-friendly'
  );

  console.log(`Valid: ${result1.valid ? chalk.green('✓') : chalk.red('✗')}`);
  if (result1.errors.length > 0) {
    console.log(chalk.red('Errors:'));
    result1.errors.forEach(error => {
      console.log(`  - ${error.property}: ${error.message}`);
      if (error.fix) {
        console.log(chalk.cyan(`    Fix: ${error.fix}`));
      }
    });
  }

  // Test 2: Invalid resource "files" (should be singular)
  console.log(chalk.yellow('\n📝 Test 2: Google Drive with invalid resource "files"'));
  const pluralResourceConfig = {
    resource: 'files',
    operation: 'download'
  };

  const result2 = EnhancedConfigValidator.validateWithMode(
    'nodes-base.googleDrive',
    pluralResourceConfig,
    node.properties,
    'operation',
    'ai-friendly'
  );

  console.log(`Valid: ${result2.valid ? chalk.green('✓') : chalk.red('✗')}`);
  if (result2.errors.length > 0) {
    console.log(chalk.red('Errors:'));
    result2.errors.forEach(error => {
      console.log(`  - ${error.property}: ${error.message}`);
      if (error.fix) {
        console.log(chalk.cyan(`    Fix: ${error.fix}`));
      }
    });
  }

  // Test 3: Valid configuration
  console.log(chalk.yellow('\n📝 Test 3: Google Drive with valid configuration'));
  const validConfig = {
    resource: 'file',
    operation: 'download'
  };

  const result3 = EnhancedConfigValidator.validateWithMode(
    'nodes-base.googleDrive',
    validConfig,
    node.properties,
    'operation',
    'ai-friendly'
  );

  console.log(`Valid: ${result3.valid ? chalk.green('✓') : chalk.red('✗')}`);
  if (result3.errors.length > 0) {
    console.log(chalk.red('Errors:'));
    result3.errors.forEach(error => {
      console.log(`  - ${error.property}: ${error.message}`);
    });
  } else {
    console.log(chalk.green('No errors - configuration is valid!'));
  }

  // Test 4: Test in workflow context
  console.log(chalk.yellow('\n📝 Test 4: Full workflow with invalid Google Drive node'));
  const workflow = {
    name: 'Test Workflow',
    nodes: [
      {
        id: '1',
        name: 'Google Drive',
        type: 'n8n-nodes-base.googleDrive',
        position: [100, 100] as [number, number],
        parameters: {
          resource: 'fileFolder',
          operation: 'listFiles' // Invalid operation
        }
      }
    ],
    connections: {}
  };

  const validator = new WorkflowValidator(repository, EnhancedConfigValidator);
  const workflowResult = await validator.validateWorkflow(workflow, {
    validateNodes: true,
    profile: 'ai-friendly'
  });

  console.log(`Workflow Valid: ${workflowResult.valid ? chalk.green('✓') : chalk.red('✗')}`);
  if (workflowResult.errors.length > 0) {
    console.log(chalk.red('Errors:'));
    workflowResult.errors.forEach(error => {
      console.log(`  - ${error.nodeName || 'Workflow'}: ${error.message}`);
      if (error.details?.fix) {
        console.log(chalk.cyan(`    Fix: ${error.details.fix}`));
      }
    });
  }

  // Test 5: Typo in operation
  console.log(chalk.yellow('\n📝 Test 5: Typo in operation "downlod"'));
  const typoConfig = {
    resource: 'file',
    operation: 'downlod' // Typo
  };

  const result5 = EnhancedConfigValidator.validateWithMode(
    'nodes-base.googleDrive',
    typoConfig,
    node.properties,
    'operation',
    'ai-friendly'
  );

  console.log(`Valid: ${result5.valid ? chalk.green('✓') : chalk.red('✗')}`);
  if (result5.errors.length > 0) {
    console.log(chalk.red('Errors:'));
    result5.errors.forEach(error => {
      console.log(`  - ${error.property}: ${error.message}`);
      if (error.fix) {
        console.log(chalk.cyan(`    Fix: ${error.fix}`));
      }
    });
  }

  console.log(chalk.green('\n✅ All tests completed!'));
  db.close();
}

// Run tests
testOperationValidation().catch(error => {
  console.error(chalk.red('Error running tests:'), error);
  process.exit(1);
});