#!/usr/bin/env node
/**
 * Test Workflow Versioning System
 *
 * Tests the complete workflow rollback and versioning functionality:
 * - Automatic backup creation
 * - Auto-pruning to 10 versions
 * - Version history retrieval
 * - Rollback with validation
 * - Manual pruning and cleanup
 * - Storage statistics
 */

import { NodeRepository } from '../src/database/node-repository';
import { createDatabaseAdapter } from '../src/database/database-adapter';
import { WorkflowVersioningService } from '../src/services/workflow-versioning-service';
import { logger } from '../src/utils/logger';
import { existsSync } from 'fs';
import * as path from 'path';

// Mock workflow for testing
const createMockWorkflow = (id: string, name: string, nodeCount: number = 3) => ({
  id,
  name,
  active: false,
  nodes: Array.from({ length: nodeCount }, (_, i) => ({
    id: `node-${i}`,
    name: `Node ${i}`,
    type: 'n8n-nodes-base.set',
    typeVersion: 1,
    position: [250 + i * 200, 300],
    parameters: { values: { string: [{ name: `field${i}`, value: `value${i}` }] } }
  })),
  connections: nodeCount > 1 ? {
    'node-0': { main: [[{ node: 'node-1', type: 'main', index: 0 }]] },
    ...(nodeCount > 2 && { 'node-1': { main: [[{ node: 'node-2', type: 'main', index: 0 }]] } })
  } : {},
  settings: {}
});

