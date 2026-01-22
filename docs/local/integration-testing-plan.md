# Comprehensive Integration Testing Plan

## Status

**Phase 1: Foundation** ✅ **COMPLETE** (October 3, 2025)
- All utility files created and tested
- Webhook workflows created on `https://n8n-test.n8n-mcp.com`
- GitHub secrets configured
- Critical fix: Updated credentials to use webhook URLs instead of IDs
- Environment loading fixed to support real n8n API integration tests

**Phase 2: Workflow Creation Tests** ✅ **COMPLETE** (October 3, 2025)
- 15 test scenarios implemented and passing
- P0 bug verification confirmed (FULL node type format)
- All test categories covered: base nodes, advanced features, error scenarios, edge cases
- Documented actual n8n API behavior (validation at execution time, not creation time)
- Test file: `tests/integration/n8n-api/workflows/create-workflow.test.ts` (484 lines)

**Phase 3: Workflow Retrieval Tests** ✅ **COMPLETE** (October 3, 2025)
- 11 test scenarios implemented and passing
- All MCP retrieval handlers tested: handleGetWorkflow, handleGetWorkflowDetails, handleGetWorkflowStructure, handleGetWorkflowMinimal
- Test files:
  - `get-workflow.test.ts` (3 scenarios)
  - `get-workflow-details.test.ts` (4 scenarios)
  - `get-workflow-structure.test.ts` (2 scenarios)
  - `get-workflow-minimal.test.ts` (2 scenarios)

**Phase 4: Workflow Update Tests** ✅ **COMPLETE** (October 4, 2025)
- 42 test scenarios implemented and passing
- Enhanced settings filtering (whitelist approach) to enable updates while maintaining Issue #248 protection
- All update operations tested:
  - Full workflow updates: 7 scenarios (update-workflow.test.ts)
  - Partial/diff-based updates: 32 scenarios covering all 15 operations (update-partial-workflow.test.ts)
  - Validation error scenarios: 3 scenarios
- Critical fixes:
  - Settings filtering uses OpenAPI spec whitelist (filters callerPolicy, preserves safe properties)
  - All tests comply with n8n API requirements (name, nodes, connections, settings fields)
  - Removed invalid "Update Connections" test (empty connections invalid for multi-node workflows)
- Version 2.15.4 released with comprehensive CHANGELOG entry

**Phase 5: Workflow Management Tests** ✅ **COMPLETE** (October 4, 2025)
- 16 test scenarios implemented and passing
- All workflow management operations tested:
  - Delete workflow: 3 scenarios (delete-workflow.test.ts)
  - List workflows: 13 scenarios (list-workflows.test.ts)
- Critical API compliance fixes:
  - handleDeleteWorkflow: Now returns deleted workflow data (per n8n API spec)
  - handleListWorkflows: Fixed tags parameter format (array → CSV string conversion)
  - N8nApiClient.deleteWorkflow: Return type corrected (void → Workflow)
  - WorkflowListParams.tags: Type corrected (string[] → string per n8n OpenAPI spec)
- Unit test coverage: Added 9 unit tests for handler coverage (100% coverage achieved)
- n8n-mcp-tester validation: All tools tested and working correctly in production
- Version 2.15.5 released with comprehensive CHANGELOG entry
- Test results: 71/71 integration tests passing (Phase 1-5 complete)

**Phase 6A: Workflow Validation Tests** ✅ **COMPLETE** (October 5, 2025)
- 12 test scenarios implemented and passing
- NodeRepository utility created for tests requiring node validation
- All validation profiles tested: strict, runtime, ai-friendly, minimal
- Test coverage:
  - Valid workflows across all 4 profiles (4 scenarios)
  - Invalid workflow detection (2 scenarios - bad node types, missing connections)
  - Selective validation (3 scenarios - nodes only, connections only, expressions only)
  - Error handling (2 scenarios - non-existent workflow, invalid profile)
  - Response format verification (1 scenario)
- Critical discoveries:
  - Response only includes errors/warnings fields when they exist (not empty arrays)
  - Field name is errorCount, not totalErrors
  - Tests require NodeRepository instance (added singleton utility)
- Test file: validate-workflow.test.ts (431 lines)
- Test results: 83/83 integration tests passing (Phase 1-5, 6A complete)

**Phase 6B: Workflow Autofix Tests** ✅ **COMPLETE** (October 5, 2025)
- 16 test scenarios implemented and passing
- All autofix operations tested: preview mode, apply mode, fix types, confidence filtering
- Test coverage:
  - Preview mode (2 scenarios - expression-format, multiple fix types)
  - Apply mode (2 scenarios - expression-format, webhook-missing-path)
  - Fix type filtering (2 scenarios - single type, multiple types)
  - Confidence thresholds (3 scenarios - high, medium, low)
  - Max fixes parameter (1 scenario)
  - No fixes available (1 scenario)
  - Error handling (3 scenarios - non-existent workflow, invalid parameters)
  - Response format verification (2 scenarios - preview and apply modes)
- Fix types tested:
  - expression-format (missing = prefix for resource locators)
  - typeversion-correction (outdated typeVersion values)
  - error-output-config (error output configuration issues)
  - node-type-correction (incorrect node types)
  - webhook-missing-path (missing webhook path parameters)
- Code quality improvements:
  - Fixed database resource leak in NodeRepository utility
  - Added TypeScript interfaces (ValidationResponse, AutofixResponse)
  - Replaced unsafe `as any` casts with proper type definitions
  - All lint and typecheck errors resolved
- Test file: autofix-workflow.test.ts (855 lines)
- Test results: 99/99 integration tests passing (Phase 1-6 complete)

