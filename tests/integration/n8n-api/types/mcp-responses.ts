/**
 * TypeScript interfaces for MCP handler responses
 *
 * These interfaces provide type safety for integration tests,
 * replacing unsafe `as any` casts with proper type definitions.
 */

/**
 * Workflow validation response from handleValidateWorkflow
 */
export interface ValidationResponse {
  valid: boolean;
  workflowId: string;
  workflowName: string;
  summary: {
    totalNodes: number;
    enabledNodes: number;
    triggerNodes: number;
    validConnections?: number;
    invalidConnections?: number;
    expressionsValidated?: number;
    errorCount: number;
    warningCount: number;
  };
  errors?: Array<{
    node: string;
    nodeName?: string;
    message: string;
    details?: {
      code?: string;
      [key: string]: unknown;
    };
    code?: string;
  }>;
  warnings?: Array<{
    node: string;
    nodeName?: string;
    message: string;
    details?: {
      code?: string;
      [key: string]: unknown;
    };
    code?: string;
  }>;
  info?: Array<{
    node: string;
    nodeName?: string;
    message: string;
    severity?: string;
    details?: unknown;
  }>;
  suggestions?: string[];
}

/**
 * Workflow autofix response from handleAutofixWorkflow
 */
export interface AutofixResponse {
  workflowId: string;
  workflowName: string;
  preview?: boolean;
  fixesAvailable?: number;
  fixesApplied?: number;
  fixes?: Array<{
    type: 'expression-format' | 'typeversion-correction' | 'error-output-config' | 'node-type-correction' | 'webhook-missing-path';
    confidence: 'high' | 'medium' | 'low';
    description: string;
    nodeName?: string;
    nodeId?: string;
    before?: unknown;
    after?: unknown;
  }>;
  summary?: {
    totalFixes: number;
    byType: Record<string, number>;
    byConfidence: Record<string, number>;
  };
  stats?: {
    expressionFormat?: number;
    typeVersionCorrection?: number;
    errorOutputConfig?: number;
    nodeTypeCorrection?: number;
    webhookMissingPath?: number;
  };
  message?: string;
  validationSummary?: {
    errors: number;
    warnings: number;
  };
}
