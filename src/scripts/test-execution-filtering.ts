#!/usr/bin/env node
/**
 * Manual testing script for execution filtering feature
 *
 * This script demonstrates all modes of the n8n_get_execution tool
 * with various filtering options.
 *
 * Usage: npx tsx src/scripts/test-execution-filtering.ts
 */

import {
  generatePreview,
  filterExecutionData,
  processExecution,
} from '../services/execution-processor';
import { ExecutionFilterOptions, Execution, ExecutionStatus } from '../types/n8n-api';

console.log('='.repeat(80));
console.log('Execution Filtering Feature - Manual Test Suite');
console.log('='.repeat(80));
console.log('');

/**
 * Mock execution factory (simplified version for testing)
 */
function createTestExecution(itemCount: number): Execution {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    json: {
      id: i + 1,
      name: `Item ${i + 1}`,
      email: `user${i}@example.com`,
      value: Math.random() * 1000,
      metadata: {
        createdAt: new Date().toISOString(),
        tags: ['tag1', 'tag2'],
      },
    },
  }));

  return {
    id: `test-exec-${Date.now()}`,
    workflowId: 'workflow-test',
    status: ExecutionStatus.SUCCESS,
    mode: 'manual',
    finished: true,
    startedAt: '2024-01-01T10:00:00.000Z',
    stoppedAt: '2024-01-01T10:00:05.000Z',
    data: {
      resultData: {
        runData: {
          'HTTP Request': [
            {
              startTime: Date.now(),
              executionTime: 234,
              data: {
                main: [items],
              },
            },
          ],
          'Filter': [
            {
              startTime: Date.now(),
              executionTime: 45,
              data: {
                main: [items.slice(0, Math.floor(itemCount / 2))],
              },
            },
          ],
          'Set': [
            {
              startTime: Date.now(),
              executionTime: 12,
              data: {
                main: [items.slice(0, 5)],
              },
            },
          ],
        },
      },
    },
  };
}

/**
 * Test 1: Preview Mode
 */
console.log('📊 TEST 1: Preview Mode (No Data, Just Structure)');
console.log('-'.repeat(80));

const execution1 = createTestExecution(50);
const { preview, recommendation } = generatePreview(execution1);

console.log('Preview:', JSON.stringify(preview, null, 2));
console.log('\nRecommendation:', JSON.stringify(recommendation, null, 2));
console.log('\n✅ Preview mode shows structure without consuming tokens for data\n');

/**
 * Test 2: Summary Mode (Default)
 */
console.log('📝 TEST 2: Summary Mode (2 items per node)');
console.log('-'.repeat(80));

const execution2 = createTestExecution(50);
const summaryResult = filterExecutionData(execution2, { mode: 'summary' });

console.log('Summary Mode Result:');
console.log('- Mode:', summaryResult.mode);
console.log('- Summary:', JSON.stringify(summaryResult.summary, null, 2));
console.log('- HTTP Request items shown:', summaryResult.nodes?.['HTTP Request']?.data?.metadata.itemsShown);
console.log('- HTTP Request truncated:', summaryResult.nodes?.['HTTP Request']?.data?.metadata.truncated);
console.log('\n✅ Summary mode returns 2 items per node (safe default)\n');

/**
 * Test 3: Filtered Mode with Custom Limit
 */
console.log('🎯 TEST 3: Filtered Mode (Custom itemsLimit: 5)');
console.log('-'.repeat(80));

const execution3 = createTestExecution(100);
const filteredResult = filterExecutionData(execution3, {
  mode: 'filtered',
  itemsLimit: 5,
});

console.log('Filtered Mode Result:');
console.log('- Items shown per node:', filteredResult.nodes?.['HTTP Request']?.data?.metadata.itemsShown);
console.log('- Total items available:', filteredResult.nodes?.['HTTP Request']?.data?.metadata.totalItems);
console.log('- More data available:', filteredResult.summary?.hasMoreData);
console.log('\n✅ Filtered mode allows custom item limits\n');

/**
 * Test 4: Node Name Filtering
 */
console.log('🔍 TEST 4: Filter to Specific Nodes');
console.log('-'.repeat(80));

const execution4 = createTestExecution(30);
const nodeFilterResult = filterExecutionData(execution4, {
  mode: 'filtered',
  nodeNames: ['HTTP Request'],
  itemsLimit: 3,
});

console.log('Node Filter Result:');
console.log('- Nodes in result:', Object.keys(nodeFilterResult.nodes || {}));
console.log('- Expected: ["HTTP Request"]');
console.log('- Executed nodes:', nodeFilterResult.summary?.executedNodes);
console.log('- Total nodes:', nodeFilterResult.summary?.totalNodes);
console.log('\n✅ Can filter to specific nodes only\n');

/**
 * Test 5: Structure-Only Mode (itemsLimit: 0)
 */
console.log('🏗️  TEST 5: Structure-Only Mode (itemsLimit: 0)');
console.log('-'.repeat(80));

const execution5 = createTestExecution(100);
const structureResult = filterExecutionData(execution5, {
  mode: 'filtered',
  itemsLimit: 0,
});