**Phase 7: Execution Management Tests** ✅ **COMPLETE** (October 5, 2025)
- 54 test scenarios implemented and passing
- All 4 execution management handlers tested against real n8n instance
- Test coverage:
  - handleTriggerWebhookWorkflow (20 tests): All HTTP methods (GET/POST/PUT/DELETE), query params, JSON body, custom headers, error handling
  - handleGetExecution (16 tests): All 4 retrieval modes (preview/summary/filtered/full), node filtering, item limits, input data inclusion, legacy compatibility
  - handleListExecutions (13 tests): Status filtering (success/error/waiting), pagination with cursor, various limits (1/10/50/100), data inclusion control
  - handleDeleteExecution (5 tests): Successful deletion, verification via fetch attempt, error handling
- Critical fix: Corrected response structure expectations (executions/returned vs data/count)
- Test files:
  - trigger-webhook.test.ts (375 lines, 20 tests)
  - get-execution.test.ts (429 lines, 16 tests)
  - list-executions.test.ts (264 lines, 13 tests)
  - delete-execution.test.ts (149 lines, 5 tests)
- Code review: APPROVED (9.5/10 quality score)
- Test results: 153/153 integration tests passing (Phase 1-7 complete)

**Phase 8: System Tools Tests** ✅ **COMPLETE** (October 5, 2025)
- 19 test scenarios implemented and passing
- All 3 system tool handlers tested against real n8n instance
- Test coverage:
  - handleHealthCheck (3 tests): API connectivity verification, version information, feature availability
  - handleListAvailableTools (7 tests): Complete tool inventory by category, configuration status, API limitations
  - handleDiagnostic (9 tests): Environment checks, API connectivity, tools availability, verbose mode with debug info
- TypeScript type safety improvements:
  - Created response-types.ts with comprehensive interfaces for all response types
  - Replaced all 'as any' casts with proper TypeScript interfaces
  - Added null-safety checks and non-null assertions
  - Full type safety and IDE autocomplete support
- Test files:
  - health-check.test.ts (117 lines, 3 tests)
  - list-tools.test.ts (181 lines, 7 tests)
  - diagnostic.test.ts (243 lines, 9 tests)
  - response-types.ts (241 lines, comprehensive type definitions)
- Code review: APPROVED
- Test results: 172/172 integration tests passing (Phase 1-8 complete)

**🎉 INTEGRATION TEST SUITE COMPLETE**: All 18 MCP handlers fully tested

**Next Phase**: Update documentation and finalize integration testing plan

---

## Overview

Transform the test suite to test all 17 **MCP handlers** against a **real n8n instance** instead of mocks. This plan ensures 100% coverage of every tool, operation, and parameter combination to prevent bugs like the P0 workflow creation issue from slipping through.

### What We Test: MCP Handlers (The Product Layer)

**IMPORTANT**: These integration tests validate the **MCP handler layer** (the actual product that AI assistants interact with), not just the raw n8n API client.

**Architecture:**
```
AI Assistant (Claude)
      ↓
  MCP Tools (What AI sees)
      ↓
  MCP Handlers (What we test) ← INTEGRATION TESTS TARGET THIS LAYER
      ↓
  N8nApiClient (Low-level HTTP)
      ↓
  n8n REST API
```

**Why This Matters:**
- **MCP handlers** wrap API responses in `McpToolResponse` format: `{ success: boolean, data?: any, error?: string }`
- **MCP handlers** transform and enrich API responses (e.g., `handleGetWorkflowDetails` adds execution stats)
- **MCP handlers** provide the exact interface that AI assistants consume
- Testing raw API client bypasses the product layer and misses MCP-specific logic

**Test Pattern:**
```typescript
// ❌ WRONG: Testing raw API client (low-level service)
const result = await client.createWorkflow(workflow);

// ✅ CORRECT: Testing MCP handler (product layer)
const response = await handleCreateWorkflow({ ...workflow }, mcpContext);
expect(response.success).toBe(true);
const result = response.data;
```

## Critical Requirements

1. **Credentials**:
   - Local development: Read from `.env` file
   - CI/GitHub Actions: Use GitHub secrets (`N8N_URL`, `N8N_API_KEY`)

2. **Pre-activated Webhook Workflows**:
   - n8n API doesn't support workflow activation via API
   - Need pre-created, activated workflows for webhook testing
   - Store webhook URLs (not workflow IDs) in `.env`:
     - `N8N_TEST_WEBHOOK_GET_URL` - GET method webhook URL
     - `N8N_TEST_WEBHOOK_POST_URL` - POST method webhook URL
     - `N8N_TEST_WEBHOOK_PUT_URL` - PUT method webhook URL
     - `N8N_TEST_WEBHOOK_DELETE_URL` - DELETE method webhook URL
   - **Rationale**: Webhook URLs are what the `n8n_trigger_webhook_workflow` tool needs. Workflow IDs are only for workflow management tests (which create workflows dynamically during test execution).

3. **100% Coverage Goal**: Test EVERY tool, EVERY operation, EVERY parameter combination

---

## Complete Test Coverage Matrix

### Total Test Scenarios: ~150+

#### Workflow Management (10 MCP handlers)

**1. `handleCreateWorkflow`** - 15+ scenarios (MCP handler testing)
- Create workflow with base nodes (webhook, httpRequest, set)
- Create workflow with langchain nodes (agent, aiChain)
- Invalid node types (error handling)
- Complex multi-node workflows
- Complex connection patterns
- **P0 Bug Verification**: SHORT vs FULL node type handling
- Missing required parameters
- Duplicate node names
- Invalid connection references
- Settings variations

**2. `handleGetWorkflow`** - 3 scenarios
- Successful retrieval
- Not found (invalid ID)
- Malformed ID

**3. `handleGetWorkflowDetails`** - 4 scenarios
- Basic workflow
- Workflow with metadata
- Workflow with version history
- Workflow with execution stats

**4. `handleGetWorkflowStructure`** - 2 scenarios
- Simple workflow
- Complex workflow (verify no parameter data)

