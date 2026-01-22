/**
 * Cleanup Helpers for Integration Tests
 *
 * Provides multi-level cleanup strategies for test resources:
 * - Orphaned workflows (from failed test runs)
 * - Old executions (older than 24 hours)
 * - Bulk cleanup by tag or name prefix
 */

import { getTestN8nClient } from './n8n-client';
import { getN8nCredentials } from './credentials';
import { Logger } from '../../../../src/utils/logger';

const logger = new Logger({ prefix: '[Cleanup]' });

/**
 * Clean up orphaned test workflows
 *
 * Finds and deletes all workflows tagged with the test tag or
 * prefixed with the test name prefix. Run this periodically in CI
 * to clean up failed test runs.
 *
 * @returns Array of deleted workflow IDs
 */
export async function cleanupOrphanedWorkflows(): Promise<string[]> {
  const creds = getN8nCredentials();
  const client = getTestN8nClient();
  const deleted: string[] = [];

  logger.info('Searching for orphaned test workflows...');

  let allWorkflows: any[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 1000; // Safety limit to prevent infinite loops

  // Fetch all workflows with pagination
  try {
    do {
      pageCount++;

      if (pageCount > MAX_PAGES) {
        logger.error(`Exceeded maximum pages (${MAX_PAGES}). Possible infinite loop or API issue.`);
        throw new Error('Pagination safety limit exceeded while fetching workflows');
      }

      logger.debug(`Fetching workflows page ${pageCount}...`);

      const response = await client.listWorkflows({
        cursor,
        limit: 100,
        excludePinnedData: true
      });

      allWorkflows.push(...response.data);
      cursor = response.nextCursor || undefined;
    } while (cursor);

    logger.info(`Found ${allWorkflows.length} total workflows across ${pageCount} page(s)`);
  } catch (error) {
    logger.error('Failed to fetch workflows:', error);
    throw error;
  }

  // Pre-activated webhook workflow that should NOT be deleted
  // This is needed for webhook trigger integration tests
  // Note: Single webhook accepts all HTTP methods (GET, POST, PUT, DELETE)
  const preservedWorkflowNames = new Set([
    '[MCP-TEST] Webhook All Methods'
  ]);

  // Find test workflows but exclude pre-activated webhook workflows
  const testWorkflows = allWorkflows.filter(w => {
    const isTestWorkflow = w.tags?.includes(creds.cleanup.tag) || w.name?.startsWith(creds.cleanup.namePrefix);
    const isPreserved = preservedWorkflowNames.has(w.name);

    return isTestWorkflow && !isPreserved;
  });

  logger.info(`Found ${testWorkflows.length} orphaned test workflow(s) (excluding ${preservedWorkflowNames.size} preserved webhook workflow)`);

  if (testWorkflows.length === 0) {
    return deleted;
  }

  // Delete them
  for (const workflow of testWorkflows) {
    try {
      await client.deleteWorkflow(workflow.id);
      deleted.push(workflow.id);
      logger.debug(`Deleted orphaned workflow: ${workflow.name} (${workflow.id})`);
    } catch (error) {
      logger.warn(`Failed to delete workflow ${workflow.id}:`, error);
    }
  }

  logger.info(`Successfully deleted ${deleted.length} orphaned workflow(s)`);
  return deleted;
}

/**
 * Clean up old executions
 *
 * Deletes executions older than the specified age.
 *
 * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 * @returns Array of deleted execution IDs
 */
export async function cleanupOldExecutions(
  maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<string[]> {
  const client = getTestN8nClient();
  const deleted: string[] = [];

  logger.info(`Searching for executions older than ${maxAgeMs}ms...`);

  let allExecutions: any[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 1000; // Safety limit to prevent infinite loops

  // Fetch all executions
  try {
    do {
      pageCount++;

      if (pageCount > MAX_PAGES) {
        logger.error(`Exceeded maximum pages (${MAX_PAGES}). Possible infinite loop or API issue.`);
        throw new Error('Pagination safety limit exceeded while fetching executions');
      }

      logger.debug(`Fetching executions page ${pageCount}...`);

      const response = await client.listExecutions({
        cursor,
        limit: 100,
        includeData: false
      });

      allExecutions.push(...response.data);
      cursor = response.nextCursor || undefined;
    } while (cursor);

    logger.info(`Found ${allExecutions.length} total executions across ${pageCount} page(s)`);
  } catch (error) {
    logger.error('Failed to fetch executions:', error);
    throw error;
  }

  const cutoffTime = Date.now() - maxAgeMs;
  const oldExecutions = allExecutions.filter(e => {
    const executionTime = new Date(e.startedAt).getTime();
    return executionTime < cutoffTime;
  });

  logger.info(`Found ${oldExecutions.length} old execution(s)`);

  if (oldExecutions.length === 0) {
    return deleted;
  }

  for (const execution of oldExecutions) {
    try {
      await client.deleteExecution(execution.id);
      deleted.push(execution.id);
      logger.debug(`Deleted old execution: ${execution.id}`);
    } catch (error) {
      logger.warn(`Failed to delete execution ${execution.id}:`, error);
    }
  }

  logger.info(`Successfully deleted ${deleted.length} old execution(s)`);
  return deleted;
}

/**
 * Clean up all test resources
 *
 * Combines cleanupOrphanedWorkflows and cleanupOldExecutions.
 * Use this as a comprehensive cleanup in CI.
 *
 * @returns Object with counts of deleted resources
 */
export async function cleanupAllTestResources(): Promise<{
  workflows: number;
  executions: number;
}> {
  logger.info('Starting comprehensive test resource cleanup...');

  const [workflowIds, executionIds] = await Promise.all([
    cleanupOrphanedWorkflows(),
    cleanupOldExecutions()
  ]);

  logger.info(
    `Cleanup complete: ${workflowIds.length} workflows, ${executionIds.length} executions`
  );

  return {
    workflows: workflowIds.length,
    executions: executionIds.length
  };
}

/**
 * Delete workflows by tag
 *
 * Deletes all workflows with the specified tag.
 *
 * @param tag - Tag to match
 * @returns Array of deleted workflow IDs
 */
export async function cleanupWorkflowsByTag(tag: string): Promise<string[]> {
  const client = getTestN8nClient();
  const deleted: string[] = [];

  logger.info(`Searching for workflows with tag: ${tag}`);

  try {
    const response = await client.listWorkflows({
      tags: tag || undefined,
      limit: 100,
      excludePinnedData: true
    });

    const workflows = response.data;
    logger.info(`Found ${workflows.length} workflow(s) with tag: ${tag}`);

    for (const workflow of workflows) {
      if (!workflow.id) continue;

      try {
        await client.deleteWorkflow(workflow.id);
        deleted.push(workflow.id);
        logger.debug(`Deleted workflow: ${workflow.name} (${workflow.id})`);
      } catch (error) {
        logger.warn(`Failed to delete workflow ${workflow.id}:`, error);
      }
    }

    logger.info(`Successfully deleted ${deleted.length} workflow(s)`);
    return deleted;
  } catch (error) {
    logger.error(`Failed to cleanup workflows by tag: ${tag}`, error);
    throw error;
  }
}

/**
 * Delete executions for a specific workflow
 *
 * @param workflowId - Workflow ID
 * @returns Array of deleted execution IDs
 */
export async function cleanupExecutionsByWorkflow(
  workflowId: string
): Promise<string[]> {
  const client = getTestN8nClient();
  const deleted: string[] = [];

  logger.info(`Searching for executions of workflow: ${workflowId}`);

  let cursor: string | undefined;
  let totalCount = 0;
  let pageCount = 0;
  const MAX_PAGES = 1000; // Safety limit to prevent infinite loops

  try {
    do {
      pageCount++;

      if (pageCount > MAX_PAGES) {
        logger.error(`Exceeded maximum pages (${MAX_PAGES}). Possible infinite loop or API issue.`);
        throw new Error(`Pagination safety limit exceeded while fetching executions for workflow ${workflowId}`);
      }

      const response = await client.listExecutions({
        workflowId,
        cursor,
        limit: 100,
        includeData: false
      });

      const executions = response.data;
      totalCount += executions.length;

      for (const execution of executions) {
        try {
          await client.deleteExecution(execution.id);
          deleted.push(execution.id);
          logger.debug(`Deleted execution: ${execution.id}`);
        } catch (error) {
          logger.warn(`Failed to delete execution ${execution.id}:`, error);
        }
      }

      cursor = response.nextCursor || undefined;
    } while (cursor);

    logger.info(
      `Successfully deleted ${deleted.length}/${totalCount} execution(s) for workflow ${workflowId}`
    );
    return deleted;
  } catch (error) {
    logger.error(`Failed to cleanup executions for workflow: ${workflowId}`, error);
    throw error;
  }
}
