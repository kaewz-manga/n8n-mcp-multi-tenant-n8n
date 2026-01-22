import { describe, it, expect } from 'vitest';
import { getNodeTypeAlternatives, normalizeNodeType, getWorkflowNodeType } from '../../../src/utils/node-utils';

describe('node-utils', () => {
  describe('getNodeTypeAlternatives', () => {
    describe('valid inputs', () => {
      it('should generate alternatives for standard node type', () => {
        const alternatives = getNodeTypeAlternatives('nodes-base.httpRequest');

        expect(alternatives).toContain('nodes-base.httprequest');
        expect(alternatives.length).toBeGreaterThan(0);
      });

      it('should generate alternatives for langchain node type', () => {
        const alternatives = getNodeTypeAlternatives('nodes-langchain.agent');

        expect(alternatives).toContain('nodes-langchain.agent');
        expect(alternatives.length).toBeGreaterThan(0);
      });

      it('should generate alternatives for bare node name', () => {
        const alternatives = getNodeTypeAlternatives('webhook');

        expect(alternatives).toContain('nodes-base.webhook');
        expect(alternatives).toContain('nodes-langchain.webhook');
      });
    });

    describe('invalid inputs - defensive validation', () => {
      it('should return empty array for undefined', () => {
        const alternatives = getNodeTypeAlternatives(undefined as any);

        expect(alternatives).toEqual([]);
      });

      it('should return empty array for null', () => {
        const alternatives = getNodeTypeAlternatives(null as any);

        expect(alternatives).toEqual([]);
      });

      it('should return empty array for empty string', () => {
        const alternatives = getNodeTypeAlternatives('');

        expect(alternatives).toEqual([]);
      });

      it('should return empty array for whitespace-only string', () => {
        const alternatives = getNodeTypeAlternatives('   ');

        expect(alternatives).toEqual([]);
      });

      it('should return empty array for non-string input (number)', () => {
        const alternatives = getNodeTypeAlternatives(123 as any);

        expect(alternatives).toEqual([]);
      });

      it('should return empty array for non-string input (object)', () => {
        const alternatives = getNodeTypeAlternatives({} as any);

        expect(alternatives).toEqual([]);
      });

      it('should return empty array for non-string input (array)', () => {
        const alternatives = getNodeTypeAlternatives([] as any);

        expect(alternatives).toEqual([]);
      });
    });

    describe('edge cases', () => {
      it('should handle node type with only prefix', () => {
        const alternatives = getNodeTypeAlternatives('nodes-base.');

        expect(alternatives).toBeInstanceOf(Array);
      });

      it('should handle node type with multiple dots', () => {
        const alternatives = getNodeTypeAlternatives('nodes-base.some.complex.type');

        expect(alternatives).toBeInstanceOf(Array);
        expect(alternatives.length).toBeGreaterThan(0);
      });

      it('should handle camelCase node names', () => {
        const alternatives = getNodeTypeAlternatives('nodes-base.httpRequest');

        expect(alternatives).toContain('nodes-base.httprequest');
      });
    });
  });

  describe('normalizeNodeType', () => {
    it('should normalize n8n-nodes-base prefix', () => {
      expect(normalizeNodeType('n8n-nodes-base.webhook')).toBe('nodes-base.webhook');
    });

    it('should normalize @n8n/n8n-nodes-langchain prefix', () => {
      expect(normalizeNodeType('@n8n/n8n-nodes-langchain.agent')).toBe('nodes-langchain.agent');
    });

    it('should normalize n8n-nodes-langchain prefix', () => {
      expect(normalizeNodeType('n8n-nodes-langchain.chatTrigger')).toBe('nodes-langchain.chatTrigger');
    });

    it('should leave already normalized types unchanged', () => {
      expect(normalizeNodeType('nodes-base.slack')).toBe('nodes-base.slack');
    });

    it('should leave community nodes unchanged', () => {
      expect(normalizeNodeType('community.customNode')).toBe('community.customNode');
    });
  });

  describe('getWorkflowNodeType', () => {
    it('should construct workflow node type for n8n-nodes-base', () => {
      expect(getWorkflowNodeType('n8n-nodes-base', 'nodes-base.webhook')).toBe('n8n-nodes-base.webhook');
    });

    it('should construct workflow node type for langchain', () => {
      expect(getWorkflowNodeType('@n8n/n8n-nodes-langchain', 'nodes-langchain.agent')).toBe('@n8n/n8n-nodes-langchain.agent');
    });

    it('should return as-is for unknown packages', () => {
      expect(getWorkflowNodeType('custom-package', 'custom.node')).toBe('custom.node');
    });
  });
});
