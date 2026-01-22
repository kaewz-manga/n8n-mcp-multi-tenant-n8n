/**
 * Unit tests for MutationValidator - Data Quality Validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MutationValidator } from '../../../src/telemetry/mutation-validator';
import { WorkflowMutationData, MutationToolName } from '../../../src/telemetry/mutation-types';
import type { UpdateNodeOperation } from '../../../src/types/workflow-diff';

describe('MutationValidator', () => {
  let validator: MutationValidator;

  beforeEach(() => {
    validator = new MutationValidator();
  });

  describe('Workflow Structure Validation', () => {
    it('should accept valid workflow structure', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Valid mutation',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test Updated',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject workflow without nodes array', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Invalid mutation',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          connections: {}
        } as any,
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid workflow_before structure');
    });

    it('should reject workflow without connections object', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Invalid mutation',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: []
        } as any,
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid workflow_before structure');
    });

    it('should reject null workflow', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Invalid mutation',
        operations: [{ type: 'updateNode' }],
        workflowBefore: null as any,
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid workflow_before structure');
    });
  });

  describe('Workflow Size Validation', () => {
    it('should accept workflows within size limit', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Size test',
        operations: [{ type: 'addNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [{
            id: 'node1',
            name: 'Start',
            type: 'n8n-nodes-base.start',
            position: [100, 100],
            parameters: {}
          }],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('size'));
    });

    it('should reject oversized workflows', () => {
      // Create a very large workflow (over 500KB default limit)
      // 600KB string = 600,000 characters
      const largeArray = new Array(600000).fill('x').join('');
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Oversized test',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [{
            id: 'node1',
            name: 'Large',
            type: 'n8n-nodes-base.code',
            position: [100, 100],
            parameters: {
              code: largeArray
            }
          }],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(err => err.includes('size') && err.includes('exceeds'))).toBe(true);
    });

    it('should respect custom size limit', () => {
      const customValidator = new MutationValidator({ maxWorkflowSizeKb: 1 });

      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Custom size test',
        operations: [{ type: 'addNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [{
            id: 'node1',
            name: 'Medium',
            type: 'n8n-nodes-base.code',
            position: [100, 100],
            parameters: {
              code: 'x'.repeat(2000) // ~2KB
            }
          }],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = customValidator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(err => err.includes('exceeds maximum (1KB)'))).toBe(true);
    });
  });

  describe('Intent Validation', () => {
    it('should warn about empty intent', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: '',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.warnings).toContain('User intent is empty');
    });

    it('should warn about very short intent', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'fix',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.warnings).toContain('User intent is too short (less than 5 characters)');
    });

    it('should warn about very long intent', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'x'.repeat(1001),
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.warnings).toContain('User intent is very long (over 1000 characters)');
    });

    it('should accept good intent length', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Add error handling to API nodes',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.warnings).not.toContain(expect.stringContaining('intent'));
    });
  });

  describe('Operations Validation', () => {
    it('should reject empty operations array', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test',
        operations: [],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No operations provided');
    });

    it('should accept operations array with items', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test',
        operations: [
          { type: 'addNode' },
          { type: 'addConnection' }
        ],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).not.toContain('No operations provided');
    });
  });

  describe('Duration Validation', () => {
    it('should reject negative duration', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: -100
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duration cannot be negative');
    });

    it('should warn about very long duration', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 400000 // Over 5 minutes
      };

      const result = validator.validate(data);
      expect(result.warnings).toContain('Duration is very long (over 5 minutes)');
    });

    it('should accept reasonable duration', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        mutationSuccess: true,
        durationMs: 150
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(true);
      expect(result.warnings).not.toContain(expect.stringContaining('Duration'));
    });
  });

  describe('Meaningful Change Detection', () => {
    it('should warn when workflows are identical', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test',
        nodes: [
          {
            id: 'node1',
            name: 'Start',
            type: 'n8n-nodes-base.start',
            position: [100, 100],
            parameters: {}
          }
        ],
        connections: {}
      };

      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'No actual change',
        operations: [{ type: 'updateNode' }],
        workflowBefore: workflow,
        workflowAfter: JSON.parse(JSON.stringify(workflow)), // Deep clone
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.warnings).toContain('No meaningful change detected between before and after workflows');
    });

    it('should not warn when workflows are different', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Real change',
        operations: [{ type: 'updateNode' }],
        workflowBefore: {
          id: 'wf1',
          name: 'Test',
          nodes: [],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'Test Updated',
          nodes: [],
          connections: {}
        },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.warnings).not.toContain(expect.stringContaining('meaningful change'));
    });
  });

  describe('Validation Data Consistency', () => {
    it('should warn about invalid validation structure', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        validationBefore: { valid: 'yes' } as any, // Invalid structure
        validationAfter: { valid: true, errors: [] },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.warnings).toContain('Invalid validation_before structure');
    });

    it('should accept valid validation structure', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Test',
        operations: [{ type: 'updateNode' }],
        workflowBefore: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        workflowAfter: { id: 'wf1', name: 'Test', nodes: [], connections: {} },
        validationBefore: { valid: false, errors: [{ type: 'test_error', message: 'Error 1' }] },
        validationAfter: { valid: true, errors: [] },
        mutationSuccess: true,
        durationMs: 100
      };

      const result = validator.validate(data);
      expect(result.warnings).not.toContain(expect.stringContaining('validation'));
    });
  });

  describe('Comprehensive Validation', () => {
    it('should collect multiple errors and warnings', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: '', // Empty - warning
        operations: [], // Empty - error
        workflowBefore: null as any, // Invalid - error
        workflowAfter: { nodes: [] } as any, // Missing connections - error
        mutationSuccess: true,
        durationMs: -50 // Negative - error
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should pass validation with all criteria met', () => {
      const data: WorkflowMutationData = {
        sessionId: 'test-session-123',
        toolName: MutationToolName.UPDATE_PARTIAL,
        userIntent: 'Add error handling to HTTP Request nodes',
        operations: [
          { type: 'updateNode', nodeName: 'node1', updates: { onError: 'continueErrorOutput' } } as UpdateNodeOperation
        ],
        workflowBefore: {
          id: 'wf1',
          name: 'API Workflow',
          nodes: [
            {
              id: 'node1',
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              position: [300, 200],
              parameters: {
                url: 'https://api.example.com',
                method: 'GET'
              }
            }
          ],
          connections: {}
        },
        workflowAfter: {
          id: 'wf1',
          name: 'API Workflow',
          nodes: [
            {
              id: 'node1',
              name: 'HTTP Request',
              type: 'n8n-nodes-base.httpRequest',
              position: [300, 200],
              parameters: {
                url: 'https://api.example.com',
                method: 'GET'
              },
              onError: 'continueErrorOutput'
            }
          ],
          connections: {}
        },
        validationBefore: { valid: true, errors: [] },
        validationAfter: { valid: true, errors: [] },
        mutationSuccess: true,
        durationMs: 245
      };

      const result = validator.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
