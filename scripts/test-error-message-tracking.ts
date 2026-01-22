/**
 * Test script to verify error message tracking is working
 */

import { telemetry } from '../src/telemetry';

async function testErrorTracking() {
  console.log('=== Testing Error Message Tracking ===\n');

  // Track session first
  console.log('1. Starting session...');
  telemetry.trackSessionStart();

  // Track an error WITH a message
  console.log('\n2. Tracking error WITH message:');
  const testErrorMessage = 'This is a test error message with sensitive data: password=secret123 and test@example.com';
  telemetry.trackError(
    'TypeError',
    'tool_execution',
    'test_tool',
    testErrorMessage
  );
  console.log(`   Original message: "${testErrorMessage}"`);

  // Track an error WITHOUT a message
  console.log('\n3. Tracking error WITHOUT message:');
  telemetry.trackError(
    'Error',
    'tool_execution',
    'test_tool2'
  );

  // Check the event queue
  const metrics = telemetry.getMetrics();
  console.log('\n4. Telemetry metrics:');
  console.log('   Status:', metrics.status);
  console.log('   Events queued:', metrics.tracking.eventsQueued);

  // Get raw event queue to inspect
  const eventTracker = (telemetry as any).eventTracker;
  const queue = eventTracker.getEventQueue();

  console.log('\n5. Event queue contents:');
  queue.forEach((event, i) => {
    console.log(`\n   Event ${i + 1}:`);
    console.log(`   - Type: ${event.event}`);
    console.log(`   - Properties:`, JSON.stringify(event.properties, null, 6));
  });

  // Flush to database
  console.log('\n6. Flushing to database...');
  await telemetry.flush();

  console.log('\n7. Done! Check Supabase for error events with "error" field.');
  console.log('   Query: SELECT * FROM telemetry_events WHERE event = \'error_occurred\' ORDER BY created_at DESC LIMIT 5;');
}

testErrorTracking().catch(console.error);
