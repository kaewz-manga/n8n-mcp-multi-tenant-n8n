/**
 * Tests for EnhancedConfigValidator operation and resource validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnhancedConfigValidator } from '../../../src/services/enhanced-config-validator';
import { NodeRepository } from '../../../src/database/node-repository';
import { createTestDatabase } from '../../utils/database-utils';

describe('EnhancedConfigValidator - Operation and Resource Validation', () => {
  let repository: NodeRepository;
  let testDb: any;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = testDb.nodeRepository;

    // Initialize similarity services
    EnhancedConfigValidator.initializeSimilarityServices(repository);

    // Add Google Drive test node
    const googleDriveNode = {
      nodeType: 'nodes-base.googleDrive',
      packageName: 'n8n-nodes-base',
      displayName: 'Google Drive',
      description: 'Access Google Drive',
      category: 'transform',
      style: 'declarative' as const,
      isAITool: false,
      isTrigger: false,
      isWebhook: false,
      isVersioned: true,
      version: '1',
      properties: [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'file', name: 'File' },
            { value: 'folder', name: 'Folder' },
            { value: 'fileFolder', name: 'File & Folder' }
          ]
        },
        {
          name: 'operation',
          type: 'options',
          required: true,
          displayOptions: {
            show: {
              resource: ['file']
            }
          },
          options: [
            { value: 'copy', name: 'Copy' },
            { value: 'delete', name: 'Delete' },
            { value: 'download', name: 'Download' },
            { value: 'list', name: 'List' },
            { value: 'share', name: 'Share' },
            { value: 'update', name: 'Update' },
            { value: 'upload', name: 'Upload' }
          ]
        },
        {
          name: 'operation',
          type: 'options',
          required: true,
          displayOptions: {
            show: {
              resource: ['folder']
            }
          },
          options: [
            { value: 'create', name: 'Create' },
            { value: 'delete', name: 'Delete' },
            { value: 'share', name: 'Share' }
          ]
        },
        {
          name: 'operation',
          type: 'options',
          required: true,
          displayOptions: {
            show: {
              resource: ['fileFolder']
            }
          },
          options: [
            { value: 'search', name: 'Search' }
          ]
        }
      ],
      operations: [],
      credentials: []
    };

    repository.saveNode(googleDriveNode);

    // Add Slack test node
    const slackNode = {
      nodeType: 'nodes-base.slack',
      packageName: 'n8n-nodes-base',
      displayName: 'Slack',
      description: 'Send messages to Slack',
      category: 'communication',
      style: 'declarative' as const,
      isAITool: false,
      isTrigger: false,
      isWebhook: false,
      isVersioned: true,
      version: '2',
      properties: [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'channel', name: 'Channel' },
            { value: 'message', name: 'Message' },
            { value: 'user', name: 'User' }
          ]
        },
        {
          name: 'operation',
          type: 'options',
          required: true,
          displayOptions: {
            show: {
              resource: ['message']
            }
          },
          options: [
            { value: 'send', name: 'Send' },
            { value: 'update', name: 'Update' },
            { value: 'delete', name: 'Delete' }
          ]
        }
      ],
      operations: [],
      credentials: []
    };

    repository.saveNode(slackNode);
  });

  afterEach(async () => {
    // Clean up database
    if (testDb) {
      await testDb.cleanup();
    }
  });

  describe('Invalid Operations', () => {
    it('should detect invalid operation "listFiles" for Google Drive', () => {
      const config = {
        resource: 'fileFolder',
        operation: 'listFiles'
      };

      const node = repository.getNode('nodes-base.googleDrive');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.googleDrive',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);

      // Should have an error for invalid operation
      const operationError = result.errors.find(e => e.property === 'operation');
      expect(operationError).toBeDefined();
      expect(operationError!.message).toContain('Invalid operation "listFiles"');
      expect(operationError!.message).toContain('Did you mean');
      expect(operationError!.fix).toContain('search'); // Should suggest 'search' for fileFolder resource
    });

    it('should provide suggestions for typos in operations', () => {
      const config = {
        resource: 'file',
        operation: 'downlod' // Typo: missing 'a'
      };

      const node = repository.getNode('nodes-base.googleDrive');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.googleDrive',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);

      const operationError = result.errors.find(e => e.property === 'operation');
      expect(operationError).toBeDefined();
      expect(operationError!.message).toContain('Did you mean "download"');
    });

    it('should list valid operations for the resource', () => {
      const config = {
        resource: 'folder',
        operation: 'upload' // Invalid for folder resource
      };

      const node = repository.getNode('nodes-base.googleDrive');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.googleDrive',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);

      const operationError = result.errors.find(e => e.property === 'operation');
      expect(operationError).toBeDefined();
      expect(operationError!.fix).toContain('Valid operations for resource "folder"');
      expect(operationError!.fix).toContain('create');
      expect(operationError!.fix).toContain('delete');
      expect(operationError!.fix).toContain('share');
    });
  });

  describe('Invalid Resources', () => {
    it('should detect plural resource "files" and suggest singular', () => {
      const config = {
        resource: 'files', // Should be 'file'
        operation: 'list'
      };

      const node = repository.getNode('nodes-base.googleDrive');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.googleDrive',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);

      const resourceError = result.errors.find(e => e.property === 'resource');
      expect(resourceError).toBeDefined();
      expect(resourceError!.message).toContain('Invalid resource "files"');
      expect(resourceError!.message).toContain('Did you mean "file"');
      expect(resourceError!.fix).toContain('Use singular');
    });

    it('should suggest similar resources for typos', () => {
      const config = {
        resource: 'flie', // Typo
        operation: 'download'
      };

      const node = repository.getNode('nodes-base.googleDrive');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.googleDrive',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);

      const resourceError = result.errors.find(e => e.property === 'resource');
      expect(resourceError).toBeDefined();
      expect(resourceError!.message).toContain('Did you mean "file"');
    });

    it('should list valid resources when no match found', () => {
      const config = {
        resource: 'document', // Not a valid resource
        operation: 'create'
      };

      const node = repository.getNode('nodes-base.googleDrive');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.googleDrive',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);

      const resourceError = result.errors.find(e => e.property === 'resource');
      expect(resourceError).toBeDefined();
      expect(resourceError!.fix).toContain('Valid resources:');
      expect(resourceError!.fix).toContain('file');
      expect(resourceError!.fix).toContain('folder');
    });
  });

  describe('Combined Resource and Operation Validation', () => {
    it('should validate both resource and operation together', () => {
      const config = {
        resource: 'files', // Invalid: should be singular
        operation: 'listFiles' // Invalid: should be 'list' or 'search'
      };

      const node = repository.getNode('nodes-base.googleDrive');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.googleDrive',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);

      // Should have error for resource
      const resourceError = result.errors.find(e => e.property === 'resource');
      expect(resourceError).toBeDefined();
      expect(resourceError!.message).toContain('files');

      // Should have error for operation
      const operationError = result.errors.find(e => e.property === 'operation');
      expect(operationError).toBeDefined();
      expect(operationError!.message).toContain('listFiles');
    });
  });

  describe('Slack Node Validation', () => {
    it('should suggest "send" instead of "sendMessage"', () => {
      const config = {
        resource: 'message',
        operation: 'sendMessage' // Common mistake
      };

      const node = repository.getNode('nodes-base.slack');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);

      const operationError = result.errors.find(e => e.property === 'operation');
      expect(operationError).toBeDefined();
      expect(operationError!.message).toContain('Did you mean "send"');
    });

    it('should suggest singular "channel" instead of "channels"', () => {
      const config = {
        resource: 'channels', // Should be singular
        operation: 'create'
      };

      const node = repository.getNode('nodes-base.slack');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      expect(result.valid).toBe(false);

      const resourceError = result.errors.find(e => e.property === 'resource');
      expect(resourceError).toBeDefined();
      expect(resourceError!.message).toContain('Did you mean "channel"');
    });
  });

  describe('Valid Configurations', () => {
    it('should accept valid Google Drive configuration', () => {
      const config = {
        resource: 'file',
        operation: 'download'
      };

      const node = repository.getNode('nodes-base.googleDrive');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.googleDrive',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      // Should not have errors for resource or operation
      const resourceError = result.errors.find(e => e.property === 'resource');
      const operationError = result.errors.find(e => e.property === 'operation');
      expect(resourceError).toBeUndefined();
      expect(operationError).toBeUndefined();
    });

    it('should accept valid Slack configuration', () => {
      const config = {
        resource: 'message',
        operation: 'send'
      };

      const node = repository.getNode('nodes-base.slack');
      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        node.properties,
        'operation',
        'ai-friendly'
      );

      // Should not have errors for resource or operation
      const resourceError = result.errors.find(e => e.property === 'resource');
      const operationError = result.errors.find(e => e.property === 'operation');
      expect(resourceError).toBeUndefined();
      expect(operationError).toBeUndefined();
    });
  });
});