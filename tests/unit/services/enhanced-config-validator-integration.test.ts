import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EnhancedConfigValidator } from '@/services/enhanced-config-validator';
import { ResourceSimilarityService } from '@/services/resource-similarity-service';
import { OperationSimilarityService } from '@/services/operation-similarity-service';
import { NodeRepository } from '@/database/node-repository';

// Mock similarity services
vi.mock('@/services/resource-similarity-service');
vi.mock('@/services/operation-similarity-service');

describe('EnhancedConfigValidator - Integration Tests', () => {
  let mockResourceService: any;
  let mockOperationService: any;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      getNode: vi.fn(),
      getNodeOperations: vi.fn().mockReturnValue([]),
      getNodeResources: vi.fn().mockReturnValue([]),
      getOperationsForResource: vi.fn().mockReturnValue([]),
      getDefaultOperationForResource: vi.fn().mockReturnValue(undefined),
      getNodePropertyDefaults: vi.fn().mockReturnValue({})
    };

    mockResourceService = {
      findSimilarResources: vi.fn().mockReturnValue([])
    };

    mockOperationService = {
      findSimilarOperations: vi.fn().mockReturnValue([])
    };

    // Mock the constructors to return our mock services
    vi.mocked(ResourceSimilarityService).mockImplementation(() => mockResourceService);
    vi.mocked(OperationSimilarityService).mockImplementation(() => mockOperationService);

    // Initialize the similarity services (this will create the service instances)
    EnhancedConfigValidator.initializeSimilarityServices(mockRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('similarity service integration', () => {
    it('should initialize similarity services when initializeSimilarityServices is called', () => {
      // Services should be created when initializeSimilarityServices was called in beforeEach
      expect(ResourceSimilarityService).toHaveBeenCalled();
      expect(OperationSimilarityService).toHaveBeenCalled();
    });

    it('should use resource similarity service for invalid resource errors', () => {
      const config = {
        resource: 'invalidResource',
        operation: 'send'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' },
            { value: 'channel', name: 'Channel' }
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
            { value: 'send', name: 'Send Message' }
          ]
        }
      ];

      // Mock resource similarity suggestions
      mockResourceService.findSimilarResources.mockReturnValue([
        {
          value: 'message',
          confidence: 0.8,
          reason: 'Similar resource name',
          availableOperations: ['send', 'update']
        }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      expect(mockResourceService.findSimilarResources).toHaveBeenCalledWith(
        'nodes-base.slack',
        'invalidResource',
        expect.any(Number)
      );

      // Should have suggestions in the result
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should use operation similarity service for invalid operation errors', () => {
      const config = {
        resource: 'message',
        operation: 'invalidOperation'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
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
            { value: 'send', name: 'Send Message' },
            { value: 'update', name: 'Update Message' }
          ]
        }
      ];

      // Mock operation similarity suggestions
      mockOperationService.findSimilarOperations.mockReturnValue([
        {
          value: 'send',
          confidence: 0.9,
          reason: 'Very similar - likely a typo',
          resource: 'message'
        }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      expect(mockOperationService.findSimilarOperations).toHaveBeenCalledWith(
        'nodes-base.slack',
        'invalidOperation',
        'message',
        expect.any(Number)
      );

      // Should have suggestions in the result
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle similarity service errors gracefully', () => {
      const config = {
        resource: 'invalidResource',
        operation: 'send'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
          ]
        }
      ];

      // Mock service to throw error
      mockResourceService.findSimilarResources.mockImplementation(() => {
        throw new Error('Service error');
      });

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should not crash and still provide basic validation
      expect(result).toBeDefined();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not call similarity services for valid configurations', () => {
      // Mock repository to return valid resources for this test
      mockRepository.getNodeResources.mockReturnValue([
        { value: 'message', name: 'Message' },
        { value: 'channel', name: 'Channel' }
      ]);
      // Mock getNodeOperations to return valid operations
      mockRepository.getNodeOperations.mockReturnValue([
        { value: 'send', name: 'Send Message' }
      ]);

      const config = {
        resource: 'message',
        operation: 'send',
        channel: '#general',  // Add required field for Slack send
        text: 'Test message'  // Add required field for Slack send
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
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
            { value: 'send', name: 'Send Message' }
          ]
        }
      ];

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should not call similarity services for valid config
      expect(mockResourceService.findSimilarResources).not.toHaveBeenCalled();
      expect(mockOperationService.findSimilarOperations).not.toHaveBeenCalled();
      expect(result.valid).toBe(true);
    });

    it('should limit suggestion count when calling similarity services', () => {
      const config = {
        resource: 'invalidResource'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
          ]
        }
      ];

      EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      expect(mockResourceService.findSimilarResources).toHaveBeenCalledWith(
        'nodes-base.slack',
        'invalidResource',
        3 // Should limit to 3 suggestions
      );
    });
  });

  describe('error enhancement with suggestions', () => {
    it('should enhance resource validation errors with suggestions', () => {
      const config = {
        resource: 'msgs' // Typo for 'message'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' },
            { value: 'channel', name: 'Channel' }
          ]
        }
      ];

      // Mock high-confidence suggestion
      mockResourceService.findSimilarResources.mockReturnValue([
        {
          value: 'message',
          confidence: 0.85,
          reason: 'Very similar - likely a typo',
          availableOperations: ['send', 'update', 'delete']
        }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should have enhanced error with suggestion
      const resourceError = result.errors.find(e => e.property === 'resource');
      expect(resourceError).toBeDefined();
      expect(resourceError!.suggestion).toBeDefined();
      expect(resourceError!.suggestion).toContain('message');
    });

    it('should enhance operation validation errors with suggestions', () => {
      const config = {
        resource: 'message',
        operation: 'sned' // Typo for 'send'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
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
            { value: 'send', name: 'Send Message' },
            { value: 'update', name: 'Update Message' }
          ]
        }
      ];

      // Mock high-confidence suggestion
      mockOperationService.findSimilarOperations.mockReturnValue([
        {
          value: 'send',
          confidence: 0.9,
          reason: 'Almost exact match - likely a typo',
          resource: 'message',
          description: 'Send Message'
        }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should have enhanced error with suggestion
      const operationError = result.errors.find(e => e.property === 'operation');
      expect(operationError).toBeDefined();
      expect(operationError!.suggestion).toBeDefined();
      expect(operationError!.suggestion).toContain('send');
    });

    it('should not enhance errors when no good suggestions are available', () => {
      const config = {
        resource: 'completelyWrongValue'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
          ]
        }
      ];

      // Mock low-confidence suggestions
      mockResourceService.findSimilarResources.mockReturnValue([
        {
          value: 'message',
          confidence: 0.2, // Too low confidence
          reason: 'Possibly related resource'
        }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should not enhance error due to low confidence
      const resourceError = result.errors.find(e => e.property === 'resource');
      expect(resourceError).toBeDefined();
      expect(resourceError!.suggestion).toBeUndefined();
    });

    it('should provide multiple operation suggestions when resource is known', () => {
      const config = {
        resource: 'message',
        operation: 'invalidOp'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
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
            { value: 'send', name: 'Send Message' },
            { value: 'update', name: 'Update Message' },
            { value: 'delete', name: 'Delete Message' }
          ]
        }
      ];

      // Mock multiple suggestions
      mockOperationService.findSimilarOperations.mockReturnValue([
        { value: 'send', confidence: 0.7, reason: 'Similar operation' },
        { value: 'update', confidence: 0.6, reason: 'Similar operation' },
        { value: 'delete', confidence: 0.5, reason: 'Similar operation' }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should include multiple suggestions in the result
      expect(result.suggestions.length).toBeGreaterThan(2);
      const operationSuggestions = result.suggestions.filter(s =>
        s.includes('send') || s.includes('update') || s.includes('delete')
      );
      expect(operationSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('confidence thresholds and filtering', () => {
    it('should only use high confidence resource suggestions', () => {
      const config = {
        resource: 'invalidResource'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
          ]
        }
      ];

      // Mock mixed confidence suggestions
      mockResourceService.findSimilarResources.mockReturnValue([
        { value: 'message1', confidence: 0.9, reason: 'High confidence' },
        { value: 'message2', confidence: 0.4, reason: 'Low confidence' },
        { value: 'message3', confidence: 0.7, reason: 'Medium confidence' }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should only use suggestions above threshold
      const resourceError = result.errors.find(e => e.property === 'resource');
      expect(resourceError?.suggestion).toBeDefined();
      // Should prefer high confidence suggestion
      expect(resourceError!.suggestion).toContain('message1');
    });

    it('should only use high confidence operation suggestions', () => {
      const config = {
        resource: 'message',
        operation: 'invalidOperation'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
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
            { value: 'send', name: 'Send Message' }
          ]
        }
      ];

      // Mock mixed confidence suggestions
      mockOperationService.findSimilarOperations.mockReturnValue([
        { value: 'send', confidence: 0.95, reason: 'Very high confidence' },
        { value: 'post', confidence: 0.3, reason: 'Low confidence' }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      // Should only use high confidence suggestion
      const operationError = result.errors.find(e => e.property === 'operation');
      expect(operationError?.suggestion).toBeDefined();
      expect(operationError!.suggestion).toContain('send');
      expect(operationError!.suggestion).not.toContain('post');
    });
  });

  describe('integration with existing validation logic', () => {
    it('should work with minimal validation mode', () => {
      // Mock repository to return empty resources
      mockRepository.getNodeResources.mockReturnValue([]);

      const config = {
        resource: 'invalidResource'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
          ]
        }
      ];

      mockResourceService.findSimilarResources.mockReturnValue([
        { value: 'message', confidence: 0.8, reason: 'Similar' }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'minimal',
        'ai-friendly'
      );

      // Should still enhance errors in minimal mode
      expect(mockResourceService.findSimilarResources).toHaveBeenCalled();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should work with strict validation profile', () => {
      // Mock repository to return valid resource but no operations
      mockRepository.getNodeResources.mockReturnValue([
        { value: 'message', name: 'Message' }
      ]);
      mockRepository.getOperationsForResource.mockReturnValue([]);

      const config = {
        resource: 'message',
        operation: 'invalidOp'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
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
            { value: 'send', name: 'Send Message' }
          ]
        }
      ];

      mockOperationService.findSimilarOperations.mockReturnValue([
        { value: 'send', confidence: 0.8, reason: 'Similar' }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'strict'
      );

      // Should enhance errors regardless of profile
      expect(mockOperationService.findSimilarOperations).toHaveBeenCalled();
      const operationError = result.errors.find(e => e.property === 'operation');
      expect(operationError?.suggestion).toBeDefined();
    });

    it('should preserve original error properties when enhancing', () => {
      const config = {
        resource: 'invalidResource'
      };

      const properties = [
        {
          name: 'resource',
          type: 'options',
          required: true,
          options: [
            { value: 'message', name: 'Message' }
          ]
        }
      ];

      mockResourceService.findSimilarResources.mockReturnValue([
        { value: 'message', confidence: 0.8, reason: 'Similar' }
      ]);

      const result = EnhancedConfigValidator.validateWithMode(
        'nodes-base.slack',
        config,
        properties,
        'operation',
        'ai-friendly'
      );

      const resourceError = result.errors.find(e => e.property === 'resource');

      // Should preserve original error properties
      expect(resourceError?.type).toBeDefined();
      expect(resourceError?.property).toBe('resource');
      expect(resourceError?.message).toBeDefined();

      // Should add suggestion without overriding other properties
      expect(resourceError?.suggestion).toBeDefined();
    });
  });
});