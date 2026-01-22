/**
 * Node Classification Utilities
 *
 * Provides shared classification logic for workflow nodes.
 * Used by validators to consistently identify node types across the codebase.
 *
 * This module centralizes node type classification to ensure consistent behavior
 * between WorkflowValidator and n8n-validation.ts, preventing bugs like sticky
 * notes being incorrectly flagged as disconnected nodes.
 */

import { isTriggerNode as isTriggerNodeImpl } from './node-type-utils';

/**
 * Check if a node type is a sticky note (documentation-only node)
 *
 * Sticky notes are UI-only annotation nodes that:
 * - Do not participate in workflow execution
 * - Never have connections (by design)
 * - Should be excluded from connection validation
 * - Serve purely as visual documentation in the workflow canvas
 *
 * Example sticky note types:
 * - 'n8n-nodes-base.stickyNote' (standard format)
 * - 'nodes-base.stickyNote' (normalized format)
 * - '@n8n/n8n-nodes-base.stickyNote' (scoped format)
 *
 * @param nodeType - The node type to check (e.g., 'n8n-nodes-base.stickyNote')
 * @returns true if the node is a sticky note, false otherwise
 */
export function isStickyNote(nodeType: string): boolean {
  const stickyNoteTypes = [
    'n8n-nodes-base.stickyNote',
    'nodes-base.stickyNote',
    '@n8n/n8n-nodes-base.stickyNote'
  ];
  return stickyNoteTypes.includes(nodeType);
}

/**
 * Check if a node type is a trigger node
 *
 * This function delegates to the comprehensive trigger detection implementation
 * in node-type-utils.ts which supports 200+ trigger types using flexible
 * pattern matching instead of a hardcoded list.
 *
 * Trigger nodes:
 * - Start workflow execution
 * - Only need outgoing connections (no incoming connections required)
 * - Include webhooks, manual triggers, schedule triggers, email triggers, etc.
 * - Are the entry points for workflow execution
 *
 * Examples:
 * - Webhooks: Listen for HTTP requests
 * - Manual triggers: Started manually by user
 * - Schedule/Cron triggers: Run on a schedule
 * - Execute Workflow Trigger: Invoked by other workflows
 *
 * @param nodeType - The node type to check
 * @returns true if the node is a trigger, false otherwise
 */
export function isTriggerNode(nodeType: string): boolean {
  return isTriggerNodeImpl(nodeType);
}

/**
 * Check if a node type is non-executable (UI-only)
 *
 * Non-executable nodes:
 * - Do not participate in workflow execution
 * - Serve documentation/annotation purposes only
 * - Should be excluded from all execution-related validation
 * - Should be excluded from statistics like "total executable nodes"
 * - Should be excluded from connection validation
 *
 * Currently includes: sticky notes
 *
 * Future: May include other annotation/comment nodes if n8n adds them
 *
 * @param nodeType - The node type to check
 * @returns true if the node is non-executable, false otherwise
 */
export function isNonExecutableNode(nodeType: string): boolean {
  return isStickyNote(nodeType);
  // Future: Add other non-executable node types here
  // Example: || isCommentNode(nodeType) || isAnnotationNode(nodeType)
}

/**
 * Check if a node type requires incoming connections
 *
 * Most nodes require at least one incoming connection to receive data,
 * but there are two categories of exceptions:
 *
 * 1. Trigger nodes: Only need outgoing connections
 *    - They start workflow execution
 *    - They generate their own data
 *    - Examples: webhook, manualTrigger, scheduleTrigger
 *
 * 2. Non-executable nodes: Don't need any connections
 *    - They are UI-only annotations
 *    - They don't participate in execution
 *    - Examples: stickyNote
 *
 * @param nodeType - The node type to check
 * @returns true if the node requires incoming connections, false otherwise
 */
export function requiresIncomingConnection(nodeType: string): boolean {
  // Non-executable nodes don't need any connections
  if (isNonExecutableNode(nodeType)) {
    return false;
  }

  // Trigger nodes only need outgoing connections
  if (isTriggerNode(nodeType)) {
    return false;
  }

  // Regular nodes need incoming connections
  return true;
}
