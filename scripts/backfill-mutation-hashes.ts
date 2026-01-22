/**
 * Backfill script to populate structural hashes for existing workflow mutations
 *
 * Purpose: Generates workflow_structure_hash_before and workflow_structure_hash_after
 *          for all existing mutations to enable cross-referencing with telemetry_workflows
 *
 * Usage: npx tsx scripts/backfill-mutation-hashes.ts
 *
 * Conceived by Romuald Członkowski - https://www.aiadvisors.pl/en
 */

import { WorkflowSanitizer } from '../src/telemetry/workflow-sanitizer.js';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface MutationRecord {
  id: string;
  workflow_before: any;
  workflow_after: any;
  workflow_structure_hash_before: string | null;
  workflow_structure_hash_after: string | null;
}

/**
 * Fetch all mutations that need structural hashes
 */
async function fetchMutationsToBackfill(): Promise<MutationRecord[]> {
  console.log('Fetching mutations without structural hashes...');

  const { data, error } = await supabase
    .from('workflow_mutations')
    .select('id, workflow_before, workflow_after, workflow_structure_hash_before, workflow_structure_hash_after')
    .is('workflow_structure_hash_before', null);

  if (error) {
    throw new Error(`Failed to fetch mutations: ${error.message}`);
  }

  console.log(`Found ${data?.length || 0} mutations to backfill`);
  return data || [];
}

/**
 * Generate structural hash for a workflow
 */
function generateStructuralHash(workflow: any): string {
  try {
    return WorkflowSanitizer.generateWorkflowHash(workflow);
  } catch (error) {
    console.error('Error generating hash:', error);
    return '';
  }
}

/**
 * Update a single mutation with structural hashes
 */
async function updateMutation(id: string, structureHashBefore: string, structureHashAfter: string): Promise<boolean> {
  const { error } = await supabase
    .from('workflow_mutations')
    .update({
      workflow_structure_hash_before: structureHashBefore,
      workflow_structure_hash_after: structureHashAfter,
    })
    .eq('id', id);

  if (error) {
    console.error(`Failed to update mutation ${id}:`, error.message);
    return false;
  }

  return true;
}

/**
 * Process mutations in batches
 */
async function backfillMutations() {
  const startTime = Date.now();
  console.log('Starting backfill process...\n');

  // Fetch mutations
  const mutations = await fetchMutationsToBackfill();

  if (mutations.length === 0) {
    console.log('No mutations need backfilling. All done!');
    return;
  }

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  // Process each mutation
  for (const mutation of mutations) {
    try {
      // Generate structural hashes
      const structureHashBefore = generateStructuralHash(mutation.workflow_before);
      const structureHashAfter = generateStructuralHash(mutation.workflow_after);

      if (!structureHashBefore || !structureHashAfter) {
        console.warn(`Skipping mutation ${mutation.id}: Failed to generate hashes`);
        errors.push({ id: mutation.id, error: 'Failed to generate hashes' });
        errorCount++;
        continue;
      }

      // Update database
      const success = await updateMutation(mutation.id, structureHashBefore, structureHashAfter);

      if (success) {
        successCount++;
      } else {
        errorCount++;
        errors.push({ id: mutation.id, error: 'Database update failed' });
      }

      processedCount++;

      // Progress update every 100 mutations
      if (processedCount % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (processedCount / (Date.now() - startTime) * 1000).toFixed(1);
        console.log(
          `Progress: ${processedCount}/${mutations.length} (${((processedCount / mutations.length) * 100).toFixed(1)}%) | ` +
          `Success: ${successCount} | Errors: ${errorCount} | Rate: ${rate}/s | Elapsed: ${elapsed}s`
        );
      }
    } catch (error) {
      console.error(`Unexpected error processing mutation ${mutation.id}:`, error);
      errors.push({ id: mutation.id, error: String(error) });
      errorCount++;
    }
  }

  // Final summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(80));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(80));
  console.log(`Total mutations processed: ${processedCount}`);
  console.log(`Successfully updated: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Duration: ${duration}s`);
  console.log(`Average rate: ${(processedCount / (Date.now() - startTime) * 1000).toFixed(1)} mutations/s`);

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.slice(0, 10).forEach(({ id, error }) => {
      console.log(`  - ${id}: ${error}`);
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }

  // Verify cross-reference matches
  console.log('\n' + '='.repeat(80));
  console.log('VERIFYING CROSS-REFERENCE MATCHES');
  console.log('='.repeat(80));

  const { data: statsData, error: statsError } = await supabase.rpc('get_mutation_crossref_stats');

  if (statsError) {
    console.error('Failed to get cross-reference stats:', statsError.message);
  } else if (statsData && statsData.length > 0) {
    const stats = statsData[0];
    console.log(`Total mutations: ${stats.total_mutations}`);
    console.log(`Before matches: ${stats.before_matches} (${stats.before_match_rate}%)`);
    console.log(`After matches: ${stats.after_matches} (${stats.after_match_rate}%)`);
    console.log(`Both matches: ${stats.both_matches}`);
  }

  console.log('\nBackfill process completed successfully! ✓');
}

// Run the backfill
backfillMutations().catch((error) => {
  console.error('Fatal error during backfill:', error);
  process.exit(1);
});
