#!/usr/bin/env npx tsx
/**
 * Test telemetry environment variable override
 */

import { TelemetryConfigManager } from '../src/telemetry/config-manager';
import { telemetry } from '../src/telemetry/telemetry-manager';

async function testEnvOverride() {
  console.log('🧪 Testing Telemetry Environment Variable Override\n');

  const configManager = TelemetryConfigManager.getInstance();

  // Test 1: Check current status without env var
  console.log('Test 1: Without environment variable');
  console.log('Is Enabled:', configManager.isEnabled());
  console.log('Status:', configManager.getStatus());

  // Test 2: Set environment variable and check again
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Test 2: With N8N_MCP_TELEMETRY_DISABLED=true');
  process.env.N8N_MCP_TELEMETRY_DISABLED = 'true';

  // Force reload by creating new instance (for testing)
  const newConfigManager = TelemetryConfigManager.getInstance();
  console.log('Is Enabled:', newConfigManager.isEnabled());
  console.log('Status:', newConfigManager.getStatus());

  // Test 3: Try tracking with env disabled
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Test 3: Attempting to track with telemetry disabled');
  telemetry.trackToolUsage('test_tool', true, 100);
  console.log('Tool usage tracking attempted (should be ignored)');

  // Test 4: Alternative env vars
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Test 4: Alternative environment variables');

  delete process.env.N8N_MCP_TELEMETRY_DISABLED;
  process.env.TELEMETRY_DISABLED = 'true';
  console.log('With TELEMETRY_DISABLED=true:', newConfigManager.isEnabled());

  delete process.env.TELEMETRY_DISABLED;
  process.env.DISABLE_TELEMETRY = 'true';
  console.log('With DISABLE_TELEMETRY=true:', newConfigManager.isEnabled());

  // Test 5: Env var takes precedence over config
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Test 5: Environment variable precedence');

  // Enable via config
  newConfigManager.enable();
  console.log('After enabling via config:', newConfigManager.isEnabled());

  // But env var should still override
  process.env.N8N_MCP_TELEMETRY_DISABLED = 'true';
  console.log('With env var set (should override config):', newConfigManager.isEnabled());

  console.log('\n✅ All tests completed!');
}

testEnvOverride().catch(console.error);