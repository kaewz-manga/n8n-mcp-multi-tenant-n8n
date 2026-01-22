import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowValidator } from '@/services/workflow-validator';
import { NodeRepository } from '@/database/node-repository';
import { EnhancedConfigValidator } from '@/services/enhanced-config-validator';

vi.mock('@/utils/logger');

describe('WorkflowValidator - Error Output Validation', () => {
  let validator: WorkflowValidator;
  let mockNodeRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock repository
    mockNodeRepository = {
      getNode: vi.fn((type: string) => {
        // Return mock node info for common node types
        if (type.includes('httpRequest') || type.includes('webhook') || type.includes('set')) {
          return {
            node_type: type,
            display_name: 'Mock Node',
            isVersioned: true,
            version: 1
          };
        }
        return null;
      })
    };

    validator = new WorkflowValidator(mockNodeRepository, EnhancedConfigValidator);
  });

  describe('Error Output Configuration', () => {
    it('should detect incorrect configuration - multiple nodes in same array', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Validate Input',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [-400, 64],
            parameters: {}
          },
          {
            id: '2',
            name: 'Filter URLs',
            type: 'n8n-nodes-base.filter',
            typeVersion: 2.2,
            position: [-176, 64],
            parameters: {}
          },
          {
            id: '3',
            name: 'Error Response1',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1.5,
            position: [-160, 240],
            parameters: {}
          }
        ],
        connections: {
          'Validate Input': {
            main: [
              [
                { node: 'Filter URLs', type: 'main', index: 0 },
                { node: 'Error Response1', type: 'main', index: 0 }  // WRONG! Both in main[0]
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration') &&
        e.message.includes('Error Response1') &&
        e.message.includes('appear to be error handlers but are in main[0]')
      )).toBe(true);

      // Check that the error message includes the fix
      const errorMsg = result.errors.find(e => e.message.includes('Incorrect error output configuration'));
      expect(errorMsg?.message).toContain('INCORRECT (current)');
      expect(errorMsg?.message).toContain('CORRECT (should be)');
      expect(errorMsg?.message).toContain('main[1] = error output');
    });

    it('should validate correct configuration - separate arrays', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Validate Input',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [-400, 64],
            parameters: {},
            onError: 'continueErrorOutput'
          },
          {
            id: '2',
            name: 'Filter URLs',
            type: 'n8n-nodes-base.filter',
            typeVersion: 2.2,
            position: [-176, 64],
            parameters: {}
          },
          {
            id: '3',
            name: 'Error Response1',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1.5,
            position: [-160, 240],
            parameters: {}
          }
        ],
        connections: {
          'Validate Input': {
            main: [
              [
                { node: 'Filter URLs', type: 'main', index: 0 }
              ],
              [
                { node: 'Error Response1', type: 'main', index: 0 }  // Correctly in main[1]
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should not have the specific error about incorrect configuration
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration')
      )).toBe(false);
    });

    it('should detect onError without error connections', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4,
            position: [100, 100],
            parameters: {},
            onError: 'continueErrorOutput'  // Has onError
          },
          {
            id: '2',
            name: 'Process Data',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          }
        ],
        connections: {
          'HTTP Request': {
            main: [
              [
                { node: 'Process Data', type: 'main', index: 0 }
              ]
              // No main[1] for error output
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      expect(result.errors.some(e =>
        e.nodeName === 'HTTP Request' &&
        e.message.includes("has onError: 'continueErrorOutput' but no error output connections")
      )).toBe(true);
    });

    it('should warn about error connections without onError', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4,
            position: [100, 100],
            parameters: {}
            // Missing onError property
          },
          {
            id: '2',
            name: 'Process Data',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Error Handler',
            type: 'n8n-nodes-base.set',
            position: [300, 300],
            parameters: {}
          }
        ],
        connections: {
          'HTTP Request': {
            main: [
              [
                { node: 'Process Data', type: 'main', index: 0 }
              ],
              [
                { node: 'Error Handler', type: 'main', index: 0 }  // Has error connection
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      expect(result.warnings.some(w =>
        w.nodeName === 'HTTP Request' &&
        w.message.includes('error output connections in main[1] but missing onError')
      )).toBe(true);
    });
  });

  describe('Error Handler Detection', () => {
    it('should detect error handler nodes by name', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'API Call',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'Process Success',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Handle Error',  // Contains 'error'
            type: 'n8n-nodes-base.set',
            position: [300, 300],
            parameters: {}
          }
        ],
        connections: {
          'API Call': {
            main: [
              [
                { node: 'Process Success', type: 'main', index: 0 },
                { node: 'Handle Error', type: 'main', index: 0 }  // Wrong placement
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      expect(result.errors.some(e =>
        e.message.includes('Handle Error') &&
        e.message.includes('appear to be error handlers')
      )).toBe(true);
    });

    it('should detect error handler nodes by type', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'Process',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Respond',
            type: 'n8n-nodes-base.respondToWebhook',  // Common error handler type
            position: [300, 300],
            parameters: {}
          }
        ],
        connections: {
          'Webhook': {
            main: [
              [
                { node: 'Process', type: 'main', index: 0 },
                { node: 'Respond', type: 'main', index: 0 }  // Wrong placement
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      expect(result.errors.some(e =>
        e.message.includes('Respond') &&
        e.message.includes('appear to be error handlers')
      )).toBe(true);
    });

    it('should not flag non-error nodes in main[0]', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Start',
            type: 'n8n-nodes-base.manualTrigger',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'First Process',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Second Process',
            type: 'n8n-nodes-base.set',
            position: [300, 200],
            parameters: {}
          }
        ],
        connections: {
          'Start': {
            main: [
              [
                { node: 'First Process', type: 'main', index: 0 },
                { node: 'Second Process', type: 'main', index: 0 }  // Both are valid success paths
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should not have error about incorrect error configuration
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration')
      )).toBe(false);
    });
  });

  describe('Complex Error Patterns', () => {
    it('should handle multiple error handlers correctly', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'HTTP Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {},
            onError: 'continueErrorOutput'
          },
          {
            id: '2',
            name: 'Process',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Log Error',
            type: 'n8n-nodes-base.set',
            position: [300, 200],
            parameters: {}
          },
          {
            id: '4',
            name: 'Send Error Email',
            type: 'n8n-nodes-base.emailSend',
            position: [300, 300],
            parameters: {}
          }
        ],
        connections: {
          'HTTP Request': {
            main: [
              [
                { node: 'Process', type: 'main', index: 0 }
              ],
              [
                { node: 'Log Error', type: 'main', index: 0 },
                { node: 'Send Error Email', type: 'main', index: 0 }  // Multiple error handlers OK in main[1]
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should not have errors about the configuration
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration')
      )).toBe(false);
    });

    it('should detect mixed success and error handlers in main[0]', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'API Request',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'Transform Data',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Store Data',
            type: 'n8n-nodes-base.set',
            position: [500, 100],
            parameters: {}
          },
          {
            id: '4',
            name: 'Error Notification',
            type: 'n8n-nodes-base.emailSend',
            position: [300, 300],
            parameters: {}
          }
        ],
        connections: {
          'API Request': {
            main: [
              [
                { node: 'Transform Data', type: 'main', index: 0 },
                { node: 'Store Data', type: 'main', index: 0 },
                { node: 'Error Notification', type: 'main', index: 0 }  // Error handler mixed with success nodes
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      expect(result.errors.some(e =>
        e.message.includes('Error Notification') &&
        e.message.includes('appear to be error handlers but are in main[0]')
      )).toBe(true);
    });

    it('should handle nested error handling (error handlers with their own errors)', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Primary API',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {},
            onError: 'continueErrorOutput'
          },
          {
            id: '2',
            name: 'Success Handler',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Error Logger',
            type: 'n8n-nodes-base.httpRequest',
            position: [300, 200],
            parameters: {},
            onError: 'continueErrorOutput'
          },
          {
            id: '4',
            name: 'Fallback Error',
            type: 'n8n-nodes-base.set',
            position: [500, 250],
            parameters: {}
          }
        ],
        connections: {
          'Primary API': {
            main: [
              [
                { node: 'Success Handler', type: 'main', index: 0 }
              ],
              [
                { node: 'Error Logger', type: 'main', index: 0 }
              ]
            ]
          },
          'Error Logger': {
            main: [
              [],
              [
                { node: 'Fallback Error', type: 'main', index: 0 }
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should not have errors about incorrect configuration
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration')
      )).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle workflows with no connections at all', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Isolated Node',
            type: 'n8n-nodes-base.set',
            position: [100, 100],
            parameters: {},
            onError: 'continueErrorOutput'
          }
        ],
        connections: {}
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should have warning about orphaned node but not error about connections
      expect(result.warnings.some(w =>
        w.nodeName === 'Isolated Node' &&
        w.message.includes('not connected to any other nodes')
      )).toBe(true);

      // Should not have error about error output configuration
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration')
      )).toBe(false);
    });

    it('should handle nodes with empty main arrays', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Source Node',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {},
            onError: 'continueErrorOutput'
          },
          {
            id: '2',
            name: 'Target Node',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          }
        ],
        connections: {
          'Source Node': {
            main: [
              [],  // Empty success array
              []   // Empty error array
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should detect that onError is set but no error connections exist
      expect(result.errors.some(e =>
        e.nodeName === 'Source Node' &&
        e.message.includes("has onError: 'continueErrorOutput' but no error output connections")
      )).toBe(true);
    });

    it('should handle workflows with only error outputs (no success path)', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Risky Operation',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {},
            onError: 'continueErrorOutput'
          },
          {
            id: '2',
            name: 'Error Handler Only',
            type: 'n8n-nodes-base.set',
            position: [300, 200],
            parameters: {}
          }
        ],
        connections: {
          'Risky Operation': {
            main: [
              [],  // No success connections
              [
                { node: 'Error Handler Only', type: 'main', index: 0 }
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should not have errors about incorrect configuration - this is valid
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration')
      )).toBe(false);

      // Should not have errors about missing error connections
      expect(result.errors.some(e =>
        e.message.includes("has onError: 'continueErrorOutput' but no error output connections")
      )).toBe(false);
    });

    it('should handle undefined or null connection arrays gracefully', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Source Node',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {}
          }
        ],
        connections: {
          'Source Node': {
            main: [
              null,      // Null array
              undefined  // Undefined array
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should not crash and should not have configuration errors
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration')
      )).toBe(false);
    });

    it('should detect all variations of error-related node names', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Source',
            type: 'n8n-nodes-base.httpRequest',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'Handle Failure',
            type: 'n8n-nodes-base.set',
            position: [300, 100],
            parameters: {}
          },
          {
            id: '3',
            name: 'Catch Exception',
            type: 'n8n-nodes-base.set',
            position: [300, 200],
            parameters: {}
          },
          {
            id: '4',
            name: 'Success Path',
            type: 'n8n-nodes-base.set',
            position: [500, 100],
            parameters: {}
          }
        ],
        connections: {
          'Source': {
            main: [
              [
                { node: 'Handle Failure', type: 'main', index: 0 },
                { node: 'Catch Exception', type: 'main', index: 0 },
                { node: 'Success Path', type: 'main', index: 0 }
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should detect both 'Handle Failure' and 'Catch Exception' as error handlers
      expect(result.errors.some(e =>
        e.message.includes('Handle Failure') &&
        e.message.includes('Catch Exception') &&
        e.message.includes('appear to be error handlers but are in main[0]')
      )).toBe(true);
    });

    it('should not flag legitimate parallel processing nodes', async () => {
      const workflow = {
        nodes: [
          {
            id: '1',
            name: 'Data Source',
            type: 'n8n-nodes-base.webhook',
            position: [100, 100],
            parameters: {}
          },
          {
            id: '2',
            name: 'Process A',
            type: 'n8n-nodes-base.set',
            position: [300, 50],
            parameters: {}
          },
          {
            id: '3',
            name: 'Process B',
            type: 'n8n-nodes-base.set',
            position: [300, 150],
            parameters: {}
          },
          {
            id: '4',
            name: 'Transform Data',
            type: 'n8n-nodes-base.set',
            position: [300, 250],
            parameters: {}
          }
        ],
        connections: {
          'Data Source': {
            main: [
              [
                { node: 'Process A', type: 'main', index: 0 },
                { node: 'Process B', type: 'main', index: 0 },
                { node: 'Transform Data', type: 'main', index: 0 }
              ]
            ]
          }
        }
      };

      const result = await validator.validateWorkflow(workflow as any);

      // Should not flag these as error configuration issues
      expect(result.errors.some(e =>
        e.message.includes('Incorrect error output configuration')
      )).toBe(false);
    });
  });
});