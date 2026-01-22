#!/usr/bin/env npx tsx
/**
 * Direct telemetry test with hardcoded credentials
 */

import { createClient } from '@supabase/supabase-js';

const TELEMETRY_BACKEND = {
  URL: 'https://ydyufsohxdfpopqbubwk.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkeXVmc29oeGRmcG9wcWJ1YndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc2MzAxMDgsImV4cCI6MjA1MzIwNjEwOH0.LsUTx9OsNtnqg-jxXaJPc84aBHVDehHiMaFoF2Ir8s0'
};

async function testDirect() {
  console.log('🧪 Direct Telemetry Test\n');

  const supabase = createClient(TELEMETRY_BACKEND.URL, TELEMETRY_BACKEND.ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const testEvent = {
    user_id: 'direct-test-' + Date.now(),
    event: 'direct_test',
    properties: {
      source: 'test-telemetry-direct.ts',
      timestamp: new Date().toISOString()
    }
  };

  console.log('Sending event:', testEvent);

  const { data, error } = await supabase
    .from('telemetry_events')
    .insert([testEvent]);

  if (error) {
    console.error('❌ Failed:', error);
  } else {
    console.log('✅ Success! Event sent directly to Supabase');
    console.log('Response:', data);
  }
}

testDirect().catch(console.error);
