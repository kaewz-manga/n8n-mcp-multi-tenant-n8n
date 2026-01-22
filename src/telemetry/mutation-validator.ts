/**
 * Data quality validator for workflow mutations
 * Ensures mutation data meets quality standards before tracking
 */

import { createHash } from 'crypto';
import {
  WorkflowMutationData,
  MutationDataQualityResult,
  MutationTrackingOptions,
} from './mutation-types.js';

/**
 * Default options for mutation tracking
 */
export const DEFAULT_MUTATION_TRACKING_OPTIONS: Required<MutationTrackingOptions> = {
  enabled: true,
  maxWorkflowSizeKb: 500,
  validateQuality: true,
  sanitize: true,
};

/**
 * Validates workflow mutation data quality
 */
export class MutationValidator {
  private options: Required<MutationTrackingOptions>;

  constructor(options: MutationTrackingOptions = {}) {
    this.options = { ...DEFAULT_MUTATION_TRACKING_OPTIONS, ...options };
  }

  /**
   * Validate mutation data quality
   */
  validate(data: WorkflowMutationData): MutationDataQualityResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check workflow structure
    if (!this.isValidWorkflow(data.workflowBefore)) {
      errors.push('Invalid workflow_before structure');
    }

    if (!this.isValidWorkflow(data.workflowAfter)) {
      errors.push('Invalid workflow_after structure');
    }

    // Check workflow size
    const beforeSizeKb = this.getWorkflowSizeKb(data.workflowBefore);
    const afterSizeKb = this.getWorkflowSizeKb(data.workflowAfter);

    if (beforeSizeKb > this.options.maxWorkflowSizeKb) {
      errors.push(
        `workflow_before size (${beforeSizeKb}KB) exceeds maximum (${this.options.maxWorkflowSizeKb}KB)`
      );
    }

    if (afterSizeKb > this.options.maxWorkflowSizeKb) {
      errors.push(
        `workflow_after size (${afterSizeKb}KB) exceeds maximum (${this.options.maxWorkflowSizeKb}KB)`
      );
    }

    // Check for meaningful change
    if (!this.hasMeaningfulChange(data.workflowBefore, data.workflowAfter)) {
      warnings.push('No meaningful change detected between before and after workflows');
    }

    // Check intent quality
    if (!data.userIntent || data.userIntent.trim().length === 0) {
      warnings.push('User intent is empty');
    } else if (data.userIntent.trim().length < 5) {
      warnings.push('User intent is too short (less than 5 characters)');
    } else if (data.userIntent.length > 1000) {
      warnings.push('User intent is very long (over 1000 characters)');
    }

    // Check operations
    if (!data.operations || data.operations.length === 0) {
      errors.push('No operations provided');
    }

    // Check validation data consistency
    if (data.validationBefore && data.validationAfter) {
      if (typeof data.validationBefore.valid !== 'boolean') {
        warnings.push('Invalid validation_before structure');
      }
      if (typeof data.validationAfter.valid !== 'boolean') {
        warnings.push('Invalid validation_after structure');
      }
    }

    // Check duration sanity
    if (data.durationMs !== undefined) {
      if (data.durationMs < 0) {
        errors.push('Duration cannot be negative');
      }
      if (data.durationMs > 300000) {
        // 5 minutes
        warnings.push('Duration is very long (over 5 minutes)');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if workflow has valid structure
   */
  private isValidWorkflow(workflow: any): boolean {
    if (!workflow || typeof workflow !== 'object') {
      return false;
    }

    // Must have nodes array
    if (!Array.isArray(workflow.nodes)) {
      return false;
    }

    // Must have connections object
    if (!workflow.connections || typeof workflow.connections !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * Get workflow size in KB
   */
  private getWorkflowSizeKb(workflow: any): number {
    try {
      const json = JSON.stringify(workflow);
      return json.length / 1024;
    } catch {
      return 0;
    }
  }

  /**
   * Check if there's meaningful change between workflows
   */
  private hasMeaningfulChange(workflowBefore: any, workflowAfter: any): boolean {
    try {
      // Compare hashes
      const hashBefore = this.hashWorkflow(workflowBefore);
      const hashAfter = this.hashWorkflow(workflowAfter);

      return hashBefore !== hashAfter;
    } catch {
      return false;
    }
  }

  /**
   * Hash workflow for comparison
   */
  hashWorkflow(workflow: any): string {
    try {
      const json = JSON.stringify(workflow);
      return createHash('sha256').update(json).digest('hex').substring(0, 16);
    } catch {
      return '';
    }
  }

  /**
   * Check if mutation should be excluded from tracking
   */
  shouldExclude(data: WorkflowMutationData): boolean {
    // Exclude if not successful and no error message
    if (!data.mutationSuccess && !data.mutationError) {
      return true;
    }

    // Exclude if workflows are identical
    if (!this.hasMeaningfulChange(data.workflowBefore, data.workflowAfter)) {
      return true;
    }

    // Exclude if workflow size exceeds limits
    const beforeSizeKb = this.getWorkflowSizeKb(data.workflowBefore);
    const afterSizeKb = this.getWorkflowSizeKb(data.workflowAfter);

    if (
      beforeSizeKb > this.options.maxWorkflowSizeKb ||
      afterSizeKb > this.options.maxWorkflowSizeKb
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check for duplicate mutation (same hash + operations)
   */
  isDuplicate(
    workflowBefore: any,
    workflowAfter: any,
    operations: any[],
    recentMutations: Array<{ hashBefore: string; hashAfter: string; operations: any[] }>
  ): boolean {
    const hashBefore = this.hashWorkflow(workflowBefore);
    const hashAfter = this.hashWorkflow(workflowAfter);
    const operationsHash = this.hashOperations(operations);

    return recentMutations.some(
      (m) =>
        m.hashBefore === hashBefore &&
        m.hashAfter === hashAfter &&
        this.hashOperations(m.operations) === operationsHash
    );
  }

  /**
   * Hash operations for deduplication
   */
  private hashOperations(operations: any[]): string {
    try {
      const json = JSON.stringify(operations);
      return createHash('sha256').update(json).digest('hex').substring(0, 16);
    } catch {
      return '';
    }
  }
}

/**
 * Singleton instance for easy access
 */
export const mutationValidator = new MutationValidator();
