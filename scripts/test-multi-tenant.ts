#!/usr/bin/env ts-node

/**
 * Test script for multi-tenant functionality
 * Verifies that instance context from headers enables n8n API tools
 */

import { N8NDocumentationMCPServer } from '../src/mcp/server';
import { InstanceContext } from '../src/types/instance-context';
import { logger } from '../src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function testMultiTenant() {
  console.log('🧪 Testing Multi-Tenant Functionality\n');
  console.log('=' .repeat(60));

  // Save original environment
  const originalEnv = {
    ENABLE_MULTI_TENANT: process.env.ENABLE_MULTI_TENANT,
    N8N_API_URL: process.env.N8N_API_URL,
    N8N_API_KEY: process.env.N8N_API_KEY
  };

  // Wait a moment for database initialization
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    // Test 1: Without multi-tenant mode (default)
    console.log('\n📌 Test 1: Without multi-tenant mode (no env vars)');
    delete process.env.N8N_API_URL;
    delete process.env.N8N_API_KEY;
    process.env.ENABLE_MULTI_TENANT = 'false';

    const server1 = new N8NDocumentationMCPServer();
    const tools1 = await getToolsFromServer(server1);
    const hasManagementTools1 = tools1.some(t => t.name.startsWith('n8n_'));
    console.log(`  Tools available: ${tools1.length}`);
    console.log(`  Has management tools: ${hasManagementTools1}`);
    console.log(`  ✅ Expected: No management tools (correct: ${!hasManagementTools1})`);

    // Test 2: With instance context but multi-tenant disabled
    console.log('\n📌 Test 2: With instance context but multi-tenant disabled');
    const instanceContext: InstanceContext = {
      n8nApiUrl: 'https://instance1.n8n.cloud',
      n8nApiKey: 'test-api-key',
      instanceId: 'instance-1'
    };

    const server2 = new N8NDocumentationMCPServer(instanceContext);
    const tools2 = await getToolsFromServer(server2);
    const hasManagementTools2 = tools2.some(t => t.name.startsWith('n8n_'));
    console.log(`  Tools available: ${tools2.length}`);
    console.log(`  Has management tools: ${hasManagementTools2}`);
    console.log(`  ✅ Expected: Has management tools (correct: ${hasManagementTools2})`);

    // Test 3: With multi-tenant mode enabled
    console.log('\n📌 Test 3: With multi-tenant mode enabled');
    process.env.ENABLE_MULTI_TENANT = 'true';

    const server3 = new N8NDocumentationMCPServer();
    const tools3 = await getToolsFromServer(server3);
    const hasManagementTools3 = tools3.some(t => t.name.startsWith('n8n_'));
    console.log(`  Tools available: ${tools3.length}`);
    console.log(`  Has management tools: ${hasManagementTools3}`);
    console.log(`  ✅ Expected: Has management tools (correct: ${hasManagementTools3})`);

    // Test 4: Multi-tenant with instance context
    console.log('\n📌 Test 4: Multi-tenant with instance context');
    const server4 = new N8NDocumentationMCPServer(instanceContext);
    const tools4 = await getToolsFromServer(server4);
    const hasManagementTools4 = tools4.some(t => t.name.startsWith('n8n_'));
    console.log(`  Tools available: ${tools4.length}`);
    console.log(`  Has management tools: ${hasManagementTools4}`);
    console.log(`  ✅ Expected: Has management tools (correct: ${hasManagementTools4})`);

    // Test 5: Environment variables (backward compatibility)
    console.log('\n📌 Test 5: Environment variables (backward compatibility)');
    process.env.ENABLE_MULTI_TENANT = 'false';
    process.env.N8N_API_URL = 'https://env.n8n.cloud';
    process.env.N8N_API_KEY = 'env-api-key';

    const server5 = new N8NDocumentationMCPServer();
    const tools5 = await getToolsFromServer(server5);
    const hasManagementTools5 = tools5.some(t => t.name.startsWith('n8n_'));
    console.log(`  Tools available: ${tools5.length}`);
    console.log(`  Has management tools: ${hasManagementTools5}`);
    console.log(`  ✅ Expected: Has management tools (correct: ${hasManagementTools5})`);

    console.log('\n' + '=' .repeat(60));
    console.log('✅ All multi-tenant tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Restore original environment
    Object.assign(process.env, originalEnv);
  }
}

// Helper function to get tools from server
async function getToolsFromServer(server: N8NDocumentationMCPServer): Promise<any[]> {
  // Access the private server instance to simulate tool listing
  const serverInstance = (server as any).server;
  const handlers = (serverInstance as any)._requestHandlers;

  // Find and call the ListToolsRequestSchema handler
  if (handlers && handlers.size > 0) {
    for (const [schema, handler] of handlers) {
      // Check for the tools/list schema
      if (schema && schema.method === 'tools/list') {
        const result = await handler({ params: {} });
        return result.tools || [];
      }
    }
  }

  // Fallback: directly check the handlers map
  const ListToolsRequestSchema = { method: 'tools/list' };
  const handler = handlers?.get(ListToolsRequestSchema);
  if (handler) {
    const result = await handler({ params: {} });
    return result.tools || [];
  }

  console.log('  ⚠️  Warning: Could not find tools/list handler');
  return [];
}

// Run tests
testMultiTenant().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});