**5. `handleGetWorkflowMinimal`** - 2 scenarios
- Active workflow
- Inactive workflow

**6. `handleUpdateWorkflow`** - 8+ scenarios
- Full workflow replacement
- Update nodes
- Update connections
- Update settings
- Update tags
- Validation errors
- Concurrent update conflicts
- Large workflow updates

**7. `handleUpdatePartialWorkflow`** - 30+ scenarios (15 operations × 2 paths)

**Node Operations (12 scenarios):**
- `addNode`: Success, duplicate name, invalid type, missing position
- `removeNode`: By ID, by name, not found, with connection cleanup
- `updateNode`: By ID, by name, invalid updates, nested parameter updates
- `moveNode`: Valid position, boundary positions
- `enableNode`: Success, already enabled
- `disableNode`: Success, already disabled

**Connection Operations (10 scenarios):**
- `addConnection`: Default ports, custom ports, invalid nodes
- `removeConnection`: Success, not found, with ignoreErrors
- `updateConnection`: Change ports, change indices
- `cleanStaleConnections`: Dry run, actual cleanup
- `replaceConnections`: Full replacement, validation

**Metadata Operations (8 scenarios):**
- `updateSettings`: Timezone, execution order, error workflow
- `updateName`: Valid, duplicate, empty
- `addTag`: New tag, existing tag
- `removeTag`: Existing, non-existing

**8. `handleDeleteWorkflow`** - 3 scenarios
- Successful deletion
- Not found
- Verify cleanup (workflow actually deleted)

**9. `handleListWorkflows`** - 12+ scenarios
- No filters (all workflows)
- Filter by active status (true/false)
- Filter by tags (single, multiple)
- Filter by projectId (enterprise feature)
- Pagination: first page, next page, last page
- Pagination: cursor handling
- Exclude pinned data
- Limit variations (1, 50, 100)
- Empty results
- Sort order verification

**10. `handleValidateWorkflow`** - 16 scenarios (4 profiles × 4 validation types)

**Validation Profiles:**
- `strict`: All validations enabled, strictest rules
- `runtime`: Production-ready validation
- `ai-friendly`: Relaxed rules for AI-generated workflows
- `minimal`: Basic structure validation only

**Validation Types (for each profile):**
- All validations enabled (default)
- Nodes only (`validateNodes: true`, others false)
- Connections only (`validateConnections: true`, others false)
- Expressions only (`validateExpressions: true`, others false)

**11. `handleAutofixWorkflow`** - 20+ scenarios

**Fix Types (5):**
- `expression-format`: Fix `{{}}` syntax issues
- `typeversion-correction`: Fix outdated typeVersion
- `error-output-config`: Fix error output configuration
- `node-type-correction`: Fix incorrect node types
- `webhook-missing-path`: Add missing webhook paths

**Confidence Levels (3):**
- `high`: Only apply high-confidence fixes
- `medium`: Apply high + medium confidence fixes
- `low`: Apply all fixes

**Test Matrix:**
- Each fix type with preview mode (`applyFixes: false`)
- Each fix type with apply mode (`applyFixes: true`)
- Confidence threshold filtering
- `maxFixes` parameter limiting
- Multiple fix types in single workflow
- No fixes available scenario

---

#### Execution Management (4 handlers)

**12. `handleTriggerWebhookWorkflow`** - 16+ scenarios

**HTTP Methods (4):**
- GET: Query parameters, no data
- POST: JSON body, form data, headers
- PUT: Update data, custom headers
- DELETE: Query parameters, headers

**Scenarios per method:**
- Basic trigger (no data)
- With request data
- With custom headers
- Wait for response (true/false)
- Workflow not found
- Invalid webhook URL

**13. `handleGetExecution`** - 20+ scenarios

**Execution Modes (4):**
- `preview`: Structure & counts only (no data)
- `summary`: 2 samples per node (default)
- `filtered`: Custom limits and node filters
- `full`: Complete execution data

**Scenarios per mode:**
- Successful execution
- Failed execution
- Running execution
- With input data (`includeInputData: true`)
- Node filters (`nodeNames: ['Node1', 'Node2']`)
- Item limits (`itemsLimit: 0, 2, 5, -1`)
- Not found

**14. `handleListExecutions`** - 10+ scenarios
- No filters (all executions)
- Filter by workflowId
- Filter by status (success, error, waiting)
- Filter by projectId
- Pagination: first page, next page, last page
- Include execution data (`includeData: true/false`)
- Limit variations (1, 50, 100)
- Empty results

**15. `handleDeleteExecution`** - 3 scenarios
- Successful deletion
- Not found
- Verify cleanup

---

#### System/Utility (3 handlers)

**16. `handleHealthCheck`** - 2 scenarios
- API available
- Feature availability check

**17. `handleListAvailableTools`** - 1 scenario
- List all tools

**18. `handleDiagnostic`** - 3 scenarios
- Basic diagnostic
- Verbose mode (`verbose: true`)
- Configuration display

---

## Implementation Phases

### Phase 1: Foundation (Branch: `feat/integration-tests-foundation`)

#### 1.1 Environment Configuration

**Update `.env.example`:**
```bash
# ========================================
# INTEGRATION TESTING CONFIGURATION
# ========================================

# n8n API Configuration for Integration Tests
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here

# Pre-activated Webhook URLs for Testing
# Create these workflows manually in n8n and activate them
# Store the full webhook URLs (not workflow IDs)
N8N_TEST_WEBHOOK_GET_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-get
N8N_TEST_WEBHOOK_POST_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-post
N8N_TEST_WEBHOOK_PUT_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-put
N8N_TEST_WEBHOOK_DELETE_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-delete

# Test Configuration
N8N_TEST_CLEANUP_ENABLED=true           # Enable automatic cleanup
N8N_TEST_TAG=mcp-integration-test       # Tag for test workflows
N8N_TEST_NAME_PREFIX=[MCP-TEST]         # Name prefix for test workflows
```

