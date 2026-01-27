/**
 * Validation utility functions for MCP tools
 */

import { logger } from '../../utils/logger';
import { n8nDocumentationToolsFinal } from '../tools';
import { n8nManagementTools } from '../tools-n8n-manager';
import { ToolValidation, Validator, ValidationError } from '../../utils/validation-schemas';

/**
 * Sanitize validation result to match outputSchema
 */
export function sanitizeValidationResult(result: any, toolName: string): any {
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
export function validateToolParams(
  toolName: string,
  args: any,
  legacyRequiredParams?: string[]
): void {
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
        return validateToolParamsBasic(toolName, args, legacyRequiredParams || []);
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
export function validateToolParamsBasic(
  toolName: string,
  args: any,
  requiredParams: string[]
): void {
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
export function validateExtractedArgs(toolName: string, args: any): boolean {
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

  // Basic type validation for present fields
  for (const [field, value] of Object.entries(args)) {
    if (!(field in properties)) {
      // Extra field not in schema
      logger.debug(`Extracted args has extra field: ${field}`, {
        toolName,
        extractedArgs: args,
        schemaProperties: Object.keys(properties)
      });
      continue;
    }

    const expectedType = (properties as any)[field]?.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (expectedType && expectedType !== actualType && value !== null) {
      logger.debug(`Extracted args type mismatch for ${field}: expected ${expectedType}, got ${actualType}`, {
        toolName,
        field,
        expectedType,
        actualType,
        value
      });
      return false;
    }
  }

  return true;
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
let disabledToolsCache: Set<string> | null = null;

export function getDisabledTools(): Set<string> {
  // Return cached value if available
  if (disabledToolsCache !== null) {
    return disabledToolsCache;
  }

  let disabledToolsEnv = process.env.DISABLED_TOOLS || '';
  if (!disabledToolsEnv) {
    disabledToolsCache = new Set();
    return disabledToolsCache;
  }

  // Safety limit: prevent abuse with very long environment variables
  if (disabledToolsEnv.length > 10000) {
    logger.warn(`DISABLED_TOOLS environment variable too long (${disabledToolsEnv.length} chars), truncating to 10000`);
    disabledToolsEnv = disabledToolsEnv.substring(0, 10000);
  }

  let tools = disabledToolsEnv
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  // Safety limit: prevent abuse with too many tools
  if (tools.length > 200) {
    logger.warn(`DISABLED_TOOLS contains ${tools.length} tools, limiting to first 200`);
    tools = tools.slice(0, 200);
  }

  if (tools.length > 0) {
    logger.info(`Disabled tools configured: ${tools.join(', ')}`);
  }

  disabledToolsCache = new Set(tools);
  return disabledToolsCache;
}
