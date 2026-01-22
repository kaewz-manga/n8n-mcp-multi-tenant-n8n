#!/usr/bin/env npx tsx
/**
 * Test telemetry without requesting data back
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function testNoSelect() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

  console.log('🧪 Telemetry Test (No Select)\n');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  // Insert WITHOUT .select() - just fire and forget
  const testData = {
    user_id: 'test-' + Date.now(),
    event: 'test_event',
    properties: { test: true }
  };

  console.log('Inserting:', testData);

  const { error } = await supabase
    .from('telemetry_events')
    .insert([testData]);  // No .select() here!

  if (error) {
    console.error('❌ Failed:', error);
  } else {
    console.log('✅ Success! Data inserted (no response data)');
  }

  // Test workflow insert too
  const testWorkflow = {
    user_id: 'test-' + Date.now(),
    workflow_hash: 'hash-' + Date.now(),
    node_count: 3,
    node_types: ['webhook', 'http', 'slack'],
    has_trigger: true,
    has_webhook: true,
    complexity: 'simple',
    sanitized_workflow: { nodes: [], connections: {} }
  };

  console.log('\nInserting workflow:', testWorkflow);

  const { error: workflowError } = await supabase
    .from('telemetry_workflows')
    .insert([testWorkflow]);  // No .select() here!

  if (workflowError) {
    console.error('❌ Workflow failed:', workflowError);
  } else {
    console.log('✅ Workflow inserted successfully!');
  }
}

testNoSelect().catch(console.error);