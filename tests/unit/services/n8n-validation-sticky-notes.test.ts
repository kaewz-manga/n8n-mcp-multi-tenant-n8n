import { describe, test, expect } from 'vitest';
import { validateWorkflowStructure } from '@/services/n8n-validation';
import type { Workflow } from '@/types/n8n-api';

describe('n8n-validation - Sticky Notes Bug Fix', () => {
  describe('sticky notes should be excluded from disconnected nodes validation', () => {
    test('should allow workflow with sticky notes and connected functional nodes', () => {
      const workflow: Partial<Workflow> = {
        name: 'Test Workflow',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: { path: '/test' }
          },
          {
            id: '2',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [450, 300],
            parameters: {}
          },
          {
            id: 'sticky1',
            name: 'Documentation Note',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [250, 100],
            parameters: { content: 'This is a documentation note' }
          }
        ],
        connections: {
          'Webhook': {
            main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);

      // Should have no errors - sticky note should be ignored
      expect(errors).toEqual([]);
    });

    test('should handle multiple sticky notes without errors', () => {
      const workflow: Partial<Workflow> = {
        name: 'Documented Workflow',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: { path: '/test' }
          },
          {
            id: '2',
            name: 'Process',
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            position: [450, 300],
            parameters: {}
          },
          // 10 sticky notes for documentation
          ...Array.from({ length: 10 }, (_, i) => ({
            id: `sticky${i}`,
            name: `📝 Note ${i}`,
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [100 + i * 50, 100] as [number, number],
            parameters: { content: `Documentation note ${i}` }
          }))
        ],
        connections: {
          'Webhook': {
            main: [[{ node: 'Process', type: 'main', index: 0 }]]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);
      expect(errors).toEqual([]);
    });

    test('should handle all sticky note type variations', () => {
      const stickyTypes = [
        'n8n-nodes-base.stickyNote',
        'nodes-base.stickyNote',
        '@n8n/n8n-nodes-base.stickyNote'
      ];

      stickyTypes.forEach((stickyType, index) => {
        const workflow: Partial<Workflow> = {
          name: 'Test Workflow',
          nodes: [
            {
              id: '1',
              name: 'Webhook',
              type: 'n8n-nodes-base.webhook',
              typeVersion: 1,
              position: [250, 300],
              parameters: { path: '/test' }
            },
            {
              id: `sticky${index}`,
              name: `Note ${index}`,
              type: stickyType,
              typeVersion: 1,
              position: [250, 100],
              parameters: { content: `Note ${index}` }
            }
          ],
          connections: {}
        };

        const errors = validateWorkflowStructure(workflow);

        // Sticky note should be ignored regardless of type variation
        expect(errors.every(e => !e.includes(`Note ${index}`))).toBe(true);
      });
    });

    test('should handle complex workflow with multiple sticky notes (real-world scenario)', () => {
      // Simulates workflow like "POST /auth/login" with 4 sticky notes
      const workflow: Partial<Workflow> = {
        name: 'POST /auth/login',
        nodes: [
          {
            id: 'webhook1',
            name: 'Webhook Trigger',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: { path: '/auth/login', httpMethod: 'POST' }
          },
          {
            id: 'http1',
            name: 'Authenticate',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [450, 300],
            parameters: {}
          },
          {
            id: 'respond1',
            name: 'Return Success',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1,
            position: [650, 250],
            parameters: {}
          },
          {
            id: 'respond2',
            name: 'Return Error',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1,
            position: [650, 350],
            parameters: {}
          },
          // 4 sticky notes for documentation
          {
            id: 'sticky1',
            name: '📝 Webhook Trigger',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [250, 150],
            parameters: { content: 'Receives login request' }
          },
          {
            id: 'sticky2',
            name: '📝 Authenticate with Supabase',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [450, 150],
            parameters: { content: 'Validates credentials' }
          },
          {
            id: 'sticky3',
            name: '📝 Return Tokens',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [650, 150],
            parameters: { content: 'Returns access and refresh tokens' }
          },
          {
            id: 'sticky4',
            name: '📝 Return Error',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [650, 450],
            parameters: { content: 'Returns error message' }
          }
        ],
        connections: {
          'Webhook Trigger': {
            main: [[{ node: 'Authenticate', type: 'main', index: 0 }]]
          },
          'Authenticate': {
            main: [
              [{ node: 'Return Success', type: 'main', index: 0 }],
              [{ node: 'Return Error', type: 'main', index: 0 }]
            ]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);

      // Should have no errors - all sticky notes should be ignored
      expect(errors).toEqual([]);
    });
  });

  describe('validation should still detect truly disconnected functional nodes', () => {
    test('should detect disconnected HTTP node but ignore sticky note', () => {
      const workflow: Partial<Workflow> = {
        name: 'Test Workflow',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: { path: '/test' }
          },
          {
            id: '2',
            name: 'Disconnected HTTP',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [450, 300],
            parameters: {}
          },
          {
            id: 'sticky1',
            name: 'Sticky Note',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [250, 100],
            parameters: { content: 'Note' }
          }
        ],
        connections: {} // No connections
      };

      const errors = validateWorkflowStructure(workflow);

      // Should error on HTTP node, but NOT on sticky note
      expect(errors.length).toBeGreaterThan(0);
      const disconnectedError = errors.find(e => e.includes('Disconnected'));
      expect(disconnectedError).toBeDefined();
      expect(disconnectedError).toContain('Disconnected HTTP');
      expect(disconnectedError).not.toContain('Sticky Note');
    });

    test('should detect multiple disconnected functional nodes but ignore sticky notes', () => {
      const workflow: Partial<Workflow> = {
        name: 'Test Workflow',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: { path: '/test' }
          },
          {
            id: '2',
            name: 'Disconnected HTTP',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [450, 300],
            parameters: {}
          },
          {
            id: '3',
            name: 'Disconnected Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            position: [650, 300],
            parameters: {}
          },
          // Multiple sticky notes that should be ignored
          {
            id: 'sticky1',
            name: 'Note 1',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [250, 100],
            parameters: { content: 'Note 1' }
          },
          {
            id: 'sticky2',
            name: 'Note 2',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [450, 100],
            parameters: { content: 'Note 2' }
          }
        ],
        connections: {} // No connections
      };

      const errors = validateWorkflowStructure(workflow);

      // Should error because there are no connections
      // When there are NO connections, validation shows "Multi-node workflow has no connections"
      // This is the expected behavior - it suggests connecting any two executable nodes
      expect(errors.length).toBeGreaterThan(0);
      const connectionError = errors.find(e => e.includes('no connections') || e.includes('Disconnected'));
      expect(connectionError).toBeDefined();
      // Error should NOT mention sticky notes
      expect(connectionError).not.toContain('Note 1');
      expect(connectionError).not.toContain('Note 2');
    });

    test('should allow sticky notes but still validate functional node connections', () => {
      const workflow: Partial<Workflow> = {
        name: 'Test Workflow',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: { path: '/test' }
          },
          {
            id: '2',
            name: 'Connected HTTP',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [450, 300],
            parameters: {}
          },
          {
            id: '3',
            name: 'Disconnected Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            position: [650, 300],
            parameters: {}
          },
          {
            id: 'sticky1',
            name: 'Sticky Note',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [250, 100],
            parameters: { content: 'Note' }
          }
        ],
        connections: {
          'Webhook': {
            main: [[{ node: 'Connected HTTP', type: 'main', index: 0 }]]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);

      // Should error only on disconnected Set node
      expect(errors.length).toBeGreaterThan(0);
      const disconnectedError = errors.find(e => e.includes('Disconnected'));
      expect(disconnectedError).toBeDefined();
      expect(disconnectedError).toContain('Disconnected Set');
      expect(disconnectedError).not.toContain('Connected HTTP');
      expect(disconnectedError).not.toContain('Sticky Note');
    });
  });

  describe('regression tests - ensure sticky notes work like in n8n UI', () => {
    test('single webhook with sticky notes should be valid (matches n8n UI behavior)', () => {
      const workflow: Partial<Workflow> = {
        name: 'Webhook Only with Notes',
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: { path: '/test' }
          },
          {
            id: 'sticky1',
            name: 'Usage Instructions',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [250, 100],
            parameters: { content: 'Call this webhook to trigger the workflow' }
          }
        ],
        connections: {}
      };

      const errors = validateWorkflowStructure(workflow);

      // Webhook-only workflows are valid in n8n
      // Sticky notes should not affect this
      expect(errors).toEqual([]);
    });

    test('workflow with only sticky notes should be invalid (no executable nodes)', () => {
      const workflow: Partial<Workflow> = {
        name: 'Only Notes',
        nodes: [
          {
            id: 'sticky1',
            name: 'Note 1',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [250, 100],
            parameters: { content: 'Note 1' }
          },
          {
            id: 'sticky2',
            name: 'Note 2',
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [450, 100],
            parameters: { content: 'Note 2' }
          }
        ],
        connections: {}
      };

      const errors = validateWorkflowStructure(workflow);

      // Should fail because there are no executable nodes
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('at least one executable node'))).toBe(true);
    });

    test('complex production workflow structure should validate correctly', () => {
      // Tests a realistic production workflow structure
      const workflow: Partial<Workflow> = {
        name: 'Production API Endpoint',
        nodes: [
          // Functional nodes
          {
            id: 'webhook1',
            name: 'API Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [250, 300],
            parameters: { path: '/api/endpoint' }
          },
          {
            id: 'validate1',
            name: 'Validate Input',
            type: 'n8n-nodes-base.code',
            typeVersion: 2,
            position: [450, 300],
            parameters: {}
          },
          {
            id: 'branch1',
            name: 'Check Valid',
            type: 'n8n-nodes-base.if',
            typeVersion: 2,
            position: [650, 300],
            parameters: {}
          },
          {
            id: 'process1',
            name: 'Process Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 3,
            position: [850, 250],
            parameters: {}
          },
          {
            id: 'success1',
            name: 'Return Success',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1,
            position: [1050, 250],
            parameters: {}
          },
          {
            id: 'error1',
            name: 'Return Error',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1,
            position: [850, 350],
            parameters: {}
          },
          // Documentation sticky notes (11 notes like in real workflow)
          ...Array.from({ length: 11 }, (_, i) => ({
            id: `sticky${i}`,
            name: `📝 Documentation ${i}`,
            type: 'n8n-nodes-base.stickyNote',
            typeVersion: 1,
            position: [250 + i * 100, 100] as [number, number],
            parameters: { content: `Documentation section ${i}` }
          }))
        ],
        connections: {
          'API Webhook': {
            main: [[{ node: 'Validate Input', type: 'main', index: 0 }]]
          },
          'Validate Input': {
            main: [[{ node: 'Check Valid', type: 'main', index: 0 }]]
          },
          'Check Valid': {
            main: [
              [{ node: 'Process Request', type: 'main', index: 0 }],
              [{ node: 'Return Error', type: 'main', index: 0 }]
            ]
          },
          'Process Request': {
            main: [[{ node: 'Return Success', type: 'main', index: 0 }]]
          }
        }
      };

      const errors = validateWorkflowStructure(workflow);

      // Should be valid - all functional nodes connected, sticky notes ignored
      expect(errors).toEqual([]);
    });
  });
});
