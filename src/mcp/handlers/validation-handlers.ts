/**
 * Validation handlers for MCP tools
 * Handles node and workflow validation operations
 */

import { NodeRepository } from '../../database/node-repository';
import { EnhancedConfigValidator, ValidationMode, ValidationProfile } from '../../services/enhanced-config-validator';
import { WorkflowValidator } from '../../services/workflow-validator';
import { ConfigValidator } from '../../services/config-validator';
import { NodeTypeNormalizer } from '../../utils/node-type-normalizer';
import { getNodeTypeAlternatives, getWorkflowNodeType } from '../../utils/node-utils';
import { getWorkflowExampleString } from '../workflow-examples';
import { logger } from '../../utils/logger';
import { telemetry } from '../../telemetry';

/**
 * Minimal validation - checks only required fields
 */
export async function validateNodeMinimal(
  nodeType: string,
  config: Record<string, any>,
  repository: NodeRepository
): Promise<any> {
  // Get node info
  // First try with normalized type
  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  let node = repository.getNode(normalizedType);

  if (!node && normalizedType !== nodeType) {
    // Try original if normalization changed it
    node = repository.getNode(nodeType);
  }

  if (!node) {
    // Fallback to other alternatives for edge cases
    const alternatives = getNodeTypeAlternatives(normalizedType);

    for (const alt of alternatives) {
      const found = repository.getNode(alt);
      if (found) {
        node = found;
        break;
      }
    }
  }

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  // Get properties
  const properties = node.properties || [];

  // Add @version to config for displayOptions evaluation (supports _cnd operators)
  const configWithVersion = {
    '@version': node.version || 1,
    ...(config || {})
  };

  // Find missing required fields
  const missingFields: string[] = [];

  for (const prop of properties) {
    // Skip if not required
    if (!prop.required) continue;

    // Skip if not visible based on current config (uses ConfigValidator for _cnd support)
    if (prop.displayOptions && !ConfigValidator.isPropertyVisible(prop, configWithVersion)) {
      continue;
    }

    // Check if field is missing (safely handle null/undefined config)
    if (!config || !(prop.name in config)) {
      missingFields.push(prop.displayName || prop.name);
    }
  }

  return {
    nodeType: node.nodeType,
    displayName: node.displayName,
    valid: missingFields.length === 0,
    missingRequiredFields: missingFields
  };
}

/**
 * Full node configuration validation
 */
export async function validateNodeConfig(
  nodeType: string,
  config: Record<string, any>,
  mode: ValidationMode,
  profile: ValidationProfile,
  repository: NodeRepository
): Promise<any> {
  // Get node info to access properties
  // First try with normalized type
  const normalizedType = NodeTypeNormalizer.normalizeToFullForm(nodeType);
  let node = repository.getNode(normalizedType);

  if (!node && normalizedType !== nodeType) {
    // Try original if normalization changed it
    node = repository.getNode(nodeType);
  }

  if (!node) {
    // Fallback to other alternatives for edge cases
    const alternatives = getNodeTypeAlternatives(normalizedType);

    for (const alt of alternatives) {
      const found = repository.getNode(alt);
      if (found) {
        node = found;
        break;
      }
    }
  }

  if (!node) {
    throw new Error(`Node ${nodeType} not found`);
  }

  // Get properties
  const properties = node.properties || [];

  // Add @version to config for displayOptions evaluation (supports _cnd operators)
  const configWithVersion = {
    '@version': node.version || 1,
    ...config
  };

  // Use enhanced validator with operation mode by default
  const validationResult = EnhancedConfigValidator.validateWithMode(
    node.nodeType,
    configWithVersion,
    properties,
    mode,
    profile
  );

  // Add node context to result
  return {
    nodeType: node.nodeType,
    workflowNodeType: getWorkflowNodeType(node.package, node.nodeType),
    displayName: node.displayName,
    ...validationResult,
    summary: {
      hasErrors: !validationResult.valid,
      errorCount: validationResult.errors.length,
      warningCount: validationResult.warnings.length,
      suggestionCount: validationResult.suggestions.length
    }
  };
}

/**
 * Complete workflow validation
 */
export async function validateWorkflow(
  workflow: any,
  options: any,
  repository: NodeRepository
): Promise<any> {
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
    repository,
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

/**
 * Validate workflow connections only
 */
export async function validateWorkflowConnections(
  workflow: any,
  repository: NodeRepository
): Promise<any> {
  // Create workflow validator instance
  const validator = new WorkflowValidator(
    repository,
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

/**
 * Validate workflow expressions only
 */
export async function validateWorkflowExpressions(
  workflow: any,
  repository: NodeRepository
): Promise<any> {
  // Create workflow validator instance
  const validator = new WorkflowValidator(
    repository,
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
