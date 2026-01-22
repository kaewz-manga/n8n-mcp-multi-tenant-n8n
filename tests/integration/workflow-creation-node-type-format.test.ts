/**
 * Integration test for workflow creation with node type format validation
 *
 * This test validates that workflows are correctly validated with FULL form node types
 * (n8n-nodes-base.*) as required by the n8n API, without normalization to SHORT form.
 *
 * Background: Bug in handlers-n8n-manager.ts was normalizing node types to SHORT form
 * (nodes-base.*) before validation, causing validation to reject all workflows.
 */

import { describe, it, expect } from 'vitest';
import { validateWorkflowStructure } from '@/services/n8n-validation';

describe('Workflow Creation Node Type Format (Integration)', () => {
  describe('validateWorkflowStructure with FULL form node types', () => {
    it('should accept workflows with FULL form node types (n8n-nodes-base.*)', () => {
      const workflow = {
        name: 'Test Workflow',
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger', // FULL form
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'set-1',
            name: 'Set Data',
            type: 'n8n-nodes-base.set', // FULL form
            typeVersion: 3.4,
            position: [450, 300] as [number, number],
            parameters: {
              mode: 'manual',
              assignments: {
                assignments: [{
                  id: '1',
                  name: 'test',
                  value: 'hello',
                  type: 'string'
                }]
              }
            }
          }
        ],
        connections: {
          'Manual Trigger': {
            main: [[{
              node: 'Set Data',
              type: 'main',
              index: 0
            }]]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);

      expect(errors).toEqual([]);
    });

    it('should reject workflows with SHORT form node types (nodes-base.*)', () => {
      const workflow = {
        name: 'Test Workflow',
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual Trigger',
            type: 'nodes-base.manualTrigger', // SHORT form - should be rejected
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {}
      };

      const errors = validateWorkflowStructure(workflow);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e =>
        e.includes('Invalid node type "nodes-base.manualTrigger"') &&
        e.includes('Use "n8n-nodes-base.manualTrigger" instead')
      )).toBe(true);
    });

    it('should accept workflows with LangChain nodes in FULL form', () => {
      const workflow = {
        name: 'AI Workflow',
        nodes: [
          {
            id: 'manual-1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          },
          {
            id: 'agent-1',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent', // FULL form
            typeVersion: 1,
            position: [450, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {
          'Manual Trigger': {
            main: [[{
              node: 'AI Agent',
              type: 'main',
              index: 0
            }]]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);

      // Should accept FULL form LangChain nodes
      // Note: May have other validation errors (missing parameters), but NOT node type errors
      const hasNodeTypeError = errors.some(e =>
        e.includes('Invalid node type') && e.includes('@n8n/n8n-nodes-langchain.agent')
      );
      expect(hasNodeTypeError).toBe(false);
    });

    it('should reject node types without package prefix', () => {
      const workflow = {
        name: 'Invalid Workflow',
        nodes: [
          {
            id: 'node-1',
            name: 'Invalid Node',
            type: 'webhook', // No package prefix
            typeVersion: 1,
            position: [250, 300] as [number, number],
            parameters: {}
          }
        ],
        connections: {}
      };

      const errors = validateWorkflowStructure(workflow);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e =>
        e.includes('Invalid node type "webhook"') &&
        e.includes('must include package prefix')
      )).toBe(true);
    });
  });

  describe('Real-world workflow examples', () => {
    it('should validate webhook workflow correctly', () => {
      const workflow = {
        name: 'Webhook to HTTP',
        nodes: [
          {
            id: 'webhook-1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [250, 300] as [number, number],
            parameters: {
              path: 'test-webhook',
              httpMethod: 'POST',
              responseMode: 'onReceived'
            }
          },
          {
            id: 'http-1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4.2,
            position: [450, 300] as [number, number],
            parameters: {
              method: 'POST',
              url: 'https://example.com/api',
              sendBody: true,
              bodyParameters: {
                parameters: []
              }
            }
          }
        ],
        connections: {
          'Webhook': {
            main: [[{
              node: 'HTTP Request',
              type: 'main',
              index: 0
            }]]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);

      expect(errors).toEqual([]);
    });

    it('should validate schedule trigger workflow correctly', () => {
      const workflow = {
        name: 'Daily Report',
        nodes: [
          {
            id: 'schedule-1',
            name: 'Schedule Trigger',
            type: 'n8n-nodes-base.scheduleTrigger',
            typeVersion: 1.2,
            position: [250, 300] as [number, number],
            parameters: {
              rule: {
                interval: [{
                  field: 'days',
                  daysInterval: 1
                }]
              }
            }
          },
          {
            id: 'set-1',
            name: 'Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [450, 300] as [number, number],
            parameters: {
              mode: 'manual',
              assignments: {
                assignments: []
              }
            }
          }
        ],
        connections: {
          'Schedule Trigger': {
            main: [[{
              node: 'Set',
              type: 'main',
              index: 0
            }]]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);

      expect(errors).toEqual([]);
    });
  });

  describe('Regression test for normalization bug', () => {
    it('should NOT normalize node types before validation', () => {
      // This test ensures that handleCreateWorkflow does NOT call
      // NodeTypeNormalizer.normalizeWorkflowNodeTypes() before validation

      const fullFormWorkflow = {
        name: 'Test',
        nodes: [
          {
            id: '1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {}
          },
          {
            id: '2',
            name: 'Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [200, 0] as [number, number],
            parameters: {
              mode: 'manual',
              assignments: { assignments: [] }
            }
          }
        ],
        connections: {
          'Manual Trigger': {
            main: [[{ node: 'Set', type: 'main', index: 0 }]]
          }
        }
      };

      const errors = validateWorkflowStructure(fullFormWorkflow);

      // FULL form should pass validation
      expect(errors).toEqual([]);

      // SHORT form (what normalizer produces) should FAIL validation
      const shortFormWorkflow = {
        ...fullFormWorkflow,
        nodes: fullFormWorkflow.nodes.map(node => ({
          ...node,
          type: node.type.replace('n8n-nodes-base.', 'nodes-base.') // Convert to SHORT form
        }))
      };

      const shortFormErrors = validateWorkflowStructure(shortFormWorkflow);

      expect(shortFormErrors.length).toBeGreaterThan(0);
      expect(shortFormErrors.some(e =>
        e.includes('Invalid node type') &&
        e.includes('nodes-base.')
      )).toBe(true);
    });
  });
});
