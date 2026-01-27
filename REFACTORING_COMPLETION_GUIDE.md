# Server.ts Refactoring - Completion Guide

## Progress Summary

### Completed (4/10 tasks)
✅ **src/mcp/types.ts** - All type definitions and interfaces
✅ **src/mcp/utils/search-utils.ts** - Search and ranking utilities
✅ **src/mcp/utils/node-utils.ts** - Node metadata and version utilities
✅ **src/mcp/utils/validation-utils.ts** - Validation and sanitization utilities

### Remaining (6/10 tasks)
❌ **src/mcp/handlers/discovery-handlers.ts** - Search, list, database stats functions
❌ **src/mcp/handlers/node-info-handlers.ts** - Node information retrieval functions
❌ **src/mcp/handlers/validation-handlers.ts** - Node and workflow validation functions
❌ **src/mcp/handlers/template-handlers.ts** - Template management functions
❌ **src/mcp/handlers/tool-dispatcher.ts** - Main executeTool switch/case
❌ **src/mcp/server.ts** - Refactored main class using new modules

## Step-by-Step Completion Plan

### Step 1: Create Discovery Handlers

**File**: `src/mcp/handlers/discovery-handlers.ts`
**Size**: ~450 lines
**Dependencies**: DatabaseAdapter, NodeRepository, SimpleCache, telemetry

**Functions to extract from server.ts**:
- `listNodes()` (lines 1284-1341)
- `searchNodes()` (lines 1425-1465)
- `searchNodesFTS()` (lines 1467-1671)
- `searchNodesFuzzy()` (lines 1673-1724)
- `searchNodesLIKE()` (lines 1820-2005)
- `listAITools()` (lines 2158-2188)
- `getNodeDocumentation()` (lines 2190-2275)
- `getDatabaseStatistics()` (lines 2285-2339)

**Key imports needed**:
```typescript
import { DatabaseAdapter } from '../../database/database-adapter';
import { NodeRepository } from '../../database/node-repository';
import { SimpleCache } from '../../utils/simple-cache';
import { NodeRow } from '../types';
import { logger } from '../../utils/logger';
import { telemetry } from '../../telemetry';
import { getWorkflowNodeType, NodeTypeNormalizer } from '../../utils/node-utils';
import * as SearchUtils from '../utils/search-utils';
import * as NodeUtils from '../utils/node-utils';
```

**Pattern**: All functions should take server context as parameters:
```typescript
export async function searchNodes(
  query: string,
  limit: number,
  options: any,
  db: DatabaseAdapter,
  repository: NodeRepository
): Promise<any> {
  // Implementation
}
```

### Step 2: Create Node Info Handlers

**File**: `src/mcp/handlers/node-info-handlers.ts`
**Size**: ~450 lines
**Dependencies**: DatabaseAdapter, NodeRepository, SimpleCache

**Functions to extract from server.ts**:
- `getNodeInfo()` (lines 1343-1414)
- `getNodeEssentials()` (lines 2341-2476)
- `getNode()` (lines 2502-2545)
- `handleInfoMode()` (lines 2550-2636)
- `handleVersionMode()` (lines 2638-2673)
- `enrichPropertyWithTypeInfo()` (lines 2836-2863)
- `enrichPropertiesWithTypeInfo()` (lines 2868-2871)
- `searchNodeProperties()` (lines 2873-2925)
- `getPropertyDependencies()` (lines 3058-3110)
- `getNodeAsToolInfo()` (lines 3112-3179)

**Pattern**: Pass server state as parameters
```typescript
export async function getNodeEssentials(
  nodeType: string,
  includeExamples: boolean,
  repository: NodeRepository,
  db: DatabaseAdapter,
  cache: SimpleCache
): Promise<any> {
  // Implementation using imported NodeUtils functions
}
```

### Step 3: Create Validation Handlers

**File**: `src/mcp/handlers/validation-handlers.ts`
**Size**: ~400 lines
**Dependencies**: NodeRepository, EnhancedConfigValidator, WorkflowValidator

**Functions to extract from server.ts**:
- `validateNodeMinimal()` (lines 3373-3439)
- `validateNodeConfig()` (lines 2989-3056)
- `validateWorkflow()` (lines 3623-3747)
- `validateWorkflowConnections()` (lines 3748-3811)
- `validateWorkflowExpressions()` (lines 3813-3884)

**Imports needed**:
```typescript
import { NodeRepository } from '../../database/node-repository';
import { EnhancedConfigValidator, ValidationMode, ValidationProfile } from '../../services/enhanced-config-validator';
import { WorkflowValidator } from '../../services/workflow-validator';
import { NodeTypeNormalizer } from '../../utils/node-type-normalizer';
import { getWorkflowNodeType, getNodeTypeAlternatives } from '../../utils/node-utils';
```

### Step 4: Create Template Handlers

**File**: `src/mcp/handlers/template-handlers.ts`
**Size**: ~350 lines
**Dependencies**: DatabaseAdapter, TemplateService