**GitHub Secrets (for CI):**
- `N8N_URL`: n8n instance URL (e.g., `https://n8n-test.n8n-mcp.com`)
- `N8N_API_KEY`: n8n API key (JWT token from n8n Settings > API)
- `N8N_TEST_WEBHOOK_GET_URL`: Pre-activated GET webhook URL
- `N8N_TEST_WEBHOOK_POST_URL`: Pre-activated POST webhook URL
- `N8N_TEST_WEBHOOK_PUT_URL`: Pre-activated PUT webhook URL
- `N8N_TEST_WEBHOOK_DELETE_URL`: Pre-activated DELETE webhook URL

**Note**: Webhook URLs can be stored as repository secrets (not environment secrets) since they don't grant API access. The real secret is `N8N_API_KEY`.

#### 1.2 Directory Structure

```
tests/integration/n8n-api/
├── workflows/
│   ├── create-workflow.test.ts          (10+ scenarios)
│   ├── get-workflow.test.ts             (3 scenarios)
│   ├── get-workflow-details.test.ts     (4 scenarios)
│   ├── get-workflow-structure.test.ts   (2 scenarios)
│   ├── get-workflow-minimal.test.ts     (2 scenarios)
│   ├── update-workflow.test.ts          (8+ scenarios)
│   ├── update-partial-workflow.test.ts  (30+ scenarios - 15 operations)
│   ├── delete-workflow.test.ts          (3 scenarios)
│   ├── list-workflows.test.ts           (12+ scenarios)
│   ├── validate-workflow.test.ts        (16 scenarios - 4 profiles × 4 types)
│   └── autofix-workflow.test.ts         (20+ scenarios - 5 types × modes)
├── executions/
│   ├── trigger-webhook.test.ts          (16+ scenarios - 4 methods)
│   ├── get-execution.test.ts            (20+ scenarios - 4 modes)
│   ├── list-executions.test.ts          (10+ scenarios)
│   └── delete-execution.test.ts         (3 scenarios)
├── system/
│   ├── health-check.test.ts             (2 scenarios)
│   ├── list-tools.test.ts               (1 scenario)
│   └── diagnostic.test.ts               (3 scenarios)
└── utils/
    ├── credentials.ts                   # Environment-aware credential loader
    ├── n8n-client.ts                    # Pre-configured API client
    ├── cleanup-helpers.ts               # Multi-level cleanup
    ├── test-context.ts                  # Resource tracking
    ├── fixtures.ts                      # Reusable workflow templates
    ├── factories.ts                     # Test data generators
    └── webhook-workflows.ts             # Webhook workflow configurations
```

#### 1.3 Core Utilities

**mcp-context.ts** - MCP context configuration for handler testing:
```typescript
import { InstanceContext } from '../../../../src/types/instance-context';
import { getN8nCredentials } from './credentials';

/**
 * Creates MCP context for testing MCP handlers against real n8n instance
 * This is what gets passed to MCP handlers (handleCreateWorkflow, etc.)
 */
export function createMcpContext(): InstanceContext {
  const creds = getN8nCredentials();
  return {
    n8nApiUrl: creds.url,
    n8nApiKey: creds.apiKey
  };
}
```

**credentials.ts** - Environment-aware credential loader:
```typescript
import dotenv from 'dotenv';

dotenv.config();

export interface N8nTestCredentials {
  url: string;
  apiKey: string;
  webhookUrls: {
    get: string;
    post: string;
    put: string;
    delete: string;
  };
  cleanup: {
    enabled: boolean;
    tag: string;
    namePrefix: string;
  };
}

export function getN8nCredentials(): N8nTestCredentials {
  if (process.env.CI) {
    // CI: Use GitHub secrets
    const url = process.env.N8N_URL;
    const apiKey = process.env.N8N_API_KEY;

    if (!url || !apiKey) {
      throw new Error(
        'Missing required CI credentials:\n' +
        `  N8N_URL: ${url ? 'set' : 'MISSING'}\n` +
        `  N8N_API_KEY: ${apiKey ? 'set' : 'MISSING'}\n` +
        'Please configure GitHub secrets for integration tests.'
      );
    }

    return {
      url,
      apiKey,
      webhookUrls: {
        get: process.env.N8N_TEST_WEBHOOK_GET_URL || '',
        post: process.env.N8N_TEST_WEBHOOK_POST_URL || '',
        put: process.env.N8N_TEST_WEBHOOK_PUT_URL || '',
        delete: process.env.N8N_TEST_WEBHOOK_DELETE_URL || ''
      },
      cleanup: {
        enabled: true,
        tag: 'mcp-integration-test',
        namePrefix: '[MCP-TEST]'
      }
    };
  } else {
    // Local: Use .env file
    const url = process.env.N8N_API_URL;
    const apiKey = process.env.N8N_API_KEY;

    if (!url || !apiKey) {
      throw new Error(
        'Missing required credentials in .env:\n' +
        `  N8N_API_URL: ${url ? 'set' : 'MISSING'}\n` +
        `  N8N_API_KEY: ${apiKey ? 'set' : 'MISSING'}\n\n` +
        'Please add these to your .env file.\n' +
        'See .env.example for configuration details.'
      );
    }

    return {
      url,
      apiKey,
      webhookUrls: {
        get: process.env.N8N_TEST_WEBHOOK_GET_URL || '',
        post: process.env.N8N_TEST_WEBHOOK_POST_URL || '',
        put: process.env.N8N_TEST_WEBHOOK_PUT_URL || '',
        delete: process.env.N8N_TEST_WEBHOOK_DELETE_URL || ''
      },
      cleanup: {
        enabled: process.env.N8N_TEST_CLEANUP_ENABLED !== 'false',
        tag: process.env.N8N_TEST_TAG || 'mcp-integration-test',
        namePrefix: process.env.N8N_TEST_NAME_PREFIX || '[MCP-TEST]'
      }
    };
  }
}

export function validateCredentials(creds: N8nTestCredentials): void {
  if (!creds.url) throw new Error('N8N_API_URL is required');
  if (!creds.apiKey) throw new Error('N8N_API_KEY is required');
}

export function validateWebhookUrls(creds: N8nTestCredentials): void {
  const missing: string[] = [];
  if (!creds.webhookUrls.get) missing.push('GET');
  if (!creds.webhookUrls.post) missing.push('POST');
  if (!creds.webhookUrls.put) missing.push('PUT');
  if (!creds.webhookUrls.delete) missing.push('DELETE');

  if (missing.length > 0) {
    throw new Error(
      `Missing webhook URLs for HTTP methods: ${missing.join(', ')}\n` +
      `Please create and activate webhook workflows, then set:\n` +
      missing.map(m => `  N8N_TEST_WEBHOOK_${m}_URL`).join('\n')
    );
  }
}
```

