#!/usr/bin/env npx tsx
/**
 * Simple test to verify telemetry works
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function testSimple() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

  console.log('🧪 Simple Telemetry Test\n');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  // Simple insert
  const testData = {
    user_id: 'simple-test-' + Date.now(),
    event: 'test_event',
    properties: { test: true }
  };

  console.log('Inserting:', testData);

  const { data, error } = await supabase
    .from('telemetry_events')
    .insert([testData])
    .select();

  if (error) {
    console.error('❌ Failed:', error);
  } else {
    console.log('✅ Success! Inserted:', data);
  }
}

testSimple().catch(console.error);