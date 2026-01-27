# Server.ts Refactoring Plan

## Current Status
- **File Size**: 3,934 lines (138KB)
- **Goal**: Split into modules with each file <500 lines
- **Constraint**: NO breaking changes - maintain all existing functionality

## Analysis Complete

### Core Sections Identified:

1. **Types & Interfaces** (lines 44-138)
   - NodeRow, VersionSummary, ToolVariantGuidance
   - NodeMinimalInfo, NodeStandardInfo, NodeFullInfo
   - VersionHistoryInfo, VersionComparisonInfo

2. **Main Server Class Setup** (lines 140-490)
   - Constructor, initialization
   - Database setup, health validation
   - setupHandlers method

3. **Handler Setup** (lines 491-794)
   - setRequestHandler for Initialize, ListTools, CallTool
   - Request routing and validation

4. **Validation Utilities** (lines 799-1045)
   - sanitizeValidationResult
   - validateToolParams, validateToolParamsBasic
   - validateExtractedArgs
   - getDisabledTools

5. **Tool Dispatcher** (lines 1046-1283)
   - executeTool (main switch/case)
   - Routes to all tool handlers

6. **Discovery Handlers** (lines 1284-2340)
   - listNodes, searchNodes (FTS/LIKE/Fuzzy)
   - calculateFuzzyScore, getEditDistance
   - calculateRelevance, rankSearchResults
   - listAITools, getNodeDocumentation
   - getDatabaseStatistics

7. **Node Info Handlers** (lines 2341-3111)
   - getNodeEssentials, getNode, getNodeInfo
   - handleInfoMode, handleVersionMode
   - getVersionSummary, getVersionHistory
   - compareVersions, getBreakingChanges, getMigrations
   - enrichPropertyWithTypeInfo
   - searchNodeProperties, getPropertyDependencies
   - getNodeAsToolInfo

8. **Node Utilities** (lines 3112-3372)
   - getOutputDescriptions
   - getCommonAIToolUseCases
   - buildToolVariantGuidance
   - getAIToolExamples

9. **Validation Handlers** (lines 3373-3884)
   - validateNodeMinimal
   - validateNodeConfig
   - validateWorkflow
   - validateWorkflowConnections
   - validateWorkflowExpressions

10. **Template Handlers** (lines 3441-3605)
    - getToolsDocumentation
    - listTemplates, listNodeTemplates
    - getTemplate, searchTemplates
    - getTemplatesForTask, searchTemplatesByMetadata
    - getTaskDescription, listTasks

11. **Server Control** (lines 3886-3935)
    - connect, run, shutdown

## Proposed Module Structure

```
src/mcp/
├── server.ts (400 lines) - Main class, setup, lifecycle
├── types.ts (100 lines) - DONE ✓
├── utils/
│   ├── search-utils.ts (300 lines) - DONE ✓
│   ├── node-utils.ts (250 lines) - Version, tool variant, outputs
│   └── validation-utils.ts (200 lines) - Sanitize, validate params
├── handlers/
│   ├── discovery-handlers.ts (450 lines) - Search, list, stats
│   ├── node-info-handlers.ts (450 lines) - Node info, essentials
│   ├── validation-handlers.ts (400 lines) - Node & workflow validation
│   ├── template-handlers.ts (350 lines) - Templates & tasks
│   └── tool-dispatcher.ts (200 lines) - executeTool switch
```

## Implementation Steps

1. ✓ Create types.ts with interfaces
2. ✓ Create utils/search-utils.ts
3. Create utils/node-utils.ts
4. Create utils/validation-utils.ts
5. Create handlers/discovery-handlers.ts
6. Create handlers/node-info-handlers.ts
7. Create handlers/validation-handlers.ts
8. Create handlers/template-handlers.ts
9. Create handlers/tool-dispatcher.ts
10. Update server.ts to import and use new modules
11. Update imports in index.ts, http-server.ts, http-server-single-session.ts
12. Run typecheck to verify no errors

## Files That Import server.ts (Must Update)

- src/index.ts (exports N8NDocumentationMCPServer)
- src/http-server.ts (imports N8NDocumentationMCPServer)
- src/http-server-single-session.ts (imports N8NDocumentationMCPServer)

## Critical Dependencies to Maintain

All handlers need access to:
- this.db (DatabaseAdapter)
- this.repository (NodeRepository)
- this.cache (SimpleCache)
- this.templateService (TemplateService)
- this.instanceContext (InstanceContext)

Strategy: Pass server instance to handler functions or use class methods.

## Testing Strategy

1. Run `npm run build` after each module creation
2. Run `npm run typecheck` to verify TypeScript
3. Verify server starts without errors
4. Test key MCP tools still work
