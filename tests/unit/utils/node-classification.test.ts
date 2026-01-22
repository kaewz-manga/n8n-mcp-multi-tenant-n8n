import { describe, test, expect } from 'vitest';
import {
  isStickyNote,
  isTriggerNode,
  isNonExecutableNode,
  requiresIncomingConnection
} from '@/utils/node-classification';

describe('Node Classification Utilities', () => {
  describe('isStickyNote', () => {
    test('should identify standard sticky note type', () => {
      expect(isStickyNote('n8n-nodes-base.stickyNote')).toBe(true);
    });

    test('should identify normalized sticky note type', () => {
      expect(isStickyNote('nodes-base.stickyNote')).toBe(true);
    });

    test('should identify scoped sticky note type', () => {
      expect(isStickyNote('@n8n/n8n-nodes-base.stickyNote')).toBe(true);
    });

    test('should return false for webhook node', () => {
      expect(isStickyNote('n8n-nodes-base.webhook')).toBe(false);
    });

    test('should return false for HTTP request node', () => {
      expect(isStickyNote('n8n-nodes-base.httpRequest')).toBe(false);
    });

    test('should return false for manual trigger node', () => {
      expect(isStickyNote('n8n-nodes-base.manualTrigger')).toBe(false);
    });

    test('should return false for Set node', () => {
      expect(isStickyNote('n8n-nodes-base.set')).toBe(false);
    });

    test('should return false for empty string', () => {
      expect(isStickyNote('')).toBe(false);
    });
  });

  describe('isTriggerNode', () => {
    test('should identify webhook trigger', () => {
      expect(isTriggerNode('n8n-nodes-base.webhook')).toBe(true);
    });

    test('should identify webhook trigger variant', () => {
      expect(isTriggerNode('n8n-nodes-base.webhookTrigger')).toBe(true);
    });

    test('should identify manual trigger', () => {
      expect(isTriggerNode('n8n-nodes-base.manualTrigger')).toBe(true);
    });

    test('should identify cron trigger', () => {
      expect(isTriggerNode('n8n-nodes-base.cronTrigger')).toBe(true);
    });

    test('should identify schedule trigger', () => {
      expect(isTriggerNode('n8n-nodes-base.scheduleTrigger')).toBe(true);
    });

    test('should return false for HTTP request node', () => {
      expect(isTriggerNode('n8n-nodes-base.httpRequest')).toBe(false);
    });

    test('should return false for Set node', () => {
      expect(isTriggerNode('n8n-nodes-base.set')).toBe(false);
    });

    test('should return false for sticky note', () => {
      expect(isTriggerNode('n8n-nodes-base.stickyNote')).toBe(false);
    });

    test('should return false for empty string', () => {
      expect(isTriggerNode('')).toBe(false);
    });
  });

  describe('isNonExecutableNode', () => {
    test('should identify sticky note as non-executable', () => {
      expect(isNonExecutableNode('n8n-nodes-base.stickyNote')).toBe(true);
    });

    test('should identify all sticky note variations as non-executable', () => {
      expect(isNonExecutableNode('nodes-base.stickyNote')).toBe(true);
      expect(isNonExecutableNode('@n8n/n8n-nodes-base.stickyNote')).toBe(true);
    });

    test('should return false for webhook trigger', () => {
      expect(isNonExecutableNode('n8n-nodes-base.webhook')).toBe(false);
    });

    test('should return false for HTTP request node', () => {
      expect(isNonExecutableNode('n8n-nodes-base.httpRequest')).toBe(false);
    });

    test('should return false for Set node', () => {
      expect(isNonExecutableNode('n8n-nodes-base.set')).toBe(false);
    });

    test('should return false for manual trigger', () => {
      expect(isNonExecutableNode('n8n-nodes-base.manualTrigger')).toBe(false);
    });
  });

  describe('requiresIncomingConnection', () => {
    describe('non-executable nodes (should not require connections)', () => {
      test('should return false for sticky note', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.stickyNote')).toBe(false);
      });

      test('should return false for all sticky note variations', () => {
        expect(requiresIncomingConnection('nodes-base.stickyNote')).toBe(false);
        expect(requiresIncomingConnection('@n8n/n8n-nodes-base.stickyNote')).toBe(false);
      });
    });

    describe('trigger nodes (should not require incoming connections)', () => {
      test('should return false for webhook', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.webhook')).toBe(false);
      });

      test('should return false for webhook trigger', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.webhookTrigger')).toBe(false);
      });

      test('should return false for manual trigger', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.manualTrigger')).toBe(false);
      });

      test('should return false for cron trigger', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.cronTrigger')).toBe(false);
      });

      test('should return false for schedule trigger', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.scheduleTrigger')).toBe(false);
      });
    });

    describe('regular nodes (should require incoming connections)', () => {
      test('should return true for HTTP request node', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.httpRequest')).toBe(true);
      });

      test('should return true for Set node', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.set')).toBe(true);
      });

      test('should return true for Code node', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.code')).toBe(true);
      });

      test('should return true for Function node', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.function')).toBe(true);
      });

      test('should return true for IF node', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.if')).toBe(true);
      });

      test('should return true for Switch node', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.switch')).toBe(true);
      });

      test('should return true for Respond to Webhook node', () => {
        expect(requiresIncomingConnection('n8n-nodes-base.respondToWebhook')).toBe(true);
      });
    });

    describe('edge cases', () => {
      test('should return true for unknown node types (conservative approach)', () => {
        expect(requiresIncomingConnection('unknown-package.unknownNode')).toBe(true);
      });

      test('should return true for empty string', () => {
        expect(requiresIncomingConnection('')).toBe(true);
      });
    });
  });

  describe('integration scenarios', () => {
    test('sticky notes should be non-executable and not require connections', () => {
      const stickyType = 'n8n-nodes-base.stickyNote';
      expect(isNonExecutableNode(stickyType)).toBe(true);
      expect(requiresIncomingConnection(stickyType)).toBe(false);
      expect(isStickyNote(stickyType)).toBe(true);
      expect(isTriggerNode(stickyType)).toBe(false);
    });

    test('webhook nodes should be triggers and not require incoming connections', () => {
      const webhookType = 'n8n-nodes-base.webhook';
      expect(isTriggerNode(webhookType)).toBe(true);
      expect(requiresIncomingConnection(webhookType)).toBe(false);
      expect(isNonExecutableNode(webhookType)).toBe(false);
      expect(isStickyNote(webhookType)).toBe(false);
    });

    test('regular nodes should require incoming connections', () => {
      const httpType = 'n8n-nodes-base.httpRequest';
      expect(requiresIncomingConnection(httpType)).toBe(true);
      expect(isNonExecutableNode(httpType)).toBe(false);
      expect(isTriggerNode(httpType)).toBe(false);
      expect(isStickyNote(httpType)).toBe(false);
    });

    test('all trigger types should not require incoming connections', () => {
      const triggerTypes = [
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.webhookTrigger',
        'n8n-nodes-base.manualTrigger',
        'n8n-nodes-base.cronTrigger',
        'n8n-nodes-base.scheduleTrigger'
      ];

      triggerTypes.forEach(type => {
        expect(isTriggerNode(type)).toBe(true);
        expect(requiresIncomingConnection(type)).toBe(false);
        expect(isNonExecutableNode(type)).toBe(false);
      });
    });

    test('all sticky note variations should be non-executable', () => {
      const stickyTypes = [
        'n8n-nodes-base.stickyNote',
        'nodes-base.stickyNote',
        '@n8n/n8n-nodes-base.stickyNote'
      ];

      stickyTypes.forEach(type => {
        expect(isStickyNote(type)).toBe(true);
        expect(isNonExecutableNode(type)).toBe(true);
        expect(requiresIncomingConnection(type)).toBe(false);
        expect(isTriggerNode(type)).toBe(false);
      });
    });
  });
});