**n8n-client.ts** - Pre-configured API client (for test utilities only):
```typescript
import { N8nApiClient } from '../../../src/services/n8n-api-client';
import { getN8nCredentials } from './credentials';

/**
 * IMPORTANT: This client is ONLY used for test setup/cleanup utilities.
 * DO NOT use this in actual test cases - use MCP handlers instead!
 *
 * Test utilities that need direct API access:
 * - cleanupOrphanedWorkflows() - bulk cleanup
 * - Fixture setup/teardown
 * - Pre-test verification
 *
 * Actual tests MUST use MCP handlers:
 * - handleCreateWorkflow()
 * - handleGetWorkflow()
 * - etc.
 */
let client: N8nApiClient | null = null;

export function getTestN8nClient(): N8nApiClient {
  if (!client) {
    const creds = getN8nCredentials();
    client = new N8nApiClient(creds.url, creds.apiKey);
  }
  return client;
}

export function resetTestN8nClient(): void {
  client = null;
}
```

**test-context.ts** - Resource tracking for cleanup:
```typescript
import { getN8nCredentials } from './credentials';

export interface TestContext {
  workflowIds: string[];
  executionIds: string[];
  cleanup: () => Promise<void>;
}

export function createTestContext(): TestContext {
  const context: TestContext = {
    workflowIds: [],
    executionIds: [],
    cleanup: async () => {
      const creds = getN8nCredentials();
      if (!creds.cleanup.enabled) return;

      const client = getTestN8nClient();

      // Delete executions first
      for (const id of context.executionIds) {
        try {
          await client.deleteExecution(id);
        } catch (error) {
          console.warn(`Failed to delete execution ${id}:`, error);
        }
      }

      // Then delete workflows
      for (const id of context.workflowIds) {
        try {
          await client.deleteWorkflow(id);
        } catch (error) {
          console.warn(`Failed to delete workflow ${id}:`, error);
        }
      }

      context.workflowIds = [];
      context.executionIds = [];
    }
  };

  return context;
}
```

**cleanup-helpers.ts** - Multi-level cleanup strategies:
```typescript
import { N8nApiClient } from '../../../src/services/n8n-api-client';
import { getN8nCredentials, getTestN8nClient } from './credentials';

/**
 * Clean up orphaned test workflows
 * Run this periodically in CI to clean up failed test runs
 */
export async function cleanupOrphanedWorkflows(): Promise<void> {
  const creds = getN8nCredentials();
  const client = getTestN8nClient();

  let allWorkflows: any[] = [];
  let cursor: string | undefined;

  // Fetch all workflows with pagination
  do {
    const response = await client.listWorkflows({ cursor, limit: 100 });
    allWorkflows.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor);

  // Find test workflows
  const testWorkflows = allWorkflows.filter(w =>
    w.tags?.includes(creds.cleanup.tag) ||
    w.name?.startsWith(creds.cleanup.namePrefix)
  );

  console.log(`Found ${testWorkflows.length} orphaned test workflows`);

  // Delete them
  for (const workflow of testWorkflows) {
    try {
      await client.deleteWorkflow(workflow.id);
      console.log(`Deleted orphaned workflow: ${workflow.name} (${workflow.id})`);
    } catch (error) {
      console.warn(`Failed to delete workflow ${workflow.id}:`, error);
    }
  }
}

/**
 * Clean up old executions (older than 24 hours)
 */
export async function cleanupOldExecutions(): Promise<void> {
  const client = getTestN8nClient();

  let allExecutions: any[] = [];
  let cursor: string | undefined;

  // Fetch all executions
  do {
    const response = await client.listExecutions({ cursor, limit: 100 });
    allExecutions.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor);

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const oldExecutions = allExecutions.filter(e =>
    new Date(e.startedAt).getTime() < oneDayAgo
  );

  console.log(`Found ${oldExecutions.length} old executions`);

  for (const execution of oldExecutions) {
    try {
      await client.deleteExecution(execution.id);
    } catch (error) {
      console.warn(`Failed to delete execution ${execution.id}:`, error);
    }
  }
}
```

**fixtures.ts** - Reusable workflow templates:
```typescript
import { Workflow } from '../../../src/types/n8n-api';

export const SIMPLE_WEBHOOK_WORKFLOW: Partial<Workflow> = {
  name: '[MCP-TEST] Simple Webhook',
  nodes: [
    {
      id: 'webhook-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: 'GET',
        path: 'test-webhook'
      }
    }
  ],
  connections: {}
};

export const SIMPLE_HTTP_WORKFLOW: Partial<Workflow> = {
  name: '[MCP-TEST] Simple HTTP Request',
  nodes: [
    {
      id: 'webhook-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: 'GET',
        path: 'trigger'
      }
    },
    {
      id: 'http-1',
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [450, 300],
      parameters: {
        url: 'https://httpbin.org/get',
        method: 'GET'
      }
    }
  ],
  connections: {
    Webhook: {
      main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
    }
  }
};

// Add more fixtures for complex workflows
```

