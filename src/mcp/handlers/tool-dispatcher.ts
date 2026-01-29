/**
 * Tool dispatcher - Main routing logic for MCP tool calls
 * Routes tool calls to appropriate handler modules
 */

import { ServerContext } from '../types';
import { logger } from '../../utils/logger';
import { validateToolParams, getDisabledTools } from '../utils/validation-utils';
import * as DiscoveryHandlers from './discovery-handlers';
import * as NodeInfoHandlers from './node-info-handlers';
import * as ValidationHandlers from './validation-handlers';
import * as TemplateHandlers from './template-handlers';
import * as n8nHandlers from '../handlers-n8n-manager';
import { handleUpdatePartialWorkflow } from '../handlers-workflow-diff';

/**
 * Main tool dispatcher - routes tool calls to appropriate handlers
 */
export async function dispatchToolCall(
  name: string,
  args: any,
  serverContext: ServerContext
): Promise<any> {
  // Ensure args is an object and validate it
  args = args || {};

  // Defense in depth: This should never be reached since CallToolRequestSchema
  // handler already checks disabled tools, but we guard here
  // in case of future refactoring or direct executeTool() calls
  const disabledTools = getDisabledTools();
  if (disabledTools.has(name)) {
    throw new Error(`Tool '${name}' is disabled via DISABLED_TOOLS environment variable`);
  }

  // Log the tool call for debugging n8n issues
  logger.info(`Tool execution: ${name}`, {
    args: typeof args === 'object' ? JSON.stringify(args) : args,
    argsType: typeof args,
    argsKeys: typeof args === 'object' ? Object.keys(args) : 'not-object'
  });

  // Validate that args is actually an object
  if (typeof args !== 'object' || args === null) {
    throw new Error(`Invalid arguments for tool ${name}: expected object, got ${typeof args}`);
  }

  switch (name) {
    // Tools documentation
    case 'tools_documentation':
      return TemplateHandlers.getToolsDocumentation(args.topic, args.depth);

    // Node search and discovery
    case 'search_nodes':
      validateToolParams(name, args, ['query']);
      // Convert limit to number if provided, otherwise use default
      const limit = args.limit !== undefined ? Number(args.limit) || 20 : 20;
      return DiscoveryHandlers.searchNodes(
        args.query,
        limit,
        {
          mode: args.mode,
          includeExamples: args.includeExamples,
          source: args.source
        },
        serverContext.db
      );

    // Node information retrieval
    case 'get_node':
      validateToolParams(name, args, ['nodeType']);
      // Handle consolidated modes: docs, search_properties
      if (args.mode === 'docs') {
        return DiscoveryHandlers.getNodeDocumentation(
          args.nodeType,
          serverContext.db,
          (nodeType: string, includeExamples?: boolean) =>
            NodeInfoHandlers.getNodeEssentials(nodeType, !!includeExamples, serverContext.repository, serverContext.db, serverContext.cache)
        );
      }
      if (args.mode === 'search_properties') {
        if (!args.propertyQuery) {
          throw new Error('propertyQuery is required for mode=search_properties');
        }
        const maxResults = args.maxPropertyResults !== undefined ? Number(args.maxPropertyResults) || 20 : 20;
        return NodeInfoHandlers.searchNodeProperties(
          args.nodeType,
          args.propertyQuery,
          maxResults,
          serverContext.repository
        );
      }
      return NodeInfoHandlers.getNode(
        args.nodeType,
        args.detail,
        args.mode,
        args.includeTypeInfo,
        args.includeExamples,
        args.fromVersion,
        args.toVersion,
        serverContext.repository,
        serverContext.db,
        serverContext.cache
      );

    // Node validation
    case 'validate_node':
      validateToolParams(name, args, ['nodeType', 'config']);
      // Ensure config is an object
      if (typeof args.config !== 'object' || args.config === null) {
        logger.warn(`validate_node called with invalid config type: ${typeof args.config}`);
        const validationMode = args.mode || 'full';
        if (validationMode === 'minimal') {
          return {
            nodeType: args.nodeType || 'unknown',
            displayName: 'Unknown Node',
            valid: false,
            missingRequiredFields: [
              'Invalid config format - expected object',
              '🔧 RECOVERY: Use format { "resource": "...", "operation": "..." } or {} for empty config'
            ]
          };
        }
        return {
          nodeType: args.nodeType || 'unknown',
          workflowNodeType: args.nodeType || 'unknown',
          displayName: 'Unknown Node',
          valid: false,
          errors: [{
            type: 'config',
            property: 'config',
            message: 'Invalid config format - expected object',
            fix: 'Provide config as an object with node properties'
          }],
          warnings: [],
          suggestions: [
            '🔧 RECOVERY: Invalid config detected. Fix with:',
            '   • Ensure config is an object: { "resource": "...", "operation": "..." }',
            '   • Use get_node to see required fields for this node type',
            '   • Check if the node type is correct before configuring it'
          ],
          summary: {
            hasErrors: true,
            errorCount: 1,
            warningCount: 0,
            suggestionCount: 3
          }
        };
      }
      // Handle mode parameter
      const validationMode = args.mode || 'full';
      if (validationMode === 'minimal') {
        return ValidationHandlers.validateNodeMinimal(
          args.nodeType,
          args.config,
          serverContext.repository
        );
      }
      return ValidationHandlers.validateNodeConfig(
        args.nodeType,
        args.config,
        'operation',
        args.profile,
        serverContext.repository
      );

    // Template management
    case 'get_template':
      validateToolParams(name, args, ['templateId']);
      const templateId = Number(args.templateId);
      const templateMode = args.mode || 'full';
      return TemplateHandlers.getTemplate(templateId, templateMode, serverContext.templateService);

    case 'search_templates': {
      // Consolidated tool with searchMode parameter
      const searchMode = args.searchMode || 'keyword';
      const searchLimit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const searchOffset = Math.max(Number(args.offset) || 0, 0);

      switch (searchMode) {
        case 'by_nodes':
          if (!args.nodeTypes || !Array.isArray(args.nodeTypes) || args.nodeTypes.length === 0) {
            throw new Error('nodeTypes array is required for searchMode=by_nodes');
          }
          return TemplateHandlers.listNodeTemplates(args.nodeTypes, searchLimit, searchOffset, serverContext.templateService);
        case 'by_task':
          if (!args.task) {
            throw new Error('task is required for searchMode=by_task');
          }
          return TemplateHandlers.getTemplatesForTask(args.task, searchLimit, searchOffset, serverContext.templateService);
        case 'by_metadata':
          return TemplateHandlers.searchTemplatesByMetadata({
            category: args.category,
            complexity: args.complexity,
            maxSetupMinutes: args.maxSetupMinutes ? Number(args.maxSetupMinutes) : undefined,
            minSetupMinutes: args.minSetupMinutes ? Number(args.minSetupMinutes) : undefined,
            requiredService: args.requiredService,
            targetAudience: args.targetAudience
          }, searchLimit, searchOffset, serverContext.templateService);
        case 'keyword':
        default:
          if (!args.query) {
            throw new Error('query is required for searchMode=keyword');
          }
          const searchFields = args.fields as string[] | undefined;
          return TemplateHandlers.searchTemplates(args.query, searchLimit, searchOffset, searchFields, serverContext.templateService);
      }
    }

    // Workflow validation
    case 'validate_workflow':
      validateToolParams(name, args, ['workflow']);
      return ValidationHandlers.validateWorkflow(args.workflow, args.options, serverContext.repository);

    // n8n Management Tools (if API is configured)
    case 'n8n_create_workflow':
      validateToolParams(name, args, ['name', 'nodes', 'connections']);
      return n8nHandlers.handleCreateWorkflow(args, serverContext.instanceContext);

    case 'n8n_get_workflow': {
      validateToolParams(name, args, ['id']);
      const workflowMode = args.mode || 'full';
      switch (workflowMode) {
        case 'details':
          return n8nHandlers.handleGetWorkflowDetails(args, serverContext.instanceContext);
        case 'structure':
          return n8nHandlers.handleGetWorkflowStructure(args, serverContext.instanceContext);
        case 'minimal':
          return n8nHandlers.handleGetWorkflowMinimal(args, serverContext.instanceContext);
        case 'full':
        default:
          return n8nHandlers.handleGetWorkflow(args, serverContext.instanceContext);
      }
    }

    case 'n8n_update_full_workflow':
      validateToolParams(name, args, ['id']);
      return n8nHandlers.handleUpdateWorkflow(args, serverContext.repository, serverContext.instanceContext);

    case 'n8n_update_partial_workflow':
      validateToolParams(name, args, ['id', 'operations']);
      return handleUpdatePartialWorkflow(args, serverContext.repository, serverContext.instanceContext);

    case 'n8n_delete_workflow':
      validateToolParams(name, args, ['id']);
      return n8nHandlers.handleDeleteWorkflow(args, serverContext.instanceContext);

    case 'n8n_list_workflows':
      // No required parameters
      return n8nHandlers.handleListWorkflows(args, serverContext.instanceContext);

    case 'n8n_validate_workflow':
      validateToolParams(name, args, ['id']);
      return n8nHandlers.handleValidateWorkflow(args, serverContext.repository, serverContext.instanceContext);

    case 'n8n_autofix_workflow':
      validateToolParams(name, args, ['id']);
      return n8nHandlers.handleAutofixWorkflow(args, serverContext.repository, serverContext.instanceContext);

    case 'n8n_test_workflow':
      validateToolParams(name, args, ['workflowId']);
      return n8nHandlers.handleTestWorkflow(args, serverContext.instanceContext);

    case 'n8n_executions': {
      validateToolParams(name, args, ['action']);
      const execAction = args.action;
      switch (execAction) {
        case 'get':
          if (!args.id) {
            throw new Error('id is required for action=get');
          }
          return n8nHandlers.handleGetExecution(args, serverContext.instanceContext);
        case 'list':
          return n8nHandlers.handleListExecutions(args, serverContext.instanceContext);
        case 'delete':
          if (!args.id) {
            throw new Error('id is required for action=delete');
          }
          return n8nHandlers.handleDeleteExecution(args, serverContext.instanceContext);
        default:
          throw new Error(`Unknown action: ${execAction}. Valid actions: get, list, delete`);
      }
    }

    case 'n8n_health_check':
      // No required parameters - supports mode='status' (default) or mode='diagnostic'
      if (args.mode === 'diagnostic') {
        return n8nHandlers.handleDiagnostic({ params: { arguments: args } }, serverContext.instanceContext);
      }
      return n8nHandlers.handleHealthCheck(serverContext.instanceContext);

    case 'n8n_workflow_versions':
      validateToolParams(name, args, ['mode']);
      return n8nHandlers.handleWorkflowVersions(args, serverContext.repository, serverContext.instanceContext);

    case 'n8n_deploy_template':
      validateToolParams(name, args, ['templateId']);
      return n8nHandlers.handleDeployTemplate(args, serverContext.templateService, serverContext.repository, serverContext.instanceContext);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