**Functions to extract from server.ts**:
- `getToolsDocumentation()` (lines 3441-3448)
- `listTemplates()` (lines 3459-3471)
- `listNodeTemplates()` (lines 3473-3491)
- `getTemplate()` (lines 3493-3515)
- `searchTemplates()` (lines 3517-3536)
- `getTemplatesForTask()` (lines 3538-3560)
- `searchTemplatesByMetadata()` (lines 3562-3604)
- `getTaskDescription()` (lines 3606-3621)
- `listTasks()` (lines 2944-2987)

### Step 5: Create Tool Dispatcher

**File**: `src/mcp/handlers/tool-dispatcher.ts`
**Size**: ~200 lines
**Dependencies**: All handler modules

**Extract**: Main `executeTool()` switch/case (lines 1046-1282)

**Pattern**:
```typescript
import * as DiscoveryHandlers from './discovery-handlers';
import * as NodeInfoHandlers from './node-info-handlers';
import * as ValidationHandlers from './validation-handlers';
import * as TemplateHandlers from './template-handlers';
import * as n8nHandlers from './handlers-n8n-manager';
import { validateToolParams, getDisabledTools } from '../utils/validation-utils';

export async function dispatchToolCall(
  name: string,
  args: any,
  serverContext: ServerContext
): Promise<any> {
  // Ensure args is an object
  args = args || {};

  // Check disabled tools
  const disabledTools = getDisabledTools();
  if (disabledTools.has(name)) {
    throw new Error(`Tool '${name}' is disabled`);
  }

  // Main switch/case routing to handlers
  switch (name) {
    case 'search_nodes':
      validateToolParams(name, args, ['query']);
      return DiscoveryHandlers.searchNodes(
        args.query,
        args.limit || 20,
        args,
        serverContext.db,
        serverContext.repository
      );

    // ... all other cases
  }
}
```

### Step 6: Refactor Main Server.ts

**Keep in server.ts** (~400 lines):
- Imports
- Class definition and properties
- Constructor (use utility functions)
- `initializeDatabase()`
- `initializeInMemorySchema()`
- `parseSQLStatements()`
- `ensureInitialized()`
- `validateDatabaseHealth()`
- `setupHandlers()` - Modified to use dispatcher
- `connect()`
- `run()`
- `shutdown()`
- `close()`

**Modify setupHandlers()**:
```typescript
import { dispatchToolCall } from './handlers/tool-dispatcher';
import { getDisabledTools } from './utils/validation-utils';

private setupHandlers(): void {
  // ... Initialize, ListTools handlers remain same ...

  // Handle tool execution - delegate to dispatcher
  this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await dispatchToolCall(name, args, {
        db: this.db!,
        repository: this.repository!,
        cache: this.cache,
        templateService: this.templateService!,
        instanceContext: this.instanceContext
      });

      // Format response (keep existing MCP formatting logic)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      // Keep existing error handling
    }
  });
}
```

## Testing Strategy

After each file creation:

```bash
# 1. Build to check TypeScript errors
npm run build

# 2. Run type checking
npm run typecheck

# 3. Check for unused imports
npm run lint
```

After all files are created:

```bash
# 1. Full rebuild
npm run build

# 2. Test server starts
npm start

# 3. Test HTTP mode
npm run dev:http

# 4. Run unit tests
npm test
```

## Common Patterns

### 1. Server Context Type

Create in `types.ts`:
```typescript
export interface ServerContext {
  db: DatabaseAdapter;
  repository: NodeRepository;
  cache: SimpleCache;
  templateService: TemplateService;
  instanceContext?: InstanceContext;
}
```

### 2. Handler Function Signature

All handlers should follow this pattern:
```typescript
export async function handlerName(
  arg1: Type1,
  arg2: Type2,
  context: ServerContext
): Promise<ReturnType> {
  // Use context.db, context.repository, etc.
}
```

### 3. Replacing `this.` references

OLD:
```typescript
const node = this.repository.getNode(nodeType);
const cached = this.cache.get(key);
```

NEW:
```typescript
const node = repository.getNode(nodeType);
const cached = cache.get(key);
```

## File Size Verification

After completion, verify each file is under 500 lines:

```bash
wc -l src/mcp/server.ts
wc -l src/mcp/types.ts
wc -l src/mcp/utils/*.ts
wc -l src/mcp/handlers/*.ts
```

## Import Updates Required

After refactoring, update these files:
- `src/index.ts` - Verify N8NDocumentationMCPServer export still works
- `src/http-server.ts` - Verify import still works
- `src/http-server-single-session.ts` - Verify import still works

No changes should be needed since we're only exporting the class, not changing its public API.

## Rollback Plan

If issues occur:
1. Keep original `server.ts` as `server.ts.backup`
2. Test incrementally after each handler file
3. Use git to track changes and revert if needed

## Success Criteria

✅ All files under 500 lines
✅ `npm run build` succeeds with no errors
✅ `npm run typecheck` passes
✅ `npm start` starts server successfully
✅ MCP tools still respond correctly
✅ No breaking changes to public API

Conceived by Romuald Członkowski - https://www.aiadvisors.pl/en