**webhook-workflows.ts** - Webhook workflow setup guide:
```typescript
/**
 * Guide for setting up webhook workflows manually in n8n
 *
 * These workflows must be created manually and activated because
 * n8n API doesn't support workflow activation.
 *
 * For each HTTP method, create a workflow with:
 * 1. Single Webhook node
 * 2. Configured for the specific HTTP method
 * 3. Unique webhook path
 * 4. Activated in n8n UI
 * 5. Workflow ID added to .env
 */

export const WEBHOOK_WORKFLOW_CONFIGS = {
  GET: {
    name: '[MCP-TEST] Webhook GET',
    description: 'Pre-activated webhook for GET method testing',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: {
          httpMethod: 'GET',
          path: 'mcp-test-get',
          responseMode: 'lastNode'
        }
      }
    ]
  },
  POST: {
    name: '[MCP-TEST] Webhook POST',
    description: 'Pre-activated webhook for POST method testing',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: {
          httpMethod: 'POST',
          path: 'mcp-test-post',
          responseMode: 'lastNode'
        }
      }
    ]
  },
  PUT: {
    name: '[MCP-TEST] Webhook PUT',
    description: 'Pre-activated webhook for PUT method testing',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: {
          httpMethod: 'PUT',
          path: 'mcp-test-put',
          responseMode: 'lastNode'
        }
      }
    ]
  },
  DELETE: {
    name: '[MCP-TEST] Webhook DELETE',
    description: 'Pre-activated webhook for DELETE method testing',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: {
          httpMethod: 'DELETE',
          path: 'mcp-test-delete',
          responseMode: 'lastNode'
        }
      }
    ]
  }
};

export function printSetupInstructions(): void {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  WEBHOOK WORKFLOW SETUP REQUIRED                               ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Integration tests require 4 pre-activated webhook workflows:  ║
║                                                                ║
║  1. Create workflows manually in n8n UI                        ║
║  2. Use the configurations shown below                         ║
║  3. ACTIVATE each workflow in n8n UI                           ║
║  4. Copy workflow IDs to .env file                             ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

Required workflows:
`);

  Object.entries(WEBHOOK_WORKFLOW_CONFIGS).forEach(([method, config]) => {
    console.log(`
${method} Method:
  Name: ${config.name}
  Path: ${config.nodes[0].parameters.path}
  .env variable: N8N_TEST_WEBHOOK_${method}_ID
`);
  });
}
```

---

### Phase 2: Workflow Creation Tests (P0)

**Branch**: `feat/integration-tests-phase-2`

**File**: `tests/integration/n8n-api/workflows/create-workflow.test.ts`

**Test Approach**: Tests the `handleCreateWorkflow` MCP handler against real n8n instance

**MCP Handler Test Pattern:**
```typescript
import { handleCreateWorkflow } from '../../../../src/mcp/handlers-n8n-manager';
import { createMcpContext } from '../utils/mcp-context';
import { InstanceContext } from '../../../../src/types/instance-context';

describe('Integration: handleCreateWorkflow', () => {
  let mcpContext: InstanceContext;

  beforeEach(() => {
    mcpContext = createMcpContext();
  });

  it('should create workflow using MCP handler', async () => {
    const workflow = { name: 'Test', nodes: [...], connections: {} };

    // Test MCP handler (the product layer)
    const response = await handleCreateWorkflow({ ...workflow }, mcpContext);

    // Verify MCP response structure
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();

    // Extract actual workflow from MCP response
    const result = response.data;
    expect(result.id).toBeTruthy();
  });
});
```

**15 Test Scenarios** (all testing MCP handlers):
1. Create workflow with base webhook node (verify P0 bug fix)
2. Create workflow with base HTTP request node
3. Create workflow with langchain agent node
4. Create complex multi-node workflow
5. Create workflow with complex connections
6. Create workflow with custom settings
7. Create workflow with n8n expressions
8. Create workflow with error handling
9. Error: Invalid node type (documents API behavior)
10. Error: Missing required parameters (documents API behavior)
11. Error: Duplicate node names (documents API behavior)
12. Error: Invalid connection references (documents API behavior)
13. Edge case: Minimal single node workflow
14. Edge case: Empty connections object
15. Edge case: Workflow without settings

---

### Phase 3: Workflow Retrieval Tests (P1)

**Branch**: `feat/integration-tests-phase-3`

**Test Approach**: Tests MCP handlers (`handleGetWorkflow`, `handleGetWorkflowDetails`, `handleGetWorkflowStructure`, `handleGetWorkflowMinimal`)

**MCP Handler Pattern:**
```typescript
import {
  handleGetWorkflow,
  handleGetWorkflowDetails,
  handleGetWorkflowStructure,
  handleGetWorkflowMinimal
} from '../../../../src/mcp/handlers-n8n-manager';

// Test MCP handler
const response = await handleGetWorkflow({ id: workflowId }, mcpContext);
expect(response.success).toBe(true);
const workflow = response.data;