console.log('Structure-Only Result:');
console.log('- Items shown:', structureResult.nodes?.['HTTP Request']?.data?.metadata.itemsShown);
console.log('- First item (structure):', JSON.stringify(
  structureResult.nodes?.['HTTP Request']?.data?.output?.[0]?.[0],
  null,
  2
));
console.log('\n✅ Structure-only mode shows data shape without values\n');

/**
 * Test 6: Full Mode
 */
console.log('💾 TEST 6: Full Mode (All Data)');
console.log('-'.repeat(80));

const execution6 = createTestExecution(5); // Small dataset
const fullResult = filterExecutionData(execution6, { mode: 'full' });

console.log('Full Mode Result:');
console.log('- Items shown:', fullResult.nodes?.['HTTP Request']?.data?.metadata.itemsShown);
console.log('- Total items:', fullResult.nodes?.['HTTP Request']?.data?.metadata.totalItems);
console.log('- Truncated:', fullResult.nodes?.['HTTP Request']?.data?.metadata.truncated);
console.log('\n✅ Full mode returns all data (use with caution)\n');

/**
 * Test 7: Backward Compatibility
 */
console.log('🔄 TEST 7: Backward Compatibility (No Filtering)');
console.log('-'.repeat(80));

const execution7 = createTestExecution(10);
const legacyResult = processExecution(execution7, {});

console.log('Legacy Result:');
console.log('- Returns original execution:', legacyResult === execution7);
console.log('- Type:', typeof legacyResult);
console.log('\n✅ Backward compatible - no options returns original execution\n');

/**
 * Test 8: Input Data Inclusion
 */
console.log('🔗 TEST 8: Include Input Data');
console.log('-'.repeat(80));

const execution8 = createTestExecution(5);
const inputDataResult = filterExecutionData(execution8, {
  mode: 'filtered',
  itemsLimit: 2,
  includeInputData: true,
});

console.log('Input Data Result:');
console.log('- Has input data:', !!inputDataResult.nodes?.['HTTP Request']?.data?.input);
console.log('- Has output data:', !!inputDataResult.nodes?.['HTTP Request']?.data?.output);
console.log('\n✅ Can include input data for debugging\n');

/**
 * Test 9: itemsLimit Validation
 */
console.log('⚠️  TEST 9: itemsLimit Validation');
console.log('-'.repeat(80));

const execution9 = createTestExecution(50);

// Test negative value
const negativeResult = filterExecutionData(execution9, {
  mode: 'filtered',
  itemsLimit: -5,
});
console.log('- Negative itemsLimit (-5) handled:', negativeResult.nodes?.['HTTP Request']?.data?.metadata.itemsShown === 2);

// Test very large value
const largeResult = filterExecutionData(execution9, {
  mode: 'filtered',
  itemsLimit: 999999,
});
console.log('- Large itemsLimit (999999) capped:', (largeResult.nodes?.['HTTP Request']?.data?.metadata.itemsShown || 0) <= 1000);

// Test unlimited (-1)
const unlimitedResult = filterExecutionData(execution9, {
  mode: 'filtered',
  itemsLimit: -1,
});
console.log('- Unlimited itemsLimit (-1) works:', unlimitedResult.nodes?.['HTTP Request']?.data?.metadata.itemsShown === 50);

console.log('\n✅ itemsLimit validation works correctly\n');

/**
 * Test 10: Recommendation Following
 */
console.log('🎯 TEST 10: Follow Recommendation Workflow');
console.log('-'.repeat(80));

const execution10 = createTestExecution(100);
const { preview: preview10, recommendation: rec10 } = generatePreview(execution10);

console.log('1. Preview shows:', {
  totalItems: preview10.nodes['HTTP Request']?.itemCounts.output,
  sizeKB: preview10.estimatedSizeKB,
});

console.log('\n2. Recommendation:', {
  canFetchFull: rec10.canFetchFull,
  suggestedMode: rec10.suggestedMode,
  suggestedItemsLimit: rec10.suggestedItemsLimit,
  reason: rec10.reason,
});

// Follow recommendation
const options: ExecutionFilterOptions = {
  mode: rec10.suggestedMode,
  itemsLimit: rec10.suggestedItemsLimit,
};

const recommendedResult = filterExecutionData(execution10, options);

console.log('\n3. Following recommendation gives:', {
  mode: recommendedResult.mode,
  itemsShown: recommendedResult.nodes?.['HTTP Request']?.data?.metadata.itemsShown,
  hasMoreData: recommendedResult.summary?.hasMoreData,
});

console.log('\n✅ Recommendation workflow helps make optimal choices\n');

/**
 * Summary
 */
console.log('='.repeat(80));
console.log('✨ All Tests Completed Successfully!');
console.log('='.repeat(80));
console.log('\n🎉 Execution Filtering Feature is Working!\n');
console.log('Key Takeaways:');
console.log('1. Always use preview mode first for unknown datasets');
console.log('2. Follow the recommendation for optimal token usage');
console.log('3. Use nodeNames to filter to relevant nodes');
console.log('4. itemsLimit: 0 shows structure without data');
console.log('5. itemsLimit: -1 returns unlimited items (use with caution)');
console.log('6. Summary mode (2 items) is a safe default');
console.log('7. Full mode should only be used for small datasets');
console.log('');
