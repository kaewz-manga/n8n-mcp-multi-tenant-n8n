/**
 * Trigger system types for n8n_test_workflow tool
 *
 * Supports 3 trigger categories (all input-capable):
 * - webhook: AI can pass HTTP body/headers/params
 * - form: AI can pass form field values
 * - chat: AI can pass message + sessionId
 *
 * Note: Direct workflow execution via API is not supported by n8n's public API.
 * Workflows must have webhook/form/chat triggers to be executable externally.
 */

import { Workflow, WorkflowNode } from '../types/n8n-api';

/**
 * Supported trigger types (all input-capable)
 */
export type TriggerType = 'webhook' | 'form' | 'chat';

/**
 * Base input for all trigger handlers
 */
export interface BaseTriggerInput {
  workflowId: string;
  triggerType?: TriggerType;
  data?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number;
  waitForResponse?: boolean;
}

/**
 * Webhook-specific input
 */
export interface WebhookTriggerInput extends BaseTriggerInput {
  triggerType: 'webhook';
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  webhookPath?: string;
}

/**
 * Form-specific input
 */
export interface FormTriggerInput extends BaseTriggerInput {
  triggerType: 'form';
  formData?: Record<string, unknown>;
}

/**
 * Chat-specific input (sync mode only)
 */
export interface ChatTriggerInput extends BaseTriggerInput {
  triggerType: 'chat';
  message: string;
  sessionId?: string;
}

/**
 * Discriminated union of all trigger inputs
 */
export type TriggerInput =
  | WebhookTriggerInput
  | FormTriggerInput
  | ChatTriggerInput;

/**
 * Unified response from all trigger handlers
 */
export interface TriggerResponse {
  success: boolean;
  triggerType: TriggerType;
  workflowId: string;
  executionId?: string;
  status?: number;
  statusText?: string;
  data?: unknown;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
  metadata: {
    duration: number;
    webhookPath?: string;
    sessionId?: string;
    httpMethod?: string;
  };
}

/**
 * Handler capability flags
 */
export interface TriggerHandlerCapabilities {
  /** Whether workflow must be active for this trigger */
  requiresActiveWorkflow: boolean;
  /** Supported HTTP methods (for webhook) */
  supportedMethods?: string[];
  /** Whether this handler can pass input data to workflow */
  canPassInputData: boolean;
}

/**
 * Detected trigger information from workflow analysis
 */
export interface DetectedTrigger {
  type: TriggerType;
  node: WorkflowNode;
  webhookPath?: string;
  httpMethod?: string;
  formFields?: string[];
  chatConfig?: {
    responseMode?: string;
  };
}

/**
 * Result of trigger detection
 */
export interface TriggerDetectionResult {
  detected: boolean;
  trigger?: DetectedTrigger;
  reason?: string;
}

/**
 * Input for the MCP tool (before trigger type detection)
 */
export interface TestWorkflowInput {
  workflowId: string;
  triggerType?: TriggerType;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  webhookPath?: string;
  message?: string;
  sessionId?: string;
  data?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number;
  waitForResponse?: boolean;
}
