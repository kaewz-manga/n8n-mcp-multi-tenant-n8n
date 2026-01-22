#!/usr/bin/env npx tsx
/**
 * Debug script for telemetry integration
 * Tests direct Supabase connection
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function debugTelemetry() {
  console.log('🔍 Debugging Telemetry Integration\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    process.exit(1);
  }

  console.log('Environment:');
  console.log('  URL:', supabaseUrl);
  console.log('  Key:', supabaseAnonKey.substring(0, 30) + '...');

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  // Test 1: Direct insert to telemetry_events
  console.log('\n📝 Test 1: Direct insert to telemetry_events...');
  const testEvent = {
    user_id: 'test-user-123',
    event: 'test_event',
    properties: {
      test: true,
      timestamp: new Date().toISOString()
    }
  };

  const { data: eventData, error: eventError } = await supabase
    .from('telemetry_events')
    .insert([testEvent])
    .select();

  if (eventError) {
    console.error('❌ Event insert failed:', eventError);
  } else {
    console.log('✅ Event inserted successfully:', eventData);
  }

  // Test 2: Direct insert to telemetry_workflows
  console.log('\n📝 Test 2: Direct insert to telemetry_workflows...');
  const testWorkflow = {
    user_id: 'test-user-123',
    workflow_hash: 'test-hash-' + Date.now(),
    node_count: 3,
    node_types: ['webhook', 'http', 'slack'],
    has_trigger: true,
    has_webhook: true,
    complexity: 'simple',
    sanitized_workflow: {
      nodes: [],
      connections: {}
    }
  };

  const { data: workflowData, error: workflowError } = await supabase
    .from('telemetry_workflows')
    .insert([testWorkflow])
    .select();

  if (workflowError) {
    console.error('❌ Workflow insert failed:', workflowError);
  } else {
    console.log('✅ Workflow inserted successfully:', workflowData);
  }

  // Test 3: Try to read data (should fail with anon key due to RLS)
  console.log('\n📖 Test 3: Attempting to read data (should fail due to RLS)...');
  const { data: readData, error: readError } = await supabase
    .from('telemetry_events')
    .select('*')
    .limit(1);

  if (readError) {
    console.log('✅ Read correctly blocked by RLS:', readError.message);
  } else {
    console.log('⚠️  Unexpected: Read succeeded (RLS may not be working):', readData);
  }

  // Test 4: Check table existence
  console.log('\n🔍 Test 4: Verifying tables exist...');
  const { data: tables, error: tablesError } = await supabase
    .rpc('get_tables', { schema_name: 'public' })
    .select('*');

  if (tablesError) {
    // This is expected - the RPC function might not exist
    console.log('ℹ️  Cannot list tables (RPC function not available)');
  } else {
    console.log('Tables found:', tables);
  }

  console.log('\n✨ Debug completed! Check your Supabase dashboard for the test data.');
  console.log('Dashboard: https://supabase.com/dashboard/project/ydyufsohxdfpopqbubwk/editor');
}

debugTelemetry().catch(error => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
});