// Note: handleGetWorkflowDetails returns nested structure
const detailsResponse = await handleGetWorkflowDetails({ id }, mcpContext);
const workflow = detailsResponse.data.workflow;  // Extract from nested structure
const stats = detailsResponse.data.executionStats;
```

**Files**:
- `get-workflow.test.ts` (3 scenarios - tests handleGetWorkflow)
- `get-workflow-details.test.ts` (4 scenarios - tests handleGetWorkflowDetails)
- `get-workflow-structure.test.ts` (2 scenarios - tests handleGetWorkflowStructure)
- `get-workflow-minimal.test.ts` (2 scenarios - tests handleGetWorkflowMinimal)

---

### Phase 4: Workflow Update Tests (P1)

**Branch**: `feat/integration-tests-workflow-updates`

**Files**:
- `update-workflow.test.ts` (8+ scenarios)
- `update-partial-workflow.test.ts` (30+ scenarios covering all 15 operations)

---

### Phase 5: Workflow Management Tests (P2)

**Branch**: `feat/integration-tests-workflow-management`

**Files**:
- `delete-workflow.test.ts` (3 scenarios)
- `list-workflows.test.ts` (12+ scenarios with all filters and pagination)

---

### Phase 6A: Workflow Validation Tests (P2) ✅ COMPLETE

**Branch**: `feat/integration-tests-phase-6`

**Files**:
- ✅ `tests/integration/n8n-api/utils/node-repository.ts` - NodeRepository singleton for validation tests
- ✅ `validate-workflow.test.ts` (12 scenarios: 4 profiles + invalid detection + selective validation + error handling)

**Implementation Notes**:
- Created NodeRepository utility since handleValidateWorkflow requires repository parameter
- Tests cover all 4 validation profiles (strict, runtime, ai-friendly, minimal)
- Invalid workflow detection tests (bad node types, missing connections)
- Selective validation tests (nodes only, connections only, expressions only)
- Response structure correctly handles conditional errors/warnings fields

### Phase 6B: Workflow Autofix Tests (P2)

**Branch**: `feat/integration-tests-phase-6b` (or continue on `feat/integration-tests-phase-6`)

**Files**:
- `autofix-workflow.test.ts` (15-20 scenarios: 5 fix types × modes × confidence levels)

**Test Coverage Required**:
- 5 fix types: expression-format, typeversion-correction, error-output-config, node-type-correction, webhook-missing-path
- Preview mode (applyFixes: false) vs Apply mode (applyFixes: true)
- Confidence threshold filtering (high, medium, low)
- maxFixes parameter limiting
- Multiple fix types in single workflow
- No fixes available scenario

---

### Phase 7: Execution Management Tests (P2)

**Branch**: `feat/integration-tests-executions`

**Files**:
- `trigger-webhook.test.ts` (16+ scenarios: 4 HTTP methods × variations)
- `get-execution.test.ts` (20+ scenarios: 4 modes × filters)
- `list-executions.test.ts` (10+ scenarios)
- `delete-execution.test.ts` (3 scenarios)

**Special Considerations for Webhook Testing**:
- Use pre-activated workflows from `.env`
- Each HTTP method uses a different workflow ID
- Test both successful triggers and error cases
- Verify response data for synchronous executions

---

### Phase 8: System Tools Tests (P3)

**Branch**: `feat/integration-tests-system`

**Files**:
- `health-check.test.ts` (2 scenarios)
- `list-tools.test.ts` (1 scenario)
- `diagnostic.test.ts` (3 scenarios)

---

### Phase 9: CI/CD Integration

**Branch**: `feat/integration-tests-ci`

**GitHub Actions Workflow** (`.github/workflows/integration-tests.yml`):

```yaml
name: Integration Tests

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  integration-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Run integration tests
        env:
          N8N_URL: ${{ secrets.N8N_URL }}
          N8N_API_KEY: ${{ secrets.N8N_API_KEY }}
          N8N_TEST_WEBHOOK_GET_URL: ${{ secrets.N8N_TEST_WEBHOOK_GET_URL }}
          N8N_TEST_WEBHOOK_POST_URL: ${{ secrets.N8N_TEST_WEBHOOK_POST_URL }}
          N8N_TEST_WEBHOOK_PUT_URL: ${{ secrets.N8N_TEST_WEBHOOK_PUT_URL }}
          N8N_TEST_WEBHOOK_DELETE_URL: ${{ secrets.N8N_TEST_WEBHOOK_DELETE_URL }}
          CI: true
        run: npm run test:integration:n8n

      - name: Cleanup orphaned workflows
        if: always()
        env:
          N8N_URL: ${{ secrets.N8N_URL }}
          N8N_API_KEY: ${{ secrets.N8N_API_KEY }}
        run: npm run test:cleanup:orphans
```

**Add npm scripts to `package.json`**:
```json
{
  "scripts": {
    "test:integration:n8n": "vitest run tests/integration/n8n-api",
    "test:cleanup:orphans": "tsx tests/integration/n8n-api/utils/cleanup-orphans.ts"
  }
}
```

---

## Test Isolation Strategy

### Workflow Naming Convention
- Prefix: `[MCP-TEST]`
- Include test name: `[MCP-TEST] Create Workflow - Base Nodes`
- Include timestamp for uniqueness: `[MCP-TEST] Test Name ${Date.now()}`

### Workflow Tagging
- All test workflows tagged with: `mcp-integration-test`
- Enables bulk cleanup queries

### Cleanup Levels
1. **Test-level**: After each test via `afterEach` hook
2. **Suite-level**: After each test file via `afterAll` hook
3. **CI-level**: After CI job completes (always run)
4. **Orphan cleanup**: Periodic job to clean up failed test runs

---

## Pre-Test Setup Checklist

### Local Development
1. ✅ Install n8n locally or use Docker
2. ✅ Start n8n instance: `npx n8n start`
3. ✅ Create 4 webhook workflows (GET, POST, PUT, DELETE)
4. ✅ Activate all 4 webhook workflows in n8n UI
5. ✅ Get webhook URLs from the workflow's Webhook node
6. ✅ Copy `.env.example` to `.env`
7. ✅ Set `N8N_API_URL=<your-n8n-url>`
8. ✅ Generate API key in n8n Settings > API
9. ✅ Set `N8N_API_KEY=<your-key>`
10. ✅ Set all 4 `N8N_TEST_WEBHOOK_*_URL` variables with full webhook URLs

### CI/GitHub Actions (✅ COMPLETED)
1. ✅ Set up cloud n8n instance: `https://n8n-test.n8n-mcp.com`
2. ✅ Create 4 webhook workflows (GET, POST, PUT, DELETE)
3. ✅ Activate all 4 webhook workflows
4. ✅ Add GitHub secrets: `N8N_URL`, `N8N_API_KEY`
5. ✅ Add webhook URL secrets:
   - `N8N_TEST_WEBHOOK_GET_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-get`
   - `N8N_TEST_WEBHOOK_POST_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-post`
   - `N8N_TEST_WEBHOOK_PUT_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-put`
   - `N8N_TEST_WEBHOOK_DELETE_URL=https://n8n-test.n8n-mcp.com/webhook/mcp-test-delete`

