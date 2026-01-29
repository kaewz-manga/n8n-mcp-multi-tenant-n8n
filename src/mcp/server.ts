import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync, promises as fs } from 'fs';
import path from 'path';
import { n8nDocumentationToolsFinal } from './tools';
import { n8nManagementTools } from './tools-n8n-manager';
import { makeToolsN8nFriendly } from './tools-n8n-friendly';
import { logger } from '../utils/logger';
import { NodeRepository } from '../database/node-repository';
import { DatabaseAdapter, createDatabaseAdapter } from '../database/database-adapter';
import { EnhancedConfigValidator } from '../services/enhanced-config-validator';
import { SimpleCache } from '../utils/simple-cache';
import { TemplateService } from '../templates/template-service';
import { isN8nApiConfigured } from '../config/n8n-api';
import { PROJECT_VERSION } from '../utils/version';
import {
  negotiateProtocolVersion,
  logProtocolNegotiation,
} from '../utils/protocol-version';
import { InstanceContext } from '../types/instance-context';
import { telemetry } from '../telemetry';
import { EarlyErrorLogger } from '../telemetry/early-error-logger';
import { STARTUP_CHECKPOINTS } from '../telemetry/startup-checkpoints';
import { dispatchToolCall } from './handlers/tool-dispatcher';
import * as NodeInfoHandlers from './handlers/node-info-handlers';
import { validateExtractedArgs, sanitizeValidationResult, getDisabledTools } from './utils/validation-utils';
import { ToolValidation, Validator, ValidationError } from '../utils/validation-schemas';
import { WorkflowValidator } from '../services/workflow-validator';
import { getWorkflowExampleString } from './workflow-examples';

// Re-export type interfaces for backward compatibility
export interface NodeRow {
  node_type: string;
  package_name: string;
  display_name: string;
  description?: string;
  category?: string;
  development_style?: string;
  is_ai_tool: number;
  is_trigger: number;
  is_webhook: number;
  is_versioned: number;
  is_tool_variant: number;
  tool_variant_of?: string;
  has_tool_variant: number;
  version?: string;
  documentation?: string;
  properties_schema?: string;
  operations?: string;
  credentials_required?: string;
  // AI documentation fields
  ai_documentation_summary?: string;
  ai_summary_generated_at?: string;
}

interface VersionSummary {
  currentVersion: string;
  totalVersions: number;
  hasVersionHistory: boolean;
}

interface ToolVariantGuidance {
  isToolVariant: boolean;
  toolVariantOf?: string;
  hasToolVariant: boolean;
  toolVariantNodeType?: string;
  guidance?: string;
}

interface NodeMinimalInfo {
  nodeType: string;
  workflowNodeType: string;
  displayName: string;
  description: string;
  category: string;
  package: string;
  isAITool: boolean;
  isTrigger: boolean;
  isWebhook: boolean;
  toolVariantInfo?: ToolVariantGuidance;
}

interface NodeStandardInfo {
  nodeType: string;
  displayName: string;
  description: string;
  category: string;
  requiredProperties: any[];
  commonProperties: any[];
  operations?: any[];
  credentials?: any;
  examples?: any[];
  versionInfo: VersionSummary;
  toolVariantInfo?: ToolVariantGuidance;
}

interface NodeFullInfo {
  nodeType: string;
  displayName: string;
  description: string;
  category: string;
  properties: any[];
  operations?: any[];
  credentials?: any;
  documentation?: string;
  versionInfo: VersionSummary;
  toolVariantInfo?: ToolVariantGuidance;
}

interface VersionHistoryInfo {
  nodeType: string;
  versions: any[];
  latestVersion: string;
  hasBreakingChanges: boolean;
}

interface VersionComparisonInfo {
  nodeType: string;
  fromVersion: string;
  toVersion: string;
  changes: any[];
  breakingChanges?: any[];
  migrations?: any[];
}

type NodeInfoResponse = NodeMinimalInfo | NodeStandardInfo | NodeFullInfo | VersionHistoryInfo | VersionComparisonInfo;

export class N8NDocumentationMCPServer {
  private server: Server;
  private db: DatabaseAdapter | null = null;
  private repository: NodeRepository | null = null;
  private templateService: TemplateService | null = null;
  private initialized: Promise<void>;
  private cache = new SimpleCache();
  private clientInfo: any = null;
  private instanceContext?: InstanceContext;
  private previousTool: string | null = null;
  private previousToolTimestamp: number = Date.now();
  private earlyLogger: EarlyErrorLogger | null = null;

