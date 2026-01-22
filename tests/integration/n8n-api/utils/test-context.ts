/**
 * Test Context for Resource Tracking and Cleanup
 *
 * Tracks resources created during tests (workflows, executions) and
 * provides automatic cleanup functionality.
 */

import { getTestN8nClient } from './n8n-client';
import { getN8nCredentials } from './credentials';
import { Logger } from '../../../../src/utils/logger';

const logger = new Logger({ prefix: '[TestContext]' });

export interface TestContext {
  /** Workflow IDs created during the test */
  workflowIds: string[];

  /** Execution IDs created during the test */
  executionIds: string[];

  /** Clean up all tracked resources */
  cleanup: () => Promise<void>;

  /** Track a workflow for cleanup */
  trackWorkflow: (id: string) => void;

  /** Track an execution for cleanup */
  trackExecution: (id: string) => void;

  /** Remove a workflow from tracking (e.g., already deleted) */
  untrackWorkflow: (id: string) => void;

  /** Remove an execution from tracking (e.g., already deleted) */
  untrackExecution: (id: string) => void;
}

/**
 * Create a test context for tracking and cleaning up resources
 *
 * Use this in test setup to create a context that tracks all
 * workflows and executions created during the test. Call cleanup()
 * in afterEach or afterAll to remove test resources.
 *
 * @returns TestContext
 *
 * @example
 * describe('Workflow tests', () => {
 *   let context: TestContext;
 *
 *   beforeEach(() => {
 *     context = createTestContext();
 *   });
 *
 *   afterEach(async () => {
 *     await context.cleanup();
 *   });
 *
 *   it('creates a workflow', async () => {
 *     const workflow = await client.createWorkflow({ ... });
 *     context.trackWorkflow(workflow.id);
 *     // Test runs, then cleanup() automatically deletes the workflow
 *   });
 * });
 */
export function createTestContext(): TestContext {
  const context: TestContext = {
    workflowIds: [],
    executionIds: [],

    trackWorkflow(id: string) {
      if (!this.workflowIds.includes(id)) {
        this.workflowIds.push(id);
        logger.debug(`Tracking workflow for cleanup: ${id}`);
      }
    },

    trackExecution(id: string) {
      if (!this.executionIds.includes(id)) {
        this.executionIds.push(id);
        logger.debug(`Tracking execution for cleanup: ${id}`);
      }
    },

    untrackWorkflow(id: string) {
      const index = this.workflowIds.indexOf(id);
      if (index > -1) {
        this.workflowIds.splice(index, 1);
        logger.debug(`Untracked workflow: ${id}`);
      }
    },

    untrackExecution(id: string) {
      const index = this.executionIds.indexOf(id);
      if (index > -1) {
        this.executionIds.splice(index, 1);
        logger.debug(`Untracked execution: ${id}`);
      }
    },

    async cleanup() {
      const creds = getN8nCredentials();

      // Skip cleanup if disabled
      if (!creds.cleanup.enabled) {
        logger.info('Cleanup disabled, skipping resource cleanup');
        return;
      }

      const client = getTestN8nClient();

      // Delete executions first (they reference workflows)
      if (this.executionIds.length > 0) {
        logger.info(`Cleaning up ${this.executionIds.length} execution(s)`);

        for (const id of this.executionIds) {
          try {
            await client.deleteExecution(id);
            logger.debug(`Deleted execution: ${id}`);
          } catch (error) {
            // Log but don't fail - execution might already be deleted
            logger.warn(`Failed to delete execution ${id}:`, error);
          }
        }

        this.executionIds = [];
      }

      // Then delete workflows
      if (this.workflowIds.length > 0) {
        logger.info(`Cleaning up ${this.workflowIds.length} workflow(s)`);

        for (const id of this.workflowIds) {
          try {
            await client.deleteWorkflow(id);
            logger.debug(`Deleted workflow: ${id}`);
          } catch (error) {
            // Log but don't fail - workflow might already be deleted
            logger.warn(`Failed to delete workflow ${id}:`, error);
          }
        }

        this.workflowIds = [];
      }
    }
  };

  return context;
}

/**
 * Create a test workflow name with prefix and timestamp
 *
 * Generates a unique workflow name for testing that follows
 * the configured naming convention.
 *
 * @param baseName - Base name for the workflow
 * @returns Prefixed workflow name with timestamp
 *
 * @example
 * const name = createTestWorkflowName('Simple HTTP Request');
 * // Returns: "[MCP-TEST] Simple HTTP Request 1704067200000"
 */
export function createTestWorkflowName(baseName: string): string {
  const creds = getN8nCredentials();
  const timestamp = Date.now();
  return `${creds.cleanup.namePrefix} ${baseName} ${timestamp}`;
}

/**
 * Get the configured test tag
 *
 * @returns Tag to apply to test workflows
 */
export function getTestTag(): string {
  const creds = getN8nCredentials();
  return creds.cleanup.tag;
}
