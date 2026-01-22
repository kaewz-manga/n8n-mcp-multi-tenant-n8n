/**
 * Tests for NodeTypeNormalizer
 *
 * Comprehensive test suite for the node type normalization utility
 * that fixes the critical issue of AI agents producing short-form node types
 */

import { describe, it, expect } from 'vitest';
import { NodeTypeNormalizer } from '../../../src/utils/node-type-normalizer';

describe('NodeTypeNormalizer', () => {
  describe('normalizeToFullForm', () => {
    describe('Base nodes', () => {
      it('should normalize full base form to short form', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('n8n-nodes-base.webhook'))
          .toBe('nodes-base.webhook');
      });

      it('should normalize full base form with different node names', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('n8n-nodes-base.httpRequest'))
          .toBe('nodes-base.httpRequest');
        expect(NodeTypeNormalizer.normalizeToFullForm('n8n-nodes-base.set'))
          .toBe('nodes-base.set');
        expect(NodeTypeNormalizer.normalizeToFullForm('n8n-nodes-base.slack'))
          .toBe('nodes-base.slack');
      });

      it('should leave short base form unchanged', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('nodes-base.webhook'))
          .toBe('nodes-base.webhook');
        expect(NodeTypeNormalizer.normalizeToFullForm('nodes-base.httpRequest'))
          .toBe('nodes-base.httpRequest');
      });
    });

    describe('LangChain nodes', () => {
      it('should normalize full langchain form to short form', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('@n8n/n8n-nodes-langchain.agent'))
          .toBe('nodes-langchain.agent');
        expect(NodeTypeNormalizer.normalizeToFullForm('@n8n/n8n-nodes-langchain.openAi'))
          .toBe('nodes-langchain.openAi');
      });

      it('should normalize langchain form with n8n- prefix but missing @n8n/', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('n8n-nodes-langchain.agent'))
          .toBe('nodes-langchain.agent');
      });

      it('should leave short langchain form unchanged', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('nodes-langchain.agent'))
          .toBe('nodes-langchain.agent');
        expect(NodeTypeNormalizer.normalizeToFullForm('nodes-langchain.openAi'))
          .toBe('nodes-langchain.openAi');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty string', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('')).toBe('');
      });

      it('should handle null', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm(null as any)).toBe(null);
      });

      it('should handle undefined', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm(undefined as any)).toBe(undefined);
      });

      it('should handle non-string input', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm(123 as any)).toBe(123);
        expect(NodeTypeNormalizer.normalizeToFullForm({} as any)).toEqual({});
      });

      it('should leave community nodes unchanged', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('custom-package.myNode'))
          .toBe('custom-package.myNode');
      });

      it('should leave nodes without prefixes unchanged', () => {
        expect(NodeTypeNormalizer.normalizeToFullForm('someRandomNode'))
          .toBe('someRandomNode');
      });
    });
  });

  describe('normalizeWithDetails', () => {
    it('should return normalization details for full base form', () => {
      const result = NodeTypeNormalizer.normalizeWithDetails('n8n-nodes-base.webhook');

      expect(result).toEqual({
        original: 'n8n-nodes-base.webhook',
        normalized: 'nodes-base.webhook',
        wasNormalized: true,
        package: 'base'
      });
    });

    it('should return normalization details for already short form', () => {
      const result = NodeTypeNormalizer.normalizeWithDetails('nodes-base.webhook');

      expect(result).toEqual({
        original: 'nodes-base.webhook',
        normalized: 'nodes-base.webhook',
        wasNormalized: false,
        package: 'base'
      });
    });

    it('should detect langchain package', () => {
      const result = NodeTypeNormalizer.normalizeWithDetails('@n8n/n8n-nodes-langchain.agent');

      expect(result).toEqual({
        original: '@n8n/n8n-nodes-langchain.agent',
        normalized: 'nodes-langchain.agent',
        wasNormalized: true,
        package: 'langchain'
      });
    });

    it('should detect community package', () => {
      const result = NodeTypeNormalizer.normalizeWithDetails('custom-package.myNode');

      expect(result).toEqual({
        original: 'custom-package.myNode',
        normalized: 'custom-package.myNode',
        wasNormalized: false,
        package: 'community'
      });
    });

    it('should detect unknown package', () => {
      const result = NodeTypeNormalizer.normalizeWithDetails('unknownNode');

      expect(result).toEqual({
        original: 'unknownNode',
        normalized: 'unknownNode',
        wasNormalized: false,
        package: 'unknown'
      });
    });
  });

  describe('normalizeBatch', () => {
    it('should normalize multiple node types', () => {
      const types = ['n8n-nodes-base.webhook', 'n8n-nodes-base.set', '@n8n/n8n-nodes-langchain.agent'];
      const result = NodeTypeNormalizer.normalizeBatch(types);

      expect(result.size).toBe(3);
      expect(result.get('n8n-nodes-base.webhook')).toBe('nodes-base.webhook');
      expect(result.get('n8n-nodes-base.set')).toBe('nodes-base.set');
      expect(result.get('@n8n/n8n-nodes-langchain.agent')).toBe('nodes-langchain.agent');
    });

    it('should handle empty array', () => {
      const result = NodeTypeNormalizer.normalizeBatch([]);
      expect(result.size).toBe(0);
    });

    it('should handle mixed forms', () => {
      const types = [
        'n8n-nodes-base.webhook',
        'nodes-base.set',
        '@n8n/n8n-nodes-langchain.agent',
        'nodes-langchain.openAi'
      ];
      const result = NodeTypeNormalizer.normalizeBatch(types);

      expect(result.size).toBe(4);
      expect(result.get('n8n-nodes-base.webhook')).toBe('nodes-base.webhook');
      expect(result.get('nodes-base.set')).toBe('nodes-base.set');
      expect(result.get('@n8n/n8n-nodes-langchain.agent')).toBe('nodes-langchain.agent');
      expect(result.get('nodes-langchain.openAi')).toBe('nodes-langchain.openAi');
    });
  });

  describe('normalizeWorkflowNodeTypes', () => {
    it('should normalize all nodes in workflow', () => {
      const workflow = {
        nodes: [
          { type: 'n8n-nodes-base.webhook', id: '1', name: 'Webhook', parameters: {}, position: [0, 0] },
          { type: 'n8n-nodes-base.set', id: '2', name: 'Set', parameters: {}, position: [100, 100] }
        ],
        connections: {}
      };

      const result = NodeTypeNormalizer.normalizeWorkflowNodeTypes(workflow);

      expect(result.nodes[0].type).toBe('nodes-base.webhook');
      expect(result.nodes[1].type).toBe('nodes-base.set');
    });

    it('should preserve all other node properties', () => {
      const workflow = {
        nodes: [
          {
            type: 'n8n-nodes-base.webhook',
            id: 'test-id',
            name: 'Test Webhook',
            parameters: { path: '/test' },
            position: [250, 300],
            credentials: { webhookAuth: { id: '1', name: 'Test' } }
          }
        ],
        connections: {}
      };

      const result = NodeTypeNormalizer.normalizeWorkflowNodeTypes(workflow);

      expect(result.nodes[0]).toEqual({
        type: 'nodes-base.webhook', // normalized to short form
        id: 'test-id', // preserved
        name: 'Test Webhook', // preserved
        parameters: { path: '/test' }, // preserved
        position: [250, 300], // preserved
        credentials: { webhookAuth: { id: '1', name: 'Test' } } // preserved
      });
    });

    it('should preserve workflow properties', () => {
      const workflow = {
        name: 'Test Workflow',
        active: true,
        nodes: [
          { type: 'n8n-nodes-base.webhook', id: '1', name: 'Webhook', parameters: {}, position: [0, 0] }
        ],
        connections: {
          '1': { main: [[{ node: '2', type: 'main', index: 0 }]] }
        }
      };

      const result = NodeTypeNormalizer.normalizeWorkflowNodeTypes(workflow);

      expect(result.name).toBe('Test Workflow');
      expect(result.active).toBe(true);
      expect(result.connections).toEqual({
        '1': { main: [[{ node: '2', type: 'main', index: 0 }]] }
      });
    });

    it('should handle workflow without nodes', () => {
      const workflow = { connections: {} };
      const result = NodeTypeNormalizer.normalizeWorkflowNodeTypes(workflow);
      expect(result).toEqual(workflow);
    });

    it('should handle null workflow', () => {
      const result = NodeTypeNormalizer.normalizeWorkflowNodeTypes(null);
      expect(result).toBe(null);
    });

    it('should handle workflow with empty nodes array', () => {
      const workflow = { nodes: [], connections: {} };
      const result = NodeTypeNormalizer.normalizeWorkflowNodeTypes(workflow);
      expect(result.nodes).toEqual([]);
    });
  });

  describe('isFullForm', () => {
    it('should return true for full base form', () => {
      expect(NodeTypeNormalizer.isFullForm('n8n-nodes-base.webhook')).toBe(true);
    });

    it('should return true for full langchain form', () => {
      expect(NodeTypeNormalizer.isFullForm('@n8n/n8n-nodes-langchain.agent')).toBe(true);
      expect(NodeTypeNormalizer.isFullForm('n8n-nodes-langchain.agent')).toBe(true);
    });

    it('should return false for short base form', () => {
      expect(NodeTypeNormalizer.isFullForm('nodes-base.webhook')).toBe(false);
    });

    it('should return false for short langchain form', () => {
      expect(NodeTypeNormalizer.isFullForm('nodes-langchain.agent')).toBe(false);
    });

    it('should return false for community nodes', () => {
      expect(NodeTypeNormalizer.isFullForm('custom-package.myNode')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(NodeTypeNormalizer.isFullForm(null as any)).toBe(false);
      expect(NodeTypeNormalizer.isFullForm(undefined as any)).toBe(false);
    });
  });

  describe('isShortForm', () => {
    it('should return true for short base form', () => {
      expect(NodeTypeNormalizer.isShortForm('nodes-base.webhook')).toBe(true);
    });

    it('should return true for short langchain form', () => {
      expect(NodeTypeNormalizer.isShortForm('nodes-langchain.agent')).toBe(true);
    });

    it('should return false for full base form', () => {
      expect(NodeTypeNormalizer.isShortForm('n8n-nodes-base.webhook')).toBe(false);
    });

    it('should return false for full langchain form', () => {
      expect(NodeTypeNormalizer.isShortForm('@n8n/n8n-nodes-langchain.agent')).toBe(false);
      expect(NodeTypeNormalizer.isShortForm('n8n-nodes-langchain.agent')).toBe(false);
    });

    it('should return false for community nodes', () => {
      expect(NodeTypeNormalizer.isShortForm('custom-package.myNode')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(NodeTypeNormalizer.isShortForm(null as any)).toBe(false);
      expect(NodeTypeNormalizer.isShortForm(undefined as any)).toBe(false);
    });
  });

  describe('toWorkflowFormat', () => {
    describe('Base nodes', () => {
      it('should convert short base form to full workflow format', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('nodes-base.webhook'))
          .toBe('n8n-nodes-base.webhook');
      });

      it('should convert multiple base nodes', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('nodes-base.httpRequest'))
          .toBe('n8n-nodes-base.httpRequest');
        expect(NodeTypeNormalizer.toWorkflowFormat('nodes-base.set'))
          .toBe('n8n-nodes-base.set');
        expect(NodeTypeNormalizer.toWorkflowFormat('nodes-base.slack'))
          .toBe('n8n-nodes-base.slack');
      });

      it('should leave full base form unchanged', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('n8n-nodes-base.webhook'))
          .toBe('n8n-nodes-base.webhook');
        expect(NodeTypeNormalizer.toWorkflowFormat('n8n-nodes-base.httpRequest'))
          .toBe('n8n-nodes-base.httpRequest');
      });
    });

    describe('LangChain nodes', () => {
      it('should convert short langchain form to full workflow format', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('nodes-langchain.agent'))
          .toBe('@n8n/n8n-nodes-langchain.agent');
        expect(NodeTypeNormalizer.toWorkflowFormat('nodes-langchain.openAi'))
          .toBe('@n8n/n8n-nodes-langchain.openAi');
      });

      it('should leave full langchain form unchanged', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('@n8n/n8n-nodes-langchain.agent'))
          .toBe('@n8n/n8n-nodes-langchain.agent');
        expect(NodeTypeNormalizer.toWorkflowFormat('@n8n/n8n-nodes-langchain.openAi'))
          .toBe('@n8n/n8n-nodes-langchain.openAi');
      });

      it('should leave n8n-nodes-langchain form unchanged', () => {
        // Alternative full form without @n8n/ prefix
        expect(NodeTypeNormalizer.toWorkflowFormat('n8n-nodes-langchain.agent'))
          .toBe('n8n-nodes-langchain.agent');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty string', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('')).toBe('');
      });

      it('should handle null', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat(null as any)).toBe(null);
      });

      it('should handle undefined', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat(undefined as any)).toBe(undefined);
      });

      it('should handle non-string input', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat(123 as any)).toBe(123);
        expect(NodeTypeNormalizer.toWorkflowFormat({} as any)).toEqual({});
      });

      it('should leave community nodes unchanged', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('custom-package.myNode'))
          .toBe('custom-package.myNode');
      });

      it('should leave nodes without prefixes unchanged', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('someRandomNode'))
          .toBe('someRandomNode');
      });
    });

    describe('Tool variants', () => {
      it('should convert short Tool variant to full form', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('nodes-base.supabaseTool'))
          .toBe('n8n-nodes-base.supabaseTool');
        expect(NodeTypeNormalizer.toWorkflowFormat('nodes-base.postgresTool'))
          .toBe('n8n-nodes-base.postgresTool');
      });

      it('should leave full Tool variant unchanged', () => {
        expect(NodeTypeNormalizer.toWorkflowFormat('n8n-nodes-base.supabaseTool'))
          .toBe('n8n-nodes-base.supabaseTool');
      });
    });

    describe('Round-trip conversion', () => {
      it('should maintain workflow format through round trip', () => {
        const workflowType = 'n8n-nodes-base.webhook';

        // Convert to short (database) form
        const shortForm = NodeTypeNormalizer.normalizeToFullForm(workflowType);
        expect(shortForm).toBe('nodes-base.webhook');

        // Convert back to workflow form
        const backToWorkflow = NodeTypeNormalizer.toWorkflowFormat(shortForm);
        expect(backToWorkflow).toBe(workflowType);
      });

      it('should handle langchain round trip', () => {
        const workflowType = '@n8n/n8n-nodes-langchain.agent';

        // Convert to short form
        const shortForm = NodeTypeNormalizer.normalizeToFullForm(workflowType);
        expect(shortForm).toBe('nodes-langchain.agent');

        // Convert back to workflow form
        const backToWorkflow = NodeTypeNormalizer.toWorkflowFormat(shortForm);
        expect(backToWorkflow).toBe(workflowType);
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle the critical use case from P0-R1', () => {
      // This is the exact scenario - normalize full form to match database
      const fullFormType = 'n8n-nodes-base.webhook'; // External source produces this
      const normalized = NodeTypeNormalizer.normalizeToFullForm(fullFormType);

      expect(normalized).toBe('nodes-base.webhook'); // Database stores in short form
    });

    it('should work correctly in a workflow validation scenario', () => {
      const workflow = {
        nodes: [
          { type: 'n8n-nodes-base.webhook', id: '1', name: 'Webhook', parameters: {}, position: [0, 0] },
          { type: 'n8n-nodes-base.httpRequest', id: '2', name: 'HTTP', parameters: {}, position: [200, 0] },
          { type: 'nodes-base.set', id: '3', name: 'Set', parameters: {}, position: [400, 0] }
        ],
        connections: {}
      };

      const normalized = NodeTypeNormalizer.normalizeWorkflowNodeTypes(workflow);

      // All node types should now be in short form for database lookup
      expect(normalized.nodes.every((n: any) => n.type.startsWith('nodes-base.'))).toBe(true);
    });

    it('should convert database format to workflow format for API calls', () => {
      // Scenario: Reading from database and sending to n8n API
      const dbTypes = [
        'nodes-base.webhook',
        'nodes-base.httpRequest',
        'nodes-langchain.agent'
      ];

      const workflowTypes = dbTypes.map(t => NodeTypeNormalizer.toWorkflowFormat(t));

      expect(workflowTypes).toEqual([
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.httpRequest',
        '@n8n/n8n-nodes-langchain.agent'
      ]);
    });

    it('should handle Tool variant correction scenario', () => {
      // Scenario: Auto-fixer changes base node to Tool variant
      const baseType = 'n8n-nodes-base.supabase'; // Current type in workflow
      const toolVariantShort = 'nodes-base.supabaseTool'; // From database/generator

      // Convert to workflow format for the fix
      const fixedType = NodeTypeNormalizer.toWorkflowFormat(toolVariantShort);

      expect(fixedType).toBe('n8n-nodes-base.supabaseTool');
    });
  });
});