---

## Success Criteria

### Phase 1: Foundation ✅ COMPLETE
- ✅ Environment configuration (.env, GitHub secrets)
- ✅ All utility files created (8 files, ~1,520 lines of code)
- ✅ Pre-activated webhook workflows created and tested
- ✅ Cleanup helpers with pagination safety
- ✅ Resource tracking with TestContext
- ✅ Fixtures and factories for test data
- ✅ Documentation updated
- ✅ Environment loading fixed (loads .env before test defaults)
- ✅ Vitest integration config updated (removed MSW for n8n-api tests)

### Phase 2: Workflow Creation Tests ✅ COMPLETE
- ✅ 15 test scenarios implemented (all passing)
- ✅ Tests the `handleCreateWorkflow` MCP handler (product layer)
- ✅ All tests use MCP handler pattern with McpToolResponse validation
- ✅ P0 bug verification (FULL vs SHORT node type format)
- ✅ Base node tests (webhook, HTTP, langchain, multi-node)
- ✅ Advanced features (connections, settings, expressions, error handling)
- ✅ Error scenarios (4 tests documenting actual API behavior)
- ✅ Edge cases (3 tests for minimal/empty configurations)
- ✅ Test file: 563 lines covering all handleCreateWorkflow scenarios
- ✅ All tests passing against real n8n instance

### Overall Project (In Progress)
- ⏳ All 17 handlers have integration tests (11 of 17 complete)
- ⏳ All operations/parameters covered (99 of 150+ scenarios complete)
- ✅ Tests run successfully locally (Phases 1-6 verified)
- ⏳ Tests run successfully in CI (pending Phase 9)
- ✅ No manual cleanup required (automatic)
- ✅ Test coverage catches P0-level bugs (verified in Phase 2)
- ⏳ CI runs on every PR and daily (pending Phase 9)
- ✅ Clear error messages when tests fail
- ✅ Documentation for webhook workflow setup
- ✅ Code quality maintained (lint, typecheck, type safety)

---

## Timeline Estimate

- **Phase 1 (Foundation)**: ✅ COMPLETE (October 3, 2025)
- **Phase 2 (Workflow Creation)**: ✅ COMPLETE (October 3, 2025)
- **Phase 3 (Retrieval)**: ✅ COMPLETE (October 3, 2025)
- **Phase 4 (Updates)**: ✅ COMPLETE (October 4, 2025)
- **Phase 5 (Management)**: ✅ COMPLETE (October 4, 2025)
- **Phase 6A (Validation)**: ✅ COMPLETE (October 5, 2025)
- **Phase 6B (Autofix)**: ✅ COMPLETE (October 5, 2025)
- **Phase 7 (Executions)**: 2 days
- **Phase 8 (System)**: 1 day
- **Phase 9 (CI/CD)**: 1 day

**Total**: 6 days complete, ~4 days remaining

---

## Notes

- Each phase should be developed on a separate branch
- Phases can be parallelized where dependencies allow
- Run local tests frequently to catch issues early
- Document any n8n API quirks discovered during testing

## Key Learnings from Implementation

### Critical Testing Principle: Test the Product Layer

**The Mistake**: Initially, Phase 2 tests called `client.createWorkflow()` (raw API client) instead of `handleCreateWorkflow()` (MCP handler).

**Why This Was Wrong**:
- AI assistants interact with MCP handlers, not raw API client
- MCP handlers wrap responses in `McpToolResponse` format
- MCP handlers may transform/enrich API responses
- Bypassing MCP layer misses product-specific logic and bugs

**The Fix**: All tests updated to use MCP handlers:
```typescript
// ❌ BEFORE: Testing wrong layer
const result = await client.createWorkflow(workflow);

// ✅ AFTER: Testing the actual product
const response = await handleCreateWorkflow({ ...workflow }, mcpContext);
expect(response.success).toBe(true);
const result = response.data;
```

**Lesson Learned**: Always test the layer closest to the user/consumer. For n8n-mcp, that's the MCP handler layer.

### n8n API Behavior Discoveries
1. **Validation Timing**: n8n API accepts workflows with invalid node types and connection references at creation time. Validation only happens at execution time.
2. **Node Type Format**: FULL node type format (`n8n-nodes-base.*`) must be used in API requests. The P0 bug was confirmed fixed.
3. **Missing Parameters**: n8n accepts workflows with missing required parameters. They fail during execution, not creation.
4. **Duplicate Names**: n8n API handles duplicate node names gracefully (may auto-rename).

### Technical Implementation Insights
1. **MSW Interference**: Integration tests that need real network requests must NOT load MSW setup. Removed from vitest.config.integration.ts.
2. **Environment Loading**: Must load `.env` file BEFORE test defaults in global setup to preserve real credentials.
3. **Cleanup Safety**: TestContext pattern works well for tracking and cleaning up test resources.
4. **Test Isolation**: Each test creates unique workflows with timestamps to avoid conflicts.