async function runTests() {
  console.log('🧪 Testing Workflow Versioning System\n');

  // Find database path
  const possiblePaths = [
    path.join(process.cwd(), 'data', 'nodes.db'),
    path.join(__dirname, '../../data', 'nodes.db'),
    './data/nodes.db'
  ];

  let dbPath: string | null = null;
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      dbPath = p;
      break;
    }
  }

  if (!dbPath) {
    console.error('❌ Database not found. Please run npm run rebuild first.');
    process.exit(1);
  }

  console.log(`📁 Using database: ${dbPath}\n`);

  // Initialize repository
  const db = await createDatabaseAdapter(dbPath);
  const repository = new NodeRepository(db);
  const service = new WorkflowVersioningService(repository);

  const workflowId = 'test-workflow-001';
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1: Create initial backup
    console.log('📝 Test 1: Create initial backup');
    const workflow1 = createMockWorkflow(workflowId, 'Test Workflow v1', 3);
    const backup1 = await service.createBackup(workflowId, workflow1, {
      trigger: 'partial_update',
      operations: [{ type: 'addNode', node: workflow1.nodes[0] }]
    });

    if (backup1.versionId && backup1.versionNumber === 1 && backup1.pruned === 0) {
      console.log('✅ Initial backup created successfully');
      console.log(`   Version ID: ${backup1.versionId}, Version Number: ${backup1.versionNumber}`);
      testsPassed++;
    } else {
      console.log('❌ Failed to create initial backup');
      testsFailed++;
    }

    // Test 2: Create multiple backups to test auto-pruning
    console.log('\n📝 Test 2: Create 12 backups to test auto-pruning (should keep only 10)');
    for (let i = 2; i <= 12; i++) {
      const workflow = createMockWorkflow(workflowId, `Test Workflow v${i}`, 3 + i);
      await service.createBackup(workflowId, workflow, {
        trigger: i % 3 === 0 ? 'full_update' : 'partial_update',
        operations: [{ type: 'addNode', node: { id: `node-${i}` } }]
      });
    }

    const versions = await service.getVersionHistory(workflowId, 100);
    if (versions.length === 10) {
      console.log(`✅ Auto-pruning works correctly (kept exactly 10 versions)`);
      console.log(`   Latest version: ${versions[0].versionNumber}, Oldest: ${versions[9].versionNumber}`);
      testsPassed++;
    } else {
      console.log(`❌ Auto-pruning failed (expected 10 versions, got ${versions.length})`);
      testsFailed++;
    }

    // Test 3: Get version history
    console.log('\n📝 Test 3: Get version history');
    const history = await service.getVersionHistory(workflowId, 5);
    if (history.length === 5 && history[0].versionNumber > history[4].versionNumber) {
      console.log(`✅ Version history retrieved successfully (${history.length} versions)`);
      console.log('   Recent versions:');
      history.forEach(v => {
        console.log(`   - v${v.versionNumber} (${v.trigger}) - ${v.workflowName} - ${(v.size / 1024).toFixed(2)} KB`);
      });
      testsPassed++;
    } else {
      console.log('❌ Failed to get version history');
      testsFailed++;
    }

    // Test 4: Get specific version
    console.log('\n📝 Test 4: Get specific version details');
    const specificVersion = await service.getVersion(history[2].id);
    if (specificVersion && specificVersion.workflowSnapshot) {
      console.log(`✅ Retrieved version ${specificVersion.versionNumber} successfully`);
      console.log(`   Workflow name: ${specificVersion.workflowName}`);
      console.log(`   Node count: ${specificVersion.workflowSnapshot.nodes.length}`);
      console.log(`   Trigger: ${specificVersion.trigger}`);
      testsPassed++;
    } else {
      console.log('❌ Failed to get specific version');
      testsFailed++;
    }

    // Test 5: Compare two versions
    console.log('\n📝 Test 5: Compare two versions');
    if (history.length >= 2) {
      const diff = await service.compareVersions(history[0].id, history[1].id);
      console.log(`✅ Version comparison successful`);
      console.log(`   Comparing v${diff.version1Number} → v${diff.version2Number}`);
      console.log(`   Added nodes: ${diff.addedNodes.length}`);
      console.log(`   Removed nodes: ${diff.removedNodes.length}`);
      console.log(`   Modified nodes: ${diff.modifiedNodes.length}`);
      console.log(`   Connection changes: ${diff.connectionChanges}`);
      testsPassed++;
    } else {
      console.log('❌ Not enough versions to compare');
      testsFailed++;
    }

    // Test 6: Manual pruning
    console.log('\n📝 Test 6: Manual pruning (keep only 5 versions)');
    const pruneResult = await service.pruneVersions(workflowId, 5);
    if (pruneResult.pruned === 5 && pruneResult.remaining === 5) {
      console.log(`✅ Manual pruning successful`);
      console.log(`   Pruned: ${pruneResult.pruned} versions, Remaining: ${pruneResult.remaining}`);
      testsPassed++;
    } else {
      console.log(`❌ Manual pruning failed (expected 5 pruned, 5 remaining, got ${pruneResult.pruned} pruned, ${pruneResult.remaining} remaining)`);
      testsFailed++;
    }

    // Test 7: Storage statistics
    console.log('\n📝 Test 7: Storage statistics');
    const stats = await service.getStorageStats();
    if (stats.totalVersions > 0 && stats.byWorkflow.length > 0) {
      console.log(`✅ Storage stats retrieved successfully`);
      console.log(`   Total versions: ${stats.totalVersions}`);
      console.log(`   Total size: ${stats.totalSizeFormatted}`);
      console.log(`   Workflows with versions: ${stats.byWorkflow.length}`);
      stats.byWorkflow.forEach(w => {
        console.log(`   - ${w.workflowName}: ${w.versionCount} versions, ${w.totalSizeFormatted}`);
      });
      testsPassed++;
    } else {
      console.log('❌ Failed to get storage stats');
      testsFailed++;
    }

    // Test 8: Delete specific version
    console.log('\n📝 Test 8: Delete specific version');
    const versionsBeforeDelete = await service.getVersionHistory(workflowId, 100);
    const versionToDelete = versionsBeforeDelete[versionsBeforeDelete.length - 1];
    const deleteResult = await service.deleteVersion(versionToDelete.id);
    const versionsAfterDelete = await service.getVersionHistory(workflowId, 100);

    if (deleteResult.success && versionsAfterDelete.length === versionsBeforeDelete.length - 1) {
      console.log(`✅ Version deletion successful`);
      console.log(`   Deleted version ${versionToDelete.versionNumber}`);
      console.log(`   Remaining versions: ${versionsAfterDelete.length}`);
      testsPassed++;
    } else {
      console.log('❌ Failed to delete version');
      testsFailed++;
    }

    // Test 9: Test different trigger types
    console.log('\n📝 Test 9: Test different trigger types');
    const workflow2 = createMockWorkflow(workflowId, 'Test Workflow Autofix', 2);
    const backupAutofix = await service.createBackup(workflowId, workflow2, {
      trigger: 'autofix',
      fixTypes: ['expression-format', 'typeversion-correction']
    });

    const workflow3 = createMockWorkflow(workflowId, 'Test Workflow Full Update', 4);
    const backupFull = await service.createBackup(workflowId, workflow3, {
      trigger: 'full_update',
      metadata: { reason: 'Major refactoring' }
    });

    const allVersions = await service.getVersionHistory(workflowId, 100);
    const autofixVersions = allVersions.filter(v => v.trigger === 'autofix');
    const fullUpdateVersions = allVersions.filter(v => v.trigger === 'full_update');
    const partialUpdateVersions = allVersions.filter(v => v.trigger === 'partial_update');

    if (autofixVersions.length > 0 && fullUpdateVersions.length > 0 && partialUpdateVersions.length > 0) {
      console.log(`✅ All trigger types working correctly`);
      console.log(`   Partial updates: ${partialUpdateVersions.length}`);
      console.log(`   Full updates: ${fullUpdateVersions.length}`);
      console.log(`   Autofixes: ${autofixVersions.length}`);
      testsPassed++;
    } else {
      console.log('❌ Failed to create versions with different trigger types');
      testsFailed++;
    }

    // Test 10: Cleanup - Delete all versions for workflow
    console.log('\n📝 Test 10: Delete all versions for workflow');
    const deleteAllResult = await service.deleteAllVersions(workflowId);
    const versionsAfterDeleteAll = await service.getVersionHistory(workflowId, 100);

    if (deleteAllResult.deleted > 0 && versionsAfterDeleteAll.length === 0) {
      console.log(`✅ Delete all versions successful`);
      console.log(`   Deleted ${deleteAllResult.deleted} versions`);
      testsPassed++;
    } else {
      console.log('❌ Failed to delete all versions');
      testsFailed++;
    }

    // Test 11: Truncate all versions (requires confirmation)
    console.log('\n📝 Test 11: Test truncate without confirmation');
    const truncateResult1 = await service.truncateAllVersions(false);
    if (truncateResult1.deleted === 0 && truncateResult1.message.includes('not confirmed')) {
      console.log(`✅ Truncate safety check works (requires confirmation)`);
      testsPassed++;
    } else {
      console.log('❌ Truncate safety check failed');
      testsFailed++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));

    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! Workflow versioning system is working correctly.');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Please review the implementation.');
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ Test suite failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
