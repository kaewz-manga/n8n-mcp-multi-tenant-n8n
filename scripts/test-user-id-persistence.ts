/**
 * Test User ID Persistence
 * Verifies that user IDs are consistent across sessions and modes
 */

import { TelemetryConfigManager } from '../src/telemetry/config-manager';
import { hostname, platform, arch, homedir } from 'os';
import { createHash } from 'crypto';

console.log('=== User ID Persistence Test ===\n');

// Test 1: Verify deterministic ID generation
console.log('Test 1: Deterministic ID Generation');
console.log('-----------------------------------');

const machineId = `${hostname()}-${platform()}-${arch()}-${homedir()}`;
const expectedUserId = createHash('sha256')
  .update(machineId)
  .digest('hex')
  .substring(0, 16);

console.log('Machine characteristics:');
console.log('  hostname:', hostname());
console.log('  platform:', platform());
console.log('  arch:', arch());
console.log('  homedir:', homedir());
console.log('\nGenerated machine ID:', machineId);
console.log('Expected user ID:', expectedUserId);

// Test 2: Load actual config
console.log('\n\nTest 2: Actual Config Manager');
console.log('-----------------------------------');

const configManager = TelemetryConfigManager.getInstance();
const actualUserId = configManager.getUserId();
const config = configManager.loadConfig();

console.log('Actual user ID:', actualUserId);
console.log('Config first run:', config.firstRun || 'Unknown');
console.log('Config version:', config.version || 'Unknown');
console.log('Telemetry enabled:', config.enabled);

// Test 3: Verify consistency
console.log('\n\nTest 3: Consistency Check');
console.log('-----------------------------------');

const match = actualUserId === expectedUserId;
console.log('User IDs match:', match ? '✓ YES' : '✗ NO');

if (!match) {
  console.log('WARNING: User ID mismatch detected!');
  console.log('This could indicate an implementation issue.');
}

// Test 4: Multiple loads (simulate multiple sessions)
console.log('\n\nTest 4: Multiple Session Simulation');
console.log('-----------------------------------');

const userId1 = configManager.getUserId();
const userId2 = TelemetryConfigManager.getInstance().getUserId();
const userId3 = configManager.getUserId();

console.log('Session 1 user ID:', userId1);
console.log('Session 2 user ID:', userId2);
console.log('Session 3 user ID:', userId3);

const consistent = userId1 === userId2 && userId2 === userId3;
console.log('All sessions consistent:', consistent ? '✓ YES' : '✗ NO');

// Test 5: Docker environment simulation
console.log('\n\nTest 5: Docker Environment Check');
console.log('-----------------------------------');

const isDocker = process.env.IS_DOCKER === 'true';
console.log('Running in Docker:', isDocker);

if (isDocker) {
  console.log('\n⚠️  DOCKER MODE DETECTED');
  console.log('In Docker, user IDs may change across container recreations because:');
  console.log('  1. Container hostname changes each time');
  console.log('  2. Config file is not persisted (no volume mount)');
  console.log('  3. Each container gets a new ephemeral filesystem');
  console.log('\nRecommendation: Mount ~/.n8n-mcp as a volume for persistent user IDs');
}

// Test 6: Environment variable override check
console.log('\n\nTest 6: Environment Variable Override');
console.log('-----------------------------------');

const telemetryDisabledVars = [
  'N8N_MCP_TELEMETRY_DISABLED',
  'TELEMETRY_DISABLED',
  'DISABLE_TELEMETRY'
];

telemetryDisabledVars.forEach(varName => {
  const value = process.env[varName];
  if (value !== undefined) {
    console.log(`${varName}:`, value);
  }
});

console.log('\nTelemetry status:', configManager.isEnabled() ? 'ENABLED' : 'DISABLED');

// Summary
console.log('\n\n=== SUMMARY ===');
console.log('User ID:', actualUserId);
console.log('Deterministic:', match ? 'YES ✓' : 'NO ✗');
console.log('Persistent across sessions:', consistent ? 'YES ✓' : 'NO ✗');
console.log('Telemetry enabled:', config.enabled ? 'YES' : 'NO');
console.log('Docker mode:', isDocker ? 'YES' : 'NO');

if (isDocker && !process.env.N8N_MCP_CONFIG_VOLUME) {
  console.log('\n⚠️  WARNING: Running in Docker without persistent volume!');
  console.log('User IDs will change on container recreation.');
  console.log('Mount /home/nodejs/.n8n-mcp to persist telemetry config.');
}

console.log('\n');
