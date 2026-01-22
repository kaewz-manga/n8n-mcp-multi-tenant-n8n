/**
 * Unit tests for trigger registry
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TriggerRegistry, initializeTriggerRegistry, ensureRegistryInitialized } from '../../../src/triggers/trigger-registry';
import type { N8nApiClient } from '../../../src/services/n8n-api-client';

// Mock N8nApiClient
const createMockClient = (): N8nApiClient => ({
  getWorkflow: vi.fn(),
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  triggerWebhook: vi.fn(),
  getExecution: vi.fn(),
  listExecutions: vi.fn(),
  deleteExecution: vi.fn(),
} as unknown as N8nApiClient);

describe('TriggerRegistry', () => {
  describe('initialization', () => {
    it('should initialize with all handlers registered', async () => {
      await initializeTriggerRegistry();

      const registeredTypes = TriggerRegistry.getRegisteredTypes();

      expect(registeredTypes).toContain('webhook');
      expect(registeredTypes).toContain('form');
      expect(registeredTypes).toContain('chat');
      expect(registeredTypes.length).toBe(3);
    });

    it('should not register duplicate handlers on multiple init calls', async () => {
      await initializeTriggerRegistry();
      const firstTypes = TriggerRegistry.getRegisteredTypes();

      await initializeTriggerRegistry();
      const secondTypes = TriggerRegistry.getRegisteredTypes();

      expect(firstTypes.length).toBe(secondTypes.length);
    });
  });

  describe('hasHandler', () => {
    beforeEach(async () => {
      await ensureRegistryInitialized();
    });

    it('should return true for webhook handler', () => {
      expect(TriggerRegistry.hasHandler('webhook')).toBe(true);
    });

    it('should return true for form handler', () => {
      expect(TriggerRegistry.hasHandler('form')).toBe(true);
    });

    it('should return true for chat handler', () => {
      expect(TriggerRegistry.hasHandler('chat')).toBe(true);
    });

    it('should return false for unknown trigger type', () => {
      expect(TriggerRegistry.hasHandler('unknown' as any)).toBe(false);
    });
  });

  describe('getHandler', () => {
    let mockClient: N8nApiClient;

    beforeEach(async () => {
      await ensureRegistryInitialized();
      mockClient = createMockClient();
    });

    it('should return a webhook handler', () => {
      const handler = TriggerRegistry.getHandler('webhook', mockClient);

      expect(handler).toBeDefined();
      expect(handler?.triggerType).toBe('webhook');
    });

    it('should return a form handler', () => {
      const handler = TriggerRegistry.getHandler('form', mockClient);

      expect(handler).toBeDefined();
      expect(handler?.triggerType).toBe('form');
    });

    it('should return a chat handler', () => {
      const handler = TriggerRegistry.getHandler('chat', mockClient);

      expect(handler).toBeDefined();
      expect(handler?.triggerType).toBe('chat');
    });

    it('should return undefined for unknown trigger type', () => {
      const handler = TriggerRegistry.getHandler('unknown' as any, mockClient);

      expect(handler).toBeUndefined();
    });
  });

  describe('handler capabilities', () => {
    let mockClient: N8nApiClient;

    beforeEach(async () => {
      await ensureRegistryInitialized();
      mockClient = createMockClient();
    });

    it('webhook handler should require active workflow', () => {
      const handler = TriggerRegistry.getHandler('webhook', mockClient);

      expect(handler?.capabilities.requiresActiveWorkflow).toBe(true);
      expect(handler?.capabilities.canPassInputData).toBe(true);
    });

    it('form handler should require active workflow', () => {
      const handler = TriggerRegistry.getHandler('form', mockClient);

      expect(handler?.capabilities.requiresActiveWorkflow).toBe(true);
      expect(handler?.capabilities.canPassInputData).toBe(true);
    });

    it('chat handler should require active workflow', () => {
      const handler = TriggerRegistry.getHandler('chat', mockClient);

      expect(handler?.capabilities.requiresActiveWorkflow).toBe(true);
      expect(handler?.capabilities.canPassInputData).toBe(true);
    });
  });

  describe('ensureRegistryInitialized', () => {
    it('should be safe to call multiple times', async () => {
      await ensureRegistryInitialized();
      await ensureRegistryInitialized();
      await ensureRegistryInitialized();

      const types = TriggerRegistry.getRegisteredTypes();
      expect(types.length).toBe(3);
    });

    it('should handle concurrent initialization calls', async () => {
      const promises = [
        ensureRegistryInitialized(),
        ensureRegistryInitialized(),
        ensureRegistryInitialized(),
      ];

      await Promise.all(promises);

      const types = TriggerRegistry.getRegisteredTypes();
      expect(types.length).toBe(3);
    });
  });
});