  constructor(instanceContext?: InstanceContext, earlyLogger?: EarlyErrorLogger) {
    this.instanceContext = instanceContext;
    this.earlyLogger = earlyLogger || null;
    // Check for test environment first
    const envDbPath = process.env.NODE_DB_PATH;
    let dbPath: string | null = null;
    
    let possiblePaths: string[] = [];
    
    if (envDbPath && (envDbPath === ':memory:' || existsSync(envDbPath))) {
      dbPath = envDbPath;
    } else {
      // Try multiple database paths
      possiblePaths = [
        path.join(process.cwd(), 'data', 'nodes.db'),
        path.join(__dirname, '../../data', 'nodes.db'),
        './data/nodes.db'
      ];
      
      for (const p of possiblePaths) {
        if (existsSync(p)) {
          dbPath = p;
          break;
        }
      }
    }
    
    if (!dbPath) {
      logger.error('Database not found in any of the expected locations:', possiblePaths);
      throw new Error('Database nodes.db not found. Please run npm run rebuild first.');
    }
    
    // Initialize database asynchronously
    this.initialized = this.initializeDatabase(dbPath).then(() => {
      // After database is ready, check n8n API configuration (v2.18.3)
      if (this.earlyLogger) {
        this.earlyLogger.logCheckpoint(STARTUP_CHECKPOINTS.N8N_API_CHECKING);
      }

      // Log n8n API configuration status at startup
      const apiConfigured = isN8nApiConfigured();
      const totalTools = apiConfigured ?
        n8nDocumentationToolsFinal.length + n8nManagementTools.length :
        n8nDocumentationToolsFinal.length;

      logger.info(`MCP server initialized with ${totalTools} tools (n8n API: ${apiConfigured ? 'configured' : 'not configured'})`);

      if (this.earlyLogger) {
        this.earlyLogger.logCheckpoint(STARTUP_CHECKPOINTS.N8N_API_READY);
      }
    });

    logger.info('Initializing n8n Documentation MCP server');
    
    this.server = new Server(
      {
        name: 'n8n-documentation-mcp',
        version: PROJECT_VERSION,
        icons: [
          {
            src: "https://www.n8n-mcp.com/logo.png",
            mimeType: "image/png",
            sizes: ["192x192"]
          },
          {
            src: "https://www.n8n-mcp.com/logo-128.png",
            mimeType: "image/png",
            sizes: ["128x128"]
          },
          {
            src: "https://www.n8n-mcp.com/logo-48.png",
            mimeType: "image/png",
            sizes: ["48x48"]
          }
        ],
        websiteUrl: "https://n8n-mcp.com"
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Close the server and release resources.
   * Should be called when the session is being removed.
   *
   * Order of cleanup:
   * 1. Close MCP server connection
   * 2. Destroy cache (clears entries AND stops cleanup timer)
   * 3. Close database connection
   * 4. Null out references to help GC
   */
  async close(): Promise<void> {
    try {
      await this.server.close();

      // Use destroy() not clear() - also stops the cleanup timer
      this.cache.destroy();

      // Close database connection before nullifying reference
      if (this.db) {
        try {
          this.db.close();
        } catch (dbError) {
          logger.warn('Error closing database', {
            error: dbError instanceof Error ? dbError.message : String(dbError)
          });
        }
      }

      // Null out references to help garbage collection
      this.db = null;
      this.repository = null;
      this.templateService = null;
      this.earlyLogger = null;
    } catch (error) {
      // Log but don't throw - cleanup should be best-effort
      logger.warn('Error closing MCP server', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async initializeDatabase(dbPath: string): Promise<void> {
    try {
      // Checkpoint: Database connecting (v2.18.3)
      if (this.earlyLogger) {
        this.earlyLogger.logCheckpoint(STARTUP_CHECKPOINTS.DATABASE_CONNECTING);
      }

      logger.debug('Database initialization starting...', { dbPath });

      this.db = await createDatabaseAdapter(dbPath);
      logger.debug('Database adapter created');

      // If using in-memory database for tests, initialize schema
      if (dbPath === ':memory:') {
        await this.initializeInMemorySchema();
        logger.debug('In-memory schema initialized');
      }

      this.repository = new NodeRepository(this.db);
      logger.debug('Node repository initialized');

      this.templateService = new TemplateService(this.db);
      logger.debug('Template service initialized');

      // Initialize similarity services for enhanced validation
      EnhancedConfigValidator.initializeSimilarityServices(this.repository);
      logger.debug('Similarity services initialized');

      // Checkpoint: Database connected (v2.18.3)
      if (this.earlyLogger) {
        this.earlyLogger.logCheckpoint(STARTUP_CHECKPOINTS.DATABASE_CONNECTED);
      }

      logger.info(`Database initialized successfully from: ${dbPath}`);
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw new Error(`Failed to open database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private async initializeInMemorySchema(): Promise<void> {
    if (!this.db) return;

    // Read and execute schema
    const schemaPath = path.join(__dirname, '../../src/database/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');

    // Parse SQL statements properly (handles BEGIN...END blocks in triggers)
    const statements = this.parseSQLStatements(schema);

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          this.db.exec(statement);
        } catch (error) {
          logger.error(`Failed to execute SQL statement: ${statement.substring(0, 100)}...`, error);
          throw error;
        }
      }
    }
  }

  /**
   * Parse SQL statements from schema file, properly handling multi-line statements
   * including triggers with BEGIN...END blocks
   */
  private parseSQLStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inBlock = false;

    const lines = sql.split('\n');

    for (const line of lines) {
      const trimmed = line.trim().toUpperCase();

      // Skip comments and empty lines
      if (trimmed.startsWith('--') || trimmed === '') {
        continue;
      }

      // Track BEGIN...END blocks (triggers, procedures)
      if (trimmed.includes('BEGIN')) {
        inBlock = true;
      }

      current += line + '\n';

      // End of block (trigger/procedure)
      if (inBlock && trimmed === 'END;') {
        statements.push(current.trim());
        current = '';
        inBlock = false;
        continue;
      }

      // Regular statement end (not in block)
      if (!inBlock && trimmed.endsWith(';')) {
        statements.push(current.trim());
        current = '';
      }
    }

    // Add any remaining content
    if (current.trim()) {
      statements.push(current.trim());
    }

    return statements.filter(s => s.length > 0);
  }
  
  private async ensureInitialized(): Promise<void> {
    await this.initialized;
    if (!this.db || !this.repository) {
      throw new Error('Database not initialized');
    }

    // Validate database health on first access
    if (!this.dbHealthChecked) {
      await this.validateDatabaseHealth();
      this.dbHealthChecked = true;
    }
  }

  private dbHealthChecked: boolean = false;

  private async validateDatabaseHealth(): Promise<void> {
    if (!this.db) return;

    try {
      // Check if nodes table has data
      const nodeCount = this.db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };

      if (nodeCount.count === 0) {
        logger.error('CRITICAL: Database is empty - no nodes found! Please run: npm run rebuild');
        throw new Error('Database is empty. Run "npm run rebuild" to populate node data.');
      }

      // Check if FTS5 table exists (wrap in try-catch for sql.js compatibility)
      try {
        const ftsExists = this.db.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='nodes_fts'
        `).get();

        if (!ftsExists) {
          logger.warn('FTS5 table missing - search performance will be degraded. Please run: npm run rebuild');
        } else {
          const ftsCount = this.db.prepare('SELECT COUNT(*) as count FROM nodes_fts').get() as { count: number };
          if (ftsCount.count === 0) {
            logger.warn('FTS5 index is empty - search will not work properly. Please run: npm run rebuild');
          }
        }
      } catch (ftsError) {
        // FTS5 not supported (e.g., sql.js fallback) - this is OK, just warn
        logger.warn('FTS5 not available - using fallback search. For better performance, ensure better-sqlite3 is properly installed.');
      }

      logger.info(`Database health check passed: ${nodeCount.count} nodes loaded`);
    } catch (error) {
      logger.error('Database health check failed:', error);
      throw error;
    }
  }

  /**
   * Parse and cache disabled tools from DISABLED_TOOLS environment variable.
   * Returns a Set of tool names that should be filtered from registration.
   *
   * Cached after first call since environment variables don't change at runtime.
   * Includes safety limits: max 10KB env var length, max 200 tools.
   *
   * @returns Set of disabled tool names
   */
  private setupHandlers(): void {
    // Handle initialization
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      const clientVersion = request.params.protocolVersion;
      const clientCapabilities = request.params.capabilities;
      const clientInfo = request.params.clientInfo;
      
      logger.info('MCP Initialize request received', {
        clientVersion,
        clientCapabilities,
        clientInfo
      });

      // Track session start
      telemetry.trackSessionStart();

      // Store client info for later use
      this.clientInfo = clientInfo;
      
      // Negotiate protocol version based on client information
      const negotiationResult = negotiateProtocolVersion(
        clientVersion,
        clientInfo,
        undefined, // no user agent in MCP protocol
        undefined  // no headers in MCP protocol
      );
      
      logProtocolNegotiation(negotiationResult, logger, 'MCP_INITIALIZE');
      
      // Warn if there's a version mismatch (for debugging)
      if (clientVersion && clientVersion !== negotiationResult.version) {
        logger.warn(`Protocol version negotiated: client requested ${clientVersion}, server will use ${negotiationResult.version}`, {
          reasoning: negotiationResult.reasoning
        });
      }
      
      const response = {
        protocolVersion: negotiationResult.version,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'n8n-documentation-mcp',
          version: PROJECT_VERSION,
        },
      };
      
      logger.info('MCP Initialize response', { response });
      return response;
    });

    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      // Get disabled tools from environment variable
      const disabledTools = getDisabledTools();

      // Filter documentation tools based on disabled list
      const enabledDocTools = n8nDocumentationToolsFinal.filter(
        tool => !disabledTools.has(tool.name)
      );

      // Combine documentation tools with management tools if API is configured
      let tools = [...enabledDocTools];

      // Check if n8n API tools should be available
      // 1. Environment variables (backward compatibility)
      // 2. Instance context (multi-tenant support)
      // 3. Multi-tenant mode enabled (always show tools, runtime checks will handle auth)
      const hasEnvConfig = isN8nApiConfigured();
      const hasInstanceConfig = !!(this.instanceContext?.n8nApiUrl && this.instanceContext?.n8nApiKey);
      const isMultiTenantEnabled = process.env.ENABLE_MULTI_TENANT === 'true';

      const shouldIncludeManagementTools = hasEnvConfig || hasInstanceConfig || isMultiTenantEnabled;

      if (shouldIncludeManagementTools) {
        // Filter management tools based on disabled list
        const enabledMgmtTools = n8nManagementTools.filter(
          tool => !disabledTools.has(tool.name)
        );
        tools.push(...enabledMgmtTools);
        logger.debug(`Tool listing: ${tools.length} tools available (${enabledDocTools.length} documentation + ${enabledMgmtTools.length} management)`, {
          hasEnvConfig,
          hasInstanceConfig,
          isMultiTenantEnabled,
          disabledToolsCount: disabledTools.size
        });
      } else {
        logger.debug(`Tool listing: ${tools.length} tools available (documentation only)`, {
          hasEnvConfig,
          hasInstanceConfig,
          isMultiTenantEnabled,
          disabledToolsCount: disabledTools.size
        });
      }

      // Log filtered tools count if any tools are disabled
      if (disabledTools.size > 0) {
        const totalAvailableTools = n8nDocumentationToolsFinal.length + (shouldIncludeManagementTools ? n8nManagementTools.length : 0);
        logger.debug(`Filtered ${disabledTools.size} disabled tools, ${tools.length}/${totalAvailableTools} tools available`);
      }
      
      // Check if client is n8n (from initialization)
      const clientInfo = this.clientInfo;
      const isN8nClient = clientInfo?.name?.includes('n8n') || 
                         clientInfo?.name?.includes('langchain');
      
      if (isN8nClient) {
        logger.info('Detected n8n client, using n8n-friendly tool descriptions');
        tools = makeToolsN8nFriendly(tools);
      }
      
      // Log validation tools' input schemas for debugging
      const validationTools = tools.filter(t => t.name.startsWith('validate_'));
      validationTools.forEach(tool => {
        logger.info('Validation tool schema', {
          toolName: tool.name,
          inputSchema: JSON.stringify(tool.inputSchema, null, 2),
          hasOutputSchema: !!tool.outputSchema,
          description: tool.description
        });
      });
      
      return { tools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Enhanced logging for debugging tool calls
      logger.info('Tool call received - DETAILED DEBUG', {
        toolName: name,
        arguments: JSON.stringify(args, null, 2),
        argumentsType: typeof args,
        argumentsKeys: args ? Object.keys(args) : [],
        hasNodeType: args && 'nodeType' in args,
        hasConfig: args && 'config' in args,
        configType: args && args.config ? typeof args.config : 'N/A',
        rawRequest: JSON.stringify(request.params)
      });

      // Check if tool is disabled via DISABLED_TOOLS environment variable
      const disabledTools = getDisabledTools();
      if (disabledTools.has(name)) {
        logger.warn(`Attempted to call disabled tool: ${name}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'TOOL_DISABLED',
              message: `Tool '${name}' is not available in this deployment. It has been disabled via DISABLED_TOOLS environment variable.`,
              tool: name
            }, null, 2)
          }]
        };
      }

      // Workaround for n8n's nested output bug
      // Check if args contains nested 'output' structure from n8n's memory corruption
      let processedArgs = args;
      if (args && typeof args === 'object' && 'output' in args) {
        try {
          const possibleNestedData = args.output;
          // If output is a string that looks like JSON, try to parse it
          if (typeof possibleNestedData === 'string' && possibleNestedData.trim().startsWith('{')) {
            const parsed = JSON.parse(possibleNestedData);
            if (parsed && typeof parsed === 'object') {
              logger.warn('Detected n8n nested output bug, attempting to extract actual arguments', {
                originalArgs: args,
                extractedArgs: parsed
              });
              
              // Validate the extracted arguments match expected tool schema
              if (validateExtractedArgs(name, parsed)) {
                // Use the extracted data as args
                processedArgs = parsed;
              } else {
                logger.warn('Extracted arguments failed validation, using original args', {
                  toolName: name,
                  extractedArgs: parsed
                });
              }
            }
          }
        } catch (parseError) {
          logger.debug('Failed to parse nested output, continuing with original args', { 
            error: parseError instanceof Error ? parseError.message : String(parseError) 
          });
        }
      }
      
      try {
        logger.debug(`Executing tool: ${name}`, { args: processedArgs });
        const startTime = Date.now();
        const result = await this.executeTool(name, processedArgs);
        const duration = Date.now() - startTime;
        logger.debug(`Tool ${name} executed successfully`);

        // Track tool usage and sequence
        telemetry.trackToolUsage(name, true, duration);

        // Track tool sequence if there was a previous tool
        if (this.previousTool) {
          const timeDelta = Date.now() - this.previousToolTimestamp;
          telemetry.trackToolSequence(this.previousTool, name, timeDelta);
        }

        // Update previous tool tracking
        this.previousTool = name;
        this.previousToolTimestamp = Date.now();
        
        // Ensure the result is properly formatted for MCP
        let responseText: string;
        let structuredContent: any = null;
        
        try {
          // For validation tools, check if we should use structured content
          if (name.startsWith('validate_') && typeof result === 'object' && result !== null) {
            // Clean up the result to ensure it matches the outputSchema
            const cleanResult = sanitizeValidationResult(result, name);
            structuredContent = cleanResult;
            responseText = JSON.stringify(cleanResult, null, 2);
          } else {
            responseText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          }
        } catch (jsonError) {
          logger.warn(`Failed to stringify tool result for ${name}:`, jsonError);
          responseText = String(result);
        }
        
        // Validate response size (n8n might have limits)
        if (responseText.length > 1000000) { // 1MB limit
          logger.warn(`Tool ${name} response is very large (${responseText.length} chars), truncating`);
          responseText = responseText.substring(0, 999000) + '\n\n[Response truncated due to size limits]';
          structuredContent = null; // Don't use structured content for truncated responses
        }
        
        // Build MCP response with strict schema compliance
        const mcpResponse: any = {
          content: [
            {
              type: 'text' as const,
              text: responseText,
            },
          ],
        };
        
        // For tools with outputSchema, structuredContent is REQUIRED by MCP spec
        if (name.startsWith('validate_') && structuredContent !== null) {
          mcpResponse.structuredContent = structuredContent;
        }
        
        return mcpResponse;
      } catch (error) {
        logger.error(`Error executing tool ${name}`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Track tool error
        telemetry.trackToolUsage(name, false);
        telemetry.trackError(
          error instanceof Error ? error.constructor.name : 'UnknownError',
          `tool_execution`,
          name,
          errorMessage
        );

        // Track tool sequence even for errors
        if (this.previousTool) {
          const timeDelta = Date.now() - this.previousToolTimestamp;
          telemetry.trackToolSequence(this.previousTool, name, timeDelta);
        }

        // Update previous tool tracking (even for failed tools)
        this.previousTool = name;
        this.previousToolTimestamp = Date.now();

        // Provide more helpful error messages for common n8n issues
        let helpfulMessage = `Error executing tool ${name}: ${errorMessage}`;
        
        if (errorMessage.includes('required') || errorMessage.includes('missing')) {
          helpfulMessage += '\n\nNote: This error often occurs when the AI agent sends incomplete or incorrectly formatted parameters. Please ensure all required fields are provided with the correct types.';
        } else if (errorMessage.includes('type') || errorMessage.includes('expected')) {
          helpfulMessage += '\n\nNote: This error indicates a type mismatch. The AI agent may be sending data in the wrong format (e.g., string instead of object).';
        } else if (errorMessage.includes('Unknown category') || errorMessage.includes('not found')) {
          helpfulMessage += '\n\nNote: The requested resource or category was not found. Please check the available options.';
        }
        
        // For n8n schema errors, add specific guidance
        if (name.startsWith('validate_') && (errorMessage.includes('config') || errorMessage.includes('nodeType'))) {
          helpfulMessage += '\n\nFor validation tools:\n- nodeType should be a string (e.g., "nodes-base.webhook")\n- config should be an object (e.g., {})';
        }
        
        return {
          content: [
            {
              type: 'text',
              text: helpfulMessage,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Sanitize validation result to match outputSchema
   */
  private sanitizeValidationResult(result: any, toolName: string): any {
    if (!result || typeof result !== 'object') {
      return result;
    }

    const sanitized = { ...result };

    // Ensure required fields exist with proper types and filter to schema-defined fields only
    if (toolName === 'validate_node_minimal') {
      // Filter to only schema-defined fields
      const filtered = {
        nodeType: String(sanitized.nodeType || ''),
        displayName: String(sanitized.displayName || ''),
        valid: Boolean(sanitized.valid),
        missingRequiredFields: Array.isArray(sanitized.missingRequiredFields) 
          ? sanitized.missingRequiredFields.map(String) 
          : []
      };
      return filtered;
    } else if (toolName === 'validate_node_operation') {
      // Ensure summary exists
      let summary = sanitized.summary;
      if (!summary || typeof summary !== 'object') {
        summary = {
          hasErrors: Array.isArray(sanitized.errors) ? sanitized.errors.length > 0 : false,
          errorCount: Array.isArray(sanitized.errors) ? sanitized.errors.length : 0,
          warningCount: Array.isArray(sanitized.warnings) ? sanitized.warnings.length : 0,
          suggestionCount: Array.isArray(sanitized.suggestions) ? sanitized.suggestions.length : 0
        };
      }
      
      // Filter to only schema-defined fields
      const filtered = {
        nodeType: String(sanitized.nodeType || ''),
        workflowNodeType: String(sanitized.workflowNodeType || sanitized.nodeType || ''),
        displayName: String(sanitized.displayName || ''),
        valid: Boolean(sanitized.valid),
        errors: Array.isArray(sanitized.errors) ? sanitized.errors : [],
        warnings: Array.isArray(sanitized.warnings) ? sanitized.warnings : [],
        suggestions: Array.isArray(sanitized.suggestions) ? sanitized.suggestions : [],
        summary: summary
      };
      return filtered;
    } else if (toolName.startsWith('validate_workflow')) {
      sanitized.valid = Boolean(sanitized.valid);
      
      // Ensure arrays exist
      sanitized.errors = Array.isArray(sanitized.errors) ? sanitized.errors : [];
      sanitized.warnings = Array.isArray(sanitized.warnings) ? sanitized.warnings : [];
      
      // Ensure statistics/summary exists
      if (toolName === 'validate_workflow') {
        if (!sanitized.summary || typeof sanitized.summary !== 'object') {
          sanitized.summary = {
            totalNodes: 0,
            enabledNodes: 0,
            triggerNodes: 0,
            validConnections: 0,
            invalidConnections: 0,
            expressionsValidated: 0,
            errorCount: sanitized.errors.length,
            warningCount: sanitized.warnings.length
          };
        }
      } else {
        if (!sanitized.statistics || typeof sanitized.statistics !== 'object') {
          sanitized.statistics = {
            totalNodes: 0,
            triggerNodes: 0,
            validConnections: 0,
            invalidConnections: 0,
            expressionsValidated: 0
          };
        }
      }
    }

    // Remove undefined values to ensure clean JSON
    return JSON.parse(JSON.stringify(sanitized));
  }

  /**
   * Enhanced parameter validation using schemas
   */
  private validateToolParams(toolName: string, args: any, legacyRequiredParams?: string[]): void {
    try {
      // If legacy required params are provided, use the new validation but fall back to basic if needed
      let validationResult;
      
      switch (toolName) {
        case 'validate_node':
          // Consolidated tool handles both modes - validate as operation for now
          validationResult = ToolValidation.validateNodeOperation(args);
          break;
        case 'validate_workflow':
          validationResult = ToolValidation.validateWorkflow(args);
          break;
      case 'search_nodes':
        validationResult = ToolValidation.validateSearchNodes(args);
        break;
      case 'n8n_create_workflow':
        validationResult = ToolValidation.validateCreateWorkflow(args);
        break;
      case 'n8n_get_workflow':
      case 'n8n_update_full_workflow':
      case 'n8n_delete_workflow':
      case 'n8n_validate_workflow':
      case 'n8n_autofix_workflow':
        validationResult = ToolValidation.validateWorkflowId(args);
        break;
      case 'n8n_executions':
        // Requires action parameter, id validation done in handler based on action
        validationResult = args.action
          ? { valid: true, errors: [] }
          : { valid: false, errors: [{ field: 'action', message: 'action is required' }] };
        break;
      case 'n8n_deploy_template':
        // Requires templateId parameter
        validationResult = args.templateId !== undefined
          ? { valid: true, errors: [] }
          : { valid: false, errors: [{ field: 'templateId', message: 'templateId is required' }] };
        break;
      default:
        // For tools not yet migrated to schema validation, use basic validation
        return this.validateToolParamsBasic(toolName, args, legacyRequiredParams || []);
      }
      
      if (!validationResult.valid) {
        const errorMessage = Validator.formatErrors(validationResult, toolName);
        logger.error(`Parameter validation failed for ${toolName}:`, errorMessage);
        throw new ValidationError(errorMessage);
      }
    } catch (error) {
      // Handle validation errors properly
      if (error instanceof ValidationError) {
        throw error; // Re-throw validation errors as-is
      }
      
      // Handle unexpected errors from validation system
      logger.error(`Validation system error for ${toolName}:`, error);
      
      // Provide a user-friendly error message
      const errorMessage = error instanceof Error 
        ? `Internal validation error: ${error.message}`
        : `Internal validation error while processing ${toolName}`;
      
      throw new Error(errorMessage);
    }
  }
  
  /**
   * Legacy parameter validation (fallback)
   */
  private validateToolParamsBasic(toolName: string, args: any, requiredParams: string[]): void {
    const missing: string[] = [];
    const invalid: string[] = [];

    for (const param of requiredParams) {
      if (!(param in args) || args[param] === undefined || args[param] === null) {
        missing.push(param);
      } else if (typeof args[param] === 'string' && args[param].trim() === '') {
        invalid.push(`${param} (empty string)`);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required parameters for ${toolName}: ${missing.join(', ')}. Please provide the required parameters to use this tool.`);
    }

    if (invalid.length > 0) {
      throw new Error(`Invalid parameters for ${toolName}: ${invalid.join(', ')}. String parameters cannot be empty.`);
    }
  }

  /**
   * Validate extracted arguments match expected tool schema
   */
  private validateExtractedArgs(toolName: string, args: any): boolean {
    if (!args || typeof args !== 'object') {
      return false;
    }

    // Get all available tools
    const allTools = [...n8nDocumentationToolsFinal, ...n8nManagementTools];
    const tool = allTools.find(t => t.name === toolName);
    if (!tool || !tool.inputSchema) {
      return true; // If no schema, assume valid
    }

    const schema = tool.inputSchema;
    const required = schema.required || [];
    const properties = schema.properties || {};

    // Check all required fields are present
    for (const requiredField of required) {
      if (!(requiredField in args)) {
        logger.debug(`Extracted args missing required field: ${requiredField}`, {
          toolName,
          extractedArgs: args,
          required
        });
        return false;
      }
    }

    // Check field types match schema
    for (const [fieldName, fieldValue] of Object.entries(args)) {
      if (properties[fieldName]) {
        const expectedType = properties[fieldName].type;
        const actualType = Array.isArray(fieldValue) ? 'array' : typeof fieldValue;

        // Basic type validation
        if (expectedType && expectedType !== actualType) {
          // Special case: number can be coerced from string
          if (expectedType === 'number' && actualType === 'string' && !isNaN(Number(fieldValue))) {
            continue;
          }
          
          logger.debug(`Extracted args field type mismatch: ${fieldName}`, {
            toolName,
            expectedType,
            actualType,
            fieldValue
          });
          return false;
        }
      }
    }

    // Check for extraneous fields if additionalProperties is false
    if (schema.additionalProperties === false) {
      const allowedFields = Object.keys(properties);
      const extraFields = Object.keys(args).filter(field => !allowedFields.includes(field));
      
      if (extraFields.length > 0) {
        logger.debug(`Extracted args have extra fields`, {
          toolName,
          extraFields,
          allowedFields
        });
        // For n8n compatibility, we'll still consider this valid but log it
      }
    }

    return true;
  }

  async executeTool(name: string, args: any): Promise<any> {
    await this.ensureInitialized();

    // Delegate to the tool dispatcher
    return dispatchToolCall(name, args, {
      db: this.db!,
      repository: this.repository!,
      cache: this.cache,
      templateService: this.templateService!,
      instanceContext: this.instanceContext
    });
  }

  // Wrapper methods for backward compatibility with tests
  async getNode(
    nodeType: string,
    detail: string = 'standard',
    mode: string = 'info',
    includeTypeInfo: boolean = false,
    includeExamples: boolean = false,
    fromVersion?: string,
    toVersion?: string
  ): Promise<any> {
    await this.ensureInitialized();

    // Validate parameters
    const validDetailLevels = ['minimal', 'standard', 'full'];
    const validModes = ['info', 'versions', 'compare', 'breaking', 'migrations'];

    if (!validDetailLevels.includes(detail)) {
      throw new Error(`get_node: Invalid detail level "${detail}". Valid options: ${validDetailLevels.join(', ')}`);
    }

    if (!validModes.includes(mode)) {
      throw new Error(`get_node: Invalid mode "${mode}". Valid options: ${validModes.join(', ')}`);
    }

    // Route to appropriate mode handler
    if (mode === 'info') {
      return this.handleInfoMode(nodeType, detail, includeTypeInfo, includeExamples);
    } else {
      return this.handleVersionMode(nodeType, mode, fromVersion, toVersion);
    }
  }

  enrichPropertyWithTypeInfo(property: any): any {
    return NodeInfoHandlers.enrichPropertyWithTypeInfo(property);
  }

  enrichPropertiesWithTypeInfo(properties: any[]): any[] {
    return NodeInfoHandlers.enrichPropertiesWithTypeInfo(properties);
  }

  getVersionSummary(nodeType: string): any {
    return NodeInfoHandlers.getVersionSummary(nodeType, this.repository!, this.cache);
  }

  async handleInfoMode(
    nodeType: string,
    detail: string,
    includeTypeInfo: boolean,
    includeExamples: boolean
  ): Promise<any> {
    await this.ensureInitialized();
    return NodeInfoHandlers.handleInfoMode(
      nodeType,
      detail,
      includeTypeInfo,
      includeExamples,
      this.repository!,
      this.db!,
      this.cache
    );
  }

  async handleVersionMode(
    nodeType: string,
    mode: string,
    fromVersion: string | undefined,
    toVersion: string | undefined
  ): Promise<any> {
    await this.ensureInitialized();
    return NodeInfoHandlers.handleVersionMode(
      nodeType,
      mode,
      fromVersion,
      toVersion,
      this.repository!,
      this.cache
    );
  }

  // Add connect method to accept any transport
  async connect(transport: any): Promise<void> {
    await this.ensureInitialized();
    await this.server.connect(transport);
    logger.info('MCP Server connected', { 
      transportType: transport.constructor.name 
    });
  }
  
  // Template-related methods
  private async listTemplates(limit: number = 10, offset: number = 0, sortBy: 'views' | 'created_at' | 'name' = 'views', includeMetadata: boolean = false): Promise<any> {
    await this.ensureInitialized();
    if (!this.templateService) throw new Error('Template service not initialized');
    
    const result = await this.templateService.listTemplates(limit, offset, sortBy, includeMetadata);
    
    return {
      ...result,
      tip: result.items.length > 0 ? 
        `Use get_template(templateId) to get full workflow details. Total: ${result.total} templates available.` :
        "No templates found. Run 'npm run fetch:templates' to update template database"
    };
  }
  
  private async listNodeTemplates(nodeTypes: string[], limit: number = 10, offset: number = 0): Promise<any> {
    await this.ensureInitialized();
    if (!this.templateService) throw new Error('Template service not initialized');
    
    const result = await this.templateService.listNodeTemplates(nodeTypes, limit, offset);
    
    if (result.items.length === 0 && offset === 0) {
      return {
        ...result,
        message: `No templates found using nodes: ${nodeTypes.join(', ')}`,
        tip: "Try searching with more common nodes or run 'npm run fetch:templates' to update template database"
      };
    }
    
    return {
      ...result,
      tip: `Showing ${result.items.length} of ${result.total} templates. Use offset for pagination.`
    };
  }
  
  private async getTemplate(templateId: number, mode: 'nodes_only' | 'structure' | 'full' = 'full'): Promise<any> {
    await this.ensureInitialized();
    if (!this.templateService) throw new Error('Template service not initialized');
    
    const template = await this.templateService.getTemplate(templateId, mode);
    
    if (!template) {
      return {
        error: `Template ${templateId} not found`,
        tip: "Use list_templates, list_node_templates or search_templates to find available templates"
      };
    }
    
    const usage = mode === 'nodes_only' ? "Node list for quick overview" :
                  mode === 'structure' ? "Workflow structure without full details" :
                  "Complete workflow JSON ready to import into n8n";
    
    return {
      mode,
      template,
      usage
    };
  }
  
  private async searchTemplates(query: string, limit: number = 20, offset: number = 0, fields?: string[]): Promise<any> {
    await this.ensureInitialized();
    if (!this.templateService) throw new Error('Template service not initialized');
    
    const result = await this.templateService.searchTemplates(query, limit, offset, fields);
    
    if (result.items.length === 0 && offset === 0) {
      return {
        ...result,
        message: `No templates found matching: "${query}"`,
        tip: "Try different keywords or run 'npm run fetch:templates' to update template database"
      };
    }
    
    return {
      ...result,
      query,
      tip: `Found ${result.total} templates matching "${query}". Showing ${result.items.length}.`
    };
  }
  
  private async getTemplatesForTask(task: string, limit: number = 10, offset: number = 0): Promise<any> {
    await this.ensureInitialized();
    if (!this.templateService) throw new Error('Template service not initialized');
    
    const result = await this.templateService.getTemplatesForTask(task, limit, offset);
    const availableTasks = this.templateService.listAvailableTasks();
    
    if (result.items.length === 0 && offset === 0) {
      return {
        ...result,
        message: `No templates found for task: ${task}`,
        availableTasks,
        tip: "Try a different task or use search_templates for custom searches"
      };
    }
    
    return {
      ...result,
      task,
      description: this.getTaskDescription(task),
      tip: `${result.total} templates available for ${task}. Showing ${result.items.length}.`
    };
  }
  
  private async searchTemplatesByMetadata(filters: {
    category?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    maxSetupMinutes?: number;
    minSetupMinutes?: number;
    requiredService?: string;
    targetAudience?: string;
  }, limit: number = 20, offset: number = 0): Promise<any> {
    await this.ensureInitialized();
    if (!this.templateService) throw new Error('Template service not initialized');
    
    const result = await this.templateService.searchTemplatesByMetadata(filters, limit, offset);
    
    // Build filter summary for feedback
    const filterSummary: string[] = [];
    if (filters.category) filterSummary.push(`category: ${filters.category}`);
    if (filters.complexity) filterSummary.push(`complexity: ${filters.complexity}`);
    if (filters.maxSetupMinutes) filterSummary.push(`max setup: ${filters.maxSetupMinutes} min`);
    if (filters.minSetupMinutes) filterSummary.push(`min setup: ${filters.minSetupMinutes} min`);
    if (filters.requiredService) filterSummary.push(`service: ${filters.requiredService}`);
    if (filters.targetAudience) filterSummary.push(`audience: ${filters.targetAudience}`);
    
    if (result.items.length === 0 && offset === 0) {
      // Get available categories and audiences for suggestions
      const availableCategories = await this.templateService.getAvailableCategories();
      const availableAudiences = await this.templateService.getAvailableTargetAudiences();
      
      return {
        ...result,
        message: `No templates found with filters: ${filterSummary.join(', ')}`,
        availableCategories: availableCategories.slice(0, 10),
        availableAudiences: availableAudiences.slice(0, 5),
        tip: "Try broader filters or different categories. Use list_templates to see all templates."
      };
    }
    
    return {
      ...result,
      filters,
      filterSummary: filterSummary.join(', '),
      tip: `Found ${result.total} templates matching filters. Showing ${result.items.length}. Each includes AI-generated metadata.`
    };
  }
  
  private getTaskDescription(task: string): string {
    const descriptions: Record<string, string> = {
      'ai_automation': 'AI-powered workflows using OpenAI, LangChain, and other AI tools',
      'data_sync': 'Synchronize data between databases, spreadsheets, and APIs',
      'webhook_processing': 'Process incoming webhooks and trigger automated actions',
      'email_automation': 'Send, receive, and process emails automatically',
      'slack_integration': 'Integrate with Slack for notifications and bot interactions',
      'data_transformation': 'Transform, clean, and manipulate data',
      'file_processing': 'Handle file uploads, downloads, and transformations',
      'scheduling': 'Schedule recurring tasks and time-based automations',
      'api_integration': 'Connect to external APIs and web services',
      'database_operations': 'Query, insert, update, and manage database records'
    };
    
    return descriptions[task] || 'Workflow templates for this task';
  }

  private async validateWorkflow(workflow: any, options?: any): Promise<any> {
    await this.ensureInitialized();
    if (!this.repository) throw new Error('Repository not initialized');
    
    // Enhanced logging for workflow validation
    logger.info('Workflow validation requested', {
      hasWorkflow: !!workflow,
      workflowType: typeof workflow,
      hasNodes: workflow?.nodes !== undefined,
      nodesType: workflow?.nodes ? typeof workflow.nodes : 'undefined',
      nodesIsArray: Array.isArray(workflow?.nodes),
      nodesCount: Array.isArray(workflow?.nodes) ? workflow.nodes.length : 0,
      hasConnections: workflow?.connections !== undefined,
      connectionsType: workflow?.connections ? typeof workflow.connections : 'undefined',
      options: options
    });
    
    // Help n8n AI agents with common mistakes
    if (!workflow || typeof workflow !== 'object') {
      return {
        valid: false,
        errors: [{
          node: 'workflow',
          message: 'Workflow must be an object with nodes and connections',
          details: 'Expected format: ' + getWorkflowExampleString()
        }],
        summary: { errorCount: 1 }
      };
    }
    
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      return {
        valid: false,
        errors: [{
          node: 'workflow',
          message: 'Workflow must have a nodes array',
          details: 'Expected: workflow.nodes = [array of node objects]. ' + getWorkflowExampleString()
        }],
        summary: { errorCount: 1 }
      };
    }
    
    if (!workflow.connections || typeof workflow.connections !== 'object') {
      return {
        valid: false,
        errors: [{
          node: 'workflow',
          message: 'Workflow must have a connections object',
          details: 'Expected: workflow.connections = {} (can be empty object). ' + getWorkflowExampleString()
        }],
        summary: { errorCount: 1 }
      };
    }
    
    // Create workflow validator instance
    const validator = new WorkflowValidator(
      this.repository,
      EnhancedConfigValidator
    );
    
    try {
      const result = await validator.validateWorkflow(workflow, options);
      
      // Format the response for better readability
      const response: any = {
        valid: result.valid,
        summary: {
          totalNodes: result.statistics.totalNodes,
          enabledNodes: result.statistics.enabledNodes,
          triggerNodes: result.statistics.triggerNodes,
          validConnections: result.statistics.validConnections,
          invalidConnections: result.statistics.invalidConnections,
          expressionsValidated: result.statistics.expressionsValidated,
          errorCount: result.errors.length,
          warningCount: result.warnings.length
        },
        // Always include errors and warnings arrays for consistent API response
        errors: result.errors.map(e => ({
          node: e.nodeName || 'workflow',
          message: e.message,
          details: e.details
        })),
        warnings: result.warnings.map(w => ({
          node: w.nodeName || 'workflow',
          message: w.message,
          details: w.details
        }))
      };
      
      if (result.suggestions.length > 0) {
        response.suggestions = result.suggestions;
      }

      // Track validation details in telemetry
      if (!result.valid && result.errors.length > 0) {
        // Track each validation error for analysis
        result.errors.forEach(error => {
          telemetry.trackValidationDetails(
            error.nodeName || 'workflow',
            error.type || 'validation_error',
            {
              message: error.message,
              nodeCount: workflow.nodes?.length ?? 0,
              hasConnections: Object.keys(workflow.connections || {}).length > 0
            }
          );
        });
      }

      // Track successfully validated workflows in telemetry
      if (result.valid) {
        telemetry.trackWorkflowCreation(workflow, true);
      }

      return response;
    } catch (error) {
      logger.error('Error validating workflow:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error validating workflow',
        tip: 'Ensure the workflow JSON includes nodes array and connections object'
      };
    }
  }

  private async validateWorkflowConnections(workflow: any): Promise<any> {
    await this.ensureInitialized();
    if (!this.repository) throw new Error('Repository not initialized');
    
    // Create workflow validator instance
    const validator = new WorkflowValidator(
      this.repository,
      EnhancedConfigValidator
    );
    
    try {
      // Validate only connections
      const result = await validator.validateWorkflow(workflow, {
        validateNodes: false,
        validateConnections: true,
        validateExpressions: false
      });
      
      const response: any = {
        valid: result.errors.length === 0,
        statistics: {
          totalNodes: result.statistics.totalNodes,
          triggerNodes: result.statistics.triggerNodes,
          validConnections: result.statistics.validConnections,
          invalidConnections: result.statistics.invalidConnections
        }
      };
      
      // Filter to only connection-related issues
      const connectionErrors = result.errors.filter(e => 
        e.message.includes('connection') || 
        e.message.includes('cycle') ||
        e.message.includes('orphaned')
      );
      
      const connectionWarnings = result.warnings.filter(w => 
        w.message.includes('connection') || 
        w.message.includes('orphaned') ||
        w.message.includes('trigger')
      );
      
      if (connectionErrors.length > 0) {
        response.errors = connectionErrors.map(e => ({
          node: e.nodeName || 'workflow',
          message: e.message
        }));
      }
      
      if (connectionWarnings.length > 0) {
        response.warnings = connectionWarnings.map(w => ({
          node: w.nodeName || 'workflow',
          message: w.message
        }));
      }
      
      return response;
    } catch (error) {
      logger.error('Error validating workflow connections:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error validating connections'
      };
    }
  }

  private async validateWorkflowExpressions(workflow: any): Promise<any> {
    await this.ensureInitialized();
    if (!this.repository) throw new Error('Repository not initialized');
    
    // Create workflow validator instance
    const validator = new WorkflowValidator(
      this.repository,
      EnhancedConfigValidator
    );
    
    try {
      // Validate only expressions
      const result = await validator.validateWorkflow(workflow, {
        validateNodes: false,
        validateConnections: false,
        validateExpressions: true
      });
      
      const response: any = {
        valid: result.errors.length === 0,
        statistics: {
          totalNodes: result.statistics.totalNodes,
          expressionsValidated: result.statistics.expressionsValidated
        }
      };
      
      // Filter to only expression-related issues
      const expressionErrors = result.errors.filter(e => 
        e.message.includes('Expression') || 
        e.message.includes('$') ||
        e.message.includes('{{')
      );
      
      const expressionWarnings = result.warnings.filter(w => 
        w.message.includes('Expression') || 
        w.message.includes('$') ||
        w.message.includes('{{')
      );
      
      if (expressionErrors.length > 0) {
        response.errors = expressionErrors.map(e => ({
          node: e.nodeName || 'workflow',
          message: e.message
        }));
      }
      
      if (expressionWarnings.length > 0) {
        response.warnings = expressionWarnings.map(w => ({
          node: w.nodeName || 'workflow',
          message: w.message
        }));
      }
      
      // Add tips for common expression issues
      if (expressionErrors.length > 0 || expressionWarnings.length > 0) {
        response.tips = [
          'Use {{ }} to wrap expressions',
          'Reference data with $json.propertyName',
          'Reference other nodes with $node["Node Name"].json',
          'Use $input.item for input data in loops'
        ];
      }
      
      return response;
    } catch (error) {
      logger.error('Error validating workflow expressions:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error validating expressions'
      };
    }
  }

  async run(): Promise<void> {
    // Ensure database is initialized before starting server
    await this.ensureInitialized();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Force flush stdout for Docker environments
    // Docker uses block buffering which can delay MCP responses
    if (!process.stdout.isTTY || process.env.IS_DOCKER) {
      // Override write to auto-flush
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = function(chunk: any, encoding?: any, callback?: any) {
        const result = originalWrite(chunk, encoding, callback);
        // Force immediate flush
        process.stdout.emit('drain');
        return result;
      };
    }
    
    logger.info('n8n Documentation MCP Server running on stdio transport');
    
    // Keep the process alive and listening
    process.stdin.resume();
  }
  
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP server...');
    
    // Clean up cache timers to prevent memory leaks
    if (this.cache) {
      try {
        this.cache.destroy();
        logger.info('Cache timers cleaned up');
      } catch (error) {
        logger.error('Error cleaning up cache:', error);
      }
    }
    
    // Close database connection if it exists
    if (this.db) {
      try {
        await this.db.close();
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Error closing database:', error);
      }
    }
  }
}