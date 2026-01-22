/**
 * Tests for OperationSimilarityService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OperationSimilarityService } from '../../../src/services/operation-similarity-service';
import { NodeRepository } from '../../../src/database/node-repository';
import { createTestDatabase } from '../../utils/database-utils';

describe('OperationSimilarityService', () => {
  let service: OperationSimilarityService;
  let repository: NodeRepository;
  let testDb: any;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repository = testDb.nodeRepository;
    service = new OperationSimilarityService(repository);

    // Add test node with operations
    const testNode = {
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
          options: [
            { value: 'file', name: 'File' },
            { value: 'folder', name: 'Folder' },
            { value: 'drive', name: 'Shared Drive' },
          ]
        },
        {
          name: 'operation',
          type: 'options',
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
        }
      ],
      operations: [],
      credentials: []
    };

    repository.saveNode(testNode);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.cleanup();
    }
  });

  describe('findSimilarOperations', () => {
    it('should find exact match', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'download',
        'file'
      );

      expect(suggestions).toHaveLength(0); // No suggestions for valid operation
    });

    it('should suggest similar operations for typos', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'downlod',
        'file'
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].value).toBe('download');
      expect(suggestions[0].confidence).toBeGreaterThan(0.8);
    });

    it('should handle common mistakes with patterns', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'uploadFile',
        'file'
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].value).toBe('upload');
      expect(suggestions[0].reason).toContain('instead of');
    });

    it('should filter operations by resource', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'upload',
        'folder'
      );

      // Upload is not valid for folder resource
      expect(suggestions).toBeDefined();
      expect(suggestions.find(s => s.value === 'upload')).toBeUndefined();
    });

    it('should return empty array for node not found', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.nonexistent',
        'operation',
        undefined
      );

      expect(suggestions).toEqual([]);
    });

    it('should handle operations without resource filtering', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'updat',  // Missing 'e' at the end
        undefined
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].value).toBe('update');
    });
  });

  describe('similarity calculation', () => {
    it('should rank exact matches highest', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'delete',
        'file'
      );

      expect(suggestions).toHaveLength(0); // Exact match, no suggestions needed
    });

    it('should rank substring matches high', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'del',
        'file'
      );

      expect(suggestions.length).toBeGreaterThan(0);
      const deleteSuggestion = suggestions.find(s => s.value === 'delete');
      expect(deleteSuggestion).toBeDefined();
      expect(deleteSuggestion!.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect common variations', () => {
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'getData',
        'file'
      );

      expect(suggestions.length).toBeGreaterThan(0);
      // Should suggest 'download' or similar
    });
  });

  describe('caching', () => {
    it('should cache results for repeated queries', () => {
      // First call
      const suggestions1 = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'downlod',
        'file'
      );

      // Second call with same params
      const suggestions2 = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'downlod',
        'file'
      );

      expect(suggestions1).toEqual(suggestions2);
    });

    it('should clear cache when requested', () => {
      // Add to cache
      service.findSimilarOperations(
        'nodes-base.googleDrive',
        'test',
        'file'
      );

      // Clear cache
      service.clearCache();

      // This would fetch fresh data (behavior is the same, just uncached)
      const suggestions = service.findSimilarOperations(
        'nodes-base.googleDrive',
        'test',
        'file'
      );

      expect(suggestions).toBeDefined();
    });
  });
});