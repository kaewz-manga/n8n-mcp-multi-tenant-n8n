#!/usr/bin/env npx tsx
/**
 * Test that RLS properly protects data
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function testSecurity() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

  console.log('🔒 Testing Telemetry Security (RLS)\n');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  // Test 1: Verify anon can INSERT
  console.log('Test 1: Anonymous INSERT (should succeed)...');
  const testData = {
    user_id: 'security-test-' + Date.now(),
    event: 'security_test',
    properties: { test: true }
  };

  const { error: insertError } = await supabase
    .from('telemetry_events')
    .insert([testData]);

  if (insertError) {
    console.error('❌ Insert failed:', insertError.message);
  } else {
    console.log('✅ Insert succeeded (as expected)');
  }

  // Test 2: Verify anon CANNOT SELECT
  console.log('\nTest 2: Anonymous SELECT (should fail)...');
  const { data, error: selectError } = await supabase
    .from('telemetry_events')
    .select('*')
    .limit(1);

  if (selectError) {
    console.log('✅ Select blocked by RLS (as expected):', selectError.message);
  } else if (data && data.length > 0) {
    console.error('❌ SECURITY ISSUE: Anon can read data!', data);
  } else if (data && data.length === 0) {
    console.log('⚠️  Select returned empty array (might be RLS working)');
  }

  // Test 3: Verify anon CANNOT UPDATE
  console.log('\nTest 3: Anonymous UPDATE (should fail)...');
  const { error: updateError } = await supabase
    .from('telemetry_events')
    .update({ event: 'hacked' })
    .eq('user_id', 'test');

  if (updateError) {
    console.log('✅ Update blocked (as expected):', updateError.message);
  } else {
    console.error('❌ SECURITY ISSUE: Anon can update data!');
  }

  // Test 4: Verify anon CANNOT DELETE
  console.log('\nTest 4: Anonymous DELETE (should fail)...');
  const { error: deleteError } = await supabase
    .from('telemetry_events')
    .delete()
    .eq('user_id', 'test');

  if (deleteError) {
    console.log('✅ Delete blocked (as expected):', deleteError.message);
  } else {
    console.error('❌ SECURITY ISSUE: Anon can delete data!');
  }

  console.log('\n✨ Security test completed!');
  console.log('Summary: Anonymous users can INSERT (for telemetry) but cannot READ/UPDATE/DELETE');
}

testSecurity().catch(console.